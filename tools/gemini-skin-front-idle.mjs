// ─────────────────────────────────────────────────────────────────────────────
// gemini-skin-front-idle.mjs — 魔女/侍/サイバー/忍者ぴよの**立ち絵だけ**を正面向きに描き直す。
//
// ⚠ユーザー指摘（2回目）:「立ち絵から完全に横を向いていてFFのようだが意図していない。
//   移動中は完全に横でも構わないが、**立ち絵だけは私服ぴよのように顔が見えなければならない**」。
//   真因は生成時の指定そのもの: 旧 generate-skin-*-openai.mjs の identity に
//   `same side-view stance facing right` と書いてあり、4種とも完全な横顔で焼かれていた。
//   （メイドぴよ/アイドルぴよ/私服ぴよは正面＝そちらが本来の見本。1.666でも同じ是正をしている）
//
// ⚠**歩行/ジャンプ/落下のコマは触らない**。横向きのままでよい（ユーザー明言）。ここは idle だけ。
//
// 【入力2枚】
//   ①今の立ち絵（images/skin_<key>_idle.png を nearest で1024へ）＝**衣装と配色の正**
//   ②_raw/base_front_1024.png（＝player_idle_v1.png を nearest で1024へ）＝**向きの見本**
//   衣装は①から1つも変えず、向きだけ②に合わせる、という指示にしてある。
//
// ⚠Geminiは透過PNGを返さない → 緑背景を指定して chromaKey で抜く（gemini-skin-idol.mjs と同一）。
// ⚠後処理は chromaKey → fillHoles の順を守る（1.666の教訓。緑が内側の長方形で来ても抜けるように
//   「抜いた画素も外側の種にする」）。
//
// モード:
//   --gen [--only=witch,samurai,cyber,ninja] [--n=2]
//        候補を _raw/front_<key>_<i>_{raw,keyed,64}.png に書く。**images/ には一切触らない**。
//   --sheet   生成済み候補と現行を1枚に並べた比較画像 _raw/_front_idle_sheet.png を作る（APIを使わない）
//   --pick=<key>:<i>
//        候補を images/skin_<key>_idle.png へ採用。⚠採用前に現行を
//        _raw/BACKUP_skin_<key>_idle.png へ退避する（1.668の「魔女スキンを上書きしかけた事故」対策）。
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-skin-front-idle.mjs --gen --n=2'
//   ※ GEMINI_API_KEY はログインシェル経由（zsh -ic）で読む
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const OUT   = 64;
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';

const args    = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const N       = Math.max(1, Math.min(4, parseInt(getArg('n') || '2', 10)));

// 背景は緑。⚠衣装に緑を使う子が居ないことを確認済み（紫/白赤/白金/黄）。
const CHROMA_NOTE = [
  'The background MUST be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the ENTIRE canvas — it is a chroma key screen.',
  'Do NOT draw a checkerboard, a gradient, scenery, ground, shadow or glow.',
  'IMPORTANT: never use green anywhere on the character or the costume, so the key can be pulled cleanly.',
].join(' ');

// 向きの指定。ここが今回の修正の本体。
const FRONT_POSE = [
  'CHANGE ONLY THE DIRECTION SHE FACES. The SECOND image shows the target: a calm FRONT-FACING standing pose,',
  'facing the viewer, BOTH EYES clearly visible, face fully readable, arms relaxed at her sides, feet side by side.',
  'The first image is currently a strict SIDE PROFILE — that is the thing to fix. Turn her to face the viewer.',
  'A very slight three-quarter turn is fine, but BOTH EYES and the whole face must be visible.',
  'Do NOT keep the profile view. Do NOT show only one eye.',
].join(' ');

const KEEP_COSTUME = [
  'The FIRST image is the character and costume reference: keep the SAME girl, the SAME costume, the SAME colours,',
  'the SAME chunky pixel-art style, the SAME 2-heads-tall chibi proportions and the SAME scale and framing.',
  'Do not redesign the outfit, do not change the palette, do not add or remove accessories.',
].join(' ');

