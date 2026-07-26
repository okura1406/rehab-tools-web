/* Service Worker — オフライン動作を担当する
 *
 * 役割：初回アクセス時にツール一式をスマホ内へ保存し、
 *       2回目以降は電波が無くても保存済みのファイルで起動できるようにする。
 *
 * ツールを更新したときは、下の CACHE_VERSION の数字を 1 つ増やすこと。
 * （数字を変えないと、スタッフの端末に古い版が残り続けます）
 */

var CACHE_VERSION = 'v1';
var CACHE_NAME = 'rehab-tools-' + CACHE_VERSION;

// 端末に保存しておくファイル一覧。ツールを増やしたらここにも追記する。
var PRECACHE_URLS = [
  './',
  './index.html',
  './battery.html',
  './pain.html',
  './design-r.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// インストール時：一式をまとめて保存する
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      // 新しい版をすぐ有効にする
      return self.skipWaiting();
    })
  );
});

// 有効化時：古い版のキャッシュを削除する
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key.indexOf('rehab-tools-') === 0 && key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 取得時：キャッシュ優先（電波が不安定でも即座に開ける）
// 併せて裏で通信し、成功したらキャッシュを更新しておく（stale-while-revalidate）
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // GET 以外と、他サイト宛の通信は扱わない
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {

        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () {
          // オフライン時はここに来る
          return null;
        });

        // 保存済みがあれば即返す（表示が速く、電波状態に左右されない）
        if (cached) return cached;

        return network.then(function (res) {
          if (res) return res;
          // 未保存のページを圏外で開こうとした場合はトップを返す
          if (req.mode === 'navigate') {
            return cache.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'offline' });
        });
      });
    })
  );
});
