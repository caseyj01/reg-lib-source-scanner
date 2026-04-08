import React, { useState, useRef, useEffect } from 'react';
import { SOURCES }           from '../lib/sources.js';
import { deepSearch }        from '../lib/deepSearch.js';
import { ADDITIONAL_AUTHORITIES } from '../lib/additionalAuthorities.js';
import { useNotifications }  from './components/BackgroundTaskManager.jsx';
import { FloatingPaths }          from './components/FloatingPaths.jsx';
import { BackgroundGradientGlow } from '../components/ui/background-gradient-glow.jsx';
import seedUrls               from './data/seedData.json';
import webFindings            from './data/webFindings.json';

// URLs already in the reg library — dedup against these
const SEED_URLS = new Set(seedUrls.map(u => u.replace('http://', 'https://')));

const BANKING_VERTICALS = ['Banking', 'Financial Services'];

// Use every SOURCES entry as its own scan target (monitored)
const SCAN_TARGETS = [
  ...SOURCES.map(s => ({
    key:       s.id,
    regulator: s.regulator,
    region:    s.region,
    category:  s.category,
    monitored: true,
  })),
  ...ADDITIONAL_AUTHORITIES.map(a => ({
    key:       `gap-${a.name}`,
    regulator: a.name,
    region:    a.region,
    category:  'All',
    monitored: false,
  })),
];

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
function toFinding(doc, idx, monitored = true) {
  const url1 = doc.sourceUrl1 || doc.sourceUrl || doc.url || '';
  const url2 = doc.sourceUrl2 || '';
  const normUrl1 = url1.replace('http://', 'https://');
  return {
    id:           `found-${idx + 1}`,
    reqReport:    doc.reqReport    || 'Y',
    requirement:  doc.requirement  || '',
    description:  doc.description  || '',
    analystGuide: doc.analystGuide || '',
    reference:    doc.reference    || doc.primaryLegRef || '',
    sourceUrl1:     url1,
    sourceUrl1Type: doc.sourceUrl1Type || '',
    sourceUrl2:     url2,
    sourceUrl2Type: doc.sourceUrl2Type || '',
    authority:    doc.authority    || '',
    jurisdiction: doc.jurisdiction || doc.region || '',
    alreadyCovered: SEED_URLS.has(normUrl1),
    monitored,
  };
}

// ── Local fallback: returns empty when proxy is down ──────────────────────────
function localFallback() {
  return [];
}

// ── Live web scan via proxy → Gemini (falls back to local data if proxy down) ──
const CONCURRENCY = 3;
const REQUEST_DELAY_MS = 1500; // stay well under 30 RPM limit

async function runWebScan(onProgress, stopRef) {
  const found    = [];
  const seenRefs = new Set();
  const total    = SCAN_TARGETS.length;
  let   liveMode = true;
  let   done     = 0;

  function addDoc(doc, monitored) {
    const key = (doc.reference || doc.sourceUrl1 || doc.sourceUrl || '').trim().toLowerCase();
    if (!key) return;
    if (seenRefs.has(key)) return;
    seenRefs.add(key);
    found.push(toFinding(doc, found.length, monitored));
  }

  async function processTarget(target) {
    if (stopRef.current) return;
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    try {
      const results = await deepSearch({
        query:    target.regulator,
        region:   target.region,
        category: target.category,
      });
      results.forEach(doc => addDoc(doc, target.monitored));
    } catch (err) {
      liveMode = false;
      console.warn(`Proxy unavailable for ${target.regulator}:`, err.message);
    }
    done++;
    onProgress({ done, total, source: target.regulator, found: found.length, liveMode });
  }

  // Run with limited concurrency
  const queue = [...SCAN_TARGETS];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0 && !stopRef.current) {
      const target = queue.shift();
      await processTarget(target);
    }
  });
  await Promise.all(workers);

  return { found, liveMode };
}

