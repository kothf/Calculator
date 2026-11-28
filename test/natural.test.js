const test = require('node:test');
const assert = require('node:assert');
const N = require('../src/natural.js');

// Build a tree from a compact spec: strings become symbols (one per char, multi-char names in {}), arrays are templates.
function ed() { return new N.Editor(); }
function type(e, keys) {
  for (const k of keys) {
    if (k === 'frac') e.insertTemplate('frac');
    else if (k === 'pow') e.insertTemplate('pow');
    else if (k === 'sq') e.insertTemplate('pow', [[N.sym('2')]]);
    else if (k === 'inv') e.insertTemplate('pow', [[N.sym('−'), N.sym('1')]]);
    else if (k === 'sqrt') e.insertTemplate('sqrt');
    else if (k === 'cbrt') e.insertTemplate('root', [[N.sym('3')]]);
    else if (k === 'logb') e.insertTemplate('logb');
    else if (k === 'abs') e.insertTemplate('abs');
    else if (k === 'x10') e.insertTemplate('x10');
    else if (k === '>') e.right();
    else if (k === '<') e.left();
    else if (k === 'v') e.vertical(1);
    else if (k === '^') e.vertical(-1);
    else if (k === 'bs') e.backspace();
    else if (N.FUNCS.includes(k)) e.insertFunc(k);
    else if (['π', 'Ans', 'nCr', 'nPr', 'A', 'X'].includes(k)) e.insert(k);
    else for (const c of k) e.insert(c);
  }
  return e;
}
function show(v, opts) {
  const f = N.forms(v, opts);
  return { exact: f.exact && N.rowToString(f.exact), dec: N.rowToString(f.decimal) };
}
function calc(keys, env) { return show(N.evaluate(type(ed(), keys).root, env || { angle: 'deg' })); }

test('fraction takes the operand before the cursor as numerator', () => {
  const e = type(ed(), ['1', 'frac', '3']);
  assert.strictEqual(N.toText(e.root), '1/3');
  assert.deepStrictEqual(e.path, [[0, 1]]);
});
test('fraction with nothing before starts in the numerator', () => {
  const e = type(ed(), ['frac', '1', 'v', '3', '>', '+', '1', 'frac', '6']);
  assert.strictEqual(N.toText(e.root), '1/3+1/6');
  assert.deepStrictEqual(calc(['frac', '1', 'v', '3', '>', '+', '1', 'frac', '6']), { exact: '1/2', dec: '0.5' });
});
test('right arrow leaves a template, left enters from the end', () => {
  const e = type(ed(), ['2', 'frac', '3', '>']);
  assert.deepStrictEqual([e.path, e.i], [[], 1]);
  e.left(); assert.deepStrictEqual([e.path, e.i], [[[0, 1]], 1]);
});
test('backspace after a template moves into it; at slot start it unwraps', () => {
  const e = type(ed(), ['1', 'frac', '2', '>']);
  e.backspace(); assert.deepStrictEqual(e.path, [[0, 1]]);
  e.backspace(); assert.strictEqual(N.toText(e.root), '1/');
  e.backspace(); assert.strictEqual(N.toText(e.root), '1');
});
test('empty template is deleted by backspace', () => {
  const e = type(ed(), ['5', '+', 'sqrt']);
  e.backspace(); assert.strictEqual(N.toText(e.root), '5+');
});
test('power attaches to a parenthesised group as numerator capture', () => {
  const e = type(ed(), ['(', '1', '+', '2', ')', 'frac', '3']);
  assert.strictEqual(N.toText(e.root), '((1+2))/3');
  assert.strictEqual(calc(['(', '1', '+', '2', ')', 'frac', '3']).exact, null);
  assert.strictEqual(calc(['(', '1', '+', '2', ')', 'frac', '3']).dec, '1');
});

