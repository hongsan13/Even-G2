export const PUBLIC_FEED_ORIGINS = ['https://api-public.odpt.org', 'https://dataodpt.blob.core.windows.net'];
export const TOEI_FEED = {
  id: 'toei', title: '東京都交通局 鉄道GTFS', region: '東京',
  url: 'https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip',
  source: '東京都交通局・公共交通オープンデータ協議会', license: 'CC BY 4.0',
  catalog: 'https://ckan.odpt.org/dataset/train-toei/resource/35b68908-4558-47ae-bfa5-867e58544a1a',
  bundle: '/feeds/toei-20260921.zip',
};
export const FEED_CATALOG = [TOEI_FEED, {
  id: 'tosaden', title: 'とさでん交通 路面電車GTFS', region: '高知',
  url: 'https://api-public.odpt.org/api/v4/files/odpt/TosadenTraffic/Streetcar.zip?date=20260801',
  source: 'とさでん交通・公共交通オープンデータ協議会', license: 'CC BY 4.0',
  catalog: 'https://ckan.odpt.org/dataset/tosaden_traffic_streetcar/resource/5a457076-fda6-4e15-99c9-12cb37e0c759',
  bundle: '',
}];
export type AuthKind = 'odpt' | 'challenge';
export interface AuthFeed {
  id: string; title: string; region: string; url: string; source: string; license: string;
  catalog: string; bundle: string; auth: AuthKind; licenseUntil?: string;
}
export const AUTH_FEEDS: AuthFeed[] = [
  ...[
    ['JR-East', 'JR東日本（関東の一部路線）', 'jreast_tokyo_area', 'a6f842e9-e053-4be5-a926-87d0b49753d3'],
    ['Keio', '京王', 'keio_train', '2f1beecf-54f7-4c1f-8735-fdce2a18ed6e'],
    ['Sotetsu', '相鉄', 'sotetsu_train', '7a45fbbd-a903-406f-954c-91445927deb0'],
    ['Tobu', '東武', 'tobu_train', '444851f8-a7b8-43ba-a17d-6d3ce8035006'],
  ].map(([operator, title, slug, resource]) => ({ id: `auth-${operator}`, title: `${title} GTFS（チャレンジ認証）`, region: '関東',
    url: `https://api-challenge.odpt.org/api/v4/files/${operator}/data/${operator}-Train-GTFS.zip`,
    source: `${title}・公共交通オープンデータ協議会`, license: '公共交通オープンデータチャレンジ2026 限定ライセンス',
    catalog: `https://ckan.odpt.org/dataset/${slug}/resource/${resource}`, bundle: '', auth: 'challenge' as const, licenseUntil: '20270312' })),
  ...[
    ['TokyoMetro', '東京メトロ', 'train-tokyometro', 'd4f11962-1c5a-4316-9a16-7fb229c227ea'],
    ['MIR', 'つくばエクスプレス', 'train-mir', '663ebc8f-6c0c-4151-b966-f97f5d9b148c'],
    ['TWR', 'りんかい線', 'train-twr', 'f1953807-47da-4540-94bd-26c391e5caef'],
    ['TamaMonorail', '多摩都市モノレール', 'train-tamamonorail', 'c72cc2a7-f1d5-41cf-9fac-5545237fd425'],
  ].map(([operator, title, slug, resource]) => ({ id: `auth-${operator}`, title: `${title} GTFS（通常ODPT認証）`, region: '関東',
    url: `https://api.odpt.org/api/v4/files/${operator}/data/${operator}-Train-GTFS.zip`,
    source: `${title}・公共交通オープンデータ協議会`, license: '公共交通オープンデータ基本ライセンス',
    catalog: `https://ckan.odpt.org/dataset/${slug}/resource/${resource}`, bundle: '', auth: 'odpt' as const })),
];
export const ALL_FEEDS = [...FEED_CATALOG, ...AUTH_FEEDS];

export function isAuthFeed(feed: typeof TOEI_FEED | AuthFeed): feed is AuthFeed { return 'auth' in feed && (feed.auth === 'odpt' || feed.auth === 'challenge'); }
