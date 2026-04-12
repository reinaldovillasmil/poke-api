// api/ai-analysis.js — Vision-powered art scoring
// Passes the actual card image to Claude for genuine visual evaluation.
// Art scored across 5 independent dimensions — forces real differentiation.
// Uses claude-sonnet-4-6 for vision support.

const fetch  = require('node-fetch');
const https  = require('https');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const ARTIST_TIERS = {
  'Mitsuhiro Arita':  {tier:'S',note:'Original Base Set artist. Massive nostalgia premium. 2–3x vs typical artist.'},
  'Atsushi Furusawa': {tier:'S',note:'Cinematic painterly style. High collector demand.'},
  'Naoki Saito':      {tier:'S',note:'Fan favorite for dynamic compositions. Consistently outperforms at auction.'},
  'Akira Komayama':   {tier:'S',note:'Elegant romantic style. Gardevoir SIR widely cited as one of the most beautiful modern cards.'},
  'Narumi Sato':      {tier:'S',note:'Distinctive soft painterly work. Strong collector following.'},
  'Yuka Morii':       {tier:'S',note:'Unique clay art style. Major premium for this aesthetic.'},
  'HYOGONOSUKE':      {tier:'A',note:'Atmospheric scenes. Collector favorite.'},
  'Shibuzoh.':        {tier:'A',note:'Distinctive style with strong community following.'},
  'Tomokazu Komiya':  {tier:'A',note:'Clean powerful compositions. Consistent collector interest.'},
  'Ryuta Fuse':       {tier:'A',note:'Dynamic action scenes. Popular with collectors.'},
  'Yusuke Ohmura':    {tier:'A',note:'Vibrant colors and detailed environments.'},
  'Kouki Saitou':     {tier:'A',note:'Detailed illustrative style. Solid following.'},
  'danciao':          {tier:'A',note:'Rising artist. Mega Gengar ex SAR generated enormous demand.'},
  'Taiga Kasai':      {tier:'A',note:'Dramatic lighting and composition.'},
  'Sanosuke Sakuma':  {tier:'A',note:'Strong character work. Consistent auction performance.'},
  'Eske Yoshinob':    {tier:'A',note:'Unique artistic vision. Growing following.'},
  '5ban Graphics':    {tier:'B',note:'3D CGI style. Lower collector premium than painterly illustration.'},
  'Planeta CG Works': {tier:'B',note:'Clean 3D renders. Lower collector appeal vs painterly.'},
  'Ryo Ueda':         {tier:'B',note:'Clean professional work. Moderate collector interest.'},
  'Kagemaru Himeno':  {tier:'B',note:'Classic TCG style. Nostalgic for veteran collectors.'},
};

const ART_REFERENCES = {
  S:'Gardevoir ex SIR by Komayama (moonlit romantic elegance ~95), Charizard ex SIR by Naoki Saito (dramatic fire ~92), Umbreon VMAX Alt Art by Arita (atmospheric forest ~94)',
  A:'Umbreon ex SIR (solid character portrait ~74), Meowscarada ex SIR (energetic pose ~70), Iono SIR (vivid personality ~78)',
  B:'Gold Charizard Hyper Rare by 5ban (impressive CGI, low warmth ~58), standard ex Full Art (professional, formulaic ~52)',
};

function getArtistInfo(n){
  if(!n)return null;
  for(const[k,v]of Object.entries(ARTIST_TIERS)){if(n.toLowerCase().includes(k.toLowerCase()))return{name:k,...v};}
  return null;
}
function fetchWithTimeout(url,opts,ms=28000){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
  return fetch(url,{...opts,signal:c.signal}).finally(()=>clearTimeout(t));
}

async function fetchImageBase64(imageUrl){
  return new Promise(resolve=>{
    if(!imageUrl){resolve(null);return;}
    const timeout=setTimeout(()=>resolve(null),6000);
    https.get(imageUrl,res=>{
      if(res.statusCode!==200){clearTimeout(timeout);resolve(null);return;}
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{clearTimeout(timeout);resolve(Buffer.concat(chunks).toString('base64'));});
      res.on('error',()=>{clearTimeout(timeout);resolve(null);});
    }).on('error',()=>{clearTimeout(timeout);resolve(null);});
  });
}

