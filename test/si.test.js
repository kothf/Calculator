const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/si.js');
const { evaluate, format, alternatives, autoExp3, nearestE, formatAt } = S;
const calc = s => format(evaluate(s));
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.abs(b) * 1e-12, `${a} != ${b}`);
const err = (s, code) => assert.throws(() => evaluate(s), e => e.code === code, s);

// Spec section 4: parser acceptance table
test('Spec §4: 10n * 100k = 1m (1000µ / 0.001)', () => {
  const v = evaluate('10n * 100k');
  assert.strictEqual(format(v), '1m');
  assert.deepStrictEqual(alternatives(v, autoExp3(v, 4), 4), ['1000µ', '0.001', '1e-3']);
});
test('Spec §4: 10k || 10k = 5k (5000 / 5e3)', () => {
  const v = evaluate('10k || 10k');
  assert.strictEqual(format(v), '5k');
  assert.deepStrictEqual(alternatives(v, 3, 4), ['5000', '5e3']);
});
test('Spec §4: 4k7 + 330 = 5.03k (5030)', () => {
  const v = evaluate('4k7 + 330');
  assert.strictEqual(format(v), '5.03k');
  assert.ok(alternatives(v, 3, 4).includes('5030'));
});
test('Spec §4: 1 / (2 * pi * 10k * 10n) = 1.592k (1591.55)', () => {
  const v = evaluate('1 / (2 * pi * 10k * 10n)');
  assert.strictEqual(format(v), '1.592k');
  assert.strictEqual(S.plain(v, 6), '1591.55');
});
test('Spec §4: 100m * 100M = 10M (1e7)', () => {
  const v = evaluate('100m * 100M');
  assert.strictEqual(format(v), '10M');
  assert.ok(alternatives(v, 6, 4).includes('1e7'));
});
test('Spec §4: 1u / 1p = 1M (1e6)', () => {
  const v = evaluate('1u / 1p');
  assert.strictEqual(format(v), '1M');
  assert.ok(alternatives(v, 6, 4).includes('1e6'));
});

// FR-2.1, FR-2.2: prefixes and RKM
test('FR-1.2 / FR-2.1: case-sensitive prefixes, glued or after a space', () => {
  near(evaluate('1p'), 1e-12); near(evaluate('1n'), 1e-9); near(evaluate('1µ'), 1e-6); near(evaluate('1u'), 1e-6);
  near(evaluate('1m'), 1e-3); near(evaluate('1k'), 1e3); near(evaluate('1M'), 1e6); near(evaluate('1G'), 1e9);
  near(evaluate('10 n'), 1e-8);
  near(evaluate('2.2 k'), 2200);
});
test('FR-2.2: RKM 4k7, 2u2, 10R, 10r, 4R7', () => {
  near(evaluate('4k7'), 4700); near(evaluate('2u2'), 2.2e-6);
  assert.strictEqual(evaluate('10R'), 10); assert.strictEqual(evaluate('10r'), 10); assert.strictEqual(evaluate('4R7'), 4.7);
  assert.strictEqual(calc('1M5'), '1.5M');
});

// FR-2.3: precedence
test('FR-2.3: || binds tighter than ×/÷, looser than ^', () => {
  assert.strictEqual(calc('10k || 10k * 2'), '10k');
  assert.strictEqual(calc('2 * 10k || 10k'), '10k');
  assert.strictEqual(calc('10k || 10k || 10k'), '3.333k');
  near(evaluate('2^2 || 4'), 2);
  assert.strictEqual(calc('1k + 1k || 1k'), '1.5k');
  assert.strictEqual(evaluate('0 || 5'), 0);
});
test('FR-2.3: basic precedence, parentheses, right-associative power', () => {
  assert.strictEqual(evaluate('2+3*4'), 14);
  assert.strictEqual(evaluate('(2+3)*4'), 20);
  assert.strictEqual(evaluate('2^3^2'), 512);
  assert.strictEqual(evaluate('2(3+4)'), 14);
});
test('FR-2.3: unary operators bind tighter than ^ (per spec): -2^2 = 4', () => {
  assert.strictEqual(evaluate('-2^2'), 4);
  assert.strictEqual(evaluate('√16'), 4);
  assert.strictEqual(evaluate('√(9+16)'), 5);
  assert.strictEqual(evaluate('2√9'), 6);
  assert.strictEqual(evaluate('sqrt 4'), 2);
});
test('FR-1.3: π, pi, ×, ÷, −', () => {
  near(evaluate('π'), Math.PI); near(evaluate('2pi'), 2 * Math.PI); near(evaluate('2 π'), 2 * Math.PI);
  assert.strictEqual(calc('3.3k × 2 ÷ 2 − 300'), '3k');
});
test('FR-2.4: no rounding noise in output', () => {
  assert.strictEqual(calc('0.1+0.2'), '300m');
  assert.strictEqual(S.plain(evaluate('0.1+0.2')), '0.3');
});

// FR-2.5: errors never crash
test('FR-2.5: errors', () => {
  err('10nk', 'syntax'); err('1/0', 'div0'); err('1k || -1k', 'div0'); err('1)', 'syntax');
  err('()', 'syntax'); err('2*', 'incomplete'); err('', 'empty'); err('1x', 'syntax'); err('k', 'syntax');
  err('1.2.3', 'syntax'); err('√-4', 'domain'); err('1|2', 'syntax');
});
test('live input: an unclosed parenthesis at the end is allowed', () => assert.strictEqual(evaluate('2*(1+2'), 6));

// FR-3.x: formatting
test('FR-3.2: mantissa in [1, 1000)', () => {
  assert.strictEqual(format(0.001), '1m'); assert.strictEqual(format(47000), '47k');
  assert.strictEqual(format(999.99e3), '1M'); assert.strictEqual(format(-4.7e-5), '-47µ');
  assert.strictEqual(format(0), '0'); assert.strictEqual(format(1), '1');
  assert.strictEqual(format(1e20), '1e20');
});
test('FR-3.4: manual prefix shift', () => {
  assert.strictEqual(formatAt(10e-9, -6, 4), '0.01µ');
  assert.strictEqual(formatAt(10e-9, -12, 4), '10000p');
});
test('FR-3.5: nearest E-series value', () => {
  const e24 = nearestE(3.197e3, 'E24');
  assert.strictEqual(e24.label, '3.3k'); assert.strictEqual(e24.errorPct.toFixed(1), '3.2');
  assert.strictEqual(nearestE(5e3, 'E12').label, '4.7k');
  assert.strictEqual(nearestE(4.95e3, 'E96').label, '4.99k');
  assert.strictEqual(nearestE(9.6, 'E12').label, '10');
  assert.strictEqual(nearestE(-1, 'E12'), null);
  assert.strictEqual(S.SERIES.E96.length, 96);
});
