// ─────────────────────────────────────────────────────────────────────────────
// gemini-soba-scene.mjs — たちぐいそばのカットイン soba_shop_scene.jpg を作り直す（2026-07-31）
//
// ⚠ユーザー指示（2026-07-31）:
//   ・**現在の画像はタッチが違いすぎる**
//   ・**美少女のぴよ氏が美味しそうにたちぐいそばを食べている様子**
//   ・**他に人は写り込まない**（ぴよ氏だけ。店主も客も描かない）
//   ・🌟**「数値上の問題よりも、要するに美少女感が足りない」**（＝作り直しの本当の主目的）
//
// 🌟 何が「美少女感」を殺していたか（現行画像の実際の症状）
//   1. **目を閉じている**（>< の笑顔）＝可愛さの決定要素「大きな丸い目＋四角ハイライト2つ」が**丸ごと無い**
//   2. **口を大きく開けて歯と歯茎が見えている**＝品が落ちて子供っぽくなる
//   3. **顔がブロックで潰れている**（顔28粒あっても粗い）＝まつげ・瞳の描き込みが載らない
//   → 対策は「**顔を大きく取る × 粒を細かくする**」の掛け算。粒の話は美少女感の**手段**であって目的ではない。
//     だから候補は**全部バストアップ〜腰から上**にして、顔に使えるピクセルを最大化する。
//
// 🎯 タッチを何に合わせるか（実測・`ART_STYLE.md`「📏ドット感の基準」）
//   現行 soba          … ファイル内の粒 7.61px（顔28粒）→ 全画面 ×0.384 → 画面上 2.92
//   shortcake(1.700)   … 6.61px → ×0.463 → 3.06
//   **shop01(1.704)**  … **2.78px** → ×0.46 → **1.29** ← ✅ユーザーが選んだタッチ
//   ＝現行そばは**採用タッチの2.7倍のブロック**。`shop01` と**同じ 1264×848・同じ出し方**で
//     生成すれば表示倍率まで一致する（どちらも3:2・全画面 contain で ×0.46）。
//   → 参照2に `images/shop01.jpg` を渡して「このタッチに合わせろ」と縛る。
//
// 🎯 表示は全画面オーバーレイ（`showSobaScene`・`object-fit:contain`）
//   ⚠**下から12%の中央に「❤ HPが◯かいふく！」のテロップが乗る**（index.html の showSobaScene）。
//     丼や顔をそこに置かない＝下端は木のカウンターなど無地にしておく。
//   ⚠**表示は1.5秒で自動で閉じる**＝一瞬で「そばを美味しそうに食べている」と伝わる構図にする。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-soba-scene.mjs'
// 検品: zsh -ic 'cd tools && node measure-grain.mjs _raw/soba_gem_a.png --region=...'
//       ⚠**ファイル内の粒 2.6〜3.4px** を狙う（画面上 1.2〜1.6＝shop01 と同じ見え方）
//       ⚠口が大きく開いて歯茎が見えていないか／目を閉じていないかも必ず見る
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
const SET   = getArg('set', 'base');   // base=最初の3枚 / interior=ぴよ氏を活かして背景だけ店内に振り直す
const REF   = getArg('ref', 'soba_gem_b.png');  // interior のときに「ぴよ氏の正」として渡す候補

// ── ぴよ氏＝メイド服の正（ART_STYLE.md／title.jpg の実測から） ──
const PIYO = [
  'REFERENCE IMAGE 1 (the girl standing outdoors) defines the GIRL. Draw the SAME girl — a pretty, charming',
  'anime girl, not a mascot: long black twin-tail hair reaching below her waist, in a dark PURPLE-TINTED CHARCOAL',
  '(never brown, never pure black), blunt straight bangs, black cat ears with pale pink insides joined to a',
  'yellow frilled headband, a large yellow bow at her left ear, and the yellow-and-black frilled maid dress',
  'exactly as in reference image 1: a WHITE POINTED COLLAR with a YELLOW RIBBON TIE at her throat,',
  'a YELLOW RIBBED BIB with two small dark buttons, BLACK PUFF SLEEVES that fully COVER HER SHOULDERS with',
  'yellow frilled straps on top, a black corset with TWO ROWS OF SQUARE GOLD STUDS, black cuffs with gold trim',
  'at her wrists, and a bell-shaped yellow skirt with THREE CREAM CHICK APPLIQUES and black-and-yellow tiered ruffles.',
  'A soft pale-pink rim light traces her silhouette.',
].join(' ');

