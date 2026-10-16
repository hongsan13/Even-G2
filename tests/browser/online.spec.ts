import { test, expect } from '@playwright/test';
test('初回からトークン・時刻表取込なしで駅選択、サーバー経路検索、再起動', async ({ page }) => {
  test.skip(process.env.TRANSIT_ONLINE_TEST !== 'true', 'Requires the real local online service and service-configured build');
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  await page.goto('/'); await expect(page.locator('#dataset')).toContainText('149駅 / 6路線 / オンライン検索');
  await expect(page.locator('#auth-form')).toBeHidden();
  await page.locator('#favorite-form [name="from"]').selectOption('438');
  await page.locator('#favorite-form [name="to"]').selectOption('428');
  await page.locator('#favorite-form [name="name"]').fill('個人の通学ルート');
  const query = page.waitForRequest(r => r.url().endsWith('/v1/journeys'));
  await page.getByRole('button', { name:'ルートを登録', exact:true }).click();
  const sent = (await query).postData()!; expect(sent).not.toContain('個人の通学ルート');
  await expect(page.locator('#journey-results')).toContainText('新宿', { timeout:30000 });
  await expect(page.locator('#routes')).toContainText('個人の通学ルート');
  expect(requests.some(u => u.includes('api.odpt.org') || u.includes('api-challenge.odpt.org') || u.includes('consumerKey'))).toBe(false);
  await page.reload(); await expect(page.locator('#routes')).toContainText('個人の通学ルート');
  await expect(page.locator('#journey-results')).toContainText('新宿', { timeout:30000 });
  expect(errors).toEqual([]);
});

test('初回接続失敗から自動回復し、表示とお気に入りだけを見せる', async ({ page }) => {
  test.skip(process.env.TRANSIT_ONLINE_TEST !== 'true', 'Requires a service-configured client build');
  await page.clock.install();
  await page.addInitScript(() => {
    const original = window.fetch.bind(window); let attempts = 0;
    window.fetch = async (input, init) => {
      if (!String(input).endsWith('/v1/catalog')) return original(input, init);
      if (++attempts === 1) return new Response('{}', {status:503});
      return new Response(JSON.stringify({schema:1,id:'online-fixture',title:'test',source:'synthetic fixture',license:'CC0',timezone:'Asia/Tokyo',importedAt:Date.now(),serverManaged:true,
        stations:[{id:'A',name:'試験駅A'},{id:'B',name:'試験駅B'}],lines:[{id:'L',name:'試験線'}],trips:[],calendars:[],exceptions:[],transfers:[]}));
    };
  });
  await page.goto('/');
  await expect(page.locator('.hud-action')).toHaveText('オンライン接続を確認');
  await expect(page.locator('.hud-primary')).not.toContainText('取り込');
  await expect(page.locator('#status')).toContainText('手動取込は不要');
  await expect(page.getByRole('button',{name:'オンライン駅一覧を更新',exact:true})).toHaveCount(0);
  await expect(page.locator('#auth-form')).toBeHidden();
  await expect(page.locator('#preferences-form')).toBeHidden();
  await expect(page.locator('main > .card:visible')).toHaveCount(2);
  await page.clock.fastForward(31000);
  await expect(page.locator('#dataset')).toContainText('2駅 / 1路線 / オンライン検索');
  await expect(page.locator('.hud-primary')).toHaveText('出発駅・到着駅を選んでください');
  await expect(page.locator('#favorite-form')).toBeVisible();
  await expect(page.locator('#favorite-form [name="transfers"]')).toHaveValue('2');
  await expect(page.locator('#status')).toContainText('ルートを登録');
});
