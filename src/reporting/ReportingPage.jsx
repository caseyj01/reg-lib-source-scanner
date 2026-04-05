import React, { useState, useRef } from 'react';
import { SOURCES }            from '../lib/sources.js';
import { useNotifications }   from './components/BackgroundTaskManager.jsx';
import seedUrls                from './data/seedData.json';
import webFindings             from './data/webFindings.json';

// URLs already in our reg library (used to prevent duplicate findings)
const SEED_URLS = new Set(seedUrls.map(u => u.replace('http://', 'https://')));

// Only Banking / Financial Services verticals
const BANKING_VERTICALS = ['Banking', 'Financial Services'];

// ── Simulate crawling the web and returning direct-link findings ──────────────
function simulateScan(onProgress, stopRef) {
  return new Promise(async (resolve) => {
    const found    = [];
    const seenUrls = new Set();
    const total    = SOURCES.length;

    for (let i = 0; i < total; i++) {
      if (stopRef.current) break;

      const source = SOURCES[i];
      await new Promise(r => setTimeout(r, 80 + Math.random() * 220));
      if (stopRef.current) break;

      const candidates = webFindings.filter(doc =>
        BANKING_VERTICALS.includes(doc.vertical) &&
        (doc.region === source.region || doc.region === 'Global' || source.region === 'Global')
      );

      const shuffled = candidates.sort(() => Math.random() - 0.5);
      for (const doc of shuffled.slice(0, Math.random() > 0.5 ? 2 : 1)) {
        if (seenUrls.has(doc.url)) continue;
        seenUrls.add(doc.url);
        found.push({
          id:             `found-${found.length + 1}`,
          vertical:       doc.vertical,
          jurisdiction:   doc.jurisdiction,
          authority:      doc.authority,
          documentType:   doc.documentType,
          commonName:     doc.commonName,
          url:            doc.url,
          alreadyCovered: SEED_URLS.has(doc.url.replace('http://', 'https://')),
        });
      }

      onProgress({ done: i + 1, total, source: source.label, found: found.length });
    }

    resolve(found);
  });
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

// ── Current Regulatory Documents tab ─────────────────────────────────────────
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
          <div className="rp-panel-sub">{SOURCES.length} sources crawled on each scan</div>
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
  const [progress, setProgress] = useState({ done: 0, total: SOURCES.length, source: '', found: 0 });
  const [findings, setFindings] = useState([]);
  const [notify,   setNotify]   = useState(true);
  const [toast,    setToast]    = useState(null);

  const stopRef = useRef(false);
  const { notify: pushNotify } = useNotifications();

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleRun() {
    if (phase === 'scanning') return;
    try {
      stopRef.current = false;
      setPhase('scanning');
      setFindings([]);
      setProgress({ done: 0, total: SOURCES.length, source: '', found: 0 });

      const results = await simulateScan(p => setProgress({ ...p }), stopRef);

      setFindings(results);
      setPhase('done');

      const newCount = results.filter(r => !r.alreadyCovered).length;
      const msg = `${newCount} new document${newCount !== 1 ? 's' : ''} found.`;
      showToast(msg);
      if (notify) pushNotify('✅ Scan complete — Reg Library', msg, () => window.focus());
    } catch (err) {
      console.error('Scan error:', err);
      setPhase('idle');
      showToast('Scan failed: ' + err.message, 'warn');
    }
  }

  function handleStop() { stopRef.current = true; }

  const isScanning = phase === 'scanning';
  const isDone     = phase === 'done';
  const pct        = Math.round((progress.done / progress.total) * 100);
  const newFindings = findings.filter(r => !r.alreadyCovered);

  const statusText = isScanning
    ? `Scanning… ${pct}%`
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
        <p className="rp-subtitle">Web-wide scan for new documents not yet in your library.</p>
        <div className="rp-header-actions">
          <button className="rp-hbtn" onClick={handleRun} disabled={isScanning}>
            {isScanning ? 'Running…' : 'Run Scan'}
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
                <span>Scanning: <strong title={progress.source}>{progress.source}</strong></span>
                <span className="rp-progress-right">
                  {progress.done}/{progress.total} · {progress.found} found
                  <button className="rp-stop" onClick={handleStop}>Stop</button>
                </span>
              </div>
            </div>
          )}

          {/* Library count panel */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Your Reg Library</div>
              <div className="rp-panel-sub">
                {seedUrls.length.toLocaleString()} documents — new findings are deduplicated against this list.
              </div>
            </div>
          </div>

          {/* Findings panel */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Documents Found Online</div>
              <div className="rp-panel-sub">
                {isScanning
                  ? `Searching across ${seedUrls.length.toLocaleString()} library URLs…`
                  : isDone
                    ? `${newFindings.length} new · ${findings.filter(r => r.alreadyCovered).length} already in library`
                    : 'Run a search to find new regulatory documents.'}
              </div>
            </div>
            <DocTable
              rows={findings}
              emptyMsg={isScanning ? 'Searching…' : 'Run a search to find new regulatory documents.'}
              showCoveredBadge
            />
          </div>

        </div>
      )}
    </div>
  );
}
