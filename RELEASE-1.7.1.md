# RELEASE 1.7.1（2026-08-03）

⚠手順は `RELEASE_PLAYBOOK.md` が正。ここは**この版の実測値と提出の記録**。

| | 前回（1.7） | 今回（1.7.1） |
|---|---|---|
| 同梱ゲーム | Ver.1.715 | **Ver.1.716** |
| iOS | 1.7 / build 13（公開済み） | **1.7.1 / build 14** |
| Android | 1.7 / versionCode 12（クローズドテスト） | **1.7.1 / versionCode 13** |

## 版数の判定

**0.0.1 上げ（1.7 → 1.7.1）**。中身は**不具合修正1件のみ**で、遊べるものは増えていない＝固定ルールどおり patch。
内部番号（build / versionCode）は上げ幅に関係なく **+1**。

## 中身（Ver.1.716 の1コミット）

**不具合修正 1件** — `fed210e`
中断中（ぼうけんのしおり）にタイトル画面のショップを開くと、**実際の持ち物と違うものが表示されていた**。
原因は中断時に `resetGame()` が走り、`buildPermaSlots()`（`used` を全部 false に戻す）＋`items=[]` によって
「次に『さいしょから』を選んだ場合の持ち物」が描かれていたこと。

⚠**表示だけの問題ではなくお金の複製の穴だった**。売却対象の条件が「中身があり かつ**未使用**」なので、
**ランで使い終えた永続品まで売れた**。ブラウザで再現・修正・退行なしまで実測済み。
⚠**しおり本体は壊れない**ため、**既存プレイヤーのセーブに被害はない**。詳細は `SPEC.md` §14。

## 成果物の実測

### Android（AAB）
```
android/app/build/outputs/bundle/release/app-release.aab
```
| 項目 | 実測 |
|---|---|
| サイズ | **61.30 MB**（64,273,304 bytes・前回 61.29 MB ＝ **ほぼ同一**） |
| 同梱ゲーム | Ver.1.716 |
| versionName / versionCode | **1.7.1 / 13**（マニフェストから文字列で確認） |
| 署名 | `META-INF/UPLOAD.RSA` あり＝署名済み |
| 混入 | **なし**（public 直下は js 8本＋cordova 2本＋images＋sounds のみ。tools/wall/node_modules/スクショ用/xcarchive なし） |

### iOS（xcarchive）
```
~/Library/Developer/Xcode/Archives/2026-08-03/PiyosAdventure-1.7.1-build14.xcarchive
```
| 項目 | 実測 |
|---|---|
| CFBundleShortVersionString | **1.7.1** |
| CFBundleVersion | **14** |
| 同梱ゲーム | Ver.1.716 |
| App.app | 60 MB |
| 混入 | **なし**（public 直下は Android と同一） |
| 署名 | Team 7LJ8QA6336（自動署名） |
| 結果 | **ARCHIVE SUCCEEDED** |

## リリースノート（両ストアへ入れた文面）

### 日本語
```
【不具合の修正】
・ぼうけんのしおりで中断している間にタイトル画面のショップを開くと、実際に持っている道具とはちがう内容が表示されることがある不具合を修正しました。
・あわせて、その状態では使い終えた道具まで売れてしまい、コインが正しくない数に増えてしまう問題も修正しています。
・中断したデータそのものには影響しません。これまでのぼうけんのしおりは、そのまま続きから遊べます。
```

### English
```
Bug fixes
- Fixed an issue where opening the shop on the title screen while an adventure was suspended (Adventure Bookmark) could display items you did not actually own.
- In that state it was also possible to sell items that had already been used up during the run, which incorrectly increased your coins. This has been fixed.
- Your suspended save data itself is not affected. You can continue any existing Adventure Bookmark exactly as before.
```

## 提出の記録（2026-08-03）

（提出しだい追記）

## ⚠この版の未了事項

**1.697〜1.716 は丸ごと実機テストプレイ未了**（1.7 で公開した範囲も含む）。見るべきは5つ:
1. **バランス変更（1.715）** — しおりの R24 から再開。敵速度上限 7.0→8.2、アカバネ 10.4秒→7.0秒に1体
2. **交換ダイアログ（1.697）** — 土管部屋で持ち物が満杯のとき
3. **絵13枚** — 店3パターン／退店／たちぐいそば／いちごショート／極楽まんじゅう／地底の店／ぴよフラッシュ／忍者ぴよ
4. **ポーズ（1.712）** — ポーズ中に HUD とアイテム枠が消え、再開で戻るか
5. **中断→タイトルショップ（1.716）** — 表示がしおりと一致するか／売却が止まっているか
