/**
 * @fileoverview Registry of all regulatory source URLs.
 * Each source is scraped by the background service worker on a schedule.
 */

/** @type {string[]} */
export const REGIONS = ['Global', 'UK/EU', 'AMER', 'APAC', 'ME/AF'];

/** @type {string[]} */
export const CATEGORIES = [
  'All',
  'Banking',
  'Consumer Credit',
  'AML / CFT',
  'Payments',
  'Prudential',
  'Securities',
  'Insurance',
  'Data Protection',
  'Derivatives',
  'Anti-Bribery',
  'ESG / Disclosure',
];

/**
 * @typedef {Object} RegulatorySource
 * @property {string} id
 * @property {string} region
 * @property {string} regulator
 * @property {string} label
 * @property {string} url
 * @property {string} category
 * @property {string} selector
 */

/** @type {RegulatorySource[]} */
export const SOURCES = [

  // ══════════════════════════════════════════════════════════════════════════
  // GLOBAL
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'fatf-recommendations',
    region: 'Global', regulator: 'FATF',
    label: 'FATF Recommendations & Guidance',
    url: 'https://www.fatf-gafi.org/en/publications/Fatfrecommendations.html',
    category: 'AML / CFT',
    selector: '.publication-list li, .fatf-publication, table tbody tr',
  },
  {
    id: 'fatf-mutual-evaluations',
    region: 'Global', regulator: 'FATF',
    label: 'FATF Mutual Evaluation Reports',
    url: 'https://www.fatf-gafi.org/en/publications/Mutualevaluations.html',
    category: 'AML / CFT',
    selector: '.publication-list li, article.publication',
  },
  {
    id: 'bis-basel-framework',
    region: 'Global', regulator: 'BCBS / BIS',
    label: 'BIS Basel Framework Publications',
    url: 'https://www.bis.org/bcbs/publ/index.htm',
    category: 'Prudential',
    selector: 'table.tablesorter tbody tr, .elist li',
  },
  {
    id: 'bis-working-papers',
    region: 'Global', regulator: 'BCBS / BIS',
    label: 'BIS Working Papers & Reports',
    url: 'https://www.bis.org/publ/work.htm',
    category: 'Banking',
    selector: 'table.tablesorter tbody tr, .elist li',
  },
  {
    id: 'iosco-standards',
    region: 'Global', regulator: 'IOSCO',
    label: 'IOSCO Standards & Principles',
    url: 'https://www.iosco.org/library/pubdocs/',
    category: 'Securities',
    selector: 'table tbody tr, .publication-entry, .document-list li',
  },
  {
    id: 'iais-standards',
    region: 'Global', regulator: 'IAIS',
    label: 'IAIS Insurance Core Principles & Standards',
    url: 'https://www.iaisweb.org/publications/',
    category: 'Insurance',
    selector: '.publications-list li, article.publication, .document-item',
  },
  {
    id: 'iais-consultations',
    region: 'Global', regulator: 'IAIS',
    label: 'IAIS Consultation Documents',
    url: 'https://www.iaisweb.org/consultations/',
    category: 'Insurance',
    selector: '.consultation-list li, article, .doc-item',
  },
  {
    id: 'fsb-policy-documents',
    region: 'Global', regulator: 'FSB',
    label: 'FSB Policy Documents & Reports',
    url: 'https://www.fsb.org/publications/',
    category: 'Banking',
    selector: '.list-publication li, article.publication',
  },
  {
    id: 'oecd-financial-markets',
    region: 'Global', regulator: 'OECD',
    label: 'OECD Anti-Bribery & Corporate Governance',
    url: 'https://www.oecd.org/en/topics/policy-issues/anti-corruption-and-integrity.html',
    category: 'Anti-Bribery',
    selector: '.document-list li, article.result, .oecd-publication',
  },
  {
    id: 'oecd-beps',
    region: 'Global', regulator: 'OECD',
    label: 'OECD BEPS Framework',
    url: 'https://www.oecd.org/en/topics/policy-issues/base-erosion-and-profit-shifting.html',
    category: 'Anti-Bribery',
    selector: '.document-list li, article.result',
  },
  {
    id: 'imf-publications',
    region: 'Global', regulator: 'IMF',
    label: 'IMF Financial Stability Publications',
    url: 'https://www.imf.org/en/Publications/GFSR',
    category: 'Prudential',
    selector: '.publication-list li, .search-result, article.result',
  },
  {
    id: 'worldbank-financial',
    region: 'Global', regulator: 'World Bank',
    label: 'World Bank Financial Sector Guidance',
    url: 'https://www.worldbank.org/en/topic/financialsector/publication',
    category: 'Banking',
    selector: '.item-list li, .publication-item, article.result',
  },
  {
    id: 'ifrs-standards',
    region: 'Global', regulator: 'IFRS Foundation',
    label: 'IFRS Accounting Standards',
    url: 'https://www.ifrs.org/issued-standards/list-of-standards/',
    category: 'ESG / Disclosure',
    selector: '.standard-item, table tbody tr, .standards-list li',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UNITED KINGDOM
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'fca-policy-statements',
    region: 'UK/EU', regulator: 'FCA',
    label: 'FCA Policy Statements',
    url: 'https://www.fca.org.uk/publications/policy-statements',
    category: 'Banking',
    selector: '.search-results__list .search-results__item, ul.publications-list li',
  },
  {
    id: 'fca-consultation-papers',
    region: 'UK/EU', regulator: 'FCA',
    label: 'FCA Consultation Papers',
    url: 'https://www.fca.org.uk/publications/consultation-papers',
    category: 'Banking',
    selector: '.search-results__list .search-results__item, ul.publications-list li',
  },
  {
    id: 'fca-final-notices',
    region: 'UK/EU', regulator: 'FCA',
    label: 'FCA Final Notices & Enforcement',
    url: 'https://www.fca.org.uk/publications/final-notices',
    category: 'Banking',
    selector: '.search-results__list .search-results__item, .publications-list li',
  },
  {
    id: 'pra-supervisory-statements',
    region: 'UK/EU', regulator: 'PRA',
    label: 'PRA Supervisory Statements',
    url: 'https://www.bankofengland.co.uk/prudential-regulation/publication/supervisory-statements',
    category: 'Prudential',
    selector: '.search-result, .publication-list__item, article.results__item',
  },
  {
    id: 'pra-policy-statements',
    region: 'UK/EU', regulator: 'PRA',
    label: 'PRA Policy Statements',
    url: 'https://www.bankofengland.co.uk/prudential-regulation/publication/policy-statements',
    category: 'Prudential',
    selector: '.search-result, .publication-list__item',
  },
  {
    id: 'hmt-secondary-legislation',
    region: 'UK/EU', regulator: 'HM Treasury',
    label: 'HM Treasury Secondary Legislation',
    url: 'https://www.legislation.gov.uk/uksi?results-count=20&sort=issued&title=financial',
    category: 'Banking',
    selector: 'table.results tbody tr, .legislationResults li',
    hrefFilter: /\/uksi\/\d{4}\/\d+/,
  },
  {
    id: 'ico-guidance',
    region: 'UK/EU', regulator: 'ICO',
    label: 'ICO Data Protection Guidance & Decisions',
    url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/',
    category: 'Data Protection',
    selector: '.topic-card, article, .guidance-list li',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UNITED STATES
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'sec-final-rules',
    region: 'AMER', regulator: 'SEC',
    label: 'SEC Final Rules',
    url: 'https://www.sec.gov/rules/final.shtml',
    category: 'Securities',
    selector: 'table tbody tr, .rule-item, .content-list li',
  },
  {
    id: 'sec-proposed-rules',
    region: 'AMER', regulator: 'SEC',
    label: 'SEC Proposed Rules',
    url: 'https://www.sec.gov/rules/proposed.shtml',
    category: 'Securities',
    selector: 'table tbody tr, .rule-item',
  },
  {
    id: 'cftc-final-rules',
    region: 'AMER', regulator: 'CFTC',
    label: 'CFTC Final Rules',
    url: 'https://www.cftc.gov/LawRegulation/FederalRegister/finalrules/index.htm',
    category: 'Derivatives',
    selector: 'table tbody tr, .rule-list li, .content-area li',
  },
  {
    id: 'finra-rules',
    region: 'AMER', regulator: 'FINRA',
    label: 'FINRA Rulebook & Regulatory Notices',
    url: 'https://www.finra.org/rules-guidance/rulebooks/finra-rules',
    category: 'Securities',
    selector: '.rule-section li, table tbody tr, .accordion-content li',
  },
  {
    id: 'finra-notices',
    region: 'AMER', regulator: 'FINRA',
    label: 'FINRA Regulatory Notices',
    url: 'https://www.finra.org/rules-guidance/notices',
    category: 'Securities',
    selector: '.notice-list li, article.notice, table tbody tr',
  },
  {
    id: 'fed-regulations',
    region: 'AMER', regulator: 'Federal Reserve',
    label: 'Federal Reserve Regulations',
    url: 'https://www.federalreserve.gov/apps/foia/regulationsearch.aspx',
    category: 'Banking',
    selector: 'table tbody tr, .regulation-row',
  },
  {
    id: 'fed-supervision',
    region: 'AMER', regulator: 'Federal Reserve',
    label: 'Federal Reserve Supervision Guidance',
    url: 'https://www.federalreserve.gov/supervisionreg/srletters/srletters.htm',
    category: 'Banking',
    selector: 'table tbody tr, .sr-letter-list li',
  },
  {
    id: 'occ-regulations',
    region: 'AMER', regulator: 'OCC',
    label: 'OCC Regulations & Interpretations',
    url: 'https://www.occ.gov/topics/regulations-and-interpretations/regulations/index-regulations.html',
    category: 'Banking',
    selector: 'table tbody tr, .regulation-listing li',
  },
  {
    id: 'cfpb-final-rules',
    region: 'AMER', regulator: 'CFPB',
    label: 'CFPB Final Rules',
    url: 'https://www.consumerfinance.gov/rules-policy/final-rules/',
    category: 'Consumer Credit',
    selector: '.o-post-preview, article.rule-entry',
  },
  {
    id: 'nfa-rules',
    region: 'AMER', regulator: 'NFA',
    label: 'NFA Compliance Rules',
    url: 'https://www.nfa.futures.org/rulebook/rules.aspx?Section=4',
    category: 'Derivatives',
    selector: '.rule-list li, table tbody tr, .content-area li',
  },
  {
    id: 'fdic-rules',
    region: 'AMER', regulator: 'FDIC',
    label: 'FDIC Rules & Regulations',
    url: 'https://www.fdic.gov/regulations/laws/rules/',
    category: 'Banking',
    selector: 'table tbody tr td:first-child a, .rule-list li',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EUROPEAN UNION — REGIONAL AGENCIES
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'esma-regulations',
    region: 'UK/EU', regulator: 'ESMA',
    label: 'ESMA Technical Standards & Guidelines',
    url: 'https://www.esma.europa.eu/rules-databases-library/esmas-technical-standards-and-guidelines',
    category: 'Securities',
    selector: '.view-content .views-row, .publication-item, article',
  },
  {
    id: 'esma-qa',
    region: 'UK/EU', regulator: 'ESMA',
    label: 'ESMA Q&A and Opinions',
    url: 'https://www.esma.europa.eu/convergence/questions-and-answers',
    category: 'Securities',
    selector: '.views-row, .qa-item, .document-list li',
  },
  {
    id: 'eba-regulatory-products',
    region: 'UK/EU', regulator: 'EBA',
    label: 'EBA Regulatory Products & Technical Standards',
    url: 'https://www.eba.europa.eu/regulation-and-policy/single-rulebook',
    category: 'Banking',
    selector: '.view-content .views-row, .regulation-list li',
  },
  {
    id: 'eba-guidelines',
    region: 'UK/EU', regulator: 'EBA',
    label: 'EBA Guidelines & Recommendations',
    url: 'https://www.eba.europa.eu/regulation-and-policy/guidelines-and-recommendations',
    category: 'Banking',
    selector: '.view-content .views-row, .guideline-item',
  },
  {
    id: 'eiopa-publications',
    region: 'UK/EU', regulator: 'EIOPA',
    label: 'EIOPA Insurance & Pensions Publications',
    url: 'https://www.eiopa.europa.eu/publications_en',
    category: 'Insurance',
    selector: '.publication-list li, article.publication, .views-row',
  },
  {
    id: 'eiopa-guidelines',
    region: 'UK/EU', regulator: 'EIOPA',
    label: 'EIOPA Guidelines on Solvency II',
    url: 'https://www.eiopa.europa.eu/guidance_en',
    category: 'Insurance',
    selector: '.guideline-item, .views-row, .document-list li',
  },
  {
    id: 'ecb-supervisory-regulations',
    region: 'UK/EU', regulator: 'ECB',
    label: 'ECB Supervisory Regulations',
    url: 'https://www.bankingsupervision.europa.eu/legalframework/supervisoryregulations/html/index.en.html',
    category: 'Prudential',
    selector: 'dl.definition-list dt, .regulation-list li',
  },
  {
    id: 'eurlex-financial-services',
    region: 'UK/EU', regulator: 'EUR-Lex',
    label: 'EUR-Lex Financial Services Legislation',
    url: 'https://eur-lex.europa.eu/search.html?qid=&text=financial+services+regulation&scope=EURLEX&type=quick&lang=en',
    category: 'Banking',
    selector: '.SearchResult, .results-list li',
  },

  // ── EU National Agencies ──────────────────────────────────────────────────
  {
    id: 'bafin-circulars',
    region: 'UK/EU', regulator: 'BaFin',
    label: 'BaFin Circulars & Guidance',
    url: 'https://www.bafin.de/EN/Aufsicht/BankenFinanzdienstleister/Regularien/regularien_node.html',
    category: 'Banking',
    selector: '.result-item, table tbody tr, .publication-list li',
  },
  {
    id: 'amf-regulations',
    region: 'UK/EU', regulator: 'AMF',
    label: 'AMF General Regulation & Instructions',
    url: 'https://www.amf-france.org/en/regulation/general-regulation-and-instructions',
    category: 'Securities',
    selector: '.document-list li, .regulation-item, table tbody tr',
  },
  {
    id: 'acpr-publications',
    region: 'UK/EU', regulator: 'ACPR',
    label: 'ACPR Banking & Insurance Publications',
    url: 'https://acpr.banque-france.fr/en/publications-and-statistics',
    category: 'Insurance',
    selector: '.publication-list li, article.publication, .views-row',
  },
  {
    id: 'cbi-regulations',
    region: 'UK/EU', regulator: 'CBI',
    label: 'Central Bank of Ireland Regulations',
    url: 'https://www.centralbank.ie/regulation/industry-market-sectors',
    category: 'Banking',
    selector: '.regulation-list li, .content-section li, table tbody tr',
  },
  {
    id: 'cysec-legislation',
    region: 'UK/EU', regulator: 'CySEC',
    label: 'CySEC Legislation & Circulars',
    url: 'https://www.cysec.gov.cy/en-GB/legislation/',
    category: 'Securities',
    selector: '.legislation-list li, table tbody tr, .content-area li',
  },
  {
    id: 'consob-regulations',
    region: 'UK/EU', regulator: 'CONSOB',
    label: 'CONSOB Regulations',
    url: 'https://www.consob.it/web/consob-and-its-activities/regulations',
    category: 'Securities',
    selector: '.regulation-item, table tbody tr, .document-list li',
  },
  {
    id: 'afm-regulations',
    region: 'UK/EU', regulator: 'AFM',
    label: 'AFM Financial Markets Regulations',
    url: 'https://www.afm.nl/en/professionals/onderwerpen',
    category: 'Securities',
    selector: '.topic-item, .document-list li, article',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // APAC
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'mas-notices-guidelines',
    region: 'APAC', regulator: 'MAS',
    label: 'MAS Notices & Guidelines',
    url: 'https://www.mas.gov.sg/regulation/regulations-guidance-and-licensing',
    category: 'Banking',
    selector: '.rte ul li, .accordionWrapper li, .regulation-item',
  },
  {
    id: 'mas-consultation',
    region: 'APAC', regulator: 'MAS',
    label: 'MAS Consultation Papers',
    url: 'https://www.mas.gov.sg/regulation/consultations',
    category: 'Banking',
    selector: '.consultation-item, article, .content-listing li',
  },
  {
    id: 'sfc-codes',
    region: 'APAC', regulator: 'SFC',
    label: 'SFC Codes & Guidelines',
    url: 'https://www.sfc.hk/en/Rules-and-Standards/Codes-and-guidelines',
    category: 'Securities',
    selector: '.code-list li, .document-list li, table tbody tr',
  },
  {
    id: 'sfc-circulars',
    region: 'APAC', regulator: 'SFC',
    label: 'SFC Circulars & Regulatory Updates',
    url: 'https://www.sfc.hk/en/Regulatory-updates',
    category: 'Securities',
    selector: '.circular-list li, article, table tbody tr',
  },
  {
    id: 'hkma-supervisory-policy',
    region: 'APAC', regulator: 'HKMA',
    label: 'HKMA Supervisory Policy Manuals',
    url: 'https://www.hkma.gov.hk/eng/regulatory-resources/regulatory-guides/supervisory-policy-manual/',
    category: 'Banking',
    selector: '.inner-content li, .spm-list tr td a, .doc-list li',
  },
  {
    id: 'fsa-japan-laws',
    region: 'APAC', regulator: 'FSA Japan',
    label: 'FSA Japan Laws & Regulations',
    url: 'https://www.fsa.go.jp/en/laws_regulations/',
    category: 'Banking',
    selector: '.regulation-list li, table tbody tr, .content-area li',
  },
  {
    id: 'fsa-japan-guidelines',
    region: 'APAC', regulator: 'FSA Japan',
    label: 'FSA Japan Supervisory Guidelines',
    url: 'https://www.fsa.go.jp/en/refer/guideline/',
    category: 'Banking',
    selector: '.guideline-list li, table tbody tr, article',
  },
  {
    id: 'sebi-regulations',
    region: 'APAC', regulator: 'SEBI',
    label: 'SEBI Regulations & Circulars',
    url: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=2&smid=',
    category: 'Securities',
    selector: 'table tbody tr, .sebi-doc li, .regulation-item',
  },
  {
    id: 'rbi-master-directions',
    region: 'APAC', regulator: 'RBI',
    label: 'RBI Master Directions',
    url: 'https://rbi.org.in/Scripts/NotificationUser.aspx?Mode=0&Id=0',
    category: 'Banking',
    selector: 'table tbody tr, .ntfctn-list li, .content td a',
  },
  {
    id: 'rbi-circulars',
    region: 'APAC', regulator: 'RBI',
    label: 'RBI Master Circulars',
    url: 'https://rbi.org.in/Scripts/NotificationUser.aspx',
    category: 'Banking',
    selector: 'table tbody tr, .notification-list li',
  },
  {
    id: 'asic-regulatory-guides',
    region: 'APAC', regulator: 'ASIC',
    label: 'ASIC Regulatory Guides',
    url: 'https://asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/',
    category: 'Securities',
    selector: '.regulatory-guide-list li, table tbody tr',
  },
  {
    id: 'apra-prudential-standards',
    region: 'APAC', regulator: 'APRA',
    label: 'APRA Prudential Standards',
    url: 'https://www.apra.gov.au/industries',
    category: 'Prudential',
    selector: '.field-items li, .view-content .views-row, article.publication',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MIDDLE EAST / AFRICA
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'sama-regulatory-rules',
    region: 'ME/AF', regulator: 'SAMA',
    label: 'SAMA Regulatory Rules',
    url: 'https://www.sama.gov.sa/en-US/Laws/Pages/regulations.aspx',
    category: 'Banking',
    selector: 'table tbody tr, .ms-rtestate-field li, .regulations-list li',
  },
  {
    id: 'uae-cb-regulations',
    region: 'ME/AF', regulator: 'UAE Central Bank',
    label: 'UAE Central Bank Regulations',
    url: 'https://www.centralbank.ae/en/regulatory-framework',
    category: 'Banking',
    selector: '.regulations-list li, .content-section li, table tbody tr',
  },
  {
    id: 'dfsa-rulebooks',
    region: 'ME/AF', regulator: 'DFSA',
    label: 'DFSA Rulebooks & Regulations',
    url: 'https://www.dfsa.ae/regulation/rulebooks',
    category: 'Securities',
    selector: '.rulebook-list li, .regulation-item, table tbody tr',
  },
  {
    id: 'adgm-fsra-regulations',
    region: 'ME/AF', regulator: 'ADGM FSRA',
    label: 'ADGM FSRA Rulebooks',
    url: 'https://www.adgm.com/fsra/regulations/rulebooks',
    category: 'Securities',
    selector: '.rulebook-list li, .content-block li',
  },
  {
    id: 'fsca-regulations',
    region: 'ME/AF', regulator: 'FSCA',
    label: 'FSCA South Africa Regulatory Frameworks',
    url: 'https://www.fsca.co.za/Regulatory%20Frameworks/Pages/Regulatory-Frameworks.aspx',
    category: 'Securities',
    selector: '.framework-list li, table tbody tr, .content-area li',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MAJOR FRAMEWORKS — dedicated source pages
  // ══════════════════════════════════════════════════════════════════════════

  // AML / CFT
  {
    id: 'fatf-amlcft-guidance',
    region: 'Global', regulator: 'FATF',
    label: 'FATF AML/CFT Risk-Based Approach Guidance',
    url: 'https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Risk-based-approach-guidance-for-the-banking-sector.html',
    category: 'AML / CFT',
    selector: '.publication-list li, article',
  },

  // GDPR
  {
    id: 'edpb-gdpr-guidelines',
    region: 'UK/EU', regulator: 'EDPB',
    label: 'EDPB GDPR Guidelines & Recommendations',
    url: 'https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines_en',
    category: 'Data Protection',
    selector: '.views-row, .document-list li, article',
  },
  {
    id: 'eurlex-gdpr',
    region: 'UK/EU', regulator: 'EUR-Lex',
    label: 'EU General Data Protection Regulation (GDPR)',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679',
    category: 'Data Protection',
    selector: '.docTitle, .title',
  },

  // Basel III / IV
  {
    id: 'bcbs-basel3',
    region: 'Global', regulator: 'BCBS / BIS',
    label: 'BCBS Basel III / IV Capital Framework',
    url: 'https://www.bis.org/bcbs/basel3.htm',
    category: 'Prudential',
    selector: 'table.tablesorter tbody tr, .elist li',
  },

  // MiFID II
  {
    id: 'eurlex-mifid2',
    region: 'UK/EU', regulator: 'EUR-Lex',
    label: 'Markets in Financial Instruments Directive II (MiFID II)',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32014L0065',
    category: 'Securities',
    selector: '.docTitle, .title',
  },
  {
    id: 'esma-mifid2',
    region: 'UK/EU', regulator: 'ESMA',
    label: 'ESMA MiFID II Q&A & Technical Standards',
    url: 'https://www.esma.europa.eu/rules-databases-library/mifid-ii-and-mifir',
    category: 'Securities',
    selector: '.views-row, .document-list li',
  },

  // Solvency II
  {
    id: 'eurlex-solvency2',
    region: 'UK/EU', regulator: 'EUR-Lex',
    label: 'Solvency II Directive',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32009L0138',
    category: 'Insurance',
    selector: '.docTitle, .title',
  },

  // IFRS — additional standards page
  {
    id: 'ifrs-sustainability',
    region: 'Global', regulator: 'IFRS Foundation',
    label: 'IFRS Sustainability Disclosure Standards (ISSB)',
    url: 'https://www.ifrs.org/groups/international-sustainability-standards-board/',
    category: 'ESG / Disclosure',
    selector: '.standard-item, .content-list li',
  },

  // FCPA
  {
    id: 'doj-fcpa',
    region: 'AMER', regulator: 'DOJ',
    label: 'DOJ Foreign Corrupt Practices Act (FCPA) Resources',
    url: 'https://www.justice.gov/criminal-fraud/foreign-corrupt-practices-act',
    category: 'Anti-Bribery',
    selector: '.view-content li, .menu-block-wrapper li, article',
  },
  {
    id: 'sec-fcpa',
    region: 'AMER', regulator: 'SEC',
    label: 'SEC FCPA Enforcement Actions',
    url: 'https://www.sec.gov/divisions/enforce/fcpa.shtml',
    category: 'Anti-Bribery',
    selector: 'table tbody tr, .content-list li',
  },

  // UK Bribery Act
  {
    id: 'sfo-bribery-act',
    region: 'UK/EU', regulator: 'SFO',
    label: 'SFO UK Bribery Act Guidance & Cases',
    url: 'https://www.sfo.gov.uk/publications/',
    category: 'Anti-Bribery',
    selector: '.publication-list li, article, .result-item',
  },
  {
    id: 'legislation-bribery-act',
    region: 'UK/EU', regulator: 'UK Government',
    label: 'UK Bribery Act 2010',
    url: 'https://www.legislation.gov.uk/ukpga/2010/23/contents',
    category: 'Anti-Bribery',
    selector: '.LegContents li, .legItem',
    hrefFilter: /\/section\//,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // OTHER KEY JURISDICTIONS
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'finma-regulations',
    region: 'UK/EU', regulator: 'FINMA',
    label: 'FINMA Switzerland Regulations & Circulars',
    url: 'https://www.finma.ch/en/regulation/regulations/',
    category: 'Banking',
    selector: '.regulation-list li, table tbody tr, .document-item',
  },
  {
    id: 'finma-circulars',
    region: 'UK/EU', regulator: 'FINMA',
    label: 'FINMA Circulars',
    url: 'https://www.finma.ch/en/regulation/circulars/',
    category: 'Banking',
    selector: '.circular-list li, table tbody tr',
  },
  {
    id: 'cima-regulations',
    region: 'AMER', regulator: 'CIMA',
    label: 'CIMA Cayman Islands Regulations',
    url: 'https://www.cima.ky/regulations-and-legislation/',
    category: 'Banking',
    selector: '.regulation-list li, .legislation-item, table tbody tr',
  },
  {
    id: 'bvifsc-regulations',
    region: 'AMER', regulator: 'BVIFSC',
    label: 'BVI Financial Services Commission Regulations',
    url: 'https://www.bvifsc.vg/regulation/laws-and-regulations',
    category: 'Securities',
    selector: '.law-list li, table tbody tr, .content-area li',
  },
];
