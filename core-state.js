// ============================================================
// core-state.js — 定数・各state・Firebase初期化（index.html から分離 / Ver.1.335, Step4）
// 内容: Firebase初期化(database)・定数(スクロール速度/ボス/PU持続等)・キャンバス取得・
//       画面表示ユーティリティ・戻るボタン・gameState/player/boss/shop/stock 等のstate・デバッグモード。
// 依存: 多数の関数が参照する土台。後半インラインの「元の位置」で読む(3分割)。
//       gameSettings/loadSettings は本ファイルを参照しないため、これより前(後半インライン前半)で可。
// ============================================================
// ─── Firebase ───
var database = null;
var firebaseInitError = null;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp({
            apiKey: "AIzaSyC0k2m0OcKxA_K10j2ZPmR2pMK5MKZgHAY",
            authDomain: "piyo-adventure-ranking.firebaseapp.com",
            databaseURL: "https://piyo-adventure-ranking-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "piyo-adventure-ranking",
            storageBucket: "piyo-adventure-ranking.firebasestorage.app",
            messagingSenderId: "508462208211",
            appId: "1:508462208211:web:7c52eb1044cfba4c33b026"
        });
        database = firebase.database();
        // Firebase initialized
    } else {
        firebaseInitError = 'Firebase SDK not loaded';
    }
} catch (e) {
    firebaseInitError = e.message;
}

// ─── 定数 ───
var   GAME_WIDTH          = 820;
const GAME_HEIGHT         = 450;
const GRAVITY             = 0.7;
const JUMP_FORCE          = -16;
const MOVE_SPEED          = 6;
const BASE_SCROLL_SPEED   = 1.2;
const INVINCIBLE_FRAMES   = 180;   // 3s @ 60fps
const SPEED_UP_INTERVAL   = 300;   // 300mごと
const SPEED_UP_RATE       = 0.20;  // 20%ずつ
const MAX_SPEED_PERCENT   = 500;
const DOWN_SWIPE_FRAMES   = 30;    // 0.5s

// ─── ボスバトル定数 ───
const BOSS_TRIGGER_DISTANCE = 2400;   // 2400mごとにボス出現
const BOSS_MAX_HP           = 10;
const BOSS_WIDTH            = 128;
const BOSS_HEIGHT           = 128;
const BOSS_DEFEAT_SCORE     = 5000;
const BOSS_WARNING_DURATION = 120;    // 2s @ 60fps
const BOSS_ANGER_DURATION   = 150;    // 2.5s @ 60fps
const BOSS_SUMMON_INTERVAL  = 300;    // 5s @ 60fps
const BOSS_COINS_ON_DEFEAT  = 25;

// ─── ボス攻撃選択の累積しきい値（updateBossAI_mamaでMath.random()と比較順に評価） ───
// 例: AIフェーズ2でr<0.15なら閃光、r<0.35なら突進…最後のしきい値以上は様子見
var BOSS_ATTACK_RATES = {
    1: { flash: 0.15 },
    2: { flash: 0.15, rush: 0.35, egg: 0.55, flame: 0.80 },
    3: { flash: 0.15, rush: 0.30, egg: 0.50, jump: 0.65, flame: 0.85 }
};

// ─── パワーアップ持続時間（フレーム @60fps） ───
var PU_DURATION = {
    lemon: 300,        // フィールド: レモン缶（5秒）
    shield: 300,       // フィールド: シールド（5秒）
    energy: 480,       // フィールド: エナジー（8秒）
    magnet: 600,       // フィールド: マグネット（10秒）
    barrierItem: 600,  // ショップ: バリア（10秒）
    lemonItem: 1200,   // ショップ: レモンスペシャル（20秒）
    fullCharge: 900,   // ショップ: フルチャージ（15秒）
    reviveShield: 300  // 復活薬使用時のシールド（5秒）
};

// ─── キャンバス ───
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

var soundManager = null;
var finalGameStats = null;
var currentRankingType = 'score';

// ─── 画面遷移クールダウン（タップ貫通防止） ───
var screenTransitionTime = 0;
function markScreenTransition() { screenTransitionTime = Date.now(); }
function isInTransitionCooldown() { return (Date.now() - screenTransitionTime) < 300; }

// ─── 画面表示ユーティリティ ───
// オーバーレイ画面のDOM表示/非表示（hiddenクラスとdisplayを常にセットで切替）
// ※storeScreenはhiddenクラスを持たないdisplay制御のみのため対象外
function showScreenEl(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; }
    return el;
}
function hideScreenEl(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
    return el;
}
function isScreenVisible(id) {
    var el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden') && el.style.display !== 'none';
}

