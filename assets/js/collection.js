// Страница «Взыскание»: любой период (от и до), оператор или весь отдел, рост/падение.
// Данные: /api/collection -> { "Оператор": { daily: [ {date, month_label, collected, daily, plan}, ... ] } }
//   collected — накопленная сумма с начала месяца на дату отчёта,
//   daily     — сумма именно за этот день, если она была в файле (иначе null, и «за день» считается разницей отчётов).
let DATA = {};
const state = { scope: '', from: null, to: null };
let chart = null;
let tableRows = [];
const DAY = 86400000;

function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function addDays(d, n) { return iso(Date.parse(d) + n * DAY); }
function monthStart(d) { return d.slice(0, 8) + '01'; }
function dim(d) { return new Date(+d.slice(0, 4), +d.slice(5, 7), 0).getDate(); }

// сумма сбора за каждый отчёт оператора (приращение): за день из файла или разница накопленных
const incCache = {};
function incs(emp) {
  if (incCache[emp]) return incCache[emp];
  const out = [];
  let prev = null;
  ((DATA[emp] || {}).daily || []).forEach(d => {
    const same = prev && prev.month_label === d.month_label;
    const inc = d.daily !== null && d.daily !== undefined ? d.daily : (same ? d.collected - prev.collected : d.collected);
    out.push({ date: d.date, month: d.month_label, inc, cum: d.collected, plan: d.plan || 0 });
    prev = d;
  });
  return (incCache[emp] = out);
}
function allEmps() { return Object.keys(DATA); }
function scopeEmps() { return state.scope ? [state.scope] : allEmps(); }

function sumRange(emps, from, to) {
  let sum = 0, n = 0;
  emps.forEach(e => incs(e).forEach(p => { if (p.date >= from && p.date <= to) { sum += p.inc; n++; } }));
  return { sum, n };
}
function cumAt(emp, date) { // накопленно с начала месяца на дату (последний отчёт ≤ date в том же месяце)
  const m = date.slice(0, 7);
  let last = null;
  incs(emp).forEach(p => { if (p.date <= date && p.date.slice(0, 7) === m) last = p; });
  return last;
}
function cumEmps(emps, date) {
  let c = 0, plan = 0, any = false;
  emps.forEach(e => { const p = cumAt(e, date); if (p) { c += p.cum; plan += p.plan; any = true; } });
  return any ? { cum: c, plan } : null;
}
function lenDays(from, to) { return QC.daysBetween(from, to) + 1; }
function prevRange(from, to) { const n = lenDays(from, to); return { from: addDays(from, -n), to: addDays(from, -1) }; }
function trendOf(cur, prev) {
  if (!(prev > 0)) return { t: 'none', pct: null };
  const r = cur / prev;
  return { t: r > 1.05 ? 'up' : r < 0.95 ? 'down' : 'flat', pct: (r - 1) * 100 };
}
function trendHtml(tr) {
  if (tr.t === 'none') return '<span class="t-none">нет данных за пред. период</span>';
  const cls = tr.t === 'up' ? 't-up' : tr.t === 'down' ? 't-down' : 't-flat';
  const sym = tr.t === 'up' ? '▲' : tr.t === 'down' ? '▼' : '●';
  return `<span class="${cls}">${sym} ${tr.pct > 0 ? '+' : ''}${tr.pct.toFixed(1).replace('.', ',')}%</span>`;
}
function planColor(pct, pace) {
  if (pct === null) return '#64748b';
  return pct >= pace ? '#22c55e' : pct >= pace * 0.85 ? '#eab308' : '#ef4444';
}
function dataRange() {
  let min = null, max = null;
  Object.values(DATA).forEach(e => (e.daily || []).forEach(d => { if (!min || d.date < min) min = d.date; if (!max || d.date > max) max = d.date; }));
  return { min, max };
}

async function refresh() {
  const box = document.getElementById('msgBox');
  try { DATA = await QC.api('/api/collection'); }
  catch (e) {
    box.innerHTML = QC.notice('err', 'Не удалось загрузить данные взыскания: ' + e.message);
    document.getElementById('pageSub').textContent = 'Нет связи с сервером';
    return;
  }
  Object.keys(incCache).forEach(k => delete incCache[k]);
  const { min, max } = dataRange();
  if (!max) {
    document.getElementById('filters').style.display = 'none';
    document.getElementById('collectionContent').style.display = 'none';
    document.getElementById('exportCollectionBtn').style.display = 'none';
    document.getElementById('pageSub').textContent = 'Пока нет отчётов по взысканию';
    box.innerHTML = '<div class="card" style="text-align:center;padding:24px;">Отчёты по взысканию ещё не загружены.<br>' +
      'Нажмите «Загрузить отчёт» и выберите Excel с колонками «Оператор, Дата, Собрано, План». ' +
      '<a href="assets/templates/collection_template.xlsx" download style="color:#FF5D16;font-weight:600;">Скачать шаблон</a></div>';
    return;
  }
  box.innerHTML = '';
  document.getElementById('filters').style.display = 'flex';
  document.getElementById('collectionContent').style.display = 'block';
  document.getElementById('exportCollectionBtn').style.display = 'flex';
  if (state.scope && !DATA[state.scope]) state.scope = '';
  if (!state.to || state.to > max || state.to < min) { state.to = max; state.from = monthStart(max); }
  render();
}

