# 引き継ぎ — ぴよ氏の冒険（次セッション向け）

> 最初に **CLAUDE.md**（プロジェクトルール）と、ユーザーの自動メモリ **MEMORY.md** を読むこと。本書はその次。
> 最終更新: **Ver.1.376**（2026-07-06）。リポジトリ: `piyos-adventure`（GitHub Pages, **Actions方式で自動公開**）。
> 公開URL: https://shinomiyapiyo.github.io/piyos-adventure/

## 現在地サマリ（← 次セッションはまずここ / 2026-07-06）
- **現在 Ver.1.376。1.373〜1.375 は push＆公開済み（CDN=v1.375）。1.376 はコミット案内済み・ユーザーの push 待ち。** 1.376は画像 `boss2_flap2.png` 追加なので**公開後10分待ってから**アップデート案内すること。`_raw`/`.claude`はgit無視。
- **1.376の内容**: ①**図鑑のタッチ改善**（タブ/カード=`onclick`→`bindTapDelegate` touchend委譲、戻る=`bindTapButton`。`ensureZukanTapBindings`で1回だけバインド）。②**闇のカラスの羽ばたきに中間コマ追加**（2枚交互→中間 `boss2_flap2.png`=Veo f28 を frame5 に足し `HAWK_HOVER_CYCLE=[IDLE,FLAP2,FLAP,FLAP2]` に）。実機検証済み（touchend合成イベントでタブ/カード反応・ホバーが0→5→1→5で回る）。⚠実機ボス検証は `setupBossArena()` 後に `bossState.active=true` を手動セットしないと updateBoss が早期returnする。
- **このセッションの成果**: ①**1.373 広告復活バグ修正**（`fallDeath`が無敵中early-returnで位置復帰せず、広告復活直後の3秒無敵中に穴へ落ちるとキャラが画面外へ落ち続け消えた→`if(isInvincible||isRespawning){resetPlayerPosition();return;}`）。②**1.374 ずかん（図鑑）実装**＝敵7/アイテム23/ボス2/背景4の全36種を遭遇で自動登録・敵とボスは撃破数・未発見はグレーのシルエット・設定画面から開く（保存=`gameSettings.zukan={seen,kills}`／カタログ＝core-state.js `ZUKAN_ENTRIES`・ヘルパー`markZukanSeen`/`zukanAddKill`/`enemyZukanId`/`isZukanSeen`/`zukanProgress`／UI＝index.html）。**ボス名も修正=闇のニワトリ(rooster)/闇のカラス(hawk)**（従来おんどり/タカを訂正・バトル中は名前非表示なので図鑑のみ）。③**1.375 闇のカラス（hawkボス）グラフィック刷新**＝ただの黒鳥→紫の炎オーラ・光る目の華麗で邪悪な魔鳥。idle立ち絵=OpenAI、動きコマ(flap/dive/shoot/damaged)=Veo動画1本から切り出し（新ツール `tools/veo-boss2.mjs`/`veo-boss2-frames.mjs`(緑or白背景クロマキー両対応=Veoが背景を緑↔白で揺らすため)/`veo-boss2-contact.mjs`）。**闇のニワトリ(boss_rooster=`boss_*.png`)はユーザー満足なので変更しない**。
- **運用の要注意3点**（全部HANDOFF内に詳細あり）: ①Pagesデプロイが時々「try again later」で失敗→**再実行で通る**（`gh workflow run pages.yml`）。②**画像を差し替えた版はデプロイ完了から10分待って**アップデート案内（CDNの max-age=600 猶予・SWの cache:'reload' はブラウザキャッシュしか迂回しない）。③**スプライトの向きは必ずゲーム内描画＋目視で判定**（静止画で誤ると二重反転する）。
- **次の候補**: 図鑑の新規発見「NEW!」演出・コンプ報酬(🥚)／雑魚v2=飛行ひよこのバイオーム差し替え／大型=Capacitorネイティブ化・忍者アバター（課金目玉）。エッグこうかんの品追加も保留中。

