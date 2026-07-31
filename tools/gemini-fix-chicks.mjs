// ─────────────────────────────────────────────────────────────────────────────
// gemini-fix-chicks.mjs — スカートの「中央のひよこ」が欠けている絵を直す（2026-07-31）
//
// ⚠ユーザー指摘（2026-07-31）:
//   「タイトルショップも画像そのものは良いのですが、**中央のひよこが1つ足りません**」
//   「たちぐいそばも同様です。キャラクター画像は素晴らしいのですが、**ひよこが1つ足りません**」
//   ＝正は **中央に大きいの1つ＋左右に小さいの2つ＝計3つ**（`ART_STYLE.md`「スカート」）
//
// ⚠**生成AIは中央のひよこを落とす癖がある。** 1.709 のぴよフラッシュでも候補3枚中2枚が
//   中央欠けで上がってきた。**上がりは毎回ひよこを数える**こと。
//
// 🛠 直し方＝1.709 で効いた手順:
//   参照 ①`images/shop01.jpg`（タッチと髪の色の正） ②**直す対象の採用済みの絵**（構図・顔・部屋の正）
//   プロンプトで「②をそのまま描き直す。**直すのはスカートのひよこだけ**」と限定する
//   ⚠②の顔は既に確定済み（そばは年齢を shop05 に合わせた版）＝**顔を作り直させない**
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-fix-chicks.mjs'
//       --only=tshop / --only=soba で片方だけ
// 検品: ①**ひよこが3つあるか（数える）** ②顔が変わっていないか ③構図・画角が変わっていないか
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

const CHICKS = [
  'THE ONE THING TO FIX: her yellow bell-shaped skirt must carry THREE CREAM-COLOURED CHICK APPLIQUES across',
  'the front — ONE LARGER CHICK EXACTLY IN THE MIDDLE, plus one SMALLER CHICK on each side of it.',
  'In reference image 2 the MIDDLE chick is MISSING and only the two side chicks are there; add the middle one.',
  'Each chick is a simple cream oval with two dot eyes and a tiny orange beak, in the same style as the existing ones.',
  'Count them before you finish: THREE chicks, evenly spaced, the middle one the biggest.',
].join(' ');

const KEEP_ALL = [
  'REFERENCE IMAGE 2 IS THE ADOPTED ARTWORK AND EVERYTHING ELSE IN IT IS CORRECT. Redraw that exact same picture:',
  'the same room and background, the same props, the same camera distance and framing, the same composition,',
  'the same pose, and above all THE SAME FACE — her eyes, her expression, her age and her hairstyle must be',
  'identical to reference image 2. Do not make her younger, do not enlarge her eyes, do not change her hair.',
  'Do not zoom in or out and do not shift anything sideways.',
].join(' ');

const TOUCH = [
  'REFERENCE IMAGE 1 defines the ART TOUCH and her colours: imitation pixel art with clean square blocks and',
  'smooth shading, hair in a dark PURPLE-TINTED CHARCOAL with a cool violet-grey sheen (never warm or brown),',
  'and a golden lemon yellow for the dress. Keep the same block size and line weight as reference images 1 and 2.',
  'No grain, no dithering, no halftone dots.',
].join(' ');

const COSTUME = [
  'The rest of her costume stays as it is: white pointed collar with a yellow ribbon tie, yellow ribbed bib with',
  'two dark buttons, black puff sleeves with yellow frilled straps, black corset with two rows of gold studs,',
  'black-and-yellow tiered ruffles at the hem, black thigh-high socks with gold bows. NO CAT TAIL.',
].join(' ');

const TARGETS = [
  {
    key: 'tshop', file: 'title_shop.jpg', out: 'tshop_chicks',
    extra: 'The shopkeeper is the little girl wizard in the blue pointed hat behind the counter, exactly as in reference image 2, and the heroine is offering her a gold coin.',
    aspect: 'Landscape composition, 4:3 aspect ratio.',
  },
  {
    key: 'soba', file: 'soba_shop_scene.jpg', out: 'soba_chicks',
    extra: 'She is standing at the shop counter eating hot soba noodles from a steaming bowl with wooden chopsticks, framed from the waist up, and SHE IS THE ONLY PERSON in the picture. The bottom edge of her skirt with the chicks is visible above the counter.',
    aspect: 'Landscape composition, 3:2 aspect ratio.',
  },
];

const COMMON = 'No text, no lettering, no numbers, no logo, no watermark, no border, no UI, no signature.';

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
const refTouch = await part(path.join(IMAGES_DIR, 'shop01.jpg'));
console.log(`モデル: ${MODEL}`);

for (const t of TARGETS) {
  if (ONLY && ONLY !== t.key) continue;
  const refImg = await part(path.join(IMAGES_DIR, t.file));
  console.log(`■ ${t.file} を直す（参照②に採用済みの絵を渡す）`);
  for (const k of ['a', 'b', 'c']) {
    const prompt = [KEEP_ALL, CHICKS, TOUCH, COSTUME, t.extra, t.aspect, COMMON].join(' ');
    console.log(`  ● ${t.out}_${k}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `${t.out}_${k}.png`), await call(ai, [refTouch, refImg, { text: prompt }]));
    console.log(`    ✓ tools/_raw/${t.out}_${k}.png`);
  }
}
console.log('完了。⚠**ひよこを数える**／顔が変わっていないか／画角が変わっていないかを確認してから見せること。');
