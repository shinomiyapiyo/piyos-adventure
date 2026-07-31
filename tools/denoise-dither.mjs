// ─────────────────────────────────────────────────────────────────────────────
// denoise-dither.mjs — 既にある一枚絵から「ディザの斑点ノイズ」だけを落とす（2026-08-01）
//
// ⚠**絵は描き直さない。** ユーザー厳命（2026-08-01）:
//   「私が言ったのはそもそもクオリティが低いので再生成したいという理由ではなく、
//     **粗い上にノイズも消したいの一点のみ**。余計なことをしないでほしい」
//   ＝生成AIに描かせ直すと**別人になる**（実際に `eyes_closeup` で失敗した）。
//   構図・キャラ・色は一切変えず、**斑点だけ**を消す処理でいく。
//
// 手口: メディアンフィルタ。孤立した点（ディザ）は消えるが、ブロックの面と輪郭は残る。
//   ⚠平均化（ブラー）を単体で使うとブロックの輪郭までボケて別の絵に見えるので使わない。
//   `--soft=N` を足すと、メディアンの後にごく弱いブラーをかけて**巨大なブロックの段差だけ**和らげる
//   （「粗い」の対策。0.4〜0.8 程度。強くするとドット絵に見えなくなる）
//
// 使い方:
//   node denoise-dither.mjs <入力> <出力> [--median=3] [--soft=0]
// 検品: 実機の表示サイズまで nearest で拡大して、処理前と等倍で並べて見る
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const getArg = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
if (files.length < 2) { console.error('使い方: node denoise-dither.mjs <入力> <出力> [--median=3] [--soft=0]'); process.exit(1); }
const [src, dst] = files;
const MEDIAN = getArg('median', 3);
const SOFT   = getArg('soft', 0);

const meta = await sharp(src).metadata();
let pipe = sharp(src);
if (MEDIAN > 1) pipe = pipe.median(MEDIAN);
if (SOFT > 0)   pipe = pipe.blur(SOFT);
await pipe.png().toFile(dst);

// ざらつきの量＝隣接画素差の平均（処理前後で比較する）
async function grit(f) {
  const m = await sharp(f).metadata();
  const x0 = Math.round(m.width * 0.38), y0 = Math.round(m.height * 0.5);
  const w = Math.round(m.width * 0.24), h = Math.round(m.height * 0.18);
  const { data, info } = await sharp(f).extract({ left: x0, top: y0, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
  let d = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
    const o = (y * w + x) * info.channels, o2 = (y * w + x + 1) * info.channels;
    d += Math.abs(data[o] - data[o2]) + Math.abs(data[o + 1] - data[o2 + 1]) + Math.abs(data[o + 2] - data[o2 + 2]);
    n++;
  }
  return (d / n / 3);
}
console.log(`■ ${src} → ${dst}  (${meta.width}x${meta.height} / median=${MEDIAN}${SOFT ? ' soft=' + SOFT : ''})`);
console.log(`  ざらつき（肌の平らな面・隣接画素差の平均）: ${(await grit(src)).toFixed(2)} → ${(await grit(dst)).toFixed(2)}`);
