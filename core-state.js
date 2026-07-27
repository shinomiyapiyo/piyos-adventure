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
var TEST_START_AFTER_R6 = false;   // ⚠⚠**出荷前に必ず false へ戻す**（実機テストの時だけ true にする）
// どこから始めるか:
//   'r7'     … **R7開始の瞬間（12,000m）＝土管が出現するシーンから**（1.562でこちらを既定に）。
//              開始1フレーム目に checkBossTrigger が土管を置くので、いきなり「せり上がり演出→もぐる→地底」。
//   'r14'    … **R14開始の瞬間（28,800m）＝2周目の地底（1.599の新レイアウト）から**（1.599で追加）。
//              ⚠checkBossTrigger は地底ラウンドなら距離を待たずその場で土管を出すので、開始直後に潜れる。
//              ⚠この周回だと闇の巫女は2巡目＝HP250・行動サイクル短縮（bossEncounter=2）になる。
//   'r21'    … **R21開始の瞬間（50,400m）＝3周目の地底「亀裂」（1.610の新レイアウト）から**（1.610で追加）。
//              ⚠上下分岐の部屋は列214〜366（部屋5）＝地底に入ってから約7,000px 先。
//              ⚠この周回だと敵の速度倍率が7.0倍（R7の2.5倍）になる＝密度だけでなく速さも別物になる。
//   'r28'    … **R28開始の瞬間（79,200m）＝4周目の地底「分水嶺」（1.611の新レイアウト）から**（1.611で追加）。
//              ⚠上下分岐は分水嶺（3番目の部屋）の列40-41の穴。跳び越えれば上・降りれば下。
//              ⚠この周回だと敵の速度倍率が4.55倍になる。
//   'r6shop' … R6のおみせ手前（11,450m）から。おみせ → 闇のカカシ → 撃破 → R7 → 土管、と通しで見たい時
var TEST_START_MODE = 'r28';
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
// 腕薙ぎの「着地猶予」(1.575)。⚠これが無いと理不尽な被弾が構造的に残る:
// 予告16〜34F＋有効20F に対しジャンプの滞空は約46F（JUMP_FORCE -16 / GRAVITY 0.7）なので、
// 予告が始まった時点ですでに空中に居ると、着地が有効窓にちょうど重なる位相が必ず存在した。
// 空中では軌道を変えられない＝どう操作しても避けられない（1.551の「光ると同時に来る」と同種の穴）。
// 対策: 空中の間は予告を進めず、着地してから必ずこのフレーム数だけ猶予を残してから薙ぐ。
// 16F=0.27秒＋先行入力6F(JUMP_BUFFER_FRAMES)＝実質0.37秒。跳べば3Fで危険帯を抜ける（実測）。
const SC_SWEEP_LAND_GRACE = 16;
// 延長の総量の上限(空中に居たフレーム数)。グライド(魔女)や2段ジャンプ(忍者)で無限に引き延ばして
// モードをハングさせないための保険。通常のジャンプ1回は約46Fなので普通に遊ぶ限り到達しない。
// 上限に達したら空中でも薙ぐが、空中なら危険帯に当たらないのでプレイヤーの損にはならない。
const SC_SWEEP_AIR_CAP    = 90;
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
// ⚠1.588: 「ボスの弾の被弾判定がシビア。怒首領蜂のようにギリギリでも喰らわないのが理想」への対応。
//   bossState.eggs（呪弾/羽根弾/火球/毒/卵弾…全ボス共通の弾）は唯一 aabb() の生判定のみで、
//   地底の他の当たり（トゲ/ファイアバー/魔法陣＝UG_HAZARD_SHRINK_X=14）より厳しかった。値も合わせる。
const BOSS_BULLET_GRAZE     = 14;    // 弾の被弾判定でプレイヤー側を全方向に縮める量(px)。aabbGraze で使う

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
    // ⚠resetGame() だけでは足りない（1.573で修正）。名前入力は gameOverScreen(z:25) を**開いたまま**その上に
    //   出るので、resetGame がタイトル(z:20)を出しても GAME OVER がタイトルの上に残ってしまう。
    //   しかも resetGame は reviveUsedThisRun を false に戻すため、残った「広告を見て復活」が再び有効になり、
    //   押すとリセット済みのランがタイトル画面の裏で走り出す（render.js がタイトル表示中はワールド描画を飛ばす）。
    //   showStartScreen() が markScreenTransition→resetGame→hideGameOverScreen まで一括で面倒を見る。
    //   pendingRunEndAction も捨てる＝記録フローを中断した以上、後から遷移が暴発しないように。
    { isOpen: function() { return isScreenVisible('nameInputScreen'); },
      onBack: function() { hideNameInputDirect(); pendingRunEndAction = null; showStartScreen(); } },
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
// 地底の雑魚の速度は**ラウンドで変えない**（1.612・ユーザー決定「地底は速さの概念を取っ払っているので
// 反映しなくてもいい。ボスのみ例外として速くなる」）。
// ⚠地上は「進むほどスクロールが速くなる」で難度を作るが、地底は gameSpeed=0＝自分の足で歩く面なので、
//   その概念自体が無い。にもかかわらず `1 + (round-1)*0.3` を流用していたため**青天井**になっていた
//   （R7=2.8倍 / R14=4.9 / R21=7.0 / R28=9.1 / R35=11.2）。
//   プレイヤーの歩行は 3.0px/f 固定なので、R28では**一番遅いニワトリ(3.64px/f)ですらプレイヤーより速い**
//   ＝どの敵からも振り切れない（左へは8タイルしか戻れない）。実機で「速すぎる」と報告された。
// ⚠**1周目(R7)相当の 2.8 に固定する**＝実機テストで詰めた唯一の基準値。以降の難度はレイアウトと密度で作る
//   （敵の数 R7=41 / R14=65 / R21=84 / R28=97）＝この面の方針「難度は避けにくさでは上げない」と一致する。
// ⚠**ボスだけは例外で周回ごとに強くなる**。闇の巫女は ugMakeEnemy を通らないので、この定数の影響を受けず、
//   `bossEncounter()` で HP(200/250/300) と行動サイクル(×0.87/0.76/0.66) が上がり続ける。
const UG_ENEMY_SPEED_MULT = 1 + (BOSS_CYCLE_ROUNDS - 1) * 0.3;   // = 2.8（R7相当で固定）

const UG_SPEED_RATE    = 0.5;
// はやあし（地上は横移動1.3倍）を持っているとき、地底では **1.1倍** で歩ける（1.614・ユーザー指定）。
// ⚠元は地底では完全に無効だった。1.3倍のままだと地底の作図（穴3タイル/段差4行）の前提が崩れるので、
//   「無効」と「1.3倍」の間を取って 1.1 にしてある。
// ⚠⚠**この値は歩行とカメラ前進の両方に掛けること**。片方だけ上げると、プレイヤーが画面右端の
//   クランプに貼り付いて velX=0 にされ、**前方へジャンプできなくなる**（1.543で実際にやって1.544で廃止）。
//   その事故を二度と起こさないよう、両者が必ずこの関数を通るようにしてある。
const UG_SWIFT_BONUS = 1.1;
function ugSpeedRate() {
    var lv = ((gameSettings && gameSettings.upgrades) ? gameSettings.upgrades.swift_feet : 0) || 0;
    return lv > 0 ? UG_SPEED_RATE * UG_SWIFT_BONUS : UG_SPEED_RATE;
}
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
const UG_BOSS_DEFEAT_FRAMES= 180;  // ⑤崩れ落ちる演出の基準（1.584からは下の UG_END_* が全体の尺を決める）
// ─── 地底クリアの「真のエンディング」（1.584・✅ユーザー決定） ───
// ⚠1.583まで撃破180F(3.0秒)で即 exitUnderground していたため、
//   ①ファンファーレ win.mp3(7.76秒)の39%で切れる ②通常ボスの撃破演出(300F=5.0秒)より短い
//   ③地上へ瞬間的に切り替わる、の3点をユーザーから指摘された。
// 流れ: 崩れる → 洞窟が静まる(燭台が消える/扉が上がる/光が差す) → 一枚絵＋専用BGM →
//   画面が白く覆われる → 白一色で一呼吸 → 地上へ復帰 → 白からフェードインしてスクロール再開（1.588）。
// ⚠「通常なら次のラウンドへ行くところで一枚絵と新BGMに移行する」というユーザー指定に合わせ、
//   切り替え点は通常ボスと同じ 300F にしてある。ここは動かさないこと。
const UG_END_CRUMBLE    = 110;  // 崩れ落ちる（爆ぜる光と音）
const UG_END_CALM       = 300;  // ここまでで洞窟が静まる＝通常ボスの撃破演出と同じ長さ
const UG_END_SCENE_IN   = 45;   // 一枚絵のフェードイン
// ⚠1.587から一枚絵は**タップでテロップを送る**方式（ユーザー決定）。固定時間で終わらせない。
//   専用BGM sounds/ug_ending.mp3（"Last Warp Home" / 64.5秒）が流れる間、
//   会話と同じ作法で1文ずつ読ませ、最後の文を送ったら地上へ戻る。
//   ⚠読み終わらないまま曲が終わっても構わない（BGMは loop=false なので静かに終わるだけ）。
const UG_END_LINES      = 5;    // テロップの文数（i18n の ug_end_1..5 と必ず一致させること）
const UG_END_LINE_MIN   = 24;   // 1文が出てから送れるようになるまで（誤タップで飛ばさないため）
const UG_END_SCENE_OUT  = 45;   // 最後の文を送ってから画面が白く覆われきるまで（1.588: 地上のアリーナを見せず白へ）
// ⚠1.595: 「撃破報酬のコイン/ハートを拾いきれない」というユーザー指摘に対応。洞窟が静まる演出
//   （ug.endCalm 0→1・UG_END_CRUMBLE〜UG_END_CALM）のテンポ自体は変えず、静まりきった状態を
//   このぶんだけ延長してから一枚絵(ug.ending)へ移る＝実質的な拾い時間だけを5秒延ばす。
const UG_END_GRACE      = 300;  // 静まりきってから一枚絵に入るまでの猶予（5秒@60fps）
// ⚠1.588: 「地上に戻ってすぐスクロールが始まって忙しい」というユーザー指摘に対応。
//   exitUnderground は白一色（groundReturnFade、undergroundState の外＝地底状態のリセットをまたいで生存）の
//   最中に呼ぶ＝地形の組み直しは画面に映らない。そのまま白で一呼吸 → 白からフェードインしてスクロール再開。
// ⚠1.592: 白一色の間に「ROUND N」テロップ（通常ボスと同じ様式）を出す時間も兼ねるため90Fに延長
//   （HUD常時表示は「行はいらない」とユーザー却下・通常ボスと同じ一過性のテロップに差し替え）。
const UG_RETURN_HOLD    = 90;   // 地上復帰直後、白一色のまま止まる余韻（「ROUND N」テロップもこの間に出す）
const UG_RETURN_FADE_IN = 45;   // 白から元の色合いへ戻すフェードイン（明けきったらスクロール再開）
const UG_RETURN_ROUND_FADE = 20; // 「ROUND N」テロップの前後フェード（hold内・台形状にin/out）
const UG_BOSS_HEARTS    = 3;    // 撃破報酬のハート数（✅ユーザー決定・1.584）
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
// 像の前を通ると紫の発光が赤に変わる（1.597・ユーザー指定）。⚠**演出だけ＝当たり判定も挙動の変化も無い**。
// ⚠当初は「目だけ光らせる」つもりだったが、この像は**顔が2つ（頭部の下にもう1つ）あり胸元も光っている**ため、
//   目の座標を狙い撃ちすると取りこぼす。そこで「光っている紫の画素をまとめて赤へ置き換える」方式にした
//   （ユーザー提案）。位置を当てにいかないので、将来スプライトを差し替えても壊れない。
// ⚠左右の燭台の炎だけは紫のまま残す（ユーザー指定）。座標は ug_idol.png の画素走査で実測した
//   紫の柱の範囲（左 x36-54 / 右 x162-182・y226-272）に余白を足したもの。画像座標(220×300)基準。
const UG_IDOL_FLAME_BOX    = [{ x0: 31, x1: 59, y0: 218, y1: 282 },
                              { x0: 157, x1: 187, y0: 218, y1: 282 }];
// ⚠1.605 でロジックを作り直した（ユーザー指定「移動距離とともに赤く推移するので気付きにくい。
//   真ん前に来たらいきなり一気に赤くなるなどの演出にすべき」）。
//   旧: 620px〜300pxの間でなめらかに増減 → 変化が緩慢で気付けなかった。
//   新: **真ん前(TRIGGER)に入った1フレームで一気に点灯**し、そのまま消えない（＝像が「起きた」）。
//   点いた瞬間に専用SE(playUgIdolAwake)と軽い画面揺れを 足す＝見落としようがない。
const UG_IDOL_GAZE_TRIGGER = 190;  // 像の中心からこの距離(px)に入った瞬間に点灯。⚠像の幅220pxの内側＝「真ん前」
const UG_IDOL_GAZE_RISE    = 5;    // 点灯にかけるフレーム数（0だと1フレームでパッと出て安っぽいので数フレームだけ）
const UG_IDOL_FLASH_FRAMES = 16;   // 点灯直後の強い閃きの長さ（この間だけ明るさが1を超える）
const UG_BOSS_HP           = 200;  // 1巡目(R7)のHP。SPEC §7.2（✅ユーザー決定・通常ボス100の2倍）
// 2巡目以降のHP（✅ユーザー決定・1.581）: R14=250 / R21以降=300 で頭打ち。
// ⚠通常ボスの BOSS_HP_PER_ROUND とは別建て。あちらは「ラウンドごと+20・上限240」だが、
//   巫女は7ラウンドに1回しか出ないので**周回(bossEncounter)で段階的に上げる**方が実感に合う。
// 踏み(UG_BOSS_STOMP_DMG=10)だけで倒す場合の回数: 20回 → 25回 → 30回。
// ⚠フェーズ判定は b.hp / b.maxHp の比率なので、HPを変えても解放演出(60%/30%)は自動で追随する。
const UG_BOSS_HP_R2        = 250;  // R14
const UG_BOSS_HP_R3PLUS    = 300;  // R21以降（据え置き）
function ugBossHpFor(enc) { return enc <= 1 ? UG_BOSS_HP : enc === 2 ? UG_BOSS_HP_R2 : UG_BOSS_HP_R3PLUS; }
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
// 大詠唱の「判定後の余韻」(1.584)。⚠判定と暗転解除が同フレームだと、被弾しても気づけない
//   （ユーザー報告「見た目にはダメージを受けたように見えなかった」）。理由は描画順:
//   -1 の浮上テキストは floatEffects＝**暗幕より先**に描かれ、暗転が消えるのと同時に出るため、
//   「画面が急に明るくなる」大きな変化＋画面揺れに埋もれてしまう。
//   そこで判定後もこのフレーム数だけ暗幕を保ち、**暗幕の上に**結果の閃光を重ねる
//   （被弾=赤／回避成功=金）。-1 は duration 70F なので、暗幕が明けた後も52F残って見える。
const UG_DARK_IMPACT       = 18;
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
    endCalm: 0,           // 撃破後「洞窟が静まる」進行度 0→1（燭台が消える/扉が上がる/光が差す・1.584）
    ending: 0,            // 真のエンディングの一枚絵を出しているか（1=出す・1.584）
    endLine: 0, endLineTimer: 0, endTapped: 0, endOut: 0,   // テロップの現在行/経過/タップ受付/フェードアウト残（1.587）
    falls: [],            // 滝 {x,y,w,h}（マップの 'w'・**演出だけ**＝当たり判定は一切持たない・1.611）
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

