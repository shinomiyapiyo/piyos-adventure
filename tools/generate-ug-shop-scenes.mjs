// ─────────────────────────────────────────────────────────────────────────────
// generate-ug-shop-scenes.mjs — 地底「怪しい老婆の店」の一枚絵2点（1.570）
//   1) manju … ごくらくまんじゅうを **おそるおそる食べる** シーン（✅ユーザー指定1.570）
//      ⚠[[piyo-artwork-proportion-rule]] 厳守: **デフォルメ絶対禁止・title.jpg 参照の edits で5-6頭身**。
//        そのため generations ではなく **images/edits** に title.jpg を渡す（p2b-scenes と同じ作法）。
//   2) shopbg … 店内の絵（洞窟の中の店）。⚠**ぴよ氏と店員（老婆）を描き込む**（✅ユーザー指定1.570）＝
//      地上の shop01〜05 と同じ方式（あれも背景画像の中に店員とぴよ氏が描かれている）。
//      ⚠人物が写るので **generations ではなく edits（title.jpg 参照）** を使う＝同一人物・同じ頭身を保つ唯一の方法。
//      ⚠#shopImgArea は画面の右半分だけ＝UIは左の別パネルに出るので、絵を暗く空ける必要はない（shop01と同じ考え方）。
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-ug-shop-scenes.mjs [--only=manju|shopbg] [--n=2]'
// 出力: _raw/ug_manju_cand_<i>.png ／ _raw/ug_shopbg_cand_<i>.png（確認後に images/ へ）
// 採用時: images/manju_scene.jpg ／ images/ug_shop01.jpg（setShopBg の地底分岐を url に差し替え）
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args  = process.argv.slice(2);
const getArg = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const only = getArg('only') || '';
const N    = Math.max(1, Math.min(4, parseInt(getArg('n') || '2', 10)));

// ⚠この塊が「頭身ルール」＋「同一人物ルール」の本体。触らないこと（[[piyo-artwork-proportion-rule]]）。
// ⚠1.570のユーザー指定で**服はタイトル画面のメイド服のまま**にした（他の一枚絵は黄色ワンピに着替えさせて
//   いるが、地底の店の絵だけは「タイトルと同じ格好」の指定）。ツインテールも維持。
// ⚠「可愛い顔」であることも明示的に要求する。1回目の生成は目つきが鋭く不機嫌そうになり却下された。
const CHARACTER = [
  'Use the EXACT SAME girl character as in the reference image: same CUTE round soft face, same big warm brown eyes,',
  'same long black TWIN-TAIL hair with yellow ribbons, same yellow headband, and the SAME OUTFIT as the reference',
  '(the yellow-and-black maid dress with frills and the yellow bow at the collar — keep it exactly, do NOT change her clothes).',
  'Same BODY PROPORTIONS as the reference (about 5-6 heads tall, slim — NOT chibi, NOT super-deformed).',
  'Her face must stay CUTE and soft and appealing — big round eyes with clear highlights, small delicate nose and mouth.',
  'Do NOT make her look angry, grumpy, sullen, sharp-eyed, tired or ugly.',
].join(' ');

const MANJU_PROMPT = [
  CHARACTER,
  'REPLACE THE ENTIRE BACKGROUND AND SCENE: she is deep underground in a cramped, dimly lit cave shop run by a suspicious old crone.',
  'She is NERVOUSLY EATING A SUSPICIOUS PALE STEAMED BUN that she holds in both hands close to her mouth, having just taken one small careful bite.',
  'EXPRESSION (most important): she stays CUTE, but she is clearly TENSE and worried — big round eyes open wide and looking down at the bun,',
  'eyebrows tilted up in the middle in a worried droop, a small nervous smile at the corner of her mouth, a light blush,',
  'and SEVERAL VISIBLE SWEAT DROPLETS on her temple and cheek. Shoulders slightly drawn up. She is thinking "...is this safe to eat?".',
  'Cute and endearing while anxious — NOT angry, NOT glaring, NOT half-lidded, NOT disgusted, NOT crying.',
  'Background: rough dark rock walls, a low stone counter, dusty jars and bundles of dried herbs hanging from the ceiling, lit only by a small violet lantern and an orange candle. Cold, eerie, mysterious.',
  'No chickens, no chicks, no castle, no outdoor scenery, no other people (the crone is NOT in frame).',
  'Retro 16-bit pixel art style, landscape composition, the girl and the bun are the focus. No text, no border, no UI.',
].join(' ');

