// ─────────────────────────────────────────────────────────────────────────────
// normalize-skin.mjs
// 生成済みの raw（_raw/oai_<key>_1024.png）を、idle(skin_maid_idle.png)に
// 「大きさ・足元ライン・彩度」を揃えて 64×64 に整える後処理。API課金なしで何度でも再実行可。
//
//   zsh -ic 'cd games/piyo-adventure/tools && node normalize-skin.mjs --only=walk_1,jump'
//   --only=...        対象キー（既定 walk_1,jump）
//   --sat=0.85        彩度倍率を手動指定（未指定なら idle に自動マッチ）
//   --commit          images/skin_maid_<key>.png に反映（既定は _raw/ にプレビューのみ）
// 出力: _raw/oai_<key>_norm_(64|256).png
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
const ONLY      = (getArg('only') || 'walk_1,jump').split(',').map(s => s.trim()).filter(Boolean);
const SAT_MANUAL= getArg('sat') ? parseFloat(getArg('sat')) : null;
const BRIGHT    = getArg('bright') ? parseFloat(getArg('bright')) : 1.0;
const COMMIT    = hasFlag('commit');
const OUT = 64;

async function rawRGBA(buf) { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, ...info }; }
function bboxOf(d) {
  const { data, width, height, channels } = d; let minX=width, minY=height, maxX=-1, maxY=-1;
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) { if (data[(y*width+x)*channels+3] > 40) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
  return { minX, minY, maxX, maxY, w:maxX-minX+1, h:maxY-minY+1, width, height };
}
function meanSat(d) {
  const { data, channels } = d; let s=0, c=0;
  for (let i=0;i<data.length;i+=channels) { if (data[i+3]<128) continue; const r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b); s += mx?(mx-mn)/mx:0; c++; }
  return c ? s/c : 0;
}

async function main() {
  const idle = await rawRGBA(await fs.readFile(path.join(IMAGES_DIR, 'skin_maid_idle.png')));
  const ib = bboxOf(idle);
  const refSat = meanSat(idle);
  const refGapBottom = (idle.height - 1) - ib.maxY;  // 足元より下の透明余白
  const refH = ib.h;                                  // 64キャンバス内のキャラ身長
  console.log(`idle: charH=${refH}/64  gapBottom=${refGapBottom}  meanSat=${refSat.toFixed(3)}`);

  for (const key of ONLY) {
    const rawPath = path.join(RAW_DIR, `oai_${key}_1024.png`);
    const raw = await rawRGBA(await fs.readFile(rawPath));
    const fb = bboxOf(raw);
    const fSat = meanSat(raw);
    let sat = SAT_MANUAL != null ? SAT_MANUAL : (refSat>0 && fSat>0 ? refSat/fSat : 1);
    sat = Math.max(0.3, Math.min(1.3, sat));

    let targetH = refH;
    let targetW = Math.round(fb.w * (targetH / fb.h));
    if (targetW > OUT) { targetW = OUT; targetH = Math.round(fb.h * (targetW / fb.w)); }

    const content = await sharp(await fs.readFile(rawPath))
      .extract({ left: fb.minX, top: fb.minY, width: fb.w, height: fb.h })
      .modulate({ brightness: BRIGHT, saturation: sat })
      .resize(targetW, targetH, { fit: 'fill', kernel: 'lanczos3' })
      .png().toBuffer();

    const left = Math.max(0, Math.round((OUT - targetW) / 2));
    const top  = Math.max(0, (OUT - 1) - refGapBottom - (targetH - 1));
    const norm = await sharp({ create: { width: OUT, height: OUT, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
      .composite([{ input: content, left, top }])
      .png().toBuffer();

    await fs.writeFile(path.join(RAW_DIR, `oai_${key}_norm_64.png`), norm);
    await fs.writeFile(path.join(RAW_DIR, `oai_${key}_norm_256.png`), await sharp(norm).resize(256,256,{ kernel:'nearest' }).png().toBuffer());
    console.log(`${key}: srcContent=${fb.w}x${fb.h} meanSat=${fSat.toFixed(3)} -> sat×${sat.toFixed(2)}, size→${targetW}x${targetH}  ✓ norm`);
    if (COMMIT) { await fs.writeFile(path.join(IMAGES_DIR, `skin_maid_${key}.png`), norm); console.log(`  ✓ images/skin_maid_${key}.png に反映`); }
  }
}
main().catch(e => { console.error('✗', e.message || e); process.exit(1); });
