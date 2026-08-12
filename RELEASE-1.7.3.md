# RELEASE 1.7.3（2026-08-12）

⚠手順は `RELEASE_PLAYBOOK.md` が正。ここは**この版の実測値と提出の記録**。

| | 前回（1.7.2） | 今回（1.7.3） |
|---|---|---|
| 同梱ゲーム | Ver.1.721 | **Ver.1.722** |
| iOS | 1.7.2 / build 15（**公開済み**） | **1.7.3 / build 16** |
| Android | 1.7.2 / versionCode 14（クローズドテスト） | **1.7.3 / versionCode 15** |

## 版数の判定

**0.0.1 上げ（1.7.2 → 1.7.3）**。中身は**ユーザー実機報告の不具合修正2件のみ**で、遊べるものは増えていない。
内部番号は上げ幅に関係なく +1。

⚠前回提出時の引き継ぎには「1.7.2 は審査中」と書いてあったが、**実際は両ストアとも公開済みだった**。
2026-08-12 のユーザー指示により、**以後は指定がない限り「最新版はリリース済み」を前提に版数を上げる**。

## 中身（Ver.1.722・ユーザー実機報告 2件）

- **WARNING（ボス出現直前の警告）の間だけ雑魚敵が湧く**
  通常スポーン停止のガードが `bossState.active && bossState.phase >= 2` ＝ **phase 1（WARNING の120フレーム）が素通り**。
  さらに `isInSafeZone()` は条件に `!bossState.active` を持つため、**トリガーした瞬間に安全地帯の抑止まで同時に外れる**。
  結果「ボス手前の平地では湧かないのに WARNING が出た瞬間だけ湧く」という見え方になっていた。
  → `if (bossState.active) return;` に変更（index.html）
- **地底ステージをクリアして地上に戻ると、最初はアイテム欄が消えている**
  `ugHudVisible(false)` が `#stockSlots` を `display:none` にする一方、戻す側は「`updateStockUI` に任せる」前提だった。
  ところが `updateStockUI` は**毎フレームは呼ばれない**（アイテムの取得/使用・ショップ開閉など状態が動いた時だけ）ため、
  白フェードが明けても none のまま取り残されていた。同じ書き方の `#specialMoveUI` が無事なのは
  `updateSpecialMoveUI` が毎フレーム走るから＝**アイテム欄だけ穴が開いていた**。
  → `ugHudVisible(true)` から `updateStockUI()` を呼ぶ（gameplay.js）。表示条件は同関数が持つので直に `flex` は入れない

### 検証（実物のコードをブラウザ上で回して修正前後を比較）

`manageObjects()` を 600 フレーム回して湧いた数を数えた（`piyo-nocache` / port 8124）:

| 状況 | 旧 | 新 |
|---|---|---|
| 通常走行（600m・ボス外） | 地上6 / 飛行2 | **地上6 / 飛行2**（不変） |
| 安全地帯（ボス250m手前） | 0 / 0 | **0 / 0**（不変） |
| **WARNING中（phase 1）** | **地上6 / 飛行3** | **0 / 0** ✅ |
| ボス戦闘中（phase 3） | 0 / 0 | **0 / 0**（不変） |

アイテム欄は `#stockSlots.style.display` を直接観測: 一枚絵の裏 `none` → **地上復帰後 `flex`**（修正前は `none` のまま）。
既存の防御も維持を確認＝**エンディング中に誤って戻しても `none`／`gameStarted=false` でも `none`**。

## 成果物の実測

### Android（AAB）
```
android/app/build/outputs/bundle/release/app-release.aab
```
| 項目 | 実測 |
|---|---|
| サイズ | **60.63 MB**（63,579,251 bytes・前回 63,578,782 bytes ＝ **+469 bytes**） |
| 同梱ゲーム | Ver.1.722 |
| versionName / versionCode | **1.7.3 / 15**（`base/manifest/AndroidManifest.xml` の protobuf から実測・旧 1.7.2 の残留なし） |
| 署名 | `META-INF/UPLOAD.RSA` あり |
| 混入 | **なし**（public 直下は js 8本＋cordova 2本＋images＋sounds＋index.html） |
| 修正コード | AAB 内の `index.html` / `gameplay.js` に**両方の修正を確認** |

### iOS（xcarchive）
```
~/Library/Developer/Xcode/Archives/2026-08-12/PiyosAdventure-1.7.3-build16.xcarchive
```
| 項目 | 実測 |
|---|---|
| CFBundleShortVersionString | **1.7.3** |
| CFBundleVersion | **16** |
| 同梱ゲーム | Ver.1.722 |
| App.app | 60 MB |
| 混入 | **なし**（public 直下は Android と同一） |
| 修正コード | archive 内の `index.html` / `gameplay.js` に**両方の修正を確認** |
| 結果 | **ARCHIVE SUCCEEDED** |

