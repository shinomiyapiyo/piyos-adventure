#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 地底「入場の落下」でコインが全部取れるかのシミュレータ（1.671）
//   使い方: node tools/ug-spawn-coin-sim.mjs            （全ラウンド）
//           node tools/ug-spawn-coin-sim.mjs 28 fixed   （旧仕様=絶対座標spawnで比較）
//
// ⚠ユーザー実機報告:「地底モードの入場時のスポーンでコインが取れない」。
//
// 【なぜ静的チェックでは駄目か】
//   落下線（列1〜2）にコインを置く原則は守られていても、**プレイヤーの出現Yが部屋の天井より
//   下**なら、その上のコインは物理的に触れない。出現Yは enterUnderground が
//   `-player.height - UG_SPAWN_Y_ABOVE`（＝-138・**絶対座標**）で決めているので、
//   部屋1の topY が -4 以外のラウンド（R28=-516）では出現点が坑の途中になる。
//   ＝「置いた場所」ではなく「実際に落ちた軌跡」で判定しないと見つからない。
//
// 【モデル】enterUnderground 直後の入場落下だけを再現する。
//   ・x は UG_SPAWN_X 固定（introTimer 中は左右入力が殺されるので横流れは無い）
//   ・重力 GRAVITY(0.7)・落下速度上限 15（index.html の _vcap）
//   ・updatePlayer → updateCoins の順なので、**移動後**の座標で AABB を見る
//   ・当たりは aabb()（縮小なし）＝コイン取得と同じ
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 32, PW = 48, PH = 48, GRAV = 0.7, VCAP = 15;
const SOLID = new Set(['#', 'B']);

const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const ctx = vm.createContext(new Proxy({
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 }
}, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
for (const f of ['core-state.js', 'gameplay.js'])
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

const SPAWN_X = vm.runInContext('UG_SPAWN_X', ctx);
const SPAWN_ABOVE = vm.runInContext('UG_SPAWN_Y_ABOVE', ctx);

function aabb(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}

// mode: 'room'  = 部屋1の天井を基準に出現（1.671の修正後）
//       'fixed' = 絶対座標 -138（1.670までの実装）
function simulate(round, mode) {
    const rooms = vm.runInContext(`ugRoomsForRound(${round})`, ctx);
    const room = rooms[0];
    const map = room.map, W = room.wT, topY = room.topY, rowsN = map.length;
    const g = map.map((l) => { const a = new Array(W); for (let c = 0; c < W; c++) a[c] = c < l.length ? l.charAt(c) : ' '; return a; });

    const coins = [];
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < W; c++)
        if (g[r][c] === 'o') coins.push({ row: r, col: c, x: c * TILE, y: topY + r * TILE, width: 32, height: 32, got: false });

    const p = { x: SPAWN_X, y: (mode === 'fixed' ? 0 : topY) - PH - SPAWN_ABOVE, width: PW, height: PH, velY: 0 };
    const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + PW - 1) / TILE);   // 落下線が跨ぐ列
    let frames = 0, landedRow = null;

    while (frames < 600) {
        frames++;
        p.velY = Math.min(p.velY + GRAV, VCAP);
        const prevFeet = p.y + PH;
        p.y += p.velY;
        // 着地: 跨いでいる列のソリッドの上面を足元が跨いだら止まる
        let stop = null;
        for (let r = 0; r < rowsN; r++) {
            const ty = topY + r * TILE;
            if (ty < prevFeet - 0.001 || ty > p.y + PH) continue;
            for (let c = c0; c <= c1; c++) if (SOLID.has(g[r][c])) { if (stop === null || ty < stop) { stop = ty; landedRow = r; } }
        }
        if (stop !== null) { p.y = stop - PH; }
        for (const co of coins) if (!co.got && aabb(p, co)) co.got = true;
        if (stop !== null) break;
    }
    return { key: room.key, topY, coins, frames, landedRow, spawnY: (mode === 'fixed' ? 0 : topY) - PH - SPAWN_ABOVE };
}

const argRound = process.argv[2] ? Number(process.argv[2]) : null;
const argMode = process.argv[3] || null;
const ROUNDS = argRound ? [argRound] : [7, 14, 21, 28];
const MODES = argMode ? [argMode] : ['fixed', 'room'];

let bad = 0;
for (const round of ROUNDS) {
    console.log(`\n══ R${round} ═════════════════════════════════════════`);
    for (const mode of MODES) {
        const r = simulate(round, mode);
        const miss = r.coins.filter((c) => !c.got);
        const label = mode === 'fixed' ? '旧(絶対-138)' : '新(部屋1の天井基準)';
        console.log(`  ${label.padEnd(22)} 部屋1='${r.key}' topY=${r.topY} 出現Y=${r.spawnY} 落下${r.frames}f→行${r.landedRow}着地`);
        console.log(`    コイン ${r.coins.length - miss.length}/${r.coins.length} 取得` +
            (miss.length ? `  ✗取れない: ${miss.map((c) => `行${c.row}列${c.col}(y=${c.y})`).join(' / ')}` : '  ✅全部取れる'));
        if (mode === 'room' && miss.length) bad++;
    }
}
console.log(bad ? `\n❌ 修正後もまだ取れないコインがある部屋が ${bad} 件` : '\n✅ 修正後は全ラウンドで入場落下のコインを全部拾える');
process.exit(bad ? 1 : 0);