## 現在の状態（重要・版ごとの詳細ログ）
- **Ver.1.354 push 済み**: 土管ボーナス部屋の見えない壁を撤去。左右に見えるレンガ壁を配置し、当たり判定を壁と一致。出口土管は右壁の内側に接地（core-state.js `PIPE_ROOM_WALL_W`, gameplay.js `updatePipeRoom`/`pipeRoomExitX`, render.js `drawPipeRoomWall`）。
- **Ver.1.355 push 済み**（土管部屋の追加修正）: ①出口土管の上でジャンプすると空中ワープするバグを修正（`updatePipeRoom` の上面着地条件に `feetY >= exTop` を追加＝足が上面に達した時だけ着地）。②退室が敏感すぎた問題を修正＝**口に接触して右を約0.7秒(`PIPE_EXIT_HOLD_FRAMES=42`)押し続けたら退室**（`pipeRoomState.exitHold` ゲージを render で表示）。**入室(下スワイプ)判定は甘めのまま**。
- **Ver.1.356 push 済み**（実績報酬の一部を貯金→🥚化）: 各カテゴリ最上位の実績をゴールデンエッグ報酬に変更（kills_10000/dist_200000=🥚5個, plays_200/best_5000=🥚3個。`ACHIEVEMENTS` に `reward:0`＋`eggReward`）。`claimAchievement` で `goldenEggs` 加算＋`showEggRewardToast`、実績行・画面ヘッダーに🥚表示、`ach_hint` 文言更新。下位〜中位は貯金のまま・dist_5000 はメイド服のまま。**エッグの使い道（交換所）は未実装**なので貯まる一方な点は据置。
- **Ver.1.357 push 済み**（旧URL案内を強化）: `?from=old`（旧URLリダイレクト）検出時の案内を、×で閉じられる上部バナー → **閉じるボタン無しの全画面ブロック**に変更（`showUrlChangeNotice`, z=2147483647, 背後へのタップ遮断）。文言も見出し＋3手順＋警告に刷新（i18n `urlmoved_title/lead/step1〜3/warn`。旧 `urlmoved_notice` は廃止）。**`?from=old` はURLに残す**＝リロードでもすり抜け不可。localStorageの閉じた記録も廃止。**正規の新PWA（manifest start_url＝クエリ無し）には出ない**ので誤ブロックなし。※旧URLの「installed PWA」勢はこの新コードが届かない（旧デプロイ側の対応が別途必要）。
- **Ver.1.358 push 済み**（雲ブロック固着バグ修正）: `recentlyDropped`（下スワイプ貫通フラグ）の解除条件が index.html:3879「60px落下」1つだけで、貫通後に**高台/低い雲へ着地して60px落ちきれないとフラグが固着**→以後 `if(recentlyDropped)continue`(4047) で**全ての雲に乗れなくなる**（Ultracode多角調査＋敵対検証で確定・確度高。地形着地はフラグ不問なので「地面は歩けるが雲だけ無形化」の非対称症状）。修正: 3879 に「着地で解除(`player.onGround && player.y+height>dropFromY+8`)」を追加＋保険で `resetGame`/`resetPlayerPosition`/`enterPipeRoom(gameplay.js:99)` でフラグをリセット。実機で固着再現→修正後は解除を確認・通常すり抜け/60px則は不変。ユーザーのヒント（点滅雲でない/一度降りたのが鍵）と厳密一致。残タスク候補: すり抜け条件(4039)に真上・落下中ガード追加（副次経路つぶし・任意）。→ Ver.1.359 で対応済み。
- **Ver.1.359 push 済み**（雲修正の仕上げ）: すり抜け条件(index.html:4044 旧4039)を `player.y<p.y` → **`player.velY>=0 && player.y+player.height<=p.y+8`**（真上に乗っていて落下/静止中のみ発火）に厳格化。主修正(1.358)と合わせ雲バグは主・副とも解消。
- **Ver.1.360 をコミット**（エッグこうかん＋着ぐるみスキン・要 push）: ①**エッグ限定スキン「でんきネズミきぐるみ」**を追加（`images/skin_kigurumi_*.png` 7枚。生成= `tools/generate-kigurumi-candidates.mjs`(3案出し)→B案採用→`tools/generate-skin-kigurumi-openai.mjs`(全ポーズ生成＋player_*のbboxへ自動整列)。**IP安全＝丸耳/ジグザグ型ほっぺ/コイル+雷玉尻尾/縞なし・ピカチュウ象徴意匠は全コマ回避**。fallは右向きでflip不要）。②**タイトルショップ内に「エッグこうかん」セクション**（`EGG_SHOP_ITEMS` in core-state.js、🥚30で着ぐるみ交換。gameplay.js `selectEggShopItem`/`confirmEggBuy`/`renderEggShopItem`、確認ダイアログは既存tshopフローに `egg:` プレフィックスで相乗り。ヘッダーに🥚残高表示）。③render.js:914 のスプライト解決を `'maid'` ハードコード→ `'skin_'+activeSkin+'_'` に汎用化。SKINS に kigurumi 登録（`eggItem:true`・きせかえ画面にロックヒント）。i18n ja/en 追加。sw.js STATIC_ASSETS に7枚登録。実機検証済み（idle/walk/jump/fall描画・購入フロー・エッグ不足・二重購入防止・装備）。**Ver.1.360 は push 済み**。
- **Ver.1.361 push 済み**: スキン表示名を「でんきネズミきぐるみ」→**「きぐるみ」**に変更（i18n `skin_kigurumi`。en=Kigurumi。説明文 `egg_item_kigurumi_desc` は「でんきネズミの〜」のまま据置）。
- **Ver.1.372 push＆公開済み**（再配信のみ）: 1.371でうずらの向きは**ファイル・公開とも正しく直っていた**（拡大比較＋素URLハッシュで裏取り）が、ユーザーが**デプロイ後10分のCDNキャッシュ猶予内に更新**したため、SW(cache:'reload'はブラウザキャッシュしか迂回しない)が**CDN上の旧画像を取り込んだ**。SWキャッシュは次のCACHE_NAME変更まで固定→**版だけ上げて再取り込みさせる対応**。**運用教訓: 画像を差し替えた版は、デプロイ完了から10分待ってからアップデート案内する**（またはもう一度版を上げる）。
- **Ver.1.371 push＆公開済み**（うずらの向き修正・ファイルは正しかった）: うずらだけ**逆向きに歩く**とユーザー指摘（1.368で付けた `--flop` が二重反転になっていた＝動画の向きを静止画で見誤った。**教訓再確認: スプライトの向きは必ずゲーム内描画＋目視で判定**）。`--flop` 無しで4コマ再書き出し→ゲーム内で全敵の向きが揃うことをスクショ確認。quailの正しい書き出しコマンド=`node veo-frames-to-enemy.mjs --id=quail --frames=40,43,46,49`（flopなし）。
- **Ver.1.370 push＆公開済み**（デバッグONで🥚50個）: `handleDebugTap`（core-state.js・10連タップ切替）のON時に `gameSettings.goldenEggs = 50; saveSettings();` を追加（エッグこうかんの動作チェック用）。**OFF時はエッグ保持**（お金scoreと同じ「お店/交換所チェックのため保持」ポリシー）。⚠永続保存に書くため実プレイのエッグ数を上書きする（デバッグは開発者専用機能なので許容・ユーザー指示どおり「50個になる」を literal 実装）。
- **Ver.1.369 コミット済み**（雑魚モーションの脈動を解消）: 1.368でも「3体とも不安定」とユーザー指摘。原因=整列処理が**全コマを同一身長に正規化**していたため、ボブ（上下動）のたびにサイズが脈動。対策=**動画ごとの均一スケール**（選定コマの中央値身長→基準59pxの倍率1つで統一・自然なボブは保持）に veo-frames-to-enemy.mjs を修正して全12コマ再書き出し。目視ジャッジ用に `tools/veo-enemy-contact-sheet.mjs`（動画全コマを最終処理済み＋番号ラベルで一覧化）も追加＝**今後のコマ選定はこれでユーザーが目視ジャッジできる**。ユーザー判定「不自然には見えない・自然なボブ保持なら問題ない」→現行コマ選定のまま採用（quail:40,43,46,49 flop / enaga:38,41,44,47 / owl:38,41,44,47）。
- **Ver.1.368 push＆公開済み**（雑魚モーションをVeo正規フローで作り直し）: 1.367の歩き12コマはOpenAIで**コマ独立生成**しておりモーションが崩れていた（ユーザー指摘）。**ルール=立ち絵はOpenAI・動きの差分コマは必ずVeo(Gemini)動画からコマ切り出し**（メモリ `piyo-sprite-motion-rule` に恒久記録）。新ツール `tools/veo-enemy-walk.mjs`（承認済みデザインを種に緑背景9:16のその場歩き動画生成）＋`tools/veo-frames-to-enemy.mjs`（ffmpeg抽出→**外周flood-fillクロマキー**=キャラ内部の緑アーティファクトを穴にせずデスピル暗色化→chick基準bboxへ整列→commit。`--flop`=Veoが左向きで生成した時の反転用）。quailのみ--flop・enagaは右向き・owlは正面顔ワドル（採用）。全12コマ差し替え済み・実機4種描画OK・エラー0。
- **Ver.1.367 コミット済み・未push**（雑魚のバイオーム連動バリエーション）: 基本ひよこの**見た目だけ**をバイオーム連動で差し替え（草原=ひよこ/砂漠=**うずらのヒナ**/雪山=**シマエナガ**/夜=**ふくろうのヒナ**）。**行動・当たり判定・出現率・スコアは完全不変**（ユーザー要望=バランスを変えない）。実装=スポーン時に `biomeChickSprite()`（index.html, getBiomeIndex基準）で `walkSprite` を確定→drawEnemy の default 分岐が参照（render.js）。ボスアリーナの雑魚（spawnBossChick/spawnEdgeEnemy）も同様。golden_chick/mama_chick は全バイオーム共通のまま。素材=`tools/generate-biome-chicks-openai.mjs`（enemy_chick_walk_N をポーズ/画風アンカーに同ポーズ別種生成＋bbox整列・各4コマ×3種=12枚、sw.js登録済み）。**v2候補=飛行ひよこの差し替え（砂漠=ハゲタカ/雪=白フクロウ/夜=コウモリ）は未着手**。実機検証済み（バイオーム→スプライト対応・4種並べて描画・反転・エラー0）。
- **Ver.1.366 push＆公開済み**（データ引き継ぎ）: 設定画面に「データ引き継ぎ」（発行/入力）を追加。**機種変更でセーブ（貯金/🥚/実績/きせかえ等=piyo_settings全体）を移行できる＝リリース前必須要件**。形式=`PIYO1.<base64(UTF-8 JSON {v,t,d})>.<checksum8(djb2)>`（約1.5KB・コピー欠け検出用チェックサム・改行/空白混入は自動除去）。取り込みは localStorage 生書き→リロードで**既存 loadSettings のフィールド検証を再利用**（安全）。UI=動的オーバーレイ（`showTransferExport`/`showTransferImport`、クリップボードAPI＋フォールバック、上書きは2度押し確認）。ロジック10項目＋リロード跨ぎE2E＋見た目を実機検証済み。
- **Ver.1.365 push＆公開済み**（BONUS!入場演出＋リスク&リワード演出）: ①土管部屋入場時に「BONUS!」を金文字ポップ表示（`pipeRoomState.introTimer`=90、drawPipeRoom末尾で描画・約1.5秒）。②**ニアミス回避ボーナス**: 保護なしで敵の至近(`NEAR_MISS_RANGE`=14px、`aabbNear`)をかすめ当たらず後方へ抜けたら+100（敵1体1回・`updateNearMiss`、被弾で周囲の待機解除）。③**ノーダメージ継続ボーナス**: 被弾せず500m走るごとに+500（`gameState.noDmgMark/noDmgNext`、takeDamage/fallDeath/resetGameでリセット）。ポップは新エフェクト`bonus_text`（水色系・コンボの金赤と区別、`spawnBonusText`）。**⚠ updatePlayer内は地形ループの `var t` が i18n の t() を隠すため `window.t` で呼ぶ**（実機検証で捕捉）。ロジック12項目＋見た目を実機検証済み。
- **Ver.1.363〜1.364 push＆公開済み**（そば演出に回復量表示）: たちぐいそば購入の全画面演出（`showSobaScene`）に回復テキストを追加（演出がHUDを覆いハート増加が見えなかったフィードバック欠落の解消。gameplay.js:906 で livesBefore 差分を渡す・自動クローズ1.2s→1.5s）。表示ルール[1.364]: **満タン到達時（HP9→+1含む）は「❤ HPが まんたんに なった！」**、未達なら「❤ HPが {n} かいふく！」＝+1しか回復しない時に損した感を出さないDQ風の言い回し（i18n `soba_heal_text`/`soba_heal_full` ja/en）。
- **Ver.1.362 push＆公開済み**（コードレビュー(1.354〜1.361差分・8視点+検証)の指摘5件を修正）: ①render.js drawPlayer のスプライト解決に**未登録スキンIDフォールバック**（壊れたセーブ/登録漏れで透明プレイヤー化を防止。判定は `spriteManager.cache`。**⚠ `IMAGE_SPRITES` はロード完了後 index.html:1660 で null 解放されるため実行時参照禁止**＝初回実装でこれを踏み、SWキャッシュの旧コード混入と合わせて検証で捕捉→修正）②confirmEggBuy: **未対応typeは減算前に弾く**（新type追加の実装漏れでエッグだけ消える地雷を除去。i18n `tshop_keeper_egg_error` 追加。core-state.js にtype追加時の注意コメント）③previewTshopItem に `egg:` 分岐（PCのhoverプレビュー）④トースト共通化 `showRewardToast`（skin/egg両トーストを集約）⑤updateTitleShopUI の死にtypeofガード除去。全件実機検証済み（junkスキン→デフォルト表示・未対応type購入→減算なし・通常購入/プレビュー/トースト/エッグ枠 全部OK・エラー0）。レビュー詳細: 候補18→検証で6件生存（うち5件修正・tools重複は方針により見送り）。却下例=雲修正の「60px||着地」OR条件の誤読系・狭画面系。
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
