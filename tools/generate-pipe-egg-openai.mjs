// ─────────────────────────────────────────────────────────────────────────────
// generate-pipe-egg-openai.mjs
// 土管ボーナス部屋用の新規スプライトを OpenAI gpt-image-1（text→image / generations）で生成。
//   - images/item_pipe.png       … 土管（入口/出口兼用・透過）
//   - images/item_golden_egg.png … ゴールデンエッグ（レア通貨・透過・64px）
// 部屋背景は AI 生成せず canvas 描画（FC地下風）にするため、ここでは生成しない。
//
// 実行（.zshrc の OPENAI_API_KEY を継承するため zsh -ic 経由）:
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-pipe-egg-openai.mjs'
//
// オプション:
//   --only=pipe,egg     指定だけ生成（既定は両方）
//   --quality=high|medium|low (既定 high)
// 出力: images/ に直接書き込み＋ _raw/ に 1024 原版を保存。
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
const ONLY    = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const QUALITY = getArg('quality') || 'high';
const MODEL   = 'gpt-image-1';

const ASSETS = [
  {
    key: 'pipe',
    out: 'item_pipe.png',
    // 高さ優先で縦長を保つ（アスペクト維持）
    process: (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
      .resize(192, 256, { fit: 'inside', withoutEnlargement: false }).png().toBuffer(),
    prompt: [
      'A single classic side-scrolling green warp pipe sprite, retro 16-bit pixel art, Super Mario style.',
      'A thick rounded rim/lip at the TOP (wider than the body) and a straight vertical cylindrical body below it.',
      'Clean cylindrical shading: dark green outline, medium green body, a lighter green vertical highlight stripe on the left, the round dark opening visible at the top.',
      'Front-facing side view, standing upright, the whole pipe fully visible from top rim to bottom.',
      'Crisp pixel art, bold clean outline. Centered. Fully TRANSPARENT background.',
      'No ground, no grass, no scenery, no character, no shadow, no text, no border, no grid. Just the single pipe.',
    ].join(' '),
  },
  {
    key: 'egg',
    out: 'item_golden_egg.png',
    process: (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
      .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    prompt: [
      'A single shiny GOLDEN EGG collectible item sprite, retro 16-bit pixel art, cute valuable treasure look.',
      'Smooth oval egg shape, bright warm gold body with soft yellow-to-amber gradient shading, a clear white shine highlight near the top-left, and a couple of tiny sparkle stars around it.',
      'Thick clean dark-gold outline, crisp pixel art. Centered, upright.',
      'Fully TRANSPARENT background. No background, no cup, no nest, no ground, no shadow, no text, no border, no grid. Just the single golden egg.',
    ].join(' '),
  },
  {
    key: 'sidepipe',
    out: 'item_pipe_side.png',
    // 横長を保つ（アスペクト維持）
    process: (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
      .resize(220, 130, { fit: 'inside', withoutEnlargement: false }).png().toBuffer(),
    prompt: [
      'A classic side-scrolling green warp pipe lying HORIZONTALLY, retro 16-bit pixel art, Super Mario style.',
      'The round pipe MOUTH/opening faces LEFT — a dark circular opening with a thick rounded rim on the LEFT end — and the cylindrical body extends to the RIGHT.',
      'Clean horizontal cylindrical shading: dark green outline, medium green body, a lighter green horizontal highlight stripe along the top of the tube.',
      'Pure side view, the whole horizontal pipe fully visible from the left mouth to the right end. Crisp pixel art, bold clean outline. Centered.',
      'Fully TRANSPARENT background. No ground, no scenery, no character, no shadow, no text, no border, no grid. Just the single horizontal pipe.',
    ].join(' '),
  },
];

async function generate(prompt) {
  const body = {
    model: MODEL,
    prompt,
    size: '1024x1024',
    quality: QUALITY,
    background: 'transparent',
    output_format: 'png',
    n: 1,
  };
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
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
  const targets = ONLY.length ? ASSETS.filter(a => ONLY.includes(a.key)) : ASSETS;
  console.log(`model=${MODEL} quality=${QUALITY} targets=${targets.map(t => t.key).join(',')}`);
  for (const a of targets) {
    console.log(`\n● ${a.key} 生成中...`);
    const raw = await generate(a.prompt);
    await fs.writeFile(path.join(RAW_DIR, `gen_${a.key}_1024.png`), raw);
    const processed = await a.process(raw);
    await fs.writeFile(path.join(IMAGES_DIR, a.out), processed);
    const meta = await sharp(processed).metadata();
    console.log(`  ✓ images/${a.out} (${meta.width}x${meta.height})  ＋ _raw/gen_${a.key}_1024.png`);
  }
  console.log('\n完了。images/ の出力を確認してください。');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
