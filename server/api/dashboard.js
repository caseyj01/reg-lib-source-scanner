/**
 * GET /api/dashboard — serves the request monitoring dashboard HTML
 */
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reg Library — API Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh}
  header{background:#1a1f2e;border-bottom:1px solid #2d3748;padding:20px 32px;display:flex;align-items:center;gap:16px}
  .brand{font-size:11px;font-weight:800;letter-spacing:.15em;color:#4a9eff}
  header h1{font-size:18px;font-weight:600;color:#f1f5f9}
  .refresh-btn{margin-left:auto;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer}
  .refresh-btn:hover{background:#1d4ed8}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px 32px}
  .stat{background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;padding:20px 24px}
  .stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  .stat-value{font-size:28px;font-weight:700;color:#f1f5f9}
  .stat-value.green{color:#22c55e}
  .stat-value.red{color:#ef4444}
  .stat-value.blue{color:#60a5fa}
  .table-wrap{padding:0 32px 32px}
  .table-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .table-head h2{font-size:14px;font-weight:600;color:#94a3b8}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#1a1f2e;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:10px 14px;text-align:left;border-bottom:1px solid #2d3748}
  td{padding:10px 14px;border-bottom:1px solid #1e2535;color:#cbd5e1;vertical-align:top}
  tr:hover td{background:#1a1f2e}
  .badge{display:inline-block;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600}
  .badge-ok{background:#14532d;color:#4ade80}
  .badge-error{background:#450a0a;color:#f87171}
  .td-authority{font-weight:500;color:#e2e8f0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .td-model{color:#94a3b8;font-size:11px}
  .td-time{color:#64748b;font-size:11px;white-space:nowrap}
  .td-ms{color:#94a3b8}
  .error-msg{color:#f87171;font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .empty{text-align:center;padding:60px;color:#475569}
  #token-wrap{display:flex;gap:10px;padding:20px 32px 0}
  #token-input{flex:1;background:#1a1f2e;border:1px solid #2d3748;border-radius:8px;padding:8px 14px;color:#e2e8f0;font-size:13px}
  #token-input:focus{outline:none;border-color:#2563eb}
  #token-btn{background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer}
  .auto-tag{font-size:11px;color:#64748b;margin-left:8px}
</style>
</head>
<body>
<header>
  <div class="brand">VIXIO</div>
  <h1>API Request Dashboard</h1>
  <button class="refresh-btn" onclick="load()">↻ Refresh</button>
</header>

<div id="token-wrap">
  <input id="token-input" type="password" placeholder="Enter proxy token…" />
  <button id="token-btn" onclick="load()">Connect</button>
  <span class="auto-tag" id="auto-label"></span>
</div>

<div class="stats" id="stats">
  <div class="stat"><div class="stat-label">Total Requests</div><div class="stat-value blue" id="s-total">—</div></div>
  <div class="stat"><div class="stat-label">Successful</div><div class="stat-value green" id="s-ok">—</div></div>
  <div class="stat"><div class="stat-label">Errors</div><div class="stat-value red" id="s-err">—</div></div>
  <div class="stat"><div class="stat-label">Success Rate</div><div class="stat-value" id="s-rate">—</div></div>
</div>

<div class="table-wrap">
  <div class="table-head"><h2>Recent Requests <span class="auto-tag">auto-refreshes every 30s</span></h2></div>
  <table>
    <thead><tr>
      <th>Time</th><th>Authority</th><th>Status</th><th>Duration</th><th>Model</th><th>Error</th>
    </tr></thead>
    <tbody id="tbody"><tr><td colspan="6" class="empty">Enter your proxy token above to load logs.</td></tr></tbody>
  </table>
</div>

<script>
  const BASE = window.location.origin;
  let token = localStorage.getItem('dash_token') || '';
  const inp  = document.getElementById('token-input');
  if (token) { inp.value = token; document.getElementById('auto-label').textContent = 'token saved'; }

  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  async function load() {
    token = inp.value.trim() || token;
    if (!token) return;
    localStorage.setItem('dash_token', token);
    document.getElementById('auto-label').textContent = 'token saved';

    try {
      const r = await fetch(BASE + '/api/logs?limit=200', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!r.ok) { alert('Auth failed — check your token'); return; }
      const data = await r.json();

      document.getElementById('s-total').textContent = data.total ?? 0;
      document.getElementById('s-ok').textContent    = data.success ?? 0;
      document.getElementById('s-err').textContent   = data.errors ?? 0;
      const rate = data.total ? Math.round((data.success / data.total) * 100) : 0;
      const rateEl = document.getElementById('s-rate');
      rateEl.textContent = rate + '%';
      rateEl.className   = 'stat-value ' + (rate >= 90 ? 'green' : rate >= 70 ? '' : 'red');

      const tbody = document.getElementById('tbody');
      if (!data.logs || data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No requests logged yet.</td></tr>';
        return;
      }
      tbody.innerHTML = data.logs.map(l => \`
        <tr>
          <td class="td-time">\${fmt(l.ts)}</td>
          <td class="td-authority" title="\${l.authority || ''}">\${l.authority || '—'}</td>
          <td><span class="badge badge-\${l.status}">\${l.status}</span></td>
          <td class="td-ms">\${l.ms ? l.ms + 'ms' : '—'}</td>
          <td class="td-model">\${(l.model || '').replace('gemini-','')}</td>
          <td class="error-msg" title="\${l.error || ''}">\${l.error || ''}</td>
        </tr>
      \`).join('');
    } catch (e) {
      alert('Failed to load: ' + e.message);
    }
  }

  // Auto-refresh every 30s
  setInterval(() => { if (token) load(); }, 30000);

  // Load on enter key
  inp.addEventListener('keydown', e => e.key === 'Enter' && load());

  if (token) load();
</script>
</body>
</html>`);
}
