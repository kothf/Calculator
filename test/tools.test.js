const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/tools.js');
const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} != ${b}`);

test('divider: 12 V, 10k / 4k7', () => {
  const d = T.divider(12, 10e3, 4.7e3);
  close(d.vout, 12 * 4.7 / 14.7); close(d.current, 12 / 14.7e3); close(d.ratio, 4.7 / 14.7);
});
test('divider: rejects bad resistors', () => assert.throws(() => T.divider(5, 0, 1e3), /positive/));

test('divider design: 5 V → 3.3 V within 1% on E24, total near hint', () => {
  const d = T.designDivider(5, 3.3, 'E24', 10e3);
  assert.ok(Math.abs(d.errorPct) < 1, d.errorPct);
  assert.ok(d.r1 + d.r2 >= 5e3 && d.r1 + d.r2 <= 20e3);
  close(d.vout, 5 * d.r2 / (d.r1 + d.r2));
  for (const r of [d.r1, d.r2]) assert.ok(T.seriesValues('E24', r, r).length === 1, `${r} not in E24`);
});
test('divider design: matches a brute-force search over the series', () => {
  for (const [vin, vout, name] of [[12, 3.3, 'E24'], [12, 3.3, 'E96'], [5, 1.8, 'E12'], [24, 5, 'E96']]) {
    const d = T.designDivider(vin, vout, name, 10e3), vals = T.seriesValues(name, 1, 1e6);
    let best = Infinity;
    for (const r1 of vals) for (const r2 of vals) {
      const t = r1 + r2; if (t < 5e3 || t > 20e3) continue;
      best = Math.min(best, Math.abs(vin * r2 / t / vout - 1));
    }
    close(Math.abs(d.errorPct) / 100, best, 1e-9);
  }
});
test('divider design: half of Vin gives equal resistors', () => {
  const d = T.designDivider(10, 5, 'E12', 20e3);
  assert.strictEqual(d.r1, d.r2); assert.strictEqual(d.errorPct, 0); assert.strictEqual(d.r1, 10e3);
});
test('divider design: Vout must be below Vin', () => {
  assert.throws(() => T.designDivider(5, 6, 'E24'), /between/);
  assert.throws(() => T.designDivider(5, 0, 'E24'), /between/);
});

test('RC: 10k · 10n → τ = 100µs, fc = 1.5915 kHz', () => {
  const r = T.rc(10e3, 10e-9); close(r.tau, 1e-4); close(r.fc, 1591.549430918953);
});
test('LC resonance: 10µH, 100nF → 159.15 kHz, Z0 = 10 Ω', () => {
  const r = T.lcResonance(10e-6, 100e-9); close(r.f0, 159154.94309189535); close(r.z0, 10);
});
test('reactance', () => {
  close(T.reactanceC(1e3, 1e-6), 159.15494309189535);
  close(T.reactanceL(1e3, 1e-3), 6.283185307179586);
});

test('LED: 5 V, 2 V, 10 mA → 300 Ω exact, 300 Ω E24, 330 Ω E12', () => {
  const a = T.ledResistor(5, 2, 10e-3, 'E24');
  close(a.exact, 300); assert.strictEqual(a.standard, 300); close(a.power, 0.03);
  const b = T.ledResistor(5, 2, 10e-3, 'E12');
  assert.strictEqual(b.standard, 330); assert.ok(b.current < 10e-3);
});
test('LED: standard value never gives more current than asked', () => {
  for (const vs of [3.3, 5, 9, 12, 24]) {
    const r = T.ledResistor(vs, 1.9, 15e-3, 'E24');
    assert.ok(r.current <= 15e-3 * (1 + 1e-12), `${vs}V → ${r.current}`);
  }
});
test('LED: supply must exceed Vf', () => assert.throws(() => T.ledResistor(2, 3, 0.01), /higher/));

test("Ohm's law: every pair of inputs", () => {
  const ref = { v: 5, i: 5e-3, r: 1e3, p: 25e-3 }, keys = ['v', 'i', 'r', 'p'];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const args = keys.map((k, idx) => (idx === a || idx === b) ? ref[k] : null);
    const out = T.ohm(...args);
    for (const k of keys) close(out[k], ref[k], 1e-12);
  }
});
test("Ohm's law: needs exactly two values", () => {
  assert.throws(() => T.ohm(5, null, null, null), /exactly two/);
  assert.throws(() => T.ohm(5, 1, 5, null), /exactly two/);
});

test('standardAtLeast and seriesValues', () => {
  assert.strictEqual(T.standardAtLeast(301, 'E24'), 330);
  assert.strictEqual(T.standardAtLeast(4.7e3, 'E12'), 4.7e3);
  assert.strictEqual(T.standardAtLeast(9.9, 'E96'), 10);
  assert.deepStrictEqual(T.seriesValues('E12', 1e3, 2e3), [1000, 1200, 1500, 1800]);
});

// ---------- solvers: leave one field empty ----------
const E24 = { series: 'E24' };
const roundTrip = (id, full, opts = E24) => {
  for (const k of Object.keys(full)) {
    const known = { ...full, [k]: null };
    const out = T.solve(id, known, opts);
    close(out[k], full[k], 1e-9);
    assert.deepStrictEqual(out.solved, [k]);
  }
};
test('solver: divider, any one of Vin, R1, R2, Vout', () => roundTrip('divider', { vin: 12, r1: 10e3, r2: 4.7e3, vout: 12 * 4.7 / 14.7 }));
test('solver: RC, any one of R, C, fc', () => roundTrip('rc', { r: 10e3, c: 10e-9, fc: 1 / (2 * Math.PI * 1e-4) }));
test('solver: LC, any one of L, C, f0', () => roundTrip('lc', { l: 10e-6, c: 100e-9, f0: 1 / (2 * Math.PI * Math.sqrt(1e-12)) }));
test('solver: X_C and X_L', () => {
  roundTrip('xc', { f: 1e3, c: 1e-6, x: 1 / (2 * Math.PI * 1e-3) });
  roundTrip('xl', { f: 1e3, l: 1e-3, x: 2 * Math.PI });
});
test('solver: LED, any one of Vs, Vf, I, R', () => roundTrip('led', { vs: 5, vf: 2, i: 10e-3, r: 300 }));
test('solver: LED resistor note rounds up to the series', () => {
  const o = T.solve('led', { vs: 5, vf: 2, i: 9e-3, r: null }, E24);
  assert.match(o.note.r, /^E24 rounded up: 360Ω, current 8\.333mA/);
});
test('solver: divider with both R empty picks a standard pair', () => {
  const o = T.solve('divider', { vin: 5, r1: null, r2: null, vout: 3.3 }, { series: 'E24', total: 10e3 });
  assert.deepStrictEqual([o.r1, o.r2], [4700, 9100]);
  close(o.vout, 3.3); assert.match(o.note.vout, /−0\.09%/);
});
test('solver: divider single R gets a series hint', () => {
  const o = T.solve('divider', { vin: 5, r1: 10e3, r2: null, vout: 3.3 }, E24);
  assert.match(o.note.r2, /^E24: 20kΩ gives 3\.333V/);
});
test('solver: messages for nothing empty / too many empty / impossible', () => {
  assert.throws(() => T.solve('rc', { r: 1, c: 1, fc: 1 }), /Clear the field/);
  assert.throws(() => T.solve('rc', { r: 1, c: null, fc: null }), /only one/);
  assert.throws(() => T.solve('divider', { vin: 5, r1: 1e3, r2: null, vout: 6 }, E24), /between 0 and Vin/);
  assert.throws(() => T.solve('led', { vs: 2, vf: 3, i: 0.01, r: null }, E24), /higher/);
  assert.throws(() => T.solve('ohm', { v: 5, i: null, r: null, p: null }), /exactly two/);
});
test('solver: Ohm reports both solved fields', () => {
  const o = T.solve('ohm', { v: 5, i: null, r: 1e3, p: null });
  assert.deepStrictEqual(o.solved, ['i', 'p']); close(o.i, 5e-3); close(o.p, 25e-3);
});
