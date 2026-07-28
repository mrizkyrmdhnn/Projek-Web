/* =====================================================================
   NETINVENTORY — APP.JS
   Dashboard Inventaris Jaringan
   Fitur: CSV/XLSX Upload, Auto-detect inventory columns,
          KPI Cards, Status/Type/Location Charts,
          Custom Bar/Line/Pie Charts, Searchable Table,
          Pagination, Sortable columns, Export CSV
   ===================================================================== */

'use strict';

// ─── DATA STORE ──────────────────────────────────────────────────────
let parsedData = [];
let filteredData = [];
let columns = [];
let currentFile = { name: '', size: 0, rows: 0 };

// Inventory column mapping
let invCols = {
  device: '',
  status: '',
  type: '',
  location: '',
  ip: '',
  vendor: '',
};

// Chart instances
let chartInstances = { bar: null, line: null, pie: null, status: null, type: null, location: null };

// Pagination state
const PAGE_SIZE = 20;
let currentPage = 1;
let sortCol = null;
let sortDir = 'asc';
let searchQuery = '';

// ─── COLOR PALETTE ───────────────────────────────────────────────────
const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#3b82f6', '#22c55e',
  '#ef4444', '#84cc16', '#a855f7', '#06b6d4', '#d946ef',
  '#eab308', '#f43f5e', '#64748b', '#0891b2', '#2563eb',
];

const STATUS_COLORS = {
  up: '#10b981', online: '#10b981', aktif: '#10b981', active: '#10b981',
  down: '#ef4444', offline: '#ef4444', nonaktif: '#ef4444', inactive: '#ef4444',
  standby: '#f59e0b', maintenance: '#f59e0b', warning: '#f59e0b',
  unknown: '#94a3b8',
};

function hexAlpha(hex, alpha) {
  if (!hex || hex[0] !== '#') return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── CHART.JS GLOBAL DEFAULTS ────────────────────────────────────────
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 12.5;
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,23,42,0.95)';
Chart.defaults.plugins.tooltip.titleColor = '#f1f5f9';
Chart.defaults.plugins.tooltip.bodyColor = '#94a3b8';
Chart.defaults.plugins.tooltip.padding = { x: 14, y: 12 };
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.titleFont = { weight: '700', size: 13 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12.5 };
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.plugins.tooltip.boxPadding = 5;
Chart.defaults.animation.duration = 700;
Chart.defaults.animation.easing = 'easeOutCubic';

// ─── DOM REFS ────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const csvInput = $('csvInput');
const dropZone = $('dropZone');
const uploadSection = $('uploadSection');
const dashboard = $('dashboard');
const headerStatus = $('headerStatus');
const statusDot = $('statusDot'); // may be null in simplified HTML
const btnHeaderReset = $('btnHeaderReset');
const loadingOverlay = $('loadingOverlay');
const toast = $('toast');
const dataFileInfo = $('dataFileInfo');

// Tab system
const tabs = document.querySelectorAll('.tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// KPI
const kpiGrid = $('kpiGrid');

// Config
const cfgColDevice = $('cfgColDevice');
const cfgColStatus = $('cfgColStatus');
const cfgColType = $('cfgColType');
const cfgColLocation = $('cfgColLocation');
const cfgColIP = $('cfgColIP');
const cfgColVendor = $('cfgColVendor');
const fileInfoList = $('fileInfoList');
const columnChips = $('columnChips');
const btnApplyConfig = $('btnApplyConfig');
const btnAutoDetect = $('btnAutoDetect');

// Custom charts
const labelColSel = $('labelCol');
const valueColSel = $('valueCol');
const chartTypeSel = $('chartType');
const btnRender = $('btnRender');
const btnReset = $('btnReset');
const chartsArea = $('chartsArea');
const wrapBar = $('wrapBar');
const wrapLine = $('wrapLine');
const wrapPie = $('wrapPie');
const rowBarLine = $('rowBarLine');
const rowPie = $('rowPie');

// Stats
const statRows = $('statRows');
const statCols = $('statCols');
const statMax = $('statMax');
const statMin = $('statMin');
const statAvg = $('statAvg');
const statSum = $('statSum');

// Input Data
let recentAdditions = [];
const inputFieldsGrid = $('inputFieldsGrid');
const inputDataForm = $('inputDataForm');
const btnClearInput = $('btnClearInput');
const inputLogList = $('inputLogList');
const inputLogCount = $('inputLogCount');

// ─── INIT: EVENT LISTENERS ───────────────────────────────────────────
csvInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

// Drag & Drop on the right panel
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && isValidFile(file.name)) {
    processFile(file);
  } else {
    showToast('Hanya file .csv atau .xlsx yang diterima');
  }
});

// Tab switching
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tabPanels.forEach((p) => {
      p.classList.toggle('hidden', p.id !== `panel-${target}`);
    });
  });
});

// Header reset
btnHeaderReset.addEventListener('click', resetAll);

// Chart custom render
btnRender.addEventListener('click', renderCustomCharts);
labelColSel.addEventListener('change', () => { if (parsedData.length) renderCustomCharts(); });
valueColSel.addEventListener('change', () => { if (parsedData.length) renderCustomCharts(); });
chartTypeSel.addEventListener('change', () => { if (parsedData.length) renderCustomCharts(); });

// Reset custom charts
btnReset.addEventListener('click', () => {
  destroyCharts('bar', 'line', 'pie');
  chartsArea.classList.add('hidden');
  showToast('Grafik direset');
});