// 地底エンディング→地上復帰の白フェード（1.588）。⚠undergroundState の外に置くこと。
// exitUnderground() が undergroundState の中身を軒並みリセットする（地底状態の後始末）ので、
// その瞬間をまたいで「白一色を保つ」ための状態はそこに同居させられない。
var groundReturnFade = {
    phase: '',   // ''=非アクティブ / 'hold'=白一色で静止 / 'in'=白から元の色合いへ
    timer: 0     // 現在フェーズの残フレーム
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
//   'w' 滝（**演出専用・当たり判定なし**・1.611）。縦に並べた分だけ1本の滝に結合される。
//       ⚠ギミックではない＝通り抜けられるし何も起きない（ユーザー指定）。水量の調整は render.js の drawUgFalls
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
// 同じ文字を n 個並べた文字列。⚠40文字を超える '#' の連なりを手で書くと必ず数え間違える（1.610）
function ugRep(ch, n) { var s = ''; while (n-- > 0) s += ch; return s; }

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
    // 53: ⚠1.610 修正。シャレコを列12に置いていたが、底(行54)は**列8以降が溶岩**なので
    //   湧いた瞬間に落ちて消えていた（＝この敵は一度も画面に出ていなかった）。レイアウト検証ツールが検出。
    //   足場のある列0-7の中へ移した。
    [ugRow(32, ' ', [[5, 'S'], [31, '#']])],                                // 53   底のシャレコ
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
    ugRows(2, 32, ' ', [[0, '#']]),                                         // 45-46
    // 47: ⚠1.605 修正。コインを行49に置いていたが、**真下に足場が無く立って取れない**位置だった
    //   （R14で同種を全部直した際に検出。ユーザー指示で R7 も是正）。行48の足場の真上へ移した。
    [ugRow(32, ' ', [[0, '#'], [22, 'o']])],                                // 47   コイン（下の足場の上）
    [ugRow(32, ' ', [[0, '#'], [20, '=====']])],                            // 48
    [ugRow(32, ' ', [[0, '#'], [10, 'v']])],                                // 49
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

// ═══════════════════════════════════════════════════════════════════
// 地底のレベルデータ ── 2周目（R14以降）。1.602 で構造から作り直し
// ═══════════════════════════════════════════════════════════════════
// ⚠ユーザー指定（2026-07-27）:「レイアウトを1からデザイン、少し難易度を上げて」「上りと下りが適度で
//   あればそれほどこだわりはない。例えば炎のバーが連続してある、タイミングよくマグマの火の玉を越える」
//   「全長は1200m」「老婆の店・邪神の巨像は全長の位置からしてR7と同じくらいの位置に」
//   → さらに「**全体の構造がR7と似すぎ。もっと変化が欲しい**」（1.601への指摘）。
//
// ⚠**1.599版はR7の骨格をなぞっていた**（部屋数8・低→低→縦登り→高→縦降り→低の並び・床の高さが2種類だけ・
//   縦の部屋は57行で4行ごとに足場、まで同型）。1.602 でそこを作り直した。R7と別物にする軸は4つ:
//   ① **高度を3段にする**（R7は 低1180 と 高-164 の2段だけ）。低1180 / **中508（新）** / 高-164。
//      ⚠中層は render.js の depth=(camY+518)/1344 が **ちょうど0.5** になる（camMaxY=154）＝
//      **render.js を1行も触らずに「中層だけの背景の色味」が手に入る**。この3段は正規化の上端/中央/下端に
//      ぴったり収まっているので、**この範囲外へ高度を足す拡張はしない**こと。
//   ② **登りを2本に割る**（672px×2）。縦の総移動量3,872pxはR7と同じ＝「上り下りは適度」を守りつつ、
//      一段登るごとに横の密度が上がる進行にした。
//   ③ **上下2ルートの分岐**を belfry に1箇所（約60タイルで必ず合流）。R7は完全な一本道だった。
//   ④ **落下導入も専用にする**（1.599はR7の UG_ROOM_FALL を共用していた）。共用は chamber だけ。
//
// ⚠**総幅は790タイルのまま**（R7と同一）。UG_TRAVEL_PX=24000 は全ラウンド共通で、ここを変えると
//   距離加算＝ランキングの前提が壊れる。22+106+118+28+118+28+158+32+140+40 = 790。
//   ⚠**闘技場の手前がちょうど750タイル=24,000px=UG_TRAVEL_PX**＝闘技場に入った時点で距離加算は完了。
// ⚠作図の制約は R7 と同じ（穴は最大3タイル／段差は最大4行／縦の部屋は32タイル幅／トゲの連続は最大2タイル）。

// ── 部屋1「裂けた天井」 縦(降) 22タイル×40行 ────────────────────────
// 天井の穴から落ちてくる導入。⚠**ギミックゼロ**＝着地の事故を作らない（R7の fall と同じ思想だが、
//   崩れた螺旋階段の飾り 'b' を左右に噛ませて「ここは元は人の造った場所だった」を絵で出す）。
var UG14_ROOM_FALL = [].concat(
    // ⚠1.604: コインは**落下線の上に置く**こと。プレイヤーは UG_SPAWN_X=56px ＝ **列1〜2** に落ちてくるので、
    //   それ以外の列に置くと「落ちながら取れない＝取れない位置の物」になる（ユーザー指摘の原則）。
    //   飾りの石積み 'b' は当たり判定なしなので、落下線を避けて左右の壁側に寄せる。
    ugRows(4,  22, ' ', [[0, '#'], [21, '#']]),                             // 0-3   落ちてくる区間
    [ugRow(22, ' ', [[0, '#'], [1, 'o'], [16, 'bbb'], [21, '#']])],         // 4     落下線のコイン
    ugRows(3,  22, ' ', [[0, '#'], [21, '#']]),                             // 5-7
    [ugRow(22, ' ', [[0, '#'], [1, 'o'], [15, 'bbbb'], [21, '#']])],        // 8     落下線のコイン
    ugRows(4,  22, ' ', [[0, '#'], [21, '#']]),                             // 9-12
    [ugRow(22, ' ', [[0, '#'], [16, 'bbb'], [21, '#']])],                   // 13
    ugRows(3,  22, ' ', [[0, '#'], [21, '#']]),                             // 14-16
    [ugRow(22, ' ', [[0, '#'], [1, 'o'], [15, 'bbbb'], [21, '#']])],        // 17    落下線のコイン
    ugRows(5,  22, ' ', [[0, '#'], [21, '#']]),                             // 18-22
    [ugRow(22, ' ', [[0, '#'], [14, 'bbbb'], [21, '#']])],                  // 23
    ugRows(4,  22, ' ', [[0, '#'], [21, '#']]),                             // 24-27
    // ⚠行28-37は**右壁を開ける**（＝燼の道の空間と同じ高さ）。塞ぐと着地しても次の部屋へ歩いて出られない。
    ugRows(9,  22, ' ', [[0, '#']]),                                        // 28-36
    [ugRow(22, '#')],                                                       // 37 床
    ugRows(2,  22, '#')                                                     // 38-39 詰め物
);

// ── 部屋2「燼(おき)の道」 横 106タイル×15行 ─────────────────────────
// 【低層①】火の玉を**タイミングよく越える**部屋（ユーザー名指し）。裂け目の真上から噴かせて
// 「玉が下りた瞬間に跳ぶ」リズムを作る。⚠後半ほど 'e'(周期100f・速い) を増やして同じ跳び方を続けさせない。
// ⚠地上敵は**裂け目に落ちない 'm'(ニワトリ＝穴の手前で引き返す)** を基本にする。
var UG14_ROOM_EMBER = [].concat(
    ugRows(2, 106, '#'),                                                    // 0-1 天井
    ugRows(5, 106, ' '),                                                    // 2-6
    // 7: ⚠1.604 修正。コインを行6に置いていたが、床(行12)から**6行=192px上＝跳躍175pxで届かなかった**。
    //   行7＝5行(160px)なら床から直接届く（R7の熔炉と同じ高さ）。⚠**取れない位置に物を置かない**が原則。
    [ugRow(106, ' ', [[18, 'o'], [34, 'o'], [50, 'o'], [66, 'o'], [82, 'o'], [98, 'o']])], // 7
    [ugRow(106, ' ')],                                                      // 8
    [ugRow(106, ' ', [[40, '2'], [88, '1']])],                              // 9 レモン缶／回復
    [ugRow(106, ' ', [[26, '====='], [58, '====='], [90, '=====']])],       // 10 逃げ場の足場
    // 11: 火の玉の噴出口（当たり判定なし＝裂け目の真上に置いてよい）＋敵
    [ugRow(106, ' ', [[16, 'f'], [32, 'f'], [48, 'e'], [64, 'f'], [80, 'e'], [96, 'e'],
                      [10, 'm'], [22, 'm'], [38, 'v'], [44, 'S'], [56, 'm'], [70, 'v'],
                      [76, 'S'], [86, 'm'], [92, 'v'], [102, 'm']])],
    // 12 床。⚠裂け目は2〜3タイル（跳躍135pxに余裕を残す＝実運用の上限）
    [ugRow(106, '#', [[16, 'LL'], [32, 'LLL'], [48, 'LL'], [64, 'LLL'], [80, 'LL'], [96, 'LLL']])],
    ugRows(2, 106, '#', [[16, 'LL'], [32, 'LLL'], [48, 'LL'], [64, 'LLL'], [80, 'LL'], [96, 'LLL']])
);

// ── 部屋3「炎柱の広間」 横 118タイル×15行 ───────────────────────────
// 【低層②】**ファイアバーが連続する見せ場**（ユーザー名指し）。⚠18タイル(576px)間隔＝長さ4(半径128px)の
// バー同士が干渉しない最短の間隔。時計('F')と反時計('G')を交互＝同じ待ち方が2回続かない。
// ⚠前半は床を塞がない（バー待ちに集中させる）。**最後の1/3だけ「動く床×バー」の組み合わせを初出**させ、
//   次の登り(stair_a)で本番にする＝先に教えてから使う。
var UG14_ROOM_BARHALL = [].concat(
    ugRows(2, 118, '#'),                                                    // 0-1 天井
    ugRows(3, 118, ' '),                                                    // 2-4
    [ugRow(118, ' ', [[46, 'H'], [100, 'H']])],                             // 5 天井から下がる長いバー
    ugRows(2, 118, ' '),                                                    // 6-7
    [ugRow(118, ' ', [[26, 'o'], [50, 'o'], [74, 'o'], [98, 'o']])],        // 8
    [ugRow(118, ' ', [[58, '1']])],                                         // 9 回復
    [ugRow(118, ' ', [[20, '====='], [68, '=====']])],                      // 10 逃げ場
    // 11: 床置きバー6本を18タイル間隔で連続。⚠トゲは**バーとバーの中間**に置く
    //     （バーの真下に重ねると「待つ場所が無い」＝避けにくさで難度を上げることになる）。
    //     ⚠列92の動く床＝この部屋の最後だけ「バーをよけながら渡る」を出す（組み合わせの初出）。
    [ugRow(118, ' ', [[12, 'F'], [30, 'G'], [48, 'F'], [66, 'G'], [84, 'F'], [104, 'G'],
                      [21, '^^'], [57, '^^'], [75, '^^'],
                      [92, 'MM'],
                      [8, 'c'], [24, 'v'], [39, 'm'], [53, 'S'], [62, 'm'], [79, 'v'],
                      [88, 'S'], [110, 'm'], [114, 'v']])],
    [ugRow(118, '#', [[92, 'LLL']])],                                       // 12 床（動く床の下だけ溶岩）
    ugRows(2, 118, '#', [[92, 'LLL']])
);

// ── 部屋4「灰の階段(下)」 縦(登) 28タイル×36行 ──────────────────────
// 【低→中】672pxを7段で登る。⚠段差は3行(96px)＝跳躍175pxに余裕。足場は5タイル幅で3〜4タイルずつ右へ。
// ⚠底(列8以降)は溶岩＝落ちたらチェックポイント復帰。ここを床にすると左壁クランプで階段の根元へ戻れず詰む。
// ⚠バーは**足場と足場の「間」**を薙ぐ位置に置く（足場の真上に重ねない＝立って待てる場所を残す）。
var UG14_ROOM_STAIR_A = [].concat(
    ugRows(2, 28, '#'),                                                     // 0-1  天井
    ugRows(10, 28, ' ', [[0, '#']]),                                        // 2-11 右は開放（熔炉へ）
    [ugRow(28, ' ', [[0, '#'], [22, '######']])],                           // 12   出口の棚（＝熔炉の床 508 と同じ高さ）
    ugRows(2, 28, ' ', [[0, '#'], [25, '###']]),                            // 13-14
    [ugRow(28, ' ', [[0, '#'], [20, '====='], [27, '#']])],                 // 15   L7
    [ugRow(28, ' ', [[0, '#'], [22, 'o'], [27, '#']])],                     // 16
    // 17: ⚠1.604 修正。回復(ハート)を行19に置いていたが、**真下に足場が無く跳んでも届かない**位置だった
    //   （ユーザー実機報告「取れない位置にハートがある。ハートは絶対に取れる位置に置いて」）。
    //   足場L6(行18・列17-21)の**真上**へ移した＝L6に乗れば必ず取れる。
    [ugRow(28, ' ', [[0, '#'], [14, 'G'], [19, '1'], [27, '#']])],          // 17   バー＋回復（L6の真上）
    [ugRow(28, ' ', [[0, '#'], [17, '====='], [27, '#']])],                 // 18   L6
    [ugRow(28, ' ', [[0, '#'], [27, '#']])],                                // 19
    [ugRow(28, ' ', [[0, '#'], [23, 'v'], [27, '#']])],                     // 20
    [ugRow(28, ' ', [[0, '#'], [14, 'MMMM'], [27, '#']])],                  // 21   L5＝動く床（barhallで教えた形の本番）
    [ugRow(28, ' ', [[0, '#'], [20, 'F'], [27, '#']])],                     // 22   バー（動く床の上死点を薙ぐ）
    [ugRow(28, ' ', [[0, '#'], [16, 'o'], [27, '#']])],                     // 23
    [ugRow(28, ' ', [[0, '#'], [11, '====='], [27, '#']])],                 // 24   L4
    [ugRow(28, ' ', [[0, '#'], [21, 'v'], [27, '#']])],                     // 25
    [ugRow(28, ' ', [[0, '#'], [27, '#']])],                                // 26
    [ugRow(28, ' ', [[0, '#'], [8, '====='], [27, '#']])],                  // 27   L3
    [ugRow(28, ' ', [[0, '#'], [10, 'o'], [27, '#']])],                     // 28
    [ugRow(28, ' ', [[0, '#'], [15, 'G'], [27, '#']])],                     // 29   バー
    [ugRow(28, ' ', [[0, '#'], [5, '====='], [27, '#']])],                  // 30   L2
    [ugRow(28, ' ', [[7, 'S'], [27, '#']])],                                // 31   棚のシャレコ（左が開放）
    [ugRow(28, ' ', [[27, '#']])],                                          // 32   左が開放（炎柱の広間から入る）
    [ugRow(28, '#', [[8, 'LLLLLLLLLLLLLLLLLLLL']])],                        // 33   床（列8以降は溶岩）
    ugRows(2, 28, '#', [[8, 'LLLLLLLLLLLLLLLLLLLL']])                       // 34-35 詰め物 ＝ 合計36行
);

// ── 部屋5「熔炉の棚」 横 118タイル×15行 ─────────────────────────────
// 【中層＝R7には無かった高度】細い島を火の玉と動く床で渡る。⚠池は**すべて2〜3タイル**（4タイルは作らない）。
// ⚠背景の depth がちょうど0.5＝ここだけ「中層の色」になる（render.js は無改修）。
var UG14_ROOM_FOUNDRY = [].concat(
    ugRows(2, 118, '#'),                                                    // 0-1 天井
    ugRows(5, 118, ' '),                                                    // 2-6
    // 7: ⚠1.604 修正。行6は床から6行=192px上で跳躍175pxでは届かなかった（燼の道と同じ是正）。
    [ugRow(118, ' ', [[20, 'o'], [44, 'o'], [68, 'o'], [92, 'o']])],        // 7
    [ugRow(118, ' ')],                                                      // 8
    [ugRow(118, ' ', [[54, '1'], [100, '3']])],                             // 9 回復／シールド
    [ugRow(118, ' ', [[30, '====='], [76, '=====']])],                      // 10 逃げ場
    // 11: 火の玉＋バー＋動く床。⚠動く床は必ず3タイル以下の池の上に置く＝上手い人は跳んで飛ばせる
    [ugRow(118, ' ', [[14, 'e'], [38, 'f'], [62, 'e'], [86, 'f'], [108, 'e'],
                      [26, 'F'], [50, 'G'], [98, 'F'],
                      [70, 'MMM'],
                      [8, 'm'], [20, 'v'], [33, 'S'], [44, 'm'], [56, 'v'], [66, 'm'],
                      [80, 'S'], [92, 'v'], [104, 'm'], [114, 'S']])],
    [ugRow(118, '#', [[14, 'LL'], [38, 'LLL'], [62, 'LL'], [70, 'LLL'], [86, 'LLL'], [108, 'LL']])], // 12 床
    ugRows(2, 118, '#', [[14, 'LL'], [38, 'LLL'], [62, 'LL'], [70, 'LLL'], [86, 'LLL'], [108, 'LL']])
);

// ── 部屋6「灰の階段(上)」 縦(登) 28タイル×36行 ──────────────────────
// 【中→高】stair_a の上位版。⚠7段のうち**2枚だけ3タイルに細く**する（⚠その足場にトゲは重ねない）。
// ⚠最難関 belfry の直前なので**シールドを置く**＝難所の手前で1回補給できる。
var UG14_ROOM_STAIR_B = [].concat(
    ugRows(2, 28, '#'),                                                     // 0-1  天井
    ugRows(10, 28, ' ', [[0, '#']]),                                        // 2-11 右は開放（鐘楼へ）
    [ugRow(28, ' ', [[0, '#'], [22, '######']])],                           // 12   出口の棚（＝鐘楼の床 -164 と同じ高さ）
    ugRows(2, 28, ' ', [[0, '#'], [25, '###']]),                            // 13-14
    [ugRow(28, ' ', [[0, '#'], [21, '==='], [27, '#']])],                   // 15   L7（細い3タイル）
    [ugRow(28, ' ', [[0, '#'], [22, '3'], [27, '#']])],                     // 16   シールド（belfryの直前）
    // 17: ⚠1.604 修正。コインを行19に置いていたが真下に足場が無く取れなかった。L6(行18)の真上へ移す。
    [ugRow(28, ' ', [[0, '#'], [15, 'F'], [20, 'o'], [27, '#']])],          // 17   バー＋コイン（L6の真上）
    [ugRow(28, ' ', [[0, '#'], [18, '====='], [27, '#']])],                 // 18   L6
    [ugRow(28, ' ', [[0, '#'], [27, '#']])],                                // 19
    [ugRow(28, ' ', [[0, '#'], [24, 'v'], [27, '#']])],                     // 20
    [ugRow(28, ' ', [[0, '#'], [15, '==='], [27, '#']])],                   // 21   L5（細い3タイル）
    [ugRow(28, ' ', [[0, '#'], [21, 'G'], [27, '#']])],                     // 22   バー
    [ugRow(28, ' ', [[0, '#'], [17, 'o'], [27, '#']])],                     // 23
    [ugRow(28, ' ', [[0, '#'], [12, '====='], [27, '#']])],                 // 24   L4
    [ugRow(28, ' ', [[0, '#'], [22, 'v'], [27, '#']])],                     // 25
    [ugRow(28, ' ', [[0, '#'], [27, '#']])],                                // 26
    [ugRow(28, ' ', [[0, '#'], [9, '====='], [27, '#']])],                  // 27   L3
    [ugRow(28, ' ', [[0, '#'], [11, 'o'], [27, '#']])],                     // 28
    [ugRow(28, ' ', [[0, '#'], [16, 'F'], [27, '#']])],                     // 29   バー
    [ugRow(28, ' ', [[0, '#'], [6, '====='], [27, '#']])],                  // 30   L2
    [ugRow(28, ' ', [[7, 'S'], [27, '#']])],                                // 31   棚のシャレコ（左が開放）
    [ugRow(28, ' ', [[27, '#']])],                                          // 32   左が開放（熔炉から入る）
    [ugRow(28, '#', [[8, 'LLLLLLLLLLLLLLLLLLLL']])],                        // 33   床（列8以降は溶岩）
    ugRows(2, 28, '#', [[8, 'LLLLLLLLLLLLLLLLLLLL']])                       // 34-35 詰め物 ＝ 合計36行
);

// ── 部屋7「鐘楼」 横 158タイル×15行 ─────────────────────────────────
// 【高層＝最難関】⚠**上下2ルートの分岐**（列28〜88・約60タイルで必ず合流）＝R7の完全な一本道との一番の違い。
//   上ルート＝row9の足場列（天井のバーをかいくぐる代わりに床のトゲを飛ばせる）
//   下ルート＝床（トゲの回廊。2タイルのトゲ↔6タイルの素床を交互＝リズムが読める）
// ⚠どちらを選んでも合流するので「間違ったルート」は無い。上下から挟むのは天井'H'と床置き'F'の**半周ずれ**。
var UG14_ROOM_BELFRY = [].concat(
    ugRows(2, 158, '#'),                                                    // 0-1 天井
    ugRows(3, 158, ' '),                                                    // 2-4
    // 5: 天井から下がる長いバー(len6=半径156px)。真下を向いた瞬間だけ立っている頭に届く
    [ugRow(158, ' ', [[20, 'H'], [58, 'H'], [96, 'H'], [134, 'H']])],
    ugRows(2, 158, ' '),                                                    // 6-7
    [ugRow(158, ' ', [[34, 'o'], [46, 'o'], [70, '4'], [82, 'o'], [110, 'o'], [140, 'o']])], // 8
    // 9: ⚠**上ルート**（列28〜88）。足場の間は最大3タイル。合流後(列90〜)は逃げ場の足場だけ残す。
    [ugRow(158, ' ', [[28, '======'], [37, '======'], [46, '======'], [55, '======'],
                      [64, '======'], [73, '======'], [82, '======'],
                      [104, '====='], [128, '====='], [148, '=====']])],
    [ugRow(158, ' ', [[30, 'o'], [48, 'o'], [66, 'o'], [84, '1'], [106, 'o'], [130, 'o']])], // 10 合流直後に回復
    // 11: **下ルート＝トゲの回廊**。⚠トゲの連続は最大2タイル・素床は6タイル＝走ってそのまま跳べる。
    //     床置きバーは天井'H'と半周ずらす位置に置く（列39/77/115）。
    //     ⚠1.610: 列38のトゲは元は '^^'(38-39) と書いていたが、後ろの [39,'F'] が列39を上書きするため
    //       **実際は1タイルしか出ていなかった**（レイアウト検証ツールが検出）。出来上がる地形は一切変えず、
    //       ソースを実態どおり '^' に直しただけ。
    [ugRow(158, ' ', [[30, '^^'], [38, '^'], [46, '^^'], [54, '^^'], [62, '^^'], [70, '^^'], [78, '^^'],
                      [39, 'F'], [77, 'F'], [115, 'G'],
                      [12, 'm'], [24, 'S'], [34, 'v'], [44, 'd'], [52, 'v'], [60, 'S'],
                      [68, 'v'], [86, 'm'], [94, 'S'], [102, 'v'], [112, 'm'], [120, 'd'],
                      [132, 'v'], [142, 'm'], [152, 'S']])],
    [ugRow(158, '#', [[90, 'LLL'], [124, 'LL']])],                          // 12 床（溝2つ）
    ugRows(2, 158, '#', [[90, 'LLL'], [124, 'LL']])
);

// ── 部屋8「奈落へ」 縦(降) 32タイル×57行 ────────────────────────────
// 【高→低】1,344pxを一気に降りる。⚠底は列0-23が溶岩・列24-31だけが着地点＝まっすぐ落ちると死ぬ。
// ⚠**火の玉は置かない**（降下中は玉の周期を読む余裕が無い＝避けにくさで難度を上げることになる）。
// ⚠動く床の直後には必ず静止した足場を置く（乗り継ぎ2連続は事故になる）。
var UG14_ROOM_PLUNGE = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[31, '#']]),                                       // 2-11 左は開放（鐘楼から入る）
    [ugRow(32, ' ', [[0, '#######'], [31, '#']])],                          // 12   入口の棚（鐘楼の床 -164 と同じ高さ）
    ugRows(2, 32, ' ', [[0, '###'], [31, '#']]),                            // 13-14
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 15
    [ugRow(32, ' ', [[0, '#'], [3, '====='], [31, '#']])],                  // 16  D1
    [ugRow(32, ' ', [[0, '#'], [5, 'o'], [31, '#']])],                      // 17
    [ugRow(32, ' ', [[0, '#'], [20, 'v'], [31, '#']])],                     // 18
    [ugRow(32, ' ', [[0, '#'], [7, '^'], [31, '#']])],                      // 19  トゲ（下の足場の上）
    [ugRow(32, ' ', [[0, '#'], [5, '====='], [31, '#']])],                  // 20  D2
    [ugRow(32, ' ', [[0, '#'], [17, 'G'], [31, '#']])],                     // 21  バー（段と段の間を薙ぐ）
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 22-23
    [ugRow(32, ' ', [[0, '#'], [8, '====='], [31, '#']])],                  // 24  D3
    [ugRow(32, ' ', [[0, '#'], [10, 'o'], [22, 'v'], [31, '#']])],          // 25
    [ugRow(32, ' ', [[0, '#'], [12, 'S'], [31, '#']])],                     // 26  シャレコ（下の足場に乗る）
    ugRows(1, 32, ' ', [[0, '#'], [31, '#']]),                              // 27
    [ugRow(32, ' ', [[0, '#'], [11, '====='], [31, '#']])],                 // 28  D4
    [ugRow(32, ' ', [[0, '#'], [13, '4'], [31, '#']])],                     // 29  エナジー
    [ugRow(32, ' ', [[0, '#'], [9, 'F'], [31, '#']])],                      // 30  バー
    [ugRow(32, ' ', [[0, '#'], [16, '^^'], [31, '#']])],                    // 31  トゲ（下の足場の上）
    [ugRow(32, ' ', [[0, '#'], [14, '====='], [31, '#']])],                 // 32  D5
    [ugRow(32, ' ', [[0, '#'], [21, 'v'], [31, '#']])],                     // 33
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 34-35
    [ugRow(32, ' ', [[0, '#'], [17, 'MMMM'], [31, '#']])],                  // 36  D6 動く床
    [ugRow(32, ' ', [[0, '#'], [19, 'o'], [31, '#']])],                     // 37
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 38-39
    [ugRow(32, ' ', [[0, '#'], [19, '====='], [31, '#']])],                 // 40  D7 ⚠動く床の直後は静止した足場
    [ugRow(32, ' ', [[0, '#'], [12, 'S'], [31, '#']])],                     // 41  シャレコ
    [ugRow(32, ' ', [[0, '#'], [15, 'G'], [31, '#']])],                     // 42  バー
    // 43: ⚠1.604 修正。トゲを行45に置いていたが**行46が空＝宙に浮いていた**（ユーザー実機報告
    //   「針のギミックが空中に浮いているのはおかしい」）。'^' は**そのマスの底に生える**ので、
    //   必ず1つ下の行に足場があること。足場D8(行44)の真上＝この行へ移した。
    [ugRow(32, ' ', [[0, '#'], [22, '^'], [31, '#']])],                     // 43  トゲ（下の足場D8の上）
    // ⚠行44-53は**右壁を開ける**（＝参道の空間と同じ高さ）。塞ぐと降りきっても次の部屋へ出られない。
    [ugRow(32, ' ', [[0, '#'], [20, '=====']])],                            // 44  D8
    ugRows(3, 32, ' ', [[0, '#']]),                                         // 45-47
    [ugRow(32, ' ', [[0, '#'], [22, '=====']])],                            // 48  D9
    [ugRow(32, ' ', [[0, '#'], [12, 'v'], [24, 'o']])],                     // 49
    [ugRow(32, ' ', [[0, '#']])],                                           // 50
    [ugRow(32, ' ', [[0, '#'], [24, '=====']])],                            // 51  D10 ⚠着地点(列24-31)の真上に置く
    [ugRow(32, ' ', [[0, '#'], [26, 'S']])],                                // 52  底のシャレコ
    [ugRow(32, ' ', [[0, '#']])],                                           // 53
    ugRows(3, 32, '#', [[0, 'LLLLLLLLLLLLLLLLLLLLLLLL']])                   // 54-56 床（列0-23は溶岩）
);

