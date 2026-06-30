// ─────────────────────────────────────────────────────────────────────────────
// opacify-skin.mjs — スプライトの「内部の透明穴」を塗り戻す。
// 白抜き処理(gradedWhiteKey)等で薄い肌色が背景と誤認され透明になる不具合の修正用。
// 縁から繋がる透明=本物の背景は透明のまま、キャラ内部(囲まれた透明)は不透明化＝二値アルファ。
// （内部のRGB＝色は不変。輪郭はクリスプ化。）images/<name>.png を上書き。
//   zsh -ic 'cd games/piyo-adventure/tools && node opacify-skin.mjs'        # 既定の skin_maid 7枚
//   node opacify-skin.mjs skin_maid_idle other_sprite                       # 個別指定
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const DEFAULT = ['skin_maid_idle','skin_maid_walk_1','skin_maid_walk_2','skin_maid_walk_3','skin_maid_walk_4','skin_maid_jump','skin_maid_fall'];
const names = process.argv.slice(2).filter(a => !a.startsWith('--'));
const list = names.length ? names : DEFAULT;
const T = 128;

for (const n of list) {
  const f = path.join(IMAGES_DIR, `${n}.png`);
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; const A = (x,y) => (y*width+x)*channels+3;
  const isT = (x,y) => data[A(x,y)] < T;
  const ext = new Uint8Array(width*height); const q = [];
  const seed = (x,y) => { if (isT(x,y) && !ext[y*width+x]) { ext[y*width+x]=1; q.push(x,y); } };
  for (let x=0;x<width;x++){ seed(x,0); seed(x,height-1); }
  for (let y=0;y<height;y++){ seed(0,y); seed(width-1,y); }
  while (q.length) { const y=q.pop(), x=q.pop();
    for (const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]])
      if (nx>=0&&nx<width&&ny>=0&&ny<height&&isT(nx,ny)&&!ext[ny*width+nx]) { ext[ny*width+nx]=1; q.push(nx,ny); }
  }
  let opa=0; for (let y=0;y<height;y++) for (let x=0;x<width;x++){
    const e=ext[y*width+x]; const i=A(x,y);
    data[i] = e?0:255;            // 背景=透明 / キャラ=不透明(二値)
    if(!e){ opa++; const r=data[i-3],g=data[i-2],b=data[i-1],mx=Math.max(r,b); if(g>mx) data[i-2]=mx; } // 緑かぶり除去(デスピル)
  }
  await sharp(data, { raw:{ width, height, channels } }).png().toFile(f);
  console.log(`${n}: opaque=${opa}/${width*height}`);
}
console.log('done (in-place).');
