// ─────────────────────────────────────────────────────────────────────────────
// generate-cyber-drone-openai.mjs — サイバーぴよのドローンビット（随伴機）のスプライト候補生成。
// 意匠: 丸型・たまご/メカひよこモチーフ・白×金（スーツとお揃い）・緑禁止・側面フラップ禁止（ハロ回避=1.497教訓）。
// 参照: _raw/cyber_anchor_3_1024.png（確定アンカー）をスタイル/パレットの手本として渡し、ドローン単体を出力させる。
// 実行: zsh -ic 'cd tools && node generate-cyber-drone-openai.mjs --n=4'
//   → _raw/cyber_drone_<i>_1024.png（人間が選定）。採用後の縮小サイズ/ゲーム内描画は実装時に決める。
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR   = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const N       = parseInt(getArg('n') || '4', 10);
const QUALITY = getArg('quality') || 'high';
const MODEL   = 'gpt-image-1';
const REF     = path.join(RAW_DIR, getArg('ref') || 'cyber_anchor_3_1024.png');

const PROMPT = [
  'The input image is ONLY a STYLE AND PALETTE REFERENCE (a chibi pixel-art girl in a white-and-gold cyber suit).',
  'Do NOT include the girl. Output a COMPLETELY DIFFERENT, SINGLE object:',
  'a cute small ROUND hovering DRONE companion robot, shaped like a smooth EGG-ROUND ball with a tiny CHICK motif.',
  'Body: glossy WHITE shell with thin GOLD accent lines and gold trim, matching the reference outfit palette.',
  'Face: two simple round dark eyes and a tiny GOLD BEAK on the front (facing RIGHT), like a cute pet chick robot.',
  'A small warm gold hover glow or two tiny thruster sparks BELOW the body. Optionally a tiny gold antenna on top.',
  'Absolutely NO green anywhere, NO side flaps, NO ear-like panels, NO wings, NO arms, NO legs.',
  'Strictly ONE drone only, drawn LARGE so it fills most of the frame, side view facing right.',
  'Same chunky pixel-art style, bold clean outlines, bright high-contrast colors as the reference.',
  'The background MUST be FULLY TRANSPARENT (alpha) — no scenery, no ground, no shadow, no backdrop, no text, no border.',
].join(' ');

async function editImage(imagePath, prompt) {
  const form = new FormData();
  form.append('model', MODEL);
  const buf = await fs.readFile(imagePath);
  form.append('image', new Blob([buf], { type: 'image/png' }), path.basename(imagePath));
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', QUALITY);
  form.append('background', 'transparent');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `HTTP ${res.status}`);
      return Buffer.from(json.data[0].b64_json, 'base64');
    } catch (e) { lastErr = e; const w = 2500 * attempt; console.warn(`  失敗(${attempt}/3): ${e.message} ${w}ms待機...`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行）'); process.exit(1); }
  for (let i = 1; i <= N; i++) {
    console.log(`● drone 候補 ${i}/${N} 生成中...`);
    const buf = await editImage(REF, PROMPT);
    await fs.writeFile(path.join(RAW_DIR, `cyber_drone_${i}_1024.png`), buf);
    console.log(`  ✓ _raw/cyber_drone_${i}_1024.png`);
  }
  console.log('\n次: 候補を人間が見て1枚選定 → 実装時に縮小サイズを決めて images/ へコミット');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
