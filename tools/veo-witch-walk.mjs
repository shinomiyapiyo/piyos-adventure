// veo-witch-walk.mjs — 魔女ぴよの横向き歩行クリップを Veo 3.1 で生成（veo-ninja-walk.mjs の魔女版）。
// 種= _raw/witch_anchor_2_1024.png（採用アンカー）を緑背景9:16へ合成 → image-to-video。
// 実行: zsh -ic 'cd tools && node veo-witch-walk.mjs'   出力: _raw/veo_witch_walk.mp4
// 後段: ffmpeg で _raw/veo_frames_witch/f_%03d.png に抽出 → veo-frames-to-witch.mjs --frames=… で整列。
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
const BASE    = getArg('base') || 'witch_anchor_2_1024.png';
const SEED_OUT = path.join(RAW_DIR, 'veo_witch_seed_green.png');
const MP4_OUT  = path.join(RAW_DIR, 'veo_witch_walk.mp4');
const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, FOOT_Y = 1185;

const PROMPT = [
  'A 2-heads-tall chibi pixel-art girl in a BRIGHT PURPLE WITCH costume: a big pointed purple witch hat, a violet',
  'witch dress with a flowing purple cape, long black hair, lavender striped stockings, holding a wooden broom in one',
  'hand. She walks in place in a smooth, clear SIDE-VIEW walking cycle, facing right. Her legs clearly step: one foot',
  'forward, then both legs pass close together between steps, then the other foot forward — a natural open-close-open',
  'walk. Her cape, hat tip and black hair sway slightly with each step; she keeps holding the broom. She stays CENTERED',
  'in the frame and does NOT travel across the screen. Keep her exact appearance, outfit, bright purple colors and',
  'chunky pixel-art style identical to the input image. Plain flat solid green background, no other objects, no camera',
  'movement, no zoom, no panning.',
].join(' ');
const NEG = 'walking out of frame, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame, riding the broom, flying';

async function buildSeed() {
  const basePath = path.join(RAW_DIR, BASE);
  const char = await sharp(basePath).trim({ threshold: 10 }).resize(640, 1000, { fit: 'inside' }).png().toBuffer();
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
  const seedBuf = await buildSeed();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log(`model=${MODEL} ${SECONDS}s 生成開始...`);
  let op = await ai.models.generateVideos({
    model: MODEL, prompt: PROMPT,
    image: { imageBytes: seedBuf.toString('base64'), mimeType: 'image/png' },
    config: { aspectRatio: '9:16', resolution: '720p', durationSeconds: SECONDS, numberOfVideos: 1, personGeneration: 'allow_adult', negativePrompt: NEG },
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
