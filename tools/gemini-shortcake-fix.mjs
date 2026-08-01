// ─────────────────────────────────────────────────────────────────────────────
// gemini-shortcake-fix.mjs — いちごショートのカットイン shortcake_scene.jpg を直す（2026-08-01）
//
// ⚠ユーザー指摘:「**ショートケーキの画像が少し幼いのと、ツインテールが少し短いです。
//   チュートリアルクリア時の画像は理想通りの等身ですが、差があるように思う**」
//
// 🎯 直すのは2点だけ（それ以外は触らない）
//   ① 顔が幼い  … 目が丸く大きい／チークが大きい／あごが短い
//                  → `tutorial_clear.jpg` の顔に合わせる（目は横長でやや小さい・あごが見える・チークは小さい）
//   ② ツインテールが短い（肩の高さで止まっている）→ **腰まで**伸ばす
//
// ⚠⚠**外跳ねは絶対に真似させない**（ユーザー厳命・2026-08-01）:
//   「**外に跳ねているのはクリア時の場合は動きがあるからです。外跳ねだけは絶対に真似しないで、
//     使えないテイクになってしまう**」
//   ＝`tutorial_clear` は**ジャンプ中**なので髪が外へ流れている。こちらは立っている絵なので
//   **長さだけ真似して、形は自重で下に垂れる**のが正しい。
//   👉 一般化: **参照絵の「動きに由来する形」を真似させてはいけない。** 参照は
//      顔・等身・衣装・髪の長さのために渡すのであって、ポーズや慣性の形は別物。
//
// 参照 ①`images/tutorial_clear.jpg`＝私服ぴよの正（顔・年齢・等身・衣装・髪の長さ）
//      ②`images/shortcake_scene.jpg`＝**部屋だけ**（ケーキ棚・ティーポット・ランプ・木のカウンター）
//        ⚠②の女の子は見ない（顔が幼く髪が短いのが直したい対象そのもの）
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-shortcake-fix.mjs'
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
const SET   = getArg('set', 'base');   // base=第1稿 / v2=指摘3件を反映（髪は中間・食べている・正面を向かない）

// 私服ぴよの正（ART_STYLE.md「👕私服ぴよ」＋ tutorial_clear が実物）
const GIRL = [
  'REFERENCE IMAGE 1 IS THE TRUTH FOR THE GIRL — her face, her age, her body proportions, her hair and her outfit.',
  'Draw the SAME girl: BLACK twin-tail hair with TWO DEEP MAGENTA RIBBONS (one on each side, no cat ears at all),',
  'blunt straight bangs, a YELLOW SUNDRESS COVERED IN SMALL WHITE POLKA DOTS, a WHITE COLLAR at her neck with a',
  'MAGENTA RIBBON BOW at her chest, a WHITE FRILL along the hem of the dress, and dark purple-black shoes.',
  'She is NOT wearing the maid costume and has NO cat ears — this is her casual outfit.',
].join(' ');

// ① 幼さを直す
const AGE = [
  'MATCH HER FACE TO REFERENCE IMAGE 1 EXACTLY — the current cake-shop artwork makes her look too young,',
  'and that is the main thing to fix. Her eyes are ALMOND-shaped, clearly WIDER THAN THEY ARE TALL, and',
  'not oversized; they sit at the middle of her face. The distance from her eyes down to her chin is LONG',
  'enough to see a real jaw and chin. Her BLUSH is a SMALL neat oval on each cheek, not a big patch.',
  'Her face is a slightly tall oval, not a circle. She reads as a girl of about twelve to fourteen —',
  'NOT a small child and NOT a toddler.',
].join(' ');

// ② ツインテールの長さ ＋ ⚠外跳ね禁止
const HAIR = [
  'HER TWIN-TAILS MUST BE LONG: each tail falls well past her shoulders and reaches down to about her WAIST.',
  'The current artwork stops them at shoulder height, which is too short.',
  '⚠CRITICAL — THE TAILS HANG STRAIGHT DOWN under their own weight, close to her body, tapering to a point.',
  'DO NOT make them flare, sweep, fan out or swing outwards. In reference image 1 the tails flare outwards',
  'ONLY because she is jumping in mid-air there; in THIS picture she is standing still on the ground,',
  'so the hair must hang down quietly. Copy the LENGTH from reference image 1, never the outward flare.',
].join(' ');

