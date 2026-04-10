// lib/scoring.js
// Investment scoring engine v3 — final version.
//
// SCORE (0–100) weighted composite of 6 signals:
//   1. Pull Rate Score       (20%) — actual pack odds per set
//   2. Pokémon Demand Score  (22%) — fan tier + overprint penalty
//   3. Set Lifecycle Score   (25%) — price curve position, adjusted for set size
//   4. Price vs Floor Score  (20%) — current price vs real market benchmarks
//   5. Print Run Risk Score  (8%)  — small sets appreciate faster
//   6. Upside Score          (5%)  — distance from fair value

// ─── PULL RATES ───────────────────────────────────────────────────────────────
const PULL_RATES = {
  'Special Illustration Rare': 72,
  'Hyper Rare':                108,
  'Illustration Rare':          36,
  'Ultra Rare':                 18,
  'Double Rare':                 9,
  'Rare Holo':                   4,
};

const SET_PULL_OVERRIDES = {
  'sv3pt5':   { 'Special Illustration Rare': 108 },
  'sv6pt5':   { 'Special Illustration Rare': 108 },
  'sv7':      { 'Special Illustration Rare': 72, 'Hyper Rare': 90 },
  'sv8pt5':   { 'Special Illustration Rare': 54 },
  'swsh12pt5':{ 'Special Illustration Rare': 60 },
};

function getPullScore(rarity, setId) {
  const overrides = SET_PULL_OVERRIDES[setId] || {};
  const packsPerPull = overrides[rarity] || PULL_RATES[rarity] || 20;
  return Math.min(100, Math.round(40 + (packsPerPull / 108) * 58));
}

// ─── POKÉMON DEMAND TIERS ─────────────────────────────────────────────────────
const POKEMON_TIERS = {
  'Charizard':99,'Pikachu':99,'Mewtwo':97,'Eevee':96,'Umbreon':95,
  'Mew':95,'Greninja':92,'Mimikyu':91,'Lugia':91,'Cynthia':91,
  'Gengar':92,'Lucario':90,'Rayquaza':90,
  'Gardevoir':88,'Espeon':88,'Sylveon':87,'Ho-Oh':87,'Dragonite':87,
  'Arcanine':86,'Vaporeon':86,'Snorlax':86,'Glaceon':85,'Lillie':85,
  'Gyarados':84,'Celebi':84,'Squirtle':83,'Suicune':83,'Ditto':83,
  'Bulbasaur':82,'Leafeon':82,'Jolteon':82,'Latios':82,'Latias':82,
  'Togekiss':82,'Raichu':82,'Lapras':81,'Jigglypuff':80,'Alakazam':80,
  'Flareon':80,'N':89,'Misty':87,'Serena':84,'Brock':82,
  'Meowscarada':78,'Tapu Koko':78,'Tapu Lele':75,'Iris':76,
  'Garchomp':86,'Skeledirge':74,'Quaquaval':72,'Baxcalibur':68,
  'Koraidon':72,'Miraidon':73,'Gholdengo':70,'Roxanne':75,
  'Iron Valiant':65,'Roaring Moon':67,'Sandy Shocks':60,
  'Iron Hands':62,'Gouging Fire':65,'Raging Bolt':66,'Walking Wake':64,
  'Terapagos':55,'Hydrapple':52,'Archaludon':50,
};

// Heavily overprinted Pokémon — each individual SIR appreciates slower
// because collectors have too many versions to choose from
const OVERPRINT_PENALTY = {
  'Charizard':12,
  'Pikachu':8,
  'Eevee':6,
  'Mewtwo':5,
  'Gardevoir':4,
};

function getPokemonScore(cardName) {
  let score = 52;
  for (const [pokemon, tier] of Object.entries(POKEMON_TIERS)) {
    if (cardName.toLowerCase().includes(pokemon.toLowerCase())) {
      score = tier; break;
    }
  }
  for (const [pokemon, penalty] of Object.entries(OVERPRINT_PENALTY)) {
    if (cardName.toLowerCase().includes(pokemon.toLowerCase())) {
      score = Math.max(50, score - penalty); break;
    }
  }
  return score;
}

