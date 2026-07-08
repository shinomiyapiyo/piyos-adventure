// ─────────────────────────────────────────────────────────────────────────────
// generate-shop05-oai.mjs — 退店絵(shop05)を OpenAI gpt-image-1 で作り直す（一枚絵はOpenAIが基本）。
// title.jpg を参照画像として edits に渡し、キャラの顔・黄色猫耳カチューシャ・黒ツインテ・
// 黄×黒メイド服・5-6頭身を厳守したまま、背景とポーズだけ「道具屋で客を見送る」シーンに変える。
// n枚生成 → _raw/shop05_o_1.jpg .. 。すぐチャット表示して人間が選ぶ。
// 実行: zsh -ic 'cd tools && node generate-shop05-oai.mjs [--n=3]'
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N = parseInt(getArg('n') || '3', 10);

const PROMPT = [
  'Keep the girl in this reference image EXACTLY as she is — same face, same big cute anime eyes, same gentle smile,',
  'same YELLOW cat-ear headband with bows, same long black twin-tails, same yellow-and-black frilly maid dress with',
  'white skull motifs, same black thigh-high stockings, same slim tall proportions and same anime art style.',
  'Do not alter her face or design at all. Only change the background and her pose:',
  'she is now a shopkeeper inside a cozy medieval item shop, standing by the wooden door, smiling and raising one hand',
  'to wave goodbye to a departing customer. Background: shelves of potions, scrolls and goods, a treasure chest, warm lamplight.',
  'Full anime illustration, landscape. No text, no border, no UI, no speech bubble.',
].join(' ');

async function editOnce(i) {
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', PROMPT);
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('image', new Blob([await fs.readFile(path.join(IMAGES_DIR, 'title.jpg'))], { type: 'image/jpeg' }), 'title.jpg');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, `shop05_o_${i}_raw.png`), buf);
  await fs.writeFile(path.join(RAW_DIR, `shop05_o_${i}.jpg`),
    await sharp(buf).resize(480, 270, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer());
  console.log(`  ✓ _raw/shop05_o_${i}.jpg`);
}

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
console.log(`gpt-image-1 / ${N}枚生成（title.jpg参照）`);
for (let i = 1; i <= N; i++) { console.log(`● ${i}/${N}...`); await editOnce(i); }
console.log('完了');
