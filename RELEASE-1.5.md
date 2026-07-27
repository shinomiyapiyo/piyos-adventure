# Ver.1.5 リリース申請メモ（2026-07-28 作成）

次セッションで**Claudeが内蔵ブラウザから申請作業を行う**ための手順書（ユーザー指示）。
⚠このファイルは `scripts/build-www.mjs` の denylist（`.md` は一律スキップ）でアプリには同梱されない。

## 版数（すべて成果物から実測して確認済み）

| | 前回提出 | **今回** |
|---|---|---|
| iOS | 1.4.2 / build 8 | **1.5 / build 9** |
| Android | 1.4.2 / versionCode 7 | **1.5 / versionCode 8** |
| 同梱ゲーム | Ver.1.610 | **Ver.1.645** |

## ビルド成果物

- **AAB（完成済み）**: `android/app/build/outputs/bundle/release/app-release.aab` … 60MB（前回61.6MB）
  - clean からビルドし直し、解凍して混入なしを確認（xcarchive / スクショ用 / tools / wall / node_modules）
  - `aapt2 dump badging` で versionCode=8 / versionName=1.5 を**成果物から**確認
- **iOS**: `npx cap open ios` → Any iOS Device → Product ▸ Archive ▸ Distribute App
  （※アーカイブは Xcode 必須。ブラウザからはできない）

### ⚠ Android のビルドには JDK 21 が要る

既定の JDK 17 では `エラー: 21は無効なソース・リリースです` で失敗する。

```bash
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew clean bundleRelease
```

## リリースノート

### 日本語（315字・Play/ASC 共用可）

```
■ 新モード「地底モード」
地底の4つの領域だけを続けて遊べるモードを追加しました。タイトル画面から挑戦できます（地底入場パスが必要）。

■ 新ステージ「分水嶺」
4周目の地底に、岩盤で上下に分かれた新レイアウトを追加しました。上と下のルートは最後まで交わりません。

■ ぼうけんのしおり（中断セーブ）
お店で買える「ぼうけんのしおり」を使うと冒険を中断できます。次にあそぶとき「つづきから」再開できます。

■ そのほか
・英語表示に対応（初回起動時に自動選択／タイトル右上で切替）
・敵の速度に上限を設けて終盤の理不尽さを解消
・獲得したバッジをリザルト画面で通知
・宝箱のグラフィックを一新
・不具合の修正と操作性の改善
```

### English（495字・Play の上限500に収めてある。ASCは上限4000なのでこのままでよい）

```
■ New "Underground" mode
Take on all four underground realms back to back. Needs the Underground Pass.

■ New stage: The Divide
The fourth underground splits into upper and lower routes that never meet.

■ Adventure Bookmark
Buy one at the shop to pause your run and continue next time.

■ Other
- English support (switch on the title screen)
- Enemy speed capped for a fairer late game
- Earned badges shown on the result screen
- New treasure chest artwork
- Bug fixes and control improvements
```

## 申請手順

### 0. 役割分担（ここを飛ばさない）

| 工程 | 担当 | 理由 |
|---|---|---|
| iOS build 9 のアップロード | **ユーザー** | Xcodeのアーカイブが必須でブラウザからできない |
| Play への AAB アップロード | **ユーザー** | ファイル選択ダイアログが要る（内蔵ブラウザにアップロード用ツールが無い） |
| ASC / Play のメタデータ記入・ビルド選択・提出 | **Claude** | ブラウザ操作で可能 |

⚠ログイン済みなのは**内蔵ブラウザペイン**。まず `tabs_context` で既存タブを見ること（開き直すと入力途中が飛ぶ）。

### 1. App Store Connect

1. 1.4.2 の審査状態をまず確認する。**審査中なら 1.5 の枠は作れない**＝ユーザーに判断を仰ぐ
   （審査完了を待つ／開発者による削除）
2. ⚠**却下済みなら版数を 1.5 に書き換えるだけでよい**（メタデータの入れ直し不要）。
   ただし**ビルド欄には旧ビルドが残るので必ず build 9 に差し替える**
3. 「このバージョンの新機能」に ja / en を入力
   - ⚠ASC の textarea は React 制御。**value 代入だけでは保存されない**＝ネイティブsetterで入れて
     input イベントを発火し、**必ず読み返して確認**する
   - ⚠**ja と en は別々に保存**する（片方しか保存されない事故がある）
4. ビルド（build 9）を選択 → 審査へ提出

### 2. Google Play Console

1. 現在は**クローズドテスト**トラック。1.5 を同トラックに上げるか製品版へ昇格するかは**ユーザーの判断**
2. AAB をアップロード（ユーザー）→ リリース名 `1.5 (8)`、リリースノートを ja-JP / en-US に入力
3. 保存 → リリースのレビュー → 公開

### 3. 提出後

`RELEASE-1.5.md` と メモリ（`piyo-native-capacitor` / `piyo-release-1.5-handoff`）を「提出済み」に更新する。

## ⚠ 安全上の約束

**「審査へ提出」「公開」の最終クリックは、直前に入力内容をユーザーに見せて確認を取ってから**行うこと。
外向きで取り消せない操作であり、承認は操作ごと・セッションごとに必要。

## 補足

- 広告は**本番ID**（`monetization.js` の `AD_TEST = false`）。ユーザーのiPhoneはテストデバイス許可リストに
  残してある＝自分のライブ広告を踏まないための安全策なのでそのままでよい
- ランキングの 🔖（しおり再開マーク）は Firebase ルールを**本番反映済み**＝1.5 公開後すぐ機能する
- ゲーム本体は origin/main と一致（97afdc4 / Ver.1.645）。
  ネイティブ設定（`android/app/build.gradle` / iOS の `project.pbxproj`）は従来どおり未追跡運用
