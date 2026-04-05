/**
 * Vixio Reg Library — Gemini Proxy Server
 *
 * Sits between the Chrome extension and the Gemini API so users never
 * need to handle an API key. Deploy this server inside your own infra
 * and set GEMINI_API_KEY in the environment.
 *
 * Environment variables (set in .env or your hosting platform):
 *   GEMINI_API_KEY   — your Google AI Studio / Vertex key (required)
 *   PROXY_TOKEN      — shared bearer token the extension sends (optional but recommended)
 *   PORT             — port to listen on (default 3001)
 *   ALLOWED_ORIGINS  — comma-separated allowed CORS origins (default *)
 */

import 'dotenv/config';
import express      from 'express';
import cors         from 'cors';

const {
  GEMINI_API_KEY,
  PROXY_TOKEN,
  PORT           = 3001,
  ALLOWED_ORIGINS = '*',
} = process.env;

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set. Exiting.');
  process.exit(1);
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
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
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
