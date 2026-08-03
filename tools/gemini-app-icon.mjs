// ─────────────────────────────────────────────────────────────────────────────
// gemini-app-icon.mjs — アプリアイコンの候補を作る（2026-07-31）
//
// ⚠ユーザー指示（2026-07-31）:「**アプリアイコンを試しに作ろうと思う。あなたが思うように3パターン生成して**」
//   ＝方向性は Claude が決めてよい。⚠ただし**差し替えはユーザーの判断を待つ**
//   （`icon-1024.png` は**ストア掲載中の資産**。スクリーンショットとの整合と審査に関わる）
//
// 📐 アイコン固有の制約（一枚絵と違うので必ず守る）
//   ・**1:1 / 1024×1024 / 透過なし**（iOS はマーケティング用アイコンにアルファを許さない）
//   ・**角丸や枠を自分で描かない**（iOS は squircle、Android は端末ごとのマスクを後から当てる）
//   ・**大事なものは中央の円 約70% の内側**に置く（Android のアダプティブアイコンは外周が切られる）
//   ・**60px で見て分かること**が最優先＝大きな形・高コントラスト・細部は捨てる。**文字は入れない**
//   ・現行アイコンの弱点＝**上半身＋ひよこで要素が多く、小さくすると何だか分からない**
//
// 🎨 出す3方向（Claude の判断）
//   a: **顔アップ＋黄色い放射** … 一番読みやすい王道。ゲームの黄×黒がそのまま出る
//   b: **顔＋肩口に小さなひよこ** … 現行の「ひよこがいる」要素を残しつつ顔を主役にする
//   c: **暗い紫地に顔** … 黄色いヘッドドレスと猫耳が最も映える。ホーム画面で沈まない
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-app-icon.mjs'
//       そのあと node icon-preview.mjs で 60/120/180px とマスク当ての見え方を確認する
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
const SET   = getArg('set', 'base');   // base=最初の3方向 / corange=cの顔＋オレンジ背景＋肩のひよこ

const WHO = [
  'REFERENCE IMAGE 1 defines the GIRL and REFERENCE IMAGE 2 defines the ART TOUCH. Draw the same girl:',
  'blunt straight bangs and long black twin-tails in a dark PURPLE-TINTED CHARCOAL (never brown, never pure black),',
  'BLACK CAT EARS with pale pink insides sitting on a YELLOW FRILLED HEADBAND, a yellow bow at her left ear,',
  'a WHITE POINTED COLLAR with a YELLOW RIBBON TIE, and a YELLOW RIBBED BIB.',
  'HER FACE: large round dark reddish-brown eyes with TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS in each eye,',
  'a soft round face, oval pink blush on each cheek, and a bright confident smile.',
  'She is a girl of about twelve to fourteen — not a small child.',
].join(' ');

const TOUCH = [
  'ART MEDIUM: imitation pixel art like reference image 2 — visible square blocks with smooth shading —',
  'but drawn BOLDER and SIMPLER for an app icon: think a grid about 110 BLOCKS WIDE, big clean shapes,',
  'strong contrast, thick readable outlines. NO grain, NO dithering, NO halftone dots, NO tiny details.',
].join(' ');

const ICON_RULES = [
  'THIS IS A MOBILE APP ICON. Hard requirements:',
  'a PERFECT SQUARE, 1:1 aspect ratio, filled edge to edge with artwork — NO transparency, NO white margin,',
  'NO rounded corners, NO circular frame, NO badge, NO border and NO drop shadow around the artwork',
  '(the phone adds its own mask). Keep EVERYTHING IMPORTANT — her whole head, her cat ears and her ribbon —',
  'WELL INSIDE THE MIDDLE 70% OF THE SQUARE, because the corners and edges get cropped by the phone.',
  'It must stay instantly recognisable when shrunk to the size of a thumbnail, so use few, large, bold shapes.',
  'ABSOLUTELY NO TEXT, no letters, no numbers, no logo, no watermark, no signature.',
].join(' ');

