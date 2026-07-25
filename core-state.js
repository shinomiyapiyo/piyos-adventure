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
// 魔女ぴよ グライド滞空（1.456〜・空中で落下中にジャンプ長押し）。調整ノブ:
const WITCH_GLIDE_GRAVITY = 0.20;  // グライド中の重力（通常0.7の約1/3.5＝ふわっと落ちる）
const WITCH_GLIDE_MAXFALL = 2.4;   // グライド中の最大落下速度（通常15＝ゆっくり降下で頭打ち）
// 操作フィール（1.460・fixed 60Hz update のフレーム数）。調整ノブ:
const COYOTE_FRAMES      = 6;      // 足場を離れてからジャンプを受け付ける猶予（約0.1秒）
const JUMP_BUFFER_FRAMES = 6;      // 着地の少し前に押したジャンプを覚えておく猶予（約0.1秒）
const BASE_SCROLL_SPEED   = 1.2;
const INVINCIBLE_FRAMES   = 180;   // 3s @ 60fps
const SPEED_UP_INTERVAL   = 300;   // 300mごと
const SPEED_UP_RATE       = 0.20;  // 20%ずつ
const MAX_SPEED_PERCENT   = 500;
const DOWN_SWIPE_FRAMES   = 30;    // 0.5s

// ══════════════════════════════════════════════════════════════════════
// ⚠⚠⚠ テスト専用スイッチ（実機で地底ステージを確認するため・Ver.1.546）⚠⚠⚠
//   true の間は「ゲーム開始＝R6の闇のカカシを撃破した直後（R7の開始＝12,000m地点）」から始まる。
//   ⚠出荷（ストア提出）前に必ず false に戻すこと。true のままだと全プレイヤーが12,000mから始まる。
//   消し忘れ防止の保険を3つ入れてある（index.html の applyTestStart 参照）:
//     ①画面左上に赤い「TEST」バッジを常時表示 ②ランキング送信を封じる ③実績/ミッション/自己ベストに計上しない
var TEST_START_AFTER_R6 = false;
// どこから始めるか:
//   'r7'     … **R7開始の瞬間（12,000m）＝土管が出現するシーンから**（1.562でこちらを既定に）。
//              開始1フレーム目に checkBossTrigger が土管を置くので、いきなり「せり上がり演出→もぐる→地底」。
//   'r6shop' … R6のおみせ手前（11,450m）から。おみせ → 闇のカカシ → 撃破 → R7 → 土管、と通しで見たい時
var TEST_START_MODE = 'r7';
// 開始地点をさらに前進させるm数（モードの基準地点からの相対）。通常は0でよい。
var TEST_START_OFFSET_M = 0;
// ⚠1.551にあった TEST_SKIP_TO_PIPE（土管手前へのワープ）は 1.552 で廃止。
//   カカシ撃破の直後にその場で土管が出る仕様に直したので、助走のスキップ自体が不要になった。
// ══════════════════════════════════════════════════════════════════════

// ─── 急降下する空中雑魚「アカバネ」定数（1.527・ユーザー発案「攻撃してくる雑魚をR11以降に」）───
// 現行の雑魚は全4種とも「移動するだけ」で攻撃手段がゼロだったため、終盤だけに攻撃型を1種だけ足す。
// R11=24,000m＝実データでランキング上位7本だけが到達した領域＝大多数のプレイヤーには一切影響しない。
// ⚠ランキング不変条件（距離/速度/Lv=floor(距離/300)+1）には一切触れない。以下はすべて調整ノブ。
const DIVE_BIRD_ROUND     = 11;   // 出現開始ラウンド
const DIVE_BIRD_RATE      = 0.30; // R11以降、空中雑魚のうちこの割合が急降下型になる
const DIVE_BIRD_TRIGGER_X = 300;  // プレイヤーの前方この距離(px)に入ったら予告開始（1.570で240→300＝予告を早く見せる）
const DIVE_BIRD_WARN_F    = 30;   // 予告フレーム数（60fps=0.5秒）
// 予告中にプレイヤーの真上へ寄る速さ(px/frame)。⚠**1.570の不具合修正の要**（ユーザー報告
// 「アカバネが攻撃を仕掛けてくる前に消えてしまう」）。原因＝予告の30フレームの間も
// updateEnemies の `e.x += e.velX - gameState.gameSpeed` で流され続けていたこと。
// 実測: Lv17以降は gameSpeed=6.0 で頭打ちなので、プレイヤーは画面左端クランプに押されて
// 毎フレーム +6.0 進み、鳥は -(|velX|+6.0) 進む＝**両者の距離は毎フレーム約14px縮む**。
// 予告開始(240px)から30フレーム後には鳥はプレイヤーの**195px後ろ**にいて、そこから真下へ
// 急降下→跳ねて離脱していた＝一度も攻撃にならないまま画面外へ消える、という状態だった。
// 対策＝予告中はスクロール分を打ち消し、上限速度つきでプレイヤーの真上へ寄せる（狙いを定める絵と一致）。
const DIVE_BIRD_LOCK_SPD  = 5;

const DIVE_BIRD_ACC_Y     = 0.9;  // 急降下の加速度
const DIVE_BIRD_SPEED_Y   = 9;    // 急降下の最高落下速度
const DIVE_BIRD_HOME_X    = 0.03; // 降下中にプレイヤー方向へ寄る強さ（0=真下に落ちるだけ）
const DIVE_BIRD_BOUNCE_Y  = -7;   // 着地後に跳ねて離脱する初速

// ─── ボスバトル定数 ───
const BOSS_TRIGGER_DISTANCE = 2400;   // 2400mごとにボス出現
const BOSS_MAX_HP           = 100;    // 基本HP（内部HP=表示HPに統一。ボスが一巡する1周目=一律100・現在R1-R6）
const BOSS_HP_PER_ROUND     = 20;     // ラウンド毎のHP増（一巡した次のラウンドから適用＝現在R7〜）。難度は攻撃パターンでも上げる方針
const BOSS_HP_ROUND_CAP     = 7;      // HP増の上限ステップ数（R7起点+7=R13でHP240頭打ち＝戦闘の間延び防止）
// ボス出現ローテ（この順で毎ラウンド循環）。新ボスは末尾に足すだけ＝bossEncounter() が自動追随
var BOSS_KINDS = ['rooster', 'hawk', 'egg', 'snake', 'owl'];
// ボスが一巡するラウンド数（R1-R5=5種ローテ＋R6=門番カカシ＋R7=地底）。
// ⚠この1つで下記すべてが追随する: bossKindForRound / bossEncounter / ボスHPの増加起点 / BOSS_FLYING_EDGE_ROUND
const BOSS_CYCLE_ROUNDS = 7;
// ボス戦で空中雑魚が湧き始めるラウンド＝「ボスを一巡した次」。カカシ追加前はR6だったが、R6はカカシ初登場＝
// まだ一巡していないので早すぎるとユーザー判断（1.535）。地底ステージのボスを足せば自動でR8になる。
const BOSS_FLYING_EDGE_ROUND = BOSS_CYCLE_ROUNDS + 1;
// 7ラウンド周期の内訳: R1-R5=5種ローテ ／ R6=門番「闇のカカシ」 ／ R7=地底ステージ＋「闇の巫女」。以降 R8 から同じ順で反復。
// ⚠正しくループさせること（絶対原則・1.537）: ローテ番号は「特別回（カカシ・地底）を除いた通し番号」で数える。
//   素朴に (round-1)%5 とすると、特別回が枠を消費した分だけ毎周ローテがずれる（R8がニワトリでなくカラスになる等）。
//   差し引くことで R1-R5=ニワトリ/カラス/タマゴ/大蛇/フクロウ → R6=カカシ → R7=地底 → R8から再び同じ順で回る。
function isUndergroundRound(round) { return round > 0 && round % BOSS_CYCLE_ROUNDS === 0; }   // R7, R14, R21…
function isScarecrowRound(round)  { return round > 0 && round % BOSS_CYCLE_ROUNDS === BOSS_CYCLE_ROUNDS - 1; } // R6, R13, R20…
function bossKindForRound(round) {
    if (isUndergroundRound(round)) return 'priestess'; // 地底ボス「闇の巫女」
    if (isScarecrowRound(round))   return 'scarecrow'; // 門番「闇のカカシ」
    // 特別回2種を除いた通し番号（1始まり）でローテを回す
    var specials = Math.floor(round / BOSS_CYCLE_ROUNDS) + Math.floor((round + 1) / BOSS_CYCLE_ROUNDS);
    var rotIdx = round - specials;
    return BOSS_KINDS[(rotIdx - 1) % BOSS_KINDS.length];
}

// ─── 闇のカカシ（scarecrow・定点召喚＋リーチ型の門番ボス）の調整ノブ ───
// 定点(動かない)・頭(上部)が弱点。expose中だけ頭が光って踏み/弾が通る（非露出は装甲＝弾かれる）。
// 頭上部はジャンプ175pxで余裕で届く（実測）。攻撃=召喚(カラスを湧かす)／腕薙ぎ(低い横薙ぎ=ジャンプor足場で回避)。
const SC_EXPOSE_WINDOW   = 82;  // 無防備(踏み/弾が通る)になる時間
const SC_SWEEP_TELEGRAPH = 34;  // 腕薙ぎの予告フレーム
const SC_SWEEP_ACTIVE    = 20;  // 腕薙ぎの当たり有効フレーム
const SC_SUMMON_TELE     = 26;  // 召喚の予告フレーム
const SC_SUMMON_BASE     = 2;   // 1回の召喚数(phase/encounterで増える)
const SC_SWEEP_BAND_Y    = 44;  // 腕薙ぎの危険帯の高さ(GROUND_Yからのpx・ここ以下の接地で被弾)
// 対空「藁の棘」(1.535): 頭上へ棘を噴き上げる。⚠これが無いと、非露出中の弾かれ跳ね返り(長い)を利用して
// 真上に居座り踏み続けるだけで一方的に倒せてしまう（ユーザー指摘＝カカシがイージー過ぎる）。
// 対空の予告フレーム（この間に横へ逃げる）。⚠1.551で26→48に延長。ユーザー報告「白く光ったと同時に
// 攻撃が来て回避できない」＝0.43秒では、本体の発光を認識してから横へ動くのが間に合わなかったため。
// 実際の猶予は下の掛け算で決まる: phase3 は×0.75、周回で encMul が掛かる。下限は AI 側の Math.max(30,…)。
const SC_SPIKE_TELEGRAPH = 48;
const SC_SPIKE_ACTIVE    = 20;  // 対空の当たり有効フレーム
const SC_SPIKE_H         = 150; // 頭上へ届く高さ(px・ジャンプ到達175pxの居座り圏を覆う)
const SC_SPIKE_PAD       = 16;  // 危険帯の左右余白(px)
const SC_SPIKE_OVER_RATE = 0.75;// プレイヤーが頭上に居る時に対空を選ぶ確率（居座り対策）
const SC_SPIKE_MIX_RATE  = 0.22;// 頭上に居ない時でも対空を混ぜる確率（読み合いを作る）
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
    { isOpen: function() { return isScreenVisible('badgeScreen'); }, onBack: function() { hideBadgeScreen(); } },
    { isOpen: function() { return isScreenVisible('skinScreen'); }, onBack: function() { hideSkinScreen(); } },
    { isOpen: function() { return isScreenVisible('zukanScreen'); }, onBack: function() { hideZukanScreen(); } },
    { isOpen: function() { return isScreenVisible('guideScreen'); }, onBack: function() { hideGuide(); } },
    { isOpen: function() { return isScreenVisible('tutorialScreen'); }, onBack: function() { tutorialCancel(); } },
    { isOpen: function() { return isScreenVisible('settingsScreen'); }, onBack: function() { hideSettings(); } },
    { isOpen: function() { return isScreenVisible('nameInputScreen'); }, onBack: function() { hideNameInputDirect(); resetGame(); } },
    { isOpen: function() { return isScreenVisible('gameOverScreen'); }, onBack: function() { goToTitle(); } },
    { isOpen: function() { return isScreenVisible('rankingScreen'); }, onBack: function() { hideRanking(); } },
    // タイトルメニュー（P4）: 上に重ねて開く各画面より後＝最後に閉じる。
    // menuSelf: 子画面の閉じるボタン由来のpopstate（titleMenu状態へ戻る）では閉じない目印（bootstrap.jsのpopstate参照）
    { isOpen: function() { return isScreenVisible('titleMenuScreen'); }, menuSelf: true, onBack: function() { hideTitleMenu(); } },
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
    ugDistOffset: 0,   // 地底で積み上がる「距離表示の圧縮量(px)」。distance=floor((camera.x-これ)/10)。UG_DIST_SCALE 参照
    // ステージ進行のズレ補正(m・1.553)。**バイオームの2,400m周期とボス距離の両方に同じ値を足す**ことで
    // 「1ラウンド＝草原→砂漠→雪山→夜→ボス」を保つ。通常は0で、地底を出た時だけ更新される。
    // ⚠バイオームは絶対距離の2,400m周期、ボスも絶対距離の2,400m刻み＝この一致が崩れると周期がずれる。
    //   地底は2,400mの倍数でない量(800m)を足すので、退場時にここでグリッドを引き直す。
    stageShiftM: 0,
    puLemon: 0, puShield: 0, puEnergy: 0, puMagnet: 0,
    ugElixir: 0, elixirFireTimer: 0,   // 老婆の劇薬（1.569・地底ショップ／残フレームと発射間隔）
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
    goldenEggFieldSpawned: false,  // 2500m日次エッグの一次抽選をこのランで行ったか（per-run）
    goldenEggRescueArmed: false,   // 一次抽選(2500m/30%)を外し、R4での救済抽選(80%)が保留中か（per-run・1.455〜）
    goldenEggRescueDone: false,    // R4の救済抽選をこのランで行ったか（per-run・1.455〜）
    missionCountedCoins: 0, missionCountedBoss: 0, missionCountedSpecial: 0,
    specialGauge: 0, specialMoveLevel: 0, specialCutinTimer: 0, specialCutinActive: false
};

