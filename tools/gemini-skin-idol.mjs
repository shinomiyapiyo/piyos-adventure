// ─────────────────────────────────────────────────────────────────────────────
// gemini-skin-idol.mjs — きせかえ「アイドルぴよ」(タイトルショップ 200,000円・1.666) の立ち絵を作る。
// 能力: 5秒ごとに 自分のまわり2マスへ全方向の一撃（実装済み・1.666）。ここでは見た目だけ作る。
//
// 意匠: **ぴよ氏本人のアイドル衣装**（公認・実物の写真 IMG_0950.jpg を見て特徴を書き起こしたもの）。
//   ⚠**写真そのものはAPIへ送らない**。実在の人物の写真を外部サービスへ渡さずに済むよう、
//     衣装の特徴だけを文章にして渡す。identity のもとは既存のゲーム内キャラ（oai_base_side_2_1024.png）。
//   ゆめかわ系パステル（黄×白×ピンク×ミント）／巨大な白い透けフリルのパフスリーブ／
//   胸元に**ひよこ**のワッペン／段々フリルのミニスカート／黄色ギンガムのレッグウォーマー。
//   ⚠既存スキンとの差別化: 黄色は デフォルト/メイド/忍者 と被るが、**シルエットが違う**（巨大な袖と
//     段々スカート）ので小さくても見分けが付く。ここが崩れると"ただの黄色い子"になるので最優先で守る。
//
// ⚠画像生成は **Gemini（gemini-3-pro-image）**。OpenAIはクレジット切れで終了（2026-07-28ユーザー通告）。
//   そのため既存の generate-skin-*-openai.mjs はもう回せない。整列ロジックだけあちらから流用している。
// ⚠**Geminiは透過PNGを返さない** → 緑背景を指定して chromaKey で抜く（gemini-ug-pass-chest.mjs と同じ）。
//
// モード:
//   --anchor --n=3   立ち絵の候補を生成 → _raw/idol_anchor_<i>_raw.png（生）と _raw/idol_anchor_<i>_64.png（実寸）
//                    ⚠**人間が選ぶ**。候補を見せずに確定しないこと。
//   --pick=<i>       候補<i>を player_idle_v1.png に整列して images/skin_idol_idle.png (64x64) を書き出す
//
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node gemini-skin-idol.mjs --anchor --n=3'
//   ※ GEMINI_API_KEY はログインシェル経由（zsh -ic）で読み込む
//
// 確定後に Claude 側でやること:
//   ・images/skin_idol_idle.png を差し替え（今は仮＝デフォルト立ち絵 player_idle_v1.png）
//   ・SKINS の preview / TITLE_SHOP_UPGRADES.idol_piyo の iconImg / 図鑑 item:skin_idol の img を差し替え
//   ・歩行などの差分コマは**必ず Veo 動画からコマ切り出し**（独立生成はモーションが崩れる）＝veo-*-walk.mjs を流用
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
const N       = Math.max(1, Math.min(6, parseInt(getArg('n') || '3', 10)));
const PICK    = getArg('pick');
// ⚠**正面向きの種を使う**（1.666）。当初は魔女/忍者と同じ横向きの種にしたが、横向きでは
//   **ツインテールが片方隠れて読めない**（ユーザー指摘）。ゲームのデフォルト立ち絵 player_idle_v1.png と
//   メイドぴよは正面向きで両方の尾が見えており、そちらが本来の見本。
//   base_front_1024.png = player_idle_v1.png を nearest で1024へ拡大しただけのもの（ドットが溶けない）。
const BASE    = path.join(RAW_DIR, 'base_front_1024.png');

// ⚠背景は緑（#00FF00）。衣装がパステル黄/白/桃/ミントなので、緑だけは衣装に一切使わせない。
const CHROMA_NOTE = [
  'The background MUST be a FLAT SOLID PURE GREEN (#00FF00) rectangle filling the entire canvas — it is a chroma key screen.',
  'Do NOT draw a checkerboard, do NOT draw a gradient, do NOT draw scenery, ground, shadow or glow.',
  'IMPORTANT: never use green anywhere on the character or the costume, so the key can be pulled cleanly.',
].join(' ');

