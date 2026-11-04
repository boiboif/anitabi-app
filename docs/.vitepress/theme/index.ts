import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import DownloadPanel from './components/DownloadPanel.vue';
import HomeShowcase from './components/HomeShowcase.vue';
import HomeAnalytics from './components/HomeAnalytics.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-info-before': () => h(HomeAnalytics) }),
  enhanceApp({ app }) {
    app.component('DownloadPanel', DownloadPanel);
    app.component('HomeShowcase', HomeShowcase);
  },
} satisfies Theme;
