module.exports = function (api) {
  api.cache.using(() => process.env.APP_VARIANT);
  return {
    presets: ['babel-preset-expo'],
    plugins: [],
    env: {
      production: {
        plugins: process.env.APP_VARIANT === 'test' ? [] : ['transform-remove-console'],
      },
    },
  };
};
