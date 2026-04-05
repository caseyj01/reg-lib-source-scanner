import React, { useState, useRef } from 'react';
import { SOURCES }           from '../lib/sources.js';
import { deepSearch }        from '../lib/deepSearch.js';
import { useNotifications }  from './components/BackgroundTaskManager.jsx';
import seedUrls               from './data/seedData.json';

// URLs already in the reg library — dedup against these
const SEED_URLS = new Set(seedUrls.map(u => u.replace('http://', 'https://')));

// Regions to sweep per scan
const SCAN_REGIONS = ['Global', 'UK/EU', 'AMER', 'APAC', 'ME/AF'];

// ── Live web scan via proxy → Gemini ─────────────────────────────────────────
async function runWebScan(onProgress, stopRef) {
  const found    = [];
  const seenUrls = new Set();
  const total    = SCAN_REGIONS.length;

  for (let i = 0; i < total; i++) {
    if (stopRef.current) break;
    const region = SCAN_REGIONS[i];
    onProgress({ done: i, total, source: `Searching ${region}…`, found: found.length });

    try {
      const results = await deepSearch({
        query:       'binding banking and financial services regulations primary secondary legislation',
        knownTitles: [],
        region,
        category:    'Banking',
      });

      for (const doc of results) {
        if (!doc.sourceUrl) continue;
        const normUrl = doc.sourceUrl.replace('http://', 'https://');
        if (seenUrls.has(normUrl)) continue;
        seenUrls.add(normUrl);
        found.push({
          id:             `found-${found.length + 1}`,
          vertical:       'Financial Services',
          jurisdiction:   doc.jurisdiction  || doc.region || '',
          authority:      doc.authority     || '',
          documentType:   doc.type          || '',
          commonName:     doc.title         || doc.sourceUrl,
          url:            doc.sourceUrl,
          alreadyCovered: SEED_URLS.has(normUrl),
          summary:        doc.summary       || '',
        });
      }
    } catch (err) {
      console.warn(`Web scan for ${region} failed:`, err.message);
    }

    onProgress({ done: i + 1, total, source: `${region} complete`, found: found.length });
    if (stopRef.current) break;
  }

  return found;
}

