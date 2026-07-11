// ─────────────────────────────────────────────────────────────────────────────
// generate-skin-witch-openai.mjs — 新スキン「魔女ぴよ」(🥚200・課金前提) の素材生成。
// 能力: ジャンプ長押しで グライド滞空（コードは実装済み・1.456）。ここでは見た目だけ作る。
// 意匠: 紫系の魔女（とんがり帽子＋マント＋ほうき）。既存の黄色系スキン(忍者/メイド/きぐるみ)と差別化。
// モーション: 歩行は後段で Veo（veo-ninja-walk.mjs を種プロンプトだけ差し替えて流用）。
//
// モード:
//   --anchor --n=4       アンカー立ち絵候補を生成（oai_base_side_2_1024.png の衣装差し替え）
//                        → _raw/witch_anchor_<i>_1024.png（4枚出して Artifact で人間が選定）
//   --idle --anchorFile=witch_anchor_2_1024.png
//                        確定アンカーを player_idle_v1.png に整列して images/skin_witch_idle.png(64×64) をコミット
//   --frames --anchorFile=witch_anchor_2_1024.png [--only=jump,fall]
//                        確定アンカーから jump/fall(=グライド)を生成し player 基準に整列してコミット
// 実行: zsh -ic 'cd tools && node generate-skin-witch-openai.mjs --anchor --n=4'
//   ※ OPENAI_API_KEY はログインシェル経由（zsh -ic）で読み込む
// 生成後の反映（Claude側で実施）: sprites.js に skin_witch_* 登録 / sw.js STATIC_ASSETS 追加 /
//   SKINS.preview と EGG_SHOP_ITEMS.iconImg を images/skin_witch_idle.png に差し替え（現在は仮=デフォルト立ち絵）。
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const OUT = 64;

const args = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const N        = parseInt(getArg('n') || '4', 10);
const QUALITY  = getArg('quality') || 'high';
const MODEL    = 'gpt-image-1';
const BASE     = path.join(RAW_DIR, 'oai_base_side_2_1024.png'); // 忍者/メイドと同じ横向きベース種
const ANCHOR_FILE = getArg('anchorFile') || 'witch_anchor_1_1024.png';

// 魔女ぴよの意匠（アンカー・全ポーズ共通のidentity）。黄色系スキンと被らないよう紫を基調に。
const WITCH_IDENTITY = [
  'The character is the SAME chibi pixel-art girl as the input image (same cute face, same big eyes, same 2-heads-tall',
  'chibi proportions, same chunky pixel-art style, same scale, same side-view stance facing right), but her outfit is',
  'replaced with a cute LITTLE WITCH costume in BRIGHT VIVID VIOLET/PURPLE: a big pointed WITCH HAT (bright violet with',
  'a lighter lavender band) tilted slightly, a short violet witch DRESS with a small collar, a flowing purple CAPE',
  'trailing behind her, lavender-and-white striped stockings and small dark boots, and she HOLDS A WOODEN BROOM',
  '(light-brown handle, tan straw bristles) in one hand. Her cute face and a wisp of black hair stay clearly visible',
  'under the hat. Use BRIGHT, saturated, HIGH-CONTRAST colors with clear light highlights and clean bold outlines',
  '(well-lit and readable, NOT dark, NOT muddy, NOT dusky, no heavy shadows). Keep the clean chunky pixel-art style of the input.',
].join(' ');

const ANCHOR_OUTPUT = [
  'Same calm standing side view facing right (holding the broom at her side), single character only, same 2-heads-tall',
  'scale and same position in frame as the input image. The background MUST be FULLY TRANSPARENT (alpha) — absolutely',
  'NO background, NO scenery, NO ground, NO shadow, NO glow, NO gradient, NO colored backdrop; only the character',
  'pixels on transparency. No text, no border.',
].join(' ');

// jump/fall 用（kigurumi/ninja方式: [アンカー, player_<pose>.png] の2枚渡し。2枚目はポーズのヒントのみ）
const FRAMES = [
  { key: 'jump', base: 'player_jump.png', motion: 'JUMPING UP pose facing RIGHT: clearly AIRBORNE, both knees bent and tucked up, feet off the floor, one arm raised holding the broom. Hat tip, cape and dress hem flutter upward. NOT a standing pose.' },
  // fall はゲーム内でグライド（ふわふわ滞空）中に表示される → ほうきに横向きにまたがって滑空するポーズが理想。
  { key: 'fall', base: 'player_fall.png', motion: 'GLIDING pose facing RIGHT: the witch girl is SITTING SIDEWAYS ON THE FLYING BROOM, coasting through the air, legs together and slightly swept back, one hand on the broom handle. Her cape, hat tip and hair stream backward as she floats. Clearly airborne, relaxed floating look. NOT a standing pose.' },
];
const FRAME_OUTPUT = [
  'Output the SAME witch girl, re-posed into the TARGET POSE — one frame of a side-scrolling sprite animation.',
  'Identical face, hat, cape, dress, colors, line work, chibi proportions and art style as the first reference image.',
  'Single character only, same scale as the reference, fully TRANSPARENT background, no scenery, no ground,',
  'no shadow, no text, no border.',
].join(' ');

