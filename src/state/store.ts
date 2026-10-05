import type { FavoriteRoute, Settings, Timetable } from '../transit/types';
import type { StoragePort } from './persistence';
import { inWindow, jstDate, jstWeekday } from '../utils/time';
export const SETTINGS_KEY = 'transit-hud.settings.v1';
export const DATA_KEY = 'transit-hud.timetable.v1';
export function emptySettings(): Settings { return { schema: 1, favorites: [], activeId: '', refreshSeconds: 15, useRealtime: false }; }
export function validateFavorite(f: FavoriteRoute, data: Timetable): void {
  if (!f.name.trim() || Array.from(f.name).length > 24) throw new Error('表示名は1〜24文字にしてください');
  const ids = new Set(data.stations.map(s => s.id));
  if (!ids.has(f.from) || !ids.has(f.to) || f.from === f.to || f.via.some(v => !ids.has(v)) || f.transferAt && !ids.has(f.transferAt)) throw new Error('出発・到着・経由駅を確認してください');
  if (![f.walkingMinutes, f.bufferMinutes, f.transferMinutes].every(n => Number.isFinite(n) && n >= 0 && n <= 120)) throw new Error('徒歩・余裕時間は0〜120分にしてください');
  if (![0, 1].includes(f.maxTransfers)) throw new Error('乗換は0回または1回にしてください');
  const lines = new Set(data.lines.map(l => l.id));
  if ([...f.lineIds, ...f.preferredLines, ...f.excludedLines, ...f.fixedPath].some(id => !lines.has(id))) throw new Error('路線IDを確認してください');
  if (f.fixedPath.length > f.maxTransfers + 1) throw new Error('固定経路の路線数が最大乗換回数を超えています');
  if (!['', '0', '1'].includes(f.direction) || !f.days.length || f.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('方面・使用曜日を確認してください');
  if (f.auto) {
    inWindow(Date.now(), f.auto.start, f.auto.end);
    if (!f.auto.days.length || f.auto.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('自動切替の曜日を確認してください');
  }
}
export async function readSettings(port: StoragePort): Promise<Settings> {
  const raw = await port.get(SETTINGS_KEY);
  if (!raw) return emptySettings();
  const s = JSON.parse(raw) as Settings;
  if (s.schema !== 1 || !Array.isArray(s.favorites) || s.favorites.length > 8
    || !Number.isFinite(s.refreshSeconds) || s.refreshSeconds < 10 || s.refreshSeconds > 60
    || typeof s.useRealtime !== 'boolean' || typeof s.activeId !== 'string') throw new Error('設定の形式が不正です');
  return s;
}
export function autoFavorite(settings: Settings, now: number, manualDate: string | null): string {
  if (manualDate === jstDate(now)) return settings.activeId;
  return settings.favorites.find(f => f.days.includes(jstWeekday(jstDate(now))) && f.auto?.days.includes(jstWeekday(jstDate(now)))
    && inWindow(now, f.auto.start, f.auto.end))?.id ?? settings.activeId;
}
