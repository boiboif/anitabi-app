import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../app.config.ts', import.meta.url), 'utf8');
const appPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function configFor(env = {}) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: { EXPO_PROJECT_ID: 'local-config-test', ...env } },
    require(name) {
      assert.equal(name, './package.json');
      return appPackage;
    },
  });
  return JSON.parse(JSON.stringify(exports.default));
}

const versionExports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../../src/services/app-version.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: versionExports },
);

for (const [variant, packageName, appName] of [
  ['production', 'bbf.anitabiapp', 'Anitabi'],
  ['development', 'bbf.anitabiapp.dev', 'Anitabi Dev'],
]) {
  test(`${variant} ignores test-only application identity and server redirects`, () => {
    const config = configFor({
      APP_VARIANT: variant,
      EXPO_UPDATE_CHANNEL: 'production',
      ANITABI_TEST_APP_ID: 'bbf.anitabiapp.test.override',
      ANITABI_TEST_APP_NAME: 'Unwanted name',
      ANITABI_UPDATE_TEST_SERVER_URL: 'http://untrusted.example:18790',
    });
    assert.equal(config.name, appName);
    assert.equal(config.android.package, packageName);
    assert.equal(config.ios.bundleIdentifier, packageName);
    assert.equal(config.updates.url, 'https://u.expo.dev/local-config-test');
    assert.equal(config.extra.updateTestServerUrl, undefined);
    assert.equal(
      config.extra.binaryUpdateManifestUrl,
      'https://raw.githubusercontent.com/boiboif/anitabi-app/main/docs/releases/latest.json',
    );
  });
}

test('test-only loopback server and distinct package identity are opt-in', () => {
  const config = configFor({
    APP_VARIANT: 'test',
    EXPO_UPDATE_CHANNEL: 'production',
    ANITABI_TEST_APP_ID: 'bbf.anitabiapp.test.otaa',
    ANITABI_TEST_APP_NAME: 'Anitabi OTA A',
    ANITABI_UPDATE_TEST_SERVER_URL: 'http://127.0.0.1:18790///',
  });
  assert.equal(config.name, 'Anitabi OTA A');
  assert.equal(config.android.package, 'bbf.anitabiapp.test.otaa');
  assert.equal(config.ios.bundleIdentifier, 'bbf.anitabiapp.test.otaa');
  assert.equal(config.updates.url, 'http://127.0.0.1:18790/updates');
  assert.equal(config.extra.updateTestServerUrl, 'http://127.0.0.1:18790');
  assert.equal(config.extra.binaryUpdateManifestUrl, 'http://127.0.0.1:18790/releases/latest.json');
  assert.equal(configFor({ APP_VARIANT: 'test' }).android.package, 'bbf.anitabiapp.test');
  assert.equal(
    configFor({
      APP_VARIANT: 'test',
      ANITABI_UPDATE_TEST_SERVER_URL: 'http://localhost:65535',
      EXPO_UPDATE_CHANNEL: 'preview',
    }).updates.url,
    'http://localhost:65535/updates',
  );
});

for (const url of [
  'https://127.0.0.1:18790',
  'http://127.0.0.1',
  'http://192.168.1.1:18790',
  'http://127.0.0.1.evil.example:18790',
  'http://localhost:18790/path',
  'http://user@localhost:18790',
  'http://127.0.0.1:0',
  'http://localhost:65536',
]) {
  test(`test server rejects unsupported loopback URL ${url}`, () => {
    assert.throws(() => configFor({ APP_VARIANT: 'test', ANITABI_UPDATE_TEST_SERVER_URL: url }), /loopback HTTP URL/);
  });
}

for (const [channel, manifest] of [
  ['production', 'latest.json'],
  ['preview', 'preview.json'],
]) {
  test(`${channel} enables both OTA and the matching binary-update channel`, () => {
    const config = configFor({ EXPO_UPDATE_CHANNEL: channel });
    assert.equal(config.updates.enabled, true);
    assert.equal(config.extra.appUpdatesEnabled, true);
    assert.equal(config.extra.updateChannel, channel);
    assert.equal(config.updates.requestHeaders['expo-channel-name'], channel);
    assert.ok(config.extra.binaryUpdateManifestUrl.endsWith(`/docs/releases/${manifest}`));
  });
}

test('development default disables OTA and binary checks even with a test server URL', () => {
  for (const env of [{}, { APP_VARIANT: 'test', ANITABI_UPDATE_TEST_SERVER_URL: 'http://localhost:18790' }]) {
    const config = configFor(env);
    assert.equal(config.updates.enabled, false);
    assert.equal(config.extra.appUpdatesEnabled, false);
    assert.equal(config.extra.binaryUpdateManifestUrl, undefined);
    assert.equal(config.extra.updateChannel, 'development');
    assert.equal(config.updates.checkAutomatically, 'NEVER');
  }
});

