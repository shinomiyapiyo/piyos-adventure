// ─────────────────────────────────────────────────────────────────────────────
// gemini-shop05-exit.mjs — ステージショップの「退店」一枚絵 shop05 の作り直し（2026-07-31）
//
// ⚠なぜ作り直すか（実測・監査 2026-07-31）:
//   shop01〜04 は Grok 動画からの切り出しで、画面上の模擬ドットの粒が 2.7〜2.8 CSSpx。
//   title.jpg の 2.60 CSSpx とほぼ一致しているので揃って見える。
//   ところが **shop05 だけ 4.37 CSSpx＝1.7倍粗い**。2026-07-08 に OpenAI で単独生成したため系統が違う。
//   退店はアップの構図なので動画から切り出せない＝Gemini で単独生成し直す（ユーザー決定）。
//
// 🎯 目標値（表示エリア 571×393 CSSpx・background cover で 1.46倍に拡大される前提）
//   ・画面上の1粒 = 2.6〜2.8 CSSpx  → ファイル内の粒 ≒ 1.8〜1.9px（480px幅換算）
//   ・表示される横幅の粒数 ≒ 200〜210粒（画像全幅では約240〜250粒。cover で左右が81%に切られるため）
//   ・顔の粒数 ≒ 27〜29粒（title.jpg は20粒。アップで顔が1.46倍大きく写るぶん粒数は増えるのが正しい）
//   → 出力後に必ず tools/measure-grain.mjs で実測して確認する。目分量で判断しない。
//
// ⚠参照画像は2枚渡す:
//   ① images/title.jpg  … キャラクターの正（頭身・顔・配色）。ART_STYLE.md が正
//   ② images/shop01.jpg … 店内の背景と**模擬ドットの粒の大きさ**の正（01〜04と同じ店に見せる）
//
// 出力は tools/_raw/ の候補まで。ユーザーが選んでから images/shop05.jpg として配置する。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-shop05-exit.mjs'
//   オプション: --model=<id>  --only=a,b,c
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const DEFAULT_MODEL = 'gemini-3-pro-image';   // Nano Banana 2

const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const ONLY  = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);

// ⚠キャラの同一性。ART_STYLE.md の内容をそのまま英語にしたもの。ここは触らないこと。
const CHARACTER = [
  'REFERENCE IMAGE 1 (the girl standing outdoors) defines the heroine. Draw the SAME girl:',
  'long black twin-tail hair in a dark purple-tinted charcoal (NOT pure black), blunt straight bangs,',
  'black cat ears with pale pink insides, a yellow frilled headband with a yellow bow at the left ear,',
  'large dark reddish-brown eyes with a small white highlight, a tiny single-curve smile, oval pink blush,',
  'pale cream skin, and the yellow-and-black frilled maid dress:',
  'white pointed collar with a yellow ribbon tie, yellow bib with two small buttons, black puff sleeves with yellow frill,',
  'black corset with two rows of small gold studs, bell-shaped yellow skirt with cream chick appliques,',
  'black-and-yellow tiered ruffles at the hem, black thigh-high socks with gold bows, black shoes with gold toe bows.',
  'Her palette is essentially two colours — lemon yellow and purple-tinted charcoal — with white, gold and pink accents only.',
  'A soft pale-pink rim light traces her whole silhouette, separating her from the background.',
].join(' ');

// 🚫 頭身。アップ構図でも体型が崩れないよう、頭と肩・胴の比で縛る。
const PROPORTION = [
  'ABSOLUTE REQUIREMENT — BODY PROPORTIONS:',
  'she is a slim teenage girl of about 4.5 to 5 heads tall, exactly as in REFERENCE IMAGE 1.',
  'Her head must be SMALL relative to her body: her shoulders are clearly wider than her head,',
  'and her torso from shoulders to waist is at least one and a half head-heights long.',
  'NEVER draw her chibi, super-deformed, SD, 2-heads-tall, 3-heads-tall, big-headed, or as a small round mascot.',
  'A deformed or big-headed result is a total failure and unusable.',
].join(' ');

