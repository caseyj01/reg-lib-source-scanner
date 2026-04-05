/**
 * @fileoverview Chrome MV3 background service worker.
 * Manages the IndexedDB regulations cache, schedules periodic scrapes,
 * and handles messages from the popup.
 */

import { SOURCES } from '../lib/sources.js';

const DB_NAME      = 'RegLibraryDB';
const DB_VERSION   = 1;
const STORE_REGS   = 'regulations';
const STORE_SYNC   = 'sync_log';
const ALARM_NAME   = 'regSyncAlarm';
const ALARM_PERIOD = 360; // minutes (6 hours)

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

/**
 * Open (or upgrade) the RegLibraryDB database.
 * Creates object stores on first run or version change.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_REGS)) {
        const regStore = db.createObjectStore(STORE_REGS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        regStore.createIndex('region',    'region',    { unique: false });
        regStore.createIndex('sector',    'sector',    { unique: false });
        regStore.createIndex('sourceId',  'sourceId',  { unique: false });
        regStore.createIndex('title',     'title',     { unique: false });
        regStore.createIndex('sourceUrl', 'sourceUrl', { unique: true  });
      }

      if (!db.objectStoreNames.contains(STORE_SYNC)) {
        db.createObjectStore(STORE_SYNC, { keyPath: 'sourceId' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Write (add or overwrite) a single record to an object store.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @param {Object}      record
 * @returns {Promise<void>}
 */
export function dbPut(db, storeName, record) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Retrieve all records from an object store.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @returns {Promise<Object[]>}
 */
export function dbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Count records in an object store.
 *
 * @param {IDBDatabase} db
 * @param {string}      storeName
 * @returns {Promise<number>}
 */
export function dbCount(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Check whether a sourceUrl already exists in the regulations store.
 *
 * @param {IDBDatabase} db
 * @param {string}      sourceUrl
 * @returns {Promise<boolean>}
 */
function dbUrlExists(db, sourceUrl) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_REGS, 'readonly');
    const index = tx.objectStore(STORE_REGS).index('sourceUrl');
    const req   = index.get(sourceUrl);
    req.onsuccess = (e) => resolve(!!e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Regex to filter relevant regulation titles ────────────────────────────────
const REG_TITLE_FILTER =
  /regulat|directive|act|notice|standard|guidance|rule|circular|policy|prudential|basel|aml|credit|payment|deposit|conduct/i;

// Match all anchor tags: captures href and inner text content
const ANCHOR_RE = /<a\b[^>]*\bhref=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const TAG_RE    = /<[^>]+>/g;

/**
 * Minimal regex-based anchor extractor for service-worker context
 * (DOMParser is unavailable in workers).
 * Returns array of { href, text } objects from the raw HTML string.
 *
 * @param {string} html
 * @returns {{ href: string, text: string }[]}
 */
function extractAnchors(html) {
  const results = [];
  let m;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const href = m[1].trim();
    const text = m[2].replace(TAG_RE, '').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (text) results.push({ href, text });
  }
  return results;
}

// ── Scraper ───────────────────────────────────────────────────────────────────

/**
 * Fetch a regulatory source page and extract regulation items from it.
 * Uses regex-based anchor extraction (DOMParser is not available in workers).
 * Filters items by title relevance pattern.
 *
 * @param {import('../lib/sources.js').RegulatorySource} source
 * @returns {Promise<Object[]>} Array of regulation objects (without DB id).
 */
export async function scrapeSource(source) {
  let html;
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'RegLibrarySourceScanner/1.0' },
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  const anchors     = extractAnchors(html);
  const regulations = [];

  for (const { href, text: rawTitle } of anchors) {
    if (!rawTitle || !REG_TITLE_FILTER.test(rawTitle)) continue;

    // Resolve relative URLs
    let sourceUrl = href;
    if (href && !href.startsWith('http')) {
      try {
        sourceUrl = new URL(href, source.url).href;
      } catch {
        sourceUrl = source.url;
      }
    }
    if (!sourceUrl) sourceUrl = source.url;

    regulations.push({
      title:     rawTitle,
      sourceUrl,
      sourceId:  source.id,
      region:    source.region,
      regulator: source.regulator,
      authority: source.regulator,
      sector:    source.category,
      category:  source.category,
      type:      'Regulation',
      year:      '',
      summary:   '',
    });
  }

  return regulations;
}

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Iterate all SOURCES, scrape each one, skip URLs already in the DB,
 * write new regulations, update sync_log, and persist stats to chrome.storage.
 *
 * @returns {Promise<void>}
 */
export async function runScrapeAll() {
  let db;
  try {
    db = await openDB();
  } catch (err) {
    console.error('[RegLib] Failed to open DB:', err);
    return;
  }

  let totalNew = 0;

  for (const source of SOURCES) {
    try {
      const items = await scrapeSource(source);

      for (const item of items) {
        const exists = await dbUrlExists(db, item.sourceUrl);
        if (!exists) {
          await dbPut(db, STORE_REGS, item);
          totalNew++;
        }
      }

      await dbPut(db, STORE_SYNC, {
        sourceId:    source.id,
        lastScraped: new Date().toISOString(),
        itemCount:   items.length,
      });
    } catch (err) {
      console.warn(`[RegLib] Scrape failed for ${source.id}:`, err);
    }
  }

  const totalIndexed = await dbCount(db, STORE_REGS);
  const lastSyncTime = new Date().toLocaleString();

  await chrome.storage.local.set({ lastSyncTime, totalIndexed });
  console.log(`[RegLib] Sync complete. ${totalNew} new items. Total indexed: ${totalIndexed}`);
}

// ── Alarm ─────────────────────────────────────────────────────────────────────

chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runScrapeAll();
  }
});

// ── Install / startup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  runScrapeAll();
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type } = message;

  if (type === 'GET_ALL_REGS') {
    openDB()
      .then(db => dbGetAll(db, STORE_REGS))
      .then(regs => sendResponse(regs))
      .catch(() => sendResponse([]));
    return true; // keep channel open for async response
  }

  if (type === 'GET_COUNT') {
    openDB()
      .then(db => dbCount(db, STORE_REGS))
      .then(count => sendResponse({ count }))
      .catch(() => sendResponse({ count: 0 }));
    return true;
  }

  if (type === 'FORCE_SYNC') {
    runScrapeAll().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === 'STORE_DEEP_RESULTS') {
    const regulations = message.regulations || [];
    openDB()
      .then(async (db) => {
        let stored = 0;
        for (const reg of regulations) {
          if (!reg.sourceUrl) continue;
          const exists = await dbUrlExists(db, reg.sourceUrl);
          if (!exists) {
            await dbPut(db, STORE_REGS, reg);
            stored++;
          }
        }
        const totalIndexed = await dbCount(db, STORE_REGS);
        await chrome.storage.local.set({ totalIndexed });
        sendResponse({ stored, totalIndexed });
      })
      .catch(() => sendResponse({ stored: 0 }));
    return true;
  }
});
