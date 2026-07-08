// ─────────────────────────────────────────────────────────────────────────────
// generate-shortcake-openai.mjs
// チュートリアルショップ限定「いちごショート」の素材2点を OpenAI gpt-image-1 で生成。
//   - images/icon_shortcake.png     … 32px ショップアイコン（透過）
//   - images/shortcake_scene.png    … 1536x1024 購入時のフルスクリーン演出絵（そば演出と同方式）
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-shortcake-openai.mjs'
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const ASSETS = [
  {
    out: 'icon_shortcake.png', size: '1024x1024', background: 'transparent',
    process: (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    prompt: [
      'A single strawberry shortcake slice game item icon, retro 16-bit pixel art.',
      'A fluffy triangular slice of sponge cake with white whipped cream layers and ONE big glossy red strawberry on top.',
      'Bright, cute, appetizing. Thick clean dark outline, bold crisp pixel art, strong readable silhouette at small size.',
      'Fully TRANSPARENT background. No plate, no table, no text, no border. Just the single cake slice, centered.',
    ].join(' '),
  },
  {
    out: 'shortcake_scene.png', size: '1536x1024', background: 'opaque',
    process: (buf) => sharp(buf).png().toBuffer(),
    prompt: [
      'Retro 16-bit pixel art scene for a cute platformer game: a small girl hero happily eating a strawberry shortcake at a cozy shop counter.',
      'The girl has BLACK TWIN-TAIL hair with pink ribbons and wears a bright YELLOW dress. She sits at a warm wooden counter,',
      'eyes closed in bliss with rosy cheeks, holding a small fork, a slice of strawberry shortcake with whipped cream and a big red strawberry on a plate in front of her.',
      'Cozy cake-shop interior background: warm lamplight, shelves with pastel cakes and teapots, soft evening light.',
      'Warm, joyful, delicious mood. Detailed pixel art, rich colors, landscape composition, the girl and the cake are the clear focus.',
      'No text, no logo, no border, no UI.',
    ].join(' '),
  },
];

async function generate(a) {
  const body = { model: 'gpt-image-1', prompt: a.prompt, size: a.size, quality: 'high', background: a.background, output_format: 'png', n: 1 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json();
      return Buffer.from(json.data[0].b64_json, 'base64');
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`  retry ${attempt}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
for (const a of ASSETS) {
  console.log(`● ${a.out} 生成中...`);
  const raw = await generate(a);
  await fs.writeFile(path.join(RAW_DIR, 'gen_' + a.out), raw);
  await fs.writeFile(path.join(IMAGES_DIR, a.out), await a.process(raw));
  console.log(`  ✓ images/${a.out}`);
}
