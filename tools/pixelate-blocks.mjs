// ─────────────────────────────────────────────────────────────────────────────
// pixelate-blocks.mjs — 生成画像の「模擬ドットの粒」を指定した粒数に揃える（2026-07-31）
//
// ⚠なぜ必要か: Gemini は「横幅に約210粒で描け」と指示しても**430粒**で描いてくることがある
//   （shop01〜04 の作り直し 1.704 で実際に起きた）。粒が細かすぎると
//   `ART_STYLE.md`「📏ドット感の基準」の下限（画面上2.0）を割り、他の一枚絵と質感が揃わない。
//
// ⚠**ファイルを拡大縮小しても画面上の粒は変わらない**（表示は cover で伸縮するため）。
//   変えられるのは「**横幅に何粒並ぶか**」だけ＝一度その粒数まで落として、同じ倍率で戻す。
//
// 使い方:
//   node pixelate-blocks.mjs <入力> <出力> --blocks=211 [--kernel=box|nearest|lanczos] [--sharpen]
//     --blocks  仕上がりの「横幅の粒数」。ショップ背景（表示 571×393）は **211前後**で画面上約2.7
//     --kernel  縮小の方法。既定 linear（面積平均に近い＝ドットが素直に潰れる）／nearest は輪郭が硬い
//
// 検品: node measure-grain.mjs <出力> --shop --region=...
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const getArg = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
if (files.length < 2) { console.error('使い方: node pixelate-blocks.mjs <入力> <出力> --blocks=211'); process.exit(1); }
const [src, dst] = files;
const BLOCKS = Number(getArg('blocks', 211));
const KERNEL = getArg('kernel', 'linear');
const SHARPEN = args.includes('--sharpen');

const meta = await sharp(src).metadata();
const small = { w: BLOCKS, h: Math.round(meta.height * (BLOCKS / meta.width)) };
const block = meta.width / BLOCKS;

let pipe = sharp(src).resize({ width: small.w, height: small.h, kernel: KERNEL, fit: 'fill' });
if (SHARPEN) pipe = pipe.sharpen({ sigma: 0.6 });   // 面積平均でぼけた輪郭を少しだけ立てる
const tiny = await pipe.png().toBuffer();

// 同じ寸法へ nearest で戻す＝1粒が block px の正方形になる
await sharp(tiny)
  .resize({ width: meta.width, height: meta.height, kernel: 'nearest', fit: 'fill' })
  .png()
  .toFile(dst);

console.log(`■ ${src} → ${dst}`);
console.log(`  ${meta.width}×${meta.height} → 粒 ${BLOCKS} 個（1粒 ${block.toFixed(2)}px・${KERNEL}${SHARPEN ? '+sharpen' : ''}）`);
console.log(`  ショップ表示（571×393 cover）での画面上の粒 ≒ ${(block * Math.max(571 / meta.width, 393 / meta.height)).toFixed(2)} CSSpx`);
