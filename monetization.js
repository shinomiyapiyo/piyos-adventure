// ============================================================
// monetization.js — 広告/課金ブリッジ（index.html から分離 / Ver.1.333, Step2）
// 内容: 広告ブリッジ(showAd stub)・課金ブリッジ(purchaseItem stub)/IAP商品/購入ロジック/
//       課金ストアUI・リワード広告の状態管理。
// ※現状すべて stub（ネイティブ未統合）。Capacitor+AdMob / IAP 導入時はこのファイルを差し替える。
// 依存: gameSettings/saveSettings/soundManager/各UI関数 等のグローバルを実行時参照。
// 読み込み順: スプライト定義の後・ゲーム本体ロジックの前（元の実行順を保持）。
// ============================================================
// ─── 広告ブリッジ（AdMob / Capacitor 統合）───
// showAd(type, callback): 'interstitial'=インタースティシャル(callback不要) / 'reward'=リワード(callback(success))
//  - ネイティブ(iOS/Android): @capacitor-community/admob を Capacitor.Plugins.AdMob 経由で使用
//  - Web/PWA: 従来どおりの簡易フォールバック（reward=成功扱い / interstitial=無し）
//  - gameSettings.adFree（広告非表示を購入済み）は常に広告をスキップして成功扱い
(function () {
    var Cap = window.Capacitor;
    var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
    var AdMob = (isNative && Cap.Plugins) ? Cap.Plugins.AdMob : null;

    // ★★ リリースビルドでは必ず false（本番の広告ユニットIDを使う）。開発中は true = Googleのテスト広告 ★★
    var AD_TEST = false;

    // Google公式テスト広告ユニットID（iOS/Android共通で使用可）
    var TEST_IDS = {
        interstitial: 'ca-app-pub-3940256099942544/4411468910',
        reward:       'ca-app-pub-3940256099942544/1712485313'
    };
    // 本番の広告ユニットID（プラットフォーム別・AdMobコンソールで発行済み）
    var PROD_IDS = {
        ios:     { interstitial: 'ca-app-pub-4148293353679224/7011611961', reward: 'ca-app-pub-4148293353679224/3275426791' },
        android: { interstitial: 'ca-app-pub-4148293353679224/8133121941', reward: 'ca-app-pub-4148293353679224/7418806070' }
    };
    function adUnit(kind) {
        if (AD_TEST) return TEST_IDS[kind];
        var plat = (Cap && Cap.getPlatform) ? Cap.getPlatform() : 'ios';
        return (PROD_IDS[plat] || PROD_IDS.ios)[kind];
    }

    // プラグインのイベント名（@capacitor-community/admob v8）
    var EV = {
        interLoaded:   'interstitialAdLoaded',
        interDismiss:  'interstitialAdDismissed',
        interFailShow: 'interstitialAdFailedToShow',
        rewLoaded:     'onRewardedVideoAdLoaded',
        rewFailLoad:   'onRewardedVideoAdFailedToLoad',
        rewReward:     'onRewardedVideoAdReward',
        rewDismiss:    'onRewardedVideoAdDismissed',
        rewFailShow:   'onRewardedVideoAdFailedToShow'
    };

    var interReady = false, rewardReady = false;
    var pendingReward = null;      // 視聴中リワードのcallback（1本のみ・解決で即null）
    var rewardWantShow = false;    // リワード未ロード時「ロード完了で表示」の予約
    var pendingInterDone = null;   // インタースティシャルを閉じたら呼ぶ（リトライの順序制御）

    function prepareInterstitial() {
        if (!AdMob) return;
        AdMob.prepareInterstitial({ adId: adUnit('interstitial') })
            .then(function () { interReady = true; })
            .catch(function () { interReady = false; });
    }
    function prepareReward() {
        if (!AdMob) return;
        AdMob.prepareRewardVideoAd({ adId: adUnit('reward') })
            .then(function () { rewardReady = true; })
            .catch(function () { rewardReady = false; });
    }

    // リワード結果を「1回だけ」解決。Reward発火＝成功で即解決、Dismiss/失敗は未解決時のみ失敗で解決。
    // iOSの Reward と Dismiss の発火順に依存せず視聴完了を取りこぼさない（復活が効かない不具合の対策）。
    function settleReward(result) {
        var cb = pendingReward;
        if (!cb) { return; }
        pendingReward = null;
        rewardReady = false;
        prepareReward();            // 次のリワードを事前ロード
        cb(result);
    }

    function initAds() {
        if (!AdMob) return;
        // ATT（トラッキング許可ダイアログ）→ 初期化 → 事前ロード。失敗しても広告表示は続行
        Promise.resolve(AdMob.requestTrackingAuthorization()).catch(function () {})
            .then(function () { return AdMob.initialize({ initializeForTesting: AD_TEST }); })
            .then(function () {
                // 永続リスナー（初期化後に1回だけ登録）
                AdMob.addListener(EV.rewReward,     function () { settleReward(true); });   // 報酬確定＝即成功
                AdMob.addListener(EV.rewDismiss,    function () { settleReward(false); });  // 未獲得で閉じた＝失敗（獲得済みなら無視）
                AdMob.addListener(EV.rewFailShow,   function () { settleReward(false); });
                AdMob.addListener(EV.rewLoaded,     function () {
                    rewardReady = true;
                    // 復活タップ時に未ロードだったら、ロード完了したこの瞬間に表示する
                    if (rewardWantShow) { rewardWantShow = false; rewardReady = false; AdMob.showRewardVideoAd().catch(function () { settleReward(false); }); }
                });
                AdMob.addListener(EV.rewFailLoad,   function () {
                    rewardReady = false;
                    if (rewardWantShow) { rewardWantShow = false; settleReward(false); }
                });
                AdMob.addListener(EV.interLoaded,   function () { interReady = true; });
                AdMob.addListener(EV.interDismiss,  function () { interReady = false; prepareInterstitial(); var d = pendingInterDone; pendingInterDone = null; if (d) d(); });
                AdMob.addListener(EV.interFailShow, function () { interReady = false; prepareInterstitial(); var d = pendingInterDone; pendingInterDone = null; if (d) d(); });
                prepareInterstitial();
                prepareReward();
            })
            .catch(function () {});
    }

    // onDone: 広告が閉じた後（または表示できなかった時）に呼ぶ。リトライで「広告→終わってから再開」を順序通りに。
    function showInterstitial(onDone) {
        if (!interReady) { prepareInterstitial(); if (onDone) onDone(); return; }
        interReady = false;
        pendingInterDone = onDone || null;
        AdMob.showInterstitial().catch(function () { var d = pendingInterDone; pendingInterDone = null; prepareInterstitial(); if (d) d(); });
    }

    function showReward(callback) {
        pendingReward = callback || function () {};
        if (rewardReady) {
            rewardReady = false;
            AdMob.showRewardVideoAd().catch(function () { settleReward(false); });
            return;
        }
        // 未ロード: 準備してロード完了(rewLoaded)で表示。数秒で用意できなければ失敗解決（無音で失敗しない）。
        rewardWantShow = true;
        prepareReward();
        setTimeout(function () { if (rewardWantShow) { rewardWantShow = false; settleReward(false); } }, 6000);
    }

    window.showAd = function (type, callback) {
        if (typeof gameSettings !== 'undefined' && gameSettings.adFree) { if (callback) callback(true); return; }
        if (!AdMob) {
            // Web/PWA・未統合環境: 広告なしで即続行（interstitial=callback即実行 / reward=成功扱い）
            if (callback) callback(true);
            return;
        }
        if (type === 'interstitial') showInterstitial(callback);
        else if (type === 'reward') showReward(callback);
    };

    // ネイティブのみ初期化（Web/PWAでは何もしない）
    if (AdMob) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAds);
        else initAds();
    }
})();

