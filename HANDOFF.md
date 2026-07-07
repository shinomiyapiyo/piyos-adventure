# 引き継ぎ — ぴよ氏の冒険（次セッション向け）

> 最初に **CLAUDE.md**（プロジェクトルール）と、ユーザーの自動メモリ **MEMORY.md** を読むこと。本書はその次。
> 最終更新: **Ver.1.385 push済／1.386・1.387 が commit済・push待ち**（2026-07-07）。1.385=フクロウ再設計＋ボスHPスケール統一。1.386=ボス戦の空中雑魚をR6以降のみ。**1.387=飛行雑魚v2（バイオーム見た目・砂漠ハゲタカ/雪山白フクロウ/夜コウモリ）＝画像追加版なのでpushはデプロイ後10分待つ**。リポジトリ: `piyos-adventure`（GitHub Pages, **Actions方式で自動公開**）。
>
> 🚨 **素材生成の絶対ルール（2026-07-07に違反・厳格化）**: モーション差分コマは**必ず1キャラ1本のVeo動画から切り出す**。**OpenAIで1枚ずつ独立生成は絶対禁止（クレジット浪費＝即ユーザー資産減）**。飛行=`veo-enemy-fly.mjs`+`veo-frames-to-flying.mjs`／歩行=`veo-enemy-walk.mjs`+`veo-frames-to-enemy.mjs`。詳細=メモリ [[piyo-sprite-motion-rule]]。**向きは必ず実機描画で判定**（素材=右向きが正・飛行敵は左移動でflipHにより左＝進行方向を向く）。
> 公開URL: https://shinomiyapiyo.github.io/piyos-adventure/

## 現在地サマリ（← 次セッションはまずここ / 2026-07-07）

### ✅ 1.383まで push済／⏳ 5体目ボス「闇のフクロウ」（1.384）が未コミット
- **1.373〜1.383 は commit＆push 済み**（origin/main=1.383コミット `e8efebc`）。1.382=3体目「闇のタマゴ」（装甲）／1.383=4体目「闇の大蛇」（下から突き上げ）。
- **`git status` の未コミット＝Ver.1.384（5体目ボス）**: core-state.js / gameplay.js / render.js / sprites.js / i18n.js / index.html / sw.js ＋ 新規 `images/boss_owl_idle.png`・`tools/generate-boss-owl-openai.mjs`。**画像追加版なのでデプロイ後10分待つ**。**下の 1.384 push（Claudeがローカルcommit済→ユーザーは `git push` のみ）**。
- **内容: 5体目ボス「闇のフクロウ」(kind='owl') = "視界かく乱"ボス**（ユーザー案C・空中）。**アリーナを暗転（プレイヤー周囲だけ見える vignette）**させ、暗転を貫く**"光る目"**でフクロウを追わせる。攻撃: **横一線を明るい赤で予告→"横薙ぎ急襲"（高さをズラして回避＝カラスの縦ダイブの対）／音波(地上被弾＝ジャンプ回避)／止まり(perch)＝暗転が晴れて無防備＝踏むチャンス**。登場回数連動: 2回目〜(R10+)暗転が濃い＋2連急襲／3回目〜(R15+)急襲が速い。**⚠モバイル可読性を優先し暗転は控えめ（端も真っ黒にしない・clearR広め）**＝実機で見えなくならないのを確認済。全メカニクス実機検証済み（暗転トグル／横薙ぎ高さズラし回避／perch踏み→飛び立つ／vignette＋光る目＋急襲予告線・危険帯・方向矢印／HP上限）。**BOSS_KINDS末尾に'owl'を足すだけで5周ローテ＆encounterが自動追随**。

