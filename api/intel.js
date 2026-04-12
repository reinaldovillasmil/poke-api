// api/intel.js
// GET /api/intel
// Returns:
//   - Upcoming set releases (curated, updated manually each season)
//   - Claude's assessment of which current cards are affected by upcoming sets
//   - Market sentiment signals for top cards
// Cached 6 hours.

const fetch = require('node-fetch');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// Upcoming sets — update this each season (takes 2 minutes, 4x/year)
const UPCOMING_SETS = [
  {
    name: 'Destined Rivals',
    code: 'sv10',
    releaseDate: '2025-05-02',
    region: 'EN',
    keyCards: ['Cynthia', 'Garchomp ex', 'Dialga ex', 'Palkia ex'],
    note: 'Sinnoh-focused set. Strong trainer demand expected. Cynthia cards historically spike on release.',
  },
  {
    name: 'Journey Together',
    code: 'sv9',
    releaseDate: '2025-03-28',
    region: 'EN',
    keyCards: ['Pikachu ex', 'Eevee ex', 'Ash'],
    note: 'Anniversary-themed. Heavy Pikachu/Eevee focus — could affect pricing of existing Eevee-line SIRs.',
  },
  {
    name: 'Black Bolt & White Flare',
    code: 'sv11',
    releaseDate: '2025-08-01',
    region: 'EN',
    keyCards: ['Zekrom ex', 'Reshiram ex', 'N'],
    note: 'Unova focus. N SIR expected — could affect value of existing N cards if confirmed.',
  },
  {
    name: 'MEGA Dream ex',
    code: 'mde',
    releaseDate: '2024-11-28',
    region: 'JP',
    keyCards: ['Mega Gengar ex', 'Mega Dragonite ex', 'Mega Charizard ex'],
    note: 'JP High Class Pack. Mega Gengar ex SAR launched at ¥100,000. EN equivalent TBD.',
  },
];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  let setImpact = null;
  if (anthropicKey) {
    try {
      const setsJson = JSON.stringify(UPCOMING_SETS.slice(0, 3));
      const prompt = `You are a Pokémon TCG market analyst. Based on these upcoming set releases, identify which CURRENT cards (already released) are most likely affected — either positively (related theme drives demand) or negatively (reprint risk, competing card). Be specific and brief.

Upcoming sets: ${setsJson}

Return ONLY valid JSON:
{
  "impacts": [
    {
      "upcomingSet": "<set name>",
      "affectedCard": "<specific card name and set>",
      "direction": "<positive|negative>",
      "reason": "<1 sentence>",
      "action": "<buy before release|sell before release|hold|watch>"
    }
  ],
  "topOpportunity": "<1-2 sentence summary of the single best opportunity created by upcoming releases>"
}`;

      const r = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      });
      if (r.ok) {
        const d = await r.json();
        const text = d.content?.[0]?.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) setImpact = JSON.parse(match[0]);
      }
    } catch(e) { console.error('Intel AI error:', e.message); }
  }

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
  res.status(200).json({
    success: true,
    upcomingSets: UPCOMING_SETS,
    setImpact,
    updatedAt: new Date().toISOString(),
  });
};
