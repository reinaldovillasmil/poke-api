// api/health.js
// GET /api/health
// Instant health check — responds in milliseconds.
// External service checks run with a 3s timeout so they never block.

const fetch = require('node-fetch');

// Fetch with a hard timeout — never hangs
function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const start = Date.now();

  // 1. Env vars — instant, no network
  const env = {
    poketcgApiKey: !!process.env.POKETCG_API_KEY,
    kvConfigured:  !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
  };

  // 2. PokéTCG.io — 3s timeout max
  let pokeTcgApi;
  try {
    const headers = process.env.POKETCG_API_KEY ? { 'X-Api-Key': process.env.POKETCG_API_KEY } : {};
    const r = await fetchWithTimeout('https://api.pokemontcg.io/v2/cards?pageSize=1', { headers }, 3000);
    pokeTcgApi = { ok: r.ok, status: r.status };
  } catch (e) {
    pokeTcgApi = { ok: false, error: e.name === 'AbortError' ? 'Timed out after 3s' : e.message };
  }

  // 3. Vercel KV — 2s timeout max
  let kv;
  if (env.kvConfigured) {
    try {
      const r = await fetchWithTimeout(
        `${process.env.KV_REST_API_URL}/ping`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } },
        2000
      );
      kv = { ok: r.ok, status: r.status };
    } catch (e) {
      kv = { ok: false, error: e.name === 'AbortError' ? 'Timed out after 2s' : e.message };
    }
  } else {
    kv = { ok: false, note: 'Not configured — watchlist uses localStorage fallback' };
  }

  const latencyMs = Date.now() - start;
  const allOk = pokeTcgApi.ok;

  res.status(allOk ? 200 : 503).json({
    status:    allOk ? 'ok' : 'degraded',
    latencyMs,
    timestamp: new Date().toISOString(),
    version:   '2.0.0',
    checks:    { env, pokeTcgApi, kv },
    endpoints: [
      'GET /api/health',
      'GET /api/cards',
      'GET /api/search?q=',
      'GET /api/score?id=',
      'GET /api/prices?q=',
      'GET /api/trending',
      'GET /api/watchlist?uid=',
      'POST /api/watchlist',
    ],
  });
};