### 🆕 Ver.1.385（フクロウ再設計＋ボスHPスケール統一）= commit済・push待ち
- **① ボスHPの内部/表示スケールを統一**（ユーザー要望）: 従来は内部HP(10〜24)を表示だけ×10していた乖離を撤廃。**内部HP=表示HP**に統一（`BOSS_MAX_HP 10→100`・`BOSS_HP_PER_ROUND 2→20`・render.jsのHP表示`×10`を撤去）。既存4ボスのダメージも全て×10して**踏み回数/弾数は不変**（踏み`-1→-10`・hawk`-1/-0.5→-10/-5`・エナジー弾`-0.2→-2`＝弾威力2・特殊`[3,5,8]→[30,50,80]`）。**雑魚敵は据置＝即撃破(実質1HP)**。hpRatio系はスケール不変なので位相しきい値は無改変。
- **② ボスHP増の開始をR6へ**（5ボスに増えたので早すぎたのを緩和）: 式を`gameRound-3`→`gameRound-5`に。**1週目R1〜R5（=一巡目の闇のフクロウまで）は一律HP100**、R6から+20/R・R12でHP240頭打ち（間延び防止のcap=7は維持）。
- **③ 闇のフクロウを空中で踏めるように**（従来はperch中のみ）: `updateBossCollision_owl`をhawk方式に（頭上から落下でどのモードでも踏める）。**空中踏み-5／perch(止まり=地上に降りて無防備)踏み-10＝闇のカラスと同じ**（スコア/クールダウンもhawk準拠300/40・500/50）。弾が主力・踏みは補助。swoop中の側面接触は従来通り被弾。
- **④ 暗転を"実感"できる強さに**（従来は控えめすぎて体感ゼロ→スポットライト化→さらに暗い箇所をもう少し暗くを2段でユーザー要望）: `drawOwlDarkness`＝クリア円を締め(`clearR 115→62`)・周辺を一気に暗く(`外半径0.9→0.62`・mid`0.55→0.74`を内側0.3へ・端`0.86→1.0*dark`・色をほぼ黒`rgba(0,0,3)`へ)。`darkWant`も`0.72/0.9→0.85/0.98`。プレイヤー周囲だけ光が残り、フクロウは光る目の黒シルエットに。**光る目/swoop赤線予告は暗転の上に描くので常に視認可。⚠実機で「暗すぎ」ならclearR↑/alpha↓、「まだ薄い」なら逆**（音波リングはdrawFloatEffectsが暗転の下＝owlは自機付近hoverなので概ね光の中に出るが要実機確認）。
- 全メカニクスをPreviewで検証済（空中踏み-5でHP減／他ボス踏み-10／egg装甲ゲート／弾-2／HP表示"100/100"／R1-5=100・R6=120・R12=240／暗転スポットライトの見た目）。**push=ユーザーが`git push`のみ**。

### 🆕 Ver.1.387（飛行雑魚v2＝バイオーム見た目）= commit済・push待ち（**画像追加＝デプロイ後10分待つ**）
- **飛行雑魚 `flying_chick` の見た目をバイオーム連動に**（地上v1=1.367の飛行版。**行動/当たり/出現率/スコアは完全不変・見た目のみ**）。草原=飛行ひよこ据置／砂漠=ハゲタカ(vulture)／雪山=白フクロウ(snowowl)／夜=コウモリ(bat)。
- **実装**: `biomeFlyingSprite()`(index.html・getBiomeIndex基準)でスポーン時に `flySprite` 確定→`drawFlyingEnemy`(render.js)が `e.flySprite||'flying_chick_fly'` 参照。spawn2箇所（index.html `spawnFlyingEnemy`／gameplay.js `spawnEdgeFlyingEnemy`=ボスアリーナ）に付与。sprites.js に `vulture_fly/snowowl_fly/bat_fly`、sw.js に12枚登録。
- **素材（重要な教訓）**: 当初 私が `generate-biome-flying-openai.mjs`（OpenAIで1枚ずつ独立生成）で作り**モーションが崩れてユーザー指摘＋クレジット浪費**→**Veo方式で作り直し**。新ツール `tools/veo-enemy-fly.mjs`（承認デザイン`_raw/bf_<id>_1_1024.png`を種に"その場羽ばたき"動画1本生成）＋`tools/veo-frames-to-flying.mjs`（ffmpeg抽出→緑クロマキー→均一スケール→**中央整列**→64×64）。採用コマ: vulture=28,34,40,46／snowowl=52,58,64,70（36-38はまばたき=回避）／bat=50,56,62,68。**全コマ同一個体で翼だけ動く正しいアニメを実機の描画パスで確認**。禁止ツール `generate-biome-flying-openai.mjs` は削除、`generate-biome-chicks-openai.mjs` に禁止バナー。
- **向き検証**: 素材は全種右向き（コウモリも右向き＝ユーザー目視確定）。飛行敵は左移動なので `flipH=(velX<0)` で左＝進行方向を向く＝正しい（--flop不要）。**静止画で断定せず実機描画で判定**（1.371の二重反転教訓）。

