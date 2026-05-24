// Dynamic Expo config to support native plugins that require env-provided options.
// This project previously used `app.json`; Expo will prefer `app.config.js` when present.

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  // Keep the existing `scheme` (used by Expo AuthSession redirect URIs).
  const scheme = config.scheme || 'controlefiado';

  // Required by `@react-native-google-signin/google-signin` config plugin when not using Firebase files.
  // Must start with "com.googleusercontent.apps.".
  const googleIosUrlScheme =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.REPLACE_ME';

  return {
    ...config,
    scheme,
    plugins: [
      ...(config.plugins || []),
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: googleIosUrlScheme,
        },
      ],
    ],
  };
};