// ── 部屋9「参道」 横 140タイル×15行 ─────────────────────────────────
// 【低層へ復帰】怪しい老婆の店・門・邪神の巨像。ボス前の溜め。
// ⚠**店と巨像の位置は R7 と全長比で一致させる**（ユーザー指定）:
//     店   = 参道の開始610タイル + 列33 = **643タイル / 790 = 81.4%**（R7も643）
//     巨像 = 参道の開始610タイル + 列125 = **735タイル / 790 = 93.0%**（R7も735）
// ⚠店の入口(列31〜37)と門から先(列105〜)には何も置かない＝入店操作を邪魔しない／静けさを保つ。
var UG14_ROOM_SANCTUM = [].concat(
    ugRows(2, 140, '#'),                                                    // 0-1 天井
    ugRows(3, 140, ' '),                                                    // 2-4
    // ⚠門は 'b'（当たり判定なしの飾り）で組む。'B' で門柱を立てると越えられない壁になる。
    // ⚠列121〜129は空けること＝邪神の巨像(列125に中央)の正面を壁龕(アルコーブ)にする。
    [ugRow(140, ' ', [[105, 'bbbb'], [113, 'bbbbbb'], [130, 'bbbbbbbbbb']])], // 5 門のまぐさ
    ugRows(2, 140, ' ', [[115, 'bb'], [138, 'bb']]),                        // 6-7 門柱
    [ugRow(140, ' ', [[20, 'o'], [21, 'o'], [22, 'o'], [76, 'o'], [77, 'o'],
                      [115, 'bb'], [138, 'bb']])],                          // 8
    [ugRow(140, ' ', [[115, 'bb'], [138, 'bb']])],                          // 9
    // 10: 店より手前にだけギミック（バー1・裂け目の火の玉1）。店から先は完全に無風。
    [ugRow(140, ' ', [[12, 'F'], [115, 'bb'], [138, 'bb']])],
    // 11: 'W'=老婆の店（列33）／'I'=邪神の巨像（列125）／'i'=紫の燭台
    // ⚠燭台は門へ近づくほど間隔を詰める（32→24→16→12→8→6タイル）＝「奥へ行くほど祀られている」
    //   ＝ボスの予告になる。R7(32→24→16→12→8)より1段細かい勾配にした＝難度コストゼロで「2周目はもっと奥だ」を出す。
    // ⚠1.610: 列78のコウモリは燭台 'i'(列78) に上書きされて**一度も出ていなかった**
    //   （レイアウト検証ツールが検出）。燭台の間隔を崩さないよう、コウモリを列80へ移した。
    [ugRow(140, ' ', [[138, 'bb'], [8, 'S'], [24, 'm'], [33, 'W'], [46, 'v'], [56, 'c'],
                      [66, 'S'], [80, 'v'], [88, 'm'], [96, 'c'],
                      [125, 'I'],
                      [54, 'i'], [78, 'i'], [94, 'i'], [102, 'i'], [108, 'i'], [112, 'i'],
                      [116, 'i'], [119, 'i'], [131, 'i'], [133, 'i'], [135, 'i'], [137, 'i']])],
    // 12 床。⚠列18-19に裂け目（火の玉の噴出口はその真上）。店(列33中心)から14タイル＝448px離してある。
    [ugRow(140, '#', [[18, 'f ']])],
    ugRows(2, 140, '#', [[18, 'LL']])                                       // 13-14 詰め物＋裂け目の底の溶岩
);

