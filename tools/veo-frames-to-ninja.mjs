// ─────────────────────────────────────────────────────────────────────────────
// veo-frames-to-skin.mjs — Veoの緑背景フレームを walk スプライトに変換。
// 緑クロマキー → トリム → idleの身長/足元に合わせて64×64 → (任意で色調整)。
//   zsh -ic 'cd games/piyo-adventure/tools && node veo-frames-to-skin.mjs --frames=38,44,50,56'
//   --frames=38,44,50,56  walk_1,2,3,4 に割り当てるフレーム番号
//   --bright=1.0 --sat=1.0  色調整（既定なし）/ --commit で images/ に反映
// 出力: _raw/veo_walk_<n>_norm_(64|256).png
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const FRAMES_DIR = path.join(RAW_DIR, 'veo_frames_ninja');
const args = process.argv.slice(2);
const getArg  = (n) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const hasFlag = (n) => args.includes(`--${n}`);
const FRAMES = (getArg('frames') || '38,44,50,56').split(',').map(s => parseInt(s.trim(),10));
const BRIGHT = getArg('bright') ? parseFloat(getArg('bright')) : 1.0;
const SAT    = getArg('sat') ? parseFloat(getArg('sat')) : 1.0;
const HEADSCALE = getArg('headscale') ? parseFloat(getArg('headscale')) : 1.0; // 頭部だけ拡大(比率合わせ・継ぎ目注意)
const HEADFRAC  = getArg('headfrac') ? parseFloat(getArg('headfrac')) : 0.46;  // キャラ上部の何割を頭とみなすか
const SCALEUP   = getArg('scaleup') ? parseFloat(getArg('scaleup')) : 1.0;     // walk全体を idle比で拡大(継ぎ目なし)
const COMMIT = hasFlag('commit');
const OUT = 64;

async function rawRGBA(buf){ const {data,info}=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {data,...info}; }
function bboxA(d){ const {data,width,height,channels}=d; let a=width,b=height,c=-1,e=-1; for(let y=0;y<height;y++)for(let x=0;x<width;x++){ if(data[(y*width+x)*channels+3]>50){ if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>e)e=y; } } return {minX:a,minY:b,maxX:c,maxY:e,w:c-a+1,h:e-b+1,width,height}; }
function meanSV(d){ const {data,channels}=d; let S=0,V=0,n=0; for(let i=0;i<data.length;i+=channels){ if(data[i+3]<128)continue; const r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b); S+=mx?(mx-mn)/mx:0; V+=mx/255; n++; } return {S:n?S/n:0,V:n?V/n:0}; }

// 緑クロマキー＋デスピル（緑かぶり除去）＋縁の半透明化。出力はRGBA rawバッファ。
async function chromaKey(framePath){
  const d = await rawRGBA(await fs.readFile(framePath));
  const { data, width, height, channels } = d;
  for(let i=0;i<data.length;i+=channels){
    const r=data[i],g=data[i+1],b=data[i+2];
    const mxRB = Math.max(r,b);
    const greenness = g - mxRB;
    if(greenness > 50 && g > 85){ data[i+3] = 0; }            // 緑背景 → 完全透過
    else if(greenness > 18){                                  // 縁の緑かぶり: デスピル＋緑度に応じ半透明化
      data[i+1] = mxRB;
      const t = Math.min(1, (greenness - 18) / (50 - 18));
      data[i+3] = Math.round(data[i+3] * (1 - 0.8 * t));
    } else if(greenness > 0){ data[i+1] = mxRB; }             // 軽い緑かぶり除去
  }
  return { data, width, height, channels };
}
// 縮小後に再度デスピル（lanczos縮小で再混入する緑を除去）
async function despillPng(pngBuf){
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for(let i=0;i<data.length;i+=channels){
    if(data[i+3] < 6) continue;
    const r=data[i],g=data[i+1],b=data[i+2],mxRB=Math.max(r,b);
    if(g > mxRB) data[i+1] = mxRB;
  }
  return sharp(data, { raw:{ width, height, channels } }).png().toBuffer();
}

// 頭部(上部 headFrac)だけを hs 倍に拡大して比率を上げる。首ラインに底を合わせて元画像へ上書き合成。
async function enlargeHead(charPng, hs, headFrac){
  if(hs === 1) return charPng;
  const bb = bboxA(await rawRGBA(charPng));
  const headH = Math.max(1, Math.round(bb.h * headFrac));
  const newHw = Math.round(bb.w * hs), newHh = Math.round(headH * hs);
  const head = await sharp(charPng).extract({ left: bb.minX, top: bb.minY, width: bb.w, height: headH })
    .resize(newHw, newHh, { fit: 'fill' }).png().toBuffer();
  const left = Math.max(0, Math.round(bb.minX + bb.w/2 - newHw/2));
  const top  = Math.max(0, Math.round(bb.minY + headH - newHh));
  return sharp(charPng).composite([{ input: head, left, top }]).png().toBuffer();
}

async function main(){
  // idle 基準
  const idle = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR,'skin_ninja_idle.png')));
  const ib = bboxA(idle); const isv = meanSV(idle);
  const refGap = (idle.height-1)-ib.maxY, refH = ib.h;
  console.log(`idle: charH=${refH} gapBottom=${refGap} S=${isv.S.toFixed(3)} V=${isv.V.toFixed(3)}`);

  for(let k=0;k<FRAMES.length;k++){
    const key = `walk_${k+1}`;
    const framePath = path.join(FRAMES_DIR, `f_${String(FRAMES[k]).padStart(3,'0')}.png`);
    const keyed = await chromaKey(framePath);
    const sv = meanSV(keyed);
    let keyedPng = await sharp(keyed.data, { raw: { width:keyed.width, height:keyed.height, channels:keyed.channels } }).png().toBuffer();
    if(HEADSCALE !== 1) keyedPng = await enlargeHead(keyedPng, HEADSCALE, HEADFRAC);  // 頭部拡大(比率合わせ)
    const bb = bboxA(await rawRGBA(keyedPng));

    let tH=Math.min(OUT-2, Math.round(refH*SCALEUP)), tW=Math.round(bb.w*tH/bb.h); if(tW>OUT){ tW=OUT; tH=Math.round(bb.h*tW/bb.w); }
    const content = await sharp(keyedPng)
      .extract({left:bb.minX,top:bb.minY,width:bb.w,height:bb.h})
      .modulate({ brightness:BRIGHT, saturation:SAT })
      .resize(tW,tH,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
    const left=Math.max(0,Math.round((OUT-tW)/2)), top=Math.max(0,(OUT-1)-refGap-(tH-1));
    let norm = await sharp({create:{width:OUT,height:OUT,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
      .composite([{input:content,left,top}]).png().toBuffer();
    norm = await despillPng(norm);   // 縮小後の緑かぶりを除去

    await fs.writeFile(path.join(RAW_DIR,`veo_ninja_walk_${k+1}_norm_64.png`), norm);
    await fs.writeFile(path.join(RAW_DIR,`veo_ninja_walk_${k+1}_norm_256.png`), await sharp(norm).resize(256,256,{kernel:'nearest'}).png().toBuffer());
    console.log(`${key} <= f_${FRAMES[k]}  content=${bb.w}x${bb.h} S=${sv.S.toFixed(3)} V=${sv.V.toFixed(3)} -> ${tW}x${tH}`);
    if(COMMIT){ await fs.writeFile(path.join(IMAGES_DIR,`skin_ninja_${key}.png`), norm); console.log(`  ✓ images/skin_ninja_${key}.png`); }
  }
}
main().catch(e=>{console.error('✗',e.message||e);process.exit(1);});
