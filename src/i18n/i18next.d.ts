import 'i18next';

import type zh from './translations/zh';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    returnNull: false;
    strictKeyChecks: true;
    resources: {
      translation: typeof zh;
    };
  }
}