var player = {
    x: 150, y: 286, width: 48, height: 48,
    velX: 0, velY: 0, onGround: false, groundType: 'normal',
    facing: 'right', animFrame: 0,
    coyoteTimer: 0, jumpBufferTimer: 0  // 操作フィール(1.460): コヨーテタイム/ジャンプ先行入力
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

// ボス戦中に固定するバイオーム（夜=3）。R1ボスは砂漠/雪山の境界(1200m)で凍結し、地面=砂漠・ブロック=氷とちぐはぐ＆
// 滑る/遅くなる不具合が出る（ユーザー指摘）。ボスの空は元々夜のBOSS_SKYなので、見た目・物理とも夜に統一して全ラウンド揃える。
var BOSS_BIOME = 3;

// ─── ショップシステム ───
var SHOP_SAFE_ZONE_START = 250; // ボス出現の250m前から安全地帯
var SHOP_BUILDING_OFFSET = 100; // ボス出現の100m前にショップ建物
var SHOP_SAFE_ZONE_SPEED = 1.5; // 安全地帯のスクロール速度

// ─── チュートリアル「はじまりの地」（Phase3.5） ───
// クリアするまで新規プレイヤー(totalPlays=0)は毎回ここから。クリア後は設定「チュートリアルをあそぶ」で再プレイ可。
// 報酬のゴールデンエッグは初回クリアのみ（再プレイ/チュートリアルの土管部屋では出さない＝稼ぎ場防止）。
var TUTORIAL_CLEAR_EGGS = 3;   // 初回クリア報酬（調整ノブ）
var TUTORIAL_BOSS_M     = 760; // ボス出現距離(m)
var tutorialState = {
    active: false,    // このランがチュートリアルか
    forced: false,    // クリア済みでも設定から再プレイ（1ランで解除）
    stepIdx: 0,       // TUTORIAL_SCRIPT の進行位置
    hintKey: '',      // 表示中の案内（i18nキー・''=非表示）
    hintTimer: 0,     // 案内の残フレーム
    slowTimer: 0,     // 案内地点の一時減速の残フレーム
    bossGuided: false,
    skipArmed: 0,     // スキップ二度押し確認の残フレーム
    gate: '',         // 達成待ちゲート（''=なし / 'jump'|'stomp'|'stock'|'pipe'）＝実行するまで世界停止
    gateKills: 0      // stompゲート開始時の撃破数（増えたら達成）
};
// ラン中に適用するスキン（チュートリアルはサンドボックス＝デフォルト固定・案A 1.421）。
// gameSettings.activeSkin は書き換えない＝きせかえの設定はそのまま、次の通常ランで自動復帰。
// メイド(クリティカル)/きぐるみ(電気弾)の戦闘効果が台本を壊さないよう、見た目ごと初期状態にする
function runActiveSkin() {
    return tutorialState.active ? '' : (gameSettings.activeSkin || '');
}
// 台本: 到達距離(m)で案内を出す。slow=一時減速 / spawn=敵をその場で湧かせる /
// gate=達成待ち（その行動を実行するまで世界停止・updateTutorialが判定）
// テロップは「対象がしっかり画面内に入って近づいてきた頃」に出す（1.430再調整）:
// 見え始め(対象-80m)では早すぎ、到達ギリギリでは遅い → 対象の約40〜50m手前で発火
var TUTORIAL_SCRIPT = [
    { atM: 10,  key: 'tut_welcome',   dur: 300 },
    { atM: 50,  key: 'tut_move',      dur: 240 },
    { atM: 100, key: 'tut_jump',      dur: 300, gate: 'jump',  doneKey: 'tut_jump_done' },   // 穴150m: 穴と先の地面が両方見えてから停止
    { atM: 220, key: 'tut_stomp',     dur: 330, spawn: 'chick', gate: 'stomp', doneKey: 'tut_stomp_done' }, // 湧きと同時に案内＝踏むまで停止
    { atM: 295, key: 'tut_coin',      dur: 300 },                 // コイン列340m〜
    { atM: 400, key: 'tut_stock',     dur: 330, gate: 'stock', doneKey: 'tut_stock_done' },  // おためしバリアを使うまで停止
    { atM: 465, key: 'tut_pipe',      dur: 420 },                 // 土管530m: 近づいたら案内
    { atM: 490, key: 'tut_pipe',      dur: 420, gate: 'pipe',  doneKey: 'tut_pipe_done' },   // 入るまで停止（歩いて届く距離）
    { atM: 585, key: 'tut_shop',      dur: 300 },                 // おみせ640m: 近づいたら案内
    { atM: 610, key: 'tut_shop',      dur: 420, gate: 'shop',  doneKey: 'tut_shop_done' },   // 入店するまで停止（ドア649m）。事前入店時も他課題と同様に具体文言で褒める（汎用「もうできてましたね」は使わない・ユーザー指摘）
    { atM: 700, key: 'tut_boss_warn', dur: 240 }
];

// ─── 土管ボーナス部屋 ───
var PIPE_W = 88, PIPE_H = 66;                       // 入口（縦）土管のサイズ(px)。1.407:72→88→1.409:176→1.441:88（広すぎとのユーザー指定で半分に。見た目はrender.jsがp.width基準で相殺描画＝判定と常に一致）
var PIPE_MOUTH_LINE = 5;                            // 衝突上面(p.y)から「上面の穴の手前縁」までのpx（スプライト実測値）。出入り演出はこのラインより上だけプレイヤーを描く＝穴に沈む見た目
var PIPE_ASSIST_FRAMES = 120;                       // 土管タイム: 土管に乗ってから世界を減速する猶予（2秒・1土管1回）
var PIPE_ASSIST_SLOW = 0.25;                        // 土管タイム中のスクロール倍率（高速域でも落ち着いて下スワイプできる）
var SIDE_PIPE_W = 140, SIDE_PIPE_H = 74;            // 出口（横）土管のサイズ(px・口は左向き)
var PIPE_ROOM_FLOOR_Y    = GAME_HEIGHT - 64;        // 部屋の床上端（画面座標）
var PIPE_ROOM_LEFT       = 110;                     // プレイヤーの入場落下X＆報酬配置の起点（画面座標）
var PIPE_ROOM_WALL_W     = 48;                      // 左右の壁（見える壁）の厚み(px)。プレイヤーはこの壁の内側で止まる（見えない壁をなくす）
var PIPE_EXIT_HOLD_FRAMES = 21;                     // 出口土管の口に接触＋右押し継続で退室に必要なフレーム数(≒0.35秒@60fps・1.410で半減)。誤操作防止の最低限だけ残す
var SIDE_PIPE_MOUTH_LINE = 30;                      // 出口(横)土管の左端から「口の内側の縁」までのpx（スプライト実測31の直前）。退室演出はこのラインより左だけプレイヤーを描く＝口に入っていく見た目

// ─── リスク&リワード演出（ニアミス回避／ノーダメージ継続） ───
var NEAR_MISS_RANGE = 14;   // ニアミス判定: 敵の当たり判定をこのpx分ふくらませた範囲を「かすめた」とみなす
var NEAR_MISS_BONUS = 100;  // ニアミス回避ボーナス(スコア)
var NODMG_STEP  = 500;      // ノーダメージ継続ボーナスの間隔(m)
var NODMG_BONUS = 500;      // ノーダメージ継続ボーナス(スコア/回)
// ─── 地底ステージ（R7/R14/R21…・SPEC_UNDERGROUND.md が正） ───
// ⚠土管ボーナス部屋との決定的な違い: 部屋は「画面座標＋固定カメラ」だが、地底は**ワールド座標＋追従カメラ**。
//   camera.x をプレイヤー追従で前進させることで、距離 distance=floor(camera.x/10) が既存の式のまま自動加算される
//   （ランキング計算に特別扱いを足さない）。構造的にはチュートリアル（作り込み固定地形）に近い。
// ⚠カメラの走行距離＝そのまま距離加算量。**画面幅に依存させないこと**（GAME_WIDTH は画面比で可変なので、
//   終端を「レベル幅 − 画面幅」で決めると横長端末ほど加算量が減り、ランキングに端末差が出る＝実測で最大16m）。
//   そこでレベル本体は UG_TRAVEL_PX + 1画面ぶん敷き、カメラは必ず UG_TRAVEL_PX だけ進むようにする。
// カメラ走行距離。⚠加算量は「UG_TRAVEL_PX × UG_DIST_SCALE ÷ 10 (m)」＝24,000×0.5÷10＝**1,200m**（全端末で同一）。
// ⚠**この値＝ボス闘技場の左端**でもある（レベルの横幅は「これ＋闘技場40タイル」で組む）。
//   闘技場に入った時点で加算が完了しているので、ボス戦の長さは距離＝ランキングに影響しない。
// 1,200m は SPEED_UP_INTERVAL(300m) のちょうど4レベル分＝地底の踏破中にきれいに4回レベルが上がる（ユーザー指定1.566）。
// 変遷: 12,300px(1,230m・圧縮前) → 16,000px(800m・1.549) → **24,000px(1,200m・1.566/実プレイ後のユーザー判断)**。
const UG_TRAVEL_PX     = 24000;
// 地底の速さ（1.544で1本化）。⚠**歩行とカメラ前進の両方に掛ける**こと。片方だけ絞ると壊れる:
//   カメラだけ絞ると歩行(6px/f)がカメラに追いつかれず約2秒で画面右端のクランプに貼り付き、
//   クランプが velX=0 するので**前方へジャンプできなくなる**（溶岩の池もトゲ床も飛び越えられない）。
//   MOVE_SPEED(6) === BASE_SCROLL_SPEED*5.0(6)＝地上のスクロール上限 なので、同じ倍率を両方に掛ければ
//   「歩行 = カメラ上限」が常に成立し、右端クランプは純粋な保険に戻る（貼り付きゼロ）。
// 0.5 = 歩行3.0px/f・加算18.0m/秒（地上の上限36.0m/秒のちょうど半分）・素走りの踏破68秒。
// ⚠下げるほどジャンプ飛距離も比例して縮む（滞空は約46フレーム固定なので 飛距離 = 歩行速度 × 46）:
//   6.0px/f→276px(6タイル) / 3.0px/f→138px(2〜3タイル) / 1.2px/f→55px（ぴよ氏の幅48pxとほぼ同じ＝穴が作れない）。
//   ギミック(ファイアバー/溶岩の池/トゲ床)が成立する下限は 0.33 前後。総加算量(1,230m)はレートに依らず不変。
// ⚠はやあし(1.3倍)は地底では効かない＝この倍率で上書きされる（index.html の speedMul 参照）。
const UG_SPEED_RATE    = 0.5;
// 「見かけ上のm」だけを圧縮する倍率（1.548・ユーザー指定「人間の歩く速度にしては加算が多すぎる」）。
// ⚠これは**表示される距離だけ**を変える。カメラ・歩行速度・床や物との位置関係・物理は一切変わらない。
//   仕組み: 地底でカメラが d px 進むたび gameState.ugDistOffset に d*(1-UG_DIST_SCALE) を積み、
//   距離を floor((camera.x - ugDistOffset)/10) で出す＝**加算だけが UG_DIST_SCALE 倍になる**。
//   ・単調増加は保たれる（offsetの増分 d*0.5 < カメラの増分 d なので距離は必ず増える）
//   ・端末差なし（カメラ走行は全端末で UG_TRAVEL_PX 固定なので、減る量も 6,150px=615m で一致）
//   ・offsetはラン中ずっと残る＝地上へ戻った後も「地底で稼いだ分が半分」の状態が続く（resetGameでリセット）
// 0.5 = 加算 18.0m/秒 → **9.0m/秒**、地底1回の加算 1,230m → **615m**（踏破69秒・歩行3.0px/fは変わらない）。
const UG_DIST_SCALE    = 0.5;
const UG_CAM_LEAD      = 0.35;  // 追従カメラ: プレイヤーを画面のこの位置に置く（0=左端）
const UG_PLAYER_MARGIN = 24;    // 左壁: プレイヤーがカメラ左端からこれ以上左へ行けない
const UG_INTRO_FRAMES  = 70;    // 天井の穴から落下してくる導入演出のフレーム数（着地したら即解除）
// 入場用の強制土管（1.545・SPEC_UNDERGROUND.md §3）。ボーナス部屋の土管(PIPE_W=88/PIPE_H=66)より一回り大きい＝
// 「いつもの土管ではない・ここが入口だ」と一目で分かる。⚠render.js は p.width/p.height 基準で描くので判定と常に一致する。
const UG_PIPE_W        = 132;   // 強制土管の幅(px)
const UG_PIPE_H        = 100;   // 強制土管の高さ(px)
// ⚠入場土管は item_pipe.png を使わず**手続き描画**（render.js の drawUndergroundPipe）。理由:
//   ①画像は192pxなので132px幅だと235pxに拡大され元解像度を超えてドットが粗くなる
//   ②画像描画のオフセット(p.y-16/高さ+25)は PIPE_H=66 専用の実測値で、高さ100だと管の下端が地面より3.5px浮く
//   ③赤くして「いつもの土管ではない」特別感を出したい（ユーザー指定）
//   既存の drawChest / 洞窟タイルと同じ「画像アセットを増やさず手続きで描く」方針に揃える。
const UG_PIPE_MOUTH_RY = 12;    // リップ上面(楕円)の縦半径。⚠スプライトの外周楕円(中心y=6・縦半径6)の2倍。
//   当たり判定の上面＝この楕円の中心に置く（drawUndergroundPipe は p.y - これ を描画原点にする）。
// 「穴（暗い開口部）の最下部」までの距離(px・当たり判定の上面から)。沈む演出のクリップ位置に使う。
// ⚠スプライトの穴は E(g,33,6,26,4) ＝ 中心 art y=6・縦半径4 なので最下部は art y=10。
//   画面では 描画原点(p.y - UG_PIPE_MOUTH_RY=12) + 10×2倍 = p.y + 8。
//   リップの縁(p.y+12)で切ると穴の最下部より4px下まで体が残る（1.560 ユーザー報告）。
const UG_PIPE_MAW_BOTTOM = 8;
// 入場土管が地面からせり上がってくる演出のフレーム数（1.554・ユーザー指定「轟音と共に迫り上がる」）。
// ⚠この間は土管に入れない（せり上がり切ってからヒントが出る）。地面より下は描画をクリップして隠す。
// 180フレーム＝**3.0秒**（1.557でユーザー指定により54→180）。⚠地響きSE(sounds/pipe_rise.mp3)も
// 3.0秒ちょうどに切り出して末尾0.5秒フェードアウト済み＝演出と音の長さが一致している。
// ここを変えるなら音源も同じ長さに作り直すこと（原盤は tools/_raw/pipe_rise_full.mp3・10.79秒）。
const UG_PIPE_RISE_FRAMES = 180;
const UG_PIPE_SCREEN_X = 0.55;  // 土管を置く画面内の位置（0=左端・1=右端）。プレイヤーの少し先に出す
// 地底へのスポーン（1.545・ユーザー指定「左端の画面外上から落ちてくる」）
const UG_SPAWN_X       = 56;    // レベル左端からのx(px)。⚠UG_PLAYER_MARGIN(24)より右＝左壁クランプに食い込まない
const UG_SPAWN_Y_ABOVE = 90;    // 画面上端からこのpxぶん上に出現（落下が見えるように画面外から）

// ─── P2-b: レベルデータとギミック（1.563） ───
const UG_TILE = 32;             // レベルのタイル1辺(px)。地形スプライトも32pxなので1マス=1タイル
// 部屋の「床面」はマップ最下行の 3行上（＝下に2行ぶんの詰め物がある）に置く約束。
// camY = マップ下端 - GAME_HEIGHT にすると床面は必ず画面の y=354 に来る（450 - 96）。
// ⚠この約束のおかげで、部屋どうしの床の高さを揃えるだけでカメラの高さも自動的につながる。
const UG_FLOOR_PAD_ROWS = 2;    // 床面の下に敷く詰め物の行数（画面下端まで岩で埋めるため）
const UG_CAM_FLOOR_GAP  = 96;   // 床面から画面下端までの距離(px) = UG_FLOOR_PAD_ROWS+1 行ぶん
// 「降りる部屋」でのカメラ（1.564・ユーザー報告「下へ降りて進む時に下の地形が見えず理不尽」）。
// ⚠登りは足元が画面下寄り(354)でも構わない（跳ぶ先＝上は見えている）が、**降りる時は進行方向が下**なので
//   同じ置き方だと着地点が画面外になり、見えない床へ跳ぶことになる。降りる部屋だけ足元を画面の上寄りに置き、
//   下に見える範囲を稼ぐ。⚠部屋の最下部では camMaxY のクランプが効いて自然に通常の見え方へ戻る。
const UG_CAM_DESCEND_GAP = 250; // 降りる部屋での床面〜画面下端の距離(px)。足元は画面 y=200 に来る
const UG_CAM_LERP       = 0.14; // 縦カメラの追従係数（大きいほど機敏・小さいほど落ち着く）
const UG_CAM_EDGE       = 60;   // プレイヤーが画面のこの距離より外へ出そうならカメラを強制で寄せる（保険）
// 落下死のライン。⚠地底は縦カメラで下へ降りるので**画面座標では判定できない**（降りただけで死ぬ）。
// 部屋ごとに「マップ下端 + これ」をワールド座標の死亡ラインにする。
const UG_DEATH_MARGIN   = 140;
// ギミックの調整ノブ（すべて1周目の値。2巡目以降の強化はP4で bossEncounter() 連動にする）
const UG_FIREBAR_SEG    = 26;   // ファイアバーの炎セグメント間隔(px)
const UG_FIREBAR_R      = 11;   // 炎セグメントの当たり半径(px)
const UG_FIREBAR_SPEED  = 0.022;// 標準の角速度(rad/frame)＝約4.8秒で1回転（リズムが読める速さ）
const UG_FIREBALL_G     = 0.42; // 火の玉の重力（放物線の見た目を決める）
const UG_FIREBALL_R     = 13;   // 火の玉の当たり半径(px)
const UG_SPIKE_H        = 14;   // トゲ床の当たり高さ(px・見た目より低め＝理不尽にしない)
// トゲの当たり判定を左右から削る量(px)。⚠1.564でユーザー報告「見た目には触れていないのに被弾する」を受けて新設。
// 既存の敵ダメージ判定は aabbShrink(player, e, 14, 12) ＝**プレイヤーと相手の両方を14pxずつ削る**（＝片側28pxの猶予）。
// 1.563のトゲはプレイヤーを8px削るだけで相手を削っていなかったので、**game内の他のどの当たりより20px厳しい**状態だった。
// これで「絵の三角に触れたら当たる」に一致する（描画も左右4px内側に描いてある）。
const UG_SPIKE_INSET    = 6;
const UG_HAZARD_SHRINK_X = 14;  // 炎/トゲ判定でプレイヤーを左右から削る量。既存の敵ダメージ判定と同じ値に揃える
const UG_HAZARD_SHRINK_Y = 10;  // 同・上下
// シャレコ（骨だけの鳥・1.563）。⚠**倒せない敵**＝踏むと崩れてN秒後に再生する（マリオのカロン相当）。
const UG_SKULLY_REVIVE  = 210;  // 崩壊から再生までのフレーム数（3.5秒）
const UG_SKULLY_WARN    = 60;   // 再生の予兆（骨がガタガタ震える）フレーム数。理不尽な復活にしない
const UG_SKULLY_SCORE   = 200;  // 初回の崩壊だけ入るスコア（2回目以降は0＝連続踏みで稼げない・ユーザー決定1.563）

// ─── 地底専用ショップ「怪しい老婆の店」（1.567・ユーザー指定） ───
// ⚠既存のステージショップ（shop.png の建物）とは別物。地上の「建物が建っている」表現は地底では成立しないので、
//   **岩壁に掘られた洞窟の入口**にする（ユーザー指定「入口も洞窟っぽいのがいい」）。
// ⚠見た目の方針は洞窟タイル(1.542)/入場土管(1.549)/宝箱(1.452)と同じ＝**画像アセットを増やさず手続きで描く**。
//   2pxグリッドに丸めてドット絵の粒を揃える。滑らかなグラデは「灯りのにじみ」だけに使う。
const UG_SHOP_W = 136;          // 入口の幅(px)
const UG_SHOP_H = 120;          // 入口の高さ(px・床から上へ)
const UG_SHOP_NEAR = 90;        // プレイヤーがこの距離まで近づくと案内を出す（入店実装時に使う）

// ─── ボス闘技場への移行（1.564・ユーザー指定「ロックマンのように別の部屋へ移り、ボス戦は固定1画面」） ───
// フェーズ: 0=まだ / 1=入場(カメラが闘技場へ寄る・自動歩行) / 2=背後の扉が閉じる / 3=ボス登場 / 4=戦闘 / 5=撃破演出
const UG_BOSS_PAN_FRAMES   = 70;   // ①カメラが闘技場へ寄りきるまで
const UG_BOSS_DOOR_FRAMES  = 45;   // ②背後の扉が降りてくる（逃げ場が無くなる合図）
const UG_BOSS_APPEAR_FRAMES= 80;   // ③ボスが現れる（紫の渦→実体）
const UG_BOSS_DEFEAT_FRAMES= 180;  // ⑤撃破演出→退場（1.570で120→180・崩れ落ちる演出とファンファーレの尺）
const UG_BOSS_SCORE        = 10000; // SPEC §8: 通常ボス5,000の倍額
const UG_BOSS_COINS        = 12;    // SPEC §8: 「多め」

// ─── 闇の巫女（P3・1.570／正の仕様は SPEC_UNDERGROUND.md §7） ───
// ⚠**この部屋の高さが全部の数字を決めている**（触る前に読むこと）:
//   闘技場は床 worldY=1180／天井の下端 worldY=860 の **320px** しかない。地底の歩行は3.0px/f・
//   最高到達175pxなので、床に立つ足元(1180)からジャンプしても**足元は worldY=1005 までしか上がらない**。
//   ＝浮遊高度と詠唱高度は「踏めない／踏める」をこの1005で分けている。片方だけ動かすと戦闘が成立しなくなる。
// ⚠W/H は **images/boss_priestess_idle.png の実寸(104×132)と必ず一致させること**（拡大縮小でボケる）。
// ⚠絵の中身（体）は104pxのうち**中央68px**で、左右に18pxずつ透明の余白がある。これは偶然ではなく
//   当たり判定と噛み合っている: 体当たりは aabbShrink(player, b, 18, 14) ＝両者を18px削る＝
//   ボスの箱がちょうど 104-36 = **68px＝見えている体そのもの**になる。W を変えるならこの18も見直すこと。
const UG_BOSS_W            = 104;
const UG_BOSS_H            = 132;
const UG_BOSS_HOVER_DY     = 120;  // 浮遊時の上端 = ch.topY + これ (=916)。下端1048＝床より132px上＝**踏めない**
const UG_BOSS_CAST_DY      = 238;  // 詠唱で降りた時の上端 (=1034)。下端1166＝床の14px上＝浮いたまま**踏める**
const UG_BOSS_EYE_DY       = 0.23; // 絵の中で目が光っている高さ（実測）。上に光をにじませる位置
const UG_BOSS_ORB_DY       = 0.42; // 絵の中で両手の間の玉がある高さ（実測）。呪弾はここから出る
// 邪神の巨像（1.570・ユーザー指定「小部屋の真ん中に、いかにもボス戦が始まると分かる目印」）。
// ⚠**飾り＝当たり判定なし**。闘技場の左端＝カメラ終端なので、門を歩いている間から巨像が見える＝予告になる。
const UG_IDOL_W            = 220;  // images/ug_idol.png の実寸
const UG_IDOL_H            = 300;
const UG_BOSS_HP           = 200;  // SPEC §7.2（✅ユーザー決定・通常ボス100の2倍）。
                                   // ⚠2巡目以降(R14…)のHP増は**仕様未決**（SPEC §7.2「2巡目の仕様決定時に確定」）。
                                   //   代わりに難度は encMul（行動サイクルの速さ）で上げる＝通常ボスと同じ方針。
const UG_BOSS_STOMP_DMG    = 10;   // 通常ボスの踏みと同一（＋侍ぴよ急降下斬りで+1）
const UG_BOSS_STOMP_CD     = 40;   // 踏み無敵。⚠反撃(counter)へ必ず移るので連打では削れない
const UG_BOSS_CURSE_TELE   = 38;   // 呪弾の予告フレーム（3.0px/f ＝ この間に114px 動ける）
const UG_BOSS_CURSE_SPD    = 3.2;  // 呪弾の速さ
const UG_BOSS_CURSE_STEP   = 0.40; // 呪弾どうしの角度差(rad≒23°)。⚠**隙間を抜けて避ける**設計なので詰めすぎない
const UG_BOSS_CAST_DROP    = 26;   // 詠唱の降下にかけるフレーム
const UG_BOSS_CAST_WINDOW  = 96;   // 詠唱＝硬直＝踏みチャンスの長さ
const UG_BOSS_RISE         = 30;   // 浮遊高度へ戻るフレーム
const UG_BOSS_COUNTER_TELE = 22;   // 踏まれた直後の反撃の溜め。⚠0にしない＝踏んだ直後に問答無用で被弾になる
const UG_BOSS_SIGIL_TELE   = 54;   // 魔法陣の予告（床に円が浮かぶ）
const UG_BOSS_SIGIL_ACTIVE = 34;   // 光柱が立っている時間
const UG_BOSS_SIGIL_R      = 46;   // 魔法陣＝光柱の半径(px)。円と円の間に必ず立てる幅を残すこと
const UG_BOSS_BLINK_OUT    = 18;   // 瞬間移動: 消えるまで
const UG_BOSS_BLINK_IN     = 26;   // 瞬間移動: 渦→実体化まで（この間は当たり判定なし）
const UG_BOSS_DARK_TELE    = 60;   // 大詠唱: 暗転していく
const UG_BOSS_DARK_HOLD    = 96;   // 大詠唱: 安全地帯が光っている時間（終わりに判定）
const UG_BOSS_SAFE_W       = 200;  // 安全地帯の幅(px)。3.0px/f で最大280px 歩けば届く配置にする
const UG_BOSS_CLONE_TIME   = 300;  // 分身が出ている時間（P3）
const UG_BOSS_CLONE_FIRE   = 56;   // 分身中、**本物だけ**が呪弾を撃つ間隔＝これが見分ける手がかり
// ── 派手さの調整ノブ（1.570・ユーザー指定「エフェクトや攻撃パターンをできるだけ派手に」）──
// ⚠**派手さは見た目で出し、避けにくさでは出さない**。弾の本数を増やしても角度差(UG_BOSS_CURSE_STEP)は
//   詰めないので「隙間を抜けて避ける」設計は保たれる。速さ・予告フレームも据え置き。
const UG_BOSS_PHASE_TELE   = 84;   // HP60%/30%を割った瞬間の「力を解き放つ」演出（この間は無敵・攻撃しない）
const UG_BOSS_SPIRAL_N     = 14;   // 螺旋弾幕（P3）の発射回数
const UG_BOSS_SPIRAL_GAP   = 6;    // 螺旋弾幕の発射間隔フレーム
const UG_BOSS_SPIRAL_STEP  = 0.55; // 1発ごとに回す角度(rad)＝これで渦を巻く。2方向へ同時に出す
const UG_BOSS_TRAIL        = 10;   // 残像の枚数（瞬間移動・移動中に尾を引く）

var undergroundState = {
    active: false,        // 地底に居るか（ループ/描画/地形生成の分岐に使う単一の真実）
    visited: false,       // このラウンドで入場済みか（再入場防止・ラウンド変化でリセット）
    pipePlaced: false,    // 強制土管を配置済みか（配置中はスクロール停止＝土管に入る以外の選択肢がない）
    pipeX: 0,             // 強制土管のワールドX
    pipeAnim: false,      // 土管に沈む演出中か（updatePipeAnim の完了時、部屋ではなく地底へ行く目印）
    pipeRise: 0,          // 入場土管のせり上がり経過フレーム（0→UG_PIPE_RISE_FRAMES で地面から完全に出る）
    originX: 0,           // レベルのワールド原点（入場時の camera.x 基準）
    camMaxX: 0,           // カメラの終端X（originX + UG_TRAVEL_PX）＝ここまで進むと必ず1,230m加算される
    endX: 0,              // レベル地形の終端X（camMaxX + 1画面ぶん＝最後まで床が続く）
    savedGameSpeed: 0,    // 復帰用スクロール速度
    introTimer: 0,        // 落下導入の残フレーム（>0 の間は入力ロック＋無敵）
    checkpointX: 0,       // 復帰位置（直近の安全な足場・溶岩の上に戻さないため）
    checkpointY: 0,
    cleared: false,       // ボス撃破済み（退場処理へ）
    // ── P2-b（1.563）──
    rooms: [],            // 部屋の実体（ワールド座標に展開済み）。x0/x1/camMinY/camMaxY/deathY を持つ
    roomIdx: 0,           // プレイヤーが今いる部屋の添字（カメラの縦の可動域と死亡ラインの参照元）
    camY: 0,              // 縦カメラの現在値（render が translate(-camera.x, -camera.y) で使う）
    camAnchorY: 0,        // 縦カメラの目標（最後に接地した足元Y。ジャンプではカメラを動かさないため）
    decor: [],            // 当たり判定なしの石積み（門/アーチ）。地形の奥に暗めで描くだけ
    shop: null,           // 怪しい老婆の店 {x,baseY}（マップの 'W' から設置・当たり判定なし）
    idol: null,           // 邪神の巨像 {x,baseY}（マップの 'I' から設置・当たり判定なし・1.570）
                          // ⚠置き場所は**ボス部屋ではなく「門の手前の祭壇」**（ユーザー指定）
    braziers: [],         // 紫の燭台 {x,baseY}（マップの 'i'・飾りのみ／ボス前の予告に使う）
    lava: [],             // 溶岩の池 {x,y,w,h}（触れたら fallDeath＝穴と同じ扱い）
    spikes: [],           // トゲ床 {x,y,w}（触れたら takeDamage＝無敵3秒）
    fireBars: [],         // ファイアバー {x,y,len,speed,ang}
    fireballs: [],        // 火の玉 {x,y,period,power,timer,cy,vy,live}
    // ── ボス闘技場（1.564）──
    bossPhase: 0,         // 0=まだ / 1=入場 / 2=扉 / 3=登場 / 4=戦闘 / 5=撃破演出
    bossTimer: 0,         // 各フェーズの経過フレーム
    bossPanFrom: 0,       // 入場演出の開始時 camera.x（camMaxX へ寄せる補間の起点）
    bossDoorX: 0,         // 背後で閉じる扉のワールドX（闘技場の左端）
    bossSpawnX: 0,        // 実体化する位置(ワールドX)。⚠**画面内**で決める＝闘技場は画面より広いので
                          //   部屋の幅から比率で置くと狭い端末では渦もボスも画面外に出る（1.570）
    boss: null,           // 闇の巫女の本体（ugSpawnPriestess が生成・中身はその関数を見ること）
    // ── 闇の巫女の攻撃（1.570）。⚠**呪弾だけは bossState.eggs を流用する**（SPEC §7.2）＝
    //    updateEggs のシールド判定/移動/被弾/消滅がそのまま効く。ここに持たせるのは新規の2種だけ。
    sigils: [],           // 魔法陣→光柱 {x, timer, live}（P2〜）
    dark: null,           // 大詠唱 {timer, safeX, resolved}（P3・安全地帯以外に一撃）
    flash: 0, flashMax: 1,// 画面全体の閃光（フェーズ移行・大技の着弾）。⚠画面座標で描く＝translateの外
    mobTimer: 0           // ボス戦中に画面外から歩いてくる雑魚の次の湧きまでのフレーム（1.570）
};

// ═══════════════════════════════════════════════════════════════════
// 地底のレベルデータ（P2-b・1.563）
// ═══════════════════════════════════════════════════════════════════
// 【表現形式】1マス=32pxのテキストマップ。16,000pxを座標のオブジェクト配列で書くのは非現実的なので、
//   「部屋」ごとに1文字=1タイルの行文字列で持つ。⚠行を100文字の生リテラルで並べると編集不能になるため、
//   必ず ugRow(幅, 土台文字, [[開始列,'上書き文字列'], …]) で書くこと（下の全部屋がその形）。
//
// 【縦の約束（これ1つで部屋どうしが自動でつながる）】
//   ・部屋の「床面」は必ず **マップ最下行の3行上**（下に UG_FLOOR_PAD_ROWS=2 行の詰め物）。
//   ・カメラの下限 camMaxY = マップ下端 − GAME_HEIGHT。この2つの約束から、床面は常に画面 y=354 に来る。
//   ・つまり **隣り合う部屋の床の高さ(worldY)を揃えるだけで、カメラの高さも自動で一致する**。
//   ・worldY(row) = topY + row*32。部屋の高さ = rows*32。
//
// 【左に戻れない制約（SPEC §11.4）】左壁クランプは「最も右に進んだ地点 − GAME_WIDTH*0.35 + 24」。
//   ＝どの時点でも **約263px(8タイル)ぶんしか戻れない**。よって縦の部屋は必ず「右へ進みながら登る/降りる」
//   階段状にし、踏み外した時は落下先を溶岩にして**チェックポイント復帰**で救う（＝下で詰まらせない）。
//
// 【作図の物理的な上限（実測値・厳守）】歩行3.0px/f・滞空45フレーム。
//   ・水平跳躍 135px。⚠ただし135pxは「ギリギリ引っかかる」値なので、**必要な穴は最大3タイル(96px)** にする
//     （4タイル=128pxだと余裕7pxで、最高速で端ギリギリを踏まないと落ちる＝片手操作では事故になる）。
//   ・最高到達 175px。⚠段差は **4行(128px)まで** にする（余裕47px）。
//   ・1画面 820×450px（横は端末で最大1150まで伸びる＝縦の部屋は横幅32タイル=1024pxに収めて全景が入るようにした）
//
// 【凡例】
//   ' ' 空間            '#' 岩（ソリッド・全方向に当たる）   'B' 石積み（ソリッド・城の遺構／物理は#と同一）
//   'b' 石積みの**飾り**（当たり判定なし＝通り抜けられる。門やアーチなど「歩いてくぐる建築」に使う）
//   'i' 紫の燭台（飾り・当たり判定なし）。⚠**ボスが近いことの予告**に使う＝門へ近づくほど密に置く
//   'I' 邪神の巨像（飾り・当たり判定なし・1.570）。⚠**門をくぐる直前の祭壇に1体だけ**置く（ユーザー指定）
//   '=' 片道足場        'M' 上下に動く床（片道・既存 special:'moving' を流用）
//   'L' 溶岩（触れたら fallDeath＝穴と同じ）                '^' トゲ床（takeDamage＝無敵3秒）
//   'F' ファイアバー(長4・時計回り)  'G' ファイアバー(長4・反時計回り)  'H' ファイアバー(長6・時計回り)
//   'f' 火の玉(周期150f)             'e' 火の玉(周期100f・速い)
//   'o' コイン          'S' シャレコ（骨だけの鳥＝倒せない）
//   アイテム（1.564）: '1'ハート(回復) '2'レモン缶 '3'シールド '4'エナジー '5'マグネット
//   'c' ひよこ          'g' ゴールデン        'm' ニワトリ        'v' 飛行ひよこ        'd' アカバネ
// ⚠敵は**遅延スポーン**（カメラが近づいてから実体化）。全部を最初に置くと、到達前に勝手に歩いて落ちてしまう。

// 行の組み立て。⚠マップは必ずこれで書く（生リテラルの長い行は事故のもと）
function ugRow(w, base, parts) {
    var a = new Array(w), i, p, k;
    for (i = 0; i < w; i++) a[i] = base;
    if (parts) for (p = 0; p < parts.length; p++) {
        var c = parts[p][0], s = parts[p][1];
        for (k = 0; k < s.length; k++) if (c + k >= 0 && c + k < w) a[c + k] = s.charAt(k);
    }
    return a.join('');
}
// 同じ行を n 本作る（天井や壁だけの連続行を1行で書くため）
function ugRows(n, w, base, parts) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(ugRow(w, base, parts));
    return out;
}

