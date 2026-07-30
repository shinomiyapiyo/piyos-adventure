// ─────────────────────────────────────────────────────────────────────────────
// measure-grain.mjs — 一枚絵の「模擬ドットの粒」と顔の粒数を実測する（2026-07-31）
//
// ⚠この絵は**本物のドット絵ではなくドットを模しているだけ**なので、格子は焼き込まれていない。
//   そこで「色が同じとみなせる画素の連続長」を粒の大きさとして測る（JPEGノイズに強い）。
//
// ⚠**必ず --region でキャラクター部分を指定すること**。背景（空・木の壁・床）は平らな面が広く、
//   粒が実際より大きく出る。ユーザーの関心は「キャラ部分のみの見た目」なので、背景を混ぜると比較にならない。
//   （既定値は画像中央60%だが、これは目安であって基準値との比較には使えない）
//
// 基準（2026-07-31 実測・**キャラ部分のみ**・ART_STYLE.md 参照）
//   title.jpg   … 粒 3.51px / 表示 ×0.74 → 画面上 2.60 CSSpx / 顔 70px = 約20粒
//   shop01      … 粒 1.93px / 表示 ×1.46 → 画面上 2.82 CSSpx
//   shop03      … 粒 1.85px / 表示 ×1.46 → 画面上 2.70 CSSpx
//   shop05(旧)  … 粒 2.99px / 表示 ×1.46 → 画面上 4.37 CSSpx ← ❌これが直したい乖離
//   ✅ 合格ライン = **画面上の粒 2.5〜2.9 CSSpx**
//
// 使い方:
//   node measure-grain.mjs <画像> [--shop] [--region=x0,y0,x1,y1] [--face=x0,y0,x1,y1]
//     --shop   ショップ背景として判定（表示エリア 571×393・background cover で拡大率を自動計算）
//     --region **キャラ部分**の範囲（省略時は中央60%＝背景混じりで参考値にしかならない）
//     --face   顔幅を測る範囲（省略時は --region の中から肌色の最長連続を探す）
//
// 既存の基準値を出し直す例:
//   node measure-grain.mjs ../images/title.jpg  --region=480,130,700,260
//   node measure-grain.mjs ../images/shop01.jpg --shop --region=288,60,320,115
//   node measure-grain.mjs ../images/shop05.jpg --shop --region=205,25,290,110
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('使い方: node measure-grain.mjs <画像> [--shop] [--region=..] [--face=..]'); process.exit(1); }
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const IS_SHOP = args.includes('--shop');

// ffprobe で寸法、ffmpeg で RGB 生データへ
function probeSize(f) {
  const out = execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0', f]).toString().trim();
  const [w, h] = out.split(',').map(Number);
  return { W: w, H: h };
}
async function toRaw(f) {
  const tmp = path.join(os.tmpdir(), `grain_${Date.now()}.raw`);
  execFileSync('ffmpeg', ['-y','-loglevel','error','-i', f, '-pix_fmt','rgb24','-f','rawvideo', tmp]);
  const b = await fs.readFile(tmp);
  await fs.unlink(tmp).catch(() => {});
  return b;
}

// 粒 = 色が許容差内で続く長さの平均
function grain(b, W, x0, y0, x1, y1, tol = 36) {
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    let o0 = (y * W + x0) * 3, sr = b[o0], sg = b[o0 + 1], sb = b[o0 + 2], len = 1;
    for (let x = x0 + 1; x < x1; x++) {
      const o = (y * W + x) * 3;
      if (Math.abs(b[o] - sr) + Math.abs(b[o + 1] - sg) + Math.abs(b[o + 2] - sb) <= tol) len++;
      else { sum += len; n++; sr = b[o]; sg = b[o + 1]; sb = b[o + 2]; len = 1; }
    }
    sum += len; n++;
  }
  return sum / n;
}

// 肌色（暖色で明るい）の最長連続を顔幅とみなす。行ごとに測って最大を取る
function faceWidth(b, W, x0, y0, x1, y1) {
  const skin = (o) => {
    const r = b[o], g = b[o + 1], bl = b[o + 2];
    return r > 200 && g > 150 && bl > 110 && r > bl + 25 && r >= g;
  };
  let best = 0, bestY = -1;
  for (let y = y0; y < y1; y++) {
    let cur = 0;
    for (let x = x0; x < x1; x++) {
      if (skin((y * W + x) * 3)) { cur++; if (cur > best) { best = cur; bestY = y; } }
      else cur = 0;
    }
  }
  return { w: best, y: bestY };
}

const { W, H } = probeSize(file);
const b = await toRaw(file);
const parse4 = (s, def) => s ? s.split(',').map(Number) : def;
const hasRegion = !!getArg('region');
const [rx0, ry0, rx1, ry1] = parse4(getArg('region'),
  [Math.round(W * 0.2), Math.round(H * 0.2), Math.round(W * 0.8), Math.round(H * 0.8)]);
const g = grain(b, W, rx0, ry0, rx1, ry1);

// 顔は既定で --region の中だけを探す（背景の木や砂を肌と誤検出しないため）
const fr = parse4(getArg('face'), [rx0, ry0, rx1, ry1]);
const face = faceWidth(b, W, fr[0], fr[1], fr[2], fr[3]);

console.log(`■ ${path.basename(file)}  ${W}×${H}`);
if (!hasRegion) console.log('  ⚠ --region 未指定＝背景混じりの参考値です。基準値と比較しないこと');
console.log(`  測定範囲              : x${rx0}〜${rx1}, y${ry0}〜${ry1}`);
console.log(`  粒（ファイル内）      : ${g.toFixed(2)} px`);
console.log(`  画像の横幅の粒数      : 約 ${Math.round(W / g)} 粒`);
if (face.w > 0) {
  console.log(`  顔幅（肌の最長連続）  : ${face.w} px  → 約 ${Math.round(face.w / g)} 粒  (y=${face.y})`);
}
if (IS_SHOP) {
  const AW = 571, AH = 393;                       // 実機のショップ表示エリア（CSSpx）
  const scale = Math.max(AW / W, AH / H);         // background-size: cover
  const onScreen = g * scale;
  const visibleCols = Math.round((AW / scale) / g);
  const ok = onScreen >= 2.5 && onScreen <= 2.9;
  console.log(`  ── ショップ表示（${AW}×${AH} / cover）──`);
  console.log(`  表示倍率              : ×${scale.toFixed(2)}`);
  console.log(`  画面上の粒            : ${onScreen.toFixed(2)} CSSpx   ${ok ? '✅ 合格（2.5〜2.9）' : '❌ 基準外（目標 2.5〜2.9）'}`);
  console.log(`  表示される横幅の粒数  : 約 ${visibleCols} 粒（目標 200〜210）`);
  if (face.w > 0) console.log(`  顔の粒数              : 約 ${Math.round(face.w / g)} 粒（目標 27〜29）`);
}
