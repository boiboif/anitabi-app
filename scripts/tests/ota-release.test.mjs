import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { readConfig, preflight, capture, verify, promote, main } = require('../ota-release.cjs');
const id = (number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const config = readConfig({
  EXPO_TOKEN: 'private-expo-token',
  OTA_UPDATE_URL: `https://u.expo.dev/${id(1)}`,
  OTA_RUNTIME_VERSION: '0.9.0-sdk58',
  OTA_CHANNEL: 'production',
  OTA_SOURCE_SHA: 'a'.repeat(40),
  OTA_PUBLICATION_MODE: 'coordinated',
  GITHUB_RUN_ID: '123456789',
  GITHUB_RUN_ATTEMPT: '1',
});
const response = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fixture(mode = 'coordinated') {
  const settings = { ...config, mode };
  const branch = { id: id(2), name: 'actual-release-branch' };
  const channel = {
    id: id(3),
    name: config.channel,
    isPaused: false,
    branchMapping: JSON.stringify({ version: 0, data: [{ branchId: branch.id, branchMappingLogic: 'true' }] }),
    updateBranches: [branch],
  };
  const updates = ['android', 'ios'].map((platform, index) => ({
    id: id(index + 10),
    group: id(4),
    platform,
    branch,
    createdAt: '2026-11-03T01:00:00.000Z',
    runtimeVersion: config.runtimeVersion,
    manifestPermalink: `https://u.expo.dev/${config.projectId}/${id(index + 10)}`,
    gitCommitHash: config.sourceSha,
    isRollBackToEmbedded: false,
    message: `Camera reference image fix\n\n<!-- anitabi-ota-run: ${config.runId}; mode: ${mode} -->`,
    rolloutPercentage: mode === 'coordinated' ? 0 : null,
  }));
  const state = {
    channel,
    updates,
    latest: [...updates],
    publicIds: { android: id(20), ios: id(21) },
    mutations: [],
    requests: [],
    failMutationId: null,
    completedRolloutIsNull: false,
    tamperManifest: null,
  };
  if (mode === 'ota-first') for (const update of updates) state.publicIds[update.platform] = update.id;
  const published = updates.map((update) => ({ ...update, branch: branch.name }));
  const dependencies = {
    sleep: async () => {},
    fetchImpl: async (url, request) => {
      state.requests.push({ url, request });
      if (url === 'https://api.expo.dev/graphql') {
        assert.equal(request.headers.authorization, `Bearer ${config.token}`);
        assert.equal(request.redirect, 'error');
        assert.ok(request.signal instanceof AbortSignal);
        const { query, variables } = JSON.parse(request.body);
        if (query.includes('query ViewUpdateChannelOnApp')) {
          return response({ data: { app: { byId: { id: config.projectId, updateChannelByName: state.channel } } } });
        }
        if (query.includes('query ViewLatestUpdateOnBranch')) {
          assert.equal(variables.branchName, branch.name);
          assert.equal(variables.runtimeVersion, config.runtimeVersion);
          const latest = state.latest
            .filter(
              (update) =>
                update.platform.toUpperCase() === variables.platform &&
                update.runtimeVersion === variables.runtimeVersion,
            )
            .slice(0, 1);
          return response({
            data: {
              app: {
                byId: {
                  id: config.projectId,
                  updateBranchByName: { id: branch.id, updates: latest },
                },
              },
            },
          });
        }
        if (query.includes('query ViewUpdatesByGroup')) {
          assert.equal(variables.groupId, id(4));
          return response({ data: { updatesByGroup: state.updates } });
        }
        if (query.includes('mutation SetRolloutPercentageMutation')) {
          state.mutations.push(variables);
          if (variables.updateId === state.failMutationId) {
            return response({ errors: [{ message: 'private-expo-token: permission rejected' }] });
          }
          const update = state.updates.find((item) => item.id === variables.updateId);
          update.rolloutPercentage = state.completedRolloutIsNull ? null : variables.rolloutPercentage;
          state.publicIds[update.platform] = update.id;
          return response({ data: { update: { setRolloutPercentage: update } } });
        }
        throw new Error('Unexpected GraphQL operation');
      }
      assert.equal(request.headers.authorization, undefined, 'Expo token must not reach manifest servers');
      const publicRequest = url === config.url;
      const update = publicRequest
        ? state.updates.find((item) => item.platform === request.headers['expo-platform'])
        : state.updates.find((item) => item.manifestPermalink === url);
      assert.ok(update, 'Unexpected manifest URL');
      const manifest = {
        id: publicRequest ? state.publicIds[update.platform] : update.id,
        createdAt: update.createdAt,
        runtimeVersion: update.runtimeVersion,
        extra: { expoClient: { extra: { contentRevision: config.sourceSha } } },
      };
      if (state.tamperManifest) state.tamperManifest(manifest, publicRequest);
      return response(manifest);
    },
  };
  return { config: settings, state, published, dependencies };
}

test('capture verifies an unpublished zero-percent candidate without demanding a public OTA', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  assert.equal(release.group, id(4));
  assert.equal(release.branchId, id(2));
  assert.deepEqual(
    release.updates.map((update) => update.platform),
    ['android', 'ios'],
  );
  assert.equal(JSON.stringify(release).includes(config.token), false);
  assert.equal(
    f.state.requests.some((request) => request.url === config.url),
    false,
  );
  assert.equal(f.state.mutations.length, 0);
  await verify(f.config, release, f.dependencies);
});

