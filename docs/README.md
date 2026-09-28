# 文档索引

`docs` 同时存放官网内容和仓库开发资料。从这里按用途查找；项目安装与贡献流程见 [贡献指南](../CONTRIBUTING.md)。

## 使用应用

以下文档会发布到 [官网](https://boiboif.github.io/anitabi-app/)。中文页面放在根目录，英文和日文分别放在 `en/`、`ja/`，使用相同的文件结构。

| 内容     | 中文                                 | English                                        | 日本語                                      |
| -------- | ------------------------------------ | ---------------------------------------------- | ------------------------------------------- |
| 官网首页 | [首页](index.md)                     | [Home](en/index.md)                            | [ホーム](ja/index.md)                       |
| 功能介绍 | [功能](features.md)                  | [Features](en/features.md)                     | [機能](ja/features.md)                      |
| 下载应用 | [下载](download.md)                  | [Download](en/download.md)                     | [ダウンロード](ja/download.md)              |
| 快速上手 | [使用指南](guide/getting-started.md) | [Getting started](en/guide/getting-started.md) | [使い方](ja/guide/getting-started.md)       |
| iOS 安装 | [侧载指南](guide/ios-sideloading.md) | [Sideloading](en/guide/ios-sideloading.md)     | [サイドロード](ja/guide/ios-sideloading.md) |
| 隐私政策 | [隐私政策](PRIVACY.md)               | [Privacy](en/PRIVACY.md)                       | [プライバシー](ja/PRIVACY.md)               |
| 数据接口 | [API](anitabi-api.md)                | [API](en/anitabi-api.md)                       | [API](ja/anitabi-api.md)                    |

## 开发与回归

- [图片预览：接入与回归验证](development/image-preview-validation.md)：组件用法、手势、保存分享和设备回归清单。
- [地图选中标记](development/map-marker-rendering.md)：图层顺序、性能边界和地图回归清单。
- [Tamagui 参考资料](tamagui-llms.txt)：UI 开发参考；保留此路径供项目指引引用。

## 发布与维护

- [发版与更新](releases/README.md)：签名、GitHub Actions、整包更新清单和 EAS Update。
- [官网访问统计](maintenance/website-analytics.md)：Umami 后台配置与部署后检查。
- [版本更新说明](../release-notes/)：面向用户的各版本变更记录。

`releases/latest.json`、`releases/preview.json` 和 `releases/latest.example.json` 是更新清单及示例。应用、脚本和工作流依赖这些路径，整理文档时不要随意移动。

## 文档维护约定

- 用户使用指南放在 `guide/`，对应翻译放在 `en/guide/`、`ja/guide/`；公开页面调整时同步检查三种语言和官网导航。
- 组件接入、实现说明与回归步骤放在 `development/`；官网维护资料放在 `maintenance/`；发版流程集中维护在 `releases/README.md`。
- 已完成的迭代说明整理为长期文档，避免在根目录累积临时计划和重复说明。
- 新增长期文档时更新本索引。仓库内文档使用相对 Markdown 链接，官网页面遵循现有站点链接格式。
- 本索引、开发与维护文档、发布说明不作为官网页面发布，由 [.vitepress/config.mts](.vitepress/config.mts) 的 `srcExclude` 排除。这只是站点内容分类，文件仍在公开仓库中。

官网配置与主题位于 `.vitepress/`，图片及其他静态资源位于 `public/`。