// Download buttons
$('btnDlBar').addEventListener('click', () => downloadChart('barChart', 'bar-chart.png'));
$('btnDlLine').addEventListener('click', () => downloadChart('lineChart', 'line-chart.png'));
$('btnDlPie').addEventListener('click', () => downloadChart('pieChart', 'pie-chart.png'));
$('btnDlStatus').addEventListener('click', () => downloadChart('statusChart', 'status-chart.png'));
$('btnDlType').addEventListener('click', () => downloadChart('typeChart', 'type-chart.png'));
$('btnDlLocation').addEventListener('click', () => downloadChart('locationChart', 'location-chart.png'));

// Config
btnApplyConfig.addEventListener('click', applyConfig);
btnAutoDetect.addEventListener('click', autoDetectColumns);

// Table search
tableSearch.addEventListener('input', () => {
  searchQuery = tableSearch.value.toLowerCase();
  applyFilter();
});

// Export CSV & Table Edit Toggle
let isTableEditMode = false;
const btnToggleEditTable = $('btnToggleEditTable');

btnToggleEditTable.addEventListener('click', () => {
  if (!parsedData || !parsedData.length) {
    showToast('Belum ada data untuk diedit');
    return;
  }
  isTableEditMode = !isTableEditMode;
  btnToggleEditTable.classList.toggle('active', isTableEditMode);
  btnToggleEditTable.textContent = isTableEditMode ? '✓ Selesai Edit' : 'Edit Data';

  const notice = $('tableEditNotice');
  if (notice) notice.classList.toggle('hidden', !isTableEditMode);

  showToast(isTableEditMode ? 'Mode Edit' : 'Mode Edit dimatikan');
  buildTableHead();
  renderTablePage();
});

$('btnExportCSV').addEventListener('click', exportCSV);

// Pagination
$('btnPrevPage').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTablePage(); } });
$('btnNextPage').addEventListener('click', () => {
  const maxPage = Math.ceil(filteredData.length / PAGE_SIZE);
  if (currentPage < maxPage) { currentPage++; renderTablePage(); }
});

// Input Data Form
inputDataForm.addEventListener('submit', handleAddNewData);
btnClearInput.addEventListener('click', () => {
  inputDataForm.reset();
  showToast('Form dikosongkan');
});

// ─── FILE VALIDATION ──────────────────────────────────────────────────
function isValidFile(name) {
  return /\.(csv|xlsx|xls)$/i.test(name);
}

// ─── PROCESS FILE ────────────────────────────────────────────────────
function processFile(file) {
  if (!isValidFile(file.name)) {
    showToast('Hanya file .csv atau .xlsx yang diterima');
    return;
  }

  loadingOverlay.classList.remove('hidden');
  currentFile = { name: file.name, size: file.size, rows: 0 };

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onerror = () => {
      showToast('Gagal membaca file — pastikan file tidak sedang dibuka di aplikasi lain');
      loadingOverlay.classList.add('hidden');
    };
    reader.onload = (e) => {
      try {
        const { data, cols } = parseXLSX(e.target.result);
        if (!data.length) {
          showToast('File Excel kosong atau formatnya tidak didukung');
          loadingOverlay.classList.add('hidden');
          return;
        }
        onDataLoaded(data, cols);
      } catch (err) {
        showToast('Gagal memproses file Excel: ' + err.message);
        console.error('[XLSX Error]', err);
        loadingOverlay.classList.add('hidden');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onerror = () => {
      showToast('Gagal membaca file CSV');
      loadingOverlay.classList.add('hidden');
    };
    reader.onload = (e) => {
      try {
        const { data, cols } = parseCSV(e.target.result);
        if (!data.length) {
          showToast('File CSV kosong atau formatnya tidak didukung');
          loadingOverlay.classList.add('hidden');
          return;
        }
        onDataLoaded(data, cols);
      } catch (err) {
        showToast('Gagal memproses file CSV: ' + err.message);
        console.error('[CSV Error]', err);
        loadingOverlay.classList.add('hidden');
      }
    };
    // Try UTF-8 first, fallback to latin1 handled in parseCSV
    reader.readAsText(file, 'UTF-8');
  }
}

// ─── XLSX PARSER ─────────────────────────────────────────────────────
function parseXLSX(arrayBuffer) {
  // Read with cellDates to handle date cells, and raw:false to stringify everything
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    raw: false,
  });

  if (!workbook.SheetNames.length) throw new Error('Tidak ada sheet ditemukan dalam file');

  // Find the first non-empty sheet
  let sheet = null;
  let usedSheetName = '';
  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (s && s['!ref']) { sheet = s; usedSheetName = name; break; }
  }
  if (!sheet) throw new Error('Semua sheet dalam file kosong');

  // Convert to row arrays
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rows.length) return { data: [], cols: [] };

  // First row = headers; skip empty header cells
  const rawHeaders = rows[0];
  const cols = rawHeaders.map((h, i) => {
    const s = String(h == null ? '' : h).trim();
    return s || `Kolom_${i + 1}`;
  });

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip fully-empty rows
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const obj = {};
    cols.forEach((col, idx) => {
      const val = row[idx];
      if (val == null || val === '') {
        obj[col] = '';
      } else if (val instanceof Date) {
        // Format dates as YYYY-MM-DD
        obj[col] = val.toISOString().slice(0, 10);
      } else {
        obj[col] = String(val).trim();
      }
    });
    data.push(obj);
  }

  return { data, cols };
}

