// Vercel NO guarda datos ni tiene lógica de negocio: reenvía cada llamada
// al Web App de Google Apps Script (Code.gs), que trabaja con tu Google Sheet.
// Variables de entorno en Vercel:
//   APPS_SCRIPT_URL     -> URL del despliegue web (termina en /exec)
//   APPS_SCRIPT_SECRET  -> la misma clave que pusiste en Code.gs
const GAS_URL = process.env.APPS_SCRIPT_URL || '';
const GAS_SECRET = process.env.APPS_SCRIPT_SECRET || '';
const U = require('./urlcrypt');

async function call(fn, args) {
  if (!GAS_URL || !GAS_SECRET) {
    throw new Error('Falta configurar Vercel: agrega APPS_SCRIPT_URL y APPS_SCRIPT_SECRET en Settings > Environment Variables y haz Redeploy.');
  }
  const r = await fetch(GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: GAS_SECRET, fn: fn, args: args || [] })
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch (e) {
    throw new Error('Apps Script no respondió JSON. Revisa que el despliegue sea "Aplicación web" con acceso "Cualquier persona", que la URL termine en /exec y que hayas creado una versión nueva tras editar Code.gs. Respuesta: ' + t.slice(0, 120).replace(/\s+/g, ' '));
  }
  if (j.error) throw new Error(j.error);
  return j.result === undefined ? null : j.result;
}

// Funciones que el navegador puede llamar (google.script.run.*)
const NAMES = [
  'verifyLogin', 'checkSession', 'checkSessionDevice', 'logout', 'getConnectedDevicesSummary', 'changePassword',
  'setBrandConfig', 'setBrandLogo', 'setPlayerLogo', 'setLoginBackground', 'setLoginHint', 'setFooterText', 'setSocialLinks',
  'getMedia', 'getCategories', 'addMedia', 'updateMedia', 'reorderMedia', 'deleteMedia', 'importMedia', 'searchArtwork',
  'getNotificaciones', 'addNotificacion', 'deleteNotificacion',
  'getMediaSocial', 'toggleLike', 'addComment', 'deleteComment',
  'listUsers', 'createUser', 'updateUser', 'deleteUser', 'listUserSessions', 'forceCloseUserSession', 'forceCloseAllUserSessions',
  'verifyUserLogin', 'getUserInfo', 'logoutUser', 'shouldShowGate',
  'getAdsPublic', 'listAds', 'addAd', 'updateAd', 'deleteAd', 'setAdsConfig',
  'resolveLink'
];
const API = {};
NAMES.forEach(function (n) { API[n] = function () { return call(n, Array.prototype.slice.call(arguments)); }; });

// resolveLink: los enlaces acortados de WhatsApp (https://wa.link/xxxx) no traen el número en la URL;
// el número solo se conoce al seguir la redirección. El navegador no puede leerla (CORS), así que la sigue el servidor.
// Solo se consultan enlaces de wa.link; el resultado queda en memoria para no repetir la consulta.
const linkCache = new Map();
const WA_FINAL = /^(wa\.me|(api|web)\.whatsapp\.com|whatsapp\.com|chat\.whatsapp\.com)$/i;
API.resolveLink = async function (url) {
  url = String(url || '');
  let u;
  try { u = new URL(url); } catch (e) { return { url: url }; }
  if (!/^https?:$/.test(u.protocol) || !/^wa\.link$/i.test(u.hostname)) return { url: url };
  if (linkCache.has(url)) return linkCache.get(url);
  let out = { url: url };
  try {
    let cur = url;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(cur, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' },
        signal: AbortSignal.timeout(6000)
      });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        cur = new URL(loc, cur).href;
        out = { url: cur };
        if (WA_FINAL.test(new URL(cur).hostname)) break;
        if (!/^wa\.link$/i.test(new URL(cur).hostname)) break; // no se consultan otros sitios
        continue;
      }
      // Sin redirección HTTP: se busca el destino de WhatsApp dentro de la página.
      const t = (await r.text()).slice(0, 200000);
      const m = /https?:\\?\/\\?\/(?:wa\.me\\?\/\d+|(?:api|web)\.whatsapp\.com\\?\/send[^"'<\s]*)/i.exec(t);
      if (m) out = { url: m[0].replace(/\\\//g, '/').replace(/&amp;/g, '&') };
      break;
    }
  } catch (e) {}
  if (out.url !== url) {
    if (linkCache.size > 500) linkCache.clear();
    linkCache.set(url, out);
  }
  return out;
};

// Protege un campo URL de un objeto (copia); si no hay URL http(s) lo deja igual.
function protectField_(o, f) {
  if (!o || !o[f]) return o;
  const c = Object.assign({}, o);
  c[f] = U.protect(String(o[f]));
  return c;
}

async function isAdminToken_(token) {
  if (!token) return false;
  try { return !!(await call('isValidSession_', [token])); } catch (e) { return false; }
}

// getMedia: a todo el que no sea un administrador con sesión válida se le entregan
// URLs cifradas (/s/<token>); el panel de administración recibe las reales para poder editarlas.
// Además del contenido (url) se cifran las imágenes de portada (miniatura y miniaturaCarrusel).
API.getMedia = async function (token) {
  const list = await call('getMedia', []);
  if (!Array.isArray(list) || await isAdminToken_(token)) return list;
  return list.map(function (m) {
    if (!m) return m;
    let c = m;
    ['url', 'miniatura', 'miniaturaCarrusel'].forEach(function (f) { c = protectField_(c, f); });
    return c;
  });
};

// getAdsPublic: la URL del anuncio (video o imagen) viaja cifrada (/s/<token>).
// "enlace" (destino del botón "Visitar anunciante") es un vínculo de navegación y no se modifica.
// listAds (solo administrador) sigue entregando las URLs reales para poder editarlas.
API.getAdsPublic = async function () {
  const res = await call('getAdsPublic', Array.prototype.slice.call(arguments));
  if (!res || !Array.isArray(res.ads)) return res;
  const out = Object.assign({}, res);
  out.ads = res.ads.map(function (a) { return protectField_(a, 'url'); });
  return out;
};

// Marca (logo, logo del reproductor, fondo de login): cifra las URLs de imagen
// para las páginas públicas. La página de administración usa la marca sin cifrar.
function protectBrand(brand) {
  if (!brand) return brand;
  let b = brand;
  ['brandLogoUrl', 'playerLogoUrl', 'loginBgUrl'].forEach(function (f) { b = protectField_(b, f); });
  return b;
}

module.exports = {
  API: API,
  NAMES: NAMES,
  ensureInit: async function () { return true; },
  getBrandConfig: function () { return call('getBrandConfig', []); },
  protectBrand: protectBrand,
  isValidSession_: function (t) { return call('isValidSession_', [t]); },
  isValidUserSession_: function (t) { return call('isValidUserSession_', [t]); },
  getUserNameByToken_: function (t) { return call('getUserNameByToken_', [t]); }
};
