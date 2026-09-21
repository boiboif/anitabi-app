import { defineConfig, type DefaultTheme } from 'vitepress';

const repository = 'https://github.com/boiboif/anitabi-app';
const siteBase = process.env.DOCS_BASE ?? '/';

const zhNav: DefaultTheme.NavItem[] = [
  { text: '首页', link: '/' },
  { text: '功能', link: '/features' },
  { text: '使用指南', link: '/guide/getting-started' },
  { text: '下载', link: '/download' },
  {
    text: '更多',
    items: [
      { text: '隐私政策', link: '/PRIVACY' },
      { text: '数据接口', link: '/anitabi-api' },
      { text: '参与贡献', link: `${repository}/blob/main/CONTRIBUTING.md` },
    ],
  },
];

const jaNav: DefaultTheme.NavItem[] = [
  { text: 'ホーム', link: '/ja/' },
  { text: '機能', link: '/ja/features' },
  { text: '使い方', link: '/ja/guide/getting-started' },
  { text: 'ダウンロード', link: '/ja/download' },
  {
    text: 'その他',
    items: [
      { text: 'プライバシーポリシー', link: '/ja/PRIVACY' },
      { text: 'データ API', link: '/ja/anitabi-api' },
      { text: 'コントリビューション', link: `${repository}/blob/main/CONTRIBUTING.md` },
    ],
  },
];

const enNav: DefaultTheme.NavItem[] = [
  { text: 'Home', link: '/en/' },
  { text: 'Features', link: '/en/features' },
  { text: 'Guide', link: '/en/guide/getting-started' },
  { text: 'Download', link: '/en/download' },
  {
    text: 'More',
    items: [
      { text: 'Privacy Policy', link: '/en/PRIVACY' },
      { text: 'Data API', link: '/en/anitabi-api' },
      { text: 'Contributing', link: `${repository}/blob/main/CONTRIBUTING.md` },
    ],
  },
];

const zhSidebar: DefaultTheme.Sidebar = [
  {
    text: '认识 Anitabi',
    items: [
      { text: '产品首页', link: '/' },
      { text: '核心功能', link: '/features' },
      { text: '下载应用', link: '/download' },
    ],
  },
  {
    text: '使用指南',
    items: [
      { text: '快速开始', link: '/guide/getting-started' },
      { text: 'iOS 侧载安装', link: '/guide/ios-sideloading' },
    ],
  },
  {
    text: '项目文档',
    items: [
      { text: '隐私政策', link: '/PRIVACY' },
      { text: 'Anitabi API', link: '/anitabi-api' },
    ],
  },
];

const jaSidebar: DefaultTheme.Sidebar = [
  {
    text: 'Anitabi について',
    items: [
      { text: 'ホーム', link: '/ja/' },
      { text: '主な機能', link: '/ja/features' },
      { text: 'アプリをダウンロード', link: '/ja/download' },
    ],
  },
  {
    text: '使い方',
    items: [
      { text: 'はじめに', link: '/ja/guide/getting-started' },
      { text: 'iOS サイドロード', link: '/ja/guide/ios-sideloading' },
    ],
  },
  {
    text: 'プロジェクト文書',
    items: [
      { text: 'プライバシーポリシー', link: '/ja/PRIVACY' },
      { text: 'Anitabi API', link: '/ja/anitabi-api' },
    ],
  },
];

const enSidebar: DefaultTheme.Sidebar = [
  {
    text: 'About Anitabi',
    items: [
      { text: 'Home', link: '/en/' },
      { text: 'Core Features', link: '/en/features' },
      { text: 'Download', link: '/en/download' },
    ],
  },
  {
    text: 'User Guide',
    items: [
      { text: 'Getting Started', link: '/en/guide/getting-started' },
      { text: 'iOS Sideloading', link: '/en/guide/ios-sideloading' },
    ],
  },
  {
    text: 'Project Docs',
    items: [
      { text: 'Privacy Policy', link: '/en/PRIVACY' },
      { text: 'Anitabi API', link: '/en/anitabi-api' },
    ],
  },
];