function buildFallback(name,artist,price,lifecycleLabel,floor,fair,ceil){
  const artistInfo=getArtistInfo(artist||'');
  const mkt=parseFloat(price)||0,fv=parseFloat(fair)||0,flr=parseFloat(floor)||0;
  const inBuy=(lifecycleLabel||'').includes('BUY');
  const tooNew=(lifecycleLabel||'').includes('Wait')||(lifecycleLabel||'').includes('New');
  let thesis='';
  if(inBuy&&mkt>0&&mkt<fv)thesis=`${name} is in the buy zone at $${mkt.toFixed(2)}, below its estimated fair value of $${fv}. This lifecycle stage historically precedes price recovery as pack supply tightens. The risk/reward is favorable for accumulating at current prices. Hold target is fair value ($${fv}).`;
  else if(tooNew)thesis=`${name} at $${mkt.toFixed(2)} is from a set that is too new to buy. Prices typically drop 15–40% in the first 3 months. Set a price alert at the floor ($${flr}) and wait.`;
  else if(mkt>fv&&fv>0)thesis=`${name} at $${mkt.toFixed(2)} is above its estimated fair value of $${fv}. Wait for a pullback toward $${flr} before buying.`;
  else thesis=`${name} is trading at $${mkt.toFixed(2)} against a floor of $${flr} and fair value of $${fv}. Monitor set lifecycle and eBay trends before committing. Rule-based estimate — AI analysis unavailable.`;
  const tb=artistInfo?.tier==='S'?88:artistInfo?.tier==='A'?72:artistInfo?.tier==='B'?55:50;
  const artScore={score:tb,artistTier:artistInfo?.tier||'Unknown',style:artistInfo?.tier==='B'?'3D CGI':'Illustration',imageAnalyzed:false,
    dimensions:{
      composition:{score:tb-2,note:'Estimated from artist tier — image not analyzed'},
      colorPalette:{score:tb+3,note:'Estimated from artist tier'},
      emotionalImpact:{score:tb-6,note:'Estimated from artist tier'},
      uniqueness:{score:tb-10,note:'Estimated from artist tier'},
      collectibility:{score:tb,note:'Based on artist market premium'},
    },
    communityReception:artistInfo?.tier==='S'?'Highly Acclaimed':artistInfo?.tier==='A'?'Well Received':'Neutral',
    standoutFeature:'',weakness:'',
    reasoning:artistInfo?`${artistInfo.name} is Tier ${artistInfo.tier}. ${artistInfo.note} Scores estimated from artist tier — image unavailable.`:`Artist "${artist||'Unknown'}" not in tier database. Scores estimated from rarity only.`,
  };
  const highRisk=['Charizard','Pikachu','Eevee','Mewtwo','Gardevoir'];
  const lowRisk=['Cynthia','Misty','Lillie','N ','Brock','Lugia','Umbreon'];
  const isH=highRisk.some(p=>name.includes(p)),isL=lowRisk.some(p=>name.includes(p));
  const reprintRisk={level:isH?'High':isL?'Low':'Medium',score:isH?72:isL?18:42,
    reasoning:isH?`${name.split(' ')[0]} appears in multiple SIRs per year. Each new version competes with existing ones.`:isL?`${name.split(' ')[0]} has appeared infrequently in SIR format. Low reprint risk supports appreciation.`:`Moderate risk. Monitor upcoming sets for new versions of this character.`,
    factors:isH?['Multiple SIRs per year','High demand drives reprints']:['Monitor JP announcements'],
  };
  return{thesis,artScore,reprintRisk,artistInfo,isFallback:true};
}

