// lib/characters.js
// Per-character demand profiles — individual floor/fair/ceiling benchmarks
// based on documented sales history, not generic tier buckets.
//
// STRUCTURE:
//   demandScore:  0-100 collector demand (drives benchmark multipliers)
//   reprintRisk:  0-100 likelihood of new SIR in next 2 sets
//   collectorTier: 'grail'|'blue-chip'|'solid'|'niche'|'speculative'
//   notes:        why this character is rated here
//
// BENCHMARK CALCULATION:
//   Each rarity has a base benchmark. Character demand score scales it:
//   demandScore 95+ = 1.4x base
//   demandScore 80-94 = 1.1x base
//   demandScore 65-79 = 0.85x base
//   demandScore 50-64 = 0.65x base
//   demandScore <50   = 0.45x base

const CHARACTERS = {
  // ── ABSOLUTE GRAILS ──────────────────────────────────────────────
  // Every collector wants these. Floor never meaningfully drops.
  'Charizard':   { demandScore:99, reprintRisk:90, collectorTier:'grail',      notes:'#1 most collected card. Floor is bulletproof. Reprint risk is the key concern — new SIR every 1-2 sets.' },
  'Pikachu':     { demandScore:98, reprintRisk:92, collectorTier:'grail',      notes:'Mascot. Appears in almost every set in some SIR form. Demand is global and infinite.' },
  'Mewtwo':      { demandScore:96, reprintRisk:60, collectorTier:'grail',      notes:'Gen 1 legend. Fewer reprints than Charizard. Each SIR appreciates well.' },
  'Eevee':       { demandScore:95, reprintRisk:75, collectorTier:'grail',      notes:'Universal appeal. Multiple SIRs compete but each finds its collector.' },
  'Umbreon':     { demandScore:94, reprintRisk:45, collectorTier:'grail',      notes:'Fan favourite Eeveelution. Lower reprint risk than Charizard. Strong appreciation history.' },
  'Mew':         { demandScore:93, reprintRisk:50, collectorTier:'grail',      notes:'Mythical appeal. Appears less frequently than Pikachu/Charizard. Good appreciation.' },
  'Lugia':       { demandScore:92, reprintRisk:40, collectorTier:'grail',      notes:'Gen 2 legend. Massive collector appeal. Each SIR performs extremely well.' },
  'Rayquaza':    { demandScore:91, reprintRisk:38, collectorTier:'grail',      notes:'Most popular Gen 3 legend. Strong sustained demand.' },
  'Gengar':      { demandScore:90, reprintRisk:42, collectorTier:'grail',      notes:'Ghost type favourite. Consistently high demand. danciao Gengar ex SAR set new benchmarks.' },

  // ── BLUE CHIP TRAINERS ────────────────────────────────────────────
  // Trainer SIRs with documented 5-50x appreciation history
  'Cynthia':     { demandScore:93, reprintRisk:25, collectorTier:'grail',      notes:'Most popular Champion. Her SIRs consistently appreciate 5-15x. Low reprint risk.' },
  'Misty':       { demandScore:91, reprintRisk:30, collectorTier:'grail',      notes:'Iconic trainer. Misty SAR 2022 went from $15 to $300+. Strong floor.' },
  'N':           { demandScore:90, reprintRisk:28, collectorTier:'grail',      notes:'N Full Art 2016 went $8 to $400+. Every N SIR is a grail candidate.' },
  'Lillie':      { demandScore:88, reprintRisk:22, collectorTier:'blue-chip',  notes:'Fan favourite. Lower reprint frequency than older trainers.' },
  'Serena':      { demandScore:86, reprintRisk:30, collectorTier:'blue-chip',  notes:'Popular modern trainer. Strong anime connection drives demand.' },
  'Brock':       { demandScore:83, reprintRisk:32, collectorTier:'blue-chip',  notes:'Gen 1 nostalgia. Solid appreciation but secondary to Misty in collector preference.' },
  'Iris':        { demandScore:80, reprintRisk:20, collectorTier:'blue-chip',  notes:'Growing collector fanbase. Underrated relative to her eventual ceiling.' },
  'Jasmine':     { demandScore:79, reprintRisk:18, collectorTier:'blue-chip',  notes:'Niche but devoted fanbase. Low reprint risk. Good long-term hold.' },
  'Sabrina':     { demandScore:78, reprintRisk:22, collectorTier:'blue-chip',  notes:'Classic Gen 1 trainer. Mystical appeal. Solid but not top tier.' },
  'Erika':       { demandScore:76, reprintRisk:20, collectorTier:'blue-chip',  notes:'Gen 1 trainer. Moderate collector appeal. Lower ceiling than Misty/Cynthia.' },
  'Roxanne':     { demandScore:75, reprintRisk:18, collectorTier:'blue-chip',  notes:'Rising appreciation. Hoenn nostalgia plays into long-term demand.' },

  // ── SECONDARY TRAINERS ────────────────────────────────────────────
  // Real demand but lower ceiling than top tier
  'Giovanni':    { demandScore:74, reprintRisk:35, collectorTier:'solid',      notes:'Villain appeal. Moderate collector interest. Reprint risk from villain-themed sets.' },
  'Lt. Surge':   { demandScore:62, reprintRisk:25, collectorTier:'solid',      notes:'Secondary Gen 1 gym leader. Nostalgic but not top collector priority. Benchmarks should be discounted vs top trainers.' },
  'Koga':        { demandScore:58, reprintRisk:20, collectorTier:'solid',      notes:'Gen 1 trainer. Niche appeal. Lower collector ceiling than frontline trainers.' },
  'Blaine':      { demandScore:56, reprintRisk:20, collectorTier:'solid',      notes:'Gen 1 trainer. Limited collector following vs gym leaders with anime prominence.' },
  'Misty\'s Determination': { demandScore:88, reprintRisk:28, collectorTier:'blue-chip', notes:'Named Misty card — benefits from her full demand premium.' },
  'Iono':        { demandScore:85, reprintRisk:40, collectorTier:'blue-chip',  notes:'Most popular SV trainer. Competitive and collector demand combined. High reprint risk.' },
  'Penny':       { demandScore:72, reprintRisk:30, collectorTier:'solid',      notes:'SV trainer. Moderate collector appeal. Still establishing long-term demand pattern.' },
  'Arven':       { demandScore:68, reprintRisk:32, collectorTier:'solid',      notes:'SV trainer. Moderate appeal. Competitive play drives some demand.' },
  'Briar':       { demandScore:52, reprintRisk:28, collectorTier:'speculative', notes:'New SV trainer. Too early to establish collector tier. Speculative.' },

  // ── BLUE CHIP POKEMON ─────────────────────────────────────────────
  'Greninja':    { demandScore:91, reprintRisk:38, collectorTier:'grail',      notes:'Most popular starter evolution. XY nostalgia. Strong sustained demand.' },
  'Mimikyu':     { demandScore:90, reprintRisk:42, collectorTier:'grail',      notes:'Instantly beloved. Every Mimikyu SIR sells well. Low ceiling risk.' },
  'Lucario':     { demandScore:89, reprintRisk:40, collectorTier:'grail',      notes:'Global fan favourite. Consistent top seller at auction.' },
  'Gardevoir':   { demandScore:87, reprintRisk:55, collectorTier:'blue-chip',  notes:'Strong demand but overprinted in SV era. Multiple competing SIRs.' },
  'Espeon':      { demandScore:87, reprintRisk:35, collectorTier:'blue-chip',  notes:'Popular Eeveelution. Benefits from Eevee fanbase.' },
  'Sylveon':     { demandScore:86, reprintRisk:38, collectorTier:'blue-chip',  notes:'Most popular Kalos Eeveelution. Strong collector following.' },
  'Glaceon':     { demandScore:84, reprintRisk:35, collectorTier:'blue-chip',  notes:'Eeveelution premium. Solid long-term hold.' },
  'Vaporeon':    { demandScore:84, reprintRisk:35, collectorTier:'blue-chip',  notes:'Original Eeveelution nostalgia. Strong floor.' },
  'Jolteon':     { demandScore:82, reprintRisk:33, collectorTier:'blue-chip',  notes:'Eeveelution. Good demand, lower than top Eevee variants.' },
  'Flareon':     { demandScore:80, reprintRisk:32, collectorTier:'blue-chip',  notes:'Eeveelution. Solid collector appeal.' },
  'Leafeon':     { demandScore:80, reprintRisk:32, collectorTier:'blue-chip',  notes:'Eeveelution. Similar appeal to Flareon.' },
  'Ho-Oh':       { demandScore:87, reprintRisk:38, collectorTier:'blue-chip',  notes:'Gen 2 legend. Strong demand. Pairs with Lugia in collector sets.' },
  'Dragonite':   { demandScore:86, reprintRisk:40, collectorTier:'blue-chip',  notes:'Gen 1 pseudo-legend. Nostalgic. Consistent performer.' },
  'Arcanine':    { demandScore:85, reprintRisk:38, collectorTier:'blue-chip',  notes:'Fan favourite. Consistently strong secondary market.' },
  'Snorlax':     { demandScore:85, reprintRisk:42, collectorTier:'blue-chip',  notes:'Universal appeal. Current meta relevance adds demand layer.' },
  'Gyarados':    { demandScore:84, reprintRisk:40, collectorTier:'blue-chip',  notes:'Iconic evolution. Red Gyarados nostalgia drives demand.' },
  'Celebi':      { demandScore:83, reprintRisk:32, collectorTier:'blue-chip',  notes:'Mythical. Lower reprint frequency. Steady appreciation.' },
  'Suicune':     { demandScore:82, reprintRisk:30, collectorTier:'blue-chip',  notes:'Gen 2 legendary. Strong demand from Crystal nostalgia.' },
  'Togekiss':    { demandScore:81, reprintRisk:32, collectorTier:'blue-chip',  notes:'Fan favourite. Cute appeal drives collector interest.' },
  'Ditto':       { demandScore:82, reprintRisk:38, collectorTier:'blue-chip',  notes:'Unique appeal. Quirky collector favourite. Unusual art potential.' },
  'Lapras':      { demandScore:80, reprintRisk:30, collectorTier:'blue-chip',  notes:'Gen 1 nostalgia. Steady appreciation. No reprint saturation.' },
  'Jigglypuff':  { demandScore:80, reprintRisk:40, collectorTier:'blue-chip',  notes:'Mascot-adjacent. Global recognition. Anime nostalgia.' },
  'Alakazam':    { demandScore:79, reprintRisk:30, collectorTier:'blue-chip',  notes:'Gen 1 psychic. Collector nostalgia. Moderate demand.' },
  'Squirtle':    { demandScore:83, reprintRisk:45, collectorTier:'blue-chip',  notes:'Starter nostalgia. Lower demand than Charizard line but solid.' },
  'Bulbasaur':   { demandScore:81, reprintRisk:42, collectorTier:'blue-chip',  notes:'First starter. Nostalgic. Underrated relative to Charizard.' },
  'Latios':      { demandScore:81, reprintRisk:30, collectorTier:'blue-chip',  notes:'Hoenn legend. Pairs with Latias. Moderate collector appeal.' },
  'Latias':      { demandScore:81, reprintRisk:30, collectorTier:'blue-chip',  notes:'Hoenn legend. Pairs with Latios. Strong duo demand.' },
  'Raichu':      { demandScore:80, reprintRisk:38, collectorTier:'blue-chip',  notes:'Pikachu evolution nostalgia. Alolan Raichu drives extra demand.' },

  // ── SOLID PERFORMERS ──────────────────────────────────────────────
  'Garchomp':    { demandScore:85, reprintRisk:35, collectorTier:'blue-chip',  notes:'Most popular pseudo-legend. Cynthia connection adds collector premium.' },
  'Meowscarada': { demandScore:78, reprintRisk:42, collectorTier:'solid',      notes:'Popular SV starter final form. Establishing collector base.' },
  'Koraidon':    { demandScore:72, reprintRisk:38, collectorTier:'solid',      notes:'SV box legendary. Moderate collector appeal. Competitive demand.' },
  'Miraidon':    { demandScore:73, reprintRisk:38, collectorTier:'solid',      notes:'SV box legendary. Slightly higher collector appeal than Koraidon.' },
  'Dragapult':   { demandScore:68, reprintRisk:35, collectorTier:'solid',      notes:'Popular SwSh pseudo-legend. Growing collector base.' },
  'Gholdengo':   { demandScore:68, reprintRisk:38, collectorTier:'solid',      notes:'Competitive darling. Unusual design drives collector interest.' },
  'Regidrago':   { demandScore:70, reprintRisk:32, collectorTier:'solid',      notes:'VSTAR era meta card. Rotated collector trough — potential entry.' },
  'Pidgeot':     { demandScore:65, reprintRisk:30, collectorTier:'solid',      notes:'Gen 1 nostalgia. Moderate collector interest. Pidgeot ex meta relevance.' },
  'Skeledirge':  { demandScore:72, reprintRisk:38, collectorTier:'solid',      notes:'SV fire starter final form. Moderate demand establishing.' },
  'Baxcalibur':  { demandScore:66, reprintRisk:30, collectorTier:'solid',      notes:'SV pseudo-legend. Niche collector following.' },
  'Roaring Moon':{ demandScore:66, reprintRisk:28, collectorTier:'solid',      notes:'Popular Paradox. Growing collector base.' },
  'Terapagos':   { demandScore:58, reprintRisk:35, collectorTier:'speculative', notes:'SV box art legend. Too new to establish pattern. Speculative.' },

  // ── COMPETITIVE SUPPORT (floor held by play demand) ───────────────
  'Pidgeot ex':  { demandScore:64, reprintRisk:32, collectorTier:'solid',      notes:'Search engine. Competitive demand props floor. Collector interest secondary.' },
  'Iron Hands':  { demandScore:62, reprintRisk:28, collectorTier:'solid',      notes:'Competitive card. Floor supported by play demand. Lower collector ceiling.' },
  'Sandy Shocks':{ demandScore:58, reprintRisk:25, collectorTier:'speculative', notes:'Niche competitive. Speculative collector appeal.' },
  'Iron Valiant':{ demandScore:64, reprintRisk:28, collectorTier:'solid',      notes:'Competitive. Growing collector interest from distinctive design.' },
  'Raging Bolt': { demandScore:65, reprintRisk:30, collectorTier:'solid',      notes:'Meta card. Paradox design appeals to collectors.' },
  'Walking Wake':{ demandScore:63, reprintRisk:28, collectorTier:'solid',      notes:'Paradox legend. Moderate collector appeal.' },
};

