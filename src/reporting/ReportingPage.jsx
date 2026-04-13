import React, { useState, useRef, useEffect } from 'react';
import { deepSearch }        from '../lib/deepSearch.js';
import { ADDITIONAL_AUTHORITIES } from '../lib/additionalAuthorities.js';
import { getBanding, BANDING_STYLE, BANDING_ORDER, JURISDICTION_BANDINGS } from '../lib/jurisdictions.js';
import { toTemplateRows, downloadTemplateCSV, downloadTemplateXLSX } from '../lib/exportToTemplate.js';
import { useNotifications }  from './components/BackgroundTaskManager.jsx';
import { FloatingPaths }          from './components/FloatingPaths.jsx';
import { BackgroundGradientGlow } from '../components/ui/background-gradient-glow.jsx';
import seedUrls               from './data/seedData.json';
import webFindings            from './data/webFindings.json';
import scanTargetsSheet       from './data/scanTargets.sheet.json';

// URLs already in the reg library — dedup against these
const SEED_URLS = new Set(seedUrls.map(u => u.replace('http://', 'https://')));

const BANKING_VERTICALS = ['Banking', 'Financial Services'];

// Scan targets are sourced from the uploaded sheet and bundled at build time.
// This replaces the previous hardcoded SOURCES + ADDITIONAL_AUTHORITIES list.
const SCAN_TARGETS = (scanTargetsSheet?.targets || []).map(t => ({
  key:       `${t.kind || 'target'}-${t.name}`,
  regulator: t.name,
  region:    t.region || 'Global',
  category:  t.category || 'All',
  monitored: true,
  mappedUrl: t.mappedUrl || '',
  banding:   JURISDICTION_BANDINGS?.[t.region] || '',
})).sort((a, b) => {
  const ba = BANDING_ORDER[a.banding ?? getBanding(a.region)] ?? 3;
  const bb = BANDING_ORDER[b.banding ?? getBanding(b.region)] ?? 3;
  return ba - bb;
});

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