const ROOM = [
  'REFERENCE IMAGE 2 DEFINES THE ROOM ONLY — reuse that cake shop faithfully: the wooden shelves of cakes on',
  'both sides (whole cakes and cut slices on white plates), the pastel teapots on the right shelves,',
  'the warm wall lamp, the long wooden counter across the lower part of the frame and the warm cream walls.',
  '⚠IGNORE THE GIRL IN REFERENCE IMAGE 2 COMPLETELY — her face is too young and her hair is too short,',
  'which is exactly what we are fixing. The girl comes from reference image 1 only.',
  'Keep the same art medium as both references: imitation pixel art with visible square blocks and smooth',
  'gradient shading, and the same block size as reference image 2.',
].join(' ');

const ACTION = [
  'WHAT SHE IS DOING: she stands behind the counter in the middle of the frame, holding a white plate with a',
  'slice of STRAWBERRY SHORTCAKE in one hand and a small fork in the other, about to take a happy first bite.',
  'She smiles warmly at the viewer. Keep her mouth SMALL and closed or barely open — no wide open mouth,',
  'no visible teeth or gums.',
].join(' ');

const COMMON = [
  'Wide landscape composition, 3:2 aspect ratio.',
  'No text, no lettering, no watermark, no border, no UI, no signature.',
].join(' ');