test('preflight permits a first channel but never treats failed auth or malformed data as an absent channel', async () => {
  const f = fixture();
  f.state.channel = null;
  assert.deepEqual(await preflight(f.config, f.dependencies), { channelExists: false, resume: false });
  for (const failure of [
    response({}, 403),
    response({ errors: [{ message: config.token }] }),
    response({ data: {} }),
  ]) {
    await assert.rejects(preflight(f.config, { fetchImpl: async () => failure }), (error) => {
      assert.equal(error.message.includes(config.token), false);
      return true;
    });
  }
});

test('preflight resolves the real branch and refuses an unfinished candidate without any mutation', async () => {
  const f = fixture();
  f.state.updates.forEach((update) => {
    update.message = 'An earlier workflow run';
  });
  await assert.rejects(preflight(f.config, f.dependencies), /unfinished rollout/);
  assert.deepEqual(f.state.mutations, []);
  f.state.updates.forEach((update) => {
    update.rolloutPercentage = 100;
  });
  assert.equal((await preflight(f.config, f.dependencies)).branchName, 'actual-release-branch');
});

test('a failed capture can recover its own run from EAS without a local artifact or new upload', async () => {
  const f = fixture();
  const retry = { ...f.config, runAttempt: 2 };
  const recovered = await preflight(retry, f.dependencies);
  assert.equal(recovered.resume, true);
  assert.equal(recovered.published[0].branch, 'actual-release-branch');
  assert.equal(Object.hasOwn(recovered.published[0], 'rolloutPercentage'), false);
  const release = await capture({ ...retry, resume: true }, recovered.published, f.dependencies);
  assert.equal(release.runId, config.runId);
  assert.deepEqual(
    release.updates.map((update) => update.id),
    [id(10), id(11)],
  );
  assert.deepEqual(f.state.mutations, []);
});

test('same-run recovery permits partial and completed promotion while a new capture still requires zero percent', async () => {
  const f = fixture();
  f.state.updates[0].rolloutPercentage = 100;
  f.state.publicIds.android = id(10);
  const recovered = await preflight({ ...f.config, runAttempt: 2 }, f.dependencies);
  assert.equal(recovered.resume, true);
  await assert.rejects(capture(f.config, recovered.published, f.dependencies), /initially.*zero-percent/);
  const release = await capture({ ...f.config, resume: true }, recovered.published, f.dependencies);
  await promote(f.config, release, f.dependencies);
  assert.deepEqual(f.state.mutations, [{ updateId: id(11), rolloutPercentage: 100 }]);
  assert.equal((await preflight({ ...f.config, runAttempt: 3 }, f.dependencies)).resume, true);
});

