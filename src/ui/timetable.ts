import type { Timetable } from '../transit/types';
import { escapeHtml as e } from './settings';
import { bindStationSearch, stationLabels } from './stations';
const serviceTime = (value: number | null) => value === null ? '' : `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value % 3600 / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export function timetableEditor(root: HTMLElement, data: Timetable | null): void {
  const container = root.querySelector<HTMLElement>('#timetable-editor')!;
  if (!data) { container.textContent = '先に時刻表を追加してください。'; return; }
  const labels = stationLabels(data);
  container.innerHTML = `<label>便を探す駅<input type="search" data-station-search="editStation" aria-label="補正する駅を検索" placeholder="駅名を入力"><select name="editStation">${data.stations.map(s => `<option value="${e(s.id)}">${e(labels.get(s.id)!)}</option>`).join('')}</select></label><label>補正する便<select id="edit-trip"></select></label><div id="edit-stop-times"></div>`;
  const station = container.querySelector<HTMLSelectElement>('[name="editStation"]')!;
  const tripSelect = container.querySelector<HTMLSelectElement>('#edit-trip')!;
  function renderTrip(): void {
    const trip = data!.trips.find(t => t.id === tripSelect.value);
    const form = container.querySelector('#edit-stop-times')!;
    if (!trip) { form.textContent = 'この駅の便がありません。'; return; }
    form.innerHTML = `<form id="timetable-form"><input type="hidden" name="tripId" value="${e(trip.id)}"><div class="stop-time-list">${trip.stops.map(s => `<div class="stop-time-row"><strong>${e(data!.stations.find(x => x.id === s.stopId)?.name ?? s.stopId)}</strong><label>到着<input name="arrival-${s.sequence}" value="${serviceTime(s.arrival)}" placeholder="HH:MM:SS"></label><label>発車<input name="departure-${s.sequence}" value="${serviceTime(s.departure)}" placeholder="HH:MM:SS"></label></div>`).join('')}</div><p class="hint">空欄は時刻未記載。翌日分は24:05:00のように入力してください。</p><button type="submit">この便の時刻補正を保存</button><button type="button" data-action="reset-edits" class="secondary">すべての時刻補正を解除</button></form>`;
  }
  function renderTrips(): void {
    const trips = data!.trips.filter(t => t.stops.some(s => s.stopId === station.value)).sort((a, b) => {
      const departure = (t: typeof a) => t.stops.find(s => s.stopId === station.value)?.departure ?? Infinity;
      return departure(a) - departure(b);
    });
    tripSelect.innerHTML = trips.map(t => `<option value="${e(t.id)}">${serviceTime(t.stops.find(s => s.stopId === station.value)?.departure ?? null)} · ${e(data!.lines.find(l => l.id === t.routeId)?.name ?? '')} · ${e(t.headsign)} · ${e(t.serviceId)} · ${e(t.id)}</option>`).join(''); renderTrip();
  }
  station.addEventListener('change', renderTrips); tripSelect.addEventListener('change', renderTrip);
  bindStationSearch(container, data); renderTrips();
}

export function transferEditor(root: HTMLElement, data: Timetable | null): void {
  const container = root.querySelector<HTMLElement>('#transfer-editor')!;
  if (!data) { container.textContent = '先に時刻表を追加してください。'; return; }
  const labels = stationLabels(data);
  const picker = (name: string, title: string) => `<label>${title}<input type="search" data-station-search="${name}" aria-label="${title}を検索"><select name="${name}">${data.stations.map(s => `<option value="${e(s.id)}">${e(labels.get(s.id)!)}</option>`).join('')}</select></label>`;
  container.innerHTML = `<form id="transfer-form">${picker('linkFrom', '降りる駅')}${picker('linkTo', '乗り換える駅')}<label>駅間の徒歩・乗換時間（分）<input type="number" name="minutes" min="1" max="120" required></label><label class="check"><input name="both" type="checkbox" checked>逆方向も同じ時間で連絡する</label><label class="check"><input type="checkbox" name="confirmed" required>実際に乗換できる駅と所要時間を確認しました</label><button type="submit">乗換の連絡を保存</button><button type="button" data-action="reset-links" class="secondary">手動の乗換連絡をすべて解除</button></form>`;
  bindStationSearch(container, data);
}