// R14以降の部屋の並び。
// ⚠合計 22+106+118+28+118+28+158+32+140+40 = **790タイル**（R7と同一＝距離加算が変わらない）
//   22+106=128 / +118=246 / +28=274 / +118=392 / +28=420 / +158=578 / +32=610 / +140=750 / +40=790
//   ⚠**参道の右端がちょうど750タイル=24,000px=UG_TRAVEL_PX**＝闘技場に入った時点で距離加算は完了。
// ⚠高度3段（R7は2段）: 低1180（fall/ember/barhall/sanctum/chamber）／**中508（foundry）**／高-164（belfry）。
var UG14_LEVEL_ROOMS = [
    { key: 'fall',     wT: 22,  topY:   -4, map: UG14_ROOM_FALL,    descend: true }, // 床 1180（行37）
    { key: 'ember',    wT: 106, topY:  796, map: UG14_ROOM_EMBER },     // 床 1180
    { key: 'barhall',  wT: 118, topY:  796, map: UG14_ROOM_BARHALL },   // 床 1180
    { key: 'stair_a',  wT: 28,  topY:  124, map: UG14_ROOM_STAIR_A },   // 底 1180（行33）→ 棚 508（行12）
    { key: 'foundry',  wT: 118, topY:  124, map: UG14_ROOM_FOUNDRY },   // 床 **508＝中層（R7に無い高度）**
    { key: 'stair_b',  wT: 28,  topY: -548, map: UG14_ROOM_STAIR_B },   // 底 508（行33）→ 棚 -164（行12）
    { key: 'belfry',   wT: 158, topY: -548, map: UG14_ROOM_BELFRY },    // 床 -164（上下2ルートの分岐）
    { key: 'plunge',   wT: 32,  topY: -548, map: UG14_ROOM_PLUNGE, descend: true }, // 棚 -164 → 底 1180
    { key: 'sanctum',  wT: 140, topY:  796, map: UG14_ROOM_SANCTUM },   // 床 1180（店33=全長81.4%／巨像125=93.0%）
    { key: 'chamber',  wT: 40,  topY:  796, map: UG_ROOM_CHAMBER }      // 闘技場だけR7と共用（固定1画面の器）
];

// ═══════════════════════════════════════════════════════════════════
// 地底のレベルデータ ── 3周目（R21以降）「亀裂」。1.610 で新規作成
// ═══════════════════════════════════════════════════════════════════
// ⚠ユーザー指定（2026-07-27）:「ラウンド21のステージを1から作る」「途中で**上下に分かれて分岐**し、
//   どちらも1つの通路に**収束**する」「難易度は今まで（R7 < R14）よりも高く」。
//
// ⚠**R7とも R14とも骨格を変える**（R14の初版が「R7に似すぎ」と指摘された反省）。変えた点は5つ:
//   ① **高度の並びが「山」ではなく「ジグザグ」**。R7/R14 はどちらも 低→…→高→…→低 の一山だったが、
//      R21は **低→中→低→高→低** ＝ 中で一度上げ、亀裂で低へ落とし、そこから一気に高へ登る。
//   ② **上下2ルートの分岐を「部屋そのもの」でやる**（R14は belfry の中で2行ぶん離れた足場だった）。
//      `rift` は**36行の背の高い横部屋**＝R7/R14 に一つも無かった形。上段(中508)と下段(低1180)が
//      **672px 離れた別の道**になり、分岐してから約90タイル走って床で合流する。
//   ③ **中→低の降下を縦坑ではなく亀裂の落下でやる**＝R7/R14 の「縦坑で降りる」を1回に減らした。
//   ④ 部屋数 11（R7=8・R14=10）。⑤ 共用は chamber だけ（R7/R14 の部屋を1つも再利用しない）。
//
// ⚠**総幅は790タイルのまま**（R7/R14と同一）。UG_TRAVEL_PX=24000 は全ラウンド共通で、ここを変えると
//   距離加算＝ランキングの前提が壊れる。24+94+26+68+152+60+32+124+32+138+40 = 790。
//   24+94=118 / +26=144 / +68=212 / +152=364 / +60=424 / +32=456 / +124=580 / +32=612 / +138=750 / +40=790
//   ⚠**参道の右端がちょうど750タイル=24,000px=UG_TRAVEL_PX**＝闘技場に入った時点で距離加算は完了。
// ⚠**老婆の店と邪神の巨像は R7/R14 と同じ絶対位置**（参道の開始612タイル＋列31=643／＋列123=735）。
// ⚠高度は3段のまま（低1180 / 中508 / 高-164）。render.js の depth=(camY+518)/1344 の下端/中央/上端に
//   ぴったり収まる設計なので、この範囲外へは足さない。
// ⚠作図の制約も同じ（穴は最大3タイル／段差は最大4行／縦の部屋は32タイル幅／トゲの連続は最大2タイル）。
// ⚠難度は**避けにくさでは上げない**（周期・予告・当たり判定は1周目の値のまま）。上げたのは手数と密度と
//   組み合わせだけ。⚠敵の速度は `ugMakeEnemy` のラウンド倍率で**R21は自動的に7.0倍**（R14は4.9倍）に
//   なる＝**体数を増やしすぎない**。R14の64体に対して R21は83体（+30%）に留めてある。

// ── 部屋1「竪坑」 縦(降) 24タイル×40行 ──────────────────────────────
// 天井の亀裂から落ちてくる導入。⚠**ギミックゼロ**（着地の事故を作らない）。
// ⚠コインは**落下線（UG_SPAWN_X=56px ＝列1〜2）の上**にだけ置く。それ以外は落ちながら取れない。
// ⚠張り出しの石積み 'B' はソリッドなので**列5以降**に置く（プレイヤーの右端は列3.25まで届く）。
var UG21_ROOM_SHAFT = [].concat(
    ugRows(2, 24, '#', [[1, '   ']]),                                       // 0-1  天井の亀裂
    [ugRow(24, ' ', [[0, '#'], [23, '#']])],                                // 2
    [ugRow(24, ' ', [[0, '#'], [1, 'o'], [17, 'BBB'], [23, '#']])],         // 3    コイン（落下線）
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 4-5
    [ugRow(24, ' ', [[0, '#'], [6, 'BB'], [23, '#']])],                     // 6
    [ugRow(24, ' ', [[0, '#'], [1, 'o'], [23, '#']])],                      // 7    コイン
    [ugRow(24, ' ', [[0, '#'], [23, '#']])],                                // 8
    [ugRow(24, ' ', [[0, '#'], [18, 'BBBB'], [23, '#']])],                  // 9
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 10-11
    [ugRow(24, ' ', [[0, '#'], [2, 'o'], [7, 'BBB'], [23, '#']])],          // 12   コイン
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 13-14
    [ugRow(24, ' ', [[0, '#'], [16, 'BBB'], [23, '#']])],                   // 15
    [ugRow(24, ' ', [[0, '#'], [23, '#']])],                                // 16
    [ugRow(24, ' ', [[0, '#'], [1, 'o'], [5, 'BB'], [23, '#']])],           // 17   コイン
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 18-19
    [ugRow(24, ' ', [[0, '#'], [19, 'BBB'], [23, '#']])],                   // 20
    [ugRow(24, ' ', [[0, '#'], [23, '#']])],                                // 21
    [ugRow(24, ' ', [[0, '#'], [2, 'o'], [8, 'BB'], [23, '#']])],           // 22   コイン
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 23-24
    [ugRow(24, ' ', [[0, '#'], [16, 'BBBB'], [23, '#']])],                  // 25
    [ugRow(24, ' ', [[0, '#'], [23, '#']])],                                // 26
    // ⚠行27-36は**右壁を開ける**（＝焦土の谷の空間 860〜1148 と同じ高さ）。塞ぐと次の部屋へ出られない。
    ugRows(10, 24, ' ', [[0, '#']]),                                        // 27-36
    [ugRow(24, '#')],                                                       // 37   床 1180
    ugRows(2, 24, '#')                                                      // 38-39 詰め物
);

// ── 部屋2「焦土の谷」 横 94タイル×15行 ──────────────────────────────
// 【低層①】裂け目＋火の玉＋トゲ。⚠**裂け目は最大3タイル**・**トゲの連続は最大2タイル**。
// ⚠地上敵は 'm'(ニワトリ＝穴の手前で引き返す) と 'S'(シャレコ・同じく引き返す) だけにする。
//   'c'(ひよこ) は穴に落ちる種なので、裂け目が7つあるこの部屋には置かない。
var UG21_ROOM_SCORCH = [].concat(
    ugRows(2, 94, '#'),                                                     // 0-1 天井
    ugRows(5, 94, ' '),                                                     // 2-6
    // 7: コイン。⚠床(行12)から5行=160px＝跳躍175pxで届く上限。行6に置くと届かない。
    [ugRow(94, ' ', [[16, 'o'], [30, 'o'], [44, 'o'], [58, 'o'], [72, 'o'], [88, 'o']])],
    [ugRow(94, ' ')],                                                       // 8
    [ugRow(94, ' ', [[34, '2'], [78, '1']])],                               // 9 レモン缶／回復
    [ugRow(94, ' ', [[28, '====='], [56, '====='], [84, '=====']])],        // 10 逃げ場
    // 11: 火の玉の噴出口（裂け目の真上）＋トゲ＋敵。⚠トゲは裂け目と裂け目の**中間**に置く
    //     （裂け目の縁に重ねると「跳ぶ位置が1タイルしかない」＝避けにくさで難度を上げることになる）。
    [ugRow(94, ' ', [[12, 'f'], [24, 'e'], [38, 'f'], [50, 'e'], [62, 'f'], [74, 'e'], [86, 'f'],
                      [19, '^^'], [33, '^^'], [45, '^^'], [57, '^^'], [69, '^^'], [81, '^^'],
                      [6, 'm'], [17, 'v'], [22, 'S'], [31, 'm'], [36, 'v'], [44, 'S'],
                      [48, 'm'], [60, 'v'], [68, 'S'], [79, 'm'], [90, 'v']])],
    [ugRow(94, '#', [[12, 'LL'], [24, 'LLL'], [38, 'LL'], [50, 'LLL'], [62, 'LL'], [74, 'LLL'], [86, 'LL']])], // 12 床
    ugRows(2, 94, '#', [[12, 'LL'], [24, 'LLL'], [38, 'LL'], [50, 'LLL'], [62, 'LL'], [74, 'LLL'], [86, 'LL']])
);

// ── 部屋3「灰の昇り」 縦(登) 26タイル×36行 ──────────────────────────
// 【低→中】672pxを6段で登る。段差は3行(96px)＝跳躍175pxに余裕。
// ⚠底(列8以降)は溶岩＝落ちたらチェックポイント復帰。ここを床にすると左壁クランプで根元へ戻れず詰む。
// ⚠出口の棚(行12・列20-25)の**真下に足場を伸ばさない**。真下から跳ぶと棚の裏に頭をぶつける。
var UG21_ROOM_RISE = [].concat(
    ugRows(2, 26, '#'),                                                     // 0-1  天井
    ugRows(10, 26, ' ', [[0, '#']]),                                        // 2-11 右は開放（桟道へ）
    [ugRow(26, ' ', [[0, '#'], [20, '######']])],                           // 12   出口の棚（＝桟道の床 508）
    ugRows(2, 26, ' ', [[0, '#'], [23, '###']]),                            // 13-14
    [ugRow(26, ' ', [[0, '#'], [15, '====='], [25, '#']])],                 // 15   L6
    [ugRow(26, ' ', [[0, '#'], [16, 'G'], [22, 'v'], [25, '#']])],          // 16   バー
    [ugRow(26, ' ', [[0, '#'], [13, 'o'], [25, '#']])],                     // 17   コイン（L5の真上）
    [ugRow(26, ' ', [[0, '#'], [12, '====='], [25, '#']])],                 // 18   L5
    [ugRow(26, ' ', [[0, '#'], [22, 'v'], [25, '#']])],                     // 19
    [ugRow(26, ' ', [[0, '#'], [12, '4'], [25, '#']])],                     // 20   エナジー（L4の真上）
    [ugRow(26, ' ', [[0, '#'], [10, 'MMMM'], [25, '#']])],                  // 21   L4＝動く床
    [ugRow(26, ' ', [[0, '#'], [18, 'F'], [25, '#']])],                     // 22   バー
    [ugRow(26, ' ', [[0, '#'], [10, 'o'], [25, '#']])],                     // 23   コイン（L3の真上）
    [ugRow(26, ' ', [[0, '#'], [8, '====='], [25, '#']])],                  // 24   L3
    [ugRow(26, ' ', [[0, '#'], [20, 'v'], [25, '#']])],                     // 25
    [ugRow(26, ' ', [[0, '#'], [5, '====='], [25, '#']])],                  // 26   L2
    [ugRow(26, ' ', [[0, '#'], [12, 'G'], [25, '#']])],                     // 27   バー
    [ugRow(26, ' ', [[0, '#'], [5, 'o'], [25, '#']])],                      // 28   コイン（L1の真上）
    // ⚠行29-32は**左壁を開ける**（＝焦土の谷の床の上・128pxの出入口）。塞ぐと歩いて入れない。
    [ugRow(26, ' ', [[25, '#']])],                                          // 29
    [ugRow(26, ' ', [[3, '====='], [25, '#']])],                            // 30   L1
    [ugRow(26, ' ', [[25, '#']])],                                          // 31
    [ugRow(26, ' ', [[5, 'S'], [25, '#']])],                                // 32   底のシャレコ
    ugRows(3, 26, '#', [[8, ugRep('L', 18)]])                               // 33-35 床（列8以降は溶岩）
);

// ── 部屋4「熔炉の桟道」 横 68タイル×15行 ────────────────────────────
// 【中層＝depth ちょうど0.5・render.js を無改修で専用の色味になる高さ】
// 動く床で裂け目を渡る＋天井から下がる長いバー。⚠動く床は**3タイル以下の裂け目の上**に置く
//   ＝上手い人は跳んで飛ばせる／落ち着いて渡りたい人は乗れる、の二択にする。
var UG21_ROOM_CAUSEWAY = [].concat(
    ugRows(2, 68, '#'),                                                     // 0-1 天井
    ugRows(3, 68, ' '),                                                     // 2-4
    [ugRow(68, ' ', [[12, 'H'], [52, 'H']])],                               // 5 天井から下がる長いバー
    ugRows(2, 68, ' '),                                                     // 6-7
    [ugRow(68, ' ', [[8, 'o'], [20, 'o'], [32, 'o'], [44, 'o'], [60, 'o']])], // 8
    [ugRow(68, ' ', [[30, '4']])],                                          // 9 エナジー
    [ugRow(68, ' ', [[16, '====='], [38, '====='], [58, '=====']])],        // 10 逃げ場
    // 11: 床置きバー／トゲ／動く床／敵。⚠動く床は「書いたマス＝一番下に来る位置」＝床から飛び乗れる
    [ugRow(68, ' ', [[6, 'G'], [34, 'F'],
                      [26, '^^'], [48, '^^'],
                      [21, 'MM'], [43, 'MMM'],
                      [4, 'm'], [14, 'v'], [18, 'S'], [28, 'm'], [31, 'd'], [37, 'v'],
                      [52, 'S'], [66, 'm']])],
    [ugRow(68, '#', [[21, 'LL'], [43, 'LLL'], [62, 'LL']])],                // 12 床
    ugRows(2, 68, '#', [[21, 'LL'], [43, 'LLL'], [62, 'LL']])
);

