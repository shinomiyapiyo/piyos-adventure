// ─────────────────────────────────────────────────────────────────────────────
// generate-ug-idol-openai.mjs
// 地底のボス闘技場「巫女の間」の中央に据える**邪神の巨像**を OpenAI gpt-image-1 で生成。
//   ⚠ユーザー指定(1.570):「この小部屋のようなスペースの真ん中にいかにも怪しげな邪神の巨像などを置いて。
//     いかにもボス戦が始まるというのが目視で分かるように」＝**門の手前から見えて「ここでボス戦だ」と分かる目印**。
//   ⚠闘技場の左端＝カメラ終端なので、プレイヤーが門を歩いている間から闘技場の中が見えている。
//     そこに巨像が立っていれば、入る前に「来るぞ」と分かる。
//   ⚠SPEC_UNDERGROUND.md §7 と同じ縛り: 緑NG(ハロ回避)／流血・過度な人体表現NG(9+維持)。
//   ⚠**巫女より奥に暗く描く**ので、シルエットがはっきりしていること（細部より輪郭）。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-ug-idol-openai.mjs --n=3'
// 出力: _raw/gen_ugidol_<i>_1024.png（生）／_raw/ugidol_cand_<i>.png（220x300処理済＝ゲーム内サイズ等倍）
//       ＋ _raw/ugidol_candidates.png（比較シート＝ユーザー選定用）
// 採用時: 選んだ番号を images/ug_idol.png へコピー → sprites.js の IMAGE_SPRITES に ug_idol 登録。
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
// ゲーム内の描画サイズ（render.js の UG_IDOL_W / UG_IDOL_H と必ず一致させること）
const OUT_W = 220, OUT_H = 300;

const PROMPT = [
  'A COLOSSAL ANCIENT STONE IDOL of a dark god, retro 16-bit pixel art, for a dark fantasy side-scrolling platformer. It stands at the far wall of a ruined underground castle chamber and marks the boss arena.',
  'The idol is a towering carved statue of an eldritch BIRD-DEITY: a great hooked beak, a crowned horned head, folded stone wings wrapped around its body, and clawed talons gripping a wide tiered stone pedestal.',
  'It is carved from dark weathered stone with deep cracks, chipped edges and worn engravings of old runes on the pedestal. Cold and imposing, clearly very old.',
  'Its many carved eyes GLOW pale violet from inside the stone, and thin violet light seeps out of the cracks — the only light on it. Two small braziers of violet flame sit at the base of the pedestal.',
  'Front-facing, perfectly symmetric, whole statue visible from crown to pedestal base, centered, standing tall and narrow (much taller than wide).',
  'Palette: dark grey-violet stone, deep shadow, pale lilac glow, a little tarnished gold on the crown. Thick clean dark outline, bold crisp chunky pixels, VERY strong readable silhouette (it will be drawn dimmed in the background, so the outline matters more than fine detail).',
  'STRICTLY NO GREEN anywhere. No circular halo, no glowing ring or disc.',
  'No blood, no gore, no human corpses, no skulls, no bones, no suffering figures (suitable for a 9+ age rating). It is a carved statue, not a living creature.',
  'Fully TRANSPARENT background. No floor, no ground plane, no cast shadow, no walls, no room, no ceiling, no background scenery, no text, no border, no grid, no characters. Just the single stone idol on its pedestal.',
].join(' ');

async function generate(prompt) {
  const body = { model: 'gpt-image-1', prompt, size: '1024x1536', quality: QUALITY, background: 'transparent', output_format: 'png', n: 1 };
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

const processOut = (buf) => sharp(buf).ensureAlpha().trim({ threshold: 10 })
  .resize(OUT_W, OUT_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

async function contactSheet(files, name) {
  const CELL_W = 250, CELL_H = 330, GAP = 10, COLS = 3;
  const rows = Math.ceil(files.length / COLS);
  const W = COLS * CELL_W + (COLS + 1) * GAP, H = rows * CELL_H + (rows + 1) * GAP;
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const up = await sharp(files[i]).resize(OUT_W, OUT_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' }).png().toBuffer();
    const col = i % COLS, row = Math.floor(i / COLS);
    comps.push({ input: up, left: GAP + col * (CELL_W + GAP) + Math.round((CELL_W - OUT_W) / 2), top: GAP + row * (CELL_H + GAP) + Math.round((CELL_H - OUT_H) / 2) });
    const label = Buffer.from(`<svg width="40" height="30"><text x="4" y="24" font-size="26" font-family="sans-serif" font-weight="bold" fill="#ffd24a" stroke="#000" stroke-width="2">${i + 1}</text></svg>`);
    comps.push({ input: label, left: GAP + col * (CELL_W + GAP) + 8, top: GAP + row * (CELL_H + GAP) + 4 });
  }
  const out = path.join(RAW_DIR, name);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 22, g: 12, b: 36, alpha: 1 } } }).composite(comps).png().toFile(out);
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  console.log(`● 邪神の巨像 候補 ${N}枚 生成中...`);
  const candFiles = [];
  for (let i = 1; i <= N; i++) {
    console.log(`  [${i}/${N}] 生成...`);
    const raw = await generate(PROMPT);
    await fs.writeFile(path.join(RAW_DIR, `gen_ugidol_${i}_1024.png`), raw);
    const out = await processOut(raw);
    const f = path.join(RAW_DIR, `ugidol_cand_${i}.png`);
    await fs.writeFile(f, out);
    candFiles.push(f);
    console.log(`  ✓ ugidol_cand_${i}.png`);
  }
  const sheet = await contactSheet(candFiles, 'ugidol_candidates.png');
  console.log(`\n✓ 比較シート: ${sheet}`);
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
