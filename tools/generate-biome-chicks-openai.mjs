// ─────────────────────────────────────────────────────────────────────────────
// generate-biome-chicks-openai.mjs
// 雑魚敵のバイオーム連動バリエーション（見た目のみ・行動/判定は不変）を生成する。
// 既存 enemy_chick_walk_N.png を「ポーズ・サイズ・画風」のアンカーに、同ポーズの別キャラへ差し替え。
//   砂漠: quail（うずらのヒナ） / 雪山: enaga（シマエナガ） / 夜: owl（ふくろうのヒナ）
//
// 実行（対話シェルのキーを継承するため zsh -ic 経由）:
//   node generate-biome-chicks-openai.mjs --frames=1                 … デザイン案（各キャラ1コマ目のみ）
//   node generate-biome-chicks-openai.mjs --only=quail --frames=2,3,4 … 承認後の残りコマ
// オプション: --only=quail,enaga,owl / --frames=1,2,3,4 / --quality=medium / --no-commit
// 出力: _raw/bc_<id>_<n>_(1024|256).png。コミット時 images/enemy_<id>_walk_<n>.png (64×64)
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const OUT = 64;

const args = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const ONLY    = (getArg('only') || 'quail,enaga,owl').split(',').map(s => s.trim()).filter(Boolean);
const FRAMES  = (getArg('frames') || '1,2,3,4').split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
const QUALITY = getArg('quality') || 'medium';
const COMMIT  = !hasFlag('no-commit');
const MODEL   = 'gpt-image-1';

const CHARACTERS = {
    quail: { name: 'うずらのヒナ（砂漠）', desc: [
        'a BABY QUAIL chick: sandy-beige body covered in brown mottled speckles and stripes,',
        'a tiny dark head-plume (small crest feather) curving forward on top of its head,',
        'cream-colored belly, small dark beak and eyes. Desert-toned colors (sand, tan, brown).',
    ].join(' ') },
    enaga: { name: 'シマエナガ（雪山）', desc: [
        'a SHIMA-ENAGA (long-tailed tit): an extremely ROUND and FLUFFY pure-white puffball bird,',
        'tiny black bead eyes, a tiny black beak, small black-and-brown wings tucked at the sides,',
        'a short narrow black tail. Snow-toned colors (white body, black accents).',
    ].join(' ') },
    owl: { name: 'ふくろうのヒナ（夜）', desc: [
        'a BABY OWL chick: soft grey-brown downy fluffy body, a pale round facial disc,',
        'BIG round amber-yellow eyes, two small ear tufts on top of the head,',
        'tiny hooked beak, small folded wings. Night-toned colors (grey, brown, amber).',
    ].join(' ') },
};

const COMMON = [
    'The provided reference image is a small pixel-art walking chick enemy sprite from a 2D platformer game.',
    'Recreate the EXACT SAME sprite but replace the chick with the character described below.',
    'CRITICAL: keep the EXACT same walking pose (same leg/wing positions), the same body proportions and scale,',
    'the same facing direction as the reference, and the SAME soft pixel-art style and outline treatment.',
    'It must read as the same enemy slot in the same game — only the species/colors change.',
    'Single character only, fully TRANSPARENT background, no ground, no shadow, no text, no border.',
].join(' ');

async function rawRGBA(buf) { const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: r.data, width: r.info.width, height: r.info.height, channels: r.info.channels }; }
function bboxA(d, thr = 50) { const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (data[(y * width + x) * channels + 3] > thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; } } return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1 }; }

// 生成raw を基準コマ（enemy_chick_walk_N）の不透明bboxに「身長・足元・中心」を合わせて 64×64 化
async function alignToBase(rawBuf, baseName) {
    const baseBuf = await fs.readFile(path.join(IMAGES_DIR, baseName));
    const bBase = bboxA(await rawRGBA(baseBuf));
    const dRaw = await rawRGBA(rawBuf);
    const bRaw = bboxA(dRaw);
    let tH = bBase.h;
    let tW = Math.max(1, Math.round(bRaw.w * tH / bRaw.h));
    if (tW > OUT) { tW = OUT; tH = Math.max(1, Math.round(bRaw.h * tW / bRaw.w)); }
    const content = await sharp(rawBuf)
        .extract({ left: bRaw.minX, top: bRaw.minY, width: bRaw.w, height: bRaw.h })
        .resize(tW, tH, { fit: 'fill', kernel: 'lanczos3' })
        .png().toBuffer();
    const baseCx = bBase.minX + bBase.w / 2;
    let left = Math.round(baseCx - tW / 2); left = Math.max(0, Math.min(OUT - tW, left));
    let top = bBase.maxY - tH + 1; top = Math.max(0, Math.min(OUT - tH, top));
    return sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: content, left, top }]).png().toBuffer();
}

async function editImage(refPath, prompt) {
    const form = new FormData();
    form.append('model', MODEL);
    const buf = await fs.readFile(refPath);
    form.append('image', new Blob([buf], { type: 'image/png' }), path.basename(refPath));
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('quality', QUALITY);
    form.append('background', 'transparent');
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                body: form,
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `HTTP ${res.status}`);
            return Buffer.from(json.data[0].b64_json, 'base64');
        } catch (e) {
            lastErr = e; const w = 2500 * attempt;
            console.warn(`  失敗(${attempt}/3): ${e.message}  ${w}ms待機...`);
            await new Promise(r => setTimeout(r, w));
        }
    }
    throw lastErr;
}

async function main() {
    if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
    await fs.mkdir(RAW_DIR, { recursive: true });
    console.log(`model=${MODEL} quality=${QUALITY} 対象=${ONLY.join(',')} コマ=${FRAMES.join(',')} commit=${COMMIT}`);
    for (const id of ONLY) {
        const ch = CHARACTERS[id];
        if (!ch) { console.warn(`? 未知のキャラ: ${id}`); continue; }
        for (const n of FRAMES) {
            const base = `enemy_chick_walk_${n}.png`;
            const prompt = `${COMMON}\n\nTHE CHARACTER: ${ch.desc}`;
            console.log(`\n● ${id}（${ch.name}）walk_${n} 生成中...`);
            const buf = await editImage(path.join(IMAGES_DIR, base), prompt);
            await fs.writeFile(path.join(RAW_DIR, `bc_${id}_${n}_1024.png`), buf);
            const aligned = await alignToBase(buf, base);
            await fs.writeFile(path.join(RAW_DIR, `bc_${id}_${n}_256.png`),
                await sharp(aligned).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
            if (COMMIT) {
                await fs.writeFile(path.join(IMAGES_DIR, `enemy_${id}_walk_${n}.png`), aligned);
                console.log(`  ✓ images/enemy_${id}_walk_${n}.png (64×64, ${base} に整列)`);
            }
        }
    }
    console.log('\n完了。_raw/bc_*_256.png を確認してください。');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
