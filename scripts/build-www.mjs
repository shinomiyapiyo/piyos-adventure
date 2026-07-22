// build-www.mjs — Capacitor の webDir(www/) を組み立てる
// リポジトリ直下の「実行時に必要な資産」だけを www/ にコピーする。
// ビルドツール(バンドラ)は使わない方針なので、これは単なるファイルコピー。
// 開発用ファイル(md/py/tools/node_modules/ios/…)は除外リストで弾く＝新しいjs等は自動で入る。
import { readdirSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'www');

// www に入れないもの（ディレクトリ/ファイル名の完全一致）
const SKIP = new Set([
  'node_modules', 'ios', 'android', 'www', 'scripts',
  '.git', '.github', '.claude', 'tools',
  'package.json', 'package-lock.json',
  'capacitor.config.json', 'capacitor.config.ts',
  '.gitignore', '.DS_Store', 'fix_boss_sprites.py',
  'スクショ用', 'HANDOFF.md', 'ROADMAP.md', 'SPEC.md',
  'resources', // @capacitor/assets のアイコン/スプラッシュ源泉（アプリ同梱不要）
  'wall', // PWA廃止ウォール（Web配信専用・ネイティブに同梱しない）
]);
const skip = (name) => SKIP.has(name) || name.endsWith('.md') || name.endsWith('.py');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let count = 0;
for (const name of readdirSync(ROOT)) {
  if (skip(name)) continue;
  cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
  count++;
}
console.log(`build-www: copied ${count} entries into www/`);
