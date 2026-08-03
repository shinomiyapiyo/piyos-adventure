// ─────────────────────────────────────────────────────────────────────────────
// icon-fix-darkbg.mjs — 背景なのに暗いまま残った画素を、正しい背景色にする（2026-08-03・これが正解）
//
// 📌 本当の原因（5回作り直してやっと分かった）
//   7/31 の `icon-recolor-bg.mjs` は仕様として
//   「**色相と彩度だけ差し替え、明るさの構造は元のまま**」にしていた（キラキラや放射を残すため）。
//   ところが元の背景は**キャラの周りが暗い**絵だったので、その暗さがそのまま残り、
//   ツインテールと体の間だけ**暖色のまま極端に暗い**画素になった。
//   ＝「隙間に古い背景が残っている」のでも「縁が暗い」のでもなく、**背景が暗いまま塗り替えられていた**。
//
// ✅ 見分け方＝**色相**。実測（2026-08-03）:
//     隙間の画素 rgb(68,47,50) … R>G>B の**暖色**＝背景を暗くしたもの
//     髪の中間色 rgb(64,51,69) … B>R の**紫**＝キャラ
//   背景色 newBg[y] の定数倍（k×newBg）で表せて残差が小さければ「暗いだけの背景」。
//   髪は紫なので、暖色のグラデの定数倍では表せず残差が大きい＝引っかからない。
//
// ⚠これより前に試して全部だめだった方法（繰り返さないこと）
//   ・今の色で背景を選ぶ → 残った紺と髪の影の差が約10で分離不能。髪が消える（`icon_c_final.png`）。
//   ・肩から腕の黒い袖を背景と誤認 → 服が消えた（タイトル画像実測: 袖 rgb(56,48,56) ≒ 髪 rgb(64,48,64)）。
//   ・ユーザーの筆跡を色で拾って塗り広げ → 筆のピンクが猫耳・頬とも一致し目まで塗った。
//   ・輪郭線で止める塗り広げ → 隙間が閉じていないので髪へ抜ける（画面の30%が置換）。
//   ・混色の割り戻し → 髪の中まで届いて白茶けた。
//
// 実行: node icon-fix-darkbg.mjs --preview            （どこを直すか）
//       node icon-fix-darkbg.mjs --preview --apply    （_raw/icon_c_fix5.png）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const APPLY = args.includes('--apply');
const PREVIEW = args.includes('--preview');

const ORIG = '_raw/icon_c.png';
const SRC  = '_raw/icon_c_chick.png';
const OUT  = '_raw/icon_c_fix5.png';
const N = 1024;

const RESID = num('resid', 20);   // 背景色の定数倍からのずれ。これ以内なら「暗いだけの背景」
const KMAX  = num('kmax', 0.97);  // これ未満の明るさなら「暗すぎる」＝直す対象
const KMIN  = num('kmin', 0.05);  // 真っ黒（輪郭線）は触らない
const OLDTOL = num('oldtol', 8);  // 元の暗い紺そのままの塗り残しも一緒に直す

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

const mask = new Uint8Array(N * N);
for (let y = 0; y < N; y++) {
  const [br, bg_, bb] = newBg[y];
  const bb2 = br * br + bg_ * bg_ + bb * bb;
  const [or_, og, ob] = oldBg[y];
  for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 3;
    const r = base[i], g = base[i + 1], b = base[i + 2];
    // ① 元の暗い紺のままの塗り残し
    if (Math.hypot(r - or_, g - og, b - ob) <= OLDTOL) { mask[y * N + x] = 1; continue; }
    // ② 背景色の定数倍＝色相はそのままで暗いだけ
    const k = (r * br + g * bg_ + b * bb) / bb2;
    if (k < KMIN || k >= KMAX) continue;
    const resid = Math.hypot(r - k * br, g - k * bg_, b - k * bb);
    if (resid <= RESID) mask[y * N + x] = 1;
  }
}
const n = mask.reduce((a, b) => a + b, 0);
console.log(`直す画素: ${n} (${(n / (N * N) * 100).toFixed(2)}%)  resid=${RESID} kmax=${KMAX}`);

const out = Buffer.from(base);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const p = y * N + x; if (!mask[p]) continue;
  const i = p * 3, [r, g, b] = newBg[y];
  out[i] = r; out[i + 1] = g; out[i + 2] = b;
}

if (PREVIEW) {
  const ov = Buffer.from(base);
  for (let p = 0; p < N * N; p++) if (mask[p]) { const i = p * 3; ov[i] = 255; ov[i + 1] = 30; ov[i + 2] = 30; }
  await sharp(ov, { raw: { width: N, height: N, channels: 3 } }).png().toFile('_raw/_icon_fix5_mask.png');
  console.log('✓ _raw/_icon_fix5_mask.png（赤=直す）');
}
if (APPLY) {
  await sharp(out, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(OUT);
  console.log(`✓ ${OUT}`);
}
