<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';

const { lang } = useData();

const messages = {
  zh: {
    screenshots: [
      { src: '/screenshots/explore.webp', alt: 'Anitabi 地图上的动漫巡礼点', label: '探索地图' },
      { src: '/screenshots/detail.webp', alt: 'Anitabi 巡礼点详情页面', label: '发现取景地' },
      { src: '/screenshots/compare.webp', alt: 'Anitabi 巡礼对比拍照页面', label: '留下对比照' },
    ],
    storyEyebrow: 'YOUR ANIME PILGRIMAGE',
    storyTitle: '故事发生过的地方，|值得亲自抵达。',
    storyDetail:
      'Anitabi 为动画圣地巡礼而生。它把探索、收藏、计划和拍摄放进一张地图，让“有一天想去”变成一段真正开始的旅程。',
    galleryLabel: 'Anitabi 应用界面预览',
    journeyLabel: '使用流程',
    journey: [
      ['发现', '浏览动画取景地'],
      ['收藏', '保存心动坐标'],
      ['出发', '规划巡礼路线'],
      ['重现', '拍下同款构图'],
    ],
    featuresEyebrow: 'DESIGNED FOR THE JOURNEY',
    featuresTitle: '从地图上的一个点，到旅途中的一张照片',
    features: [
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
    ],
    privacyTitle: '你的旅程，留在你的设备里',
    privacyDetail: '无需注册账号。收藏、计划、地图缓存和生成的对比图默认保存在本地。',
    privacyLink: '阅读隐私政策',
    ctaTitle: '下一段巡礼，从这里开始。',
    ctaDetail: '下载 Android 版本，或者在 GitHub 上一起把 Anitabi 做得更好。',
    download: '获取 Anitabi',
    source: '查看源代码',
  },
  ja: {
    screenshots: [
      { src: '/screenshots/explore.webp', alt: 'Anitabi の地図に表示されたアニメ聖地スポット', label: '地図で探す' },
      { src: '/screenshots/detail.webp', alt: 'Anitabi の巡礼スポット詳細画面', label: '舞台を見つける' },
      { src: '/screenshots/compare.webp', alt: 'Anitabi の比較撮影画面', label: '比較写真を残す' },
    ],
    storyEyebrow: 'YOUR ANIME PILGRIMAGE',
    storyTitle: '物語が生まれた場所へ、|自分の足で会いに行こう。',
    storyDetail:
      'Anitabi はアニメ聖地巡礼のために生まれました。探索、お気に入り、計画、撮影を一つの地図にまとめ、「いつか行きたい」を本当の旅へ変えます。',
    galleryLabel: 'Anitabi アプリ画面のプレビュー',
    journeyLabel: '利用の流れ',
    journey: [
      ['発見', 'アニメの舞台を探す'],
      ['保存', '気になる場所を残す'],
      ['出発', '巡礼ルートを計画'],
      ['再現', '同じ構図で撮影'],
    ],
    featuresEyebrow: 'DESIGNED FOR THE JOURNEY',
    featuresTitle: '地図上の一つのスポットから、旅先の一枚へ',
    features: [
      {
        number: '01',
        icon: 'map',
        title: '作品の世界を現実の地図へ',
        detail:
          '多数のアニメ聖地スポットを地図上にスムーズに表示。作品で絞り込み、近くの場所を眺めながら次の目的地を見つけられます。',
      },
      {
        number: '02',
        icon: 'bookmark',
        title: '気になる場所から巡礼プランへ',
        detail: '行きたい場所を保存し、点在するスポットを一つのプランに整理。出発前から旅のルートが見えてきます。',
      },
      {
        number: '03',
        icon: 'camera',
        title: 'カメラとアニメの場面を重ねる',
        detail: '現地で比較撮影を開き、構図を合わせて自分だけの比較画像を作成。たどり着いた瞬間を大切に残せます。',
      },
    ],
    privacyTitle: 'あなたの旅は、あなたの端末に',
    privacyDetail:
      'アカウント登録は不要です。お気に入り、プラン、地図キャッシュ、生成した比較画像はデフォルトで端末内に保存されます。',
    privacyLink: 'プライバシーポリシーを読む',
    ctaTitle: '次の聖地巡礼を、ここから。',
    ctaDetail: 'Android 版をダウンロードするか、GitHub で Anitabi の開発に参加してください。',
    download: 'Anitabi を入手',
    source: 'ソースコードを見る',
  },
  en: {
    screenshots: [
      { src: '/screenshots/explore.webp', alt: 'Anime pilgrimage spots on the Anitabi map', label: 'Explore the map' },
      { src: '/screenshots/detail.webp', alt: 'Anitabi pilgrimage spot details', label: 'Discover locations' },
      { src: '/screenshots/compare.webp', alt: 'Anitabi comparison photography screen', label: 'Capture a comparison' },
    ],
    storyEyebrow: 'YOUR ANIME PILGRIMAGE',
    storyTitle: 'Places where stories happened|are worth reaching yourself.',
    storyDetail:
      'Anitabi is made for anime pilgrimages. It brings discovery, favorites, planning, and photography into one map, turning “someday” into a journey that has truly begun.',
    galleryLabel: 'Anitabi app interface preview',
    journeyLabel: 'How it works',
    journey: [
      ['Discover', 'Browse anime locations'],
      ['Save', 'Keep inspiring places'],
      ['Go', 'Plan your pilgrimage'],
      ['Recreate', 'Capture the same view'],
    ],
    featuresEyebrow: 'DESIGNED FOR THE JOURNEY',
    featuresTitle: 'From a point on the map to a photo from your journey',
    features: [
      {
        number: '01',
        icon: 'map',
        title: 'Put every story back into the real world',
        detail:
          'Explore a large collection of anime locations on a smooth map. Filter by title, browse nearby spots, and let your next destination emerge naturally.',
      },
      {
        number: '02',
        icon: 'bookmark',
        title: 'Turn inspiring spots into a pilgrimage plan',
        detail:
          'Save places you want to visit and organize scattered locations into a plan. Your route becomes clear before the journey even starts.',
      },
      {
        number: '03',
        icon: 'camera',
        title: 'Align your camera with the anime scene',
        detail:
          'Open comparison photography on site, match the composition, and create a personal comparison image that preserves the moment you arrived.',
      },
    ],
    privacyTitle: 'Your journey stays on your device',
    privacyDetail:
      'No account is required. Favorites, plans, map caches, and generated comparison images are stored locally by default.',
    privacyLink: 'Read the Privacy Policy',
    ctaTitle: 'Your next pilgrimage starts here.',
    ctaDetail: 'Download the Android version, or help make Anitabi better on GitHub.',
    download: 'Get Anitabi',
    source: 'View source code',
  },
} as const;