test('ordinary builds do not acquire an OTA content identity from the CI commit', () => {
  assert.equal(configFor({ GITHUB_SHA: 'B'.repeat(40) }).extra.contentRevision, undefined);
  assert.equal(configFor({ GITHUB_SHA: 'not-a-content-revision' }).extra.contentRevision, undefined);
  assert.equal(configFor({ APP_CONTENT_REVISION: '', GITHUB_SHA: 'C'.repeat(40) }).extra.contentRevision, undefined);
  assert.equal(configFor().extra.contentRevision, undefined);
});

test('OTA content identity is explicitly supplied and normalizes case', () => {
  assert.equal(
    configFor({ APP_CONTENT_REVISION: 'ABC1234', GITHUB_SHA: 'b'.repeat(40) }).extra.contentRevision,
    'abc1234',
  );
  assert.equal(configFor({ APP_CONTENT_REVISION: 'C'.repeat(40) }).extra.contentRevision, 'c'.repeat(40));
});

for (const channel of ['production', 'preview']) {
  test(`${channel} keeps ordinary installers plain and shares the OTA suffix with its bundled installer`, () => {
    const env = { APP_NATIVE_VERSION: '0.9.0', EXPO_UPDATE_CHANNEL: channel, GITHUB_SHA: 'a'.repeat(40) };
    const ordinary = configFor(env);
    const revision = 'b2222222' + 'b'.repeat(32);
    const ota = configFor({ ...env, GITHUB_SHA: revision, APP_CONTENT_REVISION: revision });
    const bundled = configFor({ ...env, GITHUB_SHA: revision, APP_CONTENT_REVISION: revision });
    const display = (config, overrides = {}) =>
      versionExports.createAppVersionInfo({
        configuredVersion: config.version,
        nativeVersion: ordinary.version,
        nativeBuild: '100',
        contentRevision: config.extra.contentRevision,
        updatesEnabled: config.updates.enabled,
        isEmbeddedLaunch: true,
        isEmergencyLaunch: false,
        isDevelopment: false,
        channel: config.extra.updateChannel,
        updateId: 'embedded-update-uuid',
        ...overrides,
      });

    // A CI-built installer (including before a downloaded OTA is applied) stays plain.
    assert.equal(display(ordinary).displayVersion, '0.9.0');
    const applied = display(ota, { isEmbeddedLaunch: false, updateId: 'remote-ota-uuid' });
    const installed = display(bundled, { nativeBuild: '101' });
    assert.equal(applied.displayVersion, '0.9.0-b2222222');
    assert.equal(installed.displayVersion, applied.displayVersion);
    assert.equal(applied.source, 'hot-update');
    assert.equal(installed.source, 'embedded');
    assert.equal(installed.updateId, null);
    assert.equal(display(ordinary, { isEmergencyLaunch: true }).displayVersion, '0.9.0');
    assert.equal(display(bundled, { isEmergencyLaunch: true }).displayVersion, '0.9.0-b2222222');
  });
}

for (const revision of ['abcdef', 'a'.repeat(41), 'not-a-commit', ' b2222222', 'b2222222\n']) {
  test(`invalid content identity is rejected (${JSON.stringify(revision)})`, () => {
    assert.throws(
      () => configFor({ APP_CONTENT_REVISION: revision, GITHUB_SHA: 'c'.repeat(40) }),
      /Git commit identifier/,
    );
  });
}

test('the SDK58 runtime is stable across native display/build versions and content revisions', () => {
  const baseline = configFor();
  assert.equal(baseline.runtimeVersion, `${baseline.version}-sdk58`);
  const config = configFor({
    APP_VARIANT: 'test',
    APP_NATIVE_VERSION: '0.8.1',
    ANDROID_VERSION_CODE: '5603',
    APP_CONTENT_REVISION: 'a1111111',
  });
  assert.equal(config.runtimeVersion, baseline.runtimeVersion);
  assert.equal(config.version, '0.8.1');
  assert.equal(config.android.versionCode, 5603);
});

test('the background downloader uses the existing MMKV dependency and declares install/notification permissions', () => {
  const config = configFor();
  const entries = config.plugins.filter(
    (plugin) => Array.isArray(plugin) && plugin[0] === '@kesha-antonov/react-native-background-downloader',
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].skipMmkvDependency, true);
  for (const permission of [
    'android.permission.CAMERA',
    'android.permission.REQUEST_INSTALL_PACKAGES',
    'android.permission.POST_NOTIFICATIONS',
  ])
    assert.ok(config.android.permissions.includes(permission));
});