// ぴよ氏のアイドル衣装（実物の特徴を書き起こし）。
// ⚠**2回目の指摘（1.666）**: **白い猫耳カチューシャ**が抜けていた（実物の写真にある）。
//   耳はシルエットとして一番よく効く要素なので、パフスリーブと並ぶ最優先の指定にしてある。
// ⚠**1回目の失敗（1.666）**: 実物どおりに「ギンガムチェック/ビーズ/レースの質感」まで書いたら、
//   Gemini は情報量の多い**滑らかなイラスト**を返し、64pxへ縮めた時点で線が消えて
//   「ドット絵っぽくない」と却下された。後処理（色数削減・輪郭付け）でも救えない。
//   → **64pxに入る情報量まで意匠を削る**のが正解。細かい柄は捨て、大きな色の面として書く。
//   既存スキン（魔女=帽子+ワンピ+ほうきの3要素）と同じ密度まで落とす。
const IDOL_IDENTITY = [
  'The character is the SAME chibi pixel-art girl as the input image (same cute face, same big eyes, same long black',
  'twin-tails, same 2-heads-tall chibi proportions, same FRONT-FACING standing pose, same scale and position),',
  'but her outfit is replaced with a CUTE PASTEL IDOL STAGE COSTUME.',
  'Draw it as BIG SIMPLE FLAT SHAPES — this is a tiny sprite, so SIMPLIFY HARD:',
  '(1) BIG FLUFFY WHITE CAT EARS on a headband on top of her head — two large rounded, slightly pointed white ears',
  'standing up above her hair, with a soft pink inner ear. They must clearly stick out of her silhouette;',
  '(2) one ENORMOUS round WHITE puff sleeve on her arm — a big white ball shape;',
  '(3) a short PASTEL YELLOW top with a small YELLOW CHICK face on the chest;',
  '(4) a flared skirt made of THREE flat horizontal colour bands, top to bottom: soft PINK, pastel YELLOW, pale MINT;',
  '(5) PASTEL YELLOW leg warmers with a white cuff, and small yellow shoes;',
  '(6) a YELLOW RIBBON on EACH of her two twin-tails (one on the left, one on the right).',
  'The WHITE CAT EARS and the WHITE PUFF SLEEVE are the two features that must survive at tiny size — draw them big.',
  'NO check patterns, NO gingham, NO beads, NO lace texture, NO tiny frills, NO gradients — those disappear at this size.',
  'Palette: about 10 FLAT colours only (pastel yellow, white, soft pink, pale mint, black hair, dark outline).',
  'Bright, sweet and high-contrast with a THICK DARK OUTLINE around the whole character. NOT dark, NOT muddy.',
].join(' ');

const ANCHOR_OUTPUT = [
  'AUTHENTIC LOW-RESOLUTION PIXEL ART: it must look like it was drawn pixel by pixel on a small grid roughly',
  '64 by 64 pixels and then magnified — LARGE VISIBLE SQUARE PIXELS with hard stair-stepped edges.',
  'Absolutely NO anti-aliasing, NO smooth curves, NO soft shading, NO gradients, NO blur, NO airbrush.',
  'Every area must be a FLAT block of a single colour. Same chunky pixel style as the input image.',
  'Same calm FRONT-FACING standing pose as the input image — facing the viewer, with BOTH TWIN-TAILS clearly',
  'visible on the left and the right of her head (this is the whole point of the front view).',
  'Single character only, same 2-heads-tall scale and same position',
  'in frame as the input image. No text, no border, no watermark.',
  CHROMA_NOTE,
].join(' ');

