// ─────────────────────────────────────────────────────────────────────────────
// icon-apply-userpaint.mjs — ユーザーがピンクで大雑把に指した範囲を、背景の色にする（2026-08-03）
//
// ⚠経緯（ここを外して2度作り直しになった。次に触る人は必ず読むこと）
//   ・アイコンの元絵 `icon_c.png` は**暗い紺の背景**だった。7/31 の背景塗り替え（`icon-recolor-bg.mjs`）は
//     画像の外周からの塗り広げなので、**ツインテールと体の間の細い筋・左下のすみに届かず、
//     元の暗い紺 rgb(24,14,41) が残った**。これが「隙間の背景が暗い」の正体。
//   ・⚠**色だけでは選べない。** 残った紺 rgb(24,14,39) と**髪の一番暗い影 rgb(31,21,40) の差は約10**。
//     色で広げると髪へ漏れる（`icon_c_final.png` で左のツインテールが消えた実例）。
//   ・⚠**肩から腕の黒い袖（パフスリーブ）は背景ではない。** タイトル画像の実測で
//     袖 rgb(56,48,56) / 髪 rgb(64,48,64)＝**正の絵でも髪と黒い衣装はほぼ同色**で、
//     分けているのは黒い輪郭線。ここを背景色にすると**服が消える**（一度やってNGを出した）。
//
// 🛠 だからこうする＝**「どこを」はユーザーの塗り、「どの画素を」は色で決める**
//   ① ユーザーがピンクで塗った画像との差分で**大まかな範囲**を作る（多少はみ出していてよい）。
//   ② その範囲の中で、**元の暗い紺に近い画素だけ**を置き換える。
//      範囲の外へは絶対に出ないので、袖にも髪にも波及しない。
//   ③ 置く色＝**その高さの背景（左右の外側から実測した縦グラデ）**。ベタ塗りにしないので境目が出ない。
//
// 実行: node icon-apply-userpaint.mjs --preview      （マスクを見る）
//       node icon-apply-userpaint.mjs --apply        （_raw/icon_c_fix2.png を書き出す）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const BASE  = '_raw/icon_c_chick.png';                 // 元絵
const PAINT = '_raw/_user_ref2.png';                   // ユーザーがピンクで塗ったもの（heicから変換）
const OUT   = '_raw/icon_c_fix2.png';

const TOL   = num('tol', 44);   // 元の暗い紺からのRGB距離。これ以内なら「塗り残しの背景」
const GROW  = num('grow', 2);   // ユーザーの塗り範囲を少し広げる（350pxの絵からの拡大ぶれを吸収）
const OLDBG = [24, 14, 41];     // icon_c.png の元の背景色（実測）

const N = 1024;
const base  = await sharp(BASE).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const paint = await sharp(PAINT).resize(N, N, { kernel: 'nearest' }).removeAlpha().raw().toBuffer();

// ① ユーザーが塗った大まかな範囲
// ⚠差分では取れない（350pxの絵を拡大しているので輪郭が全部ずれて拾われる）。
//   **筆の色そのもの** rgb(243,175,200) で拾う。背景のサーモン rgb(254,150,131) とは青成分が大きく違うので分かれる。
const PAINT_RGB = [243, 175, 200], PAINT_TOL = num('ptol', 40);
let region = new Uint8Array(N * N);
for (let p = 0; p < N * N; p++) {
  const i = p * 3;
  if (Math.hypot(paint[i] - PAINT_RGB[0], paint[i + 1] - PAINT_RGB[1], paint[i + 2] - PAINT_RGB[2]) <= PAINT_TOL) region[p] = 1;
}
// 少し太らせる
for (let g = 0; g < GROW; g++) {
  const nx = new Uint8Array(region);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const p = y * N + x;
    if (region[p] || region[p - 1] || region[p + 1] || region[p - N] || region[p + N]) nx[p] = 1;
  }
  region = nx;
}
const regionN = region.reduce((a, b) => a + b, 0);

// ② 範囲の中の「暗い画素」だけ
// ⚠元の紺 rgb(24,14,41) との厳密な色一致では取りこぼす。筋の中の画素は rgb(55,43,59) 等、
//   紺と髪の中間に散っているため。**どこを直すかはユーザーが塗って決めている**ので、
//   ここでは範囲の中の暗い画素をまとめて背景にする。
//   明るさで切るのは、筆の色 rgb(243,175,200) が**猫耳の内側のピンクや頬の赤みとも一致する**ため
//   （範囲に肌や耳が混ざる）。明るい画素を外せばそれらは触らずに済む。
const DARK = num('dark', 95);
const seed = new Uint8Array(N * N);
for (let p = 0; p < N * N; p++) {
  if (!region[p]) continue;
  const i = p * 3;
  if (0.2126 * base[i] + 0.7152 * base[i + 1] + 0.0722 * base[i + 2] < DARK) seed[p] = 1;
}

