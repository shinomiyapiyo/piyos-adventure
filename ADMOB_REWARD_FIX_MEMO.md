# AdMob リワード広告「報酬がもらえない」不具合と対策（全アプリ共通・コピペ用）

`@capacitor-community/admob` を使う Capacitor アプリ共通の知見。
ぴよ氏の冒険（Ver.1.597〜1.606）で実機報告をもとに調査・修正し、**仮想時計を使った再現テストで前後比較済み**。
魂の共鳴 / 14番地 など、同じプラグインを使う他アプリにもそのまま適用できる。

対象プラグイン: `@capacitor-community/admob` 8.0.0（iOS/Android 両方で実ソースを確認）

---

## 0. 一番大事な結論

**「広告が実際に画面に出たか」を JS 側で持っていないと、報酬の判定が必ず壊れる。**
プラグインは `onRewardedVideoAdShowed` を通知しているのに、多くの実装がこれを購読していない。
その状態だと「広告が出ていないのに“見て途中で閉じた”扱い」になり、ユーザーに非がないのに報酬が消える。

---

## 1. プラグインの実装で確認した事実（推測ではなくソース由来）

### 1-1. `showRewardVideoAd()` の Promise は「報酬を獲得した時にだけ resolve」する

- iOS: `ios/Sources/AdMobPlugin/Rewarded/AdRewardExecutor.swift`
  `ad.present(from:, userDidEarnRewardHandler: { … call.resolve(…) })`
- Android: `android/.../rewarded/RewardedAdCallbackAndListeners.kt`
  `OnUserEarnedRewardListener { … call.resolve(…) }`

⇒ **報酬を得ずに閉じた場合は resolve も reject もされない（Promise は永久に pending）。**
⇒ よって `.then()` は「視聴完了」の**確実な信号**になる。イベントを取りこぼしても拾える。
⇒ `.catch()` は「広告が用意できていない」等の失敗のみ。

### 1-2. イベント名（iOS/Android で完全一致）

| 用途 | イベント名 |
|---|---|
| ロード完了 | `onRewardedVideoAdLoaded` |
| ロード失敗 | `onRewardedVideoAdFailedToLoad` |
| **画面に出た** | **`onRewardedVideoAdShowed`** ← 購読漏れしやすい |
| 表示失敗 | `onRewardedVideoAdFailedToShow` |
| 報酬獲得 | `onRewardedVideoAdReward` |
| 閉じた | `onRewardedVideoAdDismissed` |

インタースティシャルは `interstitialAdLoaded` / **`interstitialAdShowed`** / `interstitialAdFailedToShow` / `interstitialAdDismissed`。

### 1-3. リワード広告は「途中で閉じられる」前提の設計

SDK が `userDidEarnRewardHandler`（報酬地点でのみ呼ばれる）と `adDidDismissFullScreenContent`（閉じたら必ず呼ばれる）を
別々に持っている＝「報酬なしで閉じた」を明示的にモデル化している。
**よって「途中で閉じたら報酬なし」の経路は必ず残すこと**（消すと AdMob の規約に反する挙動になる）。

---

## 2. 実機で起きた不具合と真因

| # | 症状 | 真因 |
|---|---|---|
| ① | 実広告を最後まで見た直後に自社広告カードも出る。報酬は入る | 見張りタイマー（20秒）が**視聴中の実広告**に発火し「未表示」と誤判定 → フォールバックが実広告の裏で起動。実広告の報酬は捨てられていた |
| ② | 「広告を読み込めませんでした」が出て復活できない | **閉じるイベントが報酬より先に届き**、500ms の猶予を過ぎてから報酬が来る。遅れて届いた報酬は `if (!pendingReward) return;` で捨てられていた |
| ③ | 広告が途中で止まる→ホームへ→復帰→続きを見て報酬獲得したのにボーナスなし | 復帰時に走る復旧処理が `finalize(false, …)` と**失敗を決め打ち**していて、既に受け取っていた報酬を捨てていた |
| ④ | 2本目以降の広告で失敗して報酬がもらえない | 「広告が一度も画面に出ていない」のに `wasShown=true` 決め打ちで「見て閉じた」扱い→報酬拒否。さらに未ロード待ちが6秒しかなく、**消費済み広告の作り直しが間に合わなかった** |
| ⑤ | 広告のあとゲームの音が鳴らない（広告の音は鳴る） | BGM は HTML5 `<audio>` 要素。要素が `paused=false` のまま無音に固まると、`if (b.paused)` ガード付きの resume は**永久に空振り**する |

