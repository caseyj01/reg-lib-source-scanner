/**
 * @fileoverview Content script injected into every page at document_idle.
 * Scans the visible page text for references to known financial regulations
 * and reports the count back to the background service worker.
 */

(function () {
  'use strict';

  /** Patterns for known regulatory frameworks (case-insensitive). */
  const REG_PATTERNS = [
    { key: 'CCA',         pattern: /\b(Consumer Credit Act|CCA\s*\d{4})\b/i },
    { key: 'PSD2',        pattern: /\b(PSD\s*2|payment services directive)\b/i },
    { key: 'GDPR',        pattern: /\bGDPR\b/i },
    { key: 'MiFID',       pattern: /\bMiFID\s*(I{1,2}|1|2)\b/i },
    { key: 'Basel',       pattern: /\bBasel\s*(III|IV|3|4)\b/i },
    { key: 'DORA',        pattern: /\bDORA\b/i },
    { key: 'AML',         pattern: /\b(AML|anti.?money laundering)\b/i },
    { key: 'CRR',         pattern: /\bCRR\b/i },
    { key: 'EMIR',        pattern: /\bEMIR\b/i },
    { key: 'FCA',         pattern: /\bFCA\s+(handbook|rules|guidance)\b/i },
    { key: 'Dodd-Frank',  pattern: /\bDodd.Frank\b/i },
    { key: 'SOX',         pattern: /\b(Sarbanes.Oxley|SOX)\b/i },
    { key: 'FATF',        pattern: /\bFATF\s+recommendations?\b/i },
    { key: 'ConsumerDuty',pattern: /\b(Consumer Duty|PS\s*22\s*[\/\-]?\s*9)\b/i },
  ];

  const pageText = document.body?.innerText || '';
  const matchedKeys = new Set();

  for (const { key, pattern } of REG_PATTERNS) {
    if (pattern.test(pageText)) {
      matchedKeys.add(key);
    }
  }

  const count = matchedKeys.size;

  if (count > 0) {
    try {
      chrome.runtime.sendMessage({
        type:  'PAGE_REG_REFS',
        count,
        keys:  [...matchedKeys],
        url:   location.href,
      });
    } catch {
      // Extension context may be invalidated — silently ignore
    }
  }
})();
