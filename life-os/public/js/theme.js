// Applies a saved light/dark choice before first paint (classic script, no module).
(function () {
  try {
    var t = localStorage.getItem('life-os:theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) { /* storage unavailable */ }
})();