// Skip index/contents page URLs — we only want actual regulation documents
const CONTENTS_URL_RE = /\/contents(?:[/?#]|$)/i;

function isContentsUrl(url) {
  return CONTENTS_URL_RE.test(url || '');
}

// Extract a 4-digit year from a document name as a fallback published date
function yearFromName(name) {
  const m = (name || '').match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : '';
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
    publishedDate: doc.publishedDate || yearFromName(doc.requirement || doc.commonName || ''),
    banding:      getBanding(doc.jurisdiction || doc.region || ''),
    alreadyCovered: SEED_URLS.has(normUrl1),
    monitored,
  };
}

// ── Local fallback: maps bundled webFindings into finding rows ────────────────
function localFallback() {
  return webFindings.filter(doc => !isContentsUrl(doc.url)).map((doc, idx) => {
    const normUrl = (doc.url || '').replace('http://', 'https://');
    return {
      id:             `local-${idx}`,
      reqReport:      'Y',
      requirement:    doc.commonName    || '',
      description:    doc.documentType  || '',
      analystGuide:   '',
      reference:      doc.commonName    || '',
      sourceUrl1:     doc.url           || '',
      sourceUrl1Type: doc.documentType  || 'Source',
      sourceUrl2:     '',
      sourceUrl2Type: '',
      authority:      doc.authority     || '',
      jurisdiction:   doc.jurisdiction  || doc.region || '',
      publishedDate:  doc.publishedDate || yearFromName(doc.commonName || ''),
      banding:        getBanding(doc.jurisdiction || doc.region || ''),
      alreadyCovered: SEED_URLS.has(normUrl),
      monitored:      true,
    };
  });
}

// ── Live web scan via proxy → Gemini (falls back to local data if proxy down) ──
const CONCURRENCY = 3;
const REQUEST_DELAY_MS = 1500; // stay well under 30 RPM limit

// Rough per-authority estimate (Gemini call(s) + throttling). This is used only
// for displaying an ETA before we have enough observed progress to compute a
// real rate.
const EST_SECONDS_PER_AUTHORITY = 12;

async function runWebScan(onProgress, stopRef) {
  const found    = [];
  const seenRefs = new Set();
  const total    = SCAN_TARGETS.length;
  let   liveMode = true;
  let   done     = 0;
  let   fallbackLoaded = false;

  function addDoc(doc, monitored) {
    const url = doc.sourceUrl1 || doc.sourceUrl || doc.url || '';
    if (isContentsUrl(url)) return;
    const key = (doc.reference || url).trim().toLowerCase();
    if (!key) return;
    if (seenRefs.has(key)) return;
    seenRefs.add(key);
    found.push(toFinding(doc, found.length, monitored));
  }

  function loadFallbackNow() {
    if (fallbackLoaded) return;
    fallbackLoaded = true;
    liveMode = false;
    localFallback().forEach(f => {
      const key = (f.reference || f.sourceUrl1 || '').trim().toLowerCase();
      if (!key || seenRefs.has(key)) return;
      seenRefs.add(key);
      found.push(f);
    });
  }

  async function processTarget(target) {
    if (stopRef.current) return;
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    try {
      const results = await deepSearch({
        query:    target.regulator,
        region:   target.region,
        category: target.category,
        targetUrls: target.mappedUrl ? [target.mappedUrl] : [],
      });
      results.forEach(doc => addDoc(doc, target.monitored));
    } catch (err) {
      // Load fallback immediately on first proxy failure so table populates now
      loadFallbackNow();
      console.warn(`Proxy unavailable for ${target.regulator}:`, err.message);
    }
    done++;
    onProgress({ done, total, source: target.regulator, found: found.length, liveMode, snapshot: [...found] });
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
            <th>Category</th>
            <th>Description</th>
            <th>Reference</th>
            <th>Jurisdiction</th>
            <th>Links</th>
            <th>Banking Band</th>
            {showCoveredBadge && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              className={`${i % 2 === 0 ? 'row-even' : 'row-odd'}${row.alreadyCovered ? ' row-covered' : ''}`}
            >
              <td className="td-name" title={row.requirement}>{row.requirement}</td>
              <td className="td-desc" title={row.description}>{row.description}</td>
              <td className="td-ref" title={row.reference}>{row.reference}</td>
              <td className="td-jurisdiction">{row.jurisdiction || '—'}</td>
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
              <td>
                {(() => {
                  const s = BANDING_STYLE[row.banding] || BANDING_STYLE[''];
                  return row.banding
                    ? <span className="banding-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                    : <span className="banding-badge banding-badge--unrated">—</span>;
                })()}
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

// ── History entry ─────────────────────────────────────────────────────────────
function HistoryEntry({ entry, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const newFindings = entry.findings.filter(r => !r.alreadyCovered);

  return (
    <div className="rp-history-entry">
      <button className="rp-history-row" onClick={() => setOpen(o => !o)}>
        <span className="rp-history-date">
          {new Date(entry.scannedAt).toLocaleDateString()}
        </span>
        <span className="rp-history-meta">
          {entry.newCount} new · {entry.total - entry.newCount} covered
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
            <th>Requirement</th>
            <th>Description</th>
            <th>Reference</th>
            <th>Jurisdiction</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
              <td className="td-name" title={row.requirement}>{row.requirement}</td>
              <td className="td-desc" title={row.description}>{row.description}</td>
              <td className="td-ref" title={row.reference}>{row.reference}</td>
              <td className="td-jurisdiction">{row.jurisdiction || '—'}</td>
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

  const [phase,     setPhase]     = useState('idle');
  const [progress,  setProgress]  = useState({ done: 0, total: SCAN_TARGETS.length, source: '', found: 0 });
  const [findings,  setFindings]  = useState([]);
  const [notify,      setNotify]      = useState(true);
  const [toast,       setToast]       = useState(null);
  const [liveMode,    setLiveMode]    = useState(true);
  const [scannedAt,   setScannedAt]   = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history,     setHistory]     = useState(() => loadHistory());

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [showApiKey,  setShowApiKey]  = useState(false);

  const [scanStartTime,  setScanStartTime]  = useState(null);
  const [bandingFilter,  setBandingFilter]  = useState('All');
  const [exporting,      setExporting]      = useState(false);

  const stopRef = useRef(false);
  const { notify: pushNotify } = useNotifications();

  // Load saved Gemini API key (shared with popup)
  useEffect(() => {
    try {
      const storage = globalThis?.chrome?.storage?.local;
      if (!storage?.get) return;
      storage.get(['geminiApiKey'], (data) => {
        if (data?.geminiApiKey) setApiKeyInput(String(data.geminiApiKey));
      });
    } catch {
      // ignore
    }
  }, []);

  function handleSaveApiKey() {
    try {
      const storage = globalThis?.chrome?.storage?.local;
      if (!storage?.set) {
        showToast('Could not save key (storage unavailable).', 'warn');
        return;
      }
      storage.set({ geminiApiKey: apiKeyInput }, () => {
        setApiKeySaved(true);
        setTimeout(() => setApiKeySaved(false), 2000);
        showToast('Gemini API key saved.', 'success');
      });
    } catch {
      showToast('Could not save key.', 'warn');
    }
  }

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
      setScanStartTime(Date.now());
      setProgress({ done: 0, total: SCAN_TARGETS.length, source: '', found: 0 });

      const { found: results, liveMode: live } = await runWebScan(p => {
        setProgress({ ...p });
        if (p.snapshot) setFindings(p.snapshot);
      }, stopRef);

      setFindings(results);
      setLiveMode(live);
      setPhase('done');
      const now = new Date().toISOString();
      setScannedAt(now);
      if (live) saveCache(results, live);
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

  async function handleExportTemplate() {
    if (exporting || findings.length === 0) return;
    setExporting(true);
    try {
      const rows = toTemplateRows(findings);
      const date = new Date().toISOString().slice(0, 10);
      await downloadTemplateXLSX(rows, `reg-requirements-${date}.xlsx`);
      showToast('Template exported.', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'warn');
    } finally {
      setExporting(false);
    }
  }

  function handleClearCache() {
    clearCache();
    setFindings([]);
    setPhase('idle');
    setScannedAt(null);
    showToast('Scan cache cleared.', 'success');
  }

  // ── ETA calculation ───────────────────────────────────────────────────────
  function getETA() {
    if (!scanStartTime) return null;

    // If we're still at 0, show a conservative estimate instead of nothing.
    if (progress.done === 0) {
      const totalSecs = Math.ceil((progress.total * EST_SECONDS_PER_AUTHORITY) / CONCURRENCY);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    const elapsed   = (Date.now() - scanStartTime) / 1000;
    const rate      = progress.done / elapsed;
    const remaining = Math.ceil((progress.total - progress.done) / rate);
    if (!isFinite(remaining) || remaining <= 0) return null;
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  const isScanning  = phase === 'scanning';
  const isDone      = phase === 'done';
  const pct         = Math.round((progress.done / progress.total) * 100);
  const newFindings = findings.filter(r => !r.alreadyCovered);

  const filteredFindings = bandingFilter === 'All'
    ? findings
    : bandingFilter === 'Unrated'
      ? findings.filter(r => !r.banding)
      : findings.filter(r => r.banding === bandingFilter);

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
        <p className="rp-subtitle">AI-powered scan, surfacing regulatory documents.</p>
        <div className="rp-header-actions">
          <button className="rp-hbtn" onClick={handleRun} disabled={isScanning}>
            {isScanning ? 'Scanning…' : 'Run Scan'}
          </button>
          <button className="rp-hbtn" onClick={() => setShowApiKey(v => !v)}>
            API Key
          </button>
          <button className="rp-hbtn" onClick={() => setShowHistory(h => !h)}>
            History {history.length > 0 && `(${history.length})`}
          </button>
          <span className="rp-mode-badge rp-mode-badge--live">● Live</span>
        </div>

        {showApiKey && (
          <div className="rp-api-key-wrap">
            <input
              className="rp-api-key-input"
              type="password"
              placeholder="Gemini API key (AIza...)"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
            />
            <button className="rp-api-key-save" onClick={handleSaveApiKey}>
              {apiKeySaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        )}
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
                  {progress.done} / {progress.total} authorities
                  {getETA() && <span className="rp-eta"> · ~{getETA()} remaining</span>}
                  &nbsp;· {progress.found} found
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
              <div className="rp-panel-title">Banking Requirements Found</div>
              <div className="rp-panel-sub">
                {isScanning
                  ? `${findings.length} found so far — scanning all authorities…`
                  : isDone
                    ? `${findings.length} requirements · ${newFindings.length} not yet in library`
                    : 'Run a scan to surface compliance requirements with legal citations.'}
              </div>
              {(findings.length > 0) && (
                <div className="banding-filter-row">
                  <span className="banding-filter-label">Banking Band:</span>
                  {['All', '1. High', '2. Medium', '3. Low', 'Unrated'].map(b => {
                    const style = b === 'All' ? null : b === 'Unrated' ? BANDING_STYLE[''] : BANDING_STYLE[b];
                    const label = b === 'All' ? 'All' : b === 'Unrated' ? 'Unrated' : BANDING_STYLE[b].label;
                    return (
                      <button
                        key={b}
                        className={`banding-chip ${bandingFilter === b ? 'banding-chip--active' : ''}`}
                        style={bandingFilter === b && style ? { background: style.bg, color: style.color, borderColor: style.color } : {}}
                        onClick={() => setBandingFilter(b)}
                      >
                        {label}
                        <span className="banding-chip-count">
                          {b === 'All' ? findings.length
                            : b === 'Unrated' ? findings.filter(r => !r.banding).length
                            : findings.filter(r => r.banding === b).length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {findings.length > 0 && !isScanning && (
              <div style={{ display: 'flex', gap: '8px', padding: '8px 16px 0' }}>
                <button
                  className="rp-btn rp-btn--green"
                  onClick={handleExportTemplate}
                  disabled={exporting}
                  title="Export findings to FS Requirements template CSV with AI classification and accuracy scoring"
                >
                  {exporting ? 'Exporting…' : 'Export to Template'}
                </button>
              </div>
            )}
            <DocTable
              rows={filteredFindings}
              emptyMsg={isScanning ? 'Analysing regulatory obligations…' : 'Run a scan to surface compliance requirements.'}
              showCoveredBadge
            />
          </div>


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
