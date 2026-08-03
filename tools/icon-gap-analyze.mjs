// icon-gap-analyze.mjs — 隙間に残った「古い背景色」と「髪の色」が分離できるか調べる（2026-08-03・調査用）
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = path.join(__dirname, '_raw/icon_c_chick.png');
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const at = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };

// 隙間の帯（左右）と、明らかに髪だけの場所を分けて色を集める
const zones = {
  '隙間(左)': { x0: 170, x1: 350, y0: 580, y1: 880 },
  '隙間(右)': { x0: 680, x1: 860, y0: 580, y1: 880 },
  '髪(前髪)': { x0: 420, x1: 600, y0: 200, y1: 300 },
  '背景(上)': { x0: 380, x1: 640, y0: 10, y1: 60 },
};
const S = W / 1024;
for (const [name, z] of Object.entries(zones)) {
  const hist = new Map();
  for (let y = Math.round(z.y0 * S); y < Math.round(z.y1 * S); y++)
    for (let x = Math.round(z.x0 * S); x < Math.round(z.x1 * S); x++) {
      const [r, g, b] = at(x, y);
      const k = `${r >> 3 << 3},${g >> 3 << 3},${b >> 3 << 3}`;
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const tot = [...hist.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${name}`);
  for (const [k, n] of top) {
    const [r, g, b] = k.split(',').map(Number);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    console.log(`   rgb(${String(r).padStart(3)},${String(g).padStart(3)},${String(b).padStart(3)})  ${(n / tot * 100).toFixed(1)}%  明度${(0.2126*r+0.7152*g+0.0722*b).toFixed(0).padStart(3)}  彩度差${mx - mn}`);
  }
}