### 🆕 Ver.1.386（ボス戦の空中雑魚をR6以降のみ）= commit済・push待ち
- **ボス戦中の空中雑魚 `spawnEdgeFlyingEnemy`（→`flyingEnemies`/`type:'flying_chick'`）の出現ゲートを R3+ → R6+ に**（gameplay.js `updateBoss()` case3・約1738）。あわせて間隔式を`240-(gameRound-3)*20`→`240-(gameRound-6)*20`にし**R6を最も緩い間隔**から始める（HP増R6起点と同思想）。**一巡目R1-5のボス戦は空中雑魚なし**（地上雑魚 `spawnEdgeEnemy`=R2+・ボス召喚 `spawnBossChick` は据置）。Preview実測: 空中雑魚 R1-5=0/R6=2/R7=3。

## 🎯 次にやること: ボスの微調整のつづき（次セッションはここから）
**現状: 1.384まで push 済み・1.385は commit済/push待ち**（ボス5体実装＋フクロウ再設計＋HP統一スケール）。**まず1.385をユーザーがpushし、実機で①暗転が濃すぎ/薄すぎないか②フクロウの踏み/弾のバランスを確認**。以降は他ボスの体感調整（ユーザーに「どのボスの何を」聞く）。以下は調整ノブの早見表（**HPは100スケール・増加はR6起点に更新済**）。

### ▶ ボス戦を実機で出す手順（Preview）
`.claude/launch.json`(python3 http.server 8123)を作る→検証後 削除。横向き844×390。SW: unregister＋caches全消し＋リロード。起動: `gameSettings.tutorialSeen=true; loginBonusPending=null; startApp(); startGame();`→ログボが出たら「うけとる」をclickして閉じる。
**ボス召喚**: `gameRound=N; setupBossArena(); bossState.active=true; bossState.phase=3;`（⚠active=true と phase=3 を手動セットしないと updateBoss が早期returnして動かない）。**gameRound→kind**: `BOSS_KINDS[(gameRound-1)%5]` = R1ニワトリ/R2カラス/R3タマゴ/R4大蛇/R5フクロウ（以降5周）。**静止スクショ**: `gameState.gameSpeed=0; gameState.gamePaused=false;` にして各ボスの `*Mode` と `*Timer=99999` を固定すると動かず撮れる。ロジックは `updateBossAI_*(b)` / `updateBossCollision_*(b)` を直接呼んで確かめられる（プレイヤー位置を置いて lives/hp の変化を見る）。

