// PrefixCalc Units mode core: engineering unit conversion (metric ↔ imperial) with SI prefixes,
// decibels, PCB trace width (IPC-2221) and wire gauge (AWG). Pure functions, no DOM.
// Depends on si.js (expression parser + number formatting). Browser: window.UNITS, Node: module.exports.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./si.js'));
  else root.UNITS = factory(root.SI);
})(this, function (SI) {
  'use strict';

  function UnitError(message) { this.message = message; }
  UnitError.prototype = Object.create(Error.prototype);
  function need(cond, msg) { if (!cond) throw new UnitError(msg); }
  function num(x) { return typeof x === 'number' && isFinite(x); }

  // ---------- exact definitions (International Yard and Pound Agreement 1959, g_n = 9.80665) ----------
  var IN = 0.0254, FT = 0.3048, YD = 0.9144, MI = 1609.344, LB = 0.45359237, GN = 9.80665;
  var LBF = LB * GN, PSI = LBF / (IN * IN), BTU = 1055.05585262, MMHG = 133.322387415;
  var USGAL = 3.785411784e-3, UKGAL = 4.54609e-3, FTLBF = LBF * FT, HP = 550 * FTLBF;

  // Prefix exponents. c and d only on units flagged cd (cm, cm², cm³, cN·m).
  var PREFIX_SYM = { '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', '-2': 'c', '-1': 'd', '0': '', '3': 'k', '6': 'M', '9': 'G', '12': 'T' };
  var E3 = [-12, -9, -6, -3, 0, 3, 6, 9, 12];

  // Unit fields: id (unique in quantity), sym, name, sys ('metric' | 'imperial'), f = value of 1 unit in the
  // quantity's base unit, o = offset (temperature: base = (v + o)·f), px = accepts SI prefixes,
  // pow = power the prefix is raised to (m² → 2), cd = c/d prefixes allowed, base = prefix exponent of the
  // SI base (g → kg is 3), fit = candidate for "best unit in the other system".
  function u(id, name, sys, f, extra) {
    var o = { id: id, sym: id, name: name, sys: sys, f: f, o: 0, px: false, pow: 1, cd: false, fit: false };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  var M = 'metric', I = 'imperial';
  var P = { px: true, fit: true };

  var QUANTITIES = [
    { id: 'temperature', name: 'Temperature', base: 'K', min: 0, units: [
      u('K', 'kelvin', M, 1, { px: true, prefixes: [-6, -3, 0] }),
      u('°C', 'degree Celsius', M, 1, { o: 273.15, fit: true }),
      u('°F', 'degree Fahrenheit', I, 5 / 9, { o: 459.67, fit: true }),
      u('°R', 'degree Rankine', I, 5 / 9)] },
    { id: 'tempdiff', name: 'Temperature difference', base: 'K', signed: true, units: [
      u('K', 'kelvin', M, 1, { px: true }),
      u('Δ°C', 'degree Celsius (difference)', M, 1, { fit: true }),
      u('Δ°F', 'degree Fahrenheit (difference)', I, 5 / 9, { fit: true }),
      u('Δ°R', 'degree Rankine (difference)', I, 5 / 9)] },
    { id: 'pressure', name: 'Pressure / stress', base: 'Pa', units: [
      u('Pa', 'pascal', M, 1, P),
      u('bar', 'bar', M, 1e5, P),
      u('atm', 'standard atmosphere', M, 101325),
      u('mmHg', 'millimetre of mercury (0 °C)', M, MMHG),
      u('mmH₂O', 'millimetre of water (conventional)', M, GN),
      u('kgf/cm²', 'kilogram-force per square centimetre', M, GN * 1e4),
      u('N/mm²', 'newton per square millimetre', M, 1e6),
      u('psi', 'pound-force per square inch', I, PSI, { fit: true }),
      u('ksi', 'kip per square inch', I, 1000 * PSI, { fit: true }),
      u('psf', 'pound-force per square foot', I, LBF / (FT * FT)),
      u('inHg', 'inch of mercury (0 °C)', I, MMHG * 25.4),
      u('inH₂O', 'inch of water (conventional)', I, 1000 * GN * IN)] },
    { id: 'energy', name: 'Energy / work', base: 'J', signed: true, units: [
      u('J', 'joule', M, 1, P),
      u('Wh', 'watt-hour', M, 3600, P),
      u('cal', 'calorie (thermochemical)', M, 4.184),
      u('kcal', 'kilocalorie (thermochemical)', M, 4184),
      u('eV', 'electronvolt', M, 1.602176634e-19, { px: true }),
      u('BTU', 'British thermal unit (IT)', I, BTU, { fit: true }),
      u('therm', 'therm (US)', I, 105480400),
      u('ft·lbf', 'foot pound-force', I, FTLBF, { fit: true }),
      u('in·lbf', 'inch pound-force', I, LBF * IN)] },
    { id: 'torque', name: 'Torque / moment', base: 'N·m', signed: true, units: [
      u('N·m', 'newton metre', M, 1, { px: true, fit: true, cd: true }),
      u('N·cm', 'newton centimetre', M, 0.01),
      u('kgf·m', 'kilogram-force metre', M, GN),
      u('kgf·cm', 'kilogram-force centimetre', M, GN / 100),
      u('lbf·ft', 'pound-force foot', I, FTLBF, { fit: true }),
      u('lbf·in', 'pound-force inch', I, LBF * IN, { fit: true }),
      u('ozf·in', 'ounce-force inch', I, LBF / 16 * IN, { fit: true }),
      u('kip·ft', 'kip foot', I, 1000 * FTLBF)] },
    { id: 'force', name: 'Force', base: 'N', signed: true, units: [
      u('N', 'newton', M, 1, P),
      u('kgf', 'kilogram-force', M, GN),
      u('tf', 'tonne-force', M, 1000 * GN),
      u('lbf', 'pound-force', I, LBF, { fit: true }),
      u('ozf', 'ounce-force', I, LBF / 16, { fit: true }),
      u('kip', 'kip (1000 lbf)', I, 1000 * LBF, { fit: true }),
      u('pdl', 'poundal', I, LB * FT)] },
    { id: 'length', name: 'Length', base: 'm', units: [
      u('m', 'metre', M, 1, { px: true, fit: true, cd: true }),
      u('Å', 'ångström', M, 1e-10),
      u('mil', 'mil (thou)', I, IN / 1000),
      u('in', 'inch', I, IN, { fit: true }),
      u('ft', 'foot', I, FT, { fit: true }),
      u('yd', 'yard', I, YD),
      u('mi', 'mile', I, MI, { fit: true })] },
    { id: 'mass', name: 'Mass', base: 'kg', units: [
      u('g', 'gram', M, 1e-3, { px: true, fit: true, base: 3 }),
      u('t', 'tonne', M, 1000),
      u('gr', 'grain', I, 64.79891e-6),
      u('oz', 'ounce', I, LB / 16, { fit: true }),
      u('lb', 'pound', I, LB, { fit: true }),
      u('slug', 'slug', I, LBF / FT),
      u('ton (US)', 'short ton', I, 2000 * LB),
      u('ton (UK)', 'long ton', I, 2240 * LB)] },
    { id: 'power', name: 'Power', base: 'W', units: [
      u('W', 'watt', M, 1, P),
      u('PS', 'metric horsepower', M, 75 * GN),
      u('kcal/h', 'kilocalorie per hour', M, 4184 / 3600),
      u('hp', 'horsepower (mechanical)', I, HP, { fit: true }),
      u('BTU/h', 'BTU per hour', I, BTU / 3600, { fit: true }),
      u('ft·lbf/s', 'foot pound-force per second', I, FTLBF),
      u('TR', 'ton of refrigeration', I, 12000 * BTU / 3600)] },
    { id: 'area', name: 'Area', base: 'm²', units: [
      u('m²', 'square metre', M, 1, { px: true, fit: true, pow: 2, cd: true }),
      u('ha', 'hectare', M, 1e4),
      u('in²', 'square inch', I, IN * IN, { fit: true }),
      u('ft²', 'square foot', I, FT * FT, { fit: true }),
      u('yd²', 'square yard', I, YD * YD),
      u('acre', 'acre', I, 4046.8564224, { fit: true }),
      u('cmil', 'circular mil', I, Math.PI / 4 * Math.pow(IN / 1000, 2))] },
    { id: 'volume', name: 'Volume', base: 'm³', units: [
      u('m³', 'cubic metre', M, 1, { px: true, fit: true, pow: 3, cd: true }),
      u('L', 'litre', M, 1e-3, P),
      u('in³', 'cubic inch', I, IN * IN * IN, { fit: true }),
      u('ft³', 'cubic foot', I, FT * FT * FT, { fit: true }),
      u('gal (US)', 'US gallon', I, USGAL, { fit: true }),
      u('gal (UK)', 'imperial gallon', I, UKGAL),
      u('fl oz (US)', 'US fluid ounce', I, USGAL / 128)] },
    { id: 'velocity', name: 'Velocity', base: 'm/s', signed: true, units: [
      u('m/s', 'metre per second', M, 1, P),
      u('km/h', 'kilometre per hour', M, 1 / 3.6),
      u('in/s', 'inch per second', I, IN, { fit: true }),
      u('ft/s', 'foot per second', I, FT, { fit: true }),
      u('ft/min', 'foot per minute', I, FT / 60),
      u('mph', 'mile per hour', I, MI / 3600, { fit: true })] },
    { id: 'flow', name: 'Volumetric flow', base: 'm³/s', units: [
      u('m³/s', 'cubic metre per second', M, 1, { fit: true }),
      u('m³/h', 'cubic metre per hour', M, 1 / 3600, { fit: true }),
      u('L/s', 'litre per second', M, 1e-3, { fit: true }),
      u('L/min', 'litre per minute', M, 1e-3 / 60, { fit: true }),
      u('CFM', 'cubic foot per minute', I, FT * FT * FT / 60, { fit: true }),
      u('GPM (US)', 'US gallon per minute', I, USGAL / 60, { fit: true }),
      u('GPM (UK)', 'imperial gallon per minute', I, UKGAL / 60)] },
    { id: 'density', name: 'Density', base: 'kg/m³', units: [
      u('kg/m³', 'kilogram per cubic metre', M, 1, { fit: true }),
      u('g/cm³', 'gram per cubic centimetre', M, 1000, { fit: true }),
      u('kg/L', 'kilogram per litre', M, 1000),
      u('lb/ft³', 'pound per cubic foot', I, LB / (FT * FT * FT), { fit: true }),
      u('lb/in³', 'pound per cubic inch', I, LB / (IN * IN * IN), { fit: true }),
      u('lb/gal (US)', 'pound per US gallon', I, LB / USGAL)] },
    { id: 'stiffness', name: 'Spring rate / stiffness', base: 'N/m', units: [
      u('N/m', 'newton per metre', M, 1, P),
      u('N/mm', 'newton per millimetre', M, 1000),
      u('lbf/in', 'pound-force per inch', I, LBF / IN, { fit: true }),
      u('lbf/ft', 'pound-force per foot', I, LBF / FT, { fit: true })] },
    { id: 'inertia', name: 'Second moment of area', base: 'm⁴', units: [
      u('m⁴', 'metre to the fourth', M, 1, { px: true, fit: true, pow: 4, cd: true }),
      u('in⁴', 'inch to the fourth', I, Math.pow(IN, 4), { fit: true })] },
    { id: 'dynvisc', name: 'Dynamic viscosity', base: 'Pa·s', units: [
      u('Pa·s', 'pascal second', M, 1, P),
      u('P', 'poise', M, 0.1),
      u('cP', 'centipoise', M, 1e-3),
      u('lb/(ft·s)', 'pound per foot second', I, LB / FT, { fit: true }),
      u('reyn', 'reyn (lbf·s/in²)', I, PSI, { fit: true })] },
    { id: 'kinvisc', name: 'Kinematic viscosity', base: 'm²/s', units: [
      u('m²/s', 'square metre per second', M, 1, { px: true, fit: true, pow: 2 }),
      u('St', 'stokes', M, 1e-4),
      u('cSt', 'centistokes', M, 1e-6),
      u('ft²/s', 'square foot per second', I, FT * FT, { fit: true }),
      u('in²/s', 'square inch per second', I, IN * IN, { fit: true })] },
    { id: 'conductivity', name: 'Thermal conductivity', base: 'W/(m·K)', units: [
      u('W/(m·K)', 'watt per metre kelvin', M, 1, { fit: true }),
      u('BTU/(h·ft·°F)', 'BTU per hour foot degree Fahrenheit', I, BTU / 3600 / FT * 1.8, { fit: true }),
      u('BTU·in/(h·ft²·°F)', 'BTU inch per hour square foot degree Fahrenheit', I, BTU / 3600 * IN / (FT * FT) * 1.8, { fit: true })] },
    { id: 'htc', name: 'Heat transfer coefficient', base: 'W/(m²·K)', units: [
      u('W/(m²·K)', 'watt per square metre kelvin', M, 1, { fit: true }),
      u('BTU/(h·ft²·°F)', 'BTU per hour square foot degree Fahrenheit', I, BTU / 3600 / (FT * FT) * 1.8, { fit: true })] }
  ];
  var BY_ID = {};
  QUANTITIES.forEach(function (q) {
    BY_ID[q.id] = q; q.byId = {};
    q.units.forEach(function (x) { q.byId[x.id] = x; });
  });

  function quantity(id) { var q = BY_ID[id]; need(q, 'Unknown quantity ' + id); return q; }
  function unit(q, id) { q = typeof q === 'string' ? quantity(q) : q; var x = q.byId[id]; need(x, 'Unknown unit ' + id); return x; }

  // Prefix exponents a unit accepts (for the prefix selector). Non-prefixable units: [0].
  function prefixesFor(x) {
    if (!x.px) return [0];
    if (x.prefixes) return x.prefixes.slice();
    return x.cd ? E3.concat([-2, -1]).sort(function (a, b) { return a - b; }) : E3.slice();
  }
  // Symbol of a unit with a prefix: (m, -3) → mm, (m², -3) → mm², (g, 3) → kg.
  function symbol(x, e3) {
    e3 = e3 || 0;
    return (PREFIX_SYM[e3] || '') + x.sym;
  }
  // Value of 1 prefixed unit in the base unit (scale only; temperature offset handled separately).
  function scale(x, e3) {
    e3 = e3 || 0;
    if (e3) need(x.px && (!x.prefixes || x.prefixes.indexOf(e3) >= 0), 'Prefix not allowed for this unit');
    return x.f * Math.pow(10, e3 * x.pow);
  }

  function toBase(q, x, v, e3) {
    var b = (v + x.o) * scale(x, e3);
    if (q.min !== undefined && b < q.min - 1e-12) throw new UnitError('Below absolute zero');
    return b;
  }
  function fromBase(x, b, e3) { return b / scale(x, e3) - x.o; }

  // convert(value, quantityId, fromUnitId, toUnitId, fromE3?, toE3?) → number
  function convert(v, qid, from, to, fromE3, toE3) {
    var q = quantity(qid);
    need(num(v), 'Enter a number');
    return fromBase(unit(q, to), toBase(q, unit(q, from), v, fromE3), toE3);
  }

  // Engineering prefix for a value in a prefixable unit: mantissa in [1, 1000^pow). Non-prefixable → 0.
  function autoPrefix(x, valueInUnit) {
    if (!x.px || valueInUnit === 0 || !num(valueInUnit)) return 0;
    var lg = Math.log10(Math.abs(Number(valueInUnit.toPrecision(12))));
    var e3 = Math.floor(lg / (3 * x.pow)) * 3, list = prefixesFor(x).filter(function (e) { return e % 3 === 0; });
    e3 = Math.max(list[0], Math.min(list[list.length - 1], e3));
    return e3;
  }

  // ---------- input parsing ----------
  var PREFIX_AFTER_NUMBER = /(\d|\.)\s*[fpnuµμmkKMGTR](?![a-z])/;
  // parseInput(text, quantityId, unitId) → value in that unit (before the selected prefix is applied).
  // Accepts PrefixCalc expressions (2*4.7k, 4k7), mixed fractions (3 1/2) and feet-inches (5' 3 1/2").
  function parseInput(text, qid, uid) {
    var s = String(text).trim(), q = quantity(qid), x = unit(q, uid);
    need(s !== '', 'Enter a number');
    var mixed = /^(-?)(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (mixed) {
      need(+mixed[4] !== 0, 'Div by 0');
      var mv = +mixed[2] + mixed[3] / mixed[4];
      return mixed[1] ? -mv : mv;
    }
    var fi = /^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)?(?:\s*(\d+)\s*\/\s*(\d+))?\s*(?:"|'')?)?$/.exec(s);
    if (fi && q.id === 'length') {
      var inches = +fi[1] * 12 + (fi[2] ? +fi[2] : 0) + (fi[3] ? fi[3] / fi[4] : 0);
      return fromBase(x, inches * IN, 0);
    }
    if (!x.px && PREFIX_AFTER_NUMBER.test(s.replace(/\d+e[+-]?\d+/g, '0'))) throw new UnitError('Prefix not allowed for this unit');
    var v;
    try { v = SI.evaluate(s); } catch (e) { throw new UnitError(e.message); }
    if (!q.signed && q.id !== 'temperature' && v < 0) throw new UnitError('Must not be negative');
    return v;
  }

  // ---------- results ----------
  // results(quantityId, value, unitId, e3, opts) → [{ unit, e3, value, sym }] for every unit (opts.system filters).
  // Prefixable units use the auto prefix unless opts.pinned[unitId] gives one.
  function results(qid, v, uid, e3, opts) {
    opts = opts || {};
    var q = quantity(qid), b = toBase(q, unit(q, uid), v, e3), pinned = opts.pinned || {};
    return q.units.filter(function (x) { return !opts.system || opts.system === 'both' || x.sys === opts.system; })
      .map(function (x) {
        var raw = fromBase(x, b, 0);
        var pe = pinned.hasOwnProperty(x.id) ? pinned[x.id] : (opts.autoPrefix === false ? 0 : autoPrefix(x, raw));
        if (x.base !== undefined && pe === 0 && !pinned.hasOwnProperty(x.id) && raw === 0) pe = x.base;
        var val = fromBase(x, b, pe);
        return { unit: x, e3: pe, value: val, sym: symbol(x, pe) };
      });
  }

  // Closest-fit unit in the other system (FRS FR-SYS-2): a preferred unit if given, else the first
  // "fit" unit whose value lands nearest to [1, 1000).
  function bestOther(qid, v, uid, e3, preferred) {
    var q = quantity(qid), src = unit(q, uid), other = src.sys === M ? I : M;
    var list = results(qid, v, uid, e3, { system: other });
    if (preferred) for (var i = 0; i < list.length; i++) if (list[i].unit.id === preferred) return list[i];
    var best = null;
    list.forEach(function (r) {
      if (!r.unit.fit) return;
      var a = Math.abs(r.value), lg = a > 0 ? Math.log10(a) : 0;
      var score = a === 0 ? 0 : (lg < 0 ? -lg : (lg >= 3 ? lg - 3 : 0));
      if (!best || score < best.score - 1e-9) best = { score: score, r: r };
    });
    return best ? best.r : list[0];
  }

  function format(v, sig) { return SI.plain(v, sig || 6); }

  // Inches as a mixed fraction to 1/den: 3.937 → { text: '3 15/16"', error: +0.0005 } (error in inches).
  function inchFraction(inches, den) {
    den = den || 32;
    var sign = inches < 0 ? '−' : '', a = Math.abs(inches);
    var n = Math.round(a * den), whole = Math.floor(n / den), rem = n % den, d = den;
    while (rem && rem % 2 === 0) { rem /= 2; d /= 2; }
    var text = sign + (whole || !rem ? whole : '') + (rem ? (whole ? ' ' : '') + rem + '/' + d : '') + '"';
    return { text: text, error: n / den - a };
  }
  // Metres as feet-inches: 1.75 → 5' 8 29/32" (den 32).
  function feetInches(metres, den) {
    den = den || 32;
    var inches = Math.abs(metres) / IN, n = Math.round(inches * den), ft = Math.floor(n / (12 * den));
    var rest = inchFraction((n - ft * 12 * den) / den, den);
    return { text: (metres < 0 ? '−' : '') + ft + "' " + rest.text, error: (n / den - inches) };
  }

  // ---------- decibels ----------
  var DBU_REF = Math.sqrt(0.6); // 0.774597 V: 1 mW into 600 Ω
  function posv(x, what) { need(num(x) && x > 0, (what || 'Value') + ' must be greater than 0'); return x; }
  var DB = {
    fromPowerRatio: function (r) { return 10 * Math.log10(posv(r, 'Ratio')); },
    toPowerRatio: function (db) { need(num(db), 'Enter dB'); return Math.pow(10, db / 10); },
    fromVoltageRatio: function (r) { return 20 * Math.log10(posv(r, 'Ratio')); },
    toVoltageRatio: function (db) { need(num(db), 'Enter dB'); return Math.pow(10, db / 20); },
    dBmToW: function (dbm) { need(num(dbm), 'Enter dBm'); return 1e-3 * Math.pow(10, dbm / 10); },
    wToDBm: function (w) { return 10 * Math.log10(posv(w, 'Power') / 1e-3); },
    dBWToW: function (dbw) { need(num(dbw), 'Enter dBW'); return Math.pow(10, dbw / 10); },
    wToDBW: function (w) { return 10 * Math.log10(posv(w, 'Power')); },
    // Power ↔ RMS voltage across a resistive load R (Ω)
    wToVrms: function (w, r) { return Math.sqrt(posv(w, 'Power') * posv(r, 'Impedance')); },
    vrmsToW: function (v, r) { return posv(v, 'Voltage') * v / posv(r, 'Impedance'); },
    // Voltage levels: dBV (1 V), dBu (0.774597 V), dBµV (1 µV)
    vToDBV: function (v) { return 20 * Math.log10(posv(v, 'Voltage')); },
    dBVToV: function (x) { need(num(x), 'Enter dBV'); return Math.pow(10, x / 20); },
    vToDBu: function (v) { return 20 * Math.log10(posv(v, 'Voltage') / DBU_REF); },
    dBuToV: function (x) { need(num(x), 'Enter dBu'); return DBU_REF * Math.pow(10, x / 20); },
    vToDBuV: function (v) { return 20 * Math.log10(posv(v, 'Voltage') / 1e-6); },
    dBuVToV: function (x) { need(num(x), 'Enter dBµV'); return 1e-6 * Math.pow(10, x / 20); },
    // Sine peak values from RMS
    peak: function (vrms) { return Math.SQRT2 * vrms; },
    peakToPeak: function (vrms) { return 2 * Math.SQRT2 * vrms; },
    // Incoherent power sum of levels in dBm (or any dB-power unit): 0 dBm + 0 dBm = 3.0103 dBm
    powerSum: function (levels) {
      need(levels && levels.length, 'Enter levels');
      var s = 0; levels.forEach(function (l) { need(num(l), 'Enter levels'); s += Math.pow(10, l / 10); });
      return 10 * Math.log10(s);
    },
    DBU_REF: DBU_REF
  };

  // ---------- PCB trace width, IPC-2221 ----------
  var OZ_MIL = 1.378;            // 1 oz/ft² copper = 35 µm = 1.378 mil (calculator convention)
  var RHO_CU = 1.724e-8, ALPHA_CU = 0.00393; // Ω·m at 20 °C, 1/°C
  var MIL = IN / 1000;
  function ipcK(layer) { return layer === 'internal' ? 0.024 : 0.048; }
  function ipcWarnings(i, widthMil, dT, oz) {
    var w = [];
    if (i > 35 || widthMil > 400 || dT < 10 || dT > 100 || oz < 0.5 || oz > 3) w.push('Outside IPC-2221 chart range');
    return w;
  }
  function traceExtras(r, opts) {
    if (opts.length > 0) {
      var t = (opts.ambient === undefined ? 25 : opts.ambient) + opts.dT;
      var areaM2 = r.areaMil2 * MIL * MIL;
      r.resistance = RHO_CU * (1 + ALPHA_CU * (t - 20)) * opts.length / areaM2;
      r.voltageDrop = r.resistance * opts.current;
      r.powerLoss = r.voltageDrop * opts.current;
    }
    return r;
  }
  // traceWidth({ current A, dT °C (default 10), oz (default 1), layer 'external'|'internal', length m?, ambient °C? })
  function traceWidth(o) {
    var i = posv(o.current, 'Current'), dT = o.dT === undefined ? 10 : posv(o.dT, 'Temperature rise');
    var oz = o.oz === undefined ? 1 : posv(o.oz, 'Copper thickness');
    var area = Math.pow(i / (ipcK(o.layer) * Math.pow(dT, 0.44)), 1 / 0.725), w = area / (oz * OZ_MIL);
    return traceExtras({ areaMil2: area, areaMm2: area * MIL * MIL * 1e6, widthMil: w, widthMm: w * MIL * 1e3,
      warnings: ipcWarnings(i, w, dT, oz) }, { current: i, dT: dT, length: o.length, ambient: o.ambient });
  }
  // traceCurrent({ widthMil | widthMm, dT, oz, layer }) → max current
  function traceCurrent(o) {
    var w = o.widthMil !== undefined ? posv(o.widthMil, 'Width') : posv(o.widthMm, 'Width') / (MIL * 1e3);
    var dT = o.dT === undefined ? 10 : posv(o.dT, 'Temperature rise'), oz = o.oz === undefined ? 1 : posv(o.oz, 'Copper thickness');
    var area = w * oz * OZ_MIL, i = ipcK(o.layer) * Math.pow(dT, 0.44) * Math.pow(area, 0.725);
    return { current: i, areaMil2: area, warnings: ipcWarnings(i, w, dT, oz) };
  }

  // ---------- wire gauge, AWG ----------
  var IEC_SIZES = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
  // AWG n as number: 0000 = -3 … 40. Labels: '4/0', '3/0', '2/0', '1/0', '1' … '40'.
  function awgLabel(n) { return n <= 0 ? (1 - n) + '/0' : String(n); }
  function awgParse(s) {
    s = String(s).trim();
    var m = /^([1-4])\/0$/.exec(s) || (/^0{1,4}$/.test(s) ? [s, String(s.length)] : null);
    if (m) return 1 - +m[1];
    need(/^\d+$/.test(s) && +s <= 40, 'AWG must be 4/0 … 40');
    return +s;
  }
  function awg(n) {
    need(Number.isInteger(n) && n >= -3 && n <= 40, 'AWG must be 4/0 … 40');
    var dIn = 0.005 * Math.pow(92, (36 - n) / 39), dMm = dIn * 25.4, areaMm2 = Math.PI / 4 * dMm * dMm;
    var cmil = Math.pow(dIn * 1000, 2), ohmPerM = RHO_CU / (areaMm2 * 1e-6);
    return { n: n, label: awgLabel(n), diameterIn: dIn, diameterMm: dMm, diameterMil: dIn * 1000,
      areaMm2: areaMm2, cmil: cmil, kcmil: cmil / 1000, ohmPerKm: ohmPerM * 1000, ohmPer1000ft: ohmPerM * 304.8 };
  }
  // fromArea(mm²) → nearest AWG (by area), the smallest AWG at least that big, nearest and next-up IEC sizes
  function fromArea(mm2) {
    posv(mm2, 'Cross-section');
    var nearest = null, atLeast = null;
    for (var n = 40; n >= -3; n--) {
      var w = awg(n), d = Math.abs(Math.log(w.areaMm2 / mm2));
      if (!nearest || d < nearest.d) nearest = { d: d, w: w };
      if (!atLeast && w.areaMm2 >= mm2 * (1 - 1e-9)) atLeast = w;
    }
    var iecNear = IEC_SIZES.reduce(function (a, b) { return Math.abs(Math.log(b / mm2)) < Math.abs(Math.log(a / mm2)) ? b : a; });
    var iecUp = null;
    for (var i = 0; i < IEC_SIZES.length; i++) if (IEC_SIZES[i] >= mm2 * (1 - 1e-9)) { iecUp = IEC_SIZES[i]; break; }
    return { nearest: nearest.w, atLeast: atLeast, iecNearest: iecNear, iecAtLeast: iecUp };
  }
  function fromDiameter(mm) { posv(mm, 'Diameter'); return fromArea(Math.PI / 4 * mm * mm); }
  // Voltage drop over a copper wire: round trip by default.
  function voltageDrop(o) {
    var a = posv(o.areaMm2, 'Cross-section') * 1e-6, l = posv(o.length, 'Length') * (o.oneWay ? 1 : 2);
    var r = RHO_CU * (1 + ALPHA_CU * ((o.temp === undefined ? 20 : o.temp) - 20)) * l / a, dv = r * posv(o.current, 'Current');
    return { resistance: r, drop: dv, percent: o.supply > 0 ? dv / o.supply * 100 : null };
  }

  return {
    QUANTITIES: QUANTITIES, quantity: quantity, unit: unit, prefixesFor: prefixesFor, symbol: symbol,
    convert: convert, toBase: toBase, fromBase: fromBase, autoPrefix: autoPrefix, parseInput: parseInput,
    results: results, bestOther: bestOther, format: format, inchFraction: inchFraction, feetInches: feetInches,
    DB: DB, traceWidth: traceWidth, traceCurrent: traceCurrent,
    awg: awg, awgLabel: awgLabel, awgParse: awgParse, fromArea: fromArea, fromDiameter: fromDiameter,
    voltageDrop: voltageDrop, IEC_SIZES: IEC_SIZES, PREFIX_SYM: PREFIX_SYM, UnitError: UnitError,
    CONST: { IN: IN, FT: FT, LB: LB, GN: GN, LBF: LBF, PSI: PSI, BTU: BTU, HP: HP }
  };
});
