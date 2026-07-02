// ─────────────────────────────────────────────────────────────────────────────
// veo-frames-to-enemy.mjs — Veo の緑背景歩行動画をバイオーム雑魚の walk スプライトへ変換。
// ffmpegコマ抽出 → 緑クロマキー＋デスピル → enemy_chick_walk_1 基準の身長/足元へ整列 → 64×64。
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node veo-frames-to-enemy.mjs --id=quail --extract'
//   --id=quail|enaga|owl / --frames=40,46,52,58 / --extract（ffmpeg実行） / --no-commit
// 出力: _raw/ve_<id>_walk_<n>_(64|256).png。コミット時 images/enemy_<id>_walk_<n>.png
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const ID      = getArg('id');
const FRAMES  = (getArg('frames') || '40,46,52,58').split(',').map(s => parseInt(s.trim(), 10));
const EXTRACT = hasFlag('extract');
const COMMIT  = !hasFlag('no-commit');
const FLOP    = hasFlag('flop'); // Veoが左向きで生成した場合に反転して右向きへ（パイプラインは右向き前提）
const OUT = 64;

async function rawRGBA(buf) { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, ...info }; }
function bboxA(d) { const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (data[(y * width + x) * channels + 3] > 50) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; } } return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1, width, height }; }

// 緑クロマキー（外周flood-fill版）＋デスピル。
// 背景＝「画像の縁から緑続きで到達できる領域」だけを透過する。キャラ内部の緑アーティファクト
// （Veoが目などに緑を混ぜることがある）は穴にせず、デスピルで暗色化して残す。
async function chromaKey(framePath) {
    const d = await rawRGBA(await fs.readFile(framePath));
    const { data, width, height, channels } = d;
    const isGreen = (i) => { const g = data[i + 1], mxRB = Math.max(data[i], data[i + 2]); return (g - mxRB) > 35 && g > 70; };
    // 外周からflood-fillして背景マスクを作る
    const bg = new Uint8Array(width * height);
    const stack = [];
    for (let x = 0; x < width; x++) { stack.push(x); stack.push((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { stack.push(y * width); stack.push(y * width + width - 1); }
    while (stack.length) {
        const p = stack.pop();
        if (bg[p]) continue;
        if (!isGreen(p * channels)) continue;
        bg[p] = 1;
        const x = p % width, y = (p / width) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < width - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - width);
        if (y < height - 1) stack.push(p + width);
    }
    for (let p = 0; p < width * height; p++) {
        const i = p * channels;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mxRB = Math.max(r, b);
        const greenness = g - mxRB;
        if (bg[p]) { data[i + 3] = 0; continue; }                 // 背景（縁から緑続き）→ 透過
        if (greenness > 18) {                                     // キャラ内部/縁の緑: デスピル（穴にしない）
            data[i + 1] = mxRB;
            // 背景に隣接する画素だけ軽く半透明化（縁のなじませ）
            const x = p % width, y = (p / width) | 0;
            const nearBg = (x > 0 && bg[p - 1]) || (x < width - 1 && bg[p + 1]) || (y > 0 && bg[p - width]) || (y < height - 1 && bg[p + width]);
            if (nearBg) {
                const t = Math.min(1, (greenness - 18) / 32);
                data[i + 3] = Math.round(data[i + 3] * (1 - 0.8 * t));
            }
        } else if (greenness > 0) { data[i + 1] = mxRB; }
    }
    return d;
}
async function despillPng(pngBuf) {
    const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
        if (data[i + 3] < 6) continue;
        const mxRB = Math.max(data[i], data[i + 2]);
        if (data[i + 1] > mxRB) data[i + 1] = mxRB;
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

async function main() {
    if (!ID) { console.error('✗ --id=quail|enaga|owl を指定'); process.exit(1); }
    const framesDir = path.join(RAW_DIR, `veo_frames_${ID}`);
    if (EXTRACT) {
        await fs.mkdir(framesDir, { recursive: true });
        const mp4 = path.join(RAW_DIR, `veo_${ID}_walk.mp4`);
        console.log(`ffmpeg 抽出: ${mp4} → ${framesDir}/f_%03d.png (24fps)`);
        execSync(`ffmpeg -y -loglevel error -i "${mp4}" -vf fps=24 "${framesDir}/f_%03d.png"`);
        const n = (await fs.readdir(framesDir)).filter(f => f.startsWith('f_')).length;
        console.log(`  ✓ ${n} コマ抽出`);
    }
    // 基準: 既存ひよこ walk_1 の身長・足元ギャップに全コマを統一（ボブは動画由来の自然な揺れに任せる）
    const ref = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR, 'enemy_chick_walk_1.png')));
    const rb = bboxA(ref);
    const refH = rb.h, refGap = (ref.height - 1) - rb.maxY;
    console.log(`基準(chick): charH=${refH} gapBottom=${refGap}`);

    for (let k = 0; k < FRAMES.length; k++) {
        const framePath = path.join(framesDir, `f_${String(FRAMES[k]).padStart(3, '0')}.png`);
        const keyed = await chromaKey(framePath);
        let keyedPng = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: keyed.channels } }).png().toBuffer();
        if (FLOP) keyedPng = await sharp(keyedPng).flop().png().toBuffer(); // 左向き動画→右向きへ反転
        const bb = bboxA(await rawRGBA(keyedPng));
        let tH = Math.min(OUT - 2, refH), tW = Math.round(bb.w * tH / bb.h);
        if (tW > OUT) { tW = OUT; tH = Math.round(bb.h * tW / bb.w); }
        const content = await sharp(keyedPng)
            .extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h })
            .resize(tW, tH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
        const left = Math.max(0, Math.round((OUT - tW) / 2));
        const top = Math.max(0, (OUT - 1) - refGap - (tH - 1));
        let norm = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: content, left, top }]).png().toBuffer();
        norm = await despillPng(norm);
        await fs.writeFile(path.join(RAW_DIR, `ve_${ID}_walk_${k + 1}_64.png`), norm);
        await fs.writeFile(path.join(RAW_DIR, `ve_${ID}_walk_${k + 1}_256.png`), await sharp(norm).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
        console.log(`walk_${k + 1} <= f_${FRAMES[k]} (${bb.w}x${bb.h} → ${tW}x${tH})`);
        if (COMMIT) {
            await fs.writeFile(path.join(IMAGES_DIR, `enemy_${ID}_walk_${k + 1}.png`), norm);
            console.log(`  ✓ images/enemy_${ID}_walk_${k + 1}.png`);
        }
    }
    console.log('完了。_raw/ve_' + ID + '_walk_*_256.png を確認。');
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
