> この文書の初期採用判断はv0.1.0時点の履歴です。v0.2.0では都営GTFS同梱と公開ODPTのオンライン更新を追加しました。最新の対象・制約はREADME.mdとdocs/WORKLOG.mdを参照してください。

# Phase 0: 公式仕様とデータソース調査

調査日: 2026-10-05。存在しないAPIを補う実装はしない。

## 確認できた公式資料

- [SDK公式npmパッケージ](https://www.npmjs.com/package/@evenrealities/even_hub_sdk): 0.0.16。実際にREADMEと`dist/index.d.ts`を読み、ビルドで型検証した。Even App >= 2.2.10。
- [CLI公式npmパッケージ](https://www.npmjs.com/package/@evenrealities/evenhub-cli): 0.1.14。`evenhub pack app.json dist --sdk-ver 0.0.16 -o ...`を実行した。
- [公式テンプレート](https://github.com/even-realities/evenhub-templates): `8cb01354f5ee914c5fab97d06e6d13b28eeb5815`のminimal/README・入力処理・manifestを確認。
- [公式開発資料リポジトリ](https://github.com/even-realities/everything-evenhub): 配布・CORS・permissionの説明を確認。SDKの型定義を優先した。
- [公式Hubドキュメント](https://hub.evenrealities.com/docs/getting-started/overview): このクラウド環境ではHTTPSプロキシが403を返した。本文は未確認。上記の公式パッケージ・テンプレートを一次資料として実装した。ストアへの提出前に本文と最新公開条件を再確認する。

G2表示は576×288。startup pageを最初に作成する。全6text containers、event captureは1つ。Contentの変化だけ送信する。Contextual Menuは10項目まで、名前32UTF-8 bytes、IDは非ゼロ・一意。候補の前後2項目＋お気に入り8項目を使う。

Tapのenum値0はprotobufで省略される。存在するsys/text envelope内部だけでCLICKへ補完する。Scrollは公式textEvent、長押しはホストのContextual Menuに委ねる。ダブルTapで終了する。任意のSwipe/未公開ジェスチャーAPIは使わない。

永続保存は設定に`getLocalStorage`/`setLocalStorage`、時刻表にWeb標準IndexedDBを使う。IndexedDBを開けない場合はSDK保存への分割fallback（4MBまで）。標準Chromiumでは保存・再起動をテスト済み。Even HubのWebViewでの容量、更新時の保持、ZIPファイル選択、Worker動作は実機確認が必要。

位置情報API `getAppLocation`、`startAppLocationUpdates` はSDK 0.0.16に存在する。正式な権限名は`location`。本版では固定徒歩時間を採用し、位置情報の権限も要求しない。実機の権限・精度・駅入口までの動線が未確認なので、距離だけを根拠に確実に乗れるとは表示しない。

## 国内交通データの選定

|候補|扱い・確認できたこと|この版での採用|
|---|---|---|
|GTFS Schedule|[公式仕様](https://github.com/google/transit/blob/master/gtfs/spec/en/reference.md)を確認。運行日、calendar_dates、24時以降の時刻、agency_timezone、transfersを利用|地域別ZIPを端末から取り込む|
|GTFS-JP|GTFSに追加された列は無視せず必要な基本列で処理できる。JP固有の予約・運賃等は未対応|標準GTFS列を満たすフィードに対応。全JP仕様適合とは主張しない|
|GTFS-Realtime|[公式protobuf](https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto)を同梱。遅延、絶対時刻、運休、停車駅スキップ、NO_DATA、FULL_DATASETを処理|ファイル取込と、許可済み配信元を用意したビルド向けHTTPSアダプター|
|ODPT / 公共交通オープンデータセンター|[開発者サイト](https://developer.odpt.org/)と配布サイトの本文をネットワーク制限で確認できていない。都営の最新データ、API認証条件、CORS、再配布条件は未確認|認証鍵の公開埋込を前提とした採用はしない|
|都営大江戸線の公式時刻表|[東京都交通局](https://www.kotsu.metro.tokyo.jp/)。自動取得と再配布は未実施。ZIP配布があるとは主張しない|ユーザーが正規時刻表を確認し、個人利用分をスマホで手入力できる|
|駅すぱあと等の有料API|公開クライアントに鍵を配布してよいという根拠を確認できていない|主要データソースにしない|
|Yahoo!乗換案内|スクレイピング実装なし|採用しない|

GTFS仕様は `google/transit` の `3c9e7b904b5035349622f03e11851e25c16d1d99`で確認。ライセンスをGTFS-LICENSEに保持。**GTFSという形式の公開は、個々の事業者データの利用・再配布許可を意味しない。** ZIP取込時に配布元と利用条件を入力して確認する。データを外部へアップロードしない。

## スタンドアロン構成の比較

|案|利点|制約|判断|
|---|---|---|---|
|A: 地域GTFSをHTTPS取得|更新可能|CORS、Hub network permission、データの規約、サイズ|配信元の確認後に使えるアダプターを実装|
|B: 使用路線のみ取得|小容量|事業者の部分配信APIが必要。ZIPを部分取得できるとは限らない|現在の標準にはしない|
|C: ビルド時に小規模データ同梱|起動直後からオフライン|再配布許可と更新管理が必要|実データ未確保なので架空の検証データのみ|
|D: ローカル取込＋保存＋任意の公開更新|鍵不要、サーバー不要、通信障害に強い|初回の時刻表登録が必要|採用。通常版のnetwork permissionsは空|

全国データは同梱しない。ZIP 12MB、展開合計60MB、20,000 tripsまで。操作中にパースするWorkerは45秒でタイムアウトする。フィードは1つずつ置換する。複数事業者を含む1つのフィードは処理できるが、独立した複数フィードの結合は未実装。

HTTPS取得には、配信元を`src/config.ts`、`app.json`、`index.html`のCSPで一致させる必要がある。通信許可はCORSを迂回しない。サーバー、Vite proxy、個人Gatewayは使わない。URLの認証情報、クエリ、HTTP、リダイレクトは拒否する。ETag/Last-Modifiedによる304を処理する。標準配布版では配信元は空で、外部通信はない。

## 実用化の残条件

1. 大江戸線の現在有効な時刻表を正規に確認し、個人利用分を手入力するか、許可されたGTFSを取り込む。
2. 自動配信を有効にする場合は認証鍵不要・利用許可・CORSを確認する。API secretが必要なら公開版の主要ソースにはできない。
3. `.ehpk`をHubにアップロードして、通常起動・日本語・タッチ・永続保存・再接続をG2実機でテストする。
4. Hubの最新ストア提出条件を確認し、package_idの利用可否と公開申請をユーザーのアカウントで確認する。

このクラウドでのbuild/pack成功は、Hub掲載承認や実機での動作証明ではない。

## 追記: 都営GTFSの公式配布リンク

2026-10-05、公式カタログ https://ckan.odpt.org/dataset/train-toei/resource/35b68908-4558-47ae-bfa5-867e58544a1a を閲覧できた。都営鉄道GTFSの配布リンク https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip とCC BY 4.0の表記を確認。クレジット提供者名は「東京都交通局・公共交通オープンデータ協議会」。ZIP本体はこの環境では配信先のネットワーク403で取得できず、内容と取込は未検証。api-public.odpt.orgと配信先dataodpt.blob.core.windows.netの追加をクラウド設定ドラフトへ保存した。

## 追記: 添付都営ZIPの実検証

ユーザー添付のToei-Train-GTFS.zipをv0.1.2 production buildで取り込んだ。版20260921、feed_end_date 20270312、149駅、6路線、5600便。大江戸線はroute_id 4で839便、練馬春日町stop_id 438、新宿stop_id 428。540行の空時刻は浅草線・新宿線のpickup_type=1/drop_off_type=1/timepoint=0の駅で、大江戸線には欠損なし。再読込とオフライン操作を確認。直接のネット取得は未確認だが、添付データでの取込未検証という従前の制限は解消。実機試験・自動配信のCORS検証は別に必要。