⚠**②③④はどれも「ユーザーに非がないのに報酬が消える」**。ここを塞ぐのが最優先。

---

## 3. 対策（この順に入れる）

### 3-1. 「広告が画面に出たか」を持つ

```js
var adOnScreen = false;        // 今まさに出ているか（Showed ↔ Dismiss/FailShow で対に）
var rewardEverShown = false;   // この視聴要求で一度でも出たか（showReward の先頭で false に戻す）

AdMob.addListener('onRewardedVideoAdShowed', function () {
    adOnScreen = true; rewardEverShown = true;
});
AdMob.addListener('onRewardedVideoAdDismissed', function () { adOnScreen = false; /* …確定処理… */ });
AdMob.addListener('onRewardedVideoAdFailedToShow', function () { adOnScreen = false; /* …失敗確定… */ });
```

⚠`Dismissed` / `FailedToShow` では **`pendingReward` の有無を見る前に必ずフラグを落とす**こと。

### 3-2. `showRewardVideoAd()` の resolve も報酬の信号として使う

```js
AdMob.showRewardVideoAd()
    .then(function () { /* ★resolve＝報酬獲得。イベントを取りこぼしてもここで拾える */ })
    .catch(function () { /* 表示できなかった */ });
```

### 3-3. 見張りタイマーは「出ている間」決着させない

- `Showed` を受け取っている間は決着させず再アーム（決着させると**フォールバックが実広告の裏で開く**＝①）
- ただし **`Showed` が一度も来ないまま無音**なら無限に待たない。数回（例: 20秒×3）で打ち切り、
  **「出なかった」＝ユーザーに非なし**として報酬を出す

### 3-4. 「見せたか」を決め打ちしない

閉じイベント後の猶予処理も、バックグラウンド復帰時の復旧処理も、
`finalize(false, true)` のような**決め打ちをやめて実際の値を渡す**:

```js
finalizeReward(rewardShownResult === true, rewardEverShown);
```

これで「広告が出ていない → フォールバックで必ず報酬」「出た上で閉じた → 報酬なし」が正しく分かれる。

### 3-5. 遅れて届いた報酬の救済（最後の砦）

失敗として片付ける時にコールバックを覚えておき、**後から報酬イベント/resolve が届いたら成功で実行する**。

```js
var lateReward = null;   // { cb, done }
// 失敗で片付ける時: lateReward = { cb: cb, done: false };
// 報酬が届いた時に pendingReward が無ければ:
if (lateReward && !lateReward.done) { lateReward.done = true; lateReward.cb(true, {shown:true, late:true}); lateReward = null; }
```

⚠フォールバック（自社広告など）と**二重付与しないようフラグでガード**すること。
⚠新しい視聴要求の先頭で `lateReward = null` に戻すこと（古い cb の誤爆防止）。

### 3-6. 猶予とロード待ちを伸ばす

- 閉じイベント後の猶予: **500ms → 1800ms**（ネイティブ→JS はブリッジ往復なので500msは短すぎる）
- 未ロード時の待ち: **6秒 → 10秒**（1本目視聴後の2本目は**消費済み広告の作り直しから**始まるので6秒では足りない）

### 3-7. インタースティシャルにも同じ保険

閉じイベントが返らないと「広告が終わったら再開」のコールバックが詰まり、**ゲームが進まなくなる**。
`Showed` の購読＋見張りタイマー＋後始末を1関数に集約する。

### 3-8. 広告後の音声復帰（⑤）

```js
resumeHard() {
    if (ctx && ctx.state !== 'running') ctx.resume();
    var b = currentBGM; if (!b || b.ended) return;
    if (b.paused) { b.play(); return; }              // 通常の一時停止
    var t0 = b.currentTime;                           // 「再生中のつもり」なのに進んでいない＝出力が死んでいる
    setTimeout(function () {
        if (b.paused || b.ended || b.currentTime > t0 + 0.01) return;  // 進んでいる＝正常。触らない
        var at = b.currentTime; b.pause(); b.currentTime = at; b.play();
    }, 180);
}
```
広告が閉じた直後（250ms 待ってから）と `visibilitychange` の復帰時に呼ぶ。
⚠**正常時に pause→play すると毎回音が途切れる**ので、「時間が進んでいない」時だけ張り直すこと。
⚠これは JS で戻せる分だけの対策。**GMA SDK が iOS の AVAudioSession を返さないケースはネイティブ層の問題で直せない**
（アプリにもプラグインにも `AVAudioSession` を触るコードは1行も無く、管理は SDK 内部）。