// ── 部屋1「落下の間」 縦(降) 19タイル×40行 ─────────────────────────
// 天井の穴から長く落ちる＝「潜る」導入。ギミックなし。⚠落下線（列1〜4）には何も置かない。
// 右壁は下部（room2の空間に対応する行）だけ開けて回廊へつなぐ。
var UG_ROOM_FALL = [].concat(
    ugRows(2, 19, '#', [[1, '   ']]),                 // 0-1 天井（列1-3が落ちてきた穴）
    [ugRow(19, ' ', [[0, '#'], [18, '#']])],          // 2
    [ugRow(19, ' ', [[0, '#'], [9, 'BB'], [18, '#']])],   // 3
    ugRows(3, 19, ' ', [[0, '#'], [18, '#']]),        // 4-6
    [ugRow(19, ' ', [[0, '#'], [13, 'BBB'], [18, '#']])], // 7
    ugRows(3, 19, ' ', [[0, '#'], [18, '#']]),        // 8-10
    [ugRow(19, ' ', [[0, '#'], [6, 'BB'], [18, '#']])],   // 11
    ugRows(3, 19, ' ', [[0, '#'], [18, '#']]),        // 12-14
    [ugRow(19, ' ', [[0, '#'], [11, 'BBB'], [18, '#']])], // 15
    ugRows(3, 19, ' ', [[0, '#'], [18, '#']]),        // 16-18
    [ugRow(19, ' ', [[0, '#'], [7, 'BB'], [18, '#']])],   // 19
    ugRows(3, 19, ' ', [[0, '#'], [18, '#']]),        // 20-22
    [ugRow(19, ' ', [[0, '#'], [12, 'BB'], [18, '#']])],  // 23
    [ugRow(19, ' ', [[0, '#'], [18, '#']])],          // 24
    ugRows(2, 19, ' ', [[0, '#'], [18, '#']]),        // 25-26 ← room2 の天井と同じ高さ
    ugRows(10, 19, ' ', [[0, '#']]),                  // 27-36 右は開放（回廊へ）
    ugRows(3, 19, '#')                                // 37-39 床＋詰め物
);

