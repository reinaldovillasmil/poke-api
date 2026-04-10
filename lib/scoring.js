// lib/scoring.js — Investment Scoring Engine v4
//
// PURPOSE: Find cards the market has NOT correctly priced yet.
// Not confirming what everyone knows — finding what nobody is talking about.
//
// FINAL SCORE (0–100) = weighted composite of 7 factors:
//
//  1. Supply Scarcity    22% — pull rate × set print volume × in-print status
//  2. Demand Tier        20% — Pokémon popularity with overprint penalty
//  3. Set Lifecycle      20% — price curve position adjusted for set size/type
//  4. Price Dislocation  22% — how far price deviates from lifecycle-adjusted floor
//  5. Collector Ceiling   8% — realistic upside ceiling based on comps
//  6. Momentum Signal     8% — eBay 7d vs 30d trend (optional, enriches if available)
//
// PLAYABILITY: Applied as a context MODIFIER to factors 3 and 4 — not its own
// weight. This finds hidden gems (recently rotated, underappreciated support cards)
// rather than confirming what competitive players already know.

// ─── PULL RATES ───────────────────────────────────────────────────────────────
// Packs per pull. Source: PokeBeach, Celio's Network, collector spreadsheets.
const BASE_PULL_RATES = {
  'Special Illustration Rare': 72,
  'Hyper Rare':                108,
  'Illustration Rare':          36,
  'Ultra Rare':                 18,
  'Double Rare':                 9,
  'Rare Holo':                   4,
};

// Per-set pull rate overrides with precise data
const SET_PULL_OVERRIDES = {
  'sv3pt5':    { 'Special Illustration Rare': 108 }, // 151 — smaller set
  'sv6pt5':    { 'Special Illustration Rare': 108 }, // Shrouded Fable — mini
  'sv7':       { 'Special Illustration Rare': 72, 'Hyper Rare': 90 },
  'sv8pt5':    { 'Special Illustration Rare': 54 },  // Prismatic Evolutions
  'swsh12pt5': { 'Special Illustration Rare': 60 },  // Crown Zenith
};

// Estimated box print volumes — proxy for total cards in circulation.
// Source: industry estimates, distributor data, collector community analysis.
// Lower = fewer cards ever exist = higher scarcity.
const SET_PRINT_VOLUME = {
  // SV era
  'sv1':      'massive',  // SV Base — enormous launch
  'sv2':      'large',    // Paldea Evolved
  'sv3':      'large',    // Obsidian Flames
  'sv3pt5':   'medium',   // 151 — specialty, controlled
  'sv4':      'large',    // Paradox Rift
  'sv4pt5':   'small',    // Paldean Fates
  'sv5':      'large',    // Temporal Forces
  'sv6':      'large',    // Twilight Masquerade
  'sv6pt5':   'small',    // Shrouded Fable — mini set
  'sv7':      'medium',   // Stellar Crown — smallest main since 2018
  'sv7pt5':   'small',    // Surging Sparks promo
  'sv8':      'large',    // Surging Sparks
  'sv8pt5':   'small',    // Prismatic Evolutions — chase/specialty
  // SWSH era (all now OOP)
  'swsh1':    'large',
  'swsh4':    'large',    // Vivid Voltage
  'swsh7':    'large',    // Evolving Skies
  'swsh9':    'medium',   // Brilliant Stars
  'swsh12':   'large',    // Silver Tempest
  'swsh12pt5':'small',    // Crown Zenith
};

const VOLUME_MULTIPLIER = { massive:0.55, large:0.75, medium:0.90, small:1.0 };

function getSupplyScore(rarity, setId, isOutOfPrint) {
  const overrides = SET_PULL_OVERRIDES[setId] || {};
  const packsPerPull = overrides[rarity] || BASE_PULL_RATES[rarity] || 20;

  // Base pull score: rarer pull = higher
  const pullScore = Math.min(100, 35 + (packsPerPull / 108) * 62);

  // Adjust for print volume: smaller sets = fewer cards exist
  const volume = SET_PRINT_VOLUME[setId] || 'large';
  const volMult = VOLUME_MULTIPLIER[volume] || 0.75;
  const adjusted = pullScore * (0.70 + volMult * 0.30);

  // OOP bonus: once a set stops printing, supply only decreases
  const oopBonus = isOutOfPrint ? 8 : 0;

  return Math.min(100, Math.round(adjusted + oopBonus));
}

