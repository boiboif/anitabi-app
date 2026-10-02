module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [],
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};
