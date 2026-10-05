export const MINUTE = 60_000;
export const DAY = 86_400_000;
const JST = 9 * 60 * MINUTE;
export function jstDate(timestamp: number): string {
  return new Date(timestamp + JST).toISOString().slice(0, 10).replaceAll('-', '');
}
export function serviceMidnight(date: string): number {
  if (!/^\d{8}$/.test(date)) throw new Error('日付はYYYYMMDDで指定してください');
  const ms = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)) - JST;
  if (jstDate(ms) !== date) throw new Error('無効な日付です');
  return ms;
}
export function addDays(date: string, offset: number): string { return jstDate(serviceMidnight(date) + offset * DAY); }
export function jstWeekday(date: string): number { return new Date(serviceMidnight(date) + JST).getUTCDay(); }
export function parseServiceTime(time: string): number {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(time);
  if (!match || +match[1] > 71) throw new Error(`未対応の時刻: ${time} (0〜71時)`);
  return +match[1] * 3600 + +match[2] * 60 + +match[3];
}
export function clock(time: number): string {
  const d = new Date(time + JST);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
export function clockMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('時刻は24時間表記 HH:MM を使用してください');
  return +time.slice(0, 2) * 60 + +time.slice(3);
}
export function inWindow(now: number, start: string, end: string): boolean {
  const current = clockMinutes(clock(now)), s = clockMinutes(start), e = clockMinutes(end);
  return s <= e ? current >= s && current < e : current >= s || current < e;
}
