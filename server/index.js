/**
 * Vixio Reg Library — Gemini Proxy Server
 *
 * Sits between the Chrome extension and the Gemini API so users never
 * need to handle an API key. Deploy this server inside your own infra.
 *
 * Environment variables (set in .env or your hosting platform):
 *   GEMINI_API_KEY_1  — first Gemini key (required)
 *   GEMINI_API_KEY_2  — second Gemini key (optional)
 *   GEMINI_API_KEY_3  — third Gemini key (optional)
 *   PROXY_TOKEN       — shared bearer token the extension sends (REQUIRED)
 *   PORT              — port to listen on (default 3001)
 *   ALLOWED_ORIGINS   — comma-separated allowed CORS origins
 */

import 'dotenv/config';
import express   from 'express';
import cors      from 'cors';
import rateLimit from 'express-rate-limit';

const {
  GEMINI_API_KEY_1,
  GEMINI_API_KEY_2,
  GEMINI_API_KEY_3,
  PROXY_TOKEN,
  PORT           = 3001,
  ALLOWED_ORIGINS = '',
} = process.env;

// ── Startup checks ────────────────────────────────────────────────────────────
const API_KEYS = [GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('ERROR: No GEMINI_API_KEY_* set. Exiting.');
  process.exit(1);
}

if (!PROXY_TOKEN) {
  console.error('ERROR: PROXY_TOKEN is not set. This is required to prevent unauthorized access. Exiting.');
  process.exit(1);
}

console.log(`Loaded ${API_KEYS.length} Gemini API key(s). Auth token: enabled.`);

// ── Key rotation ──────────────────────────────────────────────────────────────
let keyIndex = 0;
function nextKey() {
  const key = API_KEYS[keyIndex % API_KEYS.length];
  keyIndex++;
  return key;
}

const GEMINI_MODEL   = 'gemini-2.0-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = ALLOWED_ORIGINS
  ? ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [];

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (e.g. Chrome extensions, curl)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '256kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs:         60 * 1000,  // 1 minute
  max:              30,          // max 30 requests per IP per minute
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests — please wait before trying again.' },
});
app.use('/api', limiter);

// ── Auth middleware ───────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${PROXY_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Input validation ──────────────────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /disregard\s+(all|previous)/gi,
  /new\s+instructions?/gi,
  /override\s+(your|the)/gi,
];

function containsInjection(str) {
  if (typeof str !== 'string') return false;
  return INJECTION_PATTERNS.some(p => p.test(str));
}

function validateGeminiBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body.';
  if (!Array.isArray(body.contents)) return 'Missing contents array.';

  for (const content of body.contents) {
    if (!Array.isArray(content?.parts)) return 'Invalid content parts.';
    for (const part of content.parts) {
      if (typeof part?.text === 'string' && containsInjection(part.text)) {
        return 'Request contains disallowed content.';
      }
    }
  }
  return null;
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Gemini proxy ──────────────────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  const validationError = validateGeminiBody(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const key = nextKey();
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error('Gemini error:', geminiResponse.status, JSON.stringify(data).slice(0, 200));
      return res.status(geminiResponse.status).json({ error: data?.error?.message || 'Gemini error' });
    }

    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Proxy could not reach Gemini.' });
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Reg Library proxy running on port ${PORT}`);
});
