// PrefixCalc natural-display core: expression tree, cursor editing, exact evaluation, result forms.
// No DOM code. Works in the browser (window.NAT) and in Node (module.exports).
//
// Tree model
//   row      = array of items
//   symbol   = { t: 's', v: '7' }   digits, '.', '+', '−', '×', '÷', '(', ')', '!', '%', 'π', 'e', 'Ans', 'A'…'Y', 'nCr', 'nPr', 'Ran#'
//   function = { t: 'f', v: 'sin' } shown as "sin(", acts as an opening parenthesis
//   template = { t: 'frac'|'pow'|'sqrt'|'root'|'logb'|'abs'|'x10', a: [row, …] }  (slots)
// Cursor = { path, i }: path is a list of [itemIndex, slotIndex] steps from the root row; i is the
// position inside that row (0 … row.length).
(function (root) {
  'use strict';

  var SLOTS = { frac: 2, pow: 1, sqrt: 1, root: 2, logb: 2, abs: 1, x10: 1 };
  var FUNCS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'log', 'ln'];
  var VARS = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];

  function sym(v) { return { t: 's', v: v }; }
  function fn(v) { return { t: 'f', v: v }; }
  function tpl(t, slots) {
    var a = [];
    for (var k = 0; k < SLOTS[t]; k++) a.push(slots && slots[k] ? slots[k] : []);
    return { t: t, a: a };
  }
  function isTpl(it) { return !!it && SLOTS.hasOwnProperty(it.t); }
  function isDigit(it) { return !!it && it.t === 's' && /^[0-9.]$/.test(it.v); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // ---------------------------------------------------------------- editor
  function Editor(tree) { this.root = tree ? clone(tree) : []; this.path = []; this.i = this.root.length; }
  var E = Editor.prototype;

  E.rowAt = function (path) {
    var r = this.root;
    for (var k = 0; k < path.length; k++) r = r[path[k][0]].a[path[k][1]];
    return r;
  };
  E.row = function () { return this.rowAt(this.path); };
  E.isEmpty = function () { return this.root.length === 0; };
  E.clear = function () { this.root = []; this.path = []; this.i = 0; };
  E.load = function (tree) { this.root = clone(tree); this.path = []; this.i = this.root.length; };
  E.setCursor = function (path, i) { this.path = path.map(function (s) { return s.slice(); }); this.i = i; };
  E.toEnd = function () { this.path = []; this.i = this.root.length; };

  E.insertItems = function (items) {
    var r = this.row();
    Array.prototype.splice.apply(r, [this.i, 0].concat(items));
    this.i += items.length;
  };
  E.insert = function (v) { this.insertItems([sym(v)]); };
  E.insertFunc = function (name) { this.insertItems([fn(name)]); };
  E.enterSlot = function (itemIndex, slot, atEnd) {
    this.path.push([itemIndex, slot]);
    this.i = atEnd ? this.row().length : 0;
  };

  // Start index of the operand that ends right before position i in row r (i if there is none).
  function operandStart(r, i) {
    var j = i;
    while (j > 0 && (r[j - 1].t === 'pow' || (r[j - 1].t === 's' && (r[j - 1].v === '!' || r[j - 1].v === '%')))) j--;
    if (j === 0) return j === i ? i : j;
    var it = r[j - 1];
    if (isDigit(it)) { while (j > 0 && isDigit(r[j - 1])) j--; return j; }
    if (it.t === 's' && it.v === ')') {
      var depth = 0;
      for (var k = j - 1; k >= 0; k--) {
        var x = r[k];
        if (x.t === 's' && x.v === ')') depth++;
        else if (x.t === 'f' || (x.t === 's' && x.v === '(')) { depth--; if (depth === 0) return k; }
      }
      return 0;
    }
    if (it.t === 's' && (it.v === 'π' || it.v === 'e' || it.v === 'Ans' || it.v === 'Ran#' || VARS.indexOf(it.v) >= 0)) return j - 1;
    if (isTpl(it) && it.t !== 'x10') return j - 1;
    return i === j ? i : j; // only postfix items before: not an operand
  }

  // Insert a template. Fraction takes the operand before the cursor as numerator; powers attach after it.
  // `fill` pre-fills slots (x² → pow with "2", ³√ → root with index "3").
  E.insertTemplate = function (t, fill) {
    var r = this.row(), node = tpl(t, fill ? clone(fill) : null);
    if (t === 'frac') {
      var s = operandStart(r, this.i);
      if (s < this.i) {
        node.a[0] = r.splice(s, this.i - s);
        r.splice(s, 0, node);
        this.i = s;
        this.enterSlot(s, 1, false);
        return;
      }
    }
    r.splice(this.i, 0, node);
    var at = this.i;
    var first = -1;
    for (var k = 0; k < node.a.length; k++) if (!node.a[k].length) { first = k; break; }
    if (first < 0) { this.i = at + 1; return; } // fully filled (x², x⁻¹): cursor after it
    this.i = at;
    this.enterSlot(at, first, false);
  };

  E.left = function () {
    var r = this.row();
    if (this.i > 0) {
      var it = r[this.i - 1];
      if (isTpl(it)) { this.enterSlot(this.i - 1, it.a.length - 1, true); return; }
      this.i--; return;
    }
    if (!this.path.length) return;
    var step = this.path[this.path.length - 1];
    if (step[1] > 0) { this.path[this.path.length - 1] = [step[0], step[1] - 1]; this.i = this.row().length; return; }
    this.path.pop(); this.i = step[0];
  };
  E.right = function () {
    var r = this.row();
    if (this.i < r.length) {
      var it = r[this.i];
      if (isTpl(it)) { this.enterSlot(this.i, 0, false); return; }
      this.i++; return;
    }
    if (!this.path.length) return;
    var step = this.path[this.path.length - 1];
    this.path.pop();
    var parent = this.row()[step[0]];
    if (step[1] < parent.a.length - 1) { this.path.push([step[0], step[1] + 1]); this.i = 0; return; }
    this.i = step[0] + 1;
  };
  // ▲ ▼: between numerator and denominator, into / out of an exponent.
  E.vertical = function (dir) {
    for (var k = this.path.length - 1; k >= 0; k--) {
      var step = this.path[k], parent = this.rowAt(this.path.slice(0, k))[step[0]];
      if (parent.t === 'frac' && ((dir < 0 && step[1] === 1) || (dir > 0 && step[1] === 0))) {
        var target = step[1] === 1 ? 0 : 1;
        this.path = this.path.slice(0, k).concat([[step[0], target]]);
        this.i = Math.min(this.i, this.row().length);
        if (k < this.path.length - 1) this.i = this.row().length;
        return true;
      }
      if ((parent.t === 'pow' || parent.t === 'x10') && dir > 0) { this.path = this.path.slice(0, k); this.i = step[0] + 1; return true; }
    }
    var r = this.row();
    if (dir < 0) {
      if (r[this.i] && (r[this.i].t === 'pow' || r[this.i].t === 'x10')) { this.enterSlot(this.i, 0, false); return true; }
      if (this.i > 0 && (r[this.i - 1].t === 'pow' || r[this.i - 1].t === 'x10')) { this.enterSlot(this.i - 1, 0, true); return true; }
      if (r[this.i] && r[this.i].t === 'frac') { this.enterSlot(this.i, 0, false); return true; }
      if (this.i > 0 && r[this.i - 1].t === 'frac') { this.enterSlot(this.i - 1, 0, true); return true; }
    } else {
      if (r[this.i] && r[this.i].t === 'frac') { this.enterSlot(this.i, 1, false); return true; }
      if (this.i > 0 && r[this.i - 1].t === 'frac') { this.enterSlot(this.i - 1, 1, true); return true; }
    }
    return false;
  };

  E.backspace = function () {
    var r = this.row();
    if (this.i > 0) {
      var it = r[this.i - 1];
      if (isTpl(it)) {
        var empty = it.a.every(function (s) { return !s.length; });
        if (empty) { r.splice(this.i - 1, 1); this.i--; return; }
        this.enterSlot(this.i - 1, it.a.length - 1, true); return;
      }
      r.splice(this.i - 1, 1); this.i--; return;
    }
    if (!this.path.length) return;
    // at the start of a slot: remove the template, keep the contents of its slots
    var step = this.path.pop(), pr = this.row(), node = pr[step[0]];
    var before = 0, items = [];
    for (var k = 0; k < node.a.length; k++) { if (k === step[1]) before = items.length; items = items.concat(node.a[k]); }
    Array.prototype.splice.apply(pr, [step[0], 1].concat(items));
    this.i = step[0] + before;
  };

  // Plain-text form (history labels, copy): 1/3 → (1)/(3) style kept short.
  function toText(row) {
    var out = '';
    row.forEach(function (it) {
      if (it.t === 's') out += it.v === 'nCr' ? 'C' : it.v === 'nPr' ? 'P' : it.v;
      else if (it.t === 'f') out += fnLabel(it.v) + '(';
      else if (it.t === 'frac') out += wrap(it.a[0]) + '/' + wrap(it.a[1]);
      else if (it.t === 'pow') out += '^' + wrap(it.a[0]);
      else if (it.t === 'sqrt') out += '√' + wrap(it.a[0]);
      else if (it.t === 'root') out += wrap(it.a[0]) + '√' + wrap(it.a[1]);
      else if (it.t === 'logb') out += 'log_' + wrap(it.a[0]) + '(' + toText(it.a[1]) + ')';
      else if (it.t === 'abs') out += '|' + toText(it.a[0]) + '|';
      else if (it.t === 'x10') out += '×10^' + wrap(it.a[0]);
    });
    return out;
  }
  function wrap(row) {
    var s = toText(row);
    return row.length <= 1 || /^[0-9.]+$/.test(s) ? s : '(' + s + ')';
  }
  function fnLabel(v) { return v.charAt(0) === 'a' && v !== 'abs' ? v.slice(1) + '⁻¹' : v; }

  // ---------------------------------------------------------------- values
  // exact: { n: BigInt, d: BigInt } (d > 0, reduced); approximate: { f: Number }. Flags: sq (came through a
  // square root), pi (through π) – they allow showing a√b/c and aπ/c forms.
  var MAX_DIGITS = 30;
  function CalcError(code, message) { this.code = code; this.message = message; }
  CalcError.prototype = Object.create(Error.prototype);
  function err(code, msg) { return new CalcError(code, msg); }
  var MSG = { div0: "Can't divide by 0", domain: "Outside the function's domain", syntax: 'Syntax error', incomplete: 'Incomplete', range: 'Too large' };
  function fail(code) { throw err(code, MSG[code]); }

  function babs(x) { return x < 0n ? -x : x; }
  function gcd(a, b) { a = babs(a); b = babs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function digits(x) { return babs(x).toString().length; }
  function exact(n, d, fl) {
    if (d === undefined) d = 1n;
    if (d === 0n) fail('div0');
    if (d < 0n) { n = -n; d = -d; }
    var g = gcd(n, d) || 1n;
    n /= g; d /= g;
    if (digits(n) > MAX_DIGITS || digits(d) > MAX_DIGITS) return flt(bigDiv(n, d), fl);
    return { n: n, d: d, sq: !!(fl && fl.sq), pi: !!(fl && fl.pi) };
  }
  function bigDiv(n, d) {
    // float of a big fraction without overflow: scale by powers of ten
    var ln = digits(n), ld = digits(d);
    if (ln < 300 && ld < 300) return Number(n) / Number(d);
    var shift = Math.max(0, ln - 17), shiftD = Math.max(0, ld - 17);
    return Number(n / (10n ** BigInt(shift))) / Number(d / (10n ** BigInt(shiftD))) * Math.pow(10, shift - shiftD);
  }
  function flt(x, fl) {
    if (!isFinite(x)) fail(isNaN(x) ? 'domain' : 'range');
    return { f: x, sq: !!(fl && fl.sq), pi: !!(fl && fl.pi) };
  }
  function isExact(v) { return v.n !== undefined; }
  function toNum(v) { return isExact(v) ? bigDiv(v.n, v.d) : v.f; }
  function flags(a, b) { return { sq: a.sq || (b && b.sq), pi: a.pi || (b && b.pi) }; }
  function fromInt(k) { return exact(BigInt(k), 1n); }
  function isInt(v) { return isExact(v) ? v.d === 1n : Number.isInteger(v.f); }

  // Float → exact when it is (very nearly) a whole number or a half: snaps sin 30° to 1/2 and 1e-17 to 0.
  function snap(x, fl) {
    var r2 = Math.round(x * 2);
    if (Math.abs(x * 2 - r2) < 1e-12 * Math.max(1, Math.abs(x)) && Math.abs(r2) < 1e15) return exact(BigInt(r2), 2n);
    return flt(x, fl);
  }
  function snapInt(x, fl) {
    var r = Math.round(x);
    if (Math.abs(x - r) < 1e-12 * Math.max(1, Math.abs(x)) && Math.abs(r) < 1e15) return fromInt(r);
    return flt(x, fl);
  }

  function add(a, b) { return isExact(a) && isExact(b) ? exact(a.n * b.d + b.n * a.d, a.d * b.d, flags(a, b)) : flt(toNum(a) + toNum(b), flags(a, b)); }
  function neg(a) { return isExact(a) ? exact(-a.n, a.d, a) : flt(-a.f, a); }
  function sub(a, b) { return add(a, neg(b)); }
  function mul(a, b) { return isExact(a) && isExact(b) ? exact(a.n * b.n, a.d * b.d, flags(a, b)) : flt(toNum(a) * toNum(b), flags(a, b)); }
  function inv(a) {
    if (isExact(a)) { if (a.n === 0n) fail('div0'); return exact(a.d, a.n, a); }
    if (a.f === 0) fail('div0');
    return flt(1 / a.f, a);
  }
  function div(a, b) { return mul(a, inv(b)); }

  // Integer k-th root of a non-negative BigInt, or null when it is not a perfect power.
  function iroot(x, k) {
    if (x < 0n) return null;
    if (x < 2n) return x;
    var guess = BigInt(Math.round(Math.pow(Number(x), 1 / k)));
    for (var c = guess - 2n; c <= guess + 2n; c++) if (c >= 0n && c ** BigInt(k) === x) return c;
    return null;
  }
  function rootExact(a, k) {
    // exact k-th root of an exact value when numerator and denominator are perfect powers
    if (!isExact(a) || digits(a.n) > 15 || digits(a.d) > 15) return null;
    var sign = a.n < 0n ? -1n : 1n;
    if (sign < 0n && k % 2 === 0) return null;
    var n = iroot(babs(a.n), k), d = iroot(a.d, k);
    return n === null || d === null ? null : exact(sign * n, d, a);
  }
  function sqrt(a) {
    if (toNum(a) < 0) fail('domain');
    var r = rootExact(a, 2);
    return r || flt(Math.sqrt(toNum(a)), { sq: true, pi: a.pi });
  }
  function nroot(a, k) {
    if (!isInt(k)) return power(a, inv(k));
    var kk = Number(isExact(k) ? k.n : k.f);
    if (kk === 0) fail('domain');
    if (kk < 0) return inv(nroot(a, fromInt(-kk)));
    var x = toNum(a);
    if (x < 0 && kk % 2 === 0) fail('domain');
    var r = rootExact(a, kk);
    if (r) return r;
    var v = x < 0 ? -Math.pow(-x, 1 / kk) : Math.pow(x, 1 / kk);
    return flt(v, { sq: kk === 2, pi: a.pi });
  }
  function power(a, b) {
    if (isExact(b) && b.d === 1n && isExact(a)) {
      var e = b.n;
      if (a.n === 0n && e < 0n) fail('div0');
      if (babs(e) * BigInt(Math.max(digits(a.n), digits(a.d))) <= 60n) {
        var pe = babs(e), r = exact(a.n ** pe, a.d ** pe, a);
        return e < 0n ? inv(r) : r;
      }
    }
    if (isExact(b) && isExact(a) && b.d <= 12n) {
      var rt = rootExact(a, Number(b.d));
      if (rt) return power(rt, exact(b.n, 1n));
      if (b.d === 2n && toNum(a) > 0) return flt(Math.pow(toNum(a), toNum(b)), { sq: true, pi: a.pi });
    }
    var x = toNum(a), y = toNum(b);
    if (x === 0 && y < 0) fail('div0');
    if (x < 0 && !Number.isInteger(y)) {
      // odd root of a negative number: (−8)^(1/3) = −2
      if (isExact(b) && b.d % 2n === 1n) { var m = Math.pow(-x, y); return flt(b.n % 2n === 0n ? m : -m); }
      fail('domain');
    }
    return flt(Math.pow(x, y), flags(a, b));
  }
  function factorial(a) {
    if (!isInt(a) || toNum(a) < 0) fail('domain');
    var n = Number(isExact(a) ? a.n : a.f);
    if (n > 170) fail('range');
    var r = 1n;
    for (var k = 2n; k <= BigInt(n); k++) r *= k;
    return exact(r, 1n);
  }
  function combin(a, b, perm) {
    if (!isInt(a) || !isInt(b)) fail('domain');
    var n = BigInt(Math.round(toNum(a))), r = BigInt(Math.round(toNum(b)));
    if (n < 0n || r < 0n || r > n) fail('domain');
    if (n > 10000n) fail('range');
    var out = 1n;
    for (var k = 0n; k < r; k++) out *= (n - k);
    if (!perm) { var f = 1n; for (var j = 2n; j <= r; j++) f *= j; out /= f; }
    return exact(out, 1n);
  }

  var ANGLE = { deg: Math.PI / 180, rad: 1, gra: Math.PI / 200 };
  function applyFunc(name, v, env) {
    var unit = ANGLE[env.angle || 'deg'], x = toNum(v);
    switch (name) {
      case 'sin': return snap(Math.sin(x * unit), { sq: true });
      case 'cos': return snap(Math.cos(x * unit), { sq: true });
      case 'tan': {
        var s = snap(Math.sin(x * unit), { sq: true }), c = snap(Math.cos(x * unit), { sq: true });
        if (toNum(c) === 0) fail('div0');
        var t = div(s, c);
        return isExact(t) ? t : snapInt(toNum(t), { sq: true });
      }
      case 'asin': case 'acos': {
        if (x < -1 || x > 1) fail('domain');
        var a = (name === 'asin' ? Math.asin(x) : Math.acos(x)) / unit;
        return env.angle === 'rad' ? flt(a, { pi: true }) : snapInt(a);
      }
      case 'atan': { var at = Math.atan(x) / unit; return env.angle === 'rad' ? flt(at, { pi: true }) : snapInt(at); }
      case 'sinh': return snapInt(Math.sinh(x));
      case 'cosh': return snapInt(Math.cosh(x));
      case 'tanh': return snapInt(Math.tanh(x));
      case 'asinh': return snapInt(Math.asinh(x));
      case 'acosh': if (x < 1) fail('domain'); return snapInt(Math.acosh(x));
      case 'atanh': if (x <= -1 || x >= 1) fail('domain'); return snapInt(Math.atanh(x));
      case 'log': if (x <= 0) fail('domain'); return log10Exact(v) || snapInt(Math.log10(x));
      case 'ln': if (x <= 0) fail('domain'); return snapInt(Math.log(x));
    }
    fail('syntax');
  }
  function log10Exact(v) {
    if (!isExact(v) || v.n <= 0n) return null;
    var s = v.d === 1n ? v.n.toString() : v.n === 1n ? v.d.toString() : null;
    if (!s || !/^10*$/.test(s)) return null;
    return fromInt(v.d === 1n ? s.length - 1 : -(s.length - 1));
  }

  // ---------------------------------------------------------------- evaluation
  // Precedence (strong → weak): templates/() · postfix (^ ! % ×10ˣ) · functions · implicit × · nCr nPr ·
  // unary minus · × ÷ · + −
  function evaluate(rowIn, env) {
    env = env || {};
    var toks = lex(rowIn), p = 0;
    if (!toks.length) fail('incomplete');
    function peek() { return toks[p]; }
    function isOp(v) { var t = toks[p]; return t && t.k === 'op' && t.v === v; }
    function startsAtom() {
      var t = toks[p];
      return t && (t.k === 'num' || t.k === 'atom' || t.k === 'name' || t.k === 'func' || (t.k === 'op' && t.v === '('));
    }

    function expr() {
      var v = term();
      while (isOp('+') || isOp('−')) { var o = toks[p++].v, r = term(); v = o === '+' ? add(v, r) : sub(v, r); }
      return v;
    }
    function term() {
      var v = unary();
      while (isOp('×') || isOp('÷')) { var o = toks[p++].v, r = unary(); v = o === '×' ? mul(v, r) : div(v, r); }
      return v;
    }
    function unary() {
      if (isOp('−')) { p++; return neg(unary()); }
      if (isOp('+')) { p++; return unary(); }
      return comb();
    }
    function comb() {
      var v = implicit();
      while (isOp('nCr') || isOp('nPr')) { var o = toks[p++].v, r = implicit(); v = combin(v, r, o === 'nPr'); }
      return v;
    }
    function implicit() {
      var v = funcs();
      while (startsAtom()) v = mul(v, funcs());
      return v;
    }
    function funcs() {
      var t = peek();
      if (t && t.k === 'func') {
        p++;
        if (p >= toks.length) fail('incomplete');
        var inner = expr();
        if (isOp(')')) p++; else if (p < toks.length) fail('syntax');
        return postfix(applyFunc(t.v, inner, env));
      }
      return postfix(primary());
    }
    function postfix(v) {
      for (;;) {
        var t = peek();
        if (!t) return v;
        if (t.k === 'pow') { p++; v = power(v, slot(t.node.a[0])); continue; }
        if (t.k === 'x10') { p++; v = mul(v, power(fromInt(10), slot(t.node.a[0]))); continue; }
        if (t.k === 'op' && t.v === '!') { p++; v = factorial(v); continue; }
        if (t.k === 'op' && t.v === '%') { p++; v = div(v, fromInt(100)); continue; }
        return v;
      }
    }
    function primary() {
      var t = peek();
      if (!t) fail('incomplete');
      if (t.k === 'num') { p++; return parseNum(t.v); }
      if (t.k === 'name') { p++; return nameValue(t.v, env); }
      if (t.k === 'atom') { p++; return templateValue(t.node, env); }
      if (t.k === 'x10') { p++; return power(fromInt(10), slot(t.node.a[0])); } // ×10ˣ with no mantissa = 10ˣ
      if (t.k === 'pow') fail('incomplete');
      if (t.k === 'op' && t.v === '(') {
        p++;
        if (p >= toks.length) fail('incomplete');
        if (isOp(')')) fail('syntax');
        var v = expr();
        if (isOp(')')) p++; else if (p < toks.length) fail('syntax');
        return v;
      }
      if (t.k === 'op' && (t.v === '×' || t.v === '÷' || t.v === '+' || t.v === '!' || t.v === '%' || t.v === 'nCr' || t.v === 'nPr' || t.v === ')')) fail('syntax');
      fail('syntax');
    }
    function slot(row) { return evaluate(row, env); }

    var v = expr();
    if (p < toks.length) fail(isOp(')') ? 'syntax' : 'syntax');
    return v;
  }

  function lex(row) {
    var out = [], k = 0;
    while (k < row.length) {
      var it = row[k];
      if (isDigit(it)) {
        var s = '';
        while (k < row.length && isDigit(row[k])) s += row[k++].v;
        out.push({ k: 'num', v: s });
        continue;
      }
      if (it.t === 'f') out.push({ k: 'func', v: it.v });
      else if (it.t === 'pow') out.push({ k: 'pow', node: it });
      else if (it.t === 'x10') out.push({ k: 'x10', node: it });
      else if (isTpl(it)) out.push({ k: 'atom', node: it });
      else if (it.v === 'π' || it.v === 'e' || it.v === 'Ans' || it.v === 'Ran#' || VARS.indexOf(it.v) >= 0) out.push({ k: 'name', v: it.v });
      else out.push({ k: 'op', v: it.v });
      k++;
    }
    return out;
  }

  function parseNum(s) {
    if ((s.match(/\./g) || []).length > 1 || s === '.') fail('syntax');
    var parts = s.split('.'), ip = parts[0] || '0', fp = parts[1] || '';
    return exact(BigInt(ip + fp), 10n ** BigInt(fp.length));
  }
  function nameValue(v, env) {
    if (v === 'π') return flt(Math.PI, { pi: true });
    if (v === 'e') return flt(Math.E);
    if (v === 'Ran#') return exact(BigInt(Math.floor(Math.random() * 1000)), 1000n);
    var stored = v === 'Ans' ? env.ans : env.vars && env.vars[v];
    return stored ? revive(stored) : fromInt(0);
  }
  function templateValue(node, env) {
    var a = node.a.map(function (row) { return evaluate(row, env); });
    switch (node.t) {
      case 'frac': return div(a[0], a[1]);
      case 'sqrt': return sqrt(a[0]);
      case 'root': return nroot(a[1], a[0]);
      case 'abs': return toNum(a[0]) < 0 ? neg(a[0]) : a[0];
      case 'logb': {
        var b = toNum(a[0]), x = toNum(a[1]);
        if (b <= 0 || b === 1 || x <= 0) fail('domain');
        return snapInt(Math.log(x) / Math.log(b));
      }
    }
    fail('syntax');
  }

  // Values in storage (localStorage) as plain JSON.
  function freeze(v) { return isExact(v) ? { n: v.n.toString(), d: v.d.toString(), sq: v.sq, pi: v.pi } : { f: v.f, sq: v.sq, pi: v.pi }; }
  function revive(o) { return o.n !== undefined ? exact(BigInt(o.n), BigInt(o.d), o) : flt(o.f, o); }

  // ---------------------------------------------------------------- result forms
  // Results are returned as rows of the same tree model, so the display draws them like the input.
  function digitsRow(str) { return str.split('').map(function (c) { return sym(c === '-' ? '−' : c); }); }

  // Decimal with up to `sig` significant digits; scientific (mantissa ×10ⁿ) outside 1e-9 … 1e10.
  function decimalRow(x, sig) {
    sig = sig || 10;
    if (x === 0) return [sym('0')];
    var ax = Math.abs(x);
    var r = Number(x.toPrecision(sig));
    if (Math.abs(r) >= 1e10 || ax < 1e-9) {
      var e = Math.floor(Math.log10(Math.abs(r))), m = Number((r / Math.pow(10, e)).toPrecision(sig));
      if (Math.abs(m) >= 10) { m /= 10; e += 1; }
      return digitsRow(trim(m.toPrecision(sig))).concat([tpl('x10', [digitsRow(String(e))])]);
    }
    var mag = Math.floor(Math.log10(Math.abs(r)));
    return digitsRow(trim(r.toFixed(Math.max(0, Math.min(20, sig - 1 - mag)))));
  }
  function trim(s) { return s.indexOf('.') >= 0 && s.indexOf('e') < 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }

  // Best rational p/q ≈ x with q ≤ maxQ (continued fractions).
  function rational(x, maxQ) {
    var h0 = 1, h1 = 0, k0 = 0, k1 = 1, b = x;
    for (var it = 0; it < 40; it++) {
      var a = Math.floor(b), h = a * h0 + h1, k = a * k0 + k1;
      if (k > maxQ) break;
      h1 = h0; h0 = h; k1 = k0; k0 = k;
      if (Math.abs(b - a) < 1e-15) break;
      b = 1 / (b - a);
    }
    return { p: h0, q: k0 };
  }
  function close(a, b) { return Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(b)); }

  function fracRow(n, d, sign) {
    var num = digitsRow(n.toString()), den = digitsRow(d.toString());
    var f = tpl('frac', [num, den]);
    return sign < 0 ? [sym('−'), f] : [f];
  }
  // Square-free split: k = a²·b
  function splitSquare(k) {
    var a = 1, b = k;
    for (var f = 2; f * f <= b; f++) while (b % (f * f) === 0) { b /= f * f; a *= f; }
    return { a: a, b: b };
  }
  function surdForm(x) {
    if (x === 0) return null;
    var y = x * x, r = rational(y, 100000);
    if (!r.q || !close(r.p / r.q, y)) return null;
    // √(p/q) = √(p·q)/q
    var s = splitSquare(r.p * r.q), num = s.a, den = r.q, b = s.b;
    if (b === 1 || b > 1000) return null;
    var g = gcdN(num, den); num /= g; den /= g;
    if (den > 1000 || num > 1000) return null;
    var top = (num === 1 ? [] : digitsRow(String(num))).concat([tpl('sqrt', [digitsRow(String(b))])]);
    var body = den === 1 ? top : [tpl('frac', [top, digitsRow(String(den))])];
    return x < 0 ? [sym('−')].concat(body) : body;
  }
  function piForm(x) {
    var y = x / Math.PI, r = rational(Math.abs(y), 1000);
    if (!r.q || !r.p || !close(r.p / r.q, Math.abs(y)) || r.p > 10000) return null;
    var top = (r.p === 1 ? [] : digitsRow(String(r.p))).concat([sym('π')]);
    var body = r.q === 1 ? top : [tpl('frac', [top, digitsRow(String(r.q))])];
    return y < 0 ? [sym('−')].concat(body) : body;
  }
  function gcdN(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }

  // Display forms of a value: { exact: row|null, decimal: row }. `exact` is null when the decimal is the only form.
  function forms(v, opts) {
    opts = opts || {};
    var x = toNum(v), dec = decimalRow(x, opts.sig || 10), ex = null;
    if (isExact(v)) {
      if (v.d !== 1n && digits(v.n) <= 10 && digits(v.d) <= 10) {
        var sign = v.n < 0n ? -1 : 1, n = babs(v.n);
        if (opts.mixed && n > v.d) {
          var whole = n / v.d, rest = n % v.d;
          ex = (sign < 0 ? [sym('−')] : []).concat(digitsRow(whole.toString()), [tpl('frac', [digitsRow(rest.toString()), digitsRow(v.d.toString())])]);
        } else ex = fracRow(n, v.d, sign);
      }
    } else {
      if (v.sq) ex = surdForm(x);
      if (!ex && v.pi) ex = piForm(x);
    }
    return { exact: ex, decimal: dec };
  }

  // Engineering notation: exponent a multiple of 3, stepped by `shift` (ENG / ←ENG).
  var SI_SYM = { '-15': 'f', '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', '0': '', '3': 'k', '6': 'M', '9': 'G', '12': 'T' };
  function eng(x, shift, sig) {
    sig = sig || 10;
    var e3 = 0;
    if (x !== 0) e3 = Math.floor(Math.floor(Math.log10(Math.abs(Number(x.toPrecision(sig))))) / 3) * 3;
    e3 += 3 * (shift || 0);
    var m = Number((x / Math.pow(10, e3)).toPrecision(sig));
    var row = digitsRow(trim(m.toFixed(Math.min(20, Math.max(0, sig - 1 - (m === 0 ? 0 : Math.floor(Math.log10(Math.abs(m)))))))));
    if (e3 !== 0) row = row.concat([tpl('x10', [digitsRow(String(e3))])]);
    return { row: row, exp: e3, prefix: SI_SYM.hasOwnProperty(String(e3)) ? SI_SYM[String(e3)] : null };
  }

  function rowToString(row) {
    // flat text of a result row (for copy): fractions as a/b, √ as sqrt
    return toText(row).replace(/−/g, '-');
  }

  var api = {
    Editor: Editor, sym: sym, fn: fn, tpl: tpl, isTpl: isTpl, SLOTS: SLOTS, FUNCS: FUNCS, VARS: VARS,
    evaluate: evaluate, forms: forms, eng: eng, decimalRow: decimalRow, toNum: toNum, isExact: isExact,
    freeze: freeze, revive: revive, toText: toText, rowToString: rowToString, fnLabel: fnLabel,
    add: add, sub: sub, CalcError: CalcError, MSG: MSG, operandStart: operandStart
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NAT = api;
})(this);
