let lastResult = null;
let providersCache = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadMineList();
  loadProviders();
});

function initTabs() {
  document.querySelectorAll('.tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.input-section, .results-section') || tab.closest('div');
      const container = parent.querySelector('.tabs') || tab.closest('.tabs').parentElement;
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      container.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');
    });
  });

  document.querySelectorAll('#resultTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#resultTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.querySelectorAll('.results-section .tab-content').forEach(tc => tc.classList.remove('active'));
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');
    });
  });
}

let allMines = [];

async function loadMineList() {
  try {
    const resp = await fetch('/api/mines');
    const data = await resp.json();
    allMines = data.mines || [];
    const list = document.getElementById('mineList');
    list.innerHTML = '';
    allMines.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      list.appendChild(opt);
    });
    renderBrowseMines(allMines);
  } catch (e) { console.error('Failed to load mine list', e); }
}

function renderBrowseMines(mines) {
  const browse = document.getElementById('browseList');
  browse.innerHTML = '';
  if (mines.length === 0) {
    browse.innerHTML = '<p style="color:var(--text-light);grid-column:1/-1;">No mines match your search.</p>';
    return;
  }
  mines.forEach(m => {
    const card = document.createElement('div');
    card.className = 'peer-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="pname">${m.name}</div>
      <div class="pdetail">${m.company} · ${m.commodity}</div>
      <div class="pdetail" style="font-size:0.75rem;">${m.province} · <span class="badge ${m.status === 'Active' ? 'badge-success' : m.status === 'Exploration' ? 'badge-info' : 'badge-warning'}">${m.status}</span></div>
    `;
    card.onclick = () => {
      document.getElementById('mineName').value = m.name;
      document.querySelector('[data-tab="quick"]').click();
      analyzeMine();
    };
    browse.appendChild(card);
  });
}

function filterBrowseMines() {
  const q = document.getElementById('browseSearch').value.trim().toLowerCase();
  if (!q) { renderBrowseMines(allMines); return; }
  const filtered = allMines.filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.company || '').toLowerCase().includes(q) ||
    (m.commodity || '').toLowerCase().includes(q) ||
    (m.province || '').toLowerCase().includes(q)
  );
  renderBrowseMines(filtered);
}

async function loadProviders() {
  try {
    const resp = await fetch('/api/ai/providers');
    const data = await resp.json();
    providersCache = data;
    updateProviderStatus(data);
  } catch(e) { console.error('Failed to load providers', e); }
}

function updateProviderStatus(data) {
  const el = document.getElementById('aiProviderStatus');
  if (!data || !data.providers) { el.innerHTML = '<span class="dot yellow"></span> AI: Local Analysis'; return; }
  const active = data.providers.find(p => p.active);
  const configured = data.providers.filter(p => p.configured);
  if (configured.length === 0) {
    el.innerHTML = '<span class="dot yellow"></span> AI: Local Analysis';
  } else if (active && active.configured) {
    el.innerHTML = `<span class="dot green"></span> AI: ${active.name}`;
  } else {
    el.innerHTML = `<span class="dot yellow"></span> AI: ${active ? active.name + ' (no key)' : 'Local'}`;
  }
}

function toggleSettings() {
  const modal = document.getElementById('settingsModal');
  modal.classList.toggle('active');
  if (modal.classList.contains('active')) renderProviderSettings();
}

async function renderProviderSettings() {
  const el = document.getElementById('providersList');
  let providers = providersCache?.providers;
  if (!providers) {
    const resp = await fetch('/api/ai/providers');
    const data = await resp.json();
    providersCache = data;
    providers = data.providers;
  }
  el.innerHTML = providers.map(p => `
    <div class="provider-card ${p.active ? 'active' : ''}" id="pcard-${p.id}">
      <div class="pheader">
        <div class="pname">
          ${p.id === 'deepseek' ? '🧠' : '🔮'} ${p.name}
          ${p.active ? '<span class="badge badge-success">Active</span>' : ''}
          ${p.configured ? '<span class="badge badge-info">Key Set</span>' : '<span class="badge badge-warning">No Key</span>'}
        </div>
        <div class="pmodels">${p.models.join(', ')}</div>
      </div>
      <div class="pkey">
        <input type="password" id="key-${p.id}" placeholder="${p.configured ? 'API key saved (enter to change)' : 'Enter ' + p.name + ' API key...'}" value="">
        <button class="btn btn-small btn-primary" onclick="saveKey('${p.id}')">Save</button>
      </div>
      <div class="pactions">
        <button class="btn btn-small btn-secondary" onclick="testProvider('${p.id}')">🔌 Test Connection</button>
        <button class="btn btn-small ${p.active ? 'btn-accent' : 'btn-secondary'}" onclick="setActive('${p.id}')">${p.active ? '✓ Active' : 'Set Active'}</button>
        <a href="${p.docsUrl}" target="_blank" class="btn btn-small btn-secondary" style="text-decoration:none;">📄 Get Key</a>
      </div>
      <div id="testResult-${p.id}"></div>
    </div>
  `).join('');
}

async function saveKey(provider) {
  const input = document.getElementById('key-' + provider);
  const key = input.value.trim();
  if (!key) return;
  const resp = await fetch('/api/ai/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey: key, setActive: true })
  });
  const data = await resp.json();
  providersCache = data;
  updateProviderStatus(data);
  renderProviderSettings();
  input.value = '';
}

async function setActive(provider) {
  const resp = await fetch('/api/ai/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, setActive: true })
  });
  const data = await resp.json();
  providersCache = data;
  updateProviderStatus(data);
  renderProviderSettings();
}

async function testProvider(provider) {
  const el = document.getElementById('testResult-' + provider);
  el.innerHTML = '<div class="test-result pending">⏳ Testing connection...</div>';
  const resp = await fetch('/api/ai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider })
  });
  const data = await resp.json();
  if (data.success) {
    el.innerHTML = `<div class="test-result success">✅ Connected to ${data.provider} (${data.model})</div>`;
  } else if (data.status === 'no_key') {
    el.innerHTML = `<div class="test-result error">⚠️ No API key configured. Enter a key and try again.</div>`;
  } else {
    el.innerHTML = `<div class="test-result error">❌ Connection failed: ${data.error}</div>`;
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) processUploadFile(e.dataTransfer.files[0]);
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) processUploadFile(e.target.files[0]);
}

async function processUploadFile(file) {
  const zone = document.getElementById('uploadZone');
  const preview = document.getElementById('uploadPreview');
  zone.style.display = 'none';
  preview.style.display = 'block';
  preview.innerHTML = '<div class="test-result pending">⏳ Parsing file...</div>';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const resp = await fetch('/api/upload/parse', { method: 'POST', body: formData });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    if (data.count === 0) {
      preview.innerHTML = '<div class="test-result error">No mine records found in file.</div>';
      return;
    }

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
      <span style="font-weight:600;">${data.count} mine(s) parsed from ${file.name}</span>
      <span style="font-size:0.8rem;color:var(--text-light);">Select a mine to analyze:</span>
    </div>
    <div class="preview-table-wrap">
    <table class="preview-table">
      <thead><tr><th></th><th>Name</th><th>Company</th><th>Commodity</th><th>Province</th><th>Status</th><th>Resource (Mt)</th><th>Reserve (Mt)</th><th>SR</th></tr></thead>
      <tbody>`;

    data.mines.forEach((m, i) => {
      html += `<tr onclick="analyzeUploadedMine(${i})" style="cursor:pointer;">
        <td>${i + 1}</td>
        <td><strong>${m.name}</strong></td>
        <td style="font-size:0.8rem;">${m.company || '-'}</td>
        <td><span class="tag ${getCommodityClass(m.commodity)}">${m.commodity || '-'}</span></td>
        <td style="font-size:0.8rem;">${m.province || '-'}</td>
        <td><span class="badge ${m.status === 'Active' ? 'badge-success' : 'badge-warning'}">${m.status}</span></td>
        <td>${m.resourceMt || 0}</td>
        <td>${m.reserveMt || 0}</td>
        <td>${m.srRatio}:1</td>
      </tr>`;
    });

    html += `</tbody></table></div>
      <div style="margin-top:1rem;display:flex;gap:0.75rem;align-items:center;">
        <button class="btn btn-secondary" onclick="resetUpload()">← Upload Different File</button>
      </div>`;

    preview.innerHTML = html;
    window._uploadedMines = data.mines;
  } catch (e) {
    preview.innerHTML = `<div class="test-result error">❌ ${e.message}</div>
      <div style="margin-top:0.75rem;"><button class="btn btn-secondary" onclick="resetUpload()">← Try Again</button></div>`;
  }
}

function analyzeUploadedMine(index) {
  const mines = window._uploadedMines;
  if (!mines || !mines[index]) return;
  const mine = mines[index];
  const body = {
    mineName: mine.name,
    company: mine.company,
    province: mine.province,
    regency: mine.regency,
    commodity: mine.commodity,
    status: mine.status,
    validity: mine.validity,
    resourceMt: mine.resourceMt,
    reserveMt: mine.reserveMt,
    srRatio: mine.srRatio,
    distanceFromPort: mine.distanceFromPort,
    latitude: mine.latitude,
    longitude: mine.longitude,
    elevation: mine.elevation,
    areaHa: mine.areaHa,
    description: mine.description,
    infrastructure: (mine.infrastructure || []).join(','),
    gradeNi: mine.gradeNi,
    gradeAu_gpt: mine.gradeAu_gpt,
    gradeCu_pct: mine.gradeCu_pct,
    calorificValue_kcal: mine.calorificValue_kcal
  };
  runAnalysis(body);
}

function resetUpload() {
  document.getElementById('uploadZone').style.display = 'block';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('fileInput').value = '';
  window._uploadedMines = null;
}

function downloadSampleCsv() {
  const headers = 'name,company,province,regency,commodity,status,resource_mt,reserve_mt,sr_ratio,distance_from_port,grade_ni,grade_au,grade_cu,description';
  const rows = [
    'Bongkasa Pertamina,PT Bumi Mineral,Sulawesi Tenggara,Konawe Utara,Nickel Laterite,Exploration,35.2,12.8,7.5,42,1.62,,,Nickel laterite prospect in Southeast Sulawesi',
    'Cibaliung Hulu,PT Aneka Tambang,Banten,Pandeglang,Gold,Active,2.8,1.2,4.8,85,,4.2,,Epithermal gold deposit in West Java',
    'Kelian Equatorial,PT Kelian Equatorial Mining,Kalimantan Timur,Kutai Barat,Gold,Closed,18.5,0,6.2,120,,1.8,,Historic open-pit gold mine, now closed'
  ];
  const csv = headers + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sample_mine_data.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function clearForm() {
  document.getElementById('mineName').value = '';
  document.getElementById('qCompany').value = '';
  document.getElementById('qProvince').value = '';
}

function clearManual() {
  ['mName','mProvince','mRegency','mResource','mReserve','mDist','mDesc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('mCommodity').value = '';
  document.getElementById('mSR').value = '5.0';
}

async function analyzeMine() {
  const mineName = document.getElementById('mineName').value.trim();
  if (!mineName) { alert('Please enter a mine name'); return; }
  const body = { mineName };
  const qc = document.getElementById('qCompany').value.trim();
  const qp = document.getElementById('qProvince').value.trim();
  if (qc) body.company = qc;
  if (qp) body.province = qp;
  await runAnalysis(body);
}

async function analyzeManual() {
  const body = {
    mineName: document.getElementById('mName').value.trim(),
    commodity: document.getElementById('mCommodity').value,
    province: document.getElementById('mProvince').value.trim(),
    regency: document.getElementById('mRegency').value.trim(),
    status: document.getElementById('mStatus').value,
    validity: document.getElementById('mValidity').value,
    resourceMt: document.getElementById('mResource').value,
    reserveMt: document.getElementById('mReserve').value,
    srRatio: document.getElementById('mSR').value,
    distanceFromPort: document.getElementById('mDist').value,
    description: document.getElementById('mDesc').value.trim(),
    company: document.getElementById('qCompany').value.trim()
  };
  if (!body.mineName) { alert('Please enter a mine name'); return; }
  await runAnalysis(body);
}

async function runAnalysis(body) {
  const loading = document.getElementById('loading');
  const results = document.getElementById('results');
  loading.classList.add('active');
  results.classList.remove('active');

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    lastResult = data;
    renderResults(data);
    results.classList.add('active');
  } catch (e) {
    alert('Analysis error: ' + e.message);
  } finally {
    loading.classList.remove('active');
  }
}

function getCommodityClass(commodity) {
  if (!commodity) return 'tag-nickel';
  const c = commodity.toLowerCase();
  if (c.includes('nickel') || c.includes('cobalt')) return 'tag-nickel';
  if (c.includes('gold')) return 'tag-gold';
  if (c.includes('copper')) return 'tag-copper';
  if (c.includes('coal')) return 'tag-coal';
  if (c.includes('silver')) return 'tag-silver';
  return 'tag-nickel';
}

function renderResults(data) {
  const { mine, esdm, mineral, cost, peerComparison, valuation, recommendation } = data;

  const ratingMatch = recommendation.match(/\*\*Rating:\s*(.+?)\*\*/) || recommendation.match(/Verdict:\s*\*\*(.+?)\*\*/) || recommendation.match(/recommend a \*\*(.+?)\*\*/);
  const rating = ratingMatch ? ratingMatch[1].trim() : 'Hold';
  const scoreMatch = recommendation.match(/Overall Score:\s*(\d+)\/(\d+)/) || recommendation.match(/\*\*(\d+)\/(\d+)\*\*/);
  const score = scoreMatch ? scoreMatch[1] : '—';

  const recBox = document.getElementById('recBox');
  const ratingEl = document.getElementById('recRating');
  const subtitleEl = document.getElementById('recSubtitle');
  ratingEl.textContent = rating;
  if (rating.includes('Strong Buy') || rating === 'Strong Buy') {
    recBox.style.background = 'linear-gradient(135deg, #065f46, #059669)';
  } else if (rating.includes('Buy') || rating === 'Buy') {
    recBox.style.background = 'linear-gradient(135deg, #1e40af, #3b82f6)';
  } else if (rating.includes('Hold') || rating === 'Hold') {
    recBox.style.background = 'linear-gradient(135deg, #92400e, #f59e0b)';
  } else {
    recBox.style.background = 'linear-gradient(135deg, #991b1b, #ef4444)';
  }
  subtitleEl.textContent = `Score: ${score}/100 · ${mine.name} · ${mine.commodity} · ${mine.province} · Senior Geologist PT Vale Indonesia`;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="label">Mine</div>
      <div class="value">${mine.name}</div>
      <div class="sub">${mine.company} · <span class="tag ${getCommodityClass(mine.commodity)}">${mine.commodity}</span></div>
    </div>
    <div class="stat-card">
      <div class="label">ESDM Status</div>
      <div class="value"><span class="badge ${esdm.status === 'Active' ? 'badge-success' : esdm.status === 'Exploration' ? 'badge-info' : 'badge-warning'}">${esdm.status}</span></div>
      <div class="sub">Validity: <span class="badge ${esdm.validity === 'Valid' ? 'badge-success' : esdm.validity === 'Under Review' ? 'badge-warning' : 'badge-danger'}">${esdm.validity}</span> · <a href="${esdmSearchUrl(mine.name)}" target="_blank" style="color:var(--primary-light);font-size:0.75rem;">ESDM ↗</a></div>
    </div>
    <div class="stat-card">
      <div class="label">Resources / Reserves</div>
      <div class="value">${mine.resourceMt || '—'} Mt / ${mine.reserveMt || '—'} Mt</div>
      <div class="sub">SR: ${mine.srRatio}:1 · Grade: ${mine.gradeNi || mine.gradeAu_gpt || mine.calorificValue_kcal || 'N/A'}${mine.gradeNi ? '% Ni' : mine.gradeAu_gpt ? ' g/t Au' : mine.calorificValue_kcal ? ' kcal/kg' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Cost</div>
      <div class="value">$${cost.totalCostPerTonneUSD}/t</div>
      <div class="sub">Rp ${(cost.totalCostPerTonneIDR || 0).toLocaleString()} /tonne</div>
    </div>
    <div class="stat-card">
      <div class="label">Peer Avg Margin</div>
      <div class="value">${peerComparison ? peerComparison.avgMarginPct.toFixed(0) : '—'}%</div>
      <div class="sub">${peerComparison ? peerComparison.count : 0} comparable peers</div>
    </div>
    <div class="stat-card">
      <div class="label">Implied EV</div>
      <div class="value">$${valuation ? (valuation.avgImpliedEV / 1e6).toFixed(0) : '—'}M</div>
      <div class="sub">Resource: $${valuation ? (valuation.impliedEvFromResource / 1e6).toFixed(0) : '—'}M · Reserve: $${valuation ? (valuation.impliedEvFromReserve / 1e6).toFixed(0) : '—'}M</div>
    </div>
  `;

  renderESDM(mine, esdm);
  renderMineral(mine, mineral);
  renderCost(mine, cost);
  renderPeers(peerComparison);
  renderValuation(mine, valuation, cost);
  renderRecommendation(recommendation);
  renderAIChat();
}

function esdmSearchUrl(query) {
  return 'https://www.google.com/search?q=' + encodeURIComponent('site:esdm.go.id ' + query);
}

function renderESDM(mine, esdm) {
  const el = document.getElementById('tab-esdm');
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>🏛️ ESDM Mine Profile</h3>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
          <span class="badge badge-info">Verified ${new Date(esdm.verifiedAt).toLocaleDateString()}</span>
          <a href="${esdmSearchUrl(mine.name + ' ' + mine.company)}" target="_blank" class="btn btn-small btn-secondary" style="text-decoration:none;font-size:0.75rem;">🔍 Check ESDM</a>
        </div>
      </div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item"><div class="ilabel">Mine Name</div><div class="ivalue">${mine.name}</div></div>
          <div class="info-item"><div class="ilabel">IUP Number</div><div class="ivalue">${esdm.iupNumber || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Company</div><div class="ivalue">${esdm.company || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Status</div><div class="ivalue"><span class="badge ${esdm.status === 'Active' ? 'badge-success' : 'badge-warning'}">${esdm.status}</span></div></div>
          <div class="info-item"><div class="ilabel">Validity</div><div class="ivalue"><span class="badge ${esdm.validity === 'Valid' ? 'badge-success' : 'badge-danger'}">${esdm.validity}</span></div></div>
          <div class="info-item"><div class="ilabel">Expiry Date</div><div class="ivalue">${esdm.expiryDate || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Location</div><div class="ivalue">${esdm.location || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Coordinates</div><div class="ivalue">${esdm.coordinates || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Area</div><div class="ivalue">${esdm.areaHa ? esdm.areaHa.toLocaleString() + ' Ha' : 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Commodity</div><div class="ivalue"><span class="tag ${getCommodityClass(mine.commodity)}">${mine.commodity || 'N/A'}</span></div></div>
        </div>
      </div>
    </div>
    <div class="card" style="text-align:center;padding:0.75rem;">
      <p style="font-size:0.85rem;color:var(--text-light);margin:0;">
        <a href="${esdmSearchUrl(mine.name + ' IUP ' + esdm.iupNumber)}" target="_blank" style="color:var(--primary-light);">🔗 Search ESDM database for "${mine.name}"</a>
        &nbsp;·&nbsp;
        <a href="https://geoportal.esdm.go.id/minerba/" target="_blank" style="color:var(--primary-light);">🗺️ Minerba One Data Portal</a>
        &nbsp;·&nbsp;
        <a href="https://www.esdm.go.id" target="_blank" style="color:var(--primary-light);">🌐 esdm.go.id</a>
      </p>
    </div>
    <div class="card">
      <div class="card-header"><h3>📋 Mine Description</h3></div>
      <div class="card-body"><p style="line-height:1.7;">${mine.description || 'No description available.'}</p></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>🏗️ Infrastructure</h3></div>
      <div class="card-body">
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          ${(mine.infrastructure || ['No data']).map(i => `<span class="badge badge-info">${i}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderMineral(mine, mineral) {
  const el = document.getElementById('tab-mineral');
  const price = mineral && mineral.commodityPrice ? mineral.commodityPrice : {};
  const priceStr = price.usdPerOunce
    ? `$${price.usdPerOunce.toLocaleString()}/oz`
    : price.usdPerDryMetricTon
      ? `$${price.usdPerDryMetricTon}/wmt`
      : price.usdPerTonne
        ? `$${price.usdPerTonne.toLocaleString()}/tonne`
        : '—';

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>🗺️ Mineral Belt & Geological Context</h3>
        ${mineral ? `<span class="badge ${mineral.potentialRating.includes('Extremely') || mineral.potentialRating.includes('Very') ? 'badge-success' : 'badge-warning'}">${mineral.potentialRating} Potential</span>` : ''}
      </div>
      <div class="card-body">
        ${mineral ? `
        <div class="info-grid">
          <div class="info-item"><div class="ilabel">Mineral Belt</div><div class="ivalue">${mineral.belt || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Region</div><div class="ivalue">${mineral.region || 'N/A'}</div></div>
          <div class="info-item"><div class="ilabel">Primary Commodities</div><div class="ivalue">${(mineral.primaryCommodities || []).join(', ')}</div></div>
          <div class="info-item"><div class="ilabel">Key Deposits</div><div class="ivalue">${(mineral.keyDeposits || []).join(', ')}</div></div>
          <div class="info-item" style="grid-column:1/-1;"><div class="ilabel">Geological Setting</div><div class="ivalue" style="line-height:1.7;">${mineral.geology || 'N/A'}</div></div>
          <div class="info-item" style="grid-column:1/-1;"><div class="ilabel">Regional Assessment</div><div class="ivalue" style="line-height:1.7;">${mineral.description || 'N/A'}</div></div>
        </div>
        ` : `<p style="color:var(--text-light);">Regional mineral belt data not available for this location.</p>`}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>💰 Commodity Price</h3><span class="badge badge-info">${price.source || 'Market Data'}</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">
          <div class="stat-card" style="border:2px solid var(--accent);">
            <div class="label">${mine.commodity} Price</div>
            <div class="value" style="color:var(--accent);">${priceStr}</div>
            <div class="sub">${price.unit || ''}</div>
          </div>
          <div class="stat-card">
            <div class="label">Resources (${mine.commodity})</div>
            <div class="value">${mine.resourceMt || 0} Mt</div>
            <div class="sub">In situ value potential</div>
          </div>
          <div class="stat-card">
            <div class="label">Reserves (${mine.commodity})</div>
            <div class="value">${mine.reserveMt || 0} Mt</div>
            <div class="sub">Mineable inventory</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>📈 Indonesia Mining Resources Map</h3></div>
      <div class="card-body">
        <div class="map-placeholder">
          <span style="font-size:2rem;">🗺️</span>
          <span>Indonesia Mineral Belt Map — ${mineral ? mineral.belt || mineral.region : mine.province}</span>
          <span style="font-size:0.85rem;">${mine.commodity} · ${mine.resourceMt || 0} Mt Resource · ${mine.reserveMt || 0} Mt Reserve</span>
          <span style="font-size:0.8rem;color:var(--text-light);">Data source: ESDM Geological Agency · Ministry of Energy and Mineral Resources</span>
        </div>
      </div>
    </div>
  `;
}

function renderCost(mine, cost) {
  const el = document.getElementById('tab-cost');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>⛽ Mining Cost Breakdown</h3><span class="badge badge-info">Diesel: Rp ${(cost.dieselPricePerLiterIDR || 6800).toLocaleString()}/L · USD/IDR: ${(cost.usdToIDR || 16350).toLocaleString()}</span></div>
      <div class="card-body">
        <table class="cost-table">
          <thead><tr><th>Component</th><th>IDR/Tonne</th><th>USD/Tonne</th><th>% of Total</th></tr></thead>
          <tbody>
            ${(() => {
              const items = [
                { label: 'Mining Cost (Drill & Blast, Load, Haul within pit)', idr: cost.miningCostPerTonneIDR },
                { label: 'Hauling & Logistics (to port)', idr: cost.haulingCostPerTonneIDR },
                { label: 'Labor', idr: cost.laborCostPerTonneIDR },
                { label: 'Equipment (Fuel, Maintenance, Depreciation)', idr: cost.equipmentCostPerTonneIDR },
                { label: 'Overhead (12%)', idr: cost.overheadCostPerTonneIDR }
              ];
              const total = items.reduce((s, i) => s + i.idr, 0);
              return items.map(it => {
                const pct = total > 0 ? (it.idr / total * 100).toFixed(1) : 0;
                return `<tr><td>${it.label}</td><td>Rp ${it.idr.toLocaleString()}</td><td>$${(it.idr / (cost.usdToIDR || 16350)).toFixed(2)}</td><td>${pct}%</td></tr>`;
              }).join('');
            })()}
            <tr style="border-top:2px solid var(--primary);"><td><strong>TOTAL COST</strong></td><td><strong>Rp ${cost.totalCostPerTonneIDR.toLocaleString()}</strong></td><td><strong>$${cost.totalCostPerTonneUSD}</strong></td><td><strong>100%</strong></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>⚙️ Key Operating Parameters</h3></div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item"><div class="ilabel">Stripping Ratio (SR)</div><div class="ivalue">${cost.strippingRatio}:1</div></div>
          <div class="info-item"><div class="ilabel">Distance to Port</div><div class="ivalue">${cost.distanceFromPort} km</div></div>
          <div class="info-item"><div class="ilabel">Diesel Price</div><div class="ivalue">Rp ${(cost.dieselPricePerLiterIDR || 6800).toLocaleString()}/L</div></div>
          <div class="info-item"><div class="ilabel">Exchange Rate</div><div class="ivalue">USD 1 = Rp ${(cost.usdToIDR || 16350).toLocaleString()}</div></div>
          <div class="info-item"><div class="ilabel">Total Cost (IDR)</div><div class="ivalue">Rp ${cost.totalCostPerTonneIDR.toLocaleString()}</div></div>
          <div class="info-item"><div class="ilabel">Total Cost (USD)</div><div class="ivalue">$${cost.totalCostPerTonneUSD}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>🚛 Logistics Cost Detail</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;">
          <div>
            <div style="font-size:0.8rem;color:var(--text-light);margin-bottom:0.5rem;">HAULING COST BREAKDOWN</div>
            <div class="chart-bar">
              <span class="blabel">Hauling ($${cost.distanceFromPort}km)</span>
              <div class="bar" style="width:${Math.min(100, cost.haulingCostPerTonneIDR / 50)}%"></div>
              <span class="bvalue">Rp ${cost.haulingCostPerTonneIDR.toLocaleString()}</span>
            </div>
            <div class="chart-bar">
              <span class="blabel">Mining Cost</span>
              <div class="bar" style="width:${Math.min(100, cost.miningCostPerTonneIDR / 80)}%"></div>
              <span class="bvalue">Rp ${cost.miningCostPerTonneIDR.toLocaleString()}</span>
            </div>
            <div class="chart-bar">
              <span class="blabel">Labor</span>
              <div class="bar" style="width:${Math.min(100, cost.laborCostPerTonneIDR / 40)}%"></div>
              <span class="bvalue">Rp ${cost.laborCostPerTonneIDR.toLocaleString()}</span>
            </div>
            <div class="chart-bar">
              <span class="blabel">Equipment</span>
              <div class="bar" style="width:${Math.min(100, cost.equipmentCostPerTonneIDR / 30)}%"></div>
              <span class="bvalue">Rp ${cost.equipmentCostPerTonneIDR.toLocaleString()}</span>
            </div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-light);margin-bottom:0.5rem;">COST POSITION ON GLOBAL CURVE</div>
            <div style="padding:1rem;background:var(--bg);border-radius:8px;text-align:center;">
              <div style="font-size:2rem;font-weight:800;color:${cost.totalCostPerTonneUSD < 25 ? 'var(--success)' : cost.totalCostPerTonneUSD < 45 ? 'var(--warning)' : 'var(--danger)'};">$${cost.totalCostPerTonneUSD}</div>
              <div style="font-size:0.85rem;color:var(--text-light);">${cost.totalCostPerTonneUSD < 25 ? 'First Quartile — Strong Cost Advantage' : cost.totalCostPerTonneUSD < 45 ? 'Second Quartile — Competitive' : 'Third/Fourth Quartile — Cost Challenged'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPeers(peerData) {
  const el = document.getElementById('tab-peers');
  if (!peerData || !peerData.peers || peerData.peers.length === 0) {
    el.innerHTML = `<div class="card"><div class="card-body"><p style="color:var(--text-light);">No peer data available for this commodity.</p></div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>🏢 Peer Comparison — ${peerData.peers.length} Companies</h3><span class="badge badge-info">May 2026 Data</span></div>
      <div class="card-body">
        <div style="overflow-x:auto;">
          <table class="cost-table">
            <thead><tr><th>Company</th><th>Commodity</th><th>EV/Resource ($/t)</th><th>EV/Reserve ($/t)</th><th>Margin %</th><th>Note</th></tr></thead>
            <tbody>
              ${peerData.peers.map(p => `
                <tr>
                  <td><strong>${p.name}</strong>${p.ticker ? `<br><span style="font-size:0.75rem;color:var(--text-light);">${p.ticker}</span>` : ''}</td>
                  <td><span class="tag ${getCommodityClass(p.commodity)}">${p.commodity}</span></td>
                  <td>$${p.evPerTonneResource?.toFixed(1) || '—'}</td>
                  <td>$${p.evPerTonneReserve?.toFixed(1) || '—'}</td>
                  <td><span class="badge ${p.marginPct > 40 ? 'badge-success' : p.marginPct > 25 ? 'badge-warning' : 'badge-danger'}">${p.marginPct}%</span></td>
                  <td style="font-size:0.8rem;color:var(--text-light);">${p.notes || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>📊 Peer Averages vs This Asset</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">
          <div class="stat-card">
            <div class="label">Peer Avg EV/Resource</div>
            <div class="value">$${peerData.avgEvPerTonneResource?.toFixed(1) || '—'}</div>
            <div class="sub">Industry benchmark for resource valuation</div>
          </div>
          <div class="stat-card">
            <div class="label">Peer Avg EV/Reserve</div>
            <div class="value">$${peerData.avgEvPerTonneReserve?.toFixed(1) || '—'}</div>
            <div class="sub">Industry benchmark for reserve valuation</div>
          </div>
          <div class="stat-card">
            <div class="label">Peer Avg Margin</div>
            <div class="value">${peerData.avgMarginPct?.toFixed(0) || '—'}%</div>
            <div class="sub">${peerData.peers.length} comparable Indonesian mining peers</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderValuation(mine, valuation, cost) {
  const el = document.getElementById('tab-valuation');
  if (!valuation) {
    el.innerHTML = `<div class="card"><div class="card-body"><p style="color:var(--text-light);">Valuation requires peer comparison data.</p></div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>💰 Enterprise Value Estimation</h3></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;">
          <div class="stat-card" style="border:2px solid var(--accent);">
            <div class="label">Implied EV (Resource Method)</div>
            <div class="value" style="color:var(--accent);font-size:1.3rem;">$${(valuation.impliedEvFromResource / 1e6).toFixed(1)}M</div>
            <div class="sub">${valuation.resourceMt} Mt × $${(valuation.impliedEvFromResource / valuation.resourceMt / 1e6).toFixed(1)}/t peer avg</div>
          </div>
          <div class="stat-card" style="border:2px solid var(--primary-light);">
            <div class="label">Implied EV (Reserve Method)</div>
            <div class="value" style="color:var(--primary-light);font-size:1.3rem;">$${(valuation.impliedEvFromReserve / 1e6).toFixed(1)}M</div>
            <div class="sub">${valuation.reserveMt} Mt × $${(valuation.impliedEvFromReserve / valuation.reserveMt / 1e6).toFixed(1)}/t peer avg</div>
          </div>
          <div class="stat-card" style="border:2px solid var(--success);">
            <div class="label">Blended Implied EV</div>
            <div class="value" style="color:var(--success);font-size:1.8rem;">$${(valuation.avgImpliedEV / 1e6).toFixed(1)}M</div>
            <div class="sub">Average of resource & reserve methods</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>📈 Investment Metrics Summary</h3></div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item"><div class="ilabel">Total Resource</div><div class="ivalue">${valuation.resourceMt} Mt</div></div>
          <div class="info-item"><div class="ilabel">Total Reserve</div><div class="ivalue">${valuation.reserveMt} Mt</div></div>
          <div class="info-item"><div class="ilabel">Resource-to-Reserve Conversion</div><div class="ivalue">${valuation.resourceMt > 0 ? ((valuation.reserveMt / valuation.resourceMt) * 100).toFixed(1) : 0}%</div></div>
          <div class="info-item"><div class="ilabel">Cost per Resource Tonne</div><div class="ivalue">$${valuation.resourceMt > 0 ? (valuation.avgImpliedEV / valuation.resourceMt / 1e6).toFixed(2) : '—'}</div></div>
          <div class="info-item"><div class="ilabel">Cost per Reserve Tonne</div><div class="ivalue">$${valuation.reserveMt > 0 ? (valuation.avgImpliedEV / valuation.reserveMt / 1e6).toFixed(2) : '—'}</div></div>
          <div class="info-item"><div class="ilabel">Operating Cost (USD/t)</div><div class="ivalue">$${cost.totalCostPerTonneUSD}</div></div>
        </div>
      </div>
    </div>
  `;
}

function renderRecommendation(recommendation) {
  const el = document.getElementById('tab-recommendation');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>📋 Full Analysis Report — Senior Geologist, PT Vale Indonesia</h3></div>
      <div class="card-body">
        <div class="recommendation-content">
          ${recommendation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^(  - |\* )(.*$)/gm, '<li>$2</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^---$/gm, '<hr>')
            .replace(/> (.*$)/gm, '<blockquote>$1</blockquote>')
            .replace(/\|(.+?)\|/g, '<code>$1</code>')
          }
        </div>
      </div>
    </div>
  `;
}

function renderAIChat() {
  const el = document.getElementById('tab-ai');
  const activeProvider = providersCache?.providers?.find(p => p.active);
  const providerName = activeProvider?.configured ? activeProvider.name : 'Local';
  const statusClass = activeProvider?.configured ? 'connected' : 'disconnected';
  const statusText = activeProvider?.configured ? `● ${activeProvider.name} Connected` : '● API Key Required';

  el.innerHTML = `
    <div class="card deepseek-section">
      <div class="card-header">
        <h3>🤖 AI Mining Analyst — ${providerName}</h3>
        <span id="aiApiStatus" class="api-badge ${statusClass}">${statusText}</span>
      </div>
      <div class="card-body">
        <p style="color:var(--text-light);margin-bottom:1rem;font-size:0.9rem;">
          Ask follow-up questions about this mining asset. ${!activeProvider?.configured ? '<br><a href="#" onclick="toggleSettings();return false;" style="color:var(--primary-light);">⚙️ Configure an AI provider</a> for AI-powered analysis.' : ''}
        </p>
        <div class="deepseek-chat">
          <div class="chat-msgs" id="chatMsgs">
            <div class="msg system">Analysis complete. Ask a follow-up question about this asset.</div>
          </div>
          <div class="chat-input">
            <input type="text" id="chatInput" placeholder="Ask about grade, costs, risks, comparison..." onkeydown="if(event.key==='Enter') sendChatMsg()">
            <button onclick="sendChatMsg()">Ask AI →</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function sendChatMsg() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg || !lastResult) return;
  input.value = '';

  const msgs = document.getElementById('chatMsgs');
  msgs.innerHTML += `<div class="msg user">${msg}</div>`;
  msgs.innerHTML += `<div class="msg system" id="thinkingMsg">Thinking...</div>`;
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const resp = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Regarding the ${lastResult.mine.name} mining asset (${lastResult.mine.commodity}, ${lastResult.mine.province}): ${msg}

Context - ESDM Status: ${lastResult.esdm.status}, Validity: ${lastResult.esdm.validity}
Resources: ${lastResult.mine.resourceMt}Mt, Reserves: ${lastResult.mine.reserveMt}Mt
Total Cost: $${lastResult.cost.totalCostPerTonneUSD}/tonne, SR: ${lastResult.cost.strippingRatio}:1
Peer Avg Margin: ${lastResult.peerComparison?.avgMarginPct?.toFixed(0)}%`,
        systemPrompt: 'You are a Senior Mining Geologist and Investment Analyst specializing in Indonesian mineral deposits.'
      })
    });
    const data = await resp.json();
    document.getElementById('thinkingMsg').remove();
    if (data.response) {
      msgs.innerHTML += `<div class="msg assistant">${data.response.replace(/\n/g, '<br>')}</div>`;
    } else if (data.error) {
      msgs.innerHTML += `<div class="msg system" style="color:var(--danger);">${data.error}</div>`;
    }
  } catch(e) {
    document.getElementById('thinkingMsg').remove();
    msgs.innerHTML += `<div class="msg system" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
  msgs.scrollTop = msgs.scrollHeight;
}
