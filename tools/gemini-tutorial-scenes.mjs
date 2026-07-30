// ─────────────────────────────────────────────────────────────────────────────
// gemini-tutorial-scenes.mjs — チュートリアルの一枚絵2枚を作り直す（2026-07-31）
//   ① tutorial_clear.jpg   … チュートリアルクリアの全画面絵（全プレイヤーが必ず見る）
//   ② shortcake_scene.jpg  … チュートリアルショップで いちごショートを買った時
//
// ⚠**この2枚は「私服ぴよ」で描くのが正しい**（チュートリアル中はきせかえが私服に固定される・ユーザー説明）。
//   ＝**ネコ耳が無いのは正しい／黄色い服なのも正しい**。メイド服にしてはいけない。
//
// ⚠現行2枚の不備（監査 2026-07-31）:
//   ・顔が別人に見える（✅ユーザー確認）
//   ・ツインテールが解けている（正はツインテール）
//   ・マゼンタのリボン2つが無い
//   ・ワンピースの白い水玉模様が無い（無地になっている）
//   ・tutorial_clear は髪が茶色（正は黒）
//
// ⚠参照画像は2枚渡す:
//   ① images/title.jpg          … **顔と頭身の正**
//   ② images/player_idle_v1.png … **私服の正**（64×64 のゲーム内スプライト）
//
// 出力は tools/_raw/ の候補まで。⚠必ず measure-grain.mjs で実測してからユーザーに見せる。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-tutorial-scenes.mjs'
//   オプション: --model=<id>  --only=clear,cake
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
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
const ONLY  = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);

// 顔＝title.jpg のまま。ここが「別人に見える」の対策の本体。
const FACE = [
  'REFERENCE IMAGE 1 (the girl standing outdoors in a yellow-and-black dress) defines HER FACE AND IDENTITY.',
  'Draw the SAME girl with the SAME face: LARGE ROUND dark reddish-brown eyes with a big iris and',
  'a bright white highlight, blunt straight bangs, a soft ROUND face with full cheeks and a small chin,',
  'clear oval pink blush under each eye, a small rounded mouth, almost no nose.',
  'Pale cream skin. She must be instantly recognisable as the same character as reference image 1.',
].join(' ');

// 衣装＝私服（player_idle_v1.png）。⚠ネコ耳もメイド服も出さない。
const CASUAL = [
  'REFERENCE IMAGE 2 (the small pixel sprite on a transparent background) defines HER OUTFIT for this scene.',
  'She is wearing her CASUAL clothes, not the maid dress:',
  'a YELLOW SUNDRESS COVERED IN SMALL WHITE POLKA DOTS (the dots are essential — never plain yellow),',
  'with a WHITE FRILLED HEM peeking out below the yellow, and dark near-black shoes.',
  'At her chest she wears a SMALL WHITE COLLAR with a MAGENTA/PINK RIBBON BOW tied at the throat —',
  'this bow is essential, never omit it.',
  'Her BLACK hair is tied in TWIN TAILS — never loose, never brown —',
  'and each tail is tied with a DEEP MAGENTA RIBBON (two ribbons, one on each side).',
  'IMPORTANT: in this casual outfit she has NO CAT EARS and NO yellow headband —',
  'do not add cat ears, do not add the maid dress, do not add a yellow hair ribbon.',
].join(' ');

const PROPORTION = [
  'ABSOLUTE REQUIREMENT — BODY PROPORTIONS: a slim girl of about 4.5 to 5 heads tall, as in reference image 1.',
  'Her head must be SMALL relative to her body; shoulders clearly wider than her head.',
  'NEVER chibi, super-deformed, SD, 2-heads-tall, 3-heads-tall or big-headed. A deformed result is unusable.',
].join(' ');

const GRAIN = [
  'ART MEDIUM: this is NOT true indexed pixel art — it only imitates pixel art:',
  'chunky visible square blocks combined with smooth gradient shading, exactly like reference image 1.',
  'Match reference image 1 for how large one apparent pixel block is relative to her face:',
  'her face should be built from roughly 25 to 35 blocks across the cheeks — clearly blocky,',
  'but with eyes, mouth and blush all readable. Do not render a smooth non-pixel illustration.',
].join(' ');

const COMMON = [
  'Wide landscape composition, 3:2 aspect ratio.',
  'No text, no logo, no watermark, no border, no UI, no speech bubble, no signature.',
].join(' ');

const SCENES = [
  {
    key: 'clear', out: 'tutclear3_gem_%s.png',
    prompt: [ FACE, CASUAL, PROPORTION, GRAIN,
      'SCENE: the tutorial is cleared and she is celebrating. She jumps with both arms raised high in joy,',
      'eyes happily closed, mouth open in a big delighted laugh, on the street of a bright pastel town at sunset',
      '— cream houses with orange roofs, a street lamp, warm peach sky. Colourful confetti and golden sparkles',
      'fill the air, and EXACTLY THREE large golden eggs float around her — count them: three, no more and no less',
      '(the tutorial reward is three golden eggs, so the picture must show three).',
      'Beside her sits the defeated CHICK KING — a BIG round yellow chick BOSS, HUMAN-SIZED:',
      'he is as TALL AS THE GIRL HERSELF (do NOT draw him as a small ordinary chick, he is a large boss character).',
      'He has a GOLD CROWN on his head, angry slanted eyebrows, a small orange beak, round orange cheek blush',
      'and a dark brown outline, and he is slumped down crying big comic tear-drops because he lost.',
      COMMON ].join(' '),
  },
  {
    key: 'cake', out: 'cake2_gem_%s.png',
    prompt: [ FACE, CASUAL, PROPORTION, GRAIN,
      'SCENE: she sits at the counter of a cosy wooden cake shop, seen from the WAIST UP behind the counter,',
      'holding a small fork and smiling happily at a slice of strawberry shortcake on a white plate in front of her.',
      'Frame her so that her CHEST AND THE MAGENTA COLLAR BOW ARE CLEARLY VISIBLE above the counter.',
      'Behind her are wooden shelves of cakes and pastel teapots, lit by a warm wall lamp.',
      COMMON ].join(' '),
  },
];

async function fileToInlinePart(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const mimeType = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png';
  return { inlineData: { mimeType, data: buf.toString('base64') } };
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

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
const ai = new GoogleGenAI({ apiKey });
console.log(`モデル: ${MODEL}`);
const refFace   = await fileToInlinePart(path.join(IMAGES_DIR, 'title.jpg'));           // ① 顔と頭身の正
const refCasual = await fileToInlinePart(path.join(IMAGES_DIR, 'player_idle_v1.png'));  // ② 私服の正

for (const sc of SCENES) {
  if (ONLY.length && !ONLY.includes(sc.key)) continue;
  for (const v of ['a', 'b']) {            // 1シーンにつき2案（選ぶ余地を残す・生成量は絞る）
    const out = sc.out.replace('%s', v);
    console.log(`● ${out} 生成中（title.jpg + player_idle_v1.png 参照）...`);
    const raw = await callModel(ai, [ refFace, refCasual, { text: sc.prompt } ]);
    await fs.writeFile(path.join(RAW_DIR, out), raw);
    console.log(`  ✓ tools/_raw/${out}`);
  }
}
console.log('完了。⚠必ず measure-grain.mjs で粒と頭身を実測してから見せること。');