// ── 部屋2「石柱の回廊」 横 145タイル×15行 ──────────────────────────
// 歩くだけ。溶岩の池を「見せる」（石橋が架かっていて跳ぶ必要はない）。
// ⚠シャレコ（倒せない敵）はここで初登場させる＝平地で安全に「踏んでも死なない敵がいる」と学べる。
// ⚠1.568でギミックを追加（ユーザー報告「上から降りてきた後の地点からギミックが何もない」）。
//   初版は SPEC の「序盤はギミックゼロで落下直後の事故死を防ぐ」に従って空にしていたが、実プレイで
//   間延びしていた。**着地から10タイルぶんだけ安全にして、そこから段階的に足す**方針へ変更した。
var UG_ROOM_CORRIDOR = [].concat(
    ugRows(2, 145, '#'),                                                    // 0-1 天井
    [ugRow(145, ' ', [[20, 'BB'], [46, 'BB'], [74, 'BB'], [104, 'BB'], [130, 'BB']])], // 2 天井から下がる石
    ugRows(5, 145, ' '),                                                    // 3-7
    [ugRow(145, ' ', [[30, 'o'], [31, 'o'], [32, 'o'], [46, '2'], [70, 'o'], [71, 'o'],
                      [118, 'o'], [119, 'o'], [120, 'o']])],                // 8 コイン＋レモン缶
    // 9: 上段の足場（ファイアバーの下をくぐらず上を行く逃げ道にもなる）
    [ugRow(145, ' ', [[32, '======='], [84, '====='], [132, '=======']])],
    // 10: ファイアバー（回廊の主ギミック。半径104pxで床すれすれまで薙ぐ＝待てば必ず抜けられる）
    [ugRow(145, ' ', [[18, 'G'], [44, 'F'], [78, 'G'], [126, 'F']])],
    // 11 石橋2本＋トゲ＋敵。⚠'v'=コウモリ。飛行敵は地形に当たらないので、置く行は空中に来る高さなら何でもよい。
    [ugRow(145, ' ', [[53, 'BBBBBBBBBBBBBB'], [98, 'BBBBBBBBBBBBBBBB'],
                      [26, '^^'], [70, '^^'], [118, '^^'],
                      [12, 'm'], [38, 'v'], [48, 'm'], [68, 'v'], [82, 'S'], [92, 'c'],
                      [122, 'm'], [130, 'S'], [136, 'v'], [141, 'c']])],
    // ⚠溶岩は「見せる」のが目的なので**床(行12)を開ける**こと。行12まで溶岩で埋めると石橋の真下に隠れて
    //   1ピクセルも見えない。行12を空にして行13-14に溶岩を置くと、橋の手前に裂け目ができて底の溶岩が覗く。
    //   橋は裂け目を完全に跨ぐので落ちようがない＝跳ばせない「見せるだけ」になる。
    [ugRow(145, '#', [[55, '          '], [100, '            ']])],         // 12 床（裂け目2つ）
    ugRows(2, 145, '#', [[55, 'LLLLLLLLLL'], [100, 'LLLLLLLLLLLL']])        // 13-14 裂け目の底＝溶岩
);

