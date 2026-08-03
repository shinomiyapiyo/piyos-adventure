// ─────────────────────────────────────────────────────────────────────────────
// icon-add-chick.mjs — 既にあるひよこを切り出して、別のアイコンの肩へ貼る（2026-07-31）
//
// ⚠ユーザー指示（2026-07-31）:「**2番がいいですね。このまま画像を変えずに肩にひよこを乗せられない？**」
//   ＝**cの顔は1画素も変えたくない**。だが生成で足すと顔が変わる（`icon_co_a` がその実例）。
//   → **生成しない**。`_raw/icon_co_a.png` に描かれたひよこ（同じモデル・同じ用途・同じ画風）を
//     切り出して貼る。⚠**Claude が自分でひよこを描くのは禁止**（CLAUDE.md）なので、
//     既にある絵を流用するこの方法が正しい。
//
// 🛠 切り出し方
//   ひよこは「明るいクリーム色の体＋オレンジのくちばし」＝**明るい画素**、周りは暗い袖と髪。
//   ① 体の中に種を置いて「明るい画素」だけを塗り広げる（暗い縁は入らない）
//   ② そのマスクを2px膨らませて**黒い輪郭線を含める**（貼り先も暗い袖なので継ぎ目は出ない）
//
// 使い方:
//   node icon-add-chick.mjs <貼り先> <出力> [--x=170] [--y=560] [--scale=1] [--preview]
//   （切り出し元と範囲は下の SRC/BOX で固定。別のひよこを使うなら書き換える）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(__dirname, '_raw');
const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
if (files.length < 2) { console.error('使い方: node icon-add-chick.mjs <貼り先> <出力> [--x=170 --y=560 --scale=1]'); process.exit(1); }
const [DSTBASE, OUT] = files;
const DX = num('x', 170), DY = num('y', 560), SCALE = num('scale', 1);
const PREVIEW = args.includes('--preview');
const DILATE = num('dilate', 3);

// 切り出し元（`icon_co_a.png` の肩のひよこ）
const SRC = path.join(RAW, 'icon_co_a.png');
// ⚠height を欲張ると**服の黄色を拾って滲みになる**（最初の試作で出た）。ひよこの体だけに切る
const BOX = { left: 180, top: 630, width: 210, height: 238 };
// ⚠体の下まで入れると**右下で服の黄色を拾う**ので、その一角だけマスクから外す（BOX内の座標）
const KILL = { x0: 122, y0: 208, x1: 210, y1: 238 };
const SEED = { x: 110, y: 130 };      // BOX 内の座標（ひよこの体の中）

const { data, info } = await sharp(SRC).extract(BOX).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const luma = (i) => 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];

// ① 明るい画素だけを塗り広げる
const m = new Uint8Array(W * H);
const start = SEED.y * W + SEED.x;
m[start] = 1;
const q = [start];
let qi = 0;
while (qi < q.length) {
  const i = q[qi++], x = i % W, y = (i - x) / W;
  const push = (j) => { if (!m[j] && luma(j) > 120) { m[j] = 1; q.push(j); } };
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (y > 0) push(i - W);
  if (y < H - 1) push(i + W);
}
// ② 2px 膨らませて黒い輪郭を含める
const dilate = (src, r) => {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let hit = 0;
    for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (src[ny * W + nx]) { hit = 1; break; }
    }
    out[y * W + x] = hit;
  }
  return out;
};
for (let y = KILL.y0; y < KILL.y1; y++) for (let x = KILL.x0; x < KILL.x1; x++) m[y * W + x] = 0;
const mask = dilate(m, DILATE);   // ⚠輪郭線を含めるため膨らませる（貼り先も暗いので継ぎ目は出ない）
let n = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
console.log(`切り出したひよこ: ${W}x${H} のうち ${n}px（${((n / (W * H)) * 100).toFixed(0)}%）`);

// RGBA のひよこを作る
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = data[i * 3]; rgba[i * 4 + 1] = data[i * 3 + 1]; rgba[i * 4 + 2] = data[i * 3 + 2];
  rgba[i * 4 + 3] = mask[i] ? 255 : 0;
}
let chick = sharp(rgba, { raw: { width: W, height: H, channels: 4 } });
if (SCALE !== 1) chick = sharp(await chick.png().toBuffer()).resize(Math.round(W * SCALE), Math.round(H * SCALE), { kernel: 'nearest' });
const chickBuf = await chick.png().toBuffer();
if (PREVIEW) { await sharp(chickBuf).png().toFile(path.join(RAW, 'chick_cut.png')); console.log('  ✓ _raw/chick_cut.png（切り出したひよこ）'); }

await sharp(path.resolve(process.cwd(), DSTBASE))
  .composite([{ input: chickBuf, left: DX, top: DY }])
  .png({ compressionLevel: 9, effort: 10 })
  .toFile(path.resolve(process.cwd(), OUT));
console.log(`✓ ${OUT}  （ひよこを (${DX},${DY}) に倍率${SCALE}で貼った・顔と衣装は無加工）`);
