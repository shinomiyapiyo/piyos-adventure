// ─────────────────────────────────────────────────────────────────────────────
// veo-enemy-walk.mjs — バイオーム雑魚（quail/enaga/owl）の歩行クリップを Veo で生成。
// ルール: 動きの差分コマは必ず Veo 動画からコマ切り出しで作る（画像生成の独立コマはモーションが崩れる）。
// 種画像=承認済みデザイン(_raw/bc_<id>_1_1024.png)を緑背景9:16に合成 → image-to-video。
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node veo-enemy-walk.mjs --only=quail'
//   --model=veo-3.1-fast-generate-preview (既定) / --seconds=4
// 出力: _raw/veo_<id>_walk.mp4（コマ切り出しは veo-frames-to-enemy.mjs）
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR   = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL   = getArg('model') || 'veo-3.1-fast-generate-preview';
const SECONDS = parseInt(getArg('seconds') || '4', 10);
const ONLY    = (getArg('only') || 'quail,enaga,owl').split(',').map(s => s.trim()).filter(Boolean);

const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, FOOT_Y = 1185;

const BIRDS = {
    quail: 'a tiny round pixel-art BABY QUAIL chick (sandy-beige body with brown mottled speckles, a small dark crest feather on its head, cream belly)',
    enaga: 'a tiny round pixel-art SHIMA-ENAGA bird (an extremely round fluffy pure-white puffball with tiny black bead eyes, small black wings and a short black tail)',
    owl:   'a tiny round pixel-art BABY OWL chick (soft grey-brown downy body, pale facial disc, big round amber eyes, two small ear tufts)',
};

function walkPrompt(desc) {
    return [
        desc + ' walks in place in a smooth, clear SIDE-VIEW waddling walk cycle, facing right.',
        'Its little legs clearly step: one foot forward, then feet together, then the other foot forward — a natural',
        'open-close-open waddle, with a slight body bob. It stays CENTERED in the frame and does NOT travel across the screen.',
        'Keep its exact appearance, colors, proportions and pixel-art style IDENTICAL to the input image.',
        'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' ');
}
const NEG = 'walking out of frame, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame, turning around';

async function buildSeed(id) {
    const basePath = path.join(RAW_DIR, `bc_${id}_1_1024.png`);
    const char = await sharp(basePath).trim({ threshold: 10 }).resize(560, 560, { fit: 'inside' }).png().toBuffer();
    const m = await sharp(char).metadata();
    const left = Math.round((W - m.width) / 2);
    const top = Math.max(0, FOOT_Y - m.height);
    const seedPath = path.join(RAW_DIR, `veo_${id}_seed.png`);
    await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
        .composite([{ input: char, left, top }])
        .png().toFile(seedPath);
    console.log(`種画像: ${seedPath} (char ${m.width}x${m.height})`);
    return fs.readFile(seedPath);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateOne(ai, id) {
    const seedBuf = await buildSeed(id);
    const mp4 = path.join(RAW_DIR, `veo_${id}_walk.mp4`);
    console.log(`\n● ${id}: model=${MODEL} ${SECONDS}s 生成開始...`);
    let op = await ai.models.generateVideos({
        model: MODEL,
        prompt: walkPrompt(BIRDS[id]),
        image: { imageBytes: seedBuf.toString('base64'), mimeType: 'image/png' },
        config: {
            aspectRatio: '9:16',
            resolution: '720p',
            durationSeconds: SECONDS,
            numberOfVideos: 1,
            negativePrompt: NEG,
        },
    });
    let waited = 0;
    while (!op.done) { await sleep(10000); waited += 10; process.stdout.write(`  ...${waited}s\r`); op = await ai.operations.getVideosOperation({ operation: op }); }
    console.log(`\n  完了(${waited}s)`);
    if (op.error) throw new Error('operation error: ' + JSON.stringify(op.error));
    const vids = op.response?.generatedVideos || [];
    if (!vids.length) throw new Error('動画が返りませんでした: ' + JSON.stringify(op.response?.raiMediaFilteredReasons || ''));
    await ai.files.download({ file: vids[0].video, downloadPath: mp4 });
    console.log(`  ✓ 保存: ${mp4}`);
}

async function main() {
    if (!process.env.GEMINI_API_KEY) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で）'); process.exit(1); }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    for (const id of ONLY) {
        if (!BIRDS[id]) { console.warn(`? 未知: ${id}`); continue; }
        await generateOne(ai, id);
    }
    console.log('\n全て完了。次: node veo-frames-to-enemy.mjs --id=<id> で切り出し');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
