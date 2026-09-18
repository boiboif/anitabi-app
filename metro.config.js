const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
const getTransformOptions = config.transformer.getTransformOptions;

config.transformer.getTransformOptions = async (...args) => {
  const options = await getTransformOptions(...args);

  return {
    ...options,
    transform: {
      ...options.transform,
      inlineRequires: true,
    },
  };
};

module.exports = config;