// 🎯 模擬ドットの粒。shop01 と同じ粒の大きさを保ったまま寄る＝顔の粒数が増える。
const GRAIN = [
  'REFERENCE IMAGE 2 (the shop interior) defines the ART MEDIUM and, critically, the PIXEL GRANULARITY.',
  'This is NOT true indexed pixel art — it only imitates pixel art: chunky visible square blocks combined with smooth gradient shading.',
  'Match REFERENCE IMAGE 2 exactly for how large one apparent pixel block is relative to the frame:',
  'the whole image must read as if drawn on a grid roughly 240 blocks wide.',
  'Because this shot is CLOSER than reference 2, the girl occupies more of the frame,',
  'so her face must be built from MORE blocks — about 28 blocks across the cheeks — while each block stays the same size.',
  'Her eyes, mouth, blush and the frills must all be clearly readable, not mushed into a few blocks.',
  'Do NOT make the blocks larger or coarser than reference 2. Do NOT produce a smooth non-pixel illustration either.',
].join(' ');

const SHOP = [
  'The room is the SAME shop as REFERENCE IMAGE 2: a warm wooden fantasy item shop —',
  'wooden shelves holding rows of colourful glass potion bottles, rolled scrolls and sacks, a heavy wooden counter,',
  'grey stone wall, a treasure chest, a suit of armour and swords on the wall. Warm amber lamp light.',
  'Keep the same colour temperature and the same wood tones as reference 2.',
].join(' ');

const COMMON = [
  'Wide landscape composition, 16:9 aspect ratio.',
  'No text, no logo, no watermark, no border, no UI, no speech bubble, no signature.',
].join(' ');

const SCENES = [
  {
    key: 'a', out: 'shop05_gem_a.png',
    prompt: [
      CHARACTER, PROPORTION, GRAIN, SHOP,
      'SCENE: she is LEAVING the shop. Framed from mid-thigh up, she stands beside the shop\'s heavy wooden door',
      'on the right of the frame, turned back toward the viewer over her shoulder, smiling and raising one hand in a cheerful goodbye wave.',
      'Her other hand rests near the iron door handle. The shop interior fills the rest of the frame behind her.',
      COMMON,
    ].join(' '),
  },
  {
    key: 'b', out: 'shop05_gem_b.png',
    prompt: [
      CHARACTER, PROPORTION, GRAIN, SHOP,
      'SCENE: she is LEAVING the shop. Framed from the knees up, centred slightly right, she has just pulled the heavy wooden door open;',
      'a soft shaft of warm daylight falls in from outside and catches her from the side. She looks back at the viewer with a small happy smile,',
      'one hand on the door edge, the other holding the strap of her small pouch. The shop shelves and counter are behind her.',
      COMMON,
    ].join(' '),
  },
  {
    key: 'c', out: 'shop05_gem_c.png',
    prompt: [
      CHARACTER, PROPORTION, GRAIN, SHOP,
      'SCENE: she is LEAVING the shop. Framed from the waist up, standing in front of the closed wooden door,',
      'facing the viewer directly, both hands clasped happily in front of her, giving a bright parting smile and a small bow of the head.',
      'The warm shop interior with its potion shelves is visible on both sides behind her.',
      COMMON,
    ].join(' '),
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
const refChar = await fileToInlinePart(path.join(IMAGES_DIR, 'title.jpg'));   // ① キャラの正
const refShop = await fileToInlinePart(path.join(IMAGES_DIR, 'shop01.jpg'));  // ② 店内と粒の正

for (const sc of SCENES) {
  if (ONLY.length && !ONLY.includes(sc.key)) continue;
  console.log(`● ${sc.out} 生成中（title.jpg + shop01.jpg 参照）...`);
  const raw = await callModel(ai, [ refChar, refShop, { text: sc.prompt } ]);
  await fs.writeFile(path.join(RAW_DIR, sc.out), raw);
  console.log(`  ✓ tools/_raw/${sc.out}`);
}
console.log('完了。⚠必ず measure-grain.mjs で粒と頭身を実測してから見せること。');
