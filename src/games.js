// PrefixCalc hidden logic games (opened by holding the Haptics button). Pure state functions, no DOM.
//   code  - guess a secret of distinct digits; each guess scores exact (right digit, right place) and near.
//   flip  - tapping a cell flips it and its four neighbours; switch every cell off.
//   slide - sliding tiles: put 1..15 in order with the gap last.
// Browser: window.GAMES, Node: module.exports. rnd() is injectable for tests.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.GAMES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function pick(n, rnd) { return Math.floor((rnd || Math.random)() * n); }

  // ---------- code ----------
  function codeNew(len, rnd) {
    len = len || 4;
    var d = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], s = '';
    for (var i = 0; i < len; i++) s += d.splice(pick(d.length, rnd), 1)[0];
    return { secret: s, len: len, guesses: [], won: false };
  }
  function codeScore(secret, guess) {
    var exact = 0, near = 0;
    for (var i = 0; i < guess.length; i++) {
      if (guess[i] === secret[i]) exact++;
      else if (secret.indexOf(guess[i]) >= 0) near++;
    }
    return { exact: exact, near: near };
  }
  // returns an error string, or null after recording the guess
  function codeGuess(st, guess) {
    if (st.won) return 'Already solved';
    if (!/^\d+$/.test(guess) || guess.length !== st.len) return 'Enter ' + st.len + ' digits';
    if (new Set(guess).size !== guess.length) return 'Digits must all differ';
    var sc = codeScore(st.secret, guess);
    st.guesses.push({ guess: guess, exact: sc.exact, near: sc.near });
    if (sc.exact === st.len) st.won = true;
    return null;
  }

  // ---------- flip ----------
  function flipPress(cells, n, i) {
    var r = Math.floor(i / n), c = i % n;
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) cells[rr * n + cc] ^= 1;
    });
  }
  // start from the solved board and press random cells, so every puzzle is solvable
  function flipNew(n, rnd) {
    n = n || 5;
    var cells = new Array(n * n).fill(0), presses = 0;
    while (cells.every(function (x) { return !x; })) {
      for (var k = 0; k < n * n; k++) if (pick(2, rnd)) { flipPress(cells, n, k); presses++; }
    }
    return { n: n, cells: cells, moves: 0, won: false };
  }
  function flipTap(st, i) {
    if (st.won) return;
    flipPress(st.cells, st.n, i); st.moves++;
    st.won = st.cells.every(function (x) { return !x; });
  }

  // ---------- slide ----------
  function slideSolved(n) { var t = []; for (var i = 1; i < n * n; i++) t.push(i); t.push(0); return t; }
  function slideNeighbours(n, i) {
    var r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
    return out;
  }
  // random walk of the gap from the solved state keeps it solvable
  function slideNew(n, rnd) {
    n = n || 4;
    var t = slideSolved(n), gap = t.length - 1, prev = -1;
    do {
      for (var k = 0; k < 200; k++) {
        var nb = slideNeighbours(n, gap).filter(function (j) { return j !== prev; });
        var j = nb[pick(nb.length, rnd)];
        t[gap] = t[j]; t[j] = 0; prev = gap; gap = j;
      }
    } while (slideIsSolved(t));
    return { n: n, tiles: t, moves: 0, won: false };
  }
  function slideIsSolved(t) { for (var i = 0; i < t.length - 1; i++) if (t[i] !== i + 1) return false; return true; }
  // tapping a tile in the gap's row or column slides the whole run toward the gap
  function slideTap(st, i) {
    if (st.won) return false;
    var n = st.n, t = st.tiles, gap = t.indexOf(0);
    if (i === gap) return false;
    var gr = Math.floor(gap / n), gc = gap % n, r = Math.floor(i / n), c = i % n, step;
    if (r === gr) step = c < gc ? -1 : 1;
    else if (c === gc) step = r < gr ? -n : n;
    else return false;
    while (gap !== i) { t[gap] = t[gap + step]; gap += step; st.moves++; }
    t[i] = 0;
    st.won = slideIsSolved(t);
    return true;
  }

  return {
    codeNew: codeNew, codeScore: codeScore, codeGuess: codeGuess,
    flipNew: flipNew, flipTap: flipTap, flipPress: flipPress,
    slideNew: slideNew, slideTap: slideTap, slideIsSolved: slideIsSolved, slideSolved: slideSolved
  };
});
