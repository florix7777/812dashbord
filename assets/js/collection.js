// Взыскание (collection) page logic.
// Fetches /api/collection (see backend/app.py get_collection()) and renders:
//   - department-wide cumulative trend chart
//   - per-operator rating table: latest amount, % of plan, day-over-day
//     trend, and month-over-month comparison
//
// Data shape from the API:
//   { "Имя оператора": { "daily": [ {date, month_label, collected, plan}, ... ] } }
// `daily` is sorted ascending by date.

let COLLECTION_DATA = {};
let selectedCollectionMonth = null;

function escapeHtmlSafe(value) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtUZS(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('ru-RU') + ' UZS';
}

function fmtPctNum(n, digits) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toFixed(digits === undefined ? 1 : digits) + '%';
}

async function fetchCollectionData() {
  try {
    const res = await fetch('/api/collection');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('[collection] /api/collection unavailable:', e);
    return {};
  }
}

function allMonthsFromData(data) {
  const set = new Set();
  Object.values(data).forEach(emp => {
    (emp.daily || []).forEach(d => set.add(d.month_label));
  });
  // Sort chronologically using the ISO dates behind each month, not the label text
  const monthToDate = {};
  Object.values(data).forEach(emp => {
    (emp.daily || []).forEach(d => { monthToDate[d.month_label] = d.date; });
  });
  return Array.from(set).sort((a, b) => (monthToDate[a] < monthToDate[b] ? 1 : -1));
}

function latestForMonth(dailyArr, monthLabel) {
  const inMonth = (dailyArr || []).filter(d => d.month_label === monthLabel);
  if (!inMonth.length) return null;
  return inMonth[inMonth.length - 1]; // already sorted ascending by date
}

function prevDayForMonth(dailyArr, monthLabel, latest) {
  const inMonth = (dailyArr || []).filter(d => d.month_label === monthLabel);
  const idx = inMonth.findIndex(d => d.date === latest.date);
  return idx > 0 ? inMonth[idx - 1] : null;
}

function lastEntryOfPreviousMonth(dailyArr, months, currentMonthIndex) {
  if (currentMonthIndex >= months.length - 1) return null; // no earlier month in data
  const prevMonth = months[currentMonthIndex + 1]; // months[] sorted newest-first
  const inMonth = (dailyArr || []).filter(d => d.month_label === prevMonth);
  return inMonth.length ? inMonth[inMonth.length - 1] : null;
}

function buildRows(months) {
  const monthIdx = months.indexOf(selectedCollectionMonth);
  const rows = [];
  Object.keys(COLLECTION_DATA).forEach(name => {
    const daily = COLLECTION_DATA[name].daily || [];
    const latest = latestForMonth(daily, selectedCollectionMonth);
    if (!latest) return;
    const prevDay = prevDayForMonth(daily, selectedCollectionMonth, latest);
    const prevMonthEntry = lastEntryOfPreviousMonth(daily, months, monthIdx);

    const pctOfPlan = latest.plan > 0 ? (latest.collected / latest.plan) * 100 : null;
    const dayDelta = prevDay ? latest.collected - prevDay.collected : null;
    const monthDeltaPct = prevMonthEntry && prevMonthEntry.collected > 0
      ? ((latest.collected - prevMonthEntry.collected) / prevMonthEntry.collected) * 100
      : null;

    rows.push({ name, latest, pctOfPlan, dayDelta, monthDeltaPct, prevMonthEntry });
  });
  rows.sort((a, b) => b.latest.collected - a.latest.collected);
  return rows;
}

function renderStatCards(rows) {
  const totalCollected = rows.reduce((s, r) => s + r.latest.collected, 0);
  const totalPlan = rows.reduce((s, r) => s + (r.latest.plan || 0), 0);
  const planPct = totalPlan > 0 ? (totalCollected / totalPlan) * 100 : null;
  const growing = rows.filter(r => r.dayDelta !== null && r.dayDelta > 0).length;

  const cards = [
    { label: 'Собрано за месяц (отдел)', value: fmtUZS(totalCollected), accent: '#FF5D16' },
    { label: 'Выполнение плана (отдел)', value: planPct !== null ? fmtPctNum(planPct) : '—', accent: planPct >= 100 ? '#22c55e' : '#eab308' },
    { label: 'Растут к вчера', value: growing + ' из ' + rows.length, accent: '#22c55e' },
    { label: 'Лидер', value: rows.length ? escapeHtmlSafe(rows[0].name) : '—', accent: '#3FA7C9' },
  ];

  document.getElementById('statCards').innerHTML = cards.map(c => `
    <div class="card" style="padding:14px 16px;">
      <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">${c.label}</div>
      <div style="font-size:20px;font-weight:800;color:${c.accent};">${c.value}</div>
    </div>
  `).join('');
}

