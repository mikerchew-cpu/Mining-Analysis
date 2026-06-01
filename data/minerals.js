const mineralPotential = {
  "Sulawesi": {
    region: "Sulawesi",
    provinces: ["Sulawesi Selatan", "Sulawesi Tenggara", "Sulawesi Tengah"],
    primaryCommodities: ["Nickel Laterite", "Gold", "Iron Sand"],
    belt: "Indonesian Sulawesi Ophiolite Belt",
    geology: "Ultramafic rocks hosting lateritic nickel deposits. Polymetallic sulphide systems in volcanic arcs.",
    potentialRating: "Very High",
    keyDeposits: ["Sorowako", "Pomalaa", "Blok Mandiodo"],
    description: "The Sulawesi nickel belt is one of the world's major lateritic nickel provinces, hosting both saprolite and limonite zones with significant cobalt credits."
  },
  "Papua": {
    region: "Papua",
    provinces: ["Papua Tengah", "Papua Pegunungan"],
    primaryCommodities: ["Gold", "Copper", "Silver", "Molybdenum"],
    belt: "Central Range Orogenic Belt",
    geology: "Porphyry copper-gold systems associated with Pliocene dioritic intrusions into sedimentary sequences.",
    potentialRating: "Extremely High",
    keyDeposits: ["Grasberg", "Ertsberg"],
    description: "The Papuan porphyry belt hosts some of the world's largest gold-copper deposits. High-grade skarn and porphyry systems."
  },
  "Kalimantan": {
    region: "Kalimantan",
    provinces: ["Kalimantan Timur", "Kalimantan Selatan", "Kalimantan Tengah", "Kalimantan Barat"],
    primaryCommodities: ["Coal (Thermal)", "Coal (Coking)", "Gold", "Bauxite", "Iron Ore"],
    belt: "Barito & Kutai Basins / Central Kalimantan Gold Belt",
    geology: "Tertiary sedimentary basins hosting extensive coal seams. Orogenic gold systems in the Central Kalimantan Metamorphic Belt.",
    potentialRating: "Very High",
    keyDeposits: ["Sangatta", "Tutupan", "Kelian"],
    description: "Kalimantan hosts Indonesia's largest coal reserves in the Kutai and Barito basins, plus significant orogenic gold deposits."
  },
  "Maluku Utara": {
    region: "Maluku Utara",
    provinces: ["Maluku Utara"],
    primaryCommodities: ["Nickel Laterite", "Cobalt", "Gold"],
    belt: "Halmahera Arc",
    geology: "Volcanic arc systems with both lateritic nickel and epithermal gold mineralization. HPAL-ready nickel-cobalt deposits.",
    potentialRating: "High",
    keyDeposits: ["Wedabay", "Gosowong"],
    description: "Halmahera Island is emerging as a world-class nickel-cobalt province with large tonnage laterite deposits suitable for HPAL processing."
  },
  "Nusa Tenggara": {
    region: "Nusa Tenggara Barat",
    provinces: ["Nusa Tenggara Barat", "Nusa Tenggara Timur"],
    primaryCommodities: ["Gold", "Copper", "Manganese", "Iron Ore"],
    belt: "Sunda-Banda Arc",
    geology: "Porphyry copper-gold and epithermal gold systems associated with Neogene volcanic arcs.",
    potentialRating: "High",
    keyDeposits: ["Batu Hijau", "Elang"],
    description: "The Sumbawa-Flores arc hosts significant porphyry copper-gold deposits and epithermal gold systems."
  },
  "Sumatera": {
    region: "Sumatera",
    provinces: ["Sumatera Utara", "Sumatera Barat", "Sumatera Selatan", "Aceh", "Jambi", "Lampung"],
    primaryCommodities: ["Gold", "Silver", "Coal", "Bauxite", "Tin"],
    belt: "Sumatera Volcanic Arc / Ombilin Basin",
    geology: "Epithermal gold-silver systems along the Sumatera volcanic arc, Tertiary coal basins, and granitic tin belts.",
    potentialRating: "Medium-High",
    keyDeposits: ["Martabe", "Ombilin", "Tangse"],
    description: "Sumatera hosts significant epithermal gold deposits, Tertiary coal measures, and bauxite laterites."
  }
};

function getMineralPotential(mine) {
  if (!mine) return null;

  const province = mine.province;
  const commodity = mine.commodity;

  for (const key of Object.keys(mineralPotential)) {
    const region = mineralPotential[key];
    if (region.provinces.some(p => province.includes(p)) || province.includes(region.region)) {
      return region;
    }
  }

  for (const key of Object.keys(mineralPotential)) {
    const region = mineralPotential[key];
    if (commodity && region.primaryCommodities.some(c => commodity.toLowerCase().includes(c.toLowerCase()))) {
      return region;
    }
  }

  return null;
}

function getCommodityPrice(commodity) {
  const prices = {
    "Nickel Laterite": { usdPerDryMetricTon: 45, unit: "USD/wmt (1.8% Ni basis)", source: "LME Nickel - ICMM, May 2026" },
    "Nickel": { usdPerDryMetricTon: 45, unit: "USD/wmt (1.8% Ni basis)", source: "LME Nickel - ICMM, May 2026" },
    "Gold": { usdPerOunce: 3250, unit: "USD/oz", source: "LBMA Gold Price, May 2026" },
    "Copper": { usdPerTonne: 9850, unit: "USD/tonne", source: "LME Copper, May 2026" },
    "Silver": { usdPerOunce: 35.5, unit: "USD/oz", source: "LBMA Silver Price, May 2026" },
    "Cobalt": { usdPerTonne: 28500, unit: "USD/tonne", source: "LME Cobalt, May 2026" },
    "Coal (Thermal)": { usdPerTonne: 135, unit: "USD/tonne (FOB Kalimantan)", source: "Platts ICI 4, May 2026" },
    "Coal": { usdPerTonne: 135, unit: "USD/tonne (FOB Kalimantan)", source: "Platts ICI 4, May 2026" },
    "Bauxite": { usdPerDryMetricTon: 32, unit: "USD/wmt", source: "Alumina Limited, May 2026" },
    "Iron Ore": { usdPerDryMetricTon: 108, unit: "USD/dmt (Fe 62%)", source: "SGX Iron Ore, May 2026" }
  };

  for (const key of Object.keys(prices)) {
    if (commodity && commodity.toLowerCase().includes(key.toLowerCase())) {
      return prices[key];
    }
  }

  return { usdPerTonne: 100, unit: "USD/tonne (estimated)", source: "Industry estimate" };
}

module.exports = { getMineralPotential, getCommodityPrice, mineralPotential };
