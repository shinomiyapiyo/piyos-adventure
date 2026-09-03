---
name: native-store-release
description: Capacitor製アプリ（iOS/Android）をストアへリリースする標準手順。版数の引き上げ → ビルド（AAB / xcarchive）→ 成果物の実測検証 → コミット → **Claudeがアプリ内ブラウザで Play Console と App Store Connect を操作して提出するところまで**。⚠「リリースして」「新しいバージョンを出して」「ストアに出して」「審査に出して」「AABを作って」「アーカイブして」と言われたら必ずこのスキルを開くこと。手順を案内するのではなく自分でストアを操作して提出まで持っていく。ぴよ氏の冒険／魂の共鳴／14番地など、どのアプリでも使える。
---

# ネイティブ（iOS / Android）リリース標準手順

⚠**このスキルの要点は1つ**: リリースを頼まれたら**手順を案内するのではなく、自分でストアを操作して
提出まで持っていく**。ユーザーは見ているだけでよい状態にする。

## 役割分担 — ここを最初に共有する

**Claude がやる**
- 版数の引き上げ／`build:web` ＋ `cap sync`／AAB のビルド／iOS のアーカイブ
- 成果物の検証（解凍して中身を実測）
- コミット
- **Play Console と App Store Connect のブラウザ操作＝提出まで**
- **ストアに入れるテキストの記入（リリースノート・最新情報・プロモ文・審査メモ）**

**ユーザーにしかできない**（Claude は代われない。理由を添えて依頼する）
1. **両ストアへのログイン**（内蔵ブラウザペイン）
2. **AAB のファイル選択**
3. **スクリーンショットのアップロード**
4. **iOS ビルドのアップロード**（Xcode Organizer ▸ Distribute App）
5. 実機テストプレイの可否判断

⚠**この5つ以外をユーザーに投げてはいけない。** 特に**テキスト入力は必ず Claude が行う**。
ブラウザの不調を理由にユーザーへ投げるのは禁止（明確に叱られた項目）。

### ⚠ ファイル選択の壁（毎回ここで止まる。着手前に先回りして案内する）

ブラウザ自動化は**ネイティブのファイルダイアログを操作できない**。
`file_upload` 系の代替も **10MB上限＋ユーザーが共有済みのファイル限定**なので、
数十MBの AAB もスクリーンショットも対象外。Claude は次まで用意して、選択だけ頼む:

```bash
open -R <ファイルの絶対パス>        # Finderで選択状態にする
printf '%s' "<パス>" | pbcopy       # パスをクリップボードへ（ダイアログで ⌘⇧G → ⌘V）
```

---

## 0. 事前確認

```bash
git log --oneline -3
git rev-parse HEAD; git rev-parse origin/main      # 一致しているか
git status --short                                  # 未コミットが無いか
# 版数の在り処（Capacitor共通）
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" ios/App/App.xcodeproj/project.pbxproj | sort -u
grep -E "versionCode|versionName" android/app/build.gradle
```

⚠**前回提出の審査結果を必ずユーザーに確認する。** ここで版数の付け方が変わる:

| 前回の状態 | 今回の版数 |
|---|---|
| 承認・公開済み | 新しい版へ。ビルド番号／versionCode は連番で +1 |
| まだ審査中 | iOS は取り下げるか承認を待つ。Android は無関係に出せる |
| リジェクト | **版数は据え置きのままビルドだけ上げられる**（メタデータの入れ直し不要）。⚠ただしビルド欄に旧ビルドが残るので必ず差し替える |

## 1. 版数を上げる（⚠ビルド前に確定させる）

| 中身 | 上げ幅 | 例 |
|---|---|---|
| **明らかに新しい機能が増えた**（新ステージ／新キャラ／新モード／新画面＝**遊べるものが増えた**） | **0.1** | 1.6 → 1.7 |
| **それ以外**（不具合修正・仕様の調整・バランス変更・UIの整理・演出の撤去） | **0.0.1** | 1.6 → 1.6.1 |

- 既存アイテムの**入手経路や価格の調整**、**表示の追加**は機能追加に数えない（＝0.0.1）
- 内部番号（iOS `CURRENT_PROJECT_VERSION` / Android `versionCode`）は上げ幅に関係なく**毎回 +1**
- **この判定は聞かずに自分で決めて進める**

⚠**必ずここで確定させる。** 版数文字列は AAB と xcarchive に**焼き込まれる**ので、
ビルド後に変えると**両方とも作り直し**になる（1.7 でビルドしてから 1.6.1 に付け替えた実害がある）。
なお `www/` は版数と無関係なので、版数だけの変更なら `build:web` / `cap sync` は不要。

```bash
sed -i '' 's/MARKETING_VERSION = <旧>;/MARKETING_VERSION = <新>;/g; s/CURRENT_PROJECT_VERSION = <旧>;/CURRENT_PROJECT_VERSION = <新>;/g' ios/App/App.xcodeproj/project.pbxproj
sed -i '' 's/versionCode <旧>$/versionCode <新>/; s/versionName "<旧>"/versionName "<新>"/' android/app/build.gradle
```
⚠iOS は Debug/Release の2か所ずつあるので `sort -u` で**両方**変わったことを確認する。

## 2. ビルド

```bash
npm run build:web && npx cap sync ios && npx cap sync android
```

⚠`www/` の組み立てが **denylist 方式**なら、リポジトリ直下に新しいフォルダを置いたときに
**SKIP へ追加し忘れるとアプリに同梱される**。実害の前例が複数ある（作業用フォルダ、xcarchive）。

- Android（AAB）の手順と罠 → `references/android-play.md`
- iOS（アーカイブ）の手順と罠 → `references/ios-asc.md`

## 3. 成果物を検証する（⚠推測で報告しない）

```bash
bash <このスキル>/scripts/verify-release-artifacts.sh <リポジトリのパス>
```

確認する項目: **版数／同梱した中身の版／混入なし／署名／前回とのサイズ差**。

⚠`gradlew` の `UP-TO-DATE` は「**ビルドされていない**」という意味。
AAB は必ず解凍して中身を見る。「ビルドできたはず」で報告しない。

## 4. コミット

版数の引き上げをコミットし、`RELEASE-<版>.md`（実測値・リリースノート・提出記録）を残す。
⚠push はユーザーが実行する。

## 5. ストアへ提出（Claude がブラウザを操作）

- **Play Console** → `references/android-play.md`
- **App Store Connect** → `references/ios-asc.md`
- **ブラウザ操作の共通の罠**（React入力欄・ペインが隠れる・2段提出）→ `references/browser-tips.md`

⚠**提出は両ストアとも2段構え。** 1段目のあとに必ず確認画面が出る。
そこまで押して初めて提出完了。**画面の表示が変わったことを確認してから報告する。**

## 6. 提出後

- Play: 「審査中の変更」になっていること／クイックチェックの結果
- iOS: 「審査待ち」になっていること／リリース方法（自動 or 手動）
- 実機未確認の版があるなら TestFlight で確認できることを伝える
  （⚠問題が出たら iOS は審査を取り下げて出し直しになる、と併せて言う）
- ⚠**テスト用のフラグを false に戻したか**を最後に確認する（デバッグ表示・テスト開始位置など）

---

## アカウント単位の注意（このアカウントの全アプリに効く）

⚠**Android は製品版に出さない。** 個人アカウントだと住所が公開されるため、
組織アカウントへ移行するまで**クローズドテストのみ**。
「製品版へ昇格」「テスターを集める」は**提案しない**。
