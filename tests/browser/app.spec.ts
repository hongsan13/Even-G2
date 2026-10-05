import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { localStorage.setItem('transit-hud.auto-update', 'false'); localStorage.setItem('transit-hud.initial-data', 'disabled'); }); });

import { zip, gtfsFiles } from '../fixtures';
test('スマホUIでサンプル・ルート編集・再起動・オフライン・削除', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByRole('button', { name: '架空サンプルを試す' }).click();
  await expect(page.locator('#hud')).toContainText('架空サンプル');
  await expect(page.locator('#routes')).toContainText('帰り');
  await page.getByRole('button', { name: '帰り（サンプル）', exact: true }).click();
  await expect(page.locator('.hud-title')).toHaveText('新宿 → 練馬春日町');
  await page.locator('#favorite-list [data-edit]').nth(1).click();
  await page.locator('#favorite-form input[name="walk"]').fill('0');
  await page.locator('#favorite-form input[name="buffer"]').fill('0');
  await page.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(page.locator('#favorite-list')).toContainText('徒歩0分 / 余裕0分');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await expect(page.locator('.hud-title')).toHaveText('新宿 → 練馬春日町');
  await expect(page.locator('#favorite-list')).toContainText('徒歩0分 / 余裕0分');
  await context.setOffline(true);
  await page.getByRole('button', { name: '行き（サンプル）', exact: true }).click();
  await expect(page.locator('.hud-title')).toHaveText('練馬春日町 → 新宿');
  await context.setOffline(false);
  await page.getByRole('button', { name: '時刻表・キャッシュ削除', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('まだ登録されていません');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await expect(page.locator('#dataset')).toContainText('まだ登録されていません');
  expect(errors).toEqual([]);
});
test('GTFS ZIPをWorkerで取り込み、設定を保存して復元', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  await page.locator('#import-form select[name="importMode"]').selectOption('replace');
  await page.locator('#import-form input[name="title"]').fill('試験データ');
  await page.locator('#import-form input[name="source"]').fill('試験fixture');
  await page.locator('#import-form input[name="license"]').fill('CC0');
  await page.locator('#import-form input[name="file"]').setInputFiles({ name: 'test.zip', mimeType: 'application/zip', buffer: Buffer.from(zip()) });
  await page.locator('#import-form input[name="terms"]').check();
  await page.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('試験データ');
  await page.locator('#favorite-form input[name="name"]').fill('通学');
  await page.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  await expect(page.locator('#routes')).toContainText('通学');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await expect(page.locator('#dataset')).toContainText('試験データ');
  await expect(page.locator('#routes')).toContainText('通学');
  expect(errors).toEqual([]);
});
test('不正GTFSを取り込んでも保存済み時刻表を壊さない', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByRole('button', { name: '架空サンプルを試す' }).click();
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  const form = page.locator('#import-form');
  await form.locator('[name="title"]').fill('不正'); await form.locator('[name="source"]').fill('test'); await form.locator('[name="license"]').fill('test');
  const files = { ...gtfsFiles }; delete files['calendar.txt'];
  await form.locator('[name="importMode"]').selectOption('replace');
  await form.locator('[name="file"]').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from(zip(files)) }); await form.locator('[name="terms"]').check();
  await page.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#status')).toContainText('カレンダー'); await expect(page.locator('#dataset')).toContainText('架空');
});
test('手入力時刻表を保存して、期限切れ時は乗車案内を止める', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByText('公式時刻表を見ながら手入力する', { exact: true }).click();
  const form = page.locator('#manual-form');
  await form.locator('[name="duration"]').fill('21'); await form.locator('[name="source"]').fill('テスト用入力');
  await form.locator('[name="start"]').fill('20250101'); await form.locator('[name="end"]').fill('20251231');
  await form.locator('[name="forwardWeekday"]').fill('13:52 13:58 14:04'); await form.locator('[name="forwardWeekend"]').fill('13:52 13:58 14:04');
  await form.locator('input[type="checkbox"]').check(); await page.getByRole('button', { name: '手入力時刻表を保存', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('都営大江戸線（手入力）');
  await expect(page.locator('#hud')).toContainText('有効期限切れ');
});
test('公式SDKのネイティブ呼出形式・保存・G2描画をホストmockで確認', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Window & { mockCalls: { method: string; data: Record<string, unknown> }[];
      flutter_inappwebview: { callHandler: (handler: string, raw: string) => Promise<unknown> } };
    w.mockCalls = [];
    w.flutter_inappwebview = { callHandler: async (handler, raw) => {
      if (handler !== 'evenAppMessage') throw new Error('Unexpected handler');
      const call = JSON.parse(raw) as { method: string; data: Record<string, unknown> }; w.mockCalls.push(call);
      const storage = JSON.parse(sessionStorage.getItem('mock-native-storage') || '{}') as Record<string, string>;
      if (call.method === 'getLocalStorage') return storage[String(call.data.key)] ?? (String(call.data.key) === 'transit-hud.auto-update' ? 'false' : String(call.data.key) === 'transit-hud.initial-data' ? 'disabled' : '');
      if (call.method === 'setLocalStorage') {
        storage[String(call.data.key)] = String(call.data.value); sessionStorage.setItem('mock-native-storage', JSON.stringify(storage)); return true;
      }
      if (call.method === 'createStartUpPageContainer') return 0;
      return true;
    } };
  });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Even App接続済み');
  await page.getByRole('button', { name: '架空サンプルを試す' }).click(); await expect(page.locator('#routes')).toContainText('帰り');
  const methods = await page.evaluate(() => (window as unknown as { mockCalls: { method: string }[] }).mockCalls.map(c => c.method));
  expect(methods).toContain('createStartUpPageContainer'); expect(methods).toContain('rebuildPageContainer'); expect(methods).toContain('setLocalStorage');
  await page.getByRole('button', { name: '帰り（サンプル）', exact: true }).click();
  await expect(page.locator('.hud-title')).toHaveText('新宿 → 練馬春日町');
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const r = indexedDB.open('transit-hud-v1', 1); r.onsuccess = () => { const tx = r.result.transaction('cache', 'readwrite'); tx.objectStore('cache').clear(); tx.oncomplete = () => { r.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }));
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Even App接続済み');
  await expect(page.locator('.hud-title')).toHaveText('新宿 → 練馬春日町');
  expect(await page.locator('#status').textContent()).not.toContain('失敗');
});
test('arrival_time未記載のZIPをWorkerで取り込んで到着目安と表示', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  const form = page.locator('#import-form');
  await form.locator('[name="title"]').fill('発車時刻のみのテスト');
  await form.locator('[name="source"]').fill('synthetic regression fixture');
  await form.locator('[name="license"]').fill('CC0');
  const files = { ...gtfsFiles, 'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,,23:59:00,A,1\nt1,,24:05:00,B,2\n' };
  await form.locator('[name="importMode"]').selectOption('replace');
  await form.locator('[name="file"]').setInputFiles({ name: 'departure-only.zip', mimeType: 'application/zip', buffer: Buffer.from(zip(files)) });
  await form.locator('[name="terms"]').check(); await page.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('発車時刻のみのテスト');
  await page.locator('#favorite-form [name="name"]').fill('時刻欠損のテスト');
  await page.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  await expect(page.locator('#hud')).toContainText('着目安');
  await expect(page.locator('#status')).not.toContainText('arrival_time');
});
