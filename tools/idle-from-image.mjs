// ─────────────────────────────────────────────────────────────────────────────
// idle-from-image.mjs — ユーザー生成のメイド正面立ち絵(透過PNG)を 64×64 idleスプライト化。
//   背景は既に透過済みなのでクロマキー不要。bboxトリム → idle基準(高さ/足元)で正規化。
//   zsh -ic 'cd games/piyo-adventure/tools && node idle-from-image.mjs'
//   --src=<file>  --th=54(目標身長) --bright=1.0 --sat=1.0 --acut=0(縁の薄alpha切り捨て閾値) --commit
// 出力: _raw/user_idle_norm_(64|256).png, _raw/user_idle_magenta_256.png
// ─────────────────────────────────────────────────────────────────────────────
import sharp from './node_modules/sharp/lib/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, '..', 'images');
const RAW_DIR    = path.resolve(__dirname, '_raw');
const args = process.argv.slice(2);
const getArg  = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const hasFlag = (n) => args.includes(`--${n}`);
const SRC    = getArg('src', 'ChatGPT Image 2026年6月29日 14_22_33.png');
const TH     = parseInt(getArg('th', '54'), 10);   // 目標キャラ身長(他スプライトと統一)
const BRIGHT = parseFloat(getArg('bright', '1.0'));
const SAT    = parseFloat(getArg('sat', '1.0'));
const ACUT   = parseInt(getArg('acut', '0'), 10);  // この値未満のalphaは0に(薄いグレー縁の除去)
const COMMIT = hasFlag('commit');
const OUT = 64, GAP_BOTTOM = 5;

async function rawRGBA(buf){ const r = await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {data:r.data, width:r.info.width, height:r.info.height, channels:r.info.channels}; }
function bboxA(d, thr=50){ const {data,width,height,channels}=d; let a=width,b=height,c=-1,e=-1; for(let y=0;y<height;y++)for(let x=0;x<width;x++){ if(data[(y*width+x)*channels+3]>thr){ if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>e)e=y; } } return {minX:a,minY:b,maxX:c,maxY:e,w:c-a+1,h:e-b+1}; }

async function main(){
  let srcBuf = await fs.readFile(path.join(IMAGES_DIR, SRC));
  // optional: cut very-faint edge alpha (removes gray ghost halo) before trimming
  if(ACUT > 0){
    const d = await rawRGBA(srcBuf);
    for(let i=0;i<d.data.length;i+=d.channels){ if(d.data[i+3] < ACUT) d.data[i+3]=0; }
    srcBuf = await sharp(d.data,{raw:{width:d.width,height:d.height,channels:d.channels}}).png().toBuffer();
  }
  const d = await rawRGBA(srcBuf);
  const bb = bboxA(d);
  console.log(`src bbox: ${bb.w}x${bb.h} @ ${bb.minX},${bb.minY}`);

  // scale to target height, keep aspect
  let tH = Math.min(OUT-2, TH);
  let tW = Math.round(bb.w * tH / bb.h);
  if(tW > OUT){ tW = OUT; tH = Math.round(bb.h * tW / bb.w); }

  const content = await sharp(srcBuf)
    .extract({ left: bb.minX, top: bb.minY, width: bb.w, height: bb.h })
    .modulate({ brightness: BRIGHT, saturation: SAT })
    .resize(tW, tH, { fit:'fill', kernel:'lanczos3' })
    .png().toBuffer();

  const left = Math.max(0, Math.round((OUT - tW) / 2));
  const top  = Math.max(0, (OUT-1) - GAP_BOTTOM - (tH-1));
  const norm = await sharp({ create:{ width:OUT, height:OUT, channels:4, background:{r:0,g:0,b:0,alpha:0} } })
    .composite([{ input: content, left, top }]).png().toBuffer();

  // report final bbox/gap for parity with other sprites
  const fb = bboxA(await rawRGBA(norm));
  console.log(`out: char ${fb.w}x${fb.h}  top=${fb.minY} gapBottom=${(OUT-1)-fb.maxY} left=${left}`);

  await fs.writeFile(path.join(RAW_DIR,'user_idle_norm_64.png'), norm);
  await fs.writeFile(path.join(RAW_DIR,'user_idle_norm_256.png'), await sharp(norm).resize(256,256,{kernel:'nearest'}).png().toBuffer());
  // magenta transparency check
  await sharp({ create:{ width:OUT, height:OUT, channels:4, background:{r:255,g:0,b:255,alpha:1} } })
    .composite([{ input: norm }]).resize(256,256,{kernel:'nearest'}).png()
    .toFile(path.join(RAW_DIR,'user_idle_magenta_256.png'));
  console.log('wrote _raw/user_idle_norm_64.png /_256 /_magenta_256');

  if(COMMIT){ await fs.writeFile(path.join(IMAGES_DIR,'skin_maid_idle.png'), norm); console.log('✓ images/skin_maid_idle.png updated'); }
}
main().catch(e=>{console.error('✗',e.message||e);process.exit(1);});
