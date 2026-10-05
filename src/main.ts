import { DeviceConnectType, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import './ui/styles.css';
import { connectBridge } from './even/bridge';
import { G2Renderer, hudModel } from './even/renderer';
import { inputAction } from './even/inputs';
import { MENU_NEXT, MENU_PREVIOUS, MENU_ROUTE_BASE } from './even/menu';
import { BrowserStorage, NativeStorage, CacheStorage, ChunkStorage, CompressedStorage, DurableCache, openCache, type StoragePort } from './state/persistence';
import { readSettings, emptySettings, validateFavorite, autoFavorite, SETTINGS_KEY, DATA_KEY } from './state/store';
import { mountSettings, updateHud, updateFavoriteControls, favoriteEditor, escapeHtml } from './ui/settings';
import { JourneySearch } from './transit/search';
import { selectNextDepartures, recommendedDeparture } from './transit/departureSelector';
import { dataExpired, freshRealtime } from './transit/timetable';
import { demoTimetable, demoFavorites } from './transit/demo';
import { manualTimetable, manualFavorites, type ManualInput } from './transit/manual';
import { importGtfs, refreshGtfs, publicHttpsUrl, type RemoteCache } from './transit/gtfs/loader';
import { decodeRealtime, fetchRealtime } from './transit/realtime';
import type { Departure, FavoriteRoute, Settings, RealtimeUpdate, Journey, Timetable } from './transit/types';
import { jstDate, jstWeekday, clock } from './utils/time';
import { FEED_CATALOG, TOEI_FEED, PUBLIC_FEED_ORIGINS } from './config';
import { savedFeeds, putFeed, mergeFeeds, type SavedFeed } from './transit/feeds';
import { applyEdits, retainEdits, type TimetableEdit } from './transit/edits';
import { timetableEditor, transferEditor } from './ui/timetable';
import { parseServiceTime } from './utils/time';

const root = document.querySelector<HTMLElement>('#app')!;
mountSettings(root);
let bridge: EvenAppBridge | null = null, renderer: G2Renderer | null = null;
let settings = emptySettings(), cache: RemoteCache | undefined;
let preferences: StoragePort = new BrowserStorage(), cachePort: StoragePort = preferences;
let selectedId: string | null = null, riding: Departure | undefined;
let updates: RealtimeUpdate[] = [], realtimeNote = 'Realtime未取得 · 予定時刻';
let manualDate: string | null = null, busy = false, glassActive = true;
let initializing = true;
let departures: Departure[] = [], computed: Journey[] = [], computedKey = '', computedAt = 0;
let interval: ReturnType<typeof setInterval> | undefined;
let autoUpdate = true;
let remote = { gtfsUrl: '', realtimeUrl: '' }, lastRemoteCheck = 0, lastRealtimeCheck = 0;
let storageLabel = '未確認', nativeLabel = '接続確認中';
const dataset = () => cache?.data ?? null;
const active = () => settings.favorites.find(f => f.id === settings.activeId);
function message(text: string, error = false): void {
  const element = root.querySelector('#status')!;
  element.textContent = text; element.classList.toggle('error', error);
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '処理に失敗しました'; }
const search = new JourneySearch();
let searchGeneration = 0, searching = false, searchError = '';
function invalidate(): void { searchGeneration++; search.cancel(); computedKey = ''; computed = []; searching = false; searchError = ''; }
function metadata(): void {
  const data = dataset();
  root.querySelector('#dataset')!.innerHTML = data ? `<strong>${escapeHtml(data.title)}</strong><br>${data.demo ? '⚠ 架空データ。乗車案内には使えません。<br>' : ''}
    ${data.stations.length}駅 / ${data.lines.length}路線 / ${data.trips.length}便<br>
    出典: ${escapeHtml(data.source)}<br>利用条件: ${escapeHtml(data.license)}<br>
    最終取込: ${jstDate(data.importedAt)} ${clock(data.importedAt)} JST<br>有効終了: ${escapeHtml(data.validUntil ?? 'フィード内の運行日による')}<br>版: ${escapeHtml(data.version ?? '記載なし')}`
    : '時刻表はまだ登録されていません。公式に利用可能なGTFS ZIPを端末から取り込むか、時刻表を手入力してください。';
  root.querySelector('#feed-list')!.innerHTML = savedFeeds(cache).map(f => `<div class="feed-row"><strong>${escapeHtml(f.data.title)}</strong><small>版 ${escapeHtml(f.data.version ?? '記載なし')} · 有効終了 ${escapeHtml(f.data.validUntil ?? '記載なし')} · ${f.url ? new URL(f.url).searchParams.has('date') ? '日付固定版・最新版はカタログ確認' : 'オンライン更新可' : 'ファイルから更新'}${dataExpired(f.data, Date.now()) ? ' · 有効期限切れ' : ''}</small><small>最終確認 ${f.checkedAt ? `${jstDate(f.checkedAt)} ${clock(f.checkedAt)}` : 'オンライン未確認（同梱データ）'}</small><button type="button" data-remove-feed="${escapeHtml(f.feedId)}" class="danger">この地域のデータを削除</button></div>`).join('');
  const targets = root.querySelector<HTMLSelectElement>('[name="feedTarget"]')!;
  const previousTarget = targets.value;
  targets.innerHTML = '<option value="">新しい配布元として追加</option>' + savedFeeds(cache).map(f => `<option value="${escapeHtml(f.feedId)}">${escapeHtml(f.data.title)}</option>`).join('');
  targets.value = previousTarget;
  root.querySelector<HTMLInputElement>('#auto-update')!.checked = autoUpdate;
  root.querySelector('#connection')!.textContent = nativeLabel;
  root.querySelector('#debug')!.textContent = `Transit HUD 0.2.1\nSDK 0.0.16 / Even App >= 2.2.10\n保存: ${storageLabel}\nG2: ${nativeLabel}\nTimezone: Asia/Tokyo\nGTFS: ${data ? `${data.demo ? 'DEMO' : 'USER DATA'} / ${data.trips.length} trips` : 'none'}\nRealtime: ${realtimeNote}\n最大乗換: 2 / 最大お気に入り: 8\n外部配信元: ${PUBLIC_FEED_ORIGINS.length}\n位置情報・マイク・解析通信: なし`;
}
function refreshControls(preserveEditor = false): void {
  const previous = preserveEditor ? root.querySelector<HTMLFormElement>('#favorite-form') : null;
  const draft = previous ? new FormData(previous) : null;
  const searches = previous ? [...previous.querySelectorAll<HTMLInputElement>('[data-station-search]')].map(i => [i.dataset.stationSearch!, i.value]) : [];
  const editing = draft ? settings.favorites.find(f => f.id === draft.get('id')) : undefined;
  updateFavoriteControls(root, settings); favoriteEditor(root, dataset(), editing);
  if (draft) {
    const form = root.querySelector<HTMLFormElement>('#favorite-form');
    for (const element of form?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]') ?? []) {
      const values = draft.getAll(element.name).map(String);
      if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = values.includes(element.value);
      else if (element instanceof HTMLSelectElement && element.multiple) for (const option of element.options) option.selected = values.includes(option.value);
      else if (values.length) element.value = values[0];
    }
    form?.querySelector<HTMLSelectElement>('[name="transfers"]')?.dispatchEvent(new Event('change'));
    for (const [name, value] of searches) { const input = form?.querySelector<HTMLInputElement>(`[data-station-search="${name}"]`); if (input) input.value = value; }
  }
  const form = root.querySelector<HTMLFormElement>('#preferences-form')!;
  (form.elements.namedItem('refresh') as HTMLSelectElement).value = String(settings.refreshSeconds);
  (form.elements.namedItem('realtime') as HTMLInputElement).checked = settings.useRealtime;
  metadata(); timetableEditor(root, dataset()); transferEditor(root, dataset());
}
function draw(now = Date.now()): void {
  const data = dataset(), favorite = active();
  let note = data ? `時刻表 ${Math.max(0, Math.floor((now - data.importedAt) / 3_600_000))}時間前 · ${realtimeNote}` : '';
  const expired = data ? dataExpired(data, now) : false;
  if (expired) note = '！時刻表の有効期限切れ · 更新してください';
  let validRoute = true;
  if (data && favorite) { try { validateFavorite(favorite, data); } catch { validRoute = false; } }
  const usable = favorite && validRoute && favorite.days.includes(jstWeekday(jstDate(now)));
  if (data && favorite && usable && !expired) {
    const key = `${data.id}:${JSON.stringify(favorite)}:${settings.useRealtime}:${freshRealtime(updates, now).length}`;
    if (key !== computedKey || now - computedAt >= 60_000) {
      const generation = ++searchGeneration;
      if (key !== computedKey) computed = [];
      computedKey = key; computedAt = now; searching = true; searchError = '';
      void search.search(data, favorite, now, settings.useRealtime ? updates : []).then(result => {
        if (generation !== searchGeneration) return;
        computed = result; searching = false; draw();
      }).catch(error => {
        if (generation !== searchGeneration) return;
        searching = false; searchError = errorMessage(error); message(searchError, true); draw();
      });
    }
    departures = selectNextDepartures(computed, now, favorite.walkingMinutes, favorite.bufferMinutes);
  } else departures = [];
  // Once a pinned train departs, return to automatic selection.
  if (selectedId && !departures.some(d => d.journey.id === selectedId)) selectedId = null;
  const model = hudModel(data, favorite, departures, selectedId, now, note, riding);
  if (!validRoute && !riding) { model.action = '更新後のルートを確認'; model.primary = '駅や路線が変更されています。編集してください'; }
  if (favorite && validRoute && !usable && !riding) { model.action = '登録ルートの使用曜日外'; model.primary = '別のルートを選択'; }
  if (expired && !riding) { model.action = '時刻表の有効期限切れ'; model.primary = 'スマホで更新してください'; }
  if (searching && !riding) { model.action = '経路を検索しています…'; if (!departures.length) model.primary = '画面を操作しながらお待ちください'; }
  if (searchError && !riding) { model.action = '経路検索エラー'; model.primary = searchError; }
  if (cache?.edits?.length) model.footer += '\n手動補正あり（公式時刻ではありません）';
  updateHud(root, model);
  const shown = departures.filter(d => d.reachable).sort((a, b) => a.journey.arrival - b.journey.arrival || a.departureTime - b.departureTime).slice(0, 3);
  root.querySelector('#journey-results')!.innerHTML = shown.map(d => `<article class="journey-card"><button type="button" class="secondary" data-journey="${escapeHtml(d.journey.id)}">${clock(d.departureTime)}発 → ${clock(d.journey.arrival)}${d.journey.legs.at(-1)?.arrivalEstimated ? '着目安' : '着'} · 乗換${d.journey.transfers}回</button><p>家を出る目安 ${clock(d.leaveAt)} · 徒歩${favorite?.walkingMinutes ?? 0}分＋余裕${favorite?.bufferMinutes ?? 0}分</p>${d.journey.legs.map((l, i) => `<p>${i ? '乗換 → ' : ''}${escapeHtml(data!.stations.find(s => s.id === l.from)?.name ?? l.from)} ${clock(l.departure)} → ${escapeHtml(data!.stations.find(s => s.id === l.to)?.name ?? l.to)} ${clock(l.arrival)}${l.arrivalEstimated ? '着目安' : '着'}<br><small>${escapeHtml(data!.lines.find(x => x.id === l.routeId)?.name ?? l.routeId)} · ${escapeHtml(l.headsign)}</small></p>`).join('')}</article>`).join('');
  root.querySelector('[data-action="board"]')!.textContent = riding ? '乗車モードを終了' : 'この便に乗車';
  root.querySelector('#journey-note')!.textContent = riding ? '手動乗車モード：予定時刻で行動を切り替えています。実際の乗車・降車は検知していません。' : 'Tap：次の候補 · Scroll：前後 · 長押し：公式メニュー · ダブルTap：終了';
  if (renderer && glassActive) void renderer.render(model, settings.favorites).catch(error => {
    nativeLabel = 'G2表示エラー'; metadata(); message(errorMessage(error), true);
  });
}
async function saveSettings(next: Settings): Promise<void> {
  await preferences.set(SETTINGS_KEY, JSON.stringify(next));
  settings = next; refreshControls(); invalidate(); draw();
}
async function selectRoute(id: string, manual = true): Promise<void> {
  if (!settings.favorites.some(f => f.id === id)) return;
  await saveSettings({ ...settings, activeId: id });
  if (manual) { manualDate = jstDate(Date.now()); await preferences.set('transit-hud.manual-date', manualDate); }
  selectedId = null; riding = undefined; draw();
}
function candidate(): Departure | undefined {
  return departures.find(d => d.journey.id === selectedId) ?? recommendedDeparture(departures);
}
function move(delta: number): void {
  if (riding || !departures.length) return;
  const current = candidate(), i = departures.findIndex(d => d === current);
  selectedId = departures[(i + delta + departures.length) % departures.length].journey.id; draw();
}
async function replaceData(next: Timetable | null, favorites: FavoriteRoute[] = [], nextCache?: RemoteCache): Promise<void> {
  const previous = cache, previousSettings = settings;
  const changed = next ? nextCache ?? { data: next, checkedAt: Date.now() } : undefined;
  await cachePort.set(DATA_KEY, changed ? JSON.stringify(changed) : '');
  try { await preferences.set(SETTINGS_KEY, JSON.stringify({ ...settings, favorites, activeId: favorites[0]?.id ?? '' })); }
  catch (error) {
    await cachePort.set(DATA_KEY, previous ? JSON.stringify(previous) : '');
    throw error;
  }
  cache = changed; settings = { ...previousSettings, favorites, activeId: favorites[0]?.id ?? '' };
  selectedId = null; riding = undefined; updates = []; realtimeNote = 'Realtime未取得 · 予定時刻';
  refreshControls(); invalidate(); draw();
}
async function run(action: () => Promise<void> | void): Promise<void> {
  if (initializing) { message('初期化中です。接続確認が終わるまでお待ちください。'); return; }
  if (busy) { message('処理中です。完了後に操作してください。'); return; }
  busy = true; root.setAttribute('aria-busy', 'true');
  try { await action(); }
  catch (error) { message(errorMessage(error), true); }
  finally { busy = false; root.removeAttribute('aria-busy'); }
}
async function installFeed(next: SavedFeed): Promise<void> {
  let merged = putFeed(cache, next);
  const edits = retainEdits(merged.data, cache?.edits ?? []);
  const dropped = (cache?.edits?.length ?? 0) - edits.length;
  const droppedLinks = (cache?.links?.length ?? 0) - (merged.links?.length ?? 0);
  merged = { ...merged, edits, data: applyEdits(merged.data, edits) };
  await cachePort.set(DATA_KEY, JSON.stringify(merged)); cache = merged;
  updates = []; selectedId = null; riding = undefined;
  refreshControls(true); invalidate(); draw();
  if (droppedLinks) message('更新で駅が変わったため、一部の手動乗換連絡を解除しました。');
  if (dropped) message(`${dropped}件の時刻補正は便・停車順の変更で解除しました。ルートを確認してください。`);
}
async function downloadFeed(feed: typeof TOEI_FEED): Promise<void> {
  const existing = savedFeeds(cache).find(f => f.feedId === feed.id);
  message(`${feed.title}を公式配信元から取得しています…`);
  const result = await refreshGtfs(feed.url, PUBLIC_FEED_ORIGINS, feed, existing);
  if (result.fallback) { message('通信に失敗しました。保存済み時刻表を使用します。', true); return; }
  await installFeed({ ...result.cache, feedId: feed.id, url: feed.url });
  message('公式時刻表を保存しました。お気に入りは編集できます。');
}
async function refreshRemote(): Promise<void> {
  let feeds = savedFeeds(cache);
  if (!feeds.some(f => f.url)) throw new Error('公式データ一覧から配布元を追加するか、公開URLを登録してください');
  message('保存済み時刻表の更新を確認しています…');
  const failures: string[] = [];
  for (const feed of feeds.filter(f => f.url)) {
    const meta = FEED_CATALOG.find(f => f.url === feed.url) ?? feed.data;
    const result = await refreshGtfs(feed.url!, PUBLIC_FEED_ORIGINS, meta, feed);
    if (result.fallback) { failures.push(feed.data.title); continue; }
    // Commit each downloaded provider atomically, retaining the others offline.
    await installFeed({ ...result.cache, feedId: feed.feedId, url: feed.url });
  }
  message(failures.length ? `通信障害：${failures.join('・')}は保存済み時刻表を使用します。` : '時刻表の更新確認が完了しました。ルートはいつでも編集できます。', !!failures.length);
}
async function refreshRealtime(): Promise<void> {
  if (!settings.useRealtime || !remote.realtimeUrl || !cache) return;
  try {
    const result = await fetchRealtime(remote.realtimeUrl, PUBLIC_FEED_ORIGINS, cache.data, Date.now());
    updates = result.updates; realtimeNote = `Realtime取得済み${updates.some(u => u.canceled) ? ' · 運休を除外' : ''}${result.warnings.length ? ' · 一部未対応' : ''}`;
    if (result.warnings.length) message(result.warnings.join(' / '));
  } catch (error) {
    updates = []; realtimeNote = 'Realtime障害 · 予定時刻'; message(`${errorMessage(error)}。予定時刻で継続します。`, true);
  }
  invalidate(); draw(); metadata();
}
function startTimer(): void {
  if (interval) clearInterval(interval);
  interval = setInterval(() => {
    const now = Date.now();
    if (freshRealtime(updates, now).length !== updates.length) { updates = freshRealtime(updates, now); realtimeNote = 'Realtime期限切れ · 予定時刻'; invalidate(); }
    const id = autoFavorite(settings, now, manualDate);
    if (!busy && !riding && id !== settings.activeId) void run(() => selectRoute(id, false));
    draw(now);
    if (!busy && autoUpdate && savedFeeds(cache).some(f => f.url) && !root.querySelector('#favorite-form:focus-within, #timetable-form:focus-within') && now - lastRemoteCheck > 86_400_000) {
      lastRemoteCheck = now; void run(refreshRemote);
    } else if (!busy && settings.useRealtime && remote.realtimeUrl && now - lastRealtimeCheck > 60_000) {
      lastRealtimeCheck = now; void run(refreshRealtime);
    }
  }, settings.refreshSeconds * 1000);
}