export default defineConfig({
  base: siteBase,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://boiboif.github.io/anitabi-app/',
  },
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Anitabi',
      titleTemplate: ':title · 动画巡礼地图',
      description: '把动画中的风景，变成下一段旅程。Anitabi 是一款开源的动画圣地巡礼地图应用。',
      head: [
        ['meta', { property: 'og:title', content: 'Anitabi · 动画巡礼地图' }],
        [
          'meta',
          { property: 'og:description', content: '在地图上发现动画取景地，收藏心动坐标，规划属于你的巡礼路线。' },
        ],
        ['meta', { property: 'og:url', content: 'https://boiboif.github.io/anitabi-app/' }],
      ],
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        editLink: { pattern: `${repository}/edit/main/docs/:path`, text: '在 GitHub 上编辑此页' },
        outline: { label: '本页内容', level: [2, 3] },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        returnToTopLabel: '返回顶部',
        sidebarMenuLabel: '文档菜单',
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
        footer: { message: '开源、非官方的动画巡礼 App', copyright: 'Copyright © 2026 boiboif · GPL-3.0' },
      },
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      link: '/ja/',
      title: 'Anitabi',
      titleTemplate: ':title · アニメ聖地巡礼マップ',
      description: 'アニメの風景を、次の旅へ。Anitabi はオープンソースのアニメ聖地巡礼マップアプリです。',
      head: [
        ['meta', { property: 'og:title', content: 'Anitabi · アニメ聖地巡礼マップ' }],
        [
          'meta',
          {
            property: 'og:description',
            content: '地図でアニメの舞台を見つけ、お気に入りを保存し、自分だけの巡礼ルートを計画できます。',
          },
        ],
        ['meta', { property: 'og:url', content: 'https://boiboif.github.io/anitabi-app/ja/' }],
      ],
      themeConfig: {
        nav: jaNav,
        sidebar: jaSidebar,
        editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'GitHub でこのページを編集' },
        outline: { label: 'このページの内容', level: [2, 3] },
        docFooter: { prev: '前のページ', next: '次のページ' },
        lastUpdated: { text: '最終更新' },
        returnToTopLabel: 'ページ上部へ戻る',
        sidebarMenuLabel: 'ドキュメントメニュー',
        darkModeSwitchLabel: '外観',
        lightModeSwitchTitle: 'ライトモードに切り替え',
        darkModeSwitchTitle: 'ダークモードに切り替え',
        langMenuLabel: '言語を変更',
        footer: {
          message: 'オープンソースの非公式アニメ聖地巡礼アプリ',
          copyright: 'Copyright © 2026 boiboif · GPL-3.0',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'Anitabi',
      titleTemplate: ':title · Anime Pilgrimage Map',
      description: 'Turn anime scenery into your next journey. Anitabi is an open-source anime pilgrimage map app.',
      head: [
        ['meta', { property: 'og:title', content: 'Anitabi · Anime Pilgrimage Map' }],
        [
          'meta',
          {
            property: 'og:description',
            content: 'Discover real anime locations, save favorites, and plan your own pilgrimage route.',
          },
        ],
        ['meta', { property: 'og:url', content: 'https://boiboif.github.io/anitabi-app/en/' }],
      ],
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        lastUpdated: { text: 'Last updated' },
        returnToTopLabel: 'Return to top',
        sidebarMenuLabel: 'Documentation menu',
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        langMenuLabel: 'Change language',
        footer: {
          message: 'An open-source, unofficial anime pilgrimage app',
          copyright: 'Copyright © 2026 boiboif · GPL-3.0',
        },
      },
    },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${siteBase}app-icon.svg` }],
    ['meta', { name: 'theme-color', content: '#80c7ea' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
    ['meta', { property: 'og:type', content: 'website' }],
  ],
  markdown: {
    lineNumbers: true,
  },
  themeConfig: {
    logo: '/app-icon.svg',
    siteTitle: 'Anitabi',
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' },
              modal: { noResultsText: '没有找到相关结果', resetButtonTitle: '清除查询', backButtonTitle: '关闭搜索' },
            },
          },
          ja: {
            translations: {
              button: { buttonText: '検索', buttonAriaLabel: 'ドキュメントを検索' },
              modal: {
                noResultsText: '検索結果がありません',
                resetButtonTitle: '検索をクリア',
                backButtonTitle: '検索を閉じる',
              },
            },
          },
          en: {
            translations: {
              button: { buttonText: 'Search', buttonAriaLabel: 'Search documentation' },
              modal: {
                noResultsText: 'No results found',
                resetButtonTitle: 'Reset search',
                backButtonTitle: 'Close search',
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: 'github', link: repository }],
  },
});
