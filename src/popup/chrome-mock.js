/**
 * Stub chrome.* APIs for local dev (npm run dev).
 * Uses localStorage so state persists across page reloads.
 * Never included in the production build.
 */

const store = {
  get(keys, cb) {
    const result = {};
    const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    keyList.forEach(k => {
      const raw = localStorage.getItem(`chrome_storage_${k}`);
      if (raw !== null) {
        try { result[k] = JSON.parse(raw); } catch { result[k] = raw; }
      }
    });
    cb(result);
  },
  set(obj, cb) {
    Object.entries(obj).forEach(([k, v]) => {
      localStorage.setItem(`chrome_storage_${k}`, JSON.stringify(v));
    });
    cb && cb();
  },
};

// Sample regulations for testing the results list
const MOCK_REGS = [
  {
    id: 1, title: 'Capital Requirements Regulation (CRR II)', type: 'Regulation',
    authority: 'EBA', regulator: 'EBA', jurisdiction: 'EU', region: 'UK/EU',
    sector: 'Banking', category: 'Banking', year: '2019', summary: 'Amends CRR to implement Basel III reforms.',
    sourceUrl: 'https://eur-lex.europa.eu/crr2', binding: true,
  },
  {
    id: 2, title: 'Payment Services Directive 2 (PSD2)', type: 'Directive',
    authority: 'ECB', regulator: 'ECB', jurisdiction: 'EU', region: 'UK/EU',
    sector: 'Payments', category: 'Payments', year: '2018', summary: 'Revised payment services framework.',
    sourceUrl: 'https://eur-lex.europa.eu/psd2', binding: true,
  },
  {
    id: 3, title: 'Consumer Duty PS22/9', type: 'Policy Statement',
    authority: 'FCA', regulator: 'FCA', jurisdiction: 'UK', region: 'UK/EU',
    sector: 'Consumer Credit', category: 'Consumer Credit', year: '2022', summary: 'FCA consumer duty rules.',
    sourceUrl: 'https://www.fca.org.uk/ps22-9', binding: true,
  },
  {
    id: 4, title: 'Basel III: Finalising Post-Crisis Reforms', type: 'Standard',
    authority: 'BIS / BCBS', regulator: 'BIS', jurisdiction: 'Global', region: 'Global',
    sector: 'Prudential', category: 'Prudential', year: '2017', summary: 'Final Basel III framework.',
    sourceUrl: 'https://www.bis.org/bcbs/publ/d424.htm', binding: true,
  },
  {
    id: 5, title: 'Dodd-Frank Wall Street Reform Act', type: 'Act',
    authority: 'Federal Reserve', regulator: 'Federal Reserve', jurisdiction: 'US', region: 'AMER',
    sector: 'Banking', category: 'Banking', year: '2010', summary: 'Comprehensive US financial reform.',
    sourceUrl: 'https://www.fdic.gov/regulations/laws/rules/6000-1.html', binding: true,
  },
  {
    id: 6, title: 'MAS Notice 626 – Prevention of Money Laundering', type: 'Notice',
    authority: 'MAS', regulator: 'MAS', jurisdiction: 'Singapore', region: 'APAC',
    sector: 'AML / CFT', category: 'AML / CFT', year: '2021', summary: 'AML/CFT requirements for financial institutions.',
    sourceUrl: 'https://www.mas.gov.sg/regulation/notices/notice-626', binding: true,
  },
  {
    id: 7, title: 'SAMA Governance and Risk Management Framework', type: 'Circular',
    authority: 'SAMA', regulator: 'SAMA', jurisdiction: 'Saudi Arabia', region: 'ME/AF',
    sector: 'Banking', category: 'Banking', year: '2020', summary: 'Governance framework for Saudi banks.',
    sourceUrl: 'https://www.sama.gov.sa/governance', binding: true,
  },
];

window.chrome = {
  storage: { local: store },
  runtime: {
    sendMessage(msg, cb) {
      if (!cb) return;
      if (msg.type === 'GET_ALL_REGS') return cb(MOCK_REGS);
      if (msg.type === 'GET_COUNT')    return cb({ count: MOCK_REGS.length });
      if (msg.type === 'FORCE_SYNC')   return cb({ ok: true });
      if (msg.type === 'STORE_DEEP_RESULTS') return cb({ stored: msg.regulations?.length || 0 });
      cb({});
    },
    onMessage: { addListener() {} },
  },
  tabs: {
    create({ url }) { window.open(url, '_blank'); },
  },
  alarms: {
    create() {},
    onAlarm: { addListener() {} },
  },
};

// Pre-populate some mock storage values for a richer dev experience
if (!localStorage.getItem('chrome_storage_totalIndexed')) {
  store.set({ totalIndexed: 1247, lastSyncTime: new Date().toLocaleString() });
}
