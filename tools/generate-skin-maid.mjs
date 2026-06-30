// ─────────────────────────────────────────────────────────────────────────────
// generate-skin-maid.mjs  (v2: idle固定アンカー方式)
// プレイヤーの「黄色メイド服スキン」を生成する開発用スクリプト。
//
// 【方針 v2】既に完璧な skin_maid_idle.png を「キャラ同一性の基準(identityアンカー)」に固定し、
//   他コマは『そのキャラのまま、ポーズ(手足)だけ変える』として再生成する。
//   - 歩行は「頭と胴は idle と同じ位置・見た目を維持し、手足だけ動く差分」を明示。
//   - ジャンプ/落下は「明確な空中ポーズ」を明示（立ちポーズにならないように）。
//   - 元 player_<pose>.png は“ポーズの当たり”として渡すが、キャラは無視させる。
//
// 出力: ../images/skin_maid_<key>.png （64×64 透過PNG）。idle は既存を温存（--only=idle で再生成可）。
//
// 使い方:
//   cd games/piyo-adventure/tools
//   export GEMINI_API_KEY=...   ※対話シェルなら zsh -ic 経由で自動継承
//   node generate-skin-maid.mjs                 # idle以外の6コマ
//   node generate-skin-maid.mjs --only=walk_1   # 個別
//   node generate-skin-maid.mjs --with-idle     # idleも作り直す
//   オプション: --model=<id> / --chroma / --no-key
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
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const MODEL      = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const ONLY       = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const WITH_IDLE  = hasFlag('with-idle');
const USE_CHROMA = hasFlag('chroma');
const NO_KEY     = hasFlag('no-key');
const OUT_SIZE   = 64;
const IDLE_FILE  = 'skin_maid_idle.png';

// idle を基準にした各モーション。pose=ポーズ当たり画像、motion=動きの説明。
const FRAMES = [
  { key: 'walk_1', pose: 'player_walk_1.png',
    motion: 'WALK CYCLE frame 1 (contact): RIGHT leg stepped clearly FORWARD, LEFT leg back behind, weight forward. Arms swing opposite: LEFT arm forward, RIGHT arm back. A clear mid-stride side walking pose.' },
  { key: 'walk_2', pose: 'player_walk_2.png',
    motion: 'WALK CYCLE frame 2 (passing): both legs near each other passing under the body, one foot lifting, body slightly up. Arms near neutral. The in-between step pose.' },
  { key: 'walk_3', pose: 'player_walk_3.png',
    motion: 'WALK CYCLE frame 3 (contact, opposite): LEFT leg stepped clearly FORWARD, RIGHT leg back behind. Arms swing opposite: RIGHT arm forward, LEFT arm back. The mirror of frame 1.' },
  { key: 'walk_4', pose: 'player_walk_4.png',
    motion: 'WALK CYCLE frame 4 (passing, opposite): both legs passing under the body again, the other foot lifting. Arms near neutral. The other in-between step pose.' },
  { key: 'jump',   pose: 'player_jump.png',
    motion: 'JUMPING UP pose: the character is clearly AIRBORNE, lifted off the ground, both knees bent and tucked up, feet off the floor, arms raised upward giving lift, body energetic. This must NOT look like a normal standing pose.' },
  { key: 'fall',   pose: 'player_fall.png',
    motion: 'FALLING DOWN pose: the character is clearly AIRBORNE and descending, legs spread apart and loose, arms raised up/outward to balance, slightly looking down, a "whoa I am falling" pose. This must NOT look like a normal standing pose.' },
];

const IDENTITY = [
  'The FIRST image is the EXACT character you MUST keep, pixel-consistent: a 2-heads-tall super-deformed chibi girl with',
  'a giant round head and tiny stubby body, wearing a yellow-and-black frilly maid dress (yellow bodice, black puffy short',
  'sleeves, layered yellow/black ruffled skirt with tiny white skull motifs), a yellow cat-ear headband with bows,',
  'black twin-tails and black thigh-high stockings.',
  'Keep her head, face, hair, outfit, color scheme, the 2-heads-tall big-head proportions, the line work and the exact',
  'pixel-art TOUCH/shading IDENTICAL to this FIRST image. Do NOT redesign her, do NOT change her art style, do NOT make',
  'her taller or more realistic.',
  'The SECOND image is ONLY a rough pose hint for the limbs — IGNORE its character, outfit and art style completely.',
].join('\n');

const OUTPUT = [
  'Produce the SAME character from the FIRST image, re-posed into the TARGET POSE below. Think of it as one frame of a',
  'sprite animation of that exact character: the head and torso stay the same as the first image and mainly the ARMS and',
  'LEGS move. Single character only, facing right, same scale and 2-head chibi proportions as the first image,',
  'plain solid WHITE background, no scenery, no ground, no shadow, no extra objects, no weapon, no text, no border, no grid.',
].join('\n');

