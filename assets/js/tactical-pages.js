function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanupDisplayText(value) {
  return String(value || "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\(\s*\d{2}(?:\s+\d{2}){2,}[^)]*\)/g, "")
    .replace(/!B@0=8F0|1I89|@0745;|B5<0|:>=B5=B/gi, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+$/gm, "");
}

function normalizeSearchText(value) {
  return cleanupDisplayText(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function matchesSearch(indexText, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const haystack = normalizeSearchText(indexText);
  const parts = q.split(' ').filter((x) => x.length >= 2);
  return parts.every((p) => haystack.includes(p));
}

function formatInline(text) {
  return escapeHtml(cleanupDisplayText(text))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code class="tactical-code">$1</code>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#FF5D16;">$1</a>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br/>')
    .replace(/\t/g, '&emsp;')
    .replace(/\\([#\*\-\_`\.])/g, '$1');
}

function loadMarkdownSync(key) {
  const parts = key.split(".");
  let data = window.TACTICAL_DATA;
  for (const p of parts) {
    if (!data || typeof data !== "object") return "";
    data = data[p];
  }
  return typeof data === "string" ? data : "";
}

function markdownToSimpleHtml(mdText) {
  const normalized = cleanupDisplayText(mdText).replace(/\\([_*`#[\]{}()\-+.!\\|>~])/g, "$1");
  const lines = normalized.split(/\r?\n/);
  let html = '';
  let inList = false;
  let inOrderedList = false;
  let inTable = false;

  const close = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    if (inOrderedList) {
      html += "</ol>";
      inOrderedList = false;
    }
    if (inTable) {
      html += '</tbody></table></div>';
      inTable = false;
    }
  };

  const isSep = (line) => /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => formatInline(c.trim()));

  lines.forEach((line, idx) => {
    const l = line.trim();
    if (!l) {
      close();
      return;
    }
    const plainUnderscoreLine = l.replace(/[\\\s]/g, "");
    if (/^_+$/.test(plainUnderscoreLine)) {
      close();
      return;
    }
    if (l === "*" || l === "#") return;
    if (l === "---" || l === "___") {
      close();
      html += '<hr class="tactical-hr">';
      return;
    }
    const h = l.match(/^\\?(#{1,6})\s+(.+)$/);
    if (h) {
      close();
      const headingLevel = Math.min(6, Math.max(3, h[1].length + 2));
      html += `<h${headingLevel} class="tactical-text-title" style="font-size:14px;margin:12px 0 8px;">${formatInline(h[2])}</h${headingLevel}>`;
      return;
    }
    if (l.startsWith('# ')) {
      close();
      html += `<h3 class="tactical-text-title" style="font-size:18px;margin:16px 0 10px;">${formatInline(l.slice(2))}</h3>`;
      return;
    }
    if (l.startsWith('## ')) {
      close();
      html += `<h4 class="tactical-text-accent" style="font-size:15px;margin:14px 0 8px;">${formatInline(l.slice(3))}</h4>`;
      return;
    }
    if (l.startsWith('### ')) {
      close();
      html += `<h5 class="tactical-text-accent" style="font-size:14px;margin:12px 0 6px;">${formatInline(l.slice(4))}</h5>`;
      return;
    }
    if (/^\d+\.\s+/.test(l)) {
      if (inTable) {
        html += '</tbody></table></div>';
        inTable = false;
      }
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (!inOrderedList) {
        html += '<ol class="tactical-text-body">';
        inOrderedList = true;
      }
      html += `<li>${formatInline(l.replace(/^\d+\.\s+/, ""))}</li>`;
      return;
    }
    if (l.startsWith('- ') || l.startsWith('• ') || /^o\s+/i.test(l)) {
      if (inTable) {
        html += '</tbody></table></div>';
        inTable = false;
      }
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }
      if (!inList) {
        html += `<ul class="tactical-text-body" style="margin:6px 0 12px 18px;line-height:1.6;font-size:13px;">`;
        inList = true;
      }
      html += `<li style="margin:4px 0;">${formatInline(l.replace(/^(-|•|o)\s+/i, ""))}</li>`;
      return;
    }
    if (l.startsWith('|')) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      const next = lines[idx + 1] ? lines[idx + 1].trim() : '';
      if (!inTable && next && isSep(next)) {
        html += `<div style="overflow-x:auto;margin:8px 0 14px;"><table class="tactical-text-body" style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>`;
        cells(l).forEach((c) => { html += `<th class="tactical-th" style="text-align:left;padding:8px;">${c}</th>`; });
        html += '</tr></thead><tbody>';
        inTable = true;
        return;
      }
      if (isSep(l)) return;
      if (inTable) {
        html += '<tr>';
        cells(l).forEach((c) => { html += `<td class="tactical-td" style="vertical-align:top;padding:8px;">${c}</td>`; });
        html += '</tr>';
        return;
      }
    }
    close();
    html += `<p class="tactical-text-body" style="font-size:13px;line-height:1.7;margin:8px 0;">${formatInline(l)}</p>`;
  });

  close();
  return html;
}

function splitByHeading(mdText, level) {
  const rx = new RegExp(`^#{${level}}\\s+(.+)$`);
  const lines = cleanupDisplayText(mdText).split(/\r?\n/);
  const out = [];
  let cur = null;
  lines.forEach((line) => {
    const m = line.match(rx);
    if (m) {
      if (cur) out.push(cur);
      cur = { title: cleanupDisplayText(m[1].trim()), lines: [] };
      return;
    }
    if (!cur) cur = { title: 'Общий раздел', lines: [] };
    cur.lines.push(line);
  });
  if (cur) out.push(cur);
  return out.map((x) => ({ title: x.title, content: cleanupDisplayText(x.lines.join('\n').trim()) })).filter((x) => x.content);
}

function buildManualTopics(mdText) {
  const clean = cleanupDisplayText(mdText);
  const candidates = [6, 5, 4, 3, 2].map((lvl) => splitByHeading(clean, lvl).filter((x) => x.title !== 'Общий раздел'));
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a), []);
  return best.length ? best : splitByHeading(clean, 2);
}

function normalizeTopicTitle(value, fallback) {
  const text = cleanupDisplayText(value || fallback || "")
    .replace(/\*\*/g, "")
    .replace(/^[#\s]+/, "")
    .trim();
  return text || fallback || "Тема";
}

function splitLong(content, title, maxLines) {
  const lines = cleanupDisplayText(content).split(/\r?\n/);
  const pages = [];
  let curTitle = title || 'Тема';
  let cur = [];
  let count = 0;
  const push = () => {
    const t = cur.join('\n').trim();
    if (t) pages.push({ title: curTitle, content: t });
  };
  lines.forEach((line) => {
    const tr = line.trim();
    if (/^#{1,6}\s+/.test(tr)) {
      push();
      curTitle = tr.replace(/^#{1,6}\s+/, '').trim() || curTitle;
      cur = [line];
      count = tr ? 1 : 0;
      return;
    }
    cur.push(line);
    if (tr) count += 1;
    if (count >= maxLines) {
      push();
      cur = [];
      count = 0;
    }
  });
  push();
  return pages.length ? pages : [{ title: title || 'Тема', content }];
}

function renderEmptyTemplate(targetEl, title, path, helper) {
  targetEl.innerHTML = `<div class="card"><div class="card-title">Шаблон контента</div><p>Для раздела <strong>${escapeHtml(title)}</strong> файл пуст: <code>${escapeHtml(path)}</code></p><p style="color:#94a3b8">${escapeHtml(helper)}</p></div>`;
}

function mountPager(container, pages) {
  const stage = container.querySelector('.js-stage');
  const pills = container.querySelector('.js-pills');
  const prev = container.querySelector('.js-prev');
  const next = container.querySelector('.js-next');
  let idx = 0;
  const render = () => {
    idx = Math.max(0, Math.min(idx, pages.length - 1));
    const p = pages[idx];
    stage.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><div class="tactical-text-accent" style="font-weight:700;">${escapeHtml(p.title)}</div><div class="tactical-text-muted" style="font-size:11px;">Страница ${idx + 1} из ${pages.length}</div></div>${markdownToSimpleHtml(p.content)}`;
    pills.innerHTML = pages.map((_, i) => `<button type="button" data-i="${i}" class="tactical-pill ${i === idx ? 'active' : ''}" style="cursor:pointer;border-radius:999px;padding:3px 8px;font-size:11px;">${i + 1}</button>`).join('');
    pills.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { idx = Number(b.getAttribute('data-i')); render(); }));
    prev.disabled = idx === 0;
    next.disabled = idx === pages.length - 1;
    prev.style.opacity = idx === 0 ? '0.45' : '1';
    next.style.opacity = idx === pages.length - 1 ? '0.45' : '1';
  };
  prev.addEventListener('click', () => { idx -= 1; render(); });
  next.addEventListener('click', () => { idx += 1; render(); });
  render();
  return { set: (n) => { idx = n; render(); }, get: () => idx, pages };
}

function initLawPage() {
  const root = document.getElementById('law-content');
  if (!root) return;

  // Пробуем загрузить JSON формат из tactical-data.js (новый формат)
  const jsonData = window.TACTICAL_DATA && window.TACTICAL_DATA.offerJson;

  if (jsonData && typeof jsonData === 'object' && jsonData.products) {
    renderLawJsonFormat(root, jsonData);
    return;
  }

  // Fallback на старый markdown формат из tactical-data.js
  const md = loadMarkdownSync('law.offer');
  if (!String(md).trim()) {
    return renderEmptyTemplate(root, 'Нормативная аргументация', 'law.offer', 'Добавьте пункты оферты, кейсы и примеры реплик.');
  }
  const sections = splitByHeading(md, 2);
  root.innerHTML = '<div class="card"><div class="card-title">База нормативной аргументации</div>' +
    sections.map(function(s, i) {
      return '<details ' + (i === 0 ? 'open' : '') + ' class="law-details" style="margin:8px 0;border-radius:8px;overflow:hidden;">' +
        '<summary class="law-summary" style="cursor:pointer;padding:9px 10px;font-size:13px;font-weight:600;">' + escapeHtml(s.title) + '</summary>' +
        '<div style="padding:10px 12px;">' + markdownToSimpleHtml(s.content) + '</div></details>';
    }).join('') + '</div>';
}

function renderLawJsonFormat(root, data) {
  const products = data.products || [];
  if (!products.length) {
    root.innerHTML = '<div class="card"><div class="card-title">Нет данных</div><p class="tactical-text-muted">Продукты не настроены</p></div>';
    return;
  }
  
  // Поиск и фильтр
  let searchHtml = '<div class="card" style="margin-bottom:16px;">' +
    '<div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Поиск по нормативной базе</div>' +
    '<input id="law-search" type="text" placeholder="Введите статью, пункт оферты или ключевое слово..." ' +
    'class="tactical-input" style="width:100%;border-radius:8px;padding:10px 12px;font-size:13px;outline:none;" ' +
    'oninput="filterLawSections()" />' +
    '<div id="law-search-results" style="margin-top:8px;font-size:11px;color:#94a3b8;"></div>' +
    '</div>';
  
  // Табы продуктов
  let tabsHtml = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
  products.forEach(function(prod, idx) {
    const isActive = idx === 0 ? 'active' : '';
    tabsHtml += '<button id="law-tab-' + prod.id + '" class="cat-tab ' + isActive + '" ' +
      'onclick="switchLawProduct(\'' + prod.id + '\')" ' +
      'style="background:' + (isActive ? prod.color : '#1e293b') + ';color:#fff;border:1px solid ' + prod.color + ';padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;">' +
      (idx === 0 ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>') + ' ' + escapeHtml(prod.name) +
      '</button>';
  });
  tabsHtml += '</div>';
  
  // Контейнеры продуктов
  let containersHtml = '';
  products.forEach(function(prod, idx) {
    const isHidden = idx !== 0 ? 'style="display:none;"' : '';
    containersHtml += '<div id="law-product-' + prod.id + '" ' + isHidden + '>';
    containersHtml += '<div class="card" style="margin-bottom:12px;border-top:3px solid ' + prod.color + ';">';
    containersHtml += '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Источник:</div>';
    containersHtml += '<div style="font-size:12px;color:#f1f5f9;margin-bottom:12px;">' + escapeHtml(prod.source) + '</div>';
    
    // Секции (положения)
    prod.sections.forEach(function(section, sIdx) {
      containersHtml += renderLawSection(section, prod.color);
    });
    
    containersHtml += '</div></div>';
  });
  
  root.innerHTML = searchHtml + tabsHtml + containersHtml;
  
  // Инициализация поиска
  window.filterLawSections = function() {
    const query = document.getElementById('law-search').value.toLowerCase().trim();
    const resultsEl = document.getElementById('law-search-results');
    let visibleCount = 0;
    
    products.forEach(function(prod) {
      prod.sections.forEach(function(section) {
        const sectionEl = document.getElementById('law-section-' + section.id);
        if (!sectionEl) return;
        
        const searchText = [
          section.title,
          section.documentPoints,
          section.content,
          (section.laws || []).map(function(l) { return l.article + ' ' + l.text; }).join(' '),
          section.case ? section.case.objection : '',
          section.case ? section.case.script : ''
        ].join(' ').toLowerCase();
        
        const matches = !query || searchText.indexOf(query) >= 0;
        sectionEl.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
      });
    });
    
    if (resultsEl) {
      resultsEl.textContent = query ? 'Найдено положений: ' + visibleCount : '';
    }
  };
  
  window.switchLawProduct = function(productId) {
    // Скрыть все продукты
    products.forEach(function(prod) {
      const el = document.getElementById('law-product-' + prod.id);
      if (el) el.style.display = 'none';
      const tab = document.getElementById('law-tab-' + prod.id);
      if (tab) {
        tab.classList.remove('active');
        tab.style.background = '#1e293b';
      }
    });
    
    // Показать выбранный
    const selectedProd = products.find(function(p) { return p.id === productId; });
    if (selectedProd) {
      const el = document.getElementById('law-product-' + productId);
      if (el) el.style.display = 'block';
      const tab = document.getElementById('law-tab-' + productId);
      if (tab) {
        tab.classList.add('active');
        tab.style.background = selectedProd.color;
      }
    }
  };
}

function renderLawSection(section, productColor) {
  const lawColors = {
    document: '#3b82f6',
    content: '#10b981',
    laws: '#f59e0b',
    case: '#ef4444'
  };
  
  var html = '';
  html += '<details id="law-section-' + section.id + '" class="law-details" style="margin:8px 0;border-radius:8px;overflow:hidden;border-left:3px solid ' + productColor + ';">';
  html += '<summary class="law-summary" style="cursor:pointer;padding:12px 14px;font-size:13px;font-weight:700;color:#f1f5f9;background:rgba(30,41,59,0.5);display:flex;justify-content:space-between;align-items:center;">';
  html += '<span>▸ ' + escapeHtml(section.title) + '</span>';
  html += '<span style="font-size:10px;color:#94a3b8;font-weight:400;">' + escapeHtml(section.documentPoints) + '</span>';
  html += '</summary>';
  html += '<div style="padding:14px 16px;background:rgba(15,23,42,0.3);">';
  
  // Пункты документа
  html += '<div style="margin-bottom:14px;">';
  html += '<div style="font-size:10px;font-weight:700;color:' + lawColors.document + ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  html += ' ПУНКТ ДОКУМЕНТА';
  html += '</div>';
  html += '<div style="font-size:12px;color:#e2e8f0;line-height:1.6;padding:8px 10px;background:rgba(59,130,246,0.1);border-radius:6px;border:1px solid rgba(59,130,246,0.2);">';
  html += escapeHtml(section.documentPoints);
  html += '</div></div>';
  
  // Содержание
  html += '<div style="margin-bottom:14px;">';
  html += '<div style="font-size:10px;font-weight:700;color:' + lawColors.content + ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 0 3-3h7z"></path></svg>';
  html += ' СОДЕРЖАНИЕ';
  html += '</div>';
  html += '<div style="font-size:12px;color:#e2e8f0;line-height:1.7;padding:10px 12px;background:rgba(16,185,129,0.1);border-radius:6px;border:1px solid rgba(16,185,129,0.2);">';
  html += escapeHtml(section.content);
  html += '</div></div>';
  
  // Статьи НПА
  if (section.laws && section.laws.length) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:10px;font-weight:700;color:' + lawColors.laws + ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>';
    html += ' СТАТЬИ НПА РУз';
    html += '</div>';
    section.laws.forEach(function(law) {
      html += '<div style="font-size:11px;color:#e2e8f0;line-height:1.6;padding:8px 10px;margin-bottom:6px;background:rgba(245,158,11,0.1);border-radius:6px;border:1px solid rgba(245,158,11,0.2);">';
      html += '<span style="font-weight:700;color:#fbbf24;">' + escapeHtml(law.article) + ':</span> ' + escapeHtml(law.text);
      html += '</div>';
    });
    html += '</div>';
  }
  
  // Кейс применения
  if (section.case) {
    html += '<div>';
    html += '<div style="font-size:10px;font-weight:700;color:' + lawColors.case + ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    html += ' КЕЙС ПРИМЕНЕНИЯ';
    html += '</div>';
    html += '<div style="padding:10px 12px;background:rgba(239,68,68,0.1);border-radius:6px;border:1px solid rgba(239,68,68,0.2);margin-bottom:8px;">';
    html += '<div style="font-size:10px;font-weight:700;color:#f87171;margin-bottom:4px;">ВОЗРАЖЕНИЕ:</div>';
    html += '<div style="font-size:12px;color:#fca5a5;font-style:italic;">"' + escapeHtml(section.case.objection) + '"</div>';
    html += '</div>';
    html += '<div style="padding:10px 12px;background:rgba(239,68,68,0.15);border-radius:6px;border:1px solid rgba(239,68,68,0.3);">';
    html += '<div style="font-size:10px;font-weight:700;color:#22c55e;margin-bottom:4px;">СКРИПТ ОТРАБОТКИ:</div>';
    html += '<div style="font-size:12px;color:#86efac;line-height:1.6;">' + escapeHtml(section.case.script) + '</div>';
    html += '</div></div>';
  }
  
  html += '</div></details>';
  return html;
}

function initInstrumentsPage() {
  const root = document.getElementById('instruments-content');
  if (!root) return;
  
  // Пробуем загрузить JSON формат из tactical-data.js
  const instrumentsData = window.TACTICAL_DATA && window.TACTICAL_DATA.instrumentsJson;
  
  if (instrumentsData && typeof instrumentsData === 'object') {
    renderInstrumentsJsonFormat(root, instrumentsData);
    return;
  }
  
  // Fallback на старый формат
  const files = [
    { title: 'Манипуляция', key: 'instruments.manipulation' },
    { title: 'Легендирование', key: 'instruments.legending' },
    { title: 'Аргументация', key: 'instruments.argumentation' },
    { title: 'Выставление требования', key: 'instruments.demandSetting' },
    { title: 'Подведение итогов', key: 'instruments.closingSummary' }
  ];
  root.innerHTML = '<div class="card" style="margin-bottom:12px;"><div class="card-title">Быстрый поиск по инструментам</div><input id="instruments-search" type="text" placeholder="Введите ключевое слово..." class="tactical-input" style="width:100%;border-radius:8px;padding:8px 10px;font-size:13px;" /></div><div id="instruments-cards"></div>';
  const host = document.getElementById('instruments-cards');
  const search = document.getElementById('instruments-search');
  const cards = [];
  const pagers = [];

  for (const file of files) {
    const md = cleanupDisplayText(loadMarkdownSync(file.key).trim());
    const block = document.createElement('div');
    block.className = 'card instrument-card';
    block.style.marginBottom = '12px';
    if (!md) {
      block.innerHTML = '<div class="card-title">' + escapeHtml(file.title) + '</div><p class="tactical-text-muted">Контент не заполнен: <code>' + escapeHtml(file.key) + '</code></p>';
      host.appendChild(block);
      cards.push(block);
      continue;
    }
    const sections = splitByHeading(md, 2).filter(function(x) { return x.title !== 'Общий раздел'; });
    const source = sections.length ? sections : splitByHeading(md, 3);
    const pages = source.flatMap(function(s) { return splitLong(s.content, s.title, 38); });
    block.dataset.search = file.title + '\n' + md + '\n' + pages.map(function(p) { return p.title; }).join('\n');
    block.innerHTML = '<div class="card-title">' + escapeHtml(file.title) + '</div><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;"><div class="tactical-text-muted" style="font-size:12px;">Тем: ' + pages.length + '</div><div style="display:flex;gap:8px;"><button class="cat-tab js-prev" type="button">Назад</button><button class="cat-tab js-next" type="button">Вперед</button></div></div><div class="js-pills" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;"></div><div class="js-stage" class="tactical-stage" style="border-radius:10px;padding:10px 12px;"></div>';
    host.appendChild(block);
    cards.push(block);
    pagers.push({ card: block, pager: mountPager(block, pages) });
  }

  const applyFilter = function() {
    const q = search.value || '';
    cards.forEach(function(c) { c.style.display = matchesSearch(c.dataset.search || c.textContent || '', q) ? '' : 'none'; });
    if (!normalizeSearchText(q)) return;
    pagers.forEach(function({ card, pager }) {
      if (card.style.display === 'none') return;
      const i = pager.pages.findIndex(function(p) { return matchesSearch(p.title + '\n' + p.content, q); });
      if (i >= 0) pager.set(i);
    });
  };
  search.addEventListener('input', applyFilter);
}

function renderInstrumentsJsonFormat(root, data) {
  const instruments = data || {};
  const instrumentKeys = Object.keys(instruments);
  
  if (!instrumentKeys.length) {
    root.innerHTML = '<div class="card"><div class="card-title">Нет данных</div><p class="tactical-text-muted">Инструменты не настроены</p></div>';
    return;
  }
  
  // Поиск по всем инструментам
  let searchHtml = '<div class="card" style="margin-bottom:16px;">' +
    '<div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Поиск по инструментам</div>' +
    '<input id="instruments-search" type="text" placeholder="Введите тактику, эффект или ключевое слово..." ' +
    'class="tactical-input" style="width:100%;border-radius:8px;padding:10px 12px;font-size:13px;outline:none;" ' +
    'oninput="filterInstruments()" />' +
    '<div id="instruments-search-results" style="margin-top:8px;font-size:11px;color:#94a3b8;"></div>' +
    '</div>';
  
  // Табы инструментов
  let tabsHtml = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
  instrumentKeys.forEach(function(key, idx) {
    const inst = instruments[key];
    const isActive = idx === 0 ? 'active' : '';
    tabsHtml += '<button id="instrument-tab-' + key + '" class="cat-tab ' + isActive + '" ' +
      'onclick="switchInstrument(\'' + key + '\')" ' +
      'style="background:' + (isActive ? inst.color : '#1e293b') + ';color:#fff;border:1px solid ' + inst.color + ';padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;">' +
      getInstrumentIcon(key) + ' ' + escapeHtml(inst.title) +
      '</button>';
  });
  tabsHtml += '</div>';
  
  // Контейнеры инструментов
  let containersHtml = '';
  instrumentKeys.forEach(function(key, idx) {
    const inst = instruments[key];
    const isHidden = idx !== 0 ? 'style="display:none;"' : '';
    containersHtml += '<div id="instrument-' + key + '" ' + isHidden + '>';
    containersHtml += '<div class="card" style="margin-bottom:12px;border-top:3px solid ' + inst.color + ';">';
    containersHtml += '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Описание:</div>';
    containersHtml += '<div style="font-size:12px;color:#f1f5f9;margin-bottom:16px;">' + escapeHtml(inst.description) + '</div>';
    
    // Тактики (аккордеон)
    inst.tactics.forEach(function(tactic, tIdx) {
      const isOpen = tIdx === 0 ? 'open' : '';
      containersHtml += renderInstrumentTactic(tactic, inst.color);
    });
    
    containersHtml += '</div></div>';
  });
  
  root.innerHTML = searchHtml + tabsHtml + containersHtml;
  
  // Инициализация поиска
  window.filterInstruments = function() {
    const query = document.getElementById('instruments-search').value.toLowerCase().trim();
    const resultsEl = document.getElementById('instruments-search-results');
    let visibleCount = 0;
    
    instrumentKeys.forEach(function(key) {
      const inst = instruments[key];
      inst.tactics.forEach(function(tactic) {
        const tacticEl = document.getElementById('tactic-' + tactic.id);
        if (!tacticEl) return;
        
        const searchText = [
          tactic.title,
          tactic.content,
          (tactic.support || []).join(' '),
          tactic.effect || ''
        ].join(' ').toLowerCase();
        
        const matches = !query || searchText.indexOf(query) >= 0;
        tacticEl.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
      });
    });
    
    if (resultsEl) {
      resultsEl.textContent = query ? 'Найдено тактик: ' + visibleCount : '';
    }
  };
  
  window.switchInstrument = function(key) {
    // Скрыть все инструменты
    instrumentKeys.forEach(function(k) {
      const el = document.getElementById('instrument-' + k);
      if (el) el.style.display = 'none';
      const tab = document.getElementById('instrument-tab-' + k);
      if (tab) {
        tab.classList.remove('active');
        tab.style.background = '#1e293b';
      }
    });
    
    // Показать выбранный
    const selectedInst = instruments[key];
    if (selectedInst) {
      const el = document.getElementById('instrument-' + key);
      if (el) el.style.display = 'block';
      const tab = document.getElementById('instrument-tab-' + key);
      if (tab) {
        tab.classList.add('active');
        tab.style.background = selectedInst.color;
      }
    }
  };
}

function getInstrumentIcon(key) {
  const svgs = {
    manipulation: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M12 2a10 10 0 1 0 10 10"></path><path d="M12 2a10 10 0 0 1 10 10"></path><path d="M12 12l4-4"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    legending: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
    argumentation: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>',
    'demand-setting': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>',
    'closing-summary': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
  };
  return svgs[key] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
}

function renderInstrumentTactic(tactic, instrumentColor) {
  var html = '';
  html += '<details id="tactic-' + tactic.id + '" class="law-details" style="margin:8px 0;border-radius:8px;overflow:hidden;border-left:3px solid ' + instrumentColor + ';">';
  html += '<summary class="law-summary" style="cursor:pointer;padding:12px 14px;font-size:13px;font-weight:700;color:#f1f5f9;background:rgba(30,41,59,0.5);display:flex;justify-content:space-between;align-items:center;">';
  html += '<span>▸ ' + escapeHtml(tactic.title) + '</span>';
  html += '</summary>';
  html += '<div style="padding:14px 16px;background:rgba(15,23,42,0.3);">';
  
  // Содержание
  html += '<div style="margin-bottom:14px;">';
  html += '<div style="font-size:10px;font-weight:700;color:' + instrumentColor + ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 0 3-3h7z"></path></svg>';
  html += ' ТАКТИКА';
  html += '</div>';
  html += '<div style="font-size:12px;color:#e2e8f0;line-height:1.7;padding:10px 12px;background:rgba(' + hexToRgb(instrumentColor) + ',0.1);border-radius:6px;border:1px solid rgba(' + hexToRgb(instrumentColor) + ',0.2);">';
  html += escapeHtml(tactic.content);
  html += '</div></div>';
  
  // Подкрепление
  if (tactic.support && tactic.support.length) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>';
    html += ' ПОДКРЕПЛЕНИЕ';
    html += '</div>';
    tactic.support.forEach(function(item) {
      html += '<div style="font-size:11px;color:#e2e8f0;line-height:1.6;padding:6px 10px;margin-bottom:4px;background:rgba(245,158,11,0.1);border-radius:6px;border:1px solid rgba(245,158,11,0.2);">';
      html += '• ' + escapeHtml(item);
      html += '</div>';
    });
    html += '</div>';
  }
  
  // Эффект
  if (tactic.effect) {
    html += '<div>';
    html += '<div style="font-size:10px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    html += ' ПСИХОЛОГИЧЕСКИЙ ЭФФЕКТ';
    html += '</div>';
    html += '<div style="font-size:12px;color:#fca5a5;line-height:1.6;padding:10px 12px;background:rgba(239,68,68,0.1);border-radius:6px;border:1px solid rgba(239,68,68,0.2);">';
    html += escapeHtml(tactic.effect);
    html += '</div></div>';
  }
  
  html += '</div></details>';
  return html;
}

function hexToRgb(hex) {
  // Удаляем # если есть
  hex = hex.replace(/^#/, '');
  // Преобразуем в RGB
  if (hex.length === 3) {
    hex = hex.split('').map(function(c) { return c + c; }).join('');
  }
  const num = parseInt(hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return r + ',' + g + ',' + b;
}

function initManualPage() {
  const root = document.getElementById('manual-graph');
  if (!root) return;
  
  // Пробуем загрузить JSON формат
  const manualData = window.TACTICAL_DATA && window.TACTICAL_DATA.manualJson;
  
  if (manualData && manualData.sections) {
    renderManualJsonFormat(root, manualData);
    return;
  }
  
  // Fallback на старый формат
  // ... (старый код остаётся для совместимости)
}

function renderManualJsonFormat(root, data) {
  const sections = data.sections || [];
  const allTopics = [];
  
  // Собираем все темы для поиска
  sections.forEach(function(sec, secIdx) {
    sec.topics.forEach(function(topic, topicIdx) {
      allTopics.push({
        sectionId: sec.id,
        sectionIdx: secIdx,
        sectionTitle: sec.title,
        topicId: topic.id,
        topicIdx: topicIdx,
        topicTitle: topic.title,
        topicContent: topic.content,
        color: sec.color
      });
    });
  });
  
  // Поиск
  let searchHtml = '<div class="card" style="margin-bottom:16px;">' +
    '<div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Поиск по мануалу</div>' +
    '<input id="manual-search" type="text" placeholder="Введите термин, название темы или фрагмент текста..." ' +
    'class="tactical-input" style="width:100%;border-radius:8px;padding:10px 12px;font-size:13px;outline:none;" ' +
    'oninput="filterManual()" />' +
    '<div id="manual-search-results" style="margin-top:8px;font-size:11px;color:#94a3b8;"></div>' +
    '</div>';
  
  // Хлебные крошки
  let breadcrumbHtml = '<div id="manual-breadcrumb" style="font-size:11px;color:#94a3b8;margin-bottom:12px;padding:8px 12px;background:rgba(30,41,59,0.5);border-radius:6px;">' +
    '<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 0 3-3h7z"></path></svg> Мануал</span>' +
    '</div>';
  
  // Плитки разделов — стиль «Аналитика»
  let tilesHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:14px;margin-bottom:24px;">';
  sections.forEach(function(sec, idx) {
    const isActive = idx === 0 ? 'active' : '';
    // Active tile: solid color accent + glow; inactive: glassmorphism dark
    const activeBg  = 'linear-gradient(135deg,' + sec.color + 'cc 0%,' + sec.color + '88 100%)';
    const inactiveBg = 'rgba(19, 25, 32,0.75)';
    const bg         = idx === 0 ? activeBg : inactiveBg;
    const boxShadow  = idx === 0 ? '0 4px 20px ' + sec.color + '44, inset 0 1px 0 rgba(255,255,255,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.18)';
    const borderColor = sec.color + (idx === 0 ? 'cc' : '55');
    tilesHtml += '<button class="manual-section-tile ' + isActive + '" onclick="selectManualSection(\'' + sec.id + '\')" ' +
      'data-sec-id="' + sec.id + '" data-sec-color="' + sec.color + '" ' +
      'style="--sec-color:' + sec.color + ';background:' + bg + ';color:#fff;border:1px solid ' + borderColor + ';' +
      'box-shadow:' + boxShadow + ';' +
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'padding:18px 16px;border-radius:14px;cursor:pointer;transition:all 0.25s;text-align:left;' +
      'border-top:3px solid ' + sec.color + ';outline:none;position:relative;overflow:hidden;">' +
      // Subtle shine overlay
      '<div style="position:absolute;top:0;left:0;right:0;height:40%;background:linear-gradient(180deg,rgba(255,255,255,0.06) 0%,transparent 100%);border-radius:14px 14px 0 0;pointer-events:none;"></div>' +
      '<div style="position:relative;">' +
      '<div style="margin-bottom:10px;opacity:0.95;line-height:1;">' + sec.icon + '</div>' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;opacity:0.75;margin-bottom:4px;">' + sec.title.split(' ')[0] + '</div>' +
      '<div style="font-size:13px;font-weight:800;line-height:1.3;letter-spacing:-0.01em;">' + sec.title.substring(sec.title.indexOf('.') + 2) + '</div>' +
      '<div style="margin-top:10px;display:flex;align-items:center;gap:4px;">' +
        '<span class="manual-tile-badge" style="font-size:10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:999px;padding:2px 8px;font-weight:600;">' + sec.topics.length + ' тем</span>' +
      '</div>' +
      '</div>' +
      '</button>';
  });
  tilesHtml += '</div>';
  
  // Основной контейнер с боковой панелью
  let mainHtml = '<div style="display:grid;grid-template-columns:280px 1fr;gap:16px;">';
  
  // Боковая панель — стиль «Аналитика»
  let sidebarHtml = '<div class="card" style="height:fit-content;position:sticky;top:20px;padding:16px;border:1px solid rgba(255,255,255,0.07);background:rgba(20,26,42,0.6);backdrop-filter:blur(12px);">' +
    '<div class="card-title" style="font-size:10px;letter-spacing:1.2px;">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><path d="M4 6h16M4 12h8M4 18h12"></path></svg> Разделы</div>' +
    '<div id="manual-sidebar" style="max-height:500px;overflow-y:auto;">';
  sections.forEach(function(sec, idx) {
    const isActive = idx === 0 ? 'active' : '';
    const activeBg = 'linear-gradient(90deg,rgba(' + hexToRgb(sec.color) + ',0.18) 0%,rgba(' + hexToRgb(sec.color) + ',0.06) 100%)';
    const bg = idx === 0 ? activeBg : 'transparent';
    sidebarHtml += '<div class="manual-sidebar-section ' + isActive + '" onclick="selectManualSection(\'' + sec.id + '\')" ' +
      'data-sec-id="' + sec.id + '" data-sec-color="' + sec.color + '" ' +
      'style="--sec-color:' + sec.color + ';padding:10px 12px;margin-bottom:5px;border-radius:9px;cursor:pointer;' +
      'border-left:3px solid ' + sec.color + ';border-right:1px solid transparent;' +
      'background:' + bg + ';transition:all 0.2s;">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
        '<span style="font-size:10px;font-weight:800;color:' + sec.color + ';letter-spacing:0.5px;text-transform:uppercase;">' + sec.title.split(' ')[0] + '</span>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:700;color:#f1f5f9;line-height:1.3;">' + sec.title.substring(sec.title.indexOf('.') + 2) + '</div>' +
      '<div style="margin-top:5px;">' +
        '<span style="font-size:9px;color:#64748b;background:rgba(100,116,139,0.12);border:1px solid rgba(100,116,139,0.2);border-radius:999px;padding:1px 6px;font-weight:600;">' + sec.topics.length + ' тем</span>' +
      '</div>' +
      '</div>';
  });
  sidebarHtml += '</div></div>';
  
  // Контент
  let contentHtml = '<div id="manual-content-container">';
  sections.forEach(function(sec, idx) {
    const isHidden = idx !== 0 ? 'style="display:none;"' : '';
    contentHtml += '<div id="manual-section-' + sec.id + '" ' + isHidden + '>';
    contentHtml += '<div class="card" style="border-top:3px solid ' + sec.color + ';">';
    contentHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<h3 style="margin:0;font-size:16px;color:' + sec.color + ';">' + sec.icon + ' ' + sec.title + '</h3>' +
      '<span style="font-size:11px;color:#94a3b8;">' + sec.topics.length + ' тем</span>' +
      '</div>';
    
    // Темы (аккордеон)
    sec.topics.forEach(function(topic, tIdx) {
      const isOpen = tIdx === 0 ? 'open' : '';
      contentHtml += '<details id="manual-topic-' + topic.id + '" class="law-details" ' + isOpen + ' ' +
        'style="margin:8px 0;border-radius:8px;overflow:hidden;border-left:3px solid ' + sec.color + ';">';
      contentHtml += '<summary class="law-summary" style="cursor:pointer;padding:12px 14px;font-size:13px;font-weight:700;' +
        'color:#f1f5f9;background:rgba(30,41,59,0.5);">' +
        '<span>▸ ' + escapeHtml(topic.title) + '</span>' +
        '</summary>';
      contentHtml += '<div style="padding:14px 16px;background:rgba(15,23,42,0.3);">';
      contentHtml += '<div style="white-space:pre-wrap;font-size:12px;color:#e2e8f0;line-height:1.7;">' + 
        escapeHtml(topic.content) + '</div>';
      contentHtml += '</div></details>';
    });
    
    contentHtml += '</div></div>';
  });
  contentHtml += '</div>';
  
  mainHtml += sidebarHtml + contentHtml + '</div>';
  
  root.innerHTML = searchHtml + breadcrumbHtml + tilesHtml + mainHtml;
  
  // Глобальные функции
  window.selectManualSection = function(sectionId) {
    // Скрыть все разделы
    sections.forEach(function(sec) {
      const el = document.getElementById('manual-section-' + sec.id);
      if (el) el.style.display = 'none';
    });
    
    // Показать выбранный
    const selectedEl = document.getElementById('manual-section-' + sectionId);
    if (selectedEl) selectedEl.style.display = 'block';
    
    // Обновить хлебные крошки
    const section = sections.find(function(s) { return s.id === sectionId; });
    if (section) {
      document.getElementById('manual-breadcrumb').innerHTML = 
        '<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 0 3-3h7z"></path></svg> Мануал</span> <span style="color:#64748b;">/</span> ' +
        '<span style="color:' + section.color + ';">' + escapeHtml(section.title) + '</span>';
    }
    
    // Обновить плитки — восстанавливаем премиальный стиль
    document.querySelectorAll('.manual-section-tile').forEach(function(tile) {
      const tileSec = sections.find(function(s) { return s.id === tile.dataset.secId; });
      if (!tileSec) return;
      const isSelected = tileSec.id === sectionId;
      if (isSelected) {
        tile.classList.add('active');
      } else {
        tile.classList.remove('active');
      }
      tile.style.background = isSelected
        ? 'linear-gradient(135deg,' + tileSec.color + 'cc 0%,' + tileSec.color + '88 100%)'
        : 'rgba(19, 25, 32,0.75)';
      tile.style.borderColor = tileSec.color + (isSelected ? 'cc' : '55');
      tile.style.borderTopColor = tileSec.color; // ensure top border remains solid color
      tile.style.boxShadow = isSelected
        ? '0 4px 20px ' + tileSec.color + '44, inset 0 1px 0 rgba(255,255,255,0.12)'
        : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.18)';
    });
    
    // Обновить боковую панель — восстанавливаем premium стиль
    document.querySelectorAll('.manual-sidebar-section').forEach(function(el) {
      const elSec = sections.find(function(s) { return s.id === el.dataset.secId; });
      if (!elSec) return;
      const isSelected = elSec.id === sectionId;
      if (isSelected) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
      el.style.background = isSelected
        ? 'linear-gradient(90deg,rgba(' + hexToRgb(elSec.color) + ',0.18) 0%,rgba(' + hexToRgb(elSec.color) + ',0.06) 100%)'
        : 'transparent';
    });
  };
  
  window.filterManual = function() {
    const query = document.getElementById('manual-search').value.toLowerCase().trim();
    const resultsEl = document.getElementById('manual-search-results');
    let visibleCount = 0;
    
    allTopics.forEach(function(topic) {
      const topicEl = document.getElementById('manual-topic-' + topic.topicId);
      if (!topicEl) return;
      
      const searchText = (topic.topicTitle + ' ' + topic.topicContent).toLowerCase();
      const matches = !query || searchText.indexOf(query) >= 0;
      
      // Показать/скрыть раздел
      const sectionEl = document.getElementById('manual-section-' + topic.sectionId);
      if (sectionEl) {
        sectionEl.style.display = 'block';
      }
      
      // Показать/скрыть тему
      topicEl.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
      
      // Автоматически раскрыть найденные
      if (matches && query) {
        topicEl.setAttribute('open', 'open');
      }
    });
    
    if (resultsEl) {
      resultsEl.textContent = query ? 'Найдено тем: ' + visibleCount : '';
    }
  };
}

window.initLawPage = initLawPage;
window.initInstrumentsPage = initInstrumentsPage;
window.initManualPage = initManualPage;
