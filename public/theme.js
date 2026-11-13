// Läuft vor dem ersten Zeichnen, damit beim Laden nichts aufblitzt (gleiche Logik wie src/lib/theme.ts)
;(function () {
  var p = null
  try { p = localStorage.getItem('stockdeck-theme') } catch {}
  var dark = p === 'dark' || (p !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
