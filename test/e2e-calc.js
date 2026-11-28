// Browser checks of the Calc mode (natural display). Called from e2e.js with a page on a fresh profile.
module.exports = async function calcChecks(p, ok) {
  const k = a => p.click(`#mode-calc .key[data-a="${a}"]`);
  const keys = async list => { for (const a of list) await k(a); };
  const digits = async s => { for (const c of s) await k('sym:' + c); };
  const expr = () => p.textContent('#cExpr');
  const res = () => p.textContent('#cRes');
  const alt = () => p.textContent('#cAlt');
  ok(await p.isVisible('#mode-calc'), 'Calc is the first screen');
  ok(await p.getAttribute('#modeTabs button[data-mode="calc"]', 'aria-selected') === 'true', 'Calc tab selected');
  ok((await res()) === '12', 'first screen: 1/3 + 1/6 = 1/2 as a stacked fraction: ' + await res());
  ok(await p.locator('#cRes .t-frac').count() === 1, 'result drawn as a fraction');
  // fraction takes the number before it, ▼ ▲ move between numerator and denominator
  await k('ac'); await digits('2'); await k('tpl:frac'); ok(await p.locator('#cExpr .t-den .caret').count() === 1, 'fraction: 2 goes up, cursor in the denominator');
  await digits('3'); await k('up'); ok(await p.locator('#cExpr .t-num .caret').count() === 1, '▲ moves to the numerator');
  await k('right'); await k('right'); await k('right'); await k('tpl:inv');
  ok(await res() === '32', '(2/3)⁻¹ = 3/2: ' + await res());
  await k('sd'); ok(await res() === '1.5', 'S⇔D shows 1.5'); await k('sd');
  // surds, π, trig
  await k('ac'); await k('tpl:sqrt'); await digits('8'); await k('eq');
  ok(await p.locator('#cRes .t-sqrt').count() === 1 && (await res()) === '22', '√8 = 2√2 after =: ' + await res());
  ok((await alt()).includes('2.828427125'), 'decimal shown under exact form');
  await k('ac'); await k('fn:cos'); await digits('30'); await k('eq'); ok(await res() === '32', 'cos 30 = √3/2');
  await k('ac'); await p.click('#angleBtn'); ok(await p.textContent('#angleBtn') === 'RAD', 'angle switches to RAD');
  await k('fn:sin'); await k('sym:π'); await k('tpl:frac'); await digits('6'); ok(await res() === '12', 'sin(π/6) = 1/2 in RAD');
  await p.click('#angleBtn'); await p.click('#angleBtn'); ok(await p.textContent('#angleBtn') === 'DEG', 'back to DEG');
  // precedence
  await k('ac'); await keys(['sym:−']); await digits('2'); await k('tpl:sq'); ok(await res() === '−4', '−2² = −4: ' + await res());
  await k('ac'); await digits('1'); await k('sym:÷'); await digits('2'); await k('sym:π'); ok((await res()).startsWith('0.1591549431'), '1÷2π = 1/(2π)');
  // SHIFT layer: log base, x!
  await k('ac'); await k('shift'); ok(await p.isVisible('#indS'), 'SHIFT indicator'); await k('fn:log');
  await digits('2'); await k('right'); await digits('8'); ok(await res() === '3', 'log₂ 8 = 3: ' + await res());
  await k('ac'); await digits('5'); await k('shift'); await k('tpl:inv'); ok(await res() === '120', 'SHIFT x⁻¹ = x!: 5! = 120');
  // errors
  await k('ac'); await digits('1'); await k('sym:÷'); await digits('0'); await k('eq'); ok(await res() === "Can't divide by 0", 'div by 0 message');
  await k('ac'); await digits('2'); await k('sym:+'); ok(await res() === '…', 'incomplete shows … while typing');
  // = then operator continues with Ans
  await k('ac'); await digits('6'); await k('eq'); await k('sym:×'); await digits('7');
  ok((await expr()).startsWith('Ans×7') && await res() === '42', 'operator after = continues from Ans: ' + await expr());
  await k('eq'); await digits('5'); ok(await expr() === '5', 'digit after = starts a new line');
  // backspace: after a template moves in; at slot start unwraps
  await k('ac'); await digits('1'); await k('tpl:frac'); await digits('2'); await k('right');
  await k('bs'); ok(await p.locator('#cExpr .t-den .caret').count() === 1, '⌫ after a fraction moves into it');
  await k('bs'); await k('bs'); ok(await expr() === '1', '⌫ at the start of a slot removes the template: ' + await expr());
  // tap places the cursor
  await k('ac'); await digits('123'); await p.click('#cExpr .d >> nth=0', { position: { x: 1, y: 5 } });
  await digits('9'); ok(await expr() === '9123', 'tap places the cursor: ' + await expr());
  // ENG with SI letter, send to SI
  await k('ac'); await digits('12345'); await k('eng'); ok((await res()).startsWith('12.345×103') && (await res()).endsWith('k'), 'ENG 12.345×10³ k: ' + await res());
  await k('ac'); await digits('0.0047'); await p.click('#cAlt .send');
  ok(await p.isVisible('#mode-si') && await p.inputValue('#expr') === '10n × 100k4.7m', 'SI → button inserts 4.7m into SI: ' + await p.inputValue('#expr'));
  await p.fill('#expr', '10n × 100k');
  await p.click('#modeTabs button[data-mode="calc"]');
  // variables: STO then use
  await k('ac'); await digits('7'); await k('shift'); await k('var'); await p.click('.varpanel button.v:has(b:text-is("A"))');
  await k('ac'); await digits('2'); await k('var'); await p.click('.varpanel button.v:has(b:text-is("A"))'); ok(await res() === '14', 'STO A then 2A = 14: ' + await res());
  // keyboard
  await k('ac'); await p.keyboard.type('3/4'); await p.keyboard.press('ArrowRight'); await p.keyboard.type('+1'); await p.keyboard.press('Enter');
  ok(await res() === '74', 'keyboard: 3/4 + 1 = 7/4: ' + await res());
  // history
  ok(await p.locator('#cHistory .h-item').count() >= 5, 'history keeps = lines');
  await k('ac'); await p.locator('#cHistory .h-item').last().click(); ok(await res() === '74', 'history tap inserts exact value');
  await k('ac');
};