### ▶ 調整ノブ早見表（値＝現在値）
- **共通HP**（core-state.js:46-48／式 gameplay.js:1582）: **内部HP=表示HPに統一（1.385〜）**。`BOSS_MAX_HP=100`・`BOSS_HP_PER_ROUND=20`・`BOSS_HP_ROUND_CAP=7`。式=`100 + min(max(0,gameRound-5),7)*20` ＝ **R1-5=100/R6=120/…/R12=240頭打ち**。ダメージ: 踏み-10（hawk/owlは空中-5・地上(stun/perch)-10）・**エナジー弾-2**(index.html:5320)・特殊(ぴよフラッシュ)[30,50,80](index.html:1867)。表示の×10撤去済(render.js:1999)。出現順=`BOSS_KINDS`(core-state.js:50)。登場回数=`bossEncounter()`(gameplay.js:1864 `Math.ceil(gameRound/5)`)、各ボスの技解禁は AI 内の `enc>=N`。
- **ニワトリ**(rooster) `updateBossAI_mama` gameplay.js:1999 ／ collision 2108付近。攻撃間隔=`b.attackTimer`・召喚=`BOSS_SUMMON_INTERVAL`／`bossState.summonTimer`・確率=`BOSS_ATTACK_RATES`・閃光解禁=`gameRound>=2`。**⚠「変更禁止」コメントあり＝挙動は極力触らない**。
- **カラス**(hawk) `updateBossAI_hawk` gameplay.js:1872。ダイブ確率=`diveChance`(0.4/0.5/0.6)・羽根=`spawnHawkFeathers(b,数,扇)`・広角バースト=`Math.PI*0.95`(1.980付近)・2連ダイブ=`enc>=3 && Math.random()<0.45`・各`attackTimer`。
- **タマゴ**(egg) `updateBossAI_egg` gameplay.js:2183 ／ collision 2600（露出中のみ被ダメ・非露出は弾く・特殊技は貫通・弾ゲートは index.html の弾ループ）。転がり速度=`rollSpeed`(6/7/8×enc)・露出窓=`exposedTimer`(80/108)・2連転がり=`enc>=3`・叩きつけ`velY=-13`。描画=render.js drawBoss egg分岐（回転＋マゼンタ露出グロー）。
- **大蛇**(snake) `updateBossAI_snake` gameplay.js:2293 ／ collision 2638。突き上げ予告=telegraph `serpTimer`(20/32・`enc>=3`で×0.7)・頂点高さ=`APEX=GROUND_Y-92`・露出窓=`exposedTimer`(52/76)・地這い速度=`sweepSpeed`・毒=`spawnSnakeVenom`(gameplay.js:2381)。危険ゾーン予告の描画=render.js drawBoss の snake影分岐（赤塗り＋リング＋土煙）。
- **フクロウ**(owl) `updateBossAI_owl` gameplay.js:2402 ／ collision `updateBossCollision_owl`(2668・**1.385で空中踏み対応=hawk方式・空中-5/perch(地上)-10**) ／ 暗転描画 `drawOwlDarkness` render.js:1676。**暗転の濃さ=`drawOwlDarkness`のgradient（`clearR=62`・mid`0.74*dark`@0.3・端`1.0*dark`・外半径`GAME_WIDTH*0.62`）**（濃くしたい/薄くしたい=ここ。**濃すぎたら clearR↑ or alpha↓**）・暗転周期/濃度=hover内 `darkWant`(0.85/0.98)＋`darkTimer`・横薙ぎ速度=`sp`(12/15×enc)・予告時間=aimの`owlTimer`(22/34)・2連急襲=`enc>=2`・**音波の着弾窓=hootの`owlTimer<=14 && >=8`**（狭い＝難、広げると易）・止まり窓=`owlTimer`(62/88)。

### 5体目ボス「闇のフクロウ」(1.384) 実装メモ
- **スプライト**: 立ち絵1枚 `images/boss_owl_idle.png`（OpenAI・大きな光る目の暗いフクロウ）。空中ボス（入場はhawkと同様に空中を飛んで登場）。生成=`tools/generate-boss-owl-openai.mjs`。sprites.js `boss_owl`・sw.js 登録。
- **暗転描画** `drawOwlDarkness(b)`（render.js・**screen座標**）＝render()の既存ボスオーバーレイ（`if bossState.active && phase>=2`）内から `kind==='owl'` で呼ぶ。プレイヤー中心の radialGradient vignette（clearR=115・端も真っ黒にしない=`rgba(2,0,12,0.86*dark)`）＋暗転を貫く光る目（`b.x+w/2-camera.x`）＋aim時の横一線予告（危険帯＋赤破線＋方向矢印）。`b.darkness`(0..1)は `b.darkWant` へ毎フレーム寄せ、perch中は0（暗転が晴れる）。
- **状態機械** `updateBossAI_owl`（gameplay.js）: `owlMode` = hover(暗転toggle＋攻撃選択)→aim(横一線予告)→swoop(横薙ぎ急襲)→recover／hoot(音波・地上被弾)／**perch**(止まって無防備＝踏める・暗転晴れる)。当たり `updateBossCollision_owl`（perch中に頭を踏む=ダメージ＋飛び立つ／swoop中の本体接触=被弾）。音波の着弾はAI側。ボス状態: owlMode/owlTimer/swoopY/swoopDir/darkness/darkWant/darkTimer。
- **zukan**: `boss:owl`（i18n `zukan_b_owl`/`_d` ja=闇のフクロウ/en=Dark Owl）。全種 38→39。
- **調整の余地**（実機プレイ後・ユーザー要望あれば）: 暗転の濃さ（`drawOwlDarkness`のalpha・現状は可読性優先で控えめ）／音波の着弾窓（AI hoot の owlTimer 14..8）／横薙ぎ速度。

