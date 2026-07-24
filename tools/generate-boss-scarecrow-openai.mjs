// ─────────────────────────────────────────────────────────────────────────────
// generate-boss-scarecrow-openai.mjs
// 6体目ボス（門番）「闇のカカシ」の立ち絵候補を OpenAI gpt-image-1 で生成。
//   - 定点ボス＝正面向き・左右対称・突き立った姿。麻袋の頭＋光る目＋ボロ帽子＋十字の支柱＋藁。
//   - 既存ボス(owl/egg/snake)と同じ「単一立ち絵＋透過背景」路線。手続き描画からの差し替え用。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-boss-scarecrow-openai.mjs --n=4'
// 出力: _raw/gen_boss_scarecrow_<i>_1024.png（生）／_raw/scarecrow_cand_<i>.png（128処理済）
//       ＋ _raw/scarecrow_candidates.png（2x2 比較シート＝ユーザー選定用）
// 採用時: 選んだ番号を images/boss_scarecrow_idle.png にコピー → sprites.js に boss_scarecrow 登録。
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR   = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N       = Math.max(1, Math.min(6, parseInt(getArg('n') || '4', 10)));
const QUALITY = getArg('quality') || 'high';

const PROMPT = [
  'A single menacing DARK SCARECROW boss sprite, retro 16-bit pixel art, for a cute-but-dark side-scrolling platformer.',
  'Front-facing and symmetric, the whole scarecrow standing/planted, mounted on a simple wooden CROSS-POST (a vertical stake with a horizontal crossbar for shoulders).',
  'It has a BURLAP SACK HEAD with visible stitched seams, a crooked stitched mouth, and TWO BIG GLOWING EYES (eerie amber-yellow with a faint red rim) that are the key readable feature.',
  'A tattered pointed straw hat sits on its head. It wears a ragged dark-burlap tunic with wisps of STRAW poking out at the collar, cuffs and torn hem. Thin rag arms hang from the crossbar with little straw hands.',
  'Dark, eerie and slightly tattered; muted dusty browns and dusk-purple shadows with faint glowing accents. An imposing "gatekeeper" feel. Thick clean dark outline, bold crisp chunky pixels, strong readable silhouette.',
  'Fully TRANSPARENT background. No field, no crows, no birds, no moon, no ground, no soil, no shadow, no pole base in dirt, no text, no border, no grid, no other characters. Just the single dark scarecrow, centered and fully visible.',
].join(' ');

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

const process128 = (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
  .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

async function contactSheet(files) {
  const CELL = 256, GAP = 10, COLS = 2, INNER = 232;
  const rows = Math.ceil(files.length / COLS);
  const W = COLS * CELL + (COLS + 1) * GAP, H = rows * CELL + (rows + 1) * GAP;
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const up = await sharp(files[i]).resize(INNER, INNER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' }).png().toBuffer();
    const col = i % COLS, row = Math.floor(i / COLS);
    comps.push({ input: up, left: GAP + col * (CELL + GAP) + (CELL - INNER) / 2, top: GAP + row * (CELL + GAP) + (CELL - INNER) / 2 });
    // 番号ラベル
    const label = Buffer.from(`<svg width="40" height="30"><text x="4" y="24" font-size="26" font-family="sans-serif" font-weight="bold" fill="#ffd24a" stroke="#000" stroke-width="2">${i + 1}</text></svg>`);
    comps.push({ input: label, left: GAP + col * (CELL + GAP) + 8, top: GAP + row * (CELL + GAP) + 4 });
  }
  const out = path.join(RAW_DIR, 'scarecrow_candidates.png');
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 36, g: 28, b: 50, alpha: 1 } } }).composite(comps).png().toFile(out);
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  console.log(`● 闇のカカシ 立ち絵 候補 ${N}枚 生成中...`);
  const candFiles = [];
  for (let i = 1; i <= N; i++) {
    console.log(`  [${i}/${N}] 生成...`);
    const raw = await generate(PROMPT);
    await fs.writeFile(path.join(RAW_DIR, `gen_boss_scarecrow_${i}_1024.png`), raw);
    const p128 = await process128(raw);
    const f = path.join(RAW_DIR, `scarecrow_cand_${i}.png`);
    await fs.writeFile(f, p128);
    candFiles.push(f);
    console.log(`  ✓ scarecrow_cand_${i}.png`);
  }
  const sheet = await contactSheet(candFiles);
  console.log(`\n✓ 比較シート: ${sheet}`);
  console.log(`✓ 個別(128): ${candFiles.map(f => path.basename(f)).join(', ')}`);
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