const OUTPUT_NOTE = [
  'AUTHENTIC LOW-RESOLUTION PIXEL ART: it must look like it was drawn pixel by pixel on a small grid roughly',
  '64 by 64 pixels and then magnified — LARGE VISIBLE SQUARE PIXELS with hard stair-stepped edges.',
  'Absolutely NO anti-aliasing, NO smooth curves, NO soft shading, NO gradients, NO blur, NO airbrush.',
  'Every area must be a FLAT block of a single colour, with a THICK DARK OUTLINE around the whole character.',
  'Single character only. No text, no border, no watermark.',
  CHROMA_NOTE,
].join(' ');

// 各スキンの「正面にした時に必ず守るもの」。⚠横→正面で崩れやすい所だけを名指しする。
const SKINS = {
  witch: {
    file: 'skin_witch_idle.png',
    note: [
      'She is the LITTLE WITCH: bright violet pointed WITCH HAT with a lighter lavender band, short violet witch DRESS',
      'with a small collar, a purple CAPE, lavender-and-white striped stockings, small dark boots.',
      'In the front view she HOLDS THE WOODEN BROOM UPRIGHT beside her (light-brown handle, tan straw bristles at the',
      'bottom) so the broom stays readable without hiding her face. Her cute face and a wisp of black hair stay clearly',
      'visible under the hat brim — the hat must NOT shadow or cover her eyes.',
    ].join(' '),
  },
  samurai: {
    file: 'skin_samurai_idle.png',
    note: [
      'She is the LITTLE SAMURAI: clean WHITE KIMONO top with a BLACK OBI belt, wide CRIMSON/DEEP-RED HAKAMA trousers,',
      'small black sandals, a RED HEADBAND (hachimaki) across her forehead with short ends, black hair in a HIGH PONYTAIL',
      'with a small red ribbon. The small KATANA in its dark sheath is worn at her LEFT HIP and stays visible from the',
      'front (angled slightly across her body); she is NOT holding it.',
    ].join(' '),
  },
  cyber: {
    file: 'skin_cyber_idle.png',
    note: [
      'She is the CYBER girl: sleek WHITE form-fitting tech bodysuit with thin glowing GOLD circuit lines on the chest,',
      'arms and legs, WHITE gloves, WHITE boots with GOLD soles, a small GOLD tech HEADSET over her ears, and a compact',
      'WHITE thruster backpack with gold trim (in the front view only its edges peek out from behind her shoulders).',
      'Her black hair is in a HIGH PONYTAIL with a gold tie. Palette is strictly WHITE + GOLD + black hair.',
      'Her face stays FULLY VISIBLE: no visor over the eyes, no helmet. NO drone, NO companion robot.',
    ].join(' '),
  },
  ninja: {
    file: 'skin_ninja_idle.png',
    note: [
      'She is the YELLOW NINJA: a yellow ninja HOOD (zukin) framing her face with her cute face CLEARLY VISIBLE through',
      'the face opening (both eyes visible — the hood must not cover them), a yellow ninja jacket with BLACK trim and a',
      'black belt, yellow baggy ninja pants wrapped at the ankles, black hand guards and black tabi feet, and a small',
      'yellow scarf. A tuft of black hair sticks out from the back of the hood.',
    ].join(' '),
  },
};

// ── Gemini 呼び出し（gemini-skin-idol.mjs と同一）──
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

