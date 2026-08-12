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

（提出しだい追記）

## ⚠この版の未了事項

- **実機テストプレイは 1.697〜1.722 が丸ごと未了**（ブラウザでの実測のみ）
- **Android 実機で1回だけ確かめたいこと**＝「戻るキーで popstate が発火するか」（引き継ぎオーバーレイの履歴ズレが未対応）
- 監査の完全性チェックが挙げた「次に見るべき場所」（`audio.js` の音の状態機械／外部CDN依存の
  フォントと Firebase／端末のフォント拡大設定／時刻の扱い全般）は**手つかず**
