var CACHE_NAME = 'piyo-adventure-v1.388';
var STATIC_ASSETS = [
    './',
    './index.html',
    './sprites.js',
    './i18n.js',
    './audio.js',
    './monetization.js',
    './core-state.js',
    './gameplay.js',
    './render.js',
    './bootstrap.js',
    './manifest.json',
    './sounds/title.mp3',
    './sounds/stage.mp3',
    './sounds/ranking.mp3',
    './sounds/gameover.mp3',
    './sounds/boss.mp3',
    './sounds/win.mp3',
    './sounds/shop.mp3',
    './sounds/bonus.mp3',
    './sounds/stage2.mp3',
    './sounds/stage3.mp3',
    './sounds/warning.mp3',
    './sounds/select.mp3',
    './sounds/or.mp3',
    './sounds/flash.mp3',
    './sounds/piyoflash.mp3',
    './sounds/piyoflash_charge.mp3',
    './images/icon-192.png',
    './images/icon-512.png',
    './images/logo.png',
    './images/nullpo_works_white.png',
    './images/piyo01.jpg',
    './images/piyo02.jpg',
    './images/player_idle_v1.png',
    './images/player_walk_1.png',
    './images/player_walk_2.png',
    './images/player_walk_3.png',
    './images/player_walk_4.png',
    './images/player_jump.png',
    './images/player_fall.png',
    './images/skin_maid_idle.png',
    './images/skin_maid_walk_1.png',
    './images/skin_maid_walk_2.png',
    './images/skin_maid_walk_3.png',
    './images/skin_maid_walk_4.png',
    './images/skin_maid_jump.png',
    './images/skin_maid_fall.png',
    './images/skin_kigurumi_idle.png',
    './images/skin_kigurumi_walk_1.png',
    './images/skin_kigurumi_walk_2.png',
    './images/skin_kigurumi_walk_3.png',
    './images/skin_kigurumi_walk_4.png',
    './images/skin_kigurumi_jump.png',
    './images/skin_kigurumi_fall.png',
    './images/enemy_quail_walk_1.png',
    './images/enemy_quail_walk_2.png',
    './images/enemy_quail_walk_3.png',
    './images/enemy_quail_walk_4.png',
    './images/enemy_enaga_walk_1.png',
    './images/enemy_enaga_walk_2.png',
    './images/enemy_enaga_walk_3.png',
    './images/enemy_enaga_walk_4.png',
    './images/enemy_owl_walk_1.png',
    './images/enemy_owl_walk_2.png',
    './images/enemy_owl_walk_3.png',
    './images/enemy_owl_walk_4.png',
    './images/enemy_chick.png',
    './images/enemy_chick_walk_1.png',
    './images/enemy_chick_walk_2.png',
    './images/enemy_chick_walk_3.png',
    './images/enemy_chick_walk_4.png',
    './images/enemy_golden_chick.png',
    './images/enemy_golden_chick_walk_1.png',
    './images/enemy_golden_chick_walk_2.png',
    './images/enemy_golden_chick_walk_3.png',
    './images/enemy_golden_chick_walk_4.png',
    './images/enemy_mama_chick.png',
    './images/enemy_mama_chick_walk_1.png',
    './images/enemy_mama_chick_walk_2.png',
    './images/enemy_mama_chick_walk_3.png',
    './images/enemy_mama_chick_walk_4.png',
    './images/enemy_flying_chick.png',
    './images/enemy_flying_chick_fly_1.png',
    './images/enemy_flying_chick_fly_2.png',
    './images/enemy_flying_chick_fly_3.png',
    './images/enemy_flying_chick_fly_4.png',
    './images/enemy_vulture_fly_1.png',
    './images/enemy_vulture_fly_2.png',
    './images/enemy_vulture_fly_3.png',
    './images/enemy_vulture_fly_4.png',
    './images/enemy_snowowl_fly_1.png',
    './images/enemy_snowowl_fly_2.png',
    './images/enemy_snowowl_fly_3.png',
    './images/enemy_snowowl_fly_4.png',
    './images/enemy_bat_fly_1.png',
    './images/enemy_bat_fly_2.png',
    './images/enemy_bat_fly_3.png',
    './images/enemy_bat_fly_4.png',
    './images/item_coin.png',
    './images/item_lemon.png',
    './images/item_shield.png',
    './images/item_heart.png',
    './images/item_energy.png',
    './images/bullet_energy.png',
    './images/boss_idle.png',
    './images/boss_walk.png',
    './images/boss_rush.png',
    './images/boss_jump.png',
    './images/boss_summon.png',
    './images/boss_damaged.png',
    './images/boss_flame.png',
    './images/boss2_idle.png',
    './images/boss2_flap.png',
    './images/boss2_dive.png',
    './images/boss2_shoot.png',
    './images/boss2_damaged.png',
    './images/boss2_flap2.png',
    './images/boss2_flap3.png',
    './images/boss2_flap4.png',
    './images/boss2_flap5.png',
    './images/boss2_flap6.png',
    './images/boss_egg_idle.png',
    './images/boss_snake_idle.png',
    './images/boss_owl_idle.png',
    './images/shop.png',
    './images/shop01.jpg',
    './images/shop02.jpg',
    './images/shop03.jpg',
    './images/shop04.jpg',
    './images/shop05.jpg',
    './images/title.jpg',
    './images/title_shop.jpg',
    './images/icon_distance.png',
    './images/icon_money.png',
    './images/icon_lives.png',
    './images/icon_kills.png',
    './images/icon_level.png',
    './images/icon_progress.png',
    './images/icon_settings.png',
    './images/icon_trophy.png',
    './images/icon_cart.png',
    './images/icon_pause.png',
    './images/icon_play.png',
    './images/icon_flag.png',
    './images/icon_back.png',
    './images/icon_home.png',
    './images/icon_retry.png',
    './images/icon_skull.png',
    './images/icon_register.png',
    './images/icon_skip.png',
    './images/icon_bank.png',
    './images/icon_door.png',
    './images/icon_speedup.png',
    './images/icon_warning.png',
    './images/icon_sound.png',
    './images/icon_lock.png',
    './images/icon_celebrate.png',
    './images/icon_coin_master.png',
    './images/icon_toughness.png',
    './images/icon_stock_expand.png',
    './images/icon_magnet_boost.png',
    './images/icon_combo_master.png',
    './images/icon_swift_feet.png',
    './images/icon_revival_machine.png',
    './images/icon_heal.png',
    './images/icon_heal_stock.png',
    './images/icon_barrier.png',
    './images/icon_lemon_special.png',
    './images/icon_full_charge.png',
    './images/icon_revive_potion.png',
    './images/icon_lucky_star.png',
    './images/icon_swift_dash.png',
    './images/icon_treasure_hunter.png',
    './images/icon_second_wind.png',
    './images/icon_fever_boost.png',
    './images/icon_special_move.png',
    './images/special_cutin.png',
    './images/soba_shop_scene.png',
    './images/item_pipe.png',
    './images/item_pipe_side.png',
    './images/item_golden_egg.png',
    './images/item_pouch.png',
    './images/eyes_closeup.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // HTTPキャッシュ(GitHub Pagesは max-age=600)をバイパスして必ず最新を取得する。
            // これをしないと、更新時に古いファイルがキャッシュへ取り込まれ更新が反映されない。
            return cache.addAll(STATIC_ASSETS.map(function(u) { return new Request(u, { cache: 'reload' }); }));
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Firebase API: network-first
    if (url.hostname.indexOf('firebaseio.com') !== -1 ||
        url.hostname.indexOf('googleapis.com') !== -1 ||
        url.hostname.indexOf('firebase.googleapis.com') !== -1) {
        event.respondWith(
            fetch(event.request).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Static assets: cache-first
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            return cached || fetch(event.request).then(function(response) {
                if (response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        })
    );
});