---

## 4. 検証のやり方（実時間を待たずに再現できる）

実ファイルを**偽 window と仮想時計**で実行し、偽 AdMob でイベントを任意の順に発火させる。
20秒/30秒を実時間で待たずに検証でき、**修正前後の比較**もできる。

```js
const src = await (await fetch('monetization.js')).text();
let vnow = 0; const timers = [];
const vST = (fn, ms) => { const t = {fn, at: vnow + (ms||0), dead: false}; timers.push(t); return t; };
const vCT = t => { if (t) t.dead = true; };
const adv = ms => { const g = vnow + ms; for(;;){ const d = timers.filter(t=>!t.dead&&t.at<=g).sort((a,b)=>a.at-b.at)[0]; if(!d)break; d.dead=true; vnow=d.at; d.fn(); } vnow = g; };
const L = {}; const fire = ev => (L[ev]||[]).forEach(f => f({}));
let resolveShow = null;
const AdMob = {
  initialize: () => Promise.resolve(),
  addListener: (e, c) => { (L[e] = L[e]||[]).push(c); return {remove(){}}; },
  prepareRewardVideoAd: () => Promise.resolve(),
  showRewardVideoAd: () => new Promise(res => { resolveShow = res; }),  // ★報酬時だけ resolve＝実物と同じ意味論
  prepareInterstitial: () => Promise.resolve(), showInterstitial: () => Promise.resolve()
};
const w = { Capacitor: {isNativePlatform:()=>true, getPlatform:()=>'ios', Plugins:{AdMob}} };
new Function('window','gameSettings','soundManager','setTimeout','clearTimeout','document', src)(
  w, {adFree:false, soundEnabled:true}, null, vST, vCT, {readyState:'complete', addEventListener(){}});
```

**必ず通すべきシナリオ**（ぴよ氏で実際に使った8種）:

| # | シナリオ | 期待 |
|---|---|---|
| ① | 広告が全く出ない（イベント一切なし） | 報酬あり |
| ② | 出ないまま閉じイベントだけ来る | 報酬あり |
| ③ | 表示に失敗（FailShow） | 報酬あり |
| ④ | ロードできない | 報酬あり |
| ⑤ | 出ないままホームへ→復帰 | 報酬あり |
| ⑥ | 正常に最後まで視聴 | 報酬あり（フォールバックは出ない） |
| ⑦ | **出たが途中で閉じた** | **報酬なし**（ここだけ拒否が正しい） |
| ⑧ | 30秒の広告を完走（見張りを跨ぐ） | 報酬あり・**裏でフォールバックが開かない** |

---

## 5. 直せないと確認済みのこと（時間を使わないこと）

- **表示中の広告を強制的に閉じる API は存在しない**（GMA SDK の意図的な設計。リワード視聴を勝手にスキップさせないため）
- **フルスクリーン広告のセーフエリアを調整する API も無い**（プラグインの `margin` はバナー専用）
- iPhone の Dynamic Island が閉じるボタンに被る問題（GitHub issue #197）は**プラグイン側で未修正**。
  ⚠ただし本番広告では×が出ているスクショもあり、**当初思われていたより狭い問題の可能性**がある。
  「×が本当に押せない」ことを実機で確認してから対処を検討すること。
- SDK の版数: プラグインは `.upToNextMinor(from: "12.14.0")` で **12.x に固定**。13.x へ上げるには
  プラグインの `Package.swift` を編集する必要がある（`node_modules` なので `npm install` で消える＝
  恒久化には patch-package かプラグインの取り込みが要る）。**効くかは未検証**。

---

## 6. 適用チェックリスト（他アプリへ移す時）

- [ ] `onRewardedVideoAdShowed` / `interstitialAdShowed` を購読しているか
- [ ] `showRewardVideoAd()` の `.then()` を報酬の信号として使っているか
- [ ] 「見せたか」を `true` 決め打ちしている箇所が無いか（**grep: `, true)` を全部見る**）
- [ ] 見張りタイマーが視聴中に決着していないか
- [ ] 遅れて届いた報酬の救済があるか／二重付与のガードがあるか
- [ ] 猶予1800ms・ロード待ち10秒になっているか
- [ ] インタースティシャルの詰まりに保険があるか
- [ ] 広告後の音声復帰（`resumeHard`）が入っているか
- [ ] 上の8シナリオを仮想時計で通したか
- [ ] **「途中で閉じたら報酬なし」だけは残っているか**（規約順守）
