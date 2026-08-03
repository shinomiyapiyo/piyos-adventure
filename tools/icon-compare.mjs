// ─────────────────────────────────────────────────────────────────────────────
// icon-compare.mjs — アプリアイコンの候補と現行を1枚に並べて見比べる（2026-08-03）
//
// 目的: 「次のビルドでどれに差し替えるか」をユーザーが1枚で選べるようにする。
//   ・上段 = 原寸に近い大きさ（240px）
//   ・下段 = 実機のホーム画面に近い小ささ（60px）＋ iOS の角丸 / Android の円マスクを当てたもの
//     ⚠小さくして潰れないかが本番。大きい絵だけで決めない
//
// 実行: node icon-compare.mjs            → _raw/_icon_compare.png
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ITEMS = [
  ['現行（ストア掲載中）', path.join(ROOT, 'resources/icon.png')],
  ['icon_c_final',        path.join(__dirname, '_raw/icon_c_final.png')],
  ['icon_c_now2',         path.join(__dirname, '_raw/icon_c_now2.png')],
  ['icon_c_chick',        path.join(__dirname, '_raw/icon_c_chick.png')],
  ['icon_c',              path.join(__dirname, '_raw/icon_c.png')],
  ['icon_co_a_pink',      path.join(__dirname, '_raw/icon_co_a_pink.png')],
  ['icon_a',              path.join(__dirname, '_raw/icon_a.png')],
  ['icon_b',              path.join(__dirname, '_raw/icon_b.png')],
];

const BIG = 240, SMALL = 60, PAD = 22, LABEL = 26, GAPY = 14;
const COLW = BIG + PAD * 2;
const ROWH = LABEL + BIG + GAPY + SMALL + PAD * 2;

// 角丸（iOS 風・22.37% の連続角丸を単純な角丸で近似）と円のマスク
const roundedMask = (size, r) => Buffer.from(
  `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
const circleMask = (size) => Buffer.from(
  `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

const masked = async (src, size, maskSvg) => {
  const base = await sharp(src).resize(size, size, { fit: 'fill' }).ensureAlpha().toBuffer();
  const mask = await sharp(maskSvg).resize(size, size).extractChannel('red').toBuffer();
  return sharp(base).joinChannel(mask).png().toBuffer();
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cells = [];
for (const [name, file] of ITEMS) {
  try { await sharp(file).metadata(); } catch { console.log(`  skip（無い）: ${name}`); continue; }
  cells.push([name, file]);
}

const COLS = 4;
const rows = Math.ceil(cells.length / COLS);
const W = COLW * COLS, H = ROWH * rows;

const layers = [];
for (let i = 0; i < cells.length; i++) {
  const [name, file] = cells[i];
  const cx = (i % COLS) * COLW, cy = Math.floor(i / COLS) * ROWH;

  layers.push({
    input: Buffer.from(`<svg width="${COLW}" height="${LABEL}">
      <text x="${COLW / 2}" y="18" font-family="Helvetica,Arial" font-size="15" font-weight="700"
            fill="#222" text-anchor="middle">${esc(name)}</text></svg>`),
    left: cx, top: cy + PAD - 18,
  });

  // 上段: 大きく（角丸なし＝素の絵）
  layers.push({ input: await sharp(file).resize(BIG, BIG, { fit: 'fill' }).png().toBuffer(),
                left: cx + PAD, top: cy + PAD + LABEL - 12 });

  // 下段: 実機サイズ ×3（素・iOS角丸・Android円）
  const y2 = cy + PAD + LABEL - 12 + BIG + GAPY;
  const x0 = cx + PAD + Math.round((BIG - (SMALL * 3 + 16 * 2)) / 2);
  layers.push({ input: await sharp(file).resize(SMALL, SMALL, { fit: 'fill' }).png().toBuffer(), left: x0, top: y2 });
  layers.push({ input: await masked(file, SMALL, roundedMask(SMALL, Math.round(SMALL * 0.2237))),
                left: x0 + SMALL + 16, top: y2 });
  layers.push({ input: await masked(file, SMALL, circleMask(SMALL)), left: x0 + (SMALL + 16) * 2, top: y2 });
}

const OUT = path.join(__dirname, '_raw/_icon_compare.png');
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 245, g: 245, b: 247, alpha: 1 } } })
  .composite(layers).png().toFile(OUT);
console.log(`✓ ${path.relative(ROOT, OUT)}  ${W}x${H}  （${cells.length}件・下段は左から 素/iOS角丸/Android円）`);