// ─── 課金ブリッジ (Capacitor/ネイティブ側で上書きする) ───
// purchaseItem(productId, callback) : アプリ内課金を実行
// callback(success) : 購入成功/キャンセルを通知
// ネイティブ未接続時はstub（常に成功）。Capacitor導入時にIAPプラグインに差し替える。
window.purchaseItem = window.purchaseItem || function(productId, callback) {
    // stub: テスト用に常に成功
    if (callback) callback(true);
};

// ─── 課金商品定義 ───
var IAP_PRODUCTS = [
    { id: 'starter_pack', type: 'once', price: 480, labelKey: 'iap_starter_pack', descKey: 'iap_starter_pack_desc', iconImg: 'images/icon_celebrate.png', tag: 'iap_tag_best' },
    { id: 'ad_free',      type: 'once', price: 160, labelKey: 'iap_ad_free',      descKey: 'iap_ad_free_desc',      iconImg: 'images/icon_settings.png' },
    { id: 'login_pass',   type: 'duration', price: 320, labelKey: 'iap_login_pass',  descKey: 'iap_login_pass_desc',  iconImg: 'images/icon_level.png' },
    { id: 'savings_50k',  type: 'consumable', price: 160, labelKey: 'iap_savings_50k',  descKey: 'iap_savings_50k_desc',  iconImg: 'images/icon_money.png', savingsAmount: 50000 },
    { id: 'savings_200k', type: 'consumable', price: 480, labelKey: 'iap_savings_200k', descKey: 'iap_savings_200k_desc', iconImg: 'images/icon_money.png', savingsAmount: 200000, tag: 'iap_tag_popular' },
    { id: 'savings_500k', type: 'consumable', price: 960, labelKey: 'iap_savings_500k', descKey: 'iap_savings_500k_desc', iconImg: 'images/icon_money.png', savingsAmount: 500000 },
    { id: 'savings_1200k',type: 'consumable', price: 1840, labelKey: 'iap_savings_1200k',descKey: 'iap_savings_1200k_desc',iconImg: 'images/icon_money.png', savingsAmount: 1200000, tag: 'iap_tag_best_value' }
];
// スキンは将来追加: { id: 'skin_xxx', type: 'once', price: 160, ... }

