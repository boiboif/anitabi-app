---
title: Download Anitabi
description: Get the latest Android APK or unsigned iOS IPA for Anitabi.
---

# Download Anitabi

<DownloadPanel />

## Platform support

| Platform     | Minimum OS version   | Availability                                                                                   |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------------- |
| Android      | Android 7.0 (API 24) | A signed APK is available from GitHub Releases                                                 |
| iOS / iPadOS | iOS / iPadOS 16.4    | An unsigned IPA is available and must be signed with your own Apple account before sideloading |

These requirements match the Expo SDK 57 version used by the project. See [Expo's Android and iOS support table](https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions) for details.

## Installing on iOS

Download the file ending in `-unsigned.ipa` from the **Assets** section of [GitHub Releases](https://github.com/boiboif/anitabi-app/releases). Then follow the [iOS sideloading guide](/en/guide/ios-sideloading) to sign and install it with Sideloadly, SideStore, or another trusted tool.

::: warning An IPA cannot be installed directly
iOS does not run unsigned apps. The IPA from the download page must be signed with your own Apple account or developer certificate. It cannot be installed by simply opening it in a browser or the Files app.
:::

## Verify your download

The package download should point to `github.com/boiboif/anitabi-app/releases`. If your browser redirects to another domain, stop the download and confirm the latest version manually on [GitHub Releases](https://github.com/boiboif/anitabi-app/releases). Only obtain iOS sideloading tools from their official websites.

## Build from source

Anitabi uses Expo SDK 57 and React Native 0.86. Developers can clone the [project repository](https://github.com/boiboif/anitabi-app), configure the environment according to the contributing guide, and build the Android or iOS version.

::: info Unofficial project
Anitabi App is not officially affiliated with, sponsored by, or endorsed by anitabi.cn. Rights to map locations, anime information, and related resources belong to their respective owners.
:::
