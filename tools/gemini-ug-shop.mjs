// ─────────────────────────────────────────────────────────────────────────────
// gemini-ug-shop.mjs — 地底「怪しい老婆の店」の背景 ug_shop01.jpg を作り直す（2026-07-31）
//
// ⚠現行の不備（監査 2026-07-31）:
//   ・ぴよ氏の衣装が **黒地に金のスマイリー顔の飾り** が並ぶ別デザイン（正は黄×黒のメイド服）
//   ・老婆のタッチが **アメリカン寄り**（✅ユーザー指摘）。怪しさは残しつつ日本のアニメ調にする
//
// ⚠ユーザー指示（2026-07-31）:
//   ・ぴよ氏は **ほんの少し驚いているくらい** の表情（驚愕ではない）
//   ・老婆は **怪しさはそのまま・画風だけ日本のアニメ調**（ぴよ氏と同じ絵柄で並ぶように）
//
// 🎯 表示はステージショップと同じ枠（571×393 CSSpx・background cover）
//   → 画面上の粒 2.5〜2.9 CSSpx / 表示幅に 200〜210粒。出力後に measure-grain.mjs で実測すること。
//   （現行は 2.01 CSSpx で細かすぎ）
//
// ⚠参照画像は2枚:
//   ① images/title.jpg    … ぴよ氏の顔・頭身・メイド服・配色の正
//   ② images/ug_shop01.jpg … 店内のレイアウトと老婆の配置（**画風は真似させない**）
//
// 出力は tools/_raw/ の候補まで。採用後に images/ug_shop01.jpg として配置し、
// **そこから 32px の keeper_crone.png も起こす**（顔アイコンと画風を揃えるため）。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-ug-shop.mjs'
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

// ART_STYLE.md のメイド服＋顔をそのまま英語化
const PIYO = [
  'REFERENCE IMAGE 1 (the girl standing outdoors) defines the HEROINE. Draw the SAME girl:',
  'long black twin-tail hair in a dark purple-tinted charcoal (never pure black), blunt straight bangs,',
  'black cat ears with pale pink insides joined to a yellow frilled headband, a yellow bow at her left ear,',
  'and the yellow-and-black frilled maid dress: white pointed collar with a yellow ribbon tie,',
  'yellow ribbed bib with two small buttons, black puff sleeves with yellow frills,',
  'black corset with two rows of gold studs, bell-shaped yellow skirt with cream chick appliques,',
  'black-and-yellow tiered ruffles at the hem, black thigh-high socks with gold bows, black shoes with gold toe bows.',
  'A soft pale-pink rim light traces her silhouette.',
].join(' ');

// 🌟 可愛さの勘所（ART_STYLE「可愛さを左右する要素」）＋ 今回の表情指定
const PIYO_FACE = [
  'HER FACE — follow exactly, this is what makes her endearing:',
  'LARGE ROUND dark reddish-brown eyes with a big iris and TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS',
  '(big highlights are essential — small pinprick highlights instantly make her look adult and lose the charm);',
  'a soft ROUND face with full cheeks and a small chin; clear oval pink blush; almost no nose.',
  'EXPRESSION: only SLIGHTLY surprised — eyes a little wider than usual, eyebrows raised just a touch,',
  'and a small rounded open mouth. She is mildly taken aback, NOT shocked, NOT scared, NOT screaming.',
  'Her face is turned almost fully toward the viewer (both eyes the same size), not a three-quarter angle.',
].join(' ');

const CRONE = [
  'THE SHOPKEEPER is a creepy old crone who runs this underground shop.',
  '⚠Draw her in the SAME JAPANESE ANIME ART STYLE as the girl — soft anime shading and anime facial structure.',
  'Do NOT draw her as a western / American cartoon caricature with a rubbery exaggerated face.',
  'Keep her EERIE and MYSTERIOUS: a deep dark-purple hood shadowing her eyes, long grey hair falling out of it,',
  'a wrinkled face and a thin sly knowing smile, hunched over her stone counter.',
  'She is unsettling but not comical — the quiet, ominous kind of creepy.',
].join(' ');

const PROPORTION = [
  'ABSOLUTE REQUIREMENT — PROPORTIONS: the girl is slim and about 4.5 to 5 heads tall as in reference image 1.',
  'Her SHOULDERS must be clearly wider than her head. NEVER chibi, super-deformed, SD or big-headed.',
].join(' ');

const GRAIN = [
  'ART MEDIUM: imitation pixel art like reference image 1 — chunky visible square blocks plus smooth gradient shading.',
  'This is NOT true indexed pixel art and NOT a smooth illustration.',
  'The whole image should read as if drawn on a grid roughly 260 blocks wide,',
  'with her face built from about 28 blocks across the cheeks.',
].join(' ');

const ROOM = [
  'REFERENCE IMAGE 2 shows the LAYOUT of this shop — reuse the layout only, NOT its art style:',
  'a cramped cave dug out of dark rock, a rough stone/wood counter running across the lower left,',
  'shelves of murky glass jars and bottles, dried herbs hanging from the ceiling,',
  'a single warm lantern, clay pots on the ground. Dark, damp, lit only by that one lantern.',
  'The crone is behind the counter on the LEFT, the girl stands on the RIGHT facing the viewer.',
].join(' ');

const COMMON = 'Wide landscape composition, 3:2 aspect ratio. No text, no logo, no watermark, no border, no UI, no signature.';

const VARIANTS = [
  { key: 'a', extra: 'The girl stands from the knees up, close to the counter.' },
  { key: 'b', extra: 'The girl is shown from the waist up, a little closer to the viewer, the crone leaning further over the counter toward her.' },
  { key: 'c', extra: 'Full standing figure of the girl visible from head to shoes on the right side of the frame.' },
];

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
await fs.mkdir(RAW_DIR, { recursive: true });
const ai = new GoogleGenAI({ apiKey });
const refPiyo = await part(path.join(IMAGES_DIR, 'title.jpg'));
const refRoom = await part(path.join(IMAGES_DIR, 'ug_shop01.jpg'));
console.log(`モデル: ${MODEL}`);

for (const v of VARIANTS) {
  const prompt = [PIYO, PIYO_FACE, CRONE, PROPORTION, GRAIN, ROOM, v.extra, COMMON].join(' ');
  console.log(`● ugshop_gem_${v.key}.png 生成中...`);
  await fs.writeFile(path.join(RAW_DIR, `ugshop_gem_${v.key}.png`), await call(ai, [refPiyo, refRoom, { text: prompt }]));
  console.log(`  ✓ tools/_raw/ugshop_gem_${v.key}.png`);
}
console.log('完了。⚠粒・頭身（肩÷顔）を実測してから見せること。');
