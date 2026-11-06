// Минимальный набор для информационных страниц (тема и сайдбар без data.js / app.js)
function getThemeIcon(isLight) {
  if (isLight) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v2.2"></path><path d="M12 19.3v2.2"></path><path d="M4.9 4.9l1.6 1.6"></path><path d="M17.5 17.5l1.6 1.6"></path><path d="M2.5 12h2.2"></path><path d="M19.3 12h2.2"></path><path d="M4.9 19.1l1.6-1.6"></path><path d="M17.5 6.5l1.6-1.6"></path></svg>';
  }
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 14.2A8.8 8.8 0 1 1 9.8 3.2a7.2 7.2 0 0 0 11 11z"></path><circle cx="17.2" cy="6.3" r="0.8" fill="currentColor" stroke="none"></circle><circle cx="14.9" cy="4.5" r="0.55" fill="currentColor" stroke="none"></circle></svg>';
}

function initTheme() {
  const urlParams = new URLSearchParams(window.location.search);
  let theme = urlParams.get('theme');
  if (!theme) theme = localStorage.getItem('sc-theme');
  if (!theme) theme = 'light';

  localStorage.setItem('sc-theme', theme);

  if (theme === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = getThemeIcon(true);
  } else {
    document.body.classList.remove('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = getThemeIcon(false);
  }

  let sidebarState = urlParams.get('sidebar');
  if (!sidebarState) sidebarState = localStorage.getItem('sc-sidebar');
  if (!sidebarState) sidebarState = 'expanded';

  localStorage.setItem('sc-sidebar', sidebarState);

  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');

  if (sidebar && main) {
    sidebar.style.transition = 'none';
    main.style.transition = 'none';

    if (sidebarState === 'collapsed') {
      sidebar.classList.add('collapsed');
      main.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
      main.classList.remove('collapsed');
    }

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        sidebar.style.transition = '';
        main.style.transition = '';
      });
    });
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  const theme = isLight ? 'light' : 'dark';
  localStorage.setItem('sc-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = getThemeIcon(isLight);

  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme);
  window.history.replaceState({}, '', url);

  if (typeof updateDashboard === 'function') updateDashboard();
}

window.toggleTheme = toggleTheme;
window.initTheme = initTheme;
