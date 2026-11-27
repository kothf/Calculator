// PrefixCalc engineering tools: voltage divider, RC/LC, LED resistor, Ohm's law.
// Pure functions on plain numbers (SI units: V, A, Ω, F, H, Hz, s, W). Depends on si.js (SERIES).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./si.js'));
  else root.TOOLS = factory(root.SI);
})(this, function (SI) {
  'use strict';
  var TWO_PI = 2 * Math.PI;

  function ToolError(message) { this.message = message; }
  ToolError.prototype = Object.create(Error.prototype);
  function need(cond, msg) { if (!cond) throw new ToolError(msg); }
  function pos(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  // All values of an E-series between lo and hi (inclusive), ascending.
  function seriesValues(name, lo, hi) {
    var list = SI.SERIES[name], base = name === 'E96' ? 100 : 10, out = [];
    for (var d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)); d++) {
      for (var i = 0; i < list.length; i++) {
        var v = Number((list[i] / base * Math.pow(10, d)).toPrecision(3));
        if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v);
      }
    }
    return out;
  }

  // Smallest standard value >= x (for current-limiting resistors: never exceed the target current).
  function standardAtLeast(x, name) {
    need(pos(x), 'Value must be positive');
    var vals = seriesValues(name, x / 20, x * 20);
    for (var i = 0; i < vals.length; i++) if (vals[i] >= x * (1 - 1e-9)) return vals[i];
    return vals[vals.length - 1];
  }

  // ---------- voltage divider ----------
  // Vout = Vin · R2 / (R1 + R2)
  function divider(vin, r1, r2) {
    need(typeof vin === 'number' && isFinite(vin), 'Enter Vin');
    need(pos(r1) && pos(r2), 'R1 and R2 must be positive');
    var total = r1 + r2, i = vin / total;
    return { vout: vin * r2 / total, ratio: r2 / total, current: i, power: vin * i };
  }

  // Pick R1/R2 from an E-series for a target Vout. Among pairs with R1+R2 between half and twice
  // `totalHint`, minimise the Vout error; ties go to the total closest to the hint.
  function designDivider(vin, vout, name, totalHint) {
    need(pos(vin), 'Vin must be positive');
    need(pos(vout) && vout < vin, 'Vout must be between 0 and Vin');
    totalHint = pos(totalHint) ? totalHint : 10e3;
    var ratio = vout / vin, best = null;
    var r2s = seriesValues(name, totalHint * ratio / 2.5, totalHint * ratio * 2.5);
    for (var i = 0; i < r2s.length; i++) {
      var r2 = r2s[i], ideal = r2 * (1 / ratio - 1);
      var near = SI.nearestE(ideal, name);
      if (!near) continue;
      // check the neighbours of the snapped value too: the best pair is not always the nearest R1
      var cands = seriesValues(name, near.value / 1.15, near.value * 1.15);
      for (var j = 0; j < cands.length; j++) {
        var r1 = cands[j], total = r1 + r2;
        if (total < totalHint / 2 || total > totalHint * 2) continue;
        var actual = vin * r2 / total, err = Math.abs(actual / vout - 1), spread = Math.abs(Math.log(total / totalHint));
        if (!best || err < best.err - 1e-12 || (Math.abs(err - best.err) <= 1e-12 && spread < best.spread)) {
          best = { r1: r1, r2: r2, vout: actual, err: err, spread: spread };
        }
      }
    }
    need(best, 'No standard pair found');
    return { r1: best.r1, r2: best.r2, vout: best.vout, errorPct: (best.vout / vout - 1) * 100, current: vin / (best.r1 + best.r2) };
  }

  // ---------- RC / LC ----------
  function rc(r, c) {
    need(pos(r) && pos(c), 'R and C must be positive');
    return { tau: r * c, fc: 1 / (TWO_PI * r * c) };
  }
  function lcResonance(l, c) {
    need(pos(l) && pos(c), 'L and C must be positive');
    return { f0: 1 / (TWO_PI * Math.sqrt(l * c)), z0: Math.sqrt(l / c) };
  }
  function reactanceC(f, c) { need(pos(f) && pos(c), 'f and C must be positive'); return 1 / (TWO_PI * f * c); }
  function reactanceL(f, l) { need(pos(f) && pos(l), 'f and L must be positive'); return TWO_PI * f * l; }

  // ---------- LED series resistor ----------
  function ledResistor(vs, vf, i, name) {
    need(pos(vs) && pos(vf) && pos(i), 'Enter supply, LED voltage and current');
    need(vs > vf, 'Supply must be higher than LED voltage');
    var exact = (vs - vf) / i, std = standardAtLeast(exact, name || 'E24'), actual = (vs - vf) / std;
    return { exact: exact, standard: std, current: actual, power: actual * actual * std, ledPower: actual * vf };
  }

  // ---------- Ohm's law: any two of V, I, R, P ----------
  function ohm(v, i, r, p) {
    var given = [v, i, r, p].filter(function (x) { return x != null; }).length;
    need(given === 2, 'Fill in exactly two values');
    if (v != null && i != null) { r = v / i; p = v * i; }
    else if (v != null && r != null) { i = v / r; p = v * v / r; }
    else if (v != null && p != null) { i = p / v; r = v * v / p; }
    else if (i != null && r != null) { v = i * r; p = i * i * r; }
    else if (i != null && p != null) { v = p / i; r = p / (i * i); }
    else { v = Math.sqrt(p * r); i = Math.sqrt(p / r); }
    [v, i, r, p].forEach(function (x) { need(isFinite(x) && !isNaN(x), 'Values out of range'); });
    return { v: v, i: i, r: r, p: p };
  }

  // ---------- solvers: one set of quantities, the empty ones are calculated ----------
  // Each solver takes an object with every quantity (null = unknown) and returns all of them,
  // plus `extra` derived values and, where useful, `note` per quantity.
  function count(o, keys) { return keys.filter(function (k) { return o[k] == null; }); }
  function onlyOne(v, keys, total) {
    var miss = count(v, keys);
    need(miss.length > 0, 'Clear the field you want to calculate');
    need(miss.length === 1, 'Leave only one field empty');
    return miss[0];
  }
  function positive(v, keys) { keys.forEach(function (k) { if (v[k] != null) need(v[k] > 0, 'Values must be positive'); }); }

  var SOLVERS = {
    divider: function (v, opts) {
      var keys = ['vin', 'r1', 'r2', 'vout'], miss = count(v, keys), o = { vin: v.vin, r1: v.r1, r2: v.r2, vout: v.vout }, note = {};
      positive(v, ['r1', 'r2']);
      need(miss.length > 0, 'Clear the field you want to calculate');
      if (miss.length === 2 && miss.indexOf('r1') >= 0 && miss.indexOf('r2') >= 0) {
        var d = designDivider(v.vin, v.vout, opts.series, opts.total);
        o.r1 = d.r1; o.r2 = d.r2;
        note.vout = 'You get ' + SI.format(d.vout, 4) + 'V (' + pctText(d.errorPct) + ') with ' + opts.series;
        note.r1 = opts.series + ' pair, R1 + R2 about ' + SI.format(opts.total || 10e3, 3) + 'Ω';
        o.actual = d.vout;
      } else {
        need(miss.length === 1, 'Leave one field empty, or both R1 and R2 to pick a pair');
        var m = miss[0];
        if (m === 'vout') o.vout = v.vin * v.r2 / (v.r1 + v.r2);
        else if (m === 'vin') { need(v.vout !== 0, 'Vout must not be 0'); o.vin = v.vout * (v.r1 + v.r2) / v.r2; }
        else if (m === 'r1') { need(v.vin > v.vout && v.vout > 0, 'Vout must be between 0 and Vin'); o.r1 = v.r2 * (v.vin / v.vout - 1); }
        else { need(v.vin > v.vout && v.vout > 0, 'Vout must be between 0 and Vin'); o.r2 = v.r1 * v.vout / (v.vin - v.vout); }
        if (m === 'r1' || m === 'r2') {
          var std = SI.nearestE(o[m], opts.series), r1 = m === 'r1' ? std.value : o.r1, r2 = m === 'r2' ? std.value : o.r2;
          note[m] = opts.series + ': ' + std.label + 'Ω gives ' + SI.format(o.vin * r2 / (r1 + r2), 4) + 'V';
        }
      }
      var i = o.vin / (o.r1 + o.r2);
      o.extra = [['Current', i, 'A'], ['Power', o.vin * i, 'W'], ['Ratio Vout/Vin', o.r2 / (o.r1 + o.r2), '']];
      o.note = note; o.solved = miss;
      return o;
    },
    rc: function (v) {
      var m = onlyOne(v, ['r', 'c', 'fc']), o = { r: v.r, c: v.c, fc: v.fc };
      positive(v, ['r', 'c', 'fc']);
      if (m === 'fc') o.fc = 1 / (TWO_PI * v.r * v.c);
      else if (m === 'r') o.r = 1 / (TWO_PI * v.fc * v.c);
      else o.c = 1 / (TWO_PI * v.fc * v.r);
      o.extra = [['Time constant τ = RC', o.r * o.c, 's']]; o.solved = [m]; o.note = {};
      return o;
    },
    lc: function (v) {
      var m = onlyOne(v, ['l', 'c', 'f0']), o = { l: v.l, c: v.c, f0: v.f0 }, w2;
      positive(v, ['l', 'c', 'f0']);
      if (m === 'f0') o.f0 = 1 / (TWO_PI * Math.sqrt(v.l * v.c));
      else { w2 = Math.pow(TWO_PI * v.f0, 2); if (m === 'l') o.l = 1 / (w2 * v.c); else o.c = 1 / (w2 * v.l); }
      o.extra = [['Impedance √(L/C)', Math.sqrt(o.l / o.c), 'Ω']]; o.solved = [m]; o.note = {};
      return o;
    },
    xc: function (v) {
      var m = onlyOne(v, ['f', 'c', 'x']), o = { f: v.f, c: v.c, x: v.x };
      positive(v, ['f', 'c', 'x']);
      if (m === 'x') o.x = 1 / (TWO_PI * v.f * v.c);
      else if (m === 'c') o.c = 1 / (TWO_PI * v.f * v.x);
      else o.f = 1 / (TWO_PI * v.c * v.x);
      o.extra = []; o.solved = [m]; o.note = {};
      return o;
    },
    xl: function (v) {
      var m = onlyOne(v, ['f', 'l', 'x']), o = { f: v.f, l: v.l, x: v.x };
      positive(v, ['f', 'l', 'x']);
      if (m === 'x') o.x = TWO_PI * v.f * v.l;
      else if (m === 'l') o.l = v.x / (TWO_PI * v.f);
      else o.f = v.x / (TWO_PI * v.l);
      o.extra = []; o.solved = [m]; o.note = {};
      return o;
    },
    led: function (v, opts) {
      var m = onlyOne(v, ['vs', 'vf', 'i', 'r']), o = { vs: v.vs, vf: v.vf, i: v.i, r: v.r }, note = {};
      positive(v, ['vs', 'vf', 'i', 'r']);
      if (m === 'r') { need(v.vs > v.vf, 'Supply must be higher than LED voltage'); o.r = (v.vs - v.vf) / v.i; }
      else if (m === 'i') { need(v.vs > v.vf, 'Supply must be higher than LED voltage'); o.i = (v.vs - v.vf) / v.r; }
      else if (m === 'vs') o.vs = v.vf + v.i * v.r;
      else { o.vf = v.vs - v.i * v.r; need(o.vf > 0, 'Current times R is more than the supply'); }
      if (m === 'r') {
        var std = standardAtLeast(o.r, opts.series), ia = (o.vs - o.vf) / std;
        note.r = opts.series + ' rounded up: ' + SI.format(std, 3) + 'Ω, current ' + SI.format(ia, 4) + 'A';
      }
      o.extra = [['Resistor power', o.i * o.i * o.r, 'W'], ['LED power', o.i * o.vf, 'W']];
      o.solved = [m]; o.note = note;
      return o;
    },
    ohm: function (v) {
      var miss = count(v, ['v', 'i', 'r', 'p']);
      need(miss.length > 0, 'Clear the fields you want to calculate');
      need(miss.length === 2, 'Fill in exactly two values');
      var x = ohm(v.v, v.i, v.r, v.p);
      x.extra = []; x.solved = miss; x.note = {};
      return x;
    }
  };
  function pctText(p) { return Math.abs(p) < 0.005 ? 'exact' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(2) + '%'; }
  function solve(id, values, opts) { return SOLVERS[id](values, opts || { series: 'E24' }); }

  return {
    divider: divider, designDivider: designDivider, rc: rc, lcResonance: lcResonance,
    reactanceC: reactanceC, reactanceL: reactanceL, ledResistor: ledResistor, ohm: ohm,
    seriesValues: seriesValues, standardAtLeast: standardAtLeast, ToolError: ToolError, solve: solve
  };
});
