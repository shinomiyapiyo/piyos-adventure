// ─────────────────────────────────────────────────────────────────────────────
// generate-skin-kigurumi-openai.mjs
// エッグ交換限定スキン「でんきネズミ着ぐるみ」(候補B確定) のスプライト一式を生成する。
// generate-skin-maid-openai.mjs と同方式: B案の正面立ち絵を identity アンカーに各ポーズを
// gpt-image-1 (images/edits) で再生成 → 対応する player_<pose>.png の不透明bboxへ
// 「足元・中心・身長」を合わせ込んで 64×64 に整列 (align-skin.mjs と同じ考え方)。
//
// ⚠ IP安全: オリジナル意匠（丸耳・ジグザグ型ほっぺ・コイル+雷玉尻尾・縞なし）を明示し、
//   ピカチュウの象徴意匠（赤丸ほっぺ/黒耳先/稲妻ジグザグ尻尾/背中の縞）を禁止する。
//
// 実行（対話シェルのキーを継承するため zsh -ic 経由）:
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-skin-kigurumi-openai.mjs --idle'
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-skin-kigurumi-openai.mjs --only=walk_1,walk_2,walk_3'
//
// オプション:
//   --idle                    API を使わず _raw/kigurumi_B_1024.png から idle を整列コミットのみ
//   --only=walk_1,jump        指定コマだけ生成
//   --quality=high|medium|low (既定 medium)
//   --no-commit               images/ に書かず _raw/ プレビューのみ
// 出力: _raw/kig_<key>_(1024|256)。コミット時 images/skin_kigurumi_<key>.png (64×64)
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
const ONLY      = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const QUALITY   = getArg('quality') || 'medium';
const COMMIT    = !hasFlag('no-commit');
const IDLE_ONLY = hasFlag('idle');
const MODEL     = 'gpt-image-1';
const ANCHOR    = path.join(RAW_DIR, 'kigurumi_B_1024.png'); // 確定した B案

const FRAMES = [
  { key:'walk_1', base:'player_walk_1.png', motion:'WALK CYCLE frame 1 (contact): RIGHT leg stepped clearly FORWARD, LEFT leg back behind, weight forward. Arms swing opposite: LEFT arm forward, RIGHT arm back. A clear mid-stride side walking pose facing RIGHT, NOT a standing pose.' },
  { key:'walk_2', base:'player_walk_2.png', motion:'PASSING / MID-STEP pose — the CLOSED-LEGS moment of the walk: both legs brought CLOSE TOGETHER directly under the body, nearly touching and almost vertical, balancing momentarily on one foot while the other passes right beside it, body at its highest point. Legs MUST be CLOSED — do NOT spread them. Arms hang relaxed near the sides. Facing RIGHT.' },
  { key:'walk_3', base:'player_walk_3.png', motion:'CONTACT pose, opposite stride: facing RIGHT, the LEFT leg stepped clearly FORWARD and the RIGHT leg trailing BEHIND in a clear wide walking stride (opposite stride to walk frame 1). Arms swing opposite: RIGHT arm forward, LEFT arm back.' },
  { key:'walk_4', base:'player_walk_4.png', motion:'PASSING / MID-STEP pose — CLOSED LEGS (same closed moment as the other passing frame): both legs together and nearly vertical under the body, one foot passing beside the other, body at its highest point. Legs CLOSED, not spread. Facing RIGHT.' },
  { key:'jump',   base:'player_jump.png',   motion:'JUMPING UP pose facing RIGHT: the character is clearly AIRBORNE and lifted off the ground, both knees bent and tucked up, feet off the floor, arms raised upward. This must NOT look like a normal standing pose.' },
  { key:'fall',   base:'player_fall.png',   motion:'FALLING DOWN pose facing RIGHT: the character is clearly AIRBORNE and descending, legs spread apart and loose, arms raised up and outward to balance, slightly looking down. This must NOT look like a normal standing pose. The character faces RIGHT (not left).' },
];

