# 引き継ぎ — ぴよ氏の冒険（次セッション向け）

> 最初に **CLAUDE.md**（プロジェクトルール）と、ユーザーの自動メモリ **MEMORY.md** を読むこと。本書はその次。
> 最終更新: **Ver.1.362**（2026-07-03）。リポジトリ: `piyos-adventure`（GitHub Pages, main 直 push で公開）。
> 公開URL: https://shinomiyapiyo.github.io/piyos-adventure/

## 現在の状態（重要）
- **Ver.1.354 push 済み**: 土管ボーナス部屋の見えない壁を撤去。左右に見えるレンガ壁を配置し、当たり判定を壁と一致。出口土管は右壁の内側に接地（core-state.js `PIPE_ROOM_WALL_W`, gameplay.js `updatePipeRoom`/`pipeRoomExitX`, render.js `drawPipeRoomWall`）。
- **Ver.1.355 push 済み**（土管部屋の追加修正）: ①出口土管の上でジャンプすると空中ワープするバグを修正（`updatePipeRoom` の上面着地条件に `feetY >= exTop` を追加＝足が上面に達した時だけ着地）。②退室が敏感すぎた問題を修正＝**口に接触して右を約0.7秒(`PIPE_EXIT_HOLD_FRAMES=42`)押し続けたら退室**（`pipeRoomState.exitHold` ゲージを render で表示）。**入室(下スワイプ)判定は甘めのまま**。
- **Ver.1.356 push 済み**（実績報酬の一部を貯金→🥚化）: 各カテゴリ最上位の実績をゴールデンエッグ報酬に変更（kills_10000/dist_200000=🥚5個, plays_200/best_5000=🥚3個。`ACHIEVEMENTS` に `reward:0`＋`eggReward`）。`claimAchievement` で `goldenEggs` 加算＋`showEggRewardToast`、実績行・画面ヘッダーに🥚表示、`ach_hint` 文言更新。下位〜中位は貯金のまま・dist_5000 はメイド服のまま。**エッグの使い道（交換所）は未実装**なので貯まる一方な点は据置。
- **Ver.1.357 push 済み**（旧URL案内を強化）: `?from=old`（旧URLリダイレクト）検出時の案内を、×で閉じられる上部バナー → **閉じるボタン無しの全画面ブロック**に変更（`showUrlChangeNotice`, z=2147483647, 背後へのタップ遮断）。文言も見出し＋3手順＋警告に刷新（i18n `urlmoved_title/lead/step1〜3/warn`。旧 `urlmoved_notice` は廃止）。**`?from=old` はURLに残す**＝リロードでもすり抜け不可。localStorageの閉じた記録も廃止。**正規の新PWA（manifest start_url＝クエリ無し）には出ない**ので誤ブロックなし。※旧URLの「installed PWA」勢はこの新コードが届かない（旧デプロイ側の対応が別途必要）。
- **Ver.1.358 push 済み**（雲ブロック固着バグ修正）: `recentlyDropped`（下スワイプ貫通フラグ）の解除条件が index.html:3879「60px落下」1つだけで、貫通後に**高台/低い雲へ着地して60px落ちきれないとフラグが固着**→以後 `if(recentlyDropped)continue`(4047) で**全ての雲に乗れなくなる**（Ultracode多角調査＋敵対検証で確定・確度高。地形着地はフラグ不問なので「地面は歩けるが雲だけ無形化」の非対称症状）。修正: 3879 に「着地で解除(`player.onGround && player.y+height>dropFromY+8`)」を追加＋保険で `resetGame`/`resetPlayerPosition`/`enterPipeRoom(gameplay.js:99)` でフラグをリセット。実機で固着再現→修正後は解除を確認・通常すり抜け/60px則は不変。ユーザーのヒント（点滅雲でない/一度降りたのが鍵）と厳密一致。残タスク候補: すり抜け条件(4039)に真上・落下中ガード追加（副次経路つぶし・任意）。→ Ver.1.359 で対応済み。
- **Ver.1.359 push 済み**（雲修正の仕上げ）: すり抜け条件(index.html:4044 旧4039)を `player.y<p.y` → **`player.velY>=0 && player.y+player.height<=p.y+8`**（真上に乗っていて落下/静止中のみ発火）に厳格化。主修正(1.358)と合わせ雲バグは主・副とも解消。
- **Ver.1.360 をコミット**（エッグこうかん＋着ぐるみスキン・要 push）: ①**エッグ限定スキン「でんきネズミきぐるみ」**を追加（`images/skin_kigurumi_*.png` 7枚。生成= `tools/generate-kigurumi-candidates.mjs`(3案出し)→B案採用→`tools/generate-skin-kigurumi-openai.mjs`(全ポーズ生成＋player_*のbboxへ自動整列)。**IP安全＝丸耳/ジグザグ型ほっぺ/コイル+雷玉尻尾/縞なし・ピカチュウ象徴意匠は全コマ回避**。fallは右向きでflip不要）。②**タイトルショップ内に「エッグこうかん」セクション**（`EGG_SHOP_ITEMS` in core-state.js、🥚30で着ぐるみ交換。gameplay.js `selectEggShopItem`/`confirmEggBuy`/`renderEggShopItem`、確認ダイアログは既存tshopフローに `egg:` プレフィックスで相乗り。ヘッダーに🥚残高表示）。③render.js:914 のスプライト解決を `'maid'` ハードコード→ `'skin_'+activeSkin+'_'` に汎用化。SKINS に kigurumi 登録（`eggItem:true`・きせかえ画面にロックヒント）。i18n ja/en 追加。sw.js STATIC_ASSETS に7枚登録。実機検証済み（idle/walk/jump/fall描画・購入フロー・エッグ不足・二重購入防止・装備）。**Ver.1.360 は push 済み**。
- **Ver.1.361 push 済み**: スキン表示名を「でんきネズミきぐるみ」→**「きぐるみ」**に変更（i18n `skin_kigurumi`。en=Kigurumi。説明文 `egg_item_kigurumi_desc` は「でんきネズミの〜」のまま据置）。
- **Ver.1.362 をコミット**（コードレビュー(1.354〜1.361差分・8視点+検証)の指摘5件を修正・要 push）: ①render.js drawPlayer のスプライト解決に**未登録スキンIDフォールバック**（壊れたセーブ/登録漏れで透明プレイヤー化を防止。判定は `spriteManager.cache`。**⚠ `IMAGE_SPRITES` はロード完了後 index.html:1660 で null 解放されるため実行時参照禁止**＝初回実装でこれを踏み、SWキャッシュの旧コード混入と合わせて検証で捕捉→修正）②confirmEggBuy: **未対応typeは減算前に弾く**（新type追加の実装漏れでエッグだけ消える地雷を除去。i18n `tshop_keeper_egg_error` 追加。core-state.js にtype追加時の注意コメント）③previewTshopItem に `egg:` 分岐（PCのhoverプレビュー）④トースト共通化 `showRewardToast`（skin/egg両トーストを集約）⑤updateTitleShopUI の死にtypeofガード除去。全件実機検証済み（junkスキン→デフォルト表示・未対応type購入→減算なし・通常購入/プレビュー/トースト/エッグ枠 全部OK・エラー0）。レビュー詳細: 候補18→検証で6件生存（うち5件修正・tools重複は方針により見送り）。却下例=雲修正の「60px||着地」OR条件の誤読系・狭画面系。
- **push はユーザーが実行**する運用（Claude は変更を作り、`git add -A && git commit -m "…(Ver.X)" && git push` の手順を案内するだけ。勝手に push しない）。
- 版数ルール: HTMLを1行でも変えたら Ver +0.001。表示版数は `index.html` の 82行(`content:"Ver.X"`)・760行付近(span)・1563行付近(コメント)の3箇所＋ `sw.js` の `CACHE_NAME` を必ず同期。回答末尾に現Verを記載。
- 新規 js/画像/音声を追加したら `sw.js` の `STATIC_ASSETS` に登録（忘れるとオフラインで壊れる）。

