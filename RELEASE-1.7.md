# Ver.1.7 リリース手順（2026-07-30 作成・**ビルドまで完了／提出は次セッション**）

⚠このファイルは `scripts/build-www.mjs` の denylist（`.md` は一律スキップ）でアプリには同梱されない。
⚠手順の正は `RELEASE_PLAYBOOK.md`。ここは**今回の実測値と文面**だけを残す。

## 版数（すべて成果物から実測して確認済み）

| | 前回提出 | **今回** |
|---|---|---|
| iOS | 1.6 / build 11（**2026-07-30 提出・審査結果は未確認**） | **1.7 / build 12** |
| Android | 1.6 / versionCode 10（クローズドテストへ提出） | **1.7 / versionCode 11** |
| 同梱ゲーム | Ver.1.679 | **Ver.1.696** |

## ⚠ 提出前に必ず確認すること（次セッションの最初）

1. **iOS 1.6 の審査結果**。まだ審査中なら 1.7 は出せない（取り下げるか承認を待つ）。
   承認・公開済みならそのまま 1.7 を出せる。リジェクトなら**版数据え置きでビルドだけ差し替える**運用になる。
2. **Android 1.6 の状態**（クローズドテスト）。Android は iOS と無関係に 1.7 を出せる。
3. **実機テストプレイ**。1.677/1.679 に加えて **1.680〜1.696 が丸ごと実機未確認**。
   TestFlight に build 12 が上がれば確認できる（⚠問題が出ると iOS は審査を取り下げて出し直しになる）。

## ビルド成果物（両方とも完成済み・実測で検証済み）

### Android
`android/app/build/outputs/bundle/release/app-release.aab`

- **60.17MB**（前回 60.15MB / +約20KB＝コード変更のみ。想定外の膨らみなし）
- `clean` からビルド（BUILD SUCCESSFUL・145 tasks executed＝UP-TO-DATE ではない）
- 解凍して確認: 同梱アセット **Ver.1.696** / 混入なし（xcarchive・tools・wall・node_modules・スクショ用いずれも無し）
- マニフェストから実測: `versionName 1.7` / `versionCode 11`
- 署名: `META-INF/UPLOAD.RSA`＝アップロード鍵で署名済み

```bash
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew clean bundleRelease
```

### iOS
`~/Library/Developer/Xcode/Archives/2026-07-30/PiyosAdventure-1.7-build12.xcarchive`

- `xcodebuild archive` 済み（**ARCHIVE SUCCEEDED**・自動署名 Team 7LJ8QA6336）
- Info.plist から実測: `CFBundleShortVersionString 1.7` / `CFBundleVersion 12`
- 同梱アセット **Ver.1.696** / 混入なし / App.app は 59MB
- ⚠アーカイブは**リポジトリの外**（Xcode の標準の場所）＝1.608 の同梱事故を避けるため

---

## リリースノート（コピペ用・Play は1言語500字以内）

### 日本語（433字）

```
・ゴールデンエッグまわりを整理しました
　- 闇の巫女を倒すと、コインやライフと一緒に落ちるようになりました
　- ステージでは1日1個まで。外れてもその日のうちにもう1回チャンスがあります
・ふっかつやくは1つ買うたびに値段が上がるようになりました（次のぼうけんでもどります）
・アイテム欄が持てる数より下に伸びないようにしました（ジャンプの誤タップ防止）
・ボーナス部屋で、持てないアイテムに「お金にかわる」印が付くようになりました
・闇のカラスの攻撃予告をやめ、羽根の弾そのものを見やすくしました
・各画面の「戻る」をグレーに統一しました
・以下の不具合を修正しました
　- ポーズからのきせかえでUIが重なって見えない
　- 宝箱を踏んでも何を手に入れたのか出ないことがある
　- ポーチの持ち物が消えることがある
　- セーブデータを消しても「つづきから」が残る
　- ライフが満タンでも「らいふあっぷ！」と出る
　- ボスの攻撃・被弾の絵が一瞬しか出ない
```

### English（499 chars）

```
- Golden Eggs: the Dark Priestess now drops one. Stages give one a day, with a second chance if you miss out
- The Revival Potion costs more each time you buy it
- The item column no longer grows past your slots
- Bonus rooms mark items you cannot carry as "turns into money"
- The Dark Crow's warning is gone; its feathers are easier to see
- Back buttons are grey everywhere
- Fixed: HUD over the outfit list / chests showing no reward / pouch items vanishing / "Continue" left after a save delete
```

---

## この版の中身（1.680〜1.696）

**プレイヤーに見える変更**
- ゴールデンエッグ: 巫女撃破でドロップ／フィールドは1日2回抽選・上限1個／救済を 7,300m・50% へ／土管部屋の位置を左へ／地底モードでは出ない
- ふっかつやく: 買うたび +20,000円（ラン開始でリセット）・枠を超えて持てる仕様を撤去
- 土管部屋: 持てない品に¥バッジ＋半透明／換金トーストを1枚に集約
- 闇のカラス: 攻撃予告を撤去し、羽根弾そのものを明るく
- UI: ポーズ→きせかえで HUD が重ならない／全画面の「戻る」をグレー＋左向き矢印に統一
- 表示の正確さ: ライフ満タン時は「+1,000点」表示／遊び方と ふっかつやくの説明を実装に合わせた

**監査（ultracode・12エージェント）で見つけて直した不具合 20件**（詳細は `AUDIT-1.694.md`）
- [high] 老婆の劇薬を一時補充の金枠で使うと、その枠の永続品が永久に消える
- しおり再開でポーチ枠の数が合わず、持ち物が半額換金／ドラッグでクラッシュ
- セーブ削除・引き継ぎ取り込みで「つづきから」が残る
- 「つづきから」でログインボーナス品が二重になる
- 日次エッグが湧いた直後にカリングで消える（当たりを持ち越すように修正）
- 地底エンディングの一枚絵でぴよフラッシュが押せて進行が止まる
- ほか low 11件（表示・演出・検証ページ）

**仕様として確認したもの（直さない）**
- ラン中に買える永続アイテム（地底の主の加護）は購入時に確定＝正しい
- 地底モードのポーチ品は「クリアした時だけ」残る（転売は売値500円固定＋老婆の買取拒否で対策済み）

---

## 提出手順

`RELEASE_PLAYBOOK.md` の §5（Play Console）と §6（App Store Connect）に従う。要点だけ再掲:

- **ユーザーにしかできない**: 両ストアへのログイン／AAB とスクリーンショットのファイル選択／iOS ビルドのアップロード
- Play: クローズドテスト（**製品版には出さない**）。リリースノートは1つの textarea に `<ja-JP>`/`<en-US>` で併記
- ASC: 新機能とプロモ文は**毎回空欄**なので必ず入れる。**ja/en は別保存**。審査メモは前版の文言を消して書き直す
- 提出はどちらも**2段構え**（送信 → 確認）

### ファイル選択を頼む時のコマンド

```bash
open -R /Users/veriquest/dev/piyos-adventure/android/app/build/outputs/bundle/release/app-release.aab
```

## 提出後にやること

- [ ] Play: 「審査中の変更」になっているか
- [ ] ASC: 「審査待ち」になっているか／リリース方法（自動/手動）
- [ ] `TODO_USER.md` の審査確認タスクを 1.7 に更新
- [ ] TestFlight build 12 で実機確認（1.680〜1.696 が未確認）