const IDENTITY = [
  'The provided reference image is the EXACT character you MUST keep, perfectly consistent: a super-deformed chibi girl',
  'with a big round head, dark twin-tail hair and a cute simple face, wearing a bright YELLOW electric-mouse KIGURUMI',
  'ONESIE (loose mascot pajama costume): the hood is UP with SMALL ROUND ears (pale yellow inner, NO dark tips), tiny',
  'orange zigzag lightning-bolt shaped cheek marks on the hood sides, a tiny mascot face motif on the hood top, a white',
  'belly patch, paw-like sleeve cuffs, and a springy spiral COIL tail ending in a small glowing yellow spark orb.',
  'Her own face clearly peeks out of the hood opening (a girl wearing a costume, not the creature itself).',
  'Keep her face, the onesie design, exact colors, chibi big-head proportions and the soft pixel-art shading style',
  'IDENTICAL to the reference image. Do NOT redesign, do NOT change the art style.',
  'This is an ORIGINAL mascot costume, NOT Pikachu: never use red circular cheeks, black-tipped pointed ears,',
  'a zigzag lightning-bolt tail, or brown back stripes.',
].join(' ');

const OUTPUT = [
  'Output the SAME character, re-posed into the TARGET POSE below — one frame of a side-scrolling sprite animation of',
  'that exact character. The head, hood and torso stay the same as the reference; mainly the ARMS and LEGS move.',
  'Render IDENTICALLY to the reference: same face, same onesie details and colors, same line work, same chibi',
  'proportions, same art style. It is literally the SAME character in another animation frame — ONLY the pose differs.',
  'Single character only, same scale as the reference, fully TRANSPARENT background,',
  'no scenery, no ground, no shadow, no extra objects, no text, no border, no grid.',
].join(' ');

// ── 画像ユーティリティ（align-skin.mjs と同じ考え方） ──
async function rawRGBA(buf) { const r = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: r.data, width: r.info.width, height: r.info.height, channels: r.info.channels }; }
function bboxA(d, thr = 50) { const { data, width, height, channels } = d; let a = width, b = height, c = -1, e = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (data[(y * width + x) * channels + 3] > thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; } } return { minX: a, minY: b, maxX: c, maxY: e, w: c - a + 1, h: e - b + 1 }; }

// 生成raw(任意サイズ)を、base(player_<pose>.png 64×64)の不透明bboxに「身長・足元・中心」を合わせて 64×64 化
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

async function appendImage(form, absPath, field) {
  const buf = await fs.readFile(absPath);
  form.append(field, new Blob([buf], { type: 'image/png' }), path.basename(absPath));
}

async function editImage(imagePaths, prompt) {
  const form = new FormData();
  form.append('model', MODEL);
  if (imagePaths.length === 1) await appendImage(form, imagePaths[0], 'image');
  else for (const p of imagePaths) await appendImage(form, p, 'image[]');
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

async function commitFrame(key, rawBuf, baseName) {
  await fs.writeFile(path.join(RAW_DIR, `kig_${key}_1024.png`), rawBuf);
  const aligned = await alignToBase(rawBuf, baseName);
  await fs.writeFile(path.join(RAW_DIR, `kig_${key}_256.png`),
    await sharp(aligned).resize(256, 256, { kernel: 'nearest' }).png().toBuffer());
  if (COMMIT) {
    await fs.writeFile(path.join(IMAGES_DIR, `skin_kigurumi_${key}.png`), aligned);
    console.log(`  ✓ images/skin_kigurumi_${key}.png (64×64, ${baseName} に整列)`);
  } else {
    console.log(`  ✓ _raw/kig_${key}_256.png (プレビューのみ)`);
  }
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  if (IDLE_ONLY) {
    // idle: API不要。確定した B案をそのまま player_idle_v1.png に整列してコミット
    const buf = await fs.readFile(ANCHOR);
    await commitFrame('idle', buf, 'player_idle_v1.png');
    console.log('\nidle 完了。');
    return;
  }
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
  const targets = ONLY.length ? FRAMES.filter(f => ONLY.includes(f.key)) : FRAMES;
  console.log(`model=${MODEL} quality=${QUALITY} anchor=kigurumi_B_1024.png 対象=${targets.map(f => f.key).join(',')}`);
  for (const fr of targets) {
    const prompt = `${IDENTITY}\n\nTARGET POSE: ${fr.motion}\n\n${OUTPUT}`;
    console.log(`\n● ${fr.key} 生成中 (pose-hint: ${fr.base})...`);
    const buf = await editImage([ANCHOR, path.join(IMAGES_DIR, fr.base)], prompt);
    await commitFrame(fr.key, buf, fr.base);
  }
  console.log('\n完了。_raw/kig_*_256.png と images/skin_kigurumi_*.png を確認してください。');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
