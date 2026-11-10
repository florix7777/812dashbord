// Общие помощники новых страниц: запросы к API, форматирование, стрелки роста.
(function () {
  const QC = {};
  QC.esc = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  QC.api = async function (url, options) {
    let res;
    try { res = await fetch(url, options); }
    catch (e) { throw new Error('Нет связи с сервером. Проверьте интернет или попробуйте позже.'); }
    let body = null;
    try { body = await res.json(); } catch (e) { /* пустой ответ */ }
    if (!res.ok) {
      const d = body && body.detail;
      const msg = typeof d === 'string' ? d : (d && d.message) || ('Ошибка сервера ' + res.status);
      const err = new Error(msg);
      err.problems = (d && d.problems) || [];
      err.status = res.status;
      throw err;
    }
    return body;
  };
  QC.fmtInt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('ru-RU');
  };
  QC.fmtUZS = function (n) { return n === null || n === undefined || isNaN(n) ? '—' : QC.fmtInt(n) + ' UZS'; };
  QC.fmtShort = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + ' млрд';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' млн';
    return QC.fmtInt(n);
  };
  QC.fmtPct = function (n, d) { return n === null || n === undefined || isNaN(n) ? '—' : n.toFixed(d === undefined ? 1 : d).replace('.', ',') + '%'; };
  QC.fmtDate = function (iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '—'; };
  QC.fmtDay = function (iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) : '—'; };
  QC.daysBetween = function (a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); };
  QC.arrow = function (trend) {
    if (trend === 'up') return '<span class="t-up">▲ рост</span>';
    if (trend === 'down') return '<span class="t-down">▼ падение</span>';
    if (trend === 'flat') return '<span class="t-flat">● без изменений</span>';
    return '<span class="t-none">—</span>';
  };
  QC.deltaPP = function (delta) { // дельта TQS в долях -> «+2,5 п.п.» со стрелкой
    if (delta === null || delta === undefined) return '<span class="t-none">—</span>';
    const pp = delta * 100;
    const cls = pp > 1 ? 't-up' : pp < -1 ? 't-down' : 't-flat';
    const sym = pp > 1 ? '▲' : pp < -1 ? '▼' : '●';
    return '<span class="' + cls + '">' + sym + ' ' + (pp > 0 ? '+' : '') + pp.toFixed(1).replace('.', ',') + ' п.п.</span>';
  };
  QC.notice = function (kind, text) { return '<div class="notice ' + kind + '">' + QC.esc(text) + '</div>'; };
  QC.freshness = async function () { // для подписи «данные на …»
    try { return await QC.api('/api/status'); } catch (e) { return null; }
  };
  window.QC = QC;
})();
