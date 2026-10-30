// Entrada para Cloudflare Workers. Vercel NO usa este archivo (ver vercel.json).
// Reutiliza tal cual los handlers de /api: aquí solo se traduce Request/Response de Cloudflare
// al formato req/res (estilo Node) que esos handlers ya esperan, con las mismas rutas de vercel.json.
//
// Variables (Cloudflare > Workers > Settings > Variables and Secrets, o `wrangler secret put`):
//   APPS_SCRIPT_URL     -> URL del despliegue web de Apps Script (termina en /exec)
//   APPS_SCRIPT_SECRET  -> la misma clave que pusiste en Code.gs
import { Writable } from 'node:stream';
import tpl from './lib/template.js';
import Admin from './views/Admin.html';
import Usuario from './views/Usuario.html';
import LoginUsuario from './views/LoginUsuario.html';
import indexHandler from './api/index.js';
import rpcHandler from './api/rpc.js';
import streamHandler from './api/stream.js';
import manifestHandler from './api/manifest.js';
import swHandler from './api/sw.js';

// Cloudflare solo permite new Function() mientras arranca el Worker (no dentro de una petición),
// por eso las vistas se compilan aquí, una sola vez, y api/index.js las reutiliza.
tpl.precompile('Admin', Admin);
tpl.precompile('Usuario', Usuario);
tpl.precompile('LoginUsuario', LoginUsuario);

// Mismas rutas que vercel.json (más el acceso directo a /api/*, que también existe en Vercel).
const ROUTES = {
  '/': indexHandler,
  '/api/index': indexHandler,
  '/rpc': rpcHandler,
  '/api/rpc': rpcHandler,
  '/manifest.webmanifest': manifestHandler,
  '/api/manifest': manifestHandler,
  '/sw.js': swHandler,
  '/api/sw': swHandler,
  '/api/stream': streamHandler
};

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// Equivale a req de Vercel: method, headers (minúsculas), query y body.
function makeReq(request, url, body) {
  const headers = {};
  request.headers.forEach(function (v, k) { headers[k.toLowerCase()] = v; });
  const query = {};
  url.searchParams.forEach(function (v, k) {
    if (Object.prototype.hasOwnProperty.call(query, k)) query[k] = [].concat(query[k], v);
    else query[k] = v;
  });
  if (url.pathname.indexOf('/s/') === 0) query.p = safeDecode(url.pathname.slice(3)); // /s/:p* -> ?p=:p*
  return { method: request.method, headers: headers, query: query, body: body, url: url.pathname + url.search };
}

// Equivale a res de Vercel/Node: es un Writable (para poder usar pipe) que alimenta el cuerpo del Response.
class NodeRes extends Writable {
  constructor(noBody) {
    super();
    this.statusCode = 200;
    this.headersSent = false;
    this._headers = new Headers();
    this._discard = !!noBody;
    this._writer = null;
    this._readable = null;
    if (!this._discard) {
      const ts = new TransformStream();
      this._readable = ts.readable;
      this._writer = ts.writable.getWriter();
      // Si el cliente se desconecta, el cuerpo se cancela: se destruye para emitir 'close' (stream.js aborta el origen).
      this._writer.closed.catch(() => { this.destroy(); });
    }
    this.response = new Promise((resolve) => { this._resolve = resolve; });
  }
  setHeader(k, v) { this._headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); return this; }
  getHeader(k) { const v = this._headers.get(k); return v === null ? undefined : v; }
  status(n) { this.statusCode = n; return this; }
  json(o) { this.setHeader('Content-Type', 'application/json; charset=utf-8'); this.end(JSON.stringify(o)); }
  send(b) { this.end(b); }
  _commit() {
    if (this.headersSent) return;
    this.headersSent = true;
    const empty = this._discard || this.statusCode === 204 || this.statusCode === 205 || this.statusCode === 304;
    this._resolve(new Response(empty ? null : this._readable, { status: this.statusCode, headers: this._headers }));
  }
  _write(chunk, enc, cb) {
    this._commit();
    if (this._discard) { cb(); return; }
    this._writer.write(chunk).then(function () { cb(); }, function (e) { cb(e); });
  }
  _final(cb) {
    this._commit();
    if (this._discard) { cb(); return; }
    this._writer.close().then(function () { cb(); }, function () { cb(); });
  }
  _destroy(err, cb) {
    if (this._writer) { try { this._writer.abort().catch(function () {}); } catch (e) {} }
    cb(err);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = url.pathname.indexOf('/s/') === 0 ? streamHandler : ROUTES[url.pathname];
    // Lo que no es una ruta de la app (p. ej. /icons/*) lo sirve Cloudflare desde /public.
    if (!handler) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('No encontrado', { status: 404 });

    const body = (request.method === 'GET' || request.method === 'HEAD') ? undefined : await request.text();
    const req = makeReq(request, url, body);
    const res = new NodeRes(request.method === 'HEAD');

    const done = Promise.resolve()
      .then(function () { return handler(req, res); })
      .catch(function (e) {
        if (!res.headersSent) res.status(500).end('Error: ' + String((e && e.message) || e));
        else res.destroy();
      });
    ctx.waitUntil(done);
    return res.response;
  }
};
