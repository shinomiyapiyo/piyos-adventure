// veo-cyber-motion.mjs — サイバーぴよのモーションクリップを Veo 3.1 で生成（veo-samurai-motion.mjs のサイバー版）。
// 種= _raw/cyber_anchor_3_1024.png（採用アンカー）を緑背景9:16へ合成 → image-to-video。
// ⚠ドローンは別スプライト＝動画に絶対に出さない（プロンプト/負プロンプト両方で禁止）。
// 実行: zsh -ic 'cd tools && node veo-cyber-motion.mjs --action=walk'   出力: _raw/veo_cyber_<action>.mp4
//   --action=walk      横向き足踏み歩行サイクル（→ walk_1..4 切り出し）
//   --action=jumpfall  その場ジャンプ→落下の繰り返し（→ jump / fall 切り出し）
// 後段: ffmpeg で _raw/veo_frames_cyber_<action>/f_%03d.png に抽出 → veo-frames-to-cyber.mjs で整列。
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
const BASE    = getArg('base') || 'cyber_anchor_3_1024.png';
const SEED_OUT = path.join(RAW_DIR, 'veo_cyber_seed_green.png');
const MP4_OUT  = path.join(RAW_DIR, `veo_cyber_${ACTION}.mp4`);
const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
// --landscape: 横長16:9（横に長いポーズ用・侍diveの教訓）。歩行/ジャンプは9:16でOK
const LANDSCAPE = hasFlag('landscape');
const W = LANDSCAPE ? 1280 : 720, H = LANDSCAPE ? 720 : 1280, FOOT_Y = LANDSCAPE ? 665 : 1185;

// 共通identity（動画プロンプト冒頭）
const ID = [
  'A 2-heads-tall chibi pixel-art girl in a cute FUTURISTIC CYBER SUIT: a sleek WHITE form-fitting tech bodysuit',
  'with thin glowing GOLD accent lines, small WHITE gloves, WHITE boots with GOLD soles, a small GOLD tech headset',
  'over her ears (face fully visible), a tiny white-and-gold thruster backpack, and her black hair tied in a HIGH',
  'PONYTAIL with a gold hair tie. She is completely ALONE — absolutely NO drone, NO companion robot, NO floating',
  'object anywhere in the video.',
].join(' ');

const ACTIONS = {
  walk: {
    prompt: [
      ID,
      'She walks in place in a smooth, clear SIDE-VIEW walking cycle, facing right. Her legs clearly step: one foot',
      'forward, then both legs pass close together between steps, then the other foot forward — a natural open-close-open',
      'walk. Her ponytail sways slightly with each step. She stays CENTERED in the frame and does NOT travel across the',
      'screen. Keep her exact appearance, outfit, colors and chunky pixel-art style identical to the input image.',
      'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' '),
    neg: 'drone, companion robot, floating object, walking out of frame, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame',
  },
  jumpfall: {
    prompt: [
      ID,
      'She JUMPS STRAIGHT UP in place and falls back down, repeatedly, in clear SIDE VIEW facing right. On the way up her',
      'knees bend and tuck, arms swing upward; at the top she is fully airborne; on the way down her legs loosen and',
      'trail, arms slightly out for balance, ponytail streaming upward. A clear, readable jump-and-fall loop.',
      'She stays CENTERED in the frame. Keep her exact appearance, outfit, colors and chunky pixel-art style identical',
      'to the input image. Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' '),
    neg: 'drone, companion robot, floating object, walking, running, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame',
  },
};

async function buildSeed() {
  const basePath = path.join(RAW_DIR, BASE);
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
  if (!act) { console.error(`✗ 不明なaction: ${ACTION}（walk|jumpfall）`); process.exit(1); }
  const seedBuf = await buildSeed();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log(`[${ACTION}] model=${MODEL} ${SECONDS}s 生成開始...`);
  let op = await ai.models.generateVideos({
    model: MODEL, prompt: act.prompt,
    image: { imageBytes: seedBuf.toString('base64'), mimeType: 'image/png' },
    config: { aspectRatio: LANDSCAPE ? '16:9' : '9:16', resolution: '720p', durationSeconds: SECONDS, numberOfVideos: 1, personGeneration: 'allow_adult', negativePrompt: act.neg },
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