// ─── CSV PARSER ───────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCSVLine(lines[0]);
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row = {};
    header.forEach((col, idx) => { row[col] = values[idx] !== undefined ? values[idx].trim() : ''; });
    data.push(row);
  }
  return { data, cols: header };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

// ─── ON DATA LOADED ───────────────────────────────────────────────────
function onDataLoaded(data, cols) {
  parsedData = data;
  columns = cols;
  filteredData = [...data];
  currentFile.rows = data.length;
  currentPage = 1;
  sortCol = null;
  sortDir = 'asc';
  searchQuery = '';

  // Auto-detect inventory columns
  autoDetectColumns(false);

  // Setup UI
  loadingOverlay.classList.add('hidden');
  uploadSection.classList.add('hidden');
  dashboard.classList.remove('hidden');

  // Header
  if (statusDot) statusDot.classList.add('active');
  headerStatus.textContent = `${data.length.toLocaleString('id-ID')} perangkat · ${cols.length} kolom`;
  btnHeaderReset.classList.remove('hidden');
  dataFileInfo.textContent = currentFile.name;

  // Populate selects
  populateAllSelects();

  // Render all
  buildKPI();
  renderInventoryCharts();
  renderCustomCharts();
  buildTableHead();
  renderTablePage();
  buildFileInfo();
  buildColumnChips();

  // Render input data form & log
  renderInputForm();
  renderInputLog();

  showToast('Data dimuat: ' + data.length + ' baris, ' + cols.length + ' kolom');
  csvInput.value = '';
}

// ─── INPUT FORM DYNAMIC GENERATION ────────────────────────────────────
function renderInputForm() {
  inputFieldsGrid.innerHTML = '';
  if (!columns || !columns.length) return;

  columns.forEach((col, idx) => {
    const fieldWrap = document.createElement('div');
    fieldWrap.className = 'input-field';

    const label = document.createElement('label');
    label.className = 'field-label';
    label.setAttribute('for', `input-col-${idx}`);
    label.textContent = col;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-control';
    input.id = `input-col-${idx}`;
    input.name = col;
    input.placeholder = `Masukkan ${col}...`;

    // Create datalist for autocompletion of existing non-empty values
    const listId = `datalist-col-${idx}`;
    const datalist = document.createElement('datalist');
    datalist.id = listId;

    const uniqueVals = new Set();
    parsedData.forEach((row) => {
      const val = row[col];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        uniqueVals.add(String(val).trim());
      }
    });

    if (uniqueVals.size > 0 && uniqueVals.size <= 50) {
      uniqueVals.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v;
        datalist.appendChild(opt);
      });
      input.setAttribute('list', listId);
    }

    fieldWrap.appendChild(label);
    fieldWrap.appendChild(input);
    if (datalist.children.length > 0) {
      fieldWrap.appendChild(datalist);
    }
    inputFieldsGrid.appendChild(fieldWrap);
  });
}

function handleAddNewData(e) {
  e.preventDefault();
  if (!parsedData || !columns.length) {
    showToast('Belum ada data file yang dimuat');
    return;
  }

  const formData = new FormData(inputDataForm);
  const newRow = {};
  let hasAnyValue = false;

  columns.forEach((col) => {
    const val = (formData.get(col) || '').toString().trim();
    newRow[col] = val;
    if (val !== '') hasAnyValue = true;
  });

  if (!hasAnyValue) {
    showToast('Mohon isi minimal satu kolom data');
    return;
  }

  // Add to dataset
  parsedData.push(newRow);
  filteredData = [...parsedData];
  currentFile.rows = parsedData.length;

  // Header update
  headerStatus.textContent = `${parsedData.length.toLocaleString('id-ID')} perangkat · ${columns.length} kolom`;

  // Log addition
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const mainVal = newRow[invCols.device] || newRow[columns[0]] || 'Data Baru';
  const detailStr = columns.map(c => newRow[c] ? `${c}: ${newRow[c]}` : null).filter(Boolean).join(' | ');

  recentAdditions.unshift({
    time: timeStr,
    main: mainVal,
    detail: detailStr,
  });

  // Re-render UI components
  buildKPI();
  renderInventoryCharts();
  renderCustomCharts();
  renderTablePage();
  if (tableBadge) tableBadge.textContent = `${filteredData.length.toLocaleString('id-ID')} baris`;
  buildFileInfo();
  renderInputForm();
  renderInputLog();

  inputDataForm.reset();
  showToast('Data baru berhasil ditambahkan');
}

function renderInputLog() {
  if (!inputLogList) return;
  inputLogList.innerHTML = '';
  if (!recentAdditions.length) {
    inputLogCount.textContent = 'Belum ada data yang ditambahkan';
    return;
  }

  inputLogCount.textContent = `${recentAdditions.length} entri ditambahkan`;

  recentAdditions.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'input-log-item';
    div.innerHTML = `
      <div class="input-log-time">${escapeHtml(item.time)}</div>
      <div class="input-log-main">${escapeHtml(item.main)}</div>
      <div class="input-log-detail">${escapeHtml(item.detail)}</div>
    `;
    inputLogList.appendChild(div);
  });
}

