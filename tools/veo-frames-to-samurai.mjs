// ─────────────────────────────────────────────────────────────────────────────
// veo-frames-to-samurai.mjs — 侍ぴよ: Veoの緑背景フレームをスプライトに変換（veo-frames-to-witch.mjs の侍版・キー汎用化）。
// 緑クロマキー → デスピル → トリム → skin_samurai_idle の身長/足元に合わせて64×64。
//   前段: ffmpeg -i _raw/veo_samurai_<action>.mp4 _raw/veo_frames_samurai_<action>/f_%03d.png
//   zsh -ic 'cd tools && node veo-frames-to-samurai.mjs --action=walk --keys=walk_1,walk_2,walk_3,walk_4 --frames=22,30,38,46 --commit'
//   zsh -ic 'cd tools && node veo-frames-to-samurai.mjs --action=jumpfall --keys=jump,fall --frames=18,40 --commit'
//   zsh -ic 'cd tools && node veo-frames-to-samurai.mjs --action=dive --keys=dive --frames=52 --commit'
//   --keys / --frames は同数で対応。--bright --sat 色調整 / --scaleup 全身スケール / --commit で images/ 反映
// 出力: _raw/veo_samurai_<key>_norm_(64|256).png（--commit で images/skin_samurai_<key>.png）
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
const ACTION = getArg('action') || 'walk';
const FRAMES_DIR = path.join(RAW_DIR, `veo_frames_samurai_${ACTION}`);
const KEYS   = (getArg('keys') || 'walk_1,walk_2,walk_3,walk_4').split(',').map(s => s.trim()).filter(Boolean);
const FRAMES = (getArg('frames') || '22,30,38,46').split(',').map(s => parseInt(s.trim(), 10));
const BRIGHT = getArg('bright') ? parseFloat(getArg('bright')) : 1.0;
const SAT    = getArg('sat') ? parseFloat(getArg('sat')) : 1.0;
const HEADSCALE = getArg('headscale') ? parseFloat(getArg('headscale')) : 1.0;
const HEADFRAC  = getArg('headfrac') ? parseFloat(getArg('headfrac')) : 0.46;
const SCALEUP   = getArg('scaleup') ? parseFloat(getArg('scaleup')) : 1.0;
const CROPBOTTOM = getArg('cropbottom') ? parseFloat(getArg('cropbottom')) : 0; // 下端の砂埃等を捨てる割合(0-0.5)
const DESPECKLE = getArg('despeckle') ? parseInt(getArg('despeckle'), 10) : 0; // この画素数未満の孤立成分を除去（浮遊する砂埃対策）
const COMMIT = hasFlag('commit');
const OUT = 64;

async function rawRGBA(buf){ const {data,info}=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {data,...info}; }
function bboxA(d){ const {data,width,height,channels}=d; let a=width,b=height,c=-1,e=-1; for(let y=0;y<height;y++)for(let x=0;x<width;x++){ if(data[(y*width+x)*channels+3]>50){ if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>e)e=y; } } return {minX:a,minY:b,maxX:c,maxY:e,w:c-a+1,h:e-b+1,width,height}; }
function meanSV(d){ const {data,channels}=d; let S=0,V=0,n=0; for(let i=0;i<data.length;i+=channels){ if(data[i+3]<128)continue; const r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b); S+=mx?(mx-mn)/mx:0; V+=mx/255; n++; } return {S:n?S/n:0,V:n?V/n:0}; }