const locale = computed<keyof typeof messages>(() => {
  if (lang.value.startsWith('ja')) return 'ja';
  if (lang.value.startsWith('en')) return 'en';
  return 'zh';
});
const copy = computed(() => messages[locale.value]);
const localePrefix = computed(() => (locale.value === 'zh' ? '' : `/${locale.value}`));
const localizedPath = (path: string) => withBase(`${localePrefix.value}${path}`);
</script>

<template>
  <div class="home-showcase">
    <section class="product-story section-shell">
      <div class="section-intro">
        <span class="eyebrow">{{ copy.storyEyebrow }}</span>
        <h2>{{ copy.storyTitle.split('|')[0] }}<br />{{ copy.storyTitle.split('|')[1] }}</h2>
        <p>{{ copy.storyDetail }}</p>
      </div>

      <div class="phone-gallery" :aria-label="copy.galleryLabel">
        <div
          v-for="(screenshot, index) in copy.screenshots"
          :key="screenshot.src"
          class="phone-shot"
          :class="`phone-shot--${index + 1}`"
        >
          <div class="phone-shot__speaker" aria-hidden="true" />
          <img :src="withBase(screenshot.src)" :alt="screenshot.alt" loading="lazy" />
          <span>{{ screenshot.label }}</span>
        </div>
      </div>
    </section>

    <section class="journey-strip" :aria-label="copy.journeyLabel">
      <div class="journey-strip__line" aria-hidden="true" />
      <div v-for="step in copy.journey" :key="step[0]" class="journey-step">
        <span class="journey-step__dot" />
        <strong>{{ step[0] }}</strong>
        <span>{{ step[1] }}</span>
      </div>
    </section>

    <section class="feature-grid section-shell" aria-labelledby="features-title">
      <div class="section-heading">
        <span class="eyebrow">{{ copy.featuresEyebrow }}</span>
        <h2 id="features-title">{{ copy.featuresTitle }}</h2>
      </div>

      <article v-for="feature in copy.features" :key="feature.number" class="feature-card">
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
        <h2>{{ copy.privacyTitle }}</h2>
        <p>{{ copy.privacyDetail }}</p>
      </div>
      <a :href="localizedPath('/PRIVACY')">{{ copy.privacyLink }} <span aria-hidden="true">→</span></a>
    </section>

    <section class="final-cta section-shell">
      <div class="final-cta__copy">
        <span class="eyebrow">NEXT STOP</span>
        <h2>{{ copy.ctaTitle }}</h2>
        <p>{{ copy.ctaDetail }}</p>
      </div>
      <div class="final-cta__actions">
        <a class="download-button download-button--primary" :href="localizedPath('/download')">{{ copy.download }}</a>
        <a class="download-button" href="https://github.com/boiboif/anitabi-app">{{ copy.source }}</a>
      </div>
    </section>
  </div>
</template>
