<script setup lang="ts">
import release from '../../../releases/latest.json';

const formattedSize = 'Android APK';
</script>

<template>
  <section class="download-panel" aria-labelledby="download-title">
    <div class="download-panel__glow" aria-hidden="true" />
    <div class="download-panel__content">
      <span class="eyebrow">LATEST RELEASE</span>
      <h2 id="download-title">Anitabi {{ release.displayVersion }}</h2>
      <p class="download-panel__notes">{{ release.releaseNotes }}</p>
      <div class="download-panel__meta">
        <span>{{ formattedSize }}</span>
        <span>Build {{ release.buildNumber }}</span>
        <span>本地数据优先</span>
      </div>
      <div class="download-panel__actions">
        <a class="download-button download-button--primary" :href="release.apkUrl">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          下载 Android APK
        </a>
        <a class="download-button" :href="release.releaseUrl">查看发布说明</a>
      </div>
    </div>
    <div class="download-panel__mark" aria-hidden="true">
      <img src="/app-icon.svg" alt="" />
    </div>
  </section>
</template>
