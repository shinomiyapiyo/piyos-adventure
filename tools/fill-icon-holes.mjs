// ─────────────────────────────────────────────────────────────────────────────
// fill-icon-holes.mjs
// gpt-image-1 の透過モードは「絵の中の明るい部分／平坦な部分」まで背景と誤認して**くり抜く**。
// くり抜かれた画素は alpha=0 だが **RGBには正しい色が残っている**（例: ショートケーキの生クリームは
// rgba(199,175,130,0)＝クリーム色なのに完全透過）。
// 白背景では穴から白が透けて正しく見えるため気づかないが、図鑑の暗いカード(#26264a)や
// 洞窟の壁の上では**背景が透けて別物に見える**（1.581でユーザー指摘＝ケーキ上部・邪神の巨像）。
//
// ⚠アルファの2値化（harden-icon-alpha.mjs）では直らない: alpha=0 は閾値以下なので 0 のまま残る。
// ⚠「白で上書き」も不要: RGBは既に正しいので、**穴を不透明に戻すだけ**でよい。
//
// 手順: 画像の外周から「透明な画素」を塗りつぶし式にたどって**本当の外側**を特定し、
//       それ以外（＝シルエットの内側の穴）を alpha=255 にする。
//       外側と地続きの隙間（翼と胴体の間など、背景が見えて当然の場所）は塗らない。
//
// 実行: node fill-icon-holes.mjs
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const RAW_DIR    = path.join(__dirname, '_raw');

const OUTSIDE_T = 8;    // これ未満のアルファを「透明」とみなして外側を探索する

// 外周から届かない透明画素（＝内側の穴）を不透明にする
async function fillHoles(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (outside[p]) return;
    if (data[p * 4 + 3] >= OUTSIDE_T) return;   // 不透明＝ここで止まる（シルエットの縁）
    outside[p] = 1; stack.push(p);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p - x) / W;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  let filled = 0;
  for (let p = 0; p < W * H; p++) {
    if (outside[p]) { data[p * 4 + 3] = 0; }
    else if (data[p * 4 + 3] !== 255) { data[p * 4 + 3] = 255; filled++; }
  }
  return { buf: await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), filled, total: W * H };
}

const TARGETS = [
  // ケーキ: 1024pxの生成元から作り直す（穴を塞いでから32pxへ縮小）
  { src: path.join(RAW_DIR, 'gen_icon_shortcake.png'), out: path.join(IMAGES_DIR, 'icon_shortcake.png'), resize: 32 },
  // 邪神の巨像: 出荷している 220x300 をそのまま直す（原寸のまま穴だけ塞ぐ）
  { src: path.join(IMAGES_DIR, 'ug_idol.png'),         out: path.join(IMAGES_DIR, 'ug_idol.png'),        resize: null },
];

for (const t of TARGETS) {
  const name = path.basename(t.out);
  try { await fs.access(t.src); } catch { console.log(`− ${name}: 元画像が無いのでスキップ`); continue; }
  const raw = await fs.readFile(t.src);
  const { buf, filled, total } = await fillHoles(raw);
  let outBuf = buf;
  if (t.resize) {
    outBuf = await sharp(buf).trim({ threshold: 10 })
      .resize(t.resize, t.resize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    // 縮小で生じた中間アルファを潰す（既存の手描きアイコンに合わせてドット絵らしく）
    const { data, info } = await sharp(outBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;
    outBuf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  }
  await fs.writeFile(t.out, outBuf);
  console.log(`✓ ${name}  塞いだ穴=${filled}画素 / 全${total}`);
}
