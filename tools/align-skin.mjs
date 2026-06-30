// align-skin.mjs — 生成したスキン各コマを、対応する元プレイヤーコマの「立ち位置・高さ」に揃える。
// 各コマ独立トリムだと歩行アニメで身長/位置がブレるため、ベース(player_*)の不透明bboxへ
// 相対(フレーム比)で合わせ込む。足元(下端)＝ベース下端、左右中心＝ベース中心、身長＝ベース身長。
// 追加API生成はしない（既存 images/skin_maid_*.png を上書き）。
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.resolve(__dirname, '..', 'images');
const SIZE = 64;
const FRAMES = [
  { key: 'idle',   base: 'player_idle_v1.png' },
  { key: 'walk_1', base: 'player_walk_1.png' },
  { key: 'walk_2', base: 'player_walk_2.png' },
  { key: 'walk_3', base: 'player_walk_3.png' },
  { key: 'walk_4', base: 'player_walk_4.png' },
  { key: 'jump',   base: 'player_jump.png' },
  { key: 'fall',   base: 'player_fall.png' },
];

async function contentBBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * channels + 3] > 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height, imgW: width, imgH: height };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1, imgW: width, imgH: height };
}
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

for (const fr of FRAMES) {
  const baseFile = path.join(IMG, fr.base);
  const maidFile = path.join(IMG, `skin_maid_${fr.key}.png`);
  const bb = await contentBBox(baseFile);
  const mb = await contentBBox(maidFile);
  // ベースの立ち位置を「フレーム比」で64×64へ写像（ベース画像サイズに依存しない）
  const tH       = (bb.height / bb.imgH) * SIZE;
  const tBottom  = ((bb.top + bb.height) / bb.imgH) * SIZE;
  const tCenterX = ((bb.left + bb.width / 2) / bb.imgW) * SIZE;
  // メイドの中身をベース身長に合わせてスケール（アスペクト維持）
  const scale = tH / mb.height;
  const newW = Math.max(1, Math.round(mb.width * scale));
  const newH = Math.max(1, Math.round(tH));
  const content = await sharp(maidFile)
    .extract({ left: mb.left, top: mb.top, width: mb.width, height: mb.height })
    .resize(newW, newH, { fit: 'fill' }).png().toBuffer();
  let left = clamp(0, SIZE - newW, Math.round(tCenterX - newW / 2));
  let top  = clamp(0, SIZE - newH, Math.round(tBottom - newH));
  const out = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: content, left, top }]).png().toBuffer();
  await fs.writeFile(maidFile, out);
  console.log(`✓ skin_maid_${fr.key}: base ${bb.width}x${bb.height}@(${bb.left},${bb.top})/${bb.imgW}px → maid ${newW}x${newH}@(${left},${top})`);
}
console.log('整列完了。images/skin_maid_*.png を更新しました。');
