# リリース標準手順（毎回これに従う）

⚠**この手順が正**。ユーザー指示（2026-07-30）:「Claudeがブラウザを操作して両ストアに提出するところまでが、
リリースまでの標準の流れ。同じ方法で毎回実行する」。Ver.1.6 のリリースで実際に通した手順をそのまま起こしたもの。

⚠このファイルは `scripts/build-www.mjs` の denylist（`.md` は一律スキップ）でアプリには同梱されない。
版ごとの実測値・リリースノートは別途 `RELEASE-<版>.md` に残す（例: RELEASE-1.6.md）。

---

## 役割分担

**Claude がやる**（ユーザーは見ているだけでよい）
- 版数の引き上げ／`build:web`＋`cap sync`／AAB のビルド／iOS のアーカイブ
- 成果物の検証（解凍して中身を実測）
- コミット
- **Play Console と App Store Connect のブラウザ操作＝提出まで**

**ユーザーにしかできない**（Claude は代われない。理由も添えて依頼すること）
1. **両ストアへのログイン**（内蔵ブラウザペインで。[[piyo-browser-is-in-app-pane]]）
2. **AAB のファイル選択**（下記「ファイル選択の壁」）
3. **スクリーンショットのアップロード**（同上）
4. **iOS ビルドのアップロード**（Xcode Organizer ▸ Distribute App。認証情報が要る）
5. 実機テストプレイの可否判断（[[piyo-testplay-means-real-iphone]]）

### ⚠ ファイル選択の壁（毎回ここで止まる。先に案内しておくこと）
ブラウザ自動化は**ネイティブのファイルダイアログを操作できない**。代替の `file_upload` ツールも
**10MB 上限＋「ユーザーが共有済みのファイル」限定**なので、60MB の AAB もスクリーンショットも対象外。
→ Claude は次までやって、選択だけ頼む:

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
grep -oE 'Ver\.[0-9]+\.[0-9]+' index.html | head -1 # 同梱されるゲームの版
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" ios/App/App.xcodeproj/project.pbxproj | sort -u
grep -E "versionCode|versionName" android/app/build.gradle
```

⚠**前回提出の審査結果を必ずユーザーに確認する**。ここで版数の付け方が変わる:

| 前回の状態 | 今回の版数 |
|---|---|
| 承認・公開済み | 新しい版へ（例 1.5 → 1.6）。ビルド番号/versionCode は連番で +1 |
| まだ審査中 | iOS は提出を取り下げるか承認を待つ。Android は無関係に出せる |
| リジェクト | **版数は据え置きのままビルドだけ上げられる**（メタデータの入れ直し不要）。⚠ただしビルド欄に旧ビルドが残るので必ず差し替える |

## 1. 版数を上げる

### ⚠上げ幅は固定（2026-07-31 ユーザー指示・確認不要）

| 中身 | 上げ幅 | 例 |
|---|---|---|
| **明らかに新しい機能が増えた**（新ステージ／新キャラ／新モード／新画面＝遊べるものが増えた） | **0.1** | 1.6 → 1.7 |
| **それ以外**（不具合修正・既存仕様の調整・バランス変更・UIの整理・演出の撤去 など） | **0.0.1** | 1.6 → 1.6.1 |

- 既存アイテムの**入手経路や価格の調整**、**表示の追加**は「機能追加」に数えない（＝0.0.1）。
- 内部番号（iOS `CURRENT_PROJECT_VERSION` / Android `versionCode`）は上げ幅に関係なく**毎回 +1**。
- ⚠**必ずここで確定させる**。版数文字列は AAB と xcarchive に焼き込まれるので、ビルド後に変えると
  **両方とも作り直し**になる（1.7 でビルドしてから 1.6.1 に付け替えた実例＝1.6.1）。
  なお `www/` は無関係なので、版数だけの変更なら `build:web` / `cap sync` は不要。

```bash
sed -i '' 's/MARKETING_VERSION = <旧>;/MARKETING_VERSION = <新>;/g; s/CURRENT_PROJECT_VERSION = <旧>;/CURRENT_PROJECT_VERSION = <新>;/g' ios/App/App.xcodeproj/project.pbxproj
sed -i '' 's/versionCode <旧>$/versionCode <新>/; s/versionName "<旧>"/versionName "<新>"/' android/app/build.gradle
```
⚠ iOS は Debug/Release の2か所ずつあるので `sort -u` で両方変わったことを確認する。

## 2. ビルド

```bash
npm run build:web && npx cap sync ios && npx cap sync android
```
⚠`build-www.mjs` は**denylist方式**。リポジトリ直下に新しいフォルダを置いたら SKIP へ追加する
（1.487「スクショ用」・1.608「xcarchive」の混入事故）。

### Android（AAB）
```bash
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew clean bundleRelease
```
⚠**JDK 21 が要る**。既定の JDK 17 だと `エラー: 21は無効なソース・リリースです` で落ちる。
`/usr/libexec/java_home -V` に 21 が無くても Android Studio 同梱の JBR にある。
⚠`clean` から回す。`UP-TO-DATE` は「ビルドされていない」。

### iOS（アーカイブ）
```bash
ARCH_DIR="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)"; mkdir -p "$ARCH_DIR"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCH_DIR/PiyosAdventure-<版>-build<N>.xcarchive" archive
```
⚠**アーカイブはリポジトリの外**（Xcode標準の場所）に置く。中に置くと次のビルドで
**アプリ自身のアーカイブが同梱**され配信サイズが3倍になる（1.608の実害）。
⚠自動署名（Team 7LJ8QA6336）なので追加入力なしで通る。**ARCHIVE SUCCEEDED** を確認。

## 3. 成果物を検証する（推測で報告しない）

```bash
# Android: 解凍して中身を実測
unzip -q android/app/build/outputs/bundle/release/app-release.aab -d /tmp/aabchk
grep -oE 'Ver\.[0-9]+\.[0-9]+' /tmp/aabchk/base/assets/public/index.html | head -1   # 同梱ゲームの版
ls /tmp/aabchk/base/assets/public/                                                    # 混入チェック
ls /tmp/aabchk/META-INF/                                                              # UPLOAD.RSA＝署名済み
# versionCode/Name は base/manifest/AndroidManifest.xml（protobuf）から文字列で拾える

