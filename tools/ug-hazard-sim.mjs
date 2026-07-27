#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 地底ステージ「被弾せずに抜けられるか」シミュレータ（1.613）
//   使い方: node tools/ug-hazard-sim.mjs [7|14|21|28]   （省略時は全ラウンド）
//
// ⚠ユーザー依頼:「ギミックのタイミングで、ほぼ絶対に被弾せずに進めないような部分はないか？
//   難易度は下げたくないが確認はしておきたい」。
//
// 【なぜ静的チェックでは駄目か】
//   ファイアバーは回転するので「バーの円の中＝危険」ではない。必ず退く瞬間がある。
//   よって**時間軸を入れて、(列 × 位相) の通過可能性を実際に探索する**しかない。
//   ⚠バーは全部 ang=-π/2 から同じ速さ(UG_FIREBAR_SPEED)で回るので**全機が同位相**。
//     dir(±1)だけが違う＝左右の掃く向きが鏡なだけで、上下のタイミングは全機一致する。
//
// 【モデル】床の上を歩いて右へ抜ける動きだけを見る（この面は強制スクロールが無く、
//   いつでも立ち止まれるので「待てるか」が本質）。
//   ・1周期 T = 2π / 0.022 ≒ 286フレーム。位相は T で巡回する
//   ・歩行 3.0px/f ＝ 1タイル(32px)に 11フレーム
//   ・立ち＝その場で1フレーム待つ／歩き＝右へ1タイル／跳び＝右へ1〜3タイル(滞空45f・空中は判定しない)
//   ・当たり判定は実機と同じ寛容さ: プレイヤーを左右14px・上下10px 削る（UG_HAZARD_SHRINK）
//   ・炎の当たり半径 11px・セグメント間隔 26px（UG_FIREBAR_R / UG_FIREBAR_SEG）
//   ⚠火の玉は位相が列ごとにバラバラ((c*37)%period)で、噴出口の真上を避ければよいだけなので
//     ここでは扱わない（バーのように面を薙がない）。トゲと穴は「跳ぶ」で表現する。
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 32, SEG = 26, FIRE_R = 11, SPEED = 0.022;
const SHRINK_X = 14, SHRINK_Y = 10;
const PLAYER_W = 48, PLAYER_H = 48;
const WALK_F = 11;                       // 1タイル歩くのに要るフレーム（32px / 3.0px/f）
const JUMP_F = 45;                       // 滞空フレーム
const T = Math.round(Math.PI * 2 / SPEED);   // = 286
const SOLID = new Set(['#', 'B']), PLAT = new Set(['=', 'M']);

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

