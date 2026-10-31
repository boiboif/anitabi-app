import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOtaTestServer, parseResourceDump, readOtaExport } from '../ota-test-server.mjs';
import { expectedPhase, verifyPhase, xmlTexts } from '../verify-ota-device.mjs';

const ids = {
  base: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bundled: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ota1: '11111111-1111-4111-8111-111111111111',
  ota2: '22222222-2222-4222-8222-222222222222',
};
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('base64url');
const makeApk = (buildNumber, id, commitTime) => ({
  native: { packageName: `bbf.anitabiapp.test.ota${buildNumber === 5601 ? 'a' : 'b'}`, version: '0.8.0', buildNumber },
  embedded: { id, commitTime },
  config: {
    version: '0.8.0',
    runtimeVersion: '0.8.0-sdk58',
    extra: {
      updateChannel: 'production',
      appVariant: 'test',
      contentRevision: buildNumber === 5601 ? 'a1111111' : buildNumber === 5602 ? 'b2222222' : 'c3333333',
    },
  },
  bundle: Buffer.alloc(256 * 1024, buildNumber),
  apkBytes: Buffer.from(`test APK ${buildNumber}`),
  assets: [
    {
      key: 'asset-key',
      hash: sha(Buffer.from('asset')),
      contentType: 'image/png',
      fileExtension: '.png',
      bytes: Buffer.from('asset'),
    },
  ],
});
const create = () =>
  createOtaTestServer({
    base: makeApk(5601, ids.base, 100000),
    bundled: makeApk(5602, ids.bundled, 102000),
    ota2Source: makeApk(5603, ids.bundled, 103000),
    ota1Id: ids.ota1,
    ota2Id: ids.ota2,
  });
const headers = {
  'expo-protocol-version': '1',
  'expo-platform': 'android',
  'expo-runtime-version': '0.8.0-sdk58',
  'expo-channel-name': 'production',
  'expo-current-update-id': ids.base,
  'expo-embedded-update-id': ids.base,
};

