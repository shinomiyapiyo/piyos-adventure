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
  // ⚠1.608: Xcodeのアーカイブ/エクスポート先（PiyosAdventure.xcarchive など・122MB）。
  //   これを除外し忘れると**アプリ自身のアーカイブがアプリに同梱**され、配信サイズが3倍近くになる。
  //   実際に 1.4.1(build7/versionCode6) のビルドへ混入していた（2026-07-27に発見・再ビルドで是正）。
  //   ⚠**denylist方式なのでリポジトリ直下に新しいフォルダを置いたら必ずここへ追加すること**
  //   （1.487の「スクショ用」混入と同じ事故。今回で2回目）。
  'build',
  'dist', 'out', // 同種の生成物ディレクトリも先回りで塞ぐ
]);
// ⚠**リポジトリ直下の写真は問答無用で除外する**（1.667）。
//   実例: アイドル衣装の参考写真 IMG_0950.jpg を直下に置いたところ、denylist に無いので
//   **次のビルドでアプリに同梱される**状態になっていた（＝実在の人物の写真がストア配信物に入る）。
//   ゲームが使う画像はすべて images/ の中にあり、直下に写真を置く正当な理由が無いので一律で塞ぐ。
//   参考写真の置き場は tools/_raw/reference/（tools ごと SKIP 対象・.gitignore 対象）。
const isRootPhoto = (name) => /\.(jpe?g|heic|heif)$/i.test(name);
const skip = (name) => SKIP.has(name) || name.endsWith('.md') || name.endsWith('.py') || isRootPhoto(name);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let count = 0;
for (const name of readdirSync(ROOT)) {
  if (skip(name)) continue;
  cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
  count++;
}
console.log(`build-www: copied ${count} entries into www/`);
