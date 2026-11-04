// Uygulama dosyalarını telefonda saklar: internet yokken de açılır.
// Dosyalarda değişiklik yaptığınızda SURUM numarasını artırın.
const SURUM = 'sx-kayit-v6';
const DOSYALAR = ['./', './index.html', './style.css', './app.js', './config.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SURUM).then(function (c) { return c.addAll(DOSYALAR); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (anahtarlar) {
    return Promise.all(anahtarlar.filter(function (k) { return k !== SURUM; })
      .map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

// Önce internetten dene (güncel sürüm gelsin), olmazsa telefondaki kopyayı aç.
self.addEventListener('fetch', function (e) {
  const istek = e.request;
  if (istek.method !== 'GET' || new URL(istek.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(istek).then(function (yanit) {
      const kopya = yanit.clone();
      caches.open(SURUM).then(function (c) { c.put(istek, kopya); });
      return yanit;
    }).catch(function () {
      return caches.match(istek).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});
