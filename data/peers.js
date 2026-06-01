const peers = [
  {
    name: "PT Vale Indonesia Tbk (INCO)",
    ticker: "IDX: INCO",
    commodity: "Nickel Laterite",
    marketCap: 48.5e12,
    evPerTonneResource: 18.2,
    evPerTonneReserve: 44.5,
    productionKt: 71,
    cashCostPerLb: 2.85,
    allInCostPerLb: 3.65,
    marginPct: 42,
    country: "Indonesia",
    notes: "Integrated nickel miner with matte production. 30-year track record.",
    source: "PT Vale Annual Report 2025"
  },
  {
    name: "PT Freeport Indonesia",
    ticker: "Private (90% PT-FI, 10% GOI)",
    commodity: "Gold, Copper",
    marketCap: null,
    evPerTonneResource: 15.8,
    evPerTonneReserve: 46.2,
    productionKt: 480,
    cashCostPerLb: 1.42,
    allInCostPerLb: 1.95,
    marginPct: 58,
    country: "Indonesia",
    notes: "World-class copper-gold producer. Lowest cost quartile globally.",
    source: "FCX Annual Report 2025"
  },
  {
    name: "PT Amman Mineral Nusa Tenggara",
    ticker: "Private",
    commodity: "Gold, Copper",
    marketCap: null,
    evPerTonneResource: 12.4,
    evPerTonneReserve: 32.8,
    productionKt: 220,
    cashCostPerLb: 1.65,
    allInCostPerLb: 2.20,
    marginPct: 52,
    country: "Indonesia",
    notes: "Second largest copper-gold mine in Indonesia. Expansion underway.",
    source: "Amman Mineral Report 2025"
  },
  {
    name: "PT Adaro Energy Tbk (ADRO)",
    ticker: "IDX: ADRO",
    commodity: "Coal (Thermal)",
    marketCap: 42.1e12,
    evPerTonneResource: 4.8,
    evPerTonneReserve: 12.2,
    productionKt: 62500,
    cashCostPerTonne: 38,
    allInCostPerTonne: 52,
    marginPct: 45,
    country: "Indonesia",
    notes: "Low-cost thermal coal producer. Ultra-low sulfur product commanding premium.",
    source: "Adaro Annual Report 2025"
  },
  {
    name: "PT Bumi Resources Tbk (BUMI)",
    ticker: "IDX: BUMI",
    commodity: "Coal (Thermal)",
    marketCap: 18.7e12,
    evPerTonneResource: 3.2,
    evPerTonneReserve: 8.9,
    productionKt: 78500,
    cashCostPerTonne: 45,
    allInCostPerTonne: 62,
    marginPct: 32,
    country: "Indonesia",
    notes: "Indonesia's largest thermal coal producer by volume.",
    source: "Bumi Resources Annual Report 2025"
  },
  {
    name: "PT Aneka Tambang Tbk (ANTM)",
    ticker: "IDX: ANTM",
    commodity: "Nickel, Gold, Bauxite",
    marketCap: 35.2e12,
    evPerTonneResource: 8.5,
    evPerTonneReserve: 21.3,
    productionKt: 25,
    cashCostPerLb: 3.10,
    allInCostPerLb: 4.20,
    marginPct: 28,
    country: "Indonesia",
    notes: "State-linked diversified miner. Growing nickel downstream exposure.",
    source: "Antam Annual Report 2025"
  },
  {
    name: "PT Merdeka Copper Gold Tbk (MDKA)",
    ticker: "IDX: MDKA",
    commodity: "Gold, Copper",
    marketCap: 52.8e12,
    evPerTonneResource: 22.5,
    evPerTonneReserve: 58.6,
    productionKt: 28,
    cashCostPerOunceAu: 950,
    allInCostPerOunceAu: 1350,
    marginPct: 38,
    country: "Indonesia",
    notes: "Fast-growing gold-copper producer with Tujuh Bukit operation.",
    source: "Merdeka Copper Gold Annual Report 2025"
  },
  {
    name: "PT United Tractors Tbk (UNTR)",
    ticker: "IDX: UNTR",
    commodity: "Coal (Thermal), Gold",
    marketCap: 65.4e12,
    evPerTonneResource: 5.5,
    evPerTonneReserve: 14.8,
    productionKt: 12500,
    cashCostPerTonne: 42,
    allInCostPerTonne: 58,
    marginPct: 35,
    country: "Indonesia",
    notes: "Diversified mining and heavy equipment group.",
    source: "United Tractors Annual Report 2025"
  },
  {
    name: "PT Trimegah Bangun Persada Tbk (NCKL)",
    ticker: "IDX: NCKL",
    commodity: "Nickel Laterite",
    marketCap: 42.5e12,
    evPerTonneResource: 14.5,
    evPerTonneReserve: 36.8,
    productionKt: 38,
    cashCostPerLb: 2.95,
    allInCostPerLb: 4.50,
    marginPct: 25,
    country: "Indonesia",
    notes: "Growing nickel producer with HPAL operations in Obi Island.",
    source: "Trimegah Annual Report 2025"
  },
  {
    name: "PT Harum Energy Tbk (HRUM)",
    ticker: "IDX: HRUM",
    commodity: "Coal (Thermal), Nickel",
    marketCap: 28.3e12,
    evPerTonneResource: 4.2,
    evPerTonneReserve: 11.5,
    productionKt: 8500,
    cashCostPerTonne: 44,
    allInCostPerTonne: 60,
    marginPct: 30,
    country: "Indonesia",
    notes: "Coal miner diversifying into nickel downstream via HPAL.",
    source: "Harum Energy Annual Report 2025"
  }
];

function getPeersByCommodity(commodity) {
  if (!commodity) return peers;
  const comm = commodity.toLowerCase();
  return peers.filter(p => p.commodity.toLowerCase().includes(comm) || comm.includes(p.commodity.toLowerCase()));
}

function getPeerAverage(commodity) {
  const relevant = getPeersByCommodity(commodity);
  if (relevant.length === 0) return null;

  const avgEvResource = relevant.filter(p => p.evPerTonneResource).reduce((s, p) => s + p.evPerTonneResource, 0) / relevant.filter(p => p.evPerTonneResource).length;
  const avgEvReserve = relevant.filter(p => p.evPerTonneReserve).reduce((s, p) => s + p.evPerTonneReserve, 0) / relevant.filter(p => p.evPerTonneReserve).length;
  const avgMargin = relevant.filter(p => p.marginPct).reduce((s, p) => s + p.marginPct, 0) / relevant.filter(p => p.marginPct).length;

  return {
    count: relevant.length,
    avgEvPerTonneResource: avgEvResource,
    avgEvPerTonneReserve: avgEvReserve,
    avgMarginPct: avgMargin,
    peers: relevant
  };
}

module.exports = { getPeersByCommodity, getPeerAverage, peers };