# iOS
P="$ARCH_DIR/....xcarchive/Products/Applications/App.app"
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$P/Info.plist"
/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$P/Info.plist"
grep -oE 'Ver\.[0-9]+\.[0-9]+' "$P/public/index.html" | head -1
```
確認する項目: **版数／同梱ゲームの版／混入なし（xcarchive・tools・wall・node_modules・スクショ用）／署名／前回とのサイズ差**。

## 4. コミット

版数の引き上げをコミットし、`RELEASE-<版>.md`（実測値・リリースノート・提出記録）も残す。
⚠push はユーザーが実行する（CLAUDE.md の定型ブロックで案内）。

## 5. Play Console（Claude がブラウザ操作）

⚠**Android は製品版に出さない**。組織アカウント（DUNS申請中）が通るまで**クローズドテストのみ**
（個人アカウントだと住所が公開されるため）。「製品版へ昇格」「テスターを集める」は提案しない。

1. `tabs_context` でログイン済みタブを確認 → クローズド テスト → **トラックを管理** → **新しいリリースを作成**
2. **AAB のファイル選択をユーザーに依頼**（上記「ファイル選択の壁」）
3. アップロード完了を画面で確認（`バージョン 10 (1.6)` の行が出る）
4. リリース名は自動で `<versionCode> (<versionName>)` になる＝そのままでよい
5. **リリースノート**を入れる。1つの textarea に言語タグで併記:
   ```
   <ja-JP>
   …
   </ja-JP>
   <en-US>
   …
   </en-US>
   ```
   ⚠**1言語あたり500文字**。超えると弾かれる（1.6で英語が520字になり詰め直した）。
   ⚠React制御なので `value` 直接代入は効かない。**ネイティブsetter＋input/changeイベント＋読み返し**（下記スニペット）。
   入力後に「リリースノート: 2 言語」と出れば認識されている。
6. **次へ** → 警告を読む（「難読化解除ファイルが無い」は `minifyEnabled false` なので該当なし＝無視してよい）
7. **保存** → ダイアログの **概要に移動**
8. 公開の概要で **「N 件の変更を審査に送信」→「変更を審査に送信」**（2段）
   ⚠クイックチェック実行中でも送信できる。送信後は見出しが「**審査中の変更**」に変わる＝完了の確認。

## 6. App Store Connect（Claude がブラウザ操作）

⚠ビルドのアップロードはユーザー（Xcode Organizer ▸ Distribute App ▸ App Store Connect ▸ Upload）。
処理完了は **TestFlight ▸ iOSビルド** で「提出準備完了」になっていれば OK。

1. 配信 ▸ 該当バージョン（無ければ「+ バージョンまたはプラットフォーム」で作る）
2. **ビルドを追加** → 対象ビルドを選んで **完了** → **保存**
3. **言語ごとに入れて、言語ごとに保存する**（⚠ja/en は別保存。片方だけ保存して切り替えると消える）
   - このバージョンの最新情報（`#whatsNew`・4000字）
   - プロモーションテキスト（`#promotionalText`・**170字**）
   ⚠**新機能もプロモ文も新しいバージョンには引き継がれず毎回空欄**。必ず両方入れる。
   ⚠**この2欄は必ず Claude が記入する（2026-08-12 ユーザー厳命・例外なし）。**
   ブラウザペインの不調などを理由にユーザーへ投げてはいけない。ユーザーに頼んでよいのは
   「役割分担」の5つだけで、**テキスト入力はそこに含まれない**。
   ⚠ペインが隠れて `computer` のクリックが効かない時も、**ネイティブsetterでの入力と
   ページ側ボタンの `.click()` は通る**ので、作業は止めずに完了させること。

