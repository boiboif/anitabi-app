<script setup lang="ts">
import { computed, ref } from 'vue';
import { useData, withBase } from 'vitepress';

import release from '../../../releases/download.json';

const { lang } = useData();

const messages = {
  zh: {
    description: '下载最新版 Android APK 或 iOS 未签名 IPA。',
    platforms: 'Android APK · iOS IPA',
    build: 'Build',
    localFirst: '本地数据优先',
    download: '下载 Android APK',
    ios: 'iOS 侧载说明',
    updates: '本次更新',
    expand: '展开全部更新',
    collapse: '收起',
    notesLanguage: '',
    release: '在 GitHub 查看完整发布说明',
  },
  ja: {
    description: '最新版の Android APK と未署名 iOS IPA をダウンロードできます。',
    platforms: 'Android APK · iOS IPA',
    build: 'ビルド',
    localFirst: 'ローカルファースト',
    download: 'Android APK をダウンロード',
    ios: 'iOS サイドロードガイド',
    updates: '今回の更新',
    expand: '更新内容をすべて見る',
    collapse: '閉じる',
    notesLanguage: '更新内容は中国語で記載しています。',
    release: 'GitHub でリリースノート全文を見る',
  },
  en: {
    description: 'Download the latest Android APK or unsigned iOS IPA.',
    platforms: 'Android APK · iOS IPA',
    build: 'Build',
    localFirst: 'Local-first data',
    download: 'Download Android APK',
    ios: 'iOS sideloading guide',
    updates: "What's new",
    expand: 'Show all updates',
    collapse: 'Collapse',
    notesLanguage: 'Update notes are available in Chinese.',
    release: 'View full release notes on GitHub',
  },
} as const;

const releaseNotes =
  release.releaseNotesHistory
    ?.find(
      (entry) =>
        entry.version === release.version &&
        entry.displayVersion === release.displayVersion &&
        (entry.buildNumber === undefined || entry.buildNumber === release.buildNumber),
    )
    ?.notes.trim() || release.releaseNotes.trim();
const noteSections = releaseNotes.split(/\r?\n\s*\r?\n/).map((paragraph) => {
  const [firstLine, ...body] = paragraph.trim().split(/\r?\n/);
  const title = /^【(.+)】$/.exec(firstLine)?.[1];
  return { title, body: title ? body.join('\n') : paragraph.trim() };
});
const previewSections = noteSections.slice(0, 2).map((section) => {
  const characters = Array.from(section.body);
  return {
    ...section,
    body: characters.length > 80 ? `${characters.slice(0, 80).join('').trimEnd()}…` : section.body,
  };
});
const hasMoreNotes =
  noteSections.length > previewSections.length ||
  previewSections.some((section, index) => section.body !== noteSections[index].body);
const expanded = ref(false);
const visibleSections = computed(() => (expanded.value ? noteSections : previewSections));

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
      <p class="download-panel__description">{{ copy.description }}</p>
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
      </div>
    </div>
    <div class="download-panel__mark" aria-hidden="true">
      <img :src="withBase('/app-icon.svg')" alt="" />
    </div>
  </section>
  <section class="download-updates" aria-labelledby="download-updates-title">
    <div class="download-updates__header">
      <h2 id="download-updates-title">
        <svg class="download-updates__rocket" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <path d="m12 15-3-3c1-5 5.5-9 12-9 0 6.5-4 11-9 12Z" />
          <circle cx="16" cy="8" r="1.5" />
          <path d="M9 12H4l3-5 6-1m-1 9v5l5-3 1-6M7 16c-2 0-3 2-3 4 2 0 4-1 4-3" />
        </svg>
        {{ copy.updates }}
      </h2>
      <span class="download-updates__version">v{{ release.displayVersion }}</span>
    </div>
    <p v-if="copy.notesLanguage" class="download-updates__language">{{ copy.notesLanguage }}</p>
    <ul id="download-update-notes" class="download-updates__notes" role="list" lang="zh-CN">
      <li v-for="(section, index) in visibleSections" :key="index">
        <svg class="download-updates__item-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </svg>
        <div>
          <strong v-if="section.title">{{ section.title }}</strong>
          <p v-if="section.body">{{ section.body }}</p>
        </div>
      </li>
    </ul>
    <div class="download-updates__footer">
      <button
        v-if="hasMoreNotes"
        type="button"
        class="download-updates__toggle"
        :class="{ 'is-expanded': expanded }"
        :aria-expanded="expanded"
        aria-controls="download-update-notes"
        @click="expanded = !expanded"
      >
        {{ expanded ? copy.collapse : copy.expand }}
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <a class="download-updates__release" :href="release.releaseUrl">{{ copy.release }} ↗</a>
    </div>
  </section>
</template>