test('a retry never replaces another run even when its OTA is fully public with the same source SHA', async () => {
  const f = fixture();
  f.state.updates.forEach((update) => {
    update.message = '<!-- anitabi-ota-run: 999; mode: coordinated -->';
    update.rolloutPercentage = 100;
  });
  await assert.rejects(preflight({ ...f.config, runAttempt: 2 }, f.dependencies), /no longer owns/);
  assert.equal((await preflight(f.config, f.dependencies)).resume, false);
  f.state.channel = null;
  await assert.rejects(preflight({ ...f.config, runAttempt: 2 }, f.dependencies), /no recorded OTA/);
  assert.deepEqual(f.state.mutations, []);
});

test('incomplete, split, or source-changed same-run groups fail closed instead of uploading repairs', async () => {
  const f = fixture();
  f.state.latest.pop();
  await assert.rejects(preflight({ ...f.config, runAttempt: 2 }, f.dependencies), /incomplete or replaced/);
  f.state.latest.push({ ...f.state.updates[1], group: id(99) });
  await assert.rejects(preflight({ ...f.config, runAttempt: 2 }, f.dependencies), /incomplete or replaced/);
  f.state.latest[1] = { ...f.state.updates[1], gitCommitHash: 'b'.repeat(40) };
  await assert.rejects(preflight({ ...f.config, runAttempt: 2 }, f.dependencies), /incomplete or replaced/);
  assert.deepEqual(f.state.mutations, []);
});

test('ownership markers must uniquely occupy the final line and match both run and mode', async () => {
  const f = fixture();
  const original = f.published[0].message;
  for (const message of [
    `${original}\nextra text`,
    `${original}\n${original}`,
    original.replace('coordinated', 'ota-first'),
    original.replace(config.runId, '999'),
  ]) {
    f.published[0].message = message;
    await assert.rejects(capture(f.config, f.published, f.dependencies), /message does not identify/);
  }
});

test('paused, ambiguous, or remapped channels fail closed', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.channel.isPaused = true;
  await assert.rejects(verify(f.config, release, f.dependencies), /paused/);
  f.state.channel.isPaused = false;
  f.state.channel.branchMapping = JSON.stringify({
    version: 0,
    data: [
      { branchId: id(2), branchMappingLogic: 'true' },
      { branchId: id(5), branchMappingLogic: 'true' },
    ],
  });
  await assert.rejects(verify(f.config, release, f.dependencies), /single-branch/);
});

test('a later B update blocks A even when the source SHA is identical', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.latest[0] = { ...f.state.updates[0], id: id(99) };
  await assert.rejects(promote(f.config, release, f.dependencies), /identity changed/);
  assert.deepEqual(f.state.mutations, []);
});

test('updates from other runtimes do not replace the latest candidate for this runtime', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.latest.unshift({ ...f.state.updates[0], id: id(99), runtimeVersion: '0.8.0-sdk58' });
  await promote(f.config, release, f.dependencies);
  assert.deepEqual(
    f.state.mutations.map((mutation) => mutation.updateId),
    [id(10), id(11)],
  );
  assert.equal(f.state.latest[0].rolloutPercentage, 0);
});

test('partial platform promotion preserves identity and retry only promotes the remaining zero-percent ID', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.failMutationId = id(11);
  await assert.rejects(promote(f.config, release, f.dependencies), /Expo API rejected/);
  assert.deepEqual(
    f.state.updates.map((update) => update.rolloutPercentage),
    [100, 0],
  );
  await verify(f.config, release, f.dependencies);
  f.state.failMutationId = null;
  f.state.mutations = [];
  await promote(f.config, release, f.dependencies);
  assert.deepEqual(f.state.mutations, [{ updateId: id(11), rolloutPercentage: 100 }]);
  assert.deepEqual(
    f.state.updates.map((update) => update.id),
    release.updates.map((update) => update.id),
  );
  assert.deepEqual(
    f.state.updates.map((update) => update.createdAt),
    release.updates.map((update) => update.createdAt),
  );
  f.state.mutations = [];
  await promote(f.config, release, f.dependencies);
  assert.deepEqual(f.state.mutations, []);
});

