// ─────────────────────────────────────────────────────────────────────────────
// icon-fix-bgchannels.mjs — 塗り残しの暗い背景を、正しい背景色にする（2026-08-03）
//
// 📌 何が起きていたか
//   アイコンの元絵 `icon_c.png` は**暗い紺の背景**だった。7/31 の背景塗り替え（`icon-recolor-bg.mjs`）は
//   画像の外周からの塗り広げなので、**ツインテールと体の間の筋・左下のすみに届かず**、
//   元の暗い紺がそのまま残った。これが「隙間の背景が暗い」の正体。
//
// ⚠ここに至るまでに外した3つ（同じ失敗を繰り返さないこと）
//   1. **今の絵の色だけで背景を選ぶ** → 残った紺 rgb(24,14,39) と髪の一番暗い影 rgb(31,21,40) の
//      差が約10しかなく分離できない。広げると髪が消える（`icon_c_final.png` の実例）。
//   2. **肩から腕の黒い袖を背景と誤認** → 服が消えた。タイトル画像の実測で
//      袖 rgb(56,48,56) / 髪 rgb(64,48,64)＝正の絵でも髪と黒い衣装はほぼ同色。分けているのは輪郭線。
//   3. **ユーザーの筆跡を色で拾って塗り広げ** → 筆のピンク rgb(243,175,200) が
//      **猫耳の内側・頬の赤みとも一致**し、そこから目とまつげへ抜けた。
//
// ✅ 正解＝**「今の色」ではなく「元絵 `icon_c.png` の、その行の背景色」と比べる**
//   塗り残しの画素は `icon_c.png` から**1画素も変わっていない**ので、その行の背景色とぴったり一致する。
//   髪は色が近く見えても、行ごとの背景グラデとは一致しない。実測（2026-08-03）:
//     確実な背景（左下すみ） 距離の中央値 **1.8**（75%点 2.3）
//     確実な髪（左テール）   距離の中央値 **34.2**（25%点 23.8）
//     確実な髪（右テール）   距離の中央値 **36.4**（25%点 30.7）
//   → しきい値 12 で完全に分かれる。位置の指定も塗り広げも要らない。
//
// 実行: node icon-fix-bgchannels.mjs --preview            （マスクを確認）
//       node icon-fix-bgchannels.mjs --preview --apply    （_raw/icon_c_fix3.png を書き出す）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const ORIG = '_raw/icon_c.png';        // 暗い背景だった元絵（背景の基準はここから取る）
const SRC  = '_raw/icon_c_chick.png';  // 直す対象
const OUT  = '_raw/icon_c_fix3.png';
const N = 1024;
const TOL = num('tol', 12);            // 元の背景色からのRGB距離。背景=1.8 / 髪=34 なので12で安全

const orig = await sharp(ORIG).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const base = await sharp(SRC).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();

// 行ごとの色を、左右の端から取る（端は確実に背景）
const rowColor = (buf, bright) => {
  const arr = new Array(N);
  for (let y = 0; y < N; y++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const x of [1, 2, 3, 4, N - 2, N - 3, N - 4, N - 5]) {
      const i = (y * N + x) * 3;
      const L = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      if (bright ? L > 90 : true) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
    }
    arr[y] = n ? [r / n, g / n, b / n] : null;
  }
  let last = null; for (let y = 0; y < N; y++) { if (arr[y]) last = arr[y]; else arr[y] = last; }
  last = null;      for (let y = N - 1; y >= 0; y--) { if (arr[y]) last = arr[y]; else arr[y] = last; }
  return arr;
};

const oldBg = rowColor(orig, false);   // 元絵の背景（暗い紺のグラデ）
const newBg = rowColor(base, true);    // 今の背景（オレンジ→サーモンのグラデ）

const mask = new Uint8Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = (y * N + x) * 3;
  const [r, g, b] = oldBg[y];
  if (Math.hypot(base[i] - r, base[i + 1] - g, base[i + 2] - b) <= TOL) mask[y * N + x] = 1;
}
const n = mask.reduce((a, b) => a + b, 0);
console.log(`塗り残しの背景: ${n} 画素 (${(n / (N * N) * 100).toFixed(2)}%)  tol=${TOL}`);

const out = Buffer.from(base);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const p = y * N + x; if (!mask[p]) continue;
  const i = p * 3, [r, g, b] = newBg[y];
  out[i] = r; out[i + 1] = g; out[i + 2] = b;
}

if (PREVIEW) {
  const ov = Buffer.from(base);
  for (let p = 0; p < N * N; p++) if (mask[p]) { const i = p * 3; ov[i] = 255; ov[i + 1] = 30; ov[i + 2] = 30; }
  await sharp(ov, { raw: { width: N, height: N, channels: 3 } }).png().toFile('_raw/_icon_fix3_mask.png');
  console.log('✓ _raw/_icon_fix3_mask.png（赤=置き換える）');
}
if (APPLY) {
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(OUT);
  console.log(`✓ ${OUT}`);
}
