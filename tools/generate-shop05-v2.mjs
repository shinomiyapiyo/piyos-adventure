// ─────────────────────────────────────────────────────────────────────────────
// generate-shop05-v2.mjs — 退店絵の再修正（1.430）
// 入力1 = 現行 images/shop05.jpg（構図・店内・衣装の維持元）
// 入力2 = images/title.jpg（ぴよ氏の顔・頭身の参照）
// 「アバター以外は過度なデフォルメ禁止」ルールに基づき、タイトル準拠の5-6頭身で描き直す。
// 出力: _raw/shop05_v2_raw.png ＋ _raw/shop05_v2.jpg（480x270・確認後に images/ へ）
// 実行: zsh -ic 'cd tools && node generate-shop05-v2.mjs'
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const prompt = [
  'Two reference images are provided. The FIRST image is the scene to recreate: keep its shop interior, shelves, door,',
  'lighting, composition, and the girl\'s pose (waving goodbye near the door) and her yellow-and-black cat-ear maid outfit EXACTLY.',
  'The SECOND image shows the same girl character in her canonical style: use ITS face design and BODY PROPORTIONS',
  '(about 5-6 heads tall, slim anime proportions — absolutely NOT chibi, NOT super-deformed, NOT a big head).',
  'So: redraw the first image with the girl drawn at the second image\'s proportions and face style — brown eyes, gentle smile, black twin-tail hair.',
  'Retro 16-bit pixel art style, landscape composition. No text, no border.',
].join(' ');

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
console.log('● shop05 v2 生成中（shop05+title 2枚参照）...');
const form = new FormData();
form.append('model', 'gpt-image-1');
form.append('prompt', prompt);
form.append('size', '1536x1024');
form.append('quality', 'high');
form.append('image[]', new Blob([await fs.readFile(path.join(IMAGES_DIR, 'shop05.jpg'))], { type: 'image/jpeg' }), 'shop05.jpg');
form.append('image[]', new Blob([await fs.readFile(path.join(IMAGES_DIR, 'title.jpg'))], { type: 'image/jpeg' }), 'title.jpg');
const res = await fetch('https://api.openai.com/v1/images/edits', {
  method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
});
if (!res.ok) { console.error(`✗ HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
await fs.writeFile(path.join(RAW_DIR, 'shop05_v2_raw.png'), buf);
await fs.writeFile(path.join(RAW_DIR, 'shop05_v2.jpg'),
  await sharp(buf).resize(480, 270, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer());
console.log('  ✓ _raw/shop05_v2.jpg');
