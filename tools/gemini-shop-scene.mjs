// ─────────────────────────────────────────────────────────────────────────────
// gemini-shop-scene.mjs — ステージのお店の一枚絵（shop01〜04 の差し替え）を作る（2026-07-31）
//
// ⚠現行 shop01〜04 の不備（監査 2026-07-31・実測＋目視）:
//   ・**尻尾が生えている**（4枚すべて／`ART_STYLE.md`「尻尾は無い」に違反。Grok動画からの切り出しが原因）
//   ・白襟＋黄リボンタイが無く、胸に**黄色い花飾り**が付いている
//   ・スカートの**ひよこアップリケ3つ**が無く、丸い花飾りに置き換わっている
//   ・裾の段フリルに**白**が入っている（正は黒×黄の2色）
//   ・コルセットの**金の鋲2列**が見えない
//   ・目のハイライトが小さい（`ART_STYLE.md`「可愛さを左右する要素」①）
//   ・480×270（16:9）なので `cover` で**左右が9%ずつ切れている**
//   ✅頭身は約4.6で基準内。店員（茶髪三つ編みのエプロン娘）は活かす（✅ユーザー判断・2026-07-31）
//
// ⚠ユーザー方針（2026-07-31）:
//   ・**店員は現行を活かす**（直すのはぴよ氏が中心）
//   ・使うのは **標準時／成功時／失敗時の3パターン**（購入成功の shop02・shop03 の交互は廃止）
//   ・✅**採用**: `shop_gem_a` → 標準時（shop01）／`shop_gem_b` → 成功時（shop02）
//   ・❌**却下**: `shop_gem_c`（ハンマーを持っている＝タイトル絵と同じで、店の中の状況として意味不明）
//     → **指示していない小物を持たせない**。持たせるなら状況に意味があるものだけ
//   ・⚠**粒を粗くする加工は入れない**（`pixelate-blocks.mjs` を当てた版と見比べて
//     **ユーザーが元の生成画像そのままを選択**・2026-07-31）。実測は画面上1.34で
//     `ART_STYLE.md` の合格帯（2.4〜3.2）を下回るが、**この2枚はユーザー判断で採用**。
//     ＝失敗時も**同じ描き込みの細かさに揃える**のが正しい（数値に寄せると浮く）
//
// 🎯 表示は #shopImgArea（左パネル33% → 実機 852×393 で 571×393・background cover）
//   → 3:2 で出すと表示倍率は約0.46。画面上の粒 2.6〜2.9 にするには **横幅に約210粒**
//     （現行 shop01 = 画面上2.81 ✅／shop04 = 3.19 ⚠ ＝この帯を狙う）
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-shop-scene.mjs'
//       標準時の候補   … （引数なし・_raw/shop_gem_a|b|c.png）
//       失敗時の候補   … --set=fail（_raw/shop_fail_a|b|c.png・shop_gem_a を参照して表情だけ変える）
// 検品: zsh -ic 'cd tools && node measure-grain.mjs _raw/shop_gem_a.png --shop --region=...'
//       ⚠**粒と頭身と「尻尾が無いこと」を実測してからユーザーに見せる**
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
const ONLY  = getArg('only');            // 例 --only=a
const SET   = getArg('set', 'base');     // base=標準時の候補 / fail=失敗時（所持金不足）の候補

// ── ぴよ氏＝メイド服の正（ART_STYLE.md／title.jpg の実測から） ──
const PIYO = [
  'REFERENCE IMAGE 1 (the girl standing outdoors) defines the HEROINE. Draw the SAME girl:',
  'long black twin-tail hair reaching below her waist, in a dark PURPLE-TINTED CHARCOAL (never brown, never pure black),',
  'blunt straight bangs, black cat ears with pale pink insides joined to a yellow frilled headband,',
  'a large yellow bow at her left ear, and the yellow-and-black frilled maid dress exactly as in reference image 1:',
  'a WHITE POINTED COLLAR with a YELLOW RIBBON TIE at her throat, a YELLOW RIBBED BIB with two small dark buttons,',
  'BLACK PUFF SLEEVES that fully COVER HER SHOULDERS with yellow frilled straps on top,',
  'a black corset with TWO ROWS OF SQUARE GOLD STUDS, black cuffs with gold trim at her wrists,',
  'a bell-shaped yellow skirt with THREE CREAM-COLOURED CHICK APPLIQUES on the front',
  '(one larger in the middle, one smaller on each side),',
  'a hem of TIERED RUFFLES IN BLACK AND YELLOW ONLY, black thigh-high socks with gold bows at the cuff,',
  'a thin band of bare skin between socks and skirt, and ROUND FLAT BLACK SHOES with small gold toe bows.',
  'A soft pale-pink rim light traces her whole silhouette.',
].join(' ');

