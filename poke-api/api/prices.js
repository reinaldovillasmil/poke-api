// api/prices.js
// GET /api/prices?q=Umbreon+ex+169/142+Stellar+Crown+Special+Illustration+Rare
//
// Scrapes eBay sold listings and returns:
//   - 7-day and 30-day average sale prices
//   - Price trend (rising/falling/stable)
//   - Recent individual sales
//   - Comparison to our benchmark fair value
//
// Cached 2 hours — eBay data doesn't need to be real-time for investment decisions.

const { scrapeSoldListings, analyzePrice } = require('../lib/ebay');
const { scoreCard, getBenchmark, getPokemonScore } = require('../lib/scoring');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = (req.query.q || '').trim();
  if (!q) { res.status(400).json({ success: false, error: 'Missing ?q= parameter' }); return; }

  try {
    const sales = await scrapeSoldListings(q, 2);
    const analysis = analyzePrice(sales);

    if (!analysis) {
      res.status(200).json({ success: true, found: false, query: q, message: 'No recent sales found. Try a broader search term.' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=14400');
    res.status(200).json({
      success:    true,
      found:      true,
      query:      q,
      scrapedAt:  new Date().toISOString(),
      ...analysis,
    });

  } catch (err) {
    console.error('[/api/prices]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
