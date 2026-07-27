// ─────────────────────────────────────────────────────────────────────────────
// gemini-ug-pass-chest.mjs — 地底入場パスのアイコンと、ラッキーの間の宝箱を生成（1.630）
// ⚠画像生成は **Gemini（Nano Banana 2 = gemini-3-pro-image）**。OpenAIはクレジットを使い切ったため終了
//   （2026-07-28 ユーザー通告・以後の画像は原則すべてこちら）。
//
//   - images/icon_ug_pass.png   … 地底入場パス（32x32・エッグこうかん/メニュー/HUD/バッジで使う）
//       ⚠**地底の主の加護（icon_ug_blessing.png＝石像の目）と同じ棚に並ぶ**ので、シルエットで
//         はっきり区別が付くこと（丸い目 ↔ 切り欠きのある札）。
//   - images/item_chest.png      … 宝箱・閉（52x40相当。ラッキーの間の3つ）
//   - images/item_chest_open.png … 宝箱・開（フタが開いて中から光）
//       ⚠1.452でOpenAIキー不在のため drawChest の手続き描画で暫定採用していたものの差し替え。
//         接地影/グロー/"?"/上下のゆれ/消滅の縮小は従来どおり描画側が持つ＝**箱そのものだけ**を作る。
//
// 実行（候補を作る）: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-ug-pass-chest.mjs'
//   オプション: --model=<id> --n=<候補数(1-6)> --only=pass,chest,chest_open
// 採用（候補を確定して images/ へ）: node gemini-ug-pass-chest.mjs --pick=pass:2,chest:1,chest_open:3
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const DEFAULT_MODEL = 'gemini-3-pro-image';

const args   = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL  = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const N      = Math.max(1, Math.min(6, parseInt(getArg('n') || '2', 10)));
const ONLY   = (getArg('only') || '').split(',').filter(Boolean);
const PICK   = getArg('pick');

// 共通の作法（既存の icon_*.png / item_*.png と画風を揃える）
// ⚠**Gemini は透過PNGを返さない**（OpenAIの `background:'transparent'` に相当する指定が無い）。
//   1.630の初回生成では「透明のつもりで**市松模様を描いた**不透明画像」が返ってきた（全候補が不透明100%）。
//   そこで**抜きやすい単色背景を指定して、こちらでクロマキーする**方式にする。
//   緑にする理由: 石(灰)・紫の光・木箱の茶・金 のどれとも十分に離れていて、誤って抜かない。
const CHROMA = { r: 0, g: 255, b: 0 };
const COMMON = [
  'Retro 16-bit pixel art game sprite.',
  'Thick clean dark outline, bold crisp pixels, strong readable silhouette at very small size.',
  'The background must be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the entire canvas —',
  'a chroma key screen. Do NOT draw a checkerboard, do NOT draw a gradient, do NOT draw any scenery.',
  'Nothing in the object itself may be green.',
  'No text, no border, no frame, no cast shadow on the ground.',
  'Just the single object, centered, filling most of the frame.',
].join(' ');

const ASSETS = {
  pass: {
    out: 'icon_ug_pass.png', size: 32,
    prompt: [
      'A single ancient stone ADMISSION TABLET game item icon — a pass that grants entry to the underworld.',
      'Shape: a small upright rectangular tablet of cracked grey stone with a NOTCH cut out of each side',
      '(like a torn ticket stub), so its silhouette is instantly distinct from a round idol head.',
      'Carved into its face is a glowing VIOLET spiral staircase descending into a hole.',
      'A faint violet light leaks from the carving and from the cracks in the stone.',
      'Ominous and sacred, like a relic handed out at the mouth of a cave.',
      COMMON,
    ].join(' '),
  },
  chest: {
    out: 'item_chest.png', size: { w: 104, h: 72 },   // = LUCKY_CHEST_W/H (52x36) の2倍。⚠**絵の実比1.443に合わせてコード側を変えた**（1.630）
    prompt: [
      'A single CLOSED treasure chest game sprite, seen from the front, slightly above eye level.',
      'A sturdy wooden chest with a rounded lid, warm brown planks, two vertical GOLD metal bands,',
      'a gold rim along the lid edge and a round gold lock plate at the front center.',
      'Cheerful and inviting — a prize chest in a bonus room, not a sinister one.',
      COMMON,
    ].join(' '),
  },
  chest_open: {
    // ⚠1.630: 開いた宝箱は**生成しない**。閉じた絵のフタを切り出して倒す方式にしたので不要
    //   （別々に生成すると色と形が必ずズレる＝ユーザー指摘）。プロンプトは記録として残す。
    out: 'item_chest_open.png', size: { w: 104, h: 72 },
    prompt: [
      'A single OPEN treasure chest game sprite, seen from the front, slightly above eye level.',
      'The SAME sturdy wooden chest as a classic prize chest: warm brown planks, two vertical GOLD metal bands,',
      'gold rim, round gold lock plate. Its rounded lid is TILTED BACK and OPEN,',
      'and a warm pale-yellow GLOW spills out of the opening from inside.',
      'The inside of the chest is bright with light. Cheerful and rewarding.',
      COMMON,
    ].join(' '),
  },
};

