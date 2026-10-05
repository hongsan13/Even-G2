import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { localStorage.setItem('transit-hud.auto-update', 'false'); localStorage.setItem('transit-hud.initial-data', 'disabled'); }); });

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = process.env.TOEI_GTFS_ZIP;
test('添付都営GTFS 20260921の取込・大江戸線次発3本・保存・オフライン', async ({ page, context }) => {
  test.skip(!file, 'TOEI_GTFS_ZIPに20260921版の公式ZIPを指定してください');
  expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe('dd5757062317dcf18b8eeaf8bf83f6624ecd3c9fc4fe99918981e5ec2b42d8c4');
  await page.clock.setFixedTime(new Date('2026-10-05T04:43:00Z'));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  const form = page.locator('#import-form');
  await form.locator('[name="title"]').fill('東京都交通局 鉄道GTFS');
  await form.locator('[name="source"]').fill('東京都交通局・公共交通オープンデータ協議会');
  await form.locator('[name="license"]').fill('CC BY 4.0');
  await form.locator('[name="importMode"]').selectOption('replace');
  await form.locator('[name="file"]').setInputFiles(file!);
  await form.locator('[name="terms"]').check();
  await form.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('149駅 / 6路線 / 5600便');
  await expect(page.locator('#dataset')).toContainText('20260921');
  const route = page.locator('#favorite-form');
  await route.locator('[name="name"]').fill('大江戸線 行き');
  await route.locator('[name="from"]').selectOption('438');
  await route.locator('[name="to"]').selectOption('428');
  await route.locator('[name="lines"]').selectOption('4');
  await route.locator('[name="direction"]').selectOption('1');
  await route.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  // Independently read from uploaded CSV, not calculated using the app parser.
  await expect(page.locator('.hud-primary')).toContainText('13:56発');
  await expect(page.locator('.hud-alternatives')).toContainText('14:02');
  await expect(page.locator('.hud-alternatives')).toContainText('14:08');
  await expect(page.locator('.hud-footer')).toContainText('新宿 14:18着');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await expect(page.locator('.hud-primary')).toContainText('13:56発');
  await context.setOffline(true);
  await page.getByRole('button', { name: '次の候補 →', exact: true }).click();
  await expect(page.locator('.hud-primary')).toContainText('14:02発');
  await expect(page.locator('.hud-footer')).toContainText('新宿 14:24着');
  expect(errors).toEqual([]);
});

test('実データの練馬春日町→牛込神楽坂・1回乗換検索中も画面操作できる', async ({ page }) => {
  test.skip(!file, 'TOEI_GTFS_ZIPに公式ZIPを指定してください');
  await page.addInitScript(() => {
    (window as any).flutter_inappwebview = { callHandler: async (_handler: string, raw: string) => {
      const call = JSON.parse(raw);
      const storage = JSON.parse(sessionStorage.getItem('native-cache-test') || '{}');
      if (call.method === 'getLocalStorage') return storage[call.data.key] ?? (String(call.data.key) === 'transit-hud.auto-update' ? 'false' : String(call.data.key) === 'transit-hud.initial-data' ? 'disabled' : '');
      if (call.method === 'setLocalStorage') { storage[call.data.key] = call.data.value; sessionStorage.setItem('native-cache-test', JSON.stringify(storage)); return true; }
      return call.method === 'createStartUpPageContainer' ? 0 : true;
    } };
  });
  await page.clock.setFixedTime(new Date('2026-10-05T08:33:00Z'));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Even App接続済み');
  await page.getByText('GTFS ZIPを端末から追加する', { exact: true }).click();
  const form = page.locator('#import-form');
  await form.locator('[name="title"]').fill('都営');
  await form.locator('[name="source"]').fill('東京都交通局・公共交通オープンデータ協議会');
  await form.locator('[name="license"]').fill('CC BY 4.0');
  await form.locator('[name="importMode"]').selectOption('replace');
  await form.locator('[name="file"]').setInputFiles(file!); await form.locator('[name="terms"]').check();
  await form.getByRole('button', { name: 'GTFSを取り込む', exact: true }).click();
  await expect(page.locator('#dataset')).toContainText('5600便');
  const route = page.locator('#favorite-form');
  await route.locator('[name="name"]').fill('自宅→理科大');
  await route.locator('[name="from"]').selectOption('438');
  await route.locator('[name="to"]').selectOption('406');
  await route.locator('[name="transfers"]').selectOption('1');
  await route.getByText('経由駅・路線の詳しい条件', { exact: true }).click();
  await route.locator('[name="via0"]').selectOption('429');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  // A main-thread heartbeat must continue during route calculation.
  await page.evaluate(() => { (window as any).beats = 0; setInterval(() => { (window as any).beats++; }, 20); });
  await route.getByRole('button', { name: 'ルートを登録', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('お気に入りを保存しました。');
  await expect(page.locator('.hud-primary')).toContainText('発', { timeout: 15000 });
  await expect(page.locator('.hud-footer')).toContainText('牛込神楽坂');
  expect(await page.evaluate(() => (window as any).beats)).toBeGreaterThan(2);
  await expect(page.locator('.live-card')).toBeInViewport();
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const r = indexedDB.open('transit-hud-v1', 1); r.onsuccess = () => { const tx = r.result.transaction('cache', 'readwrite'); tx.objectStore('cache').clear(); tx.oncomplete = () => { r.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }));
  await page.reload(); await expect(page.locator('.hud-primary')).toContainText('発', { timeout: 15000 });
  await expect(page.locator('.hud-footer')).toContainText('牛込神楽坂');
  expect(errors).toEqual([]);
});
