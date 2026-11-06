// Shared Excel export helper — thin wrapper around the vendored SheetJS
// (assets/vendor/xlsx.mini.min.js), used by rating.html, collection.html,
// and analytics.html. Vendored locally (not CDN) so exports keep working
// even if the server has restricted outbound internet access.
//
// Usage:
//   downloadXlsx('Рейтинг_Май_2026.xlsx', [
//     { name: 'Рейтинг', headers: ['ФИО', 'TQS %'], rows: [['Иванов', 74.2], ...] }
//   ]);

function downloadXlsx(filename, sheets) {
  if (typeof XLSX === 'undefined') {
    console.error('[xlsx-export] SheetJS not loaded — check assets/vendor/xlsx.mini.min.js script tag');
    alert('Не удалось сформировать Excel-файл: библиотека не загрузилась. Обновите страницу и попробуйте снова.');
    return;
  }
  try {
    const wb = XLSX.utils.book_new();
    sheets.forEach(sheet => {
      const data = [sheet.headers, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(data);
      // Reasonable column widths so it's readable without manual resizing
      ws['!cols'] = sheet.headers.map((h, i) => {
        const maxLen = Math.max(
          String(h).length,
          ...sheet.rows.map(r => String(r[i] === null || r[i] === undefined ? '' : r[i]).length)
        );
        return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
      });
      // Excel sheet names: max 31 chars, no []:*?/\
      const safeName = sheet.name.replace(/[\[\]:*?/\\]/g, '').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName || 'Sheet');
    });
    XLSX.writeFile(wb, filename);
  } catch (e) {
    console.error('[xlsx-export] failed to generate file:', e);
    alert('Не удалось сформировать Excel-файл. Попробуйте ещё раз.');
  }
}
window.downloadXlsx = downloadXlsx;

function todayForFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
window.todayForFilename = todayForFilename;