test('a retry accepts EAS null for a fully promoted platform and promotes only the remaining candidate', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.completedRolloutIsNull = true;
  f.state.failMutationId = id(11);
  await assert.rejects(promote(f.config, release, f.dependencies), /Expo API rejected/);
  assert.deepEqual(f.state.updates.map((update) => update.rolloutPercentage), [null, 0]);

  f.state.failMutationId = null;
  f.state.mutations = [];
  const retry = { ...f.config, runAttempt: 2 };
  const recovered = await preflight(retry, f.dependencies);
  assert.equal(recovered.resume, true);
  await assert.rejects(capture(f.config, recovered.published, f.dependencies), /initially.*zero-percent/);
  const resumed = await capture({ ...retry, resume: true }, recovered.published, f.dependencies);
  await promote(retry, resumed, f.dependencies);
  assert.deepEqual(f.state.mutations, [{ updateId: id(11), rolloutPercentage: 100 }]);
  assert.deepEqual(f.state.updates.map((update) => update.rolloutPercentage), [null, null]);
  assert.deepEqual(f.state.updates.map((update) => update.id), release.updates.map((update) => update.id));

  f.state.mutations = [];
  await promote(retry, resumed, f.dependencies);
  assert.deepEqual(f.state.mutations, []);
});

test('an unexpected rollout percentage or changed createdAt cannot be promoted', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.updates[0].rolloutPercentage = 50;
  await assert.rejects(promote(f.config, release, f.dependencies), /rollout percentage/);
  f.state.updates[0].rolloutPercentage = undefined;
  await assert.rejects(promote(f.config, release, f.dependencies), /rollout percentage/);
  f.state.updates[0].rolloutPercentage = 0;
  f.state.updates[0].createdAt = '2026-11-03T02:00:00.000Z';
  await assert.rejects(promote(f.config, release, f.dependencies), /identity changed/);
  assert.deepEqual(f.state.mutations, []);
});

test('source contentRevision must match inside the exact manifest, not only GraphQL metadata', async () => {
  const f = fixture();
  f.state.tamperManifest = (manifest) => {
    manifest.extra.expoClient.extra.contentRevision = 'b'.repeat(40);
  };
  await assert.rejects(capture(f.config, f.published, f.dependencies), /exact OTA manifest/);
});

test('exact manifest query parameters are preserved and cross-host permalinks are rejected', async () => {
  const f = fixture();
  f.state.updates.forEach((update, index) => {
    update.manifestPermalink = `${config.url}?updateId=${update.id}&platform=${update.platform}`;
    f.published[index].manifestPermalink = update.manifestPermalink;
  });
  const release = await capture(f.config, f.published, f.dependencies);
  assert.equal(release.updates[0].manifestPermalink, f.state.updates[0].manifestPermalink);
  f.published[0].manifestPermalink = `https://unexpected.example.test/${id(10)}`;
  await assert.rejects(capture(f.config, f.published, f.dependencies), /manifest host/);
});

test('ota-first requires a public update and never sends rollout mutations', async () => {
  const f = fixture('ota-first');
  const release = await capture(f.config, f.published, f.dependencies);
  await promote(f.config, release, f.dependencies);
  assert.deepEqual(f.state.mutations, []);
  f.state.updates[0].rolloutPercentage = 0;
  await assert.rejects(verify(f.config, release, f.dependencies), /rollout percentage/);
});

test('promotion checks exact public IDs and refuses same-source replacement at the public endpoint', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.tamperManifest = (manifest, publicRequest) => {
    if (publicRequest) manifest.id = id(99);
  };
  await assert.rejects(promote(f.config, release, f.dependencies), /both public OTA IDs/);
  assert.deepEqual(
    f.state.updates.map((update) => update.rolloutPercentage),
    [100, 100],
  );
  await assert.rejects(verify(f.config, release, f.dependencies), /both public OTA IDs/);
});

test('a null completed rollout still requires both public endpoints to match the candidate', async () => {
  const f = fixture();
  const release = await capture(f.config, f.published, f.dependencies);
  f.state.completedRolloutIsNull = true;
  f.state.tamperManifest = (manifest, publicRequest) => {
    if (publicRequest) manifest.id = id(99);
  };
  await assert.rejects(promote(f.config, release, f.dependencies), /both public OTA IDs/);
  assert.deepEqual(f.state.updates.map((update) => update.rolloutPercentage), [null, null]);
  await assert.rejects(verify(f.config, release, f.dependencies), /both public OTA IDs/);
});

