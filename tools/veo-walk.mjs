// ─────────────────────────────────────────────────────────────────────────────
// veo-walk.mjs  —  Gemini Veo 3.1 で「メイドの横向き歩行クリップ」を1回だけ生成する。
// 種画像(base_side_2)を緑背景9:16に合成 → image-to-video → _raw/veo_walk.mp4 を保存。
// 実行: zsh -ic 'cd games/piyo-adventure/tools && node veo-walk.mjs'
//   --model=veo-3.1-fast-generate-preview (既定) / --std で標準画質
//   --seconds=4 / --base=oai_base_side_2_1024.png
// ※ コマ切り出しは後段で ffmpeg を使う（このスクリプトは動画生成まで）。
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const MODEL    = getArg('model') || (hasFlag('std') ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview');
const SECONDS  = parseInt(getArg('seconds') || '4', 10);
const IDLE     = hasFlag('idle');   // 立ち絵(idle)用の動画を作る
const BASE     = getArg('base') || 'oai_base_side_2_1024.png';   // idleもwalkと同じクリーンな横向きベースから（"walkを元に"）
const SEED_OUT = path.join(RAW_DIR, IDLE ? 'veo_idle_seed.png' : 'veo_seed_green.png');
const MP4_OUT  = path.join(RAW_DIR, IDLE ? 'veo_idle.mp4' : 'veo_walk.mp4');

const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, FOOT_Y = 1185;

const PROMPT_WALK = [
  'A 2-heads-tall chibi pixel-art maid girl walks in place in a smooth, clear SIDE-VIEW walking cycle, facing right.',
  'Her legs clearly step: one foot forward, then both legs pass close together between steps, then the other foot forward —',
  'a natural open-close-open walk. Her black twin-tails and yellow-black frilly skirt sway slightly with each step.',
  'She stays CENTERED in the frame and does NOT travel across the screen. Keep her exact appearance, outfit, colors and',
  'pixel-art art style identical to the input image. Plain flat solid green background, no other objects, no camera movement,',
  'no zoom, no panning.',
].join(' ');
const PROMPT_IDLE = [
  'The same 2-heads-tall chibi pixel-art maid girl from the input image simply STOPS walking and stands STILL in a calm,',
  'relaxed IDLE pose, in the SAME clear SIDE VIEW facing right as the input — both feet planted together on the ground,',
  'arms relaxed at her sides. Only a very subtle idle motion (gentle breathing, a tiny twin-tail sway). She does NOT walk,',
  'does NOT step, does NOT move across the screen and does NOT turn to face the viewer (keep the side view).',
  'Keep her exact appearance, beautiful crisp face, outfit, colors and pixel-art style IDENTICAL to the input image.',
  'She stays CENTERED. Plain flat solid green background, no camera movement, no zoom, no panning.',
].join(' ');
const PROMPT = IDLE ? PROMPT_IDLE : PROMPT_WALK;
const NEG = (IDLE
  ? 'walking, stepping, moving across the screen, turning to face the viewer, changing the camera angle, '
  : 'walking out of frame, ')
  + 'background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame';

async function buildSeed() {
  const basePath = path.join(RAW_DIR, BASE);
  const char = await sharp(basePath).trim({ threshold: 10 }).resize(640, 1000, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(char).metadata();
  const left = Math.round((W - m.width) / 2);
  const top = Math.max(0, FOOT_Y - m.height);
  await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
    .composite([{ input: char, left, top }])
    .png().toFile(SEED_OUT);
  console.log(`種画像: ${SEED_OUT} (char ${m.width}x${m.height} @ ${left},${top})`);
  return fs.readFile(SEED_OUT);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で）'); process.exit(1); }
  const seedBuf = await buildSeed();
  if (hasFlag('seed-only')) { console.log('--seed-only: 種画像のみ生成して終了（Veoは呼びません）'); return; }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log(`model=${MODEL} ${W}x${H}(9:16) 720p ${SECONDS}s 生成開始...（数分かかります）`);

  let op = await ai.models.generateVideos({
    model: MODEL,
    prompt: PROMPT,
    image: { imageBytes: seedBuf.toString('base64'), mimeType: 'image/png' },
    config: {
      aspectRatio: '9:16',
      resolution: '720p',
      durationSeconds: SECONDS,
      numberOfVideos: 1,
      personGeneration: 'allow_adult',
      negativePrompt: NEG,
    },
  });

  let waited = 0;
  while (!op.done) { await sleep(10000); waited += 10; process.stdout.write(`  ...${waited}s\r`); op = await ai.operations.getVideosOperation({ operation: op }); }
  console.log(`\n完了(${waited}s).`);

  if (op.error) { console.error('✗ operation error:', JSON.stringify(op.error)); process.exit(1); }
  const vids = op.response?.generatedVideos || [];
  if (!vids.length) { console.error('✗ 動画が返りませんでした。raiMediaFilteredCount=', op.response?.raiMediaFilteredCount, JSON.stringify(op.response?.raiMediaFilteredReasons || '')); process.exit(1); }

  await ai.files.download({ file: vids[0].video, downloadPath: MP4_OUT });
  console.log(`✓ 保存: ${MP4_OUT}`);
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