// ─── POKÉMON DEMAND TIERS ─────────────────────────────────────────────────────
// Tier 1 (90–99): Blue chips. Floor never drops. Guaranteed long-term appreciation.
// Tier 2 (75–89): Strong demand. Large fanbase. Solid multi-year holds.
// Tier 3 (60–74): Niche demand. Slower appreciation. Needs other factors to shine.
// Tier 4 (40–59): Speculative. New or low recognition Pokémon.
const POKEMON_TIERS = {
  // Tier 1 — Absolute blue chips
  'Charizard':99,'Pikachu':99,'Mewtwo':97,'Eevee':96,'Umbreon':95,
  'Mew':95,'Greninja':92,'Gengar':92,'Mimikyu':91,'Lugia':91,
  'Cynthia':91,'Lucario':90,'Rayquaza':90,

  // Tier 2 — Strong performers
  'Gardevoir':88,'Espeon':88,'Sylveon':87,'Ho-Oh':87,'Dragonite':87,
  'Arcanine':86,'Vaporeon':86,'Snorlax':86,'Glaceon':85,'Lillie':85,
  'Gyarados':84,'Celebi':84,'Squirtle':83,'Suicune':83,'Ditto':83,
  'Bulbasaur':82,'Leafeon':82,'Jolteon':82,'Latios':82,'Latias':82,
  'Togekiss':82,'Raichu':82,'Lapras':81,'Jigglypuff':80,'Alakazam':80,
  'Flareon':80,'N':89,'Misty':87,'Serena':84,'Brock':82,
  'Meowscarada':78,'Tapu Koko':78,'Tapu Lele':75,'Iris':76,'Roxanne':75,

  // Tier 3 — Niche but solid
  'Garchomp':86,'Skeledirge':74,'Quaquaval':72,'Baxcalibur':68,
  'Koraidon':72,'Miraidon':73,'Gholdengo':70,'Iron Valiant':65,
  'Roaring Moon':67,'Sandy Shocks':60,'Iron Hands':62,
  'Gouging Fire':65,'Raging Bolt':66,'Walking Wake':64,
  'Regidrago':70,'Snorlax':86,'Dragapult':68,'Pidgeot':65,

  // Tier 4 — Speculative
  'Terapagos':55,'Hydrapple':52,'Archaludon':50,'Briar':45,
};

// Cards heavily overprinted across many sets in the same era.
// Each additional SIR/SAR competes for the same collector dollar.
const OVERPRINT_PENALTY = {
  'Charizard':14, // 4+ SIRs in SV alone
  'Pikachu':10,
  'Eevee':7,
  'Mewtwo':6,
  'Gardevoir':5,
  'Umbreon':4,
};

function getDemandScore(cardName) {
  let score = 52;
  for (const [p, t] of Object.entries(POKEMON_TIERS)) {
    if (cardName.toLowerCase().includes(p.toLowerCase())) { score = t; break; }
  }
  for (const [p, pen] of Object.entries(OVERPRINT_PENALTY)) {
    if (cardName.toLowerCase().includes(p.toLowerCase())) {
      score = Math.max(48, score - pen); break;
    }
  }
  return score;
}

// ─── SET LIFECYCLE ────────────────────────────────────────────────────────────
// The price curve is well documented across dozens of sets:
//
//  0–30d:    Hype premium. Retail/secondary markup. Do NOT buy.
//  1–3mo:    Declining. Supply flooding market. Wait.
//  3–9mo:    Trough zone. Supply peaked. Price at or near floor.  ← BUY WINDOW
//  9–18mo:   Recovery. Supply tightening. Smart money accumulating.
//  18–30mo:  Pre-OOP. Price rising as boxes sell through.
//  30mo+:    Out of print. Supply only decreases from here.
//
// Mini-sets and specialty sets move through this curve faster
// because they have lower print runs and sell out sooner.

function getLifecycleScore(releaseDate, setId, isOutOfPrint) {
  if (!releaseDate) return 60;
  const ageDays = (Date.now() - new Date(releaseDate).getTime()) / 86400000;

  // Speed factor: mini/specialty sets cycle faster
  const vol = SET_PRINT_VOLUME[setId] || 'large';
  const speed = vol === 'small' ? 1.5 : vol === 'medium' ? 1.2 : 1.0;
  const adj = ageDays * speed;

  if (isOutOfPrint) {
    // OOP sets: past the trough, on appreciation curve
    if (adj < 900)  return 88;
    if (adj < 1460) return 85;
    return 78; // Fully matured — harder to find deals
  }

  if (adj < 25)   return 38;  // Release week — hype price, avoid
  if (adj < 55)   return 46;  // Weeks 4–8 — price falling, wait
  if (adj < 100)  return 60;  // Months 2–3 — approaching trough
  if (adj < 200)  return 82;  // Months 3–7 — IN the trough, BUY
  if (adj < 365)  return 90;  // Months 7–12 — trough ending, strong buy
  if (adj < 550)  return 88;  // Year 1–1.5 — recovery underway
  if (adj < 730)  return 85;  // Year 1.5–2 — approaching OOP
  return 82;
}

