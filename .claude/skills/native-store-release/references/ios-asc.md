# iOS — アーカイブと App Store Connect への提出

## アーカイブ

```bash
ARCH_DIR="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)"; mkdir -p "$ARCH_DIR"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCH_DIR/<アプリ名>-<版>-build<N>.xcarchive" archive
```

### ⚠ 罠

- **アーカイブはリポジトリの外に置く**（Xcode 標準の場所）。
  リポジトリ内に置くと、次のビルドで **アプリ自身のアーカイブがアプリに同梱**され、
  配信サイズが3倍になる（実害あり）
- 自動署名なら追加入力なしで通る。**`ARCHIVE SUCCEEDED` を目で確認する**

## 検証

```bash
P="$ARCH_DIR/<名前>.xcarchive/Products/Applications/App.app"
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$P/Info.plist"   # = MARKETING_VERSION
/usr/libexec/PlistBuddy -c "Print :CFBundleVersion"            "$P/Info.plist"   # = CURRENT_PROJECT_VERSION
ls "$P/public/"     # ⚠混入チェック
```

## アップロード（⚠ユーザー作業）

**Xcode Organizer ▸ Distribute App ▸ App Store Connect ▸ Upload。**
認証情報が要るので Claude は代われない。

処理完了は **TestFlight ▸ iOSビルド** で「提出準備完了」になっていれば OK。

## App Store Connect の操作手順

1. 配信 ▸ 該当バージョン（無ければ「**+ バージョンまたはプラットフォーム**」で作る）
2. **ビルドを追加** → 対象ビルドを選んで **完了** → **保存**
3. **⚠言語ごとに入れて、言語ごとに保存する**（ja / en は別保存。
   片方だけ保存して切り替えると**消える**）
   - このバージョンの最新情報（`#whatsNew`・4000字）
   - プロモーションテキスト（`#promotionalText`・**170字**）

   ⚠**新機能もプロモ文も新しいバージョンには引き継がれず毎回空欄**。必ず両方入れる。
   ⚠**この2欄は必ず Claude が記入する（例外なし）。** ブラウザの不調を理由にユーザーへ投げない。
   ペインが隠れて `computer` のクリックが効かない時も、**ネイティブsetterでの入力は通る**ので
   入力だけは済ませる（→ `browser-tips.md`）。

### 🚫 プロモーションテキストに書いてはいけないもの

**不具合の修正・既知の問題・仕様変更のおわびなど、マイナス面を書かない。**

> ユーザー指摘: 「最新情報にはバグ修正の内容が書かれているし、プロモーション用の欄で
> わざわざマイナス点を書く理由がない」

⚠**3版くり返して叱られた誤り。** 書く場所を取り違えないこと:

| 欄 | 書くもの |
|---|---|
| このバージョンの最新情報 | **その版で直したこと・増えたこと**（不具合修正は**こちら**） |
| プロモーションテキスト | **ゲームの魅力＝売り文句**。製品ページで概要の上に出る。審査を通さず随時差し替え可 |

**版が変わっても魅力は変わらないので、定型文をそのまま使い回してよい**
（新機能が増えた版だけ書き換える）。⚠上限170字。**境界ちょうどにしない**（ja 100字 / en 135字が実績）。

4. **審査メモ（`#notes`）はバージョン共通＝言語を切り替えても同じ。** 1つに和英併記でよい。
   ⚠前版の文言（「ビルドを差し替えて再提出しています」等）が残るので**必ず今回の内容に書き直す**。
   毎回入れる定番: 画面の向き／ログイン要否／広告の種類（NPAのみ・ATT非表示など）／
   ユーザー投稿があるならモデレーション方法／課金の有無。
5. スクリーンショットは**ユーザーがアップロード**（差し替えがある場合）
6. **審査用に追加** → 下書きの中身を確認 → **審査へ提出**（⚠2段）
   「1項目が提出されました」＋サイドバーが「**審査待ち**」になれば完了

## スクリーンショット（6.9インチ）

- **2868×1320（横）・RGB（アルファなし）**。日本語と英語は**別セット**
- 実機の 2736×1260 から作る場合、縦横比の差は 0.06% なので単純拡大でよい:

```bash
ffmpeg -y -i IN.PNG -vf "scale=2868:1320:flags=lanczos" -pix_fmt rgb24 OUT.png
```

⚠置き場のフォルダは、`www/` の組み立て denylist に入っていることを確認する
（作業用フォルダをリポジトリ直下に作ってアプリに同梱された前例がある）。