// ─── 戻るボタン処理レジストリ ───
// Android戻るボタン/ブラウザバック時に、先頭から評価して最初に開いている画面を閉じる。
// 配列の順序＝優先順位（例: ショップ中はショップの退店処理が最優先）。
// 画面を追加したらここに1エントリ追加すること（popstateハンドラの変更は不要）。
var BACK_HANDLERS = [
    { isOpen: function() { return pipeRoomState.active; }, onBack: function() { exitPipeRoom(); } },
    { isOpen: function() { return shopState.active; }, onBack: function() { closeStageShop(); } },
    { isOpen: function() { var el = document.getElementById('storeScreen'); return !!el && el.style.display !== 'none'; },
      onBack: function() { hideStore(); } },
    { isOpen: function() { return isScreenVisible('titleShopScreen'); }, onBack: function() { hideTitleShop(); } },
    { isOpen: function() { return isScreenVisible('missionScreen'); }, onBack: function() { hideMissionScreen(); } },
    { isOpen: function() { return isScreenVisible('achievementScreen'); }, onBack: function() { hideAchievementScreen(); } },
    { isOpen: function() { return isScreenVisible('skinScreen'); }, onBack: function() { hideSkinScreen(); } },
    { isOpen: function() { return isScreenVisible('guideScreen'); }, onBack: function() { hideGuide(); } },
    { isOpen: function() { return isScreenVisible('tutorialScreen'); }, onBack: function() { tutorialCancel(); } },
    { isOpen: function() { return isScreenVisible('settingsScreen'); }, onBack: function() { hideSettings(); } },
    { isOpen: function() { var m = document.getElementById('gameModal'); return !!m && m.style.display === 'flex'; },
      onBack: function() { document.getElementById('gameModal').style.display = 'none'; } },
    { isOpen: function() { return isScreenVisible('nameInputScreen'); }, onBack: function() { hideNameInputDirect(); resetGame(); } },
    { isOpen: function() { return isScreenVisible('gameOverScreen'); }, onBack: function() { goToTitle(); } },
    { isOpen: function() { return isScreenVisible('rankingScreen'); }, onBack: function() { hideRanking(); } },
    { isOpen: function() { return gameState && gameState.gameStarted && !gameState.gamePaused; }, onBack: function() { pauseGame(); } }
];

// ─── ゲーム状態 ───
var gameState = {
    score: 0, rankScore: 0, lives: 5,
    camera: { x: 0, y: 0 },
    input: { left: false, right: false, jump: false, jumpPressed: false, down: false, up: false },
    recentlyDropped: false, dropFromY: 0, time: 0,
    gameStarted: false, gamePaused: false,
    enemySpawnTimer: 0, platformSpawnTimer: 0, coinSpawnTimer: 0,
    flyingEnemySpawnTimer: 0, powerUpSpawnTimer: 0,
    distance: 0, gameSpeed: BASE_SCROLL_SPEED, lastTerrainX: 0,
    puLemon: 0, puShield: 0, puEnergy: 0, puMagnet: 0,
    invincibleTimer: 0, isInvincible: false,
    speedLevel: 1, lastSpeedUpDistance: 0,
    speedUpNotification: false, speedUpNotificationTimer: 0,
    downSwipeTimer: 0, downSwipeActive: false,
    isRespawning: false, enemyKills: 0,
    bulletFireTimer: 0,
    comboCount: 0, comboTimer: 0,
    revivesLeft: 0, revivalFlashTimer: 0,
    hasRecordedHighScore: false,
    missionCountedDistance: 0, missionCountedKills: 0, missionPlayCounted: false,
    coinsCollected: 0, bossKills: 0, specialUses: 0,
    goldenEggFieldSpawned: false,  // 2500m日次エッグをこのランで出したか（per-run）
    missionCountedCoins: 0, missionCountedBoss: 0, missionCountedSpecial: 0,
    specialGauge: 0, specialMoveLevel: 0, specialCutinTimer: 0, specialCutinActive: false
};

var player = {
    x: 150, y: 286, width: 48, height: 48,
    velX: 0, velY: 0, onGround: false, groundType: 'normal',
    facing: 'right', animFrame: 0
};

var coins = [], enemies = [], platforms = [];
var terrain = [], flyingEnemies = [], powerUps = [];
var floatEffects = [], bullets = [];

// ─── ボスバトル状態 ───
var gameRound = 1;
var bossState = {
    active: false, phase: 0, boss: null,
    warningTimer: 0, arenaLeft: 0, arenaRight: 0,
    defeatedTimer: 0, roundTextTimer: 0,
    bossTriggered: false, savedGameSpeed: 0,
    eggs: [], summonTimer: 0
};

