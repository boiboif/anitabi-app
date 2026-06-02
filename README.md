# Anitabi App

> 🚧 **开发初期** — 项目正在初期迭代中，功能和 API 可能随时变化。

一个基于 Expo 的圣地巡礼移动端地图应用，展示动漫取景地在世界地图上的点位。数据源来自 [anitabi.cn](https://www.anitabi.cn)。

### 为什么做这个

前段时间去旅行时用了 anitabi 网页端，体验不太理想。索性自己写一个趁手的 App，下次去旅行时圣地巡礼能更方便。

## 当前状态

锐意制作中！目前已实现地图容器和番剧海量点位渲染的基础框架，正在进行功能开发。详见下方 Roadmap。

## 计划功能

- [x] anitabi数据拉取与处理
- [x] 深色模式
- [x] 地图基础渲染（Mapbox）
- [x] 地图番剧巡礼点展示
- [x] 番剧、巡礼点搜索
- [ ] 地图展示巡礼点图片
- [ ] 地图按照番剧筛选巡礼点
- [ ] 巡礼点位详情
- [ ] 巡礼点收藏
- [ ] 我的巡礼路线
- [ ] 分享巡礼路线
- [ ] 拍照并生成巡礼对比图
- [ ] AI赋能路线规划

## 技术栈

| 类别 | 技术                                       |
| ---- | ------------------------------------------ |
| 框架 | Expo SDK 56 / React Native 0.85 / React 19 |
| 路由 | expo-router（文件路由）                    |
| 地图 | @rnmapbox/maps                             |
| UI   | Tamagui（styled-components 设计系统）      |
| 状态 | Zustand + React Context                    |
| 网络 | Axios + 请求处理器工厂                     |
| 存储 | react-native-mmkv                          |
| 动画 | react-native-reanimated                    |
| 图标 | @tamagui/lucide-icons-2                    |
| 构建 | EAS Build（dev / preview / production）    |

## 快速开始

### 前置要求

- Node.js >= 18
- Expo CLI：`npx expo --version`
- iOS 开发：Xcode（macOS）
- Android 开发：Android Studio + 模拟器，或真机 ADB 无线调试
- 一个 [Mapbox 账号](https://account.mapbox.com/) 并获取 Access Token

### 安装

```bash
git clone <repo-url>
cd anitabi-app
yarn install
```

### 环境变量

在项目根目录创建 `.env.local`：

```env
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=你的_mapbox_token
EXPO_PROJECT_ID=你的_expo_project_id
```

### 运行

```bash
# 开发服务器（Expo Go / 开发构建）
yarn start

# 直连 Android 开发构建（真机或模拟器）
yarn android

# 直连 iOS 模拟器
yarn ios

# Web 版（RN Web）
yarn web
```

## 项目结构

```
anitabi-app/
├── app.config.ts           # Expo 配置（scheme、插件、地图 token）
├── assets/                 # 图标、启动屏图片资源
├── docs/
│   └── anitabi-api.md      # anitabi.cn API 数据格式文档
└── src/
    ├── tamagui.config.ts   # Tamagui 主题（primary: #FB7299）
    ├── app/                # Expo Router 文件路由
    │   ├── _layout.tsx     # 根布局（Tamagui、主题、Splash）
    │   ├── (tabs)/         # 标签页组
    │   │   ├── _layout.tsx # 标签布局
    │   │   ├── index.tsx   # 主页地图
    │   │   └── profile.tsx # 我的页面
    │   └── dark-mode.tsx   # 深色模式设置
    ├── components/         # UI 组件
    │   ├── map-container   # Mapbox 地图容器
    │   ├── map-markers     # 点位标记（zoom 密度过滤）
    │   ├── bangumi-icons   # 番剧图标雪碧图
    │   ├── search-box      # 搜索框
    │   └── ...
    ├── lib/                # 工具库
    │   ├── storage.ts      # MMKV 配置持久化
    │   └── map-storage.ts  # 地图数据缓存
    ├── services/           # 数据层
    │   ├── request.ts      # Axios 实例
    │   ├── createHandler   # API 处理器工厂
    │   ├── handlers.ts     # 处理器实例
    │   ├── api.ts          # 端点定义
    │   ├── map-data.ts     # 数据拉取 + 组装
    │   └── types.ts        # 类型定义
    └── store/
        └── use-selected-bangumi.ts  # Zustand store
```

## 数据流

1. **启动** → 检查 MMKV 缓存版本号（`g-modified` 时间戳）
2. **缓存可用** → 直接加载本地数据，显示地图
3. **缓存过期/缺失** → 全量拉取 → 合并番剧元数据与详情 → 写入 MMKV
4. 加载过程中通过 `FetchProgress` 回调驱动 UI 进度指示

## 脚本

| 命令               | 说明                 |
| ------------------ | -------------------- |
| `yarn start`       | 启动 Expo 开发服务器 |
| `yarn android`     | Android 开发构建     |
| `yarn ios`         | iOS 模拟器构建       |
| `yarn web`         | Web 版               |
| `yarn lint`        | ESLint 检查          |
| `yarn adb-connect` | ADB 无线调试连接     |

## 许可

MIT