// ── CSV export ────────────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const headers = ['Vertical', 'Jurisdiction', 'Authority', 'Document Type', 'Common Name', 'URL'];
  const esc     = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines   = rows.map(r =>
    [r.vertical, r.jurisdiction, r.authority, r.documentType, r.commonName, r.url].map(esc).join(',')
  );
  const csv  = [headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Results table ─────────────────────────────────────────────────────────────
function DocTable({ rows, emptyMsg, showCoveredBadge = false }) {
  if (!rows || rows.length === 0) {
    return <div className="table-empty">{emptyMsg}</div>;
  }
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            <th>Jxd</th>
            <th>Authority</th>
            <th>Name</th>
            <th>Leg. Type</th>
            <th>Open</th>
            {showCoveredBadge && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              className={`${i % 2 === 0 ? 'row-even' : 'row-odd'}${row.alreadyCovered ? ' row-covered' : ''}`}
            >
              <td>{row.jurisdiction}</td>
              <td>{row.authority}</td>
              <td className="td-name" title={row.commonName}>{row.commonName}</td>
              <td>
                <span className={`leg-badge leg-badge--${
                  row.documentType?.toLowerCase().includes('primary')   ? 'primary'   :
                  row.documentType?.toLowerCase().includes('secondary') ? 'secondary' : 'other'
                }`}>{row.documentType || '—'}</span>
              </td>
              <td className="td-url">
                <a href={row.url} target="_blank" rel="noreferrer noopener" className="open-btn" title={row.url}>
                  <svg width="10" height="10" viewBox="0 0 11 11" fill="none">
                    <path d="M4.5 1.5H2A1 1 0 001 2.5v6.5A1 1 0 002 10h6.5A1 1 0 009.5 9V6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                    <path d="M7 1.5h2.5V4M9.5 1.5L5.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Open
                </a>
              </td>
              {showCoveredBadge && (
                <td>
                  {row.alreadyCovered
                    ? <span className="badge badge-covered">In library</span>
                    : <span className="badge badge-new">New</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Current Reg Docs tab ──────────────────────────────────────────────────────
function CurrentDocsTab() {
  return (
    <div className="rp-body">
      <div className="rp-panel">
        <div className="rp-panel-head">
          <div className="rp-panel-title">Current Regulatory Documents</div>
          <div className="rp-panel-sub">
            {seedUrls.length.toLocaleString()} URLs in your library — scan results are deduplicated against this list.
          </div>
        </div>
      </div>
      <div className="rp-panel">
        <div className="rp-panel-head">
          <div className="rp-panel-title">Monitored Sources</div>
          <div className="rp-panel-sub">{SOURCES.length} sources used as scan context</div>
        </div>
        <div className="source-list">
          {SOURCES.map(s => (
            <div key={s.id} className="source-row">
              <span className="source-region">{s.region}</span>
              <div className="source-info">
                <div className="source-name" title={s.label}>{s.label}</div>
                <div className="source-reg">{s.regulator}</div>
              </div>
              <a href={s.url} target="_blank" rel="noreferrer" className="source-link">Visit</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function ReportingPage() {
  const [tab,      setTab]      = useState('docs');
  const [phase,    setPhase]    = useState('idle');
  const [progress, setProgress] = useState({ done: 0, total: SCAN_REGIONS.length, source: '', found: 0 });
  const [findings, setFindings] = useState([]);
  const [notify,   setNotify]   = useState(true);
  const [toast,    setToast]    = useState(null);

  const stopRef = useRef(false);
  const { notify: pushNotify } = useNotifications();

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 6000);
  }

  async function handleRun() {
    if (phase === 'scanning') return;
    try {
      stopRef.current = false;
      setPhase('scanning');
      setFindings([]);
      setProgress({ done: 0, total: SCAN_REGIONS.length, source: '', found: 0 });

      const results = await runWebScan(p => setProgress({ ...p }), stopRef);

      setFindings(results);
      setPhase('done');

      const newCount = results.filter(r => !r.alreadyCovered).length;
      const msg = `${newCount} new document${newCount !== 1 ? 's' : ''} found across the web.`;
      showToast(msg);
      if (notify) pushNotify('✅ Scan complete — Reg Library', msg, () => window.focus());
    } catch (err) {
      console.error('Scan error:', err);
      setPhase('idle');
      showToast('Scan failed: ' + err.message, 'warn');
    }
  }

  function handleStop() { stopRef.current = true; }

  const isScanning  = phase === 'scanning';
  const isDone      = phase === 'done';
  const pct         = Math.round((progress.done / progress.total) * 100);
  const newFindings = findings.filter(r => !r.alreadyCovered);

  const statusText = isScanning
    ? `${progress.source} (${pct}%)`
    : isDone
      ? `${newFindings.length} new · ${findings.filter(r => r.alreadyCovered).length} already covered`
      : 'Ready';

  return (
    <div className="rp-root">

      {/* Toast */}
      {toast && (
        <div className={`rp-toast rp-toast--${toast.type}`}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="rp-header">
        <div className="rp-brand">VIXIO REGULATORY INTELLIGENCE</div>
        <h1 className="rp-title">Banking Compliance Reg Library Finder</h1>
        <p className="rp-subtitle">Live web scan for new documents not yet in your library.</p>
        <div className="rp-header-actions">
          <button className="rp-hbtn" onClick={handleRun} disabled={isScanning}>
            {isScanning ? 'Scanning…' : 'Run Scan'}
          </button>
          <button
            className="rp-hbtn"
            onClick={() => downloadCSV(newFindings, `reg-new-${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={newFindings.length === 0}
          >
            Export CSV
          </button>
        </div>
      </header>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="rp-tabs-bar">
        <div className="rp-tabs">
          <button
            className={`rp-tab ${tab === 'current' ? 'rp-tab--active' : ''}`}
            onClick={() => setTab('current')}
          >
            Current Reg Docs
          </button>
          <button
            className={`rp-tab rp-tab--green ${tab === 'docs' ? 'rp-tab--active-green' : ''}`}
            onClick={() => setTab('docs')}
          >
            Scan Results
          </button>
        </div>
      </div>

      {/* ── Current Reg Docs tab ────────────────────────────────────────────── */}
      {tab === 'current' && <CurrentDocsTab />}

      {/* ── Scan Results tab ────────────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div className="rp-body">

          {/* Action bar */}
          <div className="rp-action-bar">
            <div className="rp-action-row">
              <button className="rp-btn rp-btn--blue" onClick={handleRun} disabled={isScanning}>
                {isScanning ? 'Scanning…' : 'Run Doc Search'}
              </button>
              <button
                className="rp-btn rp-btn--green"
                onClick={() => downloadCSV(newFindings, `reg-new-${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={newFindings.length === 0}
              >
                Export New
              </button>
              <label className="rp-notify-label">
                <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
                Notify
              </label>
            </div>
            <div className={`rp-status ${isScanning ? 'rp-status--active' : ''}`}>
              {isScanning && <span className="rp-status-dot" />}
              <span>{statusText}</span>
            </div>
          </div>

          {/* Progress bar */}
          {isScanning && (
            <div className="rp-progress-wrap">
              <div className="rp-progress-bar">
                <div className="rp-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="rp-progress-label">
                <span><strong title={progress.source}>{progress.source}</strong></span>
                <span className="rp-progress-right">
                  {progress.done}/{progress.total} regions · {progress.found} found
                  <button className="rp-stop" onClick={handleStop}>Stop</button>
                </span>
              </div>
            </div>
          )}

          {/* Library info */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Your Reg Library</div>
              <div className="rp-panel-sub">
                {seedUrls.length.toLocaleString()} documents — findings are deduplicated against this list.
              </div>
            </div>
          </div>

          {/* Findings */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Documents Found Online</div>
              <div className="rp-panel-sub">
                {isScanning
                  ? `Live web scan in progress across ${SCAN_REGIONS.length} regions…`
                  : isDone
                    ? `${newFindings.length} new · ${findings.filter(r => r.alreadyCovered).length} already in library`
                    : 'Run a scan to search the web for new regulatory documents.'}
              </div>
            </div>
            <DocTable
              rows={findings}
              emptyMsg={isScanning ? 'Searching the web…' : 'Run a scan to find new regulatory documents.'}
              showCoveredBadge
            />
          </div>

        </div>
      )}
    </div>
  );
}
