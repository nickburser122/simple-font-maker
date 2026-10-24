(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('hfm-theme');
  } catch (e) {
    stored = null;
  }
  var root = document.documentElement;
  var explicit = stored === 'light' || stored === 'dark';
  if (explicit) root.setAttribute('data-theme', stored);
  var dark = stored === 'dark';
  if (!explicit) {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      dark = false;
    }
  }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#121211' : '#f3f0e8');
})();
