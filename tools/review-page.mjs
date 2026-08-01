// ─────────────────────────────────────────────────────────────────────────────
// review-page.mjs — 候補画像を「iPhoneから見られる1ページ」に組む（2026-08-01）
//
// ⚠なぜ必要か: ユーザーが外出中で **iPhone アプリからのリモート操作**の時は、
//   `SendUserFile` の添付を開けない。**画像を見せられないと判断できない**
//   （`CLAUDE.md`「🚨生成した画像は必ずそのターンで出す」を満たすための手段）。
//   → 画像を data URI で埋め込んだ自己完結HTMLを作り、Artifact として公開する。
//   ⚠Artifact は外部ホストへの通信をCSPで塞ぐので**必ず data URI で埋め込む**こと。
//
// 使い方:
//   node review-page.mjs <spec.json> <out.html>
//
// spec.json の形:
//   { "title":"…", "eyebrow":"…", "h1":"…", "lede":"…", "chips":["…"],
//     "cards":[ {"file":"../images/x.jpg","name":"…","chip":"推奨","facts":["…"]} ],
//     "sections":[ {"label":"参考","cards":[…]} ],
//     "ask":{"h2":"決めてほしいこと","items":["…"],"note":"…"} }
//   ⚠file は tools/ からの相対パス。width は既定820pxでJPEG q78に落として埋め込む
// ─────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.length < 2) { console.error('使い方: node review-page.mjs <spec.json> <out.html>'); process.exit(1); }
const spec = JSON.parse(await fs.readFile(path.resolve(__dirname, args[0]), 'utf8'));
const OUT = path.resolve(__dirname, args[1]);
const WIDTH = spec.width || 820;
const Q = spec.quality || 78;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let bytes = 0;
async function dataUri(file) {
  const buf = await sharp(path.resolve(__dirname, file)).resize({ width: WIDTH }).jpeg({ quality: Q }).toBuffer();
  bytes += buf.length;
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
async function card(c) {
  const src = await dataUri(c.file);
  const chip = c.chip ? `<span class="chip${c.chipPlain ? ' plain' : ''}">${esc(c.chip)}</span>` : '';
  const facts = (c.facts || []).map((f) => `<li>${esc(f)}</li>`).join('');
  return `  <section class="shot">
    <img src="${src}" alt="">
    <div class="meta">
      <h2>${esc(c.name)}${chip}</h2>
      <ul>${facts}</ul>
    </div>
  </section>`;
}

const cards = (await Promise.all((spec.cards || []).map(card))).join('\n');
let extra = '';
for (const s of spec.sections || []) {
  const inner = (await Promise.all(s.cards.map(card))).join('\n');
  extra += `\n  <hr class="divider">\n  <p class="sub">${esc(s.label)}</p>\n${inner}`;
}
const ask = spec.ask ? `
  <div class="ask">
    <h2>${esc(spec.ask.h2 || '決めてほしいこと')}</h2>
    <ol>${(spec.ask.items || []).map((i) => `<li>${i}</li>`).join('')}</ol>
    ${spec.ask.note ? `<p class="note">${spec.ask.note}</p>` : ''}
  </div>` : '';

const html = `<title>${esc(spec.title)}</title>
<style>
  /* ぴよ氏の冒険の配色から: 髪の紫チャコール / レモンイエロー / リボンのマゼンタ */
  :root{
    --ground:#FBF6EE; --panel:#FFFFFF; --ink:#241C2E; --ink-soft:#5C5068;
    --lemon:#D8AE2A; --lemon-soft:#F6E7A8; --magenta:#C22E74; --line:#E4DAD0;
  }
  @media (prefers-color-scheme:dark){
    :root{ --ground:#17121F; --panel:#211A2C; --ink:#F2ECF6; --ink-soft:#B0A2BE;
           --lemon:#F0CE5A; --lemon-soft:#4A3C18; --magenta:#F072A8; --line:#332A42; }
  }
  :root[data-theme="light"]{ --ground:#FBF6EE; --panel:#FFFFFF; --ink:#241C2E; --ink-soft:#5C5068;
    --lemon:#D8AE2A; --lemon-soft:#F6E7A8; --magenta:#C22E74; --line:#E4DAD0; }
  :root[data-theme="dark"]{ --ground:#17121F; --panel:#211A2C; --ink:#F2ECF6; --ink-soft:#B0A2BE;
    --lemon:#F0CE5A; --lemon-soft:#4A3C18; --magenta:#F072A8; --line:#332A42; }

  *{box-sizing:border-box;}
  body{margin:0;background:var(--ground);color:var(--ink);
    font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;
    line-height:1.7;-webkit-text-size-adjust:100%;}
  .wrap{max-width:840px;margin:0 auto;padding:22px 16px 56px;display:flex;flex-direction:column;gap:24px;}
  .eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ink-soft);margin:0 0 6px;}
  h1{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-weight:600;
    font-size:clamp(25px,6.4vw,34px);line-height:1.3;margin:0;text-wrap:balance;}
  .lede{margin:10px 0 0;color:var(--ink-soft);font-size:15px;}
  .chips{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0 0;padding:0;list-style:none;}
  .chips li{font-size:12.5px;padding:5px 11px;border-radius:999px;
    background:var(--lemon-soft);border:1px solid var(--line);}
  .shot{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;}
  .shot img{display:block;width:100%;height:auto;image-rendering:pixelated;}
  .meta{padding:13px 15px 16px;}
  .meta h2{font-size:16px;margin:0 0 7px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
  .chip{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.08em;
    padding:3px 8px;border-radius:5px;background:var(--magenta);color:#fff;}
  .chip.plain{background:transparent;color:var(--ink-soft);border:1px solid var(--line);}
  .meta ul{margin:0;padding-left:1.15em;color:var(--ink-soft);font-size:14px;}
  .meta li+li{margin-top:3px;}
  .divider{border:0;border-top:1px solid var(--line);margin:2px 0 0;}
  .sub{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-soft);margin:0;}
  .ask{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--lemon);
    border-radius:12px;padding:16px 17px;}
  .ask h2{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:18px;margin:0 0 9px;}
  .ask ol{margin:0;padding-left:1.3em;font-size:15px;}
  .ask li+li{margin-top:8px;}
  .note{font-size:13.5px;color:var(--ink-soft);margin:12px 0 0;}
  code{font-family:ui-monospace,Menlo,monospace;font-size:.92em;}
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">${esc(spec.eyebrow || '')}</p>
    <h1>${esc(spec.h1)}</h1>
    ${spec.lede ? `<p class="lede">${esc(spec.lede)}</p>` : ''}
    ${(spec.chips || []).length ? `<ul class="chips">${spec.chips.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  </header>

${cards}${extra}
${ask}
</div>
`;

await fs.writeFile(OUT, html);
console.log(`✓ ${OUT}`);
console.log(`  画像 ${(spec.cards || []).length + (spec.sections || []).reduce((s, x) => s + x.cards.length, 0)}枚 / 元 ${(bytes / 1024).toFixed(0)}KB → ページ ${(html.length / 1024 / 1024).toFixed(2)}MB`);
