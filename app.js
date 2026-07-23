/* =====================================================
   CSV DATA VISUALIZER — APP.JS
   Fitur: CSV Upload, Bar/Line/Pie Chart (Chart.js),
          Tooltip interaktif, Animasi entrance,
          Statistik ringkasan, Pratinjau tabel,
          Download chart sebagai gambar
   ===================================================== */

'use strict';

// ─── DATA STORE ──────────────────────────────────────
/** @type {Array<Object>} Seluruh data hasil parsing CSV */
let parsedData = [];

/** @type {string[]} Nama-nama kolom dari CSV */
let columns = [];

/** @type {Chart|null} Instance chart yang aktif */
let chartInstances = { bar: null, line: null, pie: null };

// ─── WARNA PALETTE ───────────────────────────────────
const PALETTE = [
  '#2563eb', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899',
  '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#f97316',
  '#84cc16', '#3b82f6', '#a855f7', '#06b6d4', '#d946ef',
  '#22c55e', '#eab308', '#f43f5e', '#64748b', '#0891b2',
];

// Warna semi-transparan untuk bar/line fill
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── DOM REFERENCES ──────────────────────────────────
const csvInput      = document.getElementById('csvInput');
const dropZone      = document.getElementById('dropZone');
const controlSection = document.getElementById('controlSection');
const statsSection  = document.getElementById('statsSection');
const chartsArea    = document.getElementById('chartsArea');
const tableSection  = document.getElementById('tableSection');
const labelColSel   = document.getElementById('labelCol');
const valueColSel   = document.getElementById('valueCol');
const chartTypeSel  = document.getElementById('chartType');
const btnRender     = document.getElementById('btnRender');
const btnReset      = document.getElementById('btnReset');
const headerStatus  = document.getElementById('headerStatus');
const toast         = document.getElementById('toast');

// Stats
const statRows = document.getElementById('statRows');
const statCols = document.getElementById('statCols');
const statMax  = document.getElementById('statMax');
const statMin  = document.getElementById('statMin');
const statAvg  = document.getElementById('statAvg');
const statSum  = document.getElementById('statSum');

// Table
const tableHead  = document.getElementById('tableHead');
const tableBody  = document.getElementById('tableBody');
const tableBadge = document.getElementById('tableBadge');

// Chart wrappers
const wrapBar  = document.getElementById('wrapBar');
const wrapLine = document.getElementById('wrapLine');
const wrapPie  = document.getElementById('wrapPie');
const rowBarLine = document.getElementById('rowBarLine');
const rowPie   = document.getElementById('rowPie');

// Download buttons
document.getElementById('btnDlBar').addEventListener('click', () => downloadChart('barChart', 'bar-chart.png'));
document.getElementById('btnDlLine').addEventListener('click', () => downloadChart('lineChart', 'line-chart.png'));
document.getElementById('btnDlPie').addEventListener('click', () => downloadChart('pieChart', 'pie-chart.png'));

// ─── CHART.JS GLOBAL DEFAULTS ────────────────────────
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#374151';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17,24,39,0.92)';
Chart.defaults.plugins.tooltip.titleColor      = '#f9fafb';
Chart.defaults.plugins.tooltip.bodyColor       = '#e5e7eb';
Chart.defaults.plugins.tooltip.padding         = { x: 12, y: 10 };
Chart.defaults.plugins.tooltip.cornerRadius    = 8;
Chart.defaults.plugins.tooltip.titleFont       = { weight: '600', size: 13 };
Chart.defaults.plugins.tooltip.bodyFont        = { size: 12 };
Chart.defaults.plugins.tooltip.displayColors   = true;
Chart.defaults.plugins.tooltip.boxPadding      = 4;
Chart.defaults.animation.duration              = 700;
Chart.defaults.animation.easing               = 'easeOutQuart';

// ─── FILE INPUT HANDLER ──────────────────────────────
csvInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

// ─── DRAG & DROP ─────────────────────────────────────
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

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

// ─── BUTTONS ─────────────────────────────────────────
btnRender.addEventListener('click', renderCharts);

// Auto-render saat dropdown berubah
labelColSel.addEventListener('change', () => { if (parsedData.length) renderCharts(); });
valueColSel.addEventListener('change', () => { if (parsedData.length) renderCharts(); });
chartTypeSel.addEventListener('change', () => { if (parsedData.length) renderCharts(); });

btnReset.addEventListener('click', () => {
  parsedData = [];
  columns    = [];
  destroyAllCharts();
  hide(controlSection, statsSection, chartsArea, tableSection);
  if (headerStatus) headerStatus.textContent = 'Belum ada data dimuat';
  csvInput.value = '';
  showToast('Data telah direset');
});

// ─── VALIDASI EKSTENSI ───────────────────────────────
function isValidFile(name) {
  return /\.(csv|xlsx)$/i.test(name);
}

