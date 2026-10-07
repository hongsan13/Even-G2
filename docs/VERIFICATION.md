# Current-instance verification

## v0.1.2

ユーザー添付Toei-Train-GTFS.zip（SHA-256 dd5757062317dcf18b8eeaf8bf83f6624ecd3c9fc4fe99918981e5ec2b42d8c4）をproduction buildで検証。149駅、6路線、5600便、大江戸線839便、版20260921、有効終了20270312。取込約702ms、次発検索約329ms（このクラウドのChromium測定、実スマホの性能保証ではない）。

実データの時刻未記載540行は乗降不可の浅草線・新宿線駅。これを保持し、時刻のある大江戸線の案内ができることを確認。2026-10-05 13:43 JST、徒歩7分＋余裕2分で13:56、14:02、14:08発と、14:18到着を元CSVから独立確認してブラウザテストに固定した。再読込・保存・オフラインの候補選択も成功。

54 unit tests / 7 production browser tests passed / skipなし。ZIP未指定の通常browserテストでは実ZIPテスト1件を明示skipする。G2実機は未検証。

Package: `releases/transit-hud-0.1.2.ehpk` / 116,686 bytes / SHA-256 `2edd5d3e675723cfb5bb72bbd7177ba40be764cb24bcc8cfb7e4276f454c1fbe`。

## v0.1.1（履歴）

2026-10-05: arrival_time未記載の取込修正。53ユニットテスト、6 production-browser testsが成功。Workerで発車時刻のみの合成ZIPを取り込み、到着を「着目安」と表示する回帰テストを含む。型検証、build、公式packに成功。

- Package: `releases/transit-hud-0.1.1.ehpk`
- Size: 116,691 bytes
- SHA-256: `50e9f261c8419d99fec8be49ea2b6d3f7ffe59092436ba09fbdd7ae14e2547a1`
- 都営実ZIPはネットワーク403で未取得。実データ取込が成功したとは主張しない。

## v0.1.0（履歴）

2026-10-05 / Node.js 24.19.0 / Linux Chromium

|操作|結果|
|---|---|
|`npm install`|成功|
|`npm ci`|成功。lockfileを再生成しない|
|`npm run dev`|Vite起動成功。root HTTP GETとブラウザで機能を検証|
|`npm run test`|49 tests passed / 5 files / skippedなし|
|`npm run build`|TypeScriptとVite production build成功|
|`npm run pack`|公式CLIが`.ehpk`を生成。終了コード0|
|`PLAYWRIGHT_BASE_URL=... CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`|production build上で5 tests passed。スマホ幅390pxで検証|
|公式SDK page validator|6containers、1event capture、10項目以内のmenuが通ることをテスト|
|G2 host mock|実際のSDKが生成するネイティブ呼出形式、保存、再起動、startup/rebuildを検証|
|オフライン|読込済みプラグインの時刻表・お気に入り操作をChromiumで検証。Hubオフライン冷起動は未検証|
|`npm audit --omit=dev`|実行時のprod dependenciesで既知脆弱性0件（この時点のregistry結果）|
|`git diff --check`|成功|

最終パッケージ: `releases/transit-hud-0.1.0.ehpk`

- Size: 116,413 bytes
- SHA-256: `c2e7678df3fa357d92e5435b48b4369f5530fed53b672bc0e0b35c24291400af`
- `dist/THIRD-PARTY-NOTICES.txt`を同梱。

CLIのSDK metadata取得が環境内で失敗し、同梱互換表にも0.0.16がなかったため警告が出た。SDK公式package.jsonの`minAppVersion: 2.2.10`を確認し、manifestに同じ版を指定。CLIはそのより厳しい値を保持した。TLS/署名/チェックサム検証を無効にしていない。

## 未検証

G2実機、Even Hubの通常起動・掲載承認、WebView上の日本語文字幅・ファイル選択・Worker・IndexedDB保持、Bluetooth再接続、実際の大江戸線時刻表、正規Realtime配信元。mock/ブラウザでの成功は実機成功とは扱わない。最新公式Webドキュメントの一部はネットワーク403で本文未確認。

クラウド環境の`install_script`（npm ci → pack）と`start_skill`（起動・内部readiness check・検証・制限）をドラフト保存済み。公式資料の追加調査用network domainsも保存済み。ドラフト保存はruntime適用・環境公開・Hubアップロードを行わない。


## v0.1.3：ルート登録時の同期検索を解消（2026-10-05）