#### 🚫 プロモーションテキストに書いてはいけないもの（2026-08-12 ユーザー厳命）

**不具合の修正・既知の問題・仕様変更のおわびなど、マイナス面を書かない。**
ユーザー指摘＝「最新情報にはバグ修正の内容が書かれているし、プロモーション用の欄で
わざわざマイナス点を書く理由がない」。⚠**1.7.1・1.7.2・1.7.3の初稿と3版くり返した誤り**。

| 欄 | 書くもの |
|---|---|
| このバージョンの最新情報 | **その版で直したこと・増えたこと**（不具合修正はこちら） |
| プロモーションテキスト | **ゲームの魅力＝売り文句**。製品ページで概要の上に出る。審査を通さず随時差し替え可 |

**版が変わっても魅力は変わらないので、下記をそのまま使い回してよい**（新機能が増えた版だけ書き換える）:
```
ja: かわいい「ぴよ氏」と、どこまでも走る横スクロールアクション！ジャンプでかわして敵を倒し、個性豊かなボスに挑もう。きせかえ・図鑑・ボーナスステージ、そして地底へ。世界ランキングで自己ベストを更新しよう！
en: Run as far as you can with the adorable Piyo! Dodge, stomp and face a cast of bosses. Costumes, bonus stages and the underground await.
```
⚠上限170字。**境界ちょうどにしない**（ja 100字 / en 135字＝1.7.3 の実績）。
4. **審査メモ（`#notes`）はバージョン共通＝言語を切り替えても同じ**。1つに和英併記でよい。
   ⚠前版の文言（「ビルドを差し替えて再提出しています」等）が残るので**必ず今回の内容に書き直す**。
   毎回入れる定番: 横向き専用／ログイン不要／広告はNPAのみでATT非表示／ランキングのモデレーション／課金の有無。
5. スクリーンショットは**ユーザーがアップロード**（差し替えがある場合）。仕様は下記。
6. **審査用に追加** → 下書きの中身を確認 → **審査へ提出**（2段）
   「1項目が提出されました」＋サイドバーが「審査待ち」になれば完了。

### スクリーンショット（6.9インチ）
- **2868×1320（横）・RGB（アルファなし）**。日本語と英語は**別セット**
- 実機の 2736×1260 から作る場合: 縦横比の差は0.06%なので単純拡大でよい
  ```bash
  ffmpeg -y -i IN.PNG -vf "scale=2868:1320:flags=lanczos" -pix_fmt rgb24 OUT.png
  ```
- 置き場: `スクショ用/ASC_6.9inch/`（日本語）・`ASC_6.9inch_EN/`（英語）。`スクショ用` は denylist 済み

### Reactの入力欄に確実に値を入れるスニペット（Play / ASC 共通）
```js
var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
var ta = document.getElementById('whatsNew');       // Playは document.querySelector('textarea')
ta.focus(); setter.call(ta, text);
ta.dispatchEvent(new Event('input',  { bubbles: true }));
ta.dispatchEvent(new Event('change', { bubbles: true }));
ta.blur();
return ta.value.length;                              // ⚠必ず読み返して確認する
```
保存できたかは**「保存」ボタンが disabled になったか**で判定する（＝未保存の変更なし）。

## 7. 提出後

- Play: 「審査中の変更」になっていること／クイックチェックの結果
- iOS: 「審査待ち」になっていること／リリース方法（自動 or 手動）の確認
- `TODO_USER.md` の審査確認タスクを更新する
- 実機未確認の版があるなら、TestFlight で確認できることを伝える
  （⚠問題が出たら iOS は審査を取り下げて出し直しになる、と併せて言う）

---

## 今回（1.6）踏んだ罠のまとめ

| 罠 | 対処 |
|---|---|
| ファイル選択がブラウザ自動化では不可能 | `open -R` ＋ パスを pbcopy してユーザーに依頼 |
| Android が JDK 17 でビルド失敗 | `JAVA_HOME` に Android Studio の JBR(21) を指定 |
| Play のリリースノートが1言語500字上限 | 英語を520→478字に詰めた |
| React の textarea に値が入らない | ネイティブsetter＋イベント＋読み返し |
| ASC の新機能/プロモ文が空欄 | 毎回入れる。ja/en は別保存。**入れるのは必ず Claude（例外なし）** |
| **プロモ文に不具合修正を書いてしまう** | **§6 の🚫を読む。売り文句を書く枠。1.7.1〜1.7.3初稿で3版くり返した** |
| ASC の審査メモに前版の文言が残る | 毎回書き直す（1.6では「再提出」の一文を削除） |
| 提出が2段構え（両ストアとも） | 1段目のあとに必ず確認画面が出る。そこまで押して初めて提出 |
| ブラウザペインが隠れてクリックが効かない | `computer` はタイムアウト＋白紙。**ネイティブsetter入力と `.click()` は通る**ので止めない |
