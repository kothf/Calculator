# PrefixCalc

A calculator for electronics engineers: a scientific calculator with natural textbook display, plus an SI-prefix calculator (`10n * 100k = 1m`) and circuit tools, in one app.

**Try it:** https://kothf.github.io/prefix_calc/

It is a web app (PWA). It runs in the browser on iPhone and Android, can be installed to the home screen and works offline. The math cores (`src/*.js`) have no UI dependencies.

## Modes

The mode bar at the top switches between:

- **Calc**: scientific calculator with natural display. Fractions are stacked, roots have a radical sign, exponents are raised, as you would write them on paper. Results are exact where possible (1/3 + 1/6 = 1/2, √8 = 2√2, sin 30° = 1/2, 2π/4 = π/2); S⇔D switches to the decimal.
  - Templates: fraction, power (x², x³, x⁻¹, xʸ, 10ˣ, eˣ), √, ∛, ˣ√, log with any base, Abs, ×10ˣ.
  - Functions: sin, cos, tan and inverses, hyperbolic (hyp), log, ln, x!, nCr, nPr, %, Ran#, π, e.
  - Cursor: ◀ ▶ ▲ ▼, tap on the expression, or swipe. ⌫ right after a template steps into it; at the start of a slot it removes the template and keeps its contents.
  - Ans, variables A–F, X, Y, M (VAR inserts, SHIFT VAR = STO stores the result, M+ / M−). DEG / RAD / GRA.
  - ENG shows the result with an exponent that is a multiple of 3 and its SI letter; the `SI … →` button sends the value to the SI mode.
  - School precedence: −2² = −4, 1÷2π = 1/(2π).
- **SI**: the SI-prefix calculator (details below).
- **Tools**: voltage divider, RC/LC, LED resistor, Ohm's law. **Use** sends a value back to the mode you came from.

Spec: [FRS for the natural-display calculator](https://claude.ai/artifact/AcqSq5xUik52hkEdxWATqi).

## SI mode


- Case-sensitive SI prefixes: `p n µ(u) m k M G` (plus `f`, `T`, and `K` for kilo). `m` is milli, `M` is mega.
- A prefix can follow the number directly or after a space: `10n` and `10 n`.
- RKM notation for component values: `4k7` = 4.7k, `2u2` = 2.2µ, `4R7` = 4.7, `10R` = 10.
- Operators `+ − × ÷ ^ √ ( )`, `1/x`, `π`, and the parallel operator `||`: `A || B = A·B/(A+B)`.
- Precedence follows the spec (weakest to strongest): `+ −` → `× ÷` → `||` → `^` → unary `−`, `√` → parentheses and numbers. So `10k || 10k * 2 = 10k` and `-2^2 = 4`.
- Live result in engineering notation (mantissa from 1 to 1000), with the next lower prefix, plain decimal and scientific forms.
- Manual prefix shift (ENG ‹ › buttons, or swipe the result).
- Nearest standard value from the E12/E24/E96 series, with the error in percent.
- History of the last 50 calculations: tap inserts the result, long press inserts the expression. Tap the result to copy it.
- Custom keypad instead of the system keyboard. Move the cursor by tapping, with ◀ ▶, or by swiping the expression. A hardware keyboard works directly (Enter = `=`, Esc = clear).
- The **Tools** key (next to A ∥ B) opens the Tools mode. Each tool is one set of fields: fill in what you know and leave empty what you want to find; the result appears in that same field, with a **Use** button that drops it into the calculator.
  - Divider: Vin, Vout, R1, R2, any one empty. Leave R1 and R2 both empty to pick a standard pair from the selected series (with the total resistance you want).
  - RC filter (R, C, fc), LC resonance (L, C, f₀), X_C (f, C, X_C), X_L (f, L, X_L): any one empty.
  - LED: Vs, Vf, I, R, any one empty. A calculated R also shows the next series value up and the current it gives.
  - Ohm's law: any two of V, I, R, P.
  - Derived values (current, power, τ, √(L/C)) are listed under "Also". Fields accept calculator input: `4k7`, `10n`, `4k7 || 10k`.
- Haptic feedback on key press (all modes): Vibration API on Android, the system switch haptic on iOS 18+ (toggle with the Haptics button).
- Light and dark themes (pure black for OLED), works offline.

## Development

```sh
npm test          # parser tests, including the acceptance table from the spec
npm run build     # builds dist/pwa/ (the PWA) and dist/app.html
npm run test:e2e  # browser checks of the built app (needs Playwright with Chromium)
```

## Install on a phone

Every push to `main` deploys the PWA to GitHub Pages: https://kothf.github.io/prefix_calc/

- iPhone: open the link in Safari → Share → Add to Home Screen.
- Android: open it in Chrome → menu → Install app.

After the first launch the app works without internet.

## Project layout

| Path | Contents |
| --- | --- |
| `src/natural.js` | Calc mode core: expression tree, cursor editing, exact evaluation (fractions, surds, π), result forms. No dependencies. |
| `src/si.js` | SI mode: parser, evaluation, formatting, E-series. No dependencies. |
| `src/tools.js` | Divider, RC/LC, LED resistor, Ohm's law. Depends only on `si.js`. |
| `test/*.test.js` | Unit tests (`node:test`). |
| `test/e2e.js`, `test/e2e-calc.js` | Browser checks of the built app. |
| `web/app.src.html` | The UI: mode shell, Calc, SI and Tools. The `src/*.js` cores are inlined into it at build time. |
| `web/icons/` | App icon (SVG and PNG 180/192/512). |
| `scripts/build.js` | PWA build. |

## Units mode

Converts 20 engineering quantities between metric and imperial (inch-pound) units with SI prefixes, plus decibels (dB, dBm, dBV, dBu, dBµV) and conductor sizing (PCB trace width by IPC-2221, AWG wire gauge, voltage drop). Core logic: `src/units.js`, tests: `test/units.test.js`.

## Adding a mode

Every mode registers itself with the shell in `web/app.src.html`:

```js
PC.register({
  id: 'units', title: 'Units',          // tab label in the mode bar
  el: document.getElementById('mode-units'), // <div class="mode" id="mode-units" hidden> inside .shell
  show: function () {},                 // called when the tab is opened
  accept: function (number) {},         // optional: receive a value (makes it a target for Tools "Use")
  clearHistory: function () {}          // optional: shows the Clear button for this mode
});
```

Tabs appear in registration order. Shared helpers: `PC.buzz()` (haptics), `PC.toast(text)`, `PC.store.get/set` (localStorage), `PC.send(modeId, number)` (switch to a mode and insert a value), `PC.ans` (last result). A new core file is inlined by `scripts/build.js` like `si.js` and `tools.js`.

## Next steps

- Native version (Expo/React Native) with full system haptics.