const VARIANTS = [
  { key: 'a', desc: '現行と同じ寄り（腰から上）', extra: 'Framed from the waist up, at the same distance as reference image 2.' },
  { key: 'b', desc: '少し引いて膝まで',           extra: 'Framed a little wider, down to her knees, so the full length of her twin-tails is clearly visible.' },
  { key: 'c', desc: '全身',                       extra: 'A wider shot showing her FULL FIGURE from the top of her head down to her shoes, so both her proportions and the full length of her twin-tails read clearly. She is about 4.5 to 5 heads tall as in reference image 1.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=v2 — ⚠ユーザー判定（2026-08-01・第1稿への指摘3件）
//   「**髪が長すぎます。元絵と今の絵の中間くらいで**」
//   「**食べているのに正面を向くのはおかしい**」
//   「**もっと持っているだけではなく食べている様子を描いて**」
//   → ①髪の長さ＝肩（元絵）と腰下（cake_b）の**中間＝背中の半ばあたり**
//     ②顔は**ケーキの方へ少し下向き＋やや斜め**（正面を向かせない。ただし横顔や振り返りにはしない＝
//        `ART_STYLE.md`「肩越しに振り返ると顔が崩れる」を踏まないため、両目は見える3/4に留める）
//     ③**実際に食べている瞬間**を描く（皿を持っているだけにしない）
//   ⚠顔の作り（年齢）は cake_b で合格しているので、そこは変えない
// ─────────────────────────────────────────────────────────────────────────────
const HAIR_V2 = [
  'HER TWIN-TAILS ARE MEDIUM LENGTH: each tail falls to about the MIDDLE OF HER BACK — clearly past her',
  'shoulders and past her chest, but NOT as far as her waist or hips.',
  'This is deliberately halfway between the too-short version and the too-long version.',
  '⚠The tails HANG STRAIGHT DOWN under their own weight, close to her body, tapering to a point.',
  'DO NOT make them flare, sweep, fan out or swing outwards — she is standing still, not jumping.',
].join(' ');

const EATING = [
  'WHAT SHE IS DOING — SHE IS ACTUALLY EATING THE CAKE, not just holding the plate.',
  'She holds a white plate with a slice of STRAWBERRY SHORTCAKE in one hand, close to her chest,',
  'and with the other hand she lifts a small forkful of cake TO HER MOUTH.',
  'HER FACE IS TILTED DOWN AND TURNED SLIGHTLY TOWARD THE CAKE — she is looking at the food she is eating,',
  'NOT staring straight at the viewer. ⚠But keep it a gentle THREE-QUARTER view with BOTH EYES VISIBLE',
  'and the same size — do NOT draw a side profile and do NOT have her looking back over her shoulder.',
  'Her mouth is SMALL and only slightly open to take the bite — no wide open mouth, no visible teeth or gums.',
  'She looks blissfully happy: soft smiling eyes still open, warm blush on her cheeks.',
].join(' ');

const V2_VARIANTS = [
  { key: 'a', desc: '一口を口へ運ぶ瞬間', extra: 'The forkful is just reaching her lips and her eyes are on it. Framed from the waist up.' },
  { key: 'b', desc: '食べた直後の幸せ顔', extra: 'She has just taken the bite: the fork is leaving her lips, her cheek is slightly rounded with the mouthful, her eyes are happy crescents but still clearly open, and she looks down at the remaining cake. Framed from the waist up.' },
  { key: 'c', desc: '皿を顔の近くに', extra: 'She raises the plate up near her chin with one hand and brings the forkful in with the other, leaning her face down toward it. Framed from the waist up, a little closer to her.' },
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
const refGirl = await part(path.join(IMAGES_DIR, 'tutorial_clear.jpg'));    // ①私服ぴよの正
const refRoom = await part(path.join(IMAGES_DIR, 'shortcake_scene.jpg'));   // ②部屋だけ
console.log(`モデル: ${MODEL}`);

// ⚠v2 の結果: **芝居（食べている・顔は下向き）は決まったが、髪の長さが元絵のまま**だった。
//   原因＝部屋の参照（元絵）に髪型まで引っぱられる。ROOM 参照を外すと部屋が変わってしまう。
//   → **v3 = 採用する芝居の絵を参照1枚だけ渡して「髪だけ伸ばす」**（shop02 の髪色修正と同じ手口）。
// ─────────────────────────────────────────────────────────────────────────────
// --set=v4 — ⚠ユーザー判定（2026-08-01・v3への指摘3件）
//   「**けーきなのにどう見ても立ち食いで不自然です**」
//   「**絵も全体的にのっぺりしている**」
//   「**もっとたちぐいそばや極楽まんじゅうの時のようにアップめにしてほしい。こんなに引きで描く必要はない**」
//   → ①**カウンターを構図から外す**（立ち食いに見える原因）。座って食べている前提にする
//     ②**奥行きを出す**（背景の棚をぼかして暗く落とす／顔と服に明暗をはっきり付ける／髪と肩にリムライト）
//     ③**バストアップまで寄る**（`manju_scene` `soba_shop_scene` と同じ距離感）
//   参照 ①`tutorial_clear.jpg`＝私服ぴよの正（顔・年齢・衣装）
//        ②`manju_scene.jpg`＝**寄りの距離感と陰影だけ**の見本（⚠あちらはメイド服なので衣装は真似させない）
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// --set=v5 — ⚠ユーザー判定（2026-08-01）:
//   「**Bは画像のクオリティとしてはとてもいいですが、もっと嬉しそうに美味しそうに食べさせたいです**」
//   → **cake4_b を1枚だけ参照して、表情だけを差し替える**（構図・奥行き・ポーズ・服・部屋は固定）。
//   ⚠`ART_STYLE.md`「嬉しい表情でも目は閉じない」を守る＝**細めるのは可、瞳は必ず見える**。
// ─────────────────────────────────────────────────────────────────────────────
if (SET === 'v5') {
  const base = getArg('base', 'cake4_b.png');
  const refBase = await part(path.join(RAW_DIR, base));
  console.log(`参照: _raw/${base}（この絵を維持して表情だけ変える）`);
  const KEEP = [
    'REFERENCE IMAGE 1 IS THE ARTWORK TO REPRODUCE. Redraw THE SAME PICTURE and keep everything identical:',
    'the same close bust-up framing and camera distance, the same seated pose with the chair back and the table edge,',
    'the same blurred dim cake-shop background with its depth and warm side lighting and rim light,',
    'the same girl at the same age, the same hairstyle and twin-tail length hanging straight down,',
    'the same yellow polka-dot dress with the white collar and magenta ribbon, the same plate of strawberry',
    'shortcake in one hand and the fork in the other, the same colours and the same pixel-art block size.',
    'CHANGE EXACTLY ONE THING: HER EXPRESSION.',
  ].join(' ');
  const HAPPY = [
    'SHE MUST LOOK MUCH HAPPIER AND LOOK LIKE THE CAKE TASTES WONDERFUL — that is the whole point of this redraw.',
    'Push the joy: the corners of her mouth lift into a clear, warm smile (mouth still SMALL, no teeth, no gums);',
    'her cheeks glow with a STRONGER pink blush; her eyebrows lift slightly in delight;',
    'her eyes shine — bright square white highlights in a dark reddish-brown iris.',
    '⚠HER EYES MUST STAY OPEN with the irises clearly visible. She may narrow them a little in a happy squint,',
    'but do NOT squeeze them shut into closed crescents.',
    'She should read as genuinely blissful, the way a girl looks on the first bite of a cake she loves.',
  ].join(' ');
  const V5 = [
    { key: 'a', desc: '目を輝かせてにっこり', extra: 'Eyes wide and sparkling, a clear happy smile as she takes the bite.' },
    { key: 'b', desc: '一口含んで幸せそう',   extra: 'She has the bite in her mouth: one cheek slightly rounded, eyes narrowed into a delighted smile but irises still visible, brows raised.' },
    { key: 'c', desc: 'おいしい！の顔＋輝き', extra: 'A beaming "this is delicious!" face, and a few tiny warm sparkles in the air around the cake to sell how good it tastes. Keep the sparkles small and few.' },
  ];
  for (const v of V5) {
    if (ONLY && ONLY !== v.key) continue;
    console.log(`● cake5_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `cake5_${v.key}.png`), await call(ai, [refBase, { text: [KEEP, HAPPY, v.extra, COMMON].join(' ') }]));
    console.log(`  ✓ tools/_raw/cake5_${v.key}.png`);
  }
  console.log('完了。⚠**嬉しそうに見えるか／目が閉じていないか／構図と奥行きが変わっていないか**を確認。');
} else if (SET === 'v4') {
  const refGirl4 = await part(path.join(IMAGES_DIR, 'tutorial_clear.jpg'));
  const refZoom  = await part(path.join(IMAGES_DIR, 'manju_scene.jpg'));
  console.log('参照: ①tutorial_clear（私服の正） ②manju_scene（寄りと陰影の見本・衣装は真似させない）');
  const V4_FRAMING = [
    'FRAMING — MATCH THE CAMERA DISTANCE OF REFERENCE IMAGE 2: a CLOSE BUST-UP.',
    'She fills the frame from roughly her chest up, so her FACE IS LARGE — about a third of the picture height.',
    'The previous attempt was rejected for being drawn too far away; come in much closer.',
    '⚠DO NOT show a long shop counter across the frame. A counter in front of her makes it look like she is',
    'eating standing up at a food stall, which is wrong for cake. She is SEATED at a small cafe table;',
    'at most a sliver of the table edge appears at the very bottom, softly out of focus.',
  ].join(' ');
  const V4_DEPTH = [
    'DEPTH — the previous attempt was rejected as FLAT. Give the picture real depth like reference image 2:',
    'the background (cake shelves and warm wall) is pushed BACK — noticeably DARKER and SOFTER/BLURRED,',
    'so she stands out clearly in front of it. Light comes warmly from one side: her face, hair and dress have',
    'a clear LIT SIDE and SHADOW SIDE with soft gradients between, a bright RIM LIGHT along her hair and shoulder,',
    'and a soft shadow under her chin and on the side of her neck. The cake itself catches a small highlight.',
    'Avoid flat even lighting and avoid uniform blocks of colour.',
  ].join(' ');
  const V4_EATING = [
    'WHAT SHE IS DOING: she is EATING a slice of STRAWBERRY SHORTCAKE. She holds a small white plate near her chest',
    'in one hand and lifts a forkful to her mouth with the other, her face TILTED DOWN AND TURNED SLIGHTLY toward',
    'the cake — she is looking at what she is eating, not at the viewer. Keep it a gentle three-quarter view with',
    'BOTH EYES VISIBLE and the same size; no side profile, no looking back over the shoulder.',
    'HER EYES STAY OPEN with the irises clearly visible — do NOT squeeze them shut into happy crescents.',
    'Her mouth is SMALL and only slightly open for the bite; no wide mouth, no teeth or gums.',
    'She looks quietly delighted, with a warm blush.',
  ].join(' ');
  const V4_HAIR = [
    'HER TWIN-TAILS are medium length and HANG STRAIGHT DOWN close to her body — no flare, no sweep,',
    'no fanning outwards. At this camera distance only the upper part of each tail is inside the frame.',
  ].join(' ');
  const V4_VARIANTS = [
    { key: 'a', desc: 'バストアップ・一口を運ぶ', extra: 'The forkful is halfway to her lips and her eyes follow it.' },
    { key: 'b', desc: 'さらに寄り・皿を顔の近くに', extra: 'Closer still — her face and the plate nearly fill the frame, the plate raised near her chin.' },
    { key: 'c', desc: 'バストアップ・食べた直後', extra: 'She has just taken the bite; the fork is leaving her lips and she glances down at the rest of the slice, eyes open and happy.' },
  ];
  for (const v of V4_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [
      GIRL, AGE, V4_HAIR, V4_FRAMING, V4_DEPTH, V4_EATING,
      'REFERENCE IMAGE 2 is used ONLY for the camera distance, the shading and the sense of depth.',
      '⚠IGNORE HER COSTUME IN REFERENCE IMAGE 2 — that is the maid dress. Here she wears the casual',
      'yellow polka-dot sundress from reference image 1, with the white collar and magenta ribbon, and NO cat ears.',
      'SETTING: inside a warm cake shop — shelves of cakes and pastel teapots visible behind her, but blurred and dim.',
      'Keep the same imitation-pixel-art medium and block size as reference image 2.',
      v.extra, COMMON,
    ].join(' ');
    console.log(`● cake4_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `cake4_${v.key}.png`), await call(ai, [refGirl4, refZoom, { text: prompt }]));
    console.log(`  ✓ tools/_raw/cake4_${v.key}.png`);
  }
  console.log('完了。⚠**寄れているか／カウンターが写っていないか／のっぺりしていないか／目が開いているか**を確認。');
} else if (SET === 'v3') {
  const base = getArg('base', 'cake2_b.png');
  const refBase = await part(path.join(RAW_DIR, base));
  console.log(`参照: _raw/${base}（この絵を維持して髪だけ伸ばす）`);
  const HAIR_ONLY = [
    'REFERENCE IMAGE 1 IS THE ARTWORK TO REPRODUCE. Redraw THE SAME PICTURE and keep everything identical:',
    'the same cake shop and every shelf, cake, teapot and lamp in it, the same counter, the same girl,',
    'the same face and expression, the same happy eating pose with the plate and the forkful at her mouth,',
    'the same yellow polka-dot dress, the same framing and the same colours and pixel-art block size.',
    'CHANGE EXACTLY ONE THING: HER TWIN-TAILS ARE LONGER. In reference image 1 they stop around shoulder height,',
    'which is too short. Extend each tail so it falls to about the MIDDLE OF HER BACK — clearly past her',
    'shoulders and past her chest, but NOT as far as her waist or hips.',
    '⚠The tails HANG STRAIGHT DOWN under their own weight, close to her body, tapering to a point.',
    'DO NOT let them flare, sweep, fan out or swing outwards — she is standing still.',
    'Her eyes stay softly smiling but the irises must still be visible — do not squeeze them shut.',
    'Nothing else in the picture changes.',
  ].join(' ');
  for (const key of ['a', 'b', 'c']) {
    if (ONLY && ONLY !== key) continue;
    console.log(`● cake3_${key}.png 生成中…`);
    await fs.writeFile(path.join(RAW_DIR, `cake3_${key}.png`), await call(ai, [refBase, { text: [HAIR_ONLY, COMMON].join(' ') }]));
    console.log(`  ✓ tools/_raw/cake3_${key}.png`);
  }
  console.log('完了。⚠**髪が背中の半ばまで伸びたか／芝居と部屋が変わっていないか**を確認してから見せること。');
} else if (SET === 'v2') {
  for (const v of V2_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [GIRL, AGE, HAIR_V2, ROOM, EATING, v.extra, COMMON].join(' ');
    console.log(`● cake2_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `cake2_${v.key}.png`), await call(ai, [refGirl, refRoom, { text: prompt }]));
    console.log(`  ✓ tools/_raw/cake2_${v.key}.png`);
  }
  console.log('完了。⚠**髪の長さ（背中の半ば）／正面を向いていないか／実際に食べているか**を確認してから見せること。');
} else {
  for (const v of VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [GIRL, AGE, HAIR, ROOM, ACTION, v.extra, COMMON].join(' ');
    console.log(`● cake_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `cake_${v.key}.png`), await call(ai, [refGirl, refRoom, { text: prompt }]));
    console.log(`  ✓ tools/_raw/cake_${v.key}.png`);
  }
}
console.log('完了。⚠**外跳ねしていないか**／幼くないか／ツインテールが腰まであるかを確認してから見せること。');
