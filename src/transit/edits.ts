import type { Timetable } from './types';
export interface TimetableEdit { tripId: string; stops: { sequence: number; stopId?: string; arrival: number | null; departure: number | null }[] }
export function applyEdits(data: Timetable, edits: TimetableEdit[]): Timetable {
  const byId = new Map(edits.map(e => [e.tripId, e]));
  return { ...data, trips: data.trips.map(t => {
    const edit = byId.get(t.id); if (!edit) return t;
    if (t.readOnly) throw new Error('この公式時刻表は利用条件により時刻を補正できません');
    if (edit.stops.length !== t.stops.length || edit.stops.some((s, i) => s.sequence !== t.stops[i].sequence || s.stopId && s.stopId !== t.stops[i].stopId)) throw new Error('時刻補正の停車順が更新されています。補正を解除してください');
    let previous = -1;
    const stops = t.stops.map((s, i) => {
      const next = edit.stops[i];
      for (const value of [next.arrival, next.departure]) {
        if (value === null) continue;
        if (!Number.isInteger(value) || value < previous || value < 0 || value > 71 * 3600 + 3599) throw new Error('到着・発車時刻の順序と範囲を確認してください');
        previous = value;
      }
      return { ...s, arrival: next.arrival, departure: next.departure };
    });
    if (!stops.some(s => s.departure !== null)) throw new Error('発車時刻を1つ以上入力してください');
    return { ...t, stops };
  }) };
}
export function retainEdits(data: Timetable, edits: TimetableEdit[]): TimetableEdit[] {
  return edits.filter(e => { const trip = data.trips.find(t => t.id === e.tripId); return trip && !trip.readOnly && trip.stops.length === e.stops.length && trip.stops.every((s, i) => s.sequence === e.stops[i].sequence && (!e.stops[i].stopId || s.stopId === e.stops[i].stopId)); });
}
