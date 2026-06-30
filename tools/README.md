# tools/ — 空中ボス画像生成（開発用）

ゲーム本体には**同梱されません**（`sw.js` / `sprites.js` への登録は不要）。
空中ボス（hawk）のスプライトを Gemini で生成するためだけのローカル開発ツールです。

## 前提
- Node.js
- `GEMINI_API_KEY`（Google AI Studio で発行＋課金有効化）

## 使い方
```bash
cd games/piyo-adventure/tools
npm install                     # @google/genai と sharp が入る
export GEMINI_API_KEY="..."     # Windows: $env:GEMINI_API_KEY="..." または set
node generate-boss2.mjs
```

実行すると `../images/` に以下が保存されます（128×128・透過PNG）:
`boss2_idle.png` / `boss2_flap.png` / `boss2_dive.png` / `boss2_shoot.png` / `boss2_damaged.png`

## よく使うオプション
| オプション | 説明 |
|---|---|
| `--only=idle,dive` | 指定ポーズだけ生成（作り直し用） |
| `--chroma` | 背景が透過にならなかった場合、四隅の色をキーに透過化 |
| `--no-postprocess` | 128化/透過化せず生画像だけ `_raw/` に残す |
| `--model=<id>` | モデルIDを上書き（`GEMINI_IMAGE_MODEL` 環境変数でも可） |

## モデルについて
（2026-06 公式docs確認済み）
- 既定は **Nano Banana Pro（Gemini 3 Pro Image）= `gemini-3-pro-image`**（GA・最高品質・複雑な指示に強い）。
- 低コスト/高速にしたい場合: `--model=gemini-3.1-flash-image`（Nano Banana 2 = Gemini 3.1 Flash Image）。
- フォールバック（初代Nano Banana）: `--model=gemini-2.5-flash-image`。
- 最新IDは Google AI Studio / 公式docs を確認し、違っていれば `--model=` で上書きしてください。

## 一貫性のコツ
スクリプトは「idle を最初に生成 → それをキャラ参照にして他ポーズを生成」「既存ボス画像を画風参照に渡す」ことで、ポーズ間の絵柄ブレを抑えています。詳細は `generate-boss2.mjs` 冒頭コメントと `../HANDOFF.md` を参照。

> `node_modules/` `_raw/` `package-lock.json` は `.gitignore` 済みでコミットされません。
> コミットするのは最終成果物 `images/boss2_*.png` のみで構いません。
