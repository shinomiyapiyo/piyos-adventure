# Ver.1.6 リリース手順（2026-07-29 作成）

⚠このファイルは `scripts/build-www.mjs` の denylist（`.md` は一律スキップ）でアプリには同梱されない。

## 版数（すべて成果物から実測して確認済み）

| | 前回提出 | **今回** |
|---|---|---|
| iOS | 1.5 / build 10（**承認・公開済み**） | **1.6 / build 11** |
| Android | 1.5 / versionCode 9 | **1.6 / versionCode 10** |
| 同梱ゲーム | Ver.1.649 前後 | **Ver.1.679** |

## ビルド成果物（両方とも完成済み・実測で検証済み）

### Android
`android/app/build/outputs/bundle/release/app-release.aab`

- **60.15MB**（前回 60.09MB / +61KB＝新しい立ち絵4枚ぶん。想定外の膨らみなし）
- `clean` からビルド。`packageReleaseBundle` / `signReleaseBundle` が **executed**（UP-TO-DATEではない）
- 解凍して確認: 同梱アセット **Ver.1.679** / 混入なし（xcarchive・tools・wall・node_modules・スクショ用いずれも無し）
- マニフェストから実測: `versionName 1.6` / `versionCode 10` / `com.nullpoworks.piyosadventure`
- 署名: `META-INF/UPLOAD.RSA`＝アップロード鍵で署名済み

⚠**ビルドには JDK 21 が要る**（既定の JDK 17 だと `エラー: 21は無効なソース・リリースです`）:

```bash
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew clean bundleRelease
```

### iOS
`~/Library/Developer/Xcode/Archives/2026-07-29/PiyosAdventure-1.6-build11.xcarchive`

- `xcodebuild archive` 済み（**ARCHIVE SUCCEEDED**・自動署名 Team 7LJ8QA6336 で追加の入力なし）
- Info.plist から実測: `CFBundleShortVersionString 1.6` / `CFBundleVersion 11`
- 同梱アセット **Ver.1.679** / 混入なし / App.app は 59MB
- ⚠アーカイブは**リポジトリの外**（Xcodeの標準の場所）に置いてある。リポジトリ直下に置くと
  次のビルドで**アプリ自身のアーカイブが同梱**される（1.608の事故）

---

## ⚠ 提出前に決めること: 実機未確認の版が3つある

| 版 | 内容 | 状態 |
|---|---|---|
| 1.677 | きせかえ4種（魔女/侍/サイバー/忍者）の立ち絵を正面向きに描き直し | 実機未確認 |
| 1.678 | 侍ぴよの急降下斬りに着地硬直 | **「侍ぴよは問題なし」＝確認済み** |
| 1.679 | しおりで再開したR8で店に入れない不具合の修正 | **実機未確認**（ブラウザ検証のみ） |

1.679 は今日直したばかりで、確認はブラウザで実物の `applyRunSave` を回した数値どまり。
**しおり→再開→店** の一連だけでも実機で通しておくと安全（TestFlight / 内部テストで確認できる）。

---

## リリースノート（コピペ用）

### 日本語

```
・きせかえ「アイドルぴよ」を追加しました（タイトルショップ 200,000円）
・魔女ぴよ・侍ぴよ・サイバーぴよ・忍者ぴよの立ち絵を正面向きに描き直しました
・一覧画面（きせかえ・ずかん・実績・設定・遊び方）を作り直し、スクロールせずに全部見えるようにしました
・スクロールできる場所にはスクロールバーが出るようになりました
・リザルトに「さいこうコンボ」を表示するようにしました
・広告のプライバシー設定（同意の変更）を設定に追加しました
・暗くて避けられなかった攻撃に、点滅する予告を追加しました
・以下の不具合を修正しました
　- ボスを画面端で倒すと取れない位置にコインが落ちる
　- 地底の入場時に取れないコインがある
　- 闇のニワトリをジャンプ中に踏むと空中に居座る
　- 高台の壁と画面端に挟まれると地形をすり抜けて落ちる
　- ぼうけんのしおりで再開したあと、おみせに入れないことがある
　- 図鑑の撃破数が実際より多く数えられることがある
```

### English

```
- New outfit: Idol Piyo (Title Shop, 200,000 coins)
- Redrew the standing art for Witch, Samurai, Cyber and Ninja Piyo so their faces are visible
- Rebuilt the list screens (Outfits, Encyclopedia, Achievements, Settings, How to Play) so everything fits without scrolling
- Scrollbars now appear wherever a screen can scroll
- The result screen now shows your best combo
- Added ad privacy settings (change your consent) to Settings
- Attacks that were impossible to see in the dark now have a blinking warning
- Fixed:
  - Coins from a boss defeated at the screen edge could land out of reach
  - Some coins could not be collected when entering the underground
  - The Dark Hen could get stuck in mid-air when stomped during its jump
  - Getting pinched between a raised wall and the screen edge made you fall through the ground
  - The shop could not be entered after resuming from a bookmark save
  - The encyclopedia could count more defeats than actually happened
```

---

## 提出手順

### iOS（App Store Connect）

1. Xcode を開く → **Window ▸ Organizer**（アーカイブは既に一覧に出ている）
2. `PiyosAdventure-1.6-build11` を選択 → **Distribute App** ▸ **App Store Connect** ▸ **Upload**
3. ASC で **「+ バージョンまたはプラットフォーム」→ 1.6** を作成
4. ビルド欄で **build 11** を選ぶ
   ⚠**却下版を再提出する時はビルド欄に旧ビルドが残る**ので必ず差し替える（今回は新規なので該当なし）
5. 「このバージョンの新機能」に上のリリースノートを貼る
   ⚠**新機能とプロモーション文は新しいバージョンに引き継がれず毎回空欄**になる
   ⚠**日本語と英語は別々に保存**する（片方だけ保存して閉じると消える）
6. 保存 → **審査へ提出**（提出は2段構え＝「提出」ボタンのあとに確認画面がもう一度出る）

### Android（Google Play Console）

⚠**クローズドテストのトラックへ出す**。組織アカウント（DUNS申請中）が通るまで
**製品版には出さない**方針（個人アカウントだと住所が公開されるため）。

1. Play Console → **テスト ▸ クローズドテスト** → 対象トラック → **新しいリリースを作成**
2. `android/app/build/outputs/bundle/release/app-release.aab` をアップロード
3. リリース名は `1.6 (10)`、リリースノートに上の文面を貼る（ja-JP / en-US）
4. **保存 ▸ リリースのレビュー ▸ クローズドテストとして公開を開始**

---

## 提出後にやること

- [ ] ASC の審査状況を確認（自動リリース設定なら承認後そのまま公開）
- [ ] Play のクローズドテストが「利用可能」になったか確認
- [ ] `TODO_USER.md` の「1. iOS 1.5（ビルド10）の審査結果を確認する」を**完了として消す**（承認済み）
- [ ] 次のリリースに向けて、AdMob の GDPR メッセージ作成（TODO_USER 項目3）が未了
