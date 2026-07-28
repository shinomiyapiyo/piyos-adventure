// pixelize-trials.mjs — 生成画像を「本物のドット絵」に落とす後処理の比較試験（1.666）。
// ⚠**API を使わない**。_raw の生成済み画像から後処理だけを変えて candidates を作る。
//
// なぜ要るか: Gemini が返すのは滑らかなイラストで、そのまま lanczos3 で 64px へ縮めると
//   線が消えて「ドット絵に見えない」と却下された（1.666・ユーザー判断）。
//   ドット絵に見せる条件は **①面が平ら（色数が少ない） ②境界がくっきり（補間しない）**。
//
// 使い方: node pixelize-trials.mjs <入力keyed.png> <出力ディレクトリ>
import sharp from 'sharp';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const [, , SRC, OUTDIR] = process.argv;
const OUT = 64;

async function rawRGBA(buf) {
  const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: r.data, width: r.info.width, height: r.info.height };
}
function bboxA(d, thr = 50) {
  const { data, width, height } = d; let a = width, b = height, c = -1, e = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; }
  }
  return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1 };
}
// 色数を減らして面を平らにする。⚠ドット絵らしさは色数で決まるので、ここが本体。
function quantize(data, levels) {
  const step = 255 / (levels - 1);
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue;
    data[p]     = Math.round(Math.round(data[p]     / step) * step);
    data[p + 1] = Math.round(Math.round(data[p + 1] / step) * step);
    data[p + 2] = Math.round(Math.round(data[p + 2] / step) * step);
  }
}
// 外周に暗い輪郭を1px足す。⚠既存スプライトは太い黒線が特徴なので、これが無いと浮く。
function addOutline(data, W, H) {
  const src = Uint8Array.from(data);
  const at = (x, y) => (y * W + x) * 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = at(x, y);
    if (src[p + 3] !== 0) continue;
    let near = false;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (src[at(nx, ny) + 3] !== 0) { near = true; break; }
    }
    if (near) { data[p] = 26; data[p + 1] = 18; data[p + 2] = 34; data[p + 3] = 255; }
  }
}

async function variant(srcBuf, { charH, levels, outline, kernel }) {
  const d = await rawRGBA(srcBuf);
  const bb = bboxA(d);
  let tH = charH;
  let tW = Math.max(1, Math.round(bb.w * tH / bb.h));
  if (tW > OUT) { tW = OUT; tH = Math.max(1, Math.round(bb.h * tW / bb.w)); }
  const small = await sharp(srcBuf)
    .extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h })
    .resize(tW, tH, { fit: 'fill', kernel }).png().toBuffer();
  const s = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = s.data;
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 110 ? 255 : 0;  // 半透明の縁を潰す
  quantize(data, levels);
  if (outline) addOutline(data, s.info.width, s.info.height);
  const body = await sharp(data, { raw: { width: s.info.width, height: s.info.height, channels: 4 } }).png().toBuffer();
  // 64x64 の枠に足元合わせで置く
  const left = Math.round((OUT - s.info.width) / 2);
  const top  = OUT - s.info.height - 2;
  return sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: body, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
}

const srcBuf = await fs.readFile(SRC);
await fs.mkdir(OUTDIR, { recursive: true });
const TRIALS = [
  { name: 'A_現状',          charH: 54, levels: 256, outline: false, kernel: 'lanczos3' },
  { name: 'B_色数8',         charH: 54, levels: 8,   outline: false, kernel: 'lanczos3' },
  { name: 'C_色数6_線あり',  charH: 54, levels: 6,   outline: true,  kernel: 'lanczos3' },
  { name: 'D_粗く40_色数6',  charH: 40, levels: 6,   outline: true,  kernel: 'lanczos3' },
  { name: 'E_粗く32_色数5',  charH: 32, levels: 5,   outline: true,  kernel: 'cubic' },
];
for (const t of TRIALS) {
  const buf = await variant(srcBuf, t);
  const f = path.join(OUTDIR, `${t.name}.png`);
  await fs.writeFile(f, buf);
  const m = await sharp(buf).metadata();
  await sharp(buf).resize(m.width * 5, m.height * 5, { kernel: 'nearest' }).png().toFile(path.join(OUTDIR, `${t.name}_x5.png`));
  console.log(`✓ ${t.name}`);
}
