// idol-jumpfall-candidates.mjs — ジャンプ/落下のコマ候補を一覧にする（1.669）。
// ⚠**APIを使わない**。_raw/veo_frames_idol_jf の既存コマから作るだけ。
//
// なぜ要るか: 跳躍の頂点付近は**目視だと上昇中と下降中の区別が付かない**。
//   足元Y（緑でない画素の最下端）を全コマ測り、前コマとの差で上昇/下降を判定して仕分ける。
//   取り違えると「跳んでいるのに落下ポーズ」になる。
// 出力は**実際に書き出される64pxの姿**（veo-frames-to-idol.mjs と同じ整列）を5倍のドット等倍で並べたもの。
//   生フレームのまま並べると、縮小で潰れる差が見えず選び間違える。
//
// 使い方: node idol-jumpfall-candidates.mjs <出力ディレクトリ>
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const FRAMES_DIR = path.join(RAW_DIR, 'veo_frames_idol_jf');
const OUTDIR = process.argv[2];
const OUT = 64, SCALE = 5;

const isGreen = (r, g, b) => g > 90 && g > r * 1.35 && g > b * 1.35;

async function rawRGBA(buf){ const {data,info}=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {data,...info}; }
function bboxA(d){ const {data,width,height,channels}=d; let a=width,b=height,c=-1,e=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){ if(data[(y*width+x)*channels+3]>50){ if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>e)e=y; } }
  return {minX:a,minY:b,maxX:c,maxY:e,w:c-a+1,h:e-b+1,width,height}; }
async function chromaKey(framePath){
  const d = await rawRGBA(await fs.readFile(framePath));
  const { data, channels } = d;
  for(let i=0;i<data.length;i+=channels){
    const r=data[i],g=data[i+1],b=data[i+2], mxRB=Math.max(r,b), greenness=g-mxRB;
    if(greenness > 50 && g > 85){ data[i+3] = 0; }
    else if(greenness > 18){ data[i+1]=mxRB; const t=Math.min(1,(greenness-18)/32); data[i+3]=Math.round(data[i+3]*(1-0.8*t)); }
    else if(greenness > 0){ data[i+1]=mxRB; }
  }
  return d;
}
// veo-frames-to-idol.mjs と同じ整列（立ち絵の身長・足元に合わせて64pxへ）
async function toSprite(framePath, refH, refGap){
  const keyed = await chromaKey(framePath);
  const png = await sharp(keyed.data,{raw:{width:keyed.width,height:keyed.height,channels:keyed.channels}}).png().toBuffer();
  const bb = bboxA(await rawRGBA(png));
  let tH=Math.min(OUT-2, refH), tW=Math.round(bb.w*tH/bb.h); if(tW>OUT){ tW=OUT; tH=Math.round(bb.h*tW/bb.w); }
  const content = await sharp(png).extract({left:bb.minX,top:bb.minY,width:bb.w,height:bb.h})
    .resize(tW,tH,{fit:'fill',kernel:'lanczos3'}).png().toBuffer();
  const left=Math.max(0,Math.round((OUT-tW)/2)), top=Math.max(0,(OUT-1)-refGap-(tH-1));
  return sharp({create:{width:OUT,height:OUT,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:content,left,top}]).png().toBuffer();
}

// ── 足元Yを全コマ測る ──
const files=(await fs.readdir(FRAMES_DIR)).filter(f=>f.endsWith('.png')).sort();
const rows=[];
for(const f of files){
  const {data,width,height,channels}=await rawRGBA(await fs.readFile(path.join(FRAMES_DIR,f)));
  let maxY=-1;
  for(let y=height-1;y>=0;y--){
    let hit=false;
    for(let x=0;x<width;x++){ const p=(y*width+x)*channels; if(!isGreen(data[p],data[p+1],data[p+2])){hit=true;break;} }
    if(hit){ maxY=y; break; }
  }
  rows.push({ n:+f.match(/(\d+)/)[1], foot:maxY });
}
const ground=Math.max(...rows.map(r=>r.foot)), apex=Math.min(...rows.map(r=>r.foot));
console.log(`接地=${ground} 頂点=${apex} 跳躍=${ground-apex}px / ${rows.length}コマ`);

const tagged=[];
for(let i=1;i<rows.length;i++){
  const d=rows[i].foot-rows[i-1].foot;                        // 負=上昇 / 正=下降
  const air=(ground-rows[i].foot)/((ground-apex)||1);
  tagged.push({ n:rows[i].n, air:+air.toFixed(2), dir: d<-1?'up': d>1?'down':'-' });
}
// 空中率が高い順に、上昇/下降それぞれ最大12コマ。並びはコマ番号順（動きの流れが見えるように）
const pick=(dir)=>tagged.filter(t=>t.dir===dir && t.air>0.35).sort((a,b)=>b.air-a.air).slice(0,12).sort((a,b)=>a.n-b.n);
const idle = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR,'skin_idol_idle.png')));
const ib = bboxA(idle); const refGap=(idle.height-1)-ib.maxY, refH=ib.h;

async function sheet(list, title, outName){
  const CW=OUT*SCALE, PAD=10, cols=6, rows2=Math.ceil(list.length/cols);
  const cells=[];
  for(const t of list){
    const sp=await toSprite(path.join(FRAMES_DIR,`f_${String(t.n).padStart(3,'0')}.png`), refH, refGap);
    cells.push({ t, buf: await sharp(sp).resize(CW,CW,{kernel:'nearest'}).png().toBuffer() });
  }
  const Wt=PAD+(CW+PAD)*cols, Ht=34+PAD+(CW+26+PAD)*rows2;
  const svg=`<svg width="${Wt}" height="${Ht}"><style>h{font:bold 22px sans-serif;fill:#222} t{font:bold 17px sans-serif;fill:#333}</style>
    <text class="h" x="${PAD}" y="26">${title}</text>
    ${cells.map((c,i)=>{const r=Math.floor(i/cols),k=i%cols;
      return `<text class="t" x="${PAD+(CW+PAD)*k+CW/2-40}" y="${34+PAD+(CW+26+PAD)*r+CW+19}">#${c.t.n}（高さ${Math.round(c.t.air*100)}%）</text>`;}).join('')}</svg>`;
  await sharp({create:{width:Wt,height:Ht,channels:4,background:{r:245,g:245,b:248,alpha:1}}})
    .composite([...cells.map((c,i)=>{const r=Math.floor(i/cols),k=i%cols;
      return {input:c.buf,left:PAD+(CW+PAD)*k,top:34+PAD+(CW+26+PAD)*r};}),{input:Buffer.from(svg),left:0,top:0}])
    .png().toFile(path.join(OUTDIR,outName));
  console.log(`✓ ${outName}: ${list.map(t=>'#'+t.n).join(' ')}`);
}
await fs.mkdir(OUTDIR,{recursive:true});
await sheet(pick('up'),   'ジャンプ候補（上昇中）  ※現在の採用= #13', 'cand_jump.png');
await sheet(pick('down'), '落下候補（下降中）  ※現在の採用= #21',     'cand_fall.png');