// ─── AUTO-DETECT INVENTORY COLUMNS ───────────────────────────────────
function autoDetectColumns(showMsg = true) {
  const keywords = {
    device: ['device', 'hostname', 'host', 'nama', 'name', 'perangkat', 'node', 'equipment', 'asset'],
    status: ['status', 'kondisi', 'state', 'health', 'availability'],
    type: ['type', 'tipe', 'kategori', 'category', 'jenis', 'kind', 'model', 'class'],
    location: ['location', 'lokasi', 'site', 'gedung', 'building', 'area', 'region', 'kota', 'city', 'rack', 'floor'],
    ip: ['ip', 'ip_address', 'ipaddress', 'alamat', 'address'],
    vendor: ['vendor', 'merek', 'brand', 'manufacturer', 'merk', 'make'],
  };

  const detected = {};
  columns.forEach((col) => {
    const lower = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, kws] of Object.entries(keywords)) {
      if (!detected[key] && kws.some((kw) => lower.includes(kw))) {
        detected[key] = col;
      }
    }
  });

  invCols = {
    device: detected.device || columns[0] || '',
    status: detected.status || '',
    type: detected.type || '',
    location: detected.location || '',
    ip: detected.ip || '',
    vendor: detected.vendor || '',
  };

  // Update config selects
  syncConfigSelects();

  if (showMsg) {
    const found = Object.entries(invCols).filter(([, v]) => v).map(([k]) => k);
    showToast(`Auto-deteksi: ${found.join(', ')} ditemukan`);
  }
}

function syncConfigSelects() {
  const map = { device: cfgColDevice, status: cfgColStatus, type: cfgColType, location: cfgColLocation, ip: cfgColIP, vendor: cfgColVendor };
  for (const [key, el] of Object.entries(map)) {
    if (invCols[key]) el.value = invCols[key];
  }
}

// ─── POPULATE ALL SELECTS ─────────────────────────────────────────────
function populateAllSelects() {
  // Custom chart selects
  populateSelect(labelColSel, columns, false);
  populateSelect(valueColSel, columns, false);

  // Config selects (with empty option)
  [cfgColDevice, cfgColStatus, cfgColType, cfgColLocation, cfgColIP, cfgColVendor].forEach((sel) => {
    populateSelect(sel, columns, true);
  });

  // Heuristic defaults for custom chart
  const numericCol = columns.find((col) =>
    parsedData.slice(0, 10).every((row) => !isNaN(parseFloat(row[col])) && row[col] !== '')
  );
  labelColSel.value = invCols.device || columns[0];
  valueColSel.value = numericCol || (columns.length > 1 ? columns[1] : columns[0]);
}

function populateSelect(el, cols, withEmpty = false) {
  el.innerHTML = withEmpty ? '<option value="">— Tidak dipetakan —</option>' : '';
  cols.forEach((col) => {
    const opt = document.createElement('option');
    opt.value = col;
    opt.textContent = col;
    el.appendChild(opt);
  });
}

// ─── APPLY CONFIG ─────────────────────────────────────────────────────
function applyConfig() {
  invCols.device = cfgColDevice.value;
  invCols.status = cfgColStatus.value;
  invCols.type = cfgColType.value;
  invCols.location = cfgColLocation.value;
  invCols.ip = cfgColIP.value;
  invCols.vendor = cfgColVendor.value;

  buildKPI();
  renderInventoryCharts();
  buildColumnChips();
  showToast('Konfigurasi diterapkan');
}

// ─── KPI CARDS ────────────────────────────────────────────────────────
function buildKPI() {
  const cards = [];

  // Total perangkat
  cards.push({ label: 'Total Perangkat', value: parsedData.length.toLocaleString('id-ID'), sub: 'entri dalam dataset', color: 'blue' });

  // Status breakdown
  if (invCols.status) {
    const freq = getFrequency(invCols.status);
    const upKeys = ['up', 'online', 'aktif', 'active'];
    const downKeys = ['down', 'offline', 'nonaktif', 'inactive'];
    const upCount = upKeys.reduce((sum, k) => sum + (freq[Object.keys(freq).find((fk) => fk.toLowerCase() === k)] || 0), 0);
    const downCount = downKeys.reduce((sum, k) => sum + (freq[Object.keys(freq).find((fk) => fk.toLowerCase() === k)] || 0), 0);

    if (upCount > 0) cards.push({ label: 'Perangkat Aktif', value: upCount.toLocaleString('id-ID'), sub: 'status online/up', color: 'green' });
    if (downCount > 0) cards.push({ label: 'Perangkat Mati', value: downCount.toLocaleString('id-ID'), sub: 'status offline/down', color: 'red' });
  }

  // Type count
  if (invCols.type) {
    const freq = getFrequency(invCols.type);
    cards.push({ label: 'Tipe Perangkat', value: Object.keys(freq).length.toLocaleString('id-ID'), sub: 'kategori berbeda', color: 'purple' });
  }

  // Location count
  if (invCols.location) {
    const freq = getFrequency(invCols.location);
    cards.push({ label: 'Lokasi / Site', value: Object.keys(freq).length.toLocaleString('id-ID'), sub: 'site terdaftar', color: 'cyan' });
  }

  // Vendor count
  if (invCols.vendor) {
    const freq = getFrequency(invCols.vendor);
    cards.push({ label: 'Vendor', value: Object.keys(freq).length.toLocaleString('id-ID'), sub: 'merek/vendor', color: 'yellow' });
  }

  // Fill with total columns if not enough cards
  if (cards.length < 2) {
    cards.push({ label: 'Total Kolom', value: columns.length, sub: 'field data', color: 'orange' });
  }

  kpiGrid.innerHTML = '';
  cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'kpi-card';
    el.dataset.color = card.color;
    el.innerHTML = `
      <div class="kpi-body">
        <div class="kpi-label">${card.label}</div>
        <div class="kpi-value">${card.value}</div>
        <div class="kpi-sub">${card.sub}</div>
      </div>`;
    el.style.animationDelay = `${i * 0.07}s`;
    el.classList.add('animate-in');
    kpiGrid.appendChild(el);
  });
}