## このセッションで実装したこと（Ver.1.342〜1.353）
- **たちぐいそば購入で `soba_shop_scene.png` を全画面演出**（約1.2秒・タップでスキップ, 1.342/1.344）。
- **デバッグOFFで所持金(score)を保持**（お店の動作確認用。rankScoreは0のまま, 1.343）。
- **土管ボーナス部屋（大型機能, 1.345〜1.352）**
  - 本編の**通常エリア（ステージ開始〜安全地帯手前）の平地にランダムで1ラウンド1回**、縦土管を配置。土管に乗って**下スワイプで入室**。
  - 部屋は**左上から落下して入場**・**死なない**。報酬 = ハート1(+約12%で2個目) / コイン10 / 販売アイテム(≤5000: barrier/lemon_special/full_charge)1個(ストック満杯なら無) / **ゴールデンエッグ 1/20**。
  - **退室 = 床に着地して右の横土管（口が左向き）の口に達し、右を押し続けている時だけ**（飛び越え・空中素通り不可）。横土管の**上には乗れる**。
  - 背景は**ジャックポット風（ゆっくり回転する放射光＋紙吹雪）**。BGM = `sounds/bonus.mp3`（Suno生成・タグ全除去済み。audio.js の `bonusBGM`）。
  - コード: core-state.js(`pipeRoomState`/`bonusRoomItems`/`pipeConfetti`/`PIPE_*`/`SIDE_PIPE_*`), gameplay.js(`checkPipeTrigger`/`pickPipeTargetDist`/`isFlatGroundAt`/`enterPipeRoom`/`exitPipeRoom`/`initPipeRoom`/`updatePipeRoom`/`pipeRoomExitX`), render.js(`drawPipeRoom`/`drawRoomShopItem`/`updateAndDrawPipeConfetti`/`drawGoldenEggSprite`＋`drawPlatform`の`pipe`分岐), index.html(各Image先読み/`findPlatformUnder`/manageObjects内のエッグ出現/HUD🥚), bootstrap.js(gameLoopのpipeRoom分岐/handleSwipeDownの入室/checkPipeTrigger呼び出し)。
  - 注意: **`GAME_WIDTH` は画面比で可変**（例820→974）。部屋の右側レイアウトは実行時 `pipeRoomExitX()` で算出。`images/item_pipe.png` は**上13%/下10%が透明余白**のため drawPlatform で上へ16px・高さ+25して描画補正（`item_pipe_side.png` は余白なし）。
