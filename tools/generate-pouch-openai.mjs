// ─────────────────────────────────────────────────────────────────────────────
// generate-pouch-openai.mjs
// まほうのポーチ（永続ストック枠のエッグ交換品）アイコンを OpenAI gpt-image-1 で生成。
//   - images/item_pouch.png … 巾着袋（ひよこ柄・金の紐・魔法っぽい光沢のドット絵・透過）
//
// 実行（.zshrc の OPENAI_API_KEY を継承するため zsh -ic 経由）:
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-pouch-openai.mjs'
//
// オプション: --quality=high|medium|low (既定 high)
// 出力: images/item_pouch.png ＋ _raw/gen_pouch_1024.png（1024原版）。
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const args = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const QUALITY = getArg('quality') || 'high';
const MODEL   = 'gpt-image-1';

const ASSET = {
  key: 'pouch',
  out: 'item_pouch.png',
  process: (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
    .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
  prompt: [
    'A single cute magic drawstring pouch (money bag) collectible item sprite, retro 16-bit pixel art, cozy fantasy treasure look.',
    'A plump rounded cloth pouch, soft violet-and-cream fabric, cinched at the top with a shiny GOLD drawstring cord and a small gold knot, the gathered top puckered above the cord.',
    'On the front of the pouch a small simple CHICK emblem (a round yellow baby chick face with a tiny orange beak) like a printed crest.',
    'A faint magical sparkle glow and one or two tiny star sparkles floating around it. Clean thick dark outline, smooth cel shading, a soft highlight on the upper-left.',
    'Centered, upright, the whole pouch fully visible. Crisp pixel art. Fully TRANSPARENT background.',
    'No table, no coins spilling out, no ground, no shadow, no text, no border, no grid, no character. Just the single pouch.',
  ].join(' '),
};

async function generate(prompt) {
  const body = {
    model: MODEL, prompt, size: '1024x1024', quality: QUALITY,
    background: 'transparent', output_format: 'png', n: 1,
  };
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
    } catch (e) {
      lastErr = e; const w = 3000 * attempt;
      console.warn(`  失敗(${attempt}/3): ${e.message}  ${w}ms待機...`);
      await new Promise(r => setTimeout(r, w));
    }
  }
  throw lastErr;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  console.log(`model=${MODEL} quality=${QUALITY} target=${ASSET.key}`);
  console.log(`\n● ${ASSET.key} 生成中...`);
  const raw = await generate(ASSET.prompt);
  await fs.writeFile(path.join(RAW_DIR, `gen_${ASSET.key}_1024.png`), raw);
  const processed = await ASSET.process(raw);
  await fs.writeFile(path.join(IMAGES_DIR, ASSET.out), processed);
  const meta = await sharp(processed).metadata();
  console.log(`  ✓ images/${ASSET.out} (${meta.width}x${meta.height})  ＋ _raw/gen_${ASSET.key}_1024.png`);
  console.log('\n完了。images/item_pouch.png を確認してください。');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