async function withFixture(run) {
  const fixture = create();
  const origin = await fixture.listen(0);
  const change = async (state) => {
    const response = await fetch(`${origin}/admin/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    await run(fixture, origin, change);
  } finally {
    await fixture.close();
  }
}

function withExport(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'anitabi-ota-export-'));
  const metadata = {
    version: 0,
    bundler: 'metro',
    fileMetadata: {
      android: { bundle: '_expo/static/js/android/next.hbc', assets: [{ path: 'assets/abcdef1234', ext: 'png' }] },
    },
  };
  const config = {
    version: '0.8.0',
    runtimeVersion: '0.8.0-sdk58',
    extra: { appVariant: 'test', updateChannel: 'production', contentRevision: 'c3333333' },
  };
  const configFile = path.join(directory, 'public-config.json');
  fs.mkdirSync(path.join(directory, '_expo/static/js/android'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(
    path.join(directory, '_expo/static/js/android/next.hbc'),
    'Hermes fixture compiled with NEXT marker',
  );
  fs.writeFileSync(path.join(directory, 'assets/abcdef1234'), 'new exported asset');
  const write = () => {
    fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata));
    fs.writeFileSync(configFile, JSON.stringify(config));
  };
  write();
  try {
    run({ directory, configFile, metadata, config, write });
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('SDK58 export loader follows Android metadata paths and preserves the actual export config revision', () => {
  withExport(({ directory, configFile, metadata, write }) => {
    const source = readOtaExport(directory, configFile);
    assert.equal(source.config.extra.contentRevision, 'c3333333');
    assert.equal(source.bundle.toString(), 'Hermes fixture compiled with NEXT marker');
    assert.equal(source.assets[0].key, 'abcdef1234');
    assert.equal(source.assets[0].fileExtension, '.png');
    assert.equal(source.assets[0].hash, sha(Buffer.from('new exported asset')));
    const fixture = createOtaTestServer({
      base: makeApk(5601, ids.base, 100000),
      bundled: makeApk(5602, ids.bundled, 102000),
      ota2Source: source,
    });
    assert.notEqual(fixture.updates.ota2.launchAsset.hash, fixture.updates.ota1.launchAsset.hash);
    metadata.fileMetadata.android.bundle = '_expo\\static\\js\\android\\next.hbc';
    metadata.fileMetadata.android.assets[0].path = 'assets\\abcdef1234';
    write();
    assert.deepEqual(
      readOtaExport(directory, configFile).bundle,
      source.bundle,
      'Windows-exported paths are supported',
    );
  });
});

test('export loader rejects traversal, missing files, missing Android metadata and fabricated config identity', () => {
  withExport(({ directory, configFile, metadata, config, write }) => {
    const android = metadata.fileMetadata.android;
    for (const bundle of ['../outside.hbc', '..\\outside.hbc', '/outside.hbc', 'C:/outside.hbc']) {
      android.bundle = bundle;
      write();
      assert.throws(() => readOtaExport(directory, configFile), /path traversal/);
    }
    android.bundle = '_expo/static/js/android/next.hbc';
    android.assets[0].path = '../outside.png';
    write();
    assert.throws(() => readOtaExport(directory, configFile), /path traversal/);
    android.assets[0].path = 'assets/missing';
    write();
    assert.throws(() => readOtaExport(directory, configFile), /ENOENT/);
    delete metadata.fileMetadata.android;
    write();
    assert.throws(() => readOtaExport(directory, configFile), /Android bundle and Android asset list/);
    metadata.fileMetadata.android = { bundle: '_expo/static/js/android/next.hbc' };
    write();
    assert.throws(() => readOtaExport(directory, configFile), /Android bundle and Android asset list/);
    metadata.fileMetadata.android = { bundle: '_expo/static/js/android/next.hbc', assets: [] };
    config.extra.contentRevision = 'not-a-revision';
    write();
    assert.throws(() => readOtaExport(directory, configFile), /actual contentRevision/);
    assert.throws(() => readOtaExport(directory), /ota2-config/);
    fs.unlinkSync(path.join(directory, 'metadata.json'));
    assert.throws(() => readOtaExport(directory, configFile), /metadata.json/);
  });
});

test('OTA2 cannot claim a revision or native runtime different from its exported public config', () => {
  withExport(({ directory, configFile, config, write }) => {
    const base = makeApk(5601, ids.base, 100000);
    const bundled = makeApk(5602, ids.bundled, 102000);
    config.extra.contentRevision = 'd4444444';
    write();
    assert.throws(
      () => createOtaTestServer({ base, bundled, ota2Source: readOtaExport(directory, configFile) }),
      /contentRevision differs/,
    );
    config.extra.contentRevision = 'c3333333';
    config.runtimeVersion = '0.8.0-sdk57';
    write();
    assert.throws(
      () => createOtaTestServer({ base, bundled, ota2Source: readOtaExport(directory, configFile) }),
      /runtime does not match/,
    );
  });
});

test('resource dump maps renamed APK paths and image densities without assuming filenames', () => {
  const resources = parseResourceDump(
    'resource 0x7f07011d drawable/searchicon\n  (mdpi) (file) res/Cz.png type=PNG\n  (xhdpi-v4) (file) res/D1.png type=PNG\nresource 0x7f100004 raw/font\n  () (file) res/V6.ttf',
  );
  assert.deepEqual(resources.get('drawable/searchicon'), [
    { scale: 1, file: 'res/Cz.png' },
    { scale: 2, file: 'res/D1.png' },
  ]);
  assert.deepEqual(resources.get('raw/font'), [{ scale: 1, file: 'res/V6.ttf' }]);
});

test('OTA2 requires different JavaScript and A/B revisions must be explicit and distinct', async () => {
  const base = makeApk(5601, ids.base, 100000);
  const bundled = makeApk(5602, ids.bundled, 102000);
  assert.throws(() => createOtaTestServer({ base, bundled, ota2Source: bundled }), /different exported JavaScript/);
  const sameRevision = { ...base, config: bundled.config };
  assert.throws(() => createOtaTestServer({ base: sameRevision, bundled }), /content revisions must differ/);
  const fixture = createOtaTestServer({ base, bundled });
  const origin = await fixture.listen(0);
  try {
    const response = await fetch(`${origin}/admin/state`, {
      method: 'POST',
      body: JSON.stringify({ scenario: 'ota2' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /ota2-export/);
  } finally {
    await fixture.close();
  }
});

test('protocol v1 serves immutable APK bytes with correct SHA256 and native-compatible extra config', async () => {
  await withFixture(async (fixture, origin, change) => {
    await change({ scenario: 'ota1' });
    const response = await fetch(`${origin}/updates`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('expo-protocol-version'), '1');
    const manifest = await response.json();
    assert.equal(manifest.id, ids.ota1);
    assert.equal(manifest.runtimeVersion, '0.8.0-sdk58');
    assert.equal(manifest.extra.expoClient.version, '0.8.0');
    assert.equal(manifest.extra.expoClient.extra.contentRevision, 'b2222222');
    assert.ok(new Date(manifest.createdAt).getTime() > 100000);
    assert.ok(new Date(manifest.createdAt).getTime() < 102000, 'OTA1 must precede B embedded creation time');
    for (const asset of [manifest.launchAsset, ...manifest.assets]) {
      assert.equal(asset.bytes, undefined);
      const assetResponse = await fetch(asset.url);
      const bytes = Buffer.from(await assetResponse.arrayBuffer());
      assert.equal(sha(bytes), asset.hash);
    }
    assert.deepEqual(
      Buffer.from(await (await fetch(manifest.launchAsset.url)).arrayBuffer()),
      fixture.updates.ota1.launchAsset.bytes,
    );
    assert.ok(new Date(fixture.updates.ota2.createdAt).getTime() > 102000);
    assert.equal(fixture.updates.ota2.extra.expoClient.extra.contentRevision, 'c3333333');
    assert.notEqual(fixture.updates.ota2.launchAsset.hash, fixture.updates.ota1.launchAsset.hash);
  });
});

test('same update identity is stable so the native client can reject duplicate updates', async () => {
  await withFixture(async (_fixture, origin, change) => {
    await change({ scenario: 'ota1' });
    const first = await (await fetch(`${origin}/updates`, { headers })).json();
    const repeated = await (
      await fetch(`${origin}/updates`, { headers: { ...headers, 'expo-current-update-id': ids.ota1 } })
    ).json();
    assert.deepEqual(repeated, first);
  });
});

test('no-update, mismatching runtime, channel and platform do not deliver a manifest', async () => {
  await withFixture(async (_fixture, origin, change) => {
    assert.equal((await fetch(`${origin}/updates`, { headers })).status, 204);
    await change({ scenario: 'ota2' });
    for (const mismatch of [
      { 'expo-runtime-version': '0.8.0-other' },
      { 'expo-channel-name': 'preview' },
      { 'expo-platform': 'ios' },
    ]) {
      const response = await fetch(`${origin}/updates`, { headers: { ...headers, ...mismatch } });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('content-type'), null);
    }
    assert.equal(
      (await fetch(`${origin}/updates`, { headers: { ...headers, 'expo-protocol-version': '0' } })).status,
      406,
    );
  });
});

test('publishing the bundled catalog keeps the old package upgrade manifest byte-identical', async () => {
  await withFixture(async (_fixture, origin, change) => {
    const before = await (await fetch(`${origin}/releases/latest.json`)).text();
    await change({ scenario: 'bundled' });
    assert.equal(await (await fetch(`${origin}/releases/latest.json`)).text(), before);
    const catalog = await (await fetch(`${origin}/releases/download.json`)).json();
    assert.equal(catalog.buildNumber, 5602);
    assert.equal(catalog.mandatory, false);
    assert.equal((await (await fetch(catalog.apkUrl)).arrayBuffer()).byteLength, Buffer.byteLength('test APK 5602'));
  });
});

test('manifest and interrupted-asset failures recover without changing update identity', async () => {
  await withFixture(async (fixture, origin, change) => {
    await change({ scenario: 'ota2', manifestFailures: 1, assetInterruptions: 1 });
    assert.equal((await fetch(`${origin}/updates`, { headers })).status, 503);
    const manifest = await (await fetch(`${origin}/updates`, { headers })).json();
    const interrupted = await fetch(manifest.launchAsset.url);
    await assert.rejects(interrupted.arrayBuffer());
    const retried = await fetch(manifest.launchAsset.url);
    assert.equal(sha(Buffer.from(await retried.arrayBuffer())), manifest.launchAsset.hash);
    assert.equal(manifest.id, ids.ota2);
    assert.ok(fixture.events.some((event) => event.status === 'interrupted'));
    assert.ok(fixture.events.some((event) => event.kind === 'asset' && event.status === 200));
  });
});

test('state sequence bounds report evidence and preserves native/current-update request ids', async () => {
  await withFixture(async (_fixture, origin, change) => {
    const state = await change({ scenario: 'ota1' });
    const response = await fetch(`${origin}/reports`, { method: 'POST', body: JSON.stringify({ updateId: ids.ota1 }) });
    assert.equal(response.status, 200);
    const reports = await (await fetch(`${origin}/admin/reports?after=${state.sequence}`)).json();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].data.updateId, ids.ota1);
    await fetch(`${origin}/updates`, { headers });
    const events = await (await fetch(`${origin}/admin/events?after=${state.sequence}`)).json();
    assert.ok(
      events.some(
        (event) => event.kind === 'manifest' && event.currentId === ids.base && event.embeddedId === ids.base,
      ),
    );
  });
});

test('launch-asset corruption changes one response byte while preserving the manifest and healthy retry source', async () => {
  await withFixture(async (fixture, origin, change) => {
    await change({ scenario: 'ota2', assetCorruptions: 1 });
    const manifest = await (await fetch(`${origin}/updates`, { headers })).json();
    // A static resource request must not consume the launch-asset-only fault.
    const resource = manifest.assets[0];
    assert.equal(sha(Buffer.from(await (await fetch(resource.url)).arrayBuffer())), resource.hash);
    assert.equal(fixture.state.assetCorruptions, 1);
    const ota1Response = await fetch(`${origin}/assets/${fixture.updates.ota1.id}/bundle.hbc`);
    assert.equal(sha(Buffer.from(await ota1Response.arrayBuffer())), fixture.updates.ota1.launchAsset.hash);
    assert.equal(fixture.state.assetCorruptions, 1, 'The integrity fault applies only to C launch assets');
    const response = await fetch(manifest.launchAsset.url);
    const damaged = Buffer.from(await response.arrayBuffer());
    const original = fixture.updates.ota2.launchAsset.bytes;
    assert.equal(response.status, 200);
    assert.equal(damaged.length, original.length);
    assert.notEqual(sha(damaged), manifest.launchAsset.hash);
    assert.equal([...damaged].filter((byte, index) => byte !== original[index]).length, 1);
    assert.equal(sha(original), manifest.launchAsset.hash, 'The immutable source was not mutated');
    assert.equal(fixture.state.assetCorruptions, 0);
    const repeated = await (await fetch(`${origin}/updates`, { headers })).json();
    assert.deepEqual(repeated, manifest, 'Do not change the update identity or its declared hash');
    assert.deepEqual(Buffer.from(await (await fetch(manifest.launchAsset.url)).arrayBuffer()), original);
    const event = fixture.events.find((entry) => entry.kind === 'asset' && entry.corrupted);
    assert.equal(event.declaredHash, manifest.launchAsset.hash);
    assert.notEqual(event.servedHash, event.declaredHash);
  });
});

test('integrity phase requires a corrupt C response and preserves A OTA1 identity, content and readiness', () => {
  const metadata = create().metadata('http://127.0.0.1:18790');
  const expected = expectedPhase('asset-corruption', metadata);
  const report = {
    packageName: expected.native.packageName,
    nativeBuildVersion: String(expected.native.buildNumber),
    nativeApplicationVersion: expected.native.version,
    updateId: ids.ota1,
    runtimeVersion: metadata.runtimeVersion,
    isEmbeddedLaunch: false,
    displayVersion: '0.8.0-b2222222',
    contentRevision: 'b2222222',
    bundleMarker: 'OTA_ONE',
    hotUpdateReady: false,
    binaryUpdateBuildNumber: null,
    isChecking: false,
  };
  const events = [
    { kind: 'manifest', status: 200, updateId: ids.ota2 },
    {
      kind: 'asset',
      status: 200,
      key: `bundle-${ids.ota2}`,
      corrupted: true,
      declaredHash: metadata.updates.ota2.launchHash,
      servedHash: 'different-hash',
    },
  ];
  assert.doesNotThrow(() => verifyPhase('asset-corruption', metadata, [{ data: report }], events));
  assert.throws(
    () => verifyPhase('asset-corruption', metadata, [{ data: { ...report, hotUpdateReady: true } }], events),
    /restart prompt/,
  );
  assert.throws(
    () => verifyPhase('asset-corruption', metadata, [{ data: { ...report, bundleMarker: 'NEXT' } }], events),
    /JavaScript bundle marker/,
  );
  assert.throws(
    () => verifyPhase('asset-corruption', metadata, [{ data: report }], [events[0]]),
    /corrupt C launch-asset/,
  );
  assert.throws(
    () =>
      verifyPhase(
        'asset-corruption',
        metadata,
        [{ data: report }],
        [events[0], { ...events[1], servedHash: events[1].declaredHash }],
      ),
    /corrupt C launch-asset/,
  );
});

test('OTA1 on A and embedded B show the same content version while retaining distinct native/update identities', () => {
  const metadata = create().metadata('http://127.0.0.1:18790');
  const old = expectedPhase('ota1-applied', metadata);
  const fresh = expectedPhase('bundled-new', metadata);
  assert.equal(old.displayVersion, '0.8.0-b2222222');
  assert.equal(fresh.displayVersion, old.displayVersion);
  assert.notEqual(old.updateId, fresh.updateId);
  assert.notEqual(old.native.packageName, fresh.native.packageName);
  assert.equal(expectedPhase('base', metadata).displayVersion, '0.8.0-a1111111');
  assert.equal(expectedPhase('ota2-applied-new', metadata).displayVersion, '0.8.0-c3333333');
  assert.equal(expectedPhase('ota2-applied-new', metadata).bundleMarker, 'NEXT');
});

test('phase assertions distinguish native A/B from the OTA content version and reject false readiness', () => {
  const fixture = create().metadata('http://127.0.0.1:18790');
  for (const phase of [
    'base',
    'ota1-ready',
    'ota1-applied',
    'same-update',
    'bundled-old',
    'bundled-new',
    'ota2-ready-old',
    'ota2-applied-old',
    'ota2-ready-new',
    'ota2-applied-new',
  ]) {
    const expected = expectedPhase(phase, fixture);
    const report = {
      isChecking: false,
      runtimeVersion: fixture.runtimeVersion,
      binaryUpdateBuildNumber: null,
      hotUpdateReady: expected.ready,
      nativeBuildVersion: String(expected.native.buildNumber),
      packageName: expected.native.packageName,
      nativeApplicationVersion: expected.native.version,
      updateId: expected.updateId,
      isEmbeddedLaunch: expected.embedded,
      displayVersion: expected.displayVersion,
      contentRevision: expected.contentRevision,
      bundleMarker: expected.bundleMarker,
    };
    const events = [
      {
        kind: 'manifest',
        currentId: expected.updateId,
        status: 200,
        updateId: phase === 'ota1-ready' ? ids.ota1 : ids.ota2,
      },
    ];
    assert.doesNotThrow(() => verifyPhase(phase, fixture, [{ data: report }], events), phase);
    assert.throws(
      () => verifyPhase(phase, fixture, [{ data: { ...report, binaryUpdateBuildNumber: 5602 } }], events),
      /package upgrade/,
    );
    assert.throws(
      () => verifyPhase(phase, fixture, [{ data: { ...report, bundleMarker: 'WRONG_BUNDLE' } }], events),
      /JavaScript bundle marker/,
    );
  }
  assert.deepEqual(xmlTexts('<node text="v0.8.0-11111111"/><node text="A &amp; B"/>'), ['v0.8.0-11111111', 'A & B']);
});
