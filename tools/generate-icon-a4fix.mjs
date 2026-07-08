// アイコン案A候補4の服修正: 顔・構図・背景・ひよこは候補4のまま、
// メイド服のデザインだけを title.jpg の衣装（黒パフスリーブ+黄色エプロン胸当て+胸の黄リボン）に合わせる。
// gpt-image-1 edits に2枚渡し（1枚目=土台の候補4 / 2枚目=服の参照 title.jpg）。
// 実行: zsh -ic 'cd tools && node generate-icon-a4fix.mjs [--n=3]'
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N = parseInt(getArg('n') || '3', 10);
const BASE = path.join(RAW_DIR, 'icon_a_4_raw.png');
const DRESS_REF = path.resolve(__dirname, '..', 'images', 'title.jpg');

const PROMPT = [
  'Two images are provided. The FIRST image is the app icon to edit. The SECOND image is the official character',
  'reference showing her correct outfit.',
  'Keep the FIRST image almost entirely unchanged: the SAME face (do not touch the face at all), same expression,',
  'same yellow cat-ear headband, same black twin-tails with yellow ribbons, same composition, same yellow-to-pink',
  'gradient background, same yellow chick at her shoulder, same bold pixel-art style.',
  'Change ONLY her outfit so it matches the outfit worn by the girl in the SECOND image:',
  'a black dress with short black puff sleeves, a bright YELLOW pinafore / apron front panel over the chest with',
  'clean vertical pleat lines, yellow frilled shoulder straps, a neat yellow bow at the chest, and a slim black',
  'choker. Remove any incorrect all-over frills that do not exist in the reference outfit.',
  'Everything else stays identical. No text, no border, no watermark, opaque background, keep important elements',
  'away from the corners.',
].join(' ');

async function genOnce(i) {
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'high');
  form.append('image[]', new Blob([await fs.readFile(BASE)], { type: 'image/png' }), 'base.png');
  form.append('image[]', new Blob([await fs.readFile(DRESS_REF)], { type: 'image/jpeg' }), 'dress-ref.jpg');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, `icon_a4fix_${i}_raw.png`), buf);
  console.log(`OK icon_a4fix_${i}_raw.png`);
}

if (!process.env.OPENAI_API_KEY) { console.error('NO_KEY'); process.exit(1); }
for (let i = 1; i <= N; i++) { console.log(`gen ${i}/${N}`); await genOnce(i); }
console.log('DONE');