function getLifecycleLabel(releaseDate, setId, isOutOfPrint) {
  if (!releaseDate) return 'Unknown';
  const ageDays = (Date.now() - new Date(releaseDate).getTime()) / 86400000;
  const vol = SET_PRINT_VOLUME[setId] || 'large';
  const speed = vol === 'small' ? 1.5 : vol === 'medium' ? 1.2 : 1.0;
  const adj = ageDays * speed;
  if (isOutOfPrint) return adj > 1460 ? 'Fully Matured' : 'Out of Print ↑';
  if (adj < 25)   return 'Release Week — Avoid';
  if (adj < 55)   return 'Price Dropping — Wait';
  if (adj < 100)  return 'Approaching Trough — Watch';
  if (adj < 200)  return '🟢 BUY ZONE — Trough';
  if (adj < 365)  return '🟢 Strong Buy — Recovery Starting';
  if (adj < 550)  return 'Recovery Underway';
  if (adj < 730)  return 'Approaching Out of Print';
  return 'Late Stage';
}

// ─── OUT OF PRINT DETECTION ───────────────────────────────────────────────────
// A set is OOP when it's been pulled from distribution.
// Source: TCG rotation announcements, Pokémon Company news, community tracking.
const OOP_SETS = new Set([
  // All SWSH era
  'swsh1','swsh2','swsh3','swsh35','swsh4','swsh45','swsh5','swsh6',
  'swsh7','swsh8','swsh9','swsh10','swsh11','swsh12','swsh12pt5',
  // Early SV (approaching/at OOP)
  'sv1','sv2','sv3',
]);

function isSetOOP(setId) { return OOP_SETS.has(setId); }

// ─── PLAYABILITY CONTEXT ──────────────────────────────────────────────────────
// NOT a direct scoring factor — a MODIFIER applied to lifecycle and price scores.
// Goal: surface hidden gems, not confirm what everyone knows.
//
// Categories:
//  ROTATED     — Was meta, just rotated out. Price trough = opportunity.
//               Modifier: +10 lifecycle (collector curve starting, competitive gone)
//  SUPPORT     — Competitive support card (trainer, energy) not the flagship.
//               Modifier: +8 price dislocation (floor supported by play demand)
//  META        — Currently meta flagship. Already priced in. No bonus.
//               But we track it to apply overprint awareness.
//  FRINGE      — Sees occasional play, not dominant. Moderate floor.
//               Modifier: +4 price dislocation
//  NONE        — Never competitive. No modifier.
//               Modifier: -5 price dislocation (weaker floor)

const PLAYABILITY = {
  // Recently rotated — WAS competitive, now in collector trough = hidden gem signal
  // These are the cards nobody is talking about right now
  'Lugia VSTAR':        'ROTATED',
  'Regidrago VSTAR':    'ROTATED',
  'Mew VMAX':           'ROTATED',
  'Genesect V':         'ROTATED',
  'Lost City':          'ROTATED',
  'Comfey':             'ROTATED',
  'Sableye':            'ROTATED',
  "Radiant Greninja":   'ROTATED',
  'Arceus VSTAR':       'ROTATED',
  'Duraludon VMAX':     'ROTATED',
  'Umbreon VMAX':       'ROTATED', // huge collector + former meta
  'Ice Rider Calyrex':  'ROTATED',
  'Shadow Rider Calyrex':'ROTATED',
  'Sylveon VMAX':       'ROTATED',

  // Currently meta flagship — already priced in, no hidden gem here
  'Gardevoir ex':       'META',
  'Charizard ex':       'META',
  'Dragapult ex':       'META',
  'Raging Bolt ex':     'META',
  'Regidrago ex':       'META', // new meta
  'Terapagos ex':       'META',
  'Snorlax':            'META', // stall decks

  // Support cards — competitive floor holding price up, collectors haven't noticed
  'Iono':               'SUPPORT',
  'Boss\'s Orders':     'SUPPORT',
  'Professor\'s Research':'SUPPORT',
  'Ultra Ball':         'SUPPORT',
  'Nest Ball':          'SUPPORT',
  'Arven':              'SUPPORT',
  'Penny':              'SUPPORT',
  'Counter Catcher':    'SUPPORT',
  'Earthen Vessel':     'SUPPORT',
  'Pidgeot ex':         'SUPPORT', // search engine

  // Fringe — sees some play
  'Klawf':              'FRINGE',
  'Brute Bonnet':       'FRINGE',
  'Iron Hands ex':      'FRINGE',
  'Sandy Shocks ex':    'FRINGE',
  'Roaring Moon ex':    'FRINGE',
};

