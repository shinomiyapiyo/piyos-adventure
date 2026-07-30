// ─────────────────────────────────────────────────────────────────────────────
// gemini-manju-scene.mjs — 地底「極楽まんじゅう」を食べるカットイン manju_scene.jpg を作り直す（2026-07-31）
//
// ⚠現行の不備（監査 2026-07-31）:
//   ・顔が68粒＝基準(title=20粒)の3.4倍細かく、**ドット感が消えてほぼ滑らかなイラスト**になっている
//   ・髪が茶色（正は紫みのチャコール）
//   ・衣装が黒＋金で**黄色いビブが無い**（正はメイド服）
//
// ⚠ユーザー指示（2026-07-31）: **おそるおそる食べているところ**にする。
//   （極楽まんじゅうは地底の怪しい老婆から買う品＝恐る恐る口に運ぶのが自然）
//
// 🎯 表示は showSobaScene の全画面 <img>（object-fit:contain / image-rendering:pixelated）。
//   実機 852×393 で 3:2 の絵は 585×393 に収まる＝表示倍率 約0.46。
//   → 画面上の粒 2.5〜2.9 CSSpx にするには **画像の横幅に約215粒**。
//   参考: 同じ表示方式の soba_shop_scene.jpg は 2.68 CSSpx で合格している（manju だけ 1.69 で外れていた）。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-manju-scene.mjs'
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

const PIYO = [
  'REFERENCE IMAGE 1 (the girl standing outdoors) defines the HEROINE. Draw the SAME girl:',
  'long black twin-tail hair in a DARK PURPLE-TINTED CHARCOAL — never brown, never pure black —',
  'blunt straight bangs, black cat ears with pale pink insides joined to a yellow frilled headband,',
  'a yellow bow at her left ear, and the yellow-and-black frilled maid dress:',
  'WHITE POINTED COLLAR with a YELLOW RIBBON TIE, a YELLOW RIBBED BIB with two small buttons,',
  'black puff sleeves with yellow frills, black corset with two rows of gold studs.',
  'The yellow bib is essential — her chest must read YELLOW, not black.',
  'A soft pale-pink rim light traces her silhouette.',
].join(' ');

// 🌟 可愛さの勘所（ART_STYLE）＋ 今回の表情
const FACE = [
  'HER FACE — follow exactly:',
  'LARGE ROUND dark reddish-brown eyes with a big iris and TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS',
  '(large highlights are essential — small pinprick highlights make her look adult and kill the charm);',
  'a soft ROUND face with full cheeks and a small chin; clear oval pink blush; almost no nose.',
  'EXPRESSION: she is eating TIMIDLY AND FEARFULLY — she has just taken the tiniest nervous nibble',
  'of the bun she is holding in both hands close to her mouth.',
  'Her eyebrows are worried and slanted, one eye squeezed shut or both eyes narrowed apprehensively,',
  'a single bead of nervous sweat on her temple. She is bracing herself, unsure whether it is safe to eat —',
  'apprehensive and a little scared, but still cute. NOT crying, NOT disgusted, NOT happy.',
].join(' ');

const PROPORTION = [
  'PROPORTIONS: slim girl of about 4.5 to 5 heads tall as in reference image 1.',
  'Her shoulders are clearly wider than her head. NEVER chibi, super-deformed, SD or big-headed.',
].join(' ');

// 🎯 粒。現行はここを外して滑らかな絵になっていた。
const GRAIN = [
  'ART MEDIUM — CRITICAL: imitation pixel art exactly like reference image 1:',
  'CHUNKY VISIBLE SQUARE BLOCKS combined with smooth gradient shading.',
  'The whole image must read as if drawn on a grid roughly 215 BLOCKS WIDE — the blocks must be clearly visible.',
  'Her face should be built from about 30 blocks across the cheeks.',
  'Do NOT render a smooth, high-resolution, anti-aliased illustration — the pixel blocks are the point.',
].join(' ');

const ROOM = [
  'SETTING: inside the creepy underground shop of an old crone, a cramped cave of dark rock.',
  'Behind her: rough wooden shelves with murky glass jars, clay pots, dried herbs hanging from the ceiling,',
  'and a single warm lantern as the only light. Dark, damp and faintly ominous,',
  'with the warm lantern glow picking out her face and the pale white bun.',
  'She is holding a plain WHITE STEAMED BUN (manju) in both hands, raised to her mouth.',
].join(' ');

const COMMON = 'Wide landscape composition, 3:2 aspect ratio. No text, no logo, no watermark, no border, no UI, no signature.';

const VARIANTS = [
  { key: 'a', extra: 'Framed from the chest up, she fills the centre-right of the frame.' },
  { key: 'b', extra: 'Framed from the waist up, slightly further back so her yellow bib and the corset are clearly visible.' },
  { key: 'c', extra: 'Framed from the chest up and turned slightly to one side, glancing warily out of the corner of her eye while she nibbles.' },
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
const refShop = await part(path.join(IMAGES_DIR, 'ug_shop01.jpg'));  // 1.701の新しい店＝雰囲気と粒の参考
console.log(`モデル: ${MODEL}`);

for (const v of VARIANTS) {
  const prompt = [PIYO, FACE, PROPORTION, GRAIN, ROOM, v.extra, COMMON].join(' ');
  console.log(`● manju_gem_${v.key}.png 生成中...`);
  await fs.writeFile(path.join(RAW_DIR, `manju_gem_${v.key}.png`), await call(ai, [refPiyo, refShop, { text: prompt }]));
  console.log(`  ✓ tools/_raw/manju_gem_${v.key}.png`);
}
console.log('完了。⚠粒（目標: 横幅に約215粒 / 画面上2.5〜2.9 CSSpx）を実測してから見せること。');
