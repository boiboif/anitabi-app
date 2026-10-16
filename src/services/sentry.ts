import * as Sentry from '@sentry/react-native';

// TODO: Restore automatic navigation timing once Sentry supports SDK 58's router.
// Its current Expo Router integration still uses the removed router-store and __unsafe_action__.
// https://docs.expo.dev/router/migrate/sdk-57-to-58/

Sentry.init({
  dsn: 'https://625bd5804e426478651c4ad998989ead@o4511897742344192.ingest.us.sentry.io/4511897744113664',
  tracesSampleRate: 0.2,
  enableNativeCrashHandling: true,
  sendDefaultPii: false,
});

export { Sentry };
