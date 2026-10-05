import { test, expect } from '@playwright/test';
import { zip, gtfsFiles } from '../fixtures';
const endpoint = 'https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip';
const azure = 'https://dataodpt.blob.core.windows.net/files-open/Toei/data/Toei-Train-GTFS.zip?sig=test-only';
const revised = () => Buffer.from(zip({ ...gtfsFiles,
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\n438,練馬春日町,35.74,139.64\n428,新宿,35.69,139.70\n',
  'routes.txt': 'route_id,route_short_name,route_long_name,route_type\n4,大江戸線,都営大江戸線,1\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\n4,daily,t1,都庁前,1\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,14:01:00,14:01:00,438,1\nt1,14:23:00,14:23:00,428,2\n',
  'feed_info.txt': 'feed_publisher_name,feed_publisher_url,feed_lang,feed_version,feed_end_date\n都営,https://example.org,ja,test-new,20270312\n',
}));
test('初期データから駅名検索、公式更新でルート保持、補正の保存・解除', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('transit-hud.auto-update', 'false'));
  await page.clock.setFixedTime(new Date('2026-10-05T04:43:00Z'));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#dataset')).toContainText('149駅 / 6路線 / 5600便');
  const route = page.locator('#favorite-form');
  await route.getByRole('searchbox', { name: '出発駅を駅名で検索', exact: true }).fill('練馬春日町');
  await expect(route.locator('[name="from"]')).toHaveValue('438');
  await route.getByRole('searchbox', { name: '到着駅を駅名で検索', exact: true }).fill('新宿');
  await expect(route.locator('[name="to"] option').filter({ hasText: /^新宿 ·/ })).toHaveCount(2);
  await route.locator('[name="to"]').selectOption('428');
  await route.locator('[name="lines"]').selectOption('4');
  await route.locator('[name="direction"]').selectOption('1');
  await route.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  await expect(page.locator('.hud-primary')).toContainText('13:56発');
  await expect(page.locator('#journey-results')).toContainText('新宿');
  await expect(page.locator('#routes')).toContainText('練馬春日町→新宿');
  // Simulate the validated network response; live TLS is checked separately.
  await page.evaluate(({ endpoint, azure, bytes }) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input) !== endpoint) return original(input, init);
      const response = new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/zip' } });
      Object.defineProperty(response, 'url', { value: azure }); return response;
    };
  }, { endpoint, azure, bytes: [...revised()] });
  await page.getByText('オンライン更新と公開GTFSの追加', { exact: true }).click();
  await page.getByRole('button', { name: '保存済みデータを更新', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('test-new');
  await expect(page.locator('.hud-primary')).toContainText('14:01発');
  await expect(page.locator('#routes')).toContainText('練馬春日町→新宿');
  await page.getByText('時刻表を手動で補正する', { exact: true }).click();
  await page.locator('#timetable-editor [name="editStation"]').selectOption('438');
  await page.locator('#timetable-form [name="departure-1"]').fill('14:03:00');
  await page.getByRole('button', { name: 'この便の時刻補正を保存', exact: true }).click();
  await expect(page.locator('.hud-primary')).toContainText('14:03発');
  await expect(page.locator('.hud-footer')).toContainText('手動補正あり');
  await page.reload(); await expect(page.locator('.hud-primary')).toContainText('14:03発');
  await page.getByText('時刻表を手動で補正する', { exact: true }).click();
  await page.getByRole('button', { name: 'すべての時刻補正を解除', exact: true }).click();
  await expect(page.locator('.hud-primary')).toContainText('14:01発');
  expect(errors).toEqual([]);
});
test('複数GTFSを追加して既存ルートを保持し、追加駅を名前で検索できる', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('transit-hud.auto-update', 'false'));
  await page.goto('/'); await expect(page.locator('#dataset')).toContainText('5600便');
  const route = page.locator('#favorite-form');
  await route.locator('[name="name"]').fill('保存ルート');
  await route.locator('[name="from"]').selectOption('438'); await route.locator('[name="to"]').selectOption('428');
  await route.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  const form = page.locator('#import-form');
  await form.locator('[name="title"]').fill('追加の地域'); await form.locator('[name="source"]').fill('synthetic fixture'); await form.locator('[name="license"]').fill('CC0');
  await form.locator('[name="file"]').setInputFiles({ name: 'region.zip', mimeType: 'application/zip', buffer: Buffer.from(zip()) });
  await form.locator('[name="terms"]').check();
  await form.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('2件の保存済み時刻表');
  await expect(page.locator('#routes')).toContainText('保存ルート');
  await route.getByRole('searchbox', { name: '出発駅を駅名で検索', exact: true }).fill('駅A');
  await expect(route.locator('[name="from"] option')).toHaveCount(1);
  await expect(route.locator('[name="from"]')).toHaveValue(/::A$/);
  await page.reload(); await expect(page.locator('#dataset')).toContainText('2件の保存済み時刻表');
  await expect(page.locator('#routes')).toContainText('保存ルート');
});
test('2回乗換を駅名で登録し、3区間表示と再起動後の設定を確認', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('transit-hud.auto-update', 'false'); localStorage.setItem('transit-hud.initial-data', 'disabled'); });
  await page.clock.setFixedTime(new Date('2026-10-05T04:30:00Z'));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  const form = page.locator('#import-form');
  await form.locator('[name="title"]').fill('2回乗換の試験'); await form.locator('[name="source"]').fill('synthetic fixture'); await form.locator('[name="license"]').fill('CC0');
  const files = { ...gtfsFiles,
    'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,出発駅,35,139\nB,乗換一,35.1,139.1\nC,乗換二,35.2,139.2\nD,到着駅,35.3,139.3\n',
    'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nL1,一号線,一号線,1\nL2,二号線,二号線,1\nL3,三号線,三号線,1\n',
    'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\nL1,daily,first,乗換一,0\nL2,daily,middle,乗換二,0\nL3,daily,last,到着駅,0\n',
    'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nfirst,13:40:00,13:40:00,A,1\nfirst,13:50:00,13:50:00,B,2\nmiddle,13:54:00,13:54:00,B,1\nmiddle,14:04:00,14:04:00,C,2\nlast,14:08:00,14:08:00,C,1\nlast,14:20:00,14:20:00,D,2\n',
  };
  await form.locator('[name="file"]').setInputFiles({ name: 'three-trains.zip', mimeType: 'application/zip', buffer: Buffer.from(zip(files)) });
  await form.locator('[name="terms"]').check(); await form.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('3便');
  const route = page.locator('#favorite-form');
  await route.getByRole('searchbox', { name: '出発駅を駅名で検索', exact: true }).fill('出発駅');
  await route.getByRole('searchbox', { name: '到着駅を駅名で検索', exact: true }).fill('到着駅');
  await route.locator('[name="transfers"]').selectOption('2');
  await route.getByRole('searchbox', { name: '最初の乗換駅（任意）を駅名で検索', exact: true }).fill('乗換一');
  await route.getByRole('searchbox', { name: '2つ目の乗換駅（任意）を駅名で検索', exact: true }).fill('乗換二');
  await route.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  await expect(page.locator('.hud-footer')).toContainText('14:20着 · 乗換2回');
  await expect(page.locator('#journey-results')).toContainText('二号線');
  await expect(page.locator('#journey-results')).toContainText('三号線');
  await page.reload(); await expect(page.locator('.hud-footer')).toContainText('乗換2回');
  await page.locator('#favorite-list [data-edit]').click();
  await expect(route.locator('[name="transfers"]')).toHaveValue('2');
  await expect(route.locator('[name="secondTransferAt"]')).toHaveValue(/::C$/);
});
