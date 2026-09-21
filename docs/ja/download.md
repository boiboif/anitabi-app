---
title: Anitabi をダウンロード
description: Anitabi の最新 Android APK と未署名 iOS IPA を入手できます。
---

# Anitabi をダウンロード

<DownloadPanel />

## 対応プラットフォーム

| プラットフォーム | 最低 OS バージョン    | 提供状況                                                                                       |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| Android          | Android 7.0（API 24） | GitHub Releases から署名済み APK をダウンロードできます                                        |
| iOS / iPadOS     | iOS / iPadOS 16.4     | 未署名 IPA を提供しています。ご自身の Apple アカウントで署名してサイドロードする必要があります |

対応バージョンは、本プロジェクトが使用する Expo SDK 57 に準拠しています。詳しくは [Expo の Android / iOS サポート情報](https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions)をご覧ください。

## iOS 版のインストール

[GitHub Releases](https://github.com/boiboif/anitabi-app/releases) の **Assets** から、ファイル名が `-unsigned.ipa` で終わるパッケージをダウンロードしてください。その後、[iOS サイドロードガイド](/ja/guide/ios-sideloading)に従い、Sideloadly、SideStore、または信頼できる別のツールで署名・インストールします。

::: warning IPA はそのままではインストールできません
iOS では未署名アプリを実行できません。ダウンロードページで提供する IPA は、ご自身の Apple アカウントまたは開発者証明書で署名する必要があり、ブラウザや「ファイル」アプリから直接インストールすることはできません。
:::

## 安全性の確認

インストールパッケージのダウンロード先が `github.com/boiboif/anitabi-app/releases` であることを確認してください。別のドメインへ移動した場合はダウンロードを中止し、[GitHub Releases](https://github.com/boiboif/anitabi-app/releases) から最新版を確認してください。iOS のサイドロードツールも必ず各公式サイトから入手してください。

## ソースコードからビルド

Anitabi は Expo SDK 57 と React Native 0.86 を使用しています。開発者は[リポジトリ](https://github.com/boiboif/anitabi-app)をクローンし、コントリビューションガイドに従って環境を設定したうえで Android または iOS 版をビルドできます。

::: info 非公式プロジェクト
Anitabi App は anitabi.cn と公式な提携、スポンサー、推奨関係にありません。地図スポット、作品情報、関連リソースの権利はそれぞれの権利者に帰属します。
:::
