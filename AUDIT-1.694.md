# 監査レポート — Ver.1.694

- **対象**: Ver.1.694（`index.html` / `gameplay.js` / `core-state.js` / `render.js` / `bootstrap.js` / `tools/`）
- **監査した領域**（8領域）:
  1. `stock` — ストック枠・まほうのポーチ（perma枠）・換金
  2. `save` — ぼうけんのしおり（中断セーブ）・セーブ削除・引き継ぎ
  3. `egg-gate` — 日次きんのたまご（フィールド抽選）
  4. `pipe-room` — 土管の部屋（コイン／ポーション／たからの間）
  5. `priestess` — 地底モード・巫女戦・地底エンディング
  6. `shop-price` — 店の価格表示／購入判定・報酬トースト
  7. `hawk-render` — カラス・ニワトリ（ボス）の描画とスプライト
  8. `ui` — ポーズ／きせかえ／各画面のボタン
- **件数の内訳**: **CONFIRMED 20件** / **UNCERTAIN 1件** / **REFUTED 7件**（指摘 計28件）
- **深刻度の内訳（反証後の確定値）**: critical 0 / high 1 / medium 8 / low 11
  ※反証（敵対検証）で下方修正した件は各項に「深刻度: 初期→確定」と明記した。

> ⚠ この監査ではゲームコードを一切変更していない。作成物はこのファイルのみ。

---

## 修正状況（1.695で対応した分）

| 状態 | 項目 |
|---|---|
| ✅1.695で修正 | [high] ugOnly使用でtemp枠の所有(base)が消える |
| ✅1.695で修正 | [medium] しおり再開でポーチ枠の数を揃えていない（＋ドラッグのTypeError） |
| ✅1.695で修正 | [medium] applyRunSave が perma を permaLevel() までパディングしない（上と同根） |
| ✅1.695で修正 | [medium] 中断中のポーチ購入で しおりの持ち物が半額貯金化（上と同根＋置く順番の修正） |
| ✅1.695で修正 | [medium] セーブデータ削除／引き継ぎ取り込みで piyo_run が残る |
| ✅1.695で修正 | [medium] つづきから でログインボーナス品が二重になる |
| ✅1.695で修正 | [medium] 地底モードで買った品がポーチに永続化（サンドボックス破り） |
| ✅1.695で修正 | [medium] 日次エッグが湧いた直後にカリングで消える（当たりを持ち越すように） |
| ⏳未対応 | [medium] 地底エンディングの一枚絵にぴよフラッシュUIが残り発動できる |
| ⏳未対応 | [low] 11件（下記） |
| ⏳未検証 | [UNCERTAIN] 地底モードの金で永続アップグレードが買えるか |

---

## 直すべきもの（深刻度順）

### [high] ugOnly使用で「一時補充(temp)」枠の所有(base)まで永久に消える

- **場所**: `gameplay.js:4475`（`useStockItem`）／比較対象 `gameplay.js:3446-3454`（`executeSellItem`）
- **何が起きるか**: 老婆の劇薬（`ugOnly`）は `addToStock` の route 2 でポーチの空き枠へ **temp 補充**される。ところが `useStockItem` は `pslot.temp` を見ずに `base` と `permaStock[i]` を空にして `saveSettings` するため、**その枠が本来所有していた別の品が警告なく永久に消える**。1.574 で売却側だけ塞いだ穴と同じ形。
- **再現**: `permaStock[0]='barrier'` のポーチ持ちで barrier を使う（`used=true`）→ 地底の店で劇薬を買う（同じ枠へ temp 補充）→ 劇薬を使う → `permaStock[0]=''`。
- **直し方の当たり**: `pslot.temp` のときは `base` / `permaStock` を触らず、`executeSellItem` と同じく `{id:base, used:true, temp:false, base}` に戻すだけにする。
- **反証で得られた根拠**: 実関数を node(VM) で実行して再現。`perma=[{id:barrier,used:true,base:barrier}]` → `addToStock('ug_elixir')` が route 2 で temp 補充（base=barrier 維持）→ `useStockItem(0)` が `gameplay.js:4475-4478` で temp を見ず `base/id=''` ＋ `permaStock[0]=''` を保存。`addToStock` は perma route 2 を通常枠より先に試すため、**ポーチ品を使った後に劇薬を買えば必ず通る**。

---

### [medium] しおり再開でポーチ枠の数を揃えていない（金枠が幽霊化＋ドラッグでTypeError）

