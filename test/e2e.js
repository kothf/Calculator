// Browser test of the built PWA (npm run build first). Needs Playwright with Chromium: npm run test:e2e
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = require('path').join(__dirname, '..', 'dist', 'pwa');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(d); } }); });
const calcChecks = require('./e2e-calc.js');
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(500);
  await calcChecks(p, ok);
  await p.click('#modeTabs button[data-mode="si"]');
  const key = async k => p.click(`#mode-si .key:text-is("${k}")`);
  const type = async ks => { for (const k of ks) await key(k); };
  const res = () => p.textContent('#result'); const expr = () => p.inputValue('#expr');
  ok(await res() === '1m', 'initial example 10n × 100k = 1m');
  ok((await p.textContent('#alts')).includes('1000µ'), 'alts show 1000µ');
  ok(await p.getAttribute('#expr', 'inputmode') === 'none', 'system keyboard suppressed (inputmode=none)');
  // FRS acceptance via keypad
  await key('AC'); await type(['4', 'k', '7']); await key('+'); await type(['3','3','0']);
  ok(await res() === '5.03k', '4k7 + 330 = 5.03k (keypad) got ' + await res());
  await key('AC'); await type(['1','0','k']); await key('A ∥ B'); await type(['1','0','k']); await key('×'); await key('2');
  ok(await res() === '10k', '10k || 10k × 2 = 10k got ' + await res());
  await key('AC'); await type(['1','µ']); await key('÷'); await type(['1','p']); ok(await res() === '1M', '1u ÷ 1p = 1M');
  // RKM R key, sqrt, pi, power, 1/x
  await key('AC'); await type(['4','R','7']); ok(await res() === '4.7', '4R7 = 4.7');
  await key('AC'); await type(['√','1','6']); ok(await res() === '4', '√16 = 4');
  await key('AC'); await type(['2','π']); ok(await res() === '6.283', '2π = 6.283');
  await key('AC'); await type(['2','xʸ','1','0']); ok(await res() === '1.024k', '2^10 = 1.024k');
  await key('AC'); await type(['4','k']); await key('1/x'); ok(await expr() === '1/(4k)' && await res() === '250µ', '1/x wraps expression: ' + await expr());
  // errors
  await key('AC'); await type(['1']); await key('÷'); await key('0'); ok(await res() === 'Div by 0', 'Div by 0 shown: ' + await res());
  await key('AC'); await type(['1','0','n','k']); ok(await res() === 'Two prefixes in a row', '10nk error');
  await key('AC'); await type(['2']); await key('×'); ok(await res() === '…', 'incomplete shows …');
  ok(errs.length === 0, 'no page errors ' + errs.join(';'));
  // backspace removes spaced operator in one step
  await key('⌫'); ok(await expr() === '2', 'backspace removes " × " at once: "' + await expr() + '"');
  // cursor editing
  await key('AC'); await type(['1','2','3']); await key('◀'); await key('◀'); await key('9');
  ok(await expr() === '1923', 'cursor left + insert: ' + await expr());
  await key('▶'); await key('⌫'); ok(await expr() === '193', 'cursor right + backspace: ' + await expr());
  // ENG shift
  await key('AC'); await type(['1','0','n']);
  await p.click('#engR'); ok(await res() === '0.01µ', 'ENG → 0.01µ got ' + await res());
  await p.click('#engL'); await p.click('#engL'); ok(await res() === '10000p', 'ENG ← 10000p got ' + await res());
  await key('1'); ok(await res() === '10.1n', 'shift resets on edit (10n1 is RKM 10.1n): ' + await res());
  // E-series
  await key('AC'); await type(['3','.','1','9','7','k']);
  ok((await p.textContent('#eval')).startsWith('E24: 3.3k (+3.2%)'), 'E24 3.3k +3.2%: ' + await p.textContent('#eval'));
  await p.click('#seriesSeg button[data-s="E96"]'); ok((await p.textContent('#eval')).startsWith('E96: 3.16k'), 'E96: ' + await p.textContent('#eval'));
  await p.click('#seriesSeg button[data-s="E12"]'); ok((await p.textContent('#eval')).startsWith('E12: 3.3k'), 'E12: ' + await p.textContent('#eval'));
  // copy
  await p.click('#result'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => navigator.clipboard.readText()) === '3.197k', 'tap result copies 3.197k');
  ok((await p.textContent('#toast')).startsWith('Copied'), 'toast Copied');
  // = commits and continues
  const before = await p.locator('#mode-si .h-item').count();
  await key('=');
  ok(await p.locator('#mode-si .h-item').count() === before + 1, 'history +1 on =');
  ok(await expr() === '3.197k', '= puts result in new line: ' + await expr());
  await key('×'); await key('2'); ok(await res() === '6.394k', 'continue calc: ' + await res());
  // history tap / long press
  await key('AC');
  const last = p.locator('#mode-si .h-item').last();
  await last.click(); ok(await expr() === '3.197k', 'history tap inserts result: ' + await expr());
  await key('AC');
  const bb = await last.boundingBox(); await p.mouse.move(bb.x + 10, bb.y + 5); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up();
  ok(await expr() === '3.197k', 'long press inserts expression: ' + await expr());
  // Tools sheet: one set of fields, the empty one is calculated in place
  await key('AC'); await p.click('#seriesSeg button[data-s="E24"]');
  await p.click('#mode-si .key.tools'); ok(await p.isVisible('#mode-tools'), 'Tools opens');
  await p.click('#toolTabs button[data-tab="divider"]');
  const ph = sel => p.getAttribute(sel, 'placeholder');
  const status = () => p.textContent('#toolStatus');
  ok(await ph('#tf-divider-vout') === '= 3.837V', 'empty Vout is calculated in its own field');
  ok(await p.getAttribute('#tf-divider-vout', 'class') === 'computed', 'calculated field is marked');
  ok(await p.isVisible('#tf-divider-vout-use'), 'calculated field has Use');
  ok((await p.textContent('#toolOut')).includes('816.3µA'), 'derived current shown under Also');
  await p.fill('#tf-divider-vin', '5'); ok(await ph('#tf-divider-vout') === '= 1.599V', 'recalculates live');
  // solve for a different quantity: clear R2, enter Vout
  await p.click('#tf-divider-r2 + .clear-btn'); ok(await p.inputValue('#tf-divider-r2') === '', 'clear button empties the field');
  ok((await status()).includes('Leave one field empty'), 'two unknowns explained: ' + await status());
  await p.fill('#tf-divider-vout', '3.3');
  ok(await ph('#tf-divider-r2') === '= 19.41kΩ', 'R2 calculated from Vin, R1, Vout: ' + await ph('#tf-divider-r2'));
  ok((await p.textContent('#tf-divider-r2-note')).startsWith('E24: 20kΩ gives'), 'series hint under calculated R');
  ok(!(await p.isVisible('#tf-divider-rt')), 'R1 + R2 field hidden unless picking a pair');
  await p.fill('#tf-divider-r1', '');
  ok(await p.isVisible('#tf-divider-rt'), 'R1 + R2 field shown when both R are empty');
  ok(await ph('#tf-divider-r1') === '= 4.7kΩ' && await ph('#tf-divider-r2') === '= 9.1kΩ', 'pair picked from E24');
  ok((await p.textContent('#tf-divider-vout-note')).includes('−0.09%'), 'actual Vout and error shown');
  await p.fill('#tf-divider-r1', '10k'); await p.fill('#tf-divider-r2', '4k7');
  ok((await status()).includes('Clear the field you want to calculate'), 'all filled → asks to clear one');
  ok(await p.isVisible('#toolStatus'), 'error status visible');
  // validation on blur
  await p.fill('#tf-divider-r1', '4k7 || x');
  ok(await p.getAttribute('#tf-divider-r1', 'aria-invalid') !== 'true', 'no error while typing');
  await p.click('#tf-divider-vin');
  ok(await p.getAttribute('#tf-divider-r1', 'aria-invalid') === 'true', 'invalid field marked on blur');
  ok((await p.textContent('#tf-divider-r1-err')).includes('Example'), 'field error says how to fix it');
  ok((await status()).includes('Fix R1, top'), 'status names the field to fix');
  await p.fill('#tf-divider-r1', '10k'); ok(await p.getAttribute('#tf-divider-r1', 'aria-invalid') !== 'true', 'error clears while typing a valid value');
  await p.fill('#tf-divider-vout', '');
  await p.keyboard.press('k'); ok(await p.inputValue('#expr') === '', 'typing in a tool field does not reach the calculator');
  await p.fill('#tf-divider-vout', '');
  // LED
  await p.click('#toolTabs button[data-tab="led"]');
  ok(await ph('#tf-led-r') === '= 300Ω', 'LED R calculated: ' + await ph('#tf-led-r'));
  await p.fill('#tf-led-i', '9m'); ok((await p.textContent('#tf-led-r-note')).startsWith('E24 rounded up: 360Ω'), 'LED rounds up to series');
  await p.fill('#tf-led-i', '10m');
  await p.click('#tf-led-r-use');
  ok(await p.isHidden('#mode-tools') && await p.inputValue('#expr') === '300', 'Use inserts value and goes back to SI: ' + await p.inputValue('#expr'));
  await p.click('#seriesSeg button[data-s="E12"]');
  await p.click('#mode-si .key.tools'); await p.fill('#tf-led-i', '9m');
  ok((await p.textContent('#tf-led-r-note')).startsWith('E12 rounded up: 390Ω'), 'series switch applies to tools');
  await p.fill('#tf-led-i', '10m');
  // Ohm
  await p.click('#toolTabs button[data-tab="ohm"]');
  ok(await ph('#tf-ohm-i') === '= 5mA' && await ph('#tf-ohm-p') === '= 25mW', 'Ohm: both empty fields calculated');
  ok(await p.isHidden('#toolModes'), 'single-mode tool hides the mode switch');
  await p.fill('#tf-ohm-i', '1m'); ok((await status()).includes('exactly two'), 'Ohm with three values asks for two');
  await p.fill('#tf-ohm-i', '');
  // RC / LC / reactance
  await p.click('#toolTabs button[data-tab="rc"]');
  await p.click('#toolModes button:text-is("RC filter")'); ok(await ph('#tf-rc-fc') === '= 1.592kHz', 'RC cutoff 1.592kHz');
  await p.fill('#tf-rc-fc', '1k'); await p.fill('#tf-rc-c', ''); ok(await ph('#tf-rc-c') === '= 15.92nF', 'C from R and fc: ' + await ph('#tf-rc-c'));
  await p.fill('#tf-rc-fc', ''); await p.fill('#tf-rc-c', '10n');
  await p.click('#toolModes button:text-is("X_C")'); ok(await ph('#tf-xc-x') === '= 15.92kΩ', 'X_C at 1kHz, 10nF');
  await p.click('#modeTabs button[data-mode="si"]'); ok(await p.isHidden('#mode-tools'), 'mode bar leaves Tools');
  await p.click('#mode-si .key.tools'); ok(await p.getAttribute('#toolModes button:text-is("X_C")', 'aria-pressed') === 'true', 'last tab and mode remembered');
  await p.click('#modeTabs button[data-mode="si"]'); await p.click('#seriesSeg button[data-s="E24"]');

  // physical keyboard
  await key('AC'); await p.focus('#expr'); await p.keyboard.type('100m*100M'); ok(await res() === '10M', 'physical keyboard 100m*100M = 10M');
  await p.keyboard.press('Enter'); ok(await expr() === '10M', 'Enter commits');
  await p.keyboard.press('Escape'); ok(await expr() === '', 'Escape clears');
  // history persists & capped at 50
  await p.reload(); await p.waitForTimeout(300);
  ok(await p.locator('#mode-si .h-item').count() >= 3, 'history persists after reload');
  for (let i = 0; i < 55; i++) { await p.fill('#expr', String(i)); await p.keyboard.press('Enter'); }
  ok(await p.locator('#mode-si .h-item').count() === 50, 'history capped at 50: ' + await p.locator('#mode-si .h-item').count());
  await p.click('#clearHist'); await p.reload(); await p.waitForTimeout(300);
  // after clear, seed examples come back (no stored history)
  ok(await p.locator('#mode-si .h-item').count() === 0, 'cleared history stays empty after reload');
  // haptics toggle persists
  await p.click('#hapticBtn'); await p.reload(); ok(await p.getAttribute('#hapticBtn', 'aria-pressed') === 'false', 'haptics off persists'); await p.click('#hapticBtn');
  // layout: no horizontal overflow, keypad fits
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); ok(!ov, 'no horizontal overflow');
  const eqBox = await p.locator('#mode-si .key.eq').boundingBox(); ok(eqBox.y + eqBox.height <= p.viewportSize().height, '= key visible without scroll');
  // offline via service worker
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 5000 }).catch(() => {});
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(300);
  ok(await p.locator('#expr').count() === 1, 'works offline after first load');
  await ctx.setOffline(false);
  // small phone
  const sm = await b.newPage({ viewport: { width: 320, height: 568 } }); await sm.goto('http://localhost:8765/'); await sm.waitForTimeout(300);
  const eq2 = await sm.locator('#mode-calc .key.eq').boundingBox(); ok(!(await sm.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'iPhone SE: no overflow');
  ok(eq2.y + eq2.height <= 568, 'iPhone SE: Calc = key fits ' + (eq2.y + eq2.height));
  await sm.click('#modeTabs button[data-mode="si"]'); const eq3 = await sm.locator('#mode-si .key.eq').boundingBox();
  ok(eq3.y + eq3.height <= 568, 'iPhone SE: SI = key fits ' + (eq3.y + eq3.height)); await sm.screenshot({ path: require('path').join(require('os').tmpdir(), 'prefixcalc-se.png') });
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
})();
