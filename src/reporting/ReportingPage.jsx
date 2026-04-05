import React, { useState, useRef, useEffect } from 'react';
import { SOURCES }           from '../lib/sources.js';
import { deepSearch }        from '../lib/deepSearch.js';
import { useNotifications }  from './components/BackgroundTaskManager.jsx';
import { FloatingPaths }          from './components/FloatingPaths.jsx';
import seedUrls               from './data/seedData.json';
import webFindings            from './data/webFindings.json';

// URLs already in the reg library — dedup against these
const SEED_URLS = new Set(seedUrls.map(u => u.replace('http://', 'https://')));

const BANKING_VERTICALS = ['Banking', 'Financial Services'];

// Use every SOURCES entry as its own scan target (79 total)
const SCAN_TARGETS = SOURCES.map(s => ({
  key:       s.id,
  regulator: s.regulator,
  region:    s.region,
  category:  s.category,
}));

const CACHE_KEY   = 'reglib_scan_cache';
const HISTORY_KEY = 'reglib_scan_history';

// ── Cache helpers ─────────────────────────────────────────────────────────────
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCache(findings, liveMode) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      findings,
      liveMode,
      scannedAt: new Date().toISOString(),
    }));
  } catch {
    // storage full — silently skip
  }
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}

// ── History helpers ───────────────────────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendHistory(findings, liveMode, scannedAt) {
  try {
    const history = loadHistory();
    history.unshift({
      id:          scannedAt,
      scannedAt,
      liveMode,
      total:       findings.length,
      newCount:    findings.filter(r => !r.alreadyCovered).length,
      findings,
    });
    // keep last 10 runs
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {
    // storage full — silently skip
  }
}

function formatAge(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return 'just now';
}

// ── Map a Gemini result object → finding row ──────────────────────────────────
function toFinding(doc, idx) {
  const url     = doc.sourceUrl || doc.url || '';
  const normUrl = url.replace('http://', 'https://');
  return {
    id:             `found-${idx + 1}`,
    vertical:       'Financial Services',
    jurisdiction:   doc.jurisdiction || doc.region || '',
    authority:      doc.authority    || '',
    documentType:   doc.type         || doc.documentType || '',
    commonName:     doc.title        || doc.commonName   || url,
    url,
    alreadyCovered: SEED_URLS.has(normUrl),
    summary:        doc.summary      || '',
  };
}

// ── Local fallback: sample from webFindings.json ──────────────────────────────
function localFallback(region) {
  return webFindings
    .filter(d =>
      BANKING_VERTICALS.includes(d.vertical) &&
      (d.region === region || d.region === 'Global' || region === 'Global')
    )
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
}

