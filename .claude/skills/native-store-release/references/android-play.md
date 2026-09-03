# Android — AAB のビルドと Play Console への提出

## ビルド

```bash
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew clean bundleRelease
```

出力: `android/app/build/outputs/bundle/release/app-release.aab`

### ⚠ 罠

- **JDK 21 が要る。** 既定の JDK 17 だと `エラー: 21は無効なソース・リリースです` で落ちる。
  `/usr/libexec/java_home -V` に 21 が無くても **Android Studio 同梱の JBR にある**（上のパス）
- **必ず `clean` から回す。** `UP-TO-DATE` は「ビルドされていない」という意味。
  そのまま提出すると**前の版が入った AAB** を出すことになる
- 署名鍵（`upload-keystore.jks` / `keystore.properties`）は**絶対にコミットしない**

## 検証（提出前に必ず）

```bash
unzip -q android/app/build/outputs/bundle/release/app-release.aab -d /tmp/aabchk
ls /tmp/aabchk/base/assets/public/     # ⚠混入チェック（tools / node_modules / 作業用フォルダ / xcarchive）
ls /tmp/aabchk/META-INF/               # UPLOAD.RSA があれば署名済み
```

versionCode / versionName は `base/manifest/AndroidManifest.xml`（protobuf バイナリ）から
文字列として拾える。**前回の AAB とのサイズ差**も見る。数百KB以上増えていたら混入を疑う。

## Play Console の操作手順

1. `tabs_context` でログイン済みタブを確認
2. **クローズド テスト → トラックを管理 → 新しいリリースを作成**
   ⚠**製品版トラックには出さない**（アカウント方針。SKILL.md 末尾参照）
3. **AAB のファイル選択をユーザーに依頼**（`open -R` ＋ `pbcopy`）
4. アップロード完了を画面で確認（`バージョン <versionCode> (<versionName>)` の行が出る）
5. リリース名は自動で `<versionCode> (<versionName>)` になる＝そのままでよい
6. **リリースノート**を入れる。1つの textarea に言語タグで併記する:

   ```
   <ja-JP>
   …
   </ja-JP>
   <en-US>
   …
   </en-US>
   ```

   - ⚠**1言語あたり500文字**。超えると弾かれる（英語が520字になり詰め直した前例あり）
   - ⚠React 制御なので `value` 直接代入は効かない → `references/browser-tips.md` のスニペット
   - 入力後に「**リリースノート: 2 言語**」と出れば認識されている
7. **次へ** → 警告を読む
   （「難読化解除ファイルが無い」は `minifyEnabled false` なら該当なし＝無視してよい）
8. **保存** → ダイアログの **概要に移動**
9. 公開の概要で **「N 件の変更を審査に送信」→「変更を審査に送信」**（⚠2段）
   - **クイックチェック実行中でも送信できる**（待たなくてよい）
   - 送信後に見出しが「**審査中の変更**」に変われば完了。ここを確認してから報告する
