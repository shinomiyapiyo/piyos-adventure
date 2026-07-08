// iOS用アプリアイコン 案A: ぴよ氏バストアップ＋黄色ドミナント（1024x1024）
// title.jpg を種に gpt-image-1 の edits で生成（顔・カチューシャ・画風を固定）。
// iOS要件: 透過なし・角丸なし・文字なし・主要素は中央寄せ（角はOSがマスク）。
// 実行: zsh -ic 'cd tools && node generate-icon-a.mjs [--n=4]'
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N = parseInt(getArg('n') || '4', 10);
const SEED = path.resolve(__dirname, '..', 'images', 'title.jpg');

const PROMPT = [
  'Create a square APP ICON using the SAME girl from this image as the ONLY subject:',
  'same cute anime face with big brown eyes, same yellow cat-ear headband with frills,',
  'same black twin-tail hair, same yellow-and-black frilled maid-style dress, same proportions and face style.',
  'Composition: a BUST-UP portrait (head and shoulders / upper chest), her face large and centered,',
  'filling about 70-80% of the frame, looking at the viewer with a cheerful smile.',
  'ONE small round friendly yellow baby chick (tiny orange beak, two dot eyes, NO angry eyebrows)',
  'peeks in near her shoulder in the lower part of the frame.',
  'Background: a simple bright warm YELLOW to soft pastel PINK gradient. No scenery, no castle, no trees, no other objects.',
  'Keep the pixel-art retro game art style of the source image, but bold, clean and high-contrast',
  'so it stays readable when shrunk to a tiny app icon.',
  'IMPORTANT: absolutely no text, no letters, no logo, no watermark, no border, no frame,',
  'no rounded corners, fully opaque background, and keep all important elements away from the corners',
  '(the OS will mask the corners).',
].join(' ');

async function genOnce(i) {
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'high');
  form.append('image', new Blob([await fs.readFile(SEED)], { type: 'image/jpeg' }), 'seed.jpg');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, `icon_a_${i}_raw.png`), buf);
  console.log(`OK icon_a_${i}_raw.png`);
}

if (!process.env.OPENAI_API_KEY) { console.error('NO_KEY'); process.exit(1); }
for (let i = 1; i <= N; i++) { console.log(`gen ${i}/${N}`); await genOnce(i); }
console.log('DONE');
