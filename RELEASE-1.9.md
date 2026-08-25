# RELEASE 1.9（2026-08-26）

**新要素の入った版**なので +0.1（1.8.1 → 1.9）。1.8.1 は両ストアで公開済み。

| | 値 |
|---|---|
| ストア版数 | **1.9**（遊べるものが増えた＝+0.1） |
| iOS | **build 23**（CURRENT_PROJECT_VERSION / 前回 22） |
| Android | **versionCode 21**（前回 20） |
| 同梱ゲーム | **Ver.1.749** |
| AAB | `android/app/build/outputs/bundle/release/app-release.aab`（63,666,053 byte / 60.7MB・UPLOAD.RSA 署名あり） |
| iOS アーカイブ | `~/Library/Developer/Xcode/Archives/2026-08-26/PiyosAdventure-1.9-build23.xcarchive`（App.app 60MB） |

## 中身（1.8.1 からの差分・Ver.1.743〜1.749）

### 新しく増えたもの（＝+0.1 の根拠）
- **1.748 みきりの目**（高額アイテム 500,000 / 1,000,000 / 2,000,000）。3秒だけ世界が1/4速になる。
  レベルで増えるのは**使える回数だけ**（1→2→3）。⚠高額レーンで初の「強くならない」品。
- **1.745 連続コンボランキング**（5つ目の部門）。maxCombo は 1.657 から記録していたぶんがそのまま載る。
- **1.747 なまえの登録**（設定）。登録しておくとハイスコア時に名前入力を飛ばす。登録は任意。
- **1.743/1.744 コントローラーの操作説明**を絵つきの独立ページに（新画面）。

### 調整・修正
- **1.747 ボス戦の縦カメラ**を足元が見える範囲で頭打ちに（実測: 二段ジャンプで通常-126 → ボス戦-78）。
- **1.746** コンボ0のランに「コンボ 第7位！」と出る／コントローラーの並べ替えで同じ文言が2回出る。
- **1.749** みきりの目が**世界の止まっている場所**（土管の部屋・カットイン）でも減っていた。

## 成果物の検証（実測）

- AAB: `versionCode="21"` / `versionName="1.9"`・同梱 `Ver.1.749`・`META-INF/UPLOAD.RSA` あり
- xcarchive: `ARCHIVE SUCCEEDED`・`CFBundleShortVersionString=1.9` / `CFBundleVersion=23`・同梱 `Ver.1.749`
- 両方の `public/` 直下に**隠しファイルを含めて混入なし**
- 1.9 の新要素が成果物に入っていることを grep で確認
  （`mikiri_eye` / `MIKIRI_SLOW_DIV` / `ranking_title_combo` / `playerName` / `BOSS_CAM_FEET_MARGIN`・
   `icon_mikiri_eye.png` 2,258 byte）
- 出荷前チェック: `TEST_START_AFTER_R6 = false` ✓

## ⚠この版で踏んだ事故（再発防止を入れた）

**1回目のビルドに 97KB のゴミファイルが混入していた**。コマンドの打ち損じで出来た bootstrap.js の
部分コピーがリポジトリ直下に残り、`build-www.mjs` の denylist をすり抜けて **AAB と iOS アーカイブの
両方に入っていた**（提出前の検品で発見・削除して作り直した）。

⚠**同じ事故が3回目**（1.487「スクショ用」フォルダ／1.608 xcarchive＝配信サイズ3倍／今回）なので、
`scripts/build-www.mjs` に**検問を入れた**: 直下にあるのが `.js` / `index.html` / `images` / `sounds`
以外なら**ビルドを失敗させる**（警告だと見落とすため）。
副産物として `.nojekyll`（GitHub Pages 用）も配信物に入っていたことが分かり、除外した。
