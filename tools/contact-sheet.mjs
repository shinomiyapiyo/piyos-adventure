// contact-sheet.mjs — Veoフレーム連番をグリッド1枚に番号付きで並べる（コマ選定用の開発ツール）。
// 実行: node contact-sheet.mjs --dir=_raw/veo_frames_samurai_walk --out=_raw/sheet_walk.png [--step=2] [--cell=96]
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const DIR  = path.resolve(__dirname, getArg('dir') || '_raw/veo_frames_samurai_walk');
const OUTP = path.resolve(__dirname, getArg('out') || '_raw/sheet.png');
const STEP = parseInt(getArg('step') || '2', 10);   // 何フレームおきに載せるか
const CELL = parseInt(getArg('cell') || '96', 10);  // 1コマの表示サイズ(px)
const COLS = parseInt(getArg('cols') || '10', 10);

async function main() {
  const files = (await fs.readdir(DIR)).filter(f => /^f_\d+\.png$/.test(f)).sort();
  const picked = files.filter((_, i) => i % STEP === 0);
  const rows = Math.ceil(picked.length / COLS);
  const LABEL_H = 16;
  const W = COLS * CELL, H = rows * (CELL + LABEL_H);
  const comps = [];
  for (let i = 0; i < picked.length; i++) {
    const f = picked[i];
    const num = f.match(/\d+/)[0];
    const col = i % COLS, row = Math.floor(i / COLS);
    const img = await sharp(path.join(DIR, f)).resize(CELL, CELL, { fit: 'contain', background: { r: 24, g: 24, b: 32, alpha: 1 } }).png().toBuffer();
    comps.push({ input: img, left: col * CELL, top: row * (CELL + LABEL_H) });
    const label = Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="12" font-size="11" fill="#ffd700" text-anchor="middle" font-family="monospace">${num}</text></svg>`);
    comps.push({ input: label, left: col * CELL, top: row * (CELL + LABEL_H) + CELL });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 16, g: 16, b: 24, alpha: 1 } } })
    .composite(comps).png().toFile(OUTP);
  console.log(`✓ ${OUTP} (${picked.length}コマ・${COLS}列)`);
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