// ─── ショップシステム ───
var SHOP_SAFE_ZONE_START = 250; // ボス出現の250m前から安全地帯
var SHOP_BUILDING_OFFSET = 100; // ボス出現の100m前にショップ建物
var SHOP_SAFE_ZONE_SPEED = 1.5; // 安全地帯のスクロール速度

// ─── 土管ボーナス部屋 ───
var PIPE_W = 72, PIPE_H = 66;                       // 入口（縦）土管のサイズ(px)。本編フィールドにもこの縦土管を置く
var SIDE_PIPE_W = 140, SIDE_PIPE_H = 74;            // 出口（横）土管のサイズ(px・口は左向き)
var PIPE_ROOM_FLOOR_Y    = GAME_HEIGHT - 64;        // 部屋の床上端（画面座標）
var PIPE_ROOM_LEFT       = 110;                     // プレイヤーの入場落下X＆報酬配置の起点（画面座標）
var PIPE_ROOM_WALL_W     = 48;                      // 左右の壁（見える壁）の厚み(px)。プレイヤーはこの壁の内側で止まる（見えない壁をなくす）
var PIPE_EXIT_HOLD_FRAMES = 42;                     // 出口土管の口に接触＋右押し継続で退室に必要なフレーム数(≒0.7秒@60fps)。誤操作で地上に出ないように
var PIPE_ROOM_ENTRY_X    = 44;                      // 入口（縦）土管の左X（画面左・描画用）
// 出口（横）土管の左端Xは実行時 GAME_WIDTH から算出（pipeRoomExitX）。GAME_WIDTHは画面比で可変なため定数化しない
var pipeRoomState = {
    active: false,       // 部屋に入っているか（ループ/描画の分岐に使う単一の真実）
    visited: false,      // このラウンドで入室済みか（1ラウンド1回・再入室防止）
    placed: false,       // 土管をフィールドに配置済みか
    x: 0,                // フィールドの土管ワールドX
    savedGameSpeed: 0,   // 復帰用スクロール速度
    savedPlayer: null,   // 入室前のプレイヤー状態スナップショット
    targetDist: 0,       // このラウンドで土管を出す目標距離(m)。安全地帯手前の通常エリアにランダム
    targetRound: 0,      // targetDist を算出したラウンド（ラウンド変化検出用）
    exitHold: 0          // 出口土管の口で右を押し続けているフレーム数（退室ゲージ・継続が切れたら0に戻す）
};
var bonusRoomItems = []; // 部屋内の報酬エンティティ配列
var pipeConfetti = [];   // 土管ボーナス部屋の背景（ジャックポット風）の紙吹雪

var shopState = {
    active: false,
    visited: false,
    deposited: false,
    purchaseCounts: {},
    savedGameSpeed: 0,
    buildingPlaced: false, // ショップ建物を配置済みか
    buildingX: 0           // ショップ建物のワールドX座標
};

var stockState = {
    maxSlots: 3,
    items: []
};

var STAGE_SHOP_ITEMS = [
    {
        id: 'heal', nameKey: 'shop_item_heal', descKey: 'shop_item_heal_desc',
        icon: '', iconImg: 'images/icon_heal.png', price: 6000, maxPerVisit: 2,
        effect: function() { gameState.lives = Math.min(gameState.lives + 2, 10); }
    },
    {
        id: 'heal_stock', nameKey: 'shop_item_heal_stock', descKey: 'shop_item_heal_stock_desc',
        icon: '', iconImg: 'images/icon_heal_stock.png', price: 12000, maxPerVisit: 1,
        stockItem: true,
        stockEffect: function() { gameState.lives = Math.min(gameState.lives + 2, 10); }
    },
    {
        id: 'barrier', nameKey: 'shop_item_barrier', descKey: 'shop_item_barrier_desc',
        icon: '', iconImg: 'images/icon_barrier.png', price: 3000, maxPerVisit: 2,
        stockItem: true,
        stockEffect: function() {
            gameState.puShield = PU_DURATION.barrierItem;
            gameState.isInvincible = true;
            gameState.invincibleTimer = PU_DURATION.barrierItem;
        }
    },
    {
        id: 'lemon_special', nameKey: 'shop_item_lemon', descKey: 'shop_item_lemon_desc',
        icon: '', iconImg: 'images/icon_lemon_special.png', price: 1200, maxPerVisit: 2,
        stockItem: true,
        stockEffect: function() { gameState.puLemon = PU_DURATION.lemonItem; }
    },
    {
        id: 'full_charge', nameKey: 'shop_item_fullcharge', descKey: 'shop_item_fullcharge_desc',
        icon: '', iconImg: 'images/icon_full_charge.png', price: 5000, maxPerVisit: 1,
        stockItem: true,
        stockEffect: function() {
            gameState.puLemon = PU_DURATION.fullCharge;
            gameState.puShield = PU_DURATION.fullCharge;
            gameState.puEnergy = PU_DURATION.fullCharge;
            gameState.puMagnet = PU_DURATION.fullCharge;
        }
    },
    {
        id: 'revive_potion', nameKey: 'shop_item_revive', descKey: 'shop_item_revive_desc',
        icon: '', iconImg: 'images/icon_revive_potion.png', price: 20000, maxPerVisit: 1,
        stockItem: true,
        stockEffect: function() {
            // ストックから手動使用した場合: HP2回復+バリア付与
            gameState.lives = Math.min(gameState.lives + 2, 10);
            gameState.puShield = PU_DURATION.reviveShield;
            gameState.isInvincible = true;
            gameState.invincibleTimer = PU_DURATION.reviveShield;
        }
    }
];

