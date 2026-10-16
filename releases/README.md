# 配布物

現在のオンライン版: [transit-hud-0.4.1.ehpk](transit-hud-0.4.1.ehpk)

接続先は **https://transit-hud.onrender.com**。利用者はトークン入力や時刻表取込なしで、駅とルートを選びます。現在の配信対象は都営149駅・6路線です。JR等の認証事業者はまだ有効にしていません。

**最初にRender側をManual Deploy → Deploy latest commitで更新し、Liveを確認してください。** 以前のサーバーはHubからのCORS要求を拒否します。v0.4.1のサーバーは公開案内APIだけ資格情報なしのブラウザ接続を許可し、管理APIのorigin制限と認証は維持します。

その後、同じEven Hubプロジェクトへこの.ehpkをアップロードしてください。G2実機での通信・操作は未検証です。無料Renderは休止後の復帰に約1分かかるため、接続エラー時はサーバーを開いて待ち、Hub側で更新を再試行してください。

サイズ: 849582 bytes
SHA-256: `ab7d9d0699feb32bd0d784bbf2645fcb3eb56269e046a4a0e4efe192056d938c`

再生成: `npm ci` → `npm run pack:online`（Unix系シェル）。標準の`npm run pack`は接続先未設定なので、同名の配布物を再生成するときはコマンドに注意してください。

前版: [接続先未設定のv0.4.0](transit-hud-0.4.0.ehpk)。