// ②-b 種から「黒い輪郭線を越えない」塗り広げで、囲まれた領域を丸ごと埋める
// ⚠これが要。筆跡の形のまま塗ると**輪郭線を無視して髪の上を横切る**ので、
//   ひと目で「後から塗った」と分かる不自然さが出る（一度そのまま出してNGをもらった）。
//   ドット絵は要素が黒線で囲まれているので、線で止めれば領域の形が絵に馴染む。
// ⚠塗り広げは**必ず作業範囲で囲う**。ユーザーの塗りは領域を閉じていない（「だいたいこの辺り」の指示）ので、
//   枠なしで広げると隙間から髪へ抜けて画面の3割が置き換わる（実測30.61%）。
//   枠＝ユーザーの塗りを LIMIT px 太らせたもの。指した場所の周りだけで完結させる。
const LIMIT = num('limit', 34);
let limit = new Uint8Array(region);
for (let g = 0; g < LIMIT; g++) {
  const nx = new Uint8Array(limit);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const p = y * N + x;
    if (limit[p] || limit[p - 1] || limit[p + 1] || limit[p - N] || limit[p + N]) nx[p] = 1;
  }
  limit = nx;
}
const LINE_MAX = num('line', 22);   // これより暗い＝黒い輪郭線。越えない
const lumOf = (i) => 0.2126 * base[i] + 0.7152 * base[i + 1] + 0.0722 * base[i + 2];
const passable = (p) => { if (!limit[p]) return false; const L = lumOf(p * 3); return L >= LINE_MAX && L < DARK; };
const mask = new Uint8Array(N * N);
const st = [];
for (let p = 0; p < N * N; p++) if (seed[p] && passable(p)) st.push(p % N, (p / N) | 0);
while (st.length) {
  const y = st.pop(), x = st.pop();
  if (x < 0 || y < 0 || x >= N || y >= N) continue;
  const p = y * N + x;
  if (mask[p] || !passable(p)) continue;
  mask[p] = 1;
  st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}
const maskN = mask.reduce((a, b) => a + b, 0);
console.log(`ユーザーの塗り範囲: ${regionN} 画素 → そのうち置き換える: ${maskN} 画素 (${(maskN / (N * N) * 100).toFixed(2)}%)`);

// ③ 置く色＝そのYでの背景（外側から実測した縦グラデ）
const bgAt = new Array(N);
for (let y = 0; y < N; y++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const x of [2, 5, 8, 11, N - 3, N - 6, N - 9, N - 12]) {
    const i = (y * N + x) * 3;
    if (0.2126 * base[i] + 0.7152 * base[i + 1] + 0.0722 * base[i + 2] > 90) { r += base[i]; g += base[i + 1]; b += base[i + 2]; n++; }
  }
  bgAt[y] = n ? [r / n, g / n, b / n] : null;
}
let last = null; for (let y = 0; y < N; y++) { if (bgAt[y]) last = bgAt[y]; else bgAt[y] = last; }
last = null;      for (let y = N - 1; y >= 0; y--) { if (bgAt[y]) last = bgAt[y]; else bgAt[y] = last; }

const out = Buffer.from(base);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const p = y * N + x; if (!mask[p]) continue;
  const i = p * 3, [r, g, b] = bgAt[y];
  out[i] = r; out[i + 1] = g; out[i + 2] = b;
}

if (PREVIEW) {
  const ov = Buffer.from(base);
  for (let p = 0; p < N * N; p++) {
    const i = p * 3;
    if (mask[p]) { ov[i] = 255; ov[i + 1] = 30; ov[i + 2] = 30; }        // 赤＝実際に置き換える
    else if (region[p]) { ov[i] = 0; ov[i + 1] = 190; ov[i + 2] = 255; } // 水色＝塗り範囲だが色が違うので触らない
  }
  await sharp(ov, { raw: { width: N, height: N, channels: 3 } }).png().toFile('_raw/_icon_fix2_mask.png');
  console.log('✓ _raw/_icon_fix2_mask.png（赤=置き換える / 水色=範囲内だが触らない）');
}
if (APPLY) {
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(OUT);
  console.log(`✓ ${OUT}`);
}