// ── 部屋3「熔炉の淵」 横 175タイル×15行 ────────────────────────────
// 溶岩を跳ぶ（2→3タイル）。火の玉が絡む。⚠穴は最大3タイル(96px)＝実測の安全域。
var UG_ROOM_FORGE = [].concat(
    ugRows(2, 175, '#'),                                                    // 0-1 天井
    ugRows(5, 175, ' '),                                                    // 2-6
    // 7 跳んだ先のコイン。⚠マグネットは地底では出さない（1.567・ユーザー指定）。
    //   コインが線状に置かれた地上と違い、地底のコインは足場の上に点在するので吸引の旨みが薄い。
    [ugRow(175, ' ', [[15, 'o'], [32, 'o'], [64, 'o'], [82, 'o'],
                      [113, 'o'], [128, 'o'], [144, 'o']])],
    ugRows(2, 175, ' '),                                                    // 8-9
    // 10: 溶岩の連続を抜けた先に**回復1つ目**（跳び切った報酬。ここまでで被弾しやすい）
    //     ＋ファイアバー2本（1.570）。溶岩の連続を割るために**溶岩ではない障害**をここへ入れた。
    //     ⚠row10・len4 は「床すれすれまで薙ぐ＝待てば必ず抜けられる」実績のある置き方（回廊と同じ）。
    //       140 だけ len6('H') にして**大きくゆっくり薙ぐ**＝終盤の見せ場にし、4本が同じ絵に見えないようにする。
    [ugRow(175, ' ', [[104, '1'], [110, 'G'], [140, 'H']])],
    // 11: 火の玉の噴出口（溶岩のすぐ上）＋トゲ＋動く床＋敵
    // ⚠溶岩の池だらけの部屋なので、地上敵は**穴の手前で引き返す**ニワトリ(m)にする。ひよこ(c)は
    //   fallHole＝落ちる種なので、プレイヤーが着く前に自分から溶岩へ歩いて消えてしまう。
    // ⚠動く床(MM)は「書いたマス＝**一番下に来る位置**」。row11 なら床(1180)の32px上まで降りてくるので
    //   床から普通に飛び乗れる。振幅40で1108まで上がる＝渡った先の床へも余裕で届く。
    [ugRow(175, ' ', [[31, 'f'], [63, 'e'], [81, 'f'], [127, 'f'], [158, 'f'],
                      [46, '^^'], [79, 'MM'],
                      [22, 'm'], [42, 'v'], [55, 'S'], [72, 'v'], [95, 'm'],
                      [120, 'm'], [136, 'S'], [152, 'v'], [168, 'm']])],
    // 12: 床。⚠**1.570でギミックの並びを作り直した**（ユーザー報告「溶岩が10回も連続していて飽きる」）。
    //   溶岩の池 10連続 → 7つに減らし、間に「トゲ床(46)」「動く床で渡る幅4の池(78-81)」
    //   「ファイアバー(110/140)」を挟んで、同じ跳び方が2回続かないようにした。
    //   ⚠幅4(128px)の池は跳躍135pxのギリギリ＝**動く床が正規ルート**。落ちてもチェックポイント復帰がある。
    //   それ以外の池はすべて従来どおり2〜3タイル（実運用の上限）。
    [ugRow(175, '#', [[14, 'LL'], [30, 'LLL'], [62, 'LLL'], [78, 'LLLL'], [96, 'LL'],
                      [126, 'LLL'], [158, 'LL']])],
    ugRows(2, 175, '#', [[14, 'LL'], [30, 'LLL'], [62, 'LLL'], [78, 'LLLL'], [96, 'LL'],
                         [126, 'LLL'], [158, 'LL']])
);

