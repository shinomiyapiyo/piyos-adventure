// ─────────────────────────────────────────────────────────────────────────────
// icon-fill-pockets.mjs — ツインテールと体の隙間に残った暗い背景だけを塗り替える（2026-08-03）
//
// ⚠なぜ専用ツールが要るのか（2026-08-03に実測して分かったこと）
//   隙間の色 rgb(66,53,71) と **髪の中間色 rgb(65,52,70) は同じ**。
//   だから `icon-recolor-bg.mjs` のような「色で背景を選ぶ」方式では原理的に分けられず、
//   実際 `icon_c_final.png` は**左のツインテールが背景色に塗り潰されて消えた**（(90,800)=rgb(254,153,129)）。
//   → **色ではなく「黒い輪郭線で囲まれた領域」で切る**。ドット絵は要素が黒線で囲まれているので、
//     隙間の内側に種を置いて **黒線を越えない塗り広げ**をすれば、髪へは漏れない。
//
// 🛠 手順
//   ① 種（SEEDS）から4近傍で塗り広げる。次の画素へ進める条件は
//        ・黒い輪郭線ではない（明度 >= LINE_MAX）
//        ・種の色に近い（RGB距離 <= TOL）
//      ＝ 輪郭にぶつかった時点で止まる。髪の明るいハイライト（砂色の房）にも入らない。
//   ② 塗る色＝**その画素のY座標における周りの背景色**（左右の外側から実測した縦グラデ）。
//      ベタ塗りではなく元の背景と同じ縦グラデにするので、境目が出ない。
//   ③ --preview でマスクを赤く重ねた検品画像を書き出す。**必ず先に目で見てから --apply**。
//
// 実行: node icon-fill-pockets.mjs _raw/icon_c_chick.png --preview
//       node icon-fill-pockets.mjs _raw/icon_c_chick.png _raw/icon_c_fix.png --apply
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const SRC = files[0] || '_raw/icon_c_chick.png';
const DST = files[1] || SRC.replace(/\.png$/i, '_fix.png');
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const TOL      = num('tol', 46);   // 種の色からのRGB距離。ここを超える色には進まない
const LINE_MAX = num('line', 22);  // これより暗い＝黒い輪郭線。越えない

// 隙間の内側に置く種（1024基準）。左右のくさび形にそれぞれ複数置く
const SEEDS = [[262, 880], [250, 950], [290, 820], [300, 1000], [232, 1010],
               [762, 900], [775, 960], [750, 830], [790, 1010], [735, 1005]];

const img = sharp(SRC);
const { width: W, height: H } = await img.metadata();
const S = W / 1024;
const { data } = await img.raw().toBuffer({ resolveWithObject: true });
const C = data.length / (W * H);
const idx = (x, y) => (y * W + x) * C;
const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

// 種の平均色
let sr = 0, sg = 0, sb = 0;
for (const [x, y] of SEEDS) { const i = idx(Math.round(x * S), Math.round(y * S)); sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; }
sr /= SEEDS.length; sg /= SEEDS.length; sb /= SEEDS.length;
console.log(`種の色: rgb(${sr.toFixed(0)},${sg.toFixed(0)},${sb.toFixed(0)})  tol=${TOL}  輪郭しきい値=${LINE_MAX}`);

const near = (i) => {
  const d = Math.hypot(data[i] - sr, data[i + 1] - sg, data[i + 2] - sb);
  return d <= TOL && lum(i) >= LINE_MAX;
};

// 塗り広げ
const mask = new Uint8Array(W * H);
const stack = [];
for (const [x, y] of SEEDS) {
  const px = Math.round(x * S), py = Math.round(y * S);
  if (!near(idx(px, py))) { console.log(`  ⚠種 (${x},${y}) は条件を外れている（色が違う）`); continue; }
  stack.push(px, py);
}
while (stack.length) {
  const y = stack.pop(), x = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (mask[p]) continue;
  if (!near(p * C)) continue;
  mask[p] = 1;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}
const filled = mask.reduce((a, b) => a + b, 0);
console.log(`塗る画素: ${filled}（全体の ${(filled / (W * H) * 100).toFixed(2)}%）`);

// 塗る色 = そのYでの周りの背景。左右の外側 12px 平均から縦グラデを作る
const bgAt = new Array(H);
for (let y = 0; y < H; y++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of [2, 5, 8, 11, W - 3, W - 6, W - 9, W - 12]) {
    const i = idx(x, y);
    if (lum(i) > 90) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  }
  bgAt[y] = n ? [r / n, g / n, b / n] : null;
}
// 端が髪で埋まっている行は、上下の有効な行から補う
let last = null;
for (let y = 0; y < H; y++) { if (bgAt[y]) last = bgAt[y]; else bgAt[y] = last; }
last = null;
for (let y = H - 1; y >= 0; y--) { if (bgAt[y]) last = bgAt[y]; else bgAt[y] = last; }

const out = Buffer.from(data);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!mask[y * W + x]) continue;
  const i = idx(x, y), [r, g, b] = bgAt[y];
  out[i] = r; out[i + 1] = g; out[i + 2] = b;
}

if (PREVIEW) {
  const ov = Buffer.from(data);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    const i = idx(x, y); ov[i] = 255; ov[i + 1] = 40; ov[i + 2] = 40;
  }
  const p = SRC.replace(/\.png$/i, '_maskpreview.png');
  await sharp(ov, { raw: { width: W, height: H, channels: C } }).png().toFile(p);
  console.log(`✓ マスク検品: ${p}（赤く塗った所が置き換わる）`);
}
if (APPLY) {
  await sharp(out, { raw: { width: W, height: H, channels: C } }).png({ compressionLevel: 9 }).toFile(DST);
  console.log(`✓ 出力: ${DST}`);
} else if (!PREVIEW) {
  console.log('（確認のみ）--preview でマスク画像 / --apply で書き出し');
}