- **深刻度**: high → **medium**（永続データは壊れず、そのラン限りの不具合）
- **場所**: `index.html:2994`（`applyRunSave`）／クラッシュ地点 `gameplay.js:4595`（`swapStockSlots`）
- **何が起きるか**: `applyRunSave` は `stockState.perma` を「保存時の長さ」で作り直すだけ。中断中にポーチを買うと `permaLevel()=2` に対し `perma.length=1` となり、増えた金枠は `addToStock` / `stockHasRoom` / `stockFreeCount` から見えない**死に枠**になる（通常枠は1つ減ったまま）。空の金枠へドラッグすると `slot=undefined` で TypeError。
- **再現**: `pouchLevel=1` でしおり中断 → タイトルの🥚こうかんで まほうのポーチ購入（`pouchLevel=2`）→ つづきから → 空の金枠へアイテムをドラッグ。
- **直し方の当たり**: `applyRunSave` で `perma` を `permaLevel()` 長に補う（不足枠は `permaStock` から `{id,base}`）。併せて `swapStockSlots` に slot 未定義ガード。
- **反証で得られた根拠**: node 再現で `pouchLevel=2` → `buildPermaSlots` で `perma.length=2`、その後 `index.html:2999-3005` の復元（`d.perma.length=1`）で `perma.length=1` / `permaLevel()=2`。`updateStockUI`(`gameplay.js:4652-`) は maxSlots ぶん枠を描くので空の金枠が見えるが、`swapStockSlots(2,1)` は `gameplay.js:4595 slot.id=` で TypeError。`bootstrap.js:503` の `finishDrag` に try は無い。

---

### [medium] applyRunSave が perma を permaLevel() までパディングしない

- **場所**: `index.html:2997`
- **何が起きるか**: 上記と同根（perma 未パディング）。増えた金枠が使えないうえ `normalMaxSlots` が1減り、**通常枠の品が1つ貯金へ換金**される。空の金枠へのドラッグは `gameplay.js:4594` で `undefined.id` の TypeError。
- **再現**: `pouchLevel=1` でしおり中断 → タイトルショップでポーチ購入（`pouchLevel=2`）→ つづきから。`perma.length=1` / `permaLevel()=2` になり、`swapStockSlots(2,1)` が TypeError。
- **直し方の当たり**: 復元後に `perma` を `permaLevel()` の長さまで `{id:'',used:false,temp:false,base:permaStock[i]}` で埋める（`permaOwned` の突き合わせも新しい長さで回す）。
- **反証で得られた根拠**: `index.html:2994-2999` は `d.perma` をそのまま複製するだけでパディングしない。VM 再現で復元後 `normalMaxSlots` が 2→1 に減り、ドラッグで実際に `TypeError: Cannot set properties of undefined` が投げられた。
- ※ **注記**: この項と上の項は同じ根（`applyRunSave` の perma 未パディング）。修正は1か所で両方閉じる。次項の半額換金も同根。

---

### [medium] 中断中にポーチを買うと、しおりの持ち物が半額で貯金化される

- **場所**: `index.html:3021`（クリップ処理）／`index.html:3018`（`_normMax`）
- **何が起きるか**: クリップ基準の `_normMax` は「再開時」の `normalMaxSlots()`。中断中にポーチを買うと通常枠が1つ減り、しおりに入っていた品が `convertItemToSavings` で**半額**（ふっかつやく 20,000→10,000）になる。コード上のコメント『払った代金が消えはしない』と実態がズレている。
- **再現**: `pouchLevel=1` / `maxSlots=3`（通常枠2）で通常枠を2つ埋めて中断 → タイトルで まほうのポーチ購入 → つづきから → 最後の1個が消えて「貯金しました」トースト（半額）。
- **直し方の当たり**: はみ出しはまず `addToStock` で新設された金枠へ回し、本当に入らない時だけ `convertItemToSavings` する。
- **反証で得られた根拠**: 実コードを VM で再現。`pouchLevel=1`（通常枠2）で heal＋ふっかつやくを持って中断 → ポーチ購入 → `applyRunSave` で items が1つへ削られ、`index.html:3022` の `convertItemToSavings` が走って savings +10,000（定価20,000の半額・`gameplay.js:4342-4345`）。増えた金枠へ回す処理は存在しない。

---

### [medium] セーブデータ削除／引き継ぎ取り込みで piyo_run（しおり）が残る

- **場所**: `index.html:3140`（`deleteSaveData`）／`index.html:3180`（`showTransferImport`）
- **何が起きるか**: どちらも `piyo_settings` しか触らず `piyo_run` を残す。削除後も「つづきから」が出て、`pouchLevel=0` なのに perma は長いまま復元される＝拾った品が見えない金枠へ入り、ふっかつやくは `permaLevel` までしか走査しない `tryRevive` に見つからない。
- **再現**: しおりで中断 → 設定 → セーブデータ削除（2段確認）→ リロード後もタイトルメニューに「つづきから」が残り、押すと距離／スコア／持ち物が復活する。ゲームオーバー時の `commitPermaStock` で `permaStock` も書き戻る。
- **直し方の当たり**: `deleteSaveData`(3140) と `showTransferImport`(3180) の両方で `clearRunState()` を呼ぶ。`buildPermaSlots` も maxSlots でクランプ。
- **反証で得られた根拠**: `deleteSaveData`(`index.html:3134-3144`) は `'piyo_settings'` のみ削除。`showTransferImport` も `setItem('piyo_settings')` だけ。`RUN_SAVE_KEY='piyo_run'`(2821) を消す `clearRunState`(2941) の呼び出しは、破損／版数違い(2924/2926/2937) と `continueRunFromSave`(4757)・`startNewRunFromMenu`(4779) のみ＝**削除経路からは呼ばれない**。しおりは版数＋チェックサムで自己完結するため、リロード後も `hasRunSave()` が真 → `updateContinueButtonUI`(4720-4724) が「つづきから」を出す。

