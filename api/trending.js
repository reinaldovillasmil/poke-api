// api/trending.js
// GET /api/trending
//
// Finds cards with significant price momentum — cards that are moving NOW.
// Compares 7-day eBay sold avg to 30-day avg and surfaces cards with 10%+ moves.
//
// This is a heavier endpoint (scrapes eBay for multiple cards) so it's cached 4 hours.
// Runs on demand — NOT a background job (Vercel free tier doesn't have cron).

const { scrapeSoldListings, analyzePrice } = require('../lib/ebay');
const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getPokemonScore, getBenchmark } = require('../lib/scoring');

// We only check trending for high-score, priced cards — not every 750 cards
const MIN_PRICE = 20;
const MIN_SCORE = 65;
const MAX_CARDS_TO_CHECK = 15; // eBay rate limits — be respectful

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // Get scored cards, filter to candidates worth checking
    const rarities = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare'];
    const allCards = await fetchSecretRares(rarities, 2);

    const candidates = allCards
      .map(card => {
        const s = scoreCard({ name: card.name, rarity: card.rarity, setId: card.set.id, releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal, price: card.marketPrice, supertype: card.supertype });
        return { ...card, score: s.total };
      })
      .filter(c => c.marketPrice >= MIN_PRICE && c.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CARDS_TO_CHECK);

    // Scrape eBay for each candidate (sequential to avoid rate limits)
    const trending = [];
    for (const card of candidates) {
      try {
        const cardNo = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : '';
        const q = `${card.name} ${cardNo} ${card.set.name} ${card.rarity}`;
        const sales = await scrapeSoldListings(q, 2);
        const analysis = analyzePrice(sales);
        if (!analysis || !analysis.avg7 || !analysis.avg30) continue;
        if (Math.abs(analysis.trendPct) < 8) continue; // ignore flat cards

        const pokemonScore = getPokemonScore(card.name);
        const bench = getBenchmark(card.rarity, pokemonScore, card.supertype === 'Trainer');

        trending.push({
          id:             card.id,
          name:           card.name,
          cardNo,
          set:            card.set.name,
          rarity:         card.rarity,
          score:          card.score,
          tcgPrice:       card.marketPrice,
          ebayAvg7:       analysis.avg7,
          ebayAvg30:      analysis.avg30,
          trend:          analysis.trend,
          trendPct:       analysis.trendPct,
          fairValue:      bench.fair,
          image:          card.image,
          ebayQuery:      q,
        });

        await new Promise(r => setTimeout(r, 400)); // polite delay
      } catch (e) {
        continue;
      }
    }

    // Sort: rising first, then falling (both are actionable signals)
    trending.sort((a, b) => Math.abs(b.trendPct) - Math.abs(a.trendPct));

    res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=28800');
    res.status(200).json({
      success: true,
      count: trending.length,
      checkedCards: candidates.length,
      updatedAt: new Date().toISOString(),
      trending,
    });

  } catch (err) {
    console.error('[/api/trending]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
