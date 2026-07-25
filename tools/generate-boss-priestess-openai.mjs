// ─────────────────────────────────────────────────────────────────────────────
// generate-boss-priestess-openai.mjs
// 地底(R7)のボス「闇の巫女」の立ち絵候補を OpenAI gpt-image-1 で生成。
//   ⚠ユーザー指定(1.570): **手続き描画は不可・OpenAI API で生成したものだけを使う**。
//   ⚠ちび頭身にしない＝「もっと人型であり、美しくも恐ろしい巫女」（ユーザー明示）。
//     [[piyo-artwork-proportion-rule]] と同じ方向＝デフォルメ禁止・5〜6頭身の細身の人物。
//   ⚠SPEC_UNDERGROUND.md §7 の禁止事項を必ず入れる: 緑の丸型NG(ハロ回避)／流血・過度な人体表現NG(9+維持)。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-boss-priestess-openai.mjs --n=3'
// 出力: _raw/gen_priestess_<i>_1024.png（生）／_raw/priestess_cand_<i>.png（104x132処理済＝ゲーム内サイズ等倍）
//       ＋ _raw/priestess_candidates.png（比較シート＝ユーザー選定用）
// 採用時: 選んだ番号を images/boss_priestess_idle.png へコピー → sprites.js の IMAGE_SPRITES に boss_priestess 登録。
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR   = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N       = Math.max(1, Math.min(6, parseInt(getArg('n') || '3', 10)));
const QUALITY = getArg('quality') || 'high';
// ゲーム内の描画サイズ（core-state.js の UG_BOSS_W / UG_BOSS_H と必ず一致させること）
const OUT_W = 104, OUT_H = 132;

const PROMPT = [
  'A single DARK PRIESTESS boss character sprite, retro 16-bit pixel art, for a dark fantasy side-scrolling platformer. Final boss of an underground ruined castle.',
  'She is a BEAUTIFUL BUT TERRIFYING human woman — an elegant, slender, adult figure with realistic human proportions (about 6 heads tall). NOT chibi, NOT super-deformed, NOT a child, NOT cute.',
  'She is LEVITATING: her body floats upright with no feet touching anything, and the long hem of her robe trails downward and frays into wisps of violet mist.',
  'She wears ornate Japanese shrine-maiden ceremonial robes rendered in BLACK and DEEP PURPLE instead of white and red: a wide-sleeved chihaya over long hakama, with fine GOLD embroidery and a gold sash, and paper talismans hanging from the sleeves.',
  'Very long straight black hair. A tall dark ceremonial headdress / crown with a thin veil. Her eyes GLOW pale violet and her upper face is partly sunk in shadow under the headdress — the glowing eyes are the single most readable feature.',
  'Her arms are raised slightly outward in a spellcasting pose, and a small orb of violet light hovers between her hands.',
  'Front-facing, symmetric, whole body visible head to hem, centered. Palette: black, deep violet, pale lilac glow, gold accents. Thick clean dark outline, bold crisp chunky pixels, strong readable silhouette against a dark cave.',
  'STRICTLY NO GREEN anywhere. No circular halo, no glowing ring or disc behind her head.',
  'No blood, no wounds, no gore, no bare skin beyond face and hands, modest full-length robes (suitable for a 9+ age rating).',
  'Fully TRANSPARENT background. No floor, no ground, no shadow, no throne, no pillars, no background scenery, no text, no border, no grid, no other characters. Just the single floating priestess.',
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

// ⚠縦長のキャラなので 128x128 に contain すると横に無駄な余白が出て解像度を捨てることになる。
//   ゲーム内の描画サイズ(104x132)へ等倍で入れる＝ドットがボケない。
const processOut = (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
  .resize(OUT_W, OUT_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

async function contactSheet(files, name) {
  const CELL = 300, GAP = 10, COLS = 3, INNER_W = OUT_W * 2, INNER_H = OUT_H * 2;
  const rows = Math.ceil(files.length / COLS);
  const W = COLS * CELL + (COLS + 1) * GAP, H = rows * CELL + (rows + 1) * GAP;
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const up = await sharp(files[i]).resize(INNER_W, INNER_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' }).png().toBuffer();
    const col = i % COLS, row = Math.floor(i / COLS);
    comps.push({ input: up, left: GAP + col * (CELL + GAP) + Math.round((CELL - INNER_W) / 2), top: GAP + row * (CELL + GAP) + Math.round((CELL - INNER_H) / 2) });
    const label = Buffer.from(`<svg width="40" height="30"><text x="4" y="24" font-size="26" font-family="sans-serif" font-weight="bold" fill="#ffd24a" stroke="#000" stroke-width="2">${i + 1}</text></svg>`);
    comps.push({ input: label, left: GAP + col * (CELL + GAP) + 8, top: GAP + row * (CELL + GAP) + 4 });
  }
  const out = path.join(RAW_DIR, name);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 22, g: 12, b: 36, alpha: 1 } } }).composite(comps).png().toFile(out);
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  console.log(`● 闇の巫女 立ち絵 候補 ${N}枚 生成中...`);
  const candFiles = [];
  for (let i = 1; i <= N; i++) {
    console.log(`  [${i}/${N}] 生成...`);
    const raw = await generate(PROMPT);
    await fs.writeFile(path.join(RAW_DIR, `gen_priestess_${i}_1024.png`), raw);
    const out = await processOut(raw);
    const f = path.join(RAW_DIR, `priestess_cand_${i}.png`);
    await fs.writeFile(f, out);
    candFiles.push(f);
    console.log(`  ✓ priestess_cand_${i}.png`);
  }
  const sheet = await contactSheet(candFiles, 'priestess_candidates.png');
  console.log(`\n✓ 比較シート: ${sheet}`);
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
