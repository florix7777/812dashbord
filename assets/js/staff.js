// Страница «Сотрудники»: дубли имён, ручное добавление, отключение.
function msg(kind, text) { document.getElementById('msgBox').innerHTML = QC.notice(kind, text); }

async function load() {
  let data;
  try { data = await QC.api('/api/staff'); }
  catch (e) { msg('err', 'Не удалось загрузить список: ' + e.message); return; }
  const active = data.items.filter(s => s.active).length;
  document.getElementById('pageSub').textContent = `Всего ${data.total}, активных ${active}`;
  const pairs = data.possible_duplicates || [];
  document.getElementById('dupCard').style.display = pairs.length ? 'block' : 'none';
  document.getElementById('dupList').innerHTML = pairs.map((p, i) => `<div class="call-card" data-i="${i}">
    <div style="margin-bottom:8px;"><b>${QC.esc(p.a)}</b> &nbsp;и&nbsp; <b>${QC.esc(p.b)}</b></div>
    <button class="btn-soft" data-act="merge" data-src="${QC.esc(p.b)}" data-tgt="${QC.esc(p.a)}">Один человек: оставить «${QC.esc(p.a)}»</button>
    <button class="btn-soft" data-act="merge" data-src="${QC.esc(p.a)}" data-tgt="${QC.esc(p.b)}">Один человек: оставить «${QC.esc(p.b)}»</button>
    <button class="btn-soft" data-act="no" data-a="${QC.esc(p.a)}" data-b="${QC.esc(p.b)}">Разные люди</button></div>`).join('');
  document.querySelectorAll('#dupList button').forEach(b => b.addEventListener('click', () => onPair(b)));
  document.getElementById('staffBody').innerHTML = data.items.map(s => `<tr>
    <td style="font-weight:600;${s.active ? '' : 'opacity:.5;'}">${QC.esc(s.name)}</td>
    <td>${s.last_call_date ? QC.fmtDate(s.last_call_date) : '<span class="muted">нет</span>'}</td>
    <td>${s.last_collection_date ? QC.fmtDate(s.last_collection_date) : '<span class="muted">нет</span>'}</td>
    <td><button class="btn-soft" data-name="${QC.esc(s.name)}" data-active="${s.active}">${s.active ? 'Активен · отключить' : 'Отключён · включить'}</button></td></tr>`).join('');
  document.querySelectorAll('#staffBody button').forEach(b => b.addEventListener('click', async () => {
    try {
      await QC.api('/api/staff/active', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: b.dataset.name, active: b.dataset.active !== 'true' }) });
      load();
    } catch (e) { msg('err', e.message); }
  }));
}

async function onPair(b) {
  const post = (url, body) => QC.api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    if (b.dataset.act === 'merge') {
      if (!confirm(`Объединить «${b.dataset.src}» с «${b.dataset.tgt}»? Все данные перейдут к «${b.dataset.tgt}». Отменить это нельзя.`)) return;
      await post('/api/staff/merge', { source: b.dataset.src, target: b.dataset.tgt });
      msg('ok', 'Записи объединены.');
    } else {
      await post('/api/staff/not-same', { a: b.dataset.a, b: b.dataset.b });
      msg('ok', 'Запомнил: это разные люди.');
    }
    load();
  } catch (e) { msg('err', e.message); }
}

window.onDataUploaded = load;
window.initStaffPage = function () {
  document.getElementById('addBtn').onclick = async () => {
    const input = document.getElementById('newName');
    try {
      await QC.api('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) });
      msg('ok', 'Сотрудник добавлен.');
      input.value = '';
      load();
    } catch (e) { msg('err', e.message); }
  };
  load();
};