// Base benchmarks by rarity — character demand score scales these
const BASE_BENCHMARKS = {
  'Special Illustration Rare': { floor:28, fair:72,  ceil:160, peak:320 },
  'Hyper Rare':                { floor:18, fair:48,  ceil:108, peak:220 },
  'Illustration Rare':         { floor:10, fair:28,  ceil:65,  peak:130 },
  'Ultra Rare':                { floor:6,  fair:18,  ceil:42,  peak:85  },
  'Double Rare':               { floor:3,  fair:10,  ceil:24,  peak:48  },
};

// Scale factor from demand score
function getDemandMultiplier(demandScore) {
  if (demandScore >= 95) return 1.55;
  if (demandScore >= 90) return 1.35;
  if (demandScore >= 85) return 1.15;
  if (demandScore >= 78) return 0.95;
  if (demandScore >= 68) return 0.75;
  if (demandScore >= 58) return 0.58;
  return 0.42;
}

function getCharacterProfile(cardName) {
  if (!cardName) return null;
  const lower = cardName.toLowerCase();
  for (const [char, profile] of Object.entries(CHARACTERS)) {
    if (lower.includes(char.toLowerCase())) return { character: char, ...profile };
  }
  return null;
}

function getCharacterBenchmarks(cardName, rarity, isTrainer = false) {
  const base = BASE_BENCHMARKS[rarity] || BASE_BENCHMARKS['Ultra Rare'];
  const profile = getCharacterProfile(cardName);

  // Trainer SIR premium — well documented historically
  const trainerPremium = isTrainer && rarity === 'Special Illustration Rare' ? 1.3 : 1.0;

  let mult;
  let source;
  if (profile) {
    mult = getDemandMultiplier(profile.demandScore);
    source = 'character-specific';
  } else {
    // Unknown character — conservative estimate
    mult = 0.50;
    source = 'generic-estimate';
  }

  const finalMult = mult * trainerPremium;

  return {
    floor: Math.round(base.floor * finalMult),
    fair:  Math.round(base.fair  * finalMult),
    ceil:  Math.round(base.ceil  * finalMult),
    peak:  Math.round(base.peak  * finalMult),
    profile,
    source,
    demandScore: profile?.demandScore || 48,
    reprintRisk: profile?.reprintRisk || 35,
    collectorTier: profile?.collectorTier || 'unknown',
    characterNotes: profile?.notes || 'Character not in database — using conservative generic estimate.',
  };
}

module.exports = { getCharacterProfile, getCharacterBenchmarks, CHARACTERS };