let deptTrendChartInstance = null;
function renderDeptTrendChart(rows, months) {
  const dateSet = new Set();
  Object.values(COLLECTION_DATA).forEach(emp => {
    (emp.daily || []).filter(d => d.month_label === selectedCollectionMonth).forEach(d => dateSet.add(d.date));
  });
  const dates = Array.from(dateSet).sort();
  const totalsByDate = dates.map(date => {
    let sum = 0;
    Object.values(COLLECTION_DATA).forEach(emp => {
      const entry = (emp.daily || []).find(d => d.date === date && d.month_label === selectedCollectionMonth);
      if (entry) sum += entry.collected;
    });
    return sum;
  });

  const ctx = document.getElementById('deptTrendChart');
  if (!ctx) return;
  if (deptTrendChartInstance) deptTrendChartInstance.destroy();
  deptTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => d.slice(8, 10) + '.' + d.slice(5, 7)),
      datasets: [{
        label: 'Собрано, UZS (нарастающим итогом)',
        data: totalsByDate,
        borderColor: '#FF5D16',
        backgroundColor: 'rgba(255, 93, 22,0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => (v / 1e6).toFixed(0) + 'M' } },
      },
    },
  });
}

function trendArrowHtml(dayDelta) {
  if (dayDelta === null) return '<span style="color:#64748b;">—</span>';
  if (dayDelta > 0) return `<span style="color:#22c55e;font-weight:700;">▲ +${fmtUZS(dayDelta)}</span>`;
  if (dayDelta < 0) return `<span style="color:#ef4444;font-weight:700;">▼ ${fmtUZS(dayDelta)}</span>`;
  return '<span style="color:#64748b;">без изменений</span>';
}

function monthCompareHtml(row) {
  if (row.monthDeltaPct === null) return '<span style="color:#64748b;">нет данных за пред. месяц</span>';
  const positive = row.monthDeltaPct >= 0;
  const color = positive ? '#22c55e' : '#ef4444';
  const arrow = positive ? '▲' : '▼';
  return `<span style="color:${color};font-weight:700;">${arrow} ${Math.abs(row.monthDeltaPct).toFixed(1)}%</span>`;
}

function renderTable(rows) {
  const body = document.getElementById('collectionBody');
  body.innerHTML = rows.map((row, idx) => {
    const pctColor = row.pctOfPlan === null ? '#64748b' : row.pctOfPlan >= 100 ? '#22c55e' : row.pctOfPlan >= 75 ? '#eab308' : '#ef4444';
    return `<tr>
      <td style="font-weight:800;color:${idx === 0 ? '#fbbf24' : '#94a3b8'};">${idx + 1}</td>
      <td style="font-weight:600;">${escapeHtmlSafe(row.name)}</td>
      <td>${fmtUZS(row.latest.collected)}</td>
      <td style="color:${pctColor};font-weight:700;">${row.pctOfPlan !== null ? fmtPctNum(row.pctOfPlan) : '—'}</td>
      <td>${trendArrowHtml(row.dayDelta)}</td>
      <td>${monthCompareHtml(row)}</td>
    </tr>`;
  }).join('');
}

function renderMonthSelect(months) {
  const sel = document.getElementById('monthSelect');
  sel.innerHTML = months.map(m => `<option value="${escapeHtmlSafe(m)}" ${m === selectedCollectionMonth ? 'selected' : ''}>${escapeHtmlSafe(m)}</option>`).join('');
  sel.onchange = () => {
    selectedCollectionMonth = sel.value;
    renderCollectionPage();
  };
}

function renderCollectionPage() {
  const months = allMonthsFromData(COLLECTION_DATA);
  const exportBtn = document.getElementById('exportCollectionBtn');
  if (!months.length) {
    document.getElementById('noDataBlock').style.display = 'block';
    document.getElementById('collectionContent').style.display = 'none';
    document.getElementById('pageSub').textContent = 'Нет загруженных отчётов по взысканию';
    if (exportBtn) exportBtn.style.display = 'none';
    return;
  }
  if (!selectedCollectionMonth || !months.includes(selectedCollectionMonth)) {
    selectedCollectionMonth = months[0];
  }

  document.getElementById('noDataBlock').style.display = 'none';
  document.getElementById('collectionContent').style.display = 'block';
  document.getElementById('pageSub').textContent = 'Ежедневная динамика сбора по операторам — обновляется автоматически при загрузке нового отчёта';
  if (exportBtn) exportBtn.style.display = 'flex';

  renderMonthSelect(months);
  const rows = buildRows(months);
  renderStatCards(rows);
  renderDeptTrendChart(rows, months);
  renderTable(rows);
}

async function initCollectionPage() {
  COLLECTION_DATA = await fetchCollectionData();
  renderCollectionPage();
}
window.initCollectionPage = initCollectionPage;

function exportCollectionToExcel() {
  const months = allMonthsFromData(COLLECTION_DATA);
  if (!months.length || !selectedCollectionMonth) return;
  const rows = buildRows(months);

  const headers = ['#', 'Оператор', 'Собрано, UZS', 'План, UZS', '% плана', 'Изменение к вчера, UZS', 'К пред. месяцу, %'];
  const dataRows = rows.map((r, i) => [
    i + 1,
    r.name,
    Math.round(r.latest.collected),
    Math.round(r.latest.plan || 0),
    r.pctOfPlan !== null ? Math.round(r.pctOfPlan * 10) / 10 : '',
    r.dayDelta !== null ? Math.round(r.dayDelta) : '',
    r.monthDeltaPct !== null ? Math.round(r.monthDeltaPct * 10) / 10 : '',
  ]);

  downloadXlsx(`Взыскание_${selectedCollectionMonth.replace(' ', '_')}_${todayForFilename()}.xlsx`, [
    { name: selectedCollectionMonth, headers, rows: dataRows },
  ]);
}
window.exportCollectionToExcel = exportCollectionToExcel;
