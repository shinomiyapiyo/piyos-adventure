#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 闇のニワトリ「ジャンプ中に踏むと空中に居座る」の再現＆修正確認（1.672）
//   使い方: node tools/boss-stomp-airborne-sim.mjs
//
// ⚠ユーザー実機報告:「闇のニワトリがジャンプしている時に踏むと、そのまま定位置が空中になる」。
//
// 【何を確かめるか】gameplay.js の updateBoss() を**実物のまま**回す。
//   ジャンプ攻撃(velY=-14)の途中でプレイヤーを頭上から落として踏ませ、そのあと
//   何もせずに 600フレーム進めて **b.y が地面(GROUND_Y - BOSS_HEIGHT = 220)へ戻るか**を見る。
//   ⚠重力と着地スナップを持っているのは updateBossAI_mama の「ジャンプ中」分岐だけなので、
//     踏んだ瞬間に isJumping を落とすと二度と落ちてこない（＝バグ）。
//   踏みの後はプレイヤーを画面の隅へ退避させ、追撃や体当たりが混ざらないようにする。
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GROUND_Y = 348;          // ⚠index.html:5989 の値を写したもの（VMには index.html を読まない）

const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const sandbox = {
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 },
    GROUND_Y,
    // index.html 側の依存を無害化（当たり判定は本物を使いたいので aabb 系だけは実装を写す）
    gainScore: () => {}, zukanAddKill: () => {}, markZukanSeen: () => {},
    spawnExplosionEffect: () => {}, takeDamage: () => {}, isPlayerProtected: () => true,
    samuraiDiveDmgBonus: () => 0, endSamuraiDiveOnBossStomp: () => {},
    soundManager: null, bgCache: null,
    aabb: (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y,
    aabbShrink: (a, b, sx, sy) => a.x + sx < b.x + b.width - sx && a.x + a.width - sx > b.x + sx &&
                                  a.y + sy < b.y + b.height && a.y + a.height > b.y
};
const ctx = vm.createContext(new Proxy(sandbox, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
for (const f of ['core-state.js', 'gameplay.js'])
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

const K = (expr) => vm.runInContext(expr, ctx);
K('gameSettings = { zukan: { seen: {}, kills: {}, new: {} } };');
const BOSS_H = K('BOSS_HEIGHT'), GAME_WIDTH = K('GAME_WIDTH');
const CAM = 5000, GROUND_TOP = GROUND_Y - BOSS_H;   // 地上に立っているときの b.y

// ジャンプ開始から stompAtFrame 目に踏む。戻り値＝その後600fでの b.y。
// mode 'old' は 1.671 までの実装（踏んだ瞬間に isJumping=false）を後から適用して再現する。
function run(stompAtFrame, mode) {
    K(`coins.length = 0; floatEffects.length = 0; enemies.length = 0; flyingEnemies.length = 0;
       gameState.camera.x = ${CAM}; gameState.camera.y = 0; gameState.isInvincible = false;
       bossState.active = true; bossState.phase = 3; bossState.maxHp = 100;
       bossState.arenaLeft = ${CAM} + 30; bossState.arenaRight = ${CAM} + GAME_WIDTH - 30;
       bossState.eggs = []; bossState.flashAttackTimer = 0; bossState.summonTimer = 99999;
       bossState.itemSpawnTimer = 99999;
       tutorialState.active = false; gameRound = 13;
       bossState.boss = { x: ${CAM} + 400, y: ${GROUND_TOP}, width: BOSS_WIDTH, height: BOSS_HEIGHT,
           kind: 'rooster', hp: 100, velX: 0, velY: 0, facing: 'left', animFrame: 0, patrolDir: -1,
           attackTimer: 99999, angerTimer: 0, isAngry: false, isRushing: false, isJumping: false,
           isFlaming: false, isCharging: false, stompCooldown: 0, spriteResetTimer: 0, darkness: 0 };
       player.x = ${CAM} + 700; player.y = ${GROUND_Y} - player.height; player.velY = 0;`);

    // ジャンプ攻撃を開始（AIの攻撃抽選と同じ値）
    K('bossState.boss.isJumping = true; bossState.boss.velY = -14;');

    let apex = 1e9, stompY = null;
    for (let f = 1; f <= 600; f++) {
        if (f === stompAtFrame) {
            // プレイヤーをボスの真上に置いて落下中にする＝踏みの成立条件
            K(`player.x = bossState.boss.x + bossState.boss.width / 2 - player.width / 2;
               player.y = bossState.boss.y - player.height + 6; player.velY = 6;`);
        }
        const before = K('bossState.boss.isJumping');
        K('updateBoss()');
        if (f === stompAtFrame) {
            stompY = K('bossState.boss.y');
            if (mode === 'old' && before) K('bossState.boss.isJumping = false;');   // 1.671までの挙動を再現
            // 踏んだ後はプレイヤーを遠くへ（追撃・体当たりを混ぜない）
            K(`player.x = ${CAM} + 760; player.y = ${GROUND_Y} - player.height; player.velY = 0;`);
        }
        apex = Math.min(apex, K('bossState.boss.y'));
    }
    return { endY: K('bossState.boss.y'), jumping: K('bossState.boss.isJumping'), stompY, apex };
}

console.log(`地面に立つ b.y = ${GROUND_TOP}（GROUND_Y ${GROUND_Y} - ボス高 ${BOSS_H}）／ジャンプ velY=-14・重力0.7 ＝ 最高 ${(14 * 14 / (2 * 0.7)).toFixed(0)}px\n`);
let ng = 0;
for (const f of [4, 10, 16, 20, 24, 30]) {
    const o = run(f, 'old'), n = run(f, 'new');
    const oBad = Math.abs(o.endY - GROUND_TOP) > 0.5, nBad = Math.abs(n.endY - GROUND_TOP) > 0.5;
    if (nBad) ng++;
    console.log(`  ジャンプ${String(f).padStart(2)}f目に踏む（そのとき b.y=${Math.round(o.stompY)}／地面より${Math.round(GROUND_TOP - o.stompY)}px上）` +
        `\n      旧: 600f後 b.y=${Math.round(o.endY)} ${oBad ? '❌ 空中に居座ったまま' : '✅ 着地'}` +
        `   新: 600f後 b.y=${Math.round(n.endY)} ${nBad ? '❌ 空中に居座ったまま' : '✅ 着地'}`);
}
console.log(ng ? `\n❌ ${ng}ケースで空中に取り残される` : '\n✅ どのタイミングで踏んでも最後は地面へ降りる');
process.exit(ng ? 1 : 0);