function getPlayabilityContext(cardName) {
  const lower = cardName.toLowerCase();
  for (const [card, status] of Object.entries(PLAYABILITY)) {
    if (lower.includes(card.toLowerCase())) return status;
  }
  return 'NONE';
}

// Modifier returns { lifecycleMod, priceMod, label }
function getPlayabilityModifier(context) {
  switch (context) {
    case 'ROTATED':  return { lifecycleMod: +10, priceMod: +5,  label: 'Recently Rotated 🔄' };
    case 'SUPPORT':  return { lifecycleMod: 0,   priceMod: +10, label: 'Competitive Support ⚙️' };
    case 'META':     return { lifecycleMod: 0,   priceMod: 0,   label: 'Currently Meta' };
    case 'FRINGE':   return { lifecycleMod: 0,   priceMod: +4,  label: 'Fringe Playable' };
    default:         return { lifecycleMod: 0,   priceMod: -5,  label: null };
  }
}

// ─── PRICE DISLOCATION ────────────────────────────────────────────────────────
// Core alpha signal: is this card cheap relative to where it SHOULD be
// given its lifecycle stage and comparable cards?
//
// We use lifecycle-adjusted benchmarks — a card at 6 months should be priced
// near its floor, not its ceiling. If it's below the lifecycle-adjusted floor,
// that's a dislocation = buying opportunity.
//
// Benchmarks built from 2022–2024 historical data across 40+ comparable cards.
function getBenchmarks(rarity, demandScore, isTrainer) {
  const trainerBonus = isTrainer ? 1.40 : 1.0;
  const tier = demandScore >= 90 ? 't1' : demandScore >= 78 ? 't2' : demandScore >= 60 ? 't3' : 't4';

  const B = {
    'Special Illustration Rare': {
      t1: { floor:65,  fair:140, ceil:320, peak:600 },
      t2: { floor:30,  fair:78,  ceil:175, peak:350 },
      t3: { floor:14,  fair:38,  ceil:90,  peak:180 },
      t4: { floor:8,   fair:20,  ceil:50,  peak:100 },
    },
    'Hyper Rare': {
      t1: { floor:38,  fair:90,  ceil:200, peak:400 },
      t2: { floor:20,  fair:52,  ceil:110, peak:220 },
      t3: { floor:9,   fair:24,  ceil:55,  peak:110 },
      t4: { floor:5,   fair:14,  ceil:32,  peak:65  },
    },
    'Illustration Rare': {
      t1: { floor:24,  fair:58,  ceil:130, peak:260 },
      t2: { floor:11,  fair:30,  ceil:68,  peak:135 },
      t3: { floor:5,   fair:16,  ceil:38,  peak:75  },
      t4: { floor:3,   fair:9,   ceil:22,  peak:44  },
    },
    'Ultra Rare': {
      t1: { floor:14,  fair:34,  ceil:78,  peak:150 },
      t2: { floor:7,   fair:19,  ceil:44,  peak:88  },
      t3: { floor:3,   fair:11,  ceil:26,  peak:52  },
      t4: { floor:2,   fair:6,   ceil:15,  peak:30  },
    },
  };

  const b = B[rarity]?.[tier] || { floor:6, fair:18, ceil:45, peak:90 };
  return {
    floor: Math.round(b.floor * trainerBonus),
    fair:  Math.round(b.fair  * trainerBonus),
    ceil:  Math.round(b.ceil  * trainerBonus),
    peak:  Math.round(b.peak  * trainerBonus),
  };
}

