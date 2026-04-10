// api/trending.js
// GET /api/trending
// Cards with significant 7-day vs 30-day eBay price movement.
// Capped at 8 cards max to stay well within Vercel 10s timeout.
// Cached 4 hours — momentum signals don't need to be real-time.

const { scrapeSoldListings, analyzePrice } = require('../lib/ebay');
const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getPokemonScore, getBenchmark } = require('../lib/scoring');

const MIN_PRICE    = 20;
const MIN_SCORE    = 65;
const MAX_TO_CHECK = 8; // Hard cap — keeps response under 10s

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const rarities = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare'];
    const allCards = await fetchSecretRares(rarities);

    const candidates = allCards
      .map(card => {
        const s = scoreCard({
          name: card.name, rarity: card.rarity, setId: card.set.id,
          releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal,
          price: card.marketPrice, supertype: card.supertype,
        });
        return { ...card, score: s.total };
      })
      .filter(c => c.marketPrice >= MIN_PRICE && c.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TO_CHECK);

    const trending = [];
    for (const card of candidates) {
      try {
        const cardNo = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : '';
        const q = `${card.name} ${cardNo} ${card.set.name} ${card.rarity}`.trim();
        const sales = await scrapeSoldListings(q, 1); // 1 page only for speed
        const analysis = analyzePrice(sales);
        if (!analysis || !analysis.avg7 || !analysis.avg30) continue;
        if (Math.abs(analysis.trendPct) < 8) continue;

        const pokemonScore = getPokemonScore(card.name);
        const bench = getBenchmark(card.rarity, pokemonScore, card.supertype === 'Trainer');

        trending.push({
          id: card.id, name: card.name, cardNo,
          set: card.set.name, rarity: card.rarity,
          score: card.score, tcgPrice: card.marketPrice,
          ebayAvg7: analysis.avg7, ebayAvg30: analysis.avg30,
          trend: analysis.trend, trendPct: analysis.trendPct,
          fairValue: bench.fair, image: card.image, ebayQuery: q,
        });

        await new Promise(r => setTimeout(r, 300));
      } catch (e) { continue; }
    }

    trending.sort((a, b) => Math.abs(b.trendPct) - Math.abs(a.trendPct));

    res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=28800');
    res.status(200).json({
      success: true, count: trending.length,
      checkedCards: candidates.length,
      updatedAt: new Date().toISOString(),
      trending,
    });

  } catch (err) {
    console.error('[/api/trending]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};