const cases = [
  [['sqrt', '8'], '2√2', '2.828427125'],
  [['sqrt', '1', '2', '>', 'frac', '3'], '(2√3)/3', '1.154700538'],
  [['sin', '3', '0'], '1/2', '0.5'],
  [['cos', '3', '0'], '√3/2', '0.8660254038'],
  [['2', 'π', 'frac', '4'], 'π/2', '1.570796327'],
  [['2', 'frac', '3', '>', 'inv'], '3/2', '1.5'],
  [['frac', '2', 'v', '3', '>', 'pow', '3'], '8/27', '0.2962962963'],
];
for (const [keys, ex, dec] of cases) {
  test('exact: ' + keys.join(' ') + ' = ' + ex, () => assert.deepStrictEqual(calc(keys), { exact: ex, dec }));
}
const decs = [
  [['−', '2', 'sq'], '-4'],
  [['1', '÷', '2', 'π'], '0.1591549431'],
  [['2', 'pow', '1', '0'], '1024'],
  [['logb', '2', '>', '8'], '3'],
  [['5', '!'], '120'],
  [['5', 'nCr', '2'], '10'],
  [['5', 'nPr', '2'], '20'],
  [['log', '1', '0', '0', '0'], '3'],
  [['ln', '1'], '0'],
  [['sin', '1', '8', '0'], '0'],
  [['cbrt', '−', '8'], '-2'],
  [['2', 'x10', '3', '>', '÷', '4'], '500'],
  [['5', '0', '%'], '0.5'],
  [['abs', '−', '3'], '3'],
  [['2', '(', '3', '+', '4', ')'], '14'],
  [['1', '.', '5', '+', '2', '.', '2', '5'], '3.75'],
  [['1', 'x10', '1', '2'], '1×10^12'],
  [['1', '÷', '3'], '0.3333333333'],
];
for (const [keys, dec] of decs) {
  test('value: ' + keys.join(' ') + ' = ' + dec, () => assert.strictEqual(calc(keys).dec, dec));
}
test('DEG vs RAD', () => {
  assert.strictEqual(calc(['sin', 'π', 'frac', '6'], { angle: 'rad' }).exact, '1/2');
  assert.strictEqual(calc(['asin', '1'], { angle: 'rad' }).exact, 'π/2');
  assert.strictEqual(calc(['asin', '1'], { angle: 'deg' }).dec, '90');
  assert.strictEqual(calc(['cos', '1', '0', '0'], { angle: 'gra' }).dec, '0');
});
const errors = [
  [['1', '÷', '0'], 'div0'], [['sqrt', '−', '1'], 'domain'], [['ln', '0'], 'domain'], [['tan', '9', '0'], 'div0'],
  [['0', '.', '5', '!'], 'domain'], [['2', '+'], 'incomplete'], [['frac'], 'incomplete'], [['×', '2'], 'syntax'],
];
for (const [keys, code] of errors) {
  test('error ' + code + ': ' + keys.join(' '), () => assert.throws(() => N.evaluate(type(ed(), keys).root, { angle: 'deg' }), e => e.code === code));
}
test('Ans and variables', () => {
  const env = { angle: 'deg', ans: N.freeze(N.evaluate(type(ed(), ['frac', '1', 'v', '3']).root)), vars: { A: { n: '5', d: '1' } } };
  assert.strictEqual(calc(['Ans', '×', '3'], env).dec, '1');
  assert.strictEqual(calc(['2', 'A'], env).dec, '10');
});
test('mixed fraction display', () => {
  const v = N.evaluate(type(ed(), ['1', '1', 'frac', '6']).root);
  assert.strictEqual(show(v, { mixed: true }).exact, '15/6'.replace('15/6', '1' + '5/6'));
});
test('ENG steps by thousands with SI letter', () => {
  const a = N.eng(12345, 0); assert.strictEqual(N.rowToString(a.row), '12.345×10^3'); assert.strictEqual(a.prefix, 'k');
  const b = N.eng(12345, 1); assert.strictEqual(N.rowToString(b.row), '0.012345×10^6'); assert.strictEqual(b.prefix, 'M');
  assert.strictEqual(N.rowToString(N.eng(0.0047, 0).row), '4.7×10^(-3)');
});
test('vertical moves between numerator and denominator', () => {
  const e = type(ed(), ['frac', '1', '2']);
  e.vertical(1); assert.deepStrictEqual(e.path, [[0, 1]]);
  e.vertical(-1); assert.deepStrictEqual(e.path, [[0, 0]]);
});