// ─── TRAINER BONUS ────────────────────────────────────────────────────────────
// Trainer SIRs are historically the highest appreciating cards in the TCG.
// N Full Art: $8 → $400+. Misty SAR: $15 → $300+. Real documented pattern.
const HIGH_TIER_TRAINERS = ['cynthia','misty','lillie','serena','n ','brock','iris','sabrina','erika','giovanni'];

function getTrainerMultiplier(supertype, cardName, rarity) {
  if (supertype !== 'Trainer') return 1.0;
  if (rarity !== 'Special Illustration Rare') return 1.05;
  if (HIGH_TIER_TRAINERS.some(t => cardName.toLowerCase().includes(t))) return 1.18;
  return 1.10;
}

// ─── SET LIFECYCLE MODEL ──────────────────────────────────────────────────────
// Price curve: Release high → drops 1-3mo → trough 3-9mo → recovery → OOP appreciation
// Mini-sets move through the curve faster (sell out sooner, go OOP quicker)
function getSetLifecycleScore(releaseDate, setSize) {
  if (!releaseDate) return 60;
  const ageDays = (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
  const speedMult = setSize && setSize < 100 ? 1.4 : setSize && setSize < 160 ? 1.15 : 1.0;
  const adj = ageDays * speedMult;
  if (adj < 30)   return 40;
  if (adj < 60)   return 48;
  if (adj < 120)  return 62;
  if (adj < 270)  return 82;
  if (adj < 450)  return 92;
  if (adj < 730)  return 90;
  if (adj < 1095) return 85;
  return 78;
}

function getSetLifecycleLabel(releaseDate, setSize) {
  if (!releaseDate) return 'Unknown';
  const ageDays = (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
  const speedMult = setSize && setSize < 100 ? 1.4 : setSize && setSize < 160 ? 1.15 : 1.0;
  const adj = ageDays * speedMult;
  if (adj < 30)   return 'Just Released — Avoid';
  if (adj < 60)   return 'Price Dropping — Wait';
  if (adj < 120)  return 'Watch — Trough Approaching';
  if (adj < 270)  return '🟢 BUY ZONE';
  if (adj < 450)  return '🟢 Strong Buy';
  if (adj < 730)  return 'Approaching Out of Print';
  if (adj < 1095) return 'Out of Print';
  return 'Fully Matured';
}

// ─── PRINT RUN RISK ───────────────────────────────────────────────────────────
const SET_SIZE_SCORES = {
  'sv6pt5':95,'sv3pt5':90,'sv8pt5':88,'swsh12pt5':88,
  'sv7':74,'sv8':70,'sv5':68,'sv4':65,'sv3':65,
  'sv2':60,'sv1':58,'swsh12':75,
};

function getPrintRunScore(setId, printedTotal) {
  if (SET_SIZE_SCORES[setId]) return SET_SIZE_SCORES[setId];
  if (!printedTotal) return 65;
  if (printedTotal < 80)  return 92;
  if (printedTotal < 150) return 78;
  if (printedTotal < 200) return 68;
  return 60;
}

// ─── PRICE vs FLOOR ───────────────────────────────────────────────────────────
// Based on 2022–2024 TCGPlayer/eBay historical data for real observed floors
function getBenchmark(rarity, pokemonScore, isTrainer) {
  const trainerBonus = isTrainer ? 1.35 : 1.0;
  const tier = pokemonScore >= 90 ? 'tier1' : pokemonScore >= 78 ? 'tier2' : 'tier3';
  const benchmarks = {
    'Special Illustration Rare': { tier1:{floor:60,fair:130,ceil:300}, tier2:{floor:28,fair:72,ceil:160}, tier3:{floor:12,fair:35,ceil:80} },
    'Hyper Rare':                { tier1:{floor:35,fair:85,ceil:180},  tier2:{floor:18,fair:48,ceil:100}, tier3:{floor:8,fair:22,ceil:50} },
    'Illustration Rare':         { tier1:{floor:22,fair:55,ceil:120},  tier2:{floor:10,fair:28,ceil:60},  tier3:{floor:5,fair:15,ceil:35} },
    'Ultra Rare':                { tier1:{floor:12,fair:30,ceil:70},   tier2:{floor:6,fair:18,ceil:40},   tier3:{floor:3,fair:10,ceil:22} },
  };
  const b = benchmarks[rarity]?.[tier] || { floor:6, fair:18, ceil:45 };
  return {
    floor: Math.round(b.floor * trainerBonus),
    fair:  Math.round(b.fair  * trainerBonus),
    ceil:  Math.round(b.ceil  * trainerBonus),
  };
}

function getPriceVsFloorScore(price, bench) {
  if (!price || price <= 0) return null;
  if (price <= bench.floor * 0.65) return 98;
  if (price <= bench.floor)         return 90;
  if (price <= bench.fair  * 0.70)  return 78;
  if (price <= bench.fair)          return 64;
  if (price <= bench.fair  * 1.25)  return 48;
  if (price <= bench.ceil  * 0.75)  return 30;
  return 15;
}

function getUpsideScore(price, bench) {
  if (!price || price <= 0) return 50;
  const upside = ((bench.fair - price) / price) * 100;
  return Math.min(100, Math.max(0, Math.round(50 + upside * 0.5)));
}

// ─── MASTER SCORE ─────────────────────────────────────────────────────────────
function scoreCard({ name, rarity, setId, releaseDate, printedTotal, price, supertype }) {
  const pokemonScore   = getPokemonScore(name);
  const pullScore      = getPullScore(rarity, setId);
  const lifecycleScore = getSetLifecycleScore(releaseDate, printedTotal);
  const printRunScore  = getPrintRunScore(setId, printedTotal);
  const isTrainer      = supertype === 'Trainer';
  const trainerMult    = getTrainerMultiplier(supertype, name, rarity);
  const bench          = getBenchmark(rarity, pokemonScore, isTrainer);
  const priceScore     = getPriceVsFloorScore(price, bench);
  const upsideScore    = getUpsideScore(price, bench);
  const hasPrice       = price > 0;
  const upside         = hasPrice ? Math.round(((bench.fair - price) / price) * 100) : null;

  // No price data — score on everything else, weight redistributed
  let raw;
  if (!hasPrice) {
    raw = pullScore * 0.28 + pokemonScore * 0.30 + lifecycleScore * 0.30 + printRunScore * 0.12;
  } else {
    raw = pullScore      * 0.20
        + pokemonScore   * 0.22
        + lifecycleScore * 0.25
        + priceScore     * 0.20
        + printRunScore  * 0.08
        + upsideScore    * 0.05;
  }

  const total = Math.min(100, Math.max(0, Math.round(raw * trainerMult)));

  return {
    total,
    hasPrice,
    breakdown: {
      pullScore,
      pokemonScore,
      lifecycleScore,
      priceScore: priceScore ?? 'N/A',
      printRunScore,
      upsideScore,
      trainerBonus: trainerMult > 1 ? `+${Math.round((trainerMult - 1) * 100)}%` : null,
    },
    benchmarks:     bench,
    upside,
    lifecycleLabel: getSetLifecycleLabel(releaseDate, printedTotal),
    recommendation: getRecommendation(total, lifecycleScore, priceScore, hasPrice),
  };
}

function getRecommendation(total, lifecycleScore, priceScore, hasPrice) {
  if (!hasPrice)                           return { label: 'No Price Data',  detail: 'No TCGPlayer market price found. Check eBay sold listings manually before buying.' };
  if (lifecycleScore < 48)                 return { label: 'Wait',           detail: 'Set is too new — price will drop in the next 2–4 months. Be patient.' };
  if (priceScore !== null && priceScore < 30) return { label: 'Avoid',      detail: 'Current price is well above fair value. Not a good entry point.' };
  if (total >= 85) return { label: '🔥 Strong Buy',  detail: 'All signals align. Buy now and hold 12–24 months.' };
  if (total >= 75) return { label: '✅ Buy',          detail: 'Good entry point. Set lifecycle and price are favorable.' };
  if (total >= 65) return { label: '👀 Accumulate',   detail: 'Solid long-term hold. Buy on dips rather than chasing.' };
  if (total >= 55) return { label: '⏳ Watch',        detail: 'Some signals positive. Wait for a better price entry.' };
  return                 { label: 'Pass',             detail: 'Score too low across multiple factors. Better opportunities exist.' };
}

module.exports = { scoreCard, getBenchmark, getPokemonScore, getPullScore, getSetLifecycleLabel, POKEMON_TIERS };