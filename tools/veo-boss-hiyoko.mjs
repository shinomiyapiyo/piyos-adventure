// ─────────────────────────────────────────────────────────────────────────────
// veo-boss-hiyoko.mjs — 闇のカラス（空中ボス）のモーション動画を Veo で生成する。
// ルール: 動きの差分コマは必ず Veo 動画から切り出す（独立画像生成はモーションが崩れる）。
// 種画像 = 承認済み idle（_raw/gen_boss_hiyoko_1024.png ＝ 高解像度の生画像）を緑背景9:16に合成 → image-to-video。
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node veo-boss-hiyoko.mjs'
//   --model=veo-3.1-fast-generate-preview（既定） / --seconds=8
// 出力: _raw/veo_boss_hiyoko.mp4（コマ確認は contact-sheet、切り出しは別ツール）
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR     = path.resolve(__dirname, '_raw');
const IMAGES_DIR  = path.resolve(__dirname, '..', 'images');
const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const MODEL   = getArg('model') || 'veo-3.1-fast-generate-preview';
const SECONDS = parseInt(getArg('seconds') || '8', 10);

const GREEN = { r: 0, g: 200, b: 0, alpha: 1 };
const W = 720, H = 1280;

function bossPrompt() {
    return [
        'A cute giant fluffy yellow baby chick boss with a small gold crown and angry pouting face,',
        'retro 16-bit pixel art style, performs an animation in SIDE-VIEW, facing LEFT, standing on the ground.',
        'Sequence over the clip: (1) marches in place stomping its stubby orange feet angrily, wings bobbing (walk cycle),',
        '(2) crouches then does ONE small hop straight up and lands with a bounce,',
        '(3) leans its body forward low like it is charging/dashing angrily ahead,',
        '(4) suddenly flinches upright with wide teary shocked eyes as if bonked on the head, crown tilting.',
        'The chick STAYS IN PLACE at the center at ALL times (animation in place, no traveling).',
        'Flat solid PURE GREEN background (#00C800) at all times, no shadows, no other objects, no text.',
        'Camera locked, no zoom, no cuts.',
    ].join(' ');
}
const NEG = 'flying out of frame, background change, camera motion, panning, zoom, extra characters, text, watermark, blur, realistic 3d render, turning around, losing the flame aura, changing colors';

async function buildSeed() {
    // 高解像度の生 idle を優先。無ければ最終128pxにフォールバック。
    let basePath = path.join(RAW_DIR, 'gen_boss_hiyoko_1024.png');
    try { await fs.access(basePath); } catch { basePath = path.join(IMAGES_DIR, 'boss2_idle.png'); }
    const char = await sharp(basePath).trim({ threshold: 12 }).resize(640, 640, { fit: 'inside' }).png().toBuffer();
    const m = await sharp(char).metadata();
    const left = Math.round((W - m.width) / 2);
    const top  = Math.round((H - m.height) / 2); // 空中ボスは中央配置（足接地させない）
    const seedPath = path.join(RAW_DIR, 'veo_boss_hiyoko_seed.png');
    await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
        .composite([{ input: char, left, top }])
        .png().toFile(seedPath);
    console.log(`種画像: ${seedPath} (char ${m.width}x${m.height}, from ${path.basename(basePath)})`);
    return fs.readFile(seedPath);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    if (!process.env.GEMINI_API_KEY) { console.error('✗ GEMINI_API_KEY 未設定（zsh -ic 経由で）'); process.exit(1); }
    await fs.mkdir(RAW_DIR, { recursive: true });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const seedBuf = await buildSeed();
    const mp4 = path.join(RAW_DIR, 'veo_boss_hiyoko.mp4');
    console.log(`\n● 闇のカラス: model=${MODEL} ${SECONDS}s 生成開始...`);
    let op = await ai.models.generateVideos({
        model: MODEL,
        prompt: bossPrompt(),
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
    console.log('\n次: contact-sheet でコマを確認 → 各ポーズのフレーム番号を選んで切り出し');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