1回乗換の全組合せ展開を、目的駅へ到達する第2区間の索引と出発時刻の二分探索に変更。先頭便を切り捨てず、各便の最速到着・経由・固定経路・乗換余裕・Realtime条件を維持。検索をWorkerへ移し、変更前の検索を中止し、古い結果を破棄。30秒以内に終わらない検索とWorker障害は明示的なエラーを表示。登録後に入力のフォーカスを外して結果欄へ移動。

添付都営ZIPで練馬春日町438→牛込神楽坂406、路線/方面指定なし、最大1回乗換、2026-10-05 17:33 JSTの検索を測定。この開発環境で経由なし約166ms、経由429あり約144ms（端末性能の保証ではない）。production ChromiumのCPUを6倍遅くして同条件を登録、メインスレッドのタイマー継続、次発表示、結果欄の可視性、再読込による保存を確認。ブラウザ8件成功（実ZIP2件含む）。ユニット57件成功。

成果物 `releases/transit-hud-0.1.3.ehpk`、118344 bytes、SHA-256 `3ea670a85e67884c8d6ee6379f477de91dad1de7831677010e477b2102385276`。実機の白い領域の症状自体は未再現で、検索の負荷改善だけで完全に解消したとは断定しない。Even HubへのアップロードとGitHubへのpushは未実施。


## v0.1.4：時刻表の保存先をEvenアプリ側へ変更

Evenアプリ接続時は公式SDKの保存領域を時刻表の主保存先にする。gzip/base64で圧縮後、25,000文字ずつ分割し、索引を最後に書く。WebViewのIndexedDBは補助キャッシュとして残す。旧IndexedDBのデータがあればSDK保存へ移行する。主保存に失敗した場合は取込成功とは表示しない。ブラウザ単独時は従来のIndexedDBを使用。

ユニット59件成功：4MB超の展開データの圧縮保存・再インスタンス復元、旧キャッシュ移行、削除済みデータが古いキャッシュから復活しないことを追加。productionブラウザのSDKホストmockでIndexedDB消去後の復元を検証。公式SDKの保存の実機容量・アップデート間の保持は実機未検証。

成果物 `releases/transit-hud-0.1.4.ehpk`、123702 bytes、SHA-256 `62643a79be8cd18926759ea8604363c7fad9e0725d467155467747040c2b258b`。GitHubへのpush・Hubへのアップロードは未実施。

## v0.2.0：駅名検索・地域別データ・公式更新（2026-10-05）

- Vitest: **72 passed / 7 files**、skipなし。配布元ID衝突、更新で他地域保持、旧ID移行、乗換駅指定、確認済み駅間連絡、時刻補正、部分的な有効期限切れ、最速到着推奨、ODPTの転送先検証を追加。
- Production Playwright + system Chromium: **10 passed**。実都営ZIP2件に加え、同梱初期データから駅名で登録、同名駅を路線で選択、3候補詳細、更新後のルート保持、補正の保存/再起動/解除、地域データ追加/再起動を確認。
- オンライン更新のUIテストはテスト用Responseを使用。実配信へ成功したという結果ではない。
- 公式都営ZIPのcurl取得は成功。779699 bytes、SHA-256は同梱版/添付版と一致。ODPT→Azureの両方にAccess-Control-Allow-Origin: *を確認。
- 高知とさでん交通の公式ZIP（date=20260801）を取得し解析。152停留所、4系統、1024便、有効終了20270430。日付固定URLであり最新版の自動発見は未対応。
- Production Chromiumからの実HTTPSは **net::ERR_CERT_AUTHORITY_INVALID**。証明書検証を無効にしていない。Even App実機でのオンライン取得は未検証。
- `npm run check` / TypeScript / Vite / 公式CLIのpack成功。CLIの互換表警告は残り、manifestのmin_app_version 2.2.10を保持。
- `git diff --check`成功。

成果物: `releases/transit-hud-0.2.0.ehpk`

- Size: **839678 bytes**
- SHA-256: `f9e56732b0be8b174409dc05dd19c32c67d398d0db3e4c8a3ef97e1a3536e389`
- 都営公式ZIP・クレジット・第三者ライセンス通知を同梱。

全国全路線、JR/東京メトロの認証必須データ、運賃、2回以上の乗換は未対応。実機のG2表示、SDK保存容量、Hub更新間の保持、ネットワーク権限の許諾、iPhone WebViewの駅入力はデバイステストが必要。

最終整形：公式GTFS-Realtime schemaのコメント末尾の空白を除去。機能変更なし。Realtime回帰7件・TypeScript・公式packを再確認し、上記の最終チェックサムへ更新。

## v0.2.1：最大2回乗換（2026-10-05）

