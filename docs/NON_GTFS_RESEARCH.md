# GTFS以外の公式時刻表調査（2026-10-05）

関東を優先し、他都市圏・JR・新幹線へ拡張できる入手先を調査した。これは配信形式の確認結果であり、アプリへの取込成功という報告ではない。現行v0.2.1はGTFS対応で、認証付き配信・ODPT JSON取込は未対応。

## 関東の公式JSON

公式カタログのリソースページを取得し、配信形式・認証区分・限定ライセンスを確認した。以下すべてチャレンジ2026専用トークンが必要。

| 事業者 | 形式 | 公式リソース |
|---|---|---|
| JR東日本 | 列車時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/jreast__r_train_timetable/resource/5df12c9e-c840-4d5f-8222-05be1d7a8a18) |
| 京王 | 列車時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/keio__r_train_timetable/resource/389db6dc-d53b-4740-a1ab-b4cdb522c50e) |
| 東武 | 列車時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/tobu__r_train_timetable/resource/a36fdf4e-877f-4b9c-a966-c0ecf6ed6c8d) |
| 相鉄 | 列車時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/sotetsu__r_train_timetable/resource/0026ac3e-26b5-461b-90ca-051be1035713) |
| 東急 | 駅時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/tokyu__r_station_timetable/resource/33d2e1c9-30d8-4c4e-b261-577648cd8d66) |
| 西武 | 駅時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/seibu__r_station_timetable/resource/a5d1fcbf-5c95-4b81-ac24-66a9ed3b0a10) |
| 小田急 | 駅時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/odakyu__r_station_timetable/resource/3cccb762-f23d-48cf-8e98-26d98c7bbee9) |
| 京急 | 駅時刻表JSON | [カタログ](https://ckan.odpt.org/dataset/keikyu__r_station_timetable/resource/7791ab19-370d-445a-b333-5c37459fbe02) |

JR東日本の確認対象は関東の一部路線。全国のJR・新幹線の収録は未確認。他社も収録範囲・欠損は認証後に実データで確認する。

[公式ドキュメント](https://developer.odpt.org/documents)の `odpt:TrainTimetable` は、`odpt:trainTimetableObject` に停車順の発着駅・時刻を持つ。駅・路線・運行日データと合わせ、GTFSを経由せず内部時刻表へ変換できる見込みがある。`odpt:StationTimetable` は駅の発車表が中心であり、これだけから到着時刻や他駅との列車対応を推定して乗換検索に使わない。

取込前に、全件取得の上限と欠落、運行日・祝日・臨時便・24時以降、有効期間、発着時刻の欠損、直通列車の前後レコード、事業者間の駅対応と乗換時間を確認する必要がある。

## その他都市圏・新幹線

公式Web時刻表・PDFの調査のため、以下のホストへの取得を試したが、クラウド接続プロキシに拒否された。本文・PDF・現在の利用条件・抽出可否は確認できていない。これらは取得を試した入口であり、データAPIを発見したという意味ではない。

- `www.jreast-timetable.jp`
- `railway.jr-central.co.jp`
- `www.jr-odekake.net`
- `www.jrkyushu-timetable.jp`

必要通信先は環境設定ドラフトへ追加済み。保存だけでは実行中環境へ適用されないため、設定の保存・適用後に再確認する。関西・中京・九州・新幹線の網羅データ取得は未確認であり、データが存在しないとは結論づけない。Web/PDFが閲覧できても、一括取得・継続更新・再利用の条件は別途確認する。

長期に広い鉄道網を扱うには、公式配信に加えて、契約可能な乗換・時刻表APIの収録範囲・料金・端末からの利用条件を比較する必要がある。Yahoo!乗換案内からの無断取得は実装していない。

## ODPTの登録手順

1. [開発者サイトの利用登録](https://developer.odpt.org/signup)から申し込む。公式案内では承認メールまで最大2営業日程度。
2. 承認後にログインし、「ログイン中」メニューの「ODPTセンター用アクセストークン」で通常トークンを確認・作成する。
3. 上表の限定データには通常トークンとは別に参加手続きが必要。[チャレンジ2026案内](https://developer.odpt.org/challengeinfo)で条件を確認し、エントリーする。
4. エントリー後の「チャレンジ2026専用アクセストークン」を使う。トークンをチャットやGitHubに貼らない。現行HUDには認証設定欄がないため、鍵入りURLを入力しない。

[限定ライセンス](https://developer.odpt.org/challenge_license)の許諾期限は2027-03-12（早期終了の可能性あり）。永続利用を前提にしない。再配布・意味を変える編集にも制限があり、認証で取得したデータをリポジトリや.ehpkへ同梱しない。[公式規約](https://developer.odpt.org/terms)を確認する。

## 検証状態

- 成功：上表8件の公式リソースページ取得、配信形式・認証区分・限定ライセンスの確認。
- 成功：公式開発者サイトのドキュメント・登録案内・規約の確認。
- 未実施：認証付き実時刻表の取得・JSON取込・経路検索。ユーザーは未登録で、認証鍵も環境にない。
- 接続拒否：上記JR公式Web時刻表サイト。環境設定の適用が必要。
- 今回の変更：調査文書と作業ログのみ。アプリの対応範囲・配布パッケージは変更なし。