// ── Live web scan via proxy → Gemini (falls back to local data if proxy down) ──
async function runWebScan(onProgress, stopRef) {
  const found    = [];
  const seenUrls = new Set();
  const total    = SCAN_TARGETS.length;
  let   liveMode = true;

  function addDoc(doc) {
    const url = doc.sourceUrl || doc.url || '';
    if (!url) return;
    const normUrl = url.replace('http://', 'https://');
    if (seenUrls.has(normUrl)) return;
    seenUrls.add(normUrl);
    found.push(toFinding(doc, found.length));
  }

  for (let i = 0; i < total; i++) {
    if (stopRef.current) break;
    const target = SCAN_TARGETS[i];
    onProgress({ done: i, total, source: `${target.regulator}`, found: found.length, liveMode });

    try {
      const results = await deepSearch({
        query:    `binding banking and financial services regulations from ${target.regulator}`,
        region:   target.region,
        category: target.category,
      });
      results.forEach(addDoc);
    } catch (err) {
      liveMode = false;
      console.warn(`Proxy unavailable for ${target.regulator}, using local data:`, err.message);
      localFallback(target.region).forEach(addDoc);
    }

    onProgress({ done: i + 1, total, source: `${target.regulator}`, found: found.length, liveMode });
    if (stopRef.current) break;
  }

  return { found, liveMode };
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

// ── History entry (collapsible) ───────────────────────────────────────────────
function HistoryEntry({ entry, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const newFindings = entry.findings.filter(r => !r.alreadyCovered);
  return (
    <div className="rp-history-entry">
      <button className="rp-history-row" onClick={() => setOpen(o => !o)}>
        <span className="rp-history-date">
          {new Date(entry.scannedAt).toLocaleString()}
        </span>
        <span className="rp-history-meta">
          {entry.newCount} new · {entry.total - entry.newCount} covered
          <span className={`rp-mode-badge rp-mode-badge--sm ${entry.liveMode ? 'rp-mode-badge--live' : 'rp-mode-badge--demo'}`}>
            {entry.liveMode ? '● Live' : '○ Demo'}
          </span>
        </span>
        <span className="rp-history-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="rp-history-body">
          <div className="rp-history-actions">
            <button
              className="rp-btn rp-btn--green"
              onClick={() => downloadCSV(newFindings, `reg-new-${entry.scannedAt.slice(0,10)}.csv`)}
              disabled={newFindings.length === 0}
            >
              Export New
            </button>
            <button
              className="rp-btn rp-btn--ghost"
              onClick={() => downloadCSV(entry.findings, `reg-all-${entry.scannedAt.slice(0,10)}.csv`)}
              disabled={entry.findings.length === 0}
            >
              Export All
            </button>
          </div>
          <DocTable rows={entry.findings} emptyMsg="No findings." showCoveredBadge />
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function ReportingPage() {

  const cached = loadCache();

  const [phase,     setPhase]     = useState(cached ? 'done' : 'idle');
  const [progress,  setProgress]  = useState({ done: 0, total: SCAN_TARGETS.length, source: '', found: 0 });
  const [findings,  setFindings]  = useState(cached?.findings ?? []);
  const [notify,      setNotify]      = useState(true);
  const [toast,       setToast]       = useState(null);
  const [liveMode,    setLiveMode]    = useState(cached?.liveMode ?? true);
  const [scannedAt,   setScannedAt]   = useState(cached?.scannedAt ?? null);
  const [showHistory, setShowHistory] = useState(false);
  const [history,     setHistory]     = useState(() => loadHistory());

  const stopRef = useRef(false);
  const { notify: pushNotify } = useNotifications();

  // Keep scannedAt display fresh (re-render every minute)
  useEffect(() => {
    if (!scannedAt) return;
    const id = setInterval(() => setScannedAt(s => s), 60000);
    return () => clearInterval(id);
  }, [scannedAt]);

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
      setProgress({ done: 0, total: SCAN_TARGETS.length, source: '', found: 0 });

      const { found: results, liveMode: live } = await runWebScan(p => setProgress({ ...p }), stopRef);

      setFindings(results);
      setLiveMode(live);
      setPhase('done');
      const now = new Date().toISOString();
      setScannedAt(now);
      saveCache(results, live);
      appendHistory(results, live, now);
      setHistory(loadHistory());

      const newCount = results.filter(r => !r.alreadyCovered).length;
      const msg = `${newCount} new document${newCount !== 1 ? 's' : ''} found${live ? ' via live web scan' : ' (demo data — proxy not connected)'}.`;
      showToast(msg);
      if (notify) pushNotify('✅ Scan complete — Reg Library', msg, () => window.focus());
    } catch (err) {
      console.error('Scan error:', err);
      setPhase('idle');
      showToast('Scan failed: ' + err.message, 'warn');
    }
  }

  function handleStop() { stopRef.current = true; }

  function handleClearCache() {
    clearCache();
    setFindings([]);
    setPhase('idle');
    setScannedAt(null);
    showToast('Scan cache cleared.', 'success');
  }

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
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
        <div className="rp-header-content">
        <div className="rp-brand">VIXIO REGULATORY INTELLIGENCE</div>
        <h1 className="rp-title">Banking Regulation Finder</h1>
        <p className="rp-subtitle">Live web scan for new documents not yet in the reg library.</p>
        <div className="rp-header-actions">
          <button className="rp-hbtn" onClick={handleRun} disabled={isScanning}>
            {isScanning ? 'Scanning…' : 'Run Doc Search'}
          </button>
          <button className="rp-hbtn" onClick={() => setShowHistory(h => !h)}>
            History {history.length > 0 && `(${history.length})`}
          </button>
          <span className={`rp-mode-badge ${liveMode ? 'rp-mode-badge--live' : 'rp-mode-badge--demo'}`}>
            {liveMode ? '● Live' : '○ Demo'}
          </span>
        </div>
        </div>
      </header>

      {/* ── Scan Results ────────────────────────────────────────────────────── */}
      <div className="rp-body">

          {/* Action bar */}
          <div className="rp-action-bar">
            <div className="rp-action-row">
              <button className="rp-btn rp-btn--blue" onClick={handleRun} disabled={isScanning}>
                {isScanning ? 'Scanning…' : 'Run Doc Search'}
              </button>
              {scannedAt && (
                <button className="rp-btn rp-btn--ghost" onClick={handleClearCache}>
                  Clear Cache
                </button>
              )}
              <label className="rp-notify-label">
                <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
                Notify
              </label>
            </div>
            <div className={`rp-status ${isScanning ? 'rp-status--active' : ''}`}>
              {isScanning && <span className="rp-status-dot" />}
              <span>{statusText}</span>
              {scannedAt && !isScanning && (
                <span className="rp-cache-age"> · cached {formatAge(scannedAt)}</span>
              )}
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
                  {progress.done}/{progress.total} regulators · {progress.found} found
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
                  ? `Scanning ${SCAN_TARGETS.length} regulators…`
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

      {/* ── History drawer ───────────────────────────────────────────────────── */}
      {showHistory && (
        <div className="rp-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="rp-history-drawer" onClick={e => e.stopPropagation()}>
            <div className="rp-history-head">
              <span className="rp-history-title">Scan History</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {history.length > 0 && (
                  <button
                    className="rp-btn rp-btn--ghost"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                    onClick={() => {
                      localStorage.removeItem(HISTORY_KEY);
                      setHistory([]);
                    }}
                  >
                    Clear History
                  </button>
                )}
                <button className="rp-history-close" onClick={() => setShowHistory(false)}>✕</button>
              </div>
            </div>
            {history.length === 0 ? (
              <div className="rp-history-empty">No past scans yet.</div>
            ) : (
              history.map((entry, i) => (
                <HistoryEntry
                  key={entry.id}
                  entry={entry}
                  defaultOpen={i === 0}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
