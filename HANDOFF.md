# 引き継ぎ — ぴよ氏の冒険（次セッション向け）

> **最初に `CLAUDE.md`（プロジェクトルール）と、ユーザーの自動メモリ `MEMORY.md` を読むこと。** 本書はその次。
> 最終更新時点: 公開版 **Ver.1.340**（2026-06-29）。作業ディレクトリ: `games/piyo-adventure/`。

## 最重要メモリ（必読・要点）
- **[[respond-in-japanese]]**: 応答も**思考(thinking)も日本語**で書く。
- **[[trust-ingame-diagnosis]]**: ユーザーは実機プレイで確認済み。**過剰調査せず診断を信頼して即修正**。⚠**スプライトの「向き」は静止画でなく『ゲーム内描画＋対象スキン装備＋ユーザー目視』で判定**（メイド服fallで2度誤った教訓。直すときは `sharp().flop()`）。
- **[[piyo-release-audit]]**: リリースのブロッカー（Capacitor/広告・課金stub/プライバシー）、収益のpay-to-win矛盾、**index.html分割の方針・鉄則・進捗**。
- **[[piyo-dev-notes]]**: 検証(headless Chrome CDP)・ship(gh merge flow)・通貨モデル・画像生成。
- [[improvement-roadmap]] / [[polish-backlog]] / [[veo-motion-sprite-workflow]] / [[known-bugs]] / [[gemini-key-interactive-shell]]。

## このセッションで完了したこと（Ver.1.328〜1.340）
- **メイド服スキン 全ポーズ完成**: idle立ち絵は**ユーザー生成の正面立ち絵を採用**(1.328, `tools/idle-from-image.mjs`)。fallの向きを右向きに是正(1.337)。
- **小修正(1.331)**: 消音バグ(`audio.js` playItem/playCoin に soundEnabledガード)＋オンボ文言「画面の右はしをタップ」。
- **index.html 分割 Step1〜5 完了(1.332〜1.336)**: `render.js`/`monetization.js`/`gameplay.js`/`core-state.js`/`bootstrap.js` に分離。**9485行→4542行(48%)**。読み込み順=sprites→i18n→audio→[inline:スプライト生成]→monetization→[inline:progression]→core-state→[inline:world/entities]→gameplay→render→bootstrap。**Step6(残りインライン約3000行の分割)はユーザー判断で保留**。
- **リザルト共有(1.338)**: ゲームオーバーに「📤シェア」。`shareResult()`/`buildResultCard()`(gameplay.js)＝リザルトカード画像をWeb Share API/X intentで共有。
- **実績/デイリー 表示改善(1.339)**: うけとる!/受取ずみでも報酬内容を縦表示。`dist_5000`(合計5000m)報酬を**メイド服のみ**(貯金0)。タイトル「ミッション」→「**デイリー**」改名。
- **デイリー日替わり化(1.340)**: `MISSION_POOL`6種(あそぶ/距離/撃破/コイン取得/ボス撃破/必殺技使用)から日付決定論シード`pickDailyMissions`で**3種＋目標値を日替わり**選定→`dm.todayMissions`。新type集計(gameStateに coins/boss/special カウンタ＋record差分)。

## 現在のファイル構成
- `index.html`(約4542行: HTML＋CSS＋インラインJS3ブロック)
- js: `sprites.js`/`i18n.js`/`audio.js`/`core-state.js`/`monetization.js`/`gameplay.js`/`render.js`/`bootstrap.js`
- 全て `<script src>`・グローバルスコープ・ビルドツール無し。

## 次の候補（ユーザー提示済み・未着手）
- **⑤ 新ボス追加**（中工数, 既存ボス枠流用）
- **データ引き継ぎ機能**（設定にセーブのエクスポート/インポート。機種変更で進捗全消失を防ぐ＝課金/リリース前に必須・Ultracode指摘）
- **ネイティブ化（Capacitor＋AdMob, iOS優先）**（リリース本線・大仕事。広告/課金/ATTの前提）
- **収益設計の見直し**（貯金パック=pay-to-win→コスメ課金へ）／**必殺技の民主化**（無課金お試し）
- index.html 分割 **Step6**（残りインラインの分割・任意・保留）

## 作業手順（このプロジェクト固有）
- **HTMLを1行でも変えたら Ver +0.001**: `index.html` の `content:"Ver.X"`(≈82行) ＋ 版数span(≈760行) ＋ 冒頭コメント `* ぴよ氏の冒険 vX`(grepで行特定) ＋ `sw.js` の `CACHE_NAME` を同期。**回答末尾に現在Verを必ず記載**。
- 新規js/画像を追加したら `sw.js` の `STATIC_ASSETS` に登録。
- **git は Claude が代行**(ユーザーはGit不慣れ・確認不要): `git checkout -b claude/xxx` → add → commit(末尾に Co-Authored-By: Claude) → push → `gh pr create` → `gh pr merge --merge --delete-branch` → main pull。committer name警告は無害。リポジトリ=`shinomiyapiyo.github.io`(GitHub Pages, mainマージで公開)。※コマンドは**リポジトリルート**で(cwdがサブだとpath二重エラー)。
- **検証**: `scratchpad/*verify.mjs`(headless Chrome CDP)が雛形。`python3 -m http.server`＋`--headless=new --user-data-dir=空tmp`(キャッシュ無し)。版数・コンソールエラー0・実描画スクショを確認。起動手順=splash `startApp()`→ログボ`#loginBonusPopup`の受取ボタン→`gameSettings.tutorialSeen=true`→`startGame()`。スキン確認は `gameSettings.ownedSkins=['maid'],activeSkin='maid'` 注入。実機操作(タッチ/共有シート)はユーザー確認に委ねる。
- 大きめの新機能は **EnterPlanMode→計画→ExitPlanMode承認→実装** の流れが好評。
- API key(OPENAI/GEMINI)は `.zshrc`。画像/動画生成は `zsh -ic` 経由。