root.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled || button.type === 'submit' && button.closest('form')) return;
  void run(async () => {
    if (button.dataset.removeFeed) {
      const feeds = savedFeeds(cache).filter(f => f.feedId !== button.dataset.removeFeed);
      let next: RemoteCache | undefined;
      if (feeds.length) { const merged = mergeFeeds(feeds); const ids = new Set(merged.data.stations.map(s => s.id)); const links = (cache?.links ?? []).filter(l => ids.has(l.from) && ids.has(l.to)); const edits = retainEdits(merged.data, cache?.edits ?? []); next = { ...mergeFeeds(feeds, links), edits, data: applyEdits(mergeFeeds(feeds, links).data, edits) }; }
      await cachePort.set(DATA_KEY, next ? JSON.stringify(next) : ''); await preferences.set('transit-hud.initial-data', 'disabled'); cache = next; updates = []; selectedId = null; riding = undefined; refreshControls(); invalidate(); draw(); message('地域のデータを削除しました。保存ルートの駅を確認してください。');
    }
    else if (button.dataset.journey) { selectedId = button.dataset.journey; draw(); }
    else if (button.dataset.route) await selectRoute(button.dataset.route);
    else if (button.dataset.edit) favoriteEditor(root, dataset(), settings.favorites.find(f => f.id === button.dataset.edit));
    else if (button.dataset.delete) {
      const favorites = settings.favorites.filter(f => f.id !== button.dataset.delete);
      await saveSettings({ ...settings, favorites, activeId: favorites.some(f => f.id === settings.activeId) ? settings.activeId : favorites[0]?.id ?? '' });
      riding = undefined; selectedId = null; draw();
    } else switch (button.dataset.action) {
      case 'next': move(1); break;
      case 'previous': move(-1); break;
      case 'board': {
        if (riding) riding = undefined;
        else {
          const train = candidate();
          if (!train?.reachable) throw new Error('乗車可能な便を選択してください');
          riding = structuredClone(train);
        }
        draw(); break;
      }
      case 'demo': await replaceData(demoTimetable(), demoFavorites()); message('架空サンプルです。実際の電車への乗車案内には使えません。'); break;
      case 'clear': await preferences.set('transit-hud.initial-data', 'disabled'); await replaceData(null); remote = { gtfsUrl: '', realtimeUrl: '' }; await preferences.set('transit-hud.remote', JSON.stringify(remote)); message('時刻表とお気に入りを削除しました。'); break;
      case 'swap-stations': {
        const form = root.querySelector<HTMLFormElement>('#favorite-form')!;
        const from = (form.elements.namedItem('from') as HTMLSelectElement).value, to = (form.elements.namedItem('to') as HTMLSelectElement).value;
        for (const input of form.querySelectorAll<HTMLInputElement>('[data-station-search="from"], [data-station-search="to"]')) { input.value = ''; input.dispatchEvent(new Event('input')); }
        (form.elements.namedItem('from') as HTMLSelectElement).value = to;
        (form.elements.namedItem('to') as HTMLSelectElement).value = from;
        (form.elements.namedItem('direction') as HTMLSelectElement).value = '';
        break;
      }
      case 'reset-links': {
        if (!cache) break; const merged = mergeFeeds(savedFeeds(cache)); const next = { ...merged, edits: cache.edits, data: applyEdits(merged.data, cache.edits ?? []) }; await cachePort.set(DATA_KEY, JSON.stringify(next)); cache = next; metadata(); invalidate(); draw(); message('手動の乗換連絡を解除しました。'); break;
      }
      case 'reset-edits': {
        if (!cache) break;
        const next = mergeFeeds(savedFeeds(cache), cache.links); await cachePort.set(DATA_KEY, JSON.stringify(next)); cache = next; refreshControls(); invalidate(); draw(); message('時刻補正を解除しました。'); break;
      }
      case 'new-favorite': favoriteEditor(root, dataset()); break;
      case 'refresh': await refreshRemote(); await refreshRealtime(); break;
    }
  });
});
root.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target as HTMLFormElement, fields = new FormData(form);
  const text = (key: string) => String(fields.get(key) ?? '').trim();
  const ids = (key: string) => text(key).split(',').map(s => s.trim()).filter(Boolean);
  const numbers = (key: string) => fields.getAll(key).map(Number);
  void run(async () => {
    switch (form.getAttribute('id')) {
      case 'catalog-form': {
        const feed = FEED_CATALOG.find(f => f.id === text('feed')); if (!feed) throw new Error('配布元を選択してください');
        await downloadFeed(feed); break;
      }
      case 'transfer-form': {
        if (!cache) throw new Error('時刻表がありません');
        const from = text('linkFrom'), to = text('linkTo'), seconds = Number(text('minutes')) * 60;
        if (!fields.has('confirmed')) throw new Error('乗換できる駅と徒歩時間を確認してください');
        const additions = [{ from, to, seconds, prohibited: false }, ...(fields.has('both') ? [{ from: to, to: from, seconds, prohibited: false }] : [])];
        const links = [...(cache.links ?? []).filter(l => !additions.some(a => a.from === l.from && a.to === l.to)), ...additions];
        const merged = mergeFeeds(savedFeeds(cache), links), next = { ...merged, edits: cache.edits, data: applyEdits(merged.data, cache.edits ?? []) };
        await cachePort.set(DATA_KEY, JSON.stringify(next)); cache = next; metadata(); invalidate(); draw(); message('乗換の連絡を保存しました。'); break;
      }
      case 'timetable-form': {
        if (!cache) throw new Error('時刻表がありません');
        const trip = cache.data.trips.find(t => t.id === text('tripId')); if (!trip) throw new Error('補正する便を選択してください');
        const edit: TimetableEdit = { tripId: trip.id, stops: trip.stops.map(s => ({ sequence: s.sequence, stopId: s.stopId,
          arrival: text(`arrival-${s.sequence}`) ? parseServiceTime(text(`arrival-${s.sequence}`)) : null,
          departure: text(`departure-${s.sequence}`) ? parseServiceTime(text(`departure-${s.sequence}`)) : null })) };
        const edits = [...(cache.edits ?? []).filter(e => e.tripId !== trip.id), edit];
        const next = { ...cache, edits, data: applyEdits(mergeFeeds(savedFeeds(cache), cache.links).data, edits) };
        await cachePort.set(DATA_KEY, JSON.stringify(next)); cache = next; metadata(); invalidate(); draw(); message('端末内の時刻補正を保存しました。'); break;
      }
      case 'import-form': {
        const file = fields.get('file') as File;
        if (!file?.size || file.size > 12 * 1024 * 1024) throw new Error('1B〜12MBのGTFS ZIPを選択してください');
        message('GTFSを端末内で解析しています…');
        const data = await importGtfs(await file.arrayBuffer(), { title: text('title'), source: text('source'), license: text('license') });
        if (text('importMode') === 'replace') await replaceData(data);
        else {
          const inferred = file.name === 'Toei-Train-GTFS.zip' ? 'toei' : crypto.randomUUID();
          const feedId = text('feedTarget') || inferred;
          const old = savedFeeds(cache).find(f => f.feedId === feedId);
          await installFeed({ data, checkedAt: Date.now(), feedId, url: old?.url ?? (feedId === 'toei' ? TOEI_FEED.url : undefined) });
        }
        message('GTFSを保存しました。お気に入り移動を登録してください。'); break;
      }
      case 'manual-form': {
        const input = Object.fromEntries(['from', 'to', 'line', 'source', 'start', 'end', 'forwardWeekday', 'forwardWeekend', 'returnWeekday', 'returnWeekend', 'holidays'].map(k => [k, text(k)]));
        const data = manualTimetable({ ...input, duration: Number(text('duration')) } as unknown as ManualInput);
        await replaceData(data, manualFavorites()); message('手入力時刻表を保存しました。到着時刻は所要時間からの推定です。'); break;
      }
      case 'favorite-form': {
        const data = dataset(); if (!data) throw new Error('時刻表がありません');
        const f: FavoriteRoute = { id: text('id') || crypto.randomUUID(), name: text('name') || Array.from(`${data.stations.find(s => s.id === text('from'))?.name ?? ''}→${data.stations.find(s => s.id === text('to'))?.name ?? ''}`).slice(0, 24).join(''), from: text('from'), to: text('to'),
          lineIds: fields.getAll('lines').map(String), direction: text('direction') as FavoriteRoute['direction'], via: [text('via0'), text('via1'), text('via2')].filter(Boolean), transferAt: text('transferAt') || undefined, secondTransferAt: text('transfers') === '2' ? text('secondTransferAt') || undefined : undefined,
          walkingMinutes: Number(text('walk')), bufferMinutes: Number(text('buffer')), transferMinutes: Number(text('transferBuffer')),
          days: numbers('days'), preferredLines: ids('preferred'), excludedLines: ids('excluded'), fixedPath: ids('fixed'),
          maxTransfers: Number(text('transfers')) as 0 | 1 | 2,
          auto: fields.has('auto') ? { days: numbers('autoDays'), start: text('autoStart'), end: text('autoEnd') } : undefined };
        validateFavorite(f, data);
        const favorites = settings.favorites.filter(old => old.id !== f.id); favorites.push(f);
        if (favorites.length > 8) throw new Error('お気に入りは最大8件です');
        await saveSettings({ ...settings, favorites, activeId: f.id }); manualDate = jstDate(Date.now());
        await preferences.set('transit-hud.manual-date', manualDate);
        selectedId = null; riding = undefined; draw(); message('お気に入りを保存しました。');
        (document.activeElement as HTMLElement | null)?.blur();
        root.querySelector('.live-card')?.scrollIntoView({ block: 'start' }); break;
      }
      case 'preferences-form':
        await saveSettings({ ...settings, refreshSeconds: Number(text('refresh')), useRealtime: fields.has('realtime') }); startTimer(); message('表示設定を保存しました。'); break;
      case 'remote-form': {
        const next = { gtfsUrl: text('gtfsUrl'), realtimeUrl: text('realtimeUrl') };
        for (const url of Object.values(next).filter(Boolean)) publicHttpsUrl(url, PUBLIC_FEED_ORIGINS);
        if (next.gtfsUrl) {
          const url = publicHttpsUrl(next.gtfsUrl, PUBLIC_FEED_ORIGINS).href;
          const old = savedFeeds(cache).find(f => f.url === url);
          const title = text('feedTitle') || old?.data.title || '公開GTFS';
          const source = text('feedSource') || old?.data.source;
          const license = text('feedLicense') || old?.data.license;
          if (!source || !license || !fields.has('terms')) throw new Error('出典・利用条件の入力と確認が必要です');
          const result = await refreshGtfs(url, PUBLIC_FEED_ORIGINS, { title, source, license }, old);
          if (result.fallback) throw new Error('取得に失敗しました。保存済みデータを保持します');
          await installFeed({ ...result.cache, feedId: old?.feedId ?? crypto.randomUUID(), url }); message('公開データを追加しました。');
        }
        await preferences.set('transit-hud.remote', JSON.stringify(next)); remote = next;
        await refreshRealtime(); break;
      }
    }
  });
});
root.querySelector<HTMLInputElement>('#auto-update')!.addEventListener('change', () => {
  void run(async () => { autoUpdate = root.querySelector<HTMLInputElement>('#auto-update')!.checked; await preferences.set('transit-hud.auto-update', String(autoUpdate)); message(autoUpdate ? '公式時刻表の自動更新を有効にしました。' : '自動更新を停止しました。保存済み時刻表を使用します。'); });
});
root.querySelector<HTMLInputElement>('#realtime-file')!.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  void run(async () => {
    if (!cache) throw new Error('先に対応するGTFSを取り込んでください');
    if (file.size > 2 * 1024 * 1024) throw new Error('Realtimeファイルは2MB以下にしてください');
    try {
      const result = decodeRealtime(new Uint8Array(await file.arrayBuffer()), cache.data, Date.now());
      updates = result.updates; realtimeNote = `Realtimeファイル取得済み${updates.some(u => u.canceled) ? ' · 運休を除外' : ''}`;
      await saveSettings({ ...settings, useRealtime: true });
      message(result.warnings.join(' / ') || 'Realtimeを適用しました（2分間有効）。');
    } catch (error) { updates = []; realtimeNote = 'Realtime障害 · 予定時刻'; invalidate(); draw(); throw error; }
    invalidate(); draw(); metadata();
  });
});

