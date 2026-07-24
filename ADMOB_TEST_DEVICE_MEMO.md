# AdMob テスト端末 登録メモ（NullPo Works 全アプリ共通）

> **目的**: 開発者の実機を AdMob の「テスト端末」に登録し、**自分の端末だけテスト広告**になるようにする。
> これで自分でゲームオーバー・復活・ショップ広告を**何度試しても無効トラフィックにならない**（BAN リスクなし）。
> **一般ユーザーは本番広告のまま**＝収益に影響なし。
>
> このファイルの中身をそのまま別アプリ（魂の共鳴 / 14番地）のセッションに**コピペで渡せば**同じ設定ができる。

---

## 1. 登録する端末ハッシュ

| 端末 | テスト端末ハッシュ |
|---|---|
| Rhyn-iPhone Air（白柳） | `813d9fbc60131fe5bda48ff671516b51` |

- このハッシュは **端末に紐づく**ので、**同じ iPhone なら3アプリとも同じ値になる可能性が高い**（＝この1個を使い回せる公算大）。
- ただし確実なのは各アプリのコンソールが出す値を見ること（下記2）。1つ目で出た値を2つ目でも確認して一致すれば使い回しでOK。
- ⚠ これは **秘密情報（APIキー等）ではなく端末フィンガープリント**。他人がこの値を使っても自分の端末では効かないので、コードやリポジトリに書いて公開しても無害。

## 2. 新しい端末/アプリでハッシュを取る方法

1. iPhone を Mac に接続 → Xcode でそのアプリのプロジェクトを開く
2. 実行先をその iPhone にして **▶ Run**
3. アプリで広告リクエストを発生させる（起動時に事前ロードするアプリなら**起動しただけで出る**／出なければゲームオーバー→リトライ等で広告を呼ぶ）
4. Xcode コンソールで `test ads on this device` を検索。次の行の `@"..."` の中がハッシュ:
   ```
   <Google> To get test ads on this device, set:
   GADMobileAds.sharedInstance.requestConfiguration.testDeviceIdentifiers = @[ @"xxxxxxxx..." ];
   ```
   （登録が効くと、この行は**もう出なくなる**＝成功の目印）

## 3. ⚠最重要の落とし穴（@capacitor-community/admob の仕様）

**`testingDevices` は `initializeForTesting: true` の時しか反映されない。**
プラグインのソース `ios/Sources/AdMobPlugin/AdMobPlugin.swift`（v8系）:
```swift
if call.getBool("initializeForTesting") ?? false {          // ← ここが true の時だけ
    MobileAds.shared.requestConfiguration.testDeviceIdentifiers = call.getArray("testingDevices", String.self) ?? []
}
```
→ `initializeForTesting: false` だと `testingDevices` を渡しても**丸ごと無視**され、実機に本番広告が出てしまう（実際にぴよ氏で SHEIN の本番広告が出て発覚）。

**だからテスト端末を1台でも登録するなら `initializeForTesting` を true にする。**
`initializeForTesting: true` の効果は「`testDeviceIdentifiers` に配列をセットする」**だけ**（ソース確認済み）。`testDeviceIdentifiers` は**指定した端末だけ**テスト広告にする allowlist なので、一般ユーザー（配列に含まれない）は本番広告のまま＝**収益に影響なし**。広告ユニットの本番/テスト切替は別（`adUnit()` 側の `AD_TEST`）で、この true 化はユニットIDを変えない。

## 4. 入れるコード（各アプリの広告初期化に適用）

AdMob 初期化の直前・直後あたりに定数を置き、`AdMob.initialize` にオプションを渡す:

```js
// 開発者の実機テスト端末（この端末だけテスト広告／一般ユーザーは本番広告のまま・収益影響なし）
// ⚠端末フィンガープリントで秘密情報ではない。端末を足す時はこの配列に追記。
var TEST_DEVICE_IDS = ['813d9fbc60131fe5bda48ff671516b51']; // Rhyn-iPhone Air（白柳）

AdMob.initialize({
    // ⚠testingDevices は initializeForTesting=true の時しか反映されない（プラグイン仕様）。
    //   テスト端末が1台でもあれば true にする（＝その端末だけテスト広告／一般ユーザーは本番のまま）。
    initializeForTesting: (AD_TEST || TEST_DEVICE_IDS.length > 0),
    testingDevices: TEST_DEVICE_IDS,
    // 既存の他オプション（npa 等）があればそのまま残す
});
```

- そのアプリに `AD_TEST` フラグが無ければ `initializeForTesting: TEST_DEVICE_IDS.length > 0` でOK。
- 既存の `initialize` に他のオプション（`requestTrackingAuthorization` 等）があれば消さずに追記する。

## 5. 確認方法

1. `npm run build:web && npx cap sync ios`（Web資産をネイティブへ反映）→ Xcode で **▶ Run**
2. 広告を出す（ゲームオーバー→リトライ／ショップ→広告ボーナス 等）
3. **広告や画面上部に「Test Ad／テストモード」表示が出れば成功**。コンソールの `To get test ads on this device` の行が消えるのも目印。

## 6. Android も同様

`@capacitor-community/admob` は Android でも同型の gate（`initializeForTesting` 前提で `testingDevices` を反映）なので、**同じ JS の `AdMob.initialize` 変更で iOS/Android 両方に効く**。Android のハッシュは logcat に同じ形式で出る（同じ端末なら値も同じ公算）。

## 7. 対象アプリ（AdMob publisher: `pub-4148293353679224`）

| アプリ | Apple ID | 状態 |
|---|---|---|
| ぴよ氏の冒険 | 6791699129 | ✅ 登録済み（Ver.1.532） |
| 魂の共鳴 | 6783816824 | ⬜ 未（各リポジトリで上記4を適用） |
| 14番地 | 6785090823 | ⬜ 未（各リポジトリで上記4を適用） |
