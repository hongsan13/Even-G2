import type { Settings, Timetable, FavoriteRoute } from '../transit/types';
import type { HudModel } from '../even/renderer';
import { jstDate } from '../utils/time';
import { bindStationSearch, stationLabels } from './stations';
import { ALL_FEEDS, PUBLIC_FEED_ORIGINS, TRANSIT_SERVICE_URL } from '../config';
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
import { ODPT_OPERATORS, CHALLENGE_END } from '../transit/odpt/loader';
const e = escapeHtml;
const jsonPeriodFields = () => `<div class="two"><label>確認した有効開始 YYYYMMDD<input name="start" pattern="[0-9]{8}" value="${jstDate(Date.now())}" required></label><label>確認した有効終了 YYYYMMDD<input name="end" pattern="[0-9]{8}" required></label></div><label>期間内の祝日 YYYYMMDD（空白区切り）<textarea name="holidays" placeholder="祝日は自動補完しません"></textarea></label><label class="check"><input name="confirmed" type="checkbox" required>公式ダイヤの有効期間・祝日を確認しました</label>`;
const days = ['日', '月', '火', '水', '木', '金', '土'];
function options(items: { id: string; name: string }[], selected: string): string {
  return items.map(item => `<option value="${e(item.id)}" ${item.id === selected ? 'selected' : ''}>${e(item.name)}</option>`).join('');
}
function checks(name: string, selected: number[]): string {
  return days.map((d, i) => `<label class="day"><input type="checkbox" name="${name}" value="${i}" ${selected.includes(i) ? 'checked' : ''}>${d}</label>`).join('');
}
export function mountSettings(root: HTMLElement): void {
  root.innerHTML = `
  <header><span class="brand-mark">↗</span><div><p class="eyebrow">EVEN G2 · TRANSIT HUD</p><h1>今出るなら、どの電車？</h1></div><span class="pill">Asia/Tokyo</span></header>
  <main>
    <section class="card live-card" aria-labelledby="live-title"><div class="section-heading"><h2 id="live-title">次の行動</h2><span id="connection" class="pill">接続確認中</span></div>
      <div id="hud" class="hud" aria-live="polite"></div>
      <div id="journey-results" aria-live="polite"></div><div id="past-journeys"></div>
      <details class="saved-routes"><summary>お気に入り</summary><div id="routes" class="route-tabs"></div><div id="favorite-list"></div></details>${TRANSIT_SERVICE_URL ? '<p class="hint">オンライン案内：駅とルートを選ぶだけで利用できます。通信できない場合は新しい案内を取得できません。</p><details><summary>データと利用条件</summary><p class="hint">データ提供：公共交通オープンデータセンター。正確性・完全性は保証されません。駅・事業者の最新案内を確認してください。<a href="https://github.com/hongsan13/Even-G2/issues" target="_blank" rel="noopener noreferrer">アプリのお問い合わせ</a></p></details><button type="button" data-action="sync-online" class="secondary">オンライン駅一覧を更新</button>' : ''}
      <div class="actions"><button data-action="previous" class="secondary">← 前の候補</button><button data-action="next" class="secondary">次の候補 →</button><button data-action="board">この便に乗車</button></div>
      <p id="journey-note" class="hint"></p><p id="status" role="status" class="notice">${TRANSIT_SERVICE_URL ? 'オンライン駅一覧を準備しています。手動取込は不要です。' : '時刻表を取り込むか、手入力で登録してください。'}</p>
    </section>
    <section class="card"><div class="section-heading"><h2>ルート検索</h2><span class="step">SEARCH</span></div><div id="favorite-editor"></div></section>
    ${TRANSIT_SERVICE_URL ? '<details class="card"><summary>詳細設定・端末への手動取込</summary>' : ''}<section class="card"><div class="section-heading"><h2>時刻表データ</h2><span class="step">01</span></div><div id="dataset" class="dataset"></div>
      <div id="feed-list"></div>
      <form id="catalog-form"><label>追加する地域・事業者<select name="feed">${ALL_FEEDS.map(f => `<option value="${e(f.id)}">${e(f.region)} · ${e(f.title)}</option>`).join('')}</select></label>
        <label class="check"><input name="terms" type="checkbox" required>配布元の利用条件を確認して追加・更新する</label><button type="submit">公式データを追加・更新</button></form>
      <p class="hint">使う地域を最大8件保存します。都営・高知は公開配信、JR東日本の関東一部・関東の一部私鉄は登録後に認証取得できます。認証配信は接続未検証です。全国・新幹線は未収録です。日付固定のURLは最新版をカタログで確認してください。${ALL_FEEDS.map(f => `<a href="${e(f.catalog)}" target="_blank" rel="noopener noreferrer">${e(f.title)}の利用条件</a>`).join(' / ')} · <a href="https://ckan.odpt.org/dataset/" target="_blank" rel="noopener noreferrer">公式データカタログ</a></p>
      <details id="odpt-auth"><summary>ODPT認証設定・登録方法</summary>
        <p class="hint"><a href="https://developer.odpt.org/signup" target="_blank" rel="noopener noreferrer">ODPT利用登録</a> → 承認後ログイン →「ODPTセンター用アクセストークン」。JR・京王・東武・相鉄には別途<a href="https://developer.odpt.org/challengeinfo" target="_blank" rel="noopener noreferrer">チャレンジ2026参加</a>と専用トークンが必要です。限定データの許諾期限は2027-03-12。早期終了時は該当データを削除してください。</p>
        <form id="auth-form"><label>通常ODPTトークン<input name="odptKey" type="password" autocomplete="off" maxlength="300"></label><label>チャレンジ2026専用トークン<input name="challengeKey" type="password" autocomplete="off" maxlength="300"></label><button type="submit">今回の利用中だけトークンを設定</button><button type="button" data-action="clear-auth" class="secondary">トークンを解除</button></form>
        <p id="auth-state" class="hint">認証トークン未設定</p><p class="hint">トークンは保存・再表示しません。終了後は再入力が必要ですが、取り込んだ時刻表は端末に保存します。認証取得した公式便の時刻は補正できません。</p>
      </details>
      <details id="odpt-online"><summary>GTFS以外：公式の列車時刻表JSONをオンライン取得</summary>
        <p class="hint">チャレンジ2026専用トークンが必要です。まず路線一覧を取得し、使う路線を選びます。1000件以上のAPI応答、未対応の直通分割レコードは保存しません。認証配信の実データ・実機通信は未検証です。</p>
        <form id="odpt-online-form"><label>事業者<select name="operator">${ODPT_OPERATORS.map(o => `<option value="${e(o.id)}">${e(o.title)}</option>`).join('')}</select></label><button type="button" data-action="json-railways" class="secondary">この事業者の路線一覧を取得</button><label>読み込む路線<select name="railway" required><option value="">先に路線一覧を取得してください</option></select></label>${jsonPeriodFields()}<button type="submit">選択した路線の公式JSONを取り込む</button></form>
      </details>
      <details><summary>GTFS以外：公式の列車時刻表JSONファイルを追加</summary>
        <p class="hint">ODPTのRailway・Station・TrainTimetableの3つのJSON配列を使います。StationTimetable（駅別発車表）は乗換計算に使えません。各12MB以下。便IDが変わらない更新は同じ保存先を選べます。</p>
        <form id="odpt-file-form"><label>名称<input name="title" required maxlength="120"></label><label>出典<input name="source" required maxlength="200"></label><label>利用条件<input name="license" required maxlength="200"></label><label>許諾区分<select name="licenseKind"><option value="challenge">チャレンジ2026限定（${CHALLENGE_END}まで）</option><option value="other">その他・基本ライセンス（有効期間を確認済み）</option></select></label><label>保存先<select name="jsonTarget"><option value="">新しい配布元として追加</option></select></label><label>路線 Railway JSON<input name="railways" type="file" accept=".json,application/json" required></label><label>駅 Station JSON<input name="stations" type="file" accept=".json,application/json" required></label><label>列車 TrainTimetable JSON<input name="trains" type="file" accept=".json,application/json" required></label>${jsonPeriodFields()}<label class="check"><input name="terms" type="checkbox" required>取込・端末保存の利用条件を確認しました</label><button type="submit">列車時刻表JSONを端末から取り込む</button></form>
      </details>
      <details><summary>GTFS ZIPを端末から追加する</summary>
      <form id="import-form"><label>保存方法<select name="importMode"><option value="add">保存済みデータに追加</option><option value="replace">すべて置き換える（ルートも削除）</option></select></label><label>同じ配布元の更新<select name="feedTarget"><option value="">新しい配布元として追加</option></select></label><label>名称<input name="title" placeholder="都営大江戸線 / 正式な配布データの名称" maxlength="120" required></label>
        <label>配布元・出典<input name="source" placeholder="公式配布元のURLまたは出典" maxlength="200" required></label>
        <label>ライセンス・利用条件<input name="license" placeholder="配布元が明示している利用条件" maxlength="200" required></label>
        <label>地域別GTFS ZIP<input type="file" name="file" accept=".zip,application/zip" required></label>
        <label class="check"><input type="checkbox" name="terms" required>利用条件を確認済み。端末内で処理し、外部へアップロードしません。</label>
        <button type="submit">GTFSを取り込む</button>
      </form></details>
      <details><summary>公式時刻表を見ながら手入力する</summary>
        <p class="hint">実際の時刻を自身で確認して入力してください。到着は入力した所要時間による推定です。日付跨ぎは24:05のように入力します。</p>
        <form id="manual-form"><div class="two"><label>出発駅<input name="from" value="練馬春日町" required maxlength="80"></label><label>到着駅<input name="to" value="新宿" required maxlength="80"></label></div>
        <label>路線<input name="line" value="都営大江戸線" required maxlength="80"></label>
        <div class="two"><label>所要時間（分）<input name="duration" type="number" min="1" max="240" required placeholder="公式時刻表で確認"></label><label>出典<input name="source" required placeholder="確認した公式時刻表の出典" maxlength="200"></label></div>
        <div class="two"><label>有効開始 YYYYMMDD<input name="start" value="${jstDate(Date.now())}" pattern="[0-9]{8}" required></label><label>有効終了 YYYYMMDD<input name="end" pattern="[0-9]{8}" required placeholder="20270331"></label></div>
        <label>行き・平日 発車時刻<textarea name="forwardWeekday" placeholder="13:52 13:58 14:04" required></textarea></label>
        <label>行き・土休日 発車時刻<textarea name="forwardWeekend" placeholder="公式時刻表から入力" required></textarea></label>
        <label>帰り・平日 発車時刻<textarea name="returnWeekday" placeholder="任意"></textarea></label><label>帰り・土休日 発車時刻<textarea name="returnWeekend" placeholder="任意"></textarea></label>
        <label>土休日ダイヤを使う祝日 YYYYMMDD<textarea name="holidays" placeholder="日付を空白区切りで入力。祝日は自動補完しません。"></textarea></label>
        <label class="check"><input type="checkbox" required>時刻・所要時間・祝日・有効期間を確認しました。</label><button type="submit">手入力時刻表を保存</button></form>
      </details>
      <div class="actions"><button class="secondary" data-action="demo">架空サンプルを試す</button><button class="danger" data-action="clear">時刻表・キャッシュ削除</button></div>
      <p class="hint">サンプルへの切替・手入力時刻表の新規登録は保存済みデータを置き換えます。公式更新ではお気に入りを保持し、登録内容を再確認します。</p>
      <details id="remote-settings"><summary>オンライン更新と公開GTFSの追加</summary>
        <p class="hint">許可済み配信元：${e(PUBLIC_FEED_ORIGINS.join(', ') || 'なし')}。ODPTの公開GTFS ZIPに対応します。認証鍵を含むURLは保存しません。</p>
        <form id="remote-form"><label>名称<input name="feedTitle" maxlength="120"></label><label>出典<input name="feedSource" maxlength="200"></label><label>利用条件<input name="feedLicense" maxlength="200"></label><label class="check"><input type="checkbox" name="terms">配布元の利用条件を確認しました</label><label>追加する公開GTFS ZIP URL<input name="gtfsUrl" type="url" placeholder="https://…/feed.zip"></label>
        <label>GTFS-Realtime HTTPS URL<input name="realtimeUrl" type="url" placeholder="https://…/trip-updates.pb"></label>
        <button type="submit" ${PUBLIC_FEED_ORIGINS.length ? '' : 'disabled'}>配信元を保存してデータを追加</button></form>
        <button data-action="refresh" class="secondary" ${PUBLIC_FEED_ORIGINS.length ? '' : 'disabled'}>保存済みデータを更新</button>
      </details>
      <label class="check"><input id="auto-update" type="checkbox" checked>起動時と利用中、1日ごとに公式データの更新を確認</label>
      <details><summary>時刻表を手動で補正する</summary><p class="hint">入力はこの端末だけの補正です。選択した便の全運行日に適用し、公式更新後も同じ便IDなら残します。運休・遅延の公式情報ではありません。</p><div id="timetable-editor"></div></details>
      <details><summary>別路線・配布元の乗換駅を連絡する</summary><p class="hint">同名の駅を自動で接続しません。実際に徒歩で乗換できる駅を選び、歩く時間を確認して登録してください。</p><div id="transfer-editor"></div></details>
      <details><summary>GTFS-Realtimeのファイルで検証</summary><label>同じGTFSに対応する.pbファイル<input id="realtime-file" type="file" accept=".pb,.bin,.protobuf"></label><p class="hint">2分以上古い情報は使いません。通信・デコード失敗時は予定時刻へ戻ります。</p></details>
    </section>

    ${TRANSIT_SERVICE_URL ? '</details>' : ''}<section class="card"><div class="section-heading"><h2>表示とプライバシー</h2><span class="step">03</span></div>
      <form id="preferences-form"><label>カウントダウン更新<select name="refresh"><option value="10">10秒</option><option value="15" selected>15秒</option><option value="30">30秒</option><option value="60">60秒</option></select></label>
      <label class="check"><input type="checkbox" name="realtime">新しいRealtime情報がある時だけ使う</label><button type="submit">表示設定を保存</button></form>
      <p class="hint">設定と時刻表は端末に保存します。位置情報・連絡先・マイクは使用しません。乗車モードは手動で開始し、予定時刻で次の行動を切り替えます。列車への乗車・実際の到着を検知する機能ではありません。</p>
      <details><summary>デバッグ情報・バージョン</summary><pre id="debug"></pre></details>
    </section>
  </main><footer>Transit HUD 0.4.5 · 移動の判断を、視線の先に。<br>遅延・運休・番線は駅の案内も確認してください。</footer>`;
  if (TRANSIT_SERVICE_URL) {
    const searchCard = root.querySelector('#favorite-editor')!.closest('section.card')!;
    const fold = document.createElement('details'); fold.className = 'route-search';
    fold.innerHTML = '<summary>ルート検索<span>出発・到着を選ぶ</span></summary>';
    searchCard.querySelector('.section-heading')!.remove();
    fold.append(root.querySelector('#favorite-editor')!); searchCard.append(fold);
    // Retain internal controls for legacy handlers while keeping the online product UI focused.
    const dataSettings = root.querySelector('#dataset')!.closest<HTMLElement>('details.card')!;
    dataSettings.hidden = true;
    root.querySelector('#preferences-form')!.closest<HTMLElement>('section.card')!.hidden = true;
    root.querySelector<HTMLElement>('[data-action="sync-online"]')!.hidden = true;
  }
}
export function updateHud(root: HTMLElement, model: HudModel): void {
  root.querySelector('#hud')!.innerHTML = `<p class="hud-title">${e(model.title)}</p><p class="hud-action">${e(model.action)}</p>
    <p class="hud-primary">${e(model.primary)}</p><p class="hud-detail">${e(model.detail)}</p><p class="hud-alternatives">${e(model.alternatives)}</p><p class="hud-footer">${e(model.footer)}</p>`;
}
export function updateFavoriteControls(root: HTMLElement, settings: Settings): void {
  root.querySelector('#routes')!.innerHTML = settings.favorites.map(f => `<button class="route-tab ${f.id === settings.activeId ? 'active' : ''}" data-route="${e(f.id)}">${e(f.name)}</button>`).join('');
  root.querySelector('#favorite-list')!.innerHTML = settings.favorites.map(f => `<div class="favorite-row"><span>${e(f.name)} <small>徒歩${f.walkingMinutes}分 / 余裕${f.bufferMinutes}分</small></span>
    <button data-edit="${e(f.id)}" class="secondary">編集</button><button data-delete="${e(f.id)}" class="danger">削除</button></div>`).join('');
}
export function favoriteEditor(root: HTMLElement, data: Timetable | null, favorite?: FavoriteRoute): void {
  const container = root.querySelector('#favorite-editor')!;
  if (!data) { container.innerHTML = TRANSIT_SERVICE_URL ? '<p class="hint">駅一覧の取得を待っています。接続すると自動で表示します。</p>' : '<p class="hint">先に時刻表を登録してください。</p>'; return; }
  const labels = stationLabels(data);
  const stations = data.stations.map(s => ({ ...s, name: labels.get(s.id)! })), f = favorite;
  const picker = (name: string, title: string, selected: string, optional = false) => `<label>${title}<input type="search" data-station-search="${name}" aria-label="${title}を駅名で検索" placeholder="駅名を入力して絞り込み" autocomplete="off"><select name="${name}" aria-label="${title}" ${optional ? '' : 'required'}>${optional ? '<option value="">指定なし</option>' : ''}${options(stations, selected)}</select></label>`;
  container.innerHTML = `<form id="favorite-form"><h3>${f ? 'ルートを編集' : '新しいルート'}</h3><input type="hidden" name="id" value="${e(f?.id ?? '')}">
    <label>表示名<input name="name" value="${e(f?.name ?? '')}" maxlength="24" placeholder="自宅 → 職場"></label>
    <div class="two">${picker('from', '出発駅', f?.from ?? stations[0]?.id ?? '')}${picker('to', '到着駅', f?.to ?? stations[1]?.id ?? '')}</div>
    <button type="button" class="secondary" data-action="swap-stations">出発・到着を入れ替える</button>
    <label>最初に乗る路線（複数選択可 / 未選択なら全て）<select name="lines" multiple size="3">${data.lines.map(l => `<option value="${e(l.id)}" ${f?.lineIds.includes(l.id) ? 'selected' : ''}>${e(l.name)} · ${e(l.id)}</option>`).join('')}</select></label>
    <div class="two"><label>方面<select name="direction"><option value="">指定なし</option><option value="0" ${f?.direction === '0' ? 'selected' : ''}>0 · GTFSの方向</option><option value="1" ${f?.direction === '1' ? 'selected' : ''}>1 · GTFSの方向</option></select></label>
    <label>経路の比較<select name="transfers"><option value="2" ${(f?.maxTransfers ?? 2) === 2 ? 'selected' : ''}>自動比較（最大2回乗換）</option><option value="1" ${f?.maxTransfers === 1 ? 'selected' : ''}>乗換は1回まで</option><option value="0" ${f?.maxTransfers === 0 ? 'selected' : ''}>直通のみ</option></select></label></div>
    <p class="hint">直通・乗換の到着時刻を比較し、最も早く着く経路をおすすめします。徒歩と乗換余裕も考慮します。</p><div class="three"><label>徒歩（分）<input type="number" name="walk" min="0" max="120" step="0.5" value="${f?.walkingMinutes ?? 7}" required></label>
      <label>発車前余裕（分）<input type="number" name="buffer" min="0" max="120" step="0.5" value="${f?.bufferMinutes ?? 2}" required></label>
      <label>乗換余裕（分）<input type="number" name="transferBuffer" min="0" max="120" step="0.5" value="${f?.transferMinutes ?? 4}" required></label></div>
    ${picker('transferAt', '最初の乗換駅（任意）', f?.transferAt ?? '', true)}
    <div id="second-transfer-picker">${picker('secondTransferAt', '2つ目の乗換駅（任意）', f?.secondTransferAt ?? '', true)}</div>
    <details ${f?.via.length ? 'open' : ''}><summary>経由駅・路線の詳しい条件</summary>
    ${[0, 1, 2].map(i => picker(`via${i}`, `経由駅${i + 1}（順番に指定）`, f?.via[i] ?? '', true)).join('')}
    <div class="two"><label>優先路線ID<input name="preferred" value="${e(f?.preferredLines.join(',') ?? '')}" placeholder="カンマ区切り"></label><label>使わない路線ID<input name="excluded" value="${e(f?.excludedLines.join(',') ?? '')}" placeholder="カンマ区切り"></label></div>
    <label>固定経路の路線ID（乗車順）<input name="fixed" value="${e(f?.fixedPath.join(',') ?? '')}" placeholder="直通なら1路線、乗換なら2〜3路線"></label>
    </details><p>使用曜日（祝日の運行日は時刻表が決定）</p><div class="days">${checks('days', f?.days ?? [0, 1, 2, 3, 4, 5, 6])}</div>
    <details ${f?.auto ? 'open' : ''}><summary>時間帯による自動切替</summary><label class="check"><input type="checkbox" name="auto" ${f?.auto ? 'checked' : ''}>この時間帯に自動選択</label>
      <div class="two"><label>開始<input type="time" name="autoStart" value="${e(f?.auto?.start ?? '07:00')}"></label><label>終了<input type="time" name="autoEnd" value="${e(f?.auto?.end ?? '10:00')}"></label></div>
      <div class="days">${checks('autoDays', f?.auto?.days ?? [1, 2, 3, 4, 5])}</div><p class="hint">手動で選んだ日は手動選択を優先します。日付が変わると自動切替を再開します。</p></details>
    <div class="actions"><button type="submit">${f ? '変更を保存' : 'ルートを登録'}</button>${f ? '<button type="button" data-action="new-favorite" class="secondary">新規登録へ</button>' : ''}</div></form>`;
  if (TRANSIT_SERVICE_URL) {
    const form = container.querySelector<HTMLFormElement>('#favorite-form')!;
    const retained = document.createElement('div'); retained.hidden = true;
    while (form.firstChild) retained.append(form.firstChild);
    form.append(retained); form.classList.add('simple-route-form');
    for (const [name, caption] of [['from', '出発駅'], ['to', '到着駅']]) {
      const label = retained.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!.closest('label')!;
      label.classList.add('station-field');
      label.firstChild!.textContent = caption;
      form.append(label);
      const input = label.querySelector<HTMLInputElement>('input')!;
      input.placeholder = '駅名を入力';
    }
    const waypoints = document.createElement('div'); waypoints.className = 'route-waypoints';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'secondary add-waypoint'; add.textContent = '＋ 乗換駅を追加';
    const initial = (f?.via.length ? f.via : [f?.transferAt, f?.secondTransferAt].filter(Boolean)) as string[];
    const labels: HTMLLabelElement[] = [];
    const update = () => {
      labels.forEach((label, i) => {
        label.firstChild!.textContent = `経由・乗換駅 ${i + 1}`;
        const select = label.querySelector('select')!; select.name = `via${i}`;
        const input = label.querySelector('input')!; input.dataset.stationSearch = `via${i}`;
      });
      add.hidden = labels.length >= 3;
    };
    const addRow = (value = '') => {
      if (labels.length >= 3) return;
      const i = labels.length;
      const holder = document.createElement('div'); holder.innerHTML = picker(`via${i}`, `経由・乗換駅 ${i + 1}`, value, true);
      const label = holder.firstElementChild as HTMLLabelElement; label.classList.add('station-field');
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary remove-waypoint'; remove.textContent = '削除';
      remove.addEventListener('click', () => {
        labels.splice(labels.indexOf(label), 1); label.remove(); update();
      });
      label.append(remove); labels.push(label); waypoints.append(label); update();
      bindStationSearch(label, data);
    };
    for (const field of retained.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name^="via"], [data-station-search^="via"]')) field.remove();
    initial.slice(0, 3).forEach(value => addRow(value));
    add.addEventListener('click', () => addRow());
    form.append(waypoints, add);
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '経由・乗換駅は順番に3駅まで指定できます。乗換は最大2回で比較します。'; form.append(hint);
    const fold = container.closest<HTMLDetailsElement>('details.route-search'); if (f && fold) fold.open = true;
    const swap = retained.querySelector<HTMLButtonElement>('[data-action="swap-stations"]')!;
    swap.textContent = '↑↓ 出発・到着を入れ替え'; form.append(swap);
    const actions = retained.querySelector<HTMLElement>('.actions')!;
    actions.querySelector('button')!.textContent = f ? '変更して検索' : '検索してお気に入りに保存';
    form.append(actions);
    // Simplified searches always compare all lines and up to two transfers.
    for (const name of ['direction', 'preferred', 'excluded', 'fixed', 'transferAt', 'secondTransferAt']) {
      const field = retained.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`); if (field) field.value = '';
    }
    for (const option of retained.querySelectorAll<HTMLOptionElement>('[name="lines"] option')) option.selected = false;
    (retained.querySelector('[name="transfers"]') as HTMLSelectElement).value = '2';
  }
  if (TRANSIT_SERVICE_URL) {
    for (const label of container.querySelectorAll<HTMLElement>('.simple-route-form > .station-field')) bindStationSearch(label, data);
  } else bindStationSearch(container as HTMLElement, data);
  const transfers = container.querySelector<HTMLSelectElement>('[name="transfers"]')!;
  const second = container.querySelector<HTMLElement>('#second-transfer-picker')!;
  const toggleSecond = () => { second.hidden = transfers.value !== '2'; for (const field of second.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) field.disabled = second.hidden; };
  transfers.addEventListener('change', toggleSecond); toggleSecond();
}
