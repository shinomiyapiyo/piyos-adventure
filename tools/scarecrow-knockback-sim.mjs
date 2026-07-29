#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 闇のカカシ「防御中の頭を踏んだら横へ弾き出せているか」の確認（1.673）
//   使い方: node tools/scarecrow-knockback-sim.mjs
//
// ✅ユーザー指定:「闇のカカシを踏んだ時が跳ね返りの場合、闇の卵同様に横に弾かれるようにして」。
//
// 【何を確かめるか】updateBossCollision_scarecrow を**実物のまま**呼んで、弾かれた直後の
//   player.velX / velY / knockbackTimer を取り出し、そこから着地までを積分して
//   「もう一度 踏みの当たり(aabbShrink 10,12)に入らずに頭の外へ出られるか」を見る。
//   ＝入ってしまうなら頭の上で跳ね続けられる（1.648で闇のタマゴに出た「居座り」と同じ形）。
//
// 【モデル】index.html updatePlayer の該当式をそのまま写す:
//   ・ノックバック中(knockbackTimer>0) は横入力を受けず velX *= 0.97
//   ・切れたら入力なし＝摩擦 0.85（**押し戻そうとしない**＝プレイヤーに最も有利な側で見る）
//   ・velY += 0.7（上限15）／足が GROUND_Y に着いたら着地
//   ・x はアリーナ壁と画面端(25px)でクランプ
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GROUND_Y = 348;          // ⚠index.html:5989 の値を写したもの

const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const aabbShrink = (a, b, sx, sy) => a.x + sx < b.x + b.width - sx && a.x + a.width - sx > b.x + sx &&
                                     a.y + sy < b.y + b.height && a.y + a.height > b.y;
const sandbox = {
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 },
    GROUND_Y,
    gainScore: () => {}, zukanAddKill: () => {}, markZukanSeen: () => {}, spawnExplosionEffect: () => {},
    takeDamage: () => {}, isPlayerProtected: () => true, samuraiDiveDmgBonus: () => 0,
    endSamuraiDiveOnBossStomp: () => {}, soundManager: null, bgCache: null,
    aabb: (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y,
    aabbShrink,
    aabbGraze: () => false        // 腕薙ぎ/藁の棘は今回の対象外（防御中の踏みだけを見る）
};
const ctx = vm.createContext(new Proxy(sandbox, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
for (const f of ['core-state.js', 'gameplay.js'])
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
const K = (e) => vm.runInContext(e, ctx);
K('gameSettings = { zukan: { seen: {}, kills: {}, new: {} } };');

const GAME_WIDTH = K('GAME_WIDTH'), BW = K('BOSS_WIDTH'), BH = K('BOSS_HEIGHT'), JUMP_FORCE = K('JUMP_FORCE');
const CAM = 5000, PW = 48, PH = 48;
const AL = CAM + 30, AR = CAM + GAME_WIDTH - 30;
const WALL_L = Math.max(AL, CAM + 25), WALL_R = Math.min(AR, CAM + GAME_WIDTH - 25);

// 防御中のカカシを踏む → 弾かれた直後のプレイヤーの状態を返す
function stomp(bossX, playerOffset) {
    K(`floatEffects.length = 0; gameState.camera.x = ${CAM}; gameState.camera.y = 0;
       bossState.active = true; bossState.phase = 3;
       bossState.arenaLeft = ${AL}; bossState.arenaRight = ${AR};
       bossState.boss = { x: ${bossX}, y: ${GROUND_Y - BH}, width: BOSS_WIDTH, height: BOSS_HEIGHT,
           kind: 'scarecrow', hp: 100, exposed: false, scMode: 'idle', stompCooldown: 0, spriteResetTimer: 0 };
       player.x = ${bossX} + BOSS_WIDTH / 2 - player.width / 2 + ${playerOffset};
       player.y = bossState.boss.y - player.height + 4; player.velX = 0; player.velY = 6;
       player.knockbackTimer = 0;`);
    K('updateBossCollision(bossState.boss)');
    return K('({ x: player.x, y: player.y, velX: player.velX, velY: player.velY, kb: player.knockbackTimer })');
}

// 弾かれたあとを着地まで積分し、途中でもう一度「踏みの当たり」に入るかを見る
function settle(st, bossX, forceOld) {
    const boss = { x: bossX, y: GROUND_Y - BH, width: BW, height: BH };
    const p = { x: st.x, y: st.y, width: PW, height: PH };
    let velX = forceOld ? 0 : st.velX, velY = forceOld ? JUMP_FORCE * 0.62 : st.velY;
    let kb = forceOld ? 0 : st.kb, reStomp = false, maxDx = 0;
    for (let f = 0; f < 240; f++) {
        if (kb > 0) { kb--; velX *= 0.97; } else { velX *= 0.85; }
        velY = Math.min(velY + 0.7, 15);
        p.x += velX; p.y += velY;
        if (p.x < WALL_L) p.x = WALL_L;
        if (p.x + PW > WALL_R) p.x = WALL_R - PW;
        if (p.y + PH >= GROUND_Y) { p.y = GROUND_Y - PH; break; }       // 着地
        // 落下中に頭の上へ戻ってきたら「また踏める＝居座れる」
        if (velY > 0 && aabbShrink(p, boss, 10, 12) && p.y + PH <= boss.y + BH * 0.34) reStomp = true;
        maxDx = Math.max(maxDx, Math.abs((p.x + PW / 2) - (bossX + BW / 2)));
    }
    return { reStomp, maxDx: Math.round(maxDx), landX: Math.round(p.x - CAM) };
}

const PLANTED = CAM + GAME_WIDTH * 0.60;      // カカシの定位置（updateBoss の scarecrow 分岐）
const CASES = [
    ['頭のど真ん中を踏む',   PLANTED,  0],
    ['やや左を踏む',         PLANTED, -20],
    ['やや右を踏む',         PLANTED, +20],
    ['右壁ぎりぎりに居る想定', AR - BW - 4, 0],
    ['左壁ぎりぎりに居る想定', AL + 4,      0]
];

console.log(`アリーナ [${AL - CAM}, ${AR - CAM}] / 弾き出しに要る横距離 = ${BW / 2 + PW / 2 + 16}px（camera相対・カカシ定位置 x=${Math.round(PLANTED - CAM)}）\n`);
let ng = 0;
for (const [label, bx, off] of CASES) {
    const st = stomp(bx, off);
    const now = settle(st, bx, false);
    const old = settle(st, bx, true);      // 1.672までの「真上へ跳ね返すだけ」
    if (now.reStomp) ng++;
    console.log(`  ${label.padEnd(12)} 弾き velX=${st.velX.toFixed(1)} velY=${st.velY.toFixed(2)} 硬直${st.kb}f` +
        `\n      旧(真上のみ): ${old.reStomp ? '❌ 頭へ戻って踏み直せる＝居座れる' : '✅ 戻らない'}` +
        `   新(横へ弾く): ${now.reStomp ? '❌ 頭へ戻れる' : `✅ 頭の外へ出る（中心から最大${now.maxDx}px）`}`);
}
console.log(ng ? `\n❌ ${ng}ケースで頭の上に居座れる` : '\n✅ どの位置で踏んでも頭の外へ弾き出される');
process.exit(ng ? 1 : 0);
