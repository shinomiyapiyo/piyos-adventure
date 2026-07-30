// ─────────────────────────────────────────────────────────────────────────────
// gemini-tutorial-fix.mjs — チュートリアル2枚の最終調整（2026-07-31）
//   ① eggs … 採用が決まった tutclear2_gem_a を参照させ、**金の卵だけ5個→3個**に直す（他は一切変えない）
//   ② cake … ケーキ絵を、**肩幅÷頭幅=1.4〜1.5** を満たす頭身で描き直す
//             （cake2_gem_a は 1.14 でデフォルメに見える＝ユーザー却下。title.jpg は 1.46）
//
// 実行: zsh -ic 'node gemini-tutorial-fix.mjs [--only=eggs,cake]'
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL = getArg('model') || process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
const ONLY  = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);

const CASUAL = [
  'She wears her CASUAL outfit: a YELLOW SUNDRESS COVERED IN SMALL WHITE POLKA DOTS (never plain yellow),',
  'a WHITE FRILLED HEM below the yellow, a SMALL WHITE COLLAR with a MAGENTA RIBBON BOW at her throat,',
  'dark near-black shoes, and BLACK hair in TWIN TAILS each tied with a DEEP MAGENTA RIBBON.',
  'NO cat ears, NO maid dress, NO yellow hair ribbon.',
].join(' ');

const FACE = [
  'Her face matches REFERENCE IMAGE 1: LARGE ROUND dark reddish-brown eyes with a bright white highlight,',
  'blunt straight bangs, a soft round face, oval pink blush under each eye, a small rounded mouth, almost no nose.',
].join(' ');

// ⚠胸から上の構図では頭身が測れないので、肩幅と頭幅の比で縛る（title.jpg は 1.46）
const RATIO = [
  'CRITICAL PROPORTION RULE: her SHOULDERS must be clearly wider than her head —',
  'the width across her shoulders must be about 1.5 TIMES the width of her head.',
  'Her head must look SMALL on top of a normal teenage body. She is NOT chibi, NOT super-deformed,',
  'NOT a big-headed mascot. If her shoulders are barely wider than her head the drawing is wrong.',
  'Also give her a visible neck and a normal-length torso.',
].join(' ');

const GRAIN = [
  'ART MEDIUM: imitation pixel art like reference image 1 — chunky visible square blocks plus smooth gradient shading.',
  'Her face should be built from roughly 25 to 35 blocks across the cheeks. Not a smooth non-pixel illustration.',
].join(' ');

const COMMON = 'Wide landscape composition, 3:2 aspect ratio. No text, no logo, no watermark, no border, no UI, no signature.';

async function part(p) {
  const buf = await fs.readFile(p);
  const ext = path.extname(p).toLowerCase();
  return { inlineData: { mimeType: (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png', data: buf.toString('base64') } };
}
function pick(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  throw new Error('画像が返りませんでした: ' + parts.map(p => p.text).filter(Boolean).join('\n'));
}
async function call(ai, contents) {
  let e2;
  for (let i = 1; i <= 4; i++) {
    try { return pick(await ai.models.generateContent({ model: MODEL, contents })); }
    catch (e) { e2 = e; console.warn(`  失敗(${i}/4): ${e.message}`); await new Promise(r => setTimeout(r, 2500 * i)); }
  }
  throw e2;
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由）'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });
const refTitle = await part(path.join(IMAGES_DIR, 'title.jpg'));
const refCasual = await part(path.join(IMAGES_DIR, 'player_idle_v1.png'));
const refClear = await part(path.join(RAW_DIR, 'tutclear2_gem_a.png'));
console.log(`モデル: ${MODEL}`);

if (!ONLY.length || ONLY.includes('eggs')) {
  const prompt = [
    'REFERENCE IMAGE 1 is a FINISHED artwork that has already been approved. Reproduce it EXACTLY:',
    'identical composition and framing, identical girl with the identical face and pose,',
    'identical big crying chick king with his gold crown, identical pastel town background,',
    'identical confetti, sparkles, colours and pixel-art style. Keep absolutely everything.',
    'MAKE ONE SINGLE CHANGE: the picture currently shows FIVE floating golden eggs.',
    'Show EXACTLY THREE golden eggs instead — remove two of them and fill their place with the plain sky behind.',
    'Do not move, resize or restyle anything else. Count carefully: exactly three golden eggs.',
    COMMON,
  ].join(' ');
  for (const v of ['a', 'b']) {
    console.log(`● tutclear_fix_${v}.png 生成中（tutclear2_gem_a を参照）...`);
    await fs.writeFile(path.join(RAW_DIR, `tutclear_fix_${v}.png`), await call(ai, [refClear, { text: prompt }]));
    console.log(`  ✓ tools/_raw/tutclear_fix_${v}.png`);
  }
}

if (!ONLY.length || ONLY.includes('cake')) {
  const prompt = [
    'REFERENCE IMAGE 1 (the girl outdoors) defines her face and her BODY PROPORTIONS.',
    'REFERENCE IMAGE 2 (the small pixel sprite) defines her casual outfit.',
    FACE, CASUAL, RATIO, GRAIN,
    'SCENE: a cosy wooden cake shop. She stands behind the counter seen from the HIPS UP, turned slightly,',
    'holding a small fork and smiling happily at a slice of strawberry shortcake on a white plate on the counter.',
    'Show enough of her body that her shoulders, arms and waist are all clearly visible',
    'and her head reads as small compared to her shoulders.',
    'Behind her, wooden shelves of cakes and pastel teapots lit by a warm wall lamp.',
    COMMON,
  ].join(' ');
  for (const v of ['a', 'b']) {
    console.log(`● cake_fix_${v}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `cake_fix_${v}.png`), await call(ai, [refTitle, refCasual, { text: prompt }]));
    console.log(`  ✓ tools/_raw/cake_fix_${v}.png`);
  }
}
console.log('完了。⚠肩幅÷頭幅 を実測してから見せること。');
