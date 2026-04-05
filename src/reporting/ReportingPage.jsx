import React, { useState, useRef } from 'react';
import { SOURCES }            from '../lib/sources.js';
import { useNotifications }   from './components/BackgroundTaskManager.jsx';
import seedUrls                from './data/seedData.json';
import webFindings             from './data/webFindings.json';

// URLs already in our reg library (used to prevent duplicate findings)
const SEED_URLS = new Set(seedUrls.map(u => u.replace('http://', 'https://')));

// ── Simulate crawling the web and returning direct-link findings ──────────────
// Each source checks the webFindings pool for documents in its region.
// Every returned item has a verified direct URL to the actual legislation.
// In production: replaced by the real scraper + Anthropic deep-search API.
function simulateScan(onProgress, stopRef) {
  return new Promise(async (resolve) => {
    const found   = [];
    const seenUrls = new Set();
    const total    = SOURCES.length;

    for (let i = 0; i < total; i++) {
      if (stopRef.current) break;

      const source = SOURCES[i];
      await new Promise(r => setTimeout(r, 100 + Math.random() * 300));
      if (stopRef.current) break;

      // Find web documents that match this source's region
      const candidates = webFindings.filter(doc =>
        doc.region === source.region || doc.region === 'Global' || source.region === 'Global'
      );

      // Sample 0–2 candidates per source (realistic hit rate)
      const shuffled = candidates.sort(() => Math.random() - 0.5);
      for (const doc of shuffled.slice(0, Math.random() > 0.5 ? 2 : 1)) {
        if (seenUrls.has(doc.url)) continue;
        seenUrls.add(doc.url);
        found.push({
          id:           `found-${found.length + 1}`,
          vertical:     doc.vertical,
          jurisdiction: doc.jurisdiction,
          authority:    doc.authority,
          documentType: doc.documentType,
          commonName:   doc.commonName,
          url:          doc.url,         // direct link to the actual legislation
          alreadyCovered: SEED_URLS.has(doc.url.replace('http://', 'https://')),
        });
      }

      onProgress({ done: i + 1, total, source: source.label, found: found.length });
    }

    resolve(found);
  });
}

