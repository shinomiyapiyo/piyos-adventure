// ─────────────────────────────────────────────────────────────────────────────
// upscale.mjs — 単一画像を Gemini API で高精細アップスケールする汎用ツール。
// 生成AIによる超解像＝内容・構図・色・キャラは変えず、解像度と鮮明さだけ上げる。
// GEMINI_API_KEY は環境に保存済み（zsh -ic 経由で継承）。
//
// 使い方:
//   zsh -ic 'cd tools && node upscale.mjs <入力画像> [--out=<出力>] [--model=<id>] [--scale=2] [--style]'
//   例: zsh -ic 'cd tools && node upscale.mjs ../images/shop05.jpg --style'
//        → 既定出力 ../images/shop05_up.png
//   --out    出力パス（省略時は <入力>_up.png）
//   --model  既定 gemini-3-pro-image-preview（実機で動作確認済み。gemini-2.5-flash-imageは非対応エラーだった）
//   --scale  最終PNGの目標拡大率（sharpで整える保険。既定2）。AIが返す解像度が主。
//   --style  付けると「2Dアニメ セルシェード厳守（3D/写実化を防止）」の画風固定文をプロンプトに追加
//
// プロンプトは NovelPylot 実績のもの（ユーザー提供）を流用。
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const positional = args.filter(x => !x.startsWith('--'));

const INPUT = positional[0];
if (!INPUT) { console.error('使い方: node upscale.mjs <入力画像> [--out=..] [--model=..] [--scale=2] [--style]'); process.exit(1); }
const MODEL = getArg('model') || 'gemini-3-pro-image-preview';
const SCALE = parseFloat(getArg('scale') || '2');
const USE_STYLE = hasFlag('style');

const inputAbs = path.resolve(process.cwd(), INPUT);
const parsed = path.parse(inputAbs);
const OUT = getArg('out')
  ? path.resolve(process.cwd(), getArg('out'))
  : path.join(parsed.dir, `${parsed.name}_up.png`);

// NovelPylot 実績プロンプト（アップスケール）
const UPSCALE_PROMPT =
  'Upscale this illustration to a higher resolution while preserving the exact same art style, colors, ' +
  'character designs, composition, and every visual detail. Do not alter, redraw, or reinterpret anything—' +
  'only enhance sharpness, clarity, and fine details as a faithful high-resolution version of the same image. ' +
  'Maintain the identical anime/illustration aesthetic without shifting toward realism or any other style.';

// NovelPylot 実績プロンプト（画風固定・--style で付加）
const STYLE_PROMPT =
  'CRITICAL: This is 2D flat anime cel-shaded artwork - NOT 3D, NOT realistic. Maintain the exact same 2D anime ' +
  'illustration style as the reference: flat cel-shading with hard shadow edges, clean vector-like line art, ' +
  'uniform color fills with minimal gradients, bright saturated anime colors. Think Japanese light novel or ' +
  'visual novel character art. AVOID: 3D rendering, realistic shading, soft gradients, painterly effects, ' +
  'photorealism, depth-of-field blur, subsurface scattering, realistic skin texture, ambient occlusion.';

const PROMPT = USE_STYLE ? (STYLE_PROMPT + '\n\n' + UPSCALE_PROMPT) : UPSCALE_PROMPT;

async function inlinePart(abs) {
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return { inlineData: { mimeType, data: buf.toString('base64') } };
}
function extractImg(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.inlineData?.data) return Buffer.from(p.inlineData.data, 'base64');
  const text = parts.map(p => p.text).filter(Boolean).join('\n');
  throw new Error('画像が返りませんでした。' + (text ? `\n応答:\n${text}` : ''));
}
async function callModel(ai, contents) {
  let lastErr;
  for (let a = 1; a <= 4; a++) {
    try { const r = await ai.models.generateContent({ model: MODEL, contents }); return extractImg(r); }
    catch (e) { lastErr = e; const w = 2500 * a; console.warn(`  失敗(${a}/4): ${e.message}  ${w}ms待機`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で実行）'); process.exit(1); }

const meta = await sharp(inputAbs).metadata();
console.log(`入力: ${INPUT} (${meta.width}x${meta.height})  モデル: ${MODEL}  style:${USE_STYLE}`);
const ai = new GoogleGenAI({ apiKey });
const ref = await inlinePart(inputAbs);
console.log('● アップスケール生成中...');
const raw = await callModel(ai, [ ref, { text: PROMPT } ]);

// AI出力を、元の縦横比で目標解像度(元幅×SCALE)に整える保険（Geminiの返す寸法がまちまちなため）
const targetW = Math.round((meta.width || 512) * SCALE);
const out = await sharp(raw).resize({ width: targetW, withoutEnlargement: false }).png().toBuffer();
await fs.writeFile(OUT, out);
const outMeta = await sharp(out).metadata();
console.log(`✓ 出力: ${OUT} (${outMeta.width}x${outMeta.height})`);