// ── 部屋4「崩れた尖塔」 縦(登) 32タイル×57行 ───────────────────────
// 動く床＋ファイアバーで3画面ぶん登る。**登る＝報われる**の軸を担う部屋。
// ⚠段差は必ず4行(128px)以内・足場は5タイル幅で2タイルずつ右へ（＝踏み外しても1段ぶんは戻れる）。
// ⚠塔の底(列8以降)は溶岩＝落ちたら fallDeath でチェックポイント復帰。ここを床にすると
//   左壁クランプで階段の根元へ戻れず詰む（SPEC §11.4「左方向の制約」）。
var UG_ROOM_SPIRE = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[0, '#']]),                                        // 2-11 右は開放（王の廊下へ）
    [ugRow(32, ' ', [[0, '#'], [26, '######']])],                           // 12   出口の棚（＝room5の床と同じ高さ）
    ugRows(2, 32, ' ', [[0, '#'], [29, '###']]),                            // 13-14
    // ⚠L10は出口の棚(列26-31)の**真下に伸ばさない**。真下から跳ぶと棚の裏に頭をぶつけて登れないため、
    //   列24で切って「右上へ跳ぶ」形にする（96px上・32px右＝滞空の中間で余裕をもって届く）。
    [ugRow(32, ' ', [[0, '#'], [20, '====='], [31, '#']])],                 // 15   L10
    [ugRow(32, ' ', [[0, '#'], [22, 'o'], [31, '#']])],                     // 16
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 17
    [ugRow(32, ' ', [[0, '#'], [21, '====='], [31, '#']])],                 // 18   L9
    ugRows(3, 32, ' ', [[0, '#'], [31, '#']]),                              // 19-21
    [ugRow(32, ' ', [[0, '#'], [19, '====='], [31, '#']])],                 // 22   L8
    [ugRow(32, ' ', [[0, '#'], [21, 'o'], [31, '#']])],                     // 23
    [ugRow(32, ' ', [[0, '#'], [15, 'G'], [31, '#']])],                     // 24   ファイアバー（反時計・L7/L8を薙ぐ）
    [ugRow(32, ' ', [[0, '#'], [18, '3'], [31, '#']])],                     // 25   シールド（L7の上）
    [ugRow(32, ' ', [[0, '#'], [17, '====='], [31, '#']])],                 // 26   L7
    ugRows(3, 32, ' ', [[0, '#'], [31, '#']]),                              // 27-29
    [ugRow(32, ' ', [[0, '#'], [15, '====='], [31, '#']])],                 // 30   L6
    [ugRow(32, ' ', [[0, '#'], [17, 'o'], [24, 'v'], [31, '#']])],          // 31
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 32-33
    [ugRow(32, ' ', [[0, '#'], [13, 'MMMM'], [31, '#']])],                  // 34   L5 動く床
    ugRows(3, 32, ' ', [[0, '#'], [31, '#']]),                              // 35-37
    [ugRow(32, ' ', [[0, '#'], [11, '====='], [31, '#']])],                 // 38   L4
    [ugRow(32, ' ', [[0, '#'], [13, 'o'], [31, '#']])],                     // 39
    [ugRow(32, ' ', [[0, '#'], [17, 'F'], [31, '#']])],                     // 40   ファイアバー（時計・L3/L4を薙ぐ）
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 41
    [ugRow(32, ' ', [[0, '#'], [9, '====='], [31, '#']])],                  // 42   L3
    [ugRow(32, ' ', [[0, '#'], [20, 'v'], [31, '#']])],                     // 43
    ugRows(2, 32, ' ', [[31, '#']]),                                        // 44-45 左が開放（熔炉の淵から入る）
    [ugRow(32, ' ', [[7, '====='], [31, '#']])],                            // 46   L2
    ugRows(3, 32, ' ', [[31, '#']]),                                        // 47-49
    [ugRow(32, ' ', [[5, '====='], [31, '#']])],                            // 50   L1
    [ugRow(32, ' ', [[7, 'o'], [31, '#']])],                                // 51
    [ugRow(32, ' ', [[31, '#']])],                                          // 52
    [ugRow(32, ' ', [[12, 'S'], [31, '#']])],                               // 53   底のシャレコ
    ugRows(3, 32, '#', [[8, 'LLLLLLLLLLLLLLLLLLLLLLL']])                    // 54-56 床（列8以降は溶岩）
);

// ── 部屋5「王の廊下」 横 200タイル×15行 ────────────────────────────
// 尖塔の最上部。ファイアバー＋トゲ床の複合＝**最難関**。⚠リズムが読める配置（周期一定・待てば必ず抜けられる）。
var UG_ROOM_KINGSHALL = [].concat(
    ugRows(2, 200, '#'),                                                    // 0-1 天井
    ugRows(4, 200, ' '),                                                    // 2-5
    // 6: 天井から下がるファイアバーの支点（長さ6＝半径156px）。真下を向いた瞬間だけ立っている頭に届く
    //    ＝床のトゲと組で「上下から挟む」。⚠行5だと届かず、行7だと立っているだけで必ず当たる。
    [ugRow(200, ' ', [[18, 'H'], [46, 'H'], [86, 'H'], [124, 'H'], [166, 'H']])],
    [ugRow(200, ' ')],                                                      // 7
    // 8: コイン＋**回復2つ目**（最難関の部屋の中ほど＝ここまでの消耗を1つ戻す）
    [ugRow(200, ' ', [[10, 'o'], [11, 'o'], [56, 'o'], [57, 'o'], [62, '1'], [104, 'o'], [105, 'o'],
                      [150, 'o'], [151, 'o']])],
    [ugRow(200, ' ', [[33, '====='], [66, '====='], [96, '====='], [136, '====='], [176, '=====']])], // 9 逃げ場
    [ugRow(200, ' ', [[34, 'o'], [67, 'o'], [97, 'o'], [137, 'o'], [177, 'o']])],  // 10
    // 11: 床の上のもの（トゲ床・床置きファイアバー・敵）
    // ⚠トゲの連続は**最大2タイル(64px)**（1.564でユーザー報告により3→2に短縮）。
    //   跳躍は135pxあるが、3タイル(96px)は「踏切位置がタイル端でないと届かない」ため片手操作では事故になる。
    //   2タイルなら余裕71pxで、走ってきてそのまま跳べば必ず越えられる。
    [ugRow(200, ' ', [[26, '^^'], [52, '^^'], [61, 'F'], [76, '^^'], [110, '^^'],
                      [132, '^^'], [141, 'F'], [152, '^^'], [186, '^^'],
                      [14, 'c'], [34, 'v'], [42, 'S'], [70, 'm'], [92, 'S'], [100, 'v'], [118, 'c'],
                      [128, 'm'], [146, 'd'], [160, 'S'], [172, 'v'], [194, 'c']])],
    [ugRow(200, '#')],                                                      // 12 床
    ugRows(2, 200, '#')                                                     // 13-14 詰め物
);

// ── 部屋6「深淵へ」 縦(降) 32タイル×57行 ───────────────────────────
// 一気に降りる。**降りるほど赤くなる**（drawCaveBackdrop が camY で溶岩の照り返しを強める）。
// ⚠底は列0-23が溶岩・列24-31だけが着地点＝「まっすぐ落ちる」と死ぬので、足場を追って降りる必要がある。
var UG_ROOM_ABYSS = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[31, '#']]),                                       // 2-11 左は開放（王の廊下から入る）
    [ugRow(32, ' ', [[0, '#######'], [31, '#']])],                          // 12   入口の棚（room5の床と同じ高さ）
    ugRows(2, 32, ' ', [[0, '###'], [31, '#']]),                            // 13-14
    ugRows(1, 32, ' ', [[0, '#'], [31, '#']]),                              // 15
    [ugRow(32, ' ', [[0, '#'], [4, '====='], [31, '#']])],                  // 16
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 17-18
    // ⚠トゲは「1つ下の行の足場の上」に置くこと（'^' はそのマスの底に生える）。足場と同じ行に書くと宙に浮く。
    [ugRow(32, ' ', [[0, '#'], [9, '^'], [31, '#']])],                      // 19  トゲ（下の足場の上）
    [ugRow(32, ' ', [[0, '#'], [6, '====='], [31, '#']])],                  // 20
    ugRows(3, 32, ' ', [[0, '#'], [31, '#']]),                              // 21-23
    [ugRow(32, ' ', [[0, '#'], [8, '====='], [31, '#']])],                  // 24
    [ugRow(32, ' ', [[0, '#'], [10, 'o'], [22, 'v'], [31, '#']])],          // 25
    [ugRow(32, ' ', [[0, '#'], [20, 'G'], [31, '#']])],                     // 26   ファイアバー
    [ugRow(32, ' ', [[0, '#'], [12, 'S'], [31, '#']])],                     // 27  シャレコ（下の足場に乗る）
    [ugRow(32, ' ', [[0, '#'], [10, '====='], [31, '#']])],                 // 28
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 29-30
    [ugRow(32, ' ', [[0, '#'], [15, '^^'], [31, '#']])],                    // 31  トゲ（下の足場の上）
    [ugRow(32, ' ', [[0, '#'], [12, '====='], [31, '#']])],                 // 32
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 33-34
    [ugRow(32, ' ', [[0, '#'], [15, '4'], [31, '#']])],                     // 35   エナジー（下の足場の上）
    [ugRow(32, ' ', [[0, '#'], [14, '====='], [31, '#']])],                 // 36
    [ugRow(32, ' ', [[0, '#'], [16, 'o'], [31, '#']])],                     // 37
    [ugRow(32, ' ', [[0, '#'], [9, 'F'], [31, '#']])],                      // 38   ファイアバー
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 39
    [ugRow(32, ' ', [[0, '#'], [16, 'MMMM'], [31, '#']])],                  // 40   動く床
    ugRows(3, 32, ' ', [[0, '#'], [31, '#']]),                              // 41-43
    // ⚠行44-53は**右壁を開ける**（＝巫女の門の空間 y=860〜1180 と同じ高さ）。ここを塞ぐと
    //   最下部まで降りても次の部屋へ歩いて出られず、行き止まりになる（尖塔の左壁と対称の作り）。
    [ugRow(32, ' ', [[0, '#'], [18, '=====']])],                            // 44
    ugRows(3, 32, ' ', [[0, '#']]),                                         // 45-47
    [ugRow(32, ' ', [[0, '#'], [20, '=====']])],                            // 48
    [ugRow(32, ' ', [[0, '#'], [10, 'v'], [22, 'o']])],                     // 49
    [ugRow(32, ' ', [[0, '#']])],                                           // 50
    // ⚠最下段の足場は**着地点(列24-31)の真上**に置く。列22から落ちると底の溶岩に落ちる。
    [ugRow(32, ' ', [[0, '#'], [24, '=====']])],                            // 51
    ugRows(2, 32, ' ', [[0, '#']]),                                         // 52-53
    ugRows(3, 32, '#', [[0, 'LLLLLLLLLLLLLLLLLLLLLLLL']])                   // 54-56 床（列0-23は溶岩）
);

// ── 部屋7「巫女の門」 横 147タイル×15行 ────────────────────────────
// ギミックゼロ。静寂・怪しい老婆の店・大きな扉。ボス前の溜め。
// ⚠幅は「カメラ終端(UG_TRAVEL_PX=16,000px=500タイル)がこの部屋の**右端**に来る」ように決めてある
//   （411タイル + 89タイル = 500タイル）。次の巫女の間がちょうど固定1画面になる前提。
var UG_ROOM_GATE = [].concat(
    ugRows(2, 147, '#'),                                                    // 0-1 天井
    ugRows(3, 147, ' '),                                                    // 2-4
    // ⚠門は **'b'（当たり判定なしの飾り）** で組む。'B'（ソリッド）で門柱を立てると、床から
    //   まぐさまで6行=192pxの壁になり、ジャンプ最高到達175pxでは絶対に越えられない＝行き止まりになる。
    //   横スクロールの2Dで「くぐる建築」を出すときは、通り道に当たり判定を置かないのが原則。
    // ⚠5-10行: 門へ近づくほど**石積みの飾りが増えて壁が迫る**＝「この先が本丸」だと絵で伝える（1.568）。
    // ⚠**列126〜134は必ず空けること**（1.570・ユーザー指定「像の前にブロックは必要ない」）。
    //   ここは邪神の巨像(列132に中央・126.6〜133.4列を占める)の正面。まぐさや門柱を通すと石が像を
    //   横切って見えるので、まぐさを 125 で切って 135 から再開し、門柱も 128 の1本を抜いてある。
    //   ＝像のところだけ壁が開いた**壁龕（アルコーブ）**になり、祭壇として読める。
    [ugRow(147, ' ', [[112, 'bbbb'], [120, 'bbbbbb'], [135, 'bbbbbbbbbbbb']])], // 5 門のまぐさ（像の前は開ける）
    ugRows(2, 147, ' ', [[122, 'bb'], [145, 'bb']]),                       // 6-7 門柱
    [ugRow(147, ' ', [[30, 'o'], [31, 'o'], [32, 'o'], [88, 'o'], [89, 'o'],
                      [122, 'bb'], [145, 'bb']])],                          // 8
    [ugRow(147, ' ', [[122, 'bb'], [145, 'bb']])],                          // 9
    // 10: ⚠**老婆の店の手前にギミックを2つ**（1.570・ユーザー報告「店の直前に一切ギミックがない」）。
    //   深淵から降りてきた直後の一本道がまるまる無風だったので、店(列40)より手前に2つだけ置く。
    //   ①列14のファイアバー ②列27-28の溶岩の裂け目＋火の玉。⚠**店の入口(列40〜44)には何も置かない**
    //   ＝入店の上スワイプを狙う位置で被弾させない。門(列112〜)より手前で完結させ、ボス前は静けさを保つ。
    [ugRow(147, ' ', [[14, 'F'], [122, 'bb'], [145, 'bb']])],
    // 11: 'W' = 怪しい老婆の店（洞窟の入口・未実装なので今は何も出ない）。
    //     'i' = 紫の燭台。⚠**門へ近づくほど間隔を詰める**（32→24→16→12→8タイル）＝
    //     「奥へ行くほど何かが祀られている」＝ボスの予告になる。数を増やすより**間隔の変化**が効く。
    // ⚠'I' = 邪神の巨像（1.570・ユーザー指定）。**ボス部屋の中ではなく、門をくぐる直前の「祭壇」**に据える。
    //   ✅置き場所は**門の中の広間・ボス部屋に入る直前**（1.570・ユーザーがスクショで指定）＝列132。
    //   燭台が最も密に並ぶ一番奥＝祭壇。⚠**像の正面(列126〜134)には石を一切置かない**（行5〜10のコメント参照）。
    //   ⚠燭台131/134は像(126.6〜133.4列)と重なるので126/136へ寄せ、左右から祭壇を照らす形にした。
    [ugRow(147, ' ', [[145, 'bb'], [18, 'S'], [40, 'W'], [50, 'c'], [80, 'v'], [98, 'c'],
                      [132, 'I'],
                      [62, 'i'], [86, 'i'], [102, 'i'], [110, 'i'], [116, 'i'], [120, 'i'],
                      [124, 'i'], [126, 'i'], [136, 'i'], [138, 'i'], [140, 'i'], [143, 'i']])],
    // 12 床。⚠列27-28に裂け目（1.570のギミック②）。'f'は噴出口＝**当たり判定を持たないので床は開く**。
    //   裂け目は2タイル(64px)＝跳躍135pxに対して余裕たっぷり。ここは「店の前で気を抜かせない」程度の重さに留める。
    [ugRow(147, '#', [[27, 'f ']])],
    ugRows(2, 147, '#', [[27, 'LL']])                                       // 13-14 詰め物＋裂け目の底の溶岩
);