---

### [medium] つづきから でログインボーナス品が二重になる

- **場所**: `index.html:4764`（再配布）／`index.html:5040`（resetGame 内 flush）／`index.html:4895`・`gameplay.js:4291`（`commitPermaStock`）
- **何が起きるか**: `resetGame` 内の `flushPendingStockItems` が未割当の金枠へ配り `commitPermaStock` で `permaStock` に確定 → `applyRunSave` の `permaOwned` 突き合わせが「中断中に変わった枠」と見なして復元 → 退避した pend を再配布。**ログボ1個が「ポーチに永続1個＋通常枠1個」**になる。
- **再現**: 未割当の金枠（`permaStock[0]=''`）＋ログボ品 `['barrier']` ＋しおりセーブ → つづきから。
- **直し方の当たり**: pend を退避したら `resetGame` 側の配布を抑止する（配布前に `pendingStockItems` を空にする）か、再配布前に1回目の commit 分を巻き戻す。
- **反証で得られた根拠**: 実コード（`buildPermaSlots`/`addToStock`/`commitPermaStock`）を node 実行 → `permaStock=['heal_stock']` かつ items にもう1個（通常枠満杯なら貯金へ換金）。`index.html:3004` の前提『拾得は gameOver まで確定しない』が flush の commit で破れている。ログボ品 `heal_stock`(2292/2294) は route 1 対象。

---

### [medium] 地底モードで買った品がポーチに永続化する（サンドボックス破り）

- **深刻度**: high → **medium**
- **場所**: `gameplay.js:4291`（`commitPermaStock` の除外がチュートリアルのみ・4292行）
- **何が起きるか**: `startUndergroundMode`(`index.html:4801`) は `buildPermaSlots` でポーチを有効化し路銀30,000円を配る。老婆の店の `ug_elixir`(stockItem) は `addToStock` route 1 で**未割当の金枠に base 定着**し、gameOver の `commitPermaStock`(`gameplay.js:6416`) で確定＝**次の通常ランでその金枠に劇薬が無料補充**される。
- **再現**: ポーチに空き枠がある状態で地底モード開始 → ステージ1の老婆の店で老婆の劇薬（10,000円）を購入 → 力尽きる／クリア → 次の通常ランでポーチに劇薬が入っている。
- **直し方の当たり**: `commitPermaStock` を `tutorialState` と同様に `undergroundMode.active` でも早期 return する（`buildPermaSlots` も対で検討）。
- **反証で得られた根拠**: `buyStageItem`(`gameplay.js:3531-3562`) に地底判定は無く、`ug_elixir`(`core-state.js:2433` stockItem) は route 1(`gameplay.js:4373`) で定着。`gameOver`(6416) の `commitPermaStock` は tutorial のみ除外(4292)。貯金は `gameplay.js:3234` で塞いである＝**設計意図は「モードの金は消える」**と読める。

---

### [medium] 地底エンディングの一枚絵にぴよフラッシュUIが残り発動できる

- **場所**: `gameplay.js:756`（`ugHudVisible`）／`index.html:2017`（`#specialMoveUI`）／`index.html:7137`（`updateSpecialMoveUI`）
- **何が起きるか**: `ugHudVisible` は `#ui` / `#controlBar` / `#stockSlots` しか隠さない。`#specialMoveUI` は独立要素（z-index:150）で毎フレーム表示が戻るため、**一枚絵の上にゲージが残り押せる**。押すと `specialCutinTimer` で世界が96F停止してテロップが止まり、カットインは後に描く `drawUgEnding`(`render.js:4711`) に覆われて見えないままゲージだけ消費される。
- **再現**: ぴよフラッシュのゲージ満タンで巫女を撃破 → エンディング一枚絵中もゲージが見えて押せる。
- **直し方の当たり**: `ugHudVisible` に `#specialMoveUI` を足し、`updateSpecialMoveUI` の show 条件に `undergroundState.ending` / `groundReturnFade.phase` を加える。
- **反証で得られた根拠**: `gameplay.js:756-767` は3要素のみ非表示。`render.js:4744` → `index.html:7141` の show 条件に ending が無く、ending 中は `gameStarted=true` / `gamePaused=false`（`index.html:5096` でポーズ自体を禁止）＝出続ける。`activateSpecialMove`(`index.html:6992-6999`) にも ending ガードが無い。

---

### [medium] 日次エッグが湧いた直後にカリングで消える（抽選枠は消費済み）

