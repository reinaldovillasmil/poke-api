// api/alerts.js
// GET  /api/alerts?uid=USER_ID              → get all alerts
// POST /api/alerts                           → create/update alert
//      body: { uid, cardId, cardName, ebayQuery, targetPrice, direction }
//      direction: 'below' (buy alert) | 'above' (sell alert)
// DELETE /api/alerts?uid=USER_ID&cardId=xxx → remove alert
//
// GET /api/alerts/check?uid=USER_ID         → check which alerts triggered
// Uses Vercel KV for storage. Falls back gracefully if KV not configured.

const fetch = require('node-fetch');
const { scrapeSoldListings, analyzePrice } = require('../lib/ebay');

async function kvGet(url, token, key) {
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

async function kvSet(url, token, key, value) {
  try {
    await fetch(`${url}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value) }),
    });
  } catch(e) { console.error('KV set error:', e.message); }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    res.status(200).json({ success: true, kvAvailable: false, alerts: [], message: 'KV not configured. Add Vercel KV to enable price alerts.' });
    return;
  }

  const uid = req.query.uid || 'default';

  try {
    // CHECK endpoint — returns which alerts have triggered
    if (req.url.includes('/check')) {
      const alerts = await kvGet(kvUrl, kvToken, `alerts:${uid}`) || [];
      const triggered = [];

      for (const alert of alerts) {
        try {
          const sales = await scrapeSoldListings(alert.ebayQuery, 1);
          const analysis = analyzePrice(sales);
          if (!analysis) continue;

          const currentPrice = analysis.avg7 || analysis.avg;
          const hit = alert.direction === 'below'
            ? currentPrice <= alert.targetPrice
            : currentPrice >= alert.targetPrice;

          if (hit) {
            triggered.push({
              ...alert,
              currentPrice,
              triggeredAt: new Date().toISOString(),
            });
          }
        } catch(e) { continue; }
      }

      res.status(200).json({ success: true, checked: alerts.length, triggered });
      return;
    }

    if (req.method === 'GET') {
      const alerts = await kvGet(kvUrl, kvToken, `alerts:${uid}`) || [];
      res.status(200).json({ success: true, kvAvailable: true, alerts });

    } else if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
      const { cardId, cardName, ebayQuery, targetPrice, direction = 'below' } = body || {};
      if (!cardId || !targetPrice) {
        res.status(400).json({ success: false, error: 'Provide cardId and targetPrice' }); return;
      }

      const alerts = await kvGet(kvUrl, kvToken, `alerts:${uid}`) || [];
      const existing = alerts.findIndex(a => a.cardId === cardId);
      const alert = { cardId, cardName, ebayQuery, targetPrice: +targetPrice, direction, createdAt: new Date().toISOString() };

      if (existing >= 0) alerts[existing] = alert;
      else alerts.push(alert);

      await kvSet(kvUrl, kvToken, `alerts:${uid}`, alerts);
      res.status(200).json({ success: true, alerts });

    } else if (req.method === 'DELETE') {
      const cardId = req.query.cardId;
      let alerts = await kvGet(kvUrl, kvToken, `alerts:${uid}`) || [];
      alerts = alerts.filter(a => a.cardId !== cardId);
      await kvSet(kvUrl, kvToken, `alerts:${uid}`, alerts);
      res.status(200).json({ success: true, alerts });

    } else {
      res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