// ── 部屋8「巫女の間」 横 40タイル×15行 ＝ **固定1画面のボス闘技場** ────
// ⚠ロックマン式: 門をくぐると画面がこの部屋へ寄り、背後の扉が閉じて逃げ場が無くなる（updateUgBoss）。
// ⚠40タイル=1,280px は最大画面幅(1,150px)より広い＝どの端末でも「1画面に収まる部屋」になる。
//   カメラは camMaxX(=この部屋の左端)で頭打ちなので、戦闘中はカメラが1pxも動かない＝距離も増えない。
var UG_ROOM_CHAMBER = [].concat(
    ugRows(2, 40, '#'),                                                     // 0-1 天井
    ugRows(10, 40, ' ', [[39, '#']]),                                       // 2-11 左は開放（門から入る）／右は壁
    [ugRow(40, '#')],                                                       // 12 床
    ugRows(2, 40, '#')                                                      // 13-14 詰め物
);

// 部屋の並び。⚠**topY は「床の worldY − (床の行index)*32」**。床の高さが揃っていればカメラも自動でつながる。
//   横幅の合計 = **540タイル = 17,280px**。内訳: 巫女の門の右端がちょうど 500タイル(=UG_TRAVEL_PX 16,000px)で、
//   そこから先の40タイルが固定1画面のボス闘技場。⚠カメラは camMaxX=16,000 で止まるので、
//   **闘技場に入った時点で距離の加算は終わっている**（ボス戦の長さが距離＝ランキングに影響しない）。
// ⚠descend:true ＝「下へ進む部屋」。カメラが足元を画面の上寄りに置いて**着地点が見える**ようにする
//   （UG_CAM_DESCEND_GAP 参照）。登る部屋・横の部屋では付けない。
var UG_LEVEL_ROOMS = [
    { key: 'fall',      wT: 19,  topY:   -4, map: UG_ROOM_FALL,      descend: true },  // 床 y=1180（行37）
    { key: 'corridor',  wT: 145,  topY:  796, map: UG_ROOM_CORRIDOR },   // 床 y=1180（行12）
    { key: 'forge',     wT: 175, topY:  796, map: UG_ROOM_FORGE },      // 床 y=1180
    { key: 'spire',     wT: 32,  topY: -548, map: UG_ROOM_SPIRE },      // 底 y=1180（行54）→ 頂 y=-164（行12）
    { key: 'kingshall', wT: 200, topY: -548, map: UG_ROOM_KINGSHALL },  // 床 y=-164（行12）
    { key: 'abyss',     wT: 32,  topY: -548, map: UG_ROOM_ABYSS,     descend: true },  // 頂 y=-164 → 底 y=1180
    { key: 'gate',      wT: 147, topY:  796, map: UG_ROOM_GATE },       // 床 y=1180（右端=500タイル）
    { key: 'chamber',   wT: 40,  topY:  796, map: UG_ROOM_CHAMBER }     // 固定1画面のボス闘技場
];

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
    extraDist: 0,        // ラッキーチャーム(1.506): 同ラウンド2本目の目標距離(m)。0=無し。50%抽選・窓後半に配置(最小間隔300m)
    targetRound: 0,      // targetDist を算出したラウンド（ラウンド変化検出用）
    exitHold: 0,         // 出口土管の口で右を押し続けているフレーム数（退室ゲージ・継続が切れたら0に戻す）
    introTimer: 0,       // 入場時「BONUS!」演出の残りフレーム
    roomType: 'treasure', // 部屋タイプ（1.450〜・入室時に重み付き抽選）: 'treasure'|'coin'|…（背景色/小物/報酬が変わる。エッグ抽選1%は全タイプ共通・部屋タイプ非依存）
    chestPicked: false,   // ラッキーの間（1.452〜）: このラン入室で宝箱を1つ開封済みか（3択を1回に制限・入室毎にinitPipeRoomでfalse）
    // ── マリオ風 出入り演出（1.408）──
    anim: 'none',        // 'none'|'in'(本編:土管へ沈む)|'outRoom'(部屋:横土管へ歩き込む)|'outWorld'(本編:土管から上昇)
    animTimer: 0,        // 演出の経過フレーム
    animPipe: null       // 対象の土管platform参照（本編側の沈む/出てくる位置）
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
    { // チュートリアルショップ限定（1.426）: いちごショート＝HP1回復。演出はそばと同方式（shortcake_scene.jpg）
        id: 'shortcake', nameKey: 'shop_item_shortcake', descKey: 'shop_item_shortcake_desc',
        icon: '', iconImg: 'images/icon_shortcake.png', price: 1000, maxPerVisit: 2, tutorialOnly: true,
        effect: function() { gameState.lives = Math.min(gameState.lives + 1, 10); }
    },
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
    },
    // ─── 地底専用「怪しい老婆の店」の品揃え（1.569・ユーザー決定） ───
    // ⚠`ugOnly` は tutorialOnly とまったく同じ仕組み（stageShopLineup が絞る）。**この配列に混ぜて置くのが肝**で、
    //   別配列にすると buyStageItem/売却/確認ボックスにある STAGE_SHOP_ITEMS.find(...) を4箇所すべて直す必要が出る。
    // ⚠店は「巫女の門」＝**全ギミックを抜けた後**にある。だから回避系（溶岩よけ/トゲ無効など）は買った瞬間に
    //   用済みになる。ここに置けるのは「ボス戦に効く」「地上へ戻った後の残りのランに効く」「永続」のどれかだけ。
    {
        // 極楽まんじゅう: HP3回復。⚠2個で売り切れ（maxPerVisit）＝地上の回復薬(6,000/+2)より高いぶん効率は良い。
        //   買うと専用の一枚絵（食べるシーン）を出す＝そば/いちごショートと同じ showSobaScene の仕組み。
        id: 'ug_manju', nameKey: 'shop_item_ug_manju', descKey: 'shop_item_ug_manju_desc',
        icon: '🍡', price: 9000, maxPerVisit: 2, ugOnly: true,
        effect: function() { gameState.lives = Math.min(gameState.lives + 3, 10); }
    },
    {
        // 老婆の劇薬: 30秒間、エナジー弾と同じ攻撃を撃てる（ダメージは1＝エナジー弾2の半分）。
        // ⚠エナジー缶(dmg2)を持っている間はそちらが優先される（updateBullets の分岐順）。重ねて撃たない。
        id: 'ug_elixir', nameKey: 'shop_item_ug_elixir', descKey: 'shop_item_ug_elixir_desc',
        icon: '⚗️', price: 8000, maxPerVisit: 2, ugOnly: true,
        effect: function() { gameState.ugElixir = (gameState.ugElixir || 0) + UG_ELIXIR_FRAMES; }
    },
    {
        // 地底の主の加護（永続）: 以後、地底に入るときライフ+2で始まる。
        // ⚠タイトルショップ/エッグ交換とまったく同じ仕組み＝gameSettings.upgrades に1件積んで saveSettings。
        //   **地底でしか買えず地底でしか効かない**ので、既存の恒久商品（ポーチ/コインマスター等）と食い合わない。
        // ⚠買い切り。所持後は stageShopLineup が陳列から外す（maxPerVisit は訪問ごとの制限なので再訪で復活してしまう）。
        id: 'ug_blessing', nameKey: 'shop_item_ug_blessing', descKey: 'shop_item_ug_blessing_desc',
        icon: '👁', price: 200000, maxPerVisit: 1, ugOnly: true,
        permaUpgrade: 'ug_blessing'
    }
];
// 老婆の劇薬の持続フレーム（30秒）。⚠2個まで買えて**加算**される（60秒まで）
const UG_ELIXIR_FRAMES = 1800;
// 地底の主の加護: 入場時に足されるライフ
const UG_BLESSING_LIVES = 2;

// ⚠並び順ルール(1.507・ユーザー指定): Lv1価格の安い順に固定。レベル上昇で価格が高くなっても入れ替えない。
//   新アイテムはLv1価格(prices[0])で挿入位置を決める（エッグこうかんEGG_SHOP_ITEMSも同ルール）
var TITLE_SHOP_UPGRADES = [
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
      icon: '', iconImg: 'images/icon_revival_machine.png', maxLevel: 2, prices: [500000, 1000000], effectDesc: ['1回/ラン', '2回/ラン'], effectDescEn: ['1/run', '2/run'] },
    // クリスタルハート（1.505・高額レーン第1弾）: 青ハート+1/+2/+3。赤ハートより先に削れ、回復不可
    // （ラン開始時のみ補充）。タフネス（回復可能な赤+N）とは別レイヤー。消費は takeDamage/fallDeath。
    { id: 'crystal_heart', nameKey: 'tshop_crystal_heart', descKey: 'tshop_crystal_heart_desc',
      icon: '', iconImg: 'images/icon_crystal_heart.png', maxLevel: 3, prices: [1000000, 2000000, 5000000], effectDesc: ['+1', '+2', '+3'] },
    // エッグマグネット（1.508・高額レーン第3弾）: ゴールデンエッグを全画面から吸い寄せ＝取り逃しゼロ。
    // 出現率(土管1%/日次一発抽選)は不可侵＝触らない。吸引は index.html updatePowerUps 冒頭。
    { id: 'egg_magnet', nameKey: 'tshop_egg_magnet', descKey: 'tshop_egg_magnet_desc',
      icon: '', iconImg: 'images/icon_egg_magnet.png', maxLevel: 1, prices: [1000000], effectDesc: ['自動回収'], effectDescEn: ['Auto-collect'] },
    // 侍ぴよ（1.509・高額レーン第4弾/初の金貨建てアバター）: 空中下スワイプ→急降下斬り。
    // 購入時に grantSkin が ownedSkins へ 'samurai' を付与（handleTshopConfirmYes）＝きせかえに出現。
    { id: 'samurai_piyo', nameKey: 'skin_samurai', descKey: 'tshop_samurai_desc', grantSkin: 'samurai',
      icon: '', iconImg: 'images/skin_samurai_idle.png', maxLevel: 1, prices: [1000000], effectDesc: ['急降下斬り'], effectDescEn: ['Dive slash'] },
    // ラッキーチャーム（1.506・高額レーン第2弾）: 土管の期待出現1.5倍（50%で同ラウンド2本目）＋
    // ラッキーの間の当たり枠強化（revive4%→8%/herb12%→20%）。部屋内は世界凍結のため距離ランキングは汚染しない。
    { id: 'lucky_charm', nameKey: 'tshop_lucky_charm', descKey: 'tshop_lucky_charm_desc',
      icon: '', iconImg: 'images/icon_lucky_charm.png', maxLevel: 1, prices: [2000000], effectDesc: ['1.5倍'], effectDescEn: ['1.5x'] },
    // サイバーぴよ（1.520・高額レーン第5弾/金貨建てアバター第2弾・旧称ロボぴよ→白×金サイバースーツに確定）:
    // ドローンビットが随伴し、約2.5秒ごとに前後の画面内最寄りの敵へ同時ロックオンレーザー（index.html updateBullets）。
    // 雑魚一撃（弾スコア準拠200/300）・ボスはダメージ1=電気弾と同じ（装甲弾き/空中半減は既存の弾処理準拠）。
    // 購入時に grantSkin が ownedSkins へ 'cyber' を付与（handleTshopConfirmYes）＝きせかえに出現。
    { id: 'cyber_piyo', nameKey: 'skin_cyber', descKey: 'tshop_cyber_desc', grantSkin: 'cyber',
      icon: '', iconImg: 'images/skin_cyber_idle.png', maxLevel: 1, prices: [3000000], effectDesc: ['ドローン'], effectDescEn: ['Drone bit'] }
];

