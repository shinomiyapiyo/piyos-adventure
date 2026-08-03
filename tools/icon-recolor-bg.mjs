// ─────────────────────────────────────────────────────────────────────────────
// icon-recolor-bg.mjs — アイコンの「背景だけ」を別の色合いに差し替える（2026-07-31）
//
// ⚠ユーザー指示（2026-07-31）:「**今のaのまま、背景の色を現在のアプリアイコンのような色合いにできる？**」
//   ＝**キャラクターには一切触らない**（`ART_STYLE.md` / CLAUDE.md の「キャラクターの手続き描画は禁止」を守る）。
//   背景は加工してよい範囲なので、生成AIを使わずここで塗り替える。
//
// 🎨 目標の色合い＝現行アイコン `images/icon-1024.png` の背景を実測した縦グラデ
//   上 #feb53a（黄オレンジ）→ 中 #fda374（ピーチ）→ 下 #fe8f8c（ピンク）
//
// 🛠 やり方
//   ① **背景マスク**＝画像の四辺から色の連続性をたどって塗り広げる（flood fill）。
//      ぴよ氏は金色のリムライトで囲まれているので、そこで止まる。
//      そのあと穴埋め（膨張→収縮）で背景の中のキラキラも背景に含める。
//   ② マスク内の画素を **色相と彩度だけ差し替え、明るさの構造は元のまま**にする。
//      正確には「目標グラデの明るさ ＋ 元背景の局所的な明暗差」＝**放射の光り方とキラキラが残る**。
//
// 使い方: node icon-recolor-bg.mjs <入力> [出力] [--tol=42] [--preview]
// 検品:   node icon-preview.mjs <出力>   ／ --preview でマスクも書き出す
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const num = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
if (!files.length) { console.error('使い方: node icon-recolor-bg.mjs <入力> [出力] [--tol=42]'); process.exit(1); }
const SRC = files[0];
const DST = files[1] || SRC.replace(/\.png$/i, '_bg.png');
const TOL = num('tol', 42);          // 隣の画素とこの差までなら「同じ背景」とみなす
const PREVIEW = args.includes('--preview');
const K    = num('k', 0.55);     // 元の明暗差をどれだけ反映するか（1だとそのまま＝暗部が濃い赤に転ぶ）
const DARK   = num('dark', 0);     // 暗くする側をどこまで許すか（0＝ビネットを持ち込まない）
const SEED_Y = num('seedy', 0.55); // 左右の端を種にするのは上から何割までか（下はキャラが端に接する）

// 目標の色合い。既定＝現行アイコンの背景の実測値（上から下へ 黄オレンジ→ピーチ→ピンク）
// ⚠`--stops=feb53a,fda374,fe8f8c` のように上から順の16進で差し替えできる（2色でも4色でも可）
const STOPS = (() => {
  const raw = args.find(x => x.startsWith('--stops='));
  const list = raw ? raw.split('=')[1].split(',') : ['feb53a', 'fda374', 'fe8f8c'];
  return list.map((h, i) => ({
    at: list.length === 1 ? 0 : i / (list.length - 1),
    c: [0, 2, 4].map(k => parseInt(h.replace('#', '').slice(k, k + 2), 16)),
  }));
})();

const rgb2hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
};
const hue2rgb = (p, q, t) => {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};
const hsl2rgb = (h, s, l) => {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
    .map(v => Math.max(0, Math.min(255, Math.round(v * 255))));
};
const targetAt = (t) => {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i].at) {
      const a = STOPS[i - 1], b = STOPS[i], k = (t - a.at) / (b.at - a.at);
      return [0, 1, 2].map(c => a.c[c] + (b.c[c] - a.c[c]) * k);
    }
  }
  return STOPS[STOPS.length - 1].c;
};

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = 3;
const px = (i) => [data[i * C], data[i * C + 1], data[i * C + 2]];
const near = (a, b, tol) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= tol * 3;

// ── ① 背景マスク: 上辺と左右の上側から flood fill ──
// ⚠**下辺と、左右の下側を種にしてはいけない**（ユーザー指摘・2026-07-31）。
//   バストアップの絵では**画像の下辺がぴよ氏の体を横切っている**ので、そこを種にすると
//   塗り広げが**黒い袖と黄色い胸当ての中へ入り込み、服が背景として消える**。
//   左右の下側も**ツインテールが端に届いている**ので同じ事故が起きる。
//   ＝**確実に背景である「上辺」と「左右の上側 SEED_Y まで」だけ**を種にする。背景はつながっているので届く。
const mask = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push(x);                       // 上辺
const seedBottom = Math.floor(H * SEED_Y);
for (let y = 0; y < seedBottom; y++) { stack.push(y * W, y * W + W - 1); }   // 左右（上側だけ）
for (const i of stack) mask[i] = 1;
const queue = stack.slice();
let qi = 0;
while (qi < queue.length) {
  const i = queue[qi++];
  const x = i % W, y = (i - x) / W, c = px(i);
  const push = (j) => { if (!mask[j] && near(c, px(j), TOL)) { mask[j] = 1; queue.push(j); } };
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (y > 0) push(i - W);
  if (y < H - 1) push(i + W);
}