- **深刻度**: high → **medium**（1.693の2回目抽選が救済として残るため）
- **場所**: `index.html:3248`（`spawnDailyGoldenEgg` のスキャン終端）／カリング `index.html:6364`・6367・6374（keep 判定 6340）
- **何が起きるか**: `spawnDailyGoldenEgg` は平地を探して最大 `camera.x+GAME_WIDTH+460` まで前進して置く（3245-3253）が、`manageObjects` の `cullByX` の右境界は `camera.x+GAME_WIDTH+200`。**offset≥220 に置かれたエッグは次tickで powerUps から削除**され、`consumeDailyEggDraw`(6394) だけが消費される。
- **再現**: 2,500m到達時、画面右端の少し先（+60〜+200）に穴（120〜220px）や高台があるとスキャンが+220以上まで進む → 次tickで削除。7,300mの救済抽選も同じ経路。
- **直し方の当たり**: `eggScanEnd` を `camera.x+GAME_WIDTH+200` 未満に収める（`spawnPowerUp` の +0〜200 と同じ帯にする）。置けなければ抽選を消費しない。
- **反証で得られた根拠**: 実コード（`manageTerrain`/`manageObjects`/`spawnDailyGoldenEgg`）を3,000回VM実行 → **418回(13.9%)** が次tickで消え `goldenEggDrawCount` は1消費済み。内訳は草原13.6%／雪原13.3%／砂漠5.2%で、当初主張の「各約20%」は過大だった（発生自体は確認）。

---

### [low] 極楽まんじゅうがライフ満タンでも「買える表示」のまま（表示と購入が不一致）

- **深刻度**: medium → **low**（金銭損失なし・拒否セリフは出る）
- **場所**: `gameplay.js:3129`（`renderStageShopItem` の `isHpItem`）／判定側 `gameplay.js:3402`・`3536`
- **何が起きるか**: `isHpItem` に `'ug_manju'` が無いため、ライフ10でも白字＋価格のまま（dim も「―」も付かない）。`selectShopItem` と `buyStageItem` は弾く。1.683で潰した「表示と購入の食い違い」が老婆の店に残っている。
- **再現**: 地底の老婆の店へライフ10で入る（主の加護+2や極楽まんじゅうで満タンにできる）。行が白字で「12000円」と出るがタップしても購入ダイアログが出ず「まだ元気だろう」で拒否。
- **直し方の当たり**: `gameplay.js:3129` の `isHpItem` に `'ug_manju'` を足し、3402/3536 と同じ3件に揃える。
- **反証で得られた根拠**: `isHpItem` は heal/shortcake のみ＝`canBuy=true`。ライフ上限10(`gameplay.js:2584`)は到達可能で、陳列(`stageShopLineup:2921`)はライフで絞らない＝食い違いは実際に起きる。

---

### [low] 羽根弾が地面の下を飛び続け、土の上に重ねて描かれる

- **深刻度**: medium → **low**（当たり判定に影響なし・見た目のみ）
- **場所**: `render.js:3536`（`drawEggProjectiles`）／消滅条件 `gameplay.js:6394`（`updateEggs`）
- **何が起きるか**: `updateEggs` は地形と当たらず `y>camera.y+GAME_HEIGHT+50`(=500) まで生存。弾は地形（`render.js:4274`）より後に描かれるので、地表 `GROUND_Y=348` より下でも**土の上に重なって見える**。1.681で縁取りを `rgba(255,214,150,.95)` にしたため、以前ほぼ黒で見えなかった区間が見えるようになった。
- **再現**: R2/R8/R14 のカラス戦で羽根弾を撃たせる。
- **直し方の当たり**: `updateEggs` で地上ボス戦時は `y>GROUND_Y` の弾を消す、または `drawEggProjectiles` 側で地表より下を描かない。
- **反証で得られた根拠**: 実値（hoverY=140, speed4.2, grav0.15）で node シミュレーション。11発／7発とも各弾が寿命39〜59fのうち**19〜22f** を `y+16>348` で過ごし土の上に重なる。

---

### [low] ポーズ→きせかえ中もチュートリアルのスキップボタンが最前面で押せる

- **深刻度**: medium → **low**（skip 後は幕とクラスが戻る）
- **場所**: `index.html:1940`（`#tutorialSkipBtn`）／`gameplay.js:1987`（`tapTutorialSkip`）／`bootstrap.js:876`
- **何が起きるか**: `#tutorialSkipBtn` は `position:fixed` / `z-index:60` でポーズ幕（`.overlay` z:20）より上。1.682 の `body.pause-skin-open` は `#ui`/`#stockSlots`/`#specialMoveUI` しか隠さないため、全幅にした一覧の見出し行に重なり**タップも通る**。
- **再現**: 設定からチュートリアルを再プレイ（forced）→ ポーズ → きせかえ。一覧の上端中央に「スキップ」が浮く。2回タップすると `tapTutorialSkip` → `showStartScreen` が走り、きせかえ一覧を開いたままランが終了する。
- **直し方の当たり**: `body.pause-skin-open` のセレクタに `#tutorialSkipBtn` を追加し、`tapTutorialSkip` 冒頭に `gameState.gamePaused` ガードを入れる。
- **反証で得られた根拠**: 両要素とも `#gameContainer`(867) 直下で z-index:60 対 20＝上に出る。`pause-skin-open` は3要素のみ(536-538)、`is-paused` は `#pauseButton` のみ(132)。`tapTutorialSkip` と `bindTapButton`(`bootstrap.js:147-163`) に gamePaused ガード無し。