// 🌟 最優先＝美少女感（ユーザー指摘・2026-07-31）
const BISHOUJO = [
  'THE SINGLE MOST IMPORTANT REQUIREMENT: she must look GENUINELY PRETTY — a lovely, beautiful anime girl.',
  'The current artwork fails exactly here, so put your effort into her face above everything else.',
  'Give her a delicately drawn, adorable face with real care: long dark upper eyelashes, big glossy eyes with',
  'a warm gradient in the iris, soft rounded cheeks, a graceful little chin, and neat shining hair.',
  'She should look sweet, refined and charming — the kind of face a player wants to look at.',
  'Do NOT make her goofy, gag-faced, plain or blocky-faced.',
].join(' ');

// 😊 可愛さの勘所（ART_STYLE.md）＋❌現行の失敗を名指しで禁止
const PIYO_FACE = [
  'HER FACE — this is the most important part of the picture, and it must be drawn LARGE and CLEAN:',
  'LARGE ROUND dark reddish-brown eyes, WIDE OPEN and shining, each with TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS',
  '(large square highlights are essential; tiny pinprick highlights make her look adult and kill the charm),',
  'a soft ROUND face with full cheeks and a small chin, clear oval pink blush, almost no nose,',
  'and a SMALL ROUNDED mouth. Her face is turned almost toward the viewer so BOTH EYES ARE THE SAME SIZE.',
  'She looks blissfully happy — the food is delicious.',
].join(' ');

const PIYO_FIX = [
  'CRITICAL — mistakes in the current artwork that must NOT be repeated:',
  'Her mouth must NOT be stretched wide open, and NO teeth and NO gums may be visible —',
  'she is delicately slurping a few noodles through a SMALL rounded mouth.',
  'Her eyes must NOT be squeezed shut and NOT drawn as happy closed curves — keep them wide open and shining.',
  'NO CAT TAIL — she does not have a tail at all.',
  'Her dress must keep its readable details (collar, ribbon tie, bib, studs, frills) — do NOT let it collapse',
  'into a shapeless yellow mass.',
  'NO bare shoulders, NO large bow at her waist.',
].join(' ');

const PROPORTION = [
  'PROPORTIONS: she is slim and about 4.5 to 5 heads tall as in reference image 1, and her shoulders are clearly',
  'wider than her head (shoulder width about 1.45 times her head width).',
  'NEVER chibi, NEVER super-deformed, NEVER SD, never a big-headed 2-or-3-heads-tall mascot, never a toddler body.',
].join(' ');

// ⚠タッチを shop01（1.704・ユーザー採用）に合わせる。これが今回の作り直しの主目的
const GRAIN = [
  'ART MEDIUM — MATCH REFERENCE IMAGE 2 EXACTLY. Reference image 2 is the adopted artwork of this game and',
  'defines the required touch: imitation pixel art with FINE, DENSE square blocks plus smooth gradient shading.',
  'Use the SAME block size, the SAME density of detail and the SAME line weight as reference image 2.',
  'The current soba artwork is drawn with blocks roughly 2.7 TIMES TOO LARGE — do NOT draw chunky coarse blocks.',
  'The whole image must read as if drawn on a grid roughly 430 BLOCKS WIDE.',
].join(' ');

// --set=stageshop 用。参照1が店内そのものなので「参照1に合わせろ」だけで足りる
const GRAIN_SHOP = [
  'ART MEDIUM — MATCH REFERENCE IMAGE 1 EXACTLY. It is the adopted artwork of this shop and defines both the',
  'room and the required touch: imitation pixel art with FINE, DENSE square blocks plus smooth gradient shading.',
  'Use the SAME block size, the SAME density of detail and the SAME line weight. Do NOT draw chunky coarse blocks.',
].join(' ');

