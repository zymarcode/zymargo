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

// Tema futurista rojo/negro: se inyecta en TODAS las vistas (usuario, admin y logins) para que el sistema se vea igual.
const FX_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap">';
const FX_THEME = '<style id="fx-theme">' + String.raw`
:root{
  --fx-red:#e50914; --fx-hot:#ff2a35; --fx-deep:#7a030a; --fx-bg:#030304; --fx-panel:#0a0a0d; --fx-panel2:#101015;
  --fx-line:rgba(255,255,255,.30); --fx-line-soft:rgba(255,255,255,.16); --fx-glow:0 0 18px rgba(229,9,20,.38);
  --fx-font:'Rajdhani','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;
  --fx-head:'Orbitron','Rajdhani','Segoe UI',Arial,sans-serif;
  --fx-grad:linear-gradient(135deg,#ff2a35 0%,#e50914 50%,#8a0410 100%);
  --fx-br:
    linear-gradient(#ffffff,#ffffff) left top/14px 2px no-repeat, linear-gradient(#ffffff,#ffffff) left top/2px 14px no-repeat,
    linear-gradient(#ffffff,#ffffff) right top/14px 2px no-repeat, linear-gradient(#ffffff,#ffffff) right top/2px 14px no-repeat,
    linear-gradient(#ffffff,#ffffff) left bottom/14px 2px no-repeat, linear-gradient(#ffffff,#ffffff) left bottom/2px 14px no-repeat,
    linear-gradient(#ffffff,#ffffff) right bottom/14px 2px no-repeat, linear-gradient(#ffffff,#ffffff) right bottom/2px 14px no-repeat;
}
/* ---------- Base: fondo negro con rejilla roja, tipografía técnica ---------- */
html{ background:var(--fx-bg) !important; color-scheme:dark; scrollbar-color:#8a0410 #050506; }
html body{ background:transparent !important; font-family:var(--fx-font) !important; letter-spacing:.2px; }
html::before{
  content:''; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background:
    radial-gradient(ellipse 60% 45% at 12% 0%, rgba(229,9,20,.16), transparent 62%),
    radial-gradient(ellipse 55% 45% at 100% 100%, rgba(229,9,20,.11), transparent 62%),
    linear-gradient(rgba(229,9,20,.05) 1px, transparent 1px) 0 0/46px 46px,
    linear-gradient(90deg, rgba(229,9,20,.05) 1px, transparent 1px) 0 0/46px 46px;
}
html body *:not(.creds-value):not(.device-id):not(svg):not(path){ font-family:var(--fx-font) !important; }
html body h1, html body h2, html body h3, html body .nav-title, html body .vg-brand-name, html body .nav-logo-name,
html body .nav-logo-name, html body .stat-value, html body .brand-title, html body .brand-name, html body .modal-header h2,
html body .sfName, html body .row-title, html body .notif-panel-title, html body .share-modal h3, html body .player-header-title{
  font-family:var(--fx-head) !important; letter-spacing:.08em;
}
html body ::selection{ background:rgba(229,9,20,.6); color:#fff; }
html body ::-webkit-scrollbar{ width:9px; height:9px; }
html body ::-webkit-scrollbar-track{ background:#050506; }
html body ::-webkit-scrollbar-thumb{ background:linear-gradient(#b20710,#5a0309); border-radius:6px; }
html body ::-webkit-scrollbar-thumb:hover{ background:var(--fx-hot); }

/* ---------- Menú lateral ---------- */
html body .vg-side{ background:linear-gradient(180deg,#0b0b0e 0%,#050507 100%); border-right:1px solid var(--fx-line); box-shadow:inset -1px 0 0 rgba(255,42,53,.06), 8px 0 40px rgba(229,9,20,.06); }
html body .vg-brand-name{ font-size:17px; font-weight:900; text-transform:uppercase; }
html body .vg-brand-mark{ filter:drop-shadow(0 0 6px rgba(229,9,20,.7)); }
html body .vg-item{ border-radius:8px; text-transform:uppercase; letter-spacing:.09em; font-size:14px; font-weight:700; color:#d9d9de; }
html body .vg-item:hover{ background:rgba(229,9,20,.09); color:#fff; }
html body .vg-item.active{ background:linear-gradient(90deg,rgba(229,9,20,.30),rgba(229,9,20,.03)); color:#fff; box-shadow:inset 3px 0 0 var(--fx-hot), 0 0 18px rgba(229,9,20,.14); }
html body .vg-item.active svg{ color:var(--fx-hot); filter:drop-shadow(0 0 5px rgba(255,42,53,.8)); }
html body .vg-sep{ background:linear-gradient(90deg,transparent,var(--fx-line),transparent); }
html body .vg-sec{ color:#ff5a63; letter-spacing:.2em; font-weight:700; }

/* ---------- Barra superior ---------- */
html body .nav, html body .nav.scrolled{ background:rgba(3,3,4,.92); border-bottom:1px solid var(--fx-line); box-shadow:0 1px 22px rgba(229,9,20,.12); }
html body .nav-title{ font-size:16px; font-weight:700; text-transform:uppercase; letter-spacing:.2em; }
html body .nav-title::before{ content:''; display:inline-block; width:8px; height:8px; margin-right:12px; background:var(--fx-hot); box-shadow:0 0 10px var(--fx-hot); transform:rotate(45deg); vertical-align:middle; }
html body .nav-search{ border-radius:8px; background:rgba(229,9,20,.05); border:1px solid var(--fx-line); }
html body .nav-search:hover{ background:rgba(229,9,20,.09); }
html body .nav-search:focus-within{ border-color:var(--fx-hot); background:rgba(229,9,20,.09); box-shadow:0 0 0 2px rgba(229,9,20,.18), 0 0 18px rgba(229,9,20,.25); }
html body .nav-search-go{ border-radius:6px; background:var(--fx-grad); text-transform:uppercase; letter-spacing:.08em; }
html body .nav-search-go:hover{ background:linear-gradient(135deg,#ff4d57,#e50914); }
html body .nav-icon-btn, html body .notif-bell, html body .vg-collapse, html body .vg-menu-btn{
  border-radius:10px; background:rgba(229,9,20,.07); border:1px solid var(--fx-line); color:#fff;
}
html body .nav-icon-btn:hover, html body .notif-bell:hover, html body .vg-collapse:hover, html body .vg-menu-btn:hover{
  background:rgba(229,9,20,.18); border-color:var(--fx-hot); box-shadow:var(--fx-glow);
}
html body .nav-logout, html body .nav-user-logout{ border-radius:8px; background:rgba(229,9,20,.10); border:1px solid var(--fx-line); color:#ff8a90; text-transform:uppercase; letter-spacing:.1em; font-weight:700; }
html body .nav-logout:hover, html body .nav-user-logout:hover{ background:var(--fx-grad); border-color:var(--fx-hot); color:#fff; box-shadow:var(--fx-glow); }
html body .nav-user{ border-radius:10px; background:rgba(229,9,20,.07); border:1px solid var(--fx-line); }
html body .nav-user-avatar{ background:var(--fx-grad); }
html body .notif-badge{ background:var(--fx-hot); box-shadow:0 0 10px var(--fx-hot); }

/* ---------- Botones ---------- */
html body .btn, html body button.btn{ border-radius:6px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
html body .btn-play, html body .cm-send, html body .btn-primary, html body .modal .btn-primary, html body #btn,
html body .share-modal-copy, html body .ad-sound, html body #sfGateEnter:not(:disabled){
  background:var(--fx-grad) !important; border:1px solid #ff4d57 !important; color:#fff !important; border-radius:6px !important;
  text-transform:uppercase; letter-spacing:.1em; font-weight:700;
  box-shadow:0 0 0 1px rgba(255,42,53,.15), 0 8px 26px rgba(229,9,20,.42) !important; text-shadow:0 1px 2px rgba(0,0,0,.4);
}
html body .btn-play:hover, html body .cm-send:hover:not(:disabled), html body .btn-primary:hover, html body .modal .btn-primary:hover,
html body #btn:hover, html body .share-modal-copy:hover, html body .ad-sound:hover, html body #sfGateEnter:not(:disabled):hover{
  background:linear-gradient(135deg,#ff4d57 0%,#f6121d 50%,#a30612 100%) !important; box-shadow:0 0 0 1px rgba(255,77,87,.4), 0 10px 34px rgba(255,42,53,.6) !important; transform:translateY(-1px);
}
html body .btn-info, html body .btn-outline, html body .btn-ghost, html body .modal .btn-outline, html body .modal .btn-ghost, html body .dl-btn{
  background:rgba(229,9,20,.06); border:1px solid var(--fx-line); color:#fff; border-radius:6px;
}
html body .btn-info:hover, html body .btn-outline:hover, html body .btn-ghost:hover, html body .dl-btn:hover{
  background:rgba(229,9,20,.16); border-color:var(--fx-hot); box-shadow:var(--fx-glow);
}
html body .btn-danger{ background:rgba(229,9,20,.10); border:1px solid rgba(229,9,20,.45); color:#ff8a90; border-radius:6px; }
html body .btn-danger:hover{ background:var(--fx-grad); border-color:var(--fx-hot); color:#fff; }
html body .vg-chip, html body .chip{ border-radius:6px; background:rgba(255,255,255,.03); border:1px solid var(--fx-line); color:#e6e6ea; text-transform:uppercase; letter-spacing:.1em; font-weight:700; }
html body .vg-chip:hover, html body .chip:hover{ background:rgba(229,9,20,.12); border-color:var(--fx-hot); color:#fff; }
html body .vg-chip.active, html body .chip.active{ background:var(--fx-grad) !important; border-color:#ff4d57 !important; color:#fff !important; box-shadow:0 0 20px rgba(229,9,20,.45) !important; }
html body .vg-cbtn{ border-radius:10px; background:rgba(229,9,20,.08); border:1px solid var(--fx-line); }
html body .vg-cbtn:hover{ background:rgba(229,9,20,.2); border-color:var(--fx-hot); }
html body .vg-cbtn.play{ background:var(--fx-grad); border-color:#ff4d57; box-shadow:var(--fx-glow); }

/* ---------- Tarjetas (usuario y admin) ---------- */
html body .card, html body .stat-card, html body .item-card, html body .ad-card, html body .device-row{
  background:var(--fx-br), linear-gradient(160deg,#111116 0%,#07070a 100%);
  border:1px solid var(--fx-line-soft); border-radius:8px;
  box-shadow:0 8px 26px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.03);
  transition:transform .18s, border-color .18s, box-shadow .18s;
}
html body .card:hover, html body .stat-card:hover, html body .item-card:hover, html body .ad-card:hover{
  background:var(--fx-br), linear-gradient(160deg,#17171d 0%,#0a0a0e 100%);
  border-color:var(--fx-hot); transform:translateY(-3px);
  box-shadow:0 14px 34px rgba(0,0,0,.65), 0 0 0 1px rgba(255,42,53,.25), 0 0 28px rgba(229,9,20,.28);
}
html body .card-thumb{ box-shadow:0 0 0 2px rgba(229,9,20,.45), 0 0 16px rgba(229,9,20,.3); }
html body .card-title, html body .item-name{ text-transform:uppercase; letter-spacing:.06em; font-weight:700; }
html body .card-cat, html body .item-meta, html body .stat-label{ color:#ff7a82; text-transform:uppercase; letter-spacing:.14em; font-size:10.5px; font-weight:700; }
html body .stat-card::before, html body .ad-card::before{ background:linear-gradient(180deg,#ff2a35,#7a030a); box-shadow:0 0 12px rgba(255,42,53,.7); }
html body .stat-value{ font-weight:900; font-size:clamp(22px,2.6vw,30px); text-shadow:0 0 18px rgba(229,9,20,.45); }
html body .badge-destacado, html body .card-badge{ background:var(--fx-grad); border-radius:4px; box-shadow:0 0 12px rgba(229,9,20,.6); }
html body .badge-tipo, html body .badge-external{ border-radius:4px; border:1px solid var(--fx-line); text-transform:uppercase; letter-spacing:.08em; }
html body .item-actions{ border-top:1px solid var(--fx-line-soft); }
html body .item-actions .btn{ border-radius:6px; }

/* ---------- Secciones, hero ---------- */
html body .row-title{ font-size:15px; font-weight:700; text-transform:uppercase; letter-spacing:.2em; align-items:center; }
html body .row-title::before{ display:block; content:''; width:4px; height:1.1em; margin-right:12px; background:var(--fx-hot); box-shadow:0 0 12px var(--fx-hot); }
html body .vg-seeall{ border-radius:6px; text-transform:uppercase; letter-spacing:.1em; background:rgba(229,9,20,.08); border:1px solid var(--fx-line); color:#fff; }
html body .vg-seeall:hover{ background:rgba(229,9,20,.2); border-color:var(--fx-hot); }
html body .hero-title{ text-transform:uppercase; letter-spacing:.05em; font-weight:700; text-shadow:0 0 30px rgba(229,9,20,.35); }
html body .hero-tag, html body .hero-slide.is-audio-slide .hero-tag{ border-radius:4px; background:rgba(229,9,20,.18); border:1px solid var(--fx-hot); color:#fff; text-transform:uppercase; letter-spacing:.14em; }
html body .hero-dot.active{ background:var(--fx-hot); box-shadow:0 0 10px var(--fx-hot); }
html body .hero-progress-bar{ background:var(--fx-grad); box-shadow:0 0 12px rgba(255,42,53,.8); }
html body .hero-arrow{ border-radius:10px; }
html body .hero-arrow:hover{ background:var(--fx-grad); border-color:var(--fx-hot); color:#fff; box-shadow:var(--fx-glow); }
html body .site-footer{ border-top:1px solid var(--fx-line); }
html body .site-footer-social a, html body .social-box a{ border-radius:8px; background:rgba(229,9,20,.07); border:1px solid var(--fx-line); }
html body .site-footer-social a:hover, html body .social-box a:hover{ background:var(--fx-grad); border-color:var(--fx-hot); color:#fff; }

/* ---------- Barra inferior y tabs móviles ---------- */
html body .vg-bar{ background:linear-gradient(180deg,#0a0a0d,#040405); border-top:1px solid var(--fx-line); box-shadow:0 -1px 22px rgba(229,9,20,.14); }
html body .vg-bar-art{ border-radius:8px; border:1px solid var(--fx-line); }
html body .vg-bar-title{ text-transform:uppercase; letter-spacing:.06em; font-weight:700; }
html body .vg-tabs{ background:#050507; border-top:1px solid var(--fx-line); }
html body .vg-tab{ text-transform:uppercase; letter-spacing:.08em; }
html body .vg-tab.active{ color:#ff5a63; }
html body .vg-tab.active::before{ background:var(--fx-hot); box-shadow:0 0 12px var(--fx-hot); }

/* ---------- Formularios ---------- */
html body input[type=text], html body input[type=password], html body input[type=url], html body input[type=number], html body input[type=search],
html body input[type=email], html body select, html body textarea, html body .share-modal-row input, html body .cm-input{
  background:rgba(255,255,255,.03) !important; border:1px solid var(--fx-line) !important; border-radius:6px !important; color:#fff;
}
html body input:focus, html body select:focus, html body textarea:focus{
  outline:none; border-color:var(--fx-hot) !important; box-shadow:0 0 0 2px rgba(229,9,20,.18), 0 0 16px rgba(229,9,20,.25) !important;
}
html body .field label, html body label{ letter-spacing:.12em; }
html body .toolbar{ background:linear-gradient(160deg,#0f0f14,#07070a); border:1px solid var(--fx-line); border-radius:8px; }
html body .modal-tab.active{ color:#fff; border-bottom-color:var(--fx-hot); text-shadow:0 0 12px rgba(255,42,53,.6); }
html body .modal-section-title{ color:#ff5a63; letter-spacing:.16em; }

/* ---------- Ventanas y paneles ---------- */
html body .modal, html body .share-modal, html body .notif-panel, html body #sfGate > div, html body .confirm-modal{
  background:var(--fx-br), linear-gradient(180deg,#0e0e12 0%,#060608 100%) !important;
  border:1px solid var(--fx-line) !important; border-radius:10px !important;
  box-shadow:0 0 0 1px rgba(229,9,20,.06), 0 30px 90px rgba(0,0,0,.85), 0 0 46px rgba(229,9,20,.14) !important;
}
html body .modal-header, html body .modal-footer, html body .modal-tabs{ border-color:var(--fx-line-soft) !important; }
html body .modal-header h2{ font-size:14px; text-transform:uppercase; letter-spacing:.2em; font-weight:700; }
html body .modal-close{ border-radius:8px; background:rgba(229,9,20,.1); border:1px solid var(--fx-line); }
html body .modal-close:hover{ background:var(--fx-grad); color:#fff; }
html body .player-box{ background:#050507; border:1px solid var(--fx-line); border-radius:10px; box-shadow:0 30px 100px rgba(0,0,0,.85), 0 0 40px rgba(229,9,20,.12); }
html body .player-logo{ border-radius:4px; }
html body .toast{ background:#07070a; border:1px solid var(--fx-hot); border-radius:8px; box-shadow:0 0 26px rgba(229,9,20,.4); }
html body .notif-item{ border-top-color:var(--fx-line-soft); }
html body .notif-item:hover{ background:rgba(229,9,20,.07); }
html body .notif-dot{ background:var(--fx-hot); box-shadow:0 0 8px var(--fx-hot); }

/* ---------- Tabla de usuarios ---------- */
html body .table-scroll{ border:1px solid var(--fx-line); border-radius:8px; }
html body .users-table th{ background:#0a0a0d; color:#ff6b73; letter-spacing:.16em; border-bottom:1px solid var(--fx-line); }
html body .users-table td{ border-bottom-color:var(--fx-line-soft); }
html body .users-table tr:hover td, html body .users-table tr:hover td:last-child{ background:rgba(229,9,20,.07); }
html body .user-avatar{ background:var(--fx-grad); box-shadow:0 0 12px rgba(229,9,20,.5); }
html body .role-badge, html body .estado-badge{ border-radius:4px; letter-spacing:.12em; }

/* ---------- Login ---------- */
html body .login-card{
  background:var(--fx-br), linear-gradient(180deg,rgba(14,14,18,.94),rgba(5,5,7,.94)) !important;
  border:1px solid var(--fx-line) !important; border-radius:10px !important;
  box-shadow:0 0 0 1px rgba(229,9,20,.06), 0 30px 90px rgba(0,0,0,.85), 0 0 60px rgba(229,9,20,.16) !important;
}
html body .login-card h1{ font-size:15px; text-transform:uppercase; letter-spacing:.22em; font-weight:700; }
html body .brand-title{ font-size:16px; font-weight:900; text-transform:uppercase; }
html body .brand-mark{ border-color:var(--fx-hot); box-shadow:0 0 14px rgba(229,9,20,.6); }
html body .input-wrap svg.icon{ fill:#ff5a63; }
html body .creds{ background:var(--fx-grad); }
html body .social-links a{ border-radius:8px; background:rgba(229,9,20,.07); border:1px solid var(--fx-line); }
html body .social-links a:hover{ background:var(--fx-grad); border-color:var(--fx-hot); }

/* ---------- Carga / verificación ---------- */
html body #sfLoad{
  background:
    radial-gradient(ellipse at 50% 38%, rgba(229,9,20,.30) 0%, rgba(20,6,9,.92) 46%, #030304 100%),
    linear-gradient(rgba(229,9,20,.06) 1px, transparent 1px) 0 0/40px 40px,
    linear-gradient(90deg, rgba(229,9,20,.06) 1px, transparent 1px) 0 0/40px 40px, #030304;
}
html body #sfLoad .sfName{ font-weight:900; letter-spacing:.22em; }
html body #sfLoad .sfMark::before{ border:2px dashed rgba(255,42,53,.55); animation:fxRev 7s linear infinite; }
html body #sfLoad .sfBar{ height:3px; border-radius:0; background:rgba(229,9,20,.18); }
html body #sfLoad .sfBar i{ border-radius:0; box-shadow:0 0 14px var(--fx-hot); }
@keyframes fxRev{ to{ transform:rotate(-360deg); } }
html body .device-check-overlay{ background:radial-gradient(ellipse at 50% 40%,rgba(229,9,20,.25) 0%,#030304 70%); letter-spacing:.2em; text-transform:uppercase; }
@media (prefers-reduced-motion:reduce){ html body #sfLoad .sfMark::before{ animation:none; } }
` + '</style>';

function view(name, ctx) {
  const src = fs.readFileSync(path.join(process.cwd(), 'views', name + '.html'), 'utf8');
  let html = render(name, src, ctx);
  const inject = appHead(ctx && ctx.brand) + SHIM;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + inject; });
  else html = inject + html;
  // El tema va al final del <head> para ganar a los estilos propios de cada vista.
  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, function (m) { return FX_FONTS + FX_THEME + m; });
  else html = html + FX_FONTS + FX_THEME;
  return html;
}

module.exports = async function (req, res) {
  try {
    const params = req.query || {};
    const page = params.page || 'user';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = 'https://' + host + '/';
    const brandRaw = await S.getBrandConfig();
    // Las páginas públicas reciben las URLs de imagen de la marca cifradas; solo el panel admin usa las reales.
    const brand = S.protectBrand(brandRaw);
    let html;

    if (page === 'admin') {
      const token = params.token || '';
      if (token && await S.isValidSession_(token)) html = view('Admin', { baseUrl: baseUrl, token: token, brand: brandRaw, userToken: '', userName: '' });
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
