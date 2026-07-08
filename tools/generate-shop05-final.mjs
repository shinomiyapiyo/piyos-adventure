// 暫定shop05(候補2の高解像度 shop05_final2_hires.png)を種に「正規版」を作る:
//   (1) スカートの装飾を「ひよこ3つ」にする（title.jpg準拠・ドクロではない）
//   (2) ほんの少しだけドット感（PS2程度・粗くしない）
// 顔・ポーズ・背景・カチューシャ・頭身・画風は変えない。gpt-image-1のedits。
// 実行: zsh -ic 'cd tools && node generate-shop05-final.mjs [--n=3]'
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N = parseInt(getArg('n') || '3', 10);
const SEED = path.join(RAW_DIR, 'shop05_final2_hires.png');

const PROMPT = [
  'Keep this image almost entirely unchanged: the SAME girl, same face, same big cute anime eyes, same yellow cat-ear',
  'headband, same black twin-tails, same waving-goodbye pose, same cozy item-shop background, same colors, composition',
  'and art style. Do NOT change her face, body, pose, or the background.',
  'Make these changes only:',
  '(1) The decorative emblems on her ruffled SKIRT must be exactly THREE cute round yellow baby CHICKS (a piyo: a round',
  'yellow chick with a tiny orange beak and two small dot eyes), spaced across the skirt. If any skull shapes remain,',
  'replace them with these chick emblems. NO skulls anywhere on the dress.',
  '(2) Give only a very subtle, clean retro-game texture (PS2-era smooth 2D look), keep it mostly smooth; do NOT make it',
  'coarse, blocky or low-res.',
  'Everything else stays identical. No text, no border, no UI.',
].join(' ');

async function genOnce(i) {
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', PROMPT);
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('image', new Blob([await fs.readFile(SEED)], { type: 'image/png' }), 'seed.png');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, `shop05_final_${i}_raw.png`), buf);
  await fs.writeFile(path.join(RAW_DIR, `shop05_final_${i}.jpg`),
    await sharp(buf).resize(480, 270, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer());
  console.log(`OK shop05_final_${i}.jpg`);
}

if (!process.env.OPENAI_API_KEY) { console.error('NO_KEY'); process.exit(1); }
for (let i = 1; i <= N; i++) { console.log(`gen ${i}/${N}`); await genOnce(i); }
console.log('DONE');