test('network failures never expose token-bearing upstream errors or mutate candidate state', async () => {
  const f = fixture();
  await assert.rejects(
    preflight(f.config, {
      fetchImpl: async () => {
        throw new Error(`network failed: ${config.token}`);
      },
    }),
    (error) => {
      assert.match(error.message, /cannot be verified/);
      assert.equal(error.message.includes(config.token), false);
      return true;
    },
  );
  assert.deepEqual(
    f.state.updates.map((update) => update.rolloutPercentage),
    [0, 0],
  );
});

test('missing source, conflicting project IDs and credential-bearing URLs are rejected', () => {
  const env = {
    EXPO_TOKEN: config.token,
    OTA_UPDATE_URL: config.url,
    OTA_RUNTIME_VERSION: config.runtimeVersion,
    OTA_CHANNEL: config.channel,
    OTA_SOURCE_SHA: config.sourceSha,
  };
  assert.throws(() => readConfig({ ...env, OTA_SOURCE_SHA: '' }), /source SHA/);
  assert.throws(() => readConfig({ ...env, EXPO_PROJECT_ID: id(99) }), /project IDs/);
  assert.throws(
    () => readConfig({ ...env, OTA_UPDATE_URL: `https://user:secret@u.expo.dev/${id(1)}` }),
    /Unsafe OTA URL/,
  );
});

test('capture CLI writes compact release JSON for downstream jobs without credentials', async () => {
  const f = fixture();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-release-'));
  const input = path.join(temporary, 'ota-update.json');
  const output = path.join(temporary, 'output.txt');
  fs.writeFileSync(input, JSON.stringify(f.published));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = f.dependencies.fetchImpl;
    await main(['capture', input], {
      EXPO_TOKEN: config.token,
      OTA_UPDATE_URL: config.url,
      OTA_RUNTIME_VERSION: config.runtimeVersion,
      OTA_CHANNEL: config.channel,
      OTA_SOURCE_SHA: config.sourceSha,
      OTA_PUBLICATION_MODE: config.mode,
      GITHUB_RUN_ID: config.runId,
      GITHUB_OUTPUT: output,
    });
    const line = fs.readFileSync(output, 'utf8');
    assert.equal(line.split('\n').length, 2);
    assert.ok(line.startsWith('release='));
    const release = JSON.parse(line.slice('release='.length));
    assert.equal(release.group, id(4));
    assert.equal(line.includes(config.token), false);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('preflight CLI restores the original CLI-shaped file and writes resume=true for the same run', async () => {
  const f = fixture();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-release-resume-'));
  const input = path.join(temporary, 'ota-update.json');
  const output = path.join(temporary, 'output.txt');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = f.dependencies.fetchImpl;
    await main(['preflight'], {
      EXPO_TOKEN: config.token,
      OTA_UPDATE_URL: config.url,
      OTA_RUNTIME_VERSION: config.runtimeVersion,
      OTA_CHANNEL: config.channel,
      OTA_SOURCE_SHA: config.sourceSha,
      OTA_PUBLICATION_MODE: config.mode,
      GITHUB_RUN_ID: config.runId,
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_OUTPUT: output,
      OTA_UPDATE_FILE: input,
    });
    assert.equal(fs.readFileSync(output, 'utf8'), 'resume=true\n');
    const restored = JSON.parse(fs.readFileSync(input, 'utf8'));
    assert.equal(restored[0].branch, 'actual-release-branch');
    assert.equal(restored[0].id, id(10));
    assert.equal(JSON.stringify(restored).includes(config.token), false);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('CLI reports safe validation errors and does not echo secret input parsing errors', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('../ota-release.cjs', import.meta.url)), 'verify'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPO_TOKEN: config.token,
      OTA_UPDATE_URL: config.url,
      OTA_RUNTIME_VERSION: config.runtimeVersion,
      OTA_CHANNEL: config.channel,
      OTA_SOURCE_SHA: config.sourceSha,
      OTA_RELEASE_JSON: config.token,
      GITHUB_RUN_ID: config.runId,
    },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Cannot read OTA publication inputs/);
  assert.equal(`${child.stdout}${child.stderr}`.includes(config.token), false);
});
