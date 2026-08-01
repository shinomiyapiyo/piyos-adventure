// ─────────────────────────────────────────────────────────────────────────────
// tint-sprite-hue.mjs — スプライトの「装束の色相」だけを目標値へ合わせる（2026-08-01）
//
// ⚠なぜ必要か: ユーザー指摘「**忍者ぴよの立ち絵だけ他のモーションよりも黄色より橙色よりなので、
//   立ち絵の色だけもう少し黄色くする必要がある**」。
//   立ち絵と歩行は**同じ R と B で G だけ33違う**だけだった（実測）:
//     立ち絵 #f5a022（色相36） / 歩行 #f5c121（色相45）
//   ＝**描き直す必要はない。緑成分を上げれば揃う。**
//
// ⚠**これは色の補正であって、キャラクターの手続き描画ではない**（既にある絵の色を直すだけ）。
//   生成で作り直すと立ち絵が別物になるので、ここは手作業の補正が正しい（ユーザーもそれを求めた）。
//
// やり方: 対象画素だけ `G' = B + (目標色相 / 60) * (R - B)` に置き換える。
//   R と B は触らないので、明るさと彩度の構造は保たれ、色相だけが動く。
//
// ⚠対象の絞り方（忍者ぴよ立ち絵の実測パレットに基づく）:
//   ・装束 = **色相25〜50 / 最大成分 >= 110 / B < 140 / 彩度 >= 0.4**（581px）
//   ・帯・ブーツ・輪郭（暗部 446px・最大成分 < 110）は**触らない**
//   ・肌（B が高い 64px）と肌の影（色相0〜20）は**触らない**
//
// 使い方:
//   node tint-sprite-hue.mjs <入力> <出力> [--hue=45] [--hmin=25] [--hmax=50] [--vmin=110] [--bmax=140] [--smin=0.4]
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const num = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
if (files.length < 2) { console.error('使い方: node tint-sprite-hue.mjs <入力> <出力> [--hue=45]'); process.exit(1); }
const [src, dst] = files;
const HUE = num('hue', 45), HMIN = num('hmin', 25), HMAX = num('hmax', 50);
const VMIN = num('vmin', 110), BMAX = num('bmax', 140), SMIN = num('smin', 0.4);

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let hit = 0, gSum = 0, gSum2 = 0;
for (let i = 0; i < data.length; i += 4) {
  const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
  if (A < 200) continue;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  if (mx < VMIN || B >= BMAX) continue;
  const sat = mx ? (mx - mn) / mx : 0;
  if (sat < SMIN) continue;
  if (R - B <= 0) continue;
  const hue = 60 * (G - B) / (R - B);
  if (hue < HMIN || hue > HMAX) continue;
  const g2 = Math.max(0, Math.min(255, Math.round(B + (HUE / 60) * (R - B))));
  if (g2 <= G) continue;                       // 既に十分黄色い画素は触らない
  gSum += G; gSum2 += g2; hit++;
  data[i + 1] = g2;
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(dst);
console.log(`■ ${src} → ${dst}  (${info.width}x${info.height})`);
console.log(`  対象 ${hit}px の緑成分を平均 ${hit ? Math.round(gSum / hit) : 0} → ${hit ? Math.round(gSum2 / hit) : 0} に（目標色相 ${HUE}）`);
