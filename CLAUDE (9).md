# CLAUDE.md — Piyo's Adventure（ぴよ氏の冒険）

このリポジトリは「ぴよ氏の冒険」（海外タイトル: Piyo's Adventure）の独立リポジトリです。
公開URL: https://shinomiyapiyo.github.io/piyos-adventure/

## プロジェクト構成

- `index.html` — ゲーム本体（メインロジック）
- `i18n.js` — 多言語テキスト辞書（ja/en）＋翻訳関数
- `audio.js` — SoundManager（BGM/SE）
- `sprites.js` — スプライト定義
- `core-state.js` / `gameplay.js` / `render.js` / `bootstrap.js` / `monetization.js` — 分割ロジック
- `sw.js` — Service Worker（PWAキャッシュ）
- `manifest.json` — PWA manifest
- Firebase（外部CDN: firebase-app-compat / firebase-database-compat）— ランキングのリアルタイムDB

ビルドツールは使わず `<script src>` で読み込む。

## 開発ルール

- 新しい js ファイルを追加したら `sw.js` の STATIC_ASSETS に必ず登録する（忘れるとオフラインで壊れる）
- js の読み込み順序（index.html の `<script src>` の実際の並び）: Firebase（CDN）→ sprites.js → i18n.js → audio.js → monetization.js → core-state.js → gameplay.js → render.js → bootstrap.js。bootstrap.js が最後＝他が全部定義された後に起動する。新ファイル追加時はこの依存順を壊さない
- HTML を1行でも変更したらバージョンを +0.001 上げる（自動、確認不要）
- バージョンを上げたら `sw.js` の CACHE_NAME も必ず同時に更新する（PWAキャッシュ更新に必須）
- 回答末尾に現在のバージョンを記載する（形式: （現在のバージョン: Ver.X.XXX））
- 貯金システムが実装されるまで、タイトルショップはグレーアウト（無効化）を維持

## 変更禁止

- デッドゾーン（`.control-dead` の幅 37%、`#leftArea`〜`#jumpArea` 間の中央空白）は変更禁止。誤タップによるアプリ終了を防ぐ安全領域

## Git 操作

- ユーザー（shinomiyapiyo）は git 操作に詳しくないので、必要な手順は具体的に分かりやすく案内する
- push / merge などリモートに影響する操作は Claude が勝手に実行せず、ユーザーが確認・実行する。Claude はコマンドと手順を案内する役割
- git の結果（log / status / ls-remote）を実際に確認してから報告する。「成功したはず」で報告しない
- ツールの出力が想定と違っても、環境やサンドボックスのせいだと決めつけない。まず自分のコマンドや前提を疑う

## リリース方針

- 将来 Capacitor でネイティブアプリ化を予定（ストアリリース）
- PWA/Web 版はネイティブリリースまでの暫定。ネイティブ化後は削除対象（過度な投資はしない）

## 素材ライセンス

- OtoLogic（効果音・BGM、CC BY 4.0）を使う場合はクレジット表記が必要（例: 効果音素材：OtoLogic（https://otologic.jp）/ CC BY 4.0）
