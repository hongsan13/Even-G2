# 配布物

現在の版: [transit-hud-0.4.0.ehpk](transit-hud-0.4.0.ehpk)

**このファイルは公開サーバー未設定の端末取込互換版です。アップロードだけではオンライン管理版になりません。** オンライン管理のサーバー・クライアントは実装済みですが、HTTPS公開先が決まってから`TRANSIT_SERVICE_URL`を設定して再生成します。[配置手順](../docs/ONLINE_SERVICE.md)。

既存の都営初期データ・最大2回乗換・過去60分のロックは維持。G2実機・本番サーバー・認証付き実配信は未検証です。

サイズ: 848614 bytes
SHA-256: `c81530d70063da7f287fd4a07ce6ece6eded64b31bea39740c8d893e23009491`

標準版の再生成: `npm ci` → `npm run pack`。サーバー: `npm run server:build` → [Docker runtime](../Dockerfile.runtime)。
