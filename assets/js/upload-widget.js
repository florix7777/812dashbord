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

const UPLOAD_ENDPOINTS = { xlsx: '/api/upload/xlsx', pdf: '/api/upload/pdf' };
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
            <div class="upload-modal-sub">QC-оценки, взыскание или CRM-действия — формат определяется автоматически</div>
          </div>
          <button class="upload-modal-close" onclick="closeUploadModal()">&times;</button>
        </div>

        <div id="uploadDropzone" class="upload-dropzone">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <div class="upload-dropzone-text">Перетащите файл сюда или нажмите, чтобы выбрать</div>
          <div class="upload-dropzone-hint">.xlsx или .pdf, до 20 МБ</div>
          <input type="file" id="uploadFileInput" accept=".xlsx,.pdf" multiple style="display:none;" onchange="handleUploadFiles(this.files)" />
        </div>

        <div id="uploadQueue" class="upload-queue"></div>

        <div class="upload-modal-footer">
          <span style="opacity:.6;">Файл обработается автоматически в течение нескольких секунд</span>
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
  const row = document.createElement('div');
  row.className = 'upload-row';
  row.id = rowId;
  row.innerHTML = `<span class="upload-row-name">${uploadEscapeHtml(file.name)}</span><span class="upload-row-status">…</span>`;
  queue.prepend(row);

  const statusEl = () => document.querySelector('#' + rowId + ' .upload-row-status');

  if (!UPLOAD_ENDPOINTS[ext]) {
    row.classList.add('upload-row-error');
    statusEl().textContent = 'формат не поддерживается (.xlsx/.pdf)';
    return;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    row.classList.add('upload-row-error');
    statusEl().textContent = 'больше 20 МБ';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    statusEl().textContent = 'загрузка…';
    const res = await fetch(UPLOAD_ENDPOINTS[ext], { method: 'POST', body: formData });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.detail || ('HTTP ' + res.status));
    row.classList.add('upload-row-success');
    statusEl().textContent = 'загружено ✓';
  } catch (e) {
    row.classList.add('upload-row-error');
    statusEl().textContent = 'ошибка: ' + (e.message || 'не удалось загрузить');
    console.error('[upload-widget] upload failed:', e);
  }
}

window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.handleUploadFiles = handleUploadFiles;
