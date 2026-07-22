// キルスイッチ Service Worker（PWA完全廃止用）
// 役割: 既存インストール済みPWAの旧SW（ゲームをキャッシュ配信している）をこのSWで置き換え、
//       全キャッシュ削除 → 自己解除 → 開いているページを再読込してウォールを表示させる。
// 旧sw.jsとバイト差分があれば自動更新される（CACHE_NAME等の仕掛けは不要）。
// fetchハンドラ無し＝以後は素のネットワーク配信。新規のSW登録はもう行わない（wall/index.htmlも登録しない）。
self.addEventListener('install', function(e) {
    self.skipWaiting();
});
self.addEventListener('activate', function(e) {
    e.waitUntil((async function() {
        try {
            var keys = await caches.keys();
            await Promise.all(keys.map(function(k) { return caches.delete(k); }));
        } catch (_) {}
        try { await self.registration.unregister(); } catch (_) {}
        try {
            var cs = await self.clients.matchAll({ type: 'window' });
            cs.forEach(function(c) { c.navigate(c.url); }); // SWの支配下から抜けて素のウォールを読み直す
        } catch (_) {}
    })());
});
