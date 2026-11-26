// PrefixCalc core: parser/evaluator for SI-prefix expressions + engineering formatting + E-series.
// Works in the browser (window.SI) and in Node (module.exports).
(function (root) {
  'use strict';

  // Case-sensitive: m = milli, M = mega. u, µ, μ = micro. R/r = RKM decimal mark (×1).
  var PREFIX = { f: -15, p: -12, n: -9, u: -6, 'µ': -6, 'μ': -6, m: -3, k: 3, K: 3, M: 6, G: 9, T: 12 };
  var RKM = { R: 0, r: 0 };
  var SYM = { '-15': 'f', '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', '0': '', '3': 'k', '6': 'M', '9': 'G', '12': 'T' };
  var MIN_E3 = -15, MAX_E3 = 12;

  function CalcError(code, msg, pos) { this.code = code; this.message = msg; this.pos = pos; }
  CalcError.prototype = Object.create(Error.prototype);
  function syntax(msg, pos) { return new CalcError('syntax', msg, pos); }

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isLetter(c) { return !!c && /[A-Za-zµμπ]/.test(c); }
  function prefixExp(c) { return PREFIX.hasOwnProperty(c) ? PREFIX[c] : (RKM.hasOwnProperty(c) ? 0 : null); }

  function normalize(src) {
    return String(src)
      .replace(/[×∙⋅·]/g, '*').replace(/÷/g, '/')
      .replace(/[−–]/g, '-').replace(/∥/g, '||').replace(/,/g, '.');
  }

  function tokenize(src) {
    var s = normalize(src), t = [], i = 0, n = s.length;
    while (i < n) {
      var c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '|') {
        if (s[i + 1] !== '|') throw syntax('Ожидалось «||»', i);
        t.push({ type: 'op', v: '||', pos: i }); i += 2; continue;
      }
      if ('+-*/^()'.indexOf(c) >= 0) { t.push({ type: 'op', v: c, pos: i }); i++; continue; }
      if (c === '√') { t.push({ type: 'op', v: '√', pos: i }); i++; continue; }
      if (s.substr(i, 4) === 'sqrt') { t.push({ type: 'op', v: '√', pos: i }); i += 4; continue; }
      if (c === 'π') { t.push({ type: 'num', v: Math.PI, pos: i }); i++; continue; }
      if (s.substr(i, 2) === 'pi' && !isLetter(s[i + 2])) { t.push({ type: 'num', v: Math.PI, pos: i }); i += 2; continue; }
      if (isDigit(c) || c === '.') { i = readNumber(s, i, t); continue; }
      if (prefixExp(c) !== null) throw syntax('Приставка «' + c + '» без числа', i);
      throw syntax('Неизвестный символ «' + c + '»', i);
    }
    return t;
  }

  function readNumber(s, i, t) {
    var start = i, n = s.length, num = '', exp = 0, rkm = false;
    while (i < n && isDigit(s[i])) num += s[i++];
    if (s[i] === '.') {
      num += s[i++];
      while (i < n && isDigit(s[i])) num += s[i++];
    } else if (num && prefixExp(s[i]) !== null && isDigit(s[i + 1])) {
      // RKM code: 4k7 = 4.7k, 2u2 = 2.2µ, 4R7 = 4.7
      exp = prefixExp(s[i++]); rkm = true; num += '.';
      while (i < n && isDigit(s[i])) num += s[i++];
    }
    if (num === '.' || num === '') throw syntax('Неверное число', start);
    if ((num.match(/\./g) || []).length > 1 || s[i] === '.') throw syntax('Лишняя точка', i);
    // Scientific exponent, lowercase e only: 1e3, 2.5e-6
    if (!rkm && s[i] === 'e' && (isDigit(s[i + 1]) || (/[+-]/.test(s[i + 1] || '') && isDigit(s[i + 2])))) {
      num += s[i++]; if (/[+-]/.test(s[i])) num += s[i++];
      while (i < n && isDigit(s[i])) num += s[i++];
    }
    if (!rkm) {
      // optional prefix, glued or after spaces: "10n", "10 n"; but "2 pi" / "2π" is implicit multiplication
      var j = i; while (s[j] === ' ') j++;
      var isPi = s[j] === 'π' || (s.substr(j, 2) === 'pi' && !isLetter(s[j + 2]));
      if (!isPi && prefixExp(s[j]) !== null) { exp = prefixExp(s[j]); i = j + 1; }
    }
    if (prefixExp(s[i]) !== null && !(s.substr(i, 2) === 'pi' && !isLetter(s[i + 2]))) throw syntax('Две приставки подряд', i);
    if (isLetter(s[i]) && s[i] !== 'π' && s.substr(i, 2) !== 'pi' && s.substr(i, 4) !== 'sqrt') throw syntax('Неизвестная приставка «' + s[i] + '»', i);
    t.push({ type: 'num', v: parseFloat(num) * Math.pow(10, exp), pos: start });
    return i;
  }

  // Precedence (low → high), as in FRS 2.3:  + -  <  × ÷ (and implicit ×)  <  ||  <  ^  <  unary (−, √)  <  ( ) / literals
  function evaluate(src) {
    var t = tokenize(src), p = 0;
    if (!t.length) throw new CalcError('empty', 'Пустое выражение', 0);
    function at(v) { var k = t[p]; return k && k.type === 'op' && k.v === v; }
    function startsOperand() { var k = t[p]; return k && (k.type === 'num' || k.v === '(' || k.v === '√'); }

    function expr() {
      var v = term();
      while (at('+') || at('-')) { var o = t[p++].v, r = term(); v = o === '+' ? v + r : v - r; }
      return v;
    }
    function term() {
      var v = par();
      for (;;) {
        if (at('*') || at('/')) {
          var tok = t[p++], r = par();
          if (tok.v === '/' && r === 0) throw new CalcError('div0', 'Деление на 0', tok.pos);
          v = tok.v === '*' ? v * r : v / r;
        } else if (startsOperand()) {
          v = v * par(); // implicit: 2(3+4), 2π, 2√4
        } else return v;
      }
    }
    function par() {
      var v = pow();
      while (at('||')) {
        var tok = t[p++], r = pow();
        if (v === 0 || r === 0) { v = 0; continue; }
        if (v + r === 0) throw new CalcError('div0', 'Деление на 0 в ||', tok.pos);
        v = v * r / (v + r);
      }
      return v;
    }
    function pow() {
      var b = unary();
      if (at('^')) { p++; return Math.pow(b, pow()); }
      return b;
    }
    function unary() {
      if (at('-')) { p++; return -unary(); }
      if (at('+')) { p++; return unary(); }
      if (at('√')) {
        var tok = t[p++], v = unary();
        if (v < 0) throw new CalcError('domain', 'Корень из отрицательного', tok.pos);
        return Math.sqrt(v);
      }
      return primary();
    }
    function primary() {
      var k = t[p];
      if (!k) throw new CalcError('incomplete', 'Выражение не закончено', normalize(src).length);
      if (k.type === 'num') { p++; return k.v; }
      if (k.v === '(') {
        p++;
        if (at(')')) throw syntax('Пустые скобки', t[p].pos);
        var v = expr();
        if (at(')')) p++;
        else if (p < t.length) throw syntax('Ожидалась «)»', t[p].pos);
        // unclosed "(" at the very end is tolerated for live preview
        return v;
      }
      throw syntax('Неожиданный «' + k.v + '»', k.pos);
    }

    var v = expr();
    if (p < t.length) throw syntax(at(')') ? 'Лишняя «)»' : 'Неожиданный «' + t[p].v + '»', t[p].pos);
    if (!isFinite(v) || isNaN(v)) throw new CalcError('range', 'Вне диапазона', 0);
    return v;
  }

  // ---------- formatting ----------
  function trimZeros(str) { return str.indexOf('.') >= 0 ? str.replace(/0+$/, '').replace(/\.$/, '') : str; }

  // Exponent (multiple of 3) that puts the mantissa in [1, 1000) after rounding to `sig` digits.
  function autoExp3(x, sig) {
    if (x === 0) return 0;
    var r = Math.abs(Number(x.toPrecision(sig)));
    var e3 = Math.floor(Math.floor(Math.log10(r)) / 3) * 3;
    return Math.max(MIN_E3, Math.min(MAX_E3, e3));
  }

  // Value expressed with a given prefix exponent, `sig` significant digits, no scientific notation.
  function formatAt(x, e3, sig) {
    sig = sig || 4;
    if (x === 0) return '0' + (SYM[e3] || '');
    var m = Number((x / Math.pow(10, e3)).toPrecision(sig));
    var mag = Math.floor(Math.log10(Math.abs(m)));
    var digits = Math.min(20, Math.max(0, sig - 1 - mag));
    return trimZeros(m.toFixed(digits)) + SYM[e3];
  }

  function format(x, sig) {
    sig = sig || 4;
    if (x === 0) return '0';
    var e3 = autoExp3(x, sig);
    var m = Math.abs(x / Math.pow(10, e3));
    if (m >= 1e6 || m < 1e-3) return sci(x, sig); // beyond f..T
    return formatAt(x, e3, sig);
  }

  function sci(x, sig) {
    if (x === 0) return '0';
    return Number(x.toPrecision(sig || 6)).toExponential().replace('e+', 'e');
  }

  function plain(x, sig) {
    if (x === 0) return '0';
    sig = sig || 10;
    var a = Math.abs(x);
    if (a < 1e-6 || a >= 1e15) return sci(x, sig);
    var r = Number(x.toPrecision(sig));
    var digits = Math.min(20, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(r)))));
    return trimZeros(r.toFixed(digits));
  }

  // FRS 3.3: lower neighbour prefix | plain | scientific
  function alternatives(x, e3, sig) {
    var out = [formatAt(x, e3 - 3, sig), plain(x), sci(x, sig)];
    var seen = {}, main = formatAt(x, e3, sig);
    seen[main] = 1;
    return out.filter(function (s) { if (seen[s]) return false; seen[s] = 1; return true; }).slice(0, 3);
  }

  // ---------- E-series ----------
  var SERIES = {
    E12: [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82],
    E24: [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91],
    E96: [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174,
      178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309,
      316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549,
      562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976]
  };

  // Nearest standard value (in log distance). Returns { value, label, errorPct } where errorPct = (nominal / x − 1)·100.
  function nearestE(x, name) {
    if (!(x > 0) || !isFinite(x)) return null;
    var list = SERIES[name], dec = Math.floor(Math.log10(x)) - (name === 'E96' ? 2 : 1), best = null;
    for (var d = dec - 1; d <= dec + 1; d++) {
      for (var i = 0; i < list.length; i++) {
        var v = Number((list[i] * Math.pow(10, d)).toPrecision(3));
        var dist = Math.abs(Math.log(v / x));
        if (!best || dist < best.dist) best = { value: v, dist: dist };
      }
    }
    return { value: best.value, label: format(best.value, 3), errorPct: (best.value / x - 1) * 100 };
  }

  var api = {
    evaluate: evaluate, tokenize: tokenize, format: format, formatAt: formatAt, autoExp3: autoExp3,
    plain: plain, sci: sci, alternatives: alternatives, nearestE: nearestE, SERIES: SERIES, SYM: SYM,
    MIN_E3: MIN_E3, MAX_E3: MAX_E3, CalcError: CalcError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SI = api;
})(this);
