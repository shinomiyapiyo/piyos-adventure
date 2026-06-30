// ─────────────────────────────────────────────────────────────────────────────
// generate-skin-maid-openai.mjs
// 「黄色メイド服スキン」のモーションコマを OpenAI gpt-image-1 で生成する開発用スクリプト。
// 既存 generate-skin-maid.mjs(Gemini版) の OpenAI 版。完成度の高い skin_maid_idle.png を
// キャラ基準(identityアンカー)として images/edits に渡し、各ポーズを再生成する。
//
// 実行（対話シェルのキーを継承するため zsh -ic 経由）:
//   zsh -ic 'cd games/piyo-adventure/tools && node generate-skin-maid-openai.mjs --only=walk_1,jump'
//
// オプション:
//   --only=walk_1,jump        指定コマだけ
//   --pose-hint               player_<pose>.png も参照に追加（複数画像入力）
//   --quality=high|medium|low (既定 medium)
//   --size=1024x1024
//   --n=2                     1コマあたり複数案（_raw/ に連番保存）
//   --commit                  images/skin_maid_<key>.png を実際に上書き（既定はプレビューのみ）
//
// 出力（既定）: _raw/oai_<key>_(1024|64|256).png にプレビュー。--commit で images/ に64×64反映。
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
const ONLY      = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const QUALITY   = getArg('quality') || 'medium';
const SIZE      = getArg('size') || '1024x1024';
const N         = parseInt(getArg('n') || '1', 10);
const POSE_HINT = hasFlag('pose-hint');
const REF       = getArg('ref') || null;   // 参照画像を idle 以外に差し替え（_raw/ か images/ 内のファイル名）
const COMMIT    = hasFlag('commit');
const OUT_SIZE  = 64;
const MODEL     = 'gpt-image-1';

const FRAMES = [
  { key:'walk_1', pose:'player_walk_1.png', motion:'WALK CYCLE frame 1 (contact): RIGHT leg stepped clearly FORWARD, LEFT leg back behind, weight forward. Arms swing opposite: LEFT arm forward, RIGHT arm back. A clear mid-stride side walking pose, NOT a standing pose.' },
  { key:'walk_2', pose:'player_walk_2.png', motion:'PASSING / MID-STEP pose — the CLOSED-LEGS moment of the walk: both legs are brought CLOSE TOGETHER directly under the body, nearly touching and almost vertical (knees close together), the character balancing momentarily on one foot while the other foot passes right beside it, body at its highest point. The legs MUST be CLOSED here — do NOT spread them into a stride. Arms hang relaxed near the sides. Still facing right.' },
  { key:'walk_3', pose:'player_walk_3.png', motion:'CONTACT pose, opposite stride: still facing RIGHT, the LEFT leg is stepped clearly FORWARD and the RIGHT leg trails BEHIND in a clear wide walking stride (the opposite stride to the reference). Arms swing opposite: RIGHT arm forward, LEFT arm back.' },
  { key:'walk_4', pose:'player_walk_4.png', motion:'PASSING / MID-STEP pose — CLOSED LEGS (same closed moment as the other passing frame): both legs together and nearly vertical under the body, one foot passing beside the other, body at its highest point. Legs CLOSED, not spread. Still facing right.' },
  { key:'jump',   pose:'player_jump.png',   motion:'JUMPING UP pose: the character is clearly AIRBORNE and lifted off the ground, both knees bent and tucked up, feet off the floor, arms raised upward. This must NOT look like a normal standing pose.' },
  { key:'fall',   pose:'player_fall.png',   motion:'FALLING DOWN pose: the character is clearly AIRBORNE and descending, legs spread apart and loose, arms raised up and outward to balance, slightly looking down. This must NOT look like a normal standing pose.' },
  { key:'base_side', pose:'player_idle_v1.png', motion:'NEUTRAL STANDING pose in a clear full SIDE VIEW (profile), facing RIGHT, standing upright with both feet flat on the ground close together, arms relaxed at the sides, a calm ready-to-walk stance. Full body from head to feet, full profile silhouette (we should see the side of the face and body).' },
  { key:'idle_v2', pose:'player_idle_v1.png', motion:'NEUTRAL STANDING IDLE pose, facing the VIEWER (front view, not profile), calm and cute with a gentle closed-mouth smile and clear open eyes, both arms relaxed hanging down at the sides, feet together, standing upright and still. A clean, crisp idle sprite with a clear face.' },
];

