// ─────────────────────────────────────────────────────────────────────────────
// veo-enemy-fly.mjs — 飛行雑魚（vulture/snowowl/bat）の“その場羽ばたき”クリップを Veo で生成。
// ルール（絶対）: 動きの差分コマは必ず Veo 動画からコマ切り出しで作る（画像の独立コマ生成はモーションが崩れる＝禁止）。
// 種画像=承認済みデザイン(_raw/bf_<id>_1_1024.png)を緑背景9:16の“空中中央”に合成 → image-to-video。
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node veo-enemy-fly.mjs --only=vulture'
//   --model=veo-3.1-fast-generate-preview (既定) / --seconds=4
// 出力: _raw/veo_<id>_fly.mp4（コマ切り出しは veo-frames-to-flying.mjs）
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
const ONLY    = (getArg('only') || 'vulture,snowowl,bat').split(',').map(s => s.trim()).filter(Boolean);

const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280, CENTER_Y = 560; // 空中センター（飛行なので足planなし）

const BIRDS = {
    vulture: 'a small pixel-art cartoon VULTURE (dark brown body, broad spread wings, a small bald pinkish-grey head with a short hooked beak, a pale cream feather ruff at the neck)',
    snowowl: 'a small pixel-art cartoon SNOWY OWL (pure-white fluffy rounded body with faint pale-grey speckles, broad spread white wings, a round white face with big round yellow eyes, a tiny dark beak)',
    bat:     'a small cute pixel-art cartoon BAT (dark purple-grey fuzzy body, broad spread leathery bat wings, two small pointed ears, big cute round eyes, tiny white fangs)',
};

function flyPrompt(desc) {
    return [
        desc + ' hovers in mid-air in place, flapping its wings up and down in a smooth continuous flapping cycle, clear SIDE-VIEW, facing right.',
        'Its wings clearly move: wings raised up, then wings pushed down, then up again — a natural repeating flap,',
        'with a slight up-and-down hovering bob. It stays CENTERED in the frame and does NOT travel across the screen.',
        'Keep its exact appearance, colors, proportions and pixel-art style IDENTICAL to the input image.',
        'Plain flat solid green background, no other objects, no camera movement, no zoom, no panning.',
    ].join(' ');
}
const NEG = 'flying out of frame, traveling across screen, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, out of frame, turning around, landing, perching';

async function buildSeed(id) {
    const basePath = path.join(RAW_DIR, `bf_${id}_1_1024.png`);
    const char = await sharp(basePath).trim({ threshold: 10 }).resize(600, 600, { fit: 'inside' }).png().toBuffer();
    const m = await sharp(char).metadata();
    const left = Math.round((W - m.width) / 2);
    const top = Math.round(CENTER_Y - m.height / 2); // 空中中央に配置（羽ばたきの上下余白を確保）
    const seedPath = path.join(RAW_DIR, `veo_${id}_fly_seed.png`);
    await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
        .composite([{ input: char, left, top: Math.max(0, top) }])
        .png().toFile(seedPath);
    console.log(`種画像: ${seedPath} (char ${m.width}x${m.height})`);
    return fs.readFile(seedPath);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateOne(ai, id) {
    const seedBuf = await buildSeed(id);
    const mp4 = path.join(RAW_DIR, `veo_${id}_fly.mp4`);
    console.log(`\n● ${id}: model=${MODEL} ${SECONDS}s 生成開始...`);
    let op = await ai.models.generateVideos({
        model: MODEL,
        prompt: flyPrompt(BIRDS[id]),
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
    console.log('\n全て完了。次: node veo-frames-to-flying.mjs --id=<id> --extract で切り出し');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