---

### [low] 割り込みポーズが「きせかえ一覧のまま・再開ボタン無し」で開きうる

- **深刻度**: medium → **low**（「戻る」で復帰できる）
- **場所**: `bootstrap.js:652`（`pauseForInterrupt`）／`bootstrap.js:130`（`checkOrientation`）／`index.html:5116`（`hidePauseScreenUI`）
- **何が起きるか**: `pauseGame` は `pauseMainView`/`pauseSkinView`/`pause-list-mode` を毎回戻す（`index.html:5100-5102`）が、`pauseForInterrupt` と `checkOrientation` は hidden を外すだけ。`hidePauseScreenUI` もビューを戻さないので**前回のきせかえ一覧が残り、「再開」ボタンが無い**ポーズになる。
- **再現**: チュートリアル再プレイ → ポーズ → きせかえ → スキップ2回でタイトルへ → 新しいランを開始 → アプリを背景化して復帰（visibilitychange → `pauseForInterrupt`）。
- **直し方の当たり**: `pauseForInterrupt` / `checkOrientation` を `pauseGame` と同じ初期化に通す、またはビュー復帰を `hidePauseScreenUI` に集約する。
- **反証で得られた根拠**: `bootstrap.js:649-657` は hidden を外すだけで `index.html:5100-5102` の復帰をしない。ビュー切替は `openPauseSkin`/`closePauseSkin`(`index.html:3960-3974`) のみ。前段の「skip でランを終わらせる」経路も上項で確認済み。

---

### [low] 換金トーストの集約が間隔2.0〜2.6秒で効かず2枚重なる

- **場所**: `gameplay.js:4351`（集約条件）／`index.html:3729`（トーストの寿命）
- **何が起きるか**: 集約条件が「経過2000ms未満」のみ。トースト本体は2200msまで不透明・2600msで削除なので、**間隔2000〜2200ms では集約されず**、消えていない1枚目と同じ `left:50% / top:14%` に2枚目が出て文字が重なる（1.694が直したはずの重なりが残る）。
- **再現**: ポーションの間でストック満杯（ポーチ含む）。1個目を拾い、約2.1秒後に2個目を拾う。棚の3個はジャンプで拾うため2秒前後の間隔は普通に起きる。
- **直し方の当たり**: 時間条件を外し、要素が生きている間（`parentNode` あり）は常に集約する。または集約時に消滅タイマーを張り直す。
- **反証で得られた根拠**: 4351 の条件は経過<2000msのみ。棚は3個(`gameplay.js:2474-2481`)、拾得は 2714 の `addToStock` → `convertItemToSavings` 経由で成立。重なる時間は0.3〜0.5秒程度＝軽微だが指摘は正しい。

---

### [low] 換金トーストの集約がフェード中の要素を書き換え、通知が出ない窓がある

- **場所**: `gameplay.js:4351`（集約）／`index.html:3729`（2200msフェード・2600ms除去）
- **何が起きるか**: `showRewardToast` は生成時に寿命タイマーを固定する。集約側は文字だけ書き換えて寿命を延ばさないため、**生成から2200〜2600msの間に来た換金は `parentNode` はあるが `opacity:0` の要素を更新して終わる**＝画面に何も出ない（貯金の加算は正しい）。
- **再現**: ストック満杯でポーションの間に入り3個拾う。1個目 t=0、2個目 t≒1.5秒（ここで at が更新され集約が継続）、3個目 t≒2.4秒 → 3個目の通知が出ない。
- **直し方の当たり**: 集約時に除去/フェードのタイマーを張り直す。または生成時刻を持たせ、フェード開始後は新しいトーストを出す。
- **反証で得られた根拠**: 4351 は `el.parentNode` を見るだけで寿命を延ばさない。3個目は `now-at=0.9s<2000` かつ parentNode 有りで条件成立＝既にフェード済みの要素の innerHTML を書き換えるだけになる。
- ※ 上の項と同じ関数。**トーストの寿命管理を集約側に持たせれば2件同時に閉じる。**

---

### [low] 更新日だけ「1日1個」を超えて引ける（旧セーブに新キーが無い）

- **場所**: `index.html:3211`（`canDrawDailyEggToday`）／`index.html:2714-2715`（`loadSettings`）
- **何が起きるか**: `lastGoldenEggFieldDate` と `goldenEggDrawCount` は1.693の新キーで、1.692以前のセーブには無い（存在時のみ復元）。1.692では `goldenEggDrawDate=今日` だけで打ち切っていたため、**既にその日エッグを取得済みでも更新後は `fieldDate=''` / `count=0` になり抽選が復活**する。
- **再現**: 1.692でその日のフィールドエッグを取得 → 同じ日に1.693以降へ更新 → 2,500mで抽選が走り、その日2個目を入手できる（更新日1日だけ・最大+1個）。
- **直し方の当たり**: `loadSettings` の移行で「新キー未定義かつ `lastGoldenEggDate===今日`」なら `lastGoldenEggFieldDate` にその日付を写す。
- **反証で得られた根拠**: 1.692版（git `463e55d`:`index.html:3199`）は `goldenEggDrawDate===today` だけで打ち切っていたので、更新日は false→true に戻る（node で確認）。取得すれば `collectGoldenEgg('field')`(3268) で止まる＝**余分は最大1個・更新日のみ**。