async function chromaKey(framePath){
  const d = await rawRGBA(await fs.readFile(framePath));
  const { data, channels } = d;
  for(let i=0;i<data.length;i+=channels){
    const r=data[i],g=data[i+1],b=data[i+2];
    const mxRB = Math.max(r,b);
    const greenness = g - mxRB;
    if(greenness > 50 && g > 85){ data[i+3] = 0; }
    else if(greenness > 18){
      data[i+1] = mxRB;
      const t = Math.min(1, (greenness - 18) / (50 - 18));
      data[i+3] = Math.round(data[i+3] * (1 - 0.8 * t));
    } else if(greenness > 0){ data[i+1] = mxRB; }
  }
  return d;
}
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
  if (KEYS.length !== FRAMES.length) { console.error(`✗ --keys(${KEYS.length})と--frames(${FRAMES.length})の数が不一致`); process.exit(1); }
  const idle = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR,'skin_samurai_idle.png')));
  const ib = bboxA(idle); const isv = meanSV(idle);
  const refGap = (idle.height-1)-ib.maxY, refH = ib.h;
  console.log(`idle: charH=${refH} gapBottom=${refGap} S=${isv.S.toFixed(3)} V=${isv.V.toFixed(3)}`);

  for(let k=0;k<KEYS.length;k++){
    const key = KEYS[k];
    const framePath = path.join(FRAMES_DIR, `f_${String(FRAMES[k]).padStart(3,'0')}.png`);
    const keyed = await chromaKey(framePath);
    if (CROPBOTTOM > 0) { // 地面際の砂埃演出などをbbox計算前に消す（キャラ本体は上側にある前提）
      const cutY = Math.round(keyed.height * (1 - CROPBOTTOM));
      for (let y = cutY; y < keyed.height; y++)
        for (let x = 0; x < keyed.width; x++) keyed.data[(y * keyed.width + x) * keyed.channels + 3] = 0;
    }
    if (DESPECKLE > 0) { // 最大成分（キャラ本体）以外の小さな孤立成分（砂埃の粒）をBFSで除去
      const { data, width, height, channels } = keyed;
      const seen = new Uint8Array(width * height);
      const compOf = new Int32Array(width * height).fill(-1);
      const sizes = [];
      const qx = new Int32Array(width * height), qy = new Int32Array(width * height);
      for (let y0 = 0; y0 < height; y0++) for (let x0 = 0; x0 < width; x0++) {
        const p0 = y0 * width + x0;
        if (seen[p0] || data[p0 * channels + 3] <= 50) continue;
        const id = sizes.length; let head = 0, tail = 0; qx[tail] = x0; qy[tail] = y0; tail++; seen[p0] = 1; let size = 0;
        while (head < tail) {
          const x = qx[head], y = qy[head]; head++;
          const p = y * width + x; compOf[p] = id; size++;
          if (x > 0 && !seen[p - 1] && data[(p - 1) * channels + 3] > 50) { seen[p - 1] = 1; qx[tail] = x - 1; qy[tail] = y; tail++; }
          if (x < width - 1 && !seen[p + 1] && data[(p + 1) * channels + 3] > 50) { seen[p + 1] = 1; qx[tail] = x + 1; qy[tail] = y; tail++; }
          if (y > 0 && !seen[p - width] && data[(p - width) * channels + 3] > 50) { seen[p - width] = 1; qx[tail] = x; qy[tail] = y - 1; tail++; }
          if (y < height - 1 && !seen[p + width] && data[(p + width) * channels + 3] > 50) { seen[p + width] = 1; qx[tail] = x; qy[tail] = y + 1; tail++; }
        }
        sizes.push(size);
      }
      for (let p = 0; p < width * height; p++) {
        const id = compOf[p];
        if (id >= 0 && sizes[id] < DESPECKLE) data[p * channels + 3] = 0;
      }
    }
    const sv = meanSV(keyed);
    let keyedPng = await sharp(keyed.data, { raw: { width:keyed.width, height:keyed.height, channels:keyed.channels } }).png().toBuffer();
    if(HEADSCALE !== 1) keyedPng = await enlargeHead(keyedPng, HEADSCALE, HEADFRAC);
    const bb = bboxA(await rawRGBA(keyedPng));

    let tH=Math.min(OUT-2, Math.round(refH*SCALEUP)), tW=Math.round(bb.w*tH/bb.h); if(tW>OUT){ tW=OUT; tH=Math.round(bb.h*tW/bb.w); }
    const content = await sharp(keyedPng)
      .extract({left:bb.minX,top:bb.minY,width:bb.w,height:bb.h})
      .modulate({ brightness:BRIGHT, saturation:SAT })
      .resize(tW,tH,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
    const left=Math.max(0,Math.round((OUT-tW)/2)), top=Math.max(0,(OUT-1)-refGap-(tH-1));
    let norm = await sharp({create:{width:OUT,height:OUT,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
      .composite([{input:content,left,top}]).png().toBuffer();
    norm = await despillPng(norm);

    await fs.writeFile(path.join(RAW_DIR,`veo_samurai_${key}_norm_64.png`), norm);
    await fs.writeFile(path.join(RAW_DIR,`veo_samurai_${key}_norm_256.png`), await sharp(norm).resize(256,256,{kernel:'nearest'}).png().toBuffer());
    console.log(`${key} <= f_${FRAMES[k]}  content=${bb.w}x${bb.h} S=${sv.S.toFixed(3)} V=${sv.V.toFixed(3)} -> ${tW}x${tH}`);
    if(COMMIT){ await fs.writeFile(path.join(IMAGES_DIR,`skin_samurai_${key}.png`), norm); console.log(`  ✓ images/skin_samurai_${key}.png`); }
  }
}
main().catch(e=>{console.error('✗',e.message||e);process.exit(1);});