// ❌ 現行 shop01〜04 で外れていた点を名指しで禁止する
const PIYO_FIX = [
  'CRITICAL — mistakes in the current artwork that must NOT be repeated:',
  'NO CAT TAIL — she does not have a tail at all; do not draw a tail behind her, beside her legs or curling near the floor.',
  'NO flower, NO rose and NO round yellow ornament on her chest — her chest has the white collar and yellow ribbon tie only.',
  'NO round flower decorations on her skirt — the appliques on the skirt are little CREAM CHICKS, exactly three of them.',
  'NO WHITE frill in the skirt hem — the tiered ruffles alternate black and yellow only.',
  'NO bare shoulders and no off-the-shoulder dress. NO large bow or sash at her waist. NO high heels and no platform shoes.',
].join(' ');

// 😊 可愛さの勘所（ART_STYLE.md・生成のたびに崩れるので毎回明示する）
const PIYO_FACE = [
  'HER FACE: LARGE ROUND dark reddish-brown eyes with a big iris and TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS in each eye',
  '(the large square highlights are essential — tiny pinprick highlights instantly make her look adult and kill the charm);',
  'a soft ROUND face with full cheeks and a small chin, clear oval pink blush, a small rounded happy mouth, almost no nose.',
  'Her face is turned almost toward the viewer so BOTH EYES ARE THE SAME SIZE, even when her body is turned sideways.',
].join(' ');

// 店員＝現行を活かす（✅ユーザー判断・2026-07-31）
const KEEPER = [
  'THE SHOPKEEPER is the SAME young woman as in REFERENCE IMAGE 2: warm light-brown hair with a long braid over',
  'her left shoulder and a small braided crown, gentle smiling closed eyes, pink blush,',
  'a white puff-sleeved blouse with a small white collar and a BROWN APRON over it.',
  'She stands BEHIND the wooden counter, seen from about the waist up, smiling kindly at the heroine.',
  'Keep her friendly, adult and calm — she must read as the same shopkeeper as in reference image 2.',
].join(' ');

const PROPORTION = [
  'PROPORTIONS — ABSOLUTE REQUIREMENT: the heroine is slim and about 4.5 to 5 HEADS TALL, exactly as in reference image 1.',
  'Her whole body from the top of her headband down to the soles of her shoes is inside the frame, standing on the floor.',
  'The distance from her chin to her shoes is at least three times her head height, and her head is well under a quarter',
  'of her total height. Her shoulders are clearly wider than her head.',
  'NEVER chibi, NEVER super-deformed, NEVER SD, never a big-headed 2-or-3-heads-tall mascot, never a toddler body.',
].join(' ');

const GRAIN = [
  'ART MEDIUM: imitation pixel art exactly like reference images 1 and 2 —',
  'CHUNKY VISIBLE SQUARE BLOCKS combined with smooth gradient shading, with black outlines kept as blocky steps.',
  'The whole image must read as if drawn on a grid roughly 210 BLOCKS WIDE; the blocks must be clearly visible',
  'on her face, her dress and the wooden counter.',
  'Do NOT render a smooth high-resolution anti-aliased illustration, and do NOT render tiny fine dithering either.',
].join(' ');

// 失敗時（--set=fail）は採用済みの標準時の絵に合わせる＝粒の指示ではなく「参照と同じ密度」で縛る
const GRAIN_MATCH = [
  'ART MEDIUM: imitation pixel art with CHUNKY VISIBLE SQUARE BLOCKS and smooth gradient shading.',
  'Match the drawing density of REFERENCE IMAGE 2 EXACTLY — the same block size, the same amount of detail,',
  'the same line weight. Do not draw it smoother, softer or finer than reference image 2, and do not draw it coarser.',
].join(' ');

