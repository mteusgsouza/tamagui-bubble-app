import type { ExpoConfig } from 'expo/config'

const appName = 'Bubble'
const appId = appName.toLowerCase()

const { APP_VARIANT = 'development' } = process.env

if (
  APP_VARIANT !== 'production' &&
  APP_VARIANT !== 'preview' &&
  APP_VARIANT !== 'development'
) {
  throw new Error(`Invalid APP_VARIANT: ${APP_VARIANT}`)
}

const IS_DEV = APP_VARIANT === 'development'

const getBundleId = () => {
  // ⚠️ Era `dev.tamagui.takeout` — o identificador do template. Publicar com ele é
  // impossível: o pacote pertence à Tamagui. Se você registrar um domínio próprio,
  // troque para o reverso dele (ex.: `br.com.seudominio.bubble`).
  if (APP_VARIANT === 'development') {
    return 'com.mteusgsouza.bubble.dev'
  } else if (APP_VARIANT === 'preview') {
    return 'com.mteusgsouza.bubble.preview'
  }
  return 'com.mteusgsouza.bubble'
}

const getAppIcon = () => {
  return './assets/icon.png'
}

/**
 * A versão sai do `package.json`.
 *
 * ⚠️ **`require` de JSON, e nunca `import` de outro módulo TS.** O carregador de config
 * do Expo transpila este arquivo e resolve os `require` em CJS puro: importar
 * `./src/constants/app` quebra o `expo config` com "Cannot find module" — e com ele todo
 * build nativo. Já aconteceu; o Bun resolvia o import e escondia o problema.
 *
 * `src/constants/app.ts` repete o número para a tela de Perfil, e
 * `src/test/unit/app-version.test.ts` falha se os dois divergirem.
 */
const { version } = require('./package.json') as { version: string }

export default {
  expo: {
    name: `${appName}${(() => {
      switch (APP_VARIANT) {
        case 'development':
          return ' (Dev)'
        case 'preview':
          return ' (Preview)'
        case 'production':
          return ''
      }
    })()}`,
    // `slug` e `owner` precisam bater com o projeto no EAS, senão o build é recusado.
    slug: 'bubble-app',
    owner: 'mteusg',
    scheme: appId,
    version,
    runtimeVersion: version, // must be set to use hot-updater "appVersion" update strategy
    platforms: ['ios', 'android', 'web'],
    userInterfaceStyle: 'automatic',
    icon: getAppIcon(),
    ios: {
      supportsTablet: false,
      bundleIdentifier: getBundleId(),
      icon: getAppIcon(),
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSCameraUsageDescription:
          '$(PRODUCT_NAME) uses the camera to take profile photos and capture images for AI-powered image creation features.',
        NSMicrophoneUsageDescription: 'Allow $(PRODUCT_NAME) to access your microphone',
        NSPhotoLibraryUsageDescription:
          '$(PRODUCT_NAME) accesses your photo library to let you select images for profile pictures and choose photos as input for AI image generation.',
        NSPhotoLibraryAddUsageDescription:
          '$(PRODUCT_NAME) saves generated AI artwork and edited profile photos to your photo library so you can keep and share your creations.',
        NSAppleMusicUsageDescription:
          'Allow $(PRODUCT_NAME) to access your music library',
        UIBackgroundModes: ['fetch', 'remote-notification'],
      },
    },
    android: {
      package: getBundleId().replaceAll('-', '_'),
      icon: getAppIcon(),
      adaptiveIcon: {
        // o PNG tem só as bolhas, transparente; o âmbar entra por aqui. O Android
        // recorta o primeiro plano, então a marca vive no centro (~55%) da imagem.
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#e5a33a',
      },
      permissions: ['android.permission.RECORD_AUDIO'],
    },
    primaryColor: '#e5a33a',
    plugins: [
      'vxrn/expo-plugin',
      'expo-web-browser',
      'expo-font',
      'react-native-bottom-tabs',
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '17.0',
          },
        },
      ],
      [
        'react-native-permissions',
        {
          // Add setup_permissions to your Podfile (see iOS setup - steps 1, 2 and 3)
          iosPermissions: [
            // 'AppTrackingTransparency',
            // 'Bluetooth',
            // 'Calendars',
            // 'CalendarsWriteOnly',
            'Camera',
            // 'Contacts',
            'FaceID',
            // 'LocationAccuracy',
            // 'LocationAlways',
            // 'LocationWhenInUse',
            'MediaLibrary',
            'Microphone',
            // 'Motion',
            'Notifications',
            'PhotoLibrary',
            // 'PhotoLibraryAddOnly',
            // 'Reminders',
            // 'Siri',
            // 'SpeechRecognition',
            // 'StoreKit',
          ],
        },
      ],
      // Custom fonts
      // [
      //   'expo-font',
      //   {
      //     fonts: [
      //       './assets/fonts/Inter-Black.ttf',
      //       './assets/fonts/Inter-Bold.ttf',
      //       './assets/fonts/Inter-Light.ttf',
      //       './assets/fonts/Inter-Medium.ttf',
      //       './assets/fonts/Inter-Regular.ttf',
      //       './assets/fonts/Inter-SemiBold.ttf',
      //     ],
      //   },
      // ],
      [
        'expo-splash-screen',
        {
          // fundo escuro para a marca âmbar aparecer, como no app
          backgroundColor: '#141414',
          image: './assets/logo.png',
          imageWidth: 96,
          imageHeight: 96,
        },
      ],
      // hot-updater for OTA updates - uncomment and configure if needed
      // [
      //   '@hot-updater/react-native',
      //   {
      //     channel: APP_VARIANT,
      //   },
      // ],
    ],
    extra: {
      eas: {
        // projeto do EAS deste app. O anterior era o da Tamagui, herdado do template.
        projectId: 'ba0451c6-fee0-496e-866d-ff29aa72ab66',
      },
    },
  } satisfies ExpoConfig,
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
}
