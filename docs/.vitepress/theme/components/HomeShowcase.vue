<script setup lang="ts">
import { withBase } from 'vitepress';

const screenshots = [
  {
    src: 'https://i0.hdslb.com/bfs/new_dyn/27f14bcd8532a28aa94b2c7e4befdfbf1519338.jpg',
    alt: 'Anitabi 地图上的动漫巡礼点',
    label: '探索地图',
  },
  {
    src: 'https://i0.hdslb.com/bfs/new_dyn/48470d9965423be5c3e99076708d203f1519338.jpg',
    alt: 'Anitabi 巡礼点详情页面',
    label: '发现取景地',
  },
  {
    src: 'https://i0.hdslb.com/bfs/new_dyn/2ded6575449c3c2cbd246598f68b90c51519338.jpg',
    alt: 'Anitabi 巡礼对比拍照页面',
    label: '留下对比照',
  },
];

const features = [
  {
    number: '01',
    icon: 'map',
    title: '把作品放回真实世界',
    detail: '海量动画取景点在地图上流畅呈现。按作品筛选、浏览附近坐标，让下一站自然浮现。',
  },
  {
    number: '02',
    icon: 'bookmark',
    title: '从心动坐标到巡礼计划',
    detail: '收藏想去的地点，把散落的坐标整理成计划。旅程还没出发，路线已经清晰可见。',
  },
  {
    number: '03',
    icon: 'camera',
    title: '让镜头与动画重合',
    detail: '现场打开对比拍摄，校准构图并生成专属对比图，把抵达的瞬间好好保存。',
  },
];
</script>

<template>
  <div class="home-showcase">
    <section class="journey-strip" aria-label="使用流程">
      <div class="journey-strip__line" aria-hidden="true" />
      <div class="journey-step">
        <span class="journey-step__dot" />
        <strong>发现</strong>
        <span>浏览动画取景地</span>
      </div>
      <div class="journey-step">
        <span class="journey-step__dot" />
        <strong>收藏</strong>
        <span>保存心动坐标</span>
      </div>
      <div class="journey-step">
        <span class="journey-step__dot" />
        <strong>出发</strong>
        <span>规划巡礼路线</span>
      </div>
      <div class="journey-step">
        <span class="journey-step__dot" />
        <strong>重现</strong>
        <span>拍下同款构图</span>
      </div>
    </section>

    <section class="product-story section-shell">
      <div class="section-intro">
        <span class="eyebrow">YOUR ANIME PILGRIMAGE</span>
        <h2>故事发生过的地方，<br />值得亲自抵达。</h2>
        <p>
          Anitabi 为圣地巡礼而生。它把探索、收藏、计划和拍摄放进一张地图，
          让“有一天想去”变成一段真正开始的旅程。
        </p>
      </div>

      <div class="phone-gallery" aria-label="Anitabi 应用界面预览">
        <div
          v-for="(screenshot, index) in screenshots"
          :key="screenshot.src"
          class="phone-shot"
          :class="`phone-shot--${index + 1}`"
        >
          <div class="phone-shot__speaker" aria-hidden="true" />
          <img :src="screenshot.src" :alt="screenshot.alt" loading="lazy" />
          <span>{{ screenshot.label }}</span>
        </div>
      </div>
    </section>

    <section class="feature-grid section-shell" aria-labelledby="features-title">
      <div class="section-heading">
        <span class="eyebrow">DESIGNED FOR THE JOURNEY</span>
        <h2 id="features-title">从地图上的一个点，到旅途中的一张照片</h2>
      </div>

      <article v-for="feature in features" :key="feature.number" class="feature-card">
        <span class="feature-card__number">{{ feature.number }}</span>
        <div class="feature-card__icon" aria-hidden="true">
          <svg v-if="feature.icon === 'map'" viewBox="0 0 24 24">
            <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z" />
            <path d="M8 4v13m8-10v13" />
          </svg>
          <svg v-else-if="feature.icon === 'bookmark'" viewBox="0 0 24 24">
            <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" />
          </svg>
          <svg v-else viewBox="0 0 24 24">
            <path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4v-11Z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </div>
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.detail }}</p>
      </article>
    </section>

    <section class="privacy-note section-shell">
      <div class="privacy-note__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      </div>
      <div>
        <span class="eyebrow">LOCAL FIRST</span>
        <h2>你的旅程，留在你的设备里</h2>
        <p>无需注册账号。收藏、计划、地图缓存和生成的对比图默认保存在本地。</p>
      </div>
      <a :href="withBase('/PRIVACY')">阅读隐私政策 <span aria-hidden="true">→</span></a>
    </section>

    <section class="final-cta section-shell">
      <div class="final-cta__pin" aria-hidden="true"><span /></div>
      <span class="eyebrow">NEXT STOP</span>
      <h2>下一段巡礼，从这里开始。</h2>
      <p>下载 Android 版本，或者在 GitHub 上一起把 Anitabi 做得更好。</p>
      <div class="final-cta__actions">
        <a class="download-button download-button--primary" :href="withBase('/download')">获取 Anitabi</a>
        <a class="download-button" href="https://github.com/boiboif/anitabi-app">查看源代码</a>
      </div>
    </section>
  </div>
</template>
