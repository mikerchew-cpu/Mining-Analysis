require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const { findMine, getAllMines } = require('./data/mines');
const { getMineralPotential, getCommodityPrice } = require('./data/minerals');
const { getPeerAverage, getPeersByCommodity } = require('./data/peers');

const app = express();
const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: path.join(__dirname, 'uploads') });

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

async function getDeepSeekAnalysis(mineData, esdmData, mineralData, costData, peerData, valuationData) {
  if (!DEEPSEEK_API_KEY) {
    return getLocalRecommendation(mineData, esdmData, mineralData, costData, peerData, valuationData);
  }

  const prompt = generateValePrompt(mineData, esdmData, mineralData, costData, peerData, valuationData);

  try {
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are a Senior Geologist with 30 years of experience at PT Vale Indonesia (formerly PT Inco). You have been with the company since the early Sorowako days. You are an expert in Indonesian mineral deposits, particularly nickel laterites, porphyry copper-gold systems, and coal deposits. Your analysis is thorough, data-driven, and reflects decades of field experience across the Indonesian archipelago. You write in a professional, authoritative tone with specific technical details. Always provide clear investment recommendations: Strong Buy, Buy, Hold, or Sell."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2048,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('DeepSeek API error:', error.message);
    return getLocalRecommendation(mineData, esdmData, mineralData, costData, peerData, valuationData);
  }
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
- Implied EV from Resource: $${valuation.impliedEvFromResource.toLocaleString()}
- Implied EV from Reserve: $${valuation.impliedEvFromReserve.toLocaleString()}
- Peer Avg EV/Resource Tonne: $${peer.avgEvPerTonneResource}
- Peer Avg EV/Reserve Tonne: $${peer.avgEvPerTonneReserve}

**PEER CONTEXT:**
${peer.peers.slice(0, 5).map(p => `- ${p.name}: ${p.commodity}, Margin ${p.marginPct}%`).join('\n')}

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

**Peer Group:** ${peer.peers.slice(0, 3).map(p => p.name).join(', ')}
**Industry Avg EV/Resource Tonne:** $${peer.avgEvPerTonneResource.toFixed(1)}
**Industry Avg EV/Reserve Tonne:** $${peer.avgEvPerTonneReserve.toFixed(1)}

**Implied Valuation:**
- From Resource: $${(valuation.impliedEvFromResource / 1e6).toFixed(0)}M
- From Reserve: $${(valuation.impliedEvFromReserve / 1e6).toFixed(0)}M
- Average: $${(valuation.avgImpliedEV / 1e6).toFixed(0)}M

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

    const recommendation = await getDeepSeekAnalysis(mine, esdmData, mineralData, costData, peerData, valuationData);

    res.json({
      success: true,
      mine,
      esdm: esdmData,
      mineral: mineralData ? { ...mineralData, commodityPrice } : { commodityPrice },
      cost: costData,
      peerComparison: peerData,
      valuation: valuationData,
      recommendation,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/mines', (req, res) => {
  res.json({ mines: getAllMines().map(m => ({ name: m.name, company: m.company, province: m.province, commodity: m.commodity, status: m.status })) });
});

app.post('/api/deepseek-query', async (req, res) => {
  if (!DEEPSEEK_API_KEY) {
    return res.status(400).json({ error: 'DeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env file.' });
  }

  try {
    const { message } = req.body;
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are a Senior Mining Geologist and Investment Analyst specializing in Indonesian mineral deposits."
        },
        { role: "user", content: message }
      ],
      max_tokens: 1500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ response: response.data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Mine Analysis App running on http://localhost:${PORT}`);
  console.log(`DeepSeek API: ${DEEPSEEK_API_KEY ? 'Configured' : 'NOT configured (using local analysis)'}`);
});
