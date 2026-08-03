// ─────────────────────────────────────────────────────────────────────────────
// icon-mockup.mjs — アプリアイコンの「見本」を1枚の画像にする（2026-07-31）
//
// ⚠ユーザー指示（2026-07-31）:「**見本を出してくれないと判断できない**」
//   ＝マスクや倍率の検品シート（`icon-preview.mjs`）ではなく、
//   **ホーム画面に置いた状態**で見比べられる絵を出す。
//
// 出すもの: 明るい壁紙(iOS風の角丸) と 暗い壁紙(Androidの円マスク) に、
//           他アプリ（グレーのダミー）と並べて実寸60pxで置いた見本 ＋ 120/60/40px の並び。
//
// 使い方: node icon-mockup.mjs <候補1> <候補2> … [--out=_raw/sheet_icon_mockup.png]
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args  = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const getArg = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const OUT = path.resolve(__dirname, getArg('out', '_raw/sheet_icon_mockup.png'));
const TITLES = (getArg('titles', '') || '').split('|').filter(Boolean);
if (!files.length) { console.error('使い方: node icon-mockup.mjs <候補…> [--titles="①現行|②a|③a+色"]'); process.exit(1); }

const COLW = 386, GAP = 10, M = 12;
const W = M * 2 + files.length * COLW + (files.length - 1) * GAP;
const TITLE_H = 64;
const PANEL_H = 152, SIZE_H = 150;
const H = TITLE_H + PANEL_H * 2 + 14 + SIZE_H + M;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const colX = (c) => M + c * (COLW + GAP);

// ── 下地・パネル・文字・ダミーアイコンは1枚のSVGで描く ──
let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="lw" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#cfe3ff"/><stop offset="60%" stop-color="#ffe2ef"/><stop offset="100%" stop-color="#fff3d6"/>
  </linearGradient>
  <linearGradient id="dw" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#10131d"/><stop offset="55%" stop-color="#241a2e"/><stop offset="100%" stop-color="#0d1016"/>
  </linearGradient>
</defs>
<rect width="100%" height="100%" fill="#14121a"/>
<text x="${M}" y="26" font-size="17" font-weight="800" fill="#ffffff" font-family="Hiragino Sans, sans-serif">アプリアイコン 見本 — ホーム画面に置いた状態（アイコンは実寸60px）</text>
<text x="${M}" y="47" font-size="11" fill="#9aa7b8" font-family="Hiragino Sans, sans-serif">上段＝明るい壁紙（iOS風の角丸）／下段＝暗い壁紙（Androidの円マスク）／最下段＝120・60・40px の並び</text>`;

const dummyLabels = [['カメラ', 'メモ'], ['設定', '時計']];
for (let c = 0; c < files.length; c++) {
  const x = colX(c);
  svg += `<text x="${x}" y="${TITLE_H - 2}" font-size="13" font-weight="800" fill="#ffd76a" font-family="Hiragino Sans, sans-serif">${esc(TITLES[c] || path.basename(files[c]))}</text>`;
  for (let p = 0; p < 2; p++) {
    const py = TITLE_H + 6 + p * (PANEL_H - 4);
    const light = p === 0;
    svg += `<rect x="${x}" y="${py}" width="${COLW}" height="${PANEL_H - 16}" rx="16" fill="url(#${light ? 'lw' : 'dw'})"/>`;
    svg += `<text x="${x + 14}" y="${py + 22}" font-size="10.5" fill="${light ? '#334455' : '#ccd4e6'}" font-family="Hiragino Sans, sans-serif">${light ? '明るい壁紙・iOS風の角丸' : '暗い壁紙・Androidの円マスク'}</text>`;
    const iy = py + 34;
    const slots = [x + 26, x + 116, x + 206, x + 296];
    // ダミー（0番目と2番目, 3番目）
    for (const [si, lbl] of [[0, dummyLabels[p][0]], [2, dummyLabels[p][1]], [3, p === 0 ? '天気' : '電話']]) {
      const sx = slots[si];
      svg += light
        ? `<rect x="${sx}" y="${iy}" width="60" height="60" rx="${p === 0 ? 14 : 30}" fill="#8a92a3"/>`
        : `<circle cx="${sx + 30}" cy="${iy + 30}" r="30" fill="#6f7787"/>`;
      svg += `<text x="${sx + 30}" y="${iy + 76}" font-size="9.5" text-anchor="middle" fill="${light ? '#223' : '#e8ecf8'}" font-family="Hiragino Sans, sans-serif">${esc(lbl)}</text>`;
    }
    svg += `<text x="${slots[1] + 30}" y="${iy + 76}" font-size="9.5" text-anchor="middle" fill="${light ? '#223' : '#e8ecf8'}" font-family="Hiragino Sans, sans-serif" font-weight="700">ぴよ氏の冒険</text>`;
  }
  const sy = TITLE_H + 6 + 2 * (PANEL_H - 4) + 16;
  svg += `<text x="${x}" y="${sy - 4}" font-size="10.5" fill="#9aa7b8" font-family="Hiragino Sans, sans-serif">120 / 60 / 40px</text>`;
}
svg += `</svg>`;

const comps = [];
const rounded = async (file, size, radiusPct) => {
  const base = await sharp(file).resize(size, size, { fit: 'fill', kernel: 'nearest' }).removeAlpha().raw().toBuffer();
  const r = Math.round(size * radiusPct);
  const m = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  return sharp(base, { raw: { width: size, height: size, channels: 3 } })
    .joinChannel(await sharp(m).extractChannel(0).toBuffer()).png().toBuffer();
};
const circled = async (file, size) => {
  const base = await sharp(file).resize(size, size, { fit: 'fill', kernel: 'nearest' }).removeAlpha().raw().toBuffer();
  const m = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(base, { raw: { width: size, height: size, channels: 3 } })
    .joinChannel(await sharp(m).extractChannel(0).toBuffer()).png().toBuffer();
};

for (let c = 0; c < files.length; c++) {
  const f = path.resolve(process.cwd(), files[c]);
  const x = colX(c);
  const ourX = x + 116;
  // 明るい壁紙（角丸）
  comps.push({ input: await rounded(f, 60, 0.23), left: ourX, top: TITLE_H + 6 + 34 });
  // 暗い壁紙（円）
  comps.push({ input: await circled(f, 60), left: ourX, top: TITLE_H + 6 + (PANEL_H - 4) + 34 });
  // サイズ並び
  const sy = TITLE_H + 6 + 2 * (PANEL_H - 4) + 16;
  comps.push({ input: await rounded(f, 120, 0.23), left: x + 6, top: sy });
  comps.push({ input: await rounded(f, 60, 0.23), left: x + 140, top: sy + 60 });
  comps.push({ input: await rounded(f, 40, 0.23), left: x + 212, top: sy + 80 });
}

await sharp(Buffer.from(svg)).composite(comps).png().toFile(OUT);
console.log(`✓ ${path.relative(path.resolve(__dirname, '..'), OUT)}  (${W}x${H} / ${files.length}案)`);
