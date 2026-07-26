// ─────────────────────────────────────────────────────────────────────────────
// generate-ug-ending-scene.mjs — 地底クリアの「真のエンディング」一枚絵（1.583）
// ⚠ぴよ氏は必ず title.jpg を参照画像にした gpt-image-1 edits で描く（ユーザー厳命の頭身ルール）:
//   デフォルメ/ちび頭身は絶対禁止・5〜6頭身・同一人物。服は**タイトル画面の黄色いメイド服のまま**
//   （p2b の一枚絵は黄色ワンピースに変えていたが、今回はユーザー指定でメイド服）。
// 出力は tools/_raw/ の候補まで。確認後に images/ug_ending.jpg として配置する。
// 実行: zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-ug-ending-scene.mjs'
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');

// ⚠この塊は触らないこと。頭身とメイド服の指定がここに集約されている。
const CHARACTER = [
  'Use the EXACT SAME girl character as in the reference image: same face, same brown eyes,',
  'same long black twin-tail hair with yellow ribbons, the same yellow cat-ear headband,',
  'and the SAME BODY PROPORTIONS (about 5-6 heads tall, slim — NOT chibi, NOT super-deformed, NOT a small mascot).',
  'KEEP HER OUTFIT EXACTLY AS IN THE REFERENCE: the yellow-and-black frilled maid dress with the chick motifs on the skirt,',
  'black thigh-high socks and black shoes. Do not change the costume.',
].join(' ');

// 共通の画づくり。既存の一枚絵（manju_scene / ug_shop01）と同じ作法に揃える。
const COMMON = [
  'Retro 16-bit pixel art style, landscape composition, cinematic and emotional.',
  'No text, no logo, no border, no UI, no health bar.',
].join(' ');

const SCENES = [
  {
    key: 'a', out: 'ugending_cand_a.png',
    prompt: [
      CHARACTER,
      'REPLACE THE ENTIRE BACKGROUND AND SCENE: she stands in a vast dark underground cavern, seen from BEHIND at three-quarter angle,',
      'small against the huge space but clearly readable. She looks up toward a bright shaft of warm golden sunlight',
      'that breaks through a collapsed opening high in the rocky ceiling — the way back to the surface has opened.',
      'The purple braziers that lit the cavern have gone out, thin wisps of violet smoke still rising from them.',
      'On the stone floor behind her, faint scattered purple embers are all that remain of a fallen dark priestess.',
      'Mood: the long fight is over, quiet relief and awe. Warm gold light against cold purple shadow.',
      COMMON,
    ].join(' '),
  },
  {
    key: 'b', out: 'ugending_cand_b.png',
    prompt: [
      CHARACTER,
      'REPLACE THE ENTIRE BACKGROUND AND SCENE: she stands in the middle of a huge dark stone arena deep underground,',
      'facing away from the viewer toward a tall gate that has just opened, with warm golden sunlight pouring down the stairway beyond it.',
      'Her silhouette is rimmed by the light; a few golden sparkles and one shining golden egg float near her.',
      'Behind her the extinguished purple braziers and a cracked dark idol statue fade into shadow.',
      'Mood: triumphant but calm — the moment before walking home. Warm gold light against cold purple shadow.',
      COMMON,
    ].join(' '),
  },
];

async function editScene(sc) {
  console.log(`● ${sc.out} 生成中（title.jpg 参照）...`);
  const ref = await fs.readFile(path.join(IMAGES_DIR, 'title.jpg'));
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', sc.prompt);
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('image', new Blob([ref], { type: 'image/jpeg' }), 'title.jpg');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }, body: form,
    });
    if (res.ok) {
      const json = await res.json();
      await fs.writeFile(path.join(RAW_DIR, sc.out), Buffer.from(json.data[0].b64_json, 'base64'));
      console.log(`  ✓ tools/_raw/${sc.out}`);
      return;
    }
    const txt = (await res.text()).slice(0, 300);
    if (attempt === 3) throw new Error(`HTTP ${res.status}: ${txt}`);
    console.log(`  retry ${attempt}: ${res.status}`);
    await new Promise(r => setTimeout(r, 3000));
  }
}

if (!process.env.OPENAI_API_KEY) { console.error('✗ OPENAI_API_KEY 未設定'); process.exit(1); }
await fs.mkdir(RAW_DIR, { recursive: true });
for (const sc of SCENES) await editScene(sc);
console.log('完了。候補を確認してから images/ug_ending.jpg として配置すること。');
