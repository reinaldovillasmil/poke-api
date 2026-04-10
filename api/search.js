// api/search.js — GET /api/search?q=

const { searchCards } = require('../lib/poketcg');
const { scoreCard, getBenchmarks, getDemandScore, isSetOOP } = require('../lib/scoring');

function sanitize(q) { return q.trim().replace(/[^\w\s'&\-\.]/g,'').slice(0,60); }

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const q = sanitize(req.query.q || '');
  if (!q) { res.status(400).json({ success:false, error:'Missing ?q=' }); return; }
  try {
    const raw = await searchCards(q, 60);
    const scored = raw.map(card => {
      const s = scoreCard({
        name: card.name, rarity: card.rarity, setId: card.set.id,
        releaseDate: card.set.releaseDate, printedTotal: card.set.printedTotal,
        price: card.marketPrice, supertype: card.supertype,
      });
      const demandScore = getDemandScore(card.name);
      const bench = getBenchmarks(card.rarity, demandScore, card.supertype === 'Trainer');
      const cardNo = card.number ? `${card.number}/${card.set.printedTotal||'?'}` : null;
      const ebayQuery = [card.name, cardNo, card.set.name, card.rarity].filter(Boolean).join(' ');
      return {
        ...card, cardNo,
        score: s.total, hasPrice: s.hasPrice, isHiddenGem: s.isHiddenGem,
        playabilityContext: s.playabilityContext, playabilityLabel: s.playabilityLabel,
        recommendation: s.recommendation, lifecycleLabel: s.lifecycleLabel,
        breakdown: s.breakdown, benchmarks: bench, upside: s.upside,
        isOOP: isSetOOP(card.set.id), ebayQuery,
      };
    });
    scored.sort((a,b) => {
      if (a.isHiddenGem && !b.isHiddenGem) return -1;
      if (!a.isHiddenGem && b.isHiddenGem) return 1;
      return b.score - a.score;
    });
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.status(200).json({ success:true, count:scored.length, query:q, cards:scored });
  } catch(err) {
    console.error('[/api/search]', err);
    res.status(500).json({ success:false, error:err.message });
  }
};