// ── ①-2 髪に分断されて取り残された背景を回収する ──
// ⚠ユーザー指摘（2026-07-31）:「**ツインテールと肩の間のわずかな隙間が元の紫のまま**」。
//   ツインテールが画像の左右端に触れているため、**その下の背景が本体の背景から切り離されて**
//   第1パスの塗り広げが届かなかった。
//   ⚠ここで単に tol を上げると髪へ漏れる（背景 #181027 と髪 #22192c の差は約10しかない）。
//   → **①門番（背景の代表色にごく近い画素だけ種にする） ②第2パスは tol を半分以下**にする。
const bgRef = (() => {                       // 第1パスで背景と確定した画素の代表色
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (mask[i]) { const c = px(i); r += c[0]; g += c[1]; b += c[2]; n++; }
  return [r / n, g / n, b / n].map(Math.round);
})();
{
  const TOL2 = Math.max(3, Math.round(TOL / 2));
  const seeds = [];
  const trySeed = (i) => {
    if (mask[i]) return;
    const c = px(i);
    if (Math.abs(c[0] - bgRef[0]) + Math.abs(c[1] - bgRef[1]) + Math.abs(c[2] - bgRef[2]) <= 12) { mask[i] = 1; seeds.push(i); }
  };
  for (let y = 0; y < H; y++) { trySeed(y * W); trySeed(y * W + W - 1); }   // 左右の端（全高）
  for (let x = 0; x < W; x++) trySeed((H - 1) * W + x);                     // 下辺（門番があるので服は拾わない）
  let si = 0;
  while (si < seeds.length) {
    const i = seeds[si++], x = i % W, y = (i - x) / W;
    const push = (j) => { if (!mask[j] && near(px(i), px(j), TOL2)) { mask[j] = 1; seeds.push(j); } };
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }
  console.log(`  取り残しの回収: 種${seeds.length ? '有' : '無'} / 背景の代表色 rgb(${bgRef.join(',')}) / tol2=${TOL2}`);
}

// 穴埋め（膨張→収縮）＝背景の中のキラキラや小さな抜けを背景に含める
const morph = (m, r, grow) => {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let hit = 0;
    for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = m[ny * W + nx];
      if (grow ? v === 1 : v === 0) { hit = 1; break; }
    }
    out[y * W + x] = grow ? (hit ? 1 : 0) : (hit ? 0 : 1);
  }
  return out;
};
let m2 = morph(mask, 3, true);    // 膨張
m2 = morph(m2, 3, false);         // 収縮（＝閉じる）
const bg = m2;
let count = 0; for (let i = 0; i < bg.length; i++) if (bg[i]) count++;
console.log(`背景と判定した画素: ${((count / (W * H)) * 100).toFixed(1)}%  （tol=${TOL}）`);

// ── ② 明るさの構造を残して色相・彩度を差し替え ──
// 元背景の明るさを大きくぼかしたもの＝「その場所の平均的な明るさ」。差分がキラキラと放射の陰影
const lumaBuf = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) { const [r, g, b] = px(i); lumaBuf[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b); }
const blurred = await sharp(lumaBuf, { raw: { width: W, height: H, channels: 1 } }).blur(36).raw().toBuffer();

const out = Buffer.from(data);
for (let i = 0; i < W * H; i++) {
  if (!bg[i]) continue;
  const y = Math.floor(i / W);
  const [, , srcL] = rgb2hsl(...px(i));
  const localL = blurred[i] / 255;
  const [tr, tg, tb] = targetAt(y / (H - 1));
  const [th, ts, tl] = rgb2hsl(tr, tg, tb);
  // 目標の明るさ ＋ 元の明暗差（放射の陰影とキラキラ）。
  // ⚠**そのまま足すと暗い所で彩度の高いピンクが濃い赤に転ぶ**（1.711 の最初の試作で下端に赤帯が出た）。
  //   反映量を K 倍に抑え、暗くなる側をきつく制限する（明るくなる側＝キラキラは残したい）。
  //   ⚠さらに、暗くする側は既定で切る（DARK=0）。現行アイコンの背景は**素直な縦グラデで暗い縁が無い**ため、
  //   元絵のビネット（四隅の暗さ）を持ち込むと下の角だけ濃いピンクになって浮く。
  const dev = Math.max(-DARK, Math.min(0.16, (srcL - localL) * K));
  const L = Math.max(0, Math.min(1, tl + dev));
  const [nr, ng, nb] = hsl2rgb(th, ts, L);
  out[i * C] = nr; out[i * C + 1] = ng; out[i * C + 2] = nb;
}

await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9, effort: 10 }).toFile(DST);
console.log(`✓ ${path.basename(DST)}  （背景のみ差し替え・キャラクターは無加工）`);

if (PREVIEW) {
  const mv = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = px(i), o = i * 3;
    if (bg[i]) { mv[o] = 255; mv[o + 1] = 60; mv[o + 2] = 160; }
    else { mv[o] = r; mv[o + 1] = g; mv[o + 2] = b; }
  }
  const mp = DST.replace(/\.png$/i, '_mask.png');
  await sharp(mv, { raw: { width: W, height: H, channels: 3 } }).png().toFile(mp);
  console.log(`  ✓ ${path.basename(mp)}（ピンクが背景と判定した範囲）`);
}