// ── 部屋5「亀裂」 横(2層) 152タイル×36行 ★上下分岐 ──────────────────
// 【中508 ⇄ 低1180 ＝ この2つの高さが同じ部屋の中にある】R7/R14 に一つも無かった形の部屋。
// ⚠**分岐の作り**: 中段の桟道(行12・列0-43)が列43で途切れる。その手前に上へ跳べる足場(行9・列39-43)が
//   あるので、プレイヤーは「跳んで上ルートへ行く」か「そのまま踏み外して下ルートへ落ちる」かを選ぶ。
//   ⚠左には8タイルしか戻れない＝**どちらも入ったら戻れない**。よって**必ず合流させる**:
//     上ルート = 行8〜10の細い足場を10枚渡り、行15→21→27の階段で降りて床へ（列118〜134）
//     下ルート = 床(行33)をそのまま走る（トゲ・敵・火の玉）
//   → 列135以降は**1本の通路**。ここから先は上も下も無い。
// ⚠**上から落ちても死なせない**: 下ルートの溶岩(列64-65/80-81/96-97/112-113)は
//   **すべて上ルートの足場の真下**に置いてある＝上から落ちる場所（足場の隙間の真下）は必ず素の床。
//   落下＝「上ルート失格で下ルートへ降格」であって死ではない、という約束にした。
// ⚠**落下口(列44〜55)は完全に無地**にする＝踏み外した直後に被弾させない。
//   落下線(列45-46)にコインを縦に並べて「ここは道である」と絵で伝える（マリオの落とし穴と同じ作法）。
var UG21_ROOM_RIFT = [].concat(
    ugRows(2, 152, '#'),                                                    // 0-1  天井
    ugRows(3, 152, ' '),                                                    // 2-4
    [ugRow(152, ' ', [[49, 'H'], [73, 'H'], [97, 'H'], [113, 'H']])],       // 5    上ルートを薙ぐ長いバー
    [ugRow(152, ' ')],                                                      // 6
    // 7: 桟道側のコイン(8/22/36)＋上ルートのコイン(49/65/81/97)＋シールド(89)
    [ugRow(152, ' ', [[8, 'o'], [22, 'o'], [36, 'o'], [49, 'o'], [65, 'o'],
                      [81, 'o'], [89, '3'], [97, 'o']])],
    // 8: 上ルートの足場L2/L6/L9＋コイン＋コウモリ。⚠**上ルートに地上敵は置かない**
    //    （片道足場の縁で引き返す保証が無く、勝手に落ちて居なくなる）。飛行敵だけにする。
    [ugRow(152, ' ', [[55, '====='], [87, '====='], [111, '====='],
                      [73, 'o'], [105, 'o'], [62, 'v'], [84, 'd'], [108, 'v']])],
    // 9: 分岐の入口L0(39-43)＋上ルートL1/L3/L5/L7
    [ugRow(152, ' ', [[39, '====='], [47, '====='], [63, '====='], [79, '====='], [95, '====='],
                      [70, 'v'], [92, 'v']])],
    [ugRow(152, ' ', [[71, '====='], [103, '=====']])],                     // 10   上ルートL4/L8
    // 11: 中段の桟道の上（列0-43）。バー2本・トゲ2組・敵5体。⚠列44以降には何も置かない
    [ugRow(152, ' ', [[14, 'G'], [30, 'F'], [20, '^^'], [34, '^^'],
                      [5, 'm'], [11, 'v'], [18, 'S'], [24, 'c'], [41, 'v']])],
    [ugRow(152, ' ', [[0, ugRep('#', 44)]])],                               // 12   中段の桟道（列0-43で途切れる）
    // ⚠13-14: 桟道の厚み（3タイル）＋**桟道の上から見えるコイン**。
    //   実測: 桟道に立っているときカメラ y=154＝画面の下端は worldY 604 なので、
    //   行16以下のコインは**分岐を選ぶ瞬間には1枚も見えない**（＝ただの奈落に見える）。
    //   行13(y=540)を足して「縁から下へコインが続いている」を必ず1枚は見せる。
    [ugRow(152, ' ', [[0, ugRep('#', 44)], [45, 'o']])],                    // 13   ★桟道から見える1枚目
    [ugRow(152, ' ', [[0, ugRep('#', 44)], [46, 'o']])],                    // 14
    [ugRow(152, ' ', [[118, '=====']])],                                    // 15   合流の階段D1
    // ⚠1.611 是正: 落下線のコインを列45-46に固めていたが、**落下中の横流れは最大5.2タイル**
    //   （地底の歩行は 3.0px/f＝MOVE_SPEED6×UG_SPEED_RATE0.5。1.5px/f と誤って計算していた）。
    //   落ちる放物線に沿って列を右へずらす＝実際に拾える線になる。
    [ugRow(152, ' ', [[46, 'o']])],                                         // 16   落下線のコイン
    ugRows(3, 152, ' '),                                                    // 17-19
    [ugRow(152, ' ', [[47, 'o']])],                                         // 20   落下線のコイン
    [ugRow(152, ' ', [[124, '=====']])],                                    // 21   合流の階段D2
    ugRows(2, 152, ' '),                                                    // 22-23
    [ugRow(152, ' ', [[48, 'o']])],                                         // 24   落下線のコイン
    ugRows(2, 152, ' '),                                                    // 25-26
    [ugRow(152, ' ', [[130, '=====']])],                                    // 27   合流の階段D3
    [ugRow(152, ' ', [[49, 'o']])],                                         // 28   落下線のコイン
    [ugRow(152, ' ')],                                                      // 29
    [ugRow(152, ' ', [[50, 'o'], [70, '1'], [78, 'o'], [100, 'o'], [110, '4'], [128, 'o']])], // 30 下ルートの報酬
    [ugRow(152, ' ', [[86, 'o'], [118, 'o']])],                             // 31
    // 32: 下ルート（列44〜134）＋合流後の通路（列135〜）。⚠列44-55は無地（落下口）
    [ugRow(152, ' ', [[64, 'f'], [80, 'e'], [96, 'f'], [112, 'e'], [141, 'f'],
                      [56, '^^'], [72, '^^'], [88, '^^'], [104, '^^'], [145, '^^'],
                      [60, 'G'], [92, 'F'], [124, 'G'], [138, 'F'],
                      [46, 'm'], [52, 'S'], [62, 'v'], [68, 'm'], [76, 'S'], [84, 'm'],
                      [100, 'v'], [108, 'd'], [116, 'S'], [120, 'm'],
                      [136, 'm'], [143, 'v'], [149, 'S']])],
    [ugRow(152, '#', [[64, 'LL'], [80, 'LL'], [96, 'LL'], [112, 'LL'], [141, 'LL']])], // 33 床 1180
    ugRows(2, 152, '#', [[64, 'LL'], [80, 'LL'], [96, 'LL'], [112, 'LL'], [141, 'LL']])
);

// ── 部屋6「残響の底」 横 60タイル×15行 ──────────────────────────────
// 【低層②】合流直後の短い連絡通路。休ませはするが無風にはしない（バー2・トゲ2組・動く床1）。
var UG21_ROOM_UNDERTOW = [].concat(
    ugRows(2, 60, '#'),                                                     // 0-1 天井
    ugRows(5, 60, ' '),                                                     // 2-6
    [ugRow(60, ' ', [[10, 'o'], [24, 'o'], [38, 'o'], [52, 'o']])],         // 7
    [ugRow(60, ' ')],                                                       // 8
    [ugRow(60, ' ', [[30, '1']])],                                          // 9 回復
    [ugRow(60, ' ', [[16, '====='], [42, '=====']])],                       // 10 逃げ場
    // 11: ⚠噴出口 'f' は動く床 'MM' と**同じマスに書かない**（後ろの部品が前を黙って上書きする）。
    //     裂け目を3タイル(27-29)にして、動く床を27-28・噴出口を29に分けてある。
    [ugRow(60, ' ', [[8, 'F'], [36, 'G'], [20, '^^'], [46, '^^'], [27, 'MM'], [29, 'f'],
                      [4, 'm'], [12, 'S'], [18, 'v'], [24, 'm'], [33, 'S'], [44, 'v'], [55, 'm']])], // 11
    [ugRow(60, '#', [[27, 'LLL']])],                                        // 12 床
    ugRows(2, 60, '#', [[27, 'LLL']])
);

// ── 部屋7「昇降の縦坑」 縦(登) 32タイル×57行 ────────────────────────
// 【低→高】1,344pxを11段で登る、この面で一番長い登り。⚠**動く床3枚を階段の一部に組み込む**
//   （R7の尖塔は1枚・R14の階段も各1枚）＝「乗って待つ」時間がバーの周期と噛み合うようにした。
// ⚠バーは足場と足場の**間**に置く（足場の真上に重ねない＝立って待てる場所を必ず残す）。
var UG21_ROOM_ASCENT = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[0, '#']]),                                        // 2-11 右は開放（玄室へ）
    [ugRow(32, ' ', [[0, '#'], [26, '######']])],                           // 12   出口の棚（＝玄室の床 -164）
    ugRows(2, 32, ' ', [[0, '#'], [29, '###']]),                            // 13-14
    [ugRow(32, ' ', [[0, '#'], [21, '====='], [31, '#']])],                 // 15   L11
    [ugRow(32, ' ', [[0, '#'], [26, 'v'], [31, '#']])],                     // 16
    [ugRow(32, ' ', [[0, '#'], [21, '1'], [31, '#']])],                     // 17   回復（L10の真上）
    [ugRow(32, ' ', [[0, '#'], [20, 'MMMM'], [31, '#']])],                  // 18   L10＝動く床
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 19
    [ugRow(32, ' ', [[0, '#'], [23, 'G'], [31, '#']])],                     // 20   バー
    [ugRow(32, ' ', [[0, '#'], [19, 'o'], [31, '#']])],                     // 21   コイン（L9の真上）
    [ugRow(32, ' ', [[0, '#'], [18, '====='], [31, '#']])],                 // 22   L9
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 23-24
    [ugRow(32, ' ', [[0, '#'], [17, 'MMMM'], [31, '#']])],                  // 25   L8＝動く床
    [ugRow(32, ' ', [[0, '#'], [27, 'd'], [31, '#']])],                     // 26
    [ugRow(32, ' ', [[0, '#'], [20, 'F'], [31, '#']])],                     // 27   バー
    [ugRow(32, ' ', [[0, '#'], [16, 'o'], [31, '#']])],                     // 28   コイン（L7の真上）
    [ugRow(32, ' ', [[0, '#'], [15, '====='], [31, '#']])],                 // 29   L7
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 30-31
    [ugRow(32, ' ', [[0, '#'], [13, '====='], [31, '#']])],                 // 32   L6
    [ugRow(32, ' ', [[0, '#'], [24, 'v'], [31, '#']])],                     // 33
    [ugRow(32, ' ', [[0, '#'], [17, 'G'], [31, '#']])],                     // 34   バー
    [ugRow(32, ' ', [[0, '#'], [12, '4'], [31, '#']])],                     // 35   エナジー（L5の真上）
    [ugRow(32, ' ', [[0, '#'], [11, 'MMMM'], [31, '#']])],                  // 36   L5＝動く床
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 37-38
    [ugRow(32, ' ', [[0, '#'], [9, '====='], [31, '#']])],                  // 39   L4
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 40
    [ugRow(32, ' ', [[0, '#'], [14, 'F'], [31, '#']])],                     // 41   バー
    [ugRow(32, ' ', [[0, '#'], [9, 'o'], [31, '#']])],                      // 42   コイン（L3の真上）
    [ugRow(32, ' ', [[0, '#'], [7, '====='], [31, '#']])],                  // 43   L3
    // ⚠行44-53は**左壁を開ける**（＝残響の底の空間 860〜1148 と同じ高さ）。塞ぐと歩いて入れない。
    [ugRow(32, ' ', [[20, 'v'], [31, '#']])],                               // 44
    ugRows(1, 32, ' ', [[31, '#']]),                                        // 45
    [ugRow(32, ' ', [[5, '====='], [31, '#']])],                            // 46   L2
    [ugRow(32, ' ', [[31, '#']])],                                          // 47
    [ugRow(32, ' ', [[11, 'G'], [31, '#']])],                               // 48   バー
    [ugRow(32, ' ', [[5, 'o'], [31, '#']])],                                // 49   コイン（L1の真上）
    [ugRow(32, ' ', [[3, '====='], [31, '#']])],                            // 50   L1
    ugRows(2, 32, ' ', [[31, '#']]),                                        // 51-52
    [ugRow(32, ' ', [[4, 'S'], [31, '#']])],                                // 53   底のシャレコ
    ugRows(3, 32, '#', [[8, ugRep('L', 24)]])                               // 54-56 床（列8以降は溶岩）
);

// ── 部屋8「玄室の冠」 横 124タイル×15行 ─────────────────────────────
// 【高層＝最難関】天井の長いバー5本と床置きバー5本で**上下から挟む**／トゲ7組／穴3つ／動く床2枚。
// ⚠トゲは**バーとバーの中間**に置く（バーの真下に重ねると「待つ場所が無い」＝避けにくさになる）。
var UG21_ROOM_CROWN = [].concat(
    ugRows(2, 124, '#'),                                                    // 0-1 天井
    ugRows(3, 124, ' '),                                                    // 2-4
    [ugRow(124, ' ', [[14, 'H'], [40, 'H'], [66, 'H'], [90, 'H'], [114, 'H']])], // 5 天井から下がる長いバー
    ugRows(2, 124, ' '),                                                    // 6-7
    [ugRow(124, ' ', [[20, 'o'], [44, 'o'], [56, '1'], [68, 'o'], [92, 'o'], [116, 'o']])], // 8 回復
    [ugRow(124, ' ', [[26, '====='], [50, '====='], [74, '====='], [98, '=====']])], // 9 逃げ場
    [ugRow(124, ' ', [[8, '4'], [28, 'o'], [52, 'o'], [76, 'o'], [100, 'o']])], // 10 エナジー
    // 11: 床置きバー／トゲ／動く床／敵
    [ugRow(124, ' ', [[10, 'F'], [34, 'G'], [58, 'F'], [82, 'G'], [106, 'F'],
                      [18, '^^'], [30, '^^'], [42, '^^'], [62, '^^'], [70, '^^'], [88, '^^'], [110, '^^'],
                      [24, 'MMM'], [94, 'MMM'], [66, 'f'],
                      [4, 'm'], [14, 'v'], [22, 'S'], [28, 'm'], [38, 'v'], [46, 'd'],
                      [54, 'm'], [60, 'S'], [72, 'v'], [78, 'm'], [86, 'S'], [100, 'v'],
                      [108, 'm'], [118, 'S']])],
    [ugRow(124, '#', [[24, 'LLL'], [66, 'LL'], [94, 'LLL']])],              // 12 床
    ugRows(2, 124, '#', [[24, 'LLL'], [66, 'LL'], [94, 'LLL']])
);

