// ─────────────────────────────────────────────────────────────────────────────
// gemini-shiori.mjs — 「ぼうけんのしおり」のアイコンを生成（1.633）
// ⚠画像生成は **Gemini（Nano Banana 2 = gemini-3-pro-image）**。OpenAIはクレジット切れで終了。
//   - images/icon_shiori.png … 32x32・ショップ品／ストック枠／図鑑で使う
// ⚠**Geminiは透過PNGを返さない**（「透明背景」と書くと市松模様を絵として描く）。緑背景を指定して
//   chromaKey で抜く。順序は chromaKey → fillHoles → trim → resize → 半透明の縁を潰す。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-shiori.mjs --n=3'
// 採用: node gemini-shiori.mjs --pick=shiori:2
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const DEFAULT_MODEL = 'gemini-3-pro-image';

const args   = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL  = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const N      = Math.max(1, Math.min(6, parseInt(getArg('n') || '2', 10)));
const ONLY   = (getArg('only') || '').split(',').filter(Boolean);
const PICK   = getArg('pick');

// 共通の作法（既存の icon_*.png / item_*.png と画風を揃える）
// ⚠**Gemini は透過PNGを返さない**（OpenAIの `background:'transparent'` に相当する指定が無い）。
//   1.630の初回生成では「透明のつもりで**市松模様を描いた**不透明画像」が返ってきた（全候補が不透明100%）。
//   そこで**抜きやすい単色背景を指定して、こちらでクロマキーする**方式にする。
//   緑にする理由: 石(灰)・紫の光・木箱の茶・金 のどれとも十分に離れていて、誤って抜かない。
const CHROMA = { r: 0, g: 255, b: 0 };
const COMMON = [
  'Retro 16-bit pixel art game sprite.',
  'Thick clean dark outline, bold crisp pixels, strong readable silhouette at very small size.',
  'The background must be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the entire canvas —',
  'a chroma key screen. Do NOT draw a checkerboard, do NOT draw a gradient, do NOT draw any scenery.',
  'Nothing in the object itself may be green.',
  'No text, no border, no frame, no cast shadow on the ground.',
  'Just the single object, centered, filling most of the frame.',
].join(' ');

const ASSETS = {
  shiori: {
    out: 'icon_shiori.png', size: 32,
    prompt: [
      'A single BOOKMARK game item icon — a ribbon bookmark for an adventurer\'s journal.',
      'Shape: a tall narrow strip of cream parchment with a V-shaped notch cut into the bottom end,',
      'so the silhouette reads instantly as a bookmark even at 32x32.',
      'A short red ribbon and a small gold tassel hang from the bottom notch.',
      'On the parchment face is a tiny simple stamp of a yellow chick, and a thin gold border along the edges.',
      'Warm, friendly and inviting \u2014 a keepsake you slip into a book to save your place.',
      COMMON,
    ].join(' '),
  },
  // 案B（1.633）: 縦長の短冊は32pxだと「細い棒」にしか見えず余白だらけになる。
  // **閉じた本＋挟まったしおり**にして正方形の枠を埋める＝小さくても何のアイテムか読める。
  shioriB: {
    out: 'icon_shiori.png', size: 32,
    prompt: [
      'A single CLOSED BOOK game item icon, seen at a slight three-quarter angle so it fills a square frame.',
      'A chunky adventurer\'s journal with warm brown leather covers, cream page edges and a small gold clasp.',
      'A bright RED ribbon bookmark hangs out from between the pages at the bottom, with a tiny gold tassel,',
      'and the top of the same ribbon peeks out above the pages.',
      'A tiny simple yellow chick emblem is stamped on the front cover.',
      'Warm, friendly and inviting. The book fills most of the frame.',
      COMMON,
    ].join(' '),
  },
};

function extractImageBuffer(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\nモデル応答:\n${text}` : ''));
}
async function callModel(ai, contents) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { const resp = await ai.models.generateContent({ model: MODEL, contents }); return extractImageBuffer(resp); }
    catch (e) { lastErr = e; const w = 2500 * attempt; console.warn(`  失敗(${attempt}/4): ${e.message}  ${w}ms待機...`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}
// 外周から届かない透明画素（＝シルエット内側の穴）を不透明に戻す。
// ⚠**縮小より先に**やること（1.582の教訓＝生成画像は明るい部分がくり抜かれることがある）。
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
// クロマキー（1.630）: 指定した緑の背景を透明に落とす。⚠**fillHoles より前**に通すこと
//   （先に穴埋めをすると背景が「外側」と判定されず全面が不透明のまま残る）。
// ・緑判定は「緑が十分強く、赤と青の両方をはっきり上回る」＝木箱の茶や石の灰は絶対に当たらない。
// ・縁のにじみ（スピル）は、残った画素の緑成分を赤青の平均へ寄せて中和する。
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (g > 90 && g > r * 1.35 && g > b * 1.35) { data[p + 3] = 0; continue; }   // 背景
    const rb = (r + b) / 2;                                                       // スピル除去
    if (g > rb * 1.15) data[p + 1] = Math.round(rb * 1.15);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// size は 32 のような正方形指定と {w,h} の両方を受ける。
// ⚠宝箱は**ゲーム内で 52x40 の横長**（LUCKY_CHEST_W/H）で描くので、正方形で書き出すと横に潰れる。
//   2倍の 104x80 で持っておけば drawImage(…,52,40) がちょうど半分＝高精細のまま等倍になる。
async function toSprite(buf, size) {
  const W = (typeof size === 'number') ? size : size.w;
  const H = (typeof size === 'number') ? size : size.h;
  const keyed = await chromaKey(buf);
  const filled = await fillHoles(keyed);
  const small = await sharp(filled).ensureAlpha().trim({ threshold: 10 })
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;   // 半透明の縁を潰す
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });

if (PICK) {   // 候補を確定させるだけのモード（例: --pick=pass:2,chest:1）
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
const keys = ONLY.length ? ONLY : Object.keys(ASSETS);
for (const key of keys) {
  const a = ASSETS[key];
  if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
  console.log(`\n■ ${key} → ${a.out}（${a.size}x${a.size}）`);
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [{ text: a.prompt }] }]);
    await fs.writeFile(path.join(RAW_DIR, `${key}_cand_${i}.png`), buf);             // 生（大きいまま・確認用）
    await fs.writeFile(path.join(RAW_DIR, `${key}_cand_${i}_${typeof a.size === 'number' ? a.size : a.size.w + 'x' + a.size.h}.png`), await toSprite(buf, a.size)); // 実寸
    console.log(`  ✓ 候補${i}`);
  }
}
console.log('\n候補は tools/_raw/ に出力しました。確認後 --pick=key:番号 で images/ へ配置します。');
