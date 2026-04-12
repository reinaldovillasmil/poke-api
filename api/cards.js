// api/cards.js
// GET /api/cards — secret rares, fully scored. Cached 30min.
//
// Query params:
//   ?rarity=Special Illustration Rare
//   ?minScore=70
//   ?maxPrice=100
//   ?sort=score|price|upside|new        (frontend sort)
//   ?page=1|2|3|4                       (which 250-card batch — for shuffle)
//   ?hiddenGems=1

const { fetchSecretRares } = require('../lib/poketcg');
const { scoreCard, getBenchmarks, getDemandScore, isSetOOP } = require('../lib/scoring');

const SECRET_RARITIES = ['Special Illustration Rare', 'Illustration Rare', 'Hyper Rare'];

// API sort orders to rotate through for shuffle variety
// Maps frontend ?page param to a different backend sort + page combo
const PAGE_CONFIGS = {
  '1': { apiSort: '-set.releaseDate', apiPage: 1 }, // newest first (default)
  '2': { apiSort: '-set.releaseDate', apiPage: 2 }, // newer sets, second batch
  '3': { apiSort: 'name',             apiPage: 1 }, // alphabetical
  '4': { apiSort: '-name',            apiPage: 1 }, // reverse alphabetical
};

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
    // Determine which page/sort config to use
    const pageKey = req.query.page || '1';
    const config = PAGE_CONFIGS[pageKey] || PAGE_CONFIGS['1'];

    const cards = await fetchSecretRares(SECRET_RARITIES, config.apiPage, config.apiSort);
    const scored = cards.map(buildCard);

    // Frontend filters
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
      if (a.isHiddenGem && !b.isHiddenGem) return -1;
      if (!a.isHiddenGem && b.isHiddenGem) return 1;
      return b.score - a.score;
    });

    // Cache: shuffle pages cache shorter so fresh shuffles work
    const cacheTime = pageKey === '1' ? 1800 : 900;
    res.setHeader('Cache-Control', `s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime*2}`);
    res.status(200).json({
      success: true,
      count: filtered.length,
      total: scored.length,
      page: pageKey,
      hiddenGems: scored.filter(c => c.isHiddenGem).length,
      updatedAt: new Date().toISOString(),
      cards: filtered,
    });
  } catch (err) {
    console.error('[/api/cards]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};