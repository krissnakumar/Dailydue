module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      'nativewind/babel',
      // Strip console.log/warn/error in production builds for security & performance
      process.env.NODE_ENV === 'production' && [
        'transform-remove-console',
        { exclude: ['error', 'warn'] },
      ],
      'react-native-reanimated/plugin',
    ].filter(Boolean),
  };
};
