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

function view(name, ctx) {
  const src = fs.readFileSync(path.join(process.cwd(), 'views', name + '.html'), 'utf8');
  let html = render(name, src, ctx);
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + SHIM; });
  else html = SHIM + html;
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
      if (token && await S.isValidSession_(token)) html = view('Admin', { baseUrl: baseUrl, token: token, brand: brand });
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