function render() {
  const { min, max } = dataRange();
  if (state.from > state.to) state.from = state.to;
  const sSel = document.getElementById('scopeSelect');
  sSel.innerHTML = '<option value="">Весь отдел</option>' + allEmps().sort().map(n => `<option value="${QC.esc(n)}" ${n === state.scope ? 'selected' : ''}>${QC.esc(n)}</option>`).join('');
  const f = document.getElementById('fromDate'), t = document.getElementById('toDate');
  f.value = state.from; t.value = state.to; f.min = t.min = min; f.max = t.max = max;
  document.getElementById('prevRange').disabled = state.from <= min;
  document.getElementById('nextRange').disabled = state.to >= max;
  const who = state.scope || 'весь отдел';
  document.getElementById('pageSub').textContent =
    `${who}: ${QC.fmtDate(state.from)}${state.from === state.to ? '' : ' – ' + QC.fmtDate(state.to)}. Последний загруженный отчёт: ${QC.fmtDate(max)}`;
  renderCards(who);
  renderChart(who);
  renderTable();
}

function renderCards(who) {
  const emps = scopeEmps(), { from, to } = state;
  const cur = sumRange(emps, from, to), pr = prevRange(from, to), prev = sumRange(emps, pr.from, pr.to);
  const tr = trendOf(cur.sum, prev.sum), n = lenDays(from, to);
  const trAvg = trendOf(cur.sum / n, prev.sum / n);
  const c = cumEmps(emps, to);
  const pct = c && c.plan > 0 ? (c.cum / c.plan) * 100 : null;
  const pace = (+to.slice(8) / dim(to)) * 100;
  const prevTxt = `${QC.fmtDay(pr.from)}–${QC.fmtDay(pr.to)}`;
  const cards = [
    { l: 'Собрано за период', v: cur.n ? QC.fmtShort(cur.sum) + ' UZS' : '—', s: cur.n ? trendHtml(tr) + ` <span class="muted">к ${prevTxt}</span>` : 'в этот период отчётов нет' },
    { l: 'В среднем в день', v: cur.n ? QC.fmtShort(cur.sum / n) : '—', s: cur.n ? trendHtml(trAvg) : '' },
    { l: 'С начала месяца (на ' + QC.fmtDay(to) + ')', v: c ? QC.fmtShort(c.cum) + ' UZS' : '—', s: c ? '' : 'нет отчёта за этот месяц' },
    { l: 'Выполнение плана', v: pct === null ? '—' : QC.fmtPct(pct), c: planColor(pct, pace), s: pct === null ? 'плана в файле нет' : `ожидаемо к этой дате ≈ ${QC.fmtPct(pace, 0)}` },
  ];
  document.getElementById('statCards').innerHTML = cards.map(k => `<div class="card">
    <div class="kpi-label" style="margin:0 0 6px;">${QC.esc(k.l)}</div>
    <div class="kpi-value" style="${k.c ? 'color:' + k.c : ''}">${k.v}</div>
    <div style="margin-top:6px;font-size:12px;">${k.s || ''}</div></div>`).join('');
}

function renderChart(who) {
  const emps = scopeEmps();
  const cFrom = state.from === state.to ? monthStart(state.to) : state.from;
  const dates = Array.from(new Set(emps.flatMap(e => incs(e).filter(p => p.date >= cFrom && p.date <= state.to).map(p => p.date)))).sort();
  const bars = dates.map(d => emps.reduce((s, e) => s + incs(e).filter(p => p.date === d).reduce((a, p) => a + p.inc, 0), 0) / 1e6);
  const line = dates.map(d => { const c = cumEmps(emps, d); return c ? c.cum / 1e6 : null; });
  document.getElementById('chartTitle').textContent = `Динамика сбора: ${who}`;
  const have = new Set(dates), missing = [];
  for (let d = cFrom; d <= state.to; d = addDays(d, 1)) if (!have.has(d)) missing.push(QC.fmtDay(d));
  document.getElementById('gapNote').textContent = missing.length && dates.length
    ? `Нет отчётов за: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' и ещё ' + (missing.length - 12) : ''}. На графике это пропуск, а не падение.` : '';
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('deptTrendChart'), {
    data: {
      labels: dates.map(QC.fmtDay),
      datasets: [
        { type: 'bar', label: 'За день/период, млн', data: bars, backgroundColor: 'rgba(255,93,22,0.45)', yAxisID: 'y' },
        { type: 'line', label: 'С начала месяца, млн', data: line, borderColor: '#3FA7C9', tension: 0, pointRadius: 3, yAxisID: 'y1' },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: {
      y: { position: 'left', title: { display: true, text: 'за день, млн' } },
      y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'накопленно, млн' } } } },
  });
}

