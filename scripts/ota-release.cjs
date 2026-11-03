const fs = require('node:fs');
const { readManifest } = require('./assert-current-ota.cjs');

const GRAPHQL_URL = 'https://api.expo.dev/graphql';
const PLATFORMS = ['android', 'ios'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// These query/mutation fields are the contracts used by eas-cli@21.8.0.
const UPDATE_FIELDS = `id group message createdAt runtimeVersion platform manifestPermalink
  gitCommitHash isRollBackToEmbedded rolloutPercentage branch { id name }`;
const CHANNEL_QUERY = `query ViewUpdateChannelOnApp($appId: String!, $channelName: String!) {
  app { byId(appId: $appId) { id updateChannelByName(name: $channelName) {
    id name isPaused branchMapping updateBranches(offset: 0, limit: 5) { id name }
  } } }
}`;
const LATEST_QUERY = `query ViewLatestUpdateOnBranch(
  $appId: String!, $branchName: String!, $platform: AppPlatform!, $runtimeVersion: String!
) {
  app { byId(appId: $appId) { id updateBranchByName(name: $branchName) {
    id updates(offset: 0, limit: 1, filter: { platform: $platform, runtimeVersions: [$runtimeVersion] }) {
      ${UPDATE_FIELDS}
    }
  } } }
}`;
const GROUP_QUERY = `query ViewUpdatesByGroup($groupId: ID!) {
  updatesByGroup(group: $groupId) { ${UPDATE_FIELDS} }
}`;
const PROMOTE_MUTATION = `mutation SetRolloutPercentageMutation($updateId: ID!, $rolloutPercentage: Int!) {
  update { setRolloutPercentage(updateId: $updateId, percentage: $rolloutPercentage) { ${UPDATE_FIELDS} } }
}`;

class OtaReleaseError extends Error {}

function requireValue(condition, message) {
  // Do not interpolate server responses, environment values or fetch errors:
  // they may contain tokens, private config, or signed URL credentials.
  if (!condition) throw new OtaReleaseError(message);
}

function safeUrl(value, allowQuery = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new OtaReleaseError('Invalid OTA URL');
  }
  requireValue(
    url.protocol === 'https:' && !url.username && !url.password && !url.hash && (allowQuery || !url.search),
    'Unsafe OTA URL',
  );
  return url.href;
}

function manifestUrl(value, config) {
  const url = safeUrl(value, true);
  // EAS can identify a specific update with query parameters. Keep that exact
  // permalink, but never forward credentials or accept another update host.
  requireValue(
    new URL(url).origin === new URL(config.url).origin,
    'OTA manifest host does not match the project update host',
  );
  return url;
}

function readConfig(env = process.env) {
  const url = safeUrl(env.OTA_UPDATE_URL);
  const projectFromUrl = new URL(url).pathname.split('/').filter(Boolean).at(-1);
  const projectId = env.EXPO_PROJECT_ID || projectFromUrl;
  requireValue(UUID.test(projectId ?? ''), 'Missing or invalid Expo project ID');
  if (UUID.test(projectFromUrl ?? '')) requireValue(projectId === projectFromUrl, 'Expo project IDs do not match');
  requireValue(typeof env.EXPO_TOKEN === 'string' && env.EXPO_TOKEN.trim(), 'Missing Expo token');
  requireValue(typeof env.OTA_RUNTIME_VERSION === 'string' && env.OTA_RUNTIME_VERSION.trim(), 'Missing OTA runtime');
  requireValue(
    typeof env.OTA_CHANNEL === 'string' && /^[\w.-]+$/.test(env.OTA_CHANNEL),
    'Missing or invalid OTA channel',
  );
  requireValue(/^[a-f0-9]{40}$/i.test(env.OTA_SOURCE_SHA ?? ''), 'Missing or invalid OTA source SHA');
  const mode = env.OTA_PUBLICATION_MODE || 'coordinated';
  requireValue(['coordinated', 'ota-first'].includes(mode), 'Invalid OTA publication mode');
  requireValue(/^\d+$/.test(env.GITHUB_RUN_ID ?? ''), 'Missing or invalid GitHub run ID');
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT || '1');
  requireValue(Number.isSafeInteger(runAttempt) && runAttempt >= 1, 'Invalid GitHub run attempt');
  requireValue(env.OTA_RESUME === undefined || ['true', 'false'].includes(env.OTA_RESUME), 'Invalid OTA resume flag');
  return {
    mode,
    url,
    projectId,
    runtimeVersion: env.OTA_RUNTIME_VERSION,
    channel: env.OTA_CHANNEL,
    sourceSha: env.OTA_SOURCE_SHA.toLowerCase(),
    token: env.EXPO_TOKEN,
    runId: env.GITHUB_RUN_ID,
    runAttempt,
    resume: env.OTA_RESUME === 'true',
  };
}

