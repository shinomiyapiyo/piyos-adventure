// ─────────────────────────────────────────────────────────────────────────────
// veo-enemy-contact-sheet.mjs — Veo歩行動画の全コマを最終スプライトと同じ処理で一覧化（目視ジャッジ用）。
// 処理=クロマキー(外周flood-fill)→(必要なら反転)→動画ごとの均一スケールで整列→64px→拡大＋コマ番号ラベル。
// ※均一スケール: 従来の「全コマ同一身長化」はボブのたびにサイズが脈動する不安定の原因。
//   本スクリプトは中央値身長から動画ごとに1つの倍率を決め、自然な上下動を保持する。
//   zsh -ic 'cd tools && node veo-enemy-contact-sheet.mjs --id=quail --flop --step=2'
// 出力: _raw/judge_<id>.png
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const ID    = getArg('id');
const STEP  = parseInt(getArg('step') || '2', 10);
const FLOP  = hasFlag('flop');
const COLS  = parseInt(getArg('cols') || '8', 10);
const OUT = 64, CELL = 104, LABEL_H = 18;

async function rawRGBA(buf) { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, ...info }; }
function bboxA(d) { const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (data[(y * width + x) * channels + 3] > 50) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; } } return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1, width, height }; }

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
        const mxRB = Math.max(data[i], data[i + 2]);
        const greenness = data[i + 1] - mxRB;
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
function median(arr) { const s = arr.slice().sort((a, b) => a - b); return s[(s.length / 2) | 0]; }

async function main() {
    if (!ID) { console.error('✗ --id を指定'); process.exit(1); }
    const framesDir = path.join(RAW_DIR, `veo_frames_${ID}`);
    const all = (await fs.readdir(framesDir)).filter(f => /^f_\d+\.png$/.test(f)).sort();
    const picks = [];
    for (let i = 0; i < all.length; i++) { const n = parseInt(all[i].slice(2, 5), 10); if (n % STEP === 0) picks.push(n); }
    console.log(`${ID}: ${picks.length}コマを処理（step=${STEP}）`);

    // 基準: chick の身長と足元ギャップ
    const ref = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR, 'enemy_chick_walk_1.png')));
    const rb = bboxA(ref);
    const refH = rb.h, refGap = (ref.height - 1) - rb.maxY;

    // 1パス: キー処理して PNG とbboxをメモリに（均一スケール算出のため）
    const items = [];
    for (const n of picks) {
        const keyed = await chromaKey(path.join(framesDir, `f_${String(n).padStart(3, '0')}.png`));
        let png = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: keyed.channels } }).png().toBuffer();
        if (FLOP) png = await sharp(png).flop().png().toBuffer();
        const bb = bboxA(await rawRGBA(png));
        items.push({ n, png, bb });
        process.stdout.write(`  f_${n} (${bb.w}x${bb.h})\r`);
    }
    const scale = Math.min(OUT - 2, refH) / median(items.map(it => it.bb.h)); // 動画ごとの均一倍率
    console.log(`\n均一スケール: ×${scale.toFixed(4)} (中央値身長→${refH}px)`);

    // 2パス: 64pxスプライト化 → セルに配置
    const rows = Math.ceil(items.length / COLS);
    const comps = [];
    for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        let tW = Math.max(1, Math.round(it.bb.w * scale)), tH = Math.max(1, Math.round(it.bb.h * scale));
        if (tW > OUT) { tW = OUT; } if (tH > OUT) { tH = OUT; }
        const content = await sharp(it.png)
            .extract({ left: it.bb.minX, top: it.bb.minY, width: it.bb.w, height: it.bb.h })
            .resize(tW, tH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
        const left = Math.max(0, Math.round((OUT - tW) / 2));
        const top = Math.max(0, (OUT - 1) - refGap - (tH - 1));
        let norm = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([{ input: content, left, top }]).png().toBuffer();
        norm = await despillPng(norm);
        const cellImg = await sharp(norm).resize(CELL - 8, CELL - 8, { kernel: 'nearest' }).png().toBuffer();
        const col = idx % COLS, row = (idx / COLS) | 0;
        comps.push({ input: cellImg, left: col * CELL + 4, top: row * (CELL + LABEL_H) + 4 });
        const label = Buffer.from(
            `<svg width="${CELL}" height="${LABEL_H}"><text x="${CELL / 2}" y="13" text-anchor="middle" font-family="monospace" font-size="13" font-weight="bold" fill="#ffd700">${it.n}</text></svg>`);
        comps.push({ input: label, left: col * CELL, top: row * (CELL + LABEL_H) + CELL - 4 });
    }
    const W = COLS * CELL, H = rows * (CELL + LABEL_H) + 4;
    await sharp({ create: { width: W, height: H, channels: 4, background: { r: 34, g: 38, b: 52, alpha: 1 } } })
        .composite(comps).png().toFile(path.join(RAW_DIR, `judge_${ID}.png`));
    console.log(`✓ _raw/judge_${ID}.png (${items.length}コマ)`);
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