var TITLE_SHOP_UPGRADES = [
    { id: 'coin_master', nameKey: 'tshop_coin_master', descKey: 'tshop_coin_master_desc',
      icon: '', iconImg: 'images/icon_coin_master.png', maxLevel: 3, prices: [5000, 15000, 30000], effectDesc: ['+10%', '+20%', '+30%'], premium: true },
    { id: 'special_move', nameKey: 'tshop_special_move', descKey: 'tshop_special_move_desc',
      icon: '', iconImg: 'images/icon_special_move.png', maxLevel: 3, prices: [10000, 50000, 150000], effectDesc: ['威力3', '威力5', '威力8'], effectDescEn: ['Power 3', 'Power 5', 'Power 8'] },
    { id: 'toughness', nameKey: 'tshop_toughness', descKey: 'tshop_toughness_desc',
      icon: '', iconImg: 'images/icon_toughness.png', maxLevel: 3, prices: [20000, 100000, 500000], effectDesc: ['+1', '+2', '+3'] },
    { id: 'stock_expand', nameKey: 'tshop_stock_expand', descKey: 'tshop_stock_expand_desc',
      icon: '', iconImg: 'images/icon_stock_expand.png', maxLevel: 3, prices: [25000, 100000, 500000], effectDesc: ['4枠', '5枠', '6枠'], effectDescEn: ['4 slots', '5 slots', '6 slots'] },
    { id: 'magnet_boost', nameKey: 'tshop_magnet_boost', descKey: 'tshop_magnet_boost_desc',
      icon: '', iconImg: 'images/icon_magnet_boost.png', maxLevel: 2, prices: [50000, 125000], effectDesc: ['全範囲', '持続2倍'], effectDescEn: ['Full range', '2x time'] },
    { id: 'combo_master', nameKey: 'tshop_combo_master', descKey: 'tshop_combo_master_desc',
      icon: '', iconImg: 'images/icon_combo_master.png', maxLevel: 1, prices: [50000], effectDesc: ['1.5秒'], effectDescEn: ['1.5s'] },
    { id: 'swift_feet', nameKey: 'tshop_swift_feet', descKey: 'tshop_swift_feet_desc',
      icon: '', iconImg: 'images/icon_swift_feet.png', maxLevel: 1, prices: [50000], effectDesc: ['x1.3'], saleFrom: 100000 },
    { id: 'revival_feather', nameKey: 'tshop_revival_feather', descKey: 'tshop_revival_feather_desc',
      icon: '', iconImg: 'images/icon_revival_machine.png', maxLevel: 2, prices: [500000, 1000000], effectDesc: ['1回/ラン', '2回/ラン'], effectDescEn: ['1/run', '2/run'] }
];

// ─── デバッグモード ───
var debugMode = false;
var debugTapCount = 0;
var debugTapTimer = 0;

function handleDebugTap() {
    var now = Date.now();
    if (now - debugTapTimer > 3000) debugTapCount = 0; // 3秒リセット
    debugTapCount++;
    debugTapTimer = now;
    if (debugTapCount >= 10) {
        debugTapCount = 0;
        debugMode = !debugMode;
        if (debugMode) {
            gameState.lives = 99;
            gameState.score = 50000;
            gameState.rankScore = 50000;
        } else {
            gameState.lives = 5;
            // お金(score)はお店の動作チェックのため保持する（0にしない）
            gameState.rankScore = 0; // ランキング用スコアだけは水増しデバッグ値を残さず0に戻す
        }
        // ポーズタイトルに状態表示
        var titleEl = document.getElementById('pauseTitle');
        if (titleEl) {
            titleEl.innerHTML = debugMode ? 'DEBUG MODE ON' : t('pause_title');
        }
    }
}