// ── 部屋9「顎の縦坑」 縦(降) 32タイル×57行 ──────────────────────────
// 【高→低】1,344pxを一気に降りる。⚠底は列0-23が溶岩・列24-31だけが着地点＝まっすぐ落ちると死ぬ。
// ⚠**火の玉は置かない**（降下中は玉の周期を読む余裕が無い＝避けにくさで難度を上げることになる）。
// ⚠トゲは**必ず1つ下の行に足場がある位置**に置く（'^' はそのマスの底に生える）。
//   ⚠**動く床の上にトゲを置かない**（トゲは静止した矩形なので床だけが動いて分離する）。
var UG21_ROOM_MAW = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[31, '#']]),                                       // 2-11 左は開放（玄室から入る）
    [ugRow(32, ' ', [[0, '#######'], [31, '#']])],                          // 12   入口の棚（玄室の床 -164）
    ugRows(2, 32, ' ', [[0, '###'], [31, '#']]),                            // 13-14
    [ugRow(32, ' ', [[0, '#'], [6, '^'], [31, '#']])],                      // 15   トゲ（D1の上）
    [ugRow(32, ' ', [[0, '#'], [4, '====='], [31, '#']])],                  // 16   D1
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 17-18
    [ugRow(32, ' ', [[0, '#'], [14, 'G'], [24, 'v'], [31, '#']])],          // 19   バー
    [ugRow(32, ' ', [[0, '#'], [8, 'o'], [31, '#']])],                      // 20   コイン（D2の上）
    [ugRow(32, ' ', [[0, '#'], [6, '====='], [31, '#']])],                  // 21   D2
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 22-23
    [ugRow(32, ' ', [[0, '#'], [10, '^^'], [13, 'S'], [31, '#']])],         // 24   トゲ＋シャレコ（D3の上）
    [ugRow(32, ' ', [[0, '#'], [9, '====='], [31, '#']])],                  // 25   D3
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 26-27
    [ugRow(32, ' ', [[0, '#'], [18, 'F'], [31, '#']])],                     // 28   バー
    [ugRow(32, ' ', [[0, '#'], [13, 'o'], [31, '#']])],                     // 29   コイン（D4の上）
    [ugRow(32, ' ', [[0, '#'], [11, 'MMMM'], [31, '#']])],                  // 30   D4＝動く床
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 31-32
    [ugRow(32, ' ', [[0, '#'], [15, '4'], [26, 'v'], [31, '#']])],          // 33   エナジー（D5の上）
    [ugRow(32, ' ', [[0, '#'], [13, '====='], [31, '#']])],                 // 34   D5
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 35-36
    [ugRow(32, ' ', [[0, '#'], [22, 'G'], [31, '#']])],                     // 37   バー
    [ugRow(32, ' ', [[0, '#'], [18, 'o'], [31, '#']])],                     // 38   コイン（D6の上）
    [ugRow(32, ' ', [[0, '#'], [16, '====='], [31, '#']])],                 // 39   D6
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 40-41
    [ugRow(32, ' ', [[0, '#'], [27, 'd'], [31, '#']])],                     // 42
    [ugRow(32, ' ', [[0, '#'], [18, 'MMMM'], [31, '#']])],                  // 43   D7＝動く床
    // ⚠行44-53は**右壁を開ける**（＝参道の空間 860〜1148）。塞ぐと降りきっても次の部屋へ出られない。
    [ugRow(32, ' ', [[0, '#'], [26, 'F']])],                                // 44   バー
    [ugRow(32, ' ', [[0, '#']])],                                           // 45
    [ugRow(32, ' ', [[0, '#'], [22, '^'], [24, '1']])],                     // 46   トゲ＋回復（D8の上）
    [ugRow(32, ' ', [[0, '#'], [20, '=====']])],                            // 47   D8 ⚠動く床の直後は静止した足場
    ugRows(2, 32, ' ', [[0, '#']]),                                         // 48-49
    [ugRow(32, ' ', [[0, '#'], [26, 'o']])],                                // 50   コイン（D9の上）
    [ugRow(32, ' ', [[0, '#'], [24, '=====']])],                            // 51   D9 ⚠着地点(列24-31)の真上
    [ugRow(32, ' ', [[0, '#'], [28, 'S']])],                                // 52
    [ugRow(32, ' ', [[0, '#']])],                                           // 53
    ugRows(3, 32, '#', [[0, ugRep('L', 24)]])                               // 54-56 床（列0-23は溶岩）
);

// ── 部屋10「参道」 横 138タイル×15行 ────────────────────────────────
// 【低層へ復帰】怪しい老婆の店・門・邪神の巨像。ボス前の溜め。
// ⚠**店と巨像は R7/R14 と同じ絶対位置**（参道の開始612タイル）:
//     店   = 612 + 列31 = **643タイル**（R7も R14も 643）
//     巨像 = 612 + 列123 = **735タイル**（R7も R14も 735）
// ⚠店の入口(列29〜35)と門から先(列100〜)には何も置かない＝入店操作を邪魔しない／静けさを保つ。
// ⚠列119〜127には石を一切置かない＝巨像(列120.1〜126.9を占める)の正面を壁龕(アルコーブ)にする。
var UG21_ROOM_SANCTUM = [].concat(
    ugRows(2, 138, '#'),                                                    // 0-1 天井
    ugRows(3, 138, ' '),                                                    // 2-4
    // ⚠門は 'b'（当たり判定なしの飾り）で組む。'B' で門柱を立てると越えられない壁になる。
    [ugRow(138, ' ', [[103, 'bbbb'], [111, 'bbbbbb'], [128, 'bbbbbbbbbb']])], // 5 門のまぐさ（像の前は開ける）
    ugRows(2, 138, ' ', [[113, 'bb'], [136, 'bb']]),                        // 6-7 門柱
    [ugRow(138, ' ', [[40, 'o'], [41, 'o'], [42, 'o'], [88, 'o'], [89, 'o'],
                      [113, 'bb'], [136, 'bb']])],                          // 8
    [ugRow(138, ' ', [[113, 'bb'], [136, 'bb']])],                          // 9
    [ugRow(138, ' ', [[10, 'F'], [113, 'bb'], [136, 'bb']])],               // 10 店より手前のギミック①バー
    // 11: 'W'=老婆の店（列31）／'I'=邪神の巨像（列123）／'i'=紫の燭台／トゲ（ギミック③）
    // ⚠燭台は門へ近づくほど間隔を詰める（24→16→8→6→4→3タイル）＝「奥へ行くほど祀られている」
    // ⚠地上敵は 'm'/'S'（穴の手前で引き返す種）だけにする。'c'(ひよこ) は列16-17の裂け目へ
    //   歩いて落ちて消えるので、床に穴のあるこの部屋には置かない。
    [ugRow(138, ' ', [[136, 'bb'], [24, '^^'], [6, 'S'], [22, 'm'], [31, 'W'], [44, 'v'],
                      [56, 'm'], [66, 'S'], [78, 'v'], [88, 'm'],
                      [123, 'I'],
                      [50, 'i'], [74, 'i'], [90, 'i'], [98, 'i'], [104, 'i'], [108, 'i'],
                      [112, 'i'], [115, 'i'], [129, 'i'], [131, 'i'], [133, 'i'], [135, 'i']])],
    // 12 床。⚠列16-17に裂け目（ギミック②）。'f'は噴出口＝当たり判定を持たないので床が開く。
    [ugRow(138, '#', [[16, 'f ']])],
    ugRows(2, 138, '#', [[16, 'LL']])                                       // 13-14 詰め物＋裂け目の底の溶岩
);

// R21以降の部屋の並び。
// ⚠合計 24+94+26+68+152+60+32+124+32+138+40 = **790タイル**（R7/R14と同一＝距離加算が変わらない）
// ⚠高度の並びは **低→中→低→高→低**（R7/R14 の「一山」ではなくジグザグ）。
var UG21_LEVEL_ROOMS = [
    { key: 'shaft',    wT: 24,  topY:   -4, map: UG21_ROOM_SHAFT,  descend: true }, // 床 1180（行37）
    { key: 'scorch',   wT: 94,  topY:  796, map: UG21_ROOM_SCORCH },   // 床 1180
    { key: 'rise',     wT: 26,  topY:  124, map: UG21_ROOM_RISE },     // 底 1180（行33）→ 棚 508（行12）
    { key: 'causeway', wT: 68,  topY:  124, map: UG21_ROOM_CAUSEWAY }, // 床 **508＝中層**
    { key: 'rift',     wT: 152, topY:  124, map: UG21_ROOM_RIFT },     // 桟道 508 →（上下分岐）→ 床 1180
    { key: 'undertow', wT: 60,  topY:  796, map: UG21_ROOM_UNDERTOW }, // 床 1180
    { key: 'ascent',   wT: 32,  topY: -548, map: UG21_ROOM_ASCENT },   // 底 1180（行54）→ 棚 -164（行12）
    { key: 'crown',    wT: 124, topY: -548, map: UG21_ROOM_CROWN },    // 床 **-164＝高層**
    { key: 'maw',      wT: 32,  topY: -548, map: UG21_ROOM_MAW, descend: true }, // 棚 -164 → 底 1180
    { key: 'sanctum',  wT: 138, topY:  796, map: UG21_ROOM_SANCTUM },  // 床 1180（店31=643／巨像123=735）
    { key: 'chamber',  wT: 40,  topY:  796, map: UG_ROOM_CHAMBER }     // 闘技場だけR7/R14と共用
];

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

// ═══════════════════════════════════════════════════════════════════
// 地底のレベルデータ ── 4周目（R28以降）「分水嶺」。1.611 で新規作成
// ═══════════════════════════════════════════════════════════════════
// ⚠ユーザー指定（2026-07-27）:「途中で同じ箇所で上と下に進める階段のような分岐」「能動的にどちらを
//   進むか選ぶ」「どちらかにしか進めないが最終的に収束する（**東名高速の分岐のような絶対に途中で
//   交われない感じ**）」「**R21のような『落ちて下側へ移動』もできない**」「難易度は今までで最高」「敵も多め」。
//
// ⚠**R21の亀裂との決定的な違い＝2本の道は岩盤で完全に仕切る**。
//   R21は上ルートの足場の隙間から下ルートへ落ちられた（＝失敗しても降格で済む設計）。
//   R28は**上ルートの床が隙間のない岩盤**で、間に最低928pxの岩が詰まっている＝物理的に移れない。
//   分岐は**中段の床にあいた2タイルの穴（列40-41）の1箇所だけ**:
//       跳び越える  → 上りの階段（7段）→ **高層(-164)のトンネル**
//       穴へ降りる  → 下りの階段（7段）→ **低層(1180)のトンネル**
//   2本は約90タイル並走し、列150の「合流の大広間」で**必ず低層(1180)に収束**する。
//
// ⚠部屋の並びの骨格も R7/R14/R21 と変えた: **高低差の主役を1つの部屋の中に入れた**
//   （R21までは部屋と部屋の間で高度を変えていた）。分水嶺は1部屋で高(-164)・中(508)・低(1180)の
//   3段すべてを内包する56行の部屋で、R7/R14/R21 に同種の部屋は無い。
// ⚠総幅は790タイルのまま（24+110+200+60+32+156+32+136+40）。店=643タイル目／巨像=735タイル目も同じ。
// ⚠敵の速度倍率は R28 で自動的に4.55倍（R21は3.50倍）。体数を増やしすぎると二重に効くので、
//   R21の84体に対して101体（+20%）に留めてある。

// ── 部屋1「墜落坑」 縦(降) 24タイル×35行 ─────────────────────────
// ⚠ギミックゼロ。落下線（列1〜2）の上にだけコインを置く。
var UG28_ROOM_PLUMMET = [].concat(
    ugRows(2, 24, '#', [[1, '   ']]),                                       // 0-1 天井の亀裂
    [ugRow(24, ' ', [[0, '#'], [23, '#']])],                                // 2
    [ugRow(24, ' ', [[0, '#'], [1, 'o'], [16, 'BBBB'], [23, '#']])],        // 3
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 4-5
    [ugRow(24, ' ', [[0, '#'], [6, 'BBB'], [23, '#']])],                    // 6
    [ugRow(24, ' ', [[0, '#'], [2, 'o'], [23, '#']])],                      // 7
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 8-9
    [ugRow(24, ' ', [[0, '#'], [17, 'BBBB'], [23, '#']])],                  // 10
    [ugRow(24, ' ', [[0, '#'], [1, 'o'], [23, '#']])],                      // 11
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 12-13
    [ugRow(24, ' ', [[0, '#'], [5, 'BB'], [23, '#']])],                     // 14
    [ugRow(24, ' ', [[0, '#'], [2, 'o'], [23, '#']])],                      // 15
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 16-17
    [ugRow(24, ' ', [[0, '#'], [18, 'BBB'], [23, '#']])],                   // 18
    [ugRow(24, ' ', [[0, '#'], [1, 'o'], [23, '#']])],                      // 19
    ugRows(2, 24, ' ', [[0, '#'], [23, '#']]),                              // 20-21
    // ⚠行22-31は**右壁を開ける**（＝鉱脈の道の空間 188〜476 と同じ高さ）
    ugRows(10, 24, ' ', [[0, '#']]),                                        // 22-31
    [ugRow(24, '#')],                                                       // 32 床 508（中層）
    ugRows(2, 24, '#')                                                      // 33-34 詰め物
);

// ── 部屋2「鉱脈の道」 横 110タイル×15行【中層 508】────────────────
// 火の玉＋バー＋トゲ。分水嶺の手前でリズムを作る。
var UG28_ROOM_VEINS = [].concat(
    ugRows(2, 110, '#'),                                                    // 0-1 天井
    ugRows(3, 110, ' '),                                                    // 2-4
    [ugRow(110, ' ', [[22, 'H'], [62, 'H'], [96, 'H']])],                   // 5 天井から下がる長いバー
    ugRows(2, 110, ' '),                                                    // 6-7
    [ugRow(110, ' ', [[14, 'o'], [30, 'o'], [46, 'o'], [62, 'o'], [78, 'o'], [94, 'o']])], // 8
    [ugRow(110, ' ', [[38, '2'], [86, '1']])],                              // 9 レモン缶／回復
    [ugRow(110, ' ', [[24, '====='], [56, '====='], [88, '=====']])],       // 10 逃げ場
    // 11: 噴出口／トゲ／床置きバー／敵
    [ugRow(110, ' ', [[10, 'f'], [28, 'e'], [44, 'f'], [60, 'e'], [76, 'f'], [100, 'e'],
                      [17, '^^'], [35, '^^'], [51, '^^'], [69, '^^'], [83, '^^'], [93, '^^'],
                      [6, 'G'], [40, 'F'], [72, 'G'], [106, 'F'],
                      [4, 'm'], [14, 'v'], [21, 'S'], [33, 'm'], [38, 'v'], [47, 'S'],
                      [55, 'm'], [64, 'v'], [73, 'd'], [80, 'm'], [88, 'S'], [96, 'v'],
                      [104, 'm'], [108, 'v']])],
    [ugRow(110, '#', [[10, 'LL'], [28, 'LLL'], [44, 'LL'], [60, 'LLL'], [76, 'LL'], [100, 'LLL']])], // 12 床
    ugRows(2, 110, '#', [[10, 'LL'], [28, 'LLL'], [44, 'LL'], [60, 'LLL'], [76, 'LL'], [100, 'LLL']])
);

