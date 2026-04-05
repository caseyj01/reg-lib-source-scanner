import React, { useState, useEffect, useRef } from 'react';
import { REGIONS, CATEGORIES } from '../lib/sources.js';
import { parseLibraryUpload, tagResults } from '../lib/dedup.js';
import { deepSearch } from '../lib/deepSearch.js';
import { exportToExcel } from '../lib/exporter.js';

// Region tab labels (excludes "Global" which is the default catch-all tab)
const REGION_TABS = ['Global', 'UK/EU', 'AMER', 'APAC', 'ME/AF'];

// Region badge colour map
const REGION_BADGE = {
  'UK/EU':  { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  'AMER':   { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  'APAC':   { bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' },
  'ME/AF':  { bg: '#fef9c3', color: '#854d0e', border: '#fef08a' },
  'Global': { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' },
};

function getBadgeStyle(region) {
  return REGION_BADGE[region] || REGION_BADGE['Global'];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);
  const [libraryFile,  setLibraryFile]  = useState('');
  const [region,       setRegion]       = useState('Global');
  const [category,     setCategory]     = useState('All');
  const [deepOn,       setDeepOn]       = useState(false);
  const [scanning,     setScanning]     = useState(false);
  const [scanMsg,      setScanMsg]      = useState('');
  const [totalIndexed, setTotalIndexed] = useState(0);
  const [lastSync,     setLastSync]     = useState('');
  const [exporting,    setExporting]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput,  setApiKeyInput]  = useState('');
  const [apiKeySaved,  setApiKeySaved]  = useState(false);

  const stopRef    = useRef(false);
  const fileRef    = useRef(null);
  const searchRef  = useRef(null);

  // ── On mount: restore persisted state ──────────────────────────────────────
  useEffect(() => {
    chrome.storage.local.get(
      ['lastSyncTime', 'totalIndexed', 'libraryItems', 'libraryFile', 'anthropicApiKey'],
      (data) => {
        if (data.lastSyncTime)    setLastSync(data.lastSyncTime);
        if (data.totalIndexed)    setTotalIndexed(data.totalIndexed);
        if (data.libraryItems)    setLibraryItems(data.libraryItems);
        if (data.libraryFile)     setLibraryFile(data.libraryFile);
        if (data.anthropicApiKey) setApiKeyInput(data.anthropicApiKey);
      }
    );
  }, []);

  // ── Library file upload ────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const items = parseLibraryUpload(ev.target.result, file.name);
      setLibraryItems(items);
      setLibraryFile(`${file.name} (${items.length} items)`);
      chrome.storage.local.set({
        libraryItems: items,
        libraryFile:  `${file.name} (${items.length} items)`,
      });
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  // ── API key save ───────────────────────────────────────────────────────────
  const handleSaveApiKey = () => {
    chrome.storage.local.set({ anthropicApiKey: apiKeyInput }, () => {
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    });
  };

  // ── Search handler ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!query.trim()) return;
    setScanning(true);
    stopRef.current = false;
    setScanMsg('Searching indexed regulations…');
    setResults([]);

    // 1. Get all regulations from service worker
    const allRegs = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_ALL_REGS' }, (res) => {
        resolve(Array.isArray(res) ? res : []);
      });
    });

    if (stopRef.current) { setScanning(false); return; }

    // 2. Filter by region, category, query text
    const q = query.toLowerCase();
    let filtered = allRegs.filter(r => {
      const titleMatch    = r.title?.toLowerCase().includes(q);
      const summaryMatch  = r.summary?.toLowerCase().includes(q);
      const sectorMatch   = r.sector?.toLowerCase().includes(q);
      const authorityMatch = r.authority?.toLowerCase().includes(q) || r.regulator?.toLowerCase().includes(q);
      return titleMatch || summaryMatch || sectorMatch || authorityMatch;
    });

    if (region !== 'Global') {
      filtered = filtered.filter(r => r.region === region);
    }
    if (category !== 'All') {
      filtered = filtered.filter(r =>
        r.sector === category || r.category === category
      );
    }

    // 3. Tag with dedup
    let tagged = tagResults(filtered, libraryItems);

    // 4. Deep search (if enabled)
    if (deepOn && !stopRef.current) {
      setScanMsg('Running deep web search via Anthropic API…');
      try {
        const knownTitles = libraryItems.map(i => i.title);
        const deepResults = await deepSearch({ query, knownTitles, region, category });

        if (!stopRef.current) {
          // Store in service worker DB
          chrome.runtime.sendMessage({ type: 'STORE_DEEP_RESULTS', regulations: deepResults });

          // Dedup against already-tagged results by sourceUrl
          const existingUrls = new Set(tagged.map(r => r.sourceUrl).filter(Boolean));
          const fresh = deepResults.filter(r => !existingUrls.has(r.sourceUrl));
          const taggedDeep = tagResults(
            fresh.map(r => ({ ...r, fromDeepSearch: true })),
            libraryItems
          );
          tagged = [...tagged, ...taggedDeep];
        }
      } catch (err) {
        setScanMsg(`Deep search error: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setResults(tagged);
    setScanning(false);
    setScanMsg('');
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      exportToExcel(results, query);
    } finally {
      setExporting(false);
    }
  };

  // ── Derived counts ─────────────────────────────────────────────────────────
  const newCount  = results.filter(r => r.dedup && !r.dedup.isDuplicate).length;
  const dupCount  = results.filter(r => r.dedup &&  r.dedup.isDuplicate).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── SETTINGS PANEL ──────────────────────────────────────────────── */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <span className="settings-title">Extension Settings</span>
            <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
          </div>
          <div className="settings-body">
            <label className="settings-label">Anthropic API Key</label>
            <input
              type="password"
              className="settings-input"
              placeholder="sk-ant-…"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
            />
            <button className="settings-save-btn" onClick={handleSaveApiKey}>
              {apiKeySaved ? '✓ Saved!' : 'Save Key'}
            </button>
            <p className="settings-hint">
              Required for deep search. Get your key at console.anthropic.com.
            </p>
          </div>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="header">
        <div className="header-left">
          <div className="logo">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#3B6D11" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="#3B6D11" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="#3B6D11" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="#97C459" />
            </svg>
          </div>
          <div className="header-text">
            <span className="header-title">Reg Library</span>
            <span className="header-sub">SOURCE FINDER</span>
          </div>
        </div>
        <span className="version-tag">v1.0</span>
      </div>

      {/* ── SEARCH BAR ──────────────────────────────────────────────────── */}
      <div className="search-wrap">
        <svg className="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="#9ca3af" strokeWidth="1.4" />
          <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          className="search-input"
          type="text"
          placeholder="Search regulations…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <span className="search-hint">↵</span>
      </div>

      {/* ── LIBRARY UPLOAD BAR ──────────────────────────────────────────── */}
      <label className="library-bar" htmlFor="lib-file-input">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v8M4 4l3-3 3 3" stroke="#3B6D11" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 10v1.5A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V10" stroke="#3B6D11" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="library-bar-text">
          {libraryFile || 'Upload your regulation library (.csv or .json)'}
        </span>
        <input
          id="lib-file-input"
          ref={fileRef}
          type="file"
          accept=".csv,.json"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </label>

      {/* ── DEEP SEARCH TOGGLE ──────────────────────────────────────────── */}
      <div className="toggle-bar">
        <svg className="toggle-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="#6b7280" strokeWidth="1.3" />
          <path d="M7 4v3l2 1.5" stroke="#6b7280" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="toggle-label">Deep web search</span>
        <span className="api-badge">Anthropic API</span>
        <button
          className={`toggle-switch ${deepOn ? 'on' : ''}`}
          onClick={() => setDeepOn(v => !v)}
          aria-label="Toggle deep search"
          role="switch"
          aria-checked={deepOn}
        >
          <span className="toggle-knob" />
        </button>
      </div>

      {/* ── CATEGORY FILTER CHIPS ───────────────────────────────────────── */}
      <div className="chips-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`chip ${category === cat ? 'chip-active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── REGION TABS ─────────────────────────────────────────────────── */}
      <div className="region-tabs">
        {REGION_TABS.map(r => (
          <button
            key={r}
            className={`region-tab ${region === r ? 'region-tab-active' : ''}`}
            onClick={() => setRegion(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* ── RESULTS LIST ────────────────────────────────────────────────── */}
      <div className="results-list">
        {results.length === 0 && !scanning && (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="14" cy="14" r="9" stroke="#d1d5db" strokeWidth="2" />
              <line x1="21" y1="21" x2="28" y2="28" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p>Enter a query and press Enter to search</p>
          </div>
        )}

        {results.map((reg, idx) => {
          const badge  = getBadgeStyle(reg.region);
          const isNew  = reg.dedup && !reg.dedup.isDuplicate;
          const isDup  = reg.dedup &&  reg.dedup.isDuplicate;
          return (
            <div
              key={reg.sourceUrl || idx}
              className="result-card"
              onClick={() => reg.sourceUrl && chrome.tabs.create({ url: reg.sourceUrl })}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && reg.sourceUrl && chrome.tabs.create({ url: reg.sourceUrl })}
            >
              <div className="result-top">
                <span
                  className="region-badge"
                  style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                >
                  {reg.region || 'Unknown'}
                </span>
                {reg.fromDeepSearch && <span className="deep-badge">Deep</span>}
                <span className={`dedup-tag ${isNew ? 'dedup-new' : 'dedup-dupe'}`}>
                  {isNew ? 'New source' : isDup ? 'Already in library' : ''}
                </span>
              </div>
              <div className="result-title">{reg.title}</div>
              {(reg.sector || reg.summary) && (
                <div className="result-body">{reg.sector || reg.summary?.slice(0, 80)}</div>
              )}
              <div className="result-foot">
                <span className="result-year">{reg.year || ''}</span>
                <div className="result-tags">
                  {reg.authority && <span className="tag tag-authority">{reg.authority}</span>}
                  {reg.type      && <span className="tag tag-type">{reg.type}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── DEEP SCAN PROGRESS ──────────────────────────────────────────── */}
      {scanning && (
        <div className="progress-bar">
          <span className="spinner" />
          <span className="progress-msg">{scanMsg || 'Scanning…'}</span>
          <button
            className="stop-btn"
            onClick={() => { stopRef.current = true; setScanning(false); setScanMsg(''); }}
          >
            Stop
          </button>
        </div>
      )}

      {/* ── EXPORT BAR ──────────────────────────────────────────────────── */}
      {newCount > 0 && !scanning && (
        <button className="export-bar" onClick={handleExport} disabled={exporting}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 9V1M4 6l3 3 3-3" stroke="#3B6D11" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 10v1.5A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V10" stroke="#3B6D11" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="export-label">
            {exporting ? 'Exporting…' : `Export ${newCount} new regulation${newCount !== 1 ? 's' : ''} to Excel`}
          </span>
          <span className="xlsx-badge">.xlsx</span>
        </button>
      )}

      {/* ── STATUS BAR ──────────────────────────────────────────────────── */}
      <div className="status-bar">
        <span className="status-dot" />
        <span className="status-text">
          {results.length > 0
            ? `${newCount} new · ${dupCount} already in library${lastSync ? ` · synced ${lastSync}` : ''}`
            : lastSync
              ? `Ready · last sync ${lastSync}`
              : 'Ready'}
        </span>
        <span className="indexed-count">
          {totalIndexed > 0 ? `${totalIndexed.toLocaleString()} indexed` : ''}
        </span>
        <button
          className="gear-btn"
          onClick={() => setShowSettings(v => !v)}
          aria-label="Settings"
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.4 2.4l1.06 1.06M10.54 10.54l1.06 1.06M2.4 11.6l1.06-1.06M10.54 3.46l1.06-1.06"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