const SHOPBG_PROMPT = [
  CHARACTER,
  'REPLACE THE ENTIRE BACKGROUND AND SCENE: the inside of a SUSPICIOUS OLD CRONE\'S SHOP dug into an underground cave.',
  'COMPOSITION (match a classic RPG shop interior): a long worn stone-and-timber COUNTER runs across the middle of the frame.',
  'The GIRL stands on the RIGHT side in front of the counter, seen full body from head to shoes, turned slightly toward the counter.',
  'HER FACE (important — 1.570 のユーザー指摘「不機嫌そうに見える」を潰すための指定):',
  'she must look CUTE and endearing — big round sparkling eyes with clear highlights, soft round cheeks, a light blush,',
  'and a SLIGHTLY SURPRISED / curious expression: eyes a little wide, eyebrows raised, small open "oh?" mouth,',
  'as if she just noticed something odd on the shelf. Bright and charming even in a gloomy place.',
  'She must NOT look grumpy, sullen, annoyed, bored, blank, glaring, half-lidded, tired or unhappy.',
  'Behind the counter on the LEFT stands the SHOPKEEPER: a tiny hunched OLD WOMAN in a tattered dark violet hooded shawl,',
  'a wrinkled face with a long nose and a knowing crooked smile, white hair, gnarled hands resting on the counter.',
  'She looks eerie and mysterious but harmless and a little comical — an old witch-granny, NOT a monster, NOT scary-violent, NOT skeletal.',
  'Background: rough dark rock walls, shelves cut into the rock crowded with dusty glass jars, gnarled roots, old scrolls,',
  'bundles of dried herbs hanging from the ceiling, a cracked mortar and a small iron cauldron. On the counter: a few odd jars and a steamed bun on a plate.',
  'Lit by a violet lantern and a couple of orange candles. Eerie, cramped, secretive.',
  'Retro 16-bit pixel art style, landscape composition, both characters clearly visible and fully in frame.',
  'No chickens, no chicks, no castle, no outdoor scenery, no skulls, no bones, no blood. No text, no border, no grid, no UI.',
].join(' ');

async function generate(prompt, size) {
  const body = { model: 'gpt-image-1', prompt, size, quality: 'high', output_format: 'png', n: 1 };
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ? json.error.message : `HTTP ${res.status}`);
      return Buffer.from(json.data[0].b64_json, 'base64');
    } catch (e) { lastErr = e; const w = 3000 * attempt; console.warn(`  失敗(${attempt}/3): ${e.message} ${w}ms待機`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

// ⚠人物が写る絵は必ず edits（title.jpg 参照）を通す＝同一人物・同じ頭身を保つ唯一の方法
async function edit(prompt, size) {
  const ref = await fs.readFile(path.join(IMAGES_DIR, 'title.jpg'));
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('quality', 'high');
      form.append('image', new Blob([ref], { type: 'image/jpeg' }), 'title.jpg');
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return Buffer.from((await res.json()).data[0].b64_json, 'base64');
    } catch (e) { lastErr = e; const w = 3000 * attempt; console.warn(`  失敗(${attempt}/3): ${e.message} ${w}ms待機`); await new Promise(r => setTimeout(r, w)); }
  }
  throw lastErr;
}

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });

if (!only || only === 'manju') {
  for (let i = 1; i <= N; i++) {
    console.log(`● まんじゅう演出絵 ${i}/${N}（title.jpg参照のedits＝5-6頭身を保つ）...`);
    const buf = await edit(MANJU_PROMPT, '1536x1024');
    await fs.writeFile(path.join(RAW_DIR, `ug_manju_cand_${i}.png`), buf);
    console.log(`  ✓ _raw/ug_manju_cand_${i}.png`);
  }
}
if (!only || only === 'shopbg') {
  for (let i = 1; i <= N; i++) {
    console.log(`● 店内絵（ぴよ氏＋老婆）${i}/${N}（title.jpg参照のedits）...`);
    const buf = await edit(SHOPBG_PROMPT, '1536x1024');
    await fs.writeFile(path.join(RAW_DIR, `ug_shopbg_cand_${i}.png`), buf);
    console.log(`  ✓ _raw/ug_shopbg_cand_${i}.png`);
  }
}
console.log('\n完了。_raw/ を確認して採用分を images/ へ（manju_scene.jpg / ug_shop01.jpg）');