### 4体目ボス「闇の大蛇」(1.383) 実装メモ
- **スプライト**: 立ち絵1枚 `images/boss_snake_idle.png`（OpenAI・鎌首をもたげた縦構図のコブラ）。**動きは procedural**＝`b.headY`（頭の上端Y）で上下、drawBoss の snake分岐で **GROUND_Y より上だけクリップ描画＝地面から生えてくる演出**。生成=`tools/generate-boss-snake-openai.mjs`。sprites.js `boss_snake`・sw.js 登録。
- **状態機械** `updateBossAI_snake`（gameplay.js）: `serpMode` = burrowed→telegraph（危険ゾーン予告）→strike（突き上げ）→**exposed**（頭が出て踏める）→retreat。ほか sweep（地這い）/spit（毒＝`spawnSnakeVenom`・isFlame流用）。当たり `updateBossCollision_snake`（strike中に頭の位置=被弾／sweep中の地上=被弾／exposed中に頭を踏む=ダメージ・接近は許す）。ボス状態フィールド: serpMode/serpTimer/strikeX/headY（＋exposed系はeggと共用）。
- **zukan**: `boss:snake`（i18n `zukan_b_snake`/`_d` ja=闇の大蛇/en=Dark Serpent）。全種は 37→38。
- **描画の要**: drawBoss 冒頭の影は kind==='snake' で「地面の穴＋telegraph時の危険ゾーン(赤塗り＋リング＋土煙)」に差し替え。怒りオーバーレイは snake が地上に頭を出している時だけ（`b.headY < GROUND_Y-20`）。

### 3体目ボス「闇のタマゴ」(1.382) 実装メモ
- **スプライト**: 立ち絵1枚 `images/boss_egg_idle.png`（OpenAI・暗い装甲卵/光る紫の目とヒビ）。**動きは procedural**＝転がり=`b.rollAngle` で回転描画（render.js drawBoss の egg分岐）／弱点露出=マゼンタのグロー overlay。生成=`tools/generate-boss-egg-openai.mjs`。sprites.js `boss_egg`・sw.js 登録済み。
- **状態機械** `updateBossAI_egg`（gameplay.js）: `eggMode` = idle→(rollWind→roll)/slam/summon→**exposed**→idle。装甲判定 `updateBossCollision_egg`（露出中のみ踏みダメージ・非露出は高バウンスで弾く／転がり中の地上接触で被弾）。弾のボス判定（index.html）に `kind==='egg' && !exposed` の露出ゲート追加。ボス状態フィールド: eggMode/eggTimer/rollAngle/rollDir/exposed/exposedTimer/didDoubleRoll。
- **zukan**: `boss:egg`（core-state.js ZUKAN_ENTRIES・i18n `zukan_b_egg`/`_d` ja=闇のタマゴ/en=Dark Egg）。**全種が36→37に増加**（zukanProgressは動的なのでコンプ判定は自動追随。既にboss/all をclaim済みのプレイヤーは egg分の再報酬は出ない＝許容）。
- **次候補**: 案A(闇の大蛇/地中)・案C(闇のフクロウ/暗転)＝[[piyo-gameplay-backlog]]に記録済み。同じ `bossEncounter()>=N` 枠に技をぶら下げるだけ。ローテ配列に足す。

### 図鑑の仕上げ（1.380）実装メモ
- **データ**: `gameSettings.zukan` に `new{}`（未閲覧の新規＝NEW!用）と `claimed{}`（コンプ報酬受取済み）を追加。gameSettings既定＋loadSettings復元＋データ引き継ぎに自動同梱。`ZUKAN_REWARDS={enemy:3,item:3,boss:3,biome:3,all:10}`（core-state.js）。
- **関数**: `zukanNewCount()`/`updateZukanBadge()`/`zukanCatHasNew(cat)`/`checkZukanRewards()`（index.html）。`markZukanSeen`/`zukanAddKill`（core-state.js）が新規登録時に `new[id]=1`。i18n `zukan_reward_toast`。
- **落とし穴**: 報酬トーストは `showRewardToast`（z-index:10000）。図鑑画面(`#zukanScreen` z=9999)の上に出るのを確認済み。トーストは `pointer-events:none` なので `elementFromPoint` はすり抜ける（重なり判定に使うと誤検出）。

