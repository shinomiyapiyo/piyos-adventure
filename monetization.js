// ============================================================
// monetization.js — 広告/課金ブリッジ（index.html から分離 / Ver.1.333, Step2）
// 内容: 広告ブリッジ(showAd stub)・課金ブリッジ(purchaseItem stub)/IAP商品/購入ロジック/
//       課金ストアUI・リワード広告の状態管理。
// ※現状すべて stub（ネイティブ未統合）。Capacitor+AdMob / IAP 導入時はこのファイルを差し替える。
// 依存: gameSettings/saveSettings/soundManager/各UI関数 等のグローバルを実行時参照。
// 読み込み順: スプライト定義の後・ゲーム本体ロジックの前（元の実行順を保持）。
// ============================================================
// ─── 広告ブリッジ (Capacitor/ネイティブ側で上書きする) ───
// showAd(type, callback) : 'interstitial'=インタースティシャル, 'reward'=リワード
// callback(success) : リワード広告の視聴完了/キャンセルを通知
// ネイティブ未接続時は何もしない。Capacitor導入時にこの関数をプラグイン呼び出しに差し替える。
window.showAd = window.showAd || function(type, callback) {
    if (gameSettings.adFree) { if (callback) callback(true); return; }
    // stub: ネイティブ広告SDK未接続
    // リワード広告のstub: 常に成功扱い（テスト用）
    if (type === 'reward' && callback) callback(true);
};

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
        playStageBGM();
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
    showAd('reward', function(success) {
        if (!success) return;
        rewardAdState.shopAdUsedThisVisit = true;
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