// ─── PROCESS FILE ────────────────────────────────────
function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'xlsx') {
    // Baca sebagai ArrayBuffer untuk SheetJS
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { data, cols } = parseXLSX(e.target.result);
        if (data.length === 0) {
          showToast('File XLSX kosong atau tidak valid');
          return;
        }
        parsedData = data;
        columns    = cols;
        setupUI();
        showToast(`File dimuat: ${data.length} baris, ${cols.length} kolom`);
      } catch (err) {
        showToast('Gagal memproses file XLSX');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);

  } else {
    // Baca sebagai teks untuk CSV
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { data, cols } = parseCSV(e.target.result);
        if (data.length === 0) {
          showToast('File CSV kosong atau tidak valid');
          return;
        }
        parsedData = data;
        columns    = cols;
        setupUI();
        showToast(`File dimuat: ${data.length} baris, ${cols.length} kolom`);
      } catch (err) {
        showToast('Gagal memproses file CSV');
        console.error(err);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }
}

// ─── XLSX PARSER (SheetJS) ───────────────────────────
function parseXLSX(arrayBuffer) {
  const workbook  = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];

  // sheet_to_json dengan header:1 menghasilkan array of arrays
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return { data: [], cols: [] };

  const cols = rows[0].map((h) => String(h).trim());
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Lewati baris kosong
    if (row.every((cell) => cell === '' || cell == null)) continue;
    const obj = {};
    cols.forEach((col, idx) => {
      const val = row[idx];
      obj[col]  = val !== undefined && val !== null ? String(val).trim() : '';
    });
    data.push(obj);
  }
  return { data, cols };
}

// ─── CSV PARSER ──────────────────────────────────────
function parseCSV(text) {
  const lines  = text.trim().split(/\r?\n/);
  const header = splitCSVLine(lines[0]);
  const data   = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row    = {};
    header.forEach((col, idx) => {
      row[col] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    data.push(row);
  }
  return { data, cols: header };
}

/** Parse satu baris CSV, mendukung nilai bertanda kutip */
function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

// ─── SETUP UI AFTER PARSE ────────────────────────────
function setupUI() {
  // Populate column selectors
  populateSelect(labelColSel, columns);
  populateSelect(valueColSel, columns);

  // Heuristic: pilih kolom numerik sebagai value
  const numericCol = columns.find((col) =>
    parsedData.slice(0, 10).every((row) => !isNaN(parseFloat(row[col])) && row[col] !== '')
  );
  const labelDefault = columns[0];
  const valueDefault = numericCol || (columns.length > 1 ? columns[1] : columns[0]);

  labelColSel.value = labelDefault;
  valueColSel.value = valueDefault;

  // Update header
  if (headerStatus) headerStatus.textContent = `${parsedData.length} baris · ${columns.length} kolom`;

  // Show sections
  show(controlSection, statsSection, tableSection);

  // Build table preview (max 100 rows)
  buildTable();

  // Render stats & charts immediately
  renderStats(valueDefault);
  renderCharts();
}

// ─── POPULATE SELECT ─────────────────────────────────
function populateSelect(el, cols) {
  el.innerHTML = '';
  cols.forEach((col) => {
    const opt = document.createElement('option');
    opt.value = col;
    opt.textContent = col;
    el.appendChild(opt);
  });
}

// ─── BUILD TABLE ─────────────────────────────────────
function buildTable() {
  const MAX_ROWS = 100;
  const displayData = parsedData.slice(0, MAX_ROWS);

  // Head
  tableHead.innerHTML = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;

  // Body
  tableBody.innerHTML = displayData
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${escapeHtml(row[c] ?? '')}</td>`).join('')}</tr>`
    )
    .join('');

  tableBadge.textContent = `${parsedData.length} baris${parsedData.length > MAX_ROWS ? ` (tampil ${MAX_ROWS})` : ''}`;
}

// ─── RENDER STATS ────────────────────────────────────
function renderStats(valCol) {
  const values = parsedData
    .map((r) => parseFloat(r[valCol]))
    .filter((v) => !isNaN(v));

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
    [statMax, statMin, statSum, statAvg].forEach((el) => (el.textContent = '-'));
  }

  // Animate stat cards
  document.querySelectorAll('.stat-card').forEach((card, i) => {
    card.classList.remove('animate-in');
    void card.offsetWidth; // reflow
    card.style.animationDelay = `${i * 0.06}s`;
    card.classList.add('animate-in');
  });
}

