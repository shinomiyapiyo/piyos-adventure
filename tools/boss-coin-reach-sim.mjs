#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ボス撃破報酬のコインが「全部取れる位置」に落ちるかのシミュレータ（1.671）
//   使い方: node tools/boss-coin-reach-sim.mjs
//
// ⚠ユーザー実機報告:「ボス撃破時に画面端で倒すと移動可能領域の外にコインがドロップして取れない」。
//
// 【何を確かめるか】gameplay.js の updateBoss() を**実物のまま**呼んで（VMに読み込み、
//   phase=4 / defeatedTimer=89 から1tick進めて撃破報酬ブロックを踏ませる）、落ちた25枚が
//   プレイヤーの当たり判定と重なり得るかを見る。
//   ・横: プレイヤーは画面端クランプ(camera+25)とアリーナ壁(arenaLeft/Right)で
//         x ∈ [aL, aR-48] にしか立てない ＝ 体が届くのは [aL, aR]
//   ・縦: 地上から跳んだときの頭の最高到達 = (GROUND_Y - 48) - JUMP_FORCE^2/(2*GRAVITY) ≒ 109。
//         足場の上からならもっと高く届くが、**足場が無い x でも取れる**ことを保証したいので
//         ここでは地面からの跳躍だけで判定する（＝最悪ケース）。
//   ボスを左端・右端・中央、地上/滞空（タカ hoverY=140・上下に±12揺れる）に置いて総当たりする。
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GROUND_Y = 348;          // ⚠index.html:5989 の値を写したもの（VMには index.html を読まないため）

const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const sandbox = {
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 },
    GROUND_Y,
    // 撃破報酬ブロックが触る外部（index.html 側）の関数はここで無害化する
    gainScore: () => {}, zukanAddKill: () => {}, markZukanSeen: () => {},
    spawnExplosionEffect: () => {}, soundManager: null, bgCache: null
};
const ctx = vm.createContext(new Proxy(sandbox, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
for (const f of ['core-state.js', 'gameplay.js'])
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

const K = (expr) => vm.runInContext(expr, ctx);
const GAME_WIDTH = K('GAME_WIDTH'), BOSS_W = K('BOSS_WIDTH'), BOSS_H = K('BOSS_HEIGHT');
const JUMP_FORCE = K('JUMP_FORCE'), GRAVITY = K('GRAVITY'), N_COINS = K('BOSS_COINS_ON_DEFEAT');
const PH = 48, PW = 48, CAM = 5000;

// 地面から跳んだ頭の最高到達（実測に合わせた連続近似。離散積分だと約1px低いだけ＝安全側）
const APEX_TOP = (GROUND_Y - PH) - (JUMP_FORCE * JUMP_FORCE) / (2 * GRAVITY);

// ずかん登録などセーブを触る処理が走るので、最低限の器だけ用意する（index.html の loadSettings 相当）
K('gameSettings = { zukan: { seen: {}, kills: {}, new: {} } };');

function dropOnce(bossX, bossY) {
    K('coins.length = 0; floatEffects.length = 0; enemies.length = 0; flyingEnemies.length = 0;');
    K(`gameState.camera.x = ${CAM}; gameState.camera.y = 0;`);
    K(`bossState.active = true; bossState.phase = 4; bossState.defeatedTimer = 89;
       bossState.arenaLeft = ${CAM} + 30; bossState.arenaRight = ${CAM} + GAME_WIDTH - 30;
       bossState.eggs = [];
       bossState.boss = { x: ${bossX}, y: ${bossY}, width: BOSS_WIDTH, height: BOSS_HEIGHT,
                          kind: 'chicken', hp: 0, darkness: 0 };
       tutorialState.active = false;`);
    K('updateBoss()');
    return K('coins.map(function (c) { return { x: c.x, y: c.y, w: c.width, h: c.height }; })');
}

// プレイヤーの体が届く横の帯 ＝ [aL, aR]（立てる範囲 [aL, aR-48] に体幅48を足したもの）
const AL = CAM + 30, AR = CAM + GAME_WIDTH - 30;

function check(coins) {
    let worstX = 1e9, worstY = 1e9, bad = 0;
    for (const c of coins) {
        // aabb: coin.x < 体の右端 && coin.x + 32 > 体の左端
        const mx = Math.min(AR - c.x, (c.x + c.w) - AL);          // 横の重なり余裕(px)
        const my = Math.min((c.y + c.h) - APEX_TOP, GROUND_Y - c.y); // 縦の重なり余裕(px)
        worstX = Math.min(worstX, mx); worstY = Math.min(worstY, my);
        if (mx <= 0 || my <= 0) bad++;
    }
    return { bad, worstX: Math.round(worstX), worstY: Math.round(worstY) };
}

// 旧実装（1.670まで）の式そのまま＝比較用
function dropOld(bossX, bossY) {
    const out = [];
    for (let i = 0; i < N_COINS; i++)
        out.push({ x: bossX + BOSS_W / 2 + (Math.random() - 0.5) * 250, y: bossY + (Math.random() - 0.5) * 120, w: 32, h: 32 });
    return out;
}

const HOVER = GROUND_Y - BOSS_H - 80;                 // タカ/フクロウの滞空高度
const CASES = [
    ['左端・地上',   AL,             GROUND_Y - BOSS_H],
    ['右端・地上',   AR - BOSS_W,    GROUND_Y - BOSS_H],
    ['中央・地上',   CAM + GAME_WIDTH / 2 - BOSS_W / 2, GROUND_Y - BOSS_H],
    ['左端・滞空上', AL,             HOVER - 12],
    ['右端・滞空上', AR - BOSS_W,    HOVER - 12],
    ['中央・滞空上', CAM + GAME_WIDTH / 2 - BOSS_W / 2, HOVER - 12]
];
const TRIALS = 400;

console.log(`アリーナ [${AL - CAM}, ${AR - CAM}]（camera相対） / 地上ジャンプの頭の最高到達 y=${APEX_TOP.toFixed(1)} / 1回${N_COINS}枚 × ${TRIALS}回\n`);
let ng = 0;
for (const [label, bx, by] of CASES) {
    let oldBad = 0, newBad = 0, wx = 1e9, wy = 1e9, total = 0;
    for (let t = 0; t < TRIALS; t++) {
        oldBad += check(dropOld(bx, by)).bad;
        const r = check(dropOnce(bx, by));
        newBad += r.bad; wx = Math.min(wx, r.worstX); wy = Math.min(wy, r.worstY); total += N_COINS;
    }
    const ok = newBad === 0;
    if (!ok) ng++;
    console.log(`  ${label.padEnd(8)} ボスy=${by}  旧: 取れない ${String(oldBad).padStart(5)}/${total}枚` +
                `   新: ${ok ? '✅ 0枚' : `❌ ${newBad}枚`}（最小の重なり余裕 横${wx}px 縦${wy}px）`);
}
console.log(ng ? `\n❌ ${ng}ケースで取れないコインが残っている` : '\n✅ 全ケースで25枚とも到達可能な位置に落ちる');
process.exit(ng ? 1 : 0);
