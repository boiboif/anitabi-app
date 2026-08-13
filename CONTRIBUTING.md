# 贡献指南

感谢你愿意为 Anitabi App 贡献代码、文档或建议！在提交贡献前，请先阅读本文件、[README.md](README.md)、[免责声明](README.md#免责声明) 和 [隐私政策](docs/PRIVACY.md)。

## 开始之前

请先搜索已有 Issue，避免重复提交。Bug 报告应尽量包含：

- 复现步骤和预期行为；
- 实际行为、错误日志和截图；
- 设备型号、操作系统版本、应用版本；
- 是否只在特定网络、地区或地图缩放级别出现。

不要在 Issue、Pull Request 或日志中提交任何密钥、个人信息、照片或位置数据，包括 Mapbox Token、Expo Token 和其他服务凭据。提交前请检查 `.env.local`、构建产物和调试日志。

## 开发环境

项目使用 Expo SDK 57、React Native 0.86、React 19.2 和 Yarn。

技术栈概览：

| 类别 | 技术 |
| ---- | ---- |
| 框架 | Expo SDK 57 / React Native 0.86 / React 19.2 |
| 路由 | expo-router（文件路由） |
| 地图 | @rnmapbox/maps |
| UI | Tamagui（styled-components 设计系统） |
| 状态 | Zustand + React Context |
| 网络 | Axios + 请求处理器工厂 |
| 存储 | react-native-mmkv 4（配置、地图缓存和收藏） |
| 动画 | react-native-reanimated |
| 图标 | @tamagui/lucide-icons-2 |
| 构建 | EAS Build（dev / preview / production） |

### 前置要求

- Node.js >= 18
- Expo CLI：`npx expo --version`
- iOS 开发：Xcode（macOS）
- Android 开发：Android Studio + 模拟器，或真机 ADB 无线调试
- 一个 [Mapbox 账号](https://account.mapbox.com/) 并获取 Access Token

### 快速开始

安装项目依赖：

```bash
git clone <repo-url>
cd anitabi-app
yarn install
```

在项目根目录创建 `.env.local`：

```env
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=你的_mapbox_token
EXPO_PROJECT_ID=你的_expo_project_id
```

运行开发版本：

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

涉及原生模块、权限或构建配置的改动，请在可能的情况下至少验证一个对应平台的开发构建。不要提交生成的本地缓存、个人配置或签名文件。

### 项目结构

```text
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
    │   │   ├── favorites.tsx # 收藏列表
    │   │   └── profile.tsx # 我的页面
    │   ├── favorites/      # 按作品查看收藏的巡礼点
    │   └── dark-mode.tsx   # 深色模式设置
    ├── components/         # UI 组件
    │   ├── map-container   # Mapbox 地图容器
    │   ├── map-markers     # 点位标记（zoom 密度过滤）
    │   ├── bangumi-icons    # 番剧图标雪碧图
    │   ├── search-box       # 搜索框
    │   └── ...
    ├── lib/                # 工具库
    │   ├── storage.ts      # MMKV 配置持久化
    │   ├── map-storage.ts  # 地图数据缓存
    │   └── favorite-storage.ts # 收藏数据持久化
    ├── services/           # 数据层
    │   ├── request.ts      # Axios 实例
    │   ├── createHandler   # API 处理器工厂
    │   ├── handlers.ts     # 处理器实例
    │   ├── api.ts          # 端点定义
    │   ├── map-data.ts     # 数据拉取 + 组装
    │   └── types.ts        # 类型定义
    └── store/
        ├── use-selected-bangumi.ts  # 地图番剧筛选 store
        └── use-favorite-points.ts   # 收藏点位 store
```

### 数据流

1. **启动** → 检查 MMKV 缓存版本号（`g-modified` 时间戳）
2. **缓存可用** → 直接加载本地数据，显示地图
3. **缓存过期/缺失** → 全量拉取 → 合并番剧元数据与详情 → 写入 MMKV
4. 加载过程中通过 `FetchProgress` 回调驱动 UI 进度指示

### 常用脚本

| 命令 | 说明 |
| ---- | ---- |
| `yarn start` | 启动 Expo 开发服务器 |
| `yarn android` | Android 开发构建 |
| `yarn ios` | iOS 模拟器构建 |
| `yarn web` | Web 版 |
| `yarn lint` | ESLint 检查 |
| `yarn adb-connect` | ADB 无线调试连接 |

常用检查命令：

```bash
yarn lint
yarn web
```

## 提交代码

1. 从最新的默认分支创建功能分支，例如 `feature/map-filter` 或 `fix/cache-refresh`。
2. 保持改动聚焦，避免在同一个 Pull Request 中混入无关重构。
3. 遵循现有 TypeScript、Expo Router 和 Tamagui 代码风格。
4. 新增网络请求时说明数据来源、用途、失败处理和缓存策略。
5. 涉及权限、隐私、第三方服务或数据来源的改动，必须同步更新 README 或隐私政策。
6. 提交前运行与改动相关的检查，并在 Pull Request 中说明验证结果。

推荐的提交信息格式为：

```text
type: 简短说明
```

例如：`fix: 修复地图缓存过期判断`。常用类型包括 `feat`、`fix`、`docs`、`refactor`、`chore` 和 `test`。

## Pull Request 要求

Pull Request 描述请包含：

- 改动目的和主要内容；
- 关联的 Issue（如有）；
- 测试或手动验证步骤；
- UI 改动前后的截图或录屏；
- 是否涉及权限、用户数据、第三方服务或版权内容。

维护者可能要求补充测试、文档、许可证信息或数据来源说明。合并前请及时处理 Review 意见并保持分支同步。

## 数据、版权与合规

本项目使用来自 [anitabi.cn](https://www.anitabi.cn) 的公开数据或接口。贡献内容不得：

- 未经授权复制或提交第三方的图片、字体、地图样式、数据库或其他受保护内容；
- 绕过访问控制、验证码、速率限制或其他技术措施；
- 增加隐蔽的数据收集、广告追踪或未经说明的遥测；
- 提交包含真实用户位置、照片、账号信息或其他个人信息的样例数据；
- 违反所在地法律法规、第三方服务条款或权利人的授权要求。

提交贡献即表示你有权提交相关内容，并同意该贡献在 GNU GPL-3.0 条款下提供给项目使用。第三方内容仍适用其自身许可证，不能仅因被引用或展示于本项目中就视为已获得 GPL 授权。

## 安全问题

请不要在公开 Issue 中披露可被利用的安全漏洞、密钥或个人数据。请先联系项目维护者，并提供最小化的复现信息；在修复或发布公告前，请避免公开传播细节。

## 行为准则

参与项目时请保持尊重、具体和建设性。不得骚扰、歧视、威胁、恶意曝光他人信息，或通过刷屏、恶意提交等方式干扰项目维护。维护者可以拒绝不符合项目目标、法律要求或社区规范的贡献。