- **ゴールデンエッグ（永久通貨, 1.345/1.349）**: `gameSettings.goldenEggs` に永続化（**減算・リセットなし**）。入手 = 土管部屋1/20 ＋ 本編2500mで1日1回（画面外右からスクロール出現）。ショップヘッダ＋HUD左メニューに🥚数を表示。**使い道（交換所）は未実装**。
- **URL移行対応（1.345/1.348）**: 共有URLを新アドレスに修正。旧→新リダイレクトに `?from=old` 付与（公式サイト `shinomiyapiyo.github.io` 側リポジトリ側で対応済み）。新サイトで検出→「ホーム画面に追加し直して」バナー（`showUrlChangeNotice`, i18n `urlmoved_notice`, ×で閉じ・localStorageで再表示なし）。詳細は自動メモリ `piyo-url-migration`。
- **ボスHP表示を×10**（実HPは不変・1未満ダメージを見やすく・撃破時0クランプ, 1.350/1.352, render.js:1763付近）。
- **デイリーミッション再受取バグ修正（1.353）**: `loadSettings` が `dailyMissions.todayMissions`(＋coins/boss/special) を復元していなかったため、起動毎に「未生成」判定でミッション再生成＝`claimed`全リセットされ**何度でも受け取れた**。復元追加で解決（再起動・アップデート後も受取済みを保持）。
- **「Music by NullPo Works」クレジット削除（1.353）**: 音楽はSuno生成のため。スプラッシュは "Created by NullPo Works" のみに（index.html:703＋i18n `splash_credit1`）。