---

### [low] カラス/ニワトリの発射・被弾ポーズが1フレームしか出ない

- **場所**: `gameplay.js:5249`（`updateBossAI` の無条件代入）／立て側 5264 / 5270 / 6045 / 5996
- **何が起きるか**: `updateBossAI` が毎フレーム `spriteFrame` を無条件代入するため、外から立てた `HAWK_FRAME_SHOOT` / `HAWK_FRAME_DAMAGED` / `BOSS_FRAME_DAMAGED` は**次フレームで上書き**され、`spriteResetTimer`(4964) が空回りする。
- **再現**: node vm で `gameplay.js` を実物のまま回して spriteFrame を記録。発射フレームから `[3,5,5,9,9,9,9]`／踏んだ直後 `[4,1,1,1,1,1,1]`（闇のニワトリは `[5,0,0,0,0,0,0]`）。resetTimer は 20→14 と減るだけ。
- **直し方の当たり**: 各 hawkMode とパトロールの `spriteFrame` 代入を `if (b.spriteResetTimer <= 0)` で囲む。
- **反証で得られた根拠**: VM実行で 3(SHOOT) の次フレームに 6,6,6,7… とホバー周期へ戻り、`spriteResetTimer` は 19,18,17… と空回り。踏み(6045)は `hawkMode='rise'`→5224 FLAP、通常ボス(5996)は 5404 patrol で上書き。**ただし当初主張の「`boss2_damaged` が実質未使用」は誤り**（`HAWK_FRAME_DAMAGED` は `'stun'`(5217) で70〜100F表示される）。実害は `boss2_shoot` と `boss_damaged` の一瞬表示に限られる。

---

### [low] 検証ページ telegraph-preview が丸ごとエラーで死んでいる

- **場所**: `tools/telegraph-preview-main.js:102`
- **何が起きるか**: 1.681で `render.js` の `drawHawkFeatherWarn` を削除したのに呼び出しが残存。`drawAll()` が ReferenceError で停止し try/catch が ERROR 表示に差し替えるため、**残す仕様のフクロウ音波予告のパネル(c4〜c6)まで描かれない**。`HANDOFF.md:137` は今も検証ページとして案内している。
- **再現**: リポジトリ直下を http で配信し `/tools/telegraph-preview.html` を開く。c1だけ描かれ以降は `ERROR: drawHawkFeatherWarn is not defined`。
- **直し方の当たり**: カラス予告パネル(c2/c3)と `hawkWarnPanel` を削除してフクロウ専用ページにする（または関数を tools 側へ移す）。
- **反証で得られた根拠**: `drawHawkFeatherWarn` の定義は全ソースに無い（`render.js` 0件。参照は tools の2か所のみ。`gameplay.js:5132-5133` に1.681で撤去と記載）。`tools/` は配信対象外＝**プレイヤー影響なし・開発者の検証手段が壊れているだけ**。

---

### [low] 1.682のグレー戻る統一からミッション画面が漏れている（ピンクのまま）

- **場所**: `index.html:1668`（`#missionBackBtn`）／参考 `index.html:1831`（`#storeCloseBtn`）
- **何が起きるか**: `#missionBackBtn` は `.game-button` のみで `.head-btn` が無く、ピンク（＝実行色）＋右向き矢印のまま。1.682のCSSコメント(512-514)は「全画面を統一」と書くが、対象8画面にミッションとストアが入っていない。
- **再現**: タイトル → デイリーミッションを開く。下部の「戻る」だけが他画面のグレーの戻ると違いピンクで出る。
- **直し方の当たり**: `#missionBackBtn` と `#storeCloseBtn` に `class="head-btn"` を足す（幅はインライン style で維持できる）。
- **反証で得られた根拠**: 1668 は `class="game-button"` のみ＝210-211のピンク、527 の `.head-btn .ui-icon` 反転も効かない。作りを流用した実績画面の `#achievementBackBtn`(1697) は head-btn 付きグレー＝**不一致は実在**。ただし「戻ると実行が紛らわしい」の根拠は弱い（受取ボタンは3459で黄橙）。`#storeCloseBtn` はインラインで既にグレー＝差は矢印の向きだけ。見た目のみ。

---

### [low] チュートリアル中のきせかえは「そうび中」でも見た目・能力が変わらない

- **場所**: `index.html:3896`（`renderSkinRow`）／`core-state.js:561-563`（`runActiveSkin`）
- **何が起きるか**: `runActiveSkin()` はチュートリアル中 `''` を返す**意図仕様**（1.421）。一方 `renderSkinRow` は `gameSettings.activeSkin` で「そうび中」を出すため、ポーズ→きせかえで装備しても**表示だけが変わる**。
- **再現**: 設定からチュートリアルを再プレイ → ポーズ → きせかえ → 所持済みスキン（例: 侍ぴよ）を「そうび」。行は「そうび中」になるが、見た目も二段ジャンプ等の能力も既定のまま。
- **直し方の当たり**: チュートリアル中は `#pauseSkinButton` を隠す、または一覧に「チュートリアル中は反映されない」旨を表示する。
- **反証で得られた根拠**: 描画(`render.js:1525-1529`)も能力(`index.html:6674/6685` 等)も既定のまま。`#pauseSkinButton`(1068) にチュートリアル判定は無くポーズも可能。**サンドボックス自体は意図仕様＝直すのはラベル側**。

