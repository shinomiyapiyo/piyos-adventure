// ─────────────────────────────────────────────────────────────────────────────
// gemini-eyes-strip.mjs — ぴよフラッシュ前半「両目アップ」の eyes_closeup.png を作り直す（2026-08-01）
//
// ⚠ユーザー実機報告:「**かなり見せかけ上のドットが大きくノイズもあります**」
//   「**表示する領域は今のままでいい。額・頬・あごは表示する必要もない**」
//
// 🎯 実測した原因（3つが重なっていた）
//   ① 現行 `eyes_closeup.png` は 1024×576 で**ファイル内の粒 6.10px＝横に168粒**しかない
//   ② 演出は**帯（高さ0.46H）だけを切り抜く**のに、旧コードは画像を**画面の高さ H 基準**で置いていたため
//      **絵の縦の6割が帯の外**＝見えない場所に使われ、帯に並ぶ粒を稼げていなかった
//      → ✅1.711 で `index.html` の `drawSpecialCutin` を**帯そのものへ cover** に修正（A）
//   ③ ディザのムラが②の拡大で粒立って見えていた（①と同じ原因）
//
// 🎯 目標＝**横に約320粒**（帯の表示幅 約790 CSSpx → 画面上 2.4〜2.5 CSSpx）
//   参考: `special_cutin.png`(1.709) は横239粒＝画面上約3.3。**目のアップは極端な寄りなので
//   同じ密度だとブロックが目立つ**ため、意図的に細かい側を狙う（`ART_STYLE.md`「寄りの構図では粒数が増えるのが正しい」）
//
// ⚠画像は**帯の形（横長のストリップ）**で用意する。全体像を入れると上下が切れて無駄になる。
//   3:2 で返ってきた場合は目の帯を切り出す（横方向の粒数は変わらないので問題ない）。
//
// 参照: ①`_raw/REF_manju_eyes.png`（採用済みで一番目が大きい `manju_scene` の目＝目のデザインの正）
//       ②`images/shop01.jpg`（タッチ＝採用済みで一番細かい）
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-eyes-strip.mjs'
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
const SET   = getArg('set', 'base');   // base=最初の3枚 / tight=目力を上げた寄りの2枚

const EYES = [
  'REFERENCE IMAGE 1 IS A CLOSE-UP OF HER EYES AND IT IS THE TRUTH for how her eyes are drawn. Copy it:',
  'large ALMOND eyes (wider than tall), a thick soft-black upper lash line that thickens toward the outer corner,',
  'irises in a DARK REDDISH-BROWN that lightens toward the bottom, TWO LARGE BRIGHT SQUARE WHITE HIGHLIGHTS in each eye,',
  'a thin pale grey rim of sclera, soft dark eyebrows above, blunt straight bangs of purple-tinted charcoal hair',
  'hanging over the brows, and cream-coloured skin (#F8E7CD) with a soft pink blush at the outer edges.',
  '⚠HER IRISES MUST NOT BE GOLD OR AMBER — the current artwork got this wrong. They are dark reddish-brown.',
].join(' ');

const FRAMING = [
  'COMPOSITION: an extreme close-up of BOTH EYES ONLY, drawn as a VERY WIDE HORIZONTAL BANNER (about 5:1,',
  'a letterbox strip). The strip contains, from top to bottom: the lower edge of her bangs, her eyebrows,',
  'both eyes, and the bridge of her nose. NO forehead, NO cheeks below the eyes, NO mouth, NO chin —',
  'they are outside the strip. Her eyes are level, evenly spaced, one near the left third and one near the right',
  'third, looking STRAIGHT AT THE VIEWER. The strip is filled edge to edge — no empty margins, no borders.',
].join(' ');

const MOOD = [
  'MOOD: this is the split second before she unleashes a special attack, so her gaze is INTENSE and determined',
  'but still cute — eyes wide open, brows very slightly lowered, not angry and not scowling.',
  'Warm golden light rakes across from the left with a few small sparkle glints, and the outer edges of the strip',
  'fall into warm shadow.',
].join(' ');

const GRAIN = [
  'ART MEDIUM: imitation pixel art in the same style as REFERENCE IMAGE 2 — visible square blocks with smooth',
  'gradient shading. The strip must read as if drawn on a grid ROUGHLY 320 BLOCKS WIDE:',
  'clearly blocky, but FINE ENOUGH that a single eye is built from many blocks, not a handful of big ones.',
  '⚠CRITICAL: the current artwork is drawn with blocks about TWICE TOO LARGE — do not repeat that.',
  'Also keep the shading CLEAN: no speckled dithering, no scattered noise dots, no film grain over the skin.',
].join(' ');

const COMMON = 'No text, no lettering, no watermark, no border, no UI, no signature, no letterbox bars.';