// ─── RENDER CHARTS ───────────────────────────────────
function renderCharts() {
  const labelCol  = labelColSel.value;
  const valueCol  = valueColSel.value;
  const chartType = chartTypeSel.value;

  if (!labelCol || !valueCol) {
    showToast('Pilih kolom label dan nilai terlebih dahulu');
    return;
  }

  // Extract labels & values
  const labels = parsedData.map((r) => r[labelCol] ?? '');
  const values = parsedData.map((r) => parseFloat(r[valueCol]));

  if (values.every(isNaN)) {
    showToast('Kolom nilai tidak mengandung data numerik');
    return;
  }

  renderStats(valueCol);
  destroyAllCharts();
  show(chartsArea);

  // Determine which charts to show
  const showBar  = chartType === 'all' || chartType === 'bar';
  const showLine = chartType === 'all' || chartType === 'line';
  const showPie  = chartType === 'all' || chartType === 'pie';

  // Row bar+line visibility
  rowBarLine.style.display = (showBar || showLine) ? '' : 'none';
  wrapBar.style.display    = showBar  ? '' : 'none';
  wrapLine.style.display   = showLine ? '' : 'none';
  rowPie.style.display     = showPie  ? '' : 'none';

  // Adjust grid if only one of bar/line is shown
  if (showBar && showLine) {
    rowBarLine.style.gridTemplateColumns = '1fr 1fr';
  } else {
    rowBarLine.style.gridTemplateColumns = '1fr';
  }

  // Animate chart cards
  [wrapBar, wrapLine, wrapPie].forEach((el) => {
    el.classList.remove('animate-in');
    void el.offsetWidth;
    el.classList.add('animate-in');
  });

  const colors      = PALETTE.slice(0, labels.length);
  const singleColor = PALETTE[0];

  // ── BAR CHART ──
  if (showBar) {
    const barBg = labels.map((_, i) => hexAlpha(PALETTE[i % PALETTE.length], 0.85));
    const barBorder = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    chartInstances.bar = new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: valueCol,
          data: values,
          backgroundColor: barBg,
          borderColor: barBorder,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: buildBarLineOptions(labelCol, valueCol, 'bar'),
    });
  }

  // ── LINE CHART ──
  if (showLine) {
    chartInstances.line = new Chart(document.getElementById('lineChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: valueCol,
          data: values,
          borderColor: singleColor,
          backgroundColor: hexAlpha(singleColor, 0.1),
          borderWidth: 2.5,
          pointBackgroundColor: singleColor,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.38,
        }],
      },
      options: buildBarLineOptions(labelCol, valueCol, 'line'),
    });
  }

  // ── PIE CHART ──
  if (showPie) {
    chartInstances.pie = new Chart(document.getElementById('pieChart'), {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          label: valueCol,
          data: values,
          backgroundColor: colors.map((c) => hexAlpha(c, 0.85)),
          borderColor: colors,
          borderWidth: 1.5,
          hoverOffset: 10,
        }],
      },
      options: buildPieOptions(valueCol),
    });
  }
}

// ─── CHART OPTIONS BUILDERS ──────────────────────────
function buildBarLineOptions(labelCol, valueCol, type) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750,
      easing: 'easeOutQuart',
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          title: (items) => items[0].label,
          label: (item) => {
            const val = item.raw;
            return ` ${valueCol}: ${formatNumber(val)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          font: { size: 11 },
          color: '#6b7280',
          maxTicksLimit: 20,
        },
        title: {
          display: !!labelCol,
          text: labelCol,
          color: '#9ca3af',
          font: { size: 11, weight: '500' },
        },
      },
      y: {
        grid: {
          color: '#f3f4f6',
          lineWidth: 1,
        },
        border: {
          display: false,
          dash: [4, 4],
        },
        ticks: {
          color: '#6b7280',
          font: { size: 11 },
          callback: (val) => formatNumber(val),
        },
        title: {
          display: !!valueCol,
          text: valueCol,
          color: '#9ca3af',
          font: { size: 11, weight: '500' },
        },
      },
    },
  };
}

function buildPieOptions(valueCol) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 800,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 14,
          font: { size: 12 },
          color: '#374151',
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const dataset = item.dataset;
            const total   = dataset.data.reduce((a, b) => (a || 0) + (b || 0), 0);
            const val     = item.raw;
            const pct     = total ? ((val / total) * 100).toFixed(1) : 0;
            return ` ${item.label}: ${formatNumber(val)} (${pct}%)`;
          },
        },
      },
    },
  };
}

// ─── DOWNLOAD CHART ──────────────────────────────────
function downloadChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Gambar background putih
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width  = canvas.width;
  exportCanvas.height = canvas.height;
  const ctx = exportCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  ctx.drawImage(canvas, 0, 0);

  const link    = document.createElement('a');
  link.download = filename;
  link.href     = exportCanvas.toDataURL('image/png');
  link.click();
  showToast('Grafik berhasil diunduh');
}

// ─── HELPERS ─────────────────────────────────────────
function destroyAllCharts() {
  Object.keys(chartInstances).forEach((key) => {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      chartInstances[key] = null;
    }
  });
}

function show(...elements) {
  elements.forEach((el) => el && el.classList.remove('hidden'));
}

function hide(...elements) {
  elements.forEach((el) => el && el.classList.add('hidden'));
}

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  // Tampilkan bilangan bulat jika tidak ada desimal berarti
  if (Number.isInteger(num)) return num.toLocaleString('id-ID');
  return parseFloat(num.toFixed(2)).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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
