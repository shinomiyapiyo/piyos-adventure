// ─────────────────────────────────────────────────────────────────────────────
// piyo-cuts-sheet.mjs — いま採用されている「ぴよ氏の一枚絵／カットイン」を並べて絵柄を見比べる（2026-07-31）
//
// ⚠**ステージのプレイヤースプライトは対象外**（ユーザー指示）。`sprites.js` の 64px 系や
//   きせかえの立ち絵、`keeper_*.png`（店員アイコン）、`ug_idol.png`（地底の偶像＝ぴよ氏ではない）、
//   `logo.png` / `nullpo_works_white.png`（ロゴ）は入れない。
//
// 出力2枚:
//   _raw/sheet_piyo_cuts.png  … 全体一覧（絵の使われ方が分かる）
//   _raw/sheet_piyo_faces.png … **顔だけを同じ大きさに揃えた比較**（絵柄の差はここに出る）
//
// ⚠`face` は手で拾った head box（left,top,size）。絵を差し替えたら**ここも直す**。
// 実行: node piyo-cuts-sheet.mjs
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

// label は SVG に流すので ASCII のみ（日本語フォントの有無に依存させない）
const CUTS = [
  { f: 'title.jpg',            label: 'title  BASE',              face: [468,  95, 220, 220] },
  { f: 'title_shop.jpg',       label: 'title_shop  1.710',        face: [185,  40, 340, 340] },
  { f: 'shop01.jpg',           label: 'shop01 default  1.704',    face: [790, 180, 160, 160] },
  { f: 'shop02.jpg',           label: 'shop02 success  1.706',    face: [745, 195, 165, 165] },
  { f: 'shop04.jpg',           label: 'shop04 no-money  1.704',   face: [760, 185, 165, 165] },
  { f: 'shop05.jpg',           label: 'shop05 exit  1.699',       face: [330, 110, 270, 270] },
  { f: 'ug_shop01.jpg',        label: 'ug_shop01 crone  1.701',   face: [720, 230, 330, 330] },
  { f: 'manju_scene.jpg',      label: 'manju  1.702',             face: [520, 240, 360, 360] },
  { f: 'soba_shop_scene.jpg',  label: 'soba  1.710',              face: [495, 105, 310, 310] },
  { f: 'shortcake_scene.jpg',  label: 'shortcake  1.700 (casual)',face: [545, 190, 230, 230] },
  { f: 'tutorial_clear.jpg',   label: 'tutorial_clear  1.700 (casual)', face: [570, 155, 175, 175] },
  { f: 'ug_ending.jpg',        label: 'ug_ending  (back view)',   face: [395, 405, 120, 120] },
  { f: 'special_cutin.png',    label: 'special_cutin  1.709', face: [540, 100, 240, 240] },
  { f: 'eyes_closeup.jpg',     label: 'eyes_closeup 1.711',        face: [180,  40, 660, 500] },
  { f: 'icon-1024.png',        label: 'icon-1024 (app icon)',     face: [230, 150, 620, 620] },
];

const BG = { r: 18, g: 16, b: 24, alpha: 1 };
function labelSvg(w, h, text, color = '#ffd76a') {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#0d0c12"/>` +
    `<text x="6" y="${Math.round(h * 0.72)}" font-size="${Math.round(h * 0.62)}" fill="${color}" ` +
    `font-family="Menlo,monospace">${esc}</text></svg>`);
}

async function sheet({ out, cols, cellW, cellH, crop }) {
  const LABEL_H = 22;
  const rows = Math.ceil(CUTS.length / cols);
  const W = cols * cellW, H = rows * (cellH + LABEL_H);
  const comps = [];
  for (let i = 0; i < CUTS.length; i++) {
    const c = CUTS[i];
    const col = i % cols, row = Math.floor(i / cols);
    let img = sharp(path.join(IMAGES_DIR, c.f));
    if (crop) {
      // ⚠画像の外に出る box は縮めて拾う（座標を手打ちしているので取り違えても落ちないように）
      const m = await img.metadata();
      let [left, top, size] = c.face;
      size = Math.min(size, m.width, m.height);
      left = Math.max(0, Math.min(left, m.width - size));
      top  = Math.max(0, Math.min(top,  m.height - size));
      if (left !== c.face[0] || top !== c.face[1] || size !== c.face[2]) {
        console.warn(`  ⚠${c.f}: face box を ${c.face.join(',')} → ${left},${top},${size} に補正（${m.width}x${m.height}）`);
      }
      img = sharp(await img.extract({ left, top, width: size, height: size }).toBuffer());
    }
    const buf = await img
      .resize(cellW - 4, cellH - 4, { fit: 'contain', background: BG, kernel: 'nearest' })
      .png().toBuffer();
    comps.push({ input: buf, left: col * cellW + 2, top: row * (cellH + LABEL_H) + 2 });
    comps.push({ input: labelSvg(cellW, LABEL_H, c.label), left: col * cellW, top: row * (cellH + LABEL_H) + cellH });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite(comps).png().toFile(path.join(RAW_DIR, out));
  console.log(`✓ _raw/${out}  (${CUTS.length}枚 / ${cols}列 / ${W}x${H})`);
}

await sheet({ out: 'sheet_piyo_cuts.png',  cols: 3, cellW: 440, cellH: 294, crop: false });
await sheet({ out: 'sheet_piyo_faces.png', cols: 5, cellW: 264, cellH: 264, crop: true  });
