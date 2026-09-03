// ─────────────────────────────────────────────────────────────────────────────
// template-gemini-sprite.mjs — 透過スプライト/アイコンを Gemini で作る雛形
//
// 使い方:
//   1. このファイルを <repo>/tools/gemini-<name>.mjs へ複製する
//   2. ASSETS を書き換える（出力名・実寸・プロンプト）。それ以外は基本さわらない
//   3. 候補を作る:  zsh -ic 'cd <repo>/tools && node gemini-<name>.mjs'
//      オプション:  --model=<id>  --n=<候補数 1-6>  --only=key1,key2
//   4. ⚠候補を**そのターンのうちに**ユーザーへ見せる（SendUserFile / display:"render"）
//   5. 採用:        node gemini-<name>.mjs --pick=key1:2,key2:1
//
// ⚠鍵 GEMINI_API_KEY は通常のシェルに無い。必ず `zsh -ic` 経由で実行すること。
// ⚠Gemini は透過PNGを返さない。緑背景を指定してこちらでクロマキーする（下の COMMON 参照）。
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');   // ⚠作品によって出力先が違う
const RAW_DIR    = path.resolve(__dirname, '_raw');
const DEFAULT_MODEL = 'gemini-3-pro-image';                   // Nano Banana 2

const args   = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL  = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const N      = Math.max(1, Math.min(6, parseInt(getArg('n') || '2', 10)));
const ONLY   = (getArg('only') || '').split(',').filter(Boolean);
const PICK   = getArg('pick');

// ── 全アセット共通の作法 ──────────────────────────────────────────────────
// ⚠緑背景の指定は消さないこと。「透明で」と書くとモデルは**市松模様を絵として描く**。
//   被写体に緑が入るなら CHROMA ごとマゼンタ等へ変える（chromaKey の判定式も合わせて直す）。
const COMMON = [
  'Retro 16-bit pixel art game sprite.',
  'Thick clean dark outline, bold crisp pixels, strong readable silhouette at very small size.',
  'The background must be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the entire canvas —',
  'a chroma key screen. Do NOT draw a checkerboard, do NOT draw a gradient, do NOT draw any scenery.',
  'Nothing in the object itself may be green.',
  'No text, no border, no frame, no cast shadow on the ground.',
  'Just the single object, centered, filling most of the frame.',
].join(' ');

// ── ここだけ書き換える ────────────────────────────────────────────────────
// size: 正方形なら数値、横長/縦長なら {w,h}。
// ⚠**描画コードの drawImage(img,x,y,W,H) の2倍**にする。正方形で書き出すと横長のものが潰れる。
const ASSETS = {
  sample: {
    out: 'item_sample.png',
    size: 32,
    prompt: [
      'A single ○○ game item icon.',
      // 同じ棚に並ぶ物があるなら、輪郭で区別が付くことを明示する:
      // 'so its silhouette is instantly distinct from a round idol head.',
      COMMON,
    ].join(' '),
  },
};
// ──────────────────────────────────────────────────────────────────────────

function extractImageBuffer(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\nモデル応答:\n${text}` : ''));
}

async function callModel(ai, contents) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return extractImageBuffer(await ai.models.generateContent({ model: MODEL, contents })); }
    catch (e) {
      lastErr = e; const w = 2500 * attempt;
      console.warn(`  失敗(${attempt}/4): ${e.message}  ${w}ms待機...`);
      await new Promise(r => setTimeout(r, w));
    }
  }
  throw lastErr;
}

// クロマキー: 緑の背景を透明に落とす。⚠**fillHoles より前**に通すこと
//   （先に穴埋めをすると背景が「外側」と判定されず、全面が不透明のまま残る）。
// 判定は「緑が十分強く、赤と青の**両方**をはっきり上回る」＝木の茶や石の灰には当たらない。
// 縁のにじみ（スピル）は、残った画素の緑成分を赤青の平均へ寄せて中和する。
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (g > 90 && g > r * 1.35 && g > b * 1.35) { data[p + 3] = 0; continue; }
    const rb = (r + b) / 2;
    if (g > rb * 1.15) data[p + 1] = Math.round(rb * 1.15);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// 外周から届かない透明画素（＝シルエット内側の穴）を不透明に戻す。
// ⚠**縮小より先に**やること。生成画像は明るい部分がくり抜かれることがあり、縮小後だと直せない。
async function fillHoles(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const outside = new Uint8Array(W * H), stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (outside[p] || data[p * 4 + 3] >= 8) return;
    outside[p] = 1; stack.push(p);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  for (let p = 0; p < W * H; p++) data[p * 4 + 3] = outside[p] ? 0 : 255;
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// ⚠順序が重要: chromaKey → fillHoles → trim → resize → 半透明の縁を潰す
async function toSprite(buf, size) {
  const W = (typeof size === 'number') ? size : size.w;
  const H = (typeof size === 'number') ? size : size.h;
  const filled = await fillHoles(await chromaKey(buf));
  const small = await sharp(filled).ensureAlpha().trim({ threshold: 10 })
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;   // 縁のぼやけを消す
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });

if (PICK) {   // 候補を確定させるだけのモード（例: --pick=sample:2）
  for (const pair of PICK.split(',')) {
    const [key, idx] = pair.split(':');
    const a = ASSETS[key];
    if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
    const src = path.join(RAW_DIR, `${key}_cand_${idx}.png`);
    await fs.writeFile(path.join(IMAGES_DIR, a.out), await toSprite(await fs.readFile(src), a.size));
    console.log(`✓ images/${a.out} ← 候補${idx}`);
  }
  process.exit(0);
}

const ai = new GoogleGenAI({ apiKey });
for (const key of (ONLY.length ? ONLY : Object.keys(ASSETS))) {
  const a = ASSETS[key];
  if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
  const label = (typeof a.size === 'number') ? `${a.size}x${a.size}` : `${a.size.w}x${a.size.h}`;
  console.log(`\n■ ${key} → ${a.out}（${label}）`);
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [{ text: a.prompt }] }]);
    await fs.writeFile(path.join(RAW_DIR, `${key}_cand_${i}.png`), buf);                       // 生（確認用）
    await fs.writeFile(path.join(RAW_DIR, `${key}_cand_${i}_${label}.png`), await toSprite(buf, a.size)); // 実寸
    console.log(`  ✓ 候補${i}`);
  }
}
console.log('\n候補は tools/_raw/ に出力しました。');
console.log('⚠このあと **同じターンのうちに** 候補を全部ユーザーへ表示すること（SendUserFile / display:"render"）。');
console.log('採用は --pick=key:番号 で images/ へ配置します。');