function getPriceDislocScore(price, bench, lifecycleScore, playabilityPriceMod) {
  if (!price || price <= 0) return null;

  // Lifecycle-adjusted floor: early in lifecycle the "fair" floor is lower
  // because the card hasn't reached its long-term equilibrium yet
  const lcFactor = lifecycleScore >= 88 ? 1.0   // mature/OOP — full floor applies
                 : lifecycleScore >= 78 ? 0.90   // buy zone — 90% of floor
                 : lifecycleScore >= 60 ? 0.75   // approaching trough
                 : 0.60;                          // early/new — floor still forming

  const adjFloor = bench.floor * lcFactor;
  const adjFair  = bench.fair  * lcFactor;

  // Raw dislocation: how far below lifecycle-adjusted benchmarks
  let score;
  if (price <= adjFloor * 0.60) score = 100;  // Massively undervalued
  else if (price <= adjFloor * 0.80) score = 95;
  else if (price <= adjFloor)        score = 88;  // Below adjusted floor — strong buy
  else if (price <= adjFair  * 0.70) score = 76;  // Good entry
  else if (price <= adjFair)         score = 62;  // Fair value — neutral
  else if (price <= adjFair  * 1.20) score = 46;  // Slightly rich
  else if (price <= bench.ceil* 0.70) score = 28; // Expensive
  else score = 12;                                 // Near ceiling — avoid

  // Apply playability modifier (hidden gem signals)
  return Math.min(100, Math.max(0, score + playabilityPriceMod));
}

// ─── COLLECTOR CEILING ────────────────────────────────────────────────────────
// How high can this card realistically go based on:
// - Comparable cards at peak (documented sales data)
// - Pokémon's overall ceiling in the hobby
// - Rarity tier ceiling
// Expressed as a 0–100 score representing ceiling potential
function getCeilingScore(rarity, demandScore, isTrainer) {
  const bench = getBenchmarks(rarity, demandScore, isTrainer);
  // Cards with higher documented peaks relative to their current floor
  // have more ceiling headroom
  const headroom = bench.peak / Math.max(bench.floor, 1);

  if (headroom >= 8)  return 96; // Enormous ceiling (e.g. Charizard SIR, Trainer SIRs)
  if (headroom >= 5)  return 85;
  if (headroom >= 3)  return 72;
  if (headroom >= 2)  return 58;
  return 44;
}

// ─── MOMENTUM ─────────────────────────────────────────────────────────────────
// eBay 7d vs 30d trend — enriches score when available from /api/prices
// Rising momentum on a hidden gem = confirmation signal
// Falling momentum on an already-good card = better entry point
function getMomentumScore(ebayData) {
  if (!ebayData || !ebayData.avg7 || !ebayData.avg30) return 50; // neutral
  const trendPct = ebayData.trendPct || 0;

  // For hidden gems: flat or slightly falling is actually GOOD
  // (means nobody has noticed yet)
  // Sharp falling is a warning. Sharp rising means you missed it.
  if (trendPct > 25)   return 30;  // Already running — late
  if (trendPct > 10)   return 48;  // Gaining attention — still ok
  if (trendPct > -10)  return 72;  // Flat — ideal hidden gem zone
  if (trendPct > -25)  return 80;  // Pulling back — entry opportunity
  return 40;                        // Sharp drop — investigate why
}

// ─── TRAINER MULTIPLIER ───────────────────────────────────────────────────────
// Applied to final score AFTER composite — not a factor weight.
// Trainer SIRs have documented 5–50x appreciation patterns.
// N Full Art: $8 → $400. Misty SAR: $15 → $300. Cynthia SAR: still early.
const HIGH_TIER_TRAINERS = ['cynthia','misty','lillie','serena','n ','brock','iris','sabrina','erika','giovanni','jasmine'];

function getTrainerMultiplier(supertype, cardName, rarity) {
  if (supertype !== 'Trainer') return 1.0;
  if (rarity === 'Special Illustration Rare') {
    if (HIGH_TIER_TRAINERS.some(t => cardName.toLowerCase().includes(t))) return 1.20;
    return 1.12;
  }
  if (rarity === 'Illustration Rare') return 1.06;
  return 1.02;
}