// ─── INVENTORY CHARTS ─────────────────────────────────────────────────
function renderInventoryCharts() {
  renderStatusChart();
  renderTypeChart();
  renderLocationChart();
}

function renderStatusChart() {
  const noNotice = $('noStatusCol');
  const canvas = $('statusChart');

  destroyCharts('status');

  if (!invCols.status) {
    noNotice.classList.remove('hidden');
    canvas.style.display = 'none';
    return;
  }
  noNotice.classList.add('hidden');
  canvas.style.display = '';

  const freq = getFrequency(invCols.status);
  const labels = Object.keys(freq);
  const values = Object.values(freq);
  const colors = labels.map((l) => STATUS_COLORS[l.toLowerCase()] || PALETTE[labels.indexOf(l) % PALETTE.length]);

  chartInstances.status = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map((c) => hexAlpha(c, 0.85)),
        borderColor: '#fff',
        borderWidth: 3,
        hoverOffset: 12,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12, boxHeight: 12, padding: 14, font: { size: 12 }, color: '#475569',
            usePointStyle: true, pointStyle: 'circle',
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const total = item.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((item.raw / total) * 100).toFixed(1);
              return ` ${item.label}: ${item.raw} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderTypeChart() {
  const noNotice = $('noTypeCol');
  const canvas = $('typeChart');

  destroyCharts('type');

  if (!invCols.type) {
    noNotice.classList.remove('hidden');
    canvas.style.display = 'none';
    return;
  }
  noNotice.classList.add('hidden');
  canvas.style.display = '';

  const freq = getFrequency(invCols.type);
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  chartInstances.type = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah',
        data: values,
        backgroundColor: colors.map((c) => hexAlpha(c, 0.82)),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 7,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` Jumlah: ${formatNumber(item.raw)}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(226,232,240,0.7)' },
          border: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => formatNumber(v) },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#475569', font: { size: 12, weight: '500' }, autoSkip: false },
        },
      },
    },
  });
}

