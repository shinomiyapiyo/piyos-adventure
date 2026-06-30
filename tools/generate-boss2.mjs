// ─────────────────────────────────────────────────────────────────────────────
// generate-boss2.mjs
// 空中ボス（hawk）のスプライト5ポーズを Gemini (Nano Banana 2 / Gemini 3 Pro Image)
// で生成し、128×128 透過PNGに整えて ../images/ に保存する開発用スクリプト。
//
// ゲーム本体には同梱しない（dev tool）。sw.js / sprites.js への登録は不要。
//
// 【使い方】
//   1) cd games/piyo-adventure/tools
//   2) npm install            （@google/genai と sharp が入る）
//   3) export GEMINI_API_KEY=（あなたのキー）   ※Windowsは set / $env:GEMINI_API_KEY=
//   4) node generate-boss2.mjs
//
//   オプション:
//     --only=idle,dive      指定ポーズだけ生成（カンマ区切り）
//     --reprocess           API生成せず、既存 _raw/boss2_<pose>_raw.png から透過後処理だけやり直す（--only 併用可）
//     --no-key              白背景キーイングを無効化（既にアルファ付きの出力向け）
//     --chroma              白キーの代わりに四隅サンプルのハードキーを使う（白以外の背景向け）
//     --no-postprocess      128化/透過化をせず、生成された生画像だけ _raw/ に残す
//     --model=<id>          モデルIDを上書き（環境変数 GEMINI_IMAGE_MODEL でも可）
//
//   ※ Gemini は「透過背景」指示でも白背景を返すため、既定でグラデ白キーを掛けて透過化する。
//
// 【一貫性のコツ（初代Nano Bananaでポーズが揃わなかった対策）】
//   - まず idle を生成し、その idle を「キャラ参照」として他ポーズへ渡す（同一個体を維持）。
//   - 既存ボス boss_idle.png / boss_walk.png を「画風参照」として全生成に渡す（世界観を揃える）。
//   - プロンプトの“型”（STYLE_PREAMBLE）を全ポーズで固定する。
//
// 生成がイマイチなら、プロンプト（POSES）や MODEL を調整して再実行すればよい。
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

// ── モデルID ───────────────────────────────────────────────────────────────
// 2026-06 時点の公式docs確認結果:
//   Nano Banana Pro = Gemini 3 Pro Image     → 'gemini-3-pro-image'（最高品質・既定。複雑な指示に強い）
//   Nano Banana 2   = Gemini 3.1 Flash Image → 'gemini-3.1-flash-image'（高速・低コスト）
//   初代 Nano Banana = Gemini 2.5 Flash Image → 'gemini-2.5-flash-image'（フォールバック）
// 既定は preview 接尾辞が取れて GA 化済み。違っていれば --model / GEMINI_IMAGE_MODEL で上書きすること。
const DEFAULT_MODEL = 'gemini-3-pro-image';

// ── 引数パース ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg  = (name) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (name) => args.includes(`--${name}`);

const MODEL        = getArg('model') || process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
const ONLY         = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const USE_CHROMA   = hasFlag('chroma');
const NO_KEY       = hasFlag('no-key');
const REPROCESS    = hasFlag('reprocess');
const POSTPROCESS  = !hasFlag('no-postprocess');
const OUT_SIZE     = 128;

// ── 画風の固定文言（全ポーズ共通） ───────────────────────────────────────────
const STYLE_PREAMBLE = [
  'A single boss enemy character for a retro side-scrolling pixel-art game.',
  'Subject: a menacing dark aerial bird boss — a giant hawk/eagle with sharp talons,',
  'glowing eyes, and a sinister presence, matching the "dark giant chicken boss" art style',
  'of the reference images (same painterly-pixel look, same lighting and color depth).',
  'Color palette: dark purples, blacks, and deep crimson accents to fit a night/boss stage.',
  'IMPORTANT REQUIREMENTS:',
  '- Character FACING LEFT.',
  '- Fully TRANSPARENT background (alpha), no scenery, no ground, no shadow baked in.',
  '- Single character only, centered, full body visible with margin around it.',
  '- Clean readable silhouette suitable for downscaling to 128x128 pixels.',
  '- No text, no UI, no watermark, no border.',
].join('\n');