function renderTable() {
  const { from, to } = state, pr = prevRange(from, to), n = lenDays(from, to);
  tableRows = allEmps().map(e => {
    const cur = sumRange([e], from, to);
    if (!cur.n) return null;
    const prev = sumRange([e], pr.from, pr.to), c = cumAt(e, to);
    return { name: e, sum: cur.sum, days: cur.n, avg: cur.sum / n, tr: trendOf(cur.sum, prev.sum),
      cum: c ? c.cum : null, plan: c ? c.plan : 0, pct: c && c.plan > 0 ? (c.cum / c.plan) * 100 : null };
  }).filter(Boolean);
  const hasPlan = tableRows.length && tableRows.every(r => r.pct !== null);
  tableRows.sort((a, b) => (hasPlan ? b.pct - a.pct : b.sum - a.sum));
  const pace = (+to.slice(8) / dim(to)) * 100;
  document.getElementById('tableTitle').textContent = `Операторы: ${QC.fmtDate(from)}${from === to ? '' : ' – ' + QC.fmtDate(to)}`;
  document.getElementById('collectionBody').innerHTML = tableRows.map((r, i) => `<tr class="row-click ${r.name === state.scope ? 'row-sel' : ''}" data-name="${QC.esc(r.name)}">
    <td style="font-weight:800;">${i + 1}</td><td style="font-weight:600;">${QC.esc(r.name)}</td>
    <td>${QC.fmtUZS(r.sum)}</td><td>${trendHtml(r.tr)}</td><td>${QC.fmtUZS(r.avg)}</td>
    <td>${r.cum === null ? '<span class="t-none">нет</span>' : QC.fmtUZS(r.cum)}</td>
    <td style="color:${planColor(r.pct, pace)};font-weight:700;">${r.pct === null ? '—' : QC.fmtPct(r.pct)}</td><td>${r.days}</td></tr>`).join('');
  document.querySelectorAll('#collectionBody tr').forEach(tr => tr.addEventListener('click', () => {
    state.scope = state.scope === tr.dataset.name ? '' : tr.dataset.name; render();
  }));
}

function exportCollectionToExcel() {
  if (!tableRows.length) return;
  const headers = ['#', 'Оператор', 'Собрано за период, UZS', 'Рост к пред. периоду, %', 'В среднем в день, UZS', 'С начала месяца, UZS', 'План, UZS', '% плана', 'Дней с отчётом'];
  const rows = tableRows.map((r, i) => [i + 1, r.name, Math.round(r.sum), r.tr.pct === null ? '' : Math.round(r.tr.pct * 10) / 10,
    Math.round(r.avg), r.cum === null ? '' : Math.round(r.cum), Math.round(r.plan || 0), r.pct === null ? '' : Math.round(r.pct * 10) / 10, r.days]);
  downloadXlsx(`Взыскание_${state.from}_${state.to}.xlsx`, [{ name: 'Период', headers, rows }]);
}
window.exportCollectionToExcel = exportCollectionToExcel;

function setPreset(p) {
  const { min, max } = dataRange();
  const to = state.to || max;
  if (p === 'day') state.from = to;
  else if (p === 'week') state.from = addDays(to, -6);
  else if (p === 'month') state.from = monthStart(to);
  else { state.from = min; state.to = max; }
  if (state.from < min) state.from = min;
  render();
}
function shift(dir) {
  const { min, max } = dataRange(), n = lenDays(state.from, state.to);
  let f = addDays(state.from, dir * n), t = addDays(state.to, dir * n);
  if (t > max) { t = max; f = addDays(t, -(n - 1)); }
  if (f < min) { f = min; t = addDays(f, n - 1); if (t > max) t = max; }
  state.from = f; state.to = t; render();
}

function bind() {
  document.getElementById('scopeSelect').onchange = e => { state.scope = e.target.value; render(); };
  document.getElementById('fromDate').onchange = e => { if (e.target.value) { state.from = e.target.value; if (state.from > state.to) state.to = state.from; render(); } };
  document.getElementById('toDate').onchange = e => { if (e.target.value) { state.to = e.target.value; if (state.from > state.to) state.from = state.to; render(); } };
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.preset)));
  document.getElementById('prevRange').onclick = () => shift(-1);
  document.getElementById('nextRange').onclick = () => shift(1);
}

window.onDataUploaded = refresh;
window.initCollectionPage = function () { bind(); refresh(); };
