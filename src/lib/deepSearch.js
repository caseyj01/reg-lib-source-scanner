/**
 * @fileoverview Deep-search module.
 * Calls the Vixio Reg Library proxy server, which holds the Gemini API key.
 * The extension itself never handles or stores any API credentials.
 *
 * Configure the proxy URL at build time via:
 *   VITE_PROXY_URL   (default: http://localhost:3001)
 *   VITE_PROXY_TOKEN (optional bearer token for auth)
 */

const PROXY_URL   = import.meta.env.VITE_PROXY_URL   ?? 'http://localhost:3001';
const PROXY_TOKEN = import.meta.env.VITE_PROXY_TOKEN ?? '';

// ── Input sanitization ────────────────────────────────────────────────────────
// Strip characters and patterns that could be used for prompt injection.
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /disregard\s+(all|previous)/gi,
  /new\s+instructions?/gi,
  /override\s+(your|the)/gi,
  /<[^>]*>/g,           // HTML tags
  /[`]{3}/g,            // triple backticks
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // control characters
];

function sanitize(str) {
  if (typeof str !== 'string') return '';
  let out = str.trim().slice(0, 200); // hard length cap
  for (const pattern of INJECTION_PATTERNS) {
    out = out.replace(pattern, '');
  }
  return out.trim();
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a specialist regulatory compliance analyst for banking and financial services.

For the given regulatory authority, produce a comprehensive compliance requirements matrix covering everything banks and financial institutions need to be aware of — not just primary legislation but also guidance, circulars, supervisory expectations, codes of conduct, technical standards, and regulatory notices.

Rules:
1. Include ALL relevant regulatory material: primary legislation, statutory instruments, final rules, supervisory statements, guidance notes, circulars, codes of practice, technical standards, regulatory notices, and enforceable expectations.
2. Cover ALL major compliance areas relevant to this authority: AML/CFT, KYC/CDD, governance & accountability, transaction monitoring, suspicious activity reporting, sanctions, consumer protection, fraud prevention, data protection, operational resilience, outsourcing, recordkeeping, capital adequacy, conduct of business — include everything this authority touches.
3. Each row is ONE specific requirement or expectation with a precise citation and real working URLs to official sources.
4. Aim for 20-30 rows covering the full breadth of this authority's remit — be thorough, do not stop at 10.
5. Search the authority's official website, legislation databases, and regulatory handbooks to find current in-force material.

Return ONLY a raw JSON array (no markdown, no preamble). Each object must have exactly these fields:
{
  "reqReport": "Y",
  "requirement": string,
  "description": string,
  "analystGuide": string,
  "reference": string,
  "sourceUrl1": string,
  "sourceUrl1Type": string,
  "sourceUrl2": string,
  "sourceUrl2Type": string,
  "authority": string,
  "jurisdiction": string
}

Field definitions:
- requirement: compliance category (e.g. "AML Governance and Accountability", "Customer Due Diligence", "Sanctions Screening")
- description: the specific requirement or expectation in 1-2 clear sentences
- analystGuide: what evidence to look for and questions to ask during a compliance review (start with an action verb, 1-2 sentences)
- reference: exact citation (e.g. "Money Laundering Regulations 2017, Regulation 21(1)(a)" or "FCA SYSC 6.3.1R")
- sourceUrl1: URL to the primary source (legislation, rule, or official standard)
- sourceUrl1Type: short label describing the link (e.g. "Primary Legislation", "FCA Handbook", "EBA Guidelines", "Supervisory Statement", "Regulatory Notice", "Technical Standard", "Official Guidance")
- sourceUrl2: URL to secondary source (guidance, handbook chapter, or supporting document)
- sourceUrl2Type: short label describing the link (same format as sourceUrl1Type)
- authority: full official name of the regulatory authority
- jurisdiction: country or region (e.g. "United Kingdom", "European Union", "United States")`
}

// KNOWN_AUTHORITIES is now a plain string array (names only)

// ── Response parsing ──────────────────────────────────────────────────────────
function extractText(responseBody) {
  return responseBody?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseResults(text) {
  const stripped = text.replace(/```json\s*/gi, '').replace(/```/g, '');
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Core search ───────────────────────────────────────────────────────────────
export async function deepSearch({ query, region = 'Global', category = 'All' }) {
  const safeQuery    = sanitize(query);
  const safeRegion   = sanitize(region);
  const safeCategory = sanitize(category);

  const regionClause   = safeRegion !== 'Global' ? ` (${safeRegion} region)` : '';
  const categoryClause = safeCategory !== 'All'  ? `, focusing on ${safeCategory}` : '';

  const userMessage = `Regulatory authority: ${safeQuery}${regionClause}

Search the official website, published rulebook, handbook, and legislation of ${safeQuery}. Extract the specific compliance requirements that banks and financial institutions must meet${categoryClause}.

Include: primary legislation, statutory instruments, final rules, supervisory statements, prudential standards, conduct of business rules, codes of practice, and technical standards.

Exclude: consultation papers, speeches, Q&As, thematic reviews, Dear CEO letters, and non-binding industry guidance.

For each requirement provide a direct link to the source documentation. Aim for 20-30 rows covering the full breadth of this authority's remit.`;

  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: 10000 },
  };

  const headers = { 'Content-Type': 'application/json' };
  if (PROXY_TOKEN) headers['Authorization'] = `Bearer ${PROXY_TOKEN}`;

  const response = await fetch(`${PROXY_URL}/api/search`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(geminiBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Search failed (${response.status}): ${err.error || response.statusText}`);
  }

  const data = await response.json();
  return parseResults(extractText(data));
}

// ── Multi-region sweep ────────────────────────────────────────────────────────
export async function deepSearchAllRegions({ query, knownTitles = [], category = 'All', onProgress }) {
  const regions    = ['UK/EU', 'AMER', 'APAC', 'ME/AF', 'Global'];
  const allResults = [];
  const seenUrls   = new Set();

  for (const region of regions) {
    const results    = await deepSearch({ query, knownTitles, region, category });
    const newResults = results.filter(r => {
      if (!r.sourceUrl || seenUrls.has(r.sourceUrl)) return false;
      seenUrls.add(r.sourceUrl);
      return true;
    });
    allResults.push(...newResults);
    if (typeof onProgress === 'function') onProgress(region, newResults.length);
  }

  return allResults;
}
