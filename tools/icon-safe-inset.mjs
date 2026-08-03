// ─────────────────────────────────────────────────────────────────────────────
// icon-safe-inset.mjs — アイコンの絵を少し縮めて、Android のマスクで切られない形にする（2026-07-31）
//
// ⚠なぜ必要か（2026-07-31 実測）
//   Android のアダプティブアイコンは**外周を切る**（安全域＝中央の円 約70%）。
//   ところが `capacitor-assets` が作る `ic_launcher_foreground.png` は
//   **元画像を余白なしでそのまま縮小しているだけ**（432px を実際に確認）。
//   ＝1024の元絵の端まで描くと、**猫耳の先やリボンが実機で切れる**（現行アイコンも同じ状態）。
//
// 🛠 やり方（背景の加工なので手作業でよい。⚠キャラクターは描かない・触らない）
//   ① 元絵を拡大してぼかしたものを下地に敷く（背景のグラデがそのまま外へ伸びる＝継ぎ目が出ない）
//   ② 元絵を scale 倍（既定0.78）に縮めて中央に重ねる
//   → 絵の内容は一切変えずに、外周へ背景の余白だけが足される
//
// 使い方: node icon-safe-inset.mjs <入力> [出力] [--scale=0.78] [--blur=28]
// 検品:   node icon-preview.mjs <出力>   ← 「Android circle 70%」で猫耳が入っているかを見る
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const getArg = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
if (!files.length) { console.error('使い方: node icon-safe-inset.mjs <入力> [出力] [--scale=0.78]'); process.exit(1); }
const SCALE = getArg('scale', 0.78);
const BLUR  = getArg('blur', 28);
const src = files[0];
const dst = files[1] || src.replace(/\.png$/i, '_safe.png');

const meta = await sharp(src).metadata();
const S = Math.min(meta.width, meta.height);          // 正方形前提（アイコン）
const inner = Math.round(S * SCALE);
const over  = Math.round(S / SCALE);                  // 下地はこのぶん拡大してから中央を切る

// ① 下地＝拡大してぼかした元絵（背景の色とグラデをそのまま外へ伸ばす）
const backdrop = await sharp(src)
  .resize(over, over, { fit: 'cover' })
  .extract({ left: Math.round((over - S) / 2), top: Math.round((over - S) / 2), width: S, height: S })
  .blur(BLUR)
  .toBuffer();

// ② 縮めた元絵を中央に重ねる。境目が出ないよう数pxだけ羽根を付ける
const fg = await sharp(src).resize(inner, inner, { fit: 'fill', kernel: 'nearest' }).toBuffer();
const feather = 6;
const maskSvg = Buffer.from(
  `<svg width="${inner}" height="${inner}"><defs><filter id="f"><feGaussianBlur stdDeviation="${feather / 2}"/></filter></defs>` +
  `<rect x="${feather}" y="${feather}" width="${inner - feather * 2}" height="${inner - feather * 2}" fill="#fff" filter="url(#f)"/></svg>`);
const fgMask = await sharp(maskSvg).extractChannel(0).toBuffer();
const fgRGBA = await sharp(fg).ensureAlpha().joinChannel(fgMask).png().toBuffer();

const off = Math.round((S - inner) / 2);
await sharp(backdrop)
  .composite([{ input: fgRGBA, left: off, top: off }])
  .removeAlpha()                                       // ⚠iOS はアイコンにアルファを許さない
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(dst);

console.log(`■ ${path.basename(src)} → ${path.basename(dst)}`);
console.log(`  ${S}x${S} のまま、絵を ${(SCALE * 100).toFixed(0)}%（${inner}px）に縮めて中央へ。外周は背景を伸ばして埋めた`);
console.log(`  → Android の安全域（中央の円70%）に猫耳とリボンが入るかを icon-preview.mjs で確認する`);
