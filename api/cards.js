// api/cards.js
// GET /api/cards
// All secret rares, fully scored. Cached 30min at Vercel edge.
//
// Query params:
//   ?rarity=Special Illustration Rare
//   ?minScore=70
//   ?maxPrice=100
//   ?sort=score|price|upside|new

const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getBenchmark, getPokemonScore } = require('../lib/scoring');

const SECRET_RARITIES = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare'];

function sanitizeNumber(val, fallback) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const cards = await fetchSecretRares(SECRET_RARITIES);

    const scored = cards.map(card => {
      const s = scoreCard({
        name: card.name, rarity: card.rarity, setId: card.set.id,
        releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal,
        price: card.marketPrice, supertype: card.supertype,
      });
      const pokemonScore = getPokemonScore(card.name);
      const bench = getBenchmark(card.rarity, pokemonScore, card.supertype === 'Trainer');
      const cardNo = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : null;
      const ebayQuery = [card.name, cardNo, card.set.name, card.rarity].filter(Boolean).join(' ');
      return {
        ...card, cardNo,
        score: s.total, hasPrice: s.hasPrice,
        recommendation: s.recommendation, lifecycleLabel: s.lifecycleLabel,
        breakdown: s.breakdown, benchmarks: bench, upside: s.upside, ebayQuery,
      };
    });

    // Filters — sanitized
    const { rarity, sort = 'score' } = req.query;
    const minScore = sanitizeNumber(req.query.minScore, 0);
    const maxPrice = sanitizeNumber(req.query.maxPrice, 99999);

    let filtered = scored;
    if (rarity)    filtered = filtered.filter(c => c.rarity === rarity);
    if (minScore)  filtered = filtered.filter(c => c.score >= minScore);
    if (maxPrice < 99999) filtered = filtered.filter(c => !c.marketPrice || c.marketPrice <= maxPrice);

    // Sort
    const validSorts = ['score','price','upside','new'];
    const safeSort = validSorts.includes(sort) ? sort : 'score';
    filtered.sort((a, b) => {
      if (safeSort === 'price')  return (a.marketPrice || 999) - (b.marketPrice || 999);
      if (safeSort === 'upside') return (b.upside || 0) - (a.upside || 0);
      if (safeSort === 'new')    return new Date(b.set.releaseDate||0) - new Date(a.set.releaseDate||0);
      return b.score - a.score;
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({
      success: true, count: filtered.length, total: scored.length,
      updatedAt: new Date().toISOString(), cards: filtered,
    });

  } catch (err) {
    console.error('[/api/cards]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};