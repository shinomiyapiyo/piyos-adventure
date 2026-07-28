// nn-preview.mjs — ドット絵を**ドットのまま**拡大して確認するための小道具。
// ⚠確認用の拡大に sips や普通のリサイズを使うと補間でぼやけ、「ドット絵に見えない」と
//   誤判定してしまう（1.666で実際にやらかした）。判断材料は必ず nearest で作ること。
// 使い方: node nn-preview.mjs <入力.png> <出力.png> [倍率=6]
import sharp from 'sharp';
const [, , src, out, scale] = process.argv;
const s = parseInt(scale || '6', 10);
const m = await sharp(src).metadata();
await sharp(src).resize(m.width * s, m.height * s, { kernel: 'nearest' }).png().toFile(out);
console.log(`✓ ${out} (${m.width}x${m.height} → x${s})`);
