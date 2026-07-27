// veo-kigurumi-walk.mjs — きぐるみぴよの歩行クリップを Veo 3.1 で生成（veo-ninja-walk.mjs のきぐるみ版）。
// 種= _raw/kigurumi_B_1024.png（出荷中の立ち絵の元＝B案アンカー）を緑背景9:16へ合成 → image-to-video。
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node veo-kigurumi-walk.mjs'
//   出力: _raw/veo_kigurumi_walk.mp4
//
// ⚠なぜ作り直すのか（1.638の実測）: 現行の4コマは OpenAI に1枚ずつ「足を閉じたパスポーズ」を
//   指示して作らせたもの（generate-skin-kigurumi-openai.mjs に walk_2/walk_4 の
//   "Legs MUST be CLOSED" が残っている）だが、**指示は無視され4枚とも開脚のまま**だった。
//   足元スタンス幅は 35/32/35/33px（開閉幅3px）＝忍者の「一番開いたコマ」25pxより広い状態が続き、
//   歩行に見えない。動きの差分コマは**必ず動画から切り出す**（独立生成はモーションが崩れる）。
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR   = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const MODEL   = getArg('model') || (hasFlag('std') ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview');
const SECONDS = parseInt(getArg('seconds') || '4', 10);
const BASE    = getArg('base') || 'kigurumi_B_1024.png';
const SEED_OUT = path.join(RAW_DIR, 'veo_kigurumi_seed_green.png');
const MP4_OUT  = path.join(RAW_DIR, 'veo_kigurumi_walk2.mp4');

const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, FOOT_Y = 1185;

// ⚠1本目(2026-07-28)の失敗から書き直した。失敗内容:
//   ① "SIDE-VIEW" と書いたら**体ごと真横に回り**、フードで素顔が完全に隠れた
//   ② **真横では奥の足が手前の足に隠れて動かない**（ユーザー指摘「奥の左足が前後していない」）。
//      これは映像として正しい見え方なので、真横を狙う限り必ず起きる＝角度で解決するしかない
//   ③ 歩幅が小さすぎ、64pxに落とすと足元の開閉が3px以下（ぴよ氏は10px）
//   → 忍者(veo-ninja-walk.mjs)が成功しているのは**真横ではなく3/4**だから。同じ角度を明示する。
const PROMPT = [
  'A 2-heads-tall chibi pixel-art girl wearing a bright YELLOW bear/mouse KIGURUMI onesie with a big hood',
  '(round ears with orange inner circles, her own cute face with dark bob hair clearly visible in the hood opening),',
  'a white belly patch and a thin curly tail with a round yellow ball at its tip, walks in place, seen from a',
  'THREE-QUARTER view: her body turned about 45 degrees to her right, so BOTH of her legs stay clearly visible',
  'side by side and her face still shows. She takes LARGE, exaggerated steps: one leg swings far FORWARD while the',
  'other trails far BEHIND and the feet clearly lift off the ground, then both legs pass CLOSE TOGETHER directly',
  'under her body, then the legs swap — a big, bouncy open-close-open-close walk cycle. BOTH legs swing equally:',
  'the far leg (drawn slightly darker) steps forward and back just as much as the near leg. Her curly tail and the',
  'hood ears bounce with each step. She stays CENTERED in the frame and does NOT travel across the screen.',
  'Keep her exact appearance, costume, colors and chunky pixel-art style identical to the input image.',
  'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
].join(' ');
const NEG = 'full side profile, exact side view, turning to face away, back view, face hidden by hood, far leg hidden behind near leg, far leg not moving, legs always spread apart, tiny steps, shuffling, feet sliding, wide stance, squatting, walking out of frame, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame';

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
