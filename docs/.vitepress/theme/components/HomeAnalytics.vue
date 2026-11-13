<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';
import { fetchGoatCounterStats } from './goatcounter-stats.mjs';

type WebsiteStats = {
  total: number | null;
  recent: number | null;
  today: number | null;
};

const { lang } = useData();
const stats = ref<WebsiteStats | null>(null);
const controller = new AbortController();
const locale = computed(() => (lang.value.startsWith('ja') ? 'ja' : lang.value.startsWith('en') ? 'en' : 'zh'));
const messages = {
  zh: { label: '网站浏览量', total: '总浏览量', recent: '近 30 天', today: '今日（UTC）' },
  ja: { label: 'サイトのページビュー', total: '総ページビュー', recent: '過去 30 日間', today: '今日（UTC）' },
  en: { label: 'Website page views', total: 'Total views', recent: 'Last 30 days', today: 'Today (UTC)' },
} as const;
const copy = computed(() => messages[locale.value]);
const numberFormat = computed(() => new Intl.NumberFormat(lang.value));

onMounted(async () => {
  try {
    stats.value = await fetchGoatCounterStats({ signal: controller.signal });
  } catch {
    // Statistics are optional; keep the rest of the homepage usable if unavailable.
  }
});

onUnmounted(() => controller.abort());
</script>

<template>
  <section v-if="stats" class="site-activity" :aria-label="copy.label">
    <dl class="site-activity__metrics">
      <div class="site-activity__metric">
        <dt>{{ copy.total }}</dt>
        <dd>{{ stats.total === null ? '—' : numberFormat.format(stats.total) }}</dd>
      </div>
      <div class="site-activity__metric">
        <dt>{{ copy.recent }}</dt>
        <dd>{{ stats.recent === null ? '—' : numberFormat.format(stats.recent) }}</dd>
      </div>
      <div class="site-activity__metric">
        <dt>{{ copy.today }}</dt>
        <dd>{{ stats.today === null ? '—' : numberFormat.format(stats.today) }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.site-activity {
  position: absolute;
  top: -24px;
  right: calc(100% - min(1120px, 100vw - 128px));
  color: var(--vp-c-text-2);
  text-align: right;
}
.site-activity__metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px 16px;
  margin: 0;
}
.site-activity__metric {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}
.site-activity__metric + .site-activity__metric::before {
  margin-right: 10px;
  color: var(--vp-c-divider);
  content: '·';
}
.site-activity dt {
  font-size: 12px;
  line-height: 1.5;
}
.site-activity dd {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 959px) {
  .site-activity {
    top: calc(100% + 8px);
    right: auto;
    left: 50%;
    width: max-content;
    max-width: 100%;
    transform: translateX(-50%);
  }
  .site-activity__metrics { justify-content: center; }
}
@media (max-width: 720px) {
  .site-activity__metrics { gap: 4px 12px; }
  .site-activity__metric + .site-activity__metric::before { display: none; }
}
@media (min-width: 721px) and (max-width: 959px) {
  .site-activity { left: 0; transform: none; text-align: left; }
  .site-activity__metrics { justify-content: flex-start; }
}
</style>