// ── 生成するポーズ ───────────────────────────────────────────────────────────
// key は出力ファイル名 boss2_<key>.png に対応（HANDOFF.md §3 と一致させること）
const POSES = [
  { key: 'idle',    anchor: true,
    pose: 'POSE: hovering in place, wings spread wide and steady, calm but threatening. Neutral idle pose.' },
  { key: 'flap',
    pose: 'POSE: mid wing-flap, wings raised upward, gaining a little altitude. Used as the alternate hover frame.' },
  { key: 'dive',
    pose: 'POSE: diving attack, wings tucked back, body angled steeply downward, beak/talons leading, aggressive and fast.' },
  { key: 'shoot',
    pose: 'POSE: launching attack, wings flared forward, releasing sharp feather projectiles, dynamic offensive stance.' },
  { key: 'damaged',
    pose: 'POSE: taking damage, recoiling backward, head thrown back, wings flailing, hurt expression.' },
];

// ─────────────────────────────────────────────────────────────────────────────

async function fileToInlinePart(absPath) {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return { inlineData: { mimeType, data: buf.toString('base64') } };
}

function extractImageBuffer(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  }
  // テキストしか返らなかった場合はプロンプト調整のヒントとしてログ
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\nモデルの応答テキスト:\n${text}` : ''));
}

async function generateOne(ai, pose, styleRefs, charRef) {
  const contents = [];
  // 画風参照（既存ボス）
  for (const ref of styleRefs) contents.push(ref);
  // キャラ参照（生成済みの idle があれば同一個体を維持）
  if (charRef) {
    contents.push({ text: 'Keep the SAME character/individual as this previously generated image, only change the pose:' });
    contents.push(charRef);
  }
  contents.push({ text: `${STYLE_PREAMBLE}\n\n${pose.pose}` });

  // 簡易リトライ（レート制限・一時エラー対策）
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await ai.models.generateContent({ model: MODEL, contents });
      return extractImageBuffer(response);
    } catch (e) {
      lastErr = e;
      const wait = 2000 * attempt;
      console.warn(`  [${pose.key}] 失敗(${attempt}/4): ${e.message}\n  ${wait}ms 待って再試行...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// 透過処理: 四隅から背景色をサンプルし、近い色をアルファ0にする（--chroma 時のみ）
