// ─────────────────────────────────────────────────────────────────────────────
// gemini-special-cutin.mjs — 必殺技「ぴよフラッシュ」のカットイン special_cutin.png を作り直す（2026-07-31）
//
// ⚠ユーザー指示（2026-07-31・一覧比較を見て）:
//   ・「**必殺技らしい勢いを感じるのは良い**」→ **構図と勢いは維持する**
//   ・「**口を開けて歯が見えているのは問題ない**」→ ここは直さない（`ART_STYLE.md` の可愛さ5点の例外）
//   ・❌「**ノイズがあるように感じる**」→ 直す
//   ・❌「**スカートに中央のひよこが足りない**」→ 正は**中央に大きいの1つ＋左右に小さいの2つ＝計3つ**
//
// 🎯 参照の渡し方（`ART_STYLE.md`「🔁差分の絵は採用済みの絵を参照に」の応用）
//   ①`images/shop01.jpg`  … **タッチと髪の色の正**（1.704〜1.708 で揃えた絵）。ノイズを消す拠り所
//   ②`images/special_cutin.png` … **構図と勢いの正**（放射状の閃光・拳を突き出すポーズ）
//   ⚠②は「勢いの参考」であって画風の参考にしない。**ノイズと粗い網点は真似させない**と明記する
//
// 🖼 表示: 全画面のフラッシュ演出（1024×576＝16:9・`index.html` の specialCutinImg）。
//   ⚠**現行と同じ 16:9 で出す**（縦横比を変えると演出の切り出しが変わる）
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-special-cutin.mjs'
// 検品: ①ノイズ／網点が消えているか ②**スカートのひよこが3つあるか** ③勢いが落ちていないか
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const MODEL = getArg('model') || process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
const ONLY  = getArg('only');

const KEEP = [
  'REFERENCE IMAGE 2 is the current special-attack cut-in and its COMPOSITION AND ENERGY ARE CORRECT — keep them:',
  'the heroine bursting forward at the centre, one fist thrust out, radial white-and-gold speed lines exploding',
  'from behind her, bright sparkles and a rainbow arc, a blast of golden light. Keep that same dynamic pose and',
  'the same feeling of a finishing move, and keep her mouth OPEN in a fierce battle shout (an open shouting mouth',
  'is correct here and must stay).',
].join(' ');

const FIX = [
  'FIX EXACTLY TWO THINGS about reference image 2:',
  '(1) NO NOISE. Reference image 2 looks grainy and speckled — do NOT reproduce that. Draw CLEAN flat pixel-art',
  'colour areas with crisp block edges, no film grain, no dithering, no halftone dots, no speckling, no fuzzy',
  'gradients inside the light rays.',
  '(2) HER SKIRT MUST CARRY THREE CREAM-COLOURED CHICK APPLIQUES — one LARGER chick in the CENTRE of the skirt',
  'front, plus one SMALLER chick on each side of it. The centre chick is missing in reference image 2.',
  'Each chick is a simple cream oval with dots for eyes and a tiny beak.',
].join(' ');

const TOUCH = [
  'REFERENCE IMAGE 1 IS THE TRUTH FOR THE ART TOUCH AND HER COLOURS. Match it: imitation pixel art with clean',
  'square blocks and smooth shading, her hair a dark PURPLE-TINTED CHARCOAL with a cool violet-grey sheen',
  '(never warm, never brown, never pure black), skin a light cream, and the yellow of her dress a golden lemon',
  'yellow. Use the same block size and line weight as reference image 1.',
].join(' ');

const COSTUME = [
  'HER COSTUME (as in reference image 1): long black twin-tails below her waist, blunt straight bangs,',
  'black cat ears with pale pink insides on a yellow frilled headband with a yellow bow at her left ear,',
  'a WHITE POINTED COLLAR with a YELLOW RIBBON TIE, a YELLOW RIBBED BIB with two dark buttons,',
  'BLACK PUFF SLEEVES with yellow frilled straps, a black corset with TWO ROWS OF GOLD STUDS,',
  'black cuffs with gold trim, the bell-shaped yellow skirt with the THREE chick appliques and black-and-yellow',
  'tiered ruffles, black thigh-high socks with gold bows, and round flat black shoes with gold toe bows.',
  'NO CAT TAIL — she has no tail.',
].join(' ');

const FACE = [
  'HER FACE: large round dark reddish-brown eyes with bright square white highlights, blunt bangs, pink blush,',
  'and her mouth OPEN in a determined battle shout. She is a girl of about twelve to fourteen —',
  'the same person and the same age as in reference image 1, NOT a small child.',
].join(' ');

const COMMON = [
  'Wide landscape composition, 16:9 aspect ratio, the heroine centred and filling most of the height.',
  'No text, no lettering, no numbers, no logo, no watermark, no border, no UI, no signature.',
].join(' ');

const VARIANTS = [
  { key: 'a', extra: 'Keep the framing of reference image 2 as closely as possible: her whole body from headband to shoes inside the burst of light.' },
  { key: 'b', extra: 'Slightly tighter: from the knees up, her thrust-out fist closer to the viewer for more impact, the radial rays wider behind her.' },
  { key: 'c', extra: 'Her whole body in view, turned a little more toward the viewer, both fists clenched with the golden blast erupting around her.' },
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
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行する）'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
const ai = new GoogleGenAI({ apiKey });
const refTouch = await part(path.join(IMAGES_DIR, 'shop01.jpg'));         // ①タッチと色の正
const refPose  = await part(path.join(IMAGES_DIR, 'special_cutin.png'));  // ②構図と勢いの正
console.log(`モデル: ${MODEL}`);
console.log('参照: ①images/shop01.jpg（タッチ・髪の色） ②images/special_cutin.png（構図・勢い）');

for (const v of VARIANTS) {
  if (ONLY && ONLY !== v.key) continue;
  const prompt = [KEEP, FIX, TOUCH, COSTUME, FACE, v.extra, COMMON].join(' ');
  console.log(`● cutin_${v.key}.png 生成中...`);
  await fs.writeFile(path.join(RAW_DIR, `cutin_${v.key}.png`), await call(ai, [refTouch, refPose, { text: prompt }]));
  console.log(`  ✓ tools/_raw/cutin_${v.key}.png`);
}
console.log('完了。⚠①ノイズが消えたか ②**スカートのひよこが3つ**あるか ③勢いが落ちていないかを見てから見せること。');
