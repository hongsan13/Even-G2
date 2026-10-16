async function update(refresh) {
  const output = document.querySelector('#status'); output.textContent = '取得中…';
  try {
    const response = await fetch(refresh ? '/admin/refresh' : '/admin/status', { method: refresh ? 'POST' : 'GET', headers: { Authorization: `Bearer ${document.querySelector('#token').value}` }, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error(); const result = await response.json();
    const labels = {ready:'利用可能', 'approval-required':'一般提供の利用条件確認が必要', 'challenge-key-missing':'RenderのODPT_CHALLENGE_KEYが未設定', 'odpt-key-missing':'RenderのODPT_KEYが未設定', expired:'有効期間終了', 'update-failed':'更新失敗・有効な保存データを使用', unavailable:'取得不可・認証/収録範囲/応答上限を確認'};
    output.textContent = result.feeds.map(f => `${f.title}: ${labels[f.status] ?? f.status}`).join('\n');
  } catch { output.textContent = '確認できません。管理認証・更新間隔・接続状態を確認してください。'; }
}
document.querySelector('#admin').addEventListener('submit', e => { e.preventDefault(); void update(false); });
document.querySelector('#refresh').addEventListener('click', () => { void update(true); });
