import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assertCurrentOta, readManifest } = require('../assert-current-ota.cjs');
const sourceA = 'a'.repeat(40);
const sourceB = 'b'.repeat(40);
const options = {
  url: 'https://updates.example.test/project',
  runtimeVersion: '0.8.0-sdk58',
  channel: 'production',
  sourceSha: sourceA,
  attempts: 1,
  retryDelayMs: 0,
};
const manifest = (platform, revision = sourceA) => ({
  id: `${platform}-update`,
  runtimeVersion: options.runtimeVersion,
  extra: { expoClient: { extra: { contentRevision: revision, unrelatedPrivateValue: 'never-print-this' } } },
});
const jsonResponse = (value, type = 'application/json') =>
  new Response(JSON.stringify(value), { headers: { 'content-type': type } });
const multipartResponse = (parts) => {
  const boundary = 'expo-current-ota-fixture';
  const body =
    parts
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(value)}\r\n`,
      )
      .join('') + `--${boundary}--\r\n`;
  return new Response(body, { headers: { 'content-type': `multipart/mixed; boundary="${boundary}"` } });
};

test('current source succeeds only after both platform requests match the configured URL, runtime and channel', async () => {
  const requests = [];
  const logs = [];
  const result = await assertCurrentOta(options, {
    fetchImpl: async (url, request) => {
      requests.push({ url, request });
      return jsonResponse(manifest(request.headers['expo-platform']));
    },
    log: (entry) => logs.push(entry),
  });
  assert.deepEqual(
    requests.map(({ request }) => request.headers['expo-platform']),
    ['android', 'ios'],
  );
  for (const { url, request } of requests) {
    assert.equal(url, options.url);
    assert.equal(request.headers['expo-runtime-version'], options.runtimeVersion);
    assert.equal(request.headers['expo-channel-name'], options.channel);
    assert.match(request.headers.accept, /multipart\/mixed/);
    assert.ok(request.signal instanceof AbortSignal);
  }
  assert.deepEqual(
    result.map((entry) => entry.revision),
    [sourceA, sourceA],
  );
  assert.ok(!JSON.stringify(logs).includes('never-print-this'));
  assert.ok(logs.every((entry) => Object.keys(entry).join(',') === 'platform,id,revision'));
});

test('missing content revision fails closed instead of authorizing an old unidentified OTA', async () => {
  await assert.rejects(
    assertCurrentOta(options, {
      fetchImpl: async (_url, request) => {
        const update = manifest(request.headers['expo-platform']);
        delete update.extra.expoClient.extra.contentRevision;
        return jsonResponse(update);
      },
    }),
    /refusing to bundle stale content/,
  );
});

test('old A retry is refused after B OTA even when B never produced a downloadable native package', async () => {
  // No download-manifest input exists here: live OTA B alone must stop A.
  await assert.rejects(
    assertCurrentOta(options, {
      fetchImpl: async (_url, request) => jsonResponse(manifest(request.headers['expo-platform'], sourceB)),
    }),
    /refusing to bundle stale content/,
  );
});

test('one matching platform cannot hide a newer update on the other platform', async () => {
  await assert.rejects(
    assertCurrentOta(options, {
      fetchImpl: async (_url, request) => {
        const platform = request.headers['expo-platform'];
        return jsonResponse(manifest(platform, platform === 'android' ? sourceA : sourceB));
      },
    }),
    /refusing to bundle stale content/,
  );
});

test('a matching revision with an incompatible runtime still fails closed', async () => {
  await assert.rejects(
    assertCurrentOta(options, {
      fetchImpl: async (_url, request) =>
        jsonResponse({ ...manifest(request.headers['expo-platform']), runtimeVersion: '0.8.0-sdk57' }),
    }),
    /refusing to bundle stale content/,
  );
});

test('native-style multipart manifests and plain Expo JSON are both parsed', async () => {
  const update = manifest('android');
  assert.deepEqual(
    await readManifest(
      multipartResponse([
        ['manifest', update],
        ['extensions', {}],
      ]),
    ),
    update,
  );
  assert.deepEqual(await readManifest(jsonResponse(update, 'application/expo+json; charset=utf-8')), update);
});

test('a directive, duplicate manifest or missing multipart manifest cannot authorize a bundle', async () => {
  for (const parts of [
    [['directive', { type: 'rollBackToEmbedded' }]],
    [
      ['manifest', manifest('android')],
      ['directive', { type: 'noUpdateAvailable' }],
    ],
    [
      ['manifest', manifest('android')],
      ['manifest', manifest('ios')],
    ],
    [['extensions', {}]],
  ]) {
    await assert.rejects(readManifest(multipartResponse(parts)));
  }
});

test('HTTP errors, no-update responses and malformed JSON are not treated as fresh OTA evidence', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('unavailable', { status: 503 }),
    new Response('invalid-json', { headers: { 'content-type': 'application/json' } }),
    new Response('unsupported', { headers: { 'content-type': 'text/plain' } }),
  ]) {
    await assert.rejects(readManifest(response));
  }
});

test('network failures retry a bounded number of times without exposing their response or environment data', async () => {
  let requests = 0;
  const waits = [];
  await assert.rejects(
    assertCurrentOta(
      { ...options, attempts: 3 },
      {
        fetchImpl: async () => {
          requests++;
          throw new Error('private-network-detail');
        },
        sleep: async (delay) => waits.push(delay),
      },
    ),
    (error) => {
      assert.match(error.message, /refusing to bundle stale content/);
      assert.ok(!error.message.includes('private-network-detail'));
      return true;
    },
  );
  assert.equal(requests, 6);
  assert.deepEqual(waits, [0, 0]);
});

test('short CDN propagation delay succeeds after rechecking both platforms', async () => {
  let requests = 0;
  const waits = [];
  const result = await assertCurrentOta(
    { ...options, attempts: 5, retryDelayMs: 2000 },
    {
      fetchImpl: async (_url, request) => {
        const priorAttempt = Math.floor(requests++ / 2) === 0;
        return multipartResponse([
          ['manifest', manifest(request.headers['expo-platform'], priorAttempt ? sourceB : sourceA)],
        ]);
      },
      sleep: async (delay) => waits.push(delay),
    },
  );
  assert.equal(requests, 4);
  assert.deepEqual(waits, [2000]);
  assert.ok(result.every((entry) => entry.revision === sourceA));
});

test('retry settings and source identity are validated before making any request', async () => {
  const fetchImpl = async () => {
    throw new Error('must not reach network');
  };
  for (const invalid of [
    { sourceSha: sourceA.slice(0, 8) },
    { attempts: 6 },
    { retryDelayMs: 3001 },
    { timeoutMs: 10001 },
    { channel: '' },
    { runtimeVersion: '' },
  ]) {
    await assert.rejects(
      assertCurrentOta({ ...options, ...invalid }, { fetchImpl }),
      (error) => !error.message.includes('must not reach network'),
    );
  }
});

test('the successful OTA caller supplies its resolved config and child guards both build and publication', () => {
  const yaml = require('js-yaml');
  const readWorkflow = (name) =>
    yaml.load(fs.readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8'));
  const caller = readWorkflow('eas-update.yml');
  const mobile = readWorkflow('mobile-release.yml');
  assert.equal(caller.jobs.publish.outputs.runtime_version, '${{ steps.update-config.outputs.runtime_version }}');
  assert.equal(caller.jobs.publish.outputs.update_url, '${{ steps.update-config.outputs.update_url }}');
  assert.equal(caller.jobs['bundled-release'].needs, 'publish');
  assert.equal(caller.jobs['bundled-release'].with.ota_runtime_version, '${{ needs.publish.outputs.runtime_version }}');
  assert.equal(caller.jobs['bundled-release'].with.update_url, '${{ needs.publish.outputs.update_url }}');
  assert.equal(mobile.on.workflow_call.inputs.ota_runtime_version.required, true);
  assert.equal(mobile.on.workflow_call.inputs.update_url.required, true);
  for (const name of ['prepare', 'publish']) {
    const steps = mobile.jobs[name].steps;
    const guard = steps.find((step) => step.run?.includes('node scripts/assert-current-ota.cjs'));
    assert.equal(guard.if, 'inputs.ota_bundle');
    assert.equal(guard.env.OTA_SOURCE_SHA, '${{ inputs.source_sha }}');
    assert.equal(guard.env.OTA_RUNTIME_VERSION, '${{ inputs.ota_runtime_version }}');
    assert.equal(guard.env.OTA_UPDATE_URL, '${{ inputs.update_url }}');
    if (name === 'publish')
      assert.ok(steps.indexOf(guard) < steps.findIndex((step) => step.run?.includes('gh release create')));
  }
  assert.ok(
    !fs
      .readFileSync(new URL('../../.github/workflows/android-release.yml', import.meta.url), 'utf8')
      .includes('assert-current-ota.cjs'),
  );
});
