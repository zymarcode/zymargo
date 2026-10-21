// Protege las URLs reales del contenido: al navegador solo llegan enlaces
// opacos "/s/<token>" (cifrados con AES-256-GCM en el servidor). La URL real
// nunca sale de Vercel: /api/stream la descifra y trae el contenido por el usuario.
// La clave se deriva de APPS_SCRIPT_SECRET (no se guarda en tu hoja ni en el navegador).
const crypto = require('crypto');

function key() {
  return crypto.createHash('sha256').update('zymar-url|' + (process.env.APPS_SCRIPT_SECRET || '')).digest();
}
function b64u(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }

// IV derivado de la URL: la misma URL da siempre el mismo token (mejor caché) y no se repite IV con textos distintos.
function enc(url) {
  const k = key();
  const iv = crypto.createHmac('sha256', k).update(url).digest().subarray(0, 12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(url, 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), ct]));
}
function dec(token) {
  const buf = unb64u(token);
  if (buf.length < 29) throw new Error('token');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

// Pista de "forma" para que el reproductor siga reconociendo HLS, radio en vivo o la extensión del archivo.
const EXTS = /\.(mp3|mp4|m4a|m4v|aac|ogg|opus|wav|flac|webm|mkv|mov|ts|m4s|jpe?g|png|gif|webp|svg|bmp|pdf)$/i;
function hint(url) {
  if (/\.m3u8(?=$|[?#\/&])/i.test(url) || /[?&][a-z_]+=m3u8(?:&|#|$)/i.test(url)) return '.m3u8';
  if (/icecast|shoutcast|\/stream\b|\/live\b|\.audio(\?|$)/i.test(url)) return '/stream';
  let p = '';
  try { p = new URL(url).pathname; } catch (e) { return ''; }
  const m = EXTS.exec(p);
  return m ? m[0].toLowerCase() : '';
}
function protect(url) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return '/s/' + enc(url) + hint(url);
}
function unprotect(p) {
  return dec(String(p).split(/[.\/]/)[0]);
}

module.exports = { protect: protect, unprotect: unprotect, hint: hint };