// ── 部屋3「分水嶺」 200タイル×56行 ★上下分岐（絶対に交われない）─────
// ⚠56行を手で書くのは不可能なので**岩で全部埋めてから通路を彫る**方式で組む。
//   彫り方の要点: 各列について「上ルートの床(up)」と「下ルートの床(dn)」を決め、
//   上は 2〜up-1、下は max(up+3, dn-10)〜dn-1 を空ける。
//   ⚠**up+3** が肝＝上ルートの床の下には必ず3行以上の岩が残る＝**上から下へは絶対に落ちられない**。
function ug28BuildDivide() {
    var W = 200, ROWS = 56, R_UP = 11, R_MID = 32, R_LOW = 53, r, c;
    // 階段の段 [行, 開始列, 終了列]。⚠段差はすべて3行(96px)＝跳躍175pxに余裕
    var UP1 = [[29, 42, 44], [26, 45, 47], [23, 48, 50], [20, 51, 53], [17, 54, 56], [14, 57, 59]];
    var DN1 = [[35, 40, 44], [38, 45, 47], [41, 48, 50], [44, 51, 53], [47, 54, 56], [50, 57, 59]];
    // 合流の大広間（列150-177）で上ルートが降りてくる棚。
    // ⚠列153-154は**必ず空ける**＝そこに滝を落とすため（棚と重ねると滝が岩を消してしまう）
    var MERGE = [[11, 150, 152], [16, 155, 157], [22, 160, 162], [28, 165, 167], [34, 170, 172], [40, 175, 177]];
    var at = function (tbl, c, def) {
        for (var i = 0; i < tbl.length; i++) if (c >= tbl[i][1] && c <= tbl[i][2]) return tbl[i][0];
        return def;
    };
    var g = [];
    for (r = 0; r < ROWS; r++) { g.push(new Array(W)); for (c = 0; c < W; c++) g[r][c] = '#'; }
    var carve = function (r0, r1, col) {
        for (var rr = Math.max(2, r0); rr <= Math.min(ROWS - 4, r1); rr++) g[rr][col] = ' ';
    };
    for (c = 0; c < W; c++) {
        if (c <= 39) { carve(22, 31, c); continue; }               // 中段の通路（入口）＝床は行32
        if (c <= 41) { carve(22, 34, c); }                          // ★分岐の穴（2タイル・ここだけ上下が通じる）
        if (c >= 150 && c <= 177) { carve(2, 52, c); continue; }    // 合流の大広間（棚は後で戻す）
        if (c >= 178) { carve(43, 52, c); continue; }               // 合流後の低層の通路
        var up = (c <= 41) ? null : (c <= 59 ? at(UP1, c, 29) : R_UP);
        var dn = (c <= 59) ? at(DN1, c, 35) : R_LOW;
        if (up !== null) carve(2, up - 1, c);                        // 上ルートの空間
        carve(Math.max((up === null ? 22 : up + 3), dn - 10), dn - 1, c);  // 下ルートの空間
    }
    for (var i = 0; i < MERGE.length; i++)                           // 合流の棚を岩で戻す
        for (c = MERGE[i][1]; c <= MERGE[i][2]; c++) for (r = MERGE[i][0]; r < MERGE[i][0] + 3; r++) g[r][c] = '#';
    // ── 飾り・ギミック・敵 [行, 列, 文字] ──
    var deco = [
        // 【入口の中段】バー2・トゲ2組・敵5
        [31, 12, 'G'], [31, 28, 'F'], [31, 18, '^'], [31, 19, '^'], [31, 34, '^'], [31, 35, '^'],
        [27, 8, 'o'], [27, 22, 'o'], [27, 36, 'o'], [29, 24, '1'],
        [31, 5, 'm'], [31, 15, 'v'], [31, 24, 'S'], [31, 31, 'm'], [31, 38, 'v'],
        // ★分岐の道しるべ: 穴（列40-41）の中にコインを2枚置いて「下も道である」と絵で伝える。
        //   ⚠中段に立つとカメラy=154＝画面の下端は worldY 604＝下りの1段目(604)がぎりぎり見える高さ。
        //   R21の亀裂は672px落ちて底が見えなかったが、こちらは**96pxの段差**なので階段だと分かる。
        [33, 40, 'o'], [34, 41, 'o'],
        // 【上ルート＝高層のトンネル】細い足場は無いが、天井バーと火の玉で密度を上げる
        [4, 70, 'H'], [4, 92, 'H'], [4, 114, 'H'], [4, 136, 'H'],
        // ⚠1.613 是正: 火の玉の噴出口は**必ずマグマの上**に置く（ユーザー指摘「火の玉はマグマから
        //   出てくるのが絶対」）。上ルートには溶岩が無いまま噴出口だけ置いてしまっていた。
        //   ⚠溶岩は**床の一番上の行(11)だけ**に入れる。行12-13は岩のまま残す＝上ルートの床は
        //   依然として塞がっており、**下ルートへ落ちることはできない**（この面の前提）。
        [10, 66, 'e'], [10, 88, 'f'], [10, 110, 'e'], [10, 132, 'f'],
        [10, 78, '^'], [10, 79, '^'], [10, 100, '^'], [10, 101, '^'], [10, 122, '^'], [10, 123, '^'],
        [7, 64, 'o'], [7, 84, 'o'], [7, 104, 'o'], [7, 124, 'o'], [7, 144, 'o'], [8, 96, '3'], [8, 130, '1'],
        [10, 62, 'v'], [10, 70, 'm'], [10, 74, 'S'], [10, 86, 'v'], [10, 92, 'm'], [10, 96, 'v'],
        [10, 106, 'm'], [10, 116, 'S'], [10, 120, 'd'], [10, 128, 'S'], [10, 136, 'v'],
        [10, 140, 'm'], [10, 146, 'v'],
        // 【下ルート＝低層のトンネル】床置きバー・トゲ・裂け目・敵を上より濃く
        [52, 68, 'F'], [52, 90, 'G'], [52, 112, 'F'], [52, 134, 'G'],
        [52, 64, '^'], [52, 65, '^'], [52, 82, '^'], [52, 83, '^'], [52, 98, '^'], [52, 99, '^'],
        [52, 106, '^'], [52, 107, '^'], [52, 124, '^'], [52, 125, '^'], [52, 142, '^'], [52, 143, '^'],
        [49, 62, 'o'], [49, 78, 'o'], [49, 94, 'o'], [49, 118, 'o'], [49, 138, 'o'],
        [50, 88, '4'], [50, 130, '1'],
        [52, 61, 'm'], [52, 71, 'S'], [52, 76, 'v'], [52, 86, 'm'], [52, 94, 'S'], [52, 102, 'v'],
        [52, 116, 'm'], [52, 120, 'd'], [52, 128, 'S'], [52, 138, 'v'], [52, 146, 'm'],
        // 【合流の大広間・その先】⚠コインは**必ず棚の真上の列**に置く（棚の外に置くと取れない）
        [10, 151, 'o'], [15, 156, 'o'], [21, 161, 'o'], [27, 166, 'o'], [33, 171, 'o'], [39, 176, 'o'],
        [52, 155, 'm'], [52, 162, 'v'], [52, 168, 'S'], [52, 174, 'm'], [52, 180, 'v'], [52, 190, 'm'],
        [52, 186, 'F'], [52, 194, '^'], [52, 195, '^'], [49, 184, 'o'], [49, 196, 'o']
    ];
    for (i = 0; i < deco.length; i++) g[deco[i][0]][deco[i][1]] = deco[i][2];
    // ── 滝（'w'・**演出専用**／ユーザー指定「ただの演出でありギミックではない」）──
    //   [行の始まり, 行の終わり, 列の始まり, 列の終わり]。⚠**空間('　')の上にだけ置く**＝岩を消さない。
    //   ①入口の中段（列20-21）＝分岐の前なので**どちらのルートを選ぶ人にも必ず見える**
    //   ②合流の大広間（列153-154）＝天井から低層の床まで1,600px落ちる大滝。上ルートは**滝を突き抜けて降りる**
    // ⚠1.616: 上ルートのマグマ溜まり。**行11-13の3行(96px)を掘る**。
    //   1.613で行11の1行だけにしたら「浅すぎて皿にしか見えない」「下が岩で繋がっているので
    //   敵が穴と認識せず溶岩の上に立ってしまう」の2点が実機で不可となった（ユーザー報告）。
    //   3行掘れば地形に穴が空くので 'm'/'S' の穴回避が効く。
    //   ⚠さらに1.618で**行11〜24（448px）まで掘り下げた**。3行(96px)だと、上りの階段から横に見たとき
    //   **マグマのすぐ下に岩が見えてしまい「浴槽」に読める**（ユーザー実機報告「どう見ても浅すぎる」）。
    //   448pxは画面の高さ450pxより深いので、どこから見ても底が見えない＝岩を割って走るマグマの脈になる。
    //   ⚠それでも**行25〜42（576px）の岩が残る**ので、上ルートの床は塞がったまま＝下ルートへは落ちられない。
    var LAVA = [[11, 24, 66, 67], [11, 24, 88, 89], [11, 24, 110, 111], [11, 24, 132, 133]];
    for (i = 0; i < LAVA.length; i++)
        for (r = LAVA[i][0]; r <= LAVA[i][1]; r++)
            for (c = LAVA[i][2]; c <= LAVA[i][3]; c++) g[r][c] = 'L';
    var FALLS = [[22, 31, 20, 21], [2, 52, 153, 154]];
    for (i = 0; i < FALLS.length; i++)
        for (r = FALLS[i][0]; r <= FALLS[i][1]; r++)
            for (c = FALLS[i][2]; c <= FALLS[i][3]; c++) if (g[r][c] === ' ') g[r][c] = 'w';
    var out = [];
    for (r = 0; r < ROWS; r++) out.push(g[r].join(''));
    return out;
}
var UG28_ROOM_DIVIDE = ug28BuildDivide();

// ── 部屋4「合流の底」 横 60タイル×15行【低層 1180】──────────────
var UG28_ROOM_CONFLUX = [].concat(
    ugRows(2, 60, '#'),                                                     // 0-1 天井
    ugRows(5, 60, ' '),                                                     // 2-6
    [ugRow(60, ' ', [[12, 'o'], [28, 'o'], [44, 'o']])],                    // 7
    [ugRow(60, ' ')],                                                       // 8
    [ugRow(60, ' ', [[34, '4']])],                                          // 9 エナジー
    [ugRow(60, ' ', [[18, '====='], [46, '=====']])],                       // 10 逃げ場
    [ugRow(60, ' ', [[8, 'F'], [40, 'G'], [23, '^^'], [50, '^^'], [30, 'MM'], [32, 'f'],
                      [4, 'm'], [14, 'S'], [20, 'v'], [27, 'm'], [37, 'S'], [44, 'v'],
                      [54, 'm'], [57, 'v']])],                              // 11
    [ugRow(60, '#', [[30, 'LLL']])],                                        // 12 床
    ugRows(2, 60, '#', [[30, 'LLL']])
);

// ── 部屋5「灼熱の昇り」 縦(登) 32タイル×57行【低1180→高-164】────
// ⚠1,344pxを11段で登る。動く床3枚＋バー5本。底(列8以降)は溶岩＝落ちたらチェックポイント復帰。
var UG28_ROOM_ASCENT = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[0, '#']]),                                        // 2-11 右は開放（玄室へ）
    [ugRow(32, ' ', [[0, '#'], [26, '######']])],                           // 12   出口の棚（＝玄室の床 -164）
    ugRows(2, 32, ' ', [[0, '#'], [29, '###']]),                            // 13-14
    [ugRow(32, ' ', [[0, '#'], [21, '====='], [31, '#']])],                 // 15   L11
    [ugRow(32, ' ', [[0, '#'], [26, 'v'], [31, '#']])],                     // 16
    [ugRow(32, ' ', [[0, '#'], [21, '1'], [31, '#']])],                     // 17   回復（L10の真上）
    [ugRow(32, ' ', [[0, '#'], [20, 'MMMM'], [31, '#']])],                  // 18   L10＝動く床
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 19
    [ugRow(32, ' ', [[0, '#'], [23, 'G'], [31, '#']])],                     // 20   バー
    [ugRow(32, ' ', [[0, '#'], [19, 'o'], [31, '#']])],                     // 21   コイン（L9の真上）
    [ugRow(32, ' ', [[0, '#'], [18, '====='], [31, '#']])],                 // 22   L9
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 23-24
    [ugRow(32, ' ', [[0, '#'], [17, 'MMMM'], [31, '#']])],                  // 25   L8＝動く床
    [ugRow(32, ' ', [[0, '#'], [27, 'd'], [31, '#']])],                     // 26
    [ugRow(32, ' ', [[0, '#'], [20, 'F'], [31, '#']])],                     // 27   バー
    [ugRow(32, ' ', [[0, '#'], [16, 'o'], [31, '#']])],                     // 28   コイン（L7の真上）
    [ugRow(32, ' ', [[0, '#'], [15, '====='], [31, '#']])],                 // 29   L7
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 30-31
    [ugRow(32, ' ', [[0, '#'], [13, '====='], [31, '#']])],                 // 32   L6
    [ugRow(32, ' ', [[0, '#'], [24, 'v'], [31, '#']])],                     // 33
    [ugRow(32, ' ', [[0, '#'], [17, 'G'], [31, '#']])],                     // 34   バー
    [ugRow(32, ' ', [[0, '#'], [12, '4'], [31, '#']])],                     // 35   エナジー（L5の真上）
    [ugRow(32, ' ', [[0, '#'], [11, 'MMMM'], [31, '#']])],                  // 36   L5＝動く床
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 37-38
    [ugRow(32, ' ', [[0, '#'], [9, '====='], [31, '#']])],                  // 39   L4
    [ugRow(32, ' ', [[0, '#'], [31, '#']])],                                // 40
    [ugRow(32, ' ', [[0, '#'], [14, 'F'], [31, '#']])],                     // 41   バー
    [ugRow(32, ' ', [[0, '#'], [9, 'o'], [31, '#']])],                      // 42   コイン（L3の真上）
    [ugRow(32, ' ', [[0, '#'], [7, '====='], [31, '#']])],                  // 43   L3
    // ⚠行44-53は**左壁を開ける**（＝合流の底の空間 860〜1148）
    [ugRow(32, ' ', [[20, 'v'], [31, '#']])],                               // 44
    [ugRow(32, ' ', [[31, '#']])],                                          // 45
    [ugRow(32, ' ', [[5, '====='], [31, '#']])],                            // 46   L2
    [ugRow(32, ' ', [[31, '#']])],                                          // 47
    [ugRow(32, ' ', [[11, 'G'], [31, '#']])],                               // 48   バー
    [ugRow(32, ' ', [[5, 'o'], [31, '#']])],                                // 49   コイン（L1の真上）
    [ugRow(32, ' ', [[3, '====='], [31, '#']])],                            // 50   L1
    ugRows(2, 32, ' ', [[31, '#']]),                                        // 51-52
    [ugRow(32, ' ', [[4, 'S'], [31, '#']])],                                // 53   底のシャレコ
    ugRows(3, 32, '#', [[8, ugRep('L', 24)]])                               // 54-56 床（列8以降は溶岩）
);

// ── 部屋6「玄室の冠」 横 156タイル×15行【高層 -164・最難関】───────
var UG28_ROOM_CROWN = [].concat(
    ugRows(2, 156, '#'),                                                    // 0-1 天井
    ugRows(3, 156, ' '),                                                    // 2-4
    [ugRow(156, ' ', [[12, 'H'], [38, 'H'], [64, 'H'], [90, 'H'], [116, 'H'], [142, 'H']])], // 5
    ugRows(2, 156, ' '),                                                    // 6-7
    [ugRow(156, ' ', [[18, 'o'], [42, 'o'], [54, '1'], [68, 'o'], [94, 'o'], [118, 'o'], [146, 'o']])], // 8
    [ugRow(156, ' ', [[24, '====='], [50, '====='], [76, '====='], [102, '====='], [128, '=====']])], // 9 逃げ場
    [ugRow(156, ' ', [[8, '4'], [26, 'o'], [52, 'o'], [78, 'o'], [104, 'o'], [130, 'o']])], // 10
    // 11: 床置きバー6・トゲ8組・動く床2・噴出口2・敵26
    [ugRow(156, ' ', [[10, 'F'], [34, 'G'], [58, 'F'], [82, 'G'], [108, 'F'], [134, 'G'],
                      [16, '^^'], [30, '^^'], [44, '^^'], [62, '^^'], [70, '^^'], [88, '^^'],
                      [112, '^^'], [138, '^^'],
                      [22, 'MMM'], [96, 'MMM'], [66, 'f'], [124, 'e'],
                      [4, 'm'], [12, 'v'], [20, 'S'], [26, 'm'], [36, 'v'], [40, 'd'],
                      [48, 'm'], [54, 'S'], [60, 'v'], [74, 'm'], [80, 'S'], [86, 'v'],
                      [92, 'm'], [100, 'v'], [106, 'm'], [116, 'S'], [120, 'v'], [128, 'm'],
                      [132, 'd'], [140, 'v'], [144, 'm'], [148, 'S'], [152, 'v']])],
    [ugRow(156, '#', [[22, 'LLL'], [66, 'LL'], [96, 'LLL'], [124, 'LL']])], // 12 床
    ugRows(2, 156, '#', [[22, 'LLL'], [66, 'LL'], [96, 'LLL'], [124, 'LL']])
);

