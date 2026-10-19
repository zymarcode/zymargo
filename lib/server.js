// Vercel NO guarda datos ni tiene lógica de negocio: reenvía cada llamada
// al Web App de Google Apps Script (Code.gs), que trabaja con tu Google Sheet.
// Variables de entorno en Vercel:
//   APPS_SCRIPT_URL     -> URL del despliegue web (termina en /exec)
//   APPS_SCRIPT_SECRET  -> la misma clave que pusiste en Code.gs
const GAS_URL = process.env.APPS_SCRIPT_URL || '';
const GAS_SECRET = process.env.APPS_SCRIPT_SECRET || '';

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
  'setBrandConfig', 'setBrandLogo', 'setPlayerLogo', 'setLoginBackground', 'setLoginHint', 'setSocialLinks',
  'getMedia', 'getCategories', 'addMedia', 'updateMedia', 'reorderMedia', 'deleteMedia', 'importMedia',
  'getNotificaciones', 'addNotificacion', 'deleteNotificacion',
  'listUsers', 'createUser', 'updateUser', 'deleteUser', 'listUserSessions', 'forceCloseUserSession', 'forceCloseAllUserSessions',
  'verifyUserLogin', 'getUserInfo', 'logoutUser',
  'getAdsPublic', 'listAds', 'addAd', 'updateAd', 'deleteAd', 'setAdsConfig'
];
const API = {};
NAMES.forEach(function (n) { API[n] = function () { return call(n, Array.prototype.slice.call(arguments)); }; });

module.exports = {
  API: API,
  ensureInit: async function () { return true; },
  getBrandConfig: function () { return call('getBrandConfig', []); },
  isValidSession_: function (t) { return call('isValidSession_', [t]); },
  isValidUserSession_: function (t) { return call('isValidUserSession_', [t]); },
  getUserNameByToken_: function (t) { return call('getUserNameByToken_', [t]); }
};
