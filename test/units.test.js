const test = require('node:test');
const assert = require('node:assert');
const U = require('../src/units.js');
const close = (a, b, rel = 1e-12) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-15, `${a} != ${b}`);
const sig6 = (a, b) => assert.strictEqual(Number(a.toPrecision(6)), b, `${a} !~ ${b}`);
const c = (v, q, f, t, fe, te) => U.convert(v, q, f, t, fe, te);

// FRS §7.1
test('T1–T5 temperature', () => {
  close(c(100, 'temperature', '°C', '°F'), 212);
  close(c(-40, 'temperature', '°C', '°F'), -40);
  close(c(300, 'temperature', 'K', '°C'), 26.85);
  close(c(0, 'temperature', 'K', '°F'), -459.67);
  close(c(10, 'tempdiff', 'Δ°C', 'Δ°F'), 18);
});
test('T6 below absolute zero', () => assert.throws(() => c(-300, 'temperature', '°C', 'K'), /absolute zero/));
test('T7–T9 pressure', () => {
  sig6(c(1, 'pressure', 'bar', 'psi'), 14.5038);
  sig6(c(100, 'pressure', 'psi', 'Pa', 0, 3), 689.476);
  sig6(c(30, 'pressure', 'inHg', 'Pa', 0, 3), 101.592);
});
test('T10 energy', () => {
  close(c(1, 'energy', 'Wh', 'J', 3, 6), 3.6);
  sig6(c(1, 'energy', 'Wh', 'BTU', 3), 3412.14);
});
test('T11–T13 torque and force', () => {
  sig6(c(100, 'torque', 'N·m', 'lbf·ft'), 73.7562);
  sig6(c(25, 'torque', 'lbf·in', 'N·m'), 2.82462);
  sig6(c(1, 'force', 'N', 'lbf', 3), 224.809);
});
test('T14 prefix typed after the number', () => {
  const v = U.parseInput('4.7k', 'force', 'N');
  close(v, 4700);
  sig6(c(v, 'force', 'N', 'lbf'), 1056.6);
  close(U.parseInput('4k7', 'force', 'N'), 4700);
  close(U.parseInput('2*4.7k', 'force', 'N'), 9400);
});
test('T15 prefix on a non-prefixable unit', () => {
  assert.throws(() => U.parseInput('4.7k', 'pressure', 'psi'), /Prefix not allowed/);
  assert.throws(() => c(1, 'pressure', 'psi', 'Pa', 3), /Prefix not allowed/);
  close(U.parseInput('1e3', 'pressure', 'psi'), 1000);
});
test('T16–T18 mass and power', () => {
  sig6(c(1, 'mass', 'g', 'lb', 3), 2.20462);
  sig6(c(1, 'power', 'W', 'hp', 3), 1.34102);
  sig6(c(1, 'power', 'TR', 'W', 0, 3), 3.51685);
});
test('T19 prefix applies before the power', () => {
  close(c(1, 'area', 'm²', 'm²', -3), 1e-6);
  close(c(1, 'volume', 'm³', 'm³', -2), 1e-6);
  close(c(1, 'volume', 'm³', 'L', -2, -3), 1); // 1 cm³ = 1 mL
});
test('T20 flow', () => sig6(c(1, 'flow', 'm³/h', 'CFM'), 0.588578));
test('T21–T22 inch fractions and feet-inches', () => {
  const inch = c(100, 'length', 'm', 'in', -3);
  sig6(inch, 3.93701);
  const f = U.inchFraction(inch, 16);
  assert.strictEqual(f.text, '3 15/16"');
  assert.ok(Math.abs(f.error - 0.0005) < 0.0001, f.error);
  assert.strictEqual(U.feetInches(1.75, 32).text, `5' 8 29/32"`);
  assert.strictEqual(U.inchFraction(0.5, 32).text, '1/2"');
  assert.strictEqual(U.inchFraction(2, 32).text, '2"');
});
test('T23 auto prefix', () => {
  const r = U.results('pressure', 0.000001, 'bar', 0).find(x => x.unit.id === 'Pa');
  assert.strictEqual(r.sym, 'mPa'); close(r.value, 100);
  const kg = U.results('mass', 2.5, 'lb', 0).find(x => x.unit.id === 'g');
  assert.strictEqual(kg.sym, 'kg'); sig6(kg.value, 1.13398);
  const mm2 = U.results('area', 1, 'in²', 0).find(x => x.unit.id === 'm²');
  assert.strictEqual(mm2.sym, 'mm²'); close(mm2.value, 645.16);
});
test('input: mixed fractions and feet-inches', () => {
  close(U.parseInput('3 1/2', 'length', 'in'), 3.5);
  close(c(U.parseInput('3 1/2', 'length', 'in'), 'length', 'in', 'm', 0, -3), 88.9);
  close(U.parseInput(`5' 3 1/2"`, 'length', 'in'), 63.5);
  close(U.parseInput(`6'`, 'length', 'ft'), 6);
});
test('input: negative only where meaningful', () => {
  assert.throws(() => U.parseInput('-5', 'length', 'm'), /negative/);
  close(U.parseInput('-5', 'torque', 'N·m'), -5);
  close(U.parseInput('-5', 'temperature', '°C'), -5);
});
test('results: system filter and best fit in the other system', () => {
  const imp = U.results('pressure', 1, 'bar', 0, { system: 'imperial' });
  assert.ok(imp.every(r => r.unit.sys === 'imperial') && imp.length > 0);
  assert.strictEqual(U.bestOther('length', 25, 'm', -3).unit.id, 'in');
  assert.strictEqual(U.bestOther('pressure', 250, 'Pa', 3).unit.id, 'psi');
  assert.strictEqual(U.bestOther('torque', 100, 'N·m', 0).unit.id, 'lbf·ft');
  assert.strictEqual(U.bestOther('torque', 100, 'N·m', 0, 'lbf·in').unit.id, 'lbf·in');
  const m = U.bestOther('length', 1, 'in', 0);
  assert.strictEqual(m.sym, 'mm'); close(m.value, 25.4);
});
test('NFR-2 round trip for every unit pair and prefix', () => {
  for (const q of U.QUANTITIES) for (const a of q.units) for (const b of q.units)
    for (const e of U.prefixesFor(a)) {
      const v = q.id === 'temperature' ? 300 : 12.345;
      const there = U.convert(v, q.id, a.id, b.id, e, 0);
      close(U.convert(there, q.id, b.id, a.id, 0, e), v, q.id === 'temperature' && e ? 1e-6 : 1e-12); // offset units lose digits at µK
    }
});
test('every unit has a finite positive factor and a known system', () => {
  for (const q of U.QUANTITIES) {
    assert.ok(q.units.some(x => x.sys === 'metric') && q.units.some(x => x.sys === 'imperial'), q.id);
    assert.strictEqual(q.units[0].sys, 'metric', q.id + ': metric first');
    for (const x of q.units) assert.ok(x.f > 0 && isFinite(x.f), q.id + ' ' + x.id);
  }
});

