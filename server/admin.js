async function update(refresh) {
  const output = document.querySelector('#status'); output.textContent = '取得中…';
  try {
    const response = await fetch(refresh ? '/admin/refresh' : '/admin/status', { method: refresh ? 'POST' : 'GET', headers: { Authorization: `Bearer ${document.querySelector('#token').value}` }, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error(); const result = await response.json();
    output.textContent = result.feeds.map(f => `${f.title}: ${f.status}`).join('\n');
  } catch { output.textContent = '確認できません。管理認証・更新間隔・接続状態を確認してください。'; }
}
document.querySelector('#admin').addEventListener('submit', e => { e.preventDefault(); void update(false); });
document.querySelector('#refresh').addEventListener('click', () => { void update(true); });