// ─── 課金購入ロジック ───
function executePurchase(productId) {
    var product = IAP_PRODUCTS.find(function(p) { return p.id === productId; });
    if (!product) return;
    // 買い切り済みチェック
    if (product.type === 'once' && gameSettings.purchased[productId]) return;

    purchaseItem(productId, function(success) {
        if (!success) return;

        if (product.id === 'ad_free') {
            gameSettings.purchased['ad_free'] = true;
            gameSettings.adFree = true;
        } else if (product.id === 'starter_pack') {
            gameSettings.purchased['starter_pack'] = true;
            gameSettings.adFree = true;
            gameSettings.savings += 100000;
            // premiumアイテム(coin_master)を解放: Lv0 → 購入可能にする（premium flagはコードで判定変更）
        } else if (product.id === 'login_pass') {
            gameSettings.loginPassExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30日
        } else if (product.savingsAmount) {
            gameSettings.savings += product.savingsAmount;
        }
        saveSettings();
        if (soundManager) soundManager.playItem();
        updateStoreUI();
    });
}

function isLoginPassActive() {
    return gameSettings.loginPassExpiry > Date.now();
}

// ─── 課金ストアUI ───
function showStore() {
    var el = document.getElementById('storeScreen');
    el.style.display = 'flex';
    history.pushState({ screen: 'store' }, '');
    updateStoreUI();
}

function hideStore() {
    var el = document.getElementById('storeScreen');
    el.style.display = 'none';
}

function closeStore() {
    hideStore();
    history.back();
}

function updateStoreUI() {
    var list = document.getElementById('storeItemList');
    var savingsEl = document.getElementById('storeSavingsDisplay');
    if (savingsEl) savingsEl.innerHTML = _ic('icon_bank.png', 'ui-icon-sm') + ' ' + t('tshop_savings_display', { amount: gameSettings.savings.toLocaleString() });
    var html = '';
    for (var i = 0; i < IAP_PRODUCTS.length; i++) {
        var p = IAP_PRODUCTS[i];
        var purchased = (p.type === 'once' && gameSettings.purchased[p.id]);
        // ログインパス: activeなら「有効中」
        var isActive = (p.id === 'login_pass' && isLoginPassActive());
        // スターターパックに含まれる広告非表示を個別購入済みの場合もチェック
        var statusText = '';
        if (purchased) {
            statusText = t('iap_purchased');
        } else if (isActive) {
            var days = Math.ceil((gameSettings.loginPassExpiry - Date.now()) / (24*60*60*1000));
            statusText = t('iap_active', { days: days });
        }
        var tagHtml = '';
        if (p.tag && !purchased && !isActive) {
            tagHtml = '<span style="position:absolute; top:-6px; right:-4px; background:#ff4466; color:#fff; font-size:clamp(6px,1.1vw,9px); font-weight:800; padding:1px 5px; border-radius:8px; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + t(p.tag) + '</span>';
        }
        var disabled = purchased || isActive;
        html += '<div data-iap-id="' + p.id + '" style="' +
            'display:flex; align-items:center; gap:6px; padding:6px 8px; cursor:' + (disabled ? 'default' : 'pointer') + ';' +
            'background:' + (disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)') + ';' +
            'border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:4px;' +
            'position:relative; opacity:' + (disabled ? '0.5' : '1') + ';' +
            'transition:background 0.15s;">' +
            tagHtml +
            '<img src="' + p.iconImg + '" width="22" height="22" style="flex-shrink:0; image-rendering:pixelated;">' +
            '<div style="flex:1; min-width:0;">' +
                '<div style="color:#fff; font-size:clamp(9px,1.8vw,13px); font-weight:700; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + t(p.labelKey) + '</div>' +
                '<div style="color:rgba(255,255,255,0.6); font-size:clamp(7px,1.3vw,10px); font-family:\'M PLUS Rounded 1c\',sans-serif; white-space:pre-line;">' + t(p.descKey) + '</div>' +
            '</div>' +
            '<div style="flex-shrink:0; text-align:right;">' +
                (statusText
                    ? '<span style="color:#4CAF50; font-size:clamp(8px,1.5vw,11px); font-weight:700; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + statusText + '</span>'
                    : '<span style="color:#ffd700; font-size:clamp(10px,2vw,14px); font-weight:800; font-family:\'M PLUS Rounded 1c\',sans-serif;">¥' + p.price + '</span>') +
            '</div>' +
        '</div>';
    }
    list.innerHTML = html;
}

