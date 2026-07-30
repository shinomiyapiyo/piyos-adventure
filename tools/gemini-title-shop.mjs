// ─────────────────────────────────────────────────────────────────────────────
// gemini-title-shop.mjs — タイトルのショップ画面の背景 title_shop.jpg を作り直す（2026-07-31）
//
// ⚠現行の不備（監査 2026-07-31）:
//   ・ぴよ氏が **オフショルダー**（肩が出ている）／腰に大きな黄色いリボン／**ハイヒール**（正は丸い靴）
//   ・**尻尾が生えている**（✅ユーザー指示で削除。`title.jpg` にも尻尾は無い）
//   ・粒が 1.61 CSSpx と細かすぎ（2.0未満＝滑らかすぎの側。目標はおおむね 2.4〜3.2）
//
// ⚠ユーザー指示（2026-07-31）:
//   ・**直すのはぴよ氏が中心**。店員は活かす
//   ・**尻尾は無くす**
//   ・**店員の魔法使いは幼女**＝幼く可愛い女の子として描く
//
// 🎯 表示は #tshopImgArea（実機 852×393 で 528×393・background cover）
//   → 3:2 で出すと表示倍率は約0.47。画面上の粒 2.4〜3.2 にするには **横幅に約215粒**。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-title-shop.mjs'
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
  'long black twin-tail hair in a dark purple-tinted charcoal (never brown, never pure black), blunt straight bangs,',
  'black cat ears with pale pink insides joined to a yellow frilled headband, a yellow bow at her left ear,',
  'and the yellow-and-black frilled maid dress exactly as in reference image 1:',
  'WHITE POINTED COLLAR with a YELLOW RIBBON TIE, a YELLOW RIBBED BIB with two small buttons,',
  'BLACK PUFF SLEEVES that fully COVER HER SHOULDERS with yellow frills on top,',
  'black corset with two rows of gold studs, bell-shaped yellow skirt with cream chick appliques,',
  'black-and-yellow tiered ruffles at the hem, black thigh-high socks with gold bows,',
  'and ROUND FLAT BLACK SHOES with small gold toe bows.',
  'A soft pale-pink rim light traces her silhouette.',
].join(' ');

// ❌ 現行で外れていた点を名指しで禁止する
const PIYO_FIX = [
  'CRITICAL — things that must NOT appear on her (the current artwork got these wrong):',
  'NO bare shoulders and NO off-the-shoulder dress — her puff sleeves cover her shoulders completely.',
  'NO large bow or sash tied at her waist or hip.',
  'NO high heels and NO platform shoes — flat rounded shoes only.',
  'NO CAT TAIL — she does not have a tail at all. Do not draw a tail behind her or beside her legs.',
].join(' ');

const PIYO_FACE = [
  'HER FACE: LARGE ROUND dark reddish-brown eyes with a big iris and TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS',
  '(large highlights are essential — tiny pinprick highlights make her look adult and lose the charm);',
  'a soft ROUND face with full cheeks and a small chin, clear oval pink blush, a small happy smile, almost no nose.',
].join(' ');

// 店員＝幼女の魔法使い（✅ユーザー指定・2026-07-31）
const KEEPER = [
  'THE SHOPKEEPER stands behind the counter: a LITTLE GIRL WIZARD — young, small and cute,',
  'clearly a child, noticeably shorter and smaller than the heroine.',
  'She has short-to-medium brown hair, big round friendly eyes, round cheeks and a bright open smile.',
  'She wears a deep blue pointed wizard hat with white stars and an orange band, a blue wizard robe with a belt,',
  'and holds a wooden staff. Draw her in the SAME Japanese anime pixel style as the heroine — sweet and endearing,',
  'not a teenager and not an adult.',
].join(' ');

const PROPORTION = [
  'PROPORTIONS: the heroine is slim and about 4.5 to 5 heads tall as in reference image 1;',
  'her shoulders are clearly wider than her head. NEVER chibi, super-deformed, SD or big-headed for her.',
  'The little wizard girl is childlike and smaller, but still not a 2-heads-tall mascot.',
].join(' ');

const GRAIN = [
  'ART MEDIUM: imitation pixel art exactly like reference image 1 —',
  'CHUNKY VISIBLE SQUARE BLOCKS combined with smooth gradient shading.',
  'The whole image must read as if drawn on a grid roughly 215 BLOCKS WIDE; the blocks must be clearly visible.',
  'Do NOT render a smooth high-resolution anti-aliased illustration.',
].join(' ');

const ROOM = [
  'SETTING: a warm wooden fantasy ITEM SHOP interior, viewed at a slight angle.',
  'A long wooden counter runs across the lower half; behind it, shelves of colourful glass potion bottles,',
  'spell books, rolled scrolls, small swords and pouches, a hanging lantern, a potted plant, a stone wall.',
  'Warm amber light. The heroine stands on the LEFT in front of the counter facing the shopkeeper,',
  'the little wizard girl stands behind the counter on the RIGHT.',
].join(' ');

const COMMON = 'Wide landscape composition, 3:2 aspect ratio. No text, no lettering, no signboard writing, no logo, no watermark, no border, no UI, no signature.';

const VARIANTS = [
  { key: 'a', extra: 'The heroine is seen in full from head to shoes, standing three-quarters toward the viewer.' },
  { key: 'b', extra: 'Both girls are framed from the knees up, a little closer to the viewer.' },
  { key: 'c', extra: 'The heroine stands in profile-ish three-quarter view holding out a coin, the little wizard reaching to take it.' },
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
const refShop = await part(path.join(IMAGES_DIR, 'title_shop.jpg'));  // 店員と店のレイアウトの参考（画風は真似させない）
console.log(`モデル: ${MODEL}`);

for (const v of VARIANTS) {
  const prompt = [PIYO, PIYO_FIX, PIYO_FACE, KEEPER, PROPORTION, GRAIN, ROOM,
    'REFERENCE IMAGE 2 shows the existing shop layout and the shopkeeper — reuse the layout and her costume, but redraw her as described above and in the art style of reference image 1.',
    v.extra, COMMON].join(' ');
  console.log(`● tshop_gem_${v.key}.png 生成中...`);
  await fs.writeFile(path.join(RAW_DIR, `tshop_gem_${v.key}.png`), await call(ai, [refPiyo, refShop, { text: prompt }]));
  console.log(`  ✓ tools/_raw/tshop_gem_${v.key}.png`);
}
console.log('完了。⚠粒と「尻尾が無いこと」を確認してから見せること。');
