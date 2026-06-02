const axios = require('axios');

const WIUP_URL = 'https://gis.bnpb.go.id/server/rest/services/thematic/Peta_Wilayah_Izin_Usaha_Pertambangan/MapServer/0/query';
const OUT_FIELDS = 'NMOPRT,COMMDT,PROV,KAB,STATUS,SKBLOK,TIPTMB,DATSTR,DATEND,LUBLOK,LOCATE,IDBLOK';

const COMMODITY_MAP = {
  'NIKEL': 'Nickel Laterite',
  'EMAS': 'Gold',
  'TEMBAGA': 'Copper',
  'EMAS,TEMBAGA': 'Gold, Copper',
  'BATUBARA': 'Coal (Thermal)',
  'PERAK': 'Silver',
  'TIMAH': 'Tin',
  'BIJIH BESI': 'Iron Ore',
  'BAUKSIT': 'Bauxite',
  'MANGAN': 'Manganese',
  'ANDESIT': 'Andesite',
  'MAR MER': 'Marble',
  'GRANIT': 'Granite',
  'PASIR, BATU, KERIKIL': 'Sand, Gravel',
  'BATU DAN PASIR': 'Stone and Sand',
  'NIKEL,KOBALT': 'Nickel Laterite, Cobalt',
  'NIKEL,COBALT': 'Nickel Laterite, Cobalt',
};

function mapCommodity(idcmd) {
  return COMMODITY_MAP[idcmd] || idcmd || 'Unknown';
}

function mapStatus(status) {
  if (!status) return 'Under Review';
  const s = status.toUpperCase();
  if (s.includes('OPERASI') || s.includes('EKSPLOITASI')) return 'Active';
  if (s.includes('EKSPLORASI')) return 'Exploration';
  if (s.includes('STUDI')) return 'Exploration';
  if (s.includes('KONSTRUKSI')) return 'Under Review';
  return 'Under Review';
}

function mapValidity(status) {
  if (!status) return 'Under Review';
  const s = status.toUpperCase();
  if (s.includes('OPERASI') || s.includes('EKSPLOITASI')) return 'Valid';
  if (s.includes('EKSPLORASI')) return 'Valid';
  if (s.includes('STUDI')) return 'Valid';
  return 'Under Review';
}

function parseDate(ts) {
  if (!ts) return null;
  return new Date(ts).toISOString().split('T')[0];
}

async function searchMines(query) {
  try {
    const where = `UPPER(NMOPRT) LIKE UPPER('%25${encodeURIComponent(query)}%25') OR UPPER(COMMDT) LIKE UPPER('%25${encodeURIComponent(query)}%25') OR UPPER(PROV) LIKE UPPER('%25${encodeURIComponent(query)}%25') OR UPPER(KAB) LIKE UPPER('%25${encodeURIComponent(query)}%25') OR UPPER(SKBLOK) LIKE UPPER('%25${encodeURIComponent(query)}%25') OR UPPER(IDBLOK) LIKE UPPER('%25${encodeURIComponent(query)}%25')`;
    const url = `${WIUP_URL}?where=${where}&outFields=${OUT_FIELDS}&returnGeometry=false&f=json&resultRecordCount=50`;
    const resp = await axios.get(url, { timeout: 15000 });
    const features = resp.data.features || [];
    return features.map(f => {
      const a = f.attributes;
      return {
        id: a.IDBLOK || '',
        name: a.NMOPRT || 'Unknown',
        company: a.NMOPRT || '',
        province: a.PROV || '',
        regency: a.KAB || '',
        commodity: mapCommodity(a.COMMDT),
        status: mapStatus(a.STATUS),
        validity: mapValidity(a.STATUS),
        iupNumber: a.SKBLOK || '',
        areaHa: a.LUBLOK || 0,
        location: a.LOCATE || '',
        stage: a.STATUS || '',
        licenseType: a.TIPTMB || '',
        startDate: parseDate(a.DATSTR),
        expiryDate: parseDate(a.DATEND),
        resourceMt: 0,
        reserveMt: 0,
        srRatio: 5,
        distanceFromPort: 50,
        latitude: 0,
        longitude: 0,
        elevation: 100,
        gradeNi: 0,
        gradeAu_gpt: 0,
        gradeCu_pct: 0,
        description: `${a.NMOPRT || ''} - ${mapCommodity(a.COMMDT)} in ${a.PROV || ''}, ${a.KAB || ''}. Status: ${a.STATUS || 'N/A'}. IUP: ${a.SKBLOK || 'N/A'}. Area: ${(a.LUBLOK || 0).toLocaleString()} Ha.`,
        infrastructure: [],
        source: 'esdm'
      };
    });
  } catch (err) {
    console.error('ESDM search error:', err.message);
    return null;
  }
}

async function searchMinesByCompany(company) {
  return searchMines(company);
}

module.exports = { searchMines, searchMinesByCompany };