- Vitest: **79 passed / 7 files**。3本の列車、両方の余裕・公式最低乗換・禁止、途中/最終便の運休、途中便遅延、経由順序、3路線の固定経路、除外路線、最速到着/同着時の少ない乗換、24時跨ぎ、2つ目の乗換駅指定を追加。
- Production browser: **11ケース成功**。全体実行の10件成功後、追加ケースの期待値を配布元の名前空間付きIDへ修正して、その1件を再実行し成功。実データの最大2回検索はCPU6倍低速でも画面操作のタイマーが継続。3区間表示・乗換駅指定・再起動後の設定を確認。
- TypeScript/Vite/公式CLI pack成功。互換表の警告は従来どおり、min_app_version 2.2.10を保持。
- 実都営ZIPで438→406、経由429、2026-10-05 17:33 JST：検索約855ms、545件、最大2回。開発環境の測定で実機保証ではない。
- `git diff --check`成功。

成果物: `releases/transit-hud-0.2.1.ehpk`、**840481 bytes**。
SHA-256: `fe1d10e247a2398c7ab2d37da5dc9ca32a862e29c548a32d23698135515f753f`。
実機のG2表示・ネットワーク・保存は引き続き未検証。

## v0.3.0：ODPT JSON・認証配信（2026-10-05）

- Vitest: **89 passed / 8 files**。JSONの発着欠損・日付跨ぎ・祝日例外・参照整合性・直通未対応、認証送信先/転送先・鍵と署名URLの非保存、エラーの鍵秘匿、補正禁止、許諾期限後の要求拒否と配布元削除。
- Production browser: **13 passed**（全体再実行）。JSONのWorker取込、駅名検索・登録、保存復元とオフライン操作、模擬JSON応答での事業者/路線選択・認証取得・更新、鍵入力の消去・再起動後の非保持、認証なし更新で保存済みデータを保持。都営実ZIPの次発・最大2回乗換、SDK mock保存・描画、既存編集も回帰。
- ブラウザ実行: `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BASE_URL=http://127.0.0.1:4193 TOEI_GTFS_ZIP=/workspace/attachments/25fdc76a-1936-4df1-af11-a7098e8f5e95/Toei-Train-GTFS.zip npm run test:browser`。production distをVite previewで内部検証。localhostは配布用URLではない。
- TypeScript、Vite、公式CLI pack、差分チェック成功。SDK互換表取得警告あり、min_app_version 2.2.10を保持。
- 認証データは公式スキーマに沿った**架空fixture/模擬応答**。ユーザー未登録・認証鍵なしで、実配信・実CORS・実Azure転送先・対象全便・G2実機は未検証。公表カタログの確認と実データ取得成功を区別する。JSON中の直通分割レコードは取込を止める。
- 関西・中京・九州・新幹線の公式Web/PDF調査は環境の通信制限で未確認。設定ドラフトの保存はランタイム適用・環境公開を意味しない。

成果物: `releases/transit-hud-0.3.0.ehpk`、**847542 bytes**。
SHA-256: `c1eaf776759c8a0455da9988cb66e3fe046e1c0eabf4681363d60f870f3c94c6`。

## v0.3.1（2026-10-06）

Vitest 89件/8 files成功。新規Productionブラウザ1件でSDKの実際の受信口へ模擬イベントを送信し、スワイプ前後・タッチ乗車・乗車中の候補固定・再タッチ解除・候補なしの拒否を検証。TypeScript/Vite/公式pack成功。既存全ブラウザケースの再実行は今回未実施。G2実機操作は未検証。

成果物: releases/transit-hud-0.3.1.ehpk、847605 bytes。SHA-256: `7deb688016da0b9445fb25bc1c4022577fbfbd7017552af0c49dbc094945c3db`。

## v0.3.2（2026-10-07）

- Vitest **92 passed / 9 files**。60分の境界・到着済み除外・未来便推奨維持・過去便HUD・Realtimeの現在時刻判定/運休・前日の24時以降を検証。
- Production browser **全14件**。SDK受信口の模擬イベントで発車済み13:42便を選択・タッチロックし14:03到着の案内へ切替。到着後に再読込して履歴から消えることを検証。既存の都営実ZIP・最大2回乗換・JSON・保存・編集も回帰。
- TypeScript/Vite/公式pack・差分チェック成功。互換表取得の警告あり、min_app_version 2.2.10は保持。G2実機ジェスチャーは未検証。

成果物: releases/transit-hud-0.3.2.ehpk、848172 bytes。SHA-256: `3da0a586f0175e29e297017c1993953c0c9e42b4e7ac3b2683ea3b8a241be134`。
