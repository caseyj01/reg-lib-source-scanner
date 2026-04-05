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
 *   PROXY_TOKEN       — shared bearer token the extension sends (optional but recommended)
 *   PORT              — port to listen on (default 3001)
 *   ALLOWED_ORIGINS   — comma-separated allowed CORS origins (default *)
 *
 * Requests round-robin across all configured keys to spread free-tier quota.
 */

import 'dotenv/config';
import express      from 'express';
import cors         from 'cors';

const {
  GEMINI_API_KEY_1,
  GEMINI_API_KEY_2,
  GEMINI_API_KEY_3,
  PROXY_TOKEN,
  PORT           = 3001,
  ALLOWED_ORIGINS = '*',
} = process.env;

// Collect whichever keys are configured
const API_KEYS = [GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('ERROR: No GEMINI_API_KEY_* set. Add at least GEMINI_API_KEY_1 to .env. Exiting.');
  process.exit(1);
}

console.log(`Loaded ${API_KEYS.length} Gemini API key(s).`);

let keyIndex = 0;
function nextKey() {
  const key = API_KEYS[keyIndex % API_KEYS.length];
  keyIndex++;
  return key;
}

const GEMINI_MODEL   = 'gemini-2.0-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const app = express();

app.use(cors({
  origin: ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS.split(',').map(s => s.trim()),
}));
app.use(express.json({ limit: '1mb' }));

// ── Auth middleware ────────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  if (!PROXY_TOKEN) return next(); // no token configured → open
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${PROXY_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Gemini proxy ──────────────────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  try {
    const key = nextKey();
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error('Gemini error:', geminiResponse.status, JSON.stringify(data).slice(0, 300));
      return res.status(geminiResponse.status).json({ error: data?.error?.message || 'Gemini error' });
    }

    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Proxy could not reach Gemini: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Reg Library proxy running on port ${PORT}`);
  console.log(`Auth token: ${PROXY_TOKEN ? 'enabled' : 'disabled (set PROXY_TOKEN to enable)'}`);
});
