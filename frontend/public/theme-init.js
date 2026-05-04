(function () {
  try {
    var t = localStorage.getItem('brain-theme') || 'dark';
    var h = document.documentElement;
    h.classList.remove('dark', 'light', 'stylogreen');
    if (t === 'light') h.classList.add('light');
    else if (t === 'stylogreen') h.classList.add('stylogreen');
    else if (t === 'system') {
      h.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else {
      h.classList.add('dark');
    }
  } catch (e) {}
})();
