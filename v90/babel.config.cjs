// Expo/Metro derleyici yapılandırması.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]],
    plugins: [
      // react-native-reanimated eklentisi listenin SONUNCUSU olmak zorundadır.
      'react-native-reanimated/plugin',
    ],
  };
};