const VARIANTS = [
  { key: 'a', desc: '正面・標準',           extra: 'Straight-on, both eyes fully open and symmetrical, the light glinting on the upper right of each iris.' },
  { key: 'b', desc: '寄り・ハイライト大',   extra: 'A little closer, so each eye is larger in the strip, with especially large square white highlights.' },
  { key: 'c', desc: 'やや見上げ・光強め',   extra: 'Her gaze tilts up a fraction as if looking at an oncoming enemy, and the golden light from the left is stronger, with a warm rim on her lashes.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=tight — ⚠ユーザー判定（2026-08-01）:
//   「**単にアップの画像が欲しいわけではない。必殺技なのに目力がないので却下。
//     強いて言えばCが最もキリッとしていてまだ使える**」
//   → 求められているのは**寄り**ではなく**目力**。cの寄り（c3相当）まで詰めた構図で描き直す。
//   ⚠**切り出しでは解決しない**（実測）: 寄せても粒の数は増えないので拡大されるだけ＝
//     c3は帯に127粒しか並ばず**現行(171粒)より粗くなる**。同じ2320幅で寄った絵を描かせれば
//     目力を上げたまま粒は約2倍細かくなる。
//   目力の作り方（cで効いていた要素を強化）: **眉を下げて寄せる／上まつ毛を太く鋭く／
//   まぶたを少し下げて切れ長に／ハイライトを小さく鋭く／左からの強い金色光とリムライト**
// ─────────────────────────────────────────────────────────────────────────────
const TIGHT_FRAMING = [
  'COMPOSITION — a VERY TIGHT extreme close-up: the two eyes FILL the wide banner almost edge to edge.',
  'The left eye starts near the left edge and the right eye ends near the right edge, with only the narrow',
  'bridge of the nose between them. The banner is about 5:1 (a letterbox strip).',
  'Include only: the lower tips of her bangs at the very top, her EYEBROWS, and BOTH EYES.',
  'NO forehead, NO cheeks, NO nose tip, NO mouth, NO chin, and almost no bare skin around the eyes —',
  'the eyes themselves are the whole picture. Fill the strip edge to edge with no empty margin.',
].join(' ');

const TIGHT_POWER = [
  'THIS IS THE SPLIT SECOND BEFORE A FINISHING MOVE, SO THE EYES MUST HAVE REAL FORCE — a fierce,',
  'razor-sharp glare straight at the viewer. This is the most important requirement: the previous attempt',
  'was rejected for having no intensity.',
  'Push the intensity: her EYEBROWS are angled DOWN and DRAWN IN toward the bridge of the nose in a hard slant;',
  'the UPPER LASH LINE is THICK, BLACK and SHARP, flicking up into a hard point at the outer corner;',
  'her upper eyelids come down slightly so the eyes read NARROWED and steely rather than round and soft;',
  'the irises are dark reddish-brown and burn with a hot amber ring of reflected light around the pupil;',
  'the white highlights are SMALL, HARD and BRIGHT, like a glint of steel, not big soft blobs.',
  'Strong golden light rakes in from the left, throwing a bright rim along the lashes and lids,',
  'and the outer corners fall into deep warm shadow so the glare pops out of the darkness.',
  'She is determined and fierce — NOT sad, NOT sleepy, NOT cute-and-soft, NOT angry-cartoon-scowling.',
].join(' ');

const TIGHT_GRAIN = [
  'ART MEDIUM: imitation pixel art like REFERENCE IMAGE 2 — visible square blocks with smooth gradient shading.',
  'Even though this is an extreme close-up, the blocks must stay FINE: draw on a grid of roughly 320 BLOCKS',
  'ACROSS THE WIDTH, so a single eye is built from well over a hundred blocks and the lash line steps are small.',
  '⚠Do NOT draw a handful of huge chunky blocks, and keep the shading CLEAN — no speckled dithering,',
  'no scattered noise dots, no film grain.',
].join(' ');

const TIGHT_VARIANTS = [
  { key: 'a', desc: '正面・鋭い睨み',   extra: 'Straight-on and symmetrical, both eyes level, the glare aimed directly at the viewer.' },
  { key: 'b', desc: 'わずかに見上げ',   extra: 'Her chin is a fraction lower so she looks slightly UP at an oncoming enemy, which lifts the lower lids and sharpens the glare further.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// --set=refine — ⚠**これが正しいやり方**（ユーザー厳命・2026-08-01）
//   「**元の画像を使って、グラフィックのクオリティを上げるために生成することは許可する。
//     しかし他の要素は邪魔なので不要**」
//   「粗い上にノイズも消したいの一点のみ。余計なことをしないでほしい」
//
//   ❌やってはいけないこと（この件で実際にやってしまい却下された）:
//     ・目つき・表情を変える（`--set=tight` は「怖すぎる・どう見ても別人」で却下）
//     ・構図を寄せる／切り出す・演出やライティングを足す・瞳の色を「正」に直す
//     ・表示範囲を変えるコード修正（`drawSpecialCutin` の帯フィットは 1.711 で**元に戻した**）
//   ✅やること: **現行画像を参照に渡し、同じ絵のまま「粒を細かく」「斑点ノイズを消す」だけ**
// ─────────────────────────────────────────────────────────────────────────────
const REFINE = [
  'REFERENCE IMAGE 1 IS THE ARTWORK TO REPRODUCE. Redraw THE SAME PICTURE, not a new one.',
  'Everything must stay identical: the same crop and framing, the same girl, the same eye shape, size, spacing',
  'and tilt, the same calm expression and the same direction of gaze, the same eyebrows, the same bangs and hair',
  'shapes, the same iris colour and the same highlight positions, the same skin tone, the same blush,',
  'the same lighting and the same background. A viewer must not be able to tell that anything was redrawn.',
  'IMPROVE EXACTLY TWO THINGS AND NOTHING ELSE:',
  '(1) RESOLUTION OF THE PIXEL GRID — redraw the same shapes on a FINER grid, with blocks about HALF the size,',
  'so the curves of the eyelids, the irises and the lash lines are described by more, smaller blocks.',
  'Keep it imitation pixel art with visible square blocks — do NOT turn it into a smooth anti-aliased painting.',
  '(2) REMOVE THE SPECKLED DITHER NOISE — the current artwork has scattered noise dots and grain over the skin',
  'and the shadows. Render those areas as CLEAN smooth gradients instead.',
  'DO NOT change her expression. DO NOT make her look fierce, angry, sad or sleepy. DO NOT narrow or enlarge her eyes.',
  'DO NOT re-frame, DO NOT zoom in or out, DO NOT add sparkles, rays, glows or any new effects.',
  'DO NOT change any colour. This is a clean-up and up-res of the existing drawing only.',
].join(' ');

const REFINE_VARIANTS = [
  { key: 'a', desc: 'そのまま高精細化',       extra: 'Reproduce it as faithfully as you can.' },
  { key: 'b', desc: 'さらに細かい格子',       extra: 'Reproduce it as faithfully as you can, and make the pixel grid slightly finer still.' },
  { key: 'c', desc: '格子は控えめに細かく',   extra: 'Reproduce it as faithfully as you can, keeping the blocks a little chunkier than in variant B so the pixel-art look stays obvious.' },
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
const refEyes  = await part(path.join(RAW_DIR, 'REF_manju_eyes.png'));   // ①目のデザインの正
const refTouch = await part(path.join(IMAGES_DIR, 'shop01.jpg'));        // ②タッチ
console.log(`モデル: ${MODEL}`);

if (SET === 'refine') {
  // ⚠参照は**現行画像1枚だけ**。他の絵を混ぜると顔が引っぱられて別人になる
  const refNow = await part(path.join(IMAGES_DIR, 'eyes_closeup.jpg'));
  for (const v of REFINE_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [REFINE, v.extra, COMMON].join(' ');
    console.log(`● eyes_r${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `eyes_r${v.key}.png`), await call(ai, [refNow, { text: prompt }]));
    console.log(`  ✓ tools/_raw/eyes_r${v.key}.png`);
  }
  console.log('完了。⚠**同じ絵に見えるか**を最優先で確認（別人になっていないか）。次にノイズと粒。');
} else if (SET === 'tight') {
  // ⚠参照③に eyes_c を渡す＝「キリッとしている」とユーザーが認めた唯一の候補。目つきの方向性の見本
  const refC = await part(path.join(RAW_DIR, 'eyes_c.png'));
  for (const v of TIGHT_VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [
      EYES, TIGHT_FRAMING, TIGHT_POWER, TIGHT_GRAIN,
      'REFERENCE IMAGE 3 is the closest previous attempt — its lighting and the slant of its lashes are the right',
      'direction, but its gaze is still too soft and too far away. Keep that lighting, push the intensity much',
      'further, and crop in much tighter as described.',
      v.extra, COMMON,
    ].join(' ');
    console.log(`● eyes_t${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `eyes_t${v.key}.png`), await call(ai, [refEyes, refTouch, refC, { text: prompt }]));
    console.log(`  ✓ tools/_raw/eyes_t${v.key}.png`);
  }
  console.log('完了。⚠**目力があるか**を最優先で見る。次に片目あたりの粒数（切り出しより増えているか）。');
} else {
  for (const v of VARIANTS) {
    if (ONLY && ONLY !== v.key) continue;
    const prompt = [EYES, FRAMING, MOOD, GRAIN, v.extra, COMMON].join(' ');
    console.log(`● eyes_${v.key}.png 生成中…（${v.desc}）`);
    await fs.writeFile(path.join(RAW_DIR, `eyes_${v.key}.png`), await call(ai, [refEyes, refTouch, { text: prompt }]));
    console.log(`  ✓ tools/_raw/eyes_${v.key}.png`);
  }
}
console.log('完了。⚠**横の粒数（目標320粒前後）**と、瞳が金色になっていないか、斑点ノイズが無いかを実測してから見せること。');
