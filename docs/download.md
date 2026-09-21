---
title: 下载 Anitabi
description: 获取 Anitabi 最新 Android APK 和 iOS 未签名 IPA。
---

# 下载 Anitabi

<DownloadPanel />

## 平台支持

| 平台 | 最低系统版本 | 当前状态 |
| --- | --- | --- |
| Android | Android 7.0（API 24） | 提供公开 APK，可从 GitHub Releases 下载 |
| iOS / iPadOS | iOS / iPadOS 16.4 | 提供未签名 IPA，需要使用自己的 Apple 账户侧载签名 |

版本要求与项目使用的 Expo SDK 57 保持一致，详见 [Expo 的 Android 与 iOS 版本支持说明](https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions)。

## 安装 iOS 版本

从 [GitHub Releases](https://github.com/boiboif/anitabi-app/releases) 的 **Assets** 中下载文件名以 `-unsigned.ipa` 结尾的安装包，然后按照 [iOS 侧载安装指南](/guide/ios-sideloading) 使用 Sideloadly、SideStore 或其他可信工具完成签名和安装。

::: warning IPA 不能直接安装
iOS 不允许运行未签名应用。下载页提供的 IPA 需要使用安装者自己的 Apple 账户或开发者证书签名，不能从浏览器或“文件”App 直接打开安装。
:::

## 安全校验

安装包下载地址应指向 `github.com/boiboif/anitabi-app/releases`。如果浏览器跳转到了其他域名，请停止下载并到 [GitHub Releases](https://github.com/boiboif/anitabi-app/releases) 手动确认最新版本。iOS 侧载工具请仅从各自官方网站获取。

## 从源代码构建

Anitabi 基于 Expo SDK 57 和 React Native 0.86。开发者可以克隆[项目仓库](https://github.com/boiboif/anitabi-app)，按照贡献指南配置环境后构建 Android 或 iOS 版本。

::: info 非官方项目
Anitabi App 与 anitabi.cn 不存在官方关联、赞助或背书关系。地图点位、番剧信息和相关资源的权利归各自权利人所有。
:::
