const test = require('node:test');
const assert = require('node:assert');
const G = require('../src/games.js');

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('code: secret has distinct digits', () => {
  for (let k = 0; k < 50; k++) {
    const st = G.codeNew(4, seeded(k));
    assert.strictEqual(st.secret.length, 4);
    assert.strictEqual(new Set(st.secret).size, 4);
  }
});

test('code: scoring and win', () => {
  assert.deepStrictEqual(G.codeScore('1234', '1243'), { exact: 2, near: 2 });
  assert.deepStrictEqual(G.codeScore('1234', '5678'), { exact: 0, near: 0 });
  const st = { secret: '1234', len: 4, guesses: [], won: false };
  assert.strictEqual(G.codeGuess(st, '12'), 'Enter 4 digits');
  assert.strictEqual(G.codeGuess(st, '1123'), 'Digits must all differ');
  assert.strictEqual(G.codeGuess(st, '4321'), null);
  assert.deepStrictEqual(st.guesses[0], { guess: '4321', exact: 0, near: 4 });
  assert.strictEqual(G.codeGuess(st, '1234'), null);
  assert.ok(st.won);
  assert.strictEqual(G.codeGuess(st, '1234'), 'Already solved');
});

test('flip: press toggles cross, new board is not solved', () => {
  const c = new Array(9).fill(0);
  G.flipPress(c, 3, 4);
  assert.deepStrictEqual(c, [0, 1, 0, 1, 1, 1, 0, 1, 0]);
  G.flipPress(c, 3, 0);
  assert.deepStrictEqual(c, [1, 0, 0, 0, 1, 1, 0, 1, 0]);
  const st = G.flipNew(5, seeded(3));
  assert.ok(st.cells.some(Boolean));
});

test('flip: undoing a press solves it', () => {
  const st = { n: 5, cells: new Array(25).fill(0), moves: 0, won: false };
  G.flipPress(st.cells, 5, 7);
  G.flipTap(st, 7);
  assert.ok(st.won);
  assert.strictEqual(st.moves, 1);
});

test('slide: shuffled, solvable by parity, tap moves a run', () => {
  for (let k = 0; k < 20; k++) {
    const st = G.slideNew(4, seeded(k));
    assert.ok(!G.slideIsSolved(st.tiles));
    // solvability for even width: inversions + row of gap from bottom (1-based) is odd
    const t = st.tiles.filter(Boolean); let inv = 0;
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i] > t[j]) inv++;
    const rowFromBottom = 4 - Math.floor(st.tiles.indexOf(0) / 4);
    assert.strictEqual((inv + rowFromBottom) % 2, 1);
  }
  const st = { n: 4, tiles: G.slideSolved(4), moves: 0, won: false };
  // gap at 15; tap 12 (same row, three away) slides 13,14,15 right
  assert.ok(G.slideTap(st, 12));
  assert.deepStrictEqual(st.tiles.slice(12), [0, 13, 14, 15]);
  assert.strictEqual(st.moves, 3);
  assert.strictEqual(G.slideTap(st, 5), false);
  assert.ok(G.slideTap(st, 15));
  assert.ok(st.won);
});
