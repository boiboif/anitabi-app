<div align="center">
  <a href="https://boiboif.github.io/anitabi-app/ja/">
    <img src="docs/public/app-icon.svg" width="128" alt="Anitabi Logo" />
  </a>

  <h1>Anitabi App</h1>
</div>

<p align="center"><strong>アニメの風景を、次の旅へ。</strong></p>

> 🚀 **継続的に開発中** — コア機能はすでに利用可能で、さらなる改善と新機能を順次追加しています。

<p align="center">
  Expo をベースにしたアニメ聖地巡礼向けのモバイル地図アプリです。世界地図上にアニメの舞台となった場所を表示します。データは
  <a href="https://www.anitabi.cn">anitabi.cn</a> から提供されています。
</p>

> [公式サイト](https://boiboif.github.io/anitabi-app/ja/) · [アプリをダウンロード](https://boiboif.github.io/anitabi-app/ja/download) · [プライバシーポリシー](docs/ja/PRIVACY.md) · [コントリビューションガイド](CONTRIBUTING.md)
>
> 言語：[简体中文](README.md) · [English](README.en.md) · 日本語

### このアプリを作った理由

旅行中に Anitabi のウェブ版を使い、豊富な聖地巡礼データにとても助けられました。同時に、モバイルでもさらに快適に使える体験を作りたいと思い、このアプリを開発しました。次の聖地巡礼をより便利にし、同じ趣味を持つ皆さんの役にも立てればうれしいです。

## 現在の状況

地図の閲覧、作品別スポットの表示と検索、お気に入り、巡礼プランの管理・共有・インポート、比較撮影などの主要機能を実装済みです。お気に入りと巡礼プランは端末内に保存されます。今後の予定は下記のロードマップをご覧ください。

## 主な特長

- **地図で探す**：世界中のアニメの舞台を地図で閲覧し、作品ごとに巡礼スポットを絞り込めます。
- **検索とお気に入り**：作品や巡礼スポットを検索し、行きたい場所や訪れた場所を保存できます。詳細を確認して地図アプリのナビゲーションもすぐに開けます。
- **巡礼プラン**：複数のスポットを旅程として整理し、QR コードやプランファイルで共有・インポートできます。
- **比較撮影**：アニメの場面を構図の参考にしながら現地で撮影し、聖地巡礼の比較画像を作成できます。
- **ローカルファースト**：アカウント登録は不要です。お気に入り、プラン、生成した画像はデフォルトで端末内に保存されます。
- **キャッシュ最適化**：地図データと画像をキャッシュし、繰り返しの読み込みを減らします。通信が不安定な場所でも、よりスムーズに閲覧できます。
- **親しみやすく、さらに快適に**：[anitabi/map](https://anitabi.cn/map) に近い操作感を受け継いでいるため、既存ユーザーは迷わず使い始められます。そのうえで、モバイル向けの操作をさらに改善しています。

## 対応プラットフォーム

- Android 7.0 以降（API 24。[ダウンロードページ](https://boiboif.github.io/anitabi-app/ja/download)から署名済み APK を入手できます）
- iOS / iPadOS 16.4 以降（[GitHub Releases](https://github.com/boiboif/anitabi-app/releases) から未署名 IPA をダウンロードし、[iOS サイドロードガイド](docs/ja/guide/ios-sideloading.md)に従って署名してください）

## スクリーンショット

<p align="center">
  <img src="https://i0.hdslb.com/bfs/new_dyn/27f14bcd8532a28aa94b2c7e4befdfbf1519338.jpg" width="172" alt="地図ホーム画面 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/bfde030847ba8abcd609ab61afebae671519338.jpg" width="172" alt="地図ホーム画面 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/27d02376ce308b975fd2f9dee7514c251519338.jpg" width="172" alt="地図ホーム画面 3" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/48470d9965423be5c3e99076708d203f1519338.jpg" width="172" alt="作品詳細" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/41922586277a7302e9828af7c7a27c8d1519338.jpg" width="172" alt="検索画面 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/6fd051ad87aa34fe31b294af191b47411519338.jpg" width="172" alt="検索画面 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/78fb71aa4c555227d2731e4166c3d9d51519338.jpg" width="172" alt="お気に入り画面 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/364a53e928ebf646cccd2684962e482e1519338.jpg" width="172" alt="お気に入り画面 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/2ded6575449c3c2cbd246598f68b90c51519338.jpg" width="172" alt="巡礼プラン" />
  <img src="http://i0.hdslb.com/bfs/new_dyn/4a0a2ce7f6e8895cb7e58288ba003ac11519338.jpg" width="172" alt="巡礼プランの共有" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/77b0b9e7636e86d058771cc0bbdbd29e1519338.jpg" width="172" alt="巡礼スポットでの比較撮影" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/09f173b924073edfc887e0897df334551519338.jpg" width="172" alt="マイページ" />
</p>

## ロードマップ

- [x] Anitabi データの取得と処理
- [x] ダークモード
- [x] Mapbox による地図描画
- [x] 地図上へのアニメ聖地スポット表示
- [x] 作品・巡礼スポット検索
- [x] 地図上でのスポット画像表示
- [x] 作品別のスポット絞り込み
- [x] スポット詳細
- [x] お気に入り
- [x] 巡礼プラン
- [x] 巡礼プランの共有とインポート
- [x] 比較写真の撮影と画像生成
- [x] 多言語対応
- [ ] AI を活用したルート計画

## 免責事項

Anitabi App は非公式のオープンソースクライアントであり、[anitabi.cn](https://www.anitabi.cn) および関連作品の権利者との提携、許諾、推奨関係はありません。本プロジェクトは現状有姿で提供され、第三者データの正確性、完全性、継続的な利用可能性を保証するものではありません。各自の判断と適用される規則・法令に従ってご利用ください。

地図、作品情報、画像などの第三者コンテンツの権利は、それぞれの権利者に帰属します。本プロジェクト内のコンテンツが権利を侵害していると思われる場合は、Issue からメンテナーへご連絡ください。速やかに確認します。

## データ提供元と謝辞

アニメ聖地巡礼データとサービスを維持している [anitabi.cn](https://www.anitabi.cn) およびコントリビューターの皆さまに感謝します。本プロジェクトの地図スポット、作品情報、一部の関連リソースは、anitabi.cn またはその公開 API から取得しています。

## プライバシー

本アプリにはアカウント機能や広告はありません。お気に入り、プラン、設定、生成した画像はデフォルトで端末内に保存されます。地図とデータの読み込みでは anitabi.cn と Mapbox に接続し、クラッシュおよびパフォーマンス診断には Sentry を使用します。これらのサービスには、通信や端末に関する必要最小限の技術情報が送信される場合があります。位置情報、カメラ、写真への権限は、対応する機能を使用するときだけ利用します。

詳しくは[プライバシーポリシー](docs/ja/PRIVACY.md)をご覧ください。

## ライセンス

本プロジェクトのオリジナルコードは [GNU General Public License v3.0（GPL-3.0）](LICENSE) の下で公開されています。第三者の依存関係とコンテンツには、それぞれのライセンスまたは権利表示が適用されます。

## コントリビューション

Issue、コード改善、ドキュメント更新、製品への提案を歓迎します。参加方法は[コントリビューションガイド](CONTRIBUTING.md)をご覧ください。
