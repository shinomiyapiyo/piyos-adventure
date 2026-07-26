// ─────────────────────────────────────────────────────────────────────────────
// harden-icon-alpha.mjs
// gpt-image-1 の透過モードは**白っぽい部分をうっすら半透明にする**癖があり、そのまま32pxへ
// 縮小するとアルファが平均化されて更に薄くなる。白背景では気づかないが、図鑑の暗いカード
// (#26264a) の上では背景が透けて「白いはずの部分が白く見えない」（1.577でユーザー指摘＝ショートケーキの生クリーム）。
//
// 対策: **アルファを2値化**する。1024pxの生成元で一度しきい値を掛けてから縮小し、縮小後にもう一度掛ける。
// 既存の手描きアイコン（icon_barrier.png / icon_full_charge.png）は半透明画素ゼロなので、
// 2値化したほうがドット絵として画風も揃う。
//
// 実行: node harden-icon-alpha.mjs            … tools/_raw/gen_*.png から作り直す
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const TARGETS = ['icon_shortcake.png', 'icon_ug_manju.png', 'icon_ug_elixir.png', 'icon_ug_blessing.png'];
const SRC_T = 128;   // 生成元(1024px)のしきい値。これ未満は背景とみなして落とす
const DST_T = 96;    // 縮小後(32px)のしきい値。低めにして輪郭の細りを防ぐ

// アルファを0か255に振り分ける（RGBはそのまま＝色は変えない）
async function binarizeAlpha(buf, threshold) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= threshold ? 255 : 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

for (const out of TARGETS) {
  const src = path.join(RAW_DIR, 'gen_' + out);
  try { await fs.access(src); } catch { console.log(`− ${out}: 生成元が無いのでスキップ`); continue; }
  const raw = await fs.readFile(src);
  const hardSrc = await binarizeAlpha(raw, SRC_T);                       // ①生成元で2値化＝白の抜けを塞ぐ
  const small = await sharp(hardSrc).trim({ threshold: 10 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const final = await binarizeAlpha(small, DST_T);                       // ②縮小で生じた中間アルファも潰す
  await fs.writeFile(path.join(IMAGES_DIR, out), final);
  const { data, info } = await sharp(final).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let semi = 0; for (let i = 3; i < data.length; i += 4) if (data[i] !== 0 && data[i] !== 255) semi++;
  console.log(`✓ ${out}  半透明画素=${semi}（0が正）`);
}
