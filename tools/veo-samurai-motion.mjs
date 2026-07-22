// veo-samurai-motion.mjs — 侍ぴよのモーションクリップを Veo 3.1 で生成（veo-witch-walk.mjs の侍版・3アクション対応）。
// 種= _raw/samurai_anchor_1_1024.png（採用アンカー）を緑背景9:16へ合成 → image-to-video。
// 実行: zsh -ic 'cd tools && node veo-samurai-motion.mjs --action=walk'   出力: _raw/veo_samurai_<action>.mp4
//   --action=walk      横向き足踏み歩行サイクル（→ walk_1..4 切り出し）
//   --action=jumpfall  その場ジャンプ→落下の繰り返し（→ jump / fall 切り出し）
//   --action=dive      刀を抜いて急降下斬り（→ dive 切り出し・1.509の急降下斬り用）
// 後段: ffmpeg で _raw/veo_frames_samurai_<action>/f_%03d.png に抽出 → veo-frames-to-samurai.mjs で整列。
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const MODEL   = getArg('model') || (hasFlag('std') ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview');
const SECONDS = parseInt(getArg('seconds') || '4', 10);
const ACTION  = getArg('action') || 'walk';
const BASE    = getArg('base') || 'samurai_anchor_1_1024.png';
const SEED_OUT = path.join(RAW_DIR, 'veo_samurai_seed_green.png');
const MP4_OUT  = path.join(RAW_DIR, `veo_samurai_${ACTION}.mp4`);
const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, FOOT_Y = 1185;

// 共通identity（動画プロンプト冒頭）
const ID = [
  'A 2-heads-tall chibi pixel-art girl in a cute SAMURAI outfit: a clean WHITE kimono top, a BLACK obi belt, wide',
  'CRIMSON deep-red hakama trousers, a RED headband (hachimaki), long black hair tied in a HIGH PONYTAIL with a red',
  'ribbon, and a small katana in a dark sheath at her left hip.',
].join(' ');

const ACTIONS = {
  walk: {
    prompt: [
      ID,
      'She walks in place in a smooth, clear SIDE-VIEW walking cycle, facing right. Her legs clearly step: one foot',
      'forward, then both legs pass close together between steps, then the other foot forward — a natural open-close-open',
      'walk. Her ponytail and headband ends sway slightly with each step; the katana stays sheathed at her hip. She stays',
      'CENTERED in the frame and does NOT travel across the screen. Keep her exact appearance, outfit, colors and chunky',
      'pixel-art style identical to the input image. Plain flat solid green background, no other objects, no camera',
      'movement, no zoom, no panning.',
    ].join(' '),
    neg: 'walking out of frame, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame, drawing the sword, swinging the sword',
  },
  jumpfall: {
    prompt: [
      ID,
      'She JUMPS STRAIGHT UP in place and falls back down, repeatedly, in clear SIDE VIEW facing right. On the way up her',
      'knees bend and tuck, arms swing upward; at the top she is fully airborne; on the way down her legs loosen and',
      'trail, arms slightly out for balance, ponytail and headband streaming upward. A clear, readable jump-and-fall',
      'loop. The katana stays sheathed at her hip. She stays CENTERED in the frame. Keep her exact appearance, outfit,',
      'colors and chunky pixel-art style identical to the input image. Plain flat solid green background, no other',
      'objects, no camera movement, no zoom, no panning.',
    ].join(' '),
    neg: 'walking, running, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame, drawing the sword',
  },
  dive: {
    prompt: [
      ID,
      'She DRAWS HER KATANA and performs a dramatic VERTICAL PLUNGING STAB straight down IN PLACE, repeatedly, in clear',
      'SIDE VIEW facing right: she leaps STRAIGHT UP, then plunges STRAIGHT DOWN head-first-angled. CRITICAL POSE DETAIL:',
      'during the plunge BOTH of her ARMS are EXTENDED DOWNWARD IN FRONT of her body, holding the katana with both hands,',
      'and the BLADE POINTS STRAIGHT DOWN BELOW HER HANDS — the sword tip is the LOWEST point of the whole figure,',
      'LEADING the dive like a downward stab, with her body following the blade down. The sword is NEVER behind her back,',
      'NEVER trailing, NEVER raised overhead during the descent. Legs together sweeping up behind her, ponytail and',
      'headband ends streaming upward. Then she lands softly and repeats. She remains perfectly CENTERED horizontally the',
      'entire time, NEVER moves left or right, NEVER approaches the frame edges — the jump and dive are purely vertical,',
      'in place. Keep her exact appearance, outfit, colors and chunky pixel-art style identical to the input image.',
      'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' '),
    neg: 'sword behind the body, sword trailing behind, sword raised overhead while falling, follow-through slash, horizontal slash, moving forward, moving sideways, traveling across the screen, leaving the frame, near frame edge, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame, sheathed sword only',
  },
};

async function buildSeed() {
  const basePath = path.join(RAW_DIR, BASE);
  // --charscale=0.6 等でキャラを小さく合成＝激しいアクションでも画面端に触れない余白を確保（dive用）
  const CS = parseFloat(getArg('charscale') || '1');
  const char = await sharp(basePath).trim({ threshold: 10 }).resize(Math.round(640 * CS), Math.round(1000 * CS), { fit: 'inside' }).png().toBuffer();
  const m = await sharp(char).metadata();
  const left = Math.round((W - m.width) / 2);
  const top = Math.max(0, FOOT_Y - m.height);
  await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
    .composite([{ input: char, left, top }]).png().toFile(SEED_OUT);
  console.log(`種画像: ${SEED_OUT} (char ${m.width}x${m.height})`);
  return fs.readFile(SEED_OUT);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('✗ GEMINI_API_KEY 未設定'); process.exit(1); }
  const act = ACTIONS[ACTION];
  if (!act) { console.error(`✗ 不明なaction: ${ACTION}（walk|jumpfall|dive）`); process.exit(1); }
  const seedBuf = await buildSeed();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log(`[${ACTION}] model=${MODEL} ${SECONDS}s 生成開始...`);
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
