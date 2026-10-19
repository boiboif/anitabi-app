import type { ExpoConfig } from 'expo/config';
import appPackage from './package.json';

const appVersion = '0.7.0';
const openSourceLicensePrimaryPackages = Object.keys(appPackage.dependencies).sort();
const nativeAppVersion = process.env.APP_NATIVE_VERSION || appVersion;
const updateChannel = process.env.EXPO_UPDATE_CHANNEL || 'development';
const appVariant = process.env.APP_VARIANT || 'production';
const isDevelopmentBuild = appVariant === 'development';
const isTestBuild = appVariant === 'test';
const appName = isDevelopmentBuild ? 'Anitabi Dev' : isTestBuild ? 'Anitabi Test' : 'Anitabi';
const appIdentifier = isDevelopmentBuild
  ? 'bbf.anitabiapp.dev'
  : isTestBuild
    ? 'bbf.anitabiapp.test'
    : 'bbf.anitabiapp';
const appScheme = isDevelopmentBuild ? 'anitabiapp-dev' : isTestBuild ? 'anitabiapp-test' : 'anitabiapp';
const appUpdatesEnabled = updateChannel === 'preview' || updateChannel === 'production';
const binaryUpdateManifestName = updateChannel === 'preview' ? 'preview.json' : 'latest.json';

const config: ExpoConfig = {
  name: appName,
  slug: 'anitabi-app',
  version: nativeAppVersion,
  platforms: ['ios', 'android'],
  // SDK 58 native modules cannot load updates built for the SDK 57 runtime.
  runtimeVersion: `${appVersion}-sdk58`,
  updates: {
    enabled: appUpdatesEnabled,
    url: `https://u.expo.dev/${process.env.EXPO_PROJECT_ID}`,
    requestHeaders: {
      'expo-channel-name': updateChannel,
    },
    checkAutomatically: 'NEVER',
    fallbackToCacheTimeout: 0,
  },
  orientation: 'default',
  icon: './assets/images/anitabi-icon.png',
  scheme: appScheme,
  userInterfaceStyle: 'automatic',
  locales: {
    'zh-Hans': './locales/zh-Hans.json',
    ja: './locales/ja.json',
    en: './locales/en.json',
  },
  ios: {
    bundleIdentifier: appIdentifier,
    icon: './assets/images/anitabi-icon.png',
    infoPlist: {
      NSCameraUsageDescription: '用于拍摄巡礼点的实景对比照片和扫描巡礼计划二维码',
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#8DCEF1',
      backgroundImage: './assets/images/anitabi-icon-adaptive-background.png',
      foregroundImage: './assets/images/anitabi-icon-adaptive-foreground.png',
      monochromeImage: './assets/images/anitabi-icon-adaptive-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: appIdentifier,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    permissions: ['android.permission.CAMERA', 'android.permission.REQUEST_INSTALL_PACKAGES'],
  },
  plugins: [
    'expo-router',
    [
      'expo-localization',
      {
        supportedLocales: ['zh-Hans', 'ja', 'en'],
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: '用于拍摄巡礼点的实景对比照片和扫描巡礼计划二维码',
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    'expo-sharing',
    'expo-font',
    'expo-image',
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          useLegacyPackaging: true,
        },
      },
    ],
    'expo-status-bar',
    'expo-web-browser',
    [
      'react-native-legal',
      {
        devDepsMode: 'none',
        includeOptionalDeps: false,
        transitiveDepsMode: 'all',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: 'boiboif',
        project: 'react-native',
        url: 'https://sentry.io/',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: '用于选择动漫巡礼点的参考图片',
        microphonePermission: false,
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: '用于管理 Anitabi 相册中的巡礼对比图',
        savePhotosPermission: '用于将预览图片和巡礼对比图保存到相册',
        granularPermissions: [],
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/anitabi-splash-icon.png',
        imageWidth: 100,
        resizeMode: 'contain',
        dark: {
          backgroundColor: '#000000',
          image: './assets/images/anitabi-splash-icon.png',
        },
      },
    ],
    ['@rnmapbox/maps'],
    './plugins/with-android-release-signing',
    './plugins/with-android-cmake-path-limit',
    [
      'expo-location',
      {
        locationWhenInUsePermission: '显示当前位置，并计算巡礼计划中点位的距离',
      },
    ],
    [
      'expo-screen-orientation',
      {
        initialOrientation: 'DEFAULT',
      },
    ],
    [
      'expo-sensors',
      {
        motionPermission: '允许 $(PRODUCT_NAME) 访问设备运动与方向数据',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
    openSourceLicensePrimaryPackages,
    appVariant,
    updateChannel,
    appUpdatesEnabled,
    binaryUpdateManifestUrl: appUpdatesEnabled
      ? `https://raw.githubusercontent.com/boiboif/anitabi-app/main/docs/releases/${binaryUpdateManifestName}`
      : undefined,
    eas: {
      projectId: process.env.EXPO_PROJECT_ID,
    },
  },
};

export default config;
