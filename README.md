# PrefixCalc

An engineering calculator for electronics that understands SI prefixes: `10n * 100k = 1m`.

**Try it:** https://kothf.github.io/prefix_calc/

This is an MVP built as a web app (PWA). It runs in the browser on iPhone and Android and can be installed to the home screen. The math core (`src/si.js`) has no UI dependencies, so it can move unchanged into a future native version (React Native/Expo).

## Features

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
- Haptic feedback on key press: Vibration API on Android, the system switch haptic on iOS 18+ (toggle with the Haptics button).
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
| `src/si.js` | Parser, evaluation, formatting, E-series. No dependencies. |
| `test/si.test.js` | Unit tests (`node:test`). |
| `test/e2e.js` | Browser checks of the built app. |
| `web/app.src.html` | The UI. `src/si.js` is inlined into it at build time. |
| `web/icons/` | App icon (SVG and PNG 180/192/512). |
| `scripts/build.js` | PWA build. |

## Next steps

- Phase 2 of the spec: RC/LC calculator, X<sub>C</sub>/X<sub>L</sub>, voltage divider picker.
- Native version (Expo/React Native) with full system haptics.
