// Builds two outputs from web/app.src.html + src/si.js + src/tools.js + src/natural.js + src/units.js:
//   dist/app.html  – page fragment (no <html>/<head>), used for the claude.ai artifact preview
//   dist/pwa/      – standalone installable PWA (index.html + manifest + service worker + icon), works offline
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web/app.src.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src/si.js'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'src/tools.js'), 'utf8');
const nat = fs.readFileSync(path.join(root, 'src/natural.js'), 'utf8');
const units = fs.readFileSync(path.join(root, 'src/units.js'), 'utf8');
const fragment = src.replace('/*__SI_JS__*/', () => core).replace('/*__TOOLS_JS__*/', () => tools).replace('/*__NAT_JS__*/', () => nat).replace('/*__UNITS_JS__*/', () => units);
const dist = path.join(root, 'dist');
const pwa = path.join(dist, 'pwa');
fs.mkdirSync(pwa, { recursive: true });
fs.writeFileSync(path.join(dist, 'app.html'), fragment);

fs.copyFileSync(path.join(root, 'web/haptics-test.html'), path.join(pwa, 'haptics-test.html'));
for (const f of ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(root, 'web/icons', f), path.join(pwa, f));
fs.writeFileSync(path.join(pwa, 'manifest.webmanifest'), JSON.stringify({
  name: 'PrefixCalc', short_name: 'PrefixCalc', start_url: './', scope: './', display: 'standalone',
  background_color: '#000000', theme_color: '#000000',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
  ]
}, null, 2));
const version = require('crypto').createHash('sha1')
  .update(fragment + ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'].map(f => fs.readFileSync(path.join(root, 'web/icons', f), 'base64')).join('')).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(pwa, 'sw.js'), `const C='prefixcalc-${version}';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html')));return;}
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));});
`);
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-title" content="PrefixCalc">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>html,body{height:100%;margin:0;overflow:hidden}body{position:fixed;top:0;left:0;right:0;height:var(--app-h,100%);font-size:14px}.shell{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html.standalone .shell{padding-top:calc(env(safe-area-inset-top,0px) + 12px);padding-bottom:6px}html.standalone .chist{min-height:0}html.standalone .key.f{height:38px}html.standalone .ckeys .key{height:48px}html{background:#eef0f2}@media (prefers-color-scheme:dark){html{background:#000}}[hidden]{display:none!important}</style>
<script>
// iOS home-screen apps can report a viewport shorter than the screen (the status bar height is lost at the
// bottom). The app is one fixed screen, so size it to the full screen when it runs standalone.
(function () {
  var standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  // iOS 26 blurs the strip under the status bar of a home-screen app; .standalone moves the mode bar below it
  if (standalone) document.documentElement.classList.add('standalone');
  function fit() {
    var h = window.innerHeight;
    if (standalone) {
      var portrait = window.innerWidth < window.innerHeight;
      var sh = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      if (sh > h) h = sh;
    }
    document.documentElement.style.setProperty('--app-h', h + 'px');
  }
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', function () { setTimeout(fit, 300); });
})();
</script>
</head>
<body>
`;
const tail = `
<script>
// Hidden screen diagnostics: hold the Haptics button for 1.5 s. Frames show where each height ends:
// red = fixed inset 0, green = 100lvh, blue = 100dvh, yellow = screen.height.
(function () {
  var btn = document.getElementById('hapticBtn'), t = null;
  if (!btn) return;
  var held = false;
  btn.addEventListener('pointerdown', function () { held = false; t = setTimeout(function () { held = true; show(); }, 1500); });
  // a long press must not also toggle haptics
  document.addEventListener('click', function (e) { if (held && e.target === btn) { held = false; e.stopPropagation(); } }, true);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (e) { btn.addEventListener(e, function () { clearTimeout(t); }); });
  function frame(css, color) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;pointer-events:none;z-index:99;box-sizing:border-box;border:3px solid ' + color + ';' + css;
    document.documentElement.appendChild(d); return d;
  }
  function show() {
    if (document.getElementById('diag')) { document.querySelectorAll('.diagf, #diag').forEach(function (e) { e.remove(); }); return; }
    var f = [frame('bottom:0', 'red'), frame('height:100lvh;border-width:0 0 6px', 'lime'), frame('height:100dvh;border-width:0 0 9px', 'dodgerblue'),
      frame('height:' + screen.height + 'px;border-width:0 0 12px', 'yellow')];
    f.forEach(function (e) { e.className = 'diagf'; });
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe), vv = window.visualViewport;
    var rows = [
      ['standalone', String(!!(navigator.standalone || matchMedia('(display-mode: standalone)').matches))],
      ['screen', screen.width + '×' + screen.height + ' @' + devicePixelRatio],
      ['inner', innerWidth + '×' + innerHeight], ['outer', outerWidth + '×' + outerHeight],
      ['visualViewport', vv ? Math.round(vv.width) + '×' + Math.round(vv.height) + ' top ' + Math.round(vv.offsetTop) : '—'],
      ['clientHeight', document.documentElement.clientHeight],
      ['body', Math.round(document.body.getBoundingClientRect().height)], ['--app-h', document.documentElement.style.getPropertyValue('--app-h')],
      ['safe area t/r/b/l', [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' ')],
      ['100lvh / 100dvh / 100svh', ['lvh', 'dvh', 'svh'].map(function (u) { var x = document.createElement('div'); x.style.cssText = 'position:absolute;height:100' + u; document.body.appendChild(x); var h = x.getBoundingClientRect().height; x.remove(); return Math.round(h); }).join(' / ')],
      ['UA', navigator.userAgent.replace('Mozilla/5.0 ', '')]
    ];
    probe.remove();
    var box = document.createElement('div'); box.id = 'diag';
    box.style.cssText = 'position:fixed;left:12px;right:12px;top:30%;z-index:100;background:#fff;color:#000;font:13px/1.4 ui-monospace,Menlo,monospace;padding:12px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    box.innerHTML = '<b>Screen diagnostics</b> (hold Haptics again to close)<br>' + rows.map(function (r) { return r[0] + ': ' + String(r[1]).replace(/</g, '&lt;'); }).join('<br>') +
      '<br><span style="color:red">red</span> fixed · <span style="color:green">green</span> lvh · <span style="color:dodgerblue">blue</span> dvh · <span style="color:#b90">yellow</span> screen';
    document.body.appendChild(box);
  }
})();
</script>
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});</script>
</body>
</html>
`;
fs.writeFileSync(path.join(pwa, 'index.html'), head + fragment + tail);
console.log('Built dist/app.html and dist/pwa/ (cache ' + version + ')');
