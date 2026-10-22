// Compatibilidad con WebView / navegadores antiguos (TV Box Android sin certificar, Chrome < 88).
//
// Se aplica SOLO al CSS de los bloques <style> ya renderizados. No toca el JavaScript.
// Es aditivo: en navegadores modernos el resultado se ve exactamente igual, porque las
// declaraciones originales se conservan y siempre van DESPUÉS de las de respaldo.
//
//  1) inset:...            -> se añaden top/right/bottom/left (inset existe desde Chrome 87).
//  2) clamp() / min() / max() -> se añade antes una declaración de respaldo sin esas funciones
//     (clamp/min/max existen desde Chrome 79; sin respaldo, el navegador viejo ignora la
//     declaración completa y el diseño se descuadra).
//  3) Variables CSS (--x: clamp(...)) -> un navegador viejo no puede "volver" a un valor anterior
//     de una variable, así que se añade una copia dentro de @supports not (...) que solo
//     aplican los navegadores que no entienden min()/max()/clamp().

const MATH_RE = /(?<![\w-])(clamp|min|max)\(/;
const SUPPORTS_NOT = '@supports not (width:min(1px,2px))';
const cache = new Map();

function skipString(s, i) {
  const q = s[i];
  i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === q) return i + 1;
    i++;
  }
  return i;
}

// i apunta a "(": devuelve la posición del ")" que la cierra.
function matchParen(s, i) {
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  return s.length - 1;
}

// i apunta a "{": devuelve la posición del "}" que lo cierra.
function matchBrace(s, i) {
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === '(') { i = matchParen(s, i) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return s.length - 1;
}

// Divide por un separador (',' o ';' o espacio) solo en el nivel superior (fuera de paréntesis y comillas).
function splitTop(s, sep) {
  const out = [];
  let start = 0, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === '(') { i = matchParen(s, i) + 1; continue; }
    if (sep === ' ' ? /\s/.test(c) : c === sep) {
      out.push(s.slice(start, i));
      i++;
      if (sep === ' ') while (i < s.length && /\s/.test(s[i])) i++;
      start = i;
      continue;
    }
    i++;
  }
  out.push(s.slice(start));
  return out;
}

// Quita clamp()/min()/max(): clamp -> valor preferido (el del medio); min/max -> primer argumento.
function lowerMath(val) {
  let guard = 0;
  let m;
  while ((m = MATH_RE.exec(val)) && guard++ < 200) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(val, open);
    const args = splitTop(val.slice(open + 1, close), ',').map(function (a) { return a.trim(); });
    let rep;
    if (m[1] === 'clamp') rep = args.length >= 2 ? args[1] : args[0];
    else rep = args[0];
    val = val.slice(0, m.index) + rep + val.slice(close + 1);
  }
  return val;
}

function expandInset(val) {
  let important = '';
  const im = /\s*!important\s*$/i.exec(val);
  if (im) { important = ' !important'; val = val.slice(0, im.index); }
  const p = splitTop(val.trim(), ' ').filter(Boolean);
  if (!p.length || p.length > 4) return null;
  const top = p[0];
  const right = p[1] !== undefined ? p[1] : top;
  const bottom = p[2] !== undefined ? p[2] : top;
  const left = p[3] !== undefined ? p[3] : right;
  return ['top:' + top, 'right:' + right, 'bottom:' + bottom, 'left:' + left].map(function (d) { return d + important; });
}

function lowerRule(sel, body) {
  const decls = splitTop(body, ';');
  const out = [];
  const customFb = [];
  for (let k = 0; k < decls.length; k++) {
    const d = decls[k];
    if (!d.trim()) continue;
    const ci = d.indexOf(':');
    if (ci < 0) { out.push(d.trim()); continue; }
    const prop = d.slice(0, ci).trim();
    const val = d.slice(ci + 1).trim();
    const lp = prop.toLowerCase();
    if (lp === 'inset') {
      const long = expandInset(lowerMath(val));
      if (long) Array.prototype.push.apply(out, long);
      out.push(prop + ':' + val);
      continue;
    }
    if (MATH_RE.test(val)) {
      const fb = lowerMath(val);
      if (lp.indexOf('--') === 0) customFb.push(prop + ':' + fb);
      else if (fb !== val) out.push(prop + ':' + fb);
    }
    out.push(prop + ':' + val);
  }
  let res = sel + '{' + out.join(';') + '}';
  if (customFb.length && !/^\s*(from|to|\d)/i.test(sel)) {
    res += SUPPORTS_NOT + '{' + sel + '{' + customFb.join(';') + '}}';
  }
  return res;
}

function processCss(css) {
  const items = [];
  let start = 0, i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") { i = skipString(css, i); continue; }
    if (c === '(') { i = matchParen(css, i) + 1; continue; }
    if (c === '{') {
      const end = matchBrace(css, i);
      items.push({ pre: css.slice(start, i), body: css.slice(i + 1, end) });
      i = end + 1; start = i; continue;
    }
    if (c === ';') { items.push({ pre: css.slice(start, i + 1), body: null }); i++; start = i; continue; }
    i++;
  }
  if (css.slice(start).trim()) items.push({ pre: css.slice(start), body: null });

  let out = '';
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.body === null) { out += it.pre; continue; }
    const sel = it.pre.trim();
    if (/^@(-\w+-)?keyframes|^@font-face|^@page|^@property|^@counter-style/i.test(sel)) {
      out += sel + '{' + it.body + '}';
      continue;
    }
    if (it.body.indexOf('{') !== -1) {
      // @media, @supports, etc.: contiene reglas dentro.
      out += sel + '{' + processCss(it.body) + '}';
    } else if (sel.charAt(0) === '@') {
      out += sel + '{' + it.body + '}';
    } else {
      out += lowerRule(sel, it.body);
    }
  }
  return out;
}

function lowerCss(css) {
  if (!/(clamp|min|max)\(|inset\s*:/i.test(css)) return css;
  if (cache.has(css)) return cache.get(css);
  let res;
  try {
    res = processCss(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  } catch (e) {
    res = css; // ante cualquier problema se deja el CSS original intacto
  }
  if (cache.size > 200) cache.clear();
  cache.set(css, res);
  return res;
}

// Aplica lowerCss a cada <style>...</style> del HTML. No toca <script> ni atributos style="".
function lowerHtml(html) {
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, function (m, a, css, b) {
    return a + lowerCss(css) + b;
  });
}

module.exports = { lowerHtml: lowerHtml, lowerCss: lowerCss, lowerMath: lowerMath };
