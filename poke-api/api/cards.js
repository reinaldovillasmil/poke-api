// api/cards.js
// GET /api/cards
// Returns all secret rares, fully scored with investment breakdown.
// Cached 30 min at Vercel edge — instant for your app.
//
// Query params:
//   ?rarity=Special Illustration Rare   (filter by rarity)
//   ?minScore=70                        (filter by score)
//   ?maxPrice=100                       (filter by price)
//   ?sort=score|price|upside|new        (sort order, default: score)

const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getBenchmark, getPokemonScore } = require('../lib/scoring');

const SECRET_RARITIES = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const cards = await fetchSecretRares(SECRET_RARITIES, 3);

    // Score every card
    const scored = cards.map(card => {
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

      // Build eBay search query (used by frontend for links)
      const ebayQuery = [card.name, cardNo, card.set.name, card.rarity]
        .filter(Boolean).join(' ');

      return {
        ...card,
        cardNo,
        score:         scoreResult.total,
        recommendation: scoreResult.recommendation,
        lifecycleLabel: scoreResult.lifecycleLabel,
        breakdown:     scoreResult.breakdown,
        benchmarks:    bench,
        upside:        card.marketPrice > 0 ? Math.round(((bench.fair - card.marketPrice) / card.marketPrice) * 100) : null,
        ebayQuery,
      };
    });

    // Apply filters
    let filtered = scored;
    const { rarity, minScore, maxPrice, sort = 'score' } = req.query;
    if (rarity)    filtered = filtered.filter(c => c.rarity === rarity);
    if (minScore)  filtered = filtered.filter(c => c.score >= +minScore);
    if (maxPrice)  filtered = filtered.filter(c => !c.marketPrice || c.marketPrice <= +maxPrice);

    // Sort
    filtered.sort((a, b) => {
      if (sort === 'price')  return (a.marketPrice || 999) - (b.marketPrice || 999);
      if (sort === 'upside') return (b.upside || 0) - (a.upside || 0);
      if (sort === 'new')    return new Date(b.set.releaseDate||0) - new Date(a.set.releaseDate||0);
      return b.score - a.score; // default: score
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({
      success: true,
      count: filtered.length,
      total: scored.length,
      updatedAt: new Date().toISOString(),
      cards: filtered,
    });

  } catch (err) {
    console.error('[/api/cards]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