const VARIANTS = [
  {
    key: 'a',
    desc: '顔アップ＋黄色い放射',
    extra: [
      'COMPOSITION: a close-up of her HEAD AND SHOULDERS, centred, filling most of the square —',
      'her face alone takes up about half the width. Behind her, a bold GOLDEN-YELLOW SUNBURST of thick radial',
      'rays on a warm amber background, with a few small white sparkles. Her dark hair and black cat ears read',
      'clearly against the bright yellow. She smiles straight at the viewer.',
    ].join(' '),
  },
  {
    key: 'b',
    desc: '顔＋肩口に小さなひよこ',
    extra: [
      'COMPOSITION: a close-up of her HEAD AND SHOULDERS, centred and slightly to the left, filling most of the',
      'square. ONE small round CREAM-YELLOW CHICK with a tiny orange beak perches on her right shoulder and looks',
      'at the viewer too — keep the chick SMALL and SIMPLE, one clear shape, nothing else in the picture.',
      'Background: a flat warm golden yellow with a soft darker vignette so her silhouette pops.',
    ].join(' '),
  },
  {
    key: 'c',
    desc: '暗い紫地に顔',
    extra: [
      'COMPOSITION: a close-up of her HEAD AND SHOULDERS, centred, filling most of the square, lit from the front.',
      'Background: a deep dark PURPLE-INDIGO that makes her YELLOW FRILLED HEADBAND, yellow ribbon tie and the',
      'pale pink insides of her black cat ears glow. A soft golden rim light traces her silhouette,',
      'plus a few small golden sparkles. Bold and high contrast so the icon does not sink into a dark home screen.',
    ].join(' '),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=corange — ✅ユーザー判定（2026-07-31）:
//   「**cの顔が一番可愛いです。背景がオレンジ系でさらに肩にひよこがいたら完璧です**」
//   → **顔は icon_c のまま固定**。変えるのは①背景をオレンジ系に ②肩に小さなひよこ を足す。
//   参照 ①`_raw/icon_c.png`（顔と画風の正） ②`_raw/icon_b.png`（肩のひよこと暖色背景の参考）
//   ⚠**旧版を参照から外す作法は「顔を変えたい時」の話**。今回は逆に**顔を引き継がせたい**ので参照に渡すのが正しい
// ─────────────────────────────────────────────────────────────────────────────
const CORANGE_KEEP = [
  'REFERENCE IMAGE 1 IS THE TRUTH FOR HER FACE AND IT IS ALREADY PERFECT — copy it as exactly as you can:',
  'the same face shape, the same eye shape and size, the same gentle closed-lip smile, the same blush,',
  'the same blunt bangs, the same twin-tails, the same black cat ears with pale pink insides on the yellow',
  'frilled headband, the same yellow bow at her left ear, the same white collar with the yellow ribbon tie,',
  'the same yellow ribbed bib, the same head-and-shoulders framing and the same soft golden rim light around her.',
  'Do NOT redraw her face, do NOT change her age, do NOT enlarge her eyes.',
].join(' ');

const CORANGE_CHANGE = [
  'CHANGE EXACTLY TWO THINGS:',
  '(1) THE BACKGROUND becomes WARM ORANGE instead of dark purple — a rich orange that glows behind her',
  '(deep amber at the corners, brighter orange around her head), keeping a few small golden sparkles.',
  'Her dark hair and black cat ears must still stand out clearly against it, so keep the orange saturated',
  'and slightly darker near the edges.',
  '(2) ADD ONE SMALL CHICK sitting on her shoulder, like the chick in REFERENCE IMAGE 2:',
  'a round cream-yellow chick with a tiny orange beak and two dot eyes, looking at the viewer.',
  'Keep it SMALL and SIMPLE — one clear shape, and only ONE chick.',
  'Nothing else changes.',
].join(' ');

const CORANGE_MARGIN = [
  'IMPORTANT LAYOUT RULE: leave a clear MARGIN of background all around her.',
  'Her cat ear tips, her ribbon and the chick must all sit WELL INSIDE the middle 70% of the square —',
  'nothing important may touch the outer edges, because the phone crops the border away.',
  'Fill that margin with the orange background, not with white and not with transparency.',
].join(' ');

const CORANGE_VARIANTS = [
  { key: 'a', desc: 'ひよこは右肩・背景は放射なし', extra: 'The chick sits on her RIGHT shoulder (viewer left). The orange background is a smooth glow, no sunburst rays.' },
  { key: 'b', desc: 'ひよこは左肩・背景に淡い放射', extra: 'The chick sits on her LEFT shoulder (viewer right). Behind her, very soft wide radial rays in a slightly lighter orange.' },
  { key: 'c', desc: 'ひよこは右肩・少し引いて余白多め', extra: 'The chick sits on her RIGHT shoulder (viewer left), and the whole figure is drawn a little SMALLER so there is a generous orange margin all around her.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=clean — ✅ユーザー指示（2026-08-03）「1枚ずつ生成してその都度見せる形で着手して」
//
// ⚠なぜ作り直すのか（後処理では直らないと確認済み）
//   `icon_c_chick.png` は**暗い紺の背景で描いたものを後から塗り替えた**絵。
//   塗り替えツールが「明るさの構造は元のまま」にする仕様だったため、**キャラの周りの暗さが残り**、
//   ツインテールと体の間だけ暗いままになった。色で切り出そうとすると
//   髪 rgb(64,51,69) と隙間 rgb(68,47,50) / 残った紺 rgb(24,14,39) と髪の影 rgb(31,21,40) が
//   区別できず、6通り試して全部だめだった（詳細は tools/icon-fix-darkbg.mjs 冒頭）。
//   → **最初から明るい背景で描かせれば、この問題は原理的に起きない。**
//
// 📌 顔と構図は `icon_c_chick.png` のまま固定（ユーザー「これが最も近い」）。変えるのは背景の明るさだけ。
// ─────────────────────────────────────────────────────────────────────────────
const CLEAN_KEEP = [
  'REFERENCE IMAGE 1 IS THE TRUTH and it is almost perfect — reproduce it as exactly as you can:',
  'the same girl, the same face shape, the same eye shape and size, the same gentle closed-lip smile,',
  'the same blush, the same blunt bangs, the same long twin-tails, the same black cat ears with pale pink',
  'insides on the yellow frilled headband, the same yellow bow at her left ear, the same white collar with',
  'the yellow ribbon tie, the same yellow ribbed bib, the same small cream-yellow chick on her shoulder,',
  'the same head-and-shoulders framing, and the same soft golden rim light around her silhouette.',
  'Do NOT redraw her face, do NOT change her age, do NOT enlarge her eyes, do NOT move the chick.',
].join(' ');

const CLEAN_FIX = [
  'FIX EXACTLY ONE THING — THE BACKGROUND.',
  'In reference image 1 the background is bright warm orange at the outer edges but it goes DARK and MUDDY',
  'right next to her, especially in the NARROW GAPS BETWEEN HER TWIN-TAILS AND HER SHOULDERS and in the',
  'BOTTOM-LEFT CORNER. That is a mistake.',
  'Paint the background as ONE clean, EVEN, BRIGHT warm gradient across the WHOLE square:',
  'golden orange at the top flowing into warm coral pink at the bottom.',
  'EVERY part of the background must be that bright colour — including the narrow slivers of background',
  'visible between her twin-tails and her shoulders, and every corner. There must be NO dark patch,',
  'NO dark halo, NO shadow and NO vignette anywhere in the background.',
  'Her hair, her black clothing and the golden rim light around her stay exactly as dark and as bright',
  'as they are in reference image 1 — only the BACKGROUND changes.',
  'Keep a few small pale golden sparkles floating in the background.',
].join(' ');

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
const refGirl  = await part(path.join(IMAGES_DIR, 'title.jpg'));
const refTouch = await part(path.join(IMAGES_DIR, 'shop01.jpg'));
console.log(`モデル: ${MODEL}`);

if (SET === 'clean') {
  // ⚠**1枚ずつ**生成する（ユーザー厳命・クレジット浪費禁止）。--tag で連番を分ける
  const TAG = getArg('tag', '1');
  const refK = await part(path.join(RAW_DIR, 'icon_c_chick.png'));   // 構図・顔・ひよこの正
  console.log('参照: _raw/icon_c_chick.png（構図と顔の正）');
  const prompt = [CLEAN_KEEP, CLEAN_FIX, CORANGE_MARGIN, TOUCH, ICON_RULES].join(' ');
  console.log(`● icon_clean_${TAG}.png 生成中…（背景だけ明るく描き直す）`);
  await fs.writeFile(path.join(RAW_DIR, `icon_clean_${TAG}.png`), await call(ai, [refK, { text: prompt }]));
  console.log(`  ✓ tools/_raw/icon_clean_${TAG}.png`);
} else if (SET === 'corange') {
  const refC = await part(path.join(RAW_DIR, 'icon_c.png'));   // ①顔の正（ユーザーが「一番可愛い」と判定）
  const refB = await part(path.join(RAW_DIR, 'icon_b.png'));   // ②肩のひよこと暖色背景の参考
  console.log('参照: ①_raw/icon_c.png（顔） ②_raw/icon_b.png（肩のひよこ）');
  for (const v of CORANGE_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [CORANGE_KEEP, CORANGE_CHANGE, CORANGE_MARGIN, TOUCH, ICON_RULES, v.extra].join(' ');
    console.log(`● icon_co_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `icon_co_${v.key}.png`), await call(ai, [refC, refB, { text: prompt }]));
    console.log(`  ✓ tools/_raw/icon_co_${v.key}.png`);
  }
} else {
  for (const v of VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [WHO, TOUCH, ICON_RULES, v.extra].join(' ');
    console.log(`● icon_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `icon_${v.key}.png`), await call(ai, [refGirl, refTouch, { text: prompt }]));
    console.log(`  ✓ tools/_raw/icon_${v.key}.png`);
  }
}
console.log('完了。⚠**icon-preview.mjs で 60px の見え方とマスク当てを確認してから見せること**。');
