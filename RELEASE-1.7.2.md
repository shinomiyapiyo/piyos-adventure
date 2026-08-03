# RELEASE 1.7.2（2026-08-04）

⚠手順は `RELEASE_PLAYBOOK.md` が正。ここは**この版の実測値と提出の記録**。

| | 前回（1.7.1） | 今回（1.7.2） |
|---|---|---|
| 同梱ゲーム | Ver.1.716 | **Ver.1.721** |
| iOS | 1.7.1 / build 14（公開済み） | **1.7.2 / build 15** |
| Android | 1.7.1 / versionCode 13（クローズドテスト） | **1.7.2 / versionCode 14** |
| アプリアイコン | 旧（引きぎみの上半身） | **新（顔寄り・ひよこを肩に）** |

## 版数の判定

**0.0.1 上げ（1.7.1 → 1.7.2）**。中身は**不具合修正21件＋アイコン差し替え**で、遊べるものは増えていない。
⚠**アイコンの差し替えは「新機能」に数えない**（固定ルールの「新ステージ／新キャラ／新モード／新画面」に当たらない）。
内部番号は上げ幅に関係なく +1。

## 中身（Ver.1.717〜1.721）

**ユーザー実機報告 1件**
- 1.717 **中断中に地底モードを始めると持ち物が別物になる**（案A＝中断中は始めさせない）。
  1.716（中断中のタイトルショップ）と同型で、表示だけでなく**消耗品の使い回し・ログボ品の消失・
  ポーチの書き換え**の3つの穴も同時に塞いだ。根拠は `SPEC.md` §15

**ultracode の全体監査（10観点・76エージェント）で見つけた 20件**
- 1.718（3件）: **1.716 の回帰**（中断中に買うと表示が化ける）／**「つづきから」で穴に湧いて即死**／
  **急降下斬りが地形の壁をすり抜ける**
- 1.719（4件）: 広告コールバックがランの同一性を見ない（`runToken` 導入）／自社紹介カードが戻るで
  閉じられず最前面に残る／名前送信中に戻るとタイトルに GAME OVER が復活／リタイア後も
  `undergroundState.ending` が残り次のランが永久無敵
- 1.719追補（6件・衛生）: 圏外で毎ラン「ハイスコア！」／同意なしでも広告を事前ロード／
  `gaugeDistMark` のリセット漏れ／チュートリアルのスキップボタンが幕の上に残る／
  通常枠売却で `saveSettings()` が抜けている／TESTモードでもスキップは本番DBへ
- 1.720（3件・地底セット）: 穴の先読みが天井を拾って**地上敵が到着前に自滅**／
  地上敵が片道足場に着地できない／落下カリング線がプレイヤーの部屋基準
- 1.721（4件・死角）: 報酬トーストがポーズ幕の上に残る／シェア画像のタイトルが日本語ベタ書き／
  英語の地底クリア文だけ `{stage}` 欠落／ログボだけ「今日」の判定が起動時のみ

**アプリアイコンの差し替え**
- ユーザーが手で仕上げた 1024×1024 を正とし、30スロット全部へ配布（`tools/_raw/icon_final.png`）
- 旧アイコンは `tools/_raw/icon_shipped_1.7.1/` に保存（戻し方は同ディレクトリの README）
- ⚠`apply-app-icon.mjs` の退行も修正（`ic_launcher_round` の丸マスクでアルファが落ちていた）

## 成果物の実測

### Android（AAB）
```
android/app/build/outputs/bundle/release/app-release.aab
```
| 項目 | 実測 |
|---|---|
| サイズ | **60.63 MB**（63,578,782 bytes・前回 61.30 MB ＝ **−0.67 MB**） |
| 同梱ゲーム | Ver.1.721 |
| versionName / versionCode | **1.7.2 / 14** |
| 署名 | `META-INF/UPLOAD.RSA` あり |
| 混入 | **なし**（public 直下は js 8本＋cordova 2本＋images＋sounds のみ） |
| アイコン | **新アイコンを目視確認**（`ic_launcher` / `_round`＝丸マスク有効 / `_foreground` / 同梱 `icon-1024`） |

⚠**−0.67 MB の理由**＝新しい `icon-1024.png` が旧版より小さい（600KB → 309KB）。

### iOS（xcarchive）
```
~/Library/Developer/Xcode/Archives/2026-08-04/PiyosAdventure-1.7.2-build15.xcarchive
```
| 項目 | 実測 |
|---|---|
| CFBundleShortVersionString | **1.7.2** |
| CFBundleVersion | **15** |
| 同梱ゲーム | Ver.1.721 |
| App.app | 60 MB |
| 混入 | **なし**（public 直下は Android と同一） |
| アプリアイコン | `AppIcon60x60@2x`(120px) / `AppIcon76x76@2x~ipad`(152px) とも**アルファなし**・新アイコンを目視確認 |
| マーケティング用 1024 | `AppIcon-512@2x.png` 1024×1024・**アルファなし**（審査要件） |
| 結果 | **ARCHIVE SUCCEEDED** |

⚠iOS の埋め込みアイコンは Apple 最適化 PNG（CgBI）なので **`sips` でしか読めない**（sharp は
「invalid IHDR chunk size」で落ちる）。検証には `sips -s format png` で変換してから見ること。

## リリースノート（両ストアへ入れる文面）

### 日本語
```
【不具合の修正】
・ぼうけんを中断している間に「地底モード」を始めると、実際の持ち物とちがう内容になってしまう不具合を修正しました。中断中は先に「つづきから」か「さいしょから」を選んでいただく形になります。
・「つづきから」で再開した直後に、まれに穴の上から始まってしまう不具合を修正しました。
・そのほか、表示の乱れや細かな不具合を20件ほど直しています。

【そのほか】
・アプリのアイコンを新しくしました。
```

### English
```
Bug fixes
- Fixed an issue where starting UNDERGROUND mode while an adventure was paused could show the wrong items. While paused, please choose CONTINUE or NEW ADVENTURE first.
- Fixed a rare issue where resuming with CONTINUE could place you over a pit.
- Around twenty smaller display and behaviour issues have also been fixed.

Other
- The app icon has been redesigned.
```

## 提出の記録（2026-08-04）

（提出しだい追記）

## ⚠この版の未了事項

- **実機テストプレイは 1.697〜1.721 が丸ごと未了**（ブラウザでの実測のみ）
- **Android 実機で1回だけ確かめたいこと**＝「戻るキーで popstate が発火するか」。
  監査で反証が割れており、引き継ぎオーバーレイの履歴ズレ（戻る1回ぶん前倒し）は**未対応のまま**
- 監査の完全性チェックが挙げた「次に見るべき場所」（`audio.js` の音の状態機械／外部CDN依存の
  フォントと Firebase／端末のフォント拡大設定／時刻の扱い全般）は**手つかず**
