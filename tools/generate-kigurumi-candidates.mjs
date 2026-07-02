// ─────────────────────────────────────────────────────────────────────────────
// generate-kigurumi-candidates.mjs
// エッグ交換限定アバター「電気ネズミ系着ぐるみ」の正面立ち絵デザイン候補を生成する。
// ぴよ氏本体 (player_idle_v1.png) を identity アンカーに、オリジナル着ぐるみを着せた3案。
//
// ⚠ IP安全: ピカチュウの象徴意匠（赤い丸ほっぺ・黒い耳先・稲妻ジグザグ尻尾・背中の茶縞）を
//   プロンプトで明示的に禁止。参照は自作スプライトのみで、実在キャラ画像は一切使わない。
//
// 実行（対話シェルのキーを継承するため zsh -ic 経由）:
//   zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-kigurumi-candidates.mjs'
// オプション: --only=A,B / --quality=high|medium|low (既定 medium)
//
// 出力: _raw/kigurumi_<A|B|C>_(1024|256|64).png（プレビューのみ・images/ には触らない）
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

const args = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const ONLY    = (getArg('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const QUALITY = getArg('quality') || 'medium';
const MODEL   = 'gpt-image-1';

// 共通: ぴよ氏の同一性維持
const IDENTITY = [
  'The provided reference image is the EXACT character you MUST keep, perfectly consistent: a super-deformed chibi girl',
  'with a big round head, small body, dark twin-tail hair and a cute simple face, in soft pixel-art game sprite style.',
  'Keep her face, hairstyle, skin tone, chibi big-head proportions and the exact soft pixel-art shading style IDENTICAL',
  'to the reference. Do NOT redesign her face, do NOT change the art style, do NOT make her taller or more realistic.',
].join(' ');

// 共通: 着ぐるみ構図＋IP禁止事項
const KIGURUMI = [
  'She is now wearing a full-body ONESIE KIGURUMI COSTUME (loose pajama-like mascot costume) of an ORIGINAL fictional',
  'electric-mouse mascot character. The HOOD IS UP on her head: the hood has the mascot\'s ears on top and a tiny cute',
  'mascot face motif, while HER OWN FACE clearly peeks out of the hood opening (she is a girl wearing a costume, not the',
  'creature itself). The onesie covers her body loosely with little paw-like sleeve cuffs.',
  'CRITICAL — this must be an ORIGINAL mascot design and must NOT be Pikachu and must NOT resemble Pikachu or any',
  'existing Pokemon or trademarked character. STRICTLY FORBIDDEN elements: red circular cheeks, long pointed ears with',
  'black tips, a zigzag lightning-bolt shaped tail, and brown stripes on the back. Use the alternative design elements',
  'specified below instead.',
].join(' ');

const OUTPUT = [
  'Full body, standing upright FACING THE VIEWER (front view), calm cute idle pose, arms relaxed at the sides.',
  'Single character only, same scale as the reference, fully TRANSPARENT background, no scenery, no ground, no shadow,',
  'no extra objects, no text, no border, no grid.',
].join(' ');

// 3案: それぞれ象徴意匠を別方向に外したオリジナルデザイン
const CANDIDATES = [
  { key: 'A', name: 'ゴールドエッグ寄せ', design: [
      'DESIGN A — "golden egg electric mouse": the onesie is warm GOLDEN-CREAM colored (like a golden egg).',
      'Ears on the hood: SHORT and ROUND (teddy-bear-like) with soft orange inner ears, NO dark tips.',
      'Cheek marks on the hood face: small orange four-pointed STAR shapes (not circles).',
      'Tail: a short stubby curl ending in a tiny GOLDEN EGG shape.',
      'A small golden egg emblem on the belly. Overall theme ties into a golden-egg reward.',
    ].join(' ') },
  { key: 'B', name: 'イエロー×コイル尻尾', design: [
      'DESIGN B — "spark coil mouse": the onesie is bright YELLOW with a white belly patch.',
      'Ears on the hood: SMALL and ROUND with pale yellow inner, absolutely NO dark/black tips.',
      'Cheek marks on the hood face: tiny orange LIGHTNING-BOLT shaped marks (bolt SHAPE, not circles).',
      'Tail: a springy spiral COIL tail ending in a small glowing spark orb.',
      'No stripes anywhere on the back.',
    ].join(' ') },
  { key: 'C', name: 'ツートン×プラグ尻尾', design: [
      'DESIGN C — "plug mouse": the onesie is TWO-TONE, soft WHITE body with a YELLOW hood and yellow paw cuffs.',
      'Ears on the hood: rounded rectangle chunky ears, yellow outside and white inside, NO dark tips.',
      'Cheek marks on the hood face: small amber DIAMOND shapes.',
      'Tail: a chunky cartoon POWER-PLUG shaped tail (two little prongs), like an electrical plug.',
      'A tiny lightning emblem patch on the chest (emblem only, the tail is NOT a lightning bolt).',
    ].join(' ') },
];

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

async function downscale(rawBuf, size) {
  return sharp(rawBuf).ensureAlpha().trim({ threshold: 10 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定（zsh -ic 経由で実行してください）'); process.exit(1); }
  await fs.mkdir(RAW_DIR, { recursive: true });
  const ref = path.join(IMAGES_DIR, 'player_idle_v1.png');
  const targets = ONLY.length ? CANDIDATES.filter(c => ONLY.includes(c.key)) : CANDIDATES;
  console.log(`model=${MODEL} quality=${QUALITY} ref=player_idle_v1.png 候補=${targets.map(c => c.key).join(',')}`);
  for (const c of targets) {
    const prompt = `${IDENTITY}\n\n${KIGURUMI}\n\n${c.design}\n\n${OUTPUT}`;
    console.log(`\n● 候補${c.key}（${c.name}）生成中...`);
    const buf = await editImage(ref, prompt);
    await fs.writeFile(path.join(RAW_DIR, `kigurumi_${c.key}_1024.png`), buf);
    await fs.writeFile(path.join(RAW_DIR, `kigurumi_${c.key}_256.png`), await downscale(buf, 256));
    await fs.writeFile(path.join(RAW_DIR, `kigurumi_${c.key}_64.png`), await downscale(buf, 64));
    console.log(`  ✓ _raw/kigurumi_${c.key}_(1024|256|64).png`);
  }
  console.log('\n完了。_raw/ のプレビューを確認してください。');
}
main().catch(e => { console.error('\n✗ エラー:', e.message || e); process.exit(1); });