const IDLE_PROMPT = [
  'A single player character sprite for a retro side-scrolling pixel-art platformer: a 2-heads-tall super-deformed chibi',
  'girl (giant head, tiny stubby body) in a yellow-and-black frilly maid dress with yellow cat-ear headband, black',
  'twin-tails, white skull motifs and black thigh-highs, matching the costume of the girl in the reference image but in',
  'an EXTREME 2-heads-tall chibi style. Neutral standing idle pose, facing right. Plain WHITE background, no scenery,',
  'no shadow, no text. The reference image is for COSTUME/COLORS only — do NOT copy its tall realistic body proportions.',
].join('\n');

async function fileToInlinePart(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return { inlineData: { mimeType, data: buf.toString('base64') } };
}
function extractImageBuffer(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\nモデル応答:\n${text}` : ''));
}
async function gradedWhiteKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const LO = 40, HI = 100;
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const mn = Math.min(r,g,b), mx = Math.max(r,g,b);
    const a = Math.round(ss(LO, HI, Math.max(255 - mn, mx - mn)) * 255);
    if (a < data[i+3]) data[i+3] = a;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
async function chromaKeyToAlpha(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const corners = [[0,0],[width-1,0],[0,height-1],[width-1,height-1]].map(([x,y]) => { const i=(y*width+x)*channels; return [data[i],data[i+1],data[i+2]]; });
  const key = [0,1,2].map(c => Math.round(corners.reduce((s,p)=>s+p[c],0)/corners.length));
  for (let i = 0; i < data.length; i += channels) {
    if (Math.abs(data[i]-key[0])+Math.abs(data[i+1]-key[1])+Math.abs(data[i+2]-key[2]) <= 114) data[i+3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
async function postProcess(rawBuf) {
  let buf = rawBuf;
  if (USE_CHROMA) buf = await chromaKeyToAlpha(buf);
  else if (!NO_KEY) buf = await gradedWhiteKey(buf);
  return sharp(buf).ensureAlpha().trim()
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
    .png().toBuffer();
}
async function callModel(ai, contents) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { const resp = await ai.models.generateContent({ model: MODEL, contents }); return extractImageBuffer(resp); }
    catch (e) { lastErr = e; const w = 2500*attempt; console.warn(`  失敗(${attempt}/4): ${e.message}  ${w}ms待機...`); await new Promise(r=>setTimeout(r,w)); }
  }
  throw lastErr;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey });
  console.log(`モデル: ${MODEL}\n出力先: ${IMAGES_DIR}`);

  const outfitRef = await fileToInlinePart(path.join(IMAGES_DIR, 'title.jpg'));

  // idle: --with-idle のときだけ作り直す
  if (WITH_IDLE || ONLY.includes('idle')) {
    console.log('\n● skin_maid_idle を生成中...');
    const raw = await callModel(ai, [ outfitRef, { text: IDLE_PROMPT } ]);
    await fs.writeFile(path.join(RAW_DIR, 'skin_maid_idle_raw.png'), raw);
    await fs.writeFile(path.join(IMAGES_DIR, IDLE_FILE), await postProcess(raw));
    console.log('  ✓ 保存: images/skin_maid_idle.png');
  }

  // idle を identity アンカーとして読み込む（基準キャラ）
  const idleRef = await fileToInlinePart(path.join(IMAGES_DIR, IDLE_FILE));

  const targets = ONLY.length ? FRAMES.filter(f => ONLY.includes(f.key)) : FRAMES;
  for (const fr of targets) {
    console.log(`\n● skin_maid_${fr.key} を生成中 (idle基準 + ポーズ:${fr.pose})...`);
    const poseRef = await fileToInlinePart(path.join(IMAGES_DIR, fr.pose));
    const contents = [ idleRef, poseRef, { text: `${IDENTITY}\n\nTARGET POSE: ${fr.motion}\n\n${OUTPUT}` } ];
    const raw = await callModel(ai, contents);
    await fs.writeFile(path.join(RAW_DIR, `skin_maid_${fr.key}_raw.png`), raw);
    await fs.writeFile(path.join(IMAGES_DIR, `skin_maid_${fr.key}.png`), await postProcess(raw));
    console.log(`  ✓ 保存: images/skin_maid_${fr.key}.png`);
  }
  console.log('\n完了。idleと並べて一貫性/差分/空中ポーズを確認してください。気に入らないコマは --only=<key> で作り直し。');
}

main().catch(e => { console.error('\n✗ エラー:', e); process.exit(1); });