async function chromaKeyToAlpha(buf) {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4
  const corners = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ].map(([x, y]) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  });
  // 四隅の平均をキー色に
  const key = [0, 1, 2].map(c => Math.round(corners.reduce((s, p) => s + p[c], 0) / corners.length));
  const TOL = 38; // 許容差（調整可）
  for (let i = 0; i < data.length; i += channels) {
    const d = Math.abs(data[i] - key[0]) + Math.abs(data[i + 1] - key[1]) + Math.abs(data[i + 2] - key[2]);
    if (d <= TOL * 3) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

// 白背景キーイング（グラデ式）: fg = max(暗さ, 彩度) を smoothstep でアルファ化する。
// 白背景→透明、暗い/鮮やかな前景→不透明。エッジが滑らかでハロー（白ふち）が出にくい。
// 既存アルファは超えない（＝もともと透明な領域を塗り潰さない）ので、将来モデルが真の透過を返しても安全。
async function gradedWhiteKey(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const LO = 40, HI = 100;
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    const fg = Math.max(255 - mn, mx - mn); // 暗さ or 彩度が高いほど前景
    const a = Math.round(ss(LO, HI, fg) * 255);
    if (a < data[i + 3]) data[i + 3] = a; // 既存アルファを上回って不透明化しない
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function postProcess(rawBuf) {
  let buf = rawBuf;
  // 透過化: 既定はグラデ白キー。--chroma で四隅ハードキー、--no-key で無効化。
  if (USE_CHROMA) buf = await chromaKeyToAlpha(buf);
  else if (!NO_KEY) buf = await gradedWhiteKey(buf);
  // 余白をトリムしてから 128×128 の透明キャンバスへ contain 配置
  return sharp(buf)
    .ensureAlpha()
    .trim()
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !REPROCESS) {
    console.error('✗ 環境変数 GEMINI_API_KEY が設定されていません。');
    console.error('  例: export GEMINI_API_KEY="..."  を実行してから再度お試しください。');
    process.exit(1);
  }

  await fs.mkdir(RAW_DIR, { recursive: true });
  const ai = REPROCESS ? null : new GoogleGenAI({ apiKey });

  console.log(`モデル: ${REPROCESS ? '(再後処理のみ・API未使用)' : MODEL}`);
  console.log(`出力先: ${IMAGES_DIR}`);
  if (USE_CHROMA) console.log('背景透過: --chroma 有効（四隅サンプルでキーイング）');

  // 画風参照（既存ボス）※生成時のみ使用
  const styleRefs = [];
  if (!REPROCESS) for (const f of ['boss_idle.png', 'boss_walk.png']) {
    const p = path.join(IMAGES_DIR, f);
    try { styleRefs.push(await fileToInlinePart(p)); }
    catch { console.warn(`  画風参照 ${f} を読めませんでした（スキップ）`); }
  }

  const targets = ONLY.length ? POSES.filter(p => ONLY.includes(p.key)) : POSES;
  // idle を最初に処理してキャラ参照に使うため並べ替え（anchor を先頭へ）
  targets.sort((a, b) => (b.anchor ? 1 : 0) - (a.anchor ? 1 : 0));

  let charRef = null; // 生成済み idle をここに保持
  // --only で idle を含めない場合、既存の boss2_idle.png があればキャラ参照に使う
  if (!REPROCESS && !targets.some(t => t.anchor)) {
    const existingIdle = path.join(IMAGES_DIR, 'boss2_idle.png');
    try { charRef = await fileToInlinePart(existingIdle); console.log('  既存 boss2_idle.png をキャラ参照に使用'); }
    catch { /* なければ無し */ }
  }

  for (const pose of targets) {
    let raw;
    if (REPROCESS) {
      const rawPath = path.join(RAW_DIR, `boss2_${pose.key}_raw.png`);
      try { raw = await fs.readFile(rawPath); }
      catch { console.warn(`\n● ${pose.key}: 既存の生画像が無いためスキップ（${rawPath}）`); continue; }
      console.log(`\n● ${pose.key} を既存生画像から再後処理...`);
    } else {
      console.log(`\n● ${pose.key} を生成中...`);
      raw = await generateOne(ai, pose, styleRefs, pose.anchor ? null : charRef);
      // 生画像を保存（後処理前。デバッグ・再利用用）
      await fs.writeFile(path.join(RAW_DIR, `boss2_${pose.key}_raw.png`), raw);
      // idle はキャラ参照として後続に渡す
      if (pose.anchor) charRef = { inlineData: { mimeType: 'image/png', data: raw.toString('base64') } };
    }

    if (POSTPROCESS) {
      const out = await postProcess(raw);
      const outPath = path.join(IMAGES_DIR, `boss2_${pose.key}.png`);
      await fs.writeFile(outPath, out);
      console.log(`  ✓ 保存: images/boss2_${pose.key}.png（128×128 透過）`);
    } else {
      console.log(`  ✓ 生画像のみ保存: tools/_raw/boss2_${pose.key}_raw.png`);
    }
  }

  console.log('\n完了。images/ の boss2_*.png を既存ボスと並べて違和感がないか確認してください。');
  console.log('気に入らないポーズは  node generate-boss2.mjs --only=<pose>  で個別に作り直せます。');
}

main().catch(e => { console.error('\n✗ エラー:', e); process.exit(1); });
