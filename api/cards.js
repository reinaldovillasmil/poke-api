// api/cards.js
// GET /api/cards — all secret rares, fully scored. Cached 30min.

const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getBenchmarks, getDemandScore, isSetOOP } = require('../lib/scoring');

const SECRET_RARITIES = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare'];

function sanitizeNumber(val, fallback) {
  const n = parseFloat(val); return isNaN(n) ? fallback : n;
}

function buildCard(card) {
  const s = scoreCard({
    name: card.name, rarity: card.rarity, setId: card.set.id,
    releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal,
    price: card.marketPrice, supertype: card.supertype,
  });
  const demandScore = getDemandScore(card.name);
  const bench = getBenchmarks(card.rarity, demandScore, card.supertype === 'Trainer');
  const cardNo = card.number ? `${card.number}/${card.set.printedTotal || '?'}` : null;
  const ebayQuery = [card.name, cardNo, card.set.name, card.rarity].filter(Boolean).join(' ');
  return {
    ...card, cardNo,
    score: s.total, hasPrice: s.hasPrice, isHiddenGem: s.isHiddenGem,
    playabilityContext: s.playabilityContext, playabilityLabel: s.playabilityLabel,
    recommendation: s.recommendation, lifecycleLabel: s.lifecycleLabel,
    breakdown: s.breakdown, benchmarks: bench, upside: s.upside,
    isOOP: isSetOOP(card.set.id), ebayQuery,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const cards = await fetchSecretRares(SECRET_RARITIES);
    const scored = cards.map(buildCard);

    const { rarity, sort = 'score', hiddenGems } = req.query;
    const minScore = sanitizeNumber(req.query.minScore, 0);
    const maxPrice = sanitizeNumber(req.query.maxPrice, 99999);

    let filtered = scored;
    if (rarity)             filtered = filtered.filter(c => c.rarity === rarity);
    if (minScore)           filtered = filtered.filter(c => c.score >= minScore);
    if (maxPrice < 99999)   filtered = filtered.filter(c => !c.marketPrice || c.marketPrice <= maxPrice);
    if (hiddenGems === '1') filtered = filtered.filter(c => c.isHiddenGem);

    const validSorts = ['score','price','upside','new'];
    const safeSort = validSorts.includes(sort) ? sort : 'score';
    filtered.sort((a, b) => {
      if (safeSort === 'price')  return (a.marketPrice||999) - (b.marketPrice||999);
      if (safeSort === 'upside') return (b.upside||0) - (a.upside||0);
      if (safeSort === 'new')    return new Date(b.set.releaseDate||0) - new Date(a.set.releaseDate||0);
      // Hidden gems float to top when sorting by score
      if (a.isHiddenGem && !b.isHiddenGem) return -1;
      if (!a.isHiddenGem && b.isHiddenGem) return 1;
      return b.score - a.score;
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({
      success: true, count: filtered.length, total: scored.length,
      hiddenGems: scored.filter(c => c.isHiddenGem).length,
      updatedAt: new Date().toISOString(), cards: filtered,
    });
  } catch (err) {
    console.error('[/api/cards]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};