// FRS §7.2
test('D1–D7 decibels', () => {
  sig6(U.DB.toPowerRatio(3), 1.99526);
  close(U.DB.toVoltageRatio(20), 10);
  close(U.DB.dBmToW(30), 1);
  close(U.DB.dBmToW(-60), 1e-9);
  sig6(U.DB.wToVrms(U.DB.dBmToW(0), 50), 0.223607);
  const v600 = U.DB.wToVrms(U.DB.dBmToW(0), 600);
  sig6(v600, 0.774597); close(U.DB.vToDBu(v600) + 1, 1);
  sig6(U.DB.powerSum([0, 0]), 3.0103);
  assert.throws(() => U.DB.fromPowerRatio(0), /greater than 0/);
  close(U.DB.vToDBuV(1), 120); close(U.DB.vToDBV(1), 0);
  close(U.DB.wToDBm(U.DB.vrmsToW(1, 50)), 10 * Math.log10(20));
});

// FRS §7.3
test('C1–C4 IPC-2221 trace width', () => {
  const e = U.traceWidth({ current: 1, dT: 10, oz: 1, layer: 'external' });
  assert.strictEqual(e.areaMil2.toFixed(2), '16.30'); assert.strictEqual(e.widthMil.toFixed(2), '11.83');
  assert.strictEqual(e.widthMm.toFixed(3), '0.300'); assert.deepStrictEqual(e.warnings, []);
  const i = U.traceWidth({ current: 1, dT: 10, oz: 1, layer: 'internal' });
  assert.strictEqual(i.widthMil.toFixed(2), '30.76'); assert.strictEqual(i.widthMm.toFixed(3), '0.781');
  close(U.traceCurrent({ widthMil: e.widthMil, dT: 10, oz: 1 }).current, 1, 1e-9);
  assert.deepStrictEqual(U.traceWidth({ current: 40 }).warnings, ['Outside IPC-2221 chart range']);
  const r = U.traceWidth({ current: 1, length: 0.1, ambient: 25 });
  assert.ok(r.resistance > 0.15 && r.resistance < 0.2, r.resistance); // 10 cm of 0.3 mm, 35 µm Cu at 35 °C ≈ 0.17 Ω
});
test('C5–C8 AWG', () => {
  const a24 = U.awg(24); assert.strictEqual(a24.diameterMm.toFixed(4), '0.5106'); assert.strictEqual(a24.areaMm2.toFixed(4), '0.2047');
  const a10 = U.awg(10); assert.strictEqual(a10.diameterMm.toFixed(3), '2.588'); assert.strictEqual(a10.areaMm2.toFixed(3), '5.261');
  const a40 = U.awg(-3); assert.strictEqual(a40.diameterMm.toFixed(2), '11.68'); assert.strictEqual(a40.areaMm2.toFixed(1), '107.2');
  assert.strictEqual(a40.label, '4/0'); assert.strictEqual(U.awgParse('0000'), -3); assert.strictEqual(U.awgParse('2/0'), -1);
  const f = U.fromArea(0.2);
  assert.strictEqual(f.nearest.n, 24); assert.strictEqual(f.atLeast.n, 24); assert.strictEqual(f.iecAtLeast, 0.5);
  assert.strictEqual(U.fromArea(1.5).iecNearest, 1.5);
  assert.ok(Math.abs(U.awg(10).ohmPerKm - 3.277) < 0.01, U.awg(10).ohmPerKm);
  const vd = U.voltageDrop({ areaMm2: 1.5, length: 10, current: 10, supply: 12 });
  close(vd.resistance, 1.724e-8 * 20 / 1.5e-6, 1e-9);
});
