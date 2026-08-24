// ─────────────────────────────────────────────────────────────────────────────
// gemini-gamepad-guide.mjs — コントローラー操作説明ページ用のパッド絵（1.743）
// ⚠画像生成は Gemini（gemini-3-pro-image）。GEMINI_API_KEY は zsh -ic 経由。
//
//   - images/gamepad_diagram.png … Xbox配列のパッドを正面から見た1枚（透過PNG・幅1000px）
//
// ⚠**商標を描かせない**: Xboxのロゴ（ネクサス）とワードマークは入れない。配置とABXYの色だけ借りる。
// ⚠**文字を描かせない**: A/B/X/Y や LB/RB もモデルに書かせると必ず崩れる。
//   絵は「文字なしの本体」だけにして、番号バッジと文字はページ側(HTML)で重ねる＝多言語にもできる。
// ⚠**左右対称・正面・中央**でないと、ページ側の番号バッジの位置合わせが破綻する。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-gamepad-guide.mjs'
//   オプション: --n=<候補数> --only=flat,pixel
// 採用: node gemini-gamepad-guide.mjs --pick=flat:2
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
const OUT_W  = parseInt(getArg('w') || '900', 10);
const COLORS = parseInt(getArg('colors') || '96', 10);   // パレットの色数（減色の強さ）

// レイアウトの指定。⚠ここがブレると番号バッジが合わないので、位置を全部言い切る。
const LAYOUT = [
  'The controller is seen STRAIGHT FROM THE FRONT (top-down onto its face), perfectly horizontal,',
  'perfectly LEFT-RIGHT SYMMETRIC, centered, filling most of the frame.',
  'Layout (Xbox arrangement):',
  'upper-left = a round ANALOG STICK in a recessed dish;',
  'lower-left = a plus-shaped D-PAD;',
  'right side = FOUR round face buttons in a diamond: top button YELLOW, left button BLUE,',
  'right button RED, bottom button GREEN;',
  'lower-right = a second round ANALOG STICK, mirroring the left one;',
  'center = two small oval buttons side by side;',
  'top edge = two SHOULDER BUTTONS (one at each upper corner of the body) and,',
  'just behind them, two TRIGGERS peeking over the top edge.',
  'Two grips angle down and outward at the bottom.',
].join(' ');

const RULES = [
  'ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO SYMBOLS anywhere in the image —',
  'the face buttons must be BLANK coloured circles with no letters on them.',
  'NO brand logo, NO logo button in the middle, no wordmark, no manufacturer marking.',
  'The background must be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the entire canvas —',
  'a chroma key screen. Do NOT draw a checkerboard, do NOT draw a gradient, do NOT draw scenery,',
  'do NOT draw a cast shadow on the ground. Nothing in the controller itself may be green',
  'EXCEPT the single green face button.',
].join(' ');