### まほうのポーチ（永続ストック）確定仕様と実装（完成・1.378）
**仕様**: エッグ品「まほうのポーチ」を🥚10で買うたび**永続ストック枠+1**（上限=`stockState.maxSlots`・きぐるみは🥚5に変更済み）。枠は**上から順に金枠**・毎ラン**中身を自動補充**（使っても翌ラン戻る）。**入手品は空き永続枠へ自動割当→通常枠→満杯なら貯金換算**（損なし・売値=定価の半分）。永続枠の中身は**ドラッグでスワップ**（タップ=使用は維持）。**復活薬は永続化不可**（`PERMA_STOCK_EXCLUDE`・フレーバー `egg_perma_no_revive`）。
- **データ**: `gameSettings.pouchLevel`（枠数）＋`permaStock`（各枠のid配列・永続）／実行時 `stockState.perma=[{id,used}]`（毎ラン `buildPermaSlots()` で permaStock から構築）。通常枠 `stockState.items` は従来どおり（上限=`normalMaxSlots()`=maxSlots−permaLevel）。
- **⚠ 落とし穴（修正済み）**: `resetGame` は**初回プレイ（splash→startApp→startGame）では呼ばれない**（showStartScreen/retryGame経由のみ）。そのため perma 構築を `buildPermaSlots()` に切り出し、**`resetGame`＋`startGame`＋`showTitleShop`＋`confirmEggBuy`(ポーチ購入時)の4箇所から呼ぶ**＝初回・購入直後・返却プレイヤーでも確実に反映。冪等なので二重呼び出しOK。
- **主な関数（gameplay.js）**: `permaLevel()`/`normalMaxSlots()`/`buildPermaSlots()`/`stockHasRoom(id)`/`convertItemToSavings(id)`/`addToStock`（①perma②通常③貯金換算）/`useStockItem`（表示index→perma(0..pl-1)/通常マッピング・perma=used化で枠残す）/`swapStockSlots(a,b)`（位置スナップショット方式・used-permaはロック・未関与usedは保持・復活薬をperma不可）/`rejectPermaToast()`。ショップ満杯判定（gameplay 481/779/896）は `stockHasRoom` に。ログボ超過（index.html resetGame）は addToStock 経由で貯金換算。
- **UI**: `updateStockUI` 永続枠=金枠(`.stock-slot-perma`)＋左上に番号バッジ(`.perma-badge`)／used=金枠のまま薄いアイコン(`.stock-slot-perma-used`)／未割当=破線金枠(`.stock-slot-perma-empty`)。ドラッグは `bootstrap.js` の `bindStockTaps`（タッチ＋マウス両対応・閾値8px・`data-idx`から掴み`data-slot`へドロップ・`dropIndexAt`はrectヒットテスト）。
- **i18n**: `egg_pouch`/`egg_pouch_desc`/`tshop_keeper_egg_pouch_max`/`egg_perma_no_revive`/`stock_full_savings`（ja/en）。
- **素材**: `tools/generate-pouch-openai.mjs`（gpt-image-1・巾着袋/ひよこ紋章/金紐・96px透過）→ `images/item_pouch.png`。sw.js STATIC_ASSETS 登録済み。

### ⏱ push（Ver.1.384 5体目ボス・画像追加版＝デプロイ後10分待つ）
※長い絵文字入り1行コマンドは貼り付けで崩れて `git commit` が実行されないことがある（1.380で発生）。**Claudeがローカルで `git commit` 作成→ユーザーは `git push` のみ**が確実。
```bash
cd /Users/veriquest/dev/piyos-adventure && git push && printf '\n===== 結果 =====\n' && ( [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && echo "✅ push成功（origin/main と一致）" || echo "⚠ 未同期（push未完了）" ) && echo "📌 push版: $(git show HEAD:index.html | grep -oE 'Ver\.[0-9]+\.[0-9]+' | head -1)" && echo "📝 $(git log -1 --pretty='%h %s')"
```

### 1.377の内容（完成・push済み）
- ①**図鑑スクロール不能修正**＝html/bodyの `touch-action:none` でグリッドがタッチスクロール不可だった→グリッド/詳細に `touch-action:pan-y`＋タップ委譲を `bindZukanScrollTap`（10px以上動いたら選択しない＝スクロールと両立）に。②**カラスの羽ばたき5コマ化**＝同じVeo動画の連続コマ f4/f10/f16/f22/f28 を boss_hawk frame 6-9+5 に追加、`HAWK_HOVER_CYCLE=[6,7,8,9,5,9,8,7]`(上→下→上ping-pong)。⚠実機ボス検証は `setupBossArena()` 後に `bossState.active=true` を手動セットしないと updateBoss が早期return（animFrame進まず）。
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
