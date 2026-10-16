async function update(refresh) {
  const output = document.querySelector('#status'); output.textContent = '取得中…';
  try {
    const response = await fetch(refresh ? '/admin/refresh' : '/admin/status', { method: refresh ? 'POST' : 'GET', headers: { Authorization: `Bearer ${document.querySelector('#token').value}` }, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error(); const result = await response.json();
    const labels = {ready:'利用可能', 'approval-required':'一般提供の利用条件確認が必要', 'challenge-key-missing':'RenderのODPT_CHALLENGE_KEYが未設定', 'odpt-key-missing':'RenderのODPT_KEYが未設定', expired:'有効期間終了', 'update-failed':'更新失敗・有効な保存データを使用', unavailable:'取得不可・認証/収録範囲/応答上限を確認'};
    const reasons = {'http-401':'HTTP 401：認証失敗。ODPT_KEYの種類・有効性を確認', 'http-403':'HTTP 403：アクセス拒否。データ利用権限・利用条件を確認', 'http-404':'HTTP 404：配布ファイルが見つかりません', 'http-429':'HTTP 429：配布元の要求回数制限。時間をおいて再試行', network:'配布元へ接続できません', timeout:'取得がタイムアウトしました', redirect:'公式配布先への転送を検証できません', download:'ZIPのダウンロードに失敗', parse:'ZIP取得後のGTFS解析に失敗', 'size-limit':'ZIP/展開サイズが取込上限を超えています', 'merge-limit':'統合時の便数・駅数上限またはID整合性エラー'};
    output.textContent = result.feeds.map(f => `${f.title}: ${labels[f.status] ?? f.status}${f.reason ? `\n  ${reasons[f.reason] ?? f.reason}` : ''}`).join('\n');
  } catch { output.textContent = '確認できません。管理認証・更新間隔・接続状態を確認してください。'; }
}
document.querySelector('#admin').addEventListener('submit', e => { e.preventDefault(); void update(false); });
document.querySelector('#refresh').addEventListener('click', () => { void update(true); });