// ── 後処理（gemini-skin-idol.mjs と同一。⚠chromaKey → fillHoles の順）──
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const keyedMask = new Uint8Array(info.width * info.height);
  for (let p = 0, q = 0; p < data.length; p += 4, q++) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (g > 90 && g > r * 1.35 && g > b * 1.35) { data[p + 3] = 0; keyedMask[q] = 1; continue; }
    const rb = (r + b) / 2;
    if (g > rb * 1.15) data[p + 1] = Math.round(rb * 1.15);
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { buf: out, keyedMask, width: info.width, height: info.height };
}
async function fillHoles(keyed) {
  const { buf, keyedMask, width: W, height: H } = keyed;
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const outside = new Uint8Array(W * H), stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (outside[p] || data[p * 4 + 3] >= 8) return;
    outside[p] = 1; stack.push(p);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  for (let p = 0; p < W * H; p++) if (keyedMask[p] && !outside[p]) { outside[p] = 1; stack.push(p); }
  while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  for (let p = 0; p < W * H; p++) data[p * 4 + 3] = outside[p] ? 0 : 255;
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// ── 整列（足元と横中心を player_idle_v1.png に合わせる）──
async function rawRGBA(buf) { const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: r.data, width: r.info.width, height: r.info.height, channels: r.info.channels }; }
function bboxA(d, thr = 50) {
  const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * channels + 3] > thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; }
  }
  return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1 };
}
async function alignToBase(rawBuf, baseName) {
  const baseBuf = await fs.readFile(path.join(IMAGES_DIR, baseName));
  const bBase = bboxA(await rawRGBA(baseBuf));
  const bRaw = bboxA(await rawRGBA(rawBuf));
  let tH = bBase.h;
  let tW = Math.max(1, Math.round(bRaw.w * tH / bRaw.h));
  if (tW > OUT) { tW = OUT; tH = Math.max(1, Math.round(bRaw.h * tW / bRaw.w)); }
  const content = await sharp(rawBuf)
    .extract({ left: bRaw.minX, top: bRaw.minY, width: bRaw.w, height: bRaw.h })
    .resize(tW, tH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const baseCx = bBase.minX + bBase.w / 2;
  let left = Math.round(baseCx - tW / 2); left = Math.max(0, Math.min(OUT - tW, left));
  let top = bBase.maxY - tH + 1; top = Math.max(0, Math.min(OUT - tH, top));
  const composed = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: content, left, top }]).png().toBuffer();
  const { data, info } = await sharp(composed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

await fs.mkdir(RAW_DIR, { recursive: true });
const KEYS = (getArg('only') || Object.keys(SKINS).join(',')).split(',').filter(k => SKINS[k]);

// ── 採用 ──
const PICK = getArg('pick');
if (PICK) {
  const [key, i] = PICK.split(':');
  if (!SKINS[key] || !i) { console.error('使い方: --pick=witch:2'); process.exit(1); }
  const src  = path.join(RAW_DIR, `front_${key}_${i}_keyed.png`);
  const dest = path.join(IMAGES_DIR, SKINS[key].file);
  // ⚠必ず退避してから上書きする（1.668「魔女スキンを上書きしかけた事故」の再発防止）
  await fs.copyFile(dest, path.join(RAW_DIR, `BACKUP_${SKINS[key].file}`));
  await fs.writeFile(dest, await alignToBase(await fs.readFile(src), 'player_idle_v1.png'));
  console.log(`✓ 採用: ${key} 候補${i} → ${dest}（元は _raw/BACKUP_${SKINS[key].file} に退避）`);
  process.exit(0);
}

// ── 比較シート（APIを使わない）──
if (hasFlag('sheet')) {
  const rows = [];
  for (const key of KEYS) {
    const cells = [path.join(IMAGES_DIR, SKINS[key].file)];
    for (let i = 1; i <= 4; i++) {
      const f = path.join(RAW_DIR, `front_${key}_${i}_64.png`);
      try { await fs.access(f); cells.push(f); } catch {}
    }
    rows.push({ key, cells });
  }
  const S = 192, PAD = 8;
  const cols = Math.max(...rows.map(r => r.cells.length));
  const W = cols * S + (cols + 1) * PAD, H = rows.length * S + (rows.length + 1) * PAD;
  const comps = [];
  for (let ri = 0; ri < rows.length; ri++) for (let ci = 0; ci < rows[ri].cells.length; ci++) {
    comps.push({
      input: await sharp(rows[ri].cells[ci]).resize(S, S, { kernel: 'nearest' }).png().toBuffer(),
      left: PAD + ci * (S + PAD), top: PAD + ri * (S + PAD),
    });
  }
  // 見出し（左端=現行 / 右へ候補1..n、行の左肩にスキン名）。⚠人間が選ぶための札なので必ず付ける。
  const NAME = { witch: '魔女ぴよ', samurai: '侍ぴよ', cyber: 'サイバーぴよ', ninja: '忍者ぴよ' };
  const HEAD = 34;
  let svg = `<svg width="${W}" height="${H + HEAD}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<style>text{font-family:-apple-system,'Hiragino Sans',sans-serif;fill:#e8e4f0}</style>`;
  const heads = ['いまの立ち絵（横向き）', '候補1', '候補2', '候補3', '候補4'];
  for (let ci = 0; ci < cols; ci++)
    svg += `<text x="${PAD + ci * (S + PAD) + 4}" y="${HEAD - 12}" font-size="17" font-weight="bold">${heads[ci] || ''}</text>`;
  for (let ri = 0; ri < rows.length; ri++)
    svg += `<text x="${PAD + 4}" y="${HEAD + PAD + ri * (S + PAD) + 20}" font-size="16" font-weight="bold" fill="#ffd84d">${NAME[rows[ri].key] || rows[ri].key}</text>`;
  svg += '</svg>';
  const sheet = path.join(RAW_DIR, '_front_idle_sheet.png');
  await sharp({ create: { width: W, height: H + HEAD, channels: 4, background: { r: 24, g: 22, b: 30, alpha: 255 } } })
    .composite([...comps.map(c => ({ ...c, top: c.top + HEAD })), { input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(sheet);
  console.log(`✓ 比較シート: ${sheet}（各行 左端=現行 / 右へ候補1..n・上から ${rows.map(r => r.key).join(', ')}）`);
  process.exit(0);
}

// ── 生成 ──
if (!hasFlag('gen')) {
  console.error('使い方: node gemini-skin-front-idle.mjs --gen [--only=witch,ninja] [--n=2]  /  --sheet  /  --pick=witch:2');
  process.exit(1);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY がありません（zsh -ic 経由で実行してください）'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });
const frontPart = { inlineData: { mimeType: 'image/png', data: (await fs.readFile(path.join(RAW_DIR, 'base_front_1024.png'))).toString('base64') } };

console.log(`■ 立ち絵を正面向きに描き直す（model=${MODEL} / ${KEYS.join(',')} / 各${N}枚）`);
for (const key of KEYS) {
  // ⚠64pxのまま渡すと情報が足りない。nearest で1024へ拡大（補間はドットが溶けるので禁止）。
  const seed = await sharp(path.join(IMAGES_DIR, SKINS[key].file)).resize(1024, 1024, { kernel: 'nearest' }).png().toBuffer();
  const seedPart = { inlineData: { mimeType: 'image/png', data: seed.toString('base64') } };
  const prompt = [KEEP_COSTUME, SKINS[key].note, FRONT_POSE, OUTPUT_NOTE].join(' ');
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [seedPart, frontPart, { text: prompt }] }]);
    await fs.writeFile(path.join(RAW_DIR, `front_${key}_${i}_raw.png`), buf);
    const keyed = await fillHoles(await chromaKey(buf));
    await fs.writeFile(path.join(RAW_DIR, `front_${key}_${i}_keyed.png`), keyed);
    await fs.writeFile(path.join(RAW_DIR, `front_${key}_${i}_64.png`), await alignToBase(keyed, 'player_idle_v1.png'));
    console.log(`  ✓ ${key} 候補${i}`);
  }
}
console.log('\n比較シートを作る:  node gemini-skin-front-idle.mjs --sheet');
console.log('採用する:          node gemini-skin-front-idle.mjs --pick=<key>:<番号>');
