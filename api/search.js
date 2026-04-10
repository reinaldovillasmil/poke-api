// api/search.js
// GET /api/search?q=Charizard
// Searches any card by name, returns all versions with full investment score.
// Great for looking up a specific card you heard about.

const { searchCards } = require('../lib/poketcg');
const { scoreCard, getBenchmark, getPokemonScore } = require('../lib/scoring');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = (req.query.q || '').trim();
  if (!q) { res.status(400).json({ success: false, error: 'Missing ?q= parameter' }); return; }

  try {
    const raw = await searchCards(q, 60);

    const scored = raw.map(card => {
      const scoreResult = scoreCard({
        name:         card.name,
        rarity:       card.rarity,
        setId:        card.set.id,
        releaseDate:  card.set.releaseDate,
        printedTotal: card.set.printedTotal,
        price:        card.marketPrice,
        supertype:    card.supertype,
      });

      const pokemonScore = getPokemonScore(card.name);
      const bench = getBenchmark(card.rarity, pokemonScore, card.supertype === 'Trainer');
      const cardNo = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : null;
      const ebayQuery = [card.name, cardNo, card.set.name, card.rarity].filter(Boolean).join(' ');

      return {
        ...card,
        cardNo,
        score:          scoreResult.total,
        recommendation: scoreResult.recommendation,
        lifecycleLabel: scoreResult.lifecycleLabel,
        breakdown:      scoreResult.breakdown,
        benchmarks:     bench,
        upside:         card.marketPrice > 0 ? Math.round(((bench.fair - card.marketPrice) / card.marketPrice) * 100) : null,
        ebayQuery,
      };
    });

    // Sort by score desc
    scored.sort((a, b) => b.score - a.score);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.status(200).json({ success: true, count: scored.length, query: q, cards: scored });

  } catch (err) {
    console.error('[/api/search]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