async function initialize(): Promise<void> {
  draw();
  bridge = await connectBridge();
  if (bridge) { preferences = new NativeStorage(bridge); renderer = new G2Renderer(bridge); nativeLabel = 'Even App接続済み'; }
  else nativeLabel = 'ブラウザ · G2未接続';
  let browserCache: StoragePort | undefined;
  try { browserCache = new CacheStorage(await openCache()); } catch { /* Use host storage. */ }
  const compressed = new CompressedStorage(new ChunkStorage(preferences));
  cachePort = bridge ? new DurableCache(compressed, browserCache) : browserCache ?? compressed;
  storageLabel = bridge ? '公式SDK圧縮保存（時刻表・設定）' : browserCache ? 'IndexedDB（時刻表） + ブラウザ（設定）' : '圧縮分割保存';
  try {
    settings = await readSettings(preferences);
    const raw = await cachePort.get(DATA_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as RemoteCache;
      if (saved.data?.schema !== 1 || saved.data.timezone !== 'Asia/Tokyo' || !Array.isArray(saved.data.trips)) throw new Error('保存済み時刻表の形式が不正です');
      cache = saved;
      // Keep favorites after a timetable revision; invalid references are shown for editing.
      cache = { ...saved, data: saved.edits?.length ? applyEdits(saved.data, saved.edits) : saved.data };
    }
    const remoteRaw = await preferences.get('transit-hud.remote');
    if (remoteRaw) {
      const saved = JSON.parse(remoteRaw) as typeof remote;
      for (const url of Object.values(saved).filter(Boolean)) publicHttpsUrl(url, PUBLIC_FEED_ORIGINS);
      remote = saved;
    }
    manualDate = await preferences.get('transit-hud.manual-date');
    autoUpdate = (await preferences.get('transit-hud.auto-update')) !== 'false';
    if (cache) message(cache.data.demo ? '架空サンプルが保存されています。乗車案内には使えません。' : '保存済み時刻表を読み込みました。');
  } catch (error) { settings = emptySettings(); message(`保存内容を読み込めませんでした。${errorMessage(error)}。時刻表を再登録してください。`, true); }
  if (!cache && await preferences.get('transit-hud.initial-data') !== 'disabled') {
    try {
      message('都営全線の初期時刻表を準備しています…');
      const response = await fetch(TOEI_FEED.bundle); if (!response.ok) throw new Error('初期時刻表を読み込めません');
      const data = await importGtfs(await response.arrayBuffer(), TOEI_FEED);
      await installFeed({ data, checkedAt: 0, feedId: 'toei', url: TOEI_FEED.url });
      message('都営全線を準備しました。出発駅と到着駅を選択してください。');
    } catch (error) { message(errorMessage(error), true); }
  }
  refreshControls(); draw(); startTimer(); initializing = false;
  if (autoUpdate && savedFeeds(cache).some(f => f.url)) { lastRemoteCheck = Date.now(); void run(refreshRemote); }
  if (bridge) {
    bridge.onEvenHubEvent(event => {
      const action = inputAction(event); if (!action) return;
      if (action.kind === 'exit') {
        glassActive = false; renderer?.pause();
        if (event.sysEvent?.eventType === 3 || event.textEvent?.eventType === 3) void bridge!.shutDownPageContainer(1).catch(e => message(errorMessage(e), true));
        return;
      }
      if (action.kind === 'background') { glassActive = false; renderer?.pause(); return; }
      if (action.kind === 'foreground') { glassActive = true; renderer?.resume(); invalidate(); draw(); return; }
      void run(async () => {
        if (action.kind === 'next') move(1);
        else if (action.kind === 'previous') move(-1);
        else if (action.kind === 'menu') {
          if (action.id === MENU_NEXT) move(1);
          else if (action.id === MENU_PREVIOUS) move(-1);
          else if (settings.favorites[action.id - MENU_ROUTE_BASE]) await selectRoute(settings.favorites[action.id - MENU_ROUTE_BASE].id);
        }
      });
    });
    bridge.onDeviceStatusChanged(status => {
      if (status.connectType === DeviceConnectType.Connected) { nativeLabel = 'G2接続済み'; renderer?.resume(); glassActive = true; draw(); }
      else { nativeLabel = 'G2接続待ち'; renderer?.pause(); }
      metadata();
    });
  }
}
void initialize().catch(error => { initializing = false; nativeLabel = '初期化エラー'; metadata(); message(errorMessage(error), true); });
