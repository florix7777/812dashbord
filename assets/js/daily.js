// «Контроль качества по дням»: любой период (от и до), оператор или весь отдел,
// рост/падение по дням, неделям и критериям, детали звонков.
const S = { scope: '', from: null, to: null, date: null };
let DAILY = { days: [], weeks: [] };
let STAFF = [];
let chart = null;
const DAY = 86400000;

function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function addDays(d, n) { return iso(Date.parse(d) + n * DAY); }
function monthStart(d) { return d.slice(0, 8) + '01'; }
function tqsColor(v) { return v < 0.5 ? '#ef4444' : v < 0.75 ? '#eab308' : '#22c55e'; }
function tqsCell(v) { return `<b style="color:${tqsColor(v)}">${QC.fmtPct(v * 100)}</b>`; }
function weakChips(d) {
  if (!d.weak || !d.weak.length) return '<span class="muted">нет</span>';
  return d.weak.map(k => `<span class="chip s${d.criteria[k] < 0.5 ? '0' : '5'}">${QC.esc(k)} ${Math.round(d.criteria[k] * 100)}%</span>`).join('');
}
function chip(v) { return `<span class="chip s${v === 0 ? '0' : v === 0.5 ? '5' : '1'}">${v}</span>`; }

// сводка по набору дней: звонки, TQS и критерии, взвешенные по числу звонков
function agg(days) {
  const calls = days.reduce((s, d) => s + d.calls, 0);
  if (!calls) return null;
  const crit = {};
  Object.keys(days[0].criteria).forEach(k => { crit[k] = days.reduce((s, d) => s + d.criteria[k] * d.calls, 0) / calls; });
  return { calls, days: days.length, tqs: days.reduce((s, d) => s + d.tqs * d.calls, 0) / calls, crit };
}
function inRange(a, b) { return DAILY.days.filter(d => d.date >= a && d.date <= b); }
function dataRange() {
  const ds = DAILY.days;
  return ds.length ? { min: ds[0].date, max: ds[ds.length - 1].date } : { min: null, max: null };
}

async function load() {
  const box = document.getElementById('msgBox');
  try {
    STAFF = (await QC.api('/api/staff')).items.filter(s => s.active).map(s => s.name);
    DAILY = await QC.api('/api/qc/daily' + (S.scope ? '?employee=' + encodeURIComponent(S.scope) : ''));
  } catch (e) {
    box.innerHTML = QC.notice('err', 'Не удалось загрузить данные: ' + e.message);
    document.getElementById('pageSub').textContent = 'Нет связи с сервером';
    return;
  }
  box.innerHTML = '';
  document.getElementById('filters').style.display = 'flex';
  const { min, max } = dataRange();
  if (!max && !S.scope) {
    document.getElementById('dailyContent').style.display = 'none';
    document.getElementById('pageSub').textContent = 'Оценки звонков ещё не загружены';
    box.innerHTML = QC.notice('warn', 'Загрузите Excel с оценками звонков (кнопка «Загрузить отчёт»): сайт сам прочитает его и покажет дни и недели.');
    return;
  }
  if (max && (!S.to || S.to > max || S.to < min)) { S.to = max; S.from = monthStart(max); }
  render();
}

