// ─────────────────────────────────────────────────────────────────────────────
// icon-fix-corner.mjs — 左下すみに残った暗い所を背景色にする（2026-08-03）
//
// ⚠ユーザー指摘（2026-08-03）:「一番左下だけ黒い。ここは髪の外側で背景」
//
// 📌 なぜ塗り広げでは駄目か（実測して確認）
//   すみの色 rgb(30,21,40) と髪 rgb(36,24,44) は**ほぼ同じ**。
//   単純な塗り広げは左のツインテール全部（画面の8.0%）を巻き込む。
//
// ✅ 使える手がかり＝**金色のリムライト**。ぴよ氏の輪郭には金の縁取りがあり、
//   その**左側が背景・右側が髪**。行ごとに左から走査して最初の明るい画素を見つければ境界が出る。
//   実測（icon_clean_1.png）: y=820→x15 / y=880→x18 / y=900→x29 / y=920→x34 / y=940→x43 / y=960→x55
//   と規則的に右へ動く。⚠y>975 でリムが途切れるので、そこから下は**傾きを延長**して補う。
//
// 実行: node icon-fix-corner.mjs <入力> [出力] [--preview] [--apply]
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const SRC = files[0] || '_raw/icon_clean_1.png';
const DST = files[1] || SRC.replace(/\.png$/i, '_c.png');
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const N = 1024;
const Y0    = num('y0', 812);    // リムが始まる行。ここから下だけ直す
const YEND  = num('yend', 975);  // ここから下はリムが途切れるので延長で補う
const BRIGHT = num('bright', 95);
const PAD   = num('pad', 0);     // 境界をこのぶん左へ寄せる（保険）

const d = await sharp(SRC).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const lum = (x, y) => { const i = (y * N + x) * 3; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };

// 行ごとにリムの位置を出す
// ⚠**前の行から急に飛んだ値は捨てる。** 髪の内側にも金色の筋があり、リムが1行でも途切れると
//   そちらを拾って一気に右（x=142）へ飛ぶ。それを延長の基準にすると**髪を削る**（実際にやってNG）。
const JUMP = num('jump', 6);   // 1行あたり右へ動いてよい上限
const rim = new Array(N).fill(-1);
let prev = -1;
for (let y = Y0; y < N; y++) {
  let f = -1;
  for (let x = 0; x < 300; x++) if (lum(x, y) >= BRIGHT) { f = x; break; }
  if (f < 0) continue;
  if (prev >= 0 && (f < prev || f > prev + JUMP)) continue;  // 逆行・飛びは不採用
  rim[y] = f; prev = f;
}
// 採れなかった行は、前後の採れた行から直線で補う
const known = [];
for (let y = Y0; y < N; y++) if (rim[y] >= 0) known.push(y);
if (known.length < 2) { console.error('✗ リムを追えなかった'); process.exit(1); }
const first = known[0], lastK = known[known.length - 1];
for (let i = 0; i < known.length - 1; i++) {
  const a = known[i], b = known[i + 1];
  for (let y = a + 1; y < b; y++) rim[y] = Math.round(rim[a] + (rim[b] - rim[a]) * (y - a) / (b - a));
}
for (let y = Y0; y < first; y++) rim[y] = rim[first];
// 末尾は**採れた区間の傾き**で延長する（誤検出を含めない）
const fitFrom = Math.max(first, lastK - 60);
const slope = (rim[lastK] - rim[fitFrom]) / Math.max(1, lastK - fitFrom);
for (let y = lastK + 1; y < N; y++) rim[y] = Math.round(rim[lastK] + slope * (y - lastK));
console.log(`境界: y=${Y0}→x${rim[Y0]}  リムを追えた最終行 y=${lastK}→x${rim[lastK]}  y=1023→x${rim[1023]}（傾き ${slope.toFixed(3)}）`);

// 置く色＝そのYの背景。右辺から実測する（右側は正しく明るい）
const bgAt = new Array(N);
for (let y = 0; y < N; y++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of [N - 3, N - 6, N - 9, N - 12]) {
    const i = (y * N + x) * 3;
    if (lum(x, y) > 90) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  bgAt[y] = n ? [r / n, g / n, b / n] : null;
}
let last = null; for (let y = 0; y < N; y++) { if (bgAt[y]) last = bgAt[y]; else bgAt[y] = last; }
last = null;      for (let y = N - 1; y >= 0; y--) { if (bgAt[y]) last = bgAt[y]; else bgAt[y] = last; }

const mask = new Uint8Array(N * N);
for (let y = Y0; y < N; y++) {
  const xmax = Math.max(0, rim[y] - PAD);
  for (let x = 0; x < xmax; x++) mask[y * N + x] = 1;
}
const n = mask.reduce((a, b) => a + b, 0);
console.log(`直す画素: ${n} (${(n / (N * N) * 100).toFixed(2)}%)`);

const out = Buffer.from(d);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const p = y * N + x; if (!mask[p]) continue;
  const i = p * 3, [r, g, b] = bgAt[y];
  out[i] = r; out[i + 1] = g; out[i + 2] = b;
}

if (PREVIEW) {
  const ov = Buffer.from(d);
  for (let p = 0; p < N * N; p++) if (mask[p]) { const i = p * 3; ov[i] = 255; ov[i + 1] = 30; ov[i + 2] = 30; }
  await sharp(ov, { raw: { width: N, height: N, channels: 3 } }).png().toFile('_raw/_corner_fix_mask.png');
  console.log('✓ _raw/_corner_fix_mask.png');
}
if (APPLY) {
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(DST);
  console.log(`✓ ${DST}`);
}
