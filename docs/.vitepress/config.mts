import { defineConfig, type DefaultTheme } from 'vitepress';

const repository = 'https://github.com/boiboif/anitabi-app';
const siteBase = process.env.DOCS_BASE ?? '/';

const nav: DefaultTheme.NavItem[] = [
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

const sidebar: DefaultTheme.Sidebar = [
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
    items: [{ text: '快速开始', link: '/guide/getting-started' }],
  },
  {
    text: '项目文档',
    items: [
      { text: '隐私政策', link: '/PRIVACY' },
      { text: 'Anitabi API', link: '/anitabi-api' },
    ],
  },
];

export default defineConfig({
  lang: 'zh-CN',
  title: 'Anitabi',
  titleTemplate: ':title · 动漫圣地巡礼地图',
  description: '把动画中的风景，变成下一段旅程。Anitabi 是一款开源的动漫圣地巡礼地图应用。',
  base: siteBase,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://boiboif.github.io/anitabi-app/',
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${siteBase}app-icon.svg` }],
    ['meta', { name: 'theme-color', content: '#80c7ea' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Anitabi · 动漫圣地巡礼地图' }],
    [
      'meta',
      {
        property: 'og:description',
        content: '在地图上发现动画取景地，收藏心动坐标，规划属于你的巡礼路线。',
      },
    ],
    ['meta', { property: 'og:url', content: 'https://boiboif.github.io/anitabi-app/' }],
  ],
  markdown: {
    lineNumbers: true,
  },
  themeConfig: {
    logo: '/app-icon.svg',
    siteTitle: 'Anitabi',
    nav,
    sidebar,
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: '在 GitHub 上编辑此页',
    },
    outline: { label: '本页内容', level: [2, 3] },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '文档菜单',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    footer: {
      message: '开源、非官方的动漫圣地巡礼 App',
      copyright: 'Copyright © 2026 boiboif · GPL-3.0',
    },
  },
});
