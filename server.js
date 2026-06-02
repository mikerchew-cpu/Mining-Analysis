require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const pdfjsLib = require('pdfjs-dist');
try { pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js'); } catch(e) {}
const { findMine, getAllMines } = require('./data/mines');
const { getMineralPotential, getCommodityPrice } = require('./data/minerals');
const { getPeerAverage, getPeersByCommodity } = require('./data/peers');
const aiProvider = require('./services/aiProvider');
const esdmService = require('./services/esdmService');

const app = express();
const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const isVercel = process.env.VERCEL === '1';

const publicDir = isVercel
  ? path.join(__dirname, '..', 'public')
  : path.join(__dirname, 'public');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const storage = isVercel
  ? multer.memoryStorage()
  : multer.diskStorage({ destination: (r, f, cb) => cb(null, path.join(__dirname, 'uploads')) });
const upload = multer({ storage });

function calculateMiningCost(mine) {
  const dieselPricePerLiter = 6800;
  const dieselToIDR = dieselPricePerLiter;
  const usdToIDR = 16350;

  const transportCostPerKmPerTonne = 350;
  const loadingCostPerTonne = 2500;
  const bargingCostPerTonnePerKm = 85;

  const laborCostPerTonne = 12000;
  const equipmentCostPerTonne = 8500;
  const overheadPct = 0.12;

  let miningCostPerBcm = 0;
  let haulingCostPerTonne = 0;
  let totalCostPerTonne = 0;

  if (mine.srRatio) {
    const dieselConsumptionPerBcm = 1.8;
    const drillBlastCost = 8500;
    const loadCost = 4200;
    const dieselCost = dieselConsumptionPerBcm * dieselToIDR;

    miningCostPerBcm = drillBlastCost + loadCost + dieselCost;

    const wasteCostPerBcm = miningCostPerBcm;
    const oreCostPerBcm = miningCostPerBcm;

    miningCostPerTonne = (wasteCostPerBcm * mine.srRatio + oreCostPerBcm) / (mine.srRatio + 1);
  }

  const haulingPerKm = 1800;
  haulingCostPerTonne = (mine.distanceFromPort || 50) * haulingPerKm;

  if (mine.distanceFromPort > 50) {
    haulingCostPerTonne += bargingCostPerTonnePerKm * (mine.distanceFromPort - 50);
  }

  const totalDirectCost = miningCostPerTonne + haulingCostPerTonne + laborCostPerTonne + equipmentCostPerTonne;
  const overhead = totalDirectCost * overheadPct;

  totalCostPerTonne = totalDirectCost + overhead;
  totalCostPerTonneUSD = totalCostPerTonne / usdToIDR;

  return {
    miningCostPerTonneIDR: Math.round(miningCostPerTonne),
    haulingCostPerTonneIDR: Math.round(haulingCostPerTonne),
    laborCostPerTonneIDR: laborCostPerTonne,
    equipmentCostPerTonneIDR: equipmentCostPerTonne,
    overheadCostPerTonneIDR: Math.round(overhead),
    totalCostPerTonneIDR: Math.round(totalCostPerTonne),
    totalCostPerTonneUSD: parseFloat(totalCostPerTonneUSD.toFixed(2)),
    dieselPricePerLiterIDR: dieselToIDR,
    usdToIDR: usdToIDR,
    strippingRatio: mine.srRatio || 5.0,
    distanceFromPort: mine.distanceFromPort || 50
  };
}

function calculateValuation(mine, peerAvg) {
  if (!mine || !peerAvg) return null;

  const resourceValueEv = (mine.resourceMt || 0) * 1e6 * (peerAvg.avgEvPerTonneResource || 10);
  const reserveValueEv = (mine.reserveMt || 0) * 1e6 * (peerAvg.avgEvPerTonneReserve || 25);

  return {
    impliedEvFromResource: Math.round(resourceValueEv),
    impliedEvFromReserve: Math.round(reserveValueEv),
    avgImpliedEV: Math.round((resourceValueEv + reserveValueEv) / 2),
    resourceMt: mine.resourceMt || 0,
    reserveMt: mine.reserveMt || 0
  };
}

const VALE_SYSTEM_PROMPT = 'You are a Senior Geologist with 30 years of experience at PT Vale Indonesia (formerly PT Inco). You have been with the company since the early Sorowako days. You are an expert in Indonesian mineral deposits, particularly nickel laterites, porphyry copper-gold systems, and coal deposits. Your analysis is thorough, data-driven, and reflects decades of field experience across the Indonesian archipelago. You write in a professional, authoritative tone with specific technical details. Always provide clear investment recommendations: Strong Buy, Buy, Hold, or Sell.';

async function getDeepSeekAnalysis(mineData, esdmData, mineralData, costData, peerData, valuationData, gemId) {
  const prompt = generateValePrompt(mineData, esdmData, mineralData, costData, peerData, valuationData);
  const gem = gemId ? getGemById(gemId) : null;
  const systemPrompt = gem ? gem.systemPrompt : VALE_SYSTEM_PROMPT;

  const result = await aiProvider.callAI(prompt, systemPrompt);
  if (result) return { text: result, gemName: gem ? gem.name : 'Senior Vale Geologist' };

  return { text: getLocalRecommendation(mineData, esdmData, mineralData, costData, peerData, valuationData), gemName: 'Local Engine' };
}

function generateValePrompt(mine, esdm, mineral, cost, peer, valuation) {
  return `MINING ASSET ANALYSIS REQUEST

As a Senior Geologist at PT Vale Indonesia with 30 years of experience, please provide a comprehensive investment analysis for the following mining asset:

**MINE DATA:**
- Name: ${mine.name}
- Location: ${mine.province}, ${mine.regency}
- Company: ${mine.company}
- Commodity: ${mine.commodity}
- Status: ${esdm.status}
- Validity: ${esdm.validity}
- IUP: ${esdm.iupNumber}

**GEOLOGICAL DATA:**
- Resource: ${mine.resourceMt} Mt
- Reserve: ${mine.reserveMt} Mt
- Stripping Ratio: ${mine.srRatio}:1
- Mineral Belt: ${mineral ? mineral.belt : 'N/A'}
- Geology: ${mineral ? mineral.geology : 'N/A'}
- Regional Potential: ${mineral ? mineral.potentialRating : 'N/A'}

**COST ANALYSIS (IDR):**
- Mining Cost/tonne: Rp ${cost.miningCostPerTonneIDR.toLocaleString()}
- Hauling Cost/tonne: Rp ${cost.haulingCostPerTonneIDR.toLocaleString()}
- Total Cost/tonne: Rp ${cost.totalCostPerTonneIDR.toLocaleString()} (USD ${cost.totalCostPerTonneUSD}/tonne)
- Stripping Ratio: ${cost.strippingRatio}:1
- Diesel Price: Rp ${cost.dieselPricePerLiterIDR.toLocaleString()}/liter

**VALUATION:**
- Implied EV from Resource: ${valuation ? '$' + valuation.impliedEvFromResource.toLocaleString() : 'N/A'}
- Implied EV from Reserve: ${valuation ? '$' + valuation.impliedEvFromReserve.toLocaleString() : 'N/A'}
- Peer Avg EV/Resource Tonne: ${peer ? '$' + peer.avgEvPerTonneResource : 'N/A'}
- Peer Avg EV/Reserve Tonne: ${peer ? '$' + peer.avgEvPerTonneReserve : 'N/A'}

**PEER CONTEXT:**
${peer && peer.peers ? peer.peers.slice(0, 5).map(p => `- ${p.name}: ${p.commodity}, Margin ${p.marginPct}%`).join('\n') : 'N/A'}

**COMMODITY PRICE:**
${JSON.stringify(getCommodityPrice(mine.commodity), null, 2)}

Please provide:
1. EXECUTIVE SUMMARY - Brief verdict
2. GEOLOGICAL POTENTIAL - Deposit quality, grade, regional potential
3. TECHNICAL & OPERATIONAL RISKS - Infrastructure, logistics, stripping ratio implications
4. COST POSITION - Where does this asset sit on the global cost curve
5. COMMODITY OUTLOOK - Near to medium term outlook
6. VALUATION & PEER COMPARISON - Is it fairly valued
7. ESG & REGULATORY CONSIDERATIONS - ESDM status, community issues
8. FINAL RECOMMENDATION - Strong Buy / Buy / Hold / Sell with clear rationale

Write as a seasoned Vale geologist who has seen mining cycles come and go. Reference your 30 years of experience in Indonesia.`;
}

function getLocalRecommendation(mine, esdm, mineral, cost, peer, valuation) {
  let score = 0;
  const maxScore = 100;
  let reasons = [];

  if (esdm.status === 'Active') { score += 20; reasons.push('✓ Active mining status ensures immediate cash flow potential'); }
  else if (esdm.status === 'Exploration') { score += 8; reasons.push('~ Exploration stage - higher risk but early entry opportunity'); }
  else if (esdm.status === 'Care & Maintenance') { score += 5; reasons.push('~ Care & Maintenance - potential restart candidate'); }
  else { score += 2; reasons.push('✗ Non-active status requires regulatory clarity'); }

  if (esdm.validity === 'Valid') { score += 15; reasons.push('✓ Clean ESDM validity - low regulatory risk'); }
  else if (esdm.validity === 'Under Review') { score += 5; reasons.push('~ IUP under review - monitor regulatory developments'); }
  else { score -= 10; reasons.push('✗ Expired IUP - significant legal risk'); }

  if (mineral && mineral.potentialRating === 'Extremely High') { score += 20; reasons.push('✓ World-class mineral belt - exceptional geological potential'); }
  else if (mineral && mineral.potentialRating === 'Very High') { score += 15; reasons.push('✓ High quality mineral belt - strong geological endowment'); }
  else if (mineral && mineral.potentialRating === 'High') { score += 10; reasons.push('✓ Good mineral belt with proven deposits'); }
  else { score += 5; reasons.push('~ Moderate geological potential - needs more drilling'); }

  if (mine.reserveMt && mine.reserveMt > 50) { score += 10; reasons.push('✓ Large reserve base supports long mine life'); }
  else if (mine.reserveMt && mine.reserveMt > 10) { score += 5; reasons.push('~ Moderate reserve base - replenishment needed'); }
  else { score += 0; reasons.push('~ Limited reserves - exploration upside required'); }

  const costPerTonneUSD = cost.totalCostPerTonneUSD || 50;
  if (costPerTonneUSD < 20) { score += 15; reasons.push('✓ Lowest quartile cost position - strong competitive advantage'); }
  else if (costPerTonneUSD < 40) { score += 10; reasons.push('✓ Below average cost position - healthy margins'); }
  else if (costPerTonneUSD < 60) { score += 5; reasons.push('~ Average cost position - cost optimization needed'); }
  else { score += 0; reasons.push('~ High cost position - vulnerable in downturns'); }

  if (mine.infrastructure && mine.infrastructure.includes('Port')) { score += 10; reasons.push('✓ Integrated port infrastructure reduces logistics risk'); }
  else { score += 3; reasons.push('~ No direct port access - logistics cost premium'); }

  if (mine.srRatio && mine.srRatio < 3) { score += 5; reasons.push('✓ Low stripping ratio - favorable mining economics'); }
  else if (mine.srRatio && mine.srRatio < 6) { score += 3; reasons.push('~ Moderate stripping ratio - manageable waste removal'); }
  else { score += 0; reasons.push('~ High stripping ratio - significant waste removal cost'); }

  if (peer && peer.avgMarginPct > 40) { score += 5; reasons.push('✓ Peer group demonstrates strong industry margins'); }
  else { score += 2; reasons.push('~ Peer margins indicate competitive pressure'); }

  score = Math.min(score, maxScore);

  let recommendation, title;
  if (score >= 80) {
    recommendation = 'Strong Buy';
    title = 'High Conviction Investment Opportunity';
  } else if (score >= 65) {
    recommendation = 'Buy';
    title = 'Attractive Investment Opportunity';
  } else if (score >= 45) {
    recommendation = 'Hold';
    title = 'Moderate - Further Due Diligence Recommended';
  } else {
    recommendation = 'Sell / Do Not Invest';
    title = 'High Risk - Proceed with Caution';
  }

  const commodityPrice = getCommodityPrice(mine.commodity);
  const priceStr = commodityPrice.usdPerOunce
    ? `$${commodityPrice.usdPerOunce}/oz`
    : commodityPrice.usdPerDryMetricTon
      ? `$${commodityPrice.usdPerDryMetricTon}/wmt`
      : `$${commodityPrice.usdPerTonne}/tonne`;

  return `# MINING ASSET INVESTMENT ANALYSIS
**Senior Geologist, PT Vale Indonesia** — 30 Years Experience

---

## EXECUTIVE SUMMARY

After 30 years evaluating mineral deposits across the Indonesian archipelago—from the ultramafic complexes of Sulawesi to the gold belts of Kalimantan and the porphyry systems of Papua—I provide the following assessment of ${mine.name}.

**Verdict: ${recommendation} — ${title}**
**Overall Score: ${score}/${maxScore}**

The ${mine.name} deposit in ${mine.province} represents a ${mineral ? mineral.potentialRating.toLowerCase() : 'moderate'} quality asset within the ${mineral ? mineral.belt : 'regional'} geological setting. My analysis integrates ESDM regulatory validation, geological potential, operating cost position, peer valuation benchmarks, and commodity price outlook.

---

## 1. GEOLOGICAL POTENTIAL

**Deposit Type:** ${mine.commodity}
**Resources:** ${mine.resourceMt} Mt | **Reserves:** ${mine.reserveMt} Mt
**Stripping Ratio:** ${mine.srRatio}:1 (${mine.srRatio > 6 ? 'High - this concerns me based on my experience with similar deposits in Sulawesi' : mine.srRatio > 3 ? 'Moderate - manageable with proper mine planning' : 'Favorable - excellent mining conditions'})
${mineral ? `**Regional Context:** ${mine.name} sits within the ${mineral.belt}, a geological province I have studied extensively over my three decades at Vale. ${mineral.description}` : ''}

*Having worked on similar deposits since the early 1990s, I can attest that the geological setting here is ${mineral && mineral.potentialRating.includes('Extremely') ? 'exceptional. I have rarely seen a belt with this level of endowment in my entire career.' : mineral && mineral.potentialRating.includes('Very') ? 'very promising. The analogies to successful operations in the region are strong.' : mineral && mineral.potentialRating.includes('High') ? 'solid. There are good producing mines in analogous settings nearby.' : 'moderate. Additional exploration will be critical to de-risk the geological model.'}*

---

## 2. COST POSITION & OPERATING ANALYSIS

| Cost Component | IDR/tonne |
|---|---|
| Mining Cost | Rp ${cost.miningCostPerTonneIDR.toLocaleString()} |
| Hauling & Logistics | Rp ${cost.haulingCostPerTonneIDR.toLocaleString()} |
| Labor & Equipment | Rp ${(cost.laborCostPerTonneIDR + cost.equipmentCostPerTonneIDR).toLocaleString()} |
| Overhead (12%) | Rp ${cost.overheadCostPerTonneIDR.toLocaleString()} |
| **Total** | **Rp ${cost.totalCostPerTonneIDR.toLocaleString()}** |
| **Total (USD)** | **$${cost.totalCostPerTonneUSD}/tonne** |

The asset sits at a ${costPerTonneUSD < 25 ? 'strong low-cost' : costPerTonneUSD < 45 ? 'competitive mid-tier' : 'higher-cost end of the'} position on the global cost curve. Over my career, I have seen high-cost operations struggle during commodity downturns—this is a critical consideration for the investment committee.

**Logistics:** ${mine.distanceFromPort}km from nearest port — ${mine.distanceFromPort < 20 ? 'excellent proximity' : mine.distanceFromPort < 60 ? 'manageable distance' : 'significant logistics cost'}.

---

## 3. VALUATION & PEER COMPARISON

**Peer Group:** ${peer && peer.peers ? peer.peers.slice(0, 3).map(p => p.name).join(', ') : 'N/A'}
**Industry Avg EV/Resource Tonne:** ${peer ? '$' + peer.avgEvPerTonneResource.toFixed(1) : 'N/A'}
**Industry Avg EV/Reserve Tonne:** ${peer ? '$' + peer.avgEvPerTonneReserve.toFixed(1) : 'N/A'}

**Implied Valuation:**
- From Resource: ${valuation ? '$' + (valuation.impliedEvFromResource / 1e6).toFixed(0) + 'M' : 'N/A'}
- From Reserve: ${valuation ? '$' + (valuation.impliedEvFromReserve / 1e6).toFixed(0) + 'M' : 'N/A'}
- Average: ${valuation ? '$' + (valuation.avgImpliedEV / 1e6).toFixed(0) + 'M' : 'N/A'}

Comparing these multiples against the current commodity price of ${priceStr} (Source: ${commodityPrice.source}), the asset appears ${score > 65 ? 'attractively' : 'moderately'} valued relative to the peer universe I track.

---

## 4. REGULATORY & ESDM STATUS

**Status:** ${esdm.status} | **Validity:** ${esdm.validity} | **IUP:** ${esdm.iupNumber}

${esdm.validity === 'Valid' ? 'The IUP is in good standing with ESDM. In my 30 years, clean regulatory title is the foundation of any successful mining investment in Indonesia.' : 'Regulatory status requires close monitoring. I have seen many promising deposits stalled by permitting issues.'}

---

## 5. COMMODITY OUTLOOK — ${mine.commodity.toUpperCase()}

The medium-term outlook for ${mine.commodity} is ${mine.commodity.includes('Nickel') ? 'positive, driven by EV battery demand growth. Indonesia\'s nickel downstream policy continues to support domestic processing margins.' : mine.commodity.includes('Gold') ? 'constructive, supported by central bank buying and geopolitical uncertainty. Gold remains a portfolio hedge.' : mine.commodity.includes('Coal') ? 'cautious given the global energy transition trajectory, though near-term demand remains robust in Southeast Asia.' : 'stable with selective opportunities in specific sub-markets.'} Having navigated multiple commodity cycles—from the 1998 Asian crisis to the 2015 downturn and the 2020-2022 supercycle—I caution against relying solely on spot prices for investment decisions.

---

## 6. KEY RISKS & MITIGATION

${mine.srRatio > 6 ? '- **High Stripping Ratio:** The ${mine.srRatio}:1 SR is a concern. Requires careful pit optimization and waste management.' : ''}
${mine.distanceFromPort > 60 ? '- **Logistics Distance:** Hauling over ${mine.distanceFromPort}km adds cost exposure to fuel price volatility.' : ''}
- **Commodity Price Risk:** ${mine.commodity} price fluctuations directly impact project economics
- **Regulatory Risk:** Indonesian mining regulations continue to evolve, particularly around downstream processing requirements

---

## 7. FINAL RECOMMENDATION

**Rating: ${recommendation}**

After 30 years evaluating mineral deposits across Indonesia—from my early days mapping laterite profiles in Sorowako through the cycles that shaped our industry—I recommend a **${recommendation}** stance on ${mine.name}.

${score >= 80 ? 'This is exactly the kind of asset that has built Vale into the premier Indonesian nickel producer. The combination of geological quality, regulatory clarity, and cost position makes this a compelling investment.' : score >= 65 ? 'This asset has solid fundamentals and warrants investment consideration. I have seen similar deposits generate strong returns with proper execution.' : score >= 45 ? 'I recommend further due diligence before committing capital. The geological potential exists, but the risk-reward profile requires more data points.' : 'Based on the current data package, I cannot recommend investment at this time. I have seen too many marginal deposits consume capital in my career.'}

> **Senior Geologist — PT Vale Indonesia**
> *${new Date().getFullYear()} — 30 years of service in Indonesian mineral exploration and mining*
> *"Having seen mining cycles come and go, I remain confident in the long-term fundamentals of Indonesian mineral resources."*`;
}

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    const mineName = req.body.mineName || '';
    let mineData = req.body.mineData ? JSON.parse(req.body.mineData) : null;

    let mine = mineData || findMine(mineName);

    if (!mine) {
      const esdmResults = await esdmService.searchMines(mineName);
      if (esdmResults && esdmResults.length > 0) {
        const esdmMine = esdmResults[0];
        mine = {
          id: esdmMine.id || "ESDM-LIVE-001",
          name: esdmMine.name || mineName,
          company: esdmMine.company || req.body.company || '',
          province: esdmMine.province || req.body.province || '',
          regency: esdmMine.regency || '',
          latitude: 0, longitude: 0,
          status: esdmMine.status || 'Under Review',
          validity: esdmMine.validity || 'Under Review',
          iupNumber: esdmMine.iupNumber || 'N/A',
          expiryDate: esdmMine.expiryDate || 'N/A',
          areaHa: esdmMine.areaHa || 0,
          commodity: esdmMine.commodity || req.body.commodity || 'Unknown',
          resourceMt: parseFloat(req.body.resourceMt) || 0,
          reserveMt: parseFloat(req.body.reserveMt) || 0,
          srRatio: parseFloat(req.body.srRatio) || 5,
          distanceFromPort: parseFloat(req.body.distanceFromPort) || 50,
          elevation: 100,
          infrastructure: [],
          description: esdmMine.description || `Data from ESDM WIUP - ${esdmMine.stage || 'N/A'}`
        };
      } else {
        mine = {
          id: "ESDM-MANUAL-001",
          name: mineName || "Unknown Mine",
          company: req.body.company || "Unknown Company",
          province: req.body.province || "Unknown Province",
          regency: req.body.regency || "Unknown Regency",
          latitude: parseFloat(req.body.latitude) || 0,
          longitude: parseFloat(req.body.longitude) || 0,
          status: req.body.status || "Under Review",
          validity: req.body.validity || "Under Review",
          iupNumber: req.body.iupNumber || "N/A",
          expiryDate: req.body.expiryDate || "N/A",
          areaHa: parseFloat(req.body.areaHa) || 0,
          commodity: req.body.commodity || "Unknown",
          resourceMt: parseFloat(req.body.resourceMt) || 0,
          reserveMt: parseFloat(req.body.reserveMt) || 0,
          srRatio: parseFloat(req.body.srRatio) || 5,
          distanceFromPort: parseFloat(req.body.distanceFromPort) || 50,
          elevation: parseFloat(req.body.elevation) || 100,
          infrastructure: (req.body.infrastructure || "").split(",").map(s => s.trim()).filter(Boolean),
          description: req.body.description || "Manual entry"
        };
      }
    }

    const esdmData = {
      status: mine.status,
      validity: mine.validity,
      iupNumber: mine.iupNumber,
      expiryDate: mine.expiryDate,
      company: mine.company,
      areaHa: mine.areaHa,
      location: `${mine.province}, ${mine.regency}`,
      coordinates: `${mine.latitude}, ${mine.longitude}`,
      verifiedAt: new Date().toISOString()
    };

    const mineralData = getMineralPotential(mine);
    const commodityPrice = getCommodityPrice(mine.commodity);
    const costData = calculateMiningCost(mine);
    const peerData = getPeerAverage(mine.commodity);
    const valuationData = calculateValuation(mine, peerData);

    const gemId = req.body.gemId || '';
    const result = await getDeepSeekAnalysis(mine, esdmData, mineralData, costData, peerData, valuationData, gemId);

    res.json({
      success: true,
      mine,
      esdm: esdmData,
      mineral: mineralData ? { ...mineralData, commodityPrice } : { commodityPrice },
      cost: costData,
      peerComparison: peerData,
      valuation: valuationData,
      recommendation: result.text,
      gemName: result.gemName
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/mines', (req, res) => {
  const staticMines = getAllMines().map(m => ({ ...m, source: 'static' }));
  res.json({ mines: staticMines });
});

app.get('/api/esdm/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ mines: [], source: 'esdm' });
    const results = await esdmService.searchMines(q);
    if (results) {
      res.json({ mines: results, source: 'esdm' });
    } else {
      res.json({ mines: [], source: 'esdm', error: 'ESDM service unavailable' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function parseMineText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const rows = [];
  let current = {};

  for (const line of lines) {
    const l = line.trim();

    const kvMatch = l.match(/^[•\-*]?\s*(.+?)\s*[:=]\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
      let val = kvMatch[2].trim();
      const num = parseFloat(val.replace(/[,$]/g, ''));
      if (!isNaN(num) && val.replace(/[,$]/g, '').match(/^\d+\.?\d*/)) val = num;
      current[key] = val;
      continue;
    }

    if (l.includes(',') && l.split(',').length >= 3) {
      rows.push(l);
    }
  }

  if (Object.keys(current).length >= 3) {
    return [current];
  }

  if (rows.length >= 2) {
    const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const result = [];
    for (let i = 1; i < rows.length; i++) {
      const vals = rows[i].split(',').map(v => v.trim());
      if (vals.length < 2) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      result.push(row);
    }
    return result;
  }

  return [];
}

app.post('/api/upload/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let raw = '';
    const buffer = isVercel ? req.file.buffer : require('fs').readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname).toLowerCase();
    let records = [];

    if (ext === '.json') {
      raw = buffer.toString('utf-8');
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : (parsed.mines || [parsed]);
    } else if (ext === '.csv' || ext === '.txt') {
      raw = buffer.toString('utf-8');
      const lines = raw.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        if (vals.length === 0 || vals.every(v => !v)) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        records.push(row);
      }
    } else if (ext === '.pdf') {
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const textPages = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const lines = [];
        let lastY = null;
        for (const item of content.items) {
          const y = item.transform ? item.transform[5] : 0;
          if (lastY !== null && Math.abs(y - lastY) > 1) lines.push('\n');
          lines.push(item.str);
          lastY = y;
        }
        textPages.push(lines.join(''));
      }
      const text = textPages.join('\n');
      if (!text.trim()) throw new Error('Could not extract text from PDF');
      records = parseMineText(text);
      if (records.length === 0) {
        records = [{ description: text.substring(0, 2000), name: req.file.originalname.replace('.pdf', '') }];
      }
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Use .csv, .json, or .pdf' });
    }

    const mines = records.map(r => ({
      name: r.name || r.mine_name || r.mine || r.nama_tambang || r.project || 'Unknown',
      company: r.company || r.perusahaan || r.operator || '',
      province: r.province || r.provinsi || '',
      regency: r.regency || r.kabupaten || r.kota || '',
      commodity: r.commodity || r.komoditas || r.comodity || r.mineral || '',
      status: r.status || r.iup_status || 'Under Review',
      validity: r.validity || r.iup_validity || r.status_iup || 'Under Review',
      iupNumber: r.iup_number || r.iup || r.no_iup || r.iup_no || '',
      resourceMt: parseFloat(r.resource_mt || r.resource || r.resources || r.sumberdaya || r.total_resource || 0),
      reserveMt: parseFloat(r.reserve_mt || r.reserve || r.reserves || r.cadangan || r.total_reserve || 0),
      srRatio: parseFloat(r.sr_ratio || r.sr || r.stripping_ratio || r.nisbah_kupas || 5),
      distanceFromPort: parseFloat(r.distance_from_port || r.distance_port || r.distance || r.jarak_pelabuhan || 50),
      latitude: parseFloat(r.latitude || r.lat || r.lintang || 0),
      longitude: parseFloat(r.longitude || r.lng || r.lon || r.bujur || 0),
      elevation: parseFloat(r.elevation || r.elevasi || r.ketinggian || 100),
      areaHa: parseFloat(r.area_ha || r.area || r.luas || 0),
      gradeNi: parseFloat(r.grade_ni || r.ni_grade || r.kadar_ni || 0),
      gradeAu_gpt: parseFloat(r.grade_au || r.au_grade || r.kadar_au || 0),
      gradeCu_pct: parseFloat(r.grade_cu || r.cu_grade || r.kadar_cu || 0),
      gradeAg_gpt: parseFloat(r.grade_ag || r.ag_grade || r.kadar_ag || 0),
      sulfur_pct: parseFloat(r.sulfur || r.sulfur_pct || r.kadar_s || 0),
      calorificValue_kcal: parseFloat(r.calorific_value || r.kcal || r.nilai_kalori || 0),
      description: r.description || r.deskripsi || r.notes || '',
      infrastructure: (r.infrastructure || r.infra || r.infrastruktur || '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
    }));

    res.json({ success: true, count: mines.length, mines, source: ext === '.pdf' ? 'pdf' : 'file' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── Gems (Custom AI Personas) ──────────────────────────────
const COAL_SYSTEM_PROMPT = `You are a Senior Coal Analyst with 25 years of experience in Indonesian coal mining and trading. You specialize in thermal and coking coal across Kalimantan and Sumatra.

For every coal mine analysis, you MUST check and reference these key metrics:
1. **Calorific Value (GAR/NAR)** — Is it above 5,000 kcal/kg GAR? Premium or sub-bituminous?
2. **Sulfur Content** — Below 0.5% is low-sulfur (premium). Above 1% is high-sulfur (penalty).
3. **Ash Content** — Below 5% is premium. Above 10% adds washing cost.
4. **Stripping Ratio** — Below 5:1 is favorable for coal. Above 8:1 is challenging.
5. **Distance to Port/Barge** — Coal is volume-sensitive. Every km adds significant cost.
6. **IUP/PKP2B Validity** — Coal IUPs face stricter renewal scrutiny post-2020 law.
7. **Production Capacity** — Can it sustain 1Mt+, 5Mt+, or 10Mt+ annual production?

Reference current coal pricing:
- Newcastle 5,500 kcal/kg GAR FOB: ~$85-95/t (2026)
- Newcastle 6,000 kcal/kg GAR FOB: ~$105-120/t (2026)
- API4 Richards Bay: ~$95-110/t
- Indonesian HBA (Harga Batubara Acuan): refer to latest ESDM monthly index

Key Indonesian coal basins: Kutai (Kaltim), Barito (Kalsel/Kalteng), Bengkulu, Sumsel.

Write in a direct, data-driven style. Always provide: Coal Quality Assessment, Logistics & Cost Analysis, Regulatory Risk, and a clear recommendation (Strong Buy / Buy / Hold / Sell). Reference current diesel price Rp6,800/L and USD/IDR 16,350 in cost calculations.`;

const ESDM_SYSTEM_PROMPT = `You are an ESDM (Ministry of Energy and Mineral Resources) Compliance Auditor with 20 years of experience in Indonesian mining regulation and permitting. You have deep expertise in Law 3/2020 (Minerba), PP 96/2021, and all ESDM implementing regulations.

For every mine analysis, you MUST check and report on:

1. **IUP Status & Validity:**
   - Is the IUP status Active, Exploration, Care & Maintenance, or Closed?
   - Validity: Valid, Under Review, or Expired?
   - What is the expiry date? Is renewal likely under current regulations?

2. **IUP Type & Compliance:**
   - IUP Eksplorasi vs IUP Operasi Produksi vs PKP2B (Coal Contract of Work)
   - For PKP2B: Is it affected by the 2020 law mandating conversion to IUPK?
   - Is the company compliant with RKAB (Work Plan & Budget) submission?

3. **Regulatory Red Flags:**
   - Expired or nearing expiry IUP — flag immediately
   - Care & Maintenance status — is there a valid C&M permit?
   - Exploration stage without progress — potential revocation
   - Area conflicts with forest areas (Kawasan Hutan) — PP 23/2021
   - Domestic Market Obligation (DMO) compliance for coal
   - PNBP (Non-Tax State Revenue) payment compliance

4. **Downstream/Nickel Specific:**
   - For nickel: compliance with mandatory domestic processing (UU 3/2020)
   - For coal: DMO compliance, export quota status

5. **Sanctions & Risks:**
   - IUP revocation risk (low/medium/high)
   - Administrative sanctions: written warning, suspension, or revocation
   - Criminal liability risks (illegal mining — UU 3/2020 Pasal 158-166)

6. **Recommendations:**
   - Clear regulatory risk rating (Low / Medium / High / Critical)
   - Specific compliance actions required
   - Timeline for regulatory milestones

Write in an authoritative auditor style. Be specific about which laws/regulations apply. Flag non-compliance clearly. This is a technical regulatory audit, not an investment recommendation.`;

const COST_SYSTEM_PROMPT = `You are a Senior Mining Cost Engineer with 20 years of experience in Indonesian open-pit and underground mining operations. You specialize in operating cost analysis, diesel pricing, logistics optimization, and cost benchmarking across Indonesian commodities.

DIESEL PRICE REFERENCE (May 2026):
- Current Industrial Diesel (Solar Industri): Rp 6,800 per liter
- This is the HBE (Harga Batas Ekonomis) for PSR (Peraturan Solar Retail)
- Updated quarterly by BPH Migas
- Compare against solar subsidi (Rp 6,800 is non-subsidized industrial price)

COST METHODOLOGY — For every mine, calculate and verify:

1. **Mining Cost Components:**
   - Drilling & Blasting: Rp 5,000-15,000/t based on rock hardness
   - Loading & Hauling within pit: Rp 8,000-25,000/t (SR-dependent)
   - The CURRENT DIESEL PRICE of Rp 6,800/L means: each liter moves ~3-4 tonnes per km
   - For every 1 point of SR increase, add ~15-20% to mining cost

2. **Hauling & Logistics:**
   - Hauling cost = distance × diesel consumption rate × diesel price
   - Base rate: ~Rp 1,800-2,500 per tonne-km (road haulage)
   - Barge: ~Rp 400-700 per tonne-km (river/sea)
   - Conveyor: ~Rp 200-400 per tonne-km (if available)
   - Port handling: Rp 15,000-30,000/t (loading, barging, demurrage)
   - **At Rp 6,800/L diesel**: verify that hauling cost uses THIS price, not outdated assumptions

3. **Labor:**
   - Indonesian mining labor: Rp 8,000-15,000/t for standard operations
   - Higher for remote locations (Papua, Maluku) — add 20-40%

4. **Equipment:**
   - Fuel: largest component at Rp 6,800/L diesel
   - Maintenance: 15-25% of equipment cost
   - Depreciation: varies by equipment age and utilization

5. **Overhead:**
   - Standard Indonesian mine overhead: 10-15% of direct costs
   - Includes: camp, catering, security, community development (CD/CSR)

6. **Total Cost Benchmarking:**
   - Nickel laterite: $15-35/t typical FOB mine gate
   - Coal (thermal): $8-25/t FOB barge/port
   - Copper-gold: $12-30/t (high volume offsets)
   - Gold (underground): $40-80/t

7. **Cost Optimization Recommendations:**
   - Diesel hedging strategy at current Rp 6,800/L
   - Pit optimization to reduce SR impact
   - Haul road grade optimization to reduce fuel consumption
   - Barge vs truck haulage trade-off analysis

Write as a seasoned cost engineer who has managed budgets across Indonesian mines. Use Rp 6,800/L diesel and USD/IDR 16,350 as fixed assumptions. Flag any cost component that seems unrealistic. Provide a clear cost position assessment (Low / Competitive / High / Distressed).`;

const COMPREHENSIVE_SYSTEM_PROMPT = `You are a Senior Indonesian Mining Analyst with 25 years of cross-commodity experience covering geological assessment, ESDM regulatory compliance, operating cost analysis, and investment valuation. You provide a single integrated analysis that covers all critical dimensions.

INTEGRATED ANALYSIS FRAMEWORK — For every mine, you MUST cover:

## 1. GEOLOGICAL & COMMODITY ASSESSMENT
- Deposit type and quality: grade, resource/reserve size, stripping ratio
- For coal: calorific value (GAR), sulfur%, ash%, HBA index reference. Newcastle 5,500 GAR ~$85-95/t, 6,000 GAR ~$105-120/t
- For nickel: saprolite vs limonite, Ni%, Co%, HPAL vs RKEF suitability
- For gold/copper: grade g/t Au, % Cu, epithermal vs porphyry system
- Mineral belt context and regional endowment

## 2. ESDM REGULATORY & COMPLIANCE AUDIT (Minerba Law 3/2020)
- IUP status (Active/Exploration/Care & Maintenance/Closed)
- Validity and expiry date — flag if nearing expiration or already expired
- IUP type: IUP Eksplorasi / IUP Operasi Produksi / PKP2B / IUPK
- For PKP2B: affected by mandatory conversion to IUPK per UU 3/2020?
- RKAB (Work Plan & Budget) compliance status
- Red flags: forest area conflicts (PP 23/2021), DMO compliance, PNBP arrears
- Revocation risk rating: Low / Medium / High / Critical
- Sanctions: written warning → suspension → revocation (UU 3/2020 Pasal 158-166)

## 3. OPERATING COST ANALYSIS (with current diesel Rp 6,800/L)
- Diesel price reference: Solar Industri Rp 6,800/L (BPH Migas, May 2026). Each liter moves ~3-4 tonnes per km
- Hauling cost: distance × consumption × Rp 6,800/L. Road ~Rp 1,800-2,500/t-km, barge ~Rp 400-700/t-km
- Mining cost: SR-dependent. Each 1pt SR increase adds ~15-20% to mining cost
- Labor: Rp 8,000-15,000/t standard, +20-40% for remote sites
- Overhead: 10-15% of direct costs
- Total cost benchmarks: nickel $15-35/t, coal $8-25/t, copper-gold $12-30/t, gold ug $40-80/t
- USD/IDR: 16,350 fixed assumption
- Cost position: Low / Competitive / High / Distressed

## 4. VALUATION & PEER CONTEXT
- Implied EV from resource/reserve multiples
- Peer margin comparison
- Cost position on global curve

## 5. INVESTMENT RECOMMENDATION
- Rating: Strong Buy / Buy / Hold / Sell
- Clear rationale integrating geology, regulatory, and cost findings
- Key risks and catalysts

OUTPUT FORMAT: Structure your response with clear sections. Use specific data from the provided mine analysis. Be authoritative and direct — this is a technical mining analysis, not a general overview. Always reference current diesel price Rp 6,800/L and USD/IDR 16,350 where applicable. Reference specific ESDM regulations by number (UU 3/2020, PP 96/2021, etc.).`;

let gems = [
  {
    id: 'gem-vale',
    name: 'Senior Vale Geologist',
    description: 'Default analysis by a senior PT Vale geologist with 30 years experience',
    systemPrompt: VALE_SYSTEM_PROMPT,
    isDefault: true
  },
  {
    id: 'gem-coal',
    name: 'Coal Analysis Specialist',
    description: 'Coal quality assessment, calorific value, sulfur, coal pricing & logistics',
    systemPrompt: COAL_SYSTEM_PROMPT,
    isDefault: true
  },
  {
    id: 'gem-esdm',
    name: 'ESDM Compliance Auditor',
    description: 'Regulatory compliance check: IUP validity, Minerba law, permitting risks',
    systemPrompt: ESDM_SYSTEM_PROMPT,
    isDefault: true
  },
  {
    id: 'gem-cost',
    name: 'Cost & Operations Analyst',
    description: 'Mining cost breakdown with latest diesel Rp6,800/L, logistics optimization',
    systemPrompt: COST_SYSTEM_PROMPT,
    isDefault: true
  },
  {
    id: 'gem-comprehensive',
    name: 'Comprehensive Mining Analyst',
    description: 'Coal · ESDM · Cost Rp6,800/L · Valuation — all-in-one integrated analysis',
    systemPrompt: COMPREHENSIVE_SYSTEM_PROMPT,
    isDefault: true
  }
];
let gemCounter = 1;

function getGemById(id) {
  return gems.find(g => g.id === id);
}

app.get('/api/gems', (req, res) => {
  res.json({ gems });
});

app.post('/api/gems', (req, res) => {
  try {
    const { id, name, description, systemPrompt } = req.body;
    if (!name || !systemPrompt) return res.status(400).json({ error: 'Name and system prompt required' });

    if (id) {
      const existing = getGemById(id);
      if (!existing) return res.status(404).json({ error: 'Gem not found' });
      existing.name = name;
      existing.description = description || '';
      existing.systemPrompt = systemPrompt;
      res.json({ success: true, gem: existing, gems });
    } else {
      const newGem = {
        id: 'gem-' + (++gemCounter),
        name,
        description: description || '',
        systemPrompt,
        isDefault: false
      };
      gems.push(newGem);
      res.json({ success: true, gem: newGem, gems });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/gems/:id', (req, res) => {
  const gem = getGemById(req.params.id);
  if (!gem) return res.status(404).json({ error: 'Gem not found' });
  if (gem.isDefault) return res.status(400).json({ error: 'Cannot delete default gem' });
  gems = gems.filter(g => g.id !== req.params.id);
  res.json({ success: true, gems });
});

app.post('/api/ai/query', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;
    const result = await aiProvider.callAI(message, systemPrompt || 'You are a Senior Mining Geologist and Investment Analyst specializing in Indonesian mineral deposits.', { maxTokens: 1500 });
    if (result) {
      res.json({ response: result, provider: aiProvider.getActiveProvider() });
    } else {
      res.status(400).json({ error: 'No AI provider configured. Add an API key in Settings.', provider: aiProvider.getActiveProvider() });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ai/providers', (req, res) => {
  res.json({ providers: aiProvider.getProviders(), activeProvider: aiProvider.getActiveProvider() });
});

app.post('/api/ai/configure', (req, res) => {
  try {
    const { provider, apiKey, setActive } = req.body;
    if (provider && apiKey) aiProvider.setApiKey(provider, apiKey);
    if (setActive && provider) aiProvider.setActiveProvider(provider);
    res.json({ success: true, providers: aiProvider.getProviders(), activeProvider: aiProvider.getActiveProvider() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/ai/test', async (req, res) => {
  try {
    const { provider, model } = req.body;
    const result = await aiProvider.testConnection(provider, model);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Mine Analysis App running on http://localhost:${PORT}`);
    const providers = aiProvider.getProviders();
    const active = providers.find(p => p.active);
    console.log(`AI: ${providers.filter(p => p.configured).length} provider(s) configured · Active: ${active ? active.name : 'none (using local analysis)'}`);
  });
}

module.exports = app;