// 店の中身＝現行のレイアウトを引き継ぐ（同じ店だと分かるように）
const ROOM = [
  'SETTING — reuse the shop interior of REFERENCE IMAGE 2: a warm wooden fantasy ITEM SHOP seen slightly from the front.',
  'A long thick wooden counter runs across the middle of the picture, with a purple potion flask and a small dark book on it.',
  'Behind and to the LEFT, tall wooden shelves packed with colourful glass potion bottles, jars, cloth sacks,',
  'rolled scrolls and a couple of swords. On the RIGHT, a grey stone wall with a hanging map and a suit of armour,',
  'and a wooden treasure chest with gold fittings on the floor. Wooden plank floor. Warm amber lamplight,',
  'deep browns and warm shadows. The heroine stands on the RIGHT in front of the counter, her body turned toward the',
  'shopkeeper on the LEFT, and the shopkeeper is behind the counter on the LEFT.',
].join(' ');

const COMMON = [
  'Wide landscape composition, 3:2 aspect ratio.',
  'No text, no lettering, no signboard writing, no numbers, no logo, no watermark, no border, no UI, no signature.',
].join(' ');

// ─────────────────────────────────────────────────────────────────────────────
// --set=hairfix — ⚠ユーザー指摘（2026-07-31）:「**成功時の髪の色が違うのが気になる**」
//   実測でも `shop02` だけ**髪の明部が赤茶**に寄っていた（他は紫みのチャコール）:
//     基準 title #4e3f4d (B-G=14/R-B= 1) ／ shop01 #4f434f (12/ 0) ／ shop04 #573f4d (14/10)
//     ❌shop02 #5e4146 (B-G= 5 / **R-B=24**)
//   → **ポーズと表情は採用済みのまま**（両手を胸の前で合わせて喜ぶ）、髪の色だけ直す。
//   参照 ①`images/shop01.jpg`＝髪の色とタッチの正／②`images/shop02.jpg`＝芝居の正
// ─────────────────────────────────────────────────────────────────────────────
const HAIR_FIX = [
  'REFERENCE IMAGE 2 is the APPROVED artwork for this scene: keep her POSE, her EXPRESSION (happily holding both',
  'hands together in front of her chest), the framing, the room and every prop EXACTLY as they are there.',
  'FIX ONLY ONE THING — HER HAIR COLOUR. In reference image 2 the highlights in her hair are too WARM and',
  'BROWN-RED. Her hair must be a DARK PURPLE-TINTED CHARCOAL exactly like REFERENCE IMAGE 1:',
  'the mid tones around #40323C and the sheen/highlights around #4F434F — a cool violet-grey sheen,',
  'NEVER a warm brown or reddish-brown sheen, and never pure black.',
  'Every other colour in the picture stays the same.',
].join(' ');

// ── 失敗時（所持金不足＝shop04 相当）の表情と芝居 ──
// ⚠採用済みの標準時（shop_gem_a）を参照2に渡して、部屋・店員・カメラ距離・画風を固定する。
//   変えるのは**ぴよ氏の表情とポーズ、店員の表情だけ**。
const FAIL_MOOD = [
  'CHANGE ONLY HER EXPRESSION AND POSE — she has just found out she CANNOT AFFORD the item.',
  'Her eyebrows are pushed up and together in dismay, her big round eyes are WATERY with a glint of tears',
  '(still the two large square white highlights), her small mouth is open in a little wobbly "uu..." of disappointment,',
  'and her cheeks keep their pink blush. She looks troubled and a bit sorry, NOT angry and NOT crying hard —',
  'she must stay cute and endearing, the kind of face that makes the player want to help her.',
  'Her shoulders drop slightly.',
].join(' ');

const FAIL_KEEPER = [
  'THE SHOPKEEPER reacts with a kind, apologetic look: her eyes are OPEN now, eyebrows raised in gentle concern,',
  'a small sorry smile, one hand raised in a soft "sorry, not enough" gesture. She is still the same brown-haired,',
  'braided, brown-aproned shopkeeper behind the counter, in the same place as in reference image 2.',
].join(' ');

