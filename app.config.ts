import { config as dotenvConfig } from 'dotenv';

import type { ExpoConfig } from 'expo/config';
dotenvConfig({ path: '.env.local' });

const config: ExpoConfig = {
  name: 'Anitabi',
  slug: 'anitabi-app',
  version: '0.0.1',
  orientation: 'default',
  icon: './assets/images/anitabi-icon.png',
  scheme: 'anitabiapp',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/images/anitabi-icon.png',
    infoPlist: {
      NSCameraUsageDescription: '用于拍摄巡礼点的实景对比照片',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#8DCEF1',
      foregroundImage: './assets/images/anitabi-icon-adaptive-foreground.png',
    },
    predictiveBackGestureEnabled: false,
    package: 'bbf.anitabiapp',
    permissions: ['android.permission.CAMERA'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/anitabi-icon.png',
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
        backgroundColor: '#FFFFFF',
        image: './assets/images/anitabi-icon-adaptive-foreground.png',
        imageWidth: 180,
        dark: {
          backgroundColor: '#000000',
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
    [
      'expo-screen-orientation',
      {
        initialOrientation: 'DEFAULT',
      },
    ],
    [
      'expo-sensors',
      {
        motionPermission: 'Allow $(PRODUCT_NAME) to access your device motion.',
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
