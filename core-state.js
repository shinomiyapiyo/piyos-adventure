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
const BOSS_MAX_HP           = 100;    // 基本HP（内部HP=表示HPに統一。ボス5種一巡の1週目R1-R5は一律100）
const BOSS_HP_PER_ROUND     = 20;     // ラウンド毎のHP増（R6から適用。表示=内部の統一スケール）。難度は攻撃パターンで上げる方針
const BOSS_HP_ROUND_CAP     = 7;      // HP増の上限ステップ数（R6起点+7=R12でHP240頭打ち＝戦闘の間延び防止）
// ボス出現ローテ（この順で毎ラウンド循環）。新ボスは末尾に足すだけ＝kind決定と bossEncounter() が自動追随
var BOSS_KINDS = ['rooster', 'hawk', 'egg', 'snake', 'owl'];
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
    fullCharge: 900    // ショップ: フルチャージ（15秒）
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
    // モーダル(z:99999)は全画面の最前面なので最優先で閉じる。素の display:none だとはい/いいえの
    // リスナーと「いいえ」ボタンが残留して次のモーダルを汚染するため、show側が公開する正規の閉じ処理を呼ぶ
    // （確認モーダルは「いいえ」扱い＝進行中のセーブ削除チェーン等を安全に中断）。
    { isOpen: function() { var m = document.getElementById('gameModal'); return !!m && m.style.display === 'flex'; },
      onBack: function() {
          if (typeof window._gameModalClose === 'function') { window._gameModalClose(); }
          else { document.getElementById('gameModal').style.display = 'none'; }
      } },
    // データ引き継ぎの発行/入力オーバーレイ(z:20000・動的生成)。従来は未登録で、下の設定画面が先に閉じていた
    { isOpen: function() { return !!document.querySelector('.transferOverlay'); },
      onBack: function() { var o = document.querySelector('.transferOverlay'); if (o) o.remove(); } },
    { isOpen: function() { return pipeRoomState.active; }, onBack: function() { exitPipeRoom(); } },
    { isOpen: function() { return shopState.active; }, onBack: function() { stageShopOnBack(); } },
    { isOpen: function() { var el = document.getElementById('storeScreen'); return !!el && el.style.display !== 'none'; },
      onBack: function() { hideStore(); } },
    { isOpen: function() { return isScreenVisible('titleShopScreen'); }, onBack: function() { titleShopOnBack(); } },
    { isOpen: function() { return isScreenVisible('missionScreen'); }, onBack: function() { hideMissionScreen(); } },
    { isOpen: function() { return isScreenVisible('achievementScreen'); }, onBack: function() { hideAchievementScreen(); } },
    { isOpen: function() { return isScreenVisible('skinScreen'); }, onBack: function() { hideSkinScreen(); } },
    { isOpen: function() { return isScreenVisible('zukanScreen'); }, onBack: function() { hideZukanScreen(); } },
    { isOpen: function() { return isScreenVisible('guideScreen'); }, onBack: function() { hideGuide(); } },
    { isOpen: function() { return isScreenVisible('tutorialScreen'); }, onBack: function() { tutorialCancel(); } },
    { isOpen: function() { return isScreenVisible('settingsScreen'); }, onBack: function() { hideSettings(); } },
    { isOpen: function() { return isScreenVisible('nameInputScreen'); }, onBack: function() { hideNameInputDirect(); resetGame(); } },
    { isOpen: function() { return isScreenVisible('gameOverScreen'); }, onBack: function() { goToTitle(); } },
    { isOpen: function() { return isScreenVisible('rankingScreen'); }, onBack: function() { hideRanking(); } },
    // ラン中の戻る=ポーズ⇔再開のトグル。消費した履歴をここで積み直すので連打してもアプリ離脱しない
    // （startGame が {screen:'game'} を1つ積むのが起点。pauseGame は遷移クールダウン中は何もしないが積み直しは行う）。
    { isOpen: function() { return gameState && gameState.gameStarted; },
      onBack: function() { pauseGame(); history.pushState({ screen: 'game' }, ''); } }
];