---

## 判断保留（UNCERTAIN）

### [low] 地底モードの金で永続アップグレード（地底の主の加護）が買える

- **深刻度**: medium → **low（保留）**
- **場所**: `gameplay.js:3585`（`permaUpgrade` の保存）／陳列 `gameplay.js:2921-2930`
- **何が起きるか**: `permaUpgrade` の保存は `undergroundMode` を見ずに `gameSettings.upgrades` へ書いて `saveSettings` する。地底モードは路銀30,000円＋モード内の稼ぎ＝**終了時に消えるはずの金**で永続品を確定できてしまう（前掲 [medium] のサンドボックス破りと同種）。
- **保留の理由**: **200,000円到達の可否が未検証**。`tools/ug-layout-check.mjs` 実測で敵287体（踏み300〜500・コンボ最大×3 `index.html:6942`）＋コイン210枚(150円)＋巫女4×`UG_BOSS_SCORE`10,000＋路銀30,000＝理論上は届きうるが、実プレイでの到達は確認できていない。
- **確認方法**: 地底モードを通しでプレイし、最終ステージの店に着く時点の所持金を実測する。届くなら [medium] のサンドボックス破りと**同じ修正**（`undergroundMode.active` の早期 return）でまとめて塞ぐ。
- **直し方の当たり**: `undergroundMode.active` 中は `stageShopLineup` から permaUpgrade 品を外す、または保存を行わない。

---

## 否定された指摘（記録用）

> 同じ指摘が将来また上がらないように残す。**以下は「不具合ではない」と確認済み。**

- **F4 / F9「`stockFreeCount`(1.694) がどこからも呼ばれていない」**（`gameplay.js:4304`）— 呼び出し0件は事実だが**呼ばないのは意図的な決定**。`gameplay.js:2472-2478`（ポーションの間）と 2447-2450（たからの間）に『中身は所持状況で変えない＝1.694・ユーザー決定「案2」』『`stockFreeCount` で数え方を直すだけでは満杯の人の価値が下がる』と明記。未使用関数は実行時に何も起こさない。持てない品は `render.js` の `drawRoomShopItem` が `stockHasRoom` で¥バッジを出す＝表示と購入判定は既に一致。
- **F6「しおり中断で場のエッグが消え、その回の抽選が戻らない」**（`index.html:4592`）— `index.html:3200-3206` が『湧いたのに拾えなかった→次のランでもう1回だけ引ける』と明記。券は抽選した瞬間に消える（1.455の原則）設計で、`EGG_FIELD_DRAWS_PER_DAY=2` がまさにその救済。しおり中断は「取り逃し」の一例で、死んで届かなかった場合と結果は同一。`canSaveRun`(2825-2834) にガードが無いのは仕様どおり。
- **F10「チュートリアルだと部屋の在庫品が拾えず¥バッジだけ残りうる」**（`gameplay.js:2714`）— チュートリアルはランダム湧きが止まる（`index.html:6414 if (tutorialState.active) return;`）＝シールドの落下物が無い。400mゲート（`core-state.js:574`／`gameplay.js:1908-1911`）は「バリアを使うまで世界停止」、前進クランプは `camera.x+738px`(`gameplay.js:1876`) で土管（530m／x=5300）には届かない。入室時 items=0、maxSlots=3 で3個ちょうど収まる。
- **F11「部屋の中で GAME_WIDTH が変わると右側の報酬が壁の外に残る」**（`gameplay.js:2428`）— 座標が入室時 GAME_WIDTH 固定なのは事実だが、**出荷構成では室内で GAME_WIDTH が変わらない**。iOS は `TARGETED_DEVICE_FAMILY=1`（iPhone専用＝主張の iPad Split View が存在しない）、Android は `screenOrientation=userLandscape`、`bootstrap.js:78 if (aw <= ah) return;`（分割時は幅<高さで即return）。Web配信は `wall/` のみでゲーム本体を配らない。再現手段なし。
- **F13「地底モードでポーチ品を売ると永続所有が消え対価も残らない」**（`gameplay.js:3462`）— 地底モードでも老婆の店の購入は生きている（`stageShopLineup` 2921-2929＝ug_manju／ug_elixir／ug_blessing）。売却で得た所持金は同じ店で使え、ug_blessing は `buyStageItem:3583-3587` で `upgrades`+`saveSettings`＝永続資産に変換できる＝「対価が残らない」は成立しない。所有を手放すのは `executeSellItem:3456-3462` の設計どおりで、確認付きの明示操作。
- **F28「『ふっかつやくは別枠カウンタへ(route ⓪)』の注記が4か所残り実装と逆」**（`gameplay.js:3562`）— 4行（2539／3562／4603／4649）に古い記述が残るのは事実だが**実装は正しい**。`addToStock` を node 実行すると `revive_potion` は通常枠を1つずつ消費し `maxSlots(3)` で止まる（4個目は `convertItemToSavings`）。`stockHasRoom`／`useStockItem` も同じ＝動作不良は起きない。コメント文言の整理であって不具合ではない。

