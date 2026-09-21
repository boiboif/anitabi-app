# Anitabi App

简体中文 | [English](README.en.md) | [日本語](README.ja.md)

> 🚀 **持续迭代中** — 核心功能已经可用，更多体验与功能仍在完善。

一个基于 Expo 的动画圣地巡礼移动端地图应用，展示动漫取景地在世界地图上的点位。数据源来自 [anitabi.cn](https://www.anitabi.cn)。

> 项目官网：[Anitabi](https://boiboif.github.io/anitabi-app/) · [下载应用](https://boiboif.github.io/anitabi-app/download) · [隐私政策](docs/PRIVACY.md) · [贡献指引](CONTRIBUTING.md)

### 为什么做这个

前段时间旅行时用了 anitabi 网页端，丰富的巡礼数据给了我很大帮助，也让我萌生了为移动端打造更顺手体验的想法。索性自己写了一个 App，希望下次巡礼更方便，也能为更多同好提供帮助。

## 当前状态

项目已实现地图浏览、番剧点位渲染与搜索、巡礼点收藏、巡礼计划管理与分享导入、巡礼对比拍照等核心功能，收藏与巡礼计划均支持本地持久化。后续规划见下方 Roadmap。

## 功能亮点

- **地图探索**：在世界地图上浏览动画取景地，并按番剧筛选巡礼点位。
- **搜索与收藏**：搜索番剧和巡礼点，收藏想去或已经到访的坐标，随时查看地点详情并跳转导航。
- **巡礼计划**：将多个巡礼点整理成独立行程，支持通过二维码或计划文件分享与导入。
- **对比拍摄**：以动画截图辅助现场构图，拍摄并生成跨越次元的巡礼对比图。
- **本地优先**：无需注册账号，收藏、计划与生成的图片默认保存在设备本地。
- **缓存优化**：缓存地图数据与图片资源，减少重复加载，在网络不稳定时也能更流畅地浏览。
- **熟悉且更顺手**：延续 [anitabi/map](https://anitabi.cn/map) 的使用体验，几乎无需学习即可上手，并在此基础上进一步优化移动端交互。

## 平台支持

- Android 7.0 及以上（API 24；从[下载页面](https://boiboif.github.io/anitabi-app/download)获取已签名 APK）
- iOS / iPadOS 16.4 及以上（从 [GitHub Releases](https://github.com/boiboif/anitabi-app/releases) 下载未签名 IPA，需要按照 [iOS 侧载安装指南](docs/guide/ios-sideloading.md)自行签名安装）

## 截图

<p align="center">
  <img src="https://i0.hdslb.com/bfs/new_dyn/27f14bcd8532a28aa94b2c7e4befdfbf1519338.jpg" width="172" alt="首页地图1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/bfde030847ba8abcd609ab61afebae671519338.jpg" width="172" alt="首页地图2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/27d02376ce308b975fd2f9dee7514c251519338.jpg" width="172" alt="首页地图3" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/48470d9965423be5c3e99076708d203f1519338.jpg" width="172" alt="首页番剧详情" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/41922586277a7302e9828af7c7a27c8d1519338.jpg" width="172" alt="搜索1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/6fd051ad87aa34fe31b294af191b47411519338.jpg" width="172" alt="搜索2" /> 
  <img src="https://i0.hdslb.com/bfs/new_dyn/78fb71aa4c555227d2731e4166c3d9d51519338.jpg" width="172" alt="收藏1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/364a53e928ebf646cccd2684962e482e1519338.jpg" width="172" alt="收藏2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/2ded6575449c3c2cbd246598f68b90c51519338.jpg" width="172" alt="巡礼计划" />
  <img src="http://i0.hdslb.com/bfs/new_dyn/4a0a2ce7f6e8895cb7e58288ba003ac11519338.jpg" width="172" alt="分享巡礼计划" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/77b0b9e7636e86d058771cc0bbdbd29e1519338.jpg" width="172" alt="巡礼点拍照1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/09f173b924073edfc887e0897df334551519338.jpg" width="172" alt="我的" />
</p>

## 计划功能

- [x] anitabi数据拉取与处理
- [x] 深色模式
- [x] 地图基础渲染（Mapbox）
- [x] 地图番剧巡礼点展示
- [x] 番剧、巡礼点搜索
- [x] 地图展示巡礼点图片
- [x] 地图按照番剧筛选巡礼点
- [x] 巡礼点位详情
- [x] 巡礼点收藏
- [x] 巡礼计划
- [x] 分享与导入巡礼计划
- [x] 拍照并生成巡礼对比图
- [x] 多语言国际化
- [ ] AI赋能路线规划

## 免责声明

Anitabi App 是非官方开源客户端，与 [anitabi.cn](https://www.anitabi.cn) 及相关作品权利方不存在隶属、授权或背书关系。项目按现状提供，不保证第三方数据始终准确、完整或可用，请自行判断并合规使用。

地图、番剧信息、图片等第三方内容归各自权利人所有。如你认为项目中的内容侵犯了相关权利，请通过 Issue 联系维护者，我们会及时核查处理。

## 数据来源与致谢

感谢 [anitabi.cn](https://www.anitabi.cn) 及其贡献者维护动画圣地巡礼数据和服务。本项目的地图点位、番剧信息及部分相关资源来自 anitabi.cn 或其公开接口。

## 隐私政策

应用不提供账号或广告，收藏、计划、设置和生成的图片默认保存在设备本地。地图和数据加载会连接 anitabi.cn、Mapbox，崩溃与性能诊断使用 Sentry；这些服务可能接收必要的网络或设备技术信息。定位、相机和照片权限仅在相关功能中使用。

详见[隐私政策](docs/PRIVACY.md)。

## 许可

本项目原创代码采用 [GNU 通用公共许可证第 3 版（GPL-3.0）](LICENSE) 授权。第三方依赖和内容仍适用各自的许可证或权利声明。

## 贡献

欢迎提交 Issue、改进代码、完善文档或提出产品建议。参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。
