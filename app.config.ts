import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'anitabi-app',
  slug: 'anitabi-app',
  version: '0.0.1',
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme: 'anitabiapp',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    infoPlist: {
      NSCameraUsageDescription: '用于拍摄巡礼点的实景对比照片',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: 'bbf.anitabiapp',
    permissions: ['android.permission.CAMERA'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-image',
    'expo-build-properties',
    'expo-status-bar',
    'expo-web-browser',
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
        photosPermission: '用于读取对比图相关照片',
        savePhotosPermission: '用于将生成的巡礼对比图保存到相册',
        granularPermissions: [],
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
    ['@rnmapbox/maps'],
    [
      'expo-location',
      {
        locationWhenInUsePermission: '显示当前位置在地图上',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
    eas: {
      projectId: process.env.EXPO_PROJECT_ID,
    },
  },
};

export default config;