// ── たちぐいそばの屋台（⚠人はぴよ氏だけ） ──
const SCENE = [
  'SETTING: a cosy Japanese STANDING SOBA NOODLE STALL at night, seen from the customer side.',
  'She is STANDING at a narrow wooden counter (there are no stools — this is a standing-only stall),',
  'holding a steaming brown noodle bowl and wooden chopsticks, lifting a few soba noodles toward her mouth.',
  'Fragrant white STEAM curls up from the bowl. Warm paper lanterns glow on both sides,',
  'a dark red noren curtain hangs behind her, and the wooden wall of the stall is lit in warm amber.',
  'Deep warm browns and reds, cosy night-time lighting.',
  'ONLY THE GIRL IS IN THE PICTURE — no shopkeeper, no cook, no other customers, no other people at all,',
  'not even in the background or as a silhouette.',
].join(' ');

const LAYOUT = [
  'FRAMING: keep the LOWEST 15% of the frame simple and uncluttered — plain counter wood or dark shadow —',
  'because a caption is drawn over that band. Her face and the bowl must sit ABOVE that band.',
  'The picture must read instantly at a glance: a happy girl eating hot soba.',
].join(' ');

const COMMON = [
  'Wide landscape composition, 3:2 aspect ratio.',
  'No watermark, no border, no UI, no signature, no numbers, no English lettering.',
].join(' ');

const NOREN_TEXT = [
  'The dark red noren curtain behind her has exactly the two Japanese hiragana characters そば',
  'painted on it in thick white brush strokes, clean and correctly formed. No other text anywhere.',
].join(' ');
const NOREN_PLAIN = 'The dark red noren curtain behind her is PLAIN with no writing on it. No text anywhere in the image.';

