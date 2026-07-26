// ─────────────────────────────────────────────────────────────────────────────
// gemini-keeper-crone.mjs — 地底「怪しい老婆の店」の店員アイコン（1.587）
// ⚠画像は Gemini（Nano Banana 2 = gemini-3-pro-image）で生成する（ユーザー厳命・2026-07-26）。
//   キャラクターとアイテムの手続き描画は禁止。老婆の顔は 1.569 から ugKeeperFaceURL() が
//   canvas で描いた32pxのドット絵を data URL 化していた＝この差し替えでその違反を解消する。
// 出力: images/keeper_crone.png（32x32・透過PNG＝地上の keeper_stage.png と同仕様）
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-keeper-crone.mjs'
//   オプション: --model=<id>  --n=<候補数>（既定3・_raw に出して選ぶ）  --pick=<1..n>（images/へ確定）
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

const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const N     = Math.max(1, Math.min(6, parseInt(getArg('n') || '3', 10)));
const PICK  = parseInt(getArg('pick') || '0', 10);

const PROMPT = [
  'The attached image is the existing shopkeeper face icon of this game (a small 32x32 pixel-art portrait bust).',
  'Draw a NEW face icon in the EXACT SAME art style, same scale of detail and same framing:',
  'a head-and-shoulders bust, facing the viewer, filling the frame the same way.',
  '',
  'THE CHARACTER: a mysterious OLD WOMAN — the crone who runs a secret shop deep underground.',
  'Deeply wrinkled face, hooked nose, a knowing sly half-smile, narrow eyes glinting with faint violet light.',
  'Long stringy grey hair falling past her shoulders, and a tattered dark-purple hood or shawl over her head.',
  'Colour palette: cold violets, deep purple and grey, unlike the warm brown-haired surface shopkeeper.',
  'She should read as slightly eerie but not evil — a shrewd old merchant.',
  '',
  'Retro 16-bit pixel art, thick clean dark outline, bold crisp pixels, strong readable silhouette at very small size.',
  'Fully TRANSPARENT background. No text, no border, no frame, no shadow on the ground. Just the bust, centered.',
].join(' ');

async function fileToInlinePart(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  return { inlineData: { mimeType: (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png', data: buf.toString('base64') } };
}
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
// 32x32 透過PNGへ。⚠**穴を塞いでから**縮小する（1.582の教訓＝生成画像は明るい部分がくり抜かれる）。
async function toIcon(buf) {
  const filled = await fillHoles(buf);
  const small = await sharp(filled).ensureAlpha().trim({ threshold: 10 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;   // 半透明の縁を潰す
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
// 外周から届かない透明画素（＝シルエット内側の穴）を不透明に戻す（fill-icon-holes.mjs と同じ考え方）
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

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });

if (PICK) {   // 候補を確定させるだけのモード
  const src = path.join(RAW_DIR, `keeper_crone_cand_${PICK}.png`);
  await fs.writeFile(path.join(IMAGES_DIR, 'keeper_crone.png'), await toIcon(await fs.readFile(src)));
  console.log(`✓ images/keeper_crone.png ← 候補${PICK}`);
  process.exit(0);
}

const ai = new GoogleGenAI({ apiKey });
console.log(`モデル: ${MODEL} / 候補 ${N} 枚`);
const ref = await fileToInlinePart(path.join(IMAGES_DIR, 'keeper_stage.png'));
for (let i = 1; i <= N; i++) {
  console.log(`● 候補${i} 生成中（keeper_stage.png 参照）...`);
  const raw = await callModel(ai, [ ref, { text: PROMPT } ]);
  await fs.writeFile(path.join(RAW_DIR, `keeper_crone_cand_${i}.png`), raw);          // 原寸を保管
  await fs.writeFile(path.join(RAW_DIR, `keeper_crone_prev_${i}.png`), await toIcon(raw)); // 32pxプレビュー
  console.log(`  ✓ _raw/keeper_crone_cand_${i}.png`);
}
console.log('候補を確認して --pick=<n> で images/keeper_crone.png に確定すること。');