module.exports=async(req,res)=>{
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  const{name,rarity,set,artist,price,score,lifecycleLabel,floor,fair,ceil,peak,imageUrl}=req.query;
  if(!name){res.status(400).json({success:false,error:'Missing ?name='});return;}

  const apiKey=process.env.ANTHROPIC_API_KEY;
  const artistInfo=getArtistInfo(artist||'');

  if(!apiKey){
    const fb=buildFallback(name,artist,price,lifecycleLabel,floor,fair,ceil);
    res.setHeader('Cache-Control','s-maxage=3600');
    return res.status(200).json({success:true,cardName:name,...fb,note:'Add ANTHROPIC_API_KEY to Vercel env vars.'});
  }

  // Fetch card image for vision
  const decodedUrl=imageUrl?decodeURIComponent(imageUrl):null;
  const imageBase64=decodedUrl?await fetchImageBase64(decodedUrl):null;
  const hasImage=!!imageBase64;
  const artRef=ART_REFERENCES[artistInfo?.tier||'B'];

  const textPrompt=`You are a Pokémon TCG investment analyst and art critic. Return ONLY valid JSON — no markdown, no preamble.

STRICT RULES:
1. Never invent card names, prices, or sales history.
2. Base price reasoning ONLY on the benchmarks provided.
3. Score each art dimension INDEPENDENTLY — genuinely different scores per dimension. A card can score 90 on color but 52 on uniqueness. Be critical, not generous.
4. The image ${hasImage?'IS attached — evaluate ACTUAL visual content you can see':'is NOT available — estimate from artist tier but still differentiate dimensions'}.

CARD:
- Name: ${name}
- Rarity: ${rarity||'Unknown'}
- Set: ${set||'Unknown'}
- Artist: ${artist||'Unknown'}${artistInfo?` (Tier ${artistInfo.tier} — ${artistInfo.note})`:' (not in tier database)'}
- Market Price: ${price?'$'+parseFloat(price).toFixed(2):'Unknown'}
- Score: ${score||'?'}/100 | Lifecycle: ${lifecycleLabel||'Unknown'}
- Benchmarks: Floor $${floor||'?'} / Fair $${fair||'?'} / Ceiling $${ceil||'?'} / Peak $${peak||'?'}

ART CALIBRATION (Tier ${artistInfo?.tier||'B'} references):
${artRef}

Return:
{
  "thesis": "4 sentences: lifecycle timing, price vs benchmarks only, collector appeal, clear verdict. No invented names.",
  "comparable": {
    "name": "Real card you are 100% certain exists. Empty string if any doubt.",
    "reason": "1 sentence on why it is a comparable by archetype.",
    "tcgplayerUrl": "https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent((name||'').split(' ')[0])}&view=grid"
  },
  "artScore": {
    "score": 0,
    "artistTier": "${artistInfo?.tier||'Unknown'}",
    "style": "Painterly|3D CGI|Digital Illustration|Watercolor|Clay|Manga|Mixed Media",
    "imageAnalyzed": ${hasImage},
    "dimensions": {
      "composition":     {"score": 0, "note": "Specific observation about framing, focal point, use of space."},
      "colorPalette":    {"score": 0, "note": "Specific observation about color harmony, mood, contrast."},
      "emotionalImpact": {"score": 0, "note": "Does this artwork evoke feeling? Is the subject compelling?"},
      "uniqueness":      {"score": 0, "note": "Is this a fresh depiction or a standard pose? How does it compare to other versions of this character?"},
      "collectibility":  {"score": 0, "note": "Will collectors specifically seek this artwork in 5 years?"}
    },
    "communityReception": "Highly Acclaimed|Well Received|Neutral|Polarizing|Unknown",
    "standoutFeature": "Best aspect in 10 words or less.",
    "weakness": "Biggest weakness in 10 words or less, or empty string.",
    "reasoning": "2-3 sentences synthesizing scores. Be specific about what you observed${hasImage?' in the image':' (estimated)'}."
  },
  "reprintRisk": {
    "level": "Low|Medium|High|Very High",
    "score": 0,
    "reasoning": "2-3 sentences on reprint likelihood. No unverified announcements.",
    "factors": ["Factor 1", "Factor 2"]
  }
}`;

  const messageContent=hasImage
    ?[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:imageBase64}},{type:'text',text:textPrompt}]
    :textPrompt;

  try{
    const response=await fetchWithTimeout(ANTHROPIC_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1200,messages:[{role:'user',content:messageContent}]}),
    },28000);

    if(!response.ok){const e=await response.text();throw new Error(`Anthropic ${response.status}: ${e.slice(0,300)}`);}
    const data=await response.json();
    const raw=(data.content?.[0]?.text||'').trim();
    if(!raw)throw new Error('Empty response');
    const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim();
    const s=cleaned.indexOf('{'),e=cleaned.lastIndexOf('}');
    if(s===-1||e===-1)throw new Error('No JSON in response');
    const analysis=JSON.parse(cleaned.slice(s,e+1));
    if(!analysis.thesis)throw new Error('Missing thesis');

    // Compute weighted composite from dimensions if score=0
    const dims=analysis.artScore?.dimensions;
    if(dims&&(!analysis.artScore.score||analysis.artScore.score===0)){
      const w=(dims.composition?.score||0)*0.20+(dims.colorPalette?.score||0)*0.15+(dims.emotionalImpact?.score||0)*0.20+(dims.uniqueness?.score||0)*0.25+(dims.collectibility?.score||0)*0.20;
      analysis.artScore.score=Math.round(w);
    }

    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=172800');
    res.status(200).json({success:true,cardName:name,artistInfo,imageAnalyzed:hasImage,
      thesis:analysis.thesis,comparable:analysis.comparable||null,
      artScore:analysis.artScore||null,reprintRisk:analysis.reprintRisk||null,
      isFallback:false,generatedAt:new Date().toISOString()});

  }catch(err){
    console.error('[/api/ai-analysis]',err.message);
    const fb=buildFallback(name,artist,price,lifecycleLabel,floor,fair,ceil);
    res.setHeader('Cache-Control','s-maxage=300');
    res.status(200).json({success:true,cardName:name,...fb,error:err.message});
  }
};