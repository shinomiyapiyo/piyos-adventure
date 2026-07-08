// ─────────────────────────────────────────────────────────────────────────────
// generate-p2b-scenes.mjs — 一枚絵2点の作り直し（1.429）
// タイトル画面の女の子（title.jpg）を参照画像として gpt-image-1 edits に渡し、
// 「同一人物・同じ頭身」でシーンだけ差し替える。服は黄色ワンピース指定。
//   1) _raw/shortcake_candidate.png … いちごショート演出絵
//   2) _raw/clear_candidate.png     … チュートリアルクリア絵
// 確認後に images/ へ配置する（このスクリプトは candidates までしか書かない）
// 実行: zsh -ic 'cd tools && node generate-p2b-scenes.mjs [--only=cake|clear]'
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';

const CHARACTER = [
  'Use the EXACT SAME girl character as in the reference image: same face, same brown eyes, same gentle smile,',
  'same long black twin-tail hair with yellow ribbons, and the SAME BODY PROPORTIONS (about 5-6 heads tall, slim — NOT chibi, NOT super-deformed).',
  'But change her outfit to a simple bright YELLOW ONE-PIECE SUNDRESS (no maid apron, no black frills, no cat ears).',
].join(' ');

const SCENES = [
  {
    key: 'cake', out: 'shortcake_candidate.png',
    prompt: [
      CHARACTER,
      'REPLACE THE ENTIRE BACKGROUND AND SCENE: she now sits at a warm wooden counter in a cozy cake shop,',
      'happily eating a slice of strawberry shortcake with whipped cream and a big red strawberry on a plate, holding a small fork, rosy cheeks, joyful expression.',
      'Background: shelves with pastel cakes and teapots, warm lamplight. No chickens, no castle, no chicks, no outdoor scenery.',
      'Retro 16-bit pixel art style, landscape composition, the girl and the cake are the focus. No text, no border, no UI.',
    ].join(' '),
  },
  {
    key: 'clear', out: 'clear_candidate.png',
    prompt: [
      CHARACTER,
      'REPLACE THE ENTIRE BACKGROUND AND SCENE: she jumps high in the air in triumph, both arms raised, huge happy smile,',
      'surrounded by colorful confetti, sparkles and a few shiny golden eggs floating.',
      'Background: a peaceful pastel town street (cream houses with triangular roofs, a street lamp) under a warm morning sky.',
      'In the lower corner, a big round fluffy yellow chick with a small tilted gold crown bows with comical teary eyes. No chickens, no castle.',
      'Retro 16-bit pixel art style, landscape composition, joyful and celebratory. No text, no border, no UI.',
    ].join(' '),
  },
];

async function editScene(sc) {
  console.log(`● ${sc.out} 生成中（title.jpg参照）...`);
  const ref = await fs.readFile(path.join(IMAGES_DIR, 'title.jpg'));
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', sc.prompt);
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('image', new Blob([ref], { type: 'image/jpeg' }), 'title.jpg');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`${sc.key} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from((await res.json()).data[0].b64_json, 'base64');
  await fs.writeFile(path.join(RAW_DIR, sc.out), buf);
  console.log(`  ✓ _raw/${sc.out}`);
}

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
for (const sc of SCENES) { if (!only || only === sc.key) await editScene(sc); }
