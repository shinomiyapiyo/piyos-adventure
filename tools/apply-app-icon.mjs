// ─────────────────────────────────────────────────────────────────────────────
// apply-app-icon.mjs — 新しいアプリアイコンを全スロットへ配る（2026-07-31）
//
// ⚠**`npx cap sync` はアイコンを作り直さない。** ネイティブのアイコンは静的ファイルなので、
//   ここで全部書き出す（`@capacitor/assets` は devDependencies に入っていないため手動でやる）。
//
// 📍 配る先（すべて 1:1・iOS はアルファ禁止）
//   resources/icon.png                     … アセット生成の元（`logo.png` はスプラッシュ用なので触らない）
//   images/icon-1024.png / icon-512.png    … Web/ウォール用（index.html の apple-touch-icon は 512）
//   wall/images/icon-512.png / icon-192.png… 移行ウォールの manifest 用
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png  … iOS 本体（1024）
//   android/app/src/main/res/mipmap-*/     … ic_launcher / _round / _foreground / _background
//
// ⚠Android の作り（`ic_launcher.xml` を実際に読んで確認・2026-07-31）
//   `<inset android:inset="16.7%">` で前景と背景を 108dp の中央 66.6%（=マスクの見える範囲）へ収める。
//   ＝**元絵は全面に描いてよい。切られるのは正方形の四隅だけ**。余白を足す加工は不要。
//   `ic_launcher_round.png` は円マスク（四隅を透明に）。`_background` は単色。
//
// 実行: node apply-app-icon.mjs _raw/icon_co_a.png            （確認だけ）
//       node apply-app-icon.mjs _raw/icon_co_a.png --apply    （実際に書き込む・旧ファイルは _raw/icon_backup/ へ）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const BACKUP    = path.join(__dirname, '_raw', 'icon_backup');
const args  = process.argv.slice(2);
const SRC   = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
if (!SRC) { console.error('使い方: node apply-app-icon.mjs <1024pxの正方形PNG> [--apply]'); process.exit(1); }

const src = path.resolve(process.cwd(), SRC);
const meta = await sharp(src).metadata();
if (meta.width !== meta.height) { console.error(`✗ 正方形ではない: ${meta.width}x${meta.height}`); process.exit(1); }
console.log(`元絵: ${path.relative(ROOT, src)}  ${meta.width}x${meta.height}  alpha=${!!meta.hasAlpha}`);

// 背景レイヤー用の単色＝元絵の四隅の平均（オレンジの縁の色）
const { data: corner } = await sharp(src).resize(3, 3, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
const pick = (i) => ({ r: corner[i * 3], g: corner[i * 3 + 1], b: corner[i * 3 + 2] });
const cs = [pick(0), pick(2), pick(6), pick(8)];
const bgColor = {
  r: Math.round(cs.reduce((a, c) => a + c.r, 0) / 4),
  g: Math.round(cs.reduce((a, c) => a + c.g, 0) / 4),
  b: Math.round(cs.reduce((a, c) => a + c.b, 0) / 4),
};
console.log(`背景レイヤーの単色: rgb(${bgColor.r},${bgColor.g},${bgColor.b})`);

const DENS = [['ldpi', 36, 81], ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]];

const jobs = [];
const opaque = (size) => sharp(src).resize(size, size, { fit: 'fill', kernel: 'nearest' }).removeAlpha().png({ compressionLevel: 9, effort: 10 });
const withAlpha = (size) => sharp(src).resize(size, size, { fit: 'fill', kernel: 'nearest' }).ensureAlpha().png({ compressionLevel: 9, effort: 10 });

jobs.push(['resources/icon.png', () => opaque(1024).toBuffer()]);
jobs.push(['images/icon-1024.png', () => opaque(1024).toBuffer()]);
jobs.push(['images/icon-512.png', () => opaque(512).toBuffer()]);
jobs.push(['wall/images/icon-512.png', () => opaque(512).toBuffer()]);
jobs.push(['wall/images/icon-192.png', () => opaque(192).toBuffer()]);
jobs.push(['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', () => opaque(1024).toBuffer()]);

for (const [d, legacy, adaptive] of DENS) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  jobs.push([`${dir}/ic_launcher.png`, () => withAlpha(legacy).toBuffer()]);
  jobs.push([`${dir}/ic_launcher_round.png`, async () => {
    // ⚠`joinChannel` で丸マスクを足す書き方は**アルファが落ちる**（2026-08-04に実測・四隅が透明にならず
    //   ch=3 で出力された）。`composite` の `dest-in` で抜くこと。出力後に αmin=0 を必ず確認する。
    const base = await sharp(src).resize(legacy, legacy, { fit: 'fill', kernel: 'nearest' }).ensureAlpha().png().toBuffer();
    const circle = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="#fff"/></svg>`);
    return sharp(base).composite([{ input: circle, blend: 'dest-in' }])
      .png({ compressionLevel: 9, effort: 10 }).toBuffer();
  }]);
  jobs.push([`${dir}/ic_launcher_foreground.png`, () => opaque(adaptive).toBuffer()]);
  jobs.push([`${dir}/ic_launcher_background.png`, async () =>
    sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: { ...bgColor, alpha: 1 } } })
      .png({ compressionLevel: 9, effort: 10 }).toBuffer()]);
}

if (APPLY) await fs.mkdir(BACKUP, { recursive: true });
let written = 0, missing = 0;
for (const [rel, make] of jobs) {
  const abs = path.join(ROOT, rel);
  let exists = true;
  try { await fs.access(abs); } catch { exists = false; missing++; }
  if (!APPLY) { console.log(`  ${exists ? '書き換え' : '⚠新規  '} ${rel}`); continue; }
  if (exists) {
    const bak = path.join(BACKUP, rel.replace(/[\\/]/g, '__'));
    await fs.copyFile(abs, bak);
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, await make());
  written++;
}
console.log(APPLY
  ? `✓ ${written}ファイルを書き換えた（旧ファイルは tools/_raw/icon_backup/ へ退避）`
  : `（確認のみ）対象 ${jobs.length}ファイル／存在しないもの ${missing}件。--apply で書き込む`);