// ── Gemini 呼び出し ──
function extractImageBuffer(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\nモデル応答:\n${text}` : ''));
}
async function fileToPart(abs) {
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  return { inlineData: { mimeType: (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png', data: buf.toString('base64') } };
}
async function callModel(ai, contents) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { const resp = await ai.models.generateContent({ model: MODEL, contents }); return extractImageBuffer(resp); }
    catch (e) { lastErr = e; const w = 2500 * attempt; console.warn(`  失敗(${attempt}/4): ${e.message}  ${w}ms待機...`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

// ── 後処理（gemini-ug-pass-chest.mjs と同一。⚠chromaKey → fillHoles の順を守る）──
async function chromaKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const keyedMask = new Uint8Array(info.width * info.height);   // 「緑として抜いた」画素の記録
  for (let p = 0, q = 0; p < data.length; p += 4, q++) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (g > 90 && g > r * 1.35 && g > b * 1.35) { data[p + 3] = 0; keyedMask[q] = 1; continue; } // 背景
    const rb = (r + b) / 2;                                                                      // 縁のスピル除去
    if (g > rb * 1.15) data[p + 1] = Math.round(rb * 1.15);
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { buf: out, keyedMask, width: info.width, height: info.height };
}
// 外周から届かない透明画素（＝シルエット内側の穴）を不透明に戻す。
// ⚠**chromaKey が抜いた画素は絶対に塗り戻さない**（1.666の教訓）。
//   Gemini は緑を「カンバス全面」ではなく**内側の長方形**として描くことがあり、その外に白い余白が付く。
//   旧実装は外周から流し込むだけだったので、白い余白で流れが止まり、緑の内側が「穴」と判定されて
//   全部塗り戻されていた＝**背景の緑がそのまま残った**（候補1で発生）。
//   抜いた画素を種としても流し込むことで、緑がどこにあっても必ず外側として扱われる。
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
  for (let p = 0; p < W * H; p++) if (keyedMask[p] && !outside[p]) { outside[p] = 1; stack.push(p); } // 緑だった所も種にする
  while (stack.length) { const p = stack.pop(), x = p % W, y = (p - x) / W; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  for (let p = 0; p < W * H; p++) data[p * 4 + 3] = outside[p] ? 0 : 255;
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// ── 整列（generate-skin-witch-openai.mjs と同一ロジック）──
// ⚠**足元と横中心を player_idle_v1.png に合わせる**。ここを合わせないと、着替えた瞬間に
//   キャラが浮いたり沈んだりして見える（歩行アニメとも段差ができる）。
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
  const dRaw = await rawRGBA(rawBuf);
  const bRaw = bboxA(dRaw);
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
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 96 ? 255 : 0;   // 半透明の縁を潰す
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

await fs.mkdir(RAW_DIR, { recursive: true });

// ── 再キーイング（--rekey）: **APIを使わず** _raw の生画像から後処理だけやり直す。
//   クロマキー/穴埋めを直した時に、生成し直さずに済ませるための入口。
if (hasFlag('rekey')) {
  const files = (await fs.readdir(RAW_DIR)).filter(f => /^idol_anchor_\d+_raw\.png$/.test(f)).sort();
  for (const f of files) {
    const i = f.match(/_(\d+)_raw/)[1];
    const keyed = await fillHoles(await chromaKey(await fs.readFile(path.join(RAW_DIR, f))));
    await fs.writeFile(path.join(RAW_DIR, `idol_anchor_${i}_keyed.png`), keyed);
    await fs.writeFile(path.join(RAW_DIR, `idol_anchor_${i}_64.png`), await alignToBase(keyed, 'player_idle_v1.png'));
    console.log(`  ✓ 再処理 候補${i}`);
  }
  process.exit(0);
}

// ── 横向きアンカー（--side）: 歩行アニメ用の種を作る ──
// ⚠**確定した立ち絵 images/skin_idol_idle.png を種にする**。別の種から起こすと衣装が微妙にズレて、
//   立ち絵と歩行で別人になる。既存も同じ構成（メイドぴよ＝正面の立ち絵＋横向きの歩行）。
// ⚠64pxのまま渡すと情報が足りないので nearest で1024へ拡大して渡す（補間はドットが溶けるので禁止）。
if (hasFlag('side')) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('✗ GEMINI_API_KEY がありません（zsh -ic 経由で実行してください）'); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey });
  const seed = await sharp(path.join(IMAGES_DIR, 'skin_idol_idle.png'))
    .resize(1024, 1024, { kernel: 'nearest' }).png().toBuffer();
  const seedPart = { inlineData: { mimeType: 'image/png', data: seed.toString('base64') } };
  const SIDE_PROMPT = [
    'Redraw the EXACT SAME chibi pixel-art girl from the input image, with the IDENTICAL costume, colours and',
    'proportions, but turned to a SIDE VIEW FACING RIGHT (a profile standing pose for a side-scrolling game).',
    'Keep every costume element: the BIG FLUFFY WHITE CAT EARS on her headband, the big round WHITE puff sleeve,',
    'the pastel yellow top with the yellow chick on the chest, the pink/yellow/mint tiered skirt, the pastel yellow',
    'leg warmers with white cuffs, the yellow shoes, and her LONG BLACK TWIN-TAILS with yellow ribbons',
    '(in side view the twin-tails hang together behind her and must stay clearly visible).',
    'AUTHENTIC LOW-RESOLUTION PIXEL ART with large visible square pixels, flat colour blocks, a thick dark outline,',
    'no anti-aliasing, no gradients, no blur. Single character only, same scale, standing on the same baseline.',
    'No text, no border, no watermark.',
    CHROMA_NOTE,
  ].join(' ');
  console.log(`■ アイドルぴよ 横向きアンカー（model=${MODEL} / n=${N}）`);
  for (let i = 1; i <= N; i++) {
    const buf = await callModel(ai, [{ role: 'user', parts: [seedPart, { text: SIDE_PROMPT }] }]);
    await fs.writeFile(path.join(RAW_DIR, `idol_side_${i}_raw.png`), buf);
    const keyed = await fillHoles(await chromaKey(buf));
    await fs.writeFile(path.join(RAW_DIR, `idol_side_${i}_keyed.png`), keyed);
    await fs.writeFile(path.join(RAW_DIR, `idol_side_${i}_64.png`), await alignToBase(keyed, 'player_idle_v1.png'));
    console.log(`  ✓ 候補${i}`);
  }
  process.exit(0);
}

// ── 採用モード ──
if (PICK) {
  const src = path.join(RAW_DIR, `idol_anchor_${PICK}_keyed.png`);
  const out = path.join(IMAGES_DIR, 'skin_idol_idle.png');
  await fs.writeFile(out, await alignToBase(await fs.readFile(src), 'player_idle_v1.png'));
  console.log(`✓ 採用: 候補${PICK} → ${out}`);
  process.exit(0);
}

// ── 生成モード ──
if (!hasFlag('anchor')) {
  console.error('使い方: node gemini-skin-idol.mjs --anchor --n=3   /   node gemini-skin-idol.mjs --pick=2');
  process.exit(1);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY がありません（zsh -ic 経由で実行してください）'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });
const basePart = await fileToPart(BASE);

console.log(`■ アイドルぴよ 立ち絵候補（model=${MODEL} / n=${N}）`);
for (let i = 1; i <= N; i++) {
  const buf = await callModel(ai, [{ role: 'user', parts: [basePart, { text: IDOL_IDENTITY + ' ' + ANCHOR_OUTPUT }] }]);
  await fs.writeFile(path.join(RAW_DIR, `idol_anchor_${i}_raw.png`), buf);                        // 生（緑背景のまま）
  const keyed = await fillHoles(await chromaKey(buf));
  await fs.writeFile(path.join(RAW_DIR, `idol_anchor_${i}_keyed.png`), keyed);                    // 背景を抜いた大きいまま
  await fs.writeFile(path.join(RAW_DIR, `idol_anchor_${i}_64.png`), await alignToBase(keyed, 'player_idle_v1.png')); // 実寸プレビュー
  console.log(`  ✓ 候補${i}`);
}
console.log('\n候補を確認してから採用してください:  node gemini-skin-idol.mjs --pick=<番号>');
