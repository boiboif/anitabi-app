<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';

import release from '../../../releases/latest.json';

const { lang } = useData();

const messages = {
  zh: {
    notes: release.releaseNotes,
    platforms: 'Android APK · iOS IPA',
    build: 'Build',
    localFirst: '本地数据优先',
    download: '下载 Android APK',
    ios: 'iOS 侧载说明',
    release: '查看发布说明',
  },
  ja: {
    notes: '最新版の Android APK と未署名 iOS IPA をダウンロードできます。',
    platforms: 'Android APK · iOS IPA',
    build: 'ビルド',
    localFirst: 'ローカルファースト',
    download: 'Android APK をダウンロード',
    ios: 'iOS サイドロードガイド',
    release: 'リリースノートを見る',
  },
  en: {
    notes: 'Download the latest Android APK or unsigned iOS IPA.',
    platforms: 'Android APK · iOS IPA',
    build: 'Build',
    localFirst: 'Local-first data',
    download: 'Download Android APK',
    ios: 'iOS sideloading guide',
    release: 'View release notes',
  },
} as const;

const locale = computed<keyof typeof messages>(() => {
  if (lang.value.startsWith('ja')) return 'ja';
  if (lang.value.startsWith('en')) return 'en';
  return 'zh';
});
const copy = computed(() => messages[locale.value]);
const localePrefix = computed(() => (locale.value === 'zh' ? '' : `/${locale.value}`));
const iosGuideUrl = computed(() => withBase(`${localePrefix.value}/guide/ios-sideloading`));
</script>

<template>
  <section class="download-panel" aria-labelledby="download-title">
    <div class="download-panel__glow" aria-hidden="true" />
    <div class="download-panel__content">
      <span class="eyebrow">LATEST RELEASE</span>
      <h2 id="download-title">Anitabi {{ release.displayVersion }}</h2>
      <p class="download-panel__notes">{{ copy.notes }}</p>
      <div class="download-panel__meta">
        <span>{{ copy.platforms }}</span>
        <span>{{ copy.build }} {{ release.buildNumber }}</span>
        <span>{{ copy.localFirst }}</span>
      </div>
      <div class="download-panel__actions">
        <a class="download-button download-button--primary" :href="release.apkUrl">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          {{ copy.download }}
        </a>
        <a class="download-button" :href="iosGuideUrl">{{ copy.ios }}</a>
        <a class="download-button" :href="release.releaseUrl">{{ copy.release }}</a>
      </div>
    </div>
    <div class="download-panel__mark" aria-hidden="true">
      <img :src="withBase('/app-icon.svg')" alt="" />
    </div>
  </section>
</template>
