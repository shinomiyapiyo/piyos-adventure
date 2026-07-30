#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 土管ボーナス部屋 レイアウト検証ツール（1.692時点で追加・ゲーム側のコード変更なし）
//   使い方: node tools/pipe-room-layout-check.mjs [treasure|coin|potion|heal|lucky]
//           （省略時は全タイプ／--trials=N で試行回数・既定200／--selftest で自己テスト）
//
// ⚠**部屋の中身（gameplay.js の build*Room / initPipeRoom）を触ったら必ずこれを通すこと。**
//   1.690 で「コインの間の山型の頂点」と「ゴールデンエッグ(1%)」が同じ高さ帯に置かれていて、
//   **当たりがコイン3〜4枚に埋もれて見えない**状態が長く残っていた。目視では気づけなかった。
//   地底に ug-layout-check.mjs があるのと同じ役目を、地上の部屋にも用意する。
//
// 【何を確かめるか】gameplay.js の initPipeRoom() を**実物のまま**VMで呼び、置かれた報酬について:
//   ① 重なり     … 報酬どうしが AABB で重なっていないか（見えない/どちらを取ったか分からない）
//   ② 到達可否   … 床から跳んで体が届く高さか（届かない＝実質ハズレ）
//   ③ 部屋の外   … 左右の壁の内側か／出口(横)土管に重なっていないか
//   ④ 宝箱の踏み … ラッキーの間の宝箱が「上から踏む」で必ず開く高さか（落下の1フレーム跳びを跨げるか）
//   プレイヤーの状態（ストック/ポーチの空き・ライフ）で中身が変わる部屋があるので、
//   代表的な組み合わせ×乱数試行で総当たりする。
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ONLY = args.find(a => !a.startsWith('--')) || null;
const TRIALS = Number((args.find(a => a.startsWith('--trials=')) || '').split('=')[1]) || 200;
const SELFTEST = args.includes('--selftest');

