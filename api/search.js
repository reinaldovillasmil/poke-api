// api/search.js
// GET /api/search?q=Charizard
// Searches any card by name, returns all versions with full investment score.
// Input is sanitized to prevent abuse.

const { searchCards } = require('../lib/poketcg');
const { scoreCard, getBenchmark, getPokemonScore } = require('../lib/scoring');

function sanitizeQuery(q) {
  return q.trim().replace(/[^\w\s'&\-\.]/g, '').slice(0, 60);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const raw = req.query.q || '';
  const q = sanitizeQuery(raw);
  if (!q) { res.status(400).json({ success: false, error: 'Missing or invalid ?q= parameter' }); return; }

  try {
    const raw = await searchCards(q, 60);

    const scored = raw.map(card => {
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

    scored.sort((a, b) => b.score - a.score);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.status(200).json({ success: true, count: scored.length, query: q, cards: scored });

  } catch (err) {
    console.error('[/api/search]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};