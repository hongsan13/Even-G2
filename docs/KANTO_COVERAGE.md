# 関東圏の対応と追加手順（v0.4.8 / 2026-10-16）

## Renderでまとめて選ぶ

既存サービスのEnvironmentで `TRANSIT_FEEDS` を **`kanto`** に変更し、Save, rebuild, and deployまたはManual Deploy → Deploy latest commitを実行します。一般提供の条件確認済みであることを前提に、現在の `ODPT_SERVICE_TERMS_CONFIRMED=true` は維持します。

Liveになったら管理画面で「公式時刻表を更新」して各社の状態を確認し、Hubアプリを閉じて開き直してください。このサーバー設定だけなら既存Hubパッケージの入替は必須ではありません。

`kanto` は以下10配布元の選択をまとめる設定です。鍵不足・期限外・取得失敗の配布元が使えるという意味ではありません。通常鍵だけなら通常側の取込を進め、専用鍵不足は管理画面へ表示します。条件確認や鍵の追加は利用者ではなく運用者がRenderで行います。

| 対象 | 配布元ID | 必要な鍵 | 実データの確認状況 |
|---|---|---|---|
| 都営 | `toei` | 不要 | 公開サーバーで確認済み |
| 東京メトロ | `auth-TokyoMetro` | `ODPT_KEY` | 添付ZIPと公開サーバーで確認済み |
| 横浜市営地下鉄 | `auth-YokohamaMunicipal` | `ODPT_KEY` | 公式GTFS URL/通常認証/配布版を確認。実取込は未検証 |
| つくばエクスプレス | `auth-MIR` | `ODPT_KEY` | 実取込は未検証 |
| りんかい線 | `auth-TWR` | `ODPT_KEY` | 実取込は未検証 |
| 多摩都市モノレール | `auth-TamaMonorail` | `ODPT_KEY` | 実取込は未検証 |
| JR東日本（関東一部） | `auth-JR-East` | `ODPT_CHALLENGE_KEY` | 実取込は未検証 |
| 京王 | `auth-Keio` | `ODPT_CHALLENGE_KEY` | 実取込は未検証 |
| 東武 | `auth-Tobu` | `ODPT_CHALLENGE_KEY` | 実取込は未検証 |
| 相鉄 | `auth-Sotetsu` | `ODPT_CHALLENGE_KEY` | 実取込は未検証 |

京王・東武・相鉄・JRに通常のODPTトークンを入れても取得できる扱いにはしません。チャレンジ参加・専用トークンが必要です。[鍵設定の手順](ODPT_ACTIVATION.md)。鍵はGitやチャットに貼りません。

必要な事業者だけなら従来通り `toei,auth-TokyoMetro,auth-YokohamaMunicipal` のように指定できます。

## 横浜市営地下鉄の配布版

[公式GTFSカタログ](https://ckan.odpt.org/dataset/yokohama_municipal_train)にある配布版を比較し、調査時点で最新の[20251226版](https://ckan.odpt.org/dataset/yokohama_municipal_train/resource/27ed8a34-c89f-4c5c-98af-5950f04183e2)を登録しました。

公式URLは `https://api.odpt.org/api/v4/files/odpt/YokohamaMunicipal/Train.zip?date=20251226`。認証情報は実行時にだけ追加します。日付指定を消して不明なURLへ変更せず、署名付き転送先でも日付と事業者・パスを検証します。

この登録は**配布版を固定**します。毎日の取得確認が将来のダイヤ改正版の自動発見まで行うわけではありません。新配布版が出たらカタログのURLを更新する必要があります。フィード自身の有効終了を過ぎた版は検索対象にせず、管理画面で期限終了を表示します。公式[列車時刻表JSON](https://ckan.odpt.org/dataset/r_train_timetable-yokohamamunicipal/resource/50b6a97a-c84a-4ee4-94a7-d85dcbf75909)の通常ODPT配信も確認しましたが、今回の自動取得対象はGTFSです。

## 小田急・西武・東急・京急など

| 対象 | 今回確認できたもの | 現在の扱い |
|---|---|---|
| 小田急 | [公式駅時刻表JSON](https://ckan.odpt.org/dataset/odakyu__r_station_timetable/resource/3cccb762-f23d-48cf-8e98-26d98c7bbee9) | 到着時刻・駅間の便対応を確認できず、乗換検索には未対応 |
| 西武 | [公式駅時刻表JSON](https://ckan.odpt.org/dataset/seibu__r_station_timetable/resource/a5d1fcbf-5c95-4b81-ac24-66a9ed3b0a10) | 同上 |
| 東急・京急 | 既存調査では駅時刻表JSON | 列車全体の時刻表を確保できておらず未対応 |
| 京成・横浜高速・湘南/千葉都市モノレール・埼玉高速・秩父・関東鉄道等 | 今回のODPT GTFS検索では鉄道用の該当配布を確認できず | データ不存在とは断定せず未対応 |

ODPTでの小田急/西武のGTFS検索に出るバス会社のデータを、鉄道の対応として登録していません。発車時刻表から架空の到着時刻や他駅との列車対応を作りません。

広い鉄道網を実現する別の方法として、[駅すぱあと](https://ekiworld.net/service/sier/webservice/)や[NAVITIME](https://api-sdk.navitime.co.jp/)の正規APIが候補です。契約・G2表示条件・仕様の確認が必要で、今回契約や接続はしていません。許諾を得た公式列車時刻表JSONは既存のサーバーファイル取込でも受け入れられます。

## 収録と事業者間乗換は別

事業者を追加しても、別々のGTFS間の駅対応と構内徒歩時間は自動確定しません。運用者が確認した連絡を `TRANSIT_TRANSFER_LINKS` に設定します。[接続方法](ODPT_ACTIVATION.md#事業者間の乗換を接続する)。同名駅だけを自動接続して実在しない乗換を案内しません。

オンラインの配布元数は16まで、端末取込版は従来の8までです。総40,000便/10,000駅・検索20秒・同時検索2件は維持し、関東全路線を無制限に一括収録したという意味ではありません。統合上限を超えた場合は管理状態に理由を表示し、それまでの有効な配布元を維持します。不要な配布元を外すか路線別JSONに絞ります。

## 検証

- Vitest124件/15ファイル、TypeScript、サーバー/フロントビルド、公式pack成功。
- 日付指定の横浜GTFS認証要求と転送先照合、別日付/別事業者転送の拒否を模擬応答で確認。
- オンライン9配布元の統合、端末版の8件上限・総便数制限の維持を確認。
- コンパイル済みサーバーを `kanto` と架空の通常鍵で起動。認証配布を架空GTFSで置き換え、通常6配布元ready/専用鍵不足4配布元、架空の横浜配布元を使うWorker検索2経路、公開の原時刻表0件を確認。
- 実公開サーバーで都営+メトロ334駅/15路線を確認。他社の実認証・実データは未検証。G2実機は未検証。