// ── CSV export ────────────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const headers = ['REQ REPORT?', 'Requirement', 'Description', 'Analyst Guide', 'Reference', 'Source links URL 1', 'Link 1 Type', 'Source links URL 2', 'Link 2 Type', 'Authority', 'Jurisdiction'];
  const esc     = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines   = rows.map(r =>
    [r.reqReport, r.requirement, r.description, r.analystGuide, r.reference, r.sourceUrl1, r.sourceUrl1Type, r.sourceUrl2, r.sourceUrl2Type, r.authority, r.jurisdiction].map(esc).join(',')
  );
  const csv  = [headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Resizable table wrapper ───────────────────────────────────────────────────
function ResizableTable({ children, defaultHeight = 260, minHeight = 120 }) {
  const [height, setHeight] = React.useState(defaultHeight);
  const dragRef = React.useRef(null);

  function onMouseDown(e) {
    e.preventDefault();
    const startY  = e.clientY;
    const startH  = height;

    function onMove(ev) {
      const next = Math.max(minHeight, startH + (ev.clientY - startY));
      setHeight(next);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onTouchStart(e) {
    const startY = e.touches[0].clientY;
    const startH = height;

    function onMove(ev) {
      const next = Math.max(minHeight, startH + (ev.touches[0].clientY - startY));
      setHeight(next);
    }
    function onEnd() {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    }
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  return (
    <div className="doc-table-resizable">
      <div className="doc-table-wrap" style={{ maxHeight: height }}>
        {children}
      </div>
      <div
        ref={dragRef}
        className="doc-table-drag-handle"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        title="Drag to resize"
      >
        <span className="doc-table-drag-grip" />
      </div>
    </div>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────
function DocTable({ rows, emptyMsg, showCoveredBadge = false }) {
  if (!rows || rows.length === 0) {
    return <div className="table-empty">{emptyMsg}</div>;
  }
  return (
    <ResizableTable>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Req</th>
            <th>Category</th>
            <th>Description</th>
            <th>Reference</th>
            <th>Links</th>
            {showCoveredBadge && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              className={`${i % 2 === 0 ? 'row-even' : 'row-odd'}${row.alreadyCovered ? ' row-covered' : ''}`}
            >
              <td><span className="leg-badge leg-badge--primary">{row.reqReport || 'Y'}</span></td>
              <td className="td-name" title={row.requirement}>{row.requirement}</td>
              <td className="td-desc" title={row.description}>{row.description}</td>
              <td className="td-ref" title={row.reference}>{row.reference}</td>
              <td className="td-url">
                {row.sourceUrl1 && (
                  <a href={row.sourceUrl1} target="_blank" rel="noreferrer noopener" className="open-btn open-btn--labeled" title={row.sourceUrl1}>
                    <svg width="9" height="9" viewBox="0 0 11 11" fill="none" style={{flexShrink:0}}>
                      <path d="M4.5 1.5H2A1 1 0 001 2.5v6.5A1 1 0 002 10h6.5A1 1 0 009.5 9V6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                      <path d="M7 1.5h2.5V4M9.5 1.5L5.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {row.sourceUrl1Type || 'Source 1'}
                  </a>
                )}
                {row.sourceUrl2 && (
                  <a href={row.sourceUrl2} target="_blank" rel="noreferrer noopener" className="open-btn open-btn--labeled" title={row.sourceUrl2}>
                    <svg width="9" height="9" viewBox="0 0 11 11" fill="none" style={{flexShrink:0}}>
                      <path d="M4.5 1.5H2A1 1 0 001 2.5v6.5A1 1 0 002 10h6.5A1 1 0 009.5 9V6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                      <path d="M7 1.5h2.5V4M9.5 1.5L5.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {row.sourceUrl2Type || 'Source 2'}
                  </a>
                )}
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
    </ResizableTable>
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
          <span className="rp-mode-badge rp-mode-badge--sm rp-mode-badge--live">● Live</span>
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

// ── Coverage Gaps mini-table ──────────────────────────────────────────────────
function GapFindingsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <div className="gap-findings-empty">No requirements found for this authority.</div>;
  }
  return (
    <div className="gap-findings-wrap">
      <table className="gap-findings-table">
        <thead>
          <tr>
            <th>Req</th>
            <th>Requirement</th>
            <th>Description</th>
            <th>Reference</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
              <td><span className="leg-badge leg-badge--primary">{row.reqReport || 'Y'}</span></td>
              <td className="td-name" title={row.requirement}>{row.requirement}</td>
              <td className="td-desc" title={row.description}>{row.description}</td>
              <td className="td-ref" title={row.reference}>{row.reference}</td>
              <td className="td-url">
                {row.sourceUrl1 && (
                  <a href={row.sourceUrl1} target="_blank" rel="noreferrer noopener" className="open-btn open-btn--labeled" title={row.sourceUrl1}>
                    <svg width="9" height="9" viewBox="0 0 11 11" fill="none" style={{flexShrink:0}}>
                      <path d="M4.5 1.5H2A1 1 0 001 2.5v6.5A1 1 0 002 10h6.5A1 1 0 009.5 9V6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                      <path d="M7 1.5h2.5V4M9.5 1.5L5.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {row.sourceUrl1Type || 'Source 1'}
                  </a>
                )}
                {row.sourceUrl2 && (
                  <a href={row.sourceUrl2} target="_blank" rel="noreferrer noopener" className="open-btn open-btn--labeled" title={row.sourceUrl2}>
                    <svg width="9" height="9" viewBox="0 0 11 11" fill="none" style={{flexShrink:0}}>
                      <path d="M4.5 1.5H2A1 1 0 001 2.5v6.5A1 1 0 002 10h6.5A1 1 0 009.5 9V6.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                      <path d="M7 1.5h2.5V4M9.5 1.5L5.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {row.sourceUrl2Type || 'Source 2'}
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Coverage Gaps panel ───────────────────────────────────────────────────────
function CoverageGapsPanel({ gapSearch, setGapSearch, gapByAuthority, filteredGaps, isScanning }) {
  const totalCount   = ADDITIONAL_AUTHORITIES.length;
  const visibleCount = filteredGaps.length;
  const scannedCount = Object.keys(gapByAuthority).length;
  const totalGapFindings = Object.values(gapByAuthority).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="rp-panel gap-panel">
      <div className="rp-panel-head gap-panel-head">
        <div className="gap-panel-title-row">
          <div className="rp-panel-title">Coverage Gaps — Unmonitored Authorities</div>
          {scannedCount > 0 && (
            <span className="gap-search-btn gap-search-btn--done" style={{cursor:'default'}}>
              {scannedCount} scanned · {totalGapFindings} requirements found
            </span>
          )}
        </div>
        <div className="rp-panel-sub">
          {totalCount} authorities not currently in your reg library — scanned automatically with the main scan.
          {isScanning && <span style={{marginLeft:6,color:'#f59e0b'}}>Scanning…</span>}
        </div>
        <div className="gap-search-row">
          <input
            className="gap-search-input"
            type="text"
            placeholder="Filter by name or region (UK/EU, APAC, AMER, ME/AF, Global)…"
            value={gapSearch}
            onChange={e => setGapSearch(e.target.value)}
          />
          {gapSearch && (
            <button className="gap-search-clear" onClick={() => setGapSearch('')} title="Clear filter">✕</button>
          )}
        </div>
        {gapSearch && (
          <div className="gap-filter-count">Showing {visibleCount} of {totalCount} authorities</div>
        )}
      </div>

      <div className="gap-authority-list">
        {filteredGaps.length === 0 ? (
          <div className="table-empty">No authorities match your filter.</div>
        ) : (
          filteredGaps.map(auth => {
            const results    = gapByAuthority[auth.name];
            const hasResults = results && results.length > 0;

            return (
              <div key={auth.name} className={`gap-authority-card${hasResults ? ' gap-authority-card--expanded' : ''}`}>
                <div className="gap-authority-row">
                  <span className="gap-region-badge gap-region-badge--region">{auth.region}</span>
                  <span className="gap-authority-name">{auth.name}</span>
                  <span className="gap-unmonitored-badge">NOT MONITORED</span>
                  {hasResults && (
                    <span className="gap-search-btn gap-search-btn--done" style={{cursor:'default'}}>
                      {results.length} found
                    </span>
                  )}
                </div>
                {hasResults && (
                  <div className="gap-findings-section">
                    <GapFindingsTable rows={results} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
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

  const [gapSearch, setGapSearch] = useState('');

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
      const msg = `${results.length} requirements found · ${newCount} not yet in library.`;
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

  // ── Coverage Gaps helpers ─────────────────────────────────────────────────
  const gapFindings = findings.filter(r => r.monitored === false);

  // Group gap findings by authority name
  const gapByAuthority = gapFindings.reduce((acc, r) => {
    const key = r.authority || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  function getFilteredGaps() {
    const q = gapSearch.trim().toLowerCase();
    const scannedNames = new Set(Object.keys(gapByAuthority));
    // Merge: authorities with results + all additional authorities (for display)
    const all = ADDITIONAL_AUTHORITIES;
    if (!q) return all;
    return all.filter(a =>
      a.name.toLowerCase().includes(q) || a.region.toLowerCase().includes(q)
    );
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
        <h1 className="rp-title">Compliance Requirements Scanner</h1>
        <p className="rp-subtitle">AI-powered scan surfacing binding regulatory obligations with legal references and source links.</p>
        <div className="rp-header-actions">
          <button className="rp-hbtn" onClick={handleRun} disabled={isScanning}>
            {isScanning ? 'Scanning…' : 'Run Requirements Scan'}
          </button>
          <button className="rp-hbtn" onClick={() => setShowHistory(h => !h)}>
            History {history.length > 0 && `(${history.length})`}
          </button>
          <span className="rp-mode-badge rp-mode-badge--live">● Live</span>
        </div>
        </div>
      </header>

      {/* ── Scan Results ────────────────────────────────────────────────────── */}
      <BackgroundGradientGlow className="rp-body">

          {/* Action bar */}
          <div className="rp-action-bar">
            <div className="rp-action-row">
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
                  {progress.found} found
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
                2,070 documents — findings are deduplicated against this list.
              </div>
            </div>
          </div>

          {/* Findings */}
          <div className="rp-panel">
            <div className="rp-panel-head">
              <div className="rp-panel-title">Compliance Requirements Found</div>
              <div className="rp-panel-sub">
                {isScanning
                  ? `Scanning all authorities…`
                  : isDone
                    ? `${findings.length} requirements · ${newFindings.length} not yet in library`
                    : 'Run a scan to surface compliance requirements with legal citations.'}
              </div>
            </div>
            <DocTable
              rows={findings}
              emptyMsg={isScanning ? 'Analysing regulatory obligations…' : 'Run a scan to surface compliance requirements.'}
              showCoveredBadge
            />
          </div>

          {/* Coverage Gaps */}
          <CoverageGapsPanel
            gapSearch={gapSearch}
            setGapSearch={setGapSearch}
            gapByAuthority={gapByAuthority}
            filteredGaps={getFilteredGaps()}
            isScanning={isScanning}
          />

      </BackgroundGradientGlow>

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