// ── ユーティリティ（ninja/kigurumiスクリプトと同一の整列ロジック） ──
async function rawRGBA(buf) { const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: r.data, width: r.info.width, height: r.info.height, channels: r.info.channels }; }
function bboxA(d, thr = 50) { const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (data[(y * width + x) * channels + 3] > thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; } } return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1 }; }
async function alignToBase(rawBuf, baseName) {
  const baseBuf = await fs.readFile(path.join(IMAGES_DIR, baseName));
  const bBase = bboxA(await rawRGBA(baseBuf));
  const dRaw = await rawRGBA(rawBuf);
  const bRaw = bboxA(dRaw);
  let tH = bBase.h;
  let tW = Math.max(1, Math.round(bRaw.w * tH / bRaw.h));
  if (tW > OUT) { tW = OUT; tH = Math.max(1, Math.round(bRaw.h * tW / bRaw.w)); }
  const content = await sharp(rawBuf)
    .extract({ left: bRaw.minX, top: bRaw.minY, width: bRaw.w, height: bRaw.h })
    .resize(tW, tH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const baseCx = bBase.minX + bBase.w / 2;
  let left = Math.round(baseCx - tW / 2); left = Math.max(0, Math.min(OUT - tW, left));
  let top = bBase.maxY - tH + 1; top = Math.max(0, Math.min(OUT - tH, top));
  return sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: content, left, top }]).png().toBuffer();
}
async function appendImage(form, absPath, field) {
  const buf = await fs.readFile(absPath);
  form.append(field, new Blob([buf], { type: 'image/png' }), path.basename(absPath));
}
async function editImage(imagePaths, prompt) {
  const form = new FormData();
  form.append('model', MODEL);
  if (imagePaths.length === 1) await appendImage(form, imagePaths[0], 'image');
  else for (const p of imagePaths) await appendImage(form, p, 'image[]');
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', QUALITY);
  form.append('background', 'transparent');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `HTTP ${res.status}`);
      return Buffer.from(json.data[0].b64_json, 'base64');
    } catch (e) { lastErr = e; const w = 2500 * attempt; console.warn(`  失敗(${attempt}/3): ${e.message} ${w}ms待機...`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行）'); process.exit(1); }

  if (hasFlag('anchor')) {
    for (let i = 1; i <= N; i++) {
      console.log(`● anchor 候補 ${i}/${N} 生成中...`);
      const buf = await editImage([BASE], `${WITCH_IDENTITY}\n\n${ANCHOR_OUTPUT}`);
      await fs.writeFile(path.join(RAW_DIR, `witch_anchor_${i}_1024.png`), buf);
      console.log(`  ✓ _raw/witch_anchor_${i}_1024.png`);
    }
    console.log('\n次: 4枚を人間が見て1枚選定 → --idle と --frames に --anchorFile=witch_anchor_<選んだ番号>_1024.png を渡す');
    return;
  }
  if (hasFlag('idle')) {
    const buf = await fs.readFile(path.join(RAW_DIR, ANCHOR_FILE));
    const aligned = await alignToBase(buf, 'player_idle_v1.png');
    await fs.writeFile(path.join(IMAGES_DIR, 'skin_witch_idle.png'), aligned);
    await fs.writeFile(path.join(RAW_DIR, 'witch_idle_256.png'), await sharp(aligned).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
    console.log('✓ images/skin_witch_idle.png (64×64)');
    return;
  }
  if (hasFlag('frames')) {
    const ONLY = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
    const targets = ONLY.length ? FRAMES.filter(f => ONLY.includes(f.key)) : FRAMES;
    const anchorPath = path.join(RAW_DIR, ANCHOR_FILE);
    for (const fr of targets) {
      console.log(`● ${fr.key} 生成中 (pose-hint: ${fr.base})...`);
      const prompt = `The FIRST image is the character reference. The SECOND image is only a pose hint.\n${WITCH_IDENTITY}\n\nTARGET POSE: ${fr.motion}\n\n${FRAME_OUTPUT}`;
      const buf = await editImage([anchorPath, path.join(IMAGES_DIR, fr.base)], prompt);
      await fs.writeFile(path.join(RAW_DIR, `witch_${fr.key}_1024.png`), buf);
      const aligned = await alignToBase(buf, fr.base);
      await fs.writeFile(path.join(IMAGES_DIR, `skin_witch_${fr.key}.png`), aligned);
      await fs.writeFile(path.join(RAW_DIR, `witch_${fr.key}_256.png`), await sharp(aligned).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
      console.log(`  ✓ images/skin_witch_${fr.key}.png`);
    }
    return;
  }
  console.log('モードを指定してください: --anchor / --idle / --frames');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
