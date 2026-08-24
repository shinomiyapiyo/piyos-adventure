# RELEASE 1.8.1（2026-08-25）

**1.8 の緊急修正版。** 1.8 は両ストアで公開済みだが、コントローラー使用時に
**起動直後のログインボーナスが受け取れず、ダイアログが開いたまま裏の操作が進む**
不具合が実機で見つかったため、修正版を出す。

| | 値 |
|---|---|
| ストア版数 | **1.8.1**（不具合修正なので +0.0.1） |
| iOS | **build 22**（CURRENT_PROJECT_VERSION / 前回 21） |
| Android | **versionCode 20**（前回 19） |
| 同梱ゲーム | **Ver.1.742** |
| AAB | `android/app/build/outputs/bundle/release/app-release.aab`（63.6MB・UPLOAD.RSA 署名あり） |
| iOS アーカイブ | `~/Library/Developer/Xcode/Archives/2026-08-25/PiyosAdventure-1.8.1-build22.xcarchive`（App.app 60MB） |

⚠**build 21 / vc 19 は Ver.1.737 同梱の旧ビルド**（提出せず破棄）。1.738〜1.742 を取り込んで作り直したのが build 22 / vc 20。

## 中身（1.8 からの差分）

- **Ver.1.737**: コントローラーで**全画面のダイアログが閉じられず、裏の画面が進む**問題を修正。
  - 原因＝後からDOMに差し込む幕（`#loginBonusPopup` / `.transferOverlay` / `#sobaScene`）が
    コントローラーの操作対象の名簿(`GP_MODALS`)に入っておらず、背後のタイトルが操作対象になっていた。
  - ⚠**保険 `gpStrayOverlay()` を追加**＝名簿に無くても「画面の6割以上を覆う z-index 9000以上の
    固定要素」は幕とみなす。入れ忘れが「幕が閉じないのに裏が進む」に直結するため機械的に拾う。
- Ver.1.736: おみせの一覧でエッグこうかんの行を飛ばして「もどる」へ行く問題を修正（1.8 に同梱済み）

## 検証（ブラウザ・疑似コントローラー）

- ログインボーナスにカーソルが乗る（スクショで目視）／A で受け取って閉じる／
  **その A は裏に届かない**（タイトルメニューは開かず・ゲームも始まらない）
- 名簿に無い架空の幕でも、カーソルが乗り・閉じられ・裏が進まない（保険の動作確認）
- メニュー／設定／B で戻る の回帰なし
- 成果物に修正が入っていることを実測（AAB・App.app の bootstrap.js を grep）


---

## 作り直し（build 22 / vc 20・2026-08-25）

build 21 を作った後に 1.738〜1.742 を入れたため、**提出前に作り直した**。

| 版 | 内容 |
|---|---|
| 1.738 | **↓ですり抜け→踏んで跳ねるとどの足場にも乗れない**（`recentlyDropped` の固着）／広告の同意リトライ |
| 1.739 | **「広告を見る」が10秒無反応**（要求できない時も待っていた）→即フォールバック＋「よみこみ中」表示 |
| 1.740 | 広告の診断（押下時の可否をトースト・⚠TESTモード時だけ） |
| 1.741 | 上位ランカー向け難度調整3点（R36〜 穴の幅 90〜160px／R43〜 敵の密度 地上+28%・飛行+20%／地上でも上方向に半画面まで追従カメラ・復活中は追わない） |
| 1.742 | コントローラーで持ち物の並べ替え（X長押しでつかむ→L/Rで入替） |

### 成果物の実測（build 22 / vc 20）

- AAB: 63,607,097 byte・`versionCode="20"` / `versionName="1.8.1"`（merged manifest）・
  同梱 `Ver.1.742`・`META-INF/UPLOAD.RSA` あり・`base/assets/public/` 直下に混入なし
- xcarchive: `ARCHIVE SUCCEEDED`・`CFBundleShortVersionString=1.8.1` / `CFBundleVersion=22`・
  同梱 `Ver.1.742`・App.app 60MB・`public/` 直下に混入なし
- 1.741/1.742 の実装が両成果物に入っていることを grep で確認
  （`WIDE_HOLE_ROUND` / `DENSE_ENEMY_ROUND` / `SURF_CAM_UP` / `gpStrayOverlay`）
- 出荷前チェック: `TEST_START_AFTER_R6 = false` ✓
