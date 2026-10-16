const { withAppBuildGradle } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

module.exports = function withAndroidCmakePathLimit(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('withAndroidCmakePathLimit requires a Groovy app/build.gradle.');
    }

    modConfig.modResults.contents = mergeContents({
      src: modConfig.modResults.contents,
      tag: 'anitabi-windows-cmake-path-limit',
      anchor: /^\s*defaultConfig\s*\{/,
      offset: 1,
      comment: '//',
      newSrc: `        // Android's bundled Ninja can still enforce MAX_PATH on Windows.
        // Let CMake hash long object paths instead of using Expo's 1024 limit.
        if (System.getProperty('os.name').startsWith('Windows')) {
            externalNativeBuild {
                cmake {
                    arguments '-DCMAKE_OBJECT_PATH_MAX=240'
                }
            }
        }`,
    }).contents;

    return modConfig;
  });
};