function render() {
  const sSel = document.getElementById('scopeSelect');
  sSel.innerHTML = '<option value="">Весь отдел</option>' + STAFF.slice().sort().map(n => `<option value="${QC.esc(n)}" ${n === S.scope ? 'selected' : ''}>${QC.esc(n)}</option>`).join('');
  document.getElementById('dailyContent').style.display = DAILY.days.length ? 'block' : 'none';
  if (!DAILY.days.length) {
    document.getElementById('msgBox').innerHTML = QC.notice('warn', 'У этого оператора нет оценённых звонков.');
    return;
  }
  document.getElementById('msgBox').innerHTML = '';
  const { min, max } = dataRange();
  if (S.from > S.to) S.from = S.to;
  const f = document.getElementById('fromDate'), t = document.getElementById('toDate');
  f.value = S.from; t.value = S.to; f.min = t.min = min; f.max = t.max = max;
  document.getElementById('prevRange').disabled = S.from <= min;
  document.getElementById('nextRange').disabled = S.to >= max;

  const days = inRange(S.from, S.to);
  const n = QC.daysBetween(S.from, S.to) + 1;
  const prevFrom = addDays(S.from, -n), prevTo = addDays(S.from, -1);
  const cur = agg(days), prev = agg(inRange(prevFrom, prevTo));
  document.getElementById('pageSub').textContent = `${S.scope || 'весь отдел'}: ${QC.fmtDate(S.from)} – ${QC.fmtDate(S.to)}. Последний оценённый звонок: ${QC.fmtDate(max)}`;
  if (!cur) {
    document.getElementById('statCards').innerHTML = '';
    document.getElementById('msgBox').innerHTML = QC.notice('warn', 'В выбранный период оценённых звонков нет. Выберите другие даты.');
    ['critBody', 'weeksBody', 'daysBody'].forEach(id => { document.getElementById(id).innerHTML = ''; });
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  const weeks = DAILY.weeks.filter(w => w.week_end >= S.from && w.week_start <= S.to);
  const ld = days[days.length - 1], lw = weeks[weeks.length - 1];
  const kpis = [
    { l: 'Оценено звонков', v: QC.fmtInt(cur.calls), s: `за ${cur.days} дн. с оценками` + (prev ? `, в пред. периоде ${prev.calls}` : '') },
    { l: 'Средний TQS', v: QC.fmtPct(cur.tqs * 100), c: tqsColor(cur.tqs), s: prev ? QC.deltaPP(cur.tqs - prev.tqs) + ' <span class="muted">к пред. периоду</span>' : '<span class="muted">нет данных за пред. период</span>' },
    { l: 'Последний день к предыдущему', v: QC.fmtPct(ld.tqs * 100), c: tqsColor(ld.tqs), s: QC.deltaPP(ld.delta) + ` <span class="muted">(${QC.fmtDay(ld.date)})</span>` },
    { l: 'Неделя к предыдущей', v: lw ? QC.fmtPct(lw.tqs * 100) : '—', c: lw ? tqsColor(lw.tqs) : '', s: lw ? QC.deltaPP(lw.delta) + ` <span class="muted">(${QC.fmtDay(lw.week_start)}–${QC.fmtDay(lw.week_end)})</span>` : '' },
  ];
  document.getElementById('statCards').innerHTML = kpis.map(k => `<div class="card"><div class="kpi-label" style="margin:0 0 6px;">${k.l}</div>
    <div class="kpi-value" style="${k.c ? 'color:' + k.c : ''}">${k.v}</div><div style="margin-top:6px;font-size:12px;">${k.s}</div></div>`).join('');

  document.getElementById('chartTitle').textContent = `Итоговый балл (TQS) по дням: ${S.scope || 'весь отдел'}`;
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('dailyChart'), {
    data: {
      labels: days.map(d => QC.fmtDay(d.date)),
      datasets: [
        { type: 'bar', label: 'Звонков', data: days.map(d => d.calls), backgroundColor: 'rgba(100,116,139,0.35)', yAxisID: 'y1' },
        { type: 'line', label: 'TQS, %', data: days.map(d => d.tqs * 100), borderColor: '#FF5D16', tension: 0, pointRadius: 3, yAxisID: 'y' },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: {
      y: { min: 0, max: 100, title: { display: true, text: 'TQS, %' } },
      y1: { position: 'right', min: 0, max: Math.max(...days.map(d => d.calls)) * 3, ticks: { precision: 0 }, grid: { drawOnChartArea: false }, title: { display: true, text: 'звонков' } } } },
  });

  const keys = Object.keys(cur.crit).sort((a, b) => cur.crit[b] - cur.crit[a]);
  document.getElementById('critBody').innerHTML = keys.map(k => `<tr><td>${QC.esc(k)}</td>
    <td><b style="color:${tqsColor(cur.crit[k])}">${QC.fmtPct(cur.crit[k] * 100)}</b></td>
    <td>${prev ? QC.deltaPP(cur.crit[k] - prev.crit[k]) : '<span class="t-none">—</span>'}</td></tr>`).join('');

  document.getElementById('daysBody').innerHTML = days.slice().reverse().map(d => `<tr class="row-click ${d.date === S.date ? 'row-sel' : ''}" data-date="${d.date}">
    <td>${QC.fmtDate(d.date)}</td><td>${d.calls}</td><td>${tqsCell(d.tqs)}</td><td>${QC.deltaPP(d.delta)}</td><td>${QC.esc(d.aht)}</td>
    <td>${d.critical_calls ? `<span class="t-down">${d.critical_calls}</span>` : '0'}</td><td>${weakChips(d)}</td></tr>`).join('');
  document.querySelectorAll('#daysBody tr').forEach(tr => tr.addEventListener('click', () => { S.date = tr.dataset.date; render(); showDetail(); }));

  document.getElementById('weeksBody').innerHTML = weeks.slice().reverse().map(w => {
    const norm = S.scope ? (w.calls >= 4 ? '<span class="t-up">✓</span>' : `<span class="t-down">не хватает ${4 - w.calls}</span>`) : '<span class="muted">—</span>';
    return `<tr><td>${QC.fmtDay(w.week_start)}–${QC.fmtDay(w.week_end)}</td><td>${w.calls}</td><td>${tqsCell(w.tqs)}</td><td>${QC.deltaPP(w.delta)}</td><td>${norm}</td></tr>`;
  }).join('');
  if (S.date && S.date >= S.from && S.date <= S.to) showDetail(); else document.getElementById('detailCard').style.display = 'none';
}

async function showDetail() {
  const card = document.getElementById('detailCard'), body = document.getElementById('detailBody');
  if (!S.date) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  document.getElementById('detailTitle').textContent = `Детали за ${QC.fmtDate(S.date)}${S.scope ? ': ' + S.scope : ': все операторы'}`;
  try {
    if (S.scope) {
      const r = await QC.api(`/api/qc/calls?employee=${encodeURIComponent(S.scope)}&date=${S.date}`);
      body.innerHTML = r.calls.length ? r.calls.map(c => `<div class="call-card">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><b>Клиент ${QC.esc(c.client || '—')}</b>
        <span>${QC.esc(c.call_type)} · ${QC.esc(c.duration)} · TQS ${tqsCell(c.tqs)}</span></div>
        <div style="margin-top:6px;">${Object.keys(c.scores).map(k => `<span title="${QC.esc(k)}">${QC.esc(k)} ${chip(c.scores[k])}</span> `).join('')}</div>
        ${c.comment ? `<div class="muted" style="margin-top:6px;">${QC.esc(c.comment)}</div>` : ''}</div>`).join('') : '<span class="muted">В этот день звонков нет.</span>';
    } else {
      const r = await QC.api('/api/qc/day?date=' + S.date);
      body.innerHTML = '<table><thead><tr><th>Оператор</th><th>Звонков</th><th>TQS</th><th>Слабые критерии</th></tr></thead><tbody>' +
        r.operators.map(o => `<tr class="row-click" data-n="${QC.esc(o.employee)}"><td>${QC.esc(o.employee)}</td><td>${o.calls}</td><td>${tqsCell(o.tqs)}</td><td>${weakChips(o)}</td></tr>`).join('') + '</tbody></table>' +
        '<div class="muted" style="margin-top:8px;">Нажмите на оператора, чтобы открыть его звонки.</div>';
      body.querySelectorAll('tr[data-n]').forEach(tr => tr.addEventListener('click', async () => { S.scope = tr.dataset.n; await load(); }));
    }
  } catch (e) { body.innerHTML = QC.notice('err', e.message); }
}

function setPreset(p) {
  const { min, max } = dataRange();
  const to = S.to || max;
  if (p === 'week') S.from = addDays(to, -6);
  else if (p === 'month') S.from = monthStart(to);
  else if (p === 'quarter') S.from = addDays(to, -90);
  else { S.from = min; S.to = max; }
  if (S.from < min) S.from = min;
  S.date = null;
  render();
}
function shift(dir) {
  const { min, max } = dataRange(), n = QC.daysBetween(S.from, S.to) + 1;
  let f = addDays(S.from, dir * n), t = addDays(S.to, dir * n);
  if (t > max) { t = max; f = addDays(t, -(n - 1)); }
  if (f < min) { f = min; t = addDays(f, n - 1); if (t > max) t = max; }
  S.from = f; S.to = t; S.date = null; render();
}

window.onDataUploaded = load;
window.initDailyPage = function () {
  document.getElementById('scopeSelect').onchange = async e => { S.scope = e.target.value; S.date = null; document.getElementById('detailCard').style.display = 'none'; await load(); };
  document.getElementById('fromDate').onchange = e => { if (e.target.value) { S.from = e.target.value; if (S.from > S.to) S.to = S.from; S.date = null; render(); } };
  document.getElementById('toDate').onchange = e => { if (e.target.value) { S.to = e.target.value; if (S.from > S.to) S.from = S.to; S.date = null; render(); } };
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.preset)));
  document.getElementById('prevRange').onclick = () => shift(-1);
  document.getElementById('nextRange').onclick = () => shift(1);
  load();
};