// ─── ゲーム状態 ───
var gameState = {
    score: 0, rankScore: 0, lives: 5,
    camera: { x: 0, y: 0 },
    input: { left: false, right: false, jump: false, jumpPressed: false, down: false, up: false },
    recentlyDropped: false, dropFromY: 0, time: 0,
    noDmgMark: 0, noDmgNext: 500,  // ノーダメ継続: 最後に被弾した距離(m)と次のボーナス閾値(mark比)
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

// ─── リスク&リワード演出（ニアミス回避／ノーダメージ継続） ───
var NEAR_MISS_RANGE = 14;   // ニアミス判定: 敵の当たり判定をこのpx分ふくらませた範囲を「かすめた」とみなす
var NEAR_MISS_BONUS = 100;  // ニアミス回避ボーナス(スコア)
var NODMG_STEP  = 500;      // ノーダメージ継続ボーナスの間隔(m)
var NODMG_BONUS = 500;      // ノーダメージ継続ボーナス(スコア/回)
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
    exitHold: 0,         // 出口土管の口で右を押し続けているフレーム数（退室ゲージ・継続が切れたら0に戻す）
    introTimer: 0        // 入場時「BONUS!」演出の残りフレーム
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
    items: [],       // 通常ストック枠（詰めて保持・毎ラン空から）
    perma: []        // 永続ストック枠 [{id,used}]（長さ=pouchLevel・resetGameでpermaStockから構築・毎ラン補充）
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
        // 復活薬は「保険専用」＝手動使用なし。stockEffect を持たせない（tryRevive が死亡時にライフ2で自動発動）。
        // タップされたら useStockItem がヒントだけ表示する（手動発動は誤操作の元・説明文とも不整合なので廃止）。
        id: 'revive_potion', nameKey: 'shop_item_revive', descKey: 'shop_item_revive_desc',
        icon: '', iconImg: 'images/icon_revive_potion.png', price: 20000, maxPerVisit: 1,
        stockItem: true
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

// ─── エッグこうかん（タイトルショップ内・ゴールデンエッグ払い） ───
// 方針: エッグは性能を売らない（コスメ＋非スコア実用のみ）。課金の目玉とは別レーン。
// ⚠ 新しい type を追加する時は gameplay.js の confirmEggBuy（付与）と isEggItemOwned（所持判定）に
//   対応を追加すること。未対応 type は購入時に減算されず「まだこうかんできない」と断られる（安全側）。
var EGG_SHOP_ITEMS = [
    // まほうのポーチ: 買うたびに永続ストック枠+1（上限=stockState.maxSlots）。confirmEggBuy/renderEggShopItemで
    // レベル表示・再購入を特別扱い。所持レベル=gameSettings.pouchLevel、各枠の中身=gameSettings.permaStock。
    { id: 'perma_stock', type: 'pouch', nameKey: 'egg_pouch', descKey: 'egg_pouch_desc',
      iconImg: 'images/item_pouch.png', eggPrice: 10 },
    { id: 'skin_kigurumi', type: 'skin', skinId: 'kigurumi', nameKey: 'skin_kigurumi', descKey: 'egg_item_kigurumi_desc',
      iconImg: 'images/skin_kigurumi_idle.png', eggPrice: 5 }
];
// 永続化できないストック品（一度きりの奇跡＝復活薬）。理由はi18n egg_perma_no_revive で表示。
var PERMA_STOCK_EXCLUDE = ['revive_potion'];

// ─── ずかん（図鑑）───────────────────────────────────────────────
// 遭遇で自動登録するコレクション図鑑。gameSettings.zukan に保存（saveSettings/データ引き継ぎに自動同梱）。
//   seen[id]=1 … 発見済み / kills[id]=撃破数（敵・ボスのみ）
// entry: { id, cat:'enemy'|'boss'|'item'|'biome', nameKey, descKey,
//          sprite:スプライトシート名 or img:PNGパス（UI描画用・Step2で使用）,
//          kill:撃破数を持つ, seenIf:gs=>bool（購入/所持から発見を派生。フィールド遭遇しない永続アイテム用） }
var ZUKAN_ENTRIES = [
    // ── 敵（バイオーム別の見た目も別エントリ・全て撃破数つき）──
    { id: 'enemy:chick_grass',  cat: 'enemy', nameKey: 'zukan_e_chick_grass',  descKey: 'zukan_e_chick_grass_d',  sprite: 'chick_walk',        kill: true },
    { id: 'enemy:chick_desert', cat: 'enemy', nameKey: 'zukan_e_chick_desert', descKey: 'zukan_e_chick_desert_d', sprite: 'quail_walk',        kill: true },
    { id: 'enemy:chick_snow',   cat: 'enemy', nameKey: 'zukan_e_chick_snow',   descKey: 'zukan_e_chick_snow_d',   sprite: 'enaga_walk',        kill: true },
    { id: 'enemy:chick_night',  cat: 'enemy', nameKey: 'zukan_e_chick_night',  descKey: 'zukan_e_chick_night_d',  sprite: 'owl_walk',          kill: true },
    { id: 'enemy:golden_chick', cat: 'enemy', nameKey: 'zukan_e_golden',       descKey: 'zukan_e_golden_d',       sprite: 'golden_chick_walk', kill: true },
    { id: 'enemy:mama_chick',   cat: 'enemy', nameKey: 'zukan_e_mama',         descKey: 'zukan_e_mama_d',         sprite: 'mama_chick_walk',   kill: true },
    { id: 'enemy:flying_chick', cat: 'enemy', nameKey: 'zukan_e_flying',       descKey: 'zukan_e_flying_d',       sprite: 'flying_chick_fly',  kill: true },
    { id: 'enemy:flying_desert', cat: 'enemy', nameKey: 'zukan_e_flying_desert', descKey: 'zukan_e_flying_desert_d', sprite: 'vulture_fly',  kill: true },
    { id: 'enemy:flying_snow',   cat: 'enemy', nameKey: 'zukan_e_flying_snow',   descKey: 'zukan_e_flying_snow_d',   sprite: 'snowowl_fly',  kill: true },
    { id: 'enemy:flying_night',  cat: 'enemy', nameKey: 'zukan_e_flying_night',  descKey: 'zukan_e_flying_night_d',  sprite: 'bat_fly',      kill: true },
    // ── ボス（撃破数つき）──
    { id: 'boss:rooster', cat: 'boss', nameKey: 'zukan_b_rooster', descKey: 'zukan_b_rooster_d', kind: 'rooster', kill: true },
    { id: 'boss:hawk',    cat: 'boss', nameKey: 'zukan_b_hawk',    descKey: 'zukan_b_hawk_d',    kind: 'hawk',    kill: true },
    { id: 'boss:egg',     cat: 'boss', nameKey: 'zukan_b_egg',     descKey: 'zukan_b_egg_d',     kind: 'egg',     kill: true },
    { id: 'boss:snake',   cat: 'boss', nameKey: 'zukan_b_snake',   descKey: 'zukan_b_snake_d',   kind: 'snake',   kill: true },
    { id: 'boss:owl',     cat: 'boss', nameKey: 'zukan_b_owl',     descKey: 'zukan_b_owl_d',     kind: 'owl',     kill: true },
    // ── アイテム：フィールドで拾う ──
    { id: 'item:heart',      cat: 'item', nameKey: 'zukan_i_heart',  descKey: 'zukan_i_heart_d',  img: 'images/icon_lives.png' },
    { id: 'item:coin',       cat: 'item', nameKey: 'zukan_i_coin',   descKey: 'zukan_i_coin_d',   img: 'images/icon_money.png' },
    { id: 'item:lemon',      cat: 'item', nameKey: 'zukan_i_lemon',  descKey: 'zukan_i_lemon_d',  img: 'images/icon_lemon_special.png' },
    { id: 'item:shield',     cat: 'item', nameKey: 'zukan_i_shield', descKey: 'zukan_i_shield_d', img: 'images/icon_barrier.png' },
    { id: 'item:energy',     cat: 'item', nameKey: 'zukan_i_energy', descKey: 'zukan_i_energy_d', img: 'images/icon_full_charge.png' },
    { id: 'item:magnet',     cat: 'item', nameKey: 'zukan_i_magnet', descKey: 'zukan_i_magnet_d', img: 'images/icon_magnet_boost.png' },
    { id: 'item:golden_egg', cat: 'item', nameKey: 'zukan_i_egg',    descKey: 'zukan_i_egg_d',    img: 'images/item_golden_egg.png' },
    // ── アイテム：ステージショップ（購入で発見・既存の説明文を流用）──
    { id: 'item:heal',          cat: 'item', nameKey: 'shop_item_heal',       descKey: 'shop_item_heal_desc',       img: 'images/icon_heal.png' },
    { id: 'item:heal_stock',    cat: 'item', nameKey: 'shop_item_heal_stock', descKey: 'shop_item_heal_stock_desc', img: 'images/icon_heal_stock.png' },
    { id: 'item:barrier',       cat: 'item', nameKey: 'shop_item_barrier',    descKey: 'shop_item_barrier_desc',    img: 'images/icon_barrier.png' },
    { id: 'item:lemon_special', cat: 'item', nameKey: 'shop_item_lemon',      descKey: 'shop_item_lemon_desc',      img: 'images/icon_lemon_special.png' },
    { id: 'item:full_charge',   cat: 'item', nameKey: 'shop_item_fullcharge', descKey: 'shop_item_fullcharge_desc', img: 'images/icon_full_charge.png' },
    { id: 'item:revive_potion', cat: 'item', nameKey: 'shop_item_revive',     descKey: 'shop_item_revive_desc',     img: 'images/icon_revive_potion.png' },
    // ── アイテム：永続アップグレード（所持レベルから発見を派生・既存の説明文を流用）──
    { id: 'item:coin_master',     cat: 'item', nameKey: 'tshop_coin_master',     descKey: 'tshop_coin_master_desc',     img: 'images/icon_coin_master.png',     seenIf: function(gs){ return ((gs.upgrades || {}).coin_master || 0) > 0; } },
    { id: 'item:special_move',    cat: 'item', nameKey: 'tshop_special_move',    descKey: 'tshop_special_move_desc',    img: 'images/icon_special_move.png',    seenIf: function(gs){ return ((gs.upgrades || {}).special_move || 0) > 0; } },
    { id: 'item:toughness',       cat: 'item', nameKey: 'tshop_toughness',       descKey: 'tshop_toughness_desc',       img: 'images/icon_toughness.png',       seenIf: function(gs){ return ((gs.upgrades || {}).toughness || 0) > 0; } },
    { id: 'item:stock_expand',    cat: 'item', nameKey: 'tshop_stock_expand',    descKey: 'tshop_stock_expand_desc',    img: 'images/icon_stock_expand.png',    seenIf: function(gs){ return ((gs.upgrades || {}).stock_expand || 0) > 0; } },
    { id: 'item:magnet_boost',    cat: 'item', nameKey: 'tshop_magnet_boost',    descKey: 'tshop_magnet_boost_desc',    img: 'images/icon_magnet_boost.png',    seenIf: function(gs){ return ((gs.upgrades || {}).magnet_boost || 0) > 0; } },
    { id: 'item:combo_master',    cat: 'item', nameKey: 'tshop_combo_master',    descKey: 'tshop_combo_master_desc',    img: 'images/icon_combo_master.png',    seenIf: function(gs){ return ((gs.upgrades || {}).combo_master || 0) > 0; } },
    { id: 'item:swift_feet',      cat: 'item', nameKey: 'tshop_swift_feet',      descKey: 'tshop_swift_feet_desc',      img: 'images/icon_swift_feet.png',      seenIf: function(gs){ return ((gs.upgrades || {}).swift_feet || 0) > 0; } },
    { id: 'item:revival_feather', cat: 'item', nameKey: 'tshop_revival_feather', descKey: 'tshop_revival_feather_desc', img: 'images/icon_revival_machine.png', seenIf: function(gs){ return ((gs.upgrades || {}).revival_feather || 0) > 0; } },
    // ── アイテム：きせかえ（所持から発見を派生）──
    { id: 'item:skin_maid',     cat: 'item', nameKey: 'skin_maid',     descKey: 'zukan_i_skin_maid_d',   img: 'images/skin_maid_idle.png',     seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('maid') >= 0; } },
    { id: 'item:skin_kigurumi', cat: 'item', nameKey: 'skin_kigurumi', descKey: 'egg_item_kigurumi_desc', img: 'images/skin_kigurumi_idle.png', seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('kigurumi') >= 0; } },
    // ── ステージ（バイオーム＋ボーナス部屋）──
    { id: 'biome:grassland', cat: 'biome', nameKey: 'zukan_bio_grass',  descKey: 'zukan_bio_grass_d' },
    { id: 'biome:desert',    cat: 'biome', nameKey: 'zukan_bio_desert', descKey: 'zukan_bio_desert_d' },
    { id: 'biome:snow',      cat: 'biome', nameKey: 'zukan_bio_snow',   descKey: 'zukan_bio_snow_d' },
    { id: 'biome:night',     cat: 'biome', nameKey: 'zukan_bio_night',  descKey: 'zukan_bio_night_d' },
    { id: 'biome:bonus',     cat: 'biome', nameKey: 'zukan_bio_bonus',  descKey: 'zukan_bio_bonus_d' }
];
// 図鑑コンプリート報酬（ゴールデンエッグ）。各カテゴリ100%＋全種コンプで付与。gameSettings.zukan.claimed で二重防止。
var ZUKAN_REWARDS = { enemy: 3, item: 3, boss: 3, biome: 3, all: 10 };
var ZUKAN_BIOME_NAMES = ['grassland', 'desert', 'snow', 'night']; // getBiomeIndex → biome:<name>
var ZUKAN_POWERUP_IDS = { heart: 'item:heart', lemon_can: 'item:lemon', shield: 'item:shield', energy: 'item:energy', magnet: 'item:magnet' }; // powerUp.type → id（golden_eggは collectGoldenEgg 側で記録）