// ─── MASTER SCORE ─────────────────────────────────────────────────────────────
function scoreCard({ name, rarity, setId, releaseDate, printedTotal, price, supertype, ebayData }) {
  const isOOP       = isSetOOP(setId);
  const isTrainer   = supertype === 'Trainer';
  const demandScore = getDemandScore(name);
  const supplyScore = getSupplyScore(rarity, setId, isOOP);
  const playCtx     = getPlayabilityContext(name);
  const playMod     = getPlayabilityModifier(playCtx);

  // Lifecycle with playability modifier
  const rawLifecycle  = getLifecycleScore(releaseDate, setId, isOOP);
  const lifecycleScore = Math.min(100, rawLifecycle + playMod.lifecycleMod);

  const bench           = getBenchmarks(rarity, demandScore, isTrainer);
  const priceDislocScore = getPriceDislocScore(price, bench, lifecycleScore, playMod.priceMod);
  const ceilingScore    = getCeilingScore(rarity, demandScore, isTrainer);
  const momentumScore   = getMomentumScore(ebayData);
  const trainerMult     = getTrainerMultiplier(supertype, name, rarity);
  const hasPrice        = price > 0;

  const upside = hasPrice ? Math.round(((bench.fair - price) / price) * 100) : null;

  // Weighted composite
  let raw;
  if (!hasPrice) {
    // No price — redistribute weights, flag clearly
    raw = supplyScore   * 0.30
        + demandScore   * 0.28
        + lifecycleScore* 0.28
        + ceilingScore  * 0.14;
  } else {
    raw = supplyScore       * 0.22
        + demandScore       * 0.20
        + lifecycleScore    * 0.20
        + priceDislocScore  * 0.22
        + ceilingScore      * 0.08
        + momentumScore     * 0.08;
  }

  // Apply trainer multiplier (post-composite, capped at 100)
  const total = Math.min(100, Math.max(0, Math.round(raw * trainerMult)));

  // Hidden gem flag: high score + nobody talking about it
  const isHiddenGem = total >= 70
    && (playCtx === 'ROTATED' || playCtx === 'SUPPORT' || playCtx === 'NONE')
    && (momentumScore >= 70)  // flat/falling momentum = under the radar
    && hasPrice
    && price < bench.fair;

  return {
    total,
    hasPrice,
    isHiddenGem,
    playabilityContext: playCtx,
    playabilityLabel: playMod.label,
    breakdown: {
      supplyScore,
      demandScore,
      lifecycleScore,
      priceDislocScore: priceDislocScore ?? 'N/A',
      ceilingScore,
      momentumScore: hasPrice ? momentumScore : 'N/A',
      trainerBonus: trainerMult > 1 ? `+${Math.round((trainerMult-1)*100)}%` : null,
    },
    benchmarks: bench,
    upside,
    lifecycleLabel: getLifecycleLabel(releaseDate, setId, isOOP),
    recommendation: getRecommendation(total, lifecycleScore, priceDislocScore, hasPrice, isHiddenGem, playCtx),
  };
}

function getRecommendation(total, lc, priceDisloc, hasPrice, isHiddenGem, playCtx) {
  if (!hasPrice) return {
    label: 'No Price Data',
    detail: 'Not tracked on TCGPlayer. Check eBay sold listings to establish real market price before buying.',
    color: 'muted',
  };
  if (lc < 46) return {
    label: 'Wait — Too New',
    detail: 'Set is in its release window. Price will likely drop 15–40% over the next 2–4 months. Be patient.',
    color: 'amber',
  };
  if (priceDisloc !== null && priceDisloc < 28) return {
    label: 'Avoid — Overpriced',
    detail: 'Current price is well above lifecycle-adjusted fair value. Risk/reward does not favor buying here.',
    color: 'fire',
  };
  if (isHiddenGem) return {
    label: '💎 Hidden Gem',
    detail: `Score ${total}/100. Underappreciated by the market right now${playCtx === 'ROTATED' ? ' — competitive demand gone, collector demand just starting' : playCtx === 'SUPPORT' ? ' — competitive floor holding price while collectors haven\'t arrived yet' : ''}. Strong asymmetric upside.`,
    color: 'purple',
  };
  if (total >= 85) return { label: '🔥 Strong Buy',  detail: 'All signals aligned. Buy now, hold 12–24 months.', color: 'fire' };
  if (total >= 75) return { label: '✅ Buy',          detail: 'Good entry. Lifecycle and price signals favorable.', color: 'green' };
  if (total >= 65) return { label: '👀 Accumulate',   detail: 'Solid long-term hold. Buy on dips, not highs.', color: 'green' };
  if (total >= 55) return { label: '⏳ Watch',        detail: 'Some signals positive. Wait for price to come down.', color: 'blue' };
  return               { label: 'Pass',              detail: 'Multiple factors weak. Better opportunities in the screener.', color: 'muted' };
}

module.exports = {
  scoreCard,
  getBenchmarks,
  getDemandScore,
  getSupplyScore,
  getLifecycleLabel,
  isSetOOP,
  POKEMON_TIERS,
};