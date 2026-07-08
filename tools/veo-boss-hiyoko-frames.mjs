// veo-boss-hiyoko-frames.mjs — veo_boss2 の指定コマを緑クロマキー→128px透過で書き出し、闇のカラスの各ポーズにする。
// 事前に _raw/boss2_frames/f_NNN.png（ffmpegで全コマ抽出）が必要。
//   node veo-boss-hiyoko-frames.mjs --idle=161 --flap=173 --dive=37 --shoot=117 --damaged=109
//   --preview のみ付けると images/ は上書きせず _raw/hiyoko_preview.png だけ作る（判定用）
// 出力: images/boss_hiyoko_<pose>.png（128透過） ＋ _raw/hiyoko_preview.png（5ポーズ一覧）
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '_raw');
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const framesDir = path.join(RAW_DIR, 'hiyoko_frames');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const PREVIEW_ONLY = args.includes('--preview');
const OUT = 128;
const POSES = ['walk_1', 'walk_2', 'walk_3', 'walk_4', 'jump', 'rush', 'damaged'];
const picks = {};
for (const p of POSES) { const v = getArg(p); if (v) picks[p] = parseInt(v, 10); }

async function rawRGBA(buf) { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, ...info }; }
function bboxA(d) { const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (data[(y * width + x) * channels + 3] > 50) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; } } return { minX: a, minY: b, w: c - a + 1, h: e - b + 1 }; }

// 外周flood-fillのクロマキー。背景色はフレームごとに四隅からサンプルし、緑でも白でも対応する。
// （Veoが背景を緑↔白で揺らすため。外周連結のみ消す＝キャラ内部の炎ハイライトは穴にしない）＋緑背景時のみデスピル。
async function chromaKey(framePath) {
    const d = await rawRGBA(await fs.readFile(framePath));
    const { data, width, height, channels } = d;
    // Veoが背景を緑↔白で揺らす（縁は緑・キャラ周りに白い箱、など）ため、背景は「緑 or 白」を外周floodで消す。
    // 外周連結のみ消すので、キャラ内部の炎の明るいコア（非連結）は穴にならない。
    const isGreenBg = true; // 緑デスピルは常に掛けてOK（白背景側は緑成分が少なく無害）
    const near = (i) => {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // 緑背景
        if ((g - Math.max(r, b)) > 32 && g > 70) return true;
        // 白/明るい低彩度背景（Veoの白箱・白ハロー対策）
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        if (mn > 172 && (mx - mn) < 46) return true;
        return false;
    };
    const bg = new Uint8Array(width * height);
    const stack = [];
    for (let x = 0; x < width; x++) { stack.push(x); stack.push((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { stack.push(y * width); stack.push(y * width + width - 1); }
    while (stack.length) {
        const p = stack.pop();
        if (bg[p] || !near(p * channels)) continue;
        bg[p] = 1;
        const x = p % width, y = (p / width) | 0;
        if (x > 0) stack.push(p - 1); if (x < width - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - width); if (y < height - 1) stack.push(p + width);
    }
    for (let p = 0; p < width * height; p++) {
        const i = p * channels;
        if (bg[p]) { data[i + 3] = 0; continue; }
        if (isGreenBg) { const mxRB = Math.max(data[i], data[i + 2]); if (data[i + 1] > mxRB) data[i + 1] = mxRB; } // 緑フリンジ除去
    }
    return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function poseSprite(frameNum) {
    const fp = path.join(framesDir, `f_${String(frameNum).padStart(3, '0')}.png`);
    const keyed = await chromaKey(fp);
    const bb = bboxA(await rawRGBA(keyed));
    const cropped = await sharp(keyed).extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h }).png().toBuffer();
    return sharp(cropped).resize(OUT, OUT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function main() {
    const sprites = {};
    for (const p of POSES) {
        if (!picks[p]) { console.warn(`? ${p}: フレーム未指定（スキップ）`); continue; }
        sprites[p] = await poseSprite(picks[p]);
        if (!PREVIEW_ONLY) { await fs.writeFile(path.join(IMAGES_DIR, `boss_hiyoko_${p}.png`), sprites[p]); console.log(`  ✓ images/boss_hiyoko_${p}.png ← f_${picks[p]}`); }
    }
    // 判定用プレビュー（暗背景に5ポーズ＋ラベル）
    const done = POSES.filter(p => sprites[p]);
    const CW = 150, LABEL_H = 20;
    const comps = [];
    for (let i = 0; i < done.length; i++) {
        const p = done[i];
        const cell = await sharp(sprites[p]).resize(CW - 12, CW - 12, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        comps.push({ input: cell, left: i * CW + 6, top: 6 });
        const label = Buffer.from(`<svg width="${CW}" height="${LABEL_H}"><text x="${CW / 2}" y="15" text-anchor="middle" font-family="monospace" font-size="14" font-weight="bold" fill="#ffd700">${p} (${picks[p]})</text></svg>`);
        comps.push({ input: label, left: i * CW, top: CW });
    }
    await sharp({ create: { width: done.length * CW, height: CW + LABEL_H, channels: 4, background: { r: 24, g: 22, b: 40, alpha: 1 } } })
        .composite(comps).png().toFile(path.join(RAW_DIR, 'hiyoko_preview.png'));
    console.log(`✓ _raw/hiyoko_preview.png（${done.length}ポーズ）`);
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
