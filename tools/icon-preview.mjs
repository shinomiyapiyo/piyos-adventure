// ─────────────────────────────────────────────────────────────────────────────
// icon-preview.mjs — アプリアイコン候補を「実際の見え方」で並べて検品する（2026-07-31）
//
// ⚠アイコンは 1024px で見ても意味がない。判断材料は次の3つ:
//   ① **60px（ホーム画面の実寸に近い）で何だか分かるか**
//   ② **iOS の squircle マスクで角の中身が切れないか**
//   ③ **Android のアダプティブマスクで角が切られないか**
//
// ⚠**Android は絵を縮めて置いてくれる**（2026-07-31 訂正）。`ic_launcher.xml` に
//   `android:inset="16.7%"` が入っており、108dp のキャンバスの中央 66.6%（＝マスクの見える範囲 72dp）に
//   前景と背景を収める。`ic_launcher_round.png` も円に収まるよう縮小して生成されている。
//   ＝**元絵を全面に描いてよい。切られるのは「正方形の四隅」だけ**。
//   （当初 70% の円で見て「猫耳が切れる」と誤って報告した。マスクは元絵に内接する円で見るのが正しい）
//
// 使い方: node icon-preview.mjs [候補ファイル…]  （省略時は _raw/icon_*.png と現行アイコン）
// 出力: _raw/sheet_icon_preview.png
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const given = process.argv.slice(2).filter(a => !a.startsWith('--'));
let files = given.length ? given.map(f => path.resolve(process.cwd(), f)) : null;
if (!files) {
  const raws = (await fs.readdir(RAW_DIR)).filter(f => /^icon_[a-z]\.png$/.test(f)).sort();
  files = [path.join(IMAGES_DIR, 'icon-1024.png'), ...raws.map(f => path.join(RAW_DIR, f))];
}

const BG = { r: 22, g: 20, b: 28, alpha: 1 };
const CELL = 260, LH = 22, PAD = 8;

// iOS 風 squircle（superellipse n=5）と Android 風の円マスク
const squircleSvg = (s) => {
  const n = 5, r = s / 2, pts = [];
  for (let i = 0; i <= 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    const c = Math.cos(t), si = Math.sin(t);
    const x = r + Math.sign(c) * r * Math.pow(Math.abs(c), 2 / n);
    const y = r + Math.sign(si) * r * Math.pow(Math.abs(si), 2 / n);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return Buffer.from(`<svg width="${s}" height="${s}"><polygon points="${pts.join(' ')}" fill="#fff"/></svg>`);
};
const circleSvg = (s, frac = 0.70) =>
  Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${(s * frac) / 2}" fill="#fff"/></svg>`);

async function maskWith(buf, s, svg) {
  const base = await sharp(buf).resize(s, s, { fit: 'fill', kernel: 'nearest' }).ensureAlpha().toBuffer();
  const m = await sharp(svg).resize(s, s).extractChannel(0).toBuffer();
  return sharp(base).joinChannel(m).png().toBuffer();
}

const label = (w, h, text, color = '#ffd76a') =>
  Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#0d0c12"/>` +
    `<text x="6" y="${Math.round(h * 0.72)}" font-size="${Math.round(h * 0.6)}" fill="${color}" font-family="Menlo,monospace">` +
    `${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);

const COLS = [
  { title: 'as-is 260px', w: CELL },
  { title: 'iOS squircle', w: CELL },
  { title: 'Android の円マスク（inset込み）', w: CELL },
  { title: '180 / 120 / 60px（実寸）', w: 400 },
];
const rowH = CELL + LH + PAD;
const W = COLS.reduce((a, c) => a + c.w, 0) + PAD;
const H = rowH * files.length + LH;
const comps = [];

// 見出し
for (let c = 0, x = 0; c < COLS.length; c++) { comps.push({ input: label(COLS[c].w, LH, COLS[c].title, '#8fe3ff'), left: x, top: 0 }); x += COLS[c].w; }

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const top = LH + i * rowH;
  const src = await fs.readFile(f);
  const meta = await sharp(src).metadata();

  comps.push({ input: await sharp(src).resize(CELL - PAD, CELL - PAD, { fit: 'fill', kernel: 'nearest' }).png().toBuffer(), left: PAD / 2, top: top + PAD / 2 });
  comps.push({ input: await maskWith(src, CELL - PAD, squircleSvg(CELL - PAD)), left: CELL + PAD / 2, top: top + PAD / 2 });
  comps.push({ input: await maskWith(src, CELL - PAD, circleSvg(CELL - PAD, 1.0)), left: CELL * 2 + PAD / 2, top: top + PAD / 2 });

  // 小さい実寸（180 / 120 / 60）を横に並べる。⚠縦に積むとセルからはみ出て次の行に潰される
  let x = CELL * 3 + PAD / 2;
  for (const s of [180, 120, 60]) {
    comps.push({ input: await maskWith(src, s, squircleSvg(s)), left: x, top: top + PAD / 2 + (CELL - PAD - s) });
    x += s + 10;
  }

  comps.push({ input: label(W, LH, `${path.basename(f)}   ${meta.width}x${meta.height}  alpha=${!!meta.hasAlpha}`), left: 0, top: top + CELL + PAD });
}

await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
  .composite(comps).png().toFile(path.join(RAW_DIR, 'sheet_icon_preview.png'));
console.log(`✓ _raw/sheet_icon_preview.png  (${files.length}件)`);
for (const f of files) console.log('  ・' + path.relative(path.resolve(__dirname, '..'), f));
