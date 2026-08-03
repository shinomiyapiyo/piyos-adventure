// ─────────────────────────────────────────────────────────────────────────────
// icon-draw-rim.mjs — 左下すみを背景にした境目に、金の縁取りと黒い輪郭を描き足す（2026-08-03）
//
// ⚠ユーザー依頼（2026-08-03）:「あとは髪の毛の縁取りが（あ）れば完璧です。無理なら私が直接描き込んでみます」
//   ＝`icon-fix-corner.mjs` で背景にした区間のうち、**元からリムが無かった下側**（y>962）は
//   髪と背景がじかに接していて、他の輪郭（背景→金の縁→黒い線→髪）と作りが違う。そこを揃える。
//
// 🛠 やり方
//   ・境界 rim[y] は `icon-fix-corner.mjs` と同じ方法で出す（急に飛んだ値は捨てる）。
//   ・rim[y] から右へ **金の縁 RIMW px → 黒い輪郭 LINEW px** を置く。
//   ・⚠**階段状にする**。ドット絵なので1行ずつ斜めに動かすと「描き足した線」に見える。
//     境界を BLOCK px 単位に丸めて、他の輪郭と同じ粒に合わせる。
//   ・金の色は**その上で実測したリムの色を引き継いで**下へ向けて少し暗くする（元絵もそうなっている）。
//
// 実行: node icon-draw-rim.mjs <入力> [出力] [--preview] [--apply]
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const SRC = files[0] || '_raw/icon_clean_1c.png';
const DST = files[1] || SRC.replace(/\.png$/i, '_rim.png');
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const N = 1024;
const Y0     = num('y0', 812);
const BRIGHT = num('bright', 95);
const JUMP   = num('jump', 6);
const BLOCK  = num('block', 10);   // ドットの粒。境界をこの単位に丸めて階段にする
const RIMW   = num('rimw', 10);    // 金の縁の幅
const LINEW  = num('linew', 9);    // 黒い輪郭の幅

const d = await sharp(SRC).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const lum = (x, y) => { const i = (y * N + x) * 3; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };

// 背景の右端＝境界。行ごとに左から走査
// ⚠明るさで切ってはいけない。**金の縁も明るい**（rgb(172,138,101)=L143）ので、
//   L<95 で探すと縁を飛び越えて黒い輪郭の位置を拾う（実際にやって縁を上書きした）。
//   → **その行の背景色と違う最初の画素**を境界とする。
const bgAt = new Array(N);
for (let y = 0; y < N; y++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of [N - 3, N - 6, N - 9, N - 12]) {
    const i = (y * N + x) * 3;
    if (lum(x, y) > 90) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  bgAt[y] = n ? [r / n, g / n, b / n] : null;
}
let lastBg = null; for (let y = 0; y < N; y++) { if (bgAt[y]) lastBg = bgAt[y]; else bgAt[y] = lastBg; }
lastBg = null;      for (let y = N - 1; y >= 0; y--) { if (bgAt[y]) lastBg = bgAt[y]; else bgAt[y] = lastBg; }

const rim = new Array(N).fill(-1);
let prev = -1;
for (let y = Y0; y < N; y++) {
  const [br, bgc, bb] = bgAt[y];
  let f = -1;
  for (let x = 0; x < 300; x++) {
    const i = (y * N + x) * 3;
    if (Math.hypot(d[i] - br, d[i + 1] - bgc, d[i + 2] - bb) > 24) { f = x; break; }
  }
  if (f < 0) continue;
  if (prev >= 0 && (f < prev || f > prev + JUMP)) continue;
  rim[y] = f; prev = f;
}
const known = []; for (let y = Y0; y < N; y++) if (rim[y] >= 0) known.push(y);
for (let i = 0; i < known.length - 1; i++) {
  const a = known[i], b = known[i + 1];
  for (let y = a + 1; y < b; y++) rim[y] = Math.round(rim[a] + (rim[b] - rim[a]) * (y - a) / (b - a));
}
const firstK = known[0], lastK = known[known.length - 1];
for (let y = Y0; y < firstK; y++) rim[y] = rim[firstK];
const fitFrom = Math.max(firstK, lastK - 60);
const slope = (rim[lastK] - rim[fitFrom]) / Math.max(1, lastK - fitFrom);
for (let y = lastK + 1; y < N; y++) rim[y] = Math.round(rim[lastK] + slope * (y - lastK));

// 階段にする（BLOCK 単位に丸める）
const step = new Array(N);
for (let y = Y0; y < N; y++) {
  const by = Math.floor(y / BLOCK) * BLOCK;
  let s = 0, c = 0;
  for (let yy = by; yy < Math.min(by + BLOCK, N); yy++) if (yy >= Y0) { s += rim[yy]; c++; }
  step[y] = Math.round((c ? s / c : rim[y]) / BLOCK) * BLOCK;
}

// 金の色＝既にリムがある区間から実測して、下へ少し暗くする
const sample = (y) => {
  const x = step[y]; let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < RIMW; k++) {
    const i = ((y * N) + Math.min(N - 1, x + k)) * 3;
    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (L > 60 && L < 200 && d[i] > d[i + 2]) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  return n ? [r / n, g / n, b / n] : null;
};
let gold = null;
for (let y = 900; y <= 960 && !gold; y += 4) gold = sample(y);
if (!gold) gold = [150, 118, 88];
console.log(`金の縁の色: rgb(${gold.map(v => Math.round(v)).join(',')})  境界 y=${Y0}→x${step[Y0]} / y=1023→x${step[1023]}`);

// ⚠描き足すのは「元からリムが無かった区間」だけ。上は元絵のリムを壊さない
const DRAW_FROM = num('from', lastK + 1);
console.log(`描き足す区間: y=${DRAW_FROM}〜1023`);

const out = Buffer.from(d);
const touched = new Uint8Array(N * N);
for (let y = DRAW_FROM; y < N; y++) {
  const t = (y - DRAW_FROM) / Math.max(1, N - 1 - DRAW_FROM);
  const gr = gold[0] * (1 - 0.22 * t), gg = gold[1] * (1 - 0.22 * t), gb = gold[2] * (1 - 0.22 * t);
  const x0 = step[y];
  for (let k = 0; k < RIMW; k++) {
    const x = x0 + k; if (x >= N) break;
    const i = (y * N + x) * 3;
    out[i] = Math.round(gr); out[i + 1] = Math.round(gg); out[i + 2] = Math.round(gb);
    touched[y * N + x] = 1;
  }
  for (let k = 0; k < LINEW; k++) {
    const x = x0 + RIMW + k; if (x >= N) break;
    const i = (y * N + x) * 3;
    out[i] = 1; out[i + 1] = 1; out[i + 2] = 1;
    touched[y * N + x] = 2;
  }
}

if (PREVIEW) {
  const ov = Buffer.from(d);
  for (let p = 0; p < N * N; p++) {
    if (!touched[p]) continue; const i = p * 3;
    if (touched[p] === 1) { ov[i] = 255; ov[i + 1] = 30; ov[i + 2] = 30; }
    else { ov[i] = 30; ov[i + 1] = 120; ov[i + 2] = 255; }
  }
  await sharp(ov, { raw: { width: N, height: N, channels: 3 } }).png().toFile('_raw/_rim_draw_mask.png');
  console.log('✓ _raw/_rim_draw_mask.png（赤=金の縁 / 青=黒い輪郭）');
}
if (APPLY) {
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(DST);
  console.log(`✓ ${DST}`);
}