// ── VM: core-state.js + gameplay.js を実物のまま読む（index.html 側の関数はスタブ） ──
const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const sandbox = {
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat, Boolean,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 },
    GROUND_Y: 348,                                  // ⚠index.html の値を写したもの（VMには読み込まない）
    // index.html / render.js 側の関数はここで無害化する（部屋の生成が触るものだけ）
    t: (k) => k, escapeHtml: (s) => s, markZukanSeen: () => {}, gainScore: () => {},
    updateStockUI: () => {}, saveSettings: () => {}, showRewardToast: () => {},
    spawnLifeUpEffect: () => {}, spawnGoldenEggEffect: () => {}, spawnChestRewardEffect: () => {},
    collectGoldenEgg: () => {}, getDateString: () => '2000-01-01', canDrawDailyEggToday: () => false,
    isFlatGroundAt: () => true, soundManager: null, bgCache: null, uiElements: {}, prevUI: {},
    aabb: (a, b) => (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y)
};
const ctx = vm.createContext(new Proxy(sandbox, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
for (const f of ['core-state.js', 'gameplay.js'])
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

const K = (expr) => vm.runInContext(expr, ctx);
K('gameSettings = { zukan: { seen: {}, kills: {}, new: {} }, pouchLevel: 0, upgrades: {}, permaStock: [] };');
K('tutorialState.active = false;');

const GAME_WIDTH   = K('GAME_WIDTH');
const FLOOR_Y      = K('PIPE_ROOM_FLOOR_Y');
const WALL_W       = K('PIPE_ROOM_WALL_W');
const EXIT_X       = K('pipeRoomExitX()');
const JUMP_FORCE   = K('JUMP_FORCE');
const GRAVITY      = K('GRAVITY');
const PLAYER_W     = K('player.width');
const PLAYER_H     = K('player.height');
const CHEST_H      = K('LUCKY_CHEST_H');
const ROOM_IDS     = K('ROOM_TYPES.map(function(r){return r.id;})');

// ── 床から跳んだ時の「体が通る帯」を、部屋の物理そのままで積分して出す ──
//    （updatePipeRoom: velY += GRAVITY → 上限15 → y += velY／床で停止）
function jumpBand() {
    let y = FLOOR_Y - PLAYER_H, velY = JUMP_FORCE, top = y, maxFall = 0;
    for (let i = 0; i < 240; i++) {
        velY += GRAVITY; if (velY > 15) velY = 15;
        y += velY;
        if (velY > maxFall) maxFall = velY;
        if (y + PLAYER_H >= FLOOR_Y) break;          // 着地
        if (y < top) top = y;
    }
    return { headTop: top, maxFallStep: maxFall };   // headTop = 頭の最高到達（画面座標の最小y）
}
const { headTop, maxFallStep } = jumpBand();

const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
// 重なりの面積比（小さい方の面積に対する割合）
function overlapRatio(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}
// ⚠**同種どうしの軽い重なりは仕様**（コインは29px間隔×32px幅の密な列/山型でそう見せている）。
//   問題になるのは「別種が重なって、何を得たのか分からなくなる」場合（1.690のコイン×エッグ）。
//   同種は「ほぼ完全に重なっている（=1枚に見える）」時だけ拾う。
const SAME_TYPE_TOLERANCE = 0.6;
function isBadOverlap(a, b) {
    if (!overlap(a, b)) return false;
    if (a.type === b.type && a.itemId === b.itemId) return overlapRatio(a, b) > SAME_TYPE_TOLERANCE;
    return true;
}

// プレイヤーの状態パターン（部屋の中身が状態で変わるので総当たりする）
const STATES = [
    { label: 'ストック空き3・ライフ5',        maxSlots: 3, pouch: 0, items: 0, lives: 5 },
    { label: 'ストック満杯(3/3)・ライフ10',   maxSlots: 3, pouch: 0, items: 3, lives: 10 },
    { label: '全枠ポーチ(6/6)・ライフ5',      maxSlots: 6, pouch: 6, items: 0, lives: 5 },
    { label: 'ポーチ3+通常3空き・ライフ7',    maxSlots: 6, pouch: 3, items: 0, lives: 7 }
];

function buildRoom(typeId, st, forceEgg) {
    K(`stockState.maxSlots = ${st.maxSlots}; gameSettings.pouchLevel = ${st.pouch};`);
    K(`stockState.perma = []; for (var i = 0; i < ${st.pouch}; i++) stockState.perma.push({ id:'barrier', used:false, temp:false, base:'barrier' });`);
    K(`stockState.items = []; for (var j = 0; j < ${st.items}; j++) stockState.items.push({ id:'barrier' });`);
    K(`gameState.lives = ${st.lives}; gameState.luckyCharm = false;`);
    K(`pipeRoomState.active = true; pipeRoomState.roomType = '${typeId}'; pipeRoomState.chestPicked = false;`);
    // forceEgg=true のときは 1% 抽選を必ず当てる（本物の乱数のままだと200試行でも数回しか出ない）
    if (forceEgg) K('__realRandom = Math.random; Math.random = function(){ return 0.005; };');
    try { K('initPipeRoom();'); } finally { if (forceEgg) K('Math.random = __realRandom;'); }
    return K('bonusRoomItems.map(function(o){ return { type:o.type, itemId:o.itemId||null, x:o.x, y:o.y, width:o.width, height:o.height }; })');
}

const findings = [];
const add = (room, state, kind, msg) => findings.push({ room, state, kind, msg });

for (const id of ROOM_IDS) {
    if (ONLY && ONLY !== id) continue;
    for (const st of STATES) {
        for (let trial = 0; trial < TRIALS; trial++) {
            // エッグは半分の試行で強制的に出す（1%のままでは検査にならない）
            const items = buildRoom(id, st, trial % 2 === 0);
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                // ① 重なり
                for (let j = i + 1; j < items.length; j++) {
                    if (isBadOverlap(it, items[j])) {
                        const pct = Math.round(overlapRatio(it, items[j]) * 100);
                        add(id, st.label, '重なり', `${it.type}${it.itemId ? '(' + it.itemId + ')' : ''} と ${items[j].type} が${pct}%重なる ` +
                            `(${Math.round(it.x)},${Math.round(it.y)}) × (${Math.round(items[j].x)},${Math.round(items[j].y)})`);
                    }
                }
                // ② 到達可否（宝箱は床置き＝踏む対象なので別扱い）
                if (it.type !== 'chest') {
                    if (it.y + it.height < headTop) add(id, st.label, '届かない', `${it.type} が高すぎる y=${Math.round(it.y)}（頭の最高到達 ${Math.round(headTop)}）`);
                    if (it.y > FLOOR_Y)             add(id, st.label, '床の下',   `${it.type} が床より下 y=${Math.round(it.y)}（床 ${FLOOR_Y}）`);
                }
                // ③ 部屋の外／出口土管との重なり
                if (it.x < WALL_W)                       add(id, st.label, '壁の中', `${it.type} が左壁に埋まる x=${Math.round(it.x)}（壁 ${WALL_W}）`);
                if (it.x + it.width > GAME_WIDTH - WALL_W) add(id, st.label, '壁の中', `${it.type} が右壁に埋まる x=${Math.round(it.x)}`);
                if (it.x + it.width > EXIT_X && it.y + it.height > FLOOR_Y - K('SIDE_PIPE_H'))
                    add(id, st.label, '土管に重なる', `${it.type} が出口土管の上に乗る x=${Math.round(it.x)}（土管 ${EXIT_X}〜）`);
            }
            // ④ 宝箱は「上から踏む」で必ず開く高さか（1フレームの落下量を跨げないと踏み判定を飛び越える）
            const chests = items.filter(o => o.type === 'chest');
            for (const ch of chests) {
                if (ch.height <= maxFallStep)
                    add(id, st.label, '踏めない恐れ', `宝箱の高さ ${ch.height}px が1フレームの落下量 ${Math.round(maxFallStep)}px 以下＝踏み判定を飛び越えうる`);
                if (Math.abs((ch.y + ch.height) - FLOOR_Y) > 1)
                    add(id, st.label, '宝箱が浮く', `宝箱の底が床に着いていない y+h=${Math.round(ch.y + ch.height)}（床 ${FLOOR_Y}）`);
            }
            if (id === 'lucky' && chests.length !== 3) add(id, st.label, '宝箱の数', `宝箱が3つでない (${chests.length})`);
            if (items.length === 0) add(id, st.label, '空の部屋', '報酬が1つも置かれていない');
        }
    }
}

// ── 自己テスト: わざと壊した配置を検出できるか（ツール自身が壊れていないかの担保） ──
if (SELFTEST) {
    const fake = [
        { type: 'coin', x: 300, y: 200, width: 32, height: 32 },
        { type: 'golden_egg', x: 310, y: 205, width: 40, height: 40 },   // 重なり
        { type: 'heart', x: 300, y: -500, width: 36, height: 36 }        // 届かない
    ];
    const hitOverlap = isBadOverlap(fake[0], fake[1]);
    const hitUnreach = fake[2].y + fake[2].height < headTop;
    console.log(`\n[selftest] 重なり検出=${hitOverlap ? 'OK' : 'NG'} / 届かない検出=${hitUnreach ? 'OK' : 'NG'}`);
    if (!hitOverlap || !hitUnreach) process.exitCode = 1;
}

// ── 結果 ──
console.log('═══ 土管ボーナス部屋 レイアウト検証 ═══');
console.log(`部屋: ${ONLY || ROOM_IDS.join(', ')} ／ 状態 ${STATES.length}種 × ${TRIALS}試行`);
console.log(`床 y=${FLOOR_Y}／壁 ${WALL_W}px／出口土管 x=${EXIT_X}〜／プレイヤー ${PLAYER_W}x${PLAYER_H}`);
console.log(`跳んだ時の頭の最高到達 y=${Math.round(headTop)}（床から ${Math.round(FLOOR_Y - headTop)}px）／落下の最大1フレーム量 ${Math.round(maxFallStep)}px`);

if (!findings.length) {
    console.log('\n✅ 問題なし（重なり0・全て到達可能・壁と土管に干渉なし）');
} else {
    // 同じ内容は1行にまとめる（試行ごとに同じものが山ほど出るため）
    const seen = new Map();
    for (const f of findings) {
        const key = `${f.room}|${f.state}|${f.kind}|${f.msg}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    console.log(`\n⚠ ${seen.size}種の問題（のべ${findings.length}件）`);
    for (const [key, n] of [...seen.entries()].sort()) {
        const [room, state, kind, msg] = key.split('|');
        console.log(`  [${room}] ${kind}: ${msg}  … ${n}回（${state}）`);
    }
    process.exitCode = 1;
}
