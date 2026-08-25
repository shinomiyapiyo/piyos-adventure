// ─────────────────────────────────────────────────────────────────────────────
// gemini-mikiri-eye.mjs — 「みきりの目」のアイコン（1.748）
// ⚠画像生成は Gemini（gemini-3-pro-image）。GEMINI_API_KEY は zsh -ic 経由。
//
//   - images/icon_mikiri_eye.png … 32x32 のアイテムアイコン（タイトルショップの棚に並ぶ）
//
// ⚠**避けるべき衝突（実物を見て確認済み）**:
//   ・コンボマスター = 金の懐中時計＋金のキラキラ → **時計/砂時計モチーフは使わない**
//   ・地底の主の加護 = 石像にはまった紫の目     → **石＋紫の目玉は使わない**
//   ・棚は金色が過密（コンボマスター/コインマスター/はやあし）→ **水色〜白を主役**にする
// ⚠ぴよ氏の瞳は金色（images/eyes_closeup.jpg）。A案はその金を残しつつ**水色の集中線**で
//   「ぴよフラッシュ＝金の放射」と対になるようにする。
//
// 実行: zsh -ic 'node gemini-mikiri-eye.mjs --n=2'
// 採用: node gemini-mikiri-eye.mjs --pick=focus:1
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const args   = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL  = getArg('model') || process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
const N      = Math.max(1, Math.min(6, parseInt(getArg('n') || '2', 10)));
const ONLY   = (getArg('only') || '').split(',').filter(Boolean);
const PICK   = getArg('pick');

// 既存アイコン（icon_*.png）と画風を揃える。⚠緑背景でクロマキー（Geminiは透過を返さない）
const COMMON = [
  'Retro 16-bit pixel art game item icon.',
  'Thick clean dark outline, bold crisp pixels, strong readable silhouette at 32x32.',
  'The background must be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the entire canvas —',
  'a chroma key screen. Do NOT draw a checkerboard, gradient or scenery. Nothing in the object may be green.',
  'No text, no border, no frame, no cast shadow on the ground.',
  'Just the single object, centered, filling most of the frame.',
].join(' ');

const ASSETS = {
  // A案: 見開いた目＋水色の集中線（ぴよフラッシュの金の放射と対）
  focus: {
    out: 'icon_mikiri_eye.png', size: 32,
    prompt: [
      'A single wide-open ANIME EYE seen from the front, the symbol of sharpened perception.',
      'The iris is warm GOLD with a bright highlight; the lashes and outline are near-black.',
      'Around the eye, four to six straight PALE CYAN focus lines converge inward toward the pupil',
      'like a camera snapping into focus, with a faint icy blue glow behind them.',
      'Cool, calm and sharp — the moment everything slows down.',
      COMMON,
    ].join(' '),
  },
  // B案: 水色レンズの片眼鏡（道具として棚に並ぶ）
  monocle: {
    out: 'icon_mikiri_eye.png', size: 32,
    prompt: [
      'A single MONOCLE game item icon: a round eyepiece with a chunky pale-gold metal rim',
      'and a translucent PALE CYAN lens with a bright diagonal shine across it.',
      'A short chain of two or three links hangs from the rim.',
      'A few small white sparkles near the lens. Elegant and precise, like a tool for seeing through things.',
      COMMON,
    ].join(' '),
  },
  // C案: 目のかたちの水色の宝石（32pxで一番強い＝形が単純）
  gem: {
    out: 'icon_mikiri_eye.png', size: 32,
    prompt: [
      'A single EYE-SHAPED GEMSTONE game item icon — a pointed oval (almond) cut crystal',
      'standing upright, in brilliant ICE BLUE and white, with clean faceted planes and',
      'a bright white highlight at the upper left. At its centre a darker blue slit-pupil marking',
      'makes it read unmistakably as an eye. A soft pale-cyan glow and two small white sparkles around it.',
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
// 背景は「外周からつながっている緑」だけ落とす（物の中の緑を守る作法・1.744と同じ）
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const isGreen = (i) => { const p = i * 4, r = data[p], g = data[p+1], b = data[p+2];
    return g > 55 && r < g * 0.75 && b < g * 0.75; };
  const bg = new Uint8Array(W * H), st = [];
  const push = (x, y) => { if (x<0||y<0||x>=W||y>=H) return; const i=y*W+x;
    if (bg[i] || !isGreen(i)) return; bg[i]=1; st.push(i); };
  for (let x=0;x<W;x++){ push(x,0); push(x,H-1); }
  for (let y=0;y<H;y++){ push(0,y); push(W-1,y); }
  while (st.length){ const i=st.pop(), x=i%W, y=(i-x)/W; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  for (let i=0;i<W*H;i++) if (bg[i]) data[i*4+3]=0;
  // ふちの緑にじみを中和（透明画素から3px以内だけ）
  const near = new Uint8Array(W*H), S = 3;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    if (data[(y*W+x)*4+3] !== 0) continue;
    for (let dy=-S;dy<=S;dy++) for (let dx=-S;dx<=S;dx++){ const nx=x+dx, ny=y+dy;
      if (nx>=0&&ny>=0&&nx<W&&ny<H) near[ny*W+nx]=1; }
  }
  for (let i=0;i<W*H;i++){ if(!near[i]||data[i*4+3]===0) continue;
    const p=i*4, rb=(data[p]+data[p+2])/2; if (data[p+1] > rb) data[p+1]=Math.round(rb); }
  for (let i=0;i<W*H;i++) if (data[i*4+3]===0){ data[i*4]=0; data[i*4+1]=0; data[i*4+2]=0; }
  return sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
}
// 32pxへ。⚠既存アイコンと同じく**半透明の縁は潰す**（ドット絵の輪郭をぼかさない）
async function toIcon(buf, size) {
  const keyed = await chromaKey(buf);
  const small = await sharp(keyed).ensureAlpha().trim({ threshold: 10 })
    .resize(size, size, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
  const { data, info } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i=3;i<data.length;i+=4) data[i] = data[i] >= 96 ? 255 : 0;
  return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}

await fs.mkdir(RAW_DIR, { recursive: true });
if (PICK) {
  for (const pair of PICK.split(',')) {
    const [key, idx] = pair.split(':');
    const a = ASSETS[key];
    if (!a) { console.error(`✗ 未知の案: ${key}`); continue; }
    const src = path.join(RAW_DIR, `mikiri_${key}_cand_${idx}.png`);
    const dest = getArg('out') ? path.resolve(getArg('out')) : path.join(IMAGES_DIR, a.out);
    await fs.writeFile(dest, await toIcon(await fs.readFile(src), a.size));
    console.log(`✓ ${dest} ← ${key} 候補${idx}`);
  }
  process.exit(0);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });
for (const key of (ONLY.length ? ONLY : Object.keys(ASSETS))) {
  const a = ASSETS[key];
  console.log(`\n■ ${key}`);
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [{ text: a.prompt }] }]);
    await fs.writeFile(path.join(RAW_DIR, `mikiri_${key}_cand_${i}.png`), buf);
    await fs.writeFile(path.join(RAW_DIR, `mikiri_${key}_cand_${i}_32.png`), await toIcon(buf, a.size));
    console.log(`  ✓ 候補${i}`);
  }
}
console.log('\n候補は tools/_raw/ に出力しました。--pick=focus:1 のように確定します。');
