// ─────────────────────────────────────────────────────────────────────────────
// generate-skin-ninja-openai.mjs — 新スキン「忍者ぴよ」(🥚200・課金前提) の素材生成。
// 仕様: 黄色装束＋頭巾あり。歩行モーションは後段で Veo（veo-walk.mjs 系）を使う。
//
// モード:
//   --anchor --n=4       アンカー立ち絵候補を生成（oai_base_side_2_1024.png の衣装差し替え）
//                        → _raw/ninja_anchor_<i>_1024.png
//   --shuriken --n=3     手裏剣スプライト候補（グレー・夜ステージで見えるように黒は禁止）
//                        → _raw/shuriken_<i>_1024.png
//   --frames --anchorFile=ninja_anchor_2_1024.png [--only=jump,fall]
//                        確定アンカーから jump/fall 等を生成し player 基準に整列して
//                        images/skin_ninja_<key>.png (64×64) へコミット（kigurumi方式）
//   --idle --anchorFile=ninja_anchor_2_1024.png
//                        確定アンカーを player_idle_v1.png に整列して idle をコミット
// 実行: zsh -ic 'cd tools && node generate-skin-ninja-openai.mjs --anchor --n=4'
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
const BASE     = path.join(RAW_DIR, 'oai_base_side_2_1024.png'); // メイドの横向きベース（Veo種と同系）
const ANCHOR_FILE = getArg('anchorFile') || 'ninja_anchor_1_1024.png';

// 忍者ぴよの意匠（アンカー・全ポーズ共通のidentity）
const NINJA_IDENTITY = [
  'The character is the SAME chibi pixel-art girl as the input image (same face, same big eyes, same proportions,',
  'same chunky pixel-art style, same scale, same side-view stance facing right), but her outfit is replaced with a',
  'bright YELLOW NINJA GARB (shinobi shozoku): a yellow ninja HOOD (zukin) covering her head with her cute face',
  'clearly visible through the face opening, a small tuft of her black hair or one short twin-tail sticking out from',
  'the back of the hood, a yellow ninja jacket with BLACK trim and a black belt (obi), yellow baggy ninja pants',
  'wrapped at the ankles, black hand guards and black tabi-style feet, and a small yellow scarf trailing behind.',
  'Keep the same dusky pixel-art shading and outline style as the input image.',
].join(' ');

const ANCHOR_OUTPUT = [
  'Same pose as the input (calm standing side view facing right), single character only, same size and position',
  'in frame as the input, fully TRANSPARENT background, no scenery, no ground, no shadow, no text, no border.',
].join(' ');

const SHURIKEN_PROMPT = [
  'A single classic 4-pointed ninja SHURIKEN (throwing star) as a tiny video-game item sprite, chunky pixel-art style.',
  'Color: LIGHT GRAY / silver steel with slightly darker gray edges and a small white shine highlight and a small round',
  'hole in the center. It must NOT be black or very dark — it must stay clearly visible against a dark night background.',
  'Flat side view, centered, filling most of the frame, fully TRANSPARENT background, no hand, no character, no text,',
  'no border, no shadow.',
].join(' ');

// jump/fall 用（kigurumi方式: [アンカー, player_<pose>.png] の2枚渡し）
const FRAMES = [
  { key: 'jump', base: 'player_jump.png', motion: 'JUMPING UP pose facing RIGHT: clearly AIRBORNE, both knees bent and tucked up, feet off the floor, arms raised. Scarf and hood tuft flutter upward. NOT a standing pose.' },
  { key: 'fall', base: 'player_fall.png', motion: 'FALLING DOWN pose facing RIGHT: clearly AIRBORNE and descending, legs apart and loose, arms up and outward to balance, looking slightly down. Scarf flutters above. NOT a standing pose.' },
];
const FRAME_OUTPUT = [
  'Output the SAME ninja girl, re-posed into the TARGET POSE — one frame of a side-scrolling sprite animation.',
  'Identical face, hood, outfit, colors, line work, chibi proportions and art style as the first reference image.',
  'Single character only, same scale as the reference, fully TRANSPARENT background, no scenery, no ground,',
  'no shadow, no text, no border.',
].join(' ');

// ── ユーティリティ（kigurumiスクリプトと同一の整列ロジック） ──
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
async function generateImage(prompt) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, size: '1024x1024', quality: QUALITY, background: 'transparent' }),
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
      const buf = await editImage([BASE], `${NINJA_IDENTITY}\n\n${ANCHOR_OUTPUT}`);
      await fs.writeFile(path.join(RAW_DIR, `ninja_anchor_${i}_1024.png`), buf);
      console.log(`  ✓ _raw/ninja_anchor_${i}_1024.png`);
    }
    return;
  }
  if (hasFlag('shuriken')) {
    for (let i = 1; i <= N; i++) {
      console.log(`● shuriken 候補 ${i}/${N} 生成中...`);
      const buf = await generateImage(SHURIKEN_PROMPT);
      await fs.writeFile(path.join(RAW_DIR, `shuriken_${i}_1024.png`), buf);
      console.log(`  ✓ _raw/shuriken_${i}_1024.png`);
    }
    return;
  }
  if (hasFlag('idle')) {
    const buf = await fs.readFile(path.join(RAW_DIR, ANCHOR_FILE));
    const aligned = await alignToBase(buf, 'player_idle_v1.png');
    await fs.writeFile(path.join(IMAGES_DIR, 'skin_ninja_idle.png'), aligned);
    await fs.writeFile(path.join(RAW_DIR, 'ninja_idle_256.png'), await sharp(aligned).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
    console.log('✓ images/skin_ninja_idle.png (64×64)');
    return;
  }
  if (hasFlag('frames')) {
    const ONLY = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
    const targets = ONLY.length ? FRAMES.filter(f => ONLY.includes(f.key)) : FRAMES;
    const anchorPath = path.join(RAW_DIR, ANCHOR_FILE);
    for (const fr of targets) {
      console.log(`● ${fr.key} 生成中 (pose-hint: ${fr.base})...`);
      const prompt = `The FIRST image is the character reference. The SECOND image is only a pose hint.\n${NINJA_IDENTITY}\n\nTARGET POSE: ${fr.motion}\n\n${FRAME_OUTPUT}`;
      const buf = await editImage([anchorPath, path.join(IMAGES_DIR, fr.base)], prompt);
      await fs.writeFile(path.join(RAW_DIR, `ninja_${fr.key}_1024.png`), buf);
      const aligned = await alignToBase(buf, fr.base);
      await fs.writeFile(path.join(IMAGES_DIR, `skin_ninja_${fr.key}.png`), aligned);
      await fs.writeFile(path.join(RAW_DIR, `ninja_${fr.key}_256.png`), await sharp(aligned).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
      console.log(`  ✓ images/skin_ninja_${fr.key}.png`);
    }
    return;
  }
  console.log('モードを指定してください: --anchor / --shuriken / --idle / --frames');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
