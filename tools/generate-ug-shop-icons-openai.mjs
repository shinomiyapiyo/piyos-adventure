// ─────────────────────────────────────────────────────────────────────────────
// generate-ug-shop-icons-openai.mjs
// 地底「怪しい老婆の店」の3品の図鑑アイコンを OpenAI gpt-image-1 で生成（1.577）。
//   - images/icon_ug_manju.png    … 極楽まんじゅう（白い蒸し饅頭・紫の霊気）
//   - images/icon_ug_elixir.png   … 老婆の劇薬（毒々しい紫緑のフラスコ）
//   - images/icon_ug_blessing.png … 地底の主の加護（邪神の石像の目・images/ug_idol.png と同系統）
// いずれも 32x32 透過PNG（既存の icon_*.png と同寸・同形式）。
// ⚠ショップUIの絵文字（🍡/⚗️/👁）は別物。図鑑は entry.img の PNG を使うためこちらが要る。
// ⚠まんじゅうは「団子(🍡)ではなく蒸し饅頭」で作る（名前・説明文と絵文字が食い違っていたためユーザー確認済み）。
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-ug-shop-icons-openai.mjs'
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

// 共通の作法（既存アイコンと画風を揃える）: レトロ16bitドット絵・太い暗色の輪郭・完全透過・単体で中央
const COMMON = [
  'retro 16-bit pixel art game item icon.',
  'Thick clean dark outline, bold crisp pixels, strong readable silhouette at very small size.',
  'Fully TRANSPARENT background. No plate, no table, no text, no border, no shadow on the ground.',
  'Just the single object, centered, filling most of the frame.',
].join(' ');

const ASSETS = [
  {
    out: 'icon_ug_manju.png',
    prompt: [
      'A single Japanese STEAMED BUN (manju) game item icon —',
      'a plump round white dome-shaped steamed bun, smooth pale surface, slightly flattened bottom,',
      'with a small red stamp mark on top. NOT a dango, NOT skewered balls, NOT on a stick.',
      'A faint eerie PURPLE glow rises from it, hinting it is an otherworldly delicacy sold by a crone in a cave.',
      COMMON,
    ].join(' '),
  },
  {
    out: 'icon_ug_elixir.png',
    prompt: [
      'A single sinister potion FLASK game item icon —',
      'a round-bottomed glass flask with a narrow neck and a dark cork stopper,',
      'filled with bubbling sickly PURPLE-GREEN liquid that glows faintly, a few bubbles rising inside.',
      'It looks potent and slightly dangerous, like a witch-crone brewed it.',
      COMMON,
    ].join(' '),
  },
  {
    out: 'icon_ug_blessing.png',
    prompt: [
      'A single ancient stone IDOL HEAD game item icon —',
      'a small weathered grey stone statue head of an eldritch deity, carved angular features,',
      'with ONE large glowing PURPLE EYE open at its center that emits an ominous light.',
      'Cracked worn stone texture, carved from the depths of a cave. Ominous and sacred.',
      COMMON,
    ].join(' '),
  },
];

// 生成 → 余白トリム → 32x32 に収める（既存 icon_*.png と同寸）
async function toIcon(buf) {
  return sharp(buf).ensureAlpha().trim({ threshold: 10 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
}

async function generate(a) {
  const body = { model: 'gpt-image-1', prompt: a.prompt, size: '1024x1024', quality: 'high',
                 background: 'transparent', output_format: 'png', n: 1 };
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
  await fs.writeFile(path.join(RAW_DIR, 'gen_' + a.out), raw);          // 1024px の原寸も残す（差し替え・拡大用）
  await fs.writeFile(path.join(IMAGES_DIR, a.out), await toIcon(raw));
  console.log(`  ✓ images/${a.out}`);
}
console.log('完了。1024px の原寸は tools/_raw/gen_*.png に保管。');
