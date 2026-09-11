import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import DownloadPanel from './components/DownloadPanel.vue';
import HomeShowcase from './components/HomeShowcase.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DownloadPanel', DownloadPanel);
    app.component('HomeShowcase', HomeShowcase);
  },
} satisfies Theme;