const IDENTITY = [
  'The provided reference image is the EXACT character you MUST keep, perfectly consistent: a super-deformed chibi girl',
  'with a big round head and a small body, wearing a yellow-and-black frilly maid dress (yellow bodice, black puffy short',
  'sleeves, layered yellow/black ruffled skirt with tiny white skull motifs), a black cat-ear headband with bows, black',
  'twin-tails and black thigh-high stockings.',
  'Keep her head, face, hairstyle, outfit, exact colors, chibi big-head proportions and the exact soft pixel-art shading',
  'style IDENTICAL to the reference image. Do NOT redesign her, do NOT change the art style, do NOT make her taller or',
  'more realistic, do NOT add or remove costume parts.',
].join(' ');

const OUTPUT = [
  'Output the SAME character, re-posed into the TARGET POSE below — think of it as one frame of a side-scrolling sprite',
  'animation of that exact character. The head and torso stay the same as the reference; mainly the ARMS and LEGS move.',
  'Render the character IDENTICALLY to the reference image: same face, same hairstyle, same outfit details and colors,',
  'same line work, same chibi proportions and the same art style. It is literally the SAME character in another frame of',
  'the SAME walk cycle — ONLY the limb pose differs, nothing else.',
  'Single character only, facing right, same scale as the reference, fully TRANSPARENT background,',
  'no scenery, no ground, no shadow, no extra objects, no weapon, no text, no border, no grid.',
].join(' ');

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
  form.append('size', SIZE);
  form.append('quality', QUALITY);
  form.append('background', 'transparent');
  if (N > 1) form.append('n', String(N));

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
      return json.data.map(d => Buffer.from(d.b64_json, 'base64'));
    } catch (e) {
      lastErr = e; const w = 2500 * attempt;
      console.warn(`  失敗(${attempt}/3): ${e.message}  ${w}ms待機...`);
      await new Promise(r => setTimeout(r, w));
    }
  }
  throw lastErr;
}

async function resolveRef(name) {
  for (const c of [path.join(RAW_DIR, name), path.join(IMAGES_DIR, name), path.resolve(name)]) {
    try { await fs.access(c); return c; } catch {}
  }
  throw new Error(`参照画像が見つかりません: ${name}`);
}

async function downscale(rawBuf, size) {
  return sharp(rawBuf).ensureAlpha().trim({ threshold: 10 })
    .resize(size, size, { fit:'contain', background:{ r:0, g:0, b:0, alpha:0 } })
    .png().toBuffer();
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  const refImg = REF ? await resolveRef(REF) : path.join(IMAGES_DIR, 'skin_maid_idle.png');
  console.log(`model=${MODEL} quality=${QUALITY} size=${SIZE} n=${N} ref=${path.basename(refImg)} poseHint=${POSE_HINT} commit=${COMMIT}`);
  const targets = ONLY.length ? FRAMES.filter(f => ONLY.includes(f.key)) : FRAMES;
  for (const fr of targets) {
    const imgs = [refImg];
    if (POSE_HINT) imgs.push(path.join(IMAGES_DIR, fr.pose));
    const prompt = `${IDENTITY}\n\nTARGET POSE: ${fr.motion}\n\n${OUTPUT}`;
    console.log(`\n● ${fr.key} 生成中 (参照${imgs.length}枚)...`);
    const bufs = await editImage(imgs, prompt);
    for (let i = 0; i < bufs.length; i++) {
      const tag = bufs.length > 1 ? `_${i+1}` : '';
      await fs.writeFile(path.join(RAW_DIR, `oai_${fr.key}${tag}_1024.png`), bufs[i]);
      await fs.writeFile(path.join(RAW_DIR, `oai_${fr.key}${tag}_64.png`),  await downscale(bufs[i], 64));
      await fs.writeFile(path.join(RAW_DIR, `oai_${fr.key}${tag}_256.png`), await downscale(bufs[i], 256));
      console.log(`  ✓ _raw/oai_${fr.key}${tag}_(1024|64|256).png`);
    }
    if (COMMIT && bufs.length === 1) {
      await fs.writeFile(path.join(IMAGES_DIR, `skin_maid_${fr.key}.png`), await downscale(bufs[0], OUT_SIZE));
      console.log(`  ✓ images/skin_maid_${fr.key}.png に反映`);
    }
  }
  console.log('\n完了。_raw/ のプレビューを確認してください。');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
