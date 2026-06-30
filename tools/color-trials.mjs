// idle に色を合わせるための候補ビューア。walk_1 の raw を idleサイズに整え、
// 明るさ(b)×彩度(s)を変えた候補を idle と並べて1枚に出す。API課金なし。
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(__dirname, '..', 'images');
const RAW    = path.resolve(__dirname, '_raw');
const OUT    = '/private/tmp/claude-501/-Users-veriquest-dev-piyo-adventure/e207e4af-7d8f-440a-96e6-709d247951d7/scratchpad/color_trials.png';

async function rawRGBA(b){ const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {data,...info}; }
function bbox(d){ const {data,width,height,channels}=d; let a=width,b=height,c=-1,e=-1; for(let y=0;y<height;y++)for(let x=0;x<width;x++){ if(data[(y*width+x)*channels+3]>40){ if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>e)e=y; } } return {minX:a,minY:b,maxX:c,maxY:e,w:c-a+1,h:e-b+1,width,height}; }
function stats(d){ const {data,channels}=d; let S=0,V=0,n=0; for(let i=0;i<data.length;i+=channels){ if(data[i+3]<128)continue; const r=data[i],g=data[i+1],bl=data[i+2],mx=Math.max(r,g,bl),mn=Math.min(r,g,bl); S+= mx?(mx-mn)/mx:0; V+= mx/255; n++; } return {S:S/n, V:V/n}; }

const idleBuf = await fs.readFile(path.join(IMAGES,'skin_maid_idle.png'));
const idleR = await rawRGBA(idleBuf); const ib = bbox(idleR); const ist = stats(idleR);
const refGap = (idleR.height-1)-ib.maxY, refH = ib.h;
console.log(`idle: V=${ist.V.toFixed(3)} S=${ist.S.toFixed(3)} charH=${refH}`);

const key = 'walk_1';
const rawBuf = await fs.readFile(path.join(RAW, `oai_${key}_1024.png`));
const fb = bbox(await rawRGBA(rawBuf)); const fst = stats(await rawRGBA(rawBuf));
console.log(`${key}: V=${fst.V.toFixed(3)} S=${fst.S.toFixed(3)}`);

let tH=refH, tW=Math.round(fb.w*tH/fb.h); if(tW>64){ tW=64; tH=Math.round(fb.h*tW/fb.w); }

const variants = [
  { b:1.00, s:1.00, label:'now' },
  { b:1.10, s:0.88, label:'A b1.10 s0.88' },
  { b:1.18, s:0.78, label:'B b1.18 s0.78' },
  { b:1.26, s:0.68, label:'C b1.26 s0.68' },
];

async function toPanel(buf){ return sharp(buf).resize(210,210,{fit:'contain',background:{r:0,g:0,b:0,alpha:0},kernel:'nearest'}).png().toBuffer(); }

const cells = [{ buf: await toPanel(idleBuf), label:'idle (kijun)' }];
for(const v of variants){
  const content = await sharp(rawBuf).extract({left:fb.minX,top:fb.minY,width:fb.w,height:fb.h})
    .modulate({ brightness:v.b, saturation:v.s }).resize(tW,tH,{fit:'fill'}).png().toBuffer();
  const left=Math.max(0,Math.round((64-tW)/2)), top=Math.max(0,63-refGap-(tH-1));
  const norm = await sharp({create:{width:64,height:64,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:content,left,top}]).png().toBuffer();
  cells.push({ buf: await toPanel(norm), label:v.label });
}

const COL=230,H=265,W=COL*cells.length,comps=[];
for(let i=0;i<cells.length;i++){
  comps.push({input:cells[i].buf,left:i*COL+10,top:8});
  comps.push({input:Buffer.from(`<svg width="${COL}" height="40"><text x="${COL/2}" y="26" font-family="sans-serif" font-size="18" fill="#111" text-anchor="middle">${cells[i].label}</text></svg>`),left:i*COL,top:218});
}
await sharp({create:{width:W,height:H,channels:4,background:'#d9d9d9'}}).composite(comps).png().toFile(OUT);
console.log('saved', OUT);
