// Proxy de contenido: recibe /s/<token>, descifra la URL real y entrega el contenido
// sin que el navegador vea nunca el enlace original.
const { Readable } = require('stream');
const U = require('../lib/urlcrypt');

function fixUpstream(url) {
  if (url.indexOf('dropbox.com') !== -1) {
    if (/[?&]dl=0/.test(url)) url = url.replace('dl=0', 'dl=1');
    else if (!/[?&]dl=1/.test(url)) url += (url.indexOf('?') === -1 ? '?dl=1' : '&dl=1');
  }
  const d = /drive\.google\.com\/file\/d\/([^\/?#]+)/.exec(url) ||
            /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([^&#]+)/.exec(url);
  if (d && !/export=download/.test(url)) url = 'https://drive.google.com/uc?export=download&id=' + d[1];
  return url;
}

function isPrivateHost(h) {
  h = String(h || '').toLowerCase();
  return h === 'localhost' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h === '0.0.0.0' || h === '::1' || /^\[/.test(h) || h.endsWith('.internal') || h.endsWith('.local');
}

function safeName(n) {
  return String(n || 'descarga').replace(/[\\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'descarga';
}

module.exports = async function (req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).end(); return; }
  let target;
  try {
    let p = req.query && req.query.p;
    if (Array.isArray(p)) p = p.join('/');
    target = fixUpstream(U.unprotect(p));
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) throw new Error('bad');
  } catch (e) { res.status(404).end('No encontrado'); return; }

  const ac = new AbortController();
  res.on('close', function () { if (!res.writableEnded) ac.abort(); });

  const h = { 'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0', 'Accept': '*/*' };
  if (req.headers.range) h['Range'] = req.headers.range;
  if (req.headers['icy-metadata']) h['Icy-MetaData'] = req.headers['icy-metadata'];

  const dl = req.query && req.query.dl === '1';

  // Respaldo: hay orígenes que bloquean los servidores de Vercel (restringidos por país/IP,
  // como algunos canales de operadoras) pero sí responden al navegador del usuario.
  // Si el origen rechaza o no responde desde aquí, se redirige al navegador al origen real
  // para que lo pida directamente (igual que antes del cifrado). Solo ocurre cuando el proxy falla.
  function direct() {
    if (res.headersSent) return;
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end();
  }

  let r;
  try {
    r = await fetch(target, { method: 'GET', headers: h, redirect: 'follow', signal: ac.signal });
  } catch (e) {
    if (ac.signal.aborted) return;
    if (!dl) { direct(); return; }
    if (!res.headersSent) res.status(502).end('Origen no disponible');
    return;
  }

  if (!dl && (r.status === 401 || r.status === 403 || r.status === 451 || r.status >= 500)) {
    try { if (r.body) r.body.cancel(); } catch (e) {}
    direct();
    return;
  }

  const ct = r.headers.get('content-type') || '';
  const pStr = String((req.query && req.query.p) || '');
  const isPl = /mpegurl/i.test(ct) || /\.m3u8$/i.test(pStr) || /\.m3u8(\?|$)/i.test(r.url || '');

  if (isPl && !dl) {
    const text = await r.text();
    if (text.indexOf('#EXTM3U') === 0) {
      const base = r.url || target;
      const abs = function (x) { try { return new URL(x, base).href; } catch (e) { return x; } };
      const out = text.split(/\r?\n/).map(function (line) {
        const t = line.trim();
        if (!t) return line;
        if (t.charAt(0) === '#') return line.replace(/URI="([^"]+)"/g, function (m, x) { return 'URI="' + U.protect(abs(x)) + '"'; });
        return U.protect(abs(t));
      }).join('\n');
      res.status(200);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.end(req.method === 'HEAD' ? undefined : out);
      return;
    }
    res.status(r.status);
    res.setHeader('Content-Type', ct || 'text/plain');
    res.setHeader('Cache-Control', 'no-store');
    res.end(req.method === 'HEAD' ? undefined : text);
    return;
  }

  res.status(r.status);
  ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'].forEach(function (n) {
    const v = r.headers.get(n); if (v) res.setHeader(n, v);
  });
  r.headers.forEach(function (v, n) { if (/^icy-/i.test(n)) res.setHeader(n, v); });
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (dl) {
    let ext = '';
    const m = /\.[a-z0-9]{2,5}$/i.exec(pStr);
    if (m) ext = m[0];
    let name = safeName(req.query && req.query.n);
    if (ext && name.toLowerCase().slice(-ext.length) !== ext.toLowerCase()) name += ext;
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(name));
  }
  if (req.method === 'HEAD' || !r.body) { res.end(); return; }
  const rs = Readable.fromWeb(r.body);
  rs.on('error', function () { try { res.end(); } catch (e) {} });
  rs.pipe(res);
};
