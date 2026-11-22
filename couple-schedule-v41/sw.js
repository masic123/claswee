/* ===== Service Worker：离线缓存 ===== */
var CACHE = 'couple-schedule-v71';
var ASSETS = [
  './',
  './index.html',
  './css/style.css?v=70',
  './css/skins.css?v=66',
  './js/app.js?v=71',
  './js/sync.js?v=71',
  './manifest.json?v=65',
  './icons/claswe-icon-192.png?v=1',
  './icons/claswe-icon-512.png?v=1',
  './icons/claswe-icon-maskable-512.png?v=1',
  './icons/claswe-apple-touch-icon.png?v=1'
];

function validAsset(request, response) {
  if (!response || !response.ok) return false;
  var path = new URL(typeof request === 'string' ? request : request.url, self.location.href).pathname;
  var type = (response.headers.get('content-type') || '').toLowerCase();
  if (/\.js$/.test(path)) return type.indexOf('javascript') >= 0;
  if (/\.css$/.test(path)) return type.indexOf('text/css') >= 0;
  if (/\.json$/.test(path)) return type.indexOf('json') >= 0;
  if (/\.png$/.test(path)) return type.indexOf('image/png') >= 0;
  return type.indexOf('text/html') >= 0;
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (asset) {
        return fetch(asset, { cache: 'reload' }).then(function (response) {
          if (!validAsset(asset, response)) throw new Error('Invalid asset response: ' + asset);
          return c.put(asset, response);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 网络优先，失败时使用离线缓存，避免新旧页面与脚本混用。 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(fetch(req).then(function (res) {
    if (res && res.type === 'basic' && validAsset(req, res)) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  }));
});
