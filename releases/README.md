# 配布物

現在のオンライン版: [transit-hud-0.4.2.ehpk](transit-hud-0.4.2.ehpk)

接続先は **https://transit-hud.onrender.com**。利用者はトークン入力や時刻表取込なしで、駅とルートを選びます。現在の配信対象は都営149駅・6路線です。JR等の認証事業者はまだ有効にしていません。

**最初にRender側をManual Deploy → Deploy latest commitで更新し、Liveを確認してください。** 以前のサーバーはHubからのCORS要求を拒否します。v0.4.1のサーバーは公開案内APIだけ資格情報なしのブラウザ接続を許可し、管理APIのorigin制限と認証は維持します。

その後、同じEven Hubプロジェクトへこの.ehpkをアップロードしてください。G2実機での通信・操作は未検証です。無料Renderは休止後の復帰に約1分かかります。初回取得は最大90秒待ち、失敗後は自動再試行します。Hubの画面は案内とお気に入りに集約し、手動取込・認証・更新設定は表示しません。新規ルートは直通と最大2回の乗換を自動比較します。

サイズ: 850086 bytes
SHA-256: `5ca4c19ae3a283fafd3a3ce74884e31ba1fda5779d3bd2a612f11dc572e9cea5`

再生成: `npm ci` → `npm run pack:online`（Unix系シェル）。標準の`npm run pack`は接続先未設定なので、同名の配布物を再生成するときはコマンドに注意してください。

前版: [接続先未設定のv0.4.0](transit-hud-0.4.0.ehpk)。
