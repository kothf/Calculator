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

  return {
    divider: divider, designDivider: designDivider, rc: rc, lcResonance: lcResonance,
    reactanceC: reactanceC, reactanceL: reactanceL, ledResistor: ledResistor, ohm: ohm,
    seriesValues: seriesValues, standardAtLeast: standardAtLeast, ToolError: ToolError
  };
});
