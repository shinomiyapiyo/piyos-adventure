// icon-grid.mjs — アイコンに座標グリッドを重ねて、直す範囲を目で特定する（2026-08-03・調査用）
// 実行: node icon-grid.mjs _raw/icon_c_chick.png [出力]
import sharp from 'sharp';
import path from 'node:path';

const SRC = process.argv[2] || '_raw/icon_c_chick.png';
const DST = process.argv[3] || '_raw/_icon_grid.png';
const VIEW = 1024;

const base = await sharp(SRC).resize(VIEW, VIEW, { kernel: 'nearest' }).png().toBuffer();
let g = '';
for (let v = 0; v <= 1024; v += 64) {
  const p = v / 1024 * VIEW;
  const major = v % 256 === 0;
  const col = major ? '#00e5ff' : '#00e5ff55';
  const wd = major ? 2 : 1;
  g += `<line x1="${p}" y1="0" x2="${p}" y2="${VIEW}" stroke="${col}" stroke-width="${wd}"/>`;
  g += `<line x1="0" y1="${p}" x2="${VIEW}" y2="${p}" stroke="${col}" stroke-width="${wd}"/>`;
  if (major) {
    g += `<text x="${p + 4}" y="16" font-family="Helvetica" font-size="14" fill="#00e5ff">${v}</text>`;
    g += `<text x="4" y="${p + 16}" font-family="Helvetica" font-size="14" fill="#00e5ff">${v}</text>`;
  }
}
await sharp(base).composite([{ input: Buffer.from(`<svg width="${VIEW}" height="${VIEW}">${g}</svg>`) }])
  .png().toFile(DST);
console.log(`✓ ${DST}（座標は1024基準）`);
