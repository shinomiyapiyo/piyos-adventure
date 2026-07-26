// ─────────────────────────────────────────────────────────────────────────────
// gemini-ug-ending-scene.mjs — 地底クリアの「真のエンディング」一枚絵（1.584）
// ⚠画像生成は **Gemini（Nano Banana 2 = gemini-3-pro-image）** を使う（ユーザー指定・2026-07-26）。
//   OpenAI はクレジットを使い切ったため終了。以後の画像は原則こちら。
// ⚠ぴよ氏は必ず images/title.jpg を参照画像として渡すこと（ユーザー厳命の頭身ルール）:
//   デフォルメ/ちび頭身は絶対禁止・5〜6頭身・同一人物。服は**タイトル画面の黄色いメイド服のまま**。
// 出力は tools/_raw/ の候補まで。確認後に images/ug_ending.jpg として配置する。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-ug-ending-scene.mjs'
//   オプション: --model=<id>  --only=a,b
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

// ⚠この塊は触らないこと。頭身とメイド服の指定がここに集約されている。
const CHARACTER = [
  'The girl in the attached reference image is the hero of this game. Draw the SAME girl:',
  'same face, same brown eyes, same long black twin-tail hair with yellow ribbons, the same yellow cat-ear headband,',
  'and the SAME BODY PROPORTIONS — about 5 to 6 heads tall, slim.',
  'She must NOT be chibi, NOT super-deformed, NOT a small round mascot.',
  'KEEP HER OUTFIT EXACTLY AS IN THE REFERENCE: the yellow-and-black frilled maid dress with the chick motifs on the skirt,',
  'black thigh-high socks and black shoes. Do not change the costume.',
].join(' ');

const COMMON = [
  'Retro 16-bit pixel art style matching the reference image, wide landscape composition (3:2), cinematic and emotional.',
  'No text, no logo, no watermark, no border, no UI, no health bar.',
].join(' ');

const SCENES = [
  {
    key: 'a', out: 'ugending_gem_a.png',
    prompt: [
      CHARACTER,
      'SCENE (replace the background entirely): she stands in a vast dark underground cavern, seen from BEHIND at a three-quarter angle,',
      'small against the huge space but clearly readable. She looks up toward a bright shaft of warm golden sunlight',
      'breaking through a collapsed opening high in the rocky ceiling — the way back to the surface has opened.',
      'The purple braziers that lit the cavern have gone out, thin wisps of violet smoke still rising from them.',
      'On the stone floor behind her, faint scattered purple embers are all that remain of a fallen dark priestess.',
      'Mood: the long fight is over — quiet relief and awe. Warm gold light against cold purple shadow.',
      COMMON,
    ].join(' '),
  },
  {
    key: 'b', out: 'ugending_gem_b.png',
    prompt: [
      CHARACTER,
      'SCENE (replace the background entirely): she stands in the middle of a huge dark stone arena deep underground,',
      'facing away from the viewer toward a tall gate that has just opened, warm golden sunlight pouring down the stairway beyond it.',
      'Her silhouette is rimmed by the light; a few golden sparkles and one shining golden egg float near her.',
      'Behind her the extinguished purple braziers and a cracked dark idol statue fade into shadow.',
      'Mood: triumphant but calm — the moment before walking home. Warm gold light against cold purple shadow.',
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
const ref = await fileToInlinePart(path.join(IMAGES_DIR, 'title.jpg'));

for (const sc of SCENES) {
  if (ONLY.length && !ONLY.includes(sc.key)) continue;
  console.log(`● ${sc.out} 生成中（title.jpg 参照）...`);
  const raw = await callModel(ai, [ ref, { text: sc.prompt } ]);
  await fs.writeFile(path.join(RAW_DIR, sc.out), raw);
  console.log(`  ✓ tools/_raw/${sc.out}`);
}
console.log('完了。候補を確認してから images/ug_ending.jpg として配置すること。');