// ─── リワード広告の状態管理 ───
var rewardAdState = {
    reviveUsedThisRun: false,    // 今回のプレイで復活広告を使ったか（1プレイ1回）
    shopAdUsedThisVisit: false   // 今回のショップ訪問で広告ボーナスを使ったか
};
var REWARD_AD_REVIVE_LIVES = 3;        // 広告復活で回復するライフ数
var REWARD_AD_SHOP_BONUS_RATE = 0.3;   // ステージショップ: 現在所持金の30%ボーナス
var REWARD_AD_SHOP_BONUS_MIN = 100;    // ステージショップ: 最低ボーナス額
var REWARD_AD_SHOP_BONUS_MAX = 3000;   // ステージショップ: 上限ボーナス額
var REWARD_AD_TSHOP_BONUS = 3000;      // タイトルショップ: 固定3,000円ボーナス
var REWARD_AD_TSHOP_COOLDOWN = 14400000; // タイトルショップ: クールダウン4時間

// ゲームオーバー時のリワード広告復活
function adRevive() {
    if (rewardAdState.reviveUsedThisRun) return;
    showAd('reward', function(success) {
        if (!success) return;
        rewardAdState.reviveUsedThisRun = true;
        // 復活処理
        hideGameOverScreen();
        gameState.lives = REWARD_AD_REVIVE_LIVES;
        gameState.gameStarted = true;
        gameState.gamePaused = false;
        gameState.isInvincible = true;
        gameState.invincibleTimer = INVINCIBLE_FRAMES; // 3秒間無敵
        gameState.revivalFlashTimer = 90; // 1.5秒の復活演出
        resetPlayerPosition(); // 上空からリスポーン（死因に関わらず統一）
        // ボス戦中の復活は戦闘が続くのでボスBGMを維持（薬/羽の復活=tryReviveがBGMを触らないのと同じ挙動）
        if (bossState.active && soundManager) { soundManager.playBossBGM(); }
        else { playStageBGM(); }
        document.getElementById('ui').style.display = 'block';
        document.getElementById('controlBar').style.display = 'flex';
        // gameLoopはrequestAnimationFrameで常時動作しているため呼び不要
        // （引数なしで呼ぶとaccumulatorがNaNになりフリーズする）
        lastFrameTime = 0;  // タイムスタンプをリセットして大きなdeltaを防ぐ
    });
}

// ステージショップでのリワード広告ボーナス
function adShopBonus() {
    if (rewardAdState.shopAdUsedThisVisit) return;
    // 表示した時点で消費＝ショップ訪問につき1回のみ（選択肢も即消える）。報酬の有無に関わらず再視聴不可。
    // 旧: 成功時のみ消費→報酬イベント不発(2本目以降)で選択肢が残り何度でも見られる不具合があった。
    rewardAdState.shopAdUsedThisVisit = true;
    updateStageShopUI();
    showAd('reward', function(success) {
        if (!success) return;
        var bonus = Math.min(REWARD_AD_SHOP_BONUS_MAX, Math.max(REWARD_AD_SHOP_BONUS_MIN, Math.floor(gameState.score * REWARD_AD_SHOP_BONUS_RATE)));
        gameState.score += bonus;
        if (soundManager) soundManager.playItem();
        setKeeperText('reward_ad_shop_money_ok', { amount: bonus });
        updateStageShopUI();
    });
}

// タイトルショップでのリワード広告ボーナス
function adTshopBonus() {
    if (Date.now() < gameSettings.tshopAdCooldown) {
        setTshopKeeperText('reward_ad_cooldown');
        if (soundManager) soundManager.playDamage();
        return;
    }
    showAd('reward', function(success) {
        if (!success) return;
        gameSettings.tshopAdCooldown = Date.now() + REWARD_AD_TSHOP_COOLDOWN;
        gameSettings.savings += REWARD_AD_TSHOP_BONUS;
        saveSettings();
        if (soundManager) soundManager.playItem();
        setTshopKeeperText('reward_ad_tshop_savings_ok', { amount: REWARD_AD_TSHOP_BONUS });
        updateTitleShopUI();
    });
}