// 発見を記録（初回のみ保存）。既発見なら何もしない＝スポーン/描画から毎フレーム呼んでも安い。
function markZukanSeen(id) {
    if (!id || !gameSettings.zukan) return;
    if (gameSettings.zukan.seen[id]) return;
    gameSettings.zukan.seen[id] = 1;
    if (gameSettings.zukan.new) gameSettings.zukan.new[id] = 1; // 未閲覧の新規発見（図鑑を開くまで NEW! バッジ）
    saveSettings();
}
// 撃破数を加算（＝発見）。保存は頻度を抑えるためここでは行わず gameOver でまとめて確定する。
function zukanAddKill(id) {
    if (!id || !gameSettings.zukan) return;
    gameSettings.zukan.kills[id] = (gameSettings.zukan.kills[id] || 0) + 1;
    if (!gameSettings.zukan.seen[id]) {
        gameSettings.zukan.seen[id] = 1;
        if (gameSettings.zukan.new) gameSettings.zukan.new[id] = 1; // 新規発見（保存はgameOverでまとめて）
    }
}
// 敵オブジェクト → ずかんID（typeと、基本ひよこはバイオーム見た目 walkSprite で分岐）
function enemyZukanId(e) {
    if (!e) return null;
    if (e.type === 'golden_chick') return 'enemy:golden_chick';
    if (e.type === 'mama_chick')   return 'enemy:mama_chick';
    if (e.type === 'flying_chick') {
        switch (e.flySprite) {                       // バイオーム見た目ごとに図鑑エントリを分ける
            case 'vulture_fly': return 'enemy:flying_desert';
            case 'snowowl_fly': return 'enemy:flying_snow';
            case 'bat_fly':     return 'enemy:flying_night';
            default:            return 'enemy:flying_chick';
        }
    }
    switch (e.walkSprite) {
        case 'quail_walk': return 'enemy:chick_desert';
        case 'enaga_walk': return 'enemy:chick_snow';
        case 'owl_walk':   return 'enemy:chick_night';
        default:           return 'enemy:chick_grass';
    }
}
// エントリが発見済みか（seenマップ、または seenIf による所持派生）
function isZukanSeen(entry) {
    if (!entry || !gameSettings.zukan) return false;
    if (gameSettings.zukan.seen[entry.id]) return true;
    if (entry.seenIf) { try { return !!entry.seenIf(gameSettings); } catch (_) { return false; } }
    return false;
}
// カテゴリ（省略時は全体）の進捗 {seen, total}
function zukanProgress(cat) {
    var seen = 0, total = 0;
    for (var i = 0; i < ZUKAN_ENTRIES.length; i++) {
        var en = ZUKAN_ENTRIES[i];
        if (cat && en.cat !== cat) continue;
        total++;
        if (isZukanSeen(en)) seen++;
    }
    return { seen: seen, total: total };
}

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
            gameSettings.goldenEggs = 50; // エッグこうかんの動作チェック用（永続保存に書く点に注意）
            saveSettings();
        } else {
            gameState.lives = 5;
            // お金(score)とゴールデンエッグはお店/交換所の動作チェックのため保持する（0にしない）
            gameState.rankScore = 0; // ランキング用スコアだけは水増しデバッグ値を残さず0に戻す
        }
        // ポーズタイトルに状態表示
        var titleEl = document.getElementById('pauseTitle');
        if (titleEl) {
            titleEl.innerHTML = debugMode ? 'DEBUG MODE ON' : t('pause_title');
        }
    }
}