const FAIL_VARIANTS = [
  { key: 'a', extra: 'She holds both hands together in front of her chest and looks up at the shopkeeper with a troubled, teary face. No props in her hands.' },
  { key: 'b', extra: 'She turns a small YELLOW COIN POUCH upside down with both hands and nothing falls out of it — an empty purse, which is why she cannot pay. Keep the pouch small and simple. No other props.' },
  { key: 'c', extra: 'She stands with her arms hanging down and her head tilted slightly forward in disappointment, looking down at the counter. No props in her hands.' },
];

// ── 候補（入店の絵＝shop01 相当。差分は採用後に派生させる） ──
const VARIANTS = [
  { key: 'a', extra: 'The heroine stands relaxed with one hand resting lightly on the counter, smiling at the shopkeeper. Full figure from headband to shoes, at the same distance as in reference image 2.' },
  { key: 'b', extra: 'The heroine is a little closer to the viewer so her face and dress read larger, still full length from headband to shoes, both hands held together in front of her chest.' },
  { key: 'c', extra: 'The heroine stands with her left hand on her hip and her elbow out, exactly the pose of reference image 1, looking happily toward the shopkeeper. Full figure from headband to shoes.' },
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
const refPiyo = await part(path.join(IMAGES_DIR, 'title.jpg'));    // ①顔・衣装・頭身の正
console.log(`モデル: ${MODEL}`);

if (SET === 'hairfix') {
  const refShop02 = await part(path.join(IMAGES_DIR, 'shop02.jpg'));  // ②芝居の正（採用済み）
  for (const key of ['a', 'b', 'c']) {
    if (ONLY && ONLY !== key) continue;
    const prompt = [HAIR_FIX, PIYO, PIYO_FIX, PIYO_FACE, PROPORTION, GRAIN_MATCH, COMMON].join(' ');
    console.log(`● shop02_hair_${key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `shop02_hair_${key}.png`), await call(ai, [refPiyo, refShop02, { text: prompt }]));
    console.log(`  ✓ tools/_raw/shop02_hair_${key}.png`);
  }
  console.log('完了。⚠髪の明部の B-G / R-B を実測して shop01 と揃ったかを見てから見せること。');
} else if (SET === 'fail') {
  // 失敗時＝採用済みの標準時（shop_gem_a）を参照2にして、表情だけ差し替える
  const refBase = await part(path.join(RAW_DIR, 'shop_gem_a.png'));
  for (const v of FAIL_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [
      'REFERENCE IMAGE 2 is the ADOPTED artwork of this exact scene. Redraw that same picture:',
      'the same shop interior, the same props, the same shopkeeper, the same camera distance and framing,',
      'the same position of the heroine on the right in front of the counter, the same colours and the same lighting.',
      PIYO, PIYO_FIX, PIYO_FACE, PROPORTION, GRAIN_MATCH,
      FAIL_MOOD, FAIL_KEEPER, v.extra, COMMON,
    ].join(' ');
    console.log(`● shop_fail_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `shop_fail_${v.key}.png`), await call(ai, [refPiyo, refBase, { text: prompt }]));
    console.log(`  ✓ tools/_raw/shop_fail_${v.key}.png`);
  }
  console.log('完了。⚠尻尾／頭身／余計な小物が無いことを確認してから見せること。');
} else {
  const refShop = await part(path.join(IMAGES_DIR, 'shop01.jpg')); // ②店のレイアウトと店員（⚠画風と尻尾は真似させない）
  for (const v of VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [
      PIYO, PIYO_FIX, PIYO_FACE, KEEPER, PROPORTION, GRAIN, ROOM,
      'REFERENCE IMAGE 2 shows the existing shop and shopkeeper: reuse the room layout, the props and the shopkeeper,',
      'but redraw the heroine strictly as described above (reference image 1 is the truth for her).',
      'IGNORE the heroine in reference image 2 — her dress details there are WRONG and she has a tail, which must be removed.',
      v.extra, COMMON,
    ].join(' ');
    console.log(`● shop_gem_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `shop_gem_${v.key}.png`), await call(ai, [refPiyo, refShop, { text: prompt }]));
    console.log(`  ✓ tools/_raw/shop_gem_${v.key}.png`);
  }
  console.log('完了。⚠頭身／尻尾が無いことを確認してから見せること。');
}
