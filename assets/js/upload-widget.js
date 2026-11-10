// ============================================================
// Upload widget — lets people load reports (QC xlsx, взыскание xlsx,
// CRM-actions xlsx, PDF recommendations) straight from the browser,
// instead of needing server/SSH access or curl.
//
// Talks to the existing /api/upload/xlsx and /api/upload/pdf endpoints
// (see backend/app.py) — those already auto-detect which of the three
// xlsx report types a file is by its column headers, so this widget
// doesn't need to ask "which kind of report is this" at all, just
// route by file extension (.xlsx vs .pdf) and let the backend figure
// out the rest, same as it already does for files dropped into reports/
// on the server directly.
//
// Word (.docx) is intentionally NOT accepted here yet — there is no
// parser for it anywhere in the pipeline (auto_updater.py only handles
// .xlsx and .pdf). Accepting the file and silently doing nothing with
// it would be worse than not offering it, so the picker only allows
// the two formats that actually work end-to-end today.
// ============================================================

const UPLOAD_ENDPOINTS = { xlsx: '/api/upload', pdf: '/api/upload' };
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024; // matches backend MAX_UPLOAD_BYTES default

// Self-contained escaping — this widget loads on every page, including
// ones that don't load app.js (e.g. collection.html only loads core.js),
// so it can't rely on app.js's escapeHtml being present.
function uploadEscapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function injectUploadModal() {
  if (document.getElementById('uploadModalOverlay')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div id="uploadModalOverlay" class="upload-modal-overlay" onclick="if(event.target===this) closeUploadModal()">
      <div class="upload-modal">
        <div class="upload-modal-header">
          <div>
            <div class="upload-modal-title">Загрузить отчёт</div>
            <div class="upload-modal-sub">Оценки звонков, взыскание или CRM-действия: тип файла определяется автоматически</div>
          </div>
          <button class="upload-modal-close" onclick="closeUploadModal()">&times;</button>
        </div>

        <div style="margin-bottom:12px;font-size:12px;line-height:1.5;">
          <label for="uploadReportDate" style="font-weight:600;">Дата отчёта</label>
          <input type="date" id="uploadReportDate" class="search-box" style="width:auto;margin:0 8px;padding:5px 10px;font-size:12px;">
          <span style="opacity:.7;">нужна только если в файле нет колонки «Дата» (например, итог за месяц). Иначе оставьте пустой.</span>
          <div style="margin-top:8px;">
            <label for="uploadAmountType" style="font-weight:600;">Суммы взыскания в файле</label>
            <select id="uploadAmountType" class="search-box" style="width:auto;margin:0 8px;padding:5px 10px;font-size:12px;">
              <option value="auto">определить автоматически</option>
              <option value="cumulative">накопленные с начала месяца</option>
              <option value="daily">за один день</option>
            </select>
            <span style="opacity:.7;">нужно только для отчётов по взысканию</span>
          </div>
          <div style="margin-top:6px;"><a href="assets/templates/collection_template.xlsx" download style="color:#FF5D16;font-weight:600;">Скачать шаблон для взыскания</a></div>
        </div>

        <div id="uploadDropzone" class="upload-dropzone">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <div class="upload-dropzone-text">Перетащите файл сюда или нажмите, чтобы выбрать</div>
          <div class="upload-dropzone-hint">.xlsx или .pdf, до 20 МБ</div>
          <input type="file" id="uploadFileInput" accept=".xlsx,.pdf" multiple style="display:none;" onchange="handleUploadFiles(this.files)" />
        </div>

        <div id="uploadQueue" class="upload-queue"></div>

        <div class="upload-modal-footer">
          <span style="opacity:.6;">Файл разбирается сразу, результат появится ниже</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div.firstElementChild);

  const dz = document.getElementById('uploadDropzone');
  dz.addEventListener('click', () => document.getElementById('uploadFileInput').click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    handleUploadFiles(e.dataTransfer.files);
  });
}

