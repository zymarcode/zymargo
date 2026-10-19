// Service worker mínimo: hace la app instalable sin cachear nada
// (las páginas llevan tokens de sesión y el video/streaming no debe interceptarse).
const SW = [
  "self.addEventListener('install', function(){ self.skipWaiting(); });",
  "self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });",
  "self.addEventListener('fetch', function(){});"
].join('\n');

module.exports = function (req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Service-Worker-Allowed', '/');
  res.status(200).send(SW);
};