---

## 監査の手順（再現用）

### 見た領域と切り口

| 領域 | 見たもの | 主な入口 |
| --- | --- | --- |
| stock | 通常枠／perma枠（ポーチ）の追加・使用・売却・換金の対称性 | `addToStock` / `useStockItem` / `executeSellItem` / `commitPermaStock` / `buildPermaSlots`（gameplay.js 4200-4700） |
| save | しおりの保存→復元で不変量が崩れる箇所、削除経路 | `saveRunState` / `applyRunSave`（index.html 2900-3050）／`deleteSaveData` 3140 / `showTransferImport` 3180 |
| egg-gate | 抽選券の消費と実際の入手が一致するか | `canDrawDailyEggToday` 3211 / `spawnDailyGoldenEgg` 3245 / `manageObjects` の cull 6340-6394 |
| pipe-room | 部屋の在庫と所持枠、入室時固定の座標 | `buildPotionRoom` / `buildTreasureRoom`（gameplay.js 2420-2740） |
| priestess | 地底モードのサンドボックス性（金・持ち物・永続データ） | `startUndergroundMode`（index.html 4801）／`buyStageItem` 3531-3587 ／`gameOver` 6416 |
| shop-price | 価格表示の canBuy と購入判定の一致、トースト | `renderStageShopItem` 3129 / `selectShopItem` 3402 / `buyStageItem` 3536 / `showRewardToast` 4351 |
| hawk-render | 描画順・spriteFrame の上書き・弾の寿命 | `updateBossAI` 5200-5420 / `updateEggs` 6394 / `drawEggProjectiles` render.js 3536 |
| ui | z-index の重なりとポーズ状態の初期化 | `#tutorialSkipBtn` 1940 / `pauseGame` 5100 / `pauseForInterrupt` bootstrap.js 649 |

### 使った道具と検証のやり方

1. **静的読解 + grep** — 指摘ごとに定義・呼び出し・CSS を全ファイル横断で数える（`www/` `ios/` `android/` のコピーは除外して数える）。「関数が存在しない」「呼び出し0件」はここで確定。
2. **node の `vm` で実コードを切り出して実行** — 本監査の主力。`gameplay.js` / `index.html` から対象関数を**書き換えずに**取り出し、状態を作って実行して結果を確認した。CONFIRMED のうち F1・F2・F3・F5・F7・F12・F16・F17・F23 はこの方法で再現済み。
   - 例: `perma`／`permaStock` を組んで `addToStock` → `useStockItem` を回し、保存後の配列を確認（F1）
   - 例: `pouchLevel` 1→2 の中断→再開を通し、`swapStockSlots` の TypeError を実際に発生させた（F2/F16）
3. **モンテカルロ／フレーム単位シミュレーション** — 確率と時間が絡むものは実パラメータで大量試行。
   - `manageTerrain`+`manageObjects`+`spawnDailyGoldenEgg` を3,000回回して刈られる率を実測（F5：13.9%。当初主張の20%は過大と判明）
   - 羽根弾を hoverY=140 / speed4.2 / grav0.15 でフレーム追跡し、地表下にいるフレーム数を数えた（F22）
   - `spriteFrame` を毎フレーム記録して上書きを可視化（F23）
4. **git で旧版と比較** — 移行バグは前版の挙動を確認しないと判定できない。`git show 463e55d:index.html` で1.692の `canDrawDailyEggToday` を読み、更新日に true へ戻ることを確認（F7）。
5. **出荷構成の確認で再現不能を判定** — `ios/App/App.xcodeproj/project.pbxproj`（`TARGETED_DEVICE_FAMILY=1`）、`android/app/src/main/AndroidManifest.xml`（`userLandscape`）、`bootstrap.js:78` を突き合わせ、そもそも起こせない条件を REFUTED にした（F11）。
6. **コメント／設計メモとの突き合わせ** — コード内の決定記録（1.421・1.455・1.574・1.683・1.694「案2」など）を根拠に、意図仕様と不具合を切り分けた（F4/F6/F9/F13/F28）。

### 注意（次に監査する人向け）

- **`perma` 配列の長さは `permaLevel()` と一致している前提で書かれた箇所が多い。** しおり復元だけがこの不変量を破っており、high/medium 4件がここに集中している。まずここを直すのが効率的。
- **`undergroundMode.active` の除外が入っていない永続書き込み**（`commitPermaStock` / `permaUpgrade` の `saveSettings`）は共通の型。新しく永続書き込みを足すときは必ず確認する。
- **`showRewardToast` の集約は寿命を管理していない。** トースト系の指摘は2件とも同じ関数。

---

（現在のバージョン: Ver.1.694）