// ─── エッグこうかん（タイトルショップ内・ゴールデンエッグ払い） ───
// 方針: 当初「エッグは性能を売らない」だったが、1.398（スキンに戦闘効果）→1.439（コインマスター🥚100）で緩和。
//       現在は将来的な課金前提の高額プレミアム枠（性能アイテム）もエッグで販売する。
// ⚠ 新しい type を追加する時は gameplay.js の confirmEggBuy（付与）と isEggItemOwned（所持判定）に
//   対応を追加すること。未対応 type は購入時に減算されず「まだこうかんできない」と断られる（安全側）。
// ⚠並び順ルール(1.507・ユーザー指定): eggPriceの安い順に固定（TITLE_SHOP_UPGRADESと同ルール）。
//   同額はどちらでも可。魔女(80)<忍者(200)なので「魔女先/忍者後」の3配列ルール(1.494)も自然に満たす
var EGG_SHOP_ITEMS = [
    // まほうのポーチ: 買うたびに永続ストック枠+1（上限=stockState.maxSlots）。confirmEggBuy/renderEggShopItemで
    // レベル表示・再購入を特別扱い。所持レベル=gameSettings.pouchLevel、各枠の中身=gameSettings.permaStock。
    { id: 'perma_stock', type: 'pouch', nameKey: 'egg_pouch', descKey: 'egg_pouch_desc',
      iconImg: 'images/item_pouch.png', eggPrice: 10 },
    { id: 'skin_kigurumi', type: 'skin', skinId: 'kigurumi', nameKey: 'skin_kigurumi', descKey: 'egg_item_kigurumi_desc',
      iconImg: 'images/skin_kigurumi_idle.png', eggPrice: 10 }, // 1.424で🥚5→10（入手が簡単すぎたため）
    // 魔女ぴよ: ジャンプ長押しでグライド滞空。（1.456・アート1.457・価格1.493で200→80・1.507で価格昇順の位置へ）
    { id: 'skin_witch', type: 'skin', skinId: 'witch', nameKey: 'skin_witch', descKey: 'egg_item_witch_desc',
      iconImg: 'images/skin_witch_idle.png', eggPrice: 80 },
    // コインマスター: 旧TITLE_SHOP_UPGRADES（円建て3段階・premium=準備中）から移設（1.439・課金前提価格）。
    // Lv1のみ＝コイン獲得+30%。付与は upgrades.coin_master=1（applyUpgradesのcoinBonus・図鑑seenIfをそのまま共用）
    { id: 'coin_master', type: 'upgrade', upgradeId: 'coin_master', nameKey: 'tshop_coin_master', descKey: 'tshop_coin_master_desc',
      iconImg: 'images/icon_coin_master.png', eggPrice: 100 },
    // 忍者ぴよ: 2段ジャンプ+1秒毎の自動手裏剣(ダメージ1)。（1.440・課金前提価格・現状最強のため末尾）
    { id: 'skin_ninja', type: 'skin', skinId: 'ninja', nameKey: 'skin_ninja', descKey: 'egg_item_ninja_desc',
      iconImg: 'images/skin_ninja_idle.png', eggPrice: 200 }
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
    { id: 'enemy:dive_bird',     cat: 'enemy', nameKey: 'zukan_e_dive_bird',     descKey: 'zukan_e_dive_bird_d',     sprite: 'dive_bird_fly', kill: true },
    // シャレコ（地底専用・1.563）。⚠**倒せない敵**なので登録は「崩壊させた時点」（ugCollapseSkully）。
    //   kill:true のままにしてあるのは、崩壊回数を撃破数と同じ欄で数えるため（＝踏んだ手応えが記録に残る）。
    { id: 'enemy:skully',        cat: 'enemy', nameKey: 'zukan_e_skully',        descKey: 'zukan_e_skully_d',        sprite: 'skully_walk',   kill: true },
    // ── ボス（撃破数つき）──
    { id: 'boss:hiyoko',  cat: 'boss', nameKey: 'zukan_b_hiyoko',  descKey: 'zukan_b_hiyoko_d',  kind: 'hiyoko',  kill: true }, // チュートリアル「はじまりの地」のボス＝最初のボス（図鑑先頭・1.494）
    { id: 'boss:rooster', cat: 'boss', nameKey: 'zukan_b_rooster', descKey: 'zukan_b_rooster_d', kind: 'rooster', kill: true },
    { id: 'boss:hawk',    cat: 'boss', nameKey: 'zukan_b_hawk',    descKey: 'zukan_b_hawk_d',    kind: 'hawk',    kill: true },
    { id: 'boss:egg',     cat: 'boss', nameKey: 'zukan_b_egg',     descKey: 'zukan_b_egg_d',     kind: 'egg',     kill: true },
    { id: 'boss:snake',   cat: 'boss', nameKey: 'zukan_b_snake',   descKey: 'zukan_b_snake_d',   kind: 'snake',   kill: true },
    { id: 'boss:owl',     cat: 'boss', nameKey: 'zukan_b_owl',     descKey: 'zukan_b_owl_d',     kind: 'owl',     kill: true },
    { id: 'boss:scarecrow', cat: 'boss', nameKey: 'zukan_b_scarecrow', descKey: 'zukan_b_scarecrow_d', kind: 'scarecrow', kill: true },
    // 闇の巫女（地底R7のボス・1.570）。⚠サムネは zukanSpriteName が 'boss_'+kind を引くので
    //   **スプライト名は必ず boss_priestess**（sprites.js の手続き生成で登録済み）。
    { id: 'boss:priestess', cat: 'boss', nameKey: 'zukan_b_priestess', descKey: 'zukan_b_priestess_d', kind: 'priestess', kill: true },
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
    { id: 'item:shortcake',     cat: 'item', nameKey: 'shop_item_shortcake',  descKey: 'shop_item_shortcake_desc',  img: 'images/icon_shortcake.png' }, // チュートリアルショップ限定（いちごショート・購入で発見／HP+1）
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
    { id: 'item:crystal_heart',   cat: 'item', nameKey: 'tshop_crystal_heart',   descKey: 'tshop_crystal_heart_desc',   img: 'images/icon_crystal_heart.png',   seenIf: function(gs){ return ((gs.upgrades || {}).crystal_heart || 0) > 0; } },
    { id: 'item:egg_magnet',      cat: 'item', nameKey: 'tshop_egg_magnet',      descKey: 'tshop_egg_magnet_desc',      img: 'images/icon_egg_magnet.png',      seenIf: function(gs){ return ((gs.upgrades || {}).egg_magnet || 0) > 0; } },
    { id: 'item:lucky_charm',     cat: 'item', nameKey: 'tshop_lucky_charm',     descKey: 'tshop_lucky_charm_desc',     img: 'images/icon_lucky_charm.png',     seenIf: function(gs){ return ((gs.upgrades || {}).lucky_charm || 0) > 0; } },
    // ── アイテム：まほうのポーチ（エッグこうかん・所持=pouchLevel>0 で発見。エッグ商品perma_stock/nameは egg_pouch を流用）──
    { id: 'item:pouch',           cat: 'item', nameKey: 'egg_pouch',             descKey: 'egg_pouch_desc',             img: 'images/item_pouch.png',           seenIf: function(gs){ return (gs.pouchLevel || 0) > 0; } },
    // ── アイテム：きせかえ（所持から発見を派生）──
    { id: 'item:skin_maid',     cat: 'item', nameKey: 'skin_maid',     descKey: 'zukan_i_skin_maid_d',   img: 'images/skin_maid_idle.png',     seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('maid') >= 0; } },
    { id: 'item:skin_kigurumi', cat: 'item', nameKey: 'skin_kigurumi', descKey: 'egg_item_kigurumi_desc', img: 'images/skin_kigurumi_idle.png', seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('kigurumi') >= 0; } },
    { id: 'item:skin_witch',    cat: 'item', nameKey: 'skin_witch',    descKey: 'egg_item_witch_desc',  img: 'images/skin_witch_idle.png',  seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('witch') >= 0; } },
    { id: 'item:skin_samurai',  cat: 'item', nameKey: 'skin_samurai',  descKey: 'tshop_samurai_desc',   img: 'images/skin_samurai_idle.png', seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('samurai') >= 0; } },
    { id: 'item:skin_cyber',    cat: 'item', nameKey: 'skin_cyber',    descKey: 'tshop_cyber_desc',     img: 'images/skin_cyber_idle.png',  seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('cyber') >= 0; } }, // きせかえSKINSと同順（侍→サイバー→忍者・1.520）
    { id: 'item:skin_ninja',    cat: 'item', nameKey: 'skin_ninja',    descKey: 'egg_item_ninja_desc',  img: 'images/skin_ninja_idle.png',  seenIf: function(gs){ return (gs.ownedSkins || []).indexOf('ninja') >= 0; } },
    // ── ステージ（バイオーム＋ボーナス部屋）──
    { id: 'biome:town',      cat: 'biome', nameKey: 'zukan_bio_town',   descKey: 'zukan_bio_town_d' }, // はじまりの地（チュートリアル）＝最初のステージ（図鑑先頭・1.494）
    { id: 'biome:grassland', cat: 'biome', nameKey: 'zukan_bio_grass',  descKey: 'zukan_bio_grass_d' },
    { id: 'biome:desert',    cat: 'biome', nameKey: 'zukan_bio_desert', descKey: 'zukan_bio_desert_d' },
    { id: 'biome:snow',      cat: 'biome', nameKey: 'zukan_bio_snow',   descKey: 'zukan_bio_snow_d' },
    { id: 'biome:night',     cat: 'biome', nameKey: 'zukan_bio_night',  descKey: 'zukan_bio_night_d' },
    { id: 'biome:bonus',     cat: 'biome', nameKey: 'zukan_bio_bonus',  descKey: 'zukan_bio_bonus_d' }
];
// 図鑑コンプリート報酬（ゴールデンエッグ）。各カテゴリ100%＋全種コンプで付与。gameSettings.zukan.claimed で二重防止。
var ZUKAN_REWARDS = { enemy: 3, item: 3, boss: 3, biome: 3, all: 10 };
var ZUKAN_BIOME_NAMES = ['grassland', 'desert', 'snow', 'night', 'town']; // getBiomeIndex → biome:<name>（4=はじまりの地・チュートリアル専用）
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
    if (e.type === 'dive_bird')    return 'enemy:dive_bird'; // 急降下型（1.527・全バイオーム共通の赤い見た目）
    if (e.type === 'skully')       return 'enemy:skully';    // シャレコ（1.563・地底の倒せない敵）
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

// （デバッグモードはネイティブ提出前に撤去済み — Ver.1.461）