function renderLocationChart() {
  const noNotice = $('noLocationCol');
  const canvas = $('locationChart');

  destroyCharts('location');

  if (!invCols.location) {
    noNotice.classList.remove('hidden');
    canvas.style.display = 'none';
    return;
  }
  noNotice.classList.add('hidden');
  canvas.style.display = '';

  const freq = getFrequency(invCols.location);
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  const color = '#6366f1';

  // Adjust canvas width for many locations
  const barW = Math.max(labels.length * 80, canvas.parentElement.clientWidth - 1);
  canvas.style.width = barW + 'px';
  canvas.style.height = '100%';

  chartInstances.location = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Perangkat',
        data: values,
        backgroundColor: labels.map((_, i) => hexAlpha(PALETTE[i % PALETTE.length], 0.82)),
        borderColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` Perangkat: ${formatNumber(item.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#64748b', font: { size: 11.5, weight: '500' }, maxRotation: 30, autoSkip: false },
          title: { display: true, text: invCols.location, color: '#94a3b8', font: { size: 11, weight: '600' }, padding: { top: 8 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226,232,240,0.7)' },
          border: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => formatNumber(v) },
        },
      },
    },
  });
}

// ─── CUSTOM CHARTS ────────────────────────────────────────────────────
function renderCustomCharts() {
  const labelCol = labelColSel.value;
  const valueCol = valueColSel.value;
  const chartType = chartTypeSel.value;

  if (!labelCol || !valueCol) {
    showToast('Pilih kolom label dan nilai terlebih dahulu');
    return;
  }

  const rawValues = parsedData.map((r) => r[valueCol]);
  const numParsed = rawValues.map((v) => parseFloat(v));
  const numericCount = numParsed.filter((v) => !isNaN(v)).length;
  const isNumeric = numericCount / rawValues.length >= 0.5;

  let labels, values, yAxisLabel;

  if (isNumeric) {
    const agg = {};
    parsedData.forEach((r, i) => {
      const key = String(r[labelCol] ?? '(kosong)').trim();
      const val = numParsed[i];
      if (isNaN(val)) return;
      agg[key] = (agg[key] || 0) + val;
    });
    const sortedAgg = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    labels = sortedAgg.map(([k]) => k);
    values = sortedAgg.map(([, v]) => v);
    yAxisLabel = valueCol;
  } else {
    const freq = {};
    parsedData.forEach((r) => {
      const key = String(r[labelCol] ?? '(kosong)');
      freq[key] = (freq[key] || 0) + 1;
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    labels = sorted.map(([k]) => k);
    values = sorted.map(([, v]) => v);
    yAxisLabel = 'Jumlah';
    showToast(`Mode frekuensi: "${labelCol}"`);
  }

  renderStats(valueCol, isNumeric ? null : values);
  destroyCharts('bar', 'line', 'pie');
  chartsArea.classList.remove('hidden');

  const showBar = chartType === 'all' || chartType === 'bar';
  const showLine = chartType === 'all' || chartType === 'line';
  const showPie = chartType === 'all' || chartType === 'pie';

  rowBarLine.style.display = (showBar || showLine) ? '' : 'none';
  wrapBar.style.display = showBar ? '' : 'none';
  wrapLine.style.display = showLine ? '' : 'none';
  rowPie.style.display = showPie ? '' : 'none';

  [wrapBar, wrapLine, wrapPie].forEach((el) => {
    el.classList.remove('animate-in');
    void el.offsetWidth;
    el.classList.add('animate-in');
  });

  const singleColor = PALETTE[0];

  if (showBar) {
    const barData = groupSmallSlices(labels, values, 12, 0);
    const barCanvas = $('barChart');
    const barW = Math.max(barData.labels.length * 80, barCanvas.parentElement.clientWidth - 1);
    barCanvas.style.width = barW + 'px';
    barCanvas.style.height = '100%';

    const barColors = barData.labels.map((_, i) => PALETTE[i % PALETTE.length]);
    if (barData.grouped) barColors[barColors.length - 1] = '#94a3b8';

    chartInstances.bar = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: barData.labels,
        datasets: [{
          label: yAxisLabel,
          data: barData.values,
          backgroundColor: barColors.map((c) => hexAlpha(c, 0.82)),
          borderColor: barColors,
          borderWidth: 2,
          borderRadius: 10,
          borderSkipped: false,
          hoverBackgroundColor: barColors,
        }],
      },
      options: buildBarOptions(labelCol, yAxisLabel),
    });
  }

  if (showLine) {
    const lineData = groupSmallSlices(labels, values, 12, 0);
    const lineCanvas = $('lineChart');
    const lineW = Math.max(lineData.labels.length * 64, lineCanvas.parentElement.clientWidth - 1);
    lineCanvas.style.width = lineW + 'px';
    lineCanvas.style.height = '100%';

    chartInstances.line = new Chart(lineCanvas, {
      type: 'line',
      data: {
        labels: lineData.labels,
        datasets: [{
          label: yAxisLabel,
          data: lineData.values,
          borderColor: singleColor,
          backgroundColor: hexAlpha(singleColor, 0.08),
          borderWidth: 2.5,
          pointBackgroundColor: singleColor,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: lineData.labels.length > 20 ? 3 : 5,
          pointHoverRadius: lineData.labels.length > 20 ? 7 : 9,
          fill: true,
          tension: 0.4,
        }],
      },
      options: buildLineOptions(labelCol, yAxisLabel, lineData.labels.length),
    });
  }

  if (showPie) {
    const pieData = groupSmallSlices(labels, values, 10);
    const pieColors = pieData.labels.map((_, i) => PALETTE[i % PALETTE.length]);
    if (pieData.grouped) pieColors[pieColors.length - 1] = '#94a3b8';

    chartInstances.pie = new Chart($('pieChart'), {
      type: 'pie',
      data: {
        labels: pieData.labels,
        datasets: [{
          data: pieData.values,
          backgroundColor: pieColors.map((c) => hexAlpha(c, 0.88)),
          borderColor: '#fff',
          borderWidth: 2.5,
          hoverOffset: 14,
        }],
      },
      options: buildPieOptions(yAxisLabel, pieData.grouped),
    });
  }
}

// ─── CHART OPTIONS ────────────────────────────────────────────────────
function buildBarOptions(labelCol, yAxisLabel) {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    transitions: { active: { animation: { duration: 200 } } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items[0].label,
          label: (item) => {
            const total = item.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total ? ((item.raw / total) * 100).toFixed(1) : 0;
            return ` ${yAxisLabel}: ${formatNumber(item.raw)}  (${pct}%)`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: { maxRotation: 30, font: { size: 12, weight: '500' }, color: '#64748b', autoSkip: false },
        title: { display: true, text: labelCol, color: '#94a3b8', font: { size: 11, weight: '600' }, padding: { top: 8 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(226,232,240,0.7)' }, border: { display: false, dash: [4, 4] },
        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => formatNumber(v) },
        title: { display: true, text: yAxisLabel, color: '#94a3b8', font: { size: 11, weight: '600' }, padding: { bottom: 8 } },
      },
    },
  };
}

function buildLineOptions(labelCol, yAxisLabel, dataCount) {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeInOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (item) => ` ${yAxisLabel}: ${formatNumber(item.raw)}` } },
    },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: { maxRotation: dataCount > 20 ? 45 : 0, font: { size: dataCount > 20 ? 10 : 12 }, color: '#64748b', autoSkip: dataCount > 30, maxTicksLimit: dataCount > 30 ? 20 : undefined },
        title: { display: true, text: labelCol, color: '#94a3b8', font: { size: 11, weight: '600' }, padding: { top: 8 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(226,232,240,0.7)' }, border: { display: false },
        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => formatNumber(v) },
        title: { display: true, text: yAxisLabel, color: '#94a3b8', font: { size: 11, weight: '600' }, padding: { bottom: 8 } },
      },
    },
  };
}

function buildPieOptions(valueCol, hasOther = false) {
  return {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: 10 },
    animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart', delay: (ctx) => ctx.dataIndex * 40 },
    plugins: {
      legend: {
        position: 'right', align: 'center',
        labels: {
          boxWidth: 12, boxHeight: 12, padding: 14, font: { size: 12 }, color: '#475569',
          usePointStyle: true, pointStyle: 'circle',
          generateLabels: (chart) => {
            const data = chart.data;
            return data.labels.map((label, i) => {
              const ds = data.datasets[0];
              const total = ds.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((ds.data[i] / total) * 100).toFixed(1) : '0';
              const shortLabel = label.length > 24 ? label.slice(0, 22) + '…' : label;
              return { text: `${shortLabel}  ${pct}%`, fillStyle: ds.backgroundColor[i], strokeStyle: ds.borderColor, lineWidth: 0, hidden: false, index: i };
            });
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const total = item.dataset.data.reduce((a, b) => (a || 0) + (b || 0), 0);
            const pct = total ? ((item.raw / total) * 100).toFixed(1) : 0;
            return ` ${item.label}: ${formatNumber(item.raw)} (${pct}%)`;
          },
        },
      },
    },
  };
}

// ─── GROUP SMALL SLICES ───────────────────────────────────────────────
function groupSmallSlices(labels, values, maxItems = 10, minPct = 5) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || !labels.length) return { labels: [...labels], values: [...values], grouped: false, groupedCount: 0 };

  const indexed = labels.map((l, i) => ({ label: l, value: values[i] }));
  indexed.sort((a, b) => b.value - a.value);

  const main = [], others = [];
  indexed.forEach((item, idx) => {
    const pct = (item.value / total) * 100;
    if (idx >= maxItems || (minPct > 0 && pct < minPct)) others.push(item);
    else main.push(item);
  });

  if (!main.length && others.length) main.push(others.shift());

  const otherTotal = others.reduce((a, b) => a + b.value, 0);
  const newLabels = main.map((d) => d.label);
  const newValues = main.map((d) => d.value);

  if (others.length) {
    newLabels.push(`Lainnya (${others.length})`);
    newValues.push(otherTotal);
  }

  return { labels: newLabels, values: newValues, grouped: others.length > 0, groupedCount: others.length };
}

// ─── RENDER STATS ─────────────────────────────────────────────────────
function renderStats(valCol, overrideValues = null) {
  const values = overrideValues
    ? overrideValues.filter((v) => !isNaN(v))
    : parsedData.map((r) => parseFloat(r[valCol])).filter((v) => !isNaN(v));

  statRows.textContent = parsedData.length.toLocaleString('id-ID');
  statCols.textContent = columns.length;

  if (values.length > 0) {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    statMax.textContent = formatNumber(max);
    statMin.textContent = formatNumber(min);
    statSum.textContent = formatNumber(sum);
    statAvg.textContent = formatNumber(avg);
  } else {
    [statMax, statMin, statSum, statAvg].forEach((el) => el.textContent = '-');
  }

  document.querySelectorAll('.stat-card').forEach((card, i) => {
    card.classList.remove('animate-in');
    void card.offsetWidth;
    card.style.animationDelay = `${i * 0.06}s`;
    card.classList.add('animate-in');
  });
}

// ─── TABLE ────────────────────────────────────────────────────────────
// ─── TABLE ────────────────────────────────────────────────────────────
function buildTableHead() {
  const tr = document.createElement('tr');
  columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.dataset.col = col;
    th.addEventListener('click', () => {
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      document.querySelectorAll('.data-table th').forEach((t) => t.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      applyFilter();
    });
    tr.appendChild(th);
  });

  if (isTableEditMode) {
    const thAction = document.createElement('th');
    thAction.textContent = 'Aksi';
    tr.appendChild(thAction);
  }

  tableHead.innerHTML = '';
  tableHead.appendChild(tr);
}

function applyFilter() {
  let result = [...parsedData];

  if (searchQuery) {
    result = result.filter((row) =>
      columns.some((col) => String(row[col] ?? '').toLowerCase().includes(searchQuery))
    );
  }

  if (sortCol) {
    result.sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  filteredData = result;
  currentPage = 1;
  renderTablePage();
}

function renderTablePage() {
  const dataTable = $('dataTable');
  if (dataTable) dataTable.classList.toggle('edit-mode', isTableEditMode);

  const total = filteredData.length;
  const maxPage = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > maxPage) currentPage = maxPage;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageData = filteredData.slice(start, end);

  tableBody.innerHTML = '';

  pageData.forEach((row) => {
    const tr = document.createElement('tr');
    const parsedIdx = parsedData.indexOf(row);

    columns.forEach((c) => {
      const td = document.createElement('td');
      const val = row[c] ?? '';

      if (isTableEditMode) {
        td.contentEditable = 'true';
        td.textContent = val;
        td.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            td.blur();
          }
        });
        td.addEventListener('blur', () => {
          const newText = td.textContent.trim();
          if (row[c] !== newText) {
            row[c] = newText;
            if (parsedIdx !== -1) parsedData[parsedIdx][c] = newText;
            onTableDataModified();
            showToast('Sel data diperbarui');
          }
        });
      } else {
        if (c === invCols.status && val) {
          const key = val.toLowerCase();
          td.innerHTML = `<span class="status-badge ${key}">${escapeHtml(val)}</span>`;
        } else {
          td.textContent = val;
        }
      }
      tr.appendChild(td);
    });

    if (isTableEditMode) {
      const tdAction = document.createElement('td');
      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-delete-row';
      btnDelete.textContent = 'Hapus';
      btnDelete.title = 'Hapus baris ini';
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        if (parsedIdx !== -1) {
          parsedData.splice(parsedIdx, 1);
          onTableDataModified();
          applyFilter();
          showToast('Baris data dihapus');
        }
      });
      tdAction.appendChild(btnDelete);
      tr.appendChild(tdAction);
    }

    tableBody.appendChild(tr);
  });

  tableBadge.textContent = searchQuery
    ? `${total} hasil dari ${parsedData.length} baris`
    : `${parsedData.length} baris`;

  // Pagination info
  $('paginationInfo').textContent = `Menampilkan ${total > 0 ? start + 1 : 0}–${end} dari ${total} entri`;
  $('btnPrevPage').disabled = currentPage <= 1;
  $('btnNextPage').disabled = currentPage >= maxPage;

  // Page numbers
  const pageNums = $('pageNums');
  pageNums.innerHTML = '';
  const range = buildPageRange(currentPage, maxPage);
  range.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = `page-num${p === currentPage ? ' active' : ''}`;
    btn.textContent = p;
    btn.disabled = p === currentPage;
    btn.addEventListener('click', () => { currentPage = p; renderTablePage(); });
    pageNums.appendChild(btn);
  });
}

function onTableDataModified() {
  currentFile.rows = parsedData.length;
  headerStatus.textContent = `${parsedData.length.toLocaleString('id-ID')} perangkat · ${columns.length} kolom`;
  buildKPI();
  renderInventoryCharts();
  renderCustomCharts();
  buildFileInfo();
  renderInputForm();
}

function buildPageRange(cur, max) {
  if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);
  const range = new Set([1, max, cur]);
  for (let i = Math.max(1, cur - 2); i <= Math.min(max, cur + 2); i++) range.add(i);
  return [...range].sort((a, b) => a - b);
}

// ─── FILE INFO & COLUMN CHIPS ─────────────────────────────────────────
function buildFileInfo() {
  const rows = [
    { label: 'Nama File', value: currentFile.name },
    { label: 'Ukuran', value: formatBytes(currentFile.size) },
    { label: 'Total Baris', value: parsedData.length.toLocaleString('id-ID') },
    { label: 'Total Kolom', value: columns.length },
  ];
  fileInfoList.innerHTML = rows.map((r) =>
    `<div class="file-info-row"><span class="file-info-label">${r.label}</span><span class="file-info-value">${escapeHtml(String(r.value))}</span></div>`
  ).join('');
}

function buildColumnChips() {
  const mapped = new Set(Object.values(invCols).filter(Boolean));
  columnChips.innerHTML = columns.map((col) =>
    `<span class="col-chip${mapped.has(col) ? ' mapped' : ''}">${escapeHtml(col)}</span>`
  ).join('');
}

// ─── EXPORT CSV ───────────────────────────────────────────────────────
function exportCSV() {
  const rows = [columns.join(',')];
  filteredData.forEach((row) => {
    rows.push(columns.map((col) => {
      const val = String(row[col] ?? '');
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'export-inventaris.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('Data berhasil diekspor');
}

// ─── DOWNLOAD CHART ───────────────────────────────────────────────────
function downloadChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const exp = document.createElement('canvas');
  exp.width = canvas.width; exp.height = canvas.height;
  const ctx = exp.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, exp.width, exp.height);
  ctx.drawImage(canvas, 0, 0);
  const a = document.createElement('a');
  a.download = filename; a.href = exp.toDataURL('image/png'); a.click();
  showToast('Grafik berhasil diunduh');
}

// ─── RESET ────────────────────────────────────────────────────────────
function resetAll() {
  parsedData = [];
  filteredData = [];
  columns = [];
  currentFile = { name: '', size: 0, rows: 0 };
  invCols = { device: '', status: '', type: '', location: '', ip: '', vendor: '' };
  searchQuery = '';
  sortCol = null;

  destroyCharts('bar', 'line', 'pie', 'status', 'type', 'location');

  dashboard.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  chartsArea.classList.add('hidden');
  if (statusDot) statusDot.classList.remove('active');
  headerStatus.textContent = 'Belum ada data dimuat';
  btnHeaderReset.classList.add('hidden');
  dataFileInfo.textContent = '';
  tableSearch.value = '';
  csvInput.value = '';

  // Reset to first tab
  tabs.forEach((t, i) => { t.classList.toggle('active', i === 0); t.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); });
  tabPanels.forEach((p, i) => p.classList.toggle('hidden', i !== 0));

  isTableEditMode = false;
  if (btnToggleEditTable) {
    btnToggleEditTable.classList.remove('active');
    btnToggleEditTable.textContent = 'Edit Data';
  }
  if ($('tableEditNotice')) $('tableEditNotice').classList.add('hidden');

  recentAdditions = [];
  if (inputFieldsGrid) inputFieldsGrid.innerHTML = '';
  if (inputLogList) inputLogList.innerHTML = '';
  if (inputLogCount) inputLogCount.textContent = 'Belum ada data yang ditambahkan';
  if (inputDataForm) inputDataForm.reset();

  showToast('Data direset');
}

// ─── HELPERS ──────────────────────────────────────────────────────────
function destroyCharts(...keys) {
  keys.forEach((key) => {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      chartInstances[key] = null;
    }
  });
}

function getFrequency(col) {
  const freq = {};
  parsedData.forEach((r) => {
    const key = String(r[col] ?? '(kosong)').trim();
    freq[key] = (freq[key] || 0) + 1;
  });
  return freq;
}

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  if (Number.isInteger(num)) return num.toLocaleString('id-ID');
  return parseFloat(num.toFixed(2)).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg, duration = 2800) {
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}
