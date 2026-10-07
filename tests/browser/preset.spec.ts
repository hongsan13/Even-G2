import { test, expect } from '@playwright/test';
test('お気に入り選択で編集フォーム・下書き・フォーカス・表示位置を保持', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('transit-hud.auto-update','false');localStorage.setItem('transit-hud.initial-data','disabled'); });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('ブラウザ · G2未接続');
  await page.getByRole('button', { name:'架空サンプルを試す' }).click();
  await page.locator('#favorite-list [data-edit]').first().click();
  await page.locator('#favorite-form [name="name"]').fill('編集中のルート');
  await page.evaluate(() => { (window as unknown as { presetEditor: Element | null }).presetEditor = document.querySelector('#favorite-form'); });
  const tab = page.getByRole('button', { name:'帰り（サンプル）', exact:true });
  await tab.scrollIntoViewIfNeeded(); await tab.focus();
  const before = await tab.boundingBox();
  await tab.click(); await expect(page.locator('.hud-title')).toHaveText('新宿 → 練馬春日町');
  await expect(page.locator('#favorite-form [name="name"]')).toHaveValue('編集中のルート');
  await expect(page.locator('#favorite-form h3')).toHaveText('ルートを編集');
  await expect(tab).toHaveClass(/active/); await expect(tab).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('#favorite-form') === (window as unknown as { presetEditor: Element }).presetEditor)).toBe(true);
  const after = await tab.boundingBox(); expect(Math.abs(after!.y - before!.y)).toBeLessThan(5);
  await page.reload(); await expect(page.locator('.hud-title')).toHaveText('新宿 → 練馬春日町');
});
