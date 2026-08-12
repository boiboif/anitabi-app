import * as Sentry from '@sentry/react-native';

export const sentryNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: 'https://625bd5804e426478651c4ad998989ead@o4511897742344192.ingest.us.sentry.io/4511897744113664',
  integrations: [sentryNavigationIntegration],
  tracesSampleRate: 0.2,
  enableNativeCrashHandling: true,
  sendDefaultPii: false,
});

export { Sentry };