function extractImageBuffer(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\nモデル応答:\n${text}` : ''));
}
async function callModel(ai, contents) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { const resp = await ai.models.generateContent({ model: MODEL, contents }); return extractImageBuffer(resp); }
    catch (e) { lastErr = e; const w = 2500 * attempt; console.warn(`  失敗(${attempt}/4): ${e.message}  ${w}ms待機...`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}
// 外周から届かない透明画素（＝シルエット内側の穴）を不透明に戻す。
// ⚠**縮小より先に**やること（1.582の教訓＝生成画像は明るい部分がくり抜かれることがある）。
async function fillHoles(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const outside = new Uint8Array(W * H), stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (outside[p] || data[p * 4 + 3] >= 8) return;
    outside[p] = 1; stack.push(p);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  for (let p = 0; p < W * H; p++) data[p * 4 + 3] = outside[p] ? 0 : 255;
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
// クロマキー（1.630）: 指定した緑の背景を透明に落とす。⚠**fillHoles より前**に通すこと
//   （先に穴埋めをすると背景が「外側」と判定されず全面が不透明のまま残る）。
// ・緑判定は「緑が十分強く、赤と青の両方をはっきり上回る」＝木箱の茶や石の灰は絶対に当たらない。
// ・縁のにじみ（スピル）は、残った画素の緑成分を赤青の平均へ寄せて中和する。
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (g > 90 && g > r * 1.35 && g > b * 1.35) { data[p + 3] = 0; continue; }   // 背景
    const rb = (r + b) / 2;                                                       // スピル除去
    if (g > rb * 1.15) data[p + 1] = Math.round(rb * 1.15);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// size は 32 のような正方形指定と {w,h} の両方を受ける。
// ⚠宝箱は**ゲーム内で 52x40 の横長**（LUCKY_CHEST_W/H）で描くので、正方形で書き出すと横に潰れる。
//   2倍の 104x80 で持っておけば drawImage(…,52,40) がちょうど半分＝高精細のまま等倍になる。
async function toSprite(buf, size) {
  const W = (typeof size === 'number') ? size : size.w;
  const H = (typeof size === 'number') ? size : size.h;
  const keyed = await chromaKey(buf);
  const filled = await fillHoles(keyed);
  const small = await sharp(filled).ensureAlpha().trim({ threshold: 10 })
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;   // 半透明の縁を潰す
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });

if (PICK) {   // 候補を確定させるだけのモード（例: --pick=pass:2,chest:1）
  for (const pair of PICK.split(',')) {
    const [key, idx] = pair.split(':');
    const a = ASSETS[key];
    if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
    const src = path.join(RAW_DIR, `${key}_cand_${idx}.png`);
    await fs.writeFile(path.join(IMAGES_DIR, a.out), await toSprite(await fs.readFile(src), a.size));
    console.log(`✓ images/${a.out} ← 候補${idx}`);
  }
  process.exit(0);
}

const ai = new GoogleGenAI({ apiKey });
const keys = ONLY.length ? ONLY : Object.keys(ASSETS);
for (const key of keys) {
  const a = ASSETS[key];
  if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
  console.log(`\n■ ${key} → ${a.out}（${a.size}x${a.size}）`);
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [{ text: a.prompt }] }]);
    await fs.writeFile(path.join(RAW_DIR, `${key}_cand_${i}.png`), buf);             // 生（大きいまま・確認用）
    await fs.writeFile(path.join(RAW_DIR, `${key}_cand_${i}_${typeof a.size === 'number' ? a.size : a.size.w + 'x' + a.size.h}.png`), await toSprite(buf, a.size)); // 実寸
    console.log(`  ✓ 候補${i}`);
  }
}
console.log('\n候補は tools/_raw/ に出力しました。確認後 --pick=key:番号 で images/ へ配置します。');