const ASSETS = {
  flat: {
    out: 'gamepad_diagram.png',
    prompt: [
      'A clean modern VECTOR ILLUSTRATION of a video game controller, for a help screen in a game.',
      LAYOUT,
      'Style: flat illustration with soft shading, thick clean dark outline, rounded friendly shapes,',
      'body in dark violet-grey plastic with a subtle highlight along the top,',
      'sticks and D-pad in a slightly darker grey. Bright, high contrast, instantly readable.',
      RULES,
    ].join(' '),
  },
  pixel: {
    out: 'gamepad_diagram.png',
    prompt: [
      'Retro 16-bit PIXEL ART of a video game controller, for a help screen in a pixel art game.',
      LAYOUT,
      'Style: bold crisp pixels, thick clean dark outline, limited palette, chunky readable shapes,',
      'body in dark violet-grey, simple dithered highlight along the top edge.',
      RULES,
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
// クロマキー（1.743）。⚠**緑のフェイスボタンを絶対に抜かない**のが肝。
//   色の比率だけで判定すると、候補によってはボタンの緑まで背景と同じ側に入る（実測: flat_1 /
//   pixel_1 / pixel_2 の A ボタンが真っ黒に抜けた）。
//   → **「外周からつながっている緑」だけを背景とみなす**（塗りつぶしで到達判定する）。
//     ボタンは本体に囲まれていて外周とつながらないので、どんな緑でも生き残る。
// ⚠さらに**ふちの緑のにじみ**を消す（背景と輪郭が混ざった画素が緑に転ぶ）。
//   透明画素から SPILL px 以内に限定＝ボタンには絶対に届かない。
const KEY = { minG: 55, rRatio: 0.75, bRatio: 0.75 };   // ⚠ゆるめでよい（外周からの到達で絞るため）
const SPILL = 3;
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const isGreen = (i) => {
    const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
    return g > KEY.minG && r < g * KEY.rRatio && b < g * KEY.bRatio;
  };
  // 外周から緑をたどれた画素＝背景
  const bg = new Uint8Array(W * H), stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (bg[i] || !isGreen(i)) return;
    bg[i] = 1; stack.push(i);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i - x) / W; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  for (let i = 0; i < W * H; i++) if (bg[i]) data[i * 4 + 3] = 0;

  // にじみ取り（⚠**縮小の前**にやる。縮小後だと内側の画素と混ざって取れない）
  const near = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] !== 0) continue;
    for (let dy = -SPILL; dy <= SPILL; dy++) for (let dx = -SPILL; dx <= SPILL; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) near[ny * W + nx] = 1;
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (!near[i] || data[i * 4 + 3] === 0) continue;
    const p = i * 4, rb = (data[p] + data[p + 2]) / 2;
    if (data[p + 1] > rb) data[p + 1] = Math.round(rb);
  }
  // ⚠**透明画素の RGB も潰す**。alpha=0 でも RGB は緑のまま残っており、縮小や合成で縁へ滲み出す
  //   （潰す前は ふちの 8〜19% が緑のままだった＝実測）。
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] === 0) { data[i*4]=0; data[i*4+1]=0; data[i*4+2]=0; }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
async function toDiagram(buf) {
  // ⚠fillHoles は使わない。背景を「外周からつながった緑」で決めているので内側に穴は出来ない。
  const keyed = await chromaKey(buf);
  // ⚠**減色して出す**（1.743）。素のPNGだと 593KB あり、UIの1枚としては同梱に重すぎた。
  //   平坦なイラストなのでパレット化がよく効く（色数は下の COLORS で調整）。
  return sharp(keyed).ensureAlpha().trim({ threshold: 10 })
    .resize({ width: OUT_W, withoutEnlargement: false })
    .png({ palette: true, colors: COLORS, effort: 10 }).toBuffer();
}

await fs.mkdir(RAW_DIR, { recursive: true });

if (PICK) {
  for (const pair of PICK.split(',')) {
    const [key, idx] = pair.split(':');
    const a = ASSETS[key];
    if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
    const src = path.join(RAW_DIR, `gamepad_${key}_cand_${idx}.png`);
    const dest = getArg('out') ? path.resolve(getArg('out')) : path.join(IMAGES_DIR, a.out);
    await fs.writeFile(dest, await toDiagram(await fs.readFile(src)));
    console.log(`✓ ${dest} ← ${key} 候補${idx}`);
  }
  process.exit(0);
}

// ⚠APIキーの確認は **--pick より後**（採用は生成済みの候補を加工するだけでキーは要らない）
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }

const ai = new GoogleGenAI({ apiKey });
const keys = ONLY.length ? ONLY : Object.keys(ASSETS);
for (const key of keys) {
  const a = ASSETS[key];
  if (!a) { console.error(`✗ 未知のアセット: ${key}`); continue; }
  console.log(`\n■ ${key}`);
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [{ text: a.prompt }] }]);
    await fs.writeFile(path.join(RAW_DIR, `gamepad_${key}_cand_${i}.png`), buf);
    await fs.writeFile(path.join(RAW_DIR, `gamepad_${key}_cand_${i}_out.png`), await toDiagram(buf));
    console.log(`  ✓ 候補${i}`);
  }
}
console.log('\n候補は tools/_raw/ に出力しました。--pick=flat:2 のように確定します。');
