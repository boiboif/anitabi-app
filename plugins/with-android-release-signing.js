const { withAppBuildGradle } = require('@expo/config-plugins');

const SIGNING_MARKER = 'anitabi release signing';

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') return modConfig;
    if (modConfig.modResults.contents.includes(SIGNING_MARKER)) return modConfig;

    const signingVariables = `
// ${SIGNING_MARKER}
def releaseStoreFile = System.getenv('ANDROID_KEYSTORE_PATH')
def releaseStorePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
def releaseKeyAlias = System.getenv('ANDROID_KEY_ALIAS')
def releaseKeyPassword = System.getenv('ANDROID_KEY_PASSWORD')
`;

    const releaseSigningConfig = `
        release {
            if (releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword) {
                storeFile file(releaseStoreFile)
                storePassword releaseStorePassword
                keyAlias releaseKeyAlias
                keyPassword releaseKeyPassword
            }
        }
`;

    modConfig.modResults.contents = modConfig.modResults.contents
      .replace('android {', `${signingVariables}\nandroid {`)
      .replace(/(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\n\s*\})/, `$1\n${releaseSigningConfig}`)
      .replace(
        /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?\bsigningConfig\s+)signingConfigs\.debug/,
        '$1releaseStoreFile ? signingConfigs.release : signingConfigs.debug',
      );

    return modConfig;
  });
};
