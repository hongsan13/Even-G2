import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseCsv, parseGtfsZip } from '../src/transit/gtfs/parser';
import { refreshGtfs, publicHttpsUrl, boundedResponse } from '../src/transit/gtfs/loader';
import { data, gtfsFiles, zip, time } from './fixtures';
import { findJourneys } from '../src/transit/routing';
import { favorite } from './fixtures';
import { hudModel } from '../src/even/renderer';
import { selectNextDepartures } from '../src/transit/departureSelector';
const metadata = { title: '試験GTFS', source: 'fixture', license: 'CC0' };
afterEach(() => vi.unstubAllGlobals());
describe('GTFS ZIP / CSV', () => {
  it('実際のZIPをデコードし、日本語・quoted CSV・24時台・feed versionを保存', () => {
    const d = parseGtfsZip(zip(), metadata);
    expect(d.stations[1].name).toBe('駅B,出口'); expect(d.trips[0].stops[1].arrival).toBe(24 * 3600 + 5 * 60);
    expect(d.version).toBe('v1'); expect(d.validUntil).toBe('20261231'); expect(d.demo).toBe(false);
  });
  it('GTFS-JPの追加列を許容', () => {
    const d = parseGtfsZip(zip({ ...gtfsFiles, 'trips.txt': gtfsFiles['trips.txt'].replace('direction_id\n', 'direction_id,jp_trip_desc\n').replace('駅B,0', '駅B,0,普通') }), metadata);
    expect(d.trips).toHaveLength(1);
  });
  it('BOM・CRLF・quoted multilineとescaped quotes', () => {
    expect(parseCsv('\uFEFFid,name\r\n1,"駅\n""A"""\r\n')[0]).toEqual({ id: '1', name: '駅\n"A"' });
  });
  it('不正なCSVと不正なZIPを拒否', () => {
    expect(() => parseCsv('a,b\n1,"abc')).toThrow(); expect(() => parseCsv('a,b\n1,2,3')).toThrow();
    expect(() => parseGtfsZip(new Uint8Array([1, 2]), metadata)).toThrow();
  });
  it('未知のtimezoneとfrequenciesを推測しない', () => {
    expect(() => parseGtfsZip(zip({ ...gtfsFiles, 'agency.txt': gtfsFiles['agency.txt'].replace('Asia/Tokyo', 'America/New_York') }), metadata)).toThrow('Asia/Tokyo');
    expect(() => parseGtfsZip(zip({ ...gtfsFiles, 'frequencies.txt': 'trip_id,start_time,end_time,headway_secs\nt1,06:00:00,23:00:00,360\n' }), metadata)).toThrow('frequencies');
  });
  it('不正な参照・時刻逆転・必須カレンダーなしを拒否', () => {
    expect(() => parseGtfsZip(zip({ ...gtfsFiles, 'stop_times.txt': gtfsFiles['stop_times.txt'].replace('24:05:00', '22:05:00') }), metadata)).toThrow();
    expect(() => parseGtfsZip(zip({ ...gtfsFiles, 'trips.txt': gtfsFiles['trips.txt'].replace('L1,daily', 'missing,daily') }), metadata)).toThrow();
    const files = { ...gtfsFiles }; delete files['calendar.txt']; expect(() => parseGtfsZip(zip(files), metadata)).toThrow('カレンダー');
  });
  it('calendar_datesだけのフィードで祝日追加を受け入れる', () => {
    const files = { ...gtfsFiles, 'calendar_dates.txt': 'service_id,date,exception_type\ndaily,20261012,1\n' }; delete (files as Record<string, string>)['calendar.txt'];
    expect(parseGtfsZip(zip(files), metadata).exceptions[0].added).toBe(true);
  });
  it('arrival_timeが空でも発車時刻を保持し、日跨ぎの到着は目安と明示', () => {
    const files = { ...gtfsFiles, 'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,,23:59:00,A,1\nt1,,24:05:00,B,2\n' };
    const d = parseGtfsZip(zip(files), metadata);
    expect(d.trips[0].stops[0].arrival).toBeNull();
    const now = time('23:50');
    const journeys = findJourneys(d, favorite(), now);
    expect(journeys[0].legs[0].departure).toBe(time('23:59'));
    expect(journeys[0].arrival).toBe(time('24:05'));
    expect(journeys[0].legs[0].arrivalEstimated).toBe(true);
    expect(hudModel(d, favorite(), selectNextDepartures(journeys, now, 0, 0), null, now, '').footer).toContain('00:05着目安');
  });
  it('発車未記載駅に到着時刻を流用して乗車案内しない', () => {
    const files = { ...gtfsFiles, 'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,23:59:00,,A,1\nt1,24:05:00,24:05:00,B,2\n' };
    const d = parseGtfsZip(zip(files), metadata);
    expect(findJourneys(d, favorite(), time('23:50'))).toHaveLength(0);
  });
  it('時刻未記載の中間駅を保持し、通過経由は検索できるがそこで乗降は案内しない', () => {
    const files = { ...gtfsFiles,
      'stops.txt': gtfsFiles['stops.txt'] + 'C,駅C,35.05,139.05\n',
      'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,23:59:00,23:59:00,A,1\nt1,,,C,2\nt1,24:05:00,24:05:00,B,3\n' };
    const d = parseGtfsZip(zip(files), metadata), now = time('23:50');
    expect(d.trips[0].stops[1]).toMatchObject({ arrival: null, departure: null });
    expect(findJourneys(d, favorite({ via: ['C'] }), now).length).toBeGreaterThan(0);
    expect(findJourneys(d, favorite({ to: 'C' }), now)).toHaveLength(0);
    expect(findJourneys(d, favorite({ from: 'C' }), now)).toHaveLength(0);
  });
  it('時刻欠損があっても既知の時刻の逆転を検出する', () => {
    const files = { ...gtfsFiles, 'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,,23:59:00,A,1\nt1,,23:50:00,B,2\n' };
    expect(() => parseGtfsZip(zip(files), metadata)).toThrow('逆転');
  });
});
describe('通信・キャッシュ', () => {
  const origins = ['https://example.org'];
  it('HTTP・認証・token query・未許可配信元を拒否', () => {
    for (const url of ['http://example.org/a.zip', 'https://user:pass@example.org/a.zip', 'https://example.org/a.zip?key=secret', 'https://other.org/a.zip']) expect(() => publicHttpsUrl(url, origins)).toThrow();
    expect(publicHttpsUrl('https://example.org/a.zip', origins).pathname).toBe('/a.zip');
  });
  it('API障害でも保存済み時刻表を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const cache = { data: data(), checkedAt: time('12:00') };
    const result = await refreshGtfs('https://example.org/a.zip', origins, metadata, cache);
    expect(result.fallback).toBe(true); expect(result.cache).toBe(cache); expect(result.error).toBe('offline');
  });
  it('キャッシュがない障害は成功に見せない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(refreshGtfs('https://example.org/a.zip', origins, metadata, undefined)).rejects.toThrow('503');
  });
  it('ETagを使った304ではパースも大きな再ダウンロードもしない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 304 })); vi.stubGlobal('fetch', fetchMock);
    const parse = vi.fn(), cache = { data: data(), etag: '"v1"', checkedAt: 0 };
    const result = await refreshGtfs('https://example.org/a.zip', origins, metadata, cache, parse);
    expect(result.fallback).toBe(false); expect(result.cache.data).toBe(cache.data); expect(parse).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'If-None-Match': '"v1"' });
  });
  it('更新版を取り込み、Last-ModifiedとETagを保持', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { ETag: '"v2"', 'Last-Modified': 'Mon, 05 Oct 2026 03:00:00 GMT' } })));
    const next = data(); next.version = 'v2'; const parse = vi.fn().mockResolvedValue(next);
    const result = await refreshGtfs('https://example.org/a.zip', origins, metadata, undefined, parse);
    expect(result.cache.data.version).toBe('v2'); expect(result.cache.etag).toBe('"v2"'); expect(parse).toHaveBeenCalledOnce();
  });
  it('Content-Lengthなしでも実データの上限を適用', async () => {
    await expect(boundedResponse(new Response(new Uint8Array(20)), 10)).rejects.toThrow('大きすぎ');
  });
});
it('ODPTの日付指定だけを許可し、認証・任意クエリは拒否', () => {
  const origins = ['https://api-public.odpt.org'];
  expect(publicHttpsUrl('https://api-public.odpt.org/api/v4/files/odpt/TosadenTraffic/Streetcar.zip?date=20260801', origins).search).toBe('?date=20260801');
  expect(() => publicHttpsUrl('https://api-public.odpt.org/file.zip?date=20260801&key=secret', origins)).toThrow();
});
it('ODPTの署名付きAzure転送を受け、署名URLは保存しない', async () => {
  const response = new Response(new Uint8Array([1]));
  Object.defineProperty(response, 'url', { value: 'https://dataodpt.blob.core.windows.net/files-open/Toei/data/Toei-Train-GTFS.zip?sig=temporary' });
  const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
  const result = await refreshGtfs('https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip', ['https://api-public.odpt.org'], metadata, undefined, vi.fn().mockResolvedValue(data()));
  expect(fetchMock.mock.calls[0][1].redirect).toBe('follow');
  expect(JSON.stringify(result.cache)).not.toContain('temporary');
});
it('別のAzureパスへの転送は取り込まない', async () => {
  const response = new Response(new Uint8Array([1]));
  Object.defineProperty(response, 'url', { value: 'https://dataodpt.blob.core.windows.net/files-open/other.zip' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  await expect(refreshGtfs('https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip', ['https://api-public.odpt.org'], metadata, undefined)).rejects.toThrow('転送先');
});
