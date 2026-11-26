// Builds two outputs from web/app.src.html + src/si.js:
//   dist/app.html  – page fragment (no <html>/<head>), used for the claude.ai artifact preview
//   dist/pwa/      – standalone installable PWA (index.html + manifest + service worker + icon), works offline
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web/app.src.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src/si.js'), 'utf8');
const fragment = src.replace('/*__SI_JS__*/', () => core);
const dist = path.join(root, 'dist');
const pwa = path.join(dist, 'pwa');
fs.mkdirSync(pwa, { recursive: true });
fs.writeFileSync(path.join(dist, 'app.html'), fragment);

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#000"/><text x="256" y="330" font-family="Menlo,monospace" font-size="230" font-weight="600" text-anchor="middle" fill="#ffb547">µk</text></svg>`;
fs.writeFileSync(path.join(pwa, 'icon.svg'), icon);
fs.writeFileSync(path.join(pwa, 'manifest.webmanifest'), JSON.stringify({
  name: 'PrefixCalc', short_name: 'PrefixCalc', start_url: './', scope: './', display: 'standalone',
  background_color: '#000000', theme_color: '#000000',
  icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
}, null, 2));
const version = require('crypto').createHash('sha1').update(fragment).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(pwa, 'sw.js'), `const C='prefixcalc-${version}';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));});
`);
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box;height:100%}body{margin:0;font-size:14px}[hidden]{display:none!important}</style>
</head>
<body>
`;
const tail = `
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});</script>
</body>
</html>
`;
fs.writeFileSync(path.join(pwa, 'index.html'), head + fragment + tail);
console.log('Built dist/app.html and dist/pwa/ (cache ' + version + ')');
