#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 地底ステージの全体図を SVG で書き出す（1.734）
//   使い方: node tools/ug-map-svg.mjs [7|14|21|28|35] [出力パス]
//
// ⚠面を1枚の絵で見られるようにするためのもの。790タイル×3段の高低差は
//   ワールド座標のまま描く（部屋の topY をそのまま使う）＝**継ぎ目のズレも絵で分かる**。
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 32, SCALE = 0.22;

const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const ctx = vm.createContext(new Proxy({
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 }
}, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
vm.runInContext(readFileSync(join(ROOT, 'core-state.js'), 'utf8'), ctx, { filename: 'core-state.js' });

const round = Number(process.argv[2] || 35);
const rooms = ctx.ugRoomsForRound(round);
const out = process.argv[3] || join(ROOT, `ug-map-R${round}.svg`);

// 文字 → [色, 大きさ(タイル比), 形]  ／ null = 描かない
const STYLE = {
    '#': ['#39325a', 1, 'rect'], 'B': ['#4b4478', 1, 'rect'], 'b': ['#2a2545', 1, 'rect'],
    'L': ['#ff6a1e', 1, 'rect'], 'w': ['#3f6fa8', 1, 'rect'],
    '=': ['#a9a2c8', 0.42, 'bar'], 'M': ['#5cd0ff', 0.42, 'bar'],
    '^': ['#ff4d6d', 0.5, 'spike'],
    'F': ['#ffb020', 0.7, 'dot'], 'G': ['#ffb020', 0.7, 'dot'], 'H': ['#ffd76a', 0.85, 'dot'],
    'f': ['#ff3b30', 0.6, 'dot'], 'e': ['#ff7a5c', 0.6, 'dot'],
    'o': ['#ffd83d', 0.42, 'dot'],
    '1': ['#4de08a', 0.7, 'dot'], '2': ['#4de08a', 0.7, 'dot'], '3': ['#4de08a', 0.7, 'dot'],
    '4': ['#4de08a', 0.7, 'dot'], '5': ['#4de08a', 0.7, 'dot'],
    'c': ['#ff5fd0', 0.62, 'dot'], 'm': ['#ff5fd0', 0.62, 'dot'], 'g': ['#ffe14d', 0.62, 'dot'],
    'S': ['#e6e6f5', 0.62, 'dot'], 'v': ['#a06bff', 0.62, 'dot'], 'd': ['#a06bff', 0.62, 'dot'],
    'W': ['#ffa8d8', 1.6, 'dot'], 'I': ['#c08bff', 1.8, 'dot'], 'i': ['#9b6bff', 0.4, 'dot']
};

let minY = Infinity, maxY = -Infinity, startTile = 0;
const placed = [];
for (const def of rooms) {
    const x0 = startTile * TILE;
    minY = Math.min(minY, def.topY);
    maxY = Math.max(maxY, def.topY + def.map.length * TILE);
    placed.push({ def, x0, startTile });
    startTile += def.wT;
}
const W = startTile * TILE, H = maxY - minY;
const px = (x) => ((x) * SCALE).toFixed(1);
const py = (y) => ((y - minY) * SCALE).toFixed(1);

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * SCALE)}" height="${Math.round(H * SCALE + 26)}" viewBox="0 0 ${Math.round(W * SCALE)} ${Math.round(H * SCALE + 26)}">`;
svg += `<rect width="100%" height="100%" fill="#120c22"/>`;
for (const { def, x0, startTile: st } of placed) {
    // 部屋の枠と名前
    svg += `<rect x="${px(x0)}" y="${py(def.topY)}" width="${px(def.wT * TILE)}" height="${((def.map.length * TILE) * SCALE).toFixed(1)}" fill="#181130" stroke="#4a3f7a" stroke-width="1"/>`;
    for (let r = 0; r < def.map.length; r++) {
        const line = def.map[r];
        for (let c = 0; c < def.wT; c++) {
            const ch = c < line.length ? line.charAt(c) : ' ';
            const st2 = STYLE[ch];
            if (!st2) continue;
            const [color, size, shape] = st2;
            const x = x0 + c * TILE, y = def.topY + r * TILE;
            if (shape === 'rect') {
                svg += `<rect x="${px(x)}" y="${py(y)}" width="${(TILE * SCALE).toFixed(1)}" height="${(TILE * SCALE).toFixed(1)}" fill="${color}"/>`;
            } else if (shape === 'bar') {
                svg += `<rect x="${px(x)}" y="${py(y + TILE * 0.3)}" width="${(TILE * SCALE).toFixed(1)}" height="${(TILE * size * SCALE).toFixed(1)}" fill="${color}"/>`;
            } else if (shape === 'spike') {
                const w = TILE * SCALE, h = TILE * SCALE;
                svg += `<polygon points="${px(x)},${py(y + TILE)} ${(Number(px(x)) + w / 2).toFixed(1)},${(Number(py(y + TILE)) - h).toFixed(1)} ${(Number(px(x)) + w).toFixed(1)},${py(y + TILE)}" fill="${color}"/>`;
            } else {
                svg += `<circle cx="${px(x + TILE / 2)}" cy="${py(y + TILE / 2)}" r="${(TILE * size * 0.5 * SCALE).toFixed(1)}" fill="${color}"/>`;
            }
        }
    }
    svg += `<text x="${px(x0 + 8)}" y="${(Number(py(def.topY)) - 3).toFixed(1)}" fill="#b9a8ff" font-family="monospace" font-size="9">${def.key} ${def.wT}T @${st}</text>`;
}
svg += `<text x="6" y="${(H * SCALE + 18).toFixed(1)}" fill="#8d80b8" font-family="monospace" font-size="10">R${round}  ${startTile}タイル / ${rooms.length}部屋   ■岩 ■溶岩 ▬足場 ▬動く床 ▲トゲ ●バー ●火の玉 ●コイン ●アイテム ●敵</text>`;
svg += `</svg>`;
writeFileSync(out, svg);
console.log(`書き出し: ${out}  (${startTile}タイル / ${rooms.length}部屋 / ${Math.round(W * SCALE)}x${Math.round(H * SCALE)}px)`);
