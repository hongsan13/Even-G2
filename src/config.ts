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
