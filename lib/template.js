// Mini motor de plantillas compatible con las de Apps Script:
//   <? codigo ?>   <?= expresion ?> (escapada según contexto)   <?!= expresion ?> (sin escapar)
const cache = {};

function escHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function escScript(v) {
  return JSON.stringify(String(v == null ? '' : v)).slice(1, -1).replace(/'/g, "\\'").replace(/</g, '\\u003c');
}
function escStyle(v) {
  return String(v == null ? '' : v).replace(/[\\'"<]/g, function (c) { return '\\' + c; });
}
function esc(v, ctx, raw) {
  if (raw) return String(v == null ? '' : v);
  if (ctx === 'script') return escScript(v);
  if (ctx === 'style') return escStyle(v);
  return escHtml(v);
}

function compile(src) {
  const re = /<\?(!=|=)?([\s\S]*?)\?>/g;
  let code = 'var __o="";\n', last = 0, m, ctx = 'html';
  function updateCtx(text) {
    const lo = text.toLowerCase();
    const sOpen = lo.lastIndexOf('<script'), sClose = lo.lastIndexOf('</script>');
    const tOpen = lo.lastIndexOf('<style'), tClose = lo.lastIndexOf('</style>');
    if (sOpen > -1 || sClose > -1 || tOpen > -1 || tClose > -1) {
      const best = Math.max(sOpen, sClose, tOpen, tClose);
      if (best === sOpen) ctx = 'script';
      else if (best === tOpen) ctx = 'style';
      else ctx = 'html';
    }
  }
  while ((m = re.exec(src)) !== null) {
    const text = src.slice(last, m.index);
    if (text) { code += '__o+=' + JSON.stringify(text) + ';\n'; updateCtx(text); }
    const kind = m[1], body = m[2];
    if (kind === '=') code += '__o+=__esc((' + body + '),' + JSON.stringify(ctx) + ',false);\n';
    else if (kind === '!=') code += '__o+=__esc((' + body + '),' + JSON.stringify(ctx) + ',true);\n';
    else code += body + '\n';
    last = m.index + m[0].length;
  }
  const tail = src.slice(last);
  if (tail) code += '__o+=' + JSON.stringify(tail) + ';\n';
  code += 'return __o;';
  return new Function('__ctx', '__esc', 'with(__ctx){' + code + '}');
}

function render(name, src, ctx) {
  if (!cache[name]) cache[name] = compile(src);
  return cache[name](ctx, esc);
}

module.exports = { render };
