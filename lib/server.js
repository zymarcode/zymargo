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
  'getMedia', 'getCategories', 'addMedia', 'updateMedia', 'reorderMedia', 'deleteMedia', 'importMedia',
  'getNotificaciones', 'addNotificacion', 'deleteNotificacion',
  'getMediaSocial', 'toggleLike', 'addComment', 'editComment', 'deleteComment',
  'listUsers', 'createUser', 'updateUser', 'deleteUser', 'listUserSessions', 'forceCloseUserSession', 'forceCloseAllUserSessions',
  'verifyUserLogin', 'getUserInfo', 'logoutUser', 'shouldShowGate',
  'getAdsPublic', 'listAds', 'addAd', 'updateAd', 'deleteAd', 'setAdsConfig'
];
const API = {};
NAMES.forEach(function (n) { API[n] = function () { return call(n, Array.prototype.slice.call(arguments)); }; });

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
  ensureInit: async function () { return true; },
  getBrandConfig: function () { return call('getBrandConfig', []); },
  protectBrand: protectBrand,
  isValidSession_: function (t) { return call('isValidSession_', [t]); },
  isValidUserSession_: function (t) { return call('isValidUserSession_', [t]); },
  getUserNameByToken_: function (t) { return call('getUserNameByToken_', [t]); }
};
