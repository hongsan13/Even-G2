import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseOdpt } from '../src/transit/odpt/parser';
import { fetchOdpt } from '../src/transit/odpt/loader';
import { refreshAuthGtfs, protectTimetable } from '../src/transit/odpt/authGtfs';
import { AUTH_FEEDS } from '../src/config';
import { mergeFeeds, removeExpiredLicensedFeeds } from '../src/transit/feeds';
import { applyEdits, retainEdits } from '../src/transit/edits';
import { serviceRuns, leg } from '../src/transit/timetable';
import { data } from './fixtures';
import { railways, stations, trains, meta, stationA, stationB, railway } from './odptFixtures';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('ODPT列車時刻表', () => {
  it('発車のみ・到着のみと24時以降を保持し、翌日到着を検索できる', () => {
    const d = parseOdpt(railways, stations, trains, meta);
    expect(d.trips[0].direction).toBe('');
    expect(d.trips[0].stops[0].arrival).toBeNull();
    expect(d.trips[0].stops[1].departure).toBeNull();
    expect(d.trips[0].stops[1].pickup).toBe(false);
    const result = leg(d, d.trips[0], '20261005', 0, 1, []);
    expect(result?.arrival! - result?.departure!).toBe(360000);
    expect(result?.arrivalEstimated).toBe(false);
    expect(d.trips[0].readOnly).toBe(true);
  });
  it('確認済みの祝日は平日を解除し、土休日ダイヤへ追加する', () => {
    const t = { ...trains[0], 'odpt:calendar': 'odpt.Calendar:SaturdayHoliday' };
    const d = parseOdpt(railways, stations, [trains[0], { ...t, 'owl:sameAs': 'weekend' }], meta);
    expect(serviceRuns(d, 'odpt.Calendar:Weekday', '20261012')).toBe(false);
    expect(serviceRuns(d, 'odpt.Calendar:SaturdayHoliday', '20261012')).toBe(true);
    expect(serviceRuns(d, 'odpt.Calendar:Weekday', '20261013')).toBe(true);
  });
  it('運行日や欠落データを推定で補わない', () => {
    expect(() => parseOdpt(railways, stations, [{ ...trains[0], 'odpt:calendar': 'odpt.Calendar:Special' }], meta)).toThrow('未対応');
    expect(() => parseOdpt(railways, [stations[0]], trains, meta)).toThrow('駅JSON');
    expect(() => parseOdpt(railways, stations, [trains[0], trains[0]], meta)).toThrow('重複');
    expect(() => parseOdpt(railways, stations, trains, { ...meta, end: '20260230' })).toThrow('日付');
    expect(() => parseOdpt(railways, stations, trains, { ...meta, holidays: ['20261101'] })).toThrow('期間内');
  });
  it('駅別発車表・分割直通・逆順時刻は保存しない', () => {
    expect(() => parseOdpt(railways, stations, [{ ...trains[0], 'odpt:trainTimetableObject': undefined, 'odpt:stationTimetableObject': [] }], meta)).toThrow('停車時刻');
    expect(() => parseOdpt(railways, stations, [{ ...trains[0], 'odpt:nextTrainTimetable': ['next'] }], meta)).toThrow('直通');
    expect(() => parseOdpt(railways, stations, [{ ...trains[0], 'odpt:trainTimetableObject': [
      { 'odpt:departureStation': stationA, 'odpt:departureTime': '23:59' }, { 'odpt:arrivalStation': stationB, 'odpt:arrivalTime': '00:05' },
    ] }], meta)).toThrow('順序');
  });
  it('認証取得の便を手動補正できない', () => {
    const d = parseOdpt(railways, stations, trains, meta), edits = [{ tripId: d.trips[0].id, stops: d.trips[0].stops }];
    expect(() => applyEdits(d, edits)).toThrow('補正できません');
    expect(retainEdits(d, edits)).toEqual([]);
  });
});
describe('認証取得と許諾期限', () => {
  it('JSONは選択した公式配信だけへ送信し、路線取得のIDフィルタを使う', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(railways)));
    vi.stubGlobal('fetch', mock);
    await fetchOdpt('Railway', 'JR-East', 'synthetic-token', railway);
    const url = mock.mock.calls[0][0] as URL;
    expect(url.origin).toBe('https://api-challenge.odpt.org');
    expect(url.searchParams.get('owl:sameAs')).toBe(railway);
    expect(url.searchParams.get('acl:consumerKey')).toBe('synthetic-token');
    expect(mock.mock.calls[0][1].credentials).toBe('omit');
    await expect(fetchOdpt('Railway', 'Unknown', 'synthetic-token')).rejects.toThrow('事業者');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('API上限応答を全件と扱わず、URLを含む通信エラーを伏せる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(Array.from({ length: 1000 }, () => railways[0])))));
    await expect(fetchOdpt('Railway', 'JR-East', 'synthetic-token')).rejects.toThrow('1000件');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('https://example.org/?acl:consumerKey=synthetic-token')));
    try { await fetchOdpt('Railway', 'JR-East', 'synthetic-token'); } catch (e) { expect(String(e)).not.toContain('synthetic-token'); }
  });
  it('GTFSの認証鍵や署名URLをキャッシュへ保存しない', async () => {
    const response = new Response(new Uint8Array([1]));
    Object.defineProperty(response, 'url', { value: 'https://dataodpt.blob.core.windows.net/files-challenge/JR-East/data/JR-East-Train-GTFS.zip?sig=synthetic-signature' });
    const mock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', mock);
    const result = await refreshAuthGtfs(AUTH_FEEDS[0], 'synthetic-token', undefined, async () => data());
    expect(new URL(mock.mock.calls[0][0]).searchParams.get('acl:consumerKey')).toBe('synthetic-token');
    expect(JSON.stringify(result.cache)).not.toMatch(/synthetic-token|synthetic-signature|consumerKey/);
    expect(result.cache.data.trips[0].readOnly).toBe(true);
    expect(result.cache.data.licenseUntil).toBe('20270312');
  });
  it('別事業者への転送を拒否し、通信失敗は許諾期間内の保存済みデータへ戻る', async () => {
    const response = new Response(new Uint8Array([1]));
    Object.defineProperty(response, 'url', { value: 'https://dataodpt.blob.core.windows.net/files-challenge/Keio/data/Keio-Train-GTFS.zip' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response)); const parse = vi.fn();
    await expect(refreshAuthGtfs(AUTH_FEEDS[0], 'synthetic-token', undefined, parse)).rejects.toThrow('取得できません');
    expect(parse).not.toHaveBeenCalled();
    const cache = { data: protectTimetable(data(), '20270312'), checkedAt: 0 };
    expect((await refreshAuthGtfs(AUTH_FEEDS[0], 'synthetic-token', cache)).fallback).toBe(true);
  });
  it('期限後は認証要求せず、キャッシュから限定データだけを除去する', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2027-03-13T00:00:00+09:00'));
    const mock = vi.fn(); vi.stubGlobal('fetch', mock);
    await expect(refreshAuthGtfs(AUTH_FEEDS[0], 'synthetic-token')).rejects.toThrow('許諾期間');
    await expect(fetchOdpt('Railway', 'JR-East', 'synthetic-token')).rejects.toThrow('許諾期間');
    expect(mock).not.toHaveBeenCalled();
    const combined = mergeFeeds([{ feedId: 'restricted', checkedAt: 0, data: protectTimetable(data(), '20270312') }, { feedId: 'public', checkedAt: 0, data: data() }]);
    const remaining = removeExpiredLicensedFeeds(combined);
    expect(remaining?.feeds?.map(f => f.feedId)).toEqual(['public']);
    expect(remaining?.data.trips.every(t => t.id.startsWith('public::'))).toBe(true);
    expect(removeExpiredLicensedFeeds(mergeFeeds([combined.feeds![0]]))).toBeUndefined();
    expect(() => parseOdpt(railways, stations, trains, { ...meta, licenseUntil: '20270312' })).toThrow('許諾期限');
  });
});

