// ─────────────────────────────────────────────────────────────────────────────
// icon-fix-darkfringe.mjs — 背景を明るくした時に残った「暗い縁」を消す（2026-08-03）
//
// 📌 正体（ここが分かるまでに4回作り直した）
//   元絵 `icon_c.png` の背景は**暗い紺**。キャラの輪郭の画素は
//   「キャラの色」と「暗い紺」が混ざった中間色になっている（アンチエイリアス）。
//   7/31 の背景塗り替えは**純粋な背景の画素しか塗り替えなかった**ので、
//   混ざった画素は暗いまま残り、**髪のまわりに暗い縁**として見える。
//   ツインテールと体の間が暗く見えるのは、その縁が細い隙間で両側から寄って埋まっているため。
//   ＝**「隙間に背景が残っている」のではなく「縁が暗いまま」**だった。
//
// ⚠これを色だけで消そうとすると必ず失敗する（実際に3通り試して全部だめだった）
//   ・今の色で背景を選ぶ → 残った紺 rgb(24,14,39) と髪の影 rgb(31,21,40) の差が約10で分離不能。
//     広げると髪が消える（`icon_c_final.png`）。
//   ・肩から腕の黒い袖を背景と誤認 → 服が消えた（タイトル画像の実測で袖 rgb(56,48,56) ≒ 髪 rgb(64,48,64)）。
//   ・ユーザーの筆跡を色で拾う → 筆のピンクが猫耳の内側・頬とも一致し、目まで塗り潰した。
//
// ✅ やり方＝**混ざった割合ぶんだけ背景の変化を足す**
//   元の画素 = α×(元の背景) + (1-α)×(キャラの色) とみなし、
//   α を「元の背景色にどれだけ近いか」から見積もって
//       新しい画素 = 元の画素 + α×(新しい背景色 - 元の背景色)
//   とする。α=1（純粋な背景）なら新しい背景そのもの、α=0（キャラの中身）なら**1画素も動かない**。
//   ⚠**背景に接している所だけ**に限定する（RADIUS）。そうしないと髪の内側の暗い画素まで動く。
//
// 実行: node icon-fix-darkfringe.mjs --preview            （どこがどれだけ動くか）
//       node icon-fix-darkfringe.mjs --preview --apply    （_raw/icon_c_fix4.png）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const ORIG = '_raw/icon_c.png';
const SRC  = '_raw/icon_c_chick.png';
const OUT  = '_raw/icon_c_fix4.png';
const N = 1024;

const SPAN   = num('span', 63);  // 元の背景 → 髪の中間色 の距離。αの分母
const RADIUS = num('radius', 4); // 背景からこの距離までの画素だけ対象
const BGTOL  = num('bgtol', 14); // 「背景そのもの」と見なす距離

const orig = await sharp(ORIG).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const base = await sharp(SRC).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();

const rowColor = (buf, bright) => {
  const arr = new Array(N);
  for (let y = 0; y < N; y++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const x of [1, 2, 3, 4, N - 2, N - 3, N - 4, N - 5]) {
      const i = (y * N + x) * 3;
      const L = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      if (!bright || L > 90) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
    }
    arr[y] = n ? [r / n, g / n, b / n] : null;
  }
  let last = null; for (let y = 0; y < N; y++) { if (arr[y]) last = arr[y]; else arr[y] = last; }
  last = null;      for (let y = N - 1; y >= 0; y--) { if (arr[y]) last = arr[y]; else arr[y] = last; }
  return arr;
};
const oldBg = rowColor(orig, false);
const newBg = rowColor(base, true);

// ① 「もう背景になっている所」＋「塗り残しの背景」＝ 背景の地
const isBg = new Uint8Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = (y * N + x) * 3;
  const dNew = Math.hypot(base[i] - newBg[y][0], base[i + 1] - newBg[y][1], base[i + 2] - newBg[y][2]);
  const dOld = Math.hypot(base[i] - oldBg[y][0], base[i + 1] - oldBg[y][1], base[i + 2] - oldBg[y][2]);
  if (dNew <= 26 || dOld <= BGTOL) isBg[y * N + x] = 1;
}
// ② 背景の地から RADIUS 以内を対象にする
let near = new Uint8Array(isBg);
for (let g = 0; g < RADIUS; g++) {
  const nx = new Uint8Array(near);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const p = y * N + x;
    if (near[p] || near[p - 1] || near[p + 1] || near[p - N] || near[p + N]) nx[p] = 1;
  }
  near = nx;
}

// ③ 混ざった割合 α ぶんだけ、背景の変化を足す
const out = Buffer.from(base);
let moved = 0; const alphaMap = new Float32Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const p = y * N + x; if (!near[p]) continue;
  const i = p * 3;
  const [or_, og, ob] = oldBg[y], [nr, ng, nb] = newBg[y];
  const d = Math.hypot(base[i] - or_, base[i + 1] - og, base[i + 2] - ob);
  const a = Math.max(0, Math.min(1, 1 - d / SPAN));
  if (a <= 0.02) continue;
  alphaMap[p] = a; moved++;
  out[i]     = Math.max(0, Math.min(255, Math.round(base[i]     + a * (nr - or_))));
  out[i + 1] = Math.max(0, Math.min(255, Math.round(base[i + 1] + a * (ng - og))));
  out[i + 2] = Math.max(0, Math.min(255, Math.round(base[i + 2] + a * (nb - ob))));
}
console.log(`動かした画素: ${moved} (${(moved / (N * N) * 100).toFixed(2)}%)  span=${SPAN} radius=${RADIUS}`);

if (PREVIEW) {
  const ov = Buffer.from(base);
  for (let p = 0; p < N * N; p++) {
    const a = alphaMap[p]; if (a <= 0.02) continue;
    const i = p * 3;
    ov[i] = Math.round(255 * a); ov[i + 1] = Math.round(40 * a + base[i + 1] * (1 - a)); ov[i + 2] = Math.round(40 * a + base[i + 2] * (1 - a));
  }
  await sharp(ov, { raw: { width: N, height: N, channels: 3 } }).png().toFile('_raw/_icon_fix4_mask.png');
  console.log('✓ _raw/_icon_fix4_mask.png（赤いほど大きく動く＝背景の割合が高い）');
}
if (APPLY) {
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(OUT);
  console.log(`✓ ${OUT}`);
}