// ── CSV export helper ─────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const headers = ['Vertical', 'Jurisdiction', 'Authority', 'Document Type', 'Common Name', 'URL'];
  const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines   = rows.map(r => [
    escape(r.vertical), escape(r.jurisdiction), escape(r.authority),
    escape(r.documentType), escape(r.commonName), escape(r.url),
  ].join(','));
  const csv  = [headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Table component ───────────────────────────────────────────────────────────
function DocTable({ rows, emptyMsg, showCoveredBadge = false }) {
  if (!rows || rows.length === 0) {
    return <div className="table-empty">{emptyMsg}</div>;
  }
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            <th>Vertical</th>
            <th>Jxd</th>
            <th>Authority</th>
            <th>Document Type</th>
            <th>Common Name</th>
            <th>Open Legislation</th>
            {showCoveredBadge && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={`${i % 2 === 0 ? 'row-even' : 'row-odd'}${row.alreadyCovered ? ' row-covered' : ''}`}>
              <td>{row.vertical}</td>
              <td>{row.jurisdiction}</td>
              <td>{row.authority}</td>
              <td>{row.documentType}</td>
              <td className="td-name">{row.commonName}</td>
              <td className="td-url">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="open-btn"
                  title={row.url}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
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

// ── Source Discovery tab ──────────────────────────────────────────────────────
function SourceDiscoveryTab() {
  return (
    <div className="tab-panel">
      <div className="panel-header">
        <div className="panel-title">Current Regulatory Documents</div>
        <div className="panel-sub">{seedUrls.length.toLocaleString()} documents already in your reg library across {SOURCES.length} monitored sources. Scan results are deduplicated against this list.</div>
      </div>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              <th>Region</th>
              <th>Regulator</th>
              <th>Source Name</th>
              <th>Category</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s, i) => (
              <tr key={s.id} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                <td>{s.region}</td>
                <td>{s.regulator}</td>
                <td>{s.label}</td>
                <td>{s.category}</td>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer" className="doc-link">{s.url}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function ReportingPage() {
  const [tab,       setTab]       = useState('docs');       // 'discovery' | 'docs'
  const [phase,     setPhase]     = useState('idle');        // 'idle' | 'scanning' | 'done'
  const [progress,  setProgress]  = useState({ done: 0, total: SOURCES.length, source: '', found: 0 });
  const [findings,  setFindings]  = useState([]);
  const [notify,    setNotify]    = useState(true);
  const [toast,     setToast]     = useState(null);

  const stopRef    = useRef(false);
  const { notify: pushNotify } = useNotifications();

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  // ── Run scan ────────────────────────────────────────────────────────────────
  async function handleRun() {
    if (phase === 'scanning') return;
    try {
      stopRef.current = false;
      setPhase('scanning');
      setFindings([]);
      setProgress({ done: 0, total: SOURCES.length, source: '', found: 0 });

      const results = await simulateScan(
        (p) => setProgress({ ...p }),
        stopRef
      );

      setFindings(results);
      setPhase('done');

      const newCount = results.filter(r => !r.alreadyCovered).length;
      const msg = `Scan complete — ${newCount} new document${newCount !== 1 ? 's' : ''} found.`;
      showToast(msg);
      if (notify) {
        pushNotify('✅ Scan complete — Reg Library', msg, () => window.focus());
      }
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

  const statusText = isScanning
    ? `Running Reg Library document search… (${pct}%)`
    : isDone
      ? `Scan complete — ${findings.length} new documents found`
      : 'Ready';

  return (
    <div className="rp-root">

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`rp-toast rp-toast--${toast.type}`}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════════════════ */}
      <header className="rp-header">
        <div className="rp-header-inner">
          <div className="rp-brand">VIXIO REGULATORY INTELLIGENCE</div>
          <h1 className="rp-title">Banking Compliance Reg Library Finder</h1>
          <p className="rp-subtitle">
            Built for finding viable documents for our Banking vertical through web-wide trace
            scanning, excluding what we already cover for the reg library.
          </p>
          <div className="rp-header-actions">
            <button
              className="rp-hbtn"
              onClick={handleRun}
              disabled={isScanning}
            >
              {isScanning ? 'Running…' : 'Run Now'}
            </button>
            <button className="rp-hbtn" onClick={() => setTab('docs')}>
              Findings Table
            </button>
            <button
              className="rp-hbtn"
              onClick={() => downloadCSV(findings, `reg-findings-${new Date().toISOString().slice(0,10)}.csv`)}
              disabled={findings.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          TABS
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rp-tabs-bar">
        <div className="rp-tabs">
          <button
            className={`rp-tab ${tab === 'discovery' ? 'rp-tab--active' : ''}`}
            onClick={() => setTab('discovery')}
          >
            Current Regulatory Documents
          </button>
          <button
            className={`rp-tab rp-tab--green ${tab === 'docs' ? 'rp-tab--active-green' : ''}`}
            onClick={() => setTab('docs')}
          >
            Reg Library Docs
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SOURCE DISCOVERY TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'discovery' && <SourceDiscoveryTab />}

      {/* ════════════════════════════════════════════════════════════════════
          REG LIBRARY DOCS TAB
      ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'docs' && (
        <div className="rp-docs-tab">

          {/* ── Action bar ────────────────────────────────────────────────── */}
          <div className="rp-action-bar">
            <div className="rp-action-left">
              <button
                className="rp-btn rp-btn--blue"
                onClick={handleRun}
                disabled={isScanning}
              >
                {isScanning ? 'Scanning…' : 'Run Doc Search'}
              </button>
              <button
                className="rp-btn rp-btn--green"
                onClick={() => downloadCSV(findings, `reg-findings-${new Date().toISOString().slice(0,10)}.csv`)}
                disabled={findings.length === 0}
              >
                Export New Findings CSV
              </button>
              <label className="rp-notify-label">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={e => setNotify(e.target.checked)}
                />
                Notify when scan completes
              </label>
            </div>
            <div className={`rp-status ${isScanning ? 'rp-status--active' : ''}`}>
              {isScanning && <span className="rp-status-dot" />}
              <span>Status: {statusText}</span>
            </div>
          </div>

          {/* ── Progress bar (during scan) ─────────────────────────────────── */}
          {isScanning && (
            <div className="rp-progress-wrap">
              <div className="rp-progress-bar">
                <div className="rp-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="rp-progress-label">
                <span>Scanning: <strong>{progress.source}</strong></span>
                <span>{progress.done} / {progress.total} sources · {progress.found} found</span>
                <button className="rp-stop" onClick={handleStop}>Stop</button>
              </div>
            </div>
          )}

          {/* ── Seed documents panel ──────────────────────────────────────── */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Current Regulatory Documents</div>
              <div className="rp-panel-sub">
                {seedUrls.length.toLocaleString()} documents already in your reg library. Scan results showing "In library" are already covered.
              </div>
            </div>
          </div>

          {/* ── Findings panel ────────────────────────────────────────────── */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Similar Documents Found Online</div>
              <div className="rp-panel-sub">
                {isScanning
                  ? `Searching across ${seedUrls.length.toLocaleString()} library URLs…`
                  : isDone
                    ? `${findings.filter(r => !r.alreadyCovered).length} new document${findings.filter(r=>!r.alreadyCovered).length !== 1 ? 's' : ''} found (${findings.filter(r=>r.alreadyCovered).length} already in library).`
                    : 'Run a search to find similar online documents.'}
              </div>
            </div>
            <DocTable
              rows={findings}
              emptyMsg={isScanning ? 'Searching…' : 'Run a search to find similar online documents.'}
              showCoveredBadge
            />
          </div>

        </div>
      )}
    </div>
  );
}