describe('認証GTFSの安全な失敗理由', () => {
  it.each([401,403,404,429,503])('HTTP %iを保持し、応答本文とURLの鍵を出さない', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-token-in-body',{status})));
    try { await refreshAuthGtfs(AUTH_FEEDS[0], 'private-token'); expect.fail('must fail'); }
    catch (error) {
      expect(error).toMatchObject({reason:`http-${status}`});
      expect(String(error)).not.toContain('private-token');
    }
  });
  it('取得後の解析失敗とサイズ超過を認証エラーと分ける', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(new Uint8Array([1]))));
    await expect(refreshAuthGtfs(AUTH_FEEDS[0],'synthetic-token',undefined,async () => { throw new Error('sensitive parser detail'); })).rejects.toMatchObject({reason:'parse'});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('',{headers:{'Content-Length':'99999999'}})));
    await expect(refreshAuthGtfs(AUTH_FEEDS[0],'synthetic-token')).rejects.toMatchObject({reason:'size-limit'});
  });
  it('鍵の前後の空白を除去し、失敗時も保存済みデータと理由を返す', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('',{status:403})); vi.stubGlobal('fetch',mock);
    const cache = {data:protectTimetable(data(),'20270312'),checkedAt:0};
    const result = await refreshAuthGtfs(AUTH_FEEDS[0],' synthetic-token\n',cache);
    expect(result).toMatchObject({fallback:true,reason:'http-403'});
    expect(result.cache).toBe(cache);
    expect((mock.mock.calls[0][0] as URL).searchParams.get('acl:consumerKey')).toBe('synthetic-token');
    expect(JSON.stringify(result)).not.toContain('synthetic-token');
  });
});

it('横浜市営地下鉄の公式日付指定URLを保持し、別日付・別事業者への転送を拒否', async () => {
  const feed = AUTH_FEEDS.find(f => f.id === 'auth-YokohamaMunicipal')!;
  expect(feed.auth).toBe('odpt');
  const mock = vi.fn().mockImplementation(async () => {
    const response = new Response(new Uint8Array([1]));
    Object.defineProperty(response,'url',{value:'https://dataodpt.blob.core.windows.net/files/odpt/YokohamaMunicipal/Train-20251226.zip?sig=synthetic-signature'});
    return response;
  });
  vi.stubGlobal('fetch',mock);
  const result = await refreshAuthGtfs(feed,'synthetic-key',undefined,async () => data());
  const url = mock.mock.calls[0][0] as URL;
  expect(url.searchParams.get('date')).toBe('20251226');
  expect(url.searchParams.get('acl:consumerKey')).toBe('synthetic-key');
  expect(JSON.stringify(result)).not.toMatch(/synthetic-key|synthetic-signature/);
  for (const path of ['odpt/YokohamaMunicipal/Train-20220101.zip','odpt/Other/Train-20251226.zip']) {
    mock.mockImplementation(async () => {
      const response = new Response(new Uint8Array([1]));
      Object.defineProperty(response,'url',{value:`https://dataodpt.blob.core.windows.net/files/${path}`}); return response;
    });
    await expect(refreshAuthGtfs(feed,'synthetic-key',undefined,async () => data())).rejects.toMatchObject({reason:'redirect'});
  }
});
