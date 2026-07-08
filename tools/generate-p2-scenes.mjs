// ─────────────────────────────────────────────────────────────────────────────
// generate-p2-scenes.mjs — Phase3.6 P2 の素材2点
//   1) images/tutorial_clear.png … チュートリアルクリアの全画面一枚絵（ぴよ氏歓喜・1536x1024生成→そのまま）
//   2) images/shop05.jpg         … ステージショップ退店絵の作り直し（既存shop05を種にeditsで顔だけ可愛く→480x270）
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-p2-scenes.mjs [--only=clear|shop]'
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';

const HEADERS = { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` };

async function generateClear() {
  console.log('● tutorial_clear.png 生成中...');
  const prompt = [
    'Retro 16-bit pixel art victory scene for a cute platformer game.',
    'A small girl hero with BLACK TWIN-TAIL hair with pink ribbons and a bright YELLOW dress jumps high in the air with both arms raised in triumph, huge happy smile, eyes closed with joy.',
    'Around her: colorful confetti, sparkles, and a few shiny GOLDEN EGGS floating.',
    'Background: a peaceful pastel town street (cream and pastel houses with triangular roofs, a street lamp) under a warm morning sky.',
    'In the lower background, a big round fluffy yellow chick with a small tilted gold crown bows apologetically with comical teary eyes (defeated but cute).',
    'Joyful, celebratory, warm. Detailed pixel art, rich colors, landscape composition. No text, no logo, no border, no UI.',
  ].join(' ');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1536x1024', quality: 'high', output_format: 'png', n: 1 }),
  });
  if (!res.ok) throw new Error(`clear HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, 'gen_tutorial_clear.png'), buf);
  await fs.writeFile(path.join(IMAGES_DIR, 'tutorial_clear.png'), await sharp(buf).png().toBuffer());
  console.log('  ✓ images/tutorial_clear.png');
}

async function redoShop05() {
  console.log('● shop05.jpg 顔修正（edits）...');
  const src = await fs.readFile(path.join(IMAGES_DIR, 'shop05.jpg'));
  const prompt = [
    'Redraw this pixel-art scene EXACTLY as it is — same shop interior, same door, same shelves, same lighting,',
    'same cat-eared girl in the yellow-and-black maid dress waving goodbye in the same pose —',
    'but make her FACE much cuter: big sparkling round anime eyes, tiny cute smiling mouth, soft rosy cheeks, gentle happy expression.',
    'Keep the retro 16-bit pixel art style and full composition identical. No text, no border.',
  ].join(' ');
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', prompt);
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('image', new Blob([src], { type: 'image/jpeg' }), 'shop05.jpg');
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: HEADERS, body: form });
  if (!res.ok) throw new Error(`shop05 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, 'gen_shop05_redo.png'), buf);
  // 既存と同じ 480x270 の jpg に整形（candidate として保存→確認後に置き換え）
  await fs.writeFile(path.join(RAW_DIR, 'shop05_candidate.jpg'),
    await sharp(buf).resize(480, 270, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer());
  console.log('  ✓ _raw/shop05_candidate.jpg（確認後に images/shop05.jpg へ）');
}

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
if (only !== 'shop')  await generateClear();
if (only !== 'clear') await redoShop05();
