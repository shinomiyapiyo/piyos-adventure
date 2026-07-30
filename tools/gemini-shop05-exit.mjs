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
  'black corset with two rows of small gold studs AT THE FRONT ONLY, bell-shaped yellow skirt with cream chick appliques,',
  'black-and-yellow tiered ruffles at the hem, black thigh-high socks with gold bows, black shoes with gold toe bows.',
  'Her palette is essentially two colours — lemon yellow and purple-tinted charcoal — with white, gold and pink accents only.',
  'A soft pale-pink rim light traces her whole silhouette, separating her from the background.',
].join(' ');

// ⚠背面は title.jpg に写っていない＝ここが唯一の正（2026-07-31 ユーザー決定・ART_STYLE.md と同文）。
//   明記しないとモデルが背中を黒生地で埋める（1.698 で実際に起きた）。
const BACK = [
  'BACK OF THE COSTUME (important — the reference photo only shows her front, so follow this exactly):',
  'the back MIRRORS the front — the same lemon-yellow bodice with fine vertical ribbing covers her back,',
  'so yellow is the dominant colour from behind as well.',
  'The black corset continues around the waist, but on the BACK it is PLAIN black —',
  'NO gold studs, NO buttons, NO lacing and no fastenings of any kind on the back of the corset.',
  '(Studs or buttons on her back make her read as if she were facing the viewer, which ruins the shot.)',
  'Black puff sleeves and yellow frilled shoulder straps wrap over the shoulders.',
  'Below, the same bell-shaped yellow skirt with black-and-yellow tiered ruffles.',
  'There is NO large bow or apron tie at the back, and NO chick applique on the back of the skirt.',
  'Her upper back is fully covered by the yellow bodice — no bare back, no keyhole opening.',
  'Her back must NOT be black.',
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

// ⚠**現行の images/shop05.jpg を3枚目の参照として渡し、その構図をそのまま再現する**（2026-07-31）。
//   ユーザー評「まだ05には勝てない／全く同じ構図が望ましい」。顔を同倍率で並べた比較で分かった差:
//     ・目 … 現行=丸く大きい／新案=縦長で細く大人っぽい
//     ・ハイライト … 現行=大きな四角2つがはっきり／新案=小さい
//     ・輪郭 … 現行=丸くあごが小さい／新案=細くシャープ
//     ・口 … 現行=小さめで丸い／新案=大きく横に広い
//     ・顔の向き … 現行=ほぼ正面で両目が同じ大きさ／新案=斜めで奥の目が小さい
//   ＝「肩越しに振り返る」と書くと顔が斜めになり可愛さが落ちる。**顔はほぼ正面**が正解。
const POSE = [
  'REFERENCE IMAGE 3 is the EXACT shot to reproduce. Copy it faithfully:',
  'the same camera framing and zoom, the same body pose, the same arm and hand positions,',
  'the same head angle, the same face, the same expression, and the same shop layout behind her.',
  'Her body is turned away toward the wooden door on the right so her BACK faces the viewer,',
  'but HER FACE IS TURNED BACK ALMOST FULLY TOWARD THE CAMERA — nearly frontal, both eyes the same size,',
  'NOT a three-quarter over-the-shoulder angle.',
  '',
  'FACE — this is what makes her endearing, follow it exactly:',
  'LARGE ROUND eyes (round, not narrow ovals) with a big iris and TWO large bright square white highlights;',
  'a soft ROUND face with full cheeks and a small chin; a SMALL rounded open smile (not a wide grin, no gums);',
  'clear oval pink blush under each eye; almost no nose — a tiny dot at most.',
  '',
  'ONLY ONE THING CHANGES from reference image 3:',
  'in reference image 3 the back of her dress is wrongly BLACK. Replace it with the yellow ribbed bodice',
  'described above, and make the corset at her back plain black with no studs. Change NOTHING else.',
].join(' ');

const SCENES = [
  {
    key: 'a', out: 'shop05d_gem_a.png',
    prompt: [ CHARACTER, BACK, PROPORTION, GRAIN, SHOP, POSE,
      '', COMMON ].join(' '),
  },
  {
    key: 'b', out: 'shop05d_gem_b.png',
    prompt: [ CHARACTER, BACK, PROPORTION, GRAIN, SHOP, POSE,
      'Keep the composition identical; just render it once more.', COMMON ].join(' '),
  },
  {
    key: 'c', out: 'shop05d_gem_c.png',
    prompt: [ CHARACTER, BACK, PROPORTION, GRAIN, SHOP, POSE,
      'Keep the composition identical; make her eyes and highlights a touch larger and rounder still.', COMMON ].join(' '),
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
const refPose = await fileToInlinePart(path.join(IMAGES_DIR, 'shop05.jpg'));  // ③ 再現する構図・顔・表情（現行1.698）

for (const sc of SCENES) {
  if (ONLY.length && !ONLY.includes(sc.key)) continue;
  console.log(`● ${sc.out} 生成中（title.jpg + shop01.jpg + 現行shop05.jpg 参照）...`);
  const raw = await callModel(ai, [ refChar, refShop, refPose, { text: sc.prompt } ]);
  await fs.writeFile(path.join(RAW_DIR, sc.out), raw);
  console.log(`  ✓ tools/_raw/${sc.out}`);
}
console.log('完了。⚠必ず measure-grain.mjs で粒と頭身を実測してから見せること。');
