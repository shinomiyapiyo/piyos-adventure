// ─────────────────────────────────────────────────────────────────────────────
// generate-boss-owl-openai.mjs
// 5体目ボス「闇のフクロウ」の立ち絵を OpenAI gpt-image-1 で生成。
//   - images/boss_owl_idle.png … 128px・大きな光る目の暗いフクロウ（暗転ギミックで目だけ見える）
// 空中ボス。暗転(vignette)中も"光る目"が浮かぶので、目を大きく強調。羽根は広げ気味。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-boss-owl-openai.mjs'
// 出力: images/boss_owl_idle.png ＋ _raw/gen_boss_owl_1024.png
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
const QUALITY = getArg('quality') || 'high';

const ASSET = {
  out: 'boss_owl_idle.png',
  process: (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
  prompt: [
    'A single menacing DARK HORNED OWL boss sprite, retro 16-bit pixel art, for a cute-but-dark platformer.',
    'A front-facing owl with a large round head, prominent ear tufts, and TWO BIG BRIGHT GLOWING EYES (glowing amber-yellow with a violet rim) that dominate the face — the eyes are the key readable feature.',
    'Dark purple and charcoal feathers with faint glowing violet edges, a small sharp beak, and wings spread slightly outward as if about to swoop.',
    'A faint dark-purple magical aura and a couple of tiny purple sparks. Front-facing, symmetric, the whole owl fully visible. Thick clean dark outline, bold crisp pixel art, strong readable silhouette.',
    'Fully TRANSPARENT background. No branch, no perch, no moon, no ground, no shadow, no text, no border, no grid, no other characters. Just the single dark owl, centered.',
  ].join(' '),
};

async function generate(prompt) {
  const body = { model: 'gpt-image-1', prompt, size: '1024x1024', quality: QUALITY, background: 'transparent', output_format: 'png', n: 1 };
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `HTTP ${res.status}`);
      return Buffer.from(json.data[0].b64_json, 'base64');
    } catch (e) { lastErr = e; const w = 3000 * attempt; console.warn(`  失敗(${attempt}/3): ${e.message} ${w}ms待機`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  console.log('● 闇のフクロウ 立ち絵 生成中...');
  const raw = await generate(ASSET.prompt);
  await fs.writeFile(path.join(RAW_DIR, 'gen_boss_owl_1024.png'), raw);
  const processed = await ASSET.process(raw);
  await fs.writeFile(path.join(IMAGES_DIR, ASSET.out), processed);
  const meta = await sharp(processed).metadata();
  console.log(`  ✓ images/${ASSET.out} (${meta.width}x${meta.height})`);
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
