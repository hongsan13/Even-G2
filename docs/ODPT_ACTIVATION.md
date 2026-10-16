# ODPTをRenderで有効にする（v0.4.6）

Hubの利用者が鍵を入力する必要はありません。鍵と取込元は所有者がRenderだけに設定します。現時点で認証付き実データの接続は未検証で、公開サービスの追加事業者を有効化したわけではありません。

## まず通常ODPTの事業者を追加する

既存のRenderサービス → Environmentで次を設定し、Manual Deploy → Deploy latest commitを実行します。サービスの作り直しは不要です。

| 変数 | 設定 |
|---|---|
| `ODPT_KEY` | ODPTセンター用アクセストークンをRenderの秘密情報として入力 |
| `TRANSIT_FEEDS` | まず `toei,auth-TokyoMetro` など必要な配布元だけ |
| `ODPT_SERVICE_TERMS_CONFIRMED` | 自分のアカウント・アプリでの一般提供条件を確認できた場合だけ `true` |

通常ODPTの追加候補は `auth-TokyoMetro`、`auth-MIR`（つくばエクスプレス）、`auth-TWR`（りんかい線）、`auth-TamaMonorail`。複数ならカンマ区切りにします。取得・収録範囲は実接続後に確認します。

## JR東日本・京王・東武・相鉄

JR東日本の関東一部路線等は通常トークンとは別のチャレンジ専用トークンが必要です。

1. [チャレンジ案内](https://developer.odpt.org/challengeinfo)で参加・利用条件を確認し、専用トークンを取得。
2. Renderの `ODPT_CHALLENGE_KEY` に保存。チャット・GitHub・Hubには貼らないでください。
3. `TRANSIT_FEEDS` に必要なIDを追加：`auth-JR-East`、`auth-Keio`、`auth-Tobu`、`auth-Sotetsu`。
4. 取込状態をサービスの管理ページで確認。管理トークンはRenderの `TRANSIT_ADMIN_TOKEN`。鍵が不足している場合は通常/専用のどちらが不足か表示します。

`ODPT_SERVICE_TERMS_CONFIRMED=true`も必要です。鍵があるだけで一般公開許諾が自動的に得られる扱いにはしません。限定データの期限を過ぎたら使用せず、鍵・原時刻表を利用者へ配信しません。

合計8配布元、40,000便、10,000駅の上限があります。最初から全事業者を一括指定するより必要な範囲から追加してください。

## GTFSを使わない公式列車時刻表JSON

v0.4.6からサーバーでも公式 `Railway`、`Station`、`TrainTimetable` を取得し、定期更新・経路検索できます。現状の自動取得対応はJR東日本・京王・東武・相鉄のチャレンジAPI。路線を指定して応答上限による欠落を避けます。1000件以上の応答は完全取得とみなさず拒否します。

`TRANSIT_ODPT_JSON_ROUTES` は次の配列のJSON文字列です。**プレースホルダーを公式データで確認した路線ID・有効期間に置き換えるまで設定しないでください。** 有効期間や祝日を推測して設定しません。

```json
[{
  "id": "json-jreast-selected",
  "operator": "JR-East",
  "railway": "odpt.Railway:JR-East.REPLACE_WITH_OFFICIAL_RAILWAY_ID",
  "meta": {
    "title": "JR東日本 選択路線",
    "source": "JR東日本・公共交通オープンデータ協議会",
    "license": "公共交通オープンデータチャレンジ限定ライセンス",
    "start": "YYYYMMDD",
    "end": "YYYYMMDD",
    "holidays": [],
    "licenseUntil": "20270312"
  }
}]
```

同じデータをGTFSとJSONで二重取込しないでください。GTFS配布元とJSON設定の合計が8までです。JSONの有効期間・祝日は運用者が公式情報を確認して更新します。運行日の不明なデータから架空の時刻表を作りません。

別のJR・私鉄も、許諾を得た同じODPT列車時刻表形式のJSONがあれば、設定に以下を追加してサーバー上のファイルから取り込めます。秘密ファイルや取得済みの限定データはGitへコミットしません。

```json
"files": {
  "railways": "/data/railways.json",
  "stations": "/data/stations.json",
  "trains": "/data/train-timetables.json"
}
```

ファイル方式はDockerの読み取り専用ボリュームや運用先の非公開ファイルを使います。Render無料枠に永続ボリュームを自動設定する機能ではありません。各ファイル12MBまで。公式の発着順・発着時刻・運行日が揃うものだけ取り込みます。駅時刻表・HTML・PDFだけから列車対応や到着時刻を推測する処理はありません。

## 事業者間の乗換を接続する

同名駅だけでは構内移動できると断定せず、管理者が公式の駅対応・徒歩時間を確認します。`/v1/catalog`で実際の駅IDを確認し、Renderの `TRANSIT_TRANSFER_LINKS` に設定します。

```json
[
  {"from":"配信済みの駅ID-A","to":"配信済みの駅ID-B","seconds":300},
  {"from":"配信済みの駅ID-B","to":"配信済みの駅ID-A","seconds":300}
]
```

IDは通常、都営以外では `配布元ID::元の駅ID`。連絡は方向別で、逆方向は自動生成しません。実在しないID・不正な徒歩時間・公式禁止の乗換は使用できません。未設定では配布元をまたぐ乗換はつながりません。

## その他の入手経路

- [駅すぱあと Webサービス](https://ekiworld.net/service/sier/webservice/)：公式案内は全国のJR・私鉄等の経路/運賃とAPI提供を説明。全国展開の有力な候補ですが、契約・料金・G2への表示条件とAPI仕様の確認が必要です。
- [NAVITIME API/SDK](https://api-sdk.navitime.co.jp/)：公式の法人向け経路検索API。収録範囲と利用条件を個別確認します。
- 鉄道事業者から許諾を得た公式列車時刻表JSON：上記ファイル方式で受け入れ可能。独自CSV/PDFは現状そのまま読めません。

有料契約の締結や未確認のAPI呼出し、Yahoo等からの画面スクレイピングは行っていません。JR全国・新幹線の利用可能な時刻表を今回確保したという意味ではありません。
