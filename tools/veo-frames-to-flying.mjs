// ─────────────────────────────────────────────────────────────────────────────
// veo-frames-to-flying.mjs — Veo の緑背景“羽ばたき”動画を飛行雑魚の fly スプライトへ変換。
// ffmpegコマ抽出 → 緑クロマキー＋デスピル → enemy_flying_chick_fly_1 基準の身長へ均一スケール → 中央整列 → 64×64。
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node veo-frames-to-flying.mjs --id=vulture --extract'
//   --id=vulture|snowowl|bat / --frames=40,46,52,58 / --extract（ffmpeg実行） / --no-commit / --flop
// 出力: _raw/vf_<id>_fly_<n>_(64|256).png。コミット時 images/enemy_<id>_fly_<n>.png
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

// 緑クロマキー（外周flood-fill版）＋デスピル。背景＝縁から緑続きで到達できる領域だけ透過。
async function chromaKey(framePath) {
    const d = await rawRGBA(await fs.readFile(framePath));
    const { data, width, height, channels } = d;
    const isGreen = (i) => { const g = data[i + 1], mxRB = Math.max(data[i], data[i + 2]); return (g - mxRB) > 35 && g > 70; };
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
        if (bg[p]) { data[i + 3] = 0; continue; }
        if (greenness > 18) {
            data[i + 1] = mxRB;
            const x = p % width, y = (p / width) | 0;
            const nearBg = (x > 0 && bg[p - 1]) || (x < width - 1 && bg[p + 1]) || (y > 0 && bg[p - width]) || (y < height - 1 && bg[p + width]);
            if (nearBg) { const t = Math.min(1, (greenness - 18) / 32); data[i + 3] = Math.round(data[i + 3] * (1 - 0.8 * t)); }
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
    if (!ID) { console.error('✗ --id=vulture|snowowl|bat を指定'); process.exit(1); }
    const framesDir = path.join(RAW_DIR, `veo_frames_fly_${ID}`);
    if (EXTRACT) {
        await fs.mkdir(framesDir, { recursive: true });
        const mp4 = path.join(RAW_DIR, `veo_${ID}_fly.mp4`);
        console.log(`ffmpeg 抽出: ${mp4} → ${framesDir}/f_%03d.png (24fps)`);
        execSync(`ffmpeg -y -loglevel error -i "${mp4}" -vf fps=24 "${framesDir}/f_%03d.png"`);
        const n = (await fs.readdir(framesDir)).filter(f => f.startsWith('f_')).length;
        console.log(`  ✓ ${n} コマ抽出（f_001〜f_${String(n).padStart(3, '0')}）。--frames で選定`);
    }
    // 基準: 既存 飛行ひよこ fly_1 の身長（飛行なので中央整列・足planなし）
    const ref = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR, 'enemy_flying_chick_fly_1.png')));
    const rb = bboxA(ref);
    const refH = rb.h;
    console.log(`基準(flying_chick): charH=${refH}`);

    // 1パス: 全選定コマをキー処理→bbox取得→中央値身長で【均一スケール】（ボブは保持）。
    const prepared = [];
    for (let k = 0; k < FRAMES.length; k++) {
        const framePath = path.join(framesDir, `f_${String(FRAMES[k]).padStart(3, '0')}.png`);
        const keyed = await chromaKey(framePath);
        let keyedPng = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: keyed.channels } }).png().toBuffer();
        if (FLOP) keyedPng = await sharp(keyedPng).flop().png().toBuffer();
        prepared.push({ png: keyedPng, bb: bboxA(await rawRGBA(keyedPng)) });
    }
    const heights = prepared.map(p => p.bb.h).sort((a, b) => a - b);
    const medianH = heights[(heights.length / 2) | 0];
    const scale = Math.min(OUT - 2, refH) / medianH;
    console.log(`均一スケール: ×${scale.toFixed(4)} (中央値身長${medianH}→${refH}px)`);

    for (let k = 0; k < FRAMES.length; k++) {
        const bb = prepared[k].bb;
        let tW = Math.max(1, Math.round(bb.w * scale)), tH = Math.max(1, Math.round(bb.h * scale));
        if (tW > OUT) tW = OUT;
        if (tH > OUT) tH = OUT;
        const content = await sharp(prepared[k].png)
            .extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h })
            .resize(tW, tH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
        const left = Math.max(0, Math.round((OUT - tW) / 2));
        const top  = Math.max(0, Math.round((OUT - tH) / 2)); // 飛行=上下も中央整列
        let norm = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: content, left, top }]).png().toBuffer();
        norm = await despillPng(norm);
        await fs.writeFile(path.join(RAW_DIR, `vf_${ID}_fly_${k + 1}_64.png`), norm);
        await fs.writeFile(path.join(RAW_DIR, `vf_${ID}_fly_${k + 1}_256.png`), await sharp(norm).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
        console.log(`fly_${k + 1} <= f_${FRAMES[k]} (${bb.w}x${bb.h} → ${tW}x${tH})`);
        if (COMMIT) {
            await fs.writeFile(path.join(IMAGES_DIR, `enemy_${ID}_fly_${k + 1}.png`), norm);
            console.log(`  ✓ images/enemy_${ID}_fly_${k + 1}.png`);
        }
    }
    console.log('完了。_raw/vf_' + ID + '_fly_*_256.png を確認。');
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
