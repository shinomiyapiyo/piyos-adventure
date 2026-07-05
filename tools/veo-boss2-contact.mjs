// veo-boss2-contact.mjs — _raw/boss2_frames/f_NNN.png を一覧タイル化（ポーズ選定用）。
// 事前に ffmpeg で veo_boss2.mp4 を _raw/boss2_frames/ へ全コマ抽出しておくこと。
//   node veo-boss2-contact.mjs [--step=4]
// 出力: _raw/judge_boss2.png（各セルにフレーム番号ラベル）
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '_raw');
const framesDir = path.join(RAW_DIR, 'boss2_frames');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const STEP = parseInt(getArg('step') || '4', 10);
const COLS = 8, CW = 96, CH = 170, LABEL_H = 16;

const all = (await fs.readdir(framesDir)).filter(f => /^f_\d+\.png$/.test(f)).sort();
const picks = all.filter(f => (parseInt(f.slice(2), 10) % STEP === 1));
const rows = Math.ceil(picks.length / COLS);
const comps = [];
for (let idx = 0; idx < picks.length; idx++) {
    const n = parseInt(picks[idx].slice(2), 10);
    const cell = await sharp(path.join(framesDir, picks[idx])).resize(CW, CH, { fit: 'inside' }).png().toBuffer();
    const col = idx % COLS, row = (idx / COLS) | 0;
    comps.push({ input: cell, left: col * CW, top: row * (CH + LABEL_H) });
    const label = Buffer.from(`<svg width="${CW}" height="${LABEL_H}"><rect width="${CW}" height="${LABEL_H}" fill="black"/><text x="${CW / 2}" y="12" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="#ffd700">${n}</text></svg>`);
    comps.push({ input: label, left: col * CW, top: row * (CH + LABEL_H) + CH });
}
const W = COLS * CW, H = rows * (CH + LABEL_H);
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 20, g: 22, b: 34, alpha: 1 } } })
    .composite(comps).png().toFile(path.join(RAW_DIR, 'judge_boss2.png'));
console.log(`✓ _raw/judge_boss2.png（${picks.length}コマ / step=${STEP}）`);