## リリースノート（両ストアへ入れる文面）

### 日本語
```
【不具合の修正】
・ボスが出てくる直前の「WARNING」の間だけ、雑魚敵が出現してしまう不具合を修正しました。
・地底ステージをクリアして地上に戻ったとき、アイテム欄がしばらく表示されない不具合を修正しました。
```

### English
```
Bug fixes
- Fixed an issue where regular enemies could appear during the WARNING that plays just before a boss.
- Fixed an issue where the item slots stayed hidden for a while after clearing an UNDERGROUND stage and returning to the surface.
```

## 提出の記録（2026-08-12）

### ⚠前提の確認（版数の判定の根拠）
提出前にストア画面を実際に見て確認: **iOS 1.7.2＝「配信準備完了」／Play 14 (1.7.2)＝「8月4日 6:28 に公開」**
＝**前版は両ストアとも公開済み**だった。引き継ぎの「審査中」は古い情報。

### Play（クローズドテスト Alpha）— **✅送信完了**
- AAB `15 (1.7.3)` をアップロード（アップロードボタン→ファイルダイアログ・D&Dは使わない）
- リリースノートを `<ja-JP>`/`<en-US>` 併記（ja 106字・en 241字）→ **「リリースノート: 2 言語」**を確認
- レビュー画面の実測: **新規インストール 62.3MB（前リリース差 +1.17KB）／ダウンロード時間 36秒（差 0秒）**
  ・サポート対象デバイスの増減は全フォームファクタ 0
- 警告は1件のみ＝**難読化解除ファイルが無い**（バージョンコード 15・`minifyEnabled false` なので該当なし）
- 段階的な公開の割合は既定の **100.0**（触っていない）
- 保存 → 「概要に移動」→ 「1 件の変更を審査に送信」→「変更を審査に送信」 →
  見出しが**「審査中の変更」**に変化＝完了（クイックチェックは残り約13分の途中でも送信できた）

### ASC（iOS 1.7.3 / build 16）— **✅提出完了（審査待ち）**
- タイトル横の「iOSアプリ バージョン X ⌄」→ サイドバーの「+」→ **新規バージョン 1.7.3** を作成
- ビルド16の紐づけ（今回はユーザーが実施）→ リリース設定は前版のまま
  （`releaseType=AFTER_APPROVAL` / `phasedReleaseState=UNAVAILABLE` / `ratingsOperation=KEEP` を実測で確認）
- 新機能 ja 106字 / en 241字、プロモ文 ja 100字 / en 135字を**言語ごとに別保存**。切り替えて日本語の残存も確認
- 審査メモは前版（1.7.2）の 1,799字が残っていたので **1,575字に全面書き直し**
- 「審査用に追加」→ 下書きに `iOSアプリ1.7.3 / 1.7.3 (16)` → **「審査へ提出」→「1項目が提出されました」→ 審査待ち**

## ⚠プロモーション用テキストの方針（1.7.3 でユーザー指摘により是正）

**プロモーション用テキストに不具合修正を書かない。** ユーザー指摘（2026-08-12）:
「最新情報にバグ修正は書いてあるのに、プロモーション用の欄でわざわざマイナス点を書く理由がない」。
この欄は**製品ページで概要の上に出る売り文句**で、しかも**審査を通さず随時差し替えできる枠**。
⚠**1.7.1・1.7.2 も修正内容を書いてしまっていた**（同じ誤りを3版くり返した）。1.7.3 で下記に是正:

```
ja: かわいい「ぴよ氏」と、どこまでも走る横スクロールアクション！ジャンプでかわして敵を倒し、個性豊かなボスに挑もう。きせかえ・図鑑・ボーナスステージ、そして地底へ。世界ランキングで自己ベストを更新しよう！
en: Run as far as you can with the adorable Piyo! Dodge, stomp and face a cast of bosses. Costumes, bonus stages and the underground await.
```

## ⚠今回の操作で分かったこと

- **ブラウザペインが隠れる（`document.visibilityState === "hidden"`）とクリックもスクロールも一切届かなくなる**
  （`computer` はタイムアウトし、スクリーンショットは白紙）。⚠この状態でも
  **テキスト入力（ネイティブsetter）とページ側ボタンの `.click()` は通る**ので、作業は止めなくてよい

## ⚠この版の未了事項

- **実機テストプレイは 1.697〜1.722 が丸ごと未了**（ブラウザでの実測のみ）
- **Android 実機で1回だけ確かめたいこと**＝「戻るキーで popstate が発火するか」（引き継ぎオーバーレイの履歴ズレが未対応）
- 監査の完全性チェックが挙げた「次に見るべき場所」（`audio.js` の音の状態機械／外部CDN依存の
  フォントと Firebase／端末のフォント拡大設定／時刻の扱い全般）は**手つかず**
