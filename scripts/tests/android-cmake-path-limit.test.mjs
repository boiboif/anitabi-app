import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const withAndroidCmakePathLimit = require('../../plugins/with-android-cmake-path-limit.js');
const withAndroidReleaseSigning = require('../../plugins/with-android-release-signing.js');

const gradle = `apply plugin: "com.android.application"
android {
    defaultConfig {
        applicationId 'bbf.anitabiapp.dev'
        externalNativeBuild {
            cmake { arguments '-DANDROID_STL=c++_shared' }
        }
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;

async function applyPlugins(contents, plugins, language = 'groovy') {
  const config = plugins.reduce((value, plugin) => plugin(value), {});
  const result = await config.mods.android.appBuildGradle({
    ...config,
    modRequest: { platform: 'android', modName: 'appBuildGradle' },
    modResults: { language, contents },
  });
  return result.modResults.contents;
}

test('repeated generation preserves existing native settings and adds the path limit once', async () => {
  for (const original of [gradle, gradle.replaceAll('\n', '\r\n')]) {
    const once = await applyPlugins(original, [withAndroidCmakePathLimit]);
    const twice = await applyPlugins(once, [withAndroidCmakePathLimit]);

    assert.equal(twice, once);
    assert.equal((once.match(/-DCMAKE_OBJECT_PATH_MAX=240/g) ?? []).length, 1);
    assert.match(once, /if \(System\.getProperty\('os.name'\)\.startsWith\('Windows'\)\)/);
    const withoutGeneratedBlock = once.replace(
      /^\/\/ @generated begin anitabi-windows-cmake-path-limit[^\n]*\n[\s\S]*?^\/\/ @generated end anitabi-windows-cmake-path-limit\n/m,
      '',
    );
    assert.equal(withoutGeneratedBlock, original);
  }
});

test('composes with release signing across repeated generation', async () => {
  const plugins = [withAndroidReleaseSigning, withAndroidCmakePathLimit];
  const once = await applyPlugins(gradle, plugins);
  const twice = await applyPlugins(once, plugins);
  assert.equal(twice, once);
  assert.match(once, /signingConfig releaseStoreFile \? signingConfigs.release : signingConfigs.debug/);
  assert.match(once, /arguments '-DANDROID_STL=c\+\+_shared'/);
  assert.match(once, /arguments '-DCMAKE_OBJECT_PATH_MAX=240'/);
});

test('fails explicitly when the native template is unsupported', async () => {
  await assert.rejects(
    applyPlugins('android {}', [withAndroidCmakePathLimit]),
    /Failed to match/,
  );
  await assert.rejects(
    applyPlugins(gradle, [withAndroidCmakePathLimit], 'kotlin'),
    /requires a Groovy/,
  );
});