function analyse(round) {
    const rooms = vm.runInContext(`ugRoomsForRound(${round})`, ctx);
    const findings = [];
    let tightestAll = { room: '', col: -1, safe: 1e9 };

    for (const room of rooms) {
        if (room.key === 'chamber') continue;
        const rowsN = room.map.length, W = room.wT, floorRow = rowsN - 3;
        const g = room.map.map((l) => { const a = new Array(W); for (let c = 0; c < W; c++) a[c] = c < l.length ? l.charAt(c) : ' '; return a; });
        const vertical = (rowsN * TILE - 450) > 64;
        if (vertical) continue;                    // 縦の部屋は片道足場で登る＝この歩行モデルの対象外
        const floorY = room.topY + floorRow * TILE;

        // この部屋のファイアバー（床の帯にあるものだけ＝立っている頭〜足を薙ぐもの）
        const bars = [];
        for (let r = 0; r < rowsN; r++) for (let c = 0; c < W; c++) {
            const ch = g[r][c];
            if (ch !== 'F' && ch !== 'G' && ch !== 'H') continue;
            bars.push({ x: c * TILE + TILE / 2, y: room.topY + r * TILE + TILE / 2,
                        len: ch === 'H' ? 6 : 4, dir: ch === 'G' ? -1 : 1 });
        }
        // 立てる列か（穴/溶岩でない・トゲでない）
        const standable = new Array(W).fill(false);
        for (let c = 0; c < W; c++) {
            let foot = false;
            for (let r = floorRow - 4; r <= floorRow; r++) if (r >= 0 && (SOLID.has(g[r][c]) || PLAT.has(g[r][c]))) foot = true;
            let spike = false;
            for (let r = floorRow - 4; r <= floorRow; r++) if (r >= 0 && g[r][c] === '^') spike = true;
            standable[c] = foot && !spike;
        }
        // safe[c][t] : 列cに立っているとき、位相tでバーに当たらないか
        const box = (c) => ({ x0: c * TILE - 8 + SHRINK_X, x1: c * TILE - 8 + PLAYER_W - SHRINK_X,
                              y0: floorY - PLAYER_H + SHRINK_Y, y1: floorY - SHRINK_Y });
        const safe = [];
        for (let c = 0; c < W; c++) {
            const b = box(c), row = new Uint8Array(T);
            for (let t = 0; t < T; t++) {
                let hit = false;
                for (const bar of bars) {
                    const ang = -Math.PI / 2 + SPEED * bar.dir * t;
                    const cs = Math.cos(ang), sn = Math.sin(ang);
                    for (let i = 1; i <= bar.len && !hit; i++) {
                        const px = bar.x + cs * SEG * i, py = bar.y + sn * SEG * i;
                        const nx = Math.max(b.x0, Math.min(px, b.x1));
                        const ny = Math.max(b.y0, Math.min(py, b.y1));
                        if ((px - nx) ** 2 + (py - ny) ** 2 <= FIRE_R * FIRE_R) hit = true;
                    }
                    if (hit) break;
                }
                row[t] = hit ? 0 : 1;
            }
            safe.push(row);
        }
        // 各列の「安全な位相の割合」。0 なら**その場所は常に危険＝立てない**
        for (let c = 0; c < W; c++) {
            if (!standable[c]) continue;
            let n = 0; for (let t = 0; t < T; t++) n += safe[c][t];
            if (n === 0) findings.push({ kind: 'ALWAYS', room: room.key, col: c });
            if (n < tightestAll.safe) tightestAll = { room: `R${round} ${room.key}`, col: c, safe: n };
        }
        // (列 × 位相) の到達可能性を探索：左端から右端まで被弾せずに行けるか
        const seen = [];
        for (let c = 0; c < W; c++) seen.push(new Uint8Array(T));
        const stack = [];
        for (let t = 0; t < T; t++) if (standable[0] && safe[0][t]) { seen[0][t] = 1; stack.push(0 * T + t); }
        // 左端が立てない部屋（＝入口が穴）は最初の立てる列から始める
        if (!stack.length) {
            let c0 = 0; while (c0 < W && !standable[c0]) c0++;
            for (let t = 0; t < T && c0 < W; t++) if (safe[c0][t]) { seen[c0][t] = 1; stack.push(c0 * T + t); }
        }
        let reachedMax = 0;
        while (stack.length) {
            const s = stack.pop(), c = (s / T) | 0, t = s % T;
            if (c > reachedMax) reachedMax = c;
            const push = (nc, nt) => {
                if (nc < 0 || nc >= W || !standable[nc]) return;
                nt = ((nt % T) + T) % T;
                if (!safe[nc][nt] || seen[nc][nt]) return;
                seen[nc][nt] = 1; stack.push(nc * T + nt);
            };
            push(c, t + 1);                              // その場で待つ
            push(c + 1, t + WALK_F);                     // 歩いて1タイル
            // ⚠跳躍は「**穴3タイルを跨いで4タイル先へ着地**」まで。踏切はタイルの右端なので、
            //   穴が3タイル(96px)なら着地は c+4（水平跳躍135px の内側）。ここを c+3 にすると
            //   3タイルの溶岩を全部「渡れない」と誤検出する（1.613で実際に5件の誤検出を出した）。
            for (let k = 1; k <= 4; k++) push(c + k, t + JUMP_F);
        }
        let lastStand = W - 1; while (lastStand > 0 && !standable[lastStand]) lastStand--;
        if (reachedMax < lastStand)
            findings.push({ kind: 'BLOCK', room: room.key, col: reachedMax, goal: lastStand });
    }
    return { findings, tightestAll };
}

const want = process.argv[2] ? [Number(process.argv[2])] : [7, 14, 21, 28];
console.log('\n=== 地底「被弾せずに抜けられるか」シミュレーション ===');
console.log(`1周期 ${T}フレーム / 歩行 3.0px/f（1タイル${WALK_F}f） / 滞空 ${JUMP_F}f / 当たり判定は実機と同じ寛容さ\n`);
let bad = 0;
for (const r of want) {
    const { findings, tightestAll } = analyse(r);
    const always = findings.filter((f) => f.kind === 'ALWAYS');
    const block = findings.filter((f) => f.kind === 'BLOCK');
    bad += findings.length;
    console.log(`R${String(r).padStart(2)}: ` +
        (findings.length === 0 ? '✅ 全区間を無傷で通過できる' : `⚠ ${findings.length}件`) +
        `   （一番きつい場所: ${tightestAll.room} 列${tightestAll.col} = 安全な位相 ${tightestAll.safe}/${T}f ` +
        `＝ ${(tightestAll.safe / T * 100).toFixed(0)}%）`);
    for (const f of always) console.log(`    ✗ ${f.room} 列${f.col}: **どの瞬間も危険**（立って待てない）`);
    for (const f of block) console.log(`    ✗ ${f.room}: 列${f.col} より先へ無傷で進めない（目標 列${f.goal}）`);
}
console.log(bad === 0 ? '\n✅ 「絶対に被弾する」区間は見つからなかった' : '\n⚠ 上記を確認すること');
process.exit(0);
