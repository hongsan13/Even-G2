import type { Timetable } from '../transit/types';
export function normalizedName(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s・]/g, '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
export function stationLabels(data: Timetable): Map<string, string> {
  const stationMap = new Map(data.stations.map(s => [s.id, s]));
  const lineMap = new Map(data.lines.map(l => [l.id, l.name]));
  const usage = new Map<string, Set<string>>();
  for (const trip of data.trips) for (const stop of trip.stops) {
    for (const id of [stop.stopId, stationMap.get(stop.stopId)?.parentId].filter(Boolean) as string[]) {
      const set = usage.get(id) ?? new Set<string>(); set.add(lineMap.get(trip.routeId) ?? trip.routeId); usage.set(id, set);
    }
  }
  return new Map(data.stations.map(s => [s.id, `${s.name}${usage.get(s.id)?.size ? ` · ${[...usage.get(s.id)!].join(' / ')}` : ''}${s.platform ? ` · ${s.platform}番線` : ''}`]));
}
/** A native select remains available on iOS; typing filters and selects unique matches. */
export function bindStationSearch(container: HTMLElement, data: Timetable): void {
  const stationMap = new Map(data.stations.map(s => [s.id, s]));
  for (const input of container.querySelectorAll<HTMLInputElement>('[data-station-search]')) {
    const select = container.querySelector<HTMLSelectElement>(`select[name="${input.dataset.stationSearch}"]`)!;
    const all = [...select.options].map(o => ({ value: o.value, label: o.text, selected: o.selected }));
    input.addEventListener('input', () => {
      const term = normalizedName(input.value), previous = select.value;
      const filtered = all.filter(o => !o.value || normalizedName(stationMap.get(o.value)?.name ?? o.label).includes(term) || o.value.toLocaleLowerCase().includes(term));
      select.replaceChildren(...filtered.map(o => new Option(o.label, o.value)));
      const exact = filtered.filter(o => o.value && (normalizedName(stationMap.get(o.value)?.name ?? '') === term || normalizedName(o.value) === term));
      if (exact.length === 1) select.value = exact[0].value;
      else if (filtered.filter(o => o.value).length === 1) select.value = filtered.find(o => o.value)!.value;
      else if (filtered.some(o => o.value === previous)) select.value = previous;
      else if (term && !filtered.some(o => o.value === previous)) { select.prepend(new Option('候補から選択してください', '')); select.value = ''; }
      input.setCustomValidity(!term || select.value ? '' : filtered.some(o => o.value) ? '候補のプルダウンから駅を選択してください' : '一致する駅がありません。保存済みデータの駅名を入力してください');
      if (filtered.length > 1 && exact.length !== 1 && term) input.setAttribute('aria-description', '候補のプルダウンから駅を選択してください');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    select.addEventListener('change', () => { if (select.value || !input.value) input.setCustomValidity(''); });
  }
}
