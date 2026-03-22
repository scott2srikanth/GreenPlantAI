module.exports = () => {
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  const plugins = [
    'expo-router',
    'expo-secure-store',
    [
      'expo-camera',
      {
        cameraPermission: 'Scan plants to identify species',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Select plant photos to identify',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-image.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#2F5233',
      },
    ],
  ];

  if (iosUrlScheme) {
    plugins.push([
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme,
      },
    ]);
  }

  return {
    name: 'GreenPlantAI',
    slug: 'frontend',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'frontend',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: 'Scan plants to identify species',
        NSPhotoLibraryUsageDescription: 'Select plant photos to identify',
      },
    },
    android: {
      package: 'com.greenplantai.app',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#2F5233',
      },
      edgeToEdgeEnabled: true,
      permissions: [
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'RECEIVE_BOOT_COMPLETED',
        'VIBRATE',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins,
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: '1d3c82fd-b1e7-463f-97d4-ca0d4bf506a3',
      },
      googleSignInConfigured: Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    },
  };
};
