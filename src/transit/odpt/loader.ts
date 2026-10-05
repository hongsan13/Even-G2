import { jstDate } from '../../utils/time';
import type { Timetable } from '../types';
import type { OdptMetadata } from './parser';
import { boundedResponse } from '../gtfs/loader';
export const ODPT_OPERATORS = [
  { id: 'JR-East', title: 'JR東日本（関東の一部路線）' }, { id: 'Keio', title: '京王' },
  { id: 'Tobu', title: '東武' }, { id: 'Sotetsu', title: '相鉄' },
];
export const CHALLENGE_END = '20270312';
export const JSON_LIMIT = 12 * 1024 * 1024;
export function importOdpt(railways: string, stations: string, trains: string, meta: OdptMetadata): Promise<Timetable> {
  if ([railways, stations, trains].some(s => new TextEncoder().encode(s).length > JSON_LIMIT)) return Promise.reject(new Error('各JSONは12MB以下にしてください'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('JSON取込がタイムアウトしました。路線を絞ってください')); }, 45000);
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.data); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('JSON処理を開始できませんでした')); };
    worker.postMessage({ railways, stations, trains, meta });
  });
}
export async function fetchOdpt(type: 'Railway' | 'Station' | 'TrainTimetable', operator: string, key: string, railway?: string): Promise<Record<string, unknown>[]> {
  if (jstDate(Date.now()) > CHALLENGE_END) throw new Error('チャレンジ2026の許諾期間が終了しています');
  if (!ODPT_OPERATORS.some(o => o.id === operator) || !key.trim()) throw new Error('事業者とチャレンジ専用トークンを設定してください');
  if (railway && !railway.startsWith(`odpt.Railway:${operator}.`)) throw new Error('選択した事業者の路線を指定してください');
  const url = new URL(`https://api-challenge.odpt.org/api/v4/odpt:${type}`);
  url.searchParams.set('odpt:operator', `odpt.Operator:${operator}`);
  if (railway) url.searchParams.set(type === 'Railway' ? 'owl:sameAs' : 'odpt:railway', railway);
  url.searchParams.set('acl:consumerKey', key);
  try {
    const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('request');
    const records: unknown = JSON.parse(new TextDecoder().decode(await boundedResponse(response, JSON_LIMIT)));
    if (!Array.isArray(records) || !records.length || records.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('format');
    // Standard API responses can be capped. Never save a potentially truncated result.
    if (records.length >= 1000) throw new Error('limit');
    return records as Record<string, unknown>[];
  } catch (error) {
    if (error instanceof Error && error.message === 'limit') throw new Error('API応答が1000件以上です。全件取得を確認できないため保存しません。公式JSONファイルから取り込んでください');
    throw new Error('公式JSONを取得できません。認証・利用期間・ネットワーク権限を確認してください');
  }
}
