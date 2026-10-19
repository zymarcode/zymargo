const fs = require('fs');
const path = require('path');
const { render } = require('../lib/template');
const S = require('../lib/server');

// Reemplazo de google.script.run: cada llamada va a /api/rpc.
const SHIM = '<script>(function(){function mk(s,f){return new Proxy({},{get:function(_,n){' +
  'if(n==="withSuccessHandler")return function(h){return mk(h,f)};' +
  'if(n==="withFailureHandler")return function(h){return mk(s,h)};' +
  'if(typeof n!=="string"||n==="then")return undefined;' +
  'return function(){var a=Array.prototype.slice.call(arguments);' +
  'fetch("/api/rpc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fn:n,args:a})})' +
  '.then(function(r){return r.json()}).then(function(j){if(j.error){if(f)f({message:j.error});else console.error(j.error)}else if(s)s(j.result)})' +
  '.catch(function(e){if(f)f({message:e.message})})}}})}' +
  'window.google={script:{run:mk(null,null)}};})();</script>';

// Apps Script agregaba solo el viewport y mostraba la página como app.
// En Vercel hay que declararlo: viewport, tema, modo app instalable (PWA) y estilos táctiles.
function escAttr(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function appHead(brand) {
  const name = escAttr((brand && brand.brandName) || 'STREAMFLIX');
  const logo = brand && brand.brandLogoUrl ? escAttr(brand.brandLogoUrl) : '/icons/apple-touch-icon.png';
  return '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="theme-color" content="#141414">' +
    '<meta name="color-scheme" content="dark">' +
    '<meta name="mobile-web-app-capable" content="yes">' +
    '<meta name="apple-mobile-web-app-capable" content="yes">' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="black">' +
    '<meta name="apple-mobile-web-app-title" content="' + name + '">' +
    '<meta name="application-name" content="' + name + '">' +
    '<meta name="format-detection" content="telephone=no">' +
    '<link rel="manifest" href="/manifest.webmanifest">' +
    '<link rel="apple-touch-icon" href="' + logo + '">' +
    '<style>' +
    'html{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}' +
    'html body{overflow-x:visible;overflow-x:clip;overflow-y:visible}' +
    'html body .row-track{touch-action:pan-x pan-y}' +
    '@media (display-mode:standalone){' +
    'body{-webkit-touch-callout:none}' +
    'body :not(input):not(textarea):not([contenteditable]){-webkit-user-select:none;user-select:none}' +
    '}' +
    '</style>' +
    '<script>if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(function(){})})}</script>';
}

function view(name, ctx) {
  const src = fs.readFileSync(path.join(process.cwd(), 'views', name + '.html'), 'utf8');
  let html = render(name, src, ctx);
  const inject = appHead(ctx && ctx.brand) + SHIM;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + inject; });
  else html = inject + html;
  return html;
}

module.exports = async function (req, res) {
  try {
    const params = req.query || {};
    const page = params.page || 'user';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = 'https://' + host + '/';
    const brand = await S.getBrandConfig();
    let html;

    if (page === 'admin') {
      const token = params.token || '';
      if (token && await S.isValidSession_(token)) html = view('Admin', { baseUrl: baseUrl, token: token, brand: brand, userToken: '', userName: '' });
      else html = view('Login', { baseUrl: baseUrl, brand: brand });
    } else if (page === 'login') {
      const utoken = params.utoken || '';
      if (utoken && await S.isValidUserSession_(utoken)) {
        html = view('Usuario', { baseUrl: baseUrl, brand: brand, userToken: utoken, userName: await S.getUserNameByToken_(utoken) });
      } else {
        html = view('LoginUsuario', { baseUrl: baseUrl, brand: brand });
      }
    } else {
      html = view('Usuario', { baseUrl: baseUrl, brand: brand, userToken: '', userName: '' });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send('<pre style="font:14px monospace;padding:20px;white-space:pre-wrap">Error: ' + String((e && e.message) || e).replace(/</g, '&lt;') + '</pre>');
  }
};
