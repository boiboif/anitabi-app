const assert = require('node:assert/strict');

async function readManifest(response) {
  assert.equal(response.status, 200, 'The update server did not return an available update');
  const contentType = response.headers.get('content-type') ?? '';
  if (/^application\/(?:expo\+)?json(?:;|$)/i.test(contentType)) return response.json();
  assert.match(contentType, /^multipart\/mixed(?:;|$)/i, 'Unsupported update response type');
  // Expo parts use Content-Disposition: form-data; name="manifest". Reuse the
  // built-in MIME parser after adapting only the top-level media type.
  const form = await new Response(response.body, {
    headers: { 'content-type': contentType.replace(/^multipart\/mixed/i, 'multipart/form-data') },
  }).formData();
  assert.equal(form.has('directive'), false, 'An update directive cannot authorize a bundled release');
  const manifests = form.getAll('manifest');
  assert.equal(manifests.length, 1, 'The update response must contain exactly one manifest');
  return JSON.parse(await new Response(manifests[0]).text());
}

async function assertCurrentOta(
  { url, runtimeVersion, channel, sourceSha, attempts = 5, retryDelayMs = 2000, timeoutMs = 10000 },
  {
    fetchImpl = globalThis.fetch,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    log = () => {},
  } = {},
) {
  const parsedUrl = new URL(url);
  assert.ok(['https:', 'http:'].includes(parsedUrl.protocol), 'The update URL must use HTTP(S)');
  assert.ok(typeof runtimeVersion === 'string' && runtimeVersion.trim(), 'Missing OTA runtime version');
  assert.ok(typeof channel === 'string' && channel.trim(), 'Missing OTA channel');
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/i, 'The OTA source must be a full Git commit SHA');
  assert.ok(Number.isInteger(attempts) && attempts >= 1 && attempts <= 5, 'Invalid propagation retry count');
  assert.ok(Number.isInteger(retryDelayMs) && retryDelayMs >= 0 && retryDelayMs <= 3000, 'Invalid retry interval');
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 10000, 'Invalid request timeout');
  const expectedSha = sourceSha.toLowerCase();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const checks = await Promise.allSettled(
      ['android', 'ios'].map(async (platform) => {
        const response = await fetchImpl(parsedUrl.href, {
          headers: {
            accept: 'multipart/mixed,application/expo+json,application/json',
            'expo-protocol-version': '1',
            'expo-platform': platform,
            'expo-runtime-version': runtimeVersion,
            'expo-channel-name': channel,
            'cache-control': 'no-cache',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const manifest = await readManifest(response);
        const revision = manifest?.extra?.expoClient?.extra?.contentRevision;
        log({
          platform,
          id: typeof manifest?.id === 'string' ? manifest.id : null,
          revision: typeof revision === 'string' ? revision : null,
        });
        assert.ok(typeof manifest?.id === 'string' && manifest.id, 'The current OTA has no update ID');
        assert.equal(manifest.runtimeVersion, runtimeVersion, 'The current OTA runtime is incompatible');
        assert.equal(revision, expectedSha, 'A newer or unidentified OTA has replaced this source');
        return { platform, id: manifest.id, revision };
      }),
    );
    if (checks.every((check) => check.status === 'fulfilled')) return checks.map((check) => check.value);
    if (attempt < attempts) await sleep(retryDelayMs);
  }
  // Do not print response bodies, request headers, URL credentials or environment
  // values. Only the diagnostic IDs/revisions above belong in workflow logs.
  throw new Error(
    'Current channel OTA does not match this source on both platforms, or cannot be verified; refusing to bundle stale content.',
  );
}

module.exports = { assertCurrentOta, readManifest };
if (require.main === module) {
  assertCurrentOta(
    {
      url: process.env.OTA_UPDATE_URL,
      runtimeVersion: process.env.OTA_RUNTIME_VERSION,
      channel: process.env.OTA_CHANNEL,
      sourceSha: process.env.OTA_SOURCE_SHA,
    },
    { log: (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`) },
  ).catch(() => {
    process.stderr.write('Cannot verify this source as the current OTA on both platforms; bundled release stopped.\n');
    process.exitCode = 1;
  });
}
