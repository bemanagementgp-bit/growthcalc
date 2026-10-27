/* Long-tail page preset: <script src="/preset.js" data-q="a=1&b=2"> pre-fills the tool via the query string
   before app.js reads it. Only plain key=value pairs are accepted. */
(function () {
  const s = document.currentScript; const q = s && s.getAttribute('data-q');
  if (!q || location.search || !/^[\w.%+-]+=[^&<>"']*(&[\w.%+-]+=[^&<>"']*)*$/.test(q)) return;
  try { history.replaceState(null, '', location.pathname + '?' + q + location.hash); } catch (e) {}
})();