// ── 部屋7「顎の縦坑」 縦(降) 32タイル×57行【高-164→低1180】───────
// ⚠底は列0-23が溶岩・列24-31だけが着地点。⚠火の玉は置かない（降下中は周期を読めない）。
var UG28_ROOM_GULLET = [].concat(
    ugRows(2, 32, '#'),                                                     // 0-1  天井
    ugRows(10, 32, ' ', [[31, '#']]),                                       // 2-11 左は開放（玄室から入る）
    [ugRow(32, ' ', [[0, '#######'], [31, '#']])],                          // 12   入口の棚（-164）
    ugRows(2, 32, ' ', [[0, '###'], [31, '#']]),                            // 13-14
    [ugRow(32, ' ', [[0, '#'], [6, '^'], [31, '#']])],                      // 15   トゲ（D1の上）
    [ugRow(32, ' ', [[0, '#'], [4, '====='], [31, '#']])],                  // 16   D1
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 17-18
    [ugRow(32, ' ', [[0, '#'], [14, 'G'], [24, 'v'], [31, '#']])],          // 19   バー
    [ugRow(32, ' ', [[0, '#'], [8, 'o'], [31, '#']])],                      // 20   コイン（D2の上）
    [ugRow(32, ' ', [[0, '#'], [6, '====='], [31, '#']])],                  // 21   D2
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 22-23
    [ugRow(32, ' ', [[0, '#'], [10, '^^'], [13, 'S'], [31, '#']])],         // 24   トゲ＋シャレコ（D3の上）
    [ugRow(32, ' ', [[0, '#'], [9, '====='], [31, '#']])],                  // 25   D3
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 26-27
    [ugRow(32, ' ', [[0, '#'], [18, 'F'], [31, '#']])],                     // 28   バー
    [ugRow(32, ' ', [[0, '#'], [13, 'o'], [31, '#']])],                     // 29   コイン（D4の上）
    [ugRow(32, ' ', [[0, '#'], [11, 'MMMM'], [31, '#']])],                  // 30   D4＝動く床
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 31-32
    [ugRow(32, ' ', [[0, '#'], [15, '4'], [26, 'v'], [31, '#']])],          // 33   エナジー（D5の上）
    [ugRow(32, ' ', [[0, '#'], [13, '====='], [31, '#']])],                 // 34   D5
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 35-36
    [ugRow(32, ' ', [[0, '#'], [22, 'G'], [31, '#']])],                     // 37   バー
    [ugRow(32, ' ', [[0, '#'], [18, 'o'], [31, '#']])],                     // 38   コイン（D6の上）
    [ugRow(32, ' ', [[0, '#'], [16, '====='], [31, '#']])],                 // 39   D6
    ugRows(2, 32, ' ', [[0, '#'], [31, '#']]),                              // 40-41
    [ugRow(32, ' ', [[0, '#'], [27, 'd'], [31, '#']])],                     // 42
    [ugRow(32, ' ', [[0, '#'], [18, 'MMMM'], [31, '#']])],                  // 43   D7＝動く床
    // ⚠行44-53は**右壁を開ける**（＝参道の空間 860〜1148）
    [ugRow(32, ' ', [[0, '#'], [26, 'F']])],                                // 44   バー
    [ugRow(32, ' ', [[0, '#']])],                                           // 45
    [ugRow(32, ' ', [[0, '#'], [22, '^'], [24, '1']])],                     // 46   トゲ＋回復（D8の上）
    [ugRow(32, ' ', [[0, '#'], [20, '=====']])],                            // 47   D8 ⚠動く床の直後は静止した足場
    ugRows(2, 32, ' ', [[0, '#']]),                                         // 48-49
    [ugRow(32, ' ', [[0, '#'], [26, 'o']])],                                // 50   コイン（D9の上）
    [ugRow(32, ' ', [[0, '#'], [24, '=====']])],                            // 51   D9 ⚠着地点(列24-31)の真上
    [ugRow(32, ' ', [[0, '#'], [28, 'S']])],                                // 52
    [ugRow(32, ' ', [[0, '#']])],                                           // 53
    ugRows(3, 32, '#', [[0, ugRep('L', 24)]])                               // 54-56 床（列0-23は溶岩）
);

// ── 部屋8「参道」 横 136タイル×15行【低層 1180】────────────────────
// ⚠店 = 開始614 + 列29 = **643タイル目**／巨像 = 614 + 列121 = **735タイル目**（R7/R14/R21と同一）
// ⚠列117〜125には石を置かない＝巨像の正面を壁龕にする。店の入口(列27〜33)と門の先(列100〜)も無風。
var UG28_ROOM_SANCTUM = [].concat(
    ugRows(2, 136, '#'),                                                    // 0-1 天井
    ugRows(3, 136, ' '),                                                    // 2-4
    [ugRow(136, ' ', [[101, 'bbbb'], [109, 'bbbbbb'], [126, 'bbbbbbbbbb']])], // 5 門のまぐさ
    ugRows(2, 136, ' ', [[111, 'bb'], [134, 'bb']]),                        // 6-7 門柱
    [ugRow(136, ' ', [[38, 'o'], [39, 'o'], [40, 'o'], [86, 'o'], [87, 'o'],
                      [111, 'bb'], [134, 'bb']])],                          // 8
    [ugRow(136, ' ', [[111, 'bb'], [134, 'bb']])],                          // 9
    [ugRow(136, ' ', [[10, 'F'], [111, 'bb'], [134, 'bb']])],               // 10 店より手前のギミック①
    [ugRow(136, ' ', [[134, 'bb'], [22, '^^'], [6, 'S'], [18, 'm'], [29, 'W'], [42, 'v'],
                      [54, 'm'], [64, 'S'], [76, 'v'], [86, 'm'],
                      [121, 'I'],
                      [48, 'i'], [72, 'i'], [88, 'i'], [96, 'i'], [102, 'i'], [106, 'i'],
                      [110, 'i'], [113, 'i'], [127, 'i'], [129, 'i'], [131, 'i'], [133, 'i']])], // 11
    [ugRow(136, '#', [[14, 'f ']])],                                        // 12 床（ギミック②裂け目）
    ugRows(2, 136, '#', [[14, 'LL']])                                       // 13-14
);

// R28以降の部屋の並び。⚠合計 24+110+200+60+32+156+32+136+40 = **790タイル**
var UG28_LEVEL_ROOMS = [
    { key: 'plummet', wT: 24,  topY: -516, map: UG28_ROOM_PLUMMET, descend: true }, // 床 508（行32）
    { key: 'veins',   wT: 110, topY:  124, map: UG28_ROOM_VEINS },    // 床 508（中層）
    { key: 'divide',  wT: 200, topY: -516, map: UG28_ROOM_DIVIDE },   // ★中508 →（上下分岐）→ 低1180
    { key: 'conflux', wT: 60,  topY:  796, map: UG28_ROOM_CONFLUX },  // 床 1180
    { key: 'ascent',  wT: 32,  topY: -548, map: UG28_ROOM_ASCENT },   // 底 1180（行54）→ 棚 -164（行12）
    { key: 'crown',   wT: 156, topY: -548, map: UG28_ROOM_CROWN },    // 床 -164（高層・最難関）
    { key: 'gullet',  wT: 32,  topY: -548, map: UG28_ROOM_GULLET, descend: true }, // 棚 -164 → 底 1180
    { key: 'sanctum', wT: 136, topY:  796, map: UG28_ROOM_SANCTUM },  // 床 1180（店29=643／巨像121=735）
    { key: 'chamber', wT: 40,  topY:  796, map: UG_ROOM_CHAMBER }     // 闘技場だけ共用
];

// そのラウンドで使う部屋の並びを返す（1.599 R14／1.610 R21／1.611 R28）。⚠**総幅はどれも790タイル**なので、
// どれを選んでもカメラ走行(UG_TRAVEL_PX)も距離加算も変わらない＝ランキングの前提は不変。
// R7=1周目／R14=2周目／R21=3周目／R28以降=4周目（5周目以降も当面R28を使い回す）。
function ugRoomsForRound(round) {
    if (round >= 28) return UG28_LEVEL_ROOMS;
    if (round >= 21) return UG21_LEVEL_ROOMS;
    return (round >= 14) ? UG14_LEVEL_ROOMS : UG_LEVEL_ROOMS;
}

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
        icon: '🍡', iconImg: 'images/icon_ug_manju.png', price: 12000, maxPerVisit: 2, ugOnly: true,   // 9,000→12,000（1.583・ユーザー決定）
        effect: function() { gameState.lives = Math.min(gameState.lives + 3, 10); }
    },
    {
        // 老婆の劇薬: 30秒間、エナジー弾と同じ攻撃を撃てる（ダメージは1＝エナジー弾2の半分）。
        // ⚠エナジー缶(dmg2)を持っている間はそちらが優先される（updateBullets の分岐順）。重ねて撃たない。
        // ⚠**ストックアイテム**（1.583でユーザー指摘により修正）。買った瞬間に発動していたため、
        //   店を出た時点で30秒が始まり、ボスに着く前に切れて意味が無かった。
        //   barrier / lemon_special と同じ stockItem 方式にして、**好きなタイミングで発動**できるようにする。
        id: 'ug_elixir', nameKey: 'shop_item_ug_elixir', descKey: 'shop_item_ug_elixir_desc',
        // ⚠stockItem にするなら iconImg が必須。updateStockUI の iconFor は iconImg が無いと **'?' を出す**
        icon: '⚗️', iconImg: 'images/icon_ug_elixir.png', price: 10000, maxPerVisit: 2, ugOnly: true,   // 8,000→10,000（1.583・ユーザー決定）
        stockItem: true,
        stockEffect: function() { gameState.ugElixir = (gameState.ugElixir || 0) + UG_ELIXIR_FRAMES; }
    },
    {
        // 地底の主の加護（永続）: 以後、地底に入るときライフ+2で始まる。
        // ⚠タイトルショップ/エッグ交換とまったく同じ仕組み＝gameSettings.upgrades に1件積んで saveSettings。
        //   **地底でしか買えず地底でしか効かない**ので、既存の恒久商品（ポーチ/コインマスター等）と食い合わない。
        // ⚠買い切り。所持後は stageShopLineup が陳列から外す（maxPerVisit は訪問ごとの制限なので再訪で復活してしまう）。
        id: 'ug_blessing', nameKey: 'shop_item_ug_blessing', descKey: 'shop_item_ug_blessing_desc',
        icon: '👁', iconImg: 'images/icon_ug_blessing.png', price: 200000, maxPerVisit: 1, ugOnly: true,
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
    // ⚠フィールドのドロップ品は **sprite でゲーム内の実物を指すこと**（1.578で修正）。
    //   従来は img に「同じ効果を持つショップ品のアイコン」を当てていたため、図鑑の絵と拾える物の絵が
    //   別物になっていた（レモン=レモンの実 vs 実物は黄色い缶／シールド=盾の紋章 vs 実物は青い円形バリア／
    //   マグネット=U字磁石 vs 実物は赤青の棒磁石／エナジー=星 vs 実物はオレンジの球）。
    //   sprite を指定すると zukanThumb が spriteManager の実フレームを描くので、
    //   **今後アートを差し替えても図鑑が自動で追随する**（img は読み込み前のフォールバックとして残す）。
    //   ⚠マグネットは buildMagnet() の手続き生成でPNGが存在しない＝sprite 指定でしか正しく出せない。
    { id: 'item:heart',      cat: 'item', nameKey: 'zukan_i_heart',  descKey: 'zukan_i_heart_d',  sprite: 'powerup_heart',  img: 'images/item_heart.png' },
    // ⚠1.580で決着（ユーザー決定）: 図鑑に合わせて**ゲーム側をゴールドに差し替えた**（sprites.js の coin_spin）。
    //   他のドロップ品と同じく sprite で実物を指すので、以後どちらを差し替えても自動で一致する。
    { id: 'item:coin',       cat: 'item', nameKey: 'zukan_i_coin',   descKey: 'zukan_i_coin_d',   sprite: 'coin_spin', img: 'images/icon_money.png' },
    { id: 'item:lemon',      cat: 'item', nameKey: 'zukan_i_lemon',  descKey: 'zukan_i_lemon_d',  sprite: 'powerup_lemon',  img: 'images/item_lemon.png' },
    { id: 'item:shield',     cat: 'item', nameKey: 'zukan_i_shield', descKey: 'zukan_i_shield_d', sprite: 'powerup_shield', img: 'images/item_shield.png' },
    { id: 'item:energy',     cat: 'item', nameKey: 'zukan_i_energy', descKey: 'zukan_i_energy_d', sprite: 'powerup_energy', img: 'images/item_energy.png' },
    { id: 'item:magnet',     cat: 'item', nameKey: 'zukan_i_magnet', descKey: 'zukan_i_magnet_d', sprite: 'powerup_magnet', img: 'images/icon_magnet_boost.png' },
    { id: 'item:golden_egg', cat: 'item', nameKey: 'zukan_i_egg',    descKey: 'zukan_i_egg_d',    img: 'images/item_golden_egg.png' },
    // ── アイテム：ステージショップ（購入で発見・既存の説明文を流用）──
    { id: 'item:heal',          cat: 'item', nameKey: 'shop_item_heal',       descKey: 'shop_item_heal_desc',       img: 'images/icon_heal.png' },
    { id: 'item:shortcake',     cat: 'item', nameKey: 'shop_item_shortcake',  descKey: 'shop_item_shortcake_desc',  img: 'images/icon_shortcake.png' }, // チュートリアルショップ限定（いちごショート・購入で発見／HP+1）
    { id: 'item:heal_stock',    cat: 'item', nameKey: 'shop_item_heal_stock', descKey: 'shop_item_heal_stock_desc', img: 'images/icon_heal_stock.png' },
    { id: 'item:barrier',       cat: 'item', nameKey: 'shop_item_barrier',    descKey: 'shop_item_barrier_desc',    img: 'images/icon_barrier.png' },
    { id: 'item:lemon_special', cat: 'item', nameKey: 'shop_item_lemon',      descKey: 'shop_item_lemon_desc',      img: 'images/icon_lemon_special.png' },
    { id: 'item:full_charge',   cat: 'item', nameKey: 'shop_item_fullcharge', descKey: 'shop_item_fullcharge_desc', img: 'images/icon_full_charge.png' },
    { id: 'item:revive_potion', cat: 'item', nameKey: 'shop_item_revive',     descKey: 'shop_item_revive_desc',     img: 'images/icon_revive_potion.png' },
    // ── アイテム：地底「怪しい老婆の店」の専用3品（1.578でアイコン作成・1.579で図鑑に登録）──
    // ⚠発見の記録は既に動いている: buyStageItem の markZukanSeen('item:' + itemId) が共通経路にあるため、
    //   1.569の実装当時から購入のたびに 'item:ug_manju' 等が記録されていた。**ここに項目が無かっただけ**で、
    //   図鑑の赤いNEWバッジだけ点いて中身が無い状態になっていた（1.575の監査でも指摘済み）。
    { id: 'item:ug_manju',    cat: 'item', nameKey: 'shop_item_ug_manju',    descKey: 'shop_item_ug_manju_desc',    img: 'images/icon_ug_manju.png' },
    { id: 'item:ug_elixir',   cat: 'item', nameKey: 'shop_item_ug_elixir',   descKey: 'shop_item_ug_elixir_desc',   img: 'images/icon_ug_elixir.png' },
    // ⚠加護は買い切りの永続品なので、下の永続アップグレード群と同じく seenIf も付ける
    //   （1.579より前に購入済みのプレイヤーも、遡って発見済みとして扱う）。
    { id: 'item:ug_blessing', cat: 'item', nameKey: 'shop_item_ug_blessing', descKey: 'shop_item_ug_blessing_desc', img: 'images/icon_ug_blessing.png', seenIf: function(gs){ return ((gs.upgrades || {}).ug_blessing || 0) > 0; } },
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
    { id: 'biome:bonus',     cat: 'biome', nameKey: 'zukan_bio_bonus',  descKey: 'zukan_bio_bonus_d' },
    // 地底ステージ（R7/R14/R21…・1.579で追加）。⚠地上の5バイオームと違い ZUKAN_BIOME_NAMES には入れない。
    //   あの配列は getBiomeIndex（草原→砂漠→雪山→夜の巡回）と1対1で対応しており、足すと巡回自体が壊れる。
    //   発見の記録は enterUnderground の markZukanSeen、サムネは drawStageThumb の専用分岐（bonus と同じ作法）。
    { id: 'biome:underground', cat: 'biome', nameKey: 'zukan_bio_underground', descKey: 'zukan_bio_underground_d' }
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
