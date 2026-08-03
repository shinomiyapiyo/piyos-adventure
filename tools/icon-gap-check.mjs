// ─────────────────────────────────────────────────────────────────────────────
// icon-gap-check.mjs — 「ツインテールと体の隙間」に暗い背景が残っていないか実測する（2026-08-03）
//
// ⚠ユーザー指摘（2026-08-03）:「icon_c_chick が最も近いが、**ツインテールと体の隙間の背景が暗い**。
//   髪やひよこを消さないように、周りの背景と同色にしたはず」
//   → どの候補でその処置が済んでいるかを、目視ではなく**画素で判定**する。
//
// 🛠 判定のしかた
//   ① 上辺の中央から背景の基準色を取る（＝「周りの背景」）。
//   ② 隙間の帯（左右の肩口あたり・縦は胸の高さ）を走査し、
//      **明度が基準よりはっきり暗い画素**の割合を出す。髪(ほぼ黒)は元から暗いので、
//      「黒に近い＝髪」は除外し、**中間の暗さ（＝暗い背景）**だけを数える。
//   ③ あわせて拡大した切り抜きを並べて書き出す（目でも確かめられるように）。
//
// 実行: node icon-gap-check.mjs            → _raw/_icon_gap.png ＋ 数値を標準出力
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ITEMS = [
  ['icon_c_chick', '_raw/icon_c_chick.png'],
  ['icon_c_now2',  '_raw/icon_c_now2.png'],
  ['icon_c_final', '_raw/icon_c_final.png'],
];

// 隙間の帯（1024基準）— 左右の肩口。ツインテールと胴体の間
const BANDS = [
  ['左', { left: 150, top: 560, width: 210, height: 330 }],
  ['右', { left: 664, top: 560, width: 210, height: 330 }],
];

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const results = [];
for (const [name, rel] of ITEMS) {
  const file = path.join(__dirname, rel);
  const img = sharp(file);
  const { width } = await img.metadata();
  const S = width / 1024;

  // 基準の背景色 = 上辺中央の帯
  const { data: bgRaw } = await sharp(file)
    .extract({ left: Math.round(340 * S), top: Math.round(8 * S), width: Math.round(344 * S), height: Math.round(40 * S) })
    .raw().toBuffer({ resolveWithObject: true });
  let bl = 0;
  for (let i = 0; i < bgRaw.length; i += 3) bl += lum(bgRaw[i], bgRaw[i + 1], bgRaw[i + 2]);
  const bgLum = bl / (bgRaw.length / 3);

  const per = [];
  for (const [side, b] of BANDS) {
    const { data } = await sharp(file)
      .extract({ left: Math.round(b.left * S), top: Math.round(b.top * S),
                 width: Math.round(b.width * S), height: Math.round(b.height * S) })
      .raw().toBuffer({ resolveWithObject: true });
    let dark = 0, hair = 0, total = 0;
    for (let i = 0; i < data.length; i += 3) {
      const L = lum(data[i], data[i + 1], data[i + 2]);
      total++;
      if (L < 45) hair++;                     // ほぼ黒＝髪。これは正常
      else if (L < bgLum - 45) dark++;        // 中間の暗さ＝暗いままの背景
    }
    per.push([side, (dark / total * 100), (hair / total * 100)]);
  }
  results.push({ name, bgLum, per });
  console.log(`${name.padEnd(14)} 背景の明度=${bgLum.toFixed(1)}  ` +
    per.map(([s, d, h]) => `${s}: 暗い背景 ${d.toFixed(2)}% / 髪 ${h.toFixed(1)}%`).join('  '));
}

// 目視用の拡大切り抜き（左右の帯を縦に、候補を横に）
const ZW = 210 * 2, ZH = 330 * 2, PAD = 16, LABEL = 24;
const layers = [];
for (let i = 0; i < ITEMS.length; i++) {
  const [name, rel] = ITEMS[i];
  const file = path.join(__dirname, rel);
  const { width } = await sharp(file).metadata();
  const S = width / 1024;
  const cx = i * (ZW + PAD);
  layers.push({ input: Buffer.from(`<svg width="${ZW}" height="${LABEL}">
    <text x="${ZW / 2}" y="17" font-family="Helvetica,Arial" font-size="16" font-weight="700"
          fill="#111" text-anchor="middle">${name}</text></svg>`), left: cx, top: 2 });
  for (let j = 0; j < BANDS.length; j++) {
    const b = BANDS[j][1];
    layers.push({
      input: await sharp(file).extract({ left: Math.round(b.left * S), top: Math.round(b.top * S),
        width: Math.round(b.width * S), height: Math.round(b.height * S) })
        .resize(ZW, ZH, { kernel: 'nearest' }).png().toBuffer(),
      left: cx, top: LABEL + PAD + j * (ZH + PAD),
    });
  }
}
const W = ITEMS.length * (ZW + PAD) - PAD, H = LABEL + PAD + BANDS.length * (ZH + PAD) - PAD;
const OUT = path.join(__dirname, '_raw/_icon_gap.png');
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 250, g: 250, b: 250, alpha: 1 } } })
  .composite(layers).png().toFile(OUT);
console.log(`✓ ${path.relative(ROOT, OUT)}  ${W}x${H}  （上=左の隙間 / 下=右の隙間）`);