// ⚠3枚とも**顔を大きく取る**（美少女感のため）。引きの構図は作らない
const VARIANTS = [
  { key: 'a', noren: NOREN_TEXT,  extra: 'Framed from the WAIST UP so her face is large in the frame. She faces the viewer, holding the bowl in her left hand at chest height, her chopsticks lifting a few noodles toward her small mouth. Her collar, ribbon tie and bib stay visible.' },
  { key: 'b', noren: NOREN_TEXT,  extra: 'A BUST-UP close shot — her face fills much of the upper frame. The steaming bowl is held in both hands just below her chin, her cheeks flushed with warmth, her eyes wide and sparkling with delight as she slurps a noodle.' },
  { key: 'c', noren: NOREN_PLAIN, extra: 'Framed from the CHEST UP. She has just lifted her face from the bowl, one noodle still on her chopsticks, and beams at the viewer with a soft closed-lip smile of pure happiness. Her eyes stay wide open and shining.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=interior — ✅ユーザー判定（2026-07-31）:「**bとcはぴよ氏はいいが、背景が店内に見えない**」
//   b＝夜空と外に吊った提灯で**屋台の外**に見える／c＝暖簾の壁だけで**書き割り**に見える。
//   → **ぴよ氏は候補のまま固定**し、背景だけ「明らかに店の中」に振り直す。
//   ⚠店内だと伝えるのは小物: **壁一面の品書きの短冊**・天井の照明・厨房の湯気・
//     箸立てと湯呑み・入口側に短い暖簾。⚠**立ち食いなので椅子は描かない**。
//   ⚠**人は増やさない**（厨房も無人にする）。ユーザー指示「他に人は写り込みません」は継続。
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// --set=age — ⚠ユーザー指摘（2026-07-31）:
//   「**退店時とたちぐいそばがどうみても同じ年齢には見えない。立ち食いそばは幼すぎる。
//     退店時の画像を元にして、たちぐいそばの画像を再生成して**」
//   「**粗さの波よりも、人間には絵のタッチ（画風）、同一人物、同一年齢に見えるかの方がはるかに重要**」
//
//   → **顔と年齢の正は `images/shop05.jpg`（退店の絵）**。参照①に置いて顔を寄せる。
//     構図・部屋・小物（ステージショップ店内＋そばの丼）は現行の `soba_shop_scene.jpg`（参照②）を維持。
//   ⚠1.705が幼く見えた原因（顔幅を揃えて並べて判明・`ART_STYLE.md`「👧年齢の正」に表で記載）:
//     目が真円で大きい／目が顔の中央より下／目の間隔が広い／目からあごが短い／チークが大きい／輪郭が真円
// ─────────────────────────────────────────────────────────────────────────────
const AGE_FIX = [
  'REFERENCE IMAGE 1 IS THE TRUTH FOR HER FACE AND HER APPARENT AGE. Study it and copy the construction of',
  'that face exactly. She must look like the SAME PERSON AT THE SAME AGE as reference image 1 —',
  'a young girl of about twelve to fourteen, NOT a small child and NOT a toddler.',
  'Specifically match reference image 1 and avoid the mistakes of the current soba artwork:',
  'her eyes are ALMOND-SHAPED and WIDER THAN THEY ARE TALL — not big perfect circles;',
  'her eyes sit at the MIDDLE of her face or slightly above it, NOT low down on her face;',
  'the gap between her eyes is fairly NARROW, about one eye width, not wide;',
  'the distance from her eyes down to her chin is LONG, giving her a clear jaw and chin;',
  'her face is a SLIGHTLY TALL OVAL, not a circle; her cheeks are less puffy;',
  'and her blush is a SMALL neat oval on each cheek, not a wide patch covering half her cheek.',
  'Keep her charming and sweet, but she must read as the same age as reference image 1.',
].join(' ');

const AGE_KEEP = [
  'REFERENCE IMAGE 2 is the current version of this scene. KEEP from it: the room (the wooden item-shop interior',
  'with shelves of colourful potion bottles, the counter, the stone wall with map and armour, the treasure chest,',
  'the plank floor and the warm amber light), the steaming bowl of hot soba and the wooden chopsticks,',
  'her costume, her position in the frame and the framing from the waist up.',
  'THE ONLY PERSON IN THE PICTURE IS HER — no shopkeeper, no other customers, nobody in the background.',
  'ART MEDIUM: match the pixel-art touch of REFERENCE IMAGE 1 — the same block size, the same amount of detail',
  'and the same line weight as reference image 1.',
].join(' ');

const AGE_VARIANTS = [
  { key: 'a', extra: 'She lifts a few noodles to her mouth with the chopsticks in her right hand, the bowl in her left, and smiles happily with her eyes open — the same open smile as reference image 1.' },
  { key: 'b', extra: 'She holds the steaming bowl in both hands just below her chin and beams at the viewer, mouth slightly open in delight, exactly the expression of reference image 1.' },
  { key: 'c', extra: 'She has just slurped a noodle and looks at the viewer with a happy closed-lip smile, one hand holding the bowl, the chopsticks resting across it.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=age2 — ⚠**--set=age は失敗した**（2026-07-31 実測）。
//   現行の `soba_shop_scene.jpg` を参照2に渡して「顔だけ直せ」と言うと、
//   Gemini は**現行の顔をそのまま引き継ぐ**（3枚とも幼い顔のまま出た）。
//   → **現行そばは参照から外す**。①`_raw/REF_shop05_face.png`（shop05の顔を切り出して拡大＝顔を大きく見せる）
//     ②`images/shop01.jpg`（部屋とタッチ）だけを渡し、そばの芝居は言葉で組み立てる。
//   ⚠**「直せ」ではなく「これで描け」**。作り直しの参照に旧版を混ぜてはいけない。
// ─────────────────────────────────────────────────────────────────────────────
const AGE2_FACE = [
  'REFERENCE IMAGE 1 IS A CLOSE-UP OF HER FACE AND IT IS THE ABSOLUTE TRUTH for her face and her age.',
  'Copy that face: the same ALMOND eye shape (clearly wider than tall, never big perfect circles),',
  'the same eye size relative to her head, the eyes placed at the MIDDLE of her face, a NARROW gap between them,',
  'the same LONG distance from eyes to chin with a visible jaw, the same slightly TALL OVAL face,',
  'the same SMALL neat oval blush, the same dark reddish-brown irises with bright square highlights,',
  'the same blunt straight bangs and purple-tinted charcoal hair.',
  'She is a girl of about twelve to fourteen — NOT a small child, NOT a toddler, NOT a big-eyed baby face.',
  'A viewer must instantly recognise her as THE SAME PERSON AT THE SAME AGE as reference image 1.',
].join(' ');

const AGE2_SCENE = [
  'REFERENCE IMAGE 2 defines the ROOM and the ART TOUCH. Draw her inside that same wooden item shop:',
  'shelves of colourful glass potion bottles and jars on the left, the thick wooden counter, the grey stone wall',
  'with a hanging map and a suit of armour, a wooden treasure chest, plank floor, warm amber lamplight.',
  'Use the SAME pixel-art touch as reference image 2 — the same block size, detail density and line weight.',
  'SHE IS EATING HOT SOBA NOODLES: she stands at the counter holding a steaming brown noodle bowl and wooden',
  'chopsticks, with white steam curling up, enjoying it happily. Framed from the WAIST UP so her face is large.',
  'She wears the yellow-and-black frilled maid dress: white pointed collar with a yellow ribbon tie,',
  'yellow ribbed bib with two dark buttons, black puff sleeves covering her shoulders with yellow frills,',
  'black corset with two rows of gold studs, black cuffs with gold trim, and the bell-shaped yellow skirt',
  'with cream chick appliques.',
  'THE ONLY PERSON IN THE PICTURE IS HER — no shopkeeper, no other customers, nobody in the background.',
].join(' ');

const AGE2_VARIANTS = [
  { key: 'a', extra: 'She lifts a few noodles to her mouth with the chopsticks, the bowl held in her other hand, smiling with her eyes open — the same open happy smile as reference image 1.' },
  { key: 'b', extra: 'She holds the steaming bowl in both hands just below her chin and beams straight at the viewer, her mouth open in the same happy smile as reference image 1.' },
  { key: 'c', extra: 'She has just slurped a noodle and looks at the viewer with a soft closed-lip smile, one hand under the bowl, chopsticks in the other.' },
];

const KEEP_GIRL = [
  'REFERENCE IMAGE 2 is an APPROVED drawing of the girl — her face, her hair, her costume, her pose with the',
  'steaming bowl and chopsticks, and the exact pixel-art touch are all correct and must be KEPT.',
  'Redraw her the same way, at the same size in the frame. CHANGE ONLY THE SURROUNDINGS.',
].join(' ');

const INTERIOR = [
  'THE BACKGROUND MUST CLEARLY READ AS THE INSIDE OF A JAPANESE STANDING SOBA SHOP — the previous attempt',
  'looked like the outside of a food stall, which is wrong. She is INDOORS, standing at the counter inside a',
  'small, narrow, warm noodle shop. Show the interior clearly:',
  'the wall right behind her is covered with rows of NARROW WOODEN MENU STRIPS hanging flat against it',
  '(vertical wooden plaques with abstract brush marks — not readable words),',
  'a low CEILING with a warm boxy light fixture and a short valance of cloth,',
  'the pale wooden counter running across in front of her with a bamboo CHOPSTICK HOLDER, a small soy bottle',
  'and a stack of cups on it, and warm steam drifting in the air.',
  'To one side, the shop kitchen is visible as a stainless steel counter with a big steaming pot — BUT NOBODY',
  'is standing there. NO night sky, NO outdoor scenery, NO street, NO stall roof seen from outside,',
  'NO hanging lanterns dangling in open air. This is an enclosed room.',
  'ONLY THE GIRL IS IN THE PICTURE — no shopkeeper, no cook, no other customers, no silhouettes of people.',
  'It is a standing-only shop, so there are NO stools and NO chairs.',
].join(' ');

// ─────────────────────────────────────────────────────────────────────────────
// --set=stageshop — ✅ユーザー確定（2026-07-31）:「**店内はステージショップである必要がある**」
//   たちぐいそばは**ステージのお店で買う品**（`shop_item_heal`）なので、カットインの舞台も
//   あの店＝`shop01.jpg` の店内でなければ辻褄が合わない。和風のそば屋の内装は**不採用**。
//   ⚠背景は `shop01.jpg` をそのまま参照に渡す（＝タッチの正も同時に満たせる）。
//   ⚠**店員は出さない**（ユーザー指示「他に人は写り込みません」）。
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_SHOP = [
  'THE BACKGROUND MUST BE THE SAME SHOP INTERIOR AS REFERENCE IMAGE 1 — this scene happens inside that shop,',
  'because she buys the noodles there. Reuse it faithfully: the warm wooden item-shop room with tall shelves of',
  'colourful glass potion bottles and jars, cloth sacks, rolled scrolls and swords, the thick wooden counter,',
  'the grey stone wall with a hanging map and a suit of armour, the wooden treasure chest with gold fittings,',
  'the wooden plank floor and the warm amber lamplight.',
  'She stands at that counter. Do NOT draw a Japanese noodle restaurant, NO noren curtains, NO paper lanterns,',
  'NO menu strips, NO stainless kitchen, NO night sky — the room is the fantasy item shop of reference image 1.',
  'THE SHOPKEEPER IS NOT IN THIS PICTURE: no shopkeeper, no other customers, no people at all besides the girl.',
  'The only new props are what she is eating with: a steaming bowl of hot soba noodles and wooden chopsticks,',
  'with white steam curling up.',
].join(' ');

const STAGE_VARIANTS = [
  { key: 'a', extra: 'Framed from the WAIST UP so her face is large. She stands in front of the counter facing the viewer, the potion shelves filling the background behind her, lifting noodles to her small mouth.' },
  { key: 'b', extra: 'A BUST-UP close shot, the steaming bowl held in both hands just below her chin. Behind her, out of focus but clearly readable, are the shelves of colourful potion bottles and the stone wall with the armour.' },
  { key: 'c', extra: 'Framed from the CHEST UP, standing at the corner of the counter with the treasure chest and stone wall behind her on one side and the potion shelves on the other, the bowl resting on the counter as she slurps a noodle.' },
];

const INTERIOR_VARIANTS = [
  { key: 'a', extra: 'Straight-on view: the wall of wooden menu strips fills the space behind her, the ceiling light glows just above the top of the frame, and a short dark red cloth valance hangs across the upper edge.' },
  { key: 'b', extra: 'Slight angle: the counter runs diagonally away to the right, the stainless kitchen with its steaming pot is behind the counter on the right, and the menu-strip wall covers the left side behind her.' },
  { key: 'c', extra: 'Cosy tight interior: warm wooden walls close on both sides, menu strips behind her head, a small paper lantern mounted ON THE INDOOR WALL beside her, and a doorway with a short そば noren visible far behind on the left, showing this is the way out.' },
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
const refPiyo  = await part(path.join(IMAGES_DIR, 'title.jpg'));   // ①顔・衣装・頭身の正
const refTouch = await part(path.join(IMAGES_DIR, 'shop01.jpg'));  // ②タッチの正（1.704・ユーザー採用）
console.log(`モデル: ${MODEL}`);

if (SET === 'age2') {
  // ⚠旧版は参照に混ぜない（--set=age の失敗理由）。①shop05の顔の切り出し ②店内とタッチ
  const refFace = await part(path.join(RAW_DIR, 'REF_shop05_face.png'));
  const refRoom = await part(path.join(IMAGES_DIR, 'shop01.jpg'));
  console.log('顔と年齢: _raw/REF_shop05_face.png ／ 部屋とタッチ: images/shop01.jpg');
  for (const v of AGE2_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [AGE2_FACE, AGE2_SCENE, PIYO_FIX, PROPORTION, LAYOUT, v.extra, COMMON].join(' ');
    console.log(`● soba_age2_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `soba_age2_${v.key}.png`), await call(ai, [refFace, refRoom, { text: prompt }]));
    console.log(`  ✓ tools/_raw/soba_age2_${v.key}.png`);
  }
  console.log('完了。⚠**shop05 と顔幅を揃えて並べ、同じ年齢に見えるか**を確認してから見せること（粒は後回し）。');
} else if (SET === 'age') {
  // ⚠参照①=shop05（顔と年齢と画風の正）／②=現行のそば（構図・部屋・小物の正）
  const refAge  = await part(path.join(IMAGES_DIR, 'shop05.jpg'));
  const refSoba = await part(path.join(IMAGES_DIR, 'soba_shop_scene.jpg'));
  console.log('顔と年齢: images/shop05.jpg ／ 構図と部屋: images/soba_shop_scene.jpg');
  for (const v of AGE_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [AGE_FIX, AGE_KEEP, PIYO_FIX, PROPORTION, LAYOUT, v.extra, COMMON].join(' ');
    console.log(`● soba_age_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `soba_age_${v.key}.png`), await call(ai, [refAge, refSoba, { text: prompt }]));
    console.log(`  ✓ tools/_raw/soba_age_${v.key}.png`);
  }
  console.log('完了。⚠**shop05 と顔幅を揃えて並べ、同じ年齢に見えるか**を確認してから見せること（粒は後回し）。');
} else if (SET === 'stageshop') {
  // ⚠参照の順番が意味を持つ: ①ステージショップの店内＝背景とタッチの正／②ぴよ氏の正
  const refGirl = await part(path.join(RAW_DIR, REF));
  console.log(`背景: images/shop01.jpg ／ ぴよ氏の参照: _raw/${REF}`);
  for (const v of STAGE_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [
      'REFERENCE IMAGE 2 is an APPROVED drawing of the girl — her face, hair, costume, her pose with the steaming',
      'bowl and chopsticks, and the exact pixel-art touch are correct and must be KEPT. Redraw her the same way.',
      BISHOUJO, PIYO_FACE, PIYO_FIX, PROPORTION, GRAIN_SHOP, STAGE_SHOP, LAYOUT, v.extra, COMMON,
    ].join(' ');
    console.log(`● soba_shop_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `soba_shop_${v.key}.png`), await call(ai, [refTouch, refGirl, { text: prompt }]));
    console.log(`  ✓ tools/_raw/soba_shop_${v.key}.png`);
  }
  console.log('完了。⚠**ステージショップの店内に見えるか**／人が他にいないか／口と目を確認してから見せること。');
} else if (SET === 'interior') {
  const refGirl = await part(path.join(RAW_DIR, REF));   // ②ぴよ氏の正（ユーザーがOKを出した候補）
  console.log(`ぴよ氏の参照: _raw/${REF}`);
  for (const v of INTERIOR_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [KEEP_GIRL, BISHOUJO, PIYO_FACE, PIYO_FIX, PROPORTION, GRAIN, INTERIOR, LAYOUT, v.extra, COMMON].join(' ');
    console.log(`● soba_in_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `soba_in_${v.key}.png`), await call(ai, [refPiyo, refGirl, { text: prompt }]));
    console.log(`  ✓ tools/_raw/soba_in_${v.key}.png`);
  }
  console.log('完了。⚠**店内に見えるか**／人が他に写っていないか／口と目を確認してから見せること。');
} else {
  for (const v of VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [BISHOUJO, PIYO, PIYO_FACE, PIYO_FIX, PROPORTION, GRAIN, SCENE, v.noren, LAYOUT, v.extra, COMMON].join(' ');
    console.log(`● soba_gem_${v.key}.png 生成中...`);
    await fs.writeFile(path.join(RAW_DIR, `soba_gem_${v.key}.png`), await call(ai, [refPiyo, refTouch, { text: prompt }]));
    console.log(`  ✓ tools/_raw/soba_gem_${v.key}.png`);
  }
  console.log('完了。⚠粒／口と目／人が他に写っていないかを確認してから見せること。');
}
