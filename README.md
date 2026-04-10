# PokeInvest Backend v2

Investment-grade Pokémon card scoring API. Hosted free on Vercel.

## Endpoints

| Method | Endpoint | Description | Cache |
|--------|----------|-------------|-------|
| GET | `/api/cards` | All secret rares, scored + filtered | 30 min |
| GET | `/api/search?q=Charizard` | Search any card by name | 15 min |
| GET | `/api/score?id=sv7-169` | Full score breakdown for one card + live eBay | 1 hr |
| GET | `/api/prices?q=Umbreon+ex+...` | Real eBay sold price history | 2 hr |
| GET | `/api/trending` | Cards with 7d vs 30d price momentum | 4 hr |
| GET | `/api/watchlist?uid=xxx` | Get watchlist (requires KV) | No cache |
| POST | `/api/watchlist` | Add/remove from watchlist (requires KV) | No cache |

## Score Breakdown (why scores are different from each other now)

Each card is scored across 6 independent signals with different weights:

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| Pull Rate | 20% | Actual pack odds — SIR ~1/2 boxes, varies by set |
| Pokémon Demand | 20% | Fan poll data + PSA submission volume + social data |
| Set Lifecycle | 25% | Where in the price curve? 6-18mo is the buy zone |
| Price vs Floor | 20% | Is this card cheap vs comparable cards? |
| Print Run Size | 10% | Mini-sets appreciate faster than large sets |
| Upside Potential | 5% | Distance from benchmark fair value |

**The lifecycle score is the biggest differentiator** — a Charizard SAR in a 1-year-old set
scores much higher than the same card in a 2-week-old set, because the price curve says
the 2-week set will drop before it rises.

## How eBay data improves scores

When you call `/api/score` or the Trending endpoint, real eBay sold data replaces
TCGPlayer estimates for price signals. This matters because:
- TCGPlayer lags eBay by 24-72 hours
- eBay includes more price discovery (auctions, best offers)
- 7-day vs 30-day trend tells you if a card is actively moving

## Deploy to Vercel (free, 5 minutes)

### 1. Push to GitHub
Create a repo called `pokeinvest-backend`, push all files.

### 2. Deploy
- Go to vercel.com → New Project → import repo → Deploy
- Your URL: `https://pokeinvest-backend.vercel.app`

### 3. Add PokéTCG API key (optional but recommended)
- Sign up at pokemontcg.io (free)
- Vercel → Settings → Environment Variables
- Add: `POKETCG_API_KEY` = your key
- Gives you 20,000 req/day vs 1,000 without key

### 4. Add Vercel KV for cross-device watchlist (optional)
- Vercel dashboard → Storage → Create KV → Link to project
- Env vars are injected automatically
- Watchlist now syncs phone ↔ desktop

### 5. Connect your frontend
In `index.html`:
```js
const BACKEND_URL = 'https://your-backend.vercel.app';
```

## Example API Responses

### GET /api/cards?minScore=75&maxPrice=80
```json
{
  "success": true,
  "count": 18,
  "cards": [
    {
      "id": "sv7-169",
      "name": "Umbreon ex",
      "cardNo": "169/142",
      "rarity": "Special Illustration Rare",
      "set": { "name": "Stellar Crown", "releaseDate": "2024-09-13" },
      "marketPrice": 44.50,
      "score": 84,
      "lifecycleLabel": "🟢 Strong Buy",
      "recommendation": {
        "label": "Buy",
        "detail": "Good entry point. Set lifecycle and price are favorable."
      },
      "breakdown": {
        "pullScore": 84,
        "pokemonScore": 95,
        "lifecycleScore": 88,
        "priceScore": 78,
        "printRunScore": 72,
        "upsideScore": 71
      },
      "benchmarks": { "floor": 60, "fair": 120, "ceil": 250 },
      "upside": 170
    }
  ]
}
```

### GET /api/score?id=sv7-169
Same as above plus real eBay data:
```json
{
  "ebay": {
    "count": 24,
    "avg": 43.80,
    "avg7": 46.20,
    "avg30": 41.50,
    "trend": "rising",
    "trendPct": 11,
    "recentSales": [...]
  }
}
```

## Cost

**$0** on Vercel free tier:
- 100GB bandwidth/month
- 100,000 function invocations/month
- Edge caching included
- KV: 30,000 req/month, 256MB

A friend group app won't come close to these limits.

## Updates

Push to GitHub → Vercel auto-deploys in ~30 seconds. Zero maintenance.