## 未対応 / TODO
- ✅ **雲ブロックにたまに乗れないバグ → Ver.1.358＋1.359 で修正済み**（主原因＝`recentlyDropped` フラグ固着[1.358]、副次経路＝下スワイプ誤発火[1.359]。詳細は上記）。
- ✅ ~~ゴールデンエッグの使い道未実装~~ → **Ver.1.360 でエッグこうかん(タイトルショップ内)を実装**（第1弾=でんきネズミきぐるみ🥚30）。今後の追加候補: リカラー/リザルトフレーム/土管部屋の練習チケット（設計は自動メモリ `piyo-egg-exchange-plan`。**エッグは性能を売らない・課金の目玉と被せない**が鉄則）。アイテムが増えたら SHOPボタン→「タイトルショップ/エッグ交換所」選択分岐に発展させる（ユーザー決定済み）。
- 任意: 土管部屋の入場時「BONUS!」文字演出。
- 任意: `manifest.json` の `id:"/index.html"`（origin直下）で旧新PWA識別が衝突しうる点。
- バックログ（忍者アバター＝課金/新ボス/図鑑/チャレンジ走行等）は自動メモリ `piyo-gameplay-backlog`。**課金は後回し**方針 = `piyo-monetization-deferral`（審査時は課金なし・ネイティブリリース後に追加）。

## デプロイの注意（GitHub Pages）
- **2026-07-02 障害の顛末**: Ver.1.360〜1.362 の push で公開が 1.359 のまま止まった。調査の過程で ①`.nojekyll` 追加 ②**Pages を Actions（workflow）方式へ切替**（`.github/workflows/pages.yml` 追加・`gh api -X PUT .../pages --field build_type=workflow`）③Pages の DELETE→再作成 まで実施したが失敗が続き、最終的に **GitHub 公式の「Incident with Pages」（2026-07-02T16:54Z〜）が原因と判明**（当方の問題ではなかった）。再作成が障害と重なったため、障害中はサイトが一時 503（空）になっている。
- **復旧手順（障害解消後）**: `gh workflow run pages.yml` を1回実行 → 成功すれば最新 main が公開される。以後のデプロイは push のたびに Actions が自動実行（旧legacyビルダーは廃止済み）。
- 公開状態の確認: `curl -s https://shinomiyapiyo.github.io/piyos-adventure/sw.js | head -1`（CACHE_NAMEが最新Verか）／実行状態: `gh run list --workflow=pages.yml --limit 3`／障害情報: `curl -s https://www.githubstatus.com/api/v2/summary.json`（Pages コンポーネント）。

## 検証手順（このプロジェクト固有）
- Claude Preview を使用: 一時的に `.claude/launch.json`（python3 -m http.server 8123）を作成→検証後に削除（`.claude/settings.local.json` は消さない）。**横向き（例844×390）にしないと「画面を横向きにしてください」ゲートが出る**。
- **SWキャッシュ注意**: コード変更後は preview で serviceWorker unregister ＋ caches 全削除してリロードしないと旧コードが出る。
- 起動: `gameSettings.tutorialSeen=true; loginBonusPending=null; startApp(); startGame();`。土管部屋は `enterPipeRoom()`。ボス/雲などは gameState を直接いじって再現。
- **非同期ループ対策**: 静止画が欲しい時は操作直後に `gameState.gamePaused=true`（`gameSpeed=0` 単独では `updateGameSpeed` に上書きされ止まらない）。JSの `node --check` で外部jsの構文確認、index.htmlのインラインJSは preview でコンソールエラー0＋関数定義を確認。

## 素材生成（OpenAI優先・クレジット都合）
- `zsh -ic 'cd /Users/veriquest/dev/piyos-adventure/tools && node generate-pipe-egg-openai.mjs [--only=pipe,egg,sidepipe]'`。`OPENAI_API_KEY`/`GEMINI_API_KEY` は `.zshrc`。sharp は `tools/node_modules`。
- 規格: 透過PNG・ピクセルアート。**透明余白に注意**（描画位置の補正が要る場合あり＝item_pipe.pngの例）。BGM等の外部生成物はタグ/メタデータを除去してから使う（Suno等）。

## 素材ライセンス
- OtoLogic（CC BY 4.0）を使う場合はクレジット表記が必要（例: 効果音素材：OtoLogic（https://otologic.jp）/ CC BY 4.0）。※現在のBGM/SEはSuno生成中心。