function openUploadModal() {
  injectUploadModal();
  document.getElementById('uploadModalOverlay').classList.add('open');
}

function closeUploadModal() {
  const el = document.getElementById('uploadModalOverlay');
  if (el) el.classList.remove('open');
}

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

function handleUploadFiles(fileList) {
  Array.from(fileList || []).forEach(uploadOneFile);
  document.getElementById('uploadFileInput').value = '';
}

async function uploadOneFile(file) {
  const ext = extOf(file.name);
  const queue = document.getElementById('uploadQueue');
  const rowId = 'upload-row-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const wrap = document.createElement('div');
  wrap.id = rowId;
  wrap.innerHTML = `<div class="upload-row"><span class="upload-row-name">${uploadEscapeHtml(file.name)}</span><span class="upload-row-status">…</span></div><div class="upload-details" style="font-size:12px;line-height:1.5;padding:4px 10px 8px;"></div>`;
  queue.prepend(wrap);
  const row = wrap.querySelector('.upload-row');
  const statusEl = () => wrap.querySelector('.upload-row-status');
  const details = wrap.querySelector('.upload-details');
  const fail = (short, long, problems) => {
    row.classList.add('upload-row-error');
    statusEl().textContent = short;
    details.innerHTML = `<div style="color:#ef4444;">${uploadEscapeHtml(long || short)}</div>` +
      (problems && problems.length ? '<ul style="margin:4px 0 0 16px;opacity:.8;">' + problems.map(p => `<li>${uploadEscapeHtml(p)}</li>`).join('') + '</ul>' : '');
  };

  if (!UPLOAD_ENDPOINTS[ext]) { fail('формат не поддерживается', 'Поддерживаются только файлы .xlsx и .pdf.'); return; }
  if (file.size > UPLOAD_MAX_BYTES) { fail('больше 20 МБ', 'Файл больше 20 МБ.'); return; }

  const formData = new FormData();
  formData.append('file', file);
  const dateEl = document.getElementById('uploadReportDate');
  if (dateEl && dateEl.value) formData.append('report_date', dateEl.value);
  const typeEl = document.getElementById('uploadAmountType');
  if (typeEl && typeEl.value) formData.append('amount_type', typeEl.value);

  try {
    statusEl().textContent = 'разбираю…';
    let res;
    try { res = await fetch(UPLOAD_ENDPOINTS[ext], { method: 'POST', body: formData }); }
    catch (netErr) { throw { message: 'Нет связи с сервером. Файл не загружен.' }; }
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const d = payload.detail;
      throw { message: typeof d === 'string' ? d : (d && d.message) || ('Ошибка сервера ' + res.status), problems: (d && d.problems) || [] };
    }
    row.classList.add('upload-row-success');
    statusEl().textContent = 'загружено ✓';
    let html = `<div>${uploadEscapeHtml(payload.message || 'Готово')}</div>`;
    (payload.warnings || []).forEach(w => { html += `<div style="color:#b45309;">⚠ ${uploadEscapeHtml(w)}</div>`; });
    if ((payload.possible_duplicates || []).length) {
      html += '<div style="color:#b45309;">Похожие имена: ' + payload.possible_duplicates.map(d => uploadEscapeHtml(d.name) + ' ≈ ' + uploadEscapeHtml(d.similar_to)).join('; ') +
        '. <a href="staff.html" style="color:#FF5D16;font-weight:600;">Проверить на странице «Сотрудники»</a></div>';
    }
    details.innerHTML = html;
    if (typeof window.onDataUploaded === 'function') { window.onDataUploaded(); }
    else { details.innerHTML += '<div style="opacity:.7;">Обновите страницу, чтобы увидеть новые данные. <a href="#" onclick="location.reload();return false;" style="color:#FF5D16;">Обновить</a></div>'; }
  } catch (e) {
    fail('ошибка', e.message || 'Не удалось загрузить', e.problems);
    console.error('[upload-widget] upload failed:', e);
  }
}

window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.handleUploadFiles = handleUploadFiles;
