// ─────────────────────────────────────────────────────────────────────────────
// veo-idol-walk.mjs — アイドルぴよの横向きモーションを Veo 3.1 で生成（veo-cyber-motion.mjs と同じ2アクション構成）。
//   --action=walk      横向き歩行（→ walk_1〜4 の切り出し元）
//   --action=jumpfall  その場ジャンプ→落下の繰り返し（→ jump / fall の切り出し元）
// ⚠jump/fall も**Veoから切り出す**。侍ぴよ・サイバーぴよが同じ作り（sprites.js のコメント参照）で、
//   独立生成した1枚絵だと歩行と体型や色が微妙にズレるため。
// 種= _raw/idol_side_2_keyed.png（確定した立ち絵から起こした横向きアンカー）を緑背景9:16へ合成 → image-to-video。
//
// ⚠**Veoは1本ずつ**。生成したら必ずユーザーに見せて判断を仰ぐ（連続生成でクレジットを溶かさない・ユーザー厳命）。
// ⚠**ツインテールが揺れること**をプロンプトに必ず入れる（ユーザー指摘）。種の絵だけに任せると
//   歩行中に髪が固まったり片方に消えたりする。
//
// 実行: zsh -ic 'cd tools && node veo-idol-walk.mjs'   出力: _raw/veo_idol_walk.mp4
// 後段: ffmpeg -i _raw/veo_idol_walk.mp4 _raw/veo_frames_idol/f_%03d.png
//       → veo-frames-to-idol.mjs --frames=… --commit で 64px へ整列して images/ に反映
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR   = path.resolve(__dirname, '_raw');
const args   = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const MODEL   = getArg('model') || (hasFlag('std') ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview');
const SECONDS = parseInt(getArg('seconds') || '4', 10);
const BASE    = getArg('base') || 'idol_side_2_keyed.png';
const SEED_OUT = path.join(RAW_DIR, 'veo_idol_seed_green.png');
const ACTION   = getArg('action') || 'walk';
const MP4_OUT  = path.join(RAW_DIR, `veo_idol_${ACTION}.mp4`);
const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, FOOT_Y = 1185;

// 衣装の identity（両アクション共通）。⚠ここがブレると歩行と跳躍で別人になる。
const ID = [
  'A 2-heads-tall chibi pixel-art girl in a CUTE PASTEL IDOL COSTUME: big fluffy WHITE CAT EARS on a headband,',
  'a big round WHITE puff sleeve, a pastel yellow top with a little yellow chick on the chest, a flared skirt with',
  'pink / pastel yellow / mint tiers, pastel yellow leg warmers with white cuffs and small yellow shoes.',
  'She has LONG BLACK TWIN-TAILS tied with YELLOW RIBBONS on both sides of her head.',
].join(' ');
const COMMON_NEG = [
  'background change, camera motion, panning, zoom, extra characters, text, watermark, blur,',
  'realistic 3d render, out of frame, hair disappearing, losing the twin-tails, losing the cat ears,',
  'changing outfit, smooth anti-aliased art, high resolution repaint',
].join(' ');

const ACTIONS = {
  walk: {
    prompt: [
      ID,
      'She walks in place in a smooth, clear SIDE-VIEW walking cycle, facing right. Her legs clearly step:',
      'one foot forward, then both legs pass close together between steps, then the other foot forward —',
      'a natural open-close-open walk.',
      'HER LONG BLACK TWIN-TAILS SWAY AND BOUNCE with each step, and the white cat ears and the skirt tiers',
      'bob gently in time with her steps. Both twin-tails stay visible the whole time.',
      'She stays CENTERED in the frame and does NOT travel across the screen.',
      'Keep her exact appearance, outfit, pastel colours and chunky pixel-art style identical to the input image.',
      'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' '),
    neg: 'walking out of frame, ' + COMMON_NEG,
  },
  jumpfall: {
    prompt: [
      ID,
      'She LEAPS HIGH STRAIGHT UP in place and falls back down, repeatedly, in STRICT SIDE PROFILE facing right.',
      'This is a BIG JUMP: her feet LEAVE THE GROUND COMPLETELY and she rises well above the floor.',
      'On the way up both knees BEND AND TUCK UP toward her chest and her arms swing upward;',
      'at the top she is FULLY AIRBORNE with nothing touching the floor;',
      'on the way down her legs loosen and trail below her, arms slightly out for balance.',
      'She ALWAYS stays in STRICT SIDE PROFILE facing right and NEVER turns toward the camera.',
      'The camera never moves and never zooms in; her size on screen stays exactly the same.',
      'HER LONG BLACK TWIN-TAILS STREAM UPWARD as she rises and settle as she falls, and the white cat ears',
      'and skirt tiers flutter with the motion. Both twin-tails stay visible the whole time.',
      'A clear, readable jump-and-fall loop. She stays CENTERED in the frame.',
      'Keep her exact appearance, outfit, pastel colours and chunky pixel-art style identical to the input image.',
      'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' '),
    neg: 'standing still, small hop, feet staying on the ground, front view, facing the camera, turning toward the camera, '
       + 'three-quarter view, zoom in, close-up, character getting bigger, walking, running, ' + COMMON_NEG,
  },
};

async function buildSeed() {
  const basePath = path.join(RAW_DIR, BASE);
  const char = await sharp(basePath).trim({ threshold: 10 }).resize(640, 1000, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(char).metadata();
  const left = Math.round((W - m.width) / 2);
  const top  = Math.max(0, FOOT_Y - m.height);
  await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
    .composite([{ input: char, left, top }]).png().toFile(SEED_OUT);
  console.log(`種画像: ${SEED_OUT} (char ${m.width}x${m.height})`);
  return fs.readFile(SEED_OUT);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('✗ GEMINI_API_KEY 未設定'); process.exit(1); }
  const seedBuf = await buildSeed();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const act = ACTIONS[ACTION];
  if (!act) { console.error(`✗ 不明なaction: ${ACTION}（walk|jumpfall）`); process.exit(1); }
  console.log(`model=${MODEL} action=${ACTION} ${SECONDS}s 生成開始...`);
  let op = await ai.models.generateVideos({
    model: MODEL, prompt: act.prompt,
    image: { imageBytes: seedBuf.toString('base64'), mimeType: 'image/png' },
    config: { aspectRatio: '9:16', resolution: '720p', durationSeconds: SECONDS, numberOfVideos: 1, personGeneration: 'allow_adult', negativePrompt: act.neg },
  });
  let waited = 0;
  while (!op.done) { await sleep(10000); waited += 10; process.stdout.write(`  ...${waited}s\r`); op = await ai.operations.getVideosOperation({ operation: op }); }
  console.log(`\n完了(${waited}s).`);
  if (op.error) { console.error('✗ operation error:', JSON.stringify(op.error)); process.exit(1); }
  const vids = op.response?.generatedVideos || [];
  if (!vids.length) { console.error('✗ 動画なし raiMediaFilteredCount=', op.response?.raiMediaFilteredCount, JSON.stringify(op.response?.raiMediaFilteredReasons || '')); process.exit(1); }
  await ai.files.download({ file: vids[0].video, downloadPath: MP4_OUT });
  console.log(`✓ 保存: ${MP4_OUT}`);
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