function hasRunMarker(update, config) {
  const message = update?.message;
  const marker = `<!-- anitabi-ota-run: ${config.runId}; mode: ${config.mode} -->`;
  return (
    typeof message === 'string' &&
    message.split('<!-- anitabi-ota-run:').length === 2 &&
    (message === marker || message.endsWith(`\n${marker}`))
  );
}

function createApi(config, { fetchImpl = globalThis.fetch } = {}) {
  return async (query, variables) => {
    let payload;
    try {
      const response = await fetchImpl(GRAPHQL_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      requireValue(response.ok, 'Expo API request failed');
      payload = await response.json();
    } catch {
      throw new OtaReleaseError('Expo API request failed; OTA state cannot be verified');
    }
    requireValue(
      payload && (!payload.errors || (Array.isArray(payload.errors) && payload.errors.length === 0)) && payload.data,
      'Expo API rejected the request; OTA state cannot be verified',
    );
    return payload.data;
  };
}

async function resolveBranch(config, api, allowMissing = false) {
  const data = await api(CHANNEL_QUERY, { appId: config.projectId, channelName: config.channel });
  const app = data?.app?.byId;
  requireValue(
    app?.id === config.projectId && Object.hasOwn(app, 'updateChannelByName'),
    'Cannot verify Expo project/channel',
  );
  const channel = app.updateChannelByName;
  if (channel === null && allowMissing) return null;
  requireValue(
    channel && channel.name === config.channel && channel.isPaused === false,
    'OTA channel is missing, paused or invalid',
  );
  let mapping;
  try {
    mapping = JSON.parse(channel.branchMapping);
  } catch {
    throw new OtaReleaseError('Invalid channel branch mapping');
  }
  requireValue(
    mapping?.version === 0 &&
      Array.isArray(mapping.data) &&
      mapping.data.length === 1 &&
      mapping.data[0]?.branchMappingLogic === 'true' &&
      UUID.test(mapping.data[0]?.branchId ?? ''),
    'OTA requires a simple single-branch channel mapping',
  );
  const branchId = mapping.data[0].branchId;
  const branches = channel.updateBranches?.filter((branch) => branch.id === branchId);
  requireValue(
    branches?.length === 1 && typeof branches[0].name === 'string' && branches[0].name,
    'Cannot resolve the channel branch',
  );
  return {
    branchId,
    branchName: branches[0].name,
    branchMapping: JSON.stringify({ version: 0, data: [{ branchId, branchMappingLogic: 'true' }] }),
  };
}

async function latestUpdates(config, branch, api) {
  return Promise.all(
    PLATFORMS.map(async (platform) => {
      const data = await api(LATEST_QUERY, {
        appId: config.projectId,
        branchName: branch.branchName,
        platform: platform.toUpperCase(),
        runtimeVersion: config.runtimeVersion,
      });
      const result = data?.app?.byId?.updateBranchByName;
      requireValue(
        data?.app?.byId?.id === config.projectId &&
          result?.id === branch.branchId &&
          Array.isArray(result.updates) &&
          result.updates.length <= 1,
        'Cannot verify latest branch updates',
      );
      const update = result.updates[0];
      if (update)
        requireValue(
          update.platform === platform && update.runtimeVersion === config.runtimeVersion,
          'Latest update scope does not match',
        );
      return update ?? null;
    }),
  );
}

function publicPercentage(value) {
  return value === null || value === 100;
}

async function preflight(config, dependencies = {}) {
  const api = createApi(config, dependencies);
  const branch = await resolveBranch(config, api, true);
  if (!branch) {
    requireValue(
      config.runAttempt === 1,
      'This retry has no recorded OTA on its channel; start a new workflow run instead',
    );
    return { channelExists: false, resume: false };
  }
  const latest = await latestUpdates(config, branch, api);
  if (latest.some((update) => hasRunMarker(update, config))) {
    requireValue(
      latest.every(
        (update) => hasRunMarker(update, config) && update.gitCommitHash?.toLowerCase() === config.sourceSha,
      ) && latest[0].group === latest[1].group,
      'This run has an incomplete or replaced OTA group; refusing to upload another update',
    );
    const published = latest.map((update) => ({
      id: update.id,
      createdAt: update.createdAt,
      group: update.group,
      branch: update.branch?.name,
      message: update.message,
      runtimeVersion: update.runtimeVersion,
      platform: update.platform,
      manifestPermalink: update.manifestPermalink,
      isRollBackToEmbedded: update.isRollBackToEmbedded,
      gitCommitHash: update.gitCommitHash,
    }));
    // Reuse capture's manifest, group, channel and latest-ID guards. Retrying
    // a partially promoted run keeps the original IDs and creation times.
    await capture({ ...config, resume: true }, published, dependencies);
    return { channelExists: true, ...branch, resume: true, published };
  }
  requireValue(config.runAttempt === 1, 'This retry no longer owns the latest OTA; start a new workflow run instead');
  requireValue(
    latest.every((update) => update === null || publicPercentage(update.rolloutPercentage)),
    'An unfinished rollout already exists for this runtime; resume or resolve it before publishing another OTA',
  );
  return { channelExists: true, ...branch, resume: false };
}

function normalizedUpdate(update, config, group) {
  requireValue(
    update &&
      UUID.test(update.id ?? '') &&
      UUID.test(update.group ?? '') &&
      update.group === group &&
      PLATFORMS.includes(update.platform),
    'Invalid OTA update identity',
  );
  requireValue(
    typeof update.createdAt === 'string' && Number.isFinite(Date.parse(update.createdAt)),
    'Missing OTA creation time',
  );
  requireValue(
    update.runtimeVersion === config.runtimeVersion &&
      update.gitCommitHash?.toLowerCase() === config.sourceSha &&
      update.isRollBackToEmbedded === false,
    'OTA runtime/source or update type does not match',
  );
  requireValue(hasRunMarker(update, config), 'OTA message does not identify this workflow run and publication mode');
  return {
    id: update.id,
    createdAt: update.createdAt,
    platform: update.platform,
    manifestPermalink: manifestUrl(update.manifestPermalink, config),
  };
}

function validateRelease(release, config) {
  for (const key of ['mode', 'channel', 'runtimeVersion', 'sourceSha', 'url', 'projectId', 'runId']) {
    requireValue(release?.[key] === config[key], 'Stored OTA release does not match the current publication context');
  }
  requireValue(
    UUID.test(release.group ?? '') && UUID.test(release.branchId ?? '') && typeof release.branchMapping === 'string',
    'Invalid stored OTA group/branch identity',
  );
  requireValue(
    Array.isArray(release.updates) &&
      release.updates.length === 2 &&
      PLATFORMS.every((platform) => release.updates.filter((update) => update?.platform === platform).length === 1) &&
      new Set(release.updates.map((update) => update.id)).size === 2,
    'Stored OTA release must identify both platforms',
  );
  for (const update of release.updates) {
    requireValue(
      UUID.test(update.id ?? '') &&
        typeof update.createdAt === 'string' &&
        Number.isFinite(Date.parse(update.createdAt)),
      'Invalid stored OTA update identity',
    );
    manifestUrl(update.manifestPermalink, config);
  }
}

function assertIdentity(actual, expected, config, release) {
  const normalized = normalizedUpdate(actual, config, release.group);
  for (const key of ['id', 'createdAt', 'platform', 'manifestPermalink']) {
    requireValue(normalized[key] === expected[key], 'The recorded OTA has been replaced or its identity changed');
  }
  requireValue(actual.branch?.id === release.branchId, 'OTA branch identity changed');
  requireValue(
    config.mode === 'coordinated'
      ? actual.rolloutPercentage === 0 || actual.rolloutPercentage === 100
      : publicPercentage(actual.rolloutPercentage),
    'Unexpected OTA rollout percentage',
  );
}

async function checkManifest(config, expected, fetchImpl, publicEndpoint = false) {
  try {
    const response = await fetchImpl(publicEndpoint ? config.url : expected.manifestPermalink, {
      headers: {
        accept: 'multipart/mixed,application/expo+json,application/json',
        'expo-protocol-version': '1',
        'expo-platform': expected.platform,
        'expo-runtime-version': config.runtimeVersion,
        'expo-channel-name': config.channel,
        'cache-control': 'no-cache',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    const manifest = await readManifest(response);
    requireValue(
      manifest?.id === expected.id &&
        manifest.createdAt === expected.createdAt &&
        manifest.runtimeVersion === config.runtimeVersion &&
        manifest.extra?.expoClient?.extra?.contentRevision === config.sourceSha,
      'OTA manifest identity/source does not match',
    );
  } catch {
    throw new OtaReleaseError(
      publicEndpoint ? 'Public OTA does not match the recorded update' : 'Cannot verify the exact OTA manifest',
    );
  }
}

async function verify(config, release, dependencies = {}) {
  validateRelease(release, config);
  const api = createApi(config, dependencies);
  const branch = await resolveBranch(config, api);
  requireValue(
    branch.branchId === release.branchId && branch.branchMapping === release.branchMapping,
    'OTA channel branch mapping changed',
  );
  const [latest, data] = await Promise.all([
    latestUpdates(config, branch, api),
    api(GROUP_QUERY, { groupId: release.group }),
  ]);
  requireValue(
    Array.isArray(data.updatesByGroup) && data.updatesByGroup.length === 2,
    'OTA group no longer contains exactly two platforms',
  );
  for (const expected of release.updates) {
    const members = data.updatesByGroup.filter((update) => update.platform === expected.platform);
    requireValue(members.length === 1, 'OTA group platform membership changed');
    assertIdentity(members[0], expected, config, release);
    // Exact IDs matter even when a later update was published from the same SHA.
    assertIdentity(latest[PLATFORMS.indexOf(expected.platform)], expected, config, release);
  }
  await Promise.all(
    release.updates.map((update) => checkManifest(config, update, dependencies.fetchImpl ?? globalThis.fetch)),
  );
  if (data.updatesByGroup.every((update) => publicPercentage(update.rolloutPercentage))) {
    await verifyPublic(config, release, dependencies);
  }
  return data.updatesByGroup;
}

async function capture(config, published, dependencies = {}) {
  requireValue(
    Array.isArray(published) &&
      published.length === 2 &&
      UUID.test(published[0]?.group ?? '') &&
      PLATFORMS.every((platform) => published.filter((update) => update?.platform === platform).length === 1),
    'EAS output must contain exactly one OTA update per platform',
  );
  const group = published[0].group;
  const updates = published.map((update) => normalizedUpdate(update, config, group));
  const branch = await resolveBranch(config, createApi(config, dependencies));
  requireValue(
    published.every((update) => update.branch === branch.branchName),
    'Published OTA is not on the channel branch',
  );
  const release = {
    mode: config.mode,
    channel: config.channel,
    runtimeVersion: config.runtimeVersion,
    sourceSha: config.sourceSha,
    url: config.url,
    projectId: config.projectId,
    runId: config.runId,
    group,
    branchId: branch.branchId,
    branchMapping: branch.branchMapping,
    updates: PLATFORMS.map((platform) => updates.find((update) => update.platform === platform)),
  };
  const current = await verify(config, release, dependencies);
  requireValue(
    config.mode !== 'coordinated' || config.resume || current.every((update) => update.rolloutPercentage === 0),
    'A new coordinated candidate must initially have a zero-percent rollout',
  );
  return release;
}

async function verifyPublic(
  config,
  release,
  {
    fetchImpl = globalThis.fetch,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const checks = await Promise.allSettled(
      release.updates.map((update) => checkManifest(config, update, fetchImpl, true)),
    );
    if (checks.every((check) => check.status === 'fulfilled')) return;
    if (attempt < 4) await sleep(2000);
  }
  throw new OtaReleaseError('Cannot verify both public OTA IDs; publication remains incomplete and can be retried');
}

async function promote(config, release, dependencies = {}) {
  let current = await verify(config, release, dependencies);
  const api = createApi(config, dependencies);
  for (const expected of release.updates) {
    const update = current.find((item) => item.id === expected.id);
    if (config.mode === 'coordinated' && update.rolloutPercentage === 0) {
      // EAS mutates each platform separately. A retry must accept a prior 100/0
      // partial success and only promote the remaining fixed update ID.
      const data = await api(PROMOTE_MUTATION, { updateId: expected.id, rolloutPercentage: 100 });
      assertIdentity(data?.update?.setRolloutPercentage, expected, config, release);
      requireValue(data.update.setRolloutPercentage.rolloutPercentage === 100, 'OTA promotion was not applied');
    }
  }
  current = await verify(config, release, dependencies);
  requireValue(
    current.every((update) => publicPercentage(update.rolloutPercentage)),
    'OTA promotion remains incomplete',
  );
  return release;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const config = readConfig(env);
  const [command, filename] = argv;
  if (command === 'preflight') {
    const result = await preflight(config);
    if (result.resume) fs.writeFileSync(env.OTA_UPDATE_FILE || 'ota-update.json', JSON.stringify(result.published));
    requireValue(env.GITHUB_OUTPUT, 'Missing GitHub output file');
    fs.appendFileSync(env.GITHUB_OUTPUT, `resume=${result.resume}\n`);
  } else if (command === 'capture') {
    const release = await capture(config, JSON.parse(fs.readFileSync(filename || env.OTA_UPDATE_FILE, 'utf8')));
    requireValue(env.GITHUB_OUTPUT, 'Missing GitHub output file');
    fs.appendFileSync(env.GITHUB_OUTPUT, `release=${JSON.stringify(release)}\n`);
  } else if (command === 'verify' || command === 'promote') {
    const release = JSON.parse(env.OTA_RELEASE_JSON || 'null');
    if (command === 'promote') await promote(config, release);
    else await verify(config, release);
  } else {
    throw new OtaReleaseError('Expected preflight, capture, verify or promote');
  }
  process.stdout.write(`OTA ${command} completed.\n`);
}

module.exports = { readConfig, preflight, capture, verify, promote, main };
if (require.main === module) {
  main().catch((error) => {
    // Parser and filesystem errors can also contain user input. Keep the CLI
    // boundary safe even when an upstream error includes the Expo token.
    const reason = error instanceof OtaReleaseError ? error.message : 'Cannot read OTA publication inputs';
    process.stderr.write(`OTA release stopped: ${reason}. No replacement or rollback was attempted.\n`);
    process.exitCode = 1;
  });
}
