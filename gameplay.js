// ============================================================
// gameplay.js — ショップ＋ボス（index.html から分離 / Ver.1.334, Step3）
// 内容: ショップシステムロジック(ステージ/タイトル/ストック)・DQ風確認ボックス(createConfirmBox)・
//       ボスバトルシステム(AI/攻撃/固定ボス地形)。retryGame 等もここ。
// 依存: gameState/player/各state/spriteManager/ctx/各UI関数 等のグローバルを実行時参照。
// 読み込み順: 後半インラインの「元の位置」で読む(3分割)＝setupInput等より前に評価される。
// ============================================================
// ─── ショップシステム ロジック ───

// ラウンドに応じたステージBGMを再生（現在はR1→R6で一周し、R7でR1へ戻ってループ）
// チュートリアル「はじまりの地」は専用BGM（土管部屋から戻る時もここを通るので自動で復帰する）
// ⚠BGMの周期はボスの周期(BOSS_KINDS)とは独立。R6=闇のカカシのラウンド専用曲。
// 🔜地底ステージ(R7)を実装したら、末尾に 'underground' を足して7周ループにする
//   （素材 sounds/underground.mp3 は配置済み・audio.js の登録もコメントで用意済み）。
//   ⚠地底ステージ実装前にR7へ割り当てると、通常ステージで地底の曲が鳴ってしまうので足さないこと。
var STAGE_BGM_CYCLE = ['stage', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'];
function playStageBGM() {
    if (!soundManager) return;
    if (tutorialState.active) { soundManager.playBGM('tutorial'); return; }
    // ⚠地底に居る間は地底の曲へ戻す（1.569）。おみせを出る時に confirmCloseShop がこの関数を呼ぶので、
    //   地底判定が無いと**老婆の店を出た瞬間に地上のステージ曲が鳴る**。
    //   exitUnderground は active=false にしてからここを呼ぶので、地上復帰は従来どおり通常曲になる。
    // ⚠**闘技場で戦っている最中はボス曲へ戻すこと**（1.571）。闇の巫女は bossState ではなく
    //   undergroundState 系で動くので `bossState.active` が false のまま＝広告復活(monetization.js)の
    //   「ボス戦中はボスBGMを維持」の分岐に入らず、ここへ落ちてくる。地底判定だけだと
    //   playBGM('underground') が stopAllBGM() ごと走り、**ボス戦の途中で地底フィールド曲に差し替わる**。
    //   bossPhase 1〜3（入場〜登場演出）はまだフィールド曲が鳴っている段階なので 'underground' が正しく、
    //   phase5 は撃破ファンファーレ中でこの関数を通らない。
    if (undergroundState.active) {
        soundManager.playBGM(undergroundState.bossPhase === 4 ? 'bossUnderground' : 'underground');
        return;
    }
    soundManager.playBGM(STAGE_BGM_CYCLE[(gameRound - 1) % STAGE_BGM_CYCLE.length]);
}

// ─────────────────────────────────────────────────────────────
// 地底ステージ（R7/R14/R21…・正の仕様は SPEC_UNDERGROUND.md）
// ⚠設計の肝: 土管ボーナス部屋（画面座標＋固定カメラ）とは別物で、**ワールド座標＋追従カメラ**。
//   camera.x をプレイヤー追従で前進させることで distance=floor(camera.x/10) が既存の式のまま自動加算される
//   ＝ランキング計算に特別扱いを一切足さない。地形の作り方はチュートリアル（作り込み固定地形）に倣う。
// P1（基盤）ではプレースホルダ地形で往復と距離加算だけを通す。ギミック/アート/ボスはP2以降。
// ─────────────────────────────────────────────────────────────

// 地底へ入場（強制土管に入った時に呼ばれる）。camera.x は連続したまま＝距離が途切れない。
function enterUnderground() {
    if (undergroundState.active) return;
    undergroundState.active = true;
    undergroundState.visited = true;
    undergroundState.cleared = false;
    undergroundState.originX = gameState.camera.x;
    // 強制土管の後片付け（入場したので役目は終わり。地形/足場は setupUndergroundStage が全消しする）
    undergroundState.pipePlaced = false; undergroundState.pipeX = 0; undergroundState.pipeAnim = false;
    undergroundState.pipeRise = 0;   // 次の地底ラウンドで再びせり上がり演出から始める
    undergroundState.camMaxX = undergroundState.originX + UG_TRAVEL_PX;      // カメラはここまで＝加算量は全端末で同一
    undergroundState.endX = undergroundState.camMaxX + GAME_WIDTH;           // 地形はさらに1画面ぶん敷く（最後まで床がある）
    undergroundState.savedGameSpeed = gameState.gameSpeed;
    undergroundState.introTimer = UG_INTRO_FRAMES;
    undergroundState.bossPhase = 0; undergroundState.bossTimer = 0; undergroundState.boss = null;
    undergroundState.sigils.length = 0; undergroundState.dark = null;   // 闇の巫女の攻撃（1.570）
    undergroundState.flash = 0; undergroundState.mobTimer = 0;
    gameState.gameSpeed = 0; // オートスクロール停止（以後カメラはプレイヤー追従）
    // 地底の主の加護（1.569・老婆の店の永続品）: 以後、地底に入るたびにライフ+2で始まる。
    // ⚠上限10は超えない（他の回復と同じ扱い）。⚠applyUpgrades はラン開始時しか走らないので、ここで直接足す。
    if (((gameSettings.upgrades || {}).ug_blessing || 0) > 0) {
        gameState.lives = Math.min(gameState.lives + UG_BLESSING_LIVES, 10);
    }

    // 進行中のエンティティを一掃（地上のものを持ち込まない）
    enemies.length = 0; flyingEnemies.length = 0; powerUps.length = 0; bullets.length = 0; coins.length = 0;

    setupUndergroundStage();

    // 天井の穴から落下してくる導入（入力ロック＋無敵はintroTimerで管理）。
    // ユーザー指定(1.545)＝**画面左端の、画面外の上から**落ちてくる。originX がレベル左端＝入場時の camera.x。
    // ⚠x は UG_PLAYER_MARGIN(24) より右にすること。左壁クランプに食い込むと着地前に横へ弾かれる。
    player.x = undergroundState.originX + UG_SPAWN_X;
    player.y = -player.height - UG_SPAWN_Y_ABOVE;
    player.velX = 0; player.velY = 0; player.onGround = false; player.facing = 'right';
    gameState.recentlyDropped = false; gameState.dropFromY = 0;
    gameState.input.left = false; gameState.input.right = false;
    gameState.input.jump = false; gameState.input.jumpPressed = false;
    gameState.input.down = false; gameState.input.up = false;
    // ⚠復帰位置は「レベルの床」から取る（1.563）。GROUND_Y は地上の定数で、地底の部屋1の床(y=1180)とは
    //   別物＝そのまま使うと落下死の直後に画面外へ復帰して落ち続ける。
    var spawnTop = terrainTopAt(player.x + player.width / 2);
    undergroundState.checkpointX = player.x;
    undergroundState.checkpointY = (spawnTop !== null ? spawnTop : GROUND_Y) - player.height;

    if (soundManager) { try { soundManager.playBGM('underground'); } catch (_) {} }
}

// 入場用の強制土管を置く（1.545・SPEC_UNDERGROUND.md §3）。地底ラウンドのボス距離に達した瞬間に呼ばれる。
// ⚠ボーナス土管（checkPipeTrigger）との違い: あちらは「画面右外の平地に置いてスクロールで運んでくる」が、
//   こちらは**スクロールを止めてから画面内に置く**。止めた時点で camera.x が動かない＝
//   プレイヤーは画面右端クランプ(updatePlayer)より先へ行けず、左は左端クランプで戻れない＝土管に入るしかなくなる。
function placeUndergroundPipe() {
    if (undergroundState.pipePlaced || undergroundState.active) return;
    gameState.gameSpeed = 0; // オートスクロール停止（updateGameSpeed も pipePlaced 中は0に固定する）
    var x = gameState.camera.x + GAME_WIDTH * UG_PIPE_SCREEN_X;
    // ⚠止まった画面の中は必ず平地にする（1.552）。カカシ撃破の直後＝アリーナを畳んだ直後に呼ばれるので、
    //   前方の地形がまだ生成されていない／穴が空いている可能性がある。スクロールが止まる＝プレイヤーは
    //   この1画面から出られないので、穴が1つでもあると落ちて詰む。足りない区画だけ床を足して保証する。
    var lo = gameState.camera.x - 100, hi = gameState.camera.x + GAME_WIDTH + 200;
    for (var gx = lo; gx < hi; gx += 100) {
        var covered = false;
        for (var ti = 0; ti < terrain.length; ti++) {
            var tt = terrain[ti];
            if (tt.type !== 'hole' && tt.width > 0 && tt.x <= gx && tt.x + tt.width >= gx + 100) { covered = true; break; }
        }
        if (!covered) terrain.push({ x: gx, y: GROUND_Y, width: 100, height: 130, type: 'ground' });
    }
    gameState.lastTerrainX = Math.max(gameState.lastTerrainX, hi);
    undergroundState.pipePlaced = true;
    undergroundState.pipeX = x;
    // ⚠せり上がり演出（1.554・ユーザー指定「轟音と共に迫り上がる」）: 最初は地面と同じ高さ＝完全に埋まった
    //   状態から始め、updateUnderground が y を上げていく。地面より下は描画側でクリップして隠す。
    undergroundState.pipeRise = 0;
    // ⚠当たり判定の上面は「口の楕円の**中心**」に置く（1.559・ユーザー報告「土管の上で僅かに浮く」）。
    //   スプライトの最上端は楕円の**奥側の縁**なので、そこを足場にするとプレイヤーが口の中心より
    //   UG_PIPE_MOUTH_RY(12px)ぶん高い位置に立ち、宙に浮いて見える。描画は drawUndergroundPipe が
    //   p.y - UG_PIPE_MOUTH_RY を原点にするので、見た目の位置は変わらない。
    //   height も同じぶん詰める＝箱の下端はこれまでどおり GROUND_Y に一致する。
    platforms.push({ x: x, y: GROUND_Y + UG_PIPE_MOUTH_RY, width: UG_PIPE_W,
                     height: UG_PIPE_H - UG_PIPE_MOUTH_RY, type: 'pipe', ugEntrance: true });
    if (soundManager) { try { soundManager.playRumble(UG_PIPE_RISE_FRAMES / 60); } catch (_) {} }
    // 土管の真上の浮遊足場を除去＝下スワイプ入場を妨げない（checkPipeTrigger と同じ処理）
    for (var pj = platforms.length - 1; pj >= 0; pj--) {
        var pl = platforms[pj];
        if (pl.type === 'pipe') continue;
        if (pl.x + pl.width > x - 40 && pl.x < x + UG_PIPE_W + 40 && pl.y + pl.height < GROUND_Y) platforms.splice(pj, 1);
    }
    // 邪魔になる進行中の敵/弾は消す（スクロールが止まるので、居座られると入場が理不尽になる）
    enemies.length = 0; flyingEnemies.length = 0; bullets.length = 0;
}

// 強制土管に沈む演出を開始（ボーナス部屋の anim='in' をそのまま流用し、完了時の行き先だけ地底に差し替える）
function startUndergroundPipeAnim(pipe) {
    if (pipeRoomState.anim !== 'none' || undergroundState.active) return;
    if (undergroundState.pipeRise < UG_PIPE_RISE_FRAMES) return; // せり上がり中は入れない（1.554）
    if (gameState.specialCutinTimer > 0) return; // 必殺カットイン中は入らない（enterPipeRoom と対称）
    pipeRoomState.anim = 'in';
    pipeRoomState.animTimer = 0;
    pipeRoomState.animPipe = pipe;
    undergroundState.pipeAnim = true;           // ← updatePipeAnim の完了時に部屋ではなく地底へ行く目印
    pipeAssistTimer = 0; pipeAssistPipe = null;
    gameState.input.down = false; gameState.input.up = false;
    gameState.input.left = false; gameState.input.right = false;
    gameState.input.jump = false; gameState.input.jumpPressed = false;
    gameState.downSwipeActive = false; gameState.downSwipeTimer = 0;
    if (soundManager) soundManager.playPipeWarp();
}

// ─────────────────────────────────────────────────────────────
// P2-b: レベルの展開（テキストマップ → ワールド座標の実体）
// ⚠マップの書式・凡例・縦の約束は core-state.js の UG_LEVEL_ROOMS の上のコメントが正。
// ─────────────────────────────────────────────────────────────

// ソリッド/溶岩のセル群を矩形に畳む。
// ⚠**縦の連続を先に確定させてから横へ結合する**こと（貪欲に横→縦で畳むと、岩の内部から始まる矩形ができ、
//   その上端に「洞窟の地表タイル」が描かれてしまう＝岩の途中に地面が生えて見える）。
//   この順序なら、どの矩形の上端も必ず本物の表面になる。
function ugMergeCells(grid, rowsN, w, x0, topY, out, isSolid) {
    var runsByCol = [], c, r, i, k;
    for (c = 0; c < w; c++) {
        var list = [];
        r = 0;
        while (r < rowsN) {
            var tp = grid[r][c];
            if (!tp) { r++; continue; }
            var r0 = r;
            while (r + 1 < rowsN && grid[r + 1][c] === tp) r++;
            list.push({ r0: r0, r1: r, t: tp, done: false });
            r++;
        }
        runsByCol.push(list);
    }
    for (c = 0; c < w; c++) {
        for (i = 0; i < runsByCol[c].length; i++) {
            var run = runsByCol[c][i];
            if (run.done) continue;
            run.done = true;
            var cEnd = c;
            for (var c3 = c + 1; c3 < w; c3++) {          // 同じ帯が続く限り右へ結合
                var found = null;
                for (k = 0; k < runsByCol[c3].length; k++) {
                    var o2 = runsByCol[c3][k];
                    if (!o2.done && o2.r0 === run.r0 && o2.r1 === run.r1 && o2.t === run.t) { found = o2; break; }
                }
                if (!found) break;
                found.done = true; cEnd = c3;
            }
            var rect = {
                x: x0 + c * UG_TILE, y: topY + run.r0 * UG_TILE,
                width: (cEnd - c + 1) * UG_TILE, height: (run.r1 - run.r0 + 1) * UG_TILE
            };
            if (isSolid) { rect.type = run.t; rect.ugTile = true; }
            out.push(rect);
        }
    }
}

// 地底ステージの構築（P2-b・1.563）。UG_LEVEL_ROOMS を展開して terrain/platforms/ギミック/コイン/敵を配置する。
function setupUndergroundStage() {
    var ug = undergroundState, o = ug.originX;
    terrain.length = 0; platforms.length = 0; coins.length = 0; powerUps.length = 0;
    ug.rooms = []; ug.lava = []; ug.spikes = []; ug.fireBars = []; ug.fireballs = []; ug.decor = [];
    ug.pendingEnemies = []; ug.shop = null; ug.idol = null; ug.braziers = [];
    var col0 = 0;

    for (var ri = 0; ri < UG_LEVEL_ROOMS.length; ri++) {
        var def = UG_LEVEL_ROOMS[ri];
        var map = def.map, rowsN = map.length, w = def.wT, topY = def.topY;
        var x0 = o + col0 * UG_TILE;
        var mapBottom = topY + rowsN * UG_TILE;
        var room = {
            key: def.key, x0: x0, x1: x0 + w * UG_TILE, topY: topY,
            descend: !!def.descend,          // 下へ進む部屋＝カメラが下を見る（1.564）
            camMinY: topY,
            camMaxY: mapBottom - GAME_HEIGHT,
            // ⚠死亡ラインは**ワールド座標**（画面座標だと縦カメラで降りただけで死ぬ）。
            deathY: mapBottom + UG_DEATH_MARGIN
        };
        if (room.camMaxY < room.camMinY) room.camMaxY = room.camMinY;
        // 縦の部屋＝マップが画面より十分高い。横の部屋はカメラを camMaxY に固定する（ジャンプで揺れないように）
        room.vertical = (mapBottom - GAME_HEIGHT - topY) > 64;
        ug.rooms.push(room);

        var solid = [], lava = [], plat = [], deco = [], spikeRow = [], r, c;
        for (r = 0; r < rowsN; r++) {
            solid.push(new Array(w)); lava.push(new Array(w));
            plat.push(new Array(w)); deco.push(new Array(w)); spikeRow.push(new Array(w));
        }

        for (r = 0; r < rowsN; r++) {
            var line = map[r] || '';
            for (c = 0; c < w; c++) {
                var ch = c < line.length ? line.charAt(c) : ' ';
                if (ch === ' ') continue;
                var cx = x0 + c * UG_TILE, cy = topY + r * UG_TILE;
                switch (ch) {
                    case '#': solid[r][c] = 'ground';   break;
                    case 'B': solid[r][c] = 'elevated'; break;
                    case 'b': deco[r][c]  = 'elevated'; break;   // 飾り（当たり判定なし）
                    case 'L': lava[r][c] = 'lava';      break;
                    case '=': case 'M':
                        plat[r][c] = ch;   // 横に連続する分はあとで1枚に結合する（下の第2パス）
                        break;
                    case '^':
                        // ⚠横に連続するトゲは**1枚の矩形に結合する**（下の第2パス）。1マスずつ別矩形にすると、
                        //   UG_SPIKE_INSET で削った左右がマスの境目で重なって「トゲの間だけ安全」な穴ができる。
                        spikeRow[r][c] = 1;
                        break;
                    case 'F': case 'G': case 'H':
                        ug.fireBars.push({ x: cx + UG_TILE / 2, y: cy + UG_TILE / 2,
                                           len: (ch === 'H') ? 6 : 4, dir: (ch === 'G') ? -1 : 1,
                                           speed: UG_FIREBAR_SPEED, ang: -Math.PI / 2 });
                        break;
                    case 'f': case 'e':
                        // 噴出口はマスの底（＝溶岩の面）。timer をずらして隣どうしが同時に上がらないようにする
                        ug.fireballs.push({ x: cx + UG_TILE / 2, y: cy + UG_TILE,
                                            period: (ch === 'e') ? 100 : 150, power: (ch === 'e') ? 11 : 13,
                                            timer: (c * 37) % ((ch === 'e') ? 100 : 150), cy: 0, vy: 0, live: false });
                        break;
                    case 'o':
                        coins.push({ x: cx, y: cy, width: 32, height: 32, collected: false, animFrame: Math.random() * 20 });
                        break;
                    case '1': case '2': case '3': case '4': case '5':
                        // フィールドアイテム（1.564・ユーザー指定「少しドロップさせて／回復は2つほど」）。
                        // ⚠形は spawnPowerUp と同一にする（取得処理 updatePowerUps は type で分岐するだけ）。
                        powerUps.push({ x: cx + 2, y: cy - 2, width: 36, height: 36,
                            type: (ch === '1') ? 'heart' : (ch === '2') ? 'lemon_can'
                                : (ch === '3') ? 'shield' : (ch === '4') ? 'energy' : 'magnet',
                            collected: false, animFrame: 0, floatOffset: (c % 7) * 0.9 });
                        break;
                    case 'W':
                        // 怪しい老婆の店（岩壁に掘られた洞窟の入口）。⚠当たり判定は持たせない＝
                        //   通り抜けられる飾りとして置き、入店は上スワイプで行う（既存ショップと同じ作法）。
                        //   マスの**下端が床**なので、そこを基準に上へ UG_SHOP_H ぶん描く。
                        ug.shop = { x: cx + UG_TILE / 2 - UG_SHOP_W / 2, baseY: cy + UG_TILE };
                        break;
                    case 'I':
                        // 邪神の巨像（1.570・ユーザー指定）。⚠**当たり判定なしの飾り**＝通り抜けられる。
                        //   置き場所は**ボス部屋の中ではなく「ボス部屋に入る直前の祭壇」**（ユーザー指定）＝
                        //   門をくぐる前にこれを見上げることで「この先がボスだ」と分かる。
                        //   マスの下端が床なので、そこを台座の底にして上へ UG_IDOL_H ぶん描く。
                        ug.idol = { x: cx + UG_TILE / 2 - UG_IDOL_W / 2, baseY: cy + UG_TILE };
                        break;
                    case 'i':
                        // 紫の燭台（飾り・当たり判定なし）。⚠ボス前の予告に使う＝門へ近づくほど密に置く
                        ug.braziers.push({ x: cx + UG_TILE / 2, baseY: cy + UG_TILE, seed: c });
                        break;
                    default:
                        // 敵（遅延スポーン）。⚠全部を最初に実体化すると、到達前に歩いて穴/溶岩へ落ちてしまう
                        ug.pendingEnemies.push({ x: cx, bottom: cy + UG_TILE, kind: ch });
                        break;
                }
            }
        }
        // 片道足場は「横に続く同種」を1枚に結合する。⚠1マスずつ push すると尖塔だけで50枚を超え、
        //   毎フレームの当たり判定と動く床の矢印が足場の数だけ重なる（見た目も処理も無駄）。
        for (r = 0; r < rowsN; r++) {
            c = 0;
            while (c < w) {
                var pk = plat[r][c];
                if (!pk) { c++; continue; }
                var c0 = c;
                while (c + 1 < w && plat[r][c + 1] === pk) c++;
                var pw = (c - c0 + 1) * UG_TILE, py = topY + r * UG_TILE;
                var pl = { x: x0 + c0 * UG_TILE, y: py, width: pw, height: UG_TILE,
                           type: 'floating_ground', ugTile: true };
                if (pk === 'M') {
                    // ⚠動く床は「マップに書いたマス＝**一番下に来る位置**」にする。そうしないと
                    //   下の足場から乗れない瞬間ができる（振幅40なので基準は40px上・位相は下端から開始）。
                    pl.special = 'moving'; pl.baseY = py - 40; pl.amplitude = 40; pl.phase = Math.PI / 2;
                }
                platforms.push(pl);
                c++;
            }
        }
        // トゲ: 横に続く分を1枚に結合（左右の削り UG_SPIKE_INSET を「連なりの外側」だけに効かせるため）
        for (r = 0; r < rowsN; r++) {
            c = 0;
            while (c < w) {
                if (!spikeRow[r][c]) { c++; continue; }
                var s0 = c;
                while (c + 1 < w && spikeRow[r][c + 1]) c++;
                ug.spikes.push({ x: x0 + s0 * UG_TILE, y: topY + r * UG_TILE + UG_TILE - UG_SPIKE_H,
                                 w: (c - s0 + 1) * UG_TILE });
                c++;
            }
        }
        ugMergeCells(solid, rowsN, w, x0, topY, terrain, true);
        ugMergeCells(deco,  rowsN, w, x0, topY, ug.decor, true);
        ugMergeCells(lava,  rowsN, w, x0, topY, ug.lava, false);
        col0 += w;
    }

    ug.endX = o + col0 * UG_TILE;
    ug.roomIdx = 0;
    ug.camY = ug.rooms[0].camMinY;
    gameState.camera.y = ug.camY;
    // ランダム地形生成を止める（manageTerrain もガードする）
    gameState.lastTerrainX = ug.endX;
    gameState.lastHoleX = null;
}

// 今プレイヤーが居る部屋の添字（部屋は隙間なく並ぶので前から見て最初に右端を越えない部屋）
function ugRoomIndexAt(x) {
    var rs = undergroundState.rooms;
    for (var i = 0; i < rs.length; i++) if (x < rs[i].x1) return i;
    return rs.length - 1;
}
// 現在の部屋の落下死ライン（ワールド座標）。地底でないときは画面座標の従来値を返す
function ugDeathY() {
    var rs = undergroundState.rooms, i = undergroundState.roomIdx;
    return (rs && rs[i]) ? rs[i].deathY : GAME_HEIGHT + 100;
}

// 敵の実体化（テキストマップの1文字から）。既存 spawnEnemy と同じ形にそろえる＝以後の処理は共通
function ugMakeEnemy(pe) {
    var k = pe.kind, w, h, s, fly = false, e;
    switch (k) {
        case 'S':                                  // シャレコ（骨だけの鳥・倒せない）
            w = 44; h = 40; s = 0.9; break;
        case 'g': w = 46; h = 42; s = 1.4; break;  // ゴールデン
        case 'm': w = 50; h = 46; s = 0.8; break;  // ニワトリ
        case 'c': w = 42; h = 38; s = 1.1; break;  // ひよこ
        case 'v': case 'd': w = 60; h = 54; s = 2.2; fly = true; break;
        default: return null;
    }
    s *= (1 + (gameRound - 1) * 0.3);              // 既存のラウンド倍率をそのまま流用
    // ⚠地底は**プレイヤーも UG_SPEED_RATE 倍**で歩いている（1.544）。敵にだけ地上の倍率を掛けると
    //   R7では敵 2.2〜3.1px/f 対 プレイヤー 3.0px/f ＝ ほぼ同速になり、避けようがなくなる。
    //   同じ倍率を掛けて「地上と同じ相対速度」に揃える。
    s *= UG_SPEED_RATE;
    if (fly) {
        e = { x: pe.x, y: pe.bottom - h - 120, width: w, height: h, velX: -s, velY: 0,
              type: (k === 'd') ? 'dive_bird' : 'flying_chick',
              flySprite: (k === 'd') ? 'dive_bird_fly' : 'bat_fly',   // 地底はコウモリの見た目
              animFrame: Math.floor(Math.random() * 100), waveOffset: Math.random() * Math.PI * 2 };
        if (k === 'd') { e.diveState = 'fly'; e.diveTimer = 0; e.diveVelY = 0; }
        return e;
    }
    e = { x: pe.x, y: pe.bottom - h, width: w, height: h, velX: -s, velY: 0, onGround: false,
          type: (k === 'S') ? 'skully' : (k === 'g') ? 'golden_chick' : (k === 'm') ? 'mama_chick' : 'chick',
          animFrame: Math.floor(Math.random() * 100),
          walkSprite: (k === 'c') ? 'owl_walk' : null };   // 地底の並はフクロウのヒナ（暗い見た目）
    if (k === 'S') {
        // ⚠シャレコは穴/溶岩の手前で必ず引き返す（落ちて消えると「倒せない敵」の圧が成立しない）
        e.behavior = 'turnHole';
        e.collapsed = false; e.reviveTimer = 0; e.scored = false;
    }
    return e;
}

// 遅延スポーン: カメラが近づいた敵だけ実体化する
function ugSpawnPendingEnemies() {
    var ug = undergroundState, lim = gameState.camera.x + GAME_WIDTH + 120, i, pe, e;
    for (i = ug.pendingEnemies.length - 1; i >= 0; i--) {
        pe = ug.pendingEnemies[i];
        if (pe.x > lim) continue;
        ug.pendingEnemies.splice(i, 1);
        if (pe.x + 80 < gameState.camera.x) continue;   // もう通り過ぎている＝出さない
        e = ugMakeEnemy(pe);
        if (!e) continue;
        if (e.type === 'flying_chick' || e.type === 'dive_bird') flyingEnemies.push(e);
        else enemies.push(e);
    }
}

// 縦カメラ。⚠距離は camera.x のみ由来なので、ここを触っても距離/Lv/ランキングには一切影響しない。
function ugUpdateCameraY() {
    var ug = undergroundState;
    ug.roomIdx = ugRoomIndexAt(player.x + player.width / 2);
    var room = ug.rooms[ug.roomIdx];
    if (!room) return;
    var feet = player.y + player.height;
    // ⚠降りる部屋では足元を画面の**上寄り**に置く（1.564・ユーザー報告）。登りは跳ぶ先が上＝見えているが、
    //   降りる時は進行方向が下なので、足元が画面下寄り(354)のままだと着地点が画面外＝見えない床へ跳ぶことになる。
    var gap = room.descend ? UG_CAM_DESCEND_GAP : UG_CAM_FLOOR_GAP;
    var desired;
    if (!room.vertical) {
        desired = room.camMaxY;                       // 横の部屋は固定＝ジャンプでカメラが揺れない
    } else if (player.onGround) {
        desired = feet - (GAME_HEIGHT - gap);         // 接地した高さを基準にする
    } else if (feet > ug.camY + GAME_HEIGHT - gap) {
        desired = feet - (GAME_HEIGHT - gap);         // 下へはみ出す
    } else if (player.y < ug.camY + 120) {
        desired = player.y - 120;                     // 上へはみ出す
    } else {
        desired = ug.camY;                            // 窓の中＝動かさない（ジャンプで揺れない）
    }
    if (desired < room.camMinY) desired = room.camMinY;
    if (desired > room.camMaxY) desired = room.camMaxY;
    ug.camY += (desired - ug.camY) * UG_CAM_LERP;
    if (room.vertical) {
        // 保険: 落下は最大15px/fなので lerp だけだとカメラが置いて行かれて画面外に出る。必ず画面内に収める。
        var hardLo = Math.min(room.camMaxY, feet - (GAME_HEIGHT - UG_CAM_EDGE));
        if (ug.camY < hardLo) ug.camY = hardLo;
        var hardHi = Math.max(room.camMinY, player.y - UG_CAM_EDGE);
        if (ug.camY > hardHi) ug.camY = hardHi;
    }
    gameState.camera.y = ug.camY;
}

// 足元が「動かない足場」かを見る。⚠チェックポイントの記録条件に使う:
//   動く床の上を記録すると、復帰したときそこに床が無く落ちる→また復帰→無限にライフを失う。
function ugOnStaticGround() {
    var feet = player.y + player.height, i, t;
    for (i = 0; i < terrain.length; i++) {
        t = terrain[i];
        if (t.type === 'hole' || t.width <= 0) continue;
        if (feet >= t.y - 4 && feet <= t.y + 6 && player.x + player.width > t.x + 4 && player.x < t.x + t.width - 4) return true;
    }
    for (i = 0; i < platforms.length; i++) {
        t = platforms[i];
        if (t.special === 'moving' || t.special === 'disappearing') continue;
        if (feet >= t.y - 4 && feet <= t.y + 6 && player.x + player.width > t.x + 4 && player.x < t.x + t.width - 4) return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────
// P2-b ギミック（溶岩の池 / トゲ床 / ファイアバー / 火の玉）
// ⚠ダメージは既存の takeDamage()（無敵180フレーム）／溶岩は既存の fallDeath()（穴と同じ）。
//   **新しい即死は増やさない**＝プレイヤーが学ぶルールを増やさない（SPEC §5.2）。
// ⚠updatePlayer より**後**に呼ぶこと（プレイヤーの最終位置で判定する）。bootstrap.js の配線を参照。
// ─────────────────────────────────────────────────────────────
function updateUndergroundHazards() {
    var ug = undergroundState;
    if (!ug.active) return;
    var i, j, fb, fbx, fby, seg;

    for (i = 0; i < ug.fireBars.length; i++) {
        fb = ug.fireBars[i];
        fb.ang += fb.speed * fb.dir;
        if (fb.ang > Math.PI * 2) fb.ang -= Math.PI * 2;
        else if (fb.ang < 0) fb.ang += Math.PI * 2;
    }
    for (i = 0; i < ug.fireballs.length; i++) {
        var fbl = ug.fireballs[i];
        if (fbl.live) {
            fbl.vy += UG_FIREBALL_G;
            fbl.cy += fbl.vy;
            if (fbl.cy >= fbl.y) fbl.live = false;          // 溶岩に戻った
        } else if (++fbl.timer >= fbl.period) {
            fbl.timer = 0; fbl.live = true; fbl.cy = fbl.y; fbl.vy = -fbl.power;
        }
    }

    // ── プレイヤーとの当たり ──
    if (ug.introTimer > 0) return;                          // 落下導入中は無敵＝判定しない
    var px = player.x, py = player.y, pw = player.width, ph = player.height;

    // 溶岩＝穴と同じ扱い（fallDeath）。⚠触れた瞬間ではなく「足が面より下」で判定＝縁を掠めて即死しない
    for (i = 0; i < ug.lava.length; i++) {
        var L = ug.lava[i];
        if (px + pw - 10 > L.x && px + 10 < L.x + L.width &&
            py + ph > L.y + 6 && py < L.y + L.height) { fallDeath(); return; }
    }
    if (gameState.isInvincible) return;                     // 以下はダメージ系＝無敵中は素通り

    // トゲ床。⚠**プレイヤーもトゲも削る**（1.564）。既存の敵ダメージ判定 aabbShrink(player,e,14,12) は
    //   両方を14pxずつ削っているので、片側だけ8px削っていた1.563は他のどの当たりより20px厳しかった。
    for (i = 0; i < ug.spikes.length; i++) {
        var sp = ug.spikes[i];
        if (px + pw - UG_HAZARD_SHRINK_X > sp.x + UG_SPIKE_INSET &&
            px + UG_HAZARD_SHRINK_X < sp.x + sp.w - UG_SPIKE_INSET &&
            py + ph > sp.y + 4 && py < sp.y + UG_SPIKE_H) { takeDamage(); return; }
    }
    // ファイアバー: 円弧上の各セグメントを円として当てる（矩形×円の最短距離）
    var pcx = px + pw / 2, pcy = py + ph / 2;
    var hx = pw / 2 - UG_HAZARD_SHRINK_X, hy = ph / 2 - UG_HAZARD_SHRINK_Y;
    for (i = 0; i < ug.fireBars.length; i++) {
        fb = ug.fireBars[i];
        for (j = 1; j <= fb.len; j++) {
            seg = j * UG_FIREBAR_SEG;
            fbx = fb.x + Math.cos(fb.ang) * seg;
            fby = fb.y + Math.sin(fb.ang) * seg;
            var dx = Math.max(0, Math.abs(fbx - pcx) - hx), dy = Math.max(0, Math.abs(fby - pcy) - hy);
            if (dx * dx + dy * dy < UG_FIREBAR_R * UG_FIREBAR_R) { takeDamage(); return; }
        }
    }
    for (i = 0; i < ug.fireballs.length; i++) {
        var fl = ug.fireballs[i];
        if (!fl.live) continue;
        var ex = Math.max(0, Math.abs(fl.x - pcx) - hx), ey = Math.max(0, Math.abs(fl.cy - pcy) - hy);
        if (ex * ex + ey * ey < UG_FIREBALL_R * UG_FIREBALL_R) { takeDamage(); return; }
    }
}

// ─────────────────────────────────────────────────────────────
// シャレコ（骨だけの鳥・1.563・ユーザー発案）＝マリオの「カロン」相当。
// ⚠**このゲームで唯一「倒せない敵」**。踏むと崩れて骨の山になり、N秒後に組み上がって復活する。
//   ＝一時的に無力化はできるが、根本的には避けて進む敵。既存の雑魚は全部倒せるので、これが地底の固有性になる。
// ⚠既存の「踏み＝撃破」とは別ロジック。撃破の入口（踏み/シールド/急降下斬り/弾/必殺）は全部
//   killEnemy か applySpecialMoveImpact を通るので、そこで崩壊へ差し替える＝取りこぼしが出ない。
// ─────────────────────────────────────────────────────────────

// 骨が散るエフェクト（既存の floatEffects を流用＝描画側の新規実装ゼロ）
function ugSpawnBoneBurst(cx, cy) {
    for (var i = 0; i < 10; i++) {
        floatEffects.push({
            type: 'combo_spark',
            worldX: cx + (Math.random() - 0.5) * 20, worldY: cy + (Math.random() - 0.5) * 16,
            vx: (Math.random() - 0.5) * 4.5, vy: -1.5 - Math.random() * 2.5,
            timer: 0, duration: 26 + Math.floor(Math.random() * 12),
            size: 2 + Math.random() * 2.5, hue: 44
        });
    }
}

// 崩壊させる（＝撃破の代わり）。踏み/弾/必殺/シールド/急降下斬り すべてここへ来る
function ugCollapseSkully(e) {
    if (e.collapsed) return;
    e.collapsed = true;
    e.reviveTimer = UG_SKULLY_REVIVE;
    e.savedVelX = e.velX || -0.9;
    e.velX = 0;
    ugSpawnBoneBurst(e.x + e.width / 2, e.y + e.height / 2);
    if (soundManager) soundManager.playKill();
    // 図鑑は「崩壊させた時点」で登録（✅ユーザー決定1.563）。倒せない敵なので撃破イベントが存在しないが、
    // 崩壊もプレイヤーの能動的な行動が要る点は撃破と同じ＝1.474の「倒してないのに載る」問題には当たらない。
    zukanAddKill('enemy:skully');
    // スコアは**その個体の初回の崩壊だけ**（✅ユーザー決定1.563）。再生するので、
    // 同じ骨を踏み続けてコンボ・必殺ゲージ・スコアを無限に稼げてしまうのを防ぐ。
    if (!e.scored) { e.scored = true; registerKill(UG_SKULLY_SCORE, e.x + e.width / 2, e.y); }
}

// ─────────────────────────────────────────────────────────────
// ボス闘技場（1.564・ユーザー指定「ロックマンのように完全に別の部屋へ移り、ボス戦は固定1画面」）
// ⚠距離の不変条件: 闘技場は camMaxX(=UG_TRAVEL_PX)より先にあり、カメラはそこで頭打ち。
//   つまり**闘技場に入った時点で800mの加算は完了していて、戦闘中は1mも増えない**＝
//   ボス戦の長さがランキングに影響しない（通常ボスのアリーナと同じ思想）。
// ⚠ボス本体（闇の巫女）はP3。ここに居るのは**闘技場が成立するかを検証するための仮ボス**。
// ─────────────────────────────────────────────────────────────
function updateUgBoss() {
    var ug = undergroundState;
    if (!ug.active || ug.cleared) return;
    var ch = ug.rooms[ug.rooms.length - 1];
    if (!ch || ch.key !== 'chamber') return;

    // ── 移行トリガー: 門をくぐって闘技場の敷居をまたいだ瞬間 ──
    if (ug.bossPhase === 0) {
        if (player.x + player.width * 0.5 < ch.x0 + 8) return;
        ug.bossPhase = 1; ug.bossTimer = 0;
        ug.bossPanFrom = gameState.camera.x;
        ug.bossDoorX = ch.x0;
        // 進行中の雑魚と弾は畳む（闘技場に持ち込まない＝通常ボスの setupBossArena と同じ考え方）
        enemies.length = 0; flyingEnemies.length = 0; bullets.length = 0;
        ug.pendingEnemies.length = 0;
        if (soundManager) { try { soundManager.playRumble(1.2); } catch (_) {} }
        return;
    }
    ug.bossTimer++;

    // ① 入場: 入力を止めて自動で数歩あるかせつつ、カメラを闘技場へ寄せきる
    if (ug.bossPhase === 1) {
        gameState.input.left = false; gameState.input.jump = false;
        gameState.input.right = (ug.bossTimer < UG_BOSS_PAN_FRAMES * 0.7);   // 数歩だけ自分で歩いて入る絵
        var pt = Math.min(1, ug.bossTimer / UG_BOSS_PAN_FRAMES);
        var eased = 0.5 - 0.5 * Math.cos(Math.PI * pt);
        // ⚠カメラは必ず前へだけ動かす（戻すと距離が減る）。max で単調性を保証する。
        var newCam = Math.max(gameState.camera.x, ug.bossPanFrom + (ug.camMaxX - ug.bossPanFrom) * eased);
        if (newCam > gameState.camera.x) {
            // ⚠**ここでも ugDistOffset を積むこと**（1.564で発覚）。updateUnderground の通常前進と違って
            //   演出側で camera.x を直接動かしているので、積み忘れると**この演出の間だけ距離が非圧縮で増える**。
            //   実測で加算量が 800m → 815m になっていた（＝設計値がズレる＝バイオーム/ボス距離の補正も狂う）。
            gameState.ugDistOffset += (newCam - gameState.camera.x) * (1 - UG_DIST_SCALE);
            gameState.camera.x = newCam;
        }
        if (ug.bossTimer >= UG_BOSS_PAN_FRAMES) { ug.bossPhase = 2; ug.bossTimer = 0; }
        return;
    }

    // ② 背後の扉が降りる＝逃げ場が無くなる。降りきったら**本物の壁**を地形に足す
    if (ug.bossPhase === 2) {
        gameState.input.left = false; gameState.input.right = false; gameState.input.jump = false;
        if (ug.bossTimer >= UG_BOSS_DOOR_FRAMES) {
            terrain.push({ x: ug.bossDoorX - UG_TILE, y: ch.topY + 2 * UG_TILE,
                           width: UG_TILE, height: 10 * UG_TILE, type: 'elevated', ugTile: true, ugDoor: true });
            if (typeof screenShake !== 'undefined') { screenShake.intensity = 6; screenShake.timer = 14; }
            if (soundManager) { try { soundManager.stopRumble(); soundManager.playDamage(); } catch (_) {} }
            ug.bossPhase = 3; ug.bossTimer = 0;
        }
        return;
    }

    // ③ ボス登場（紫の渦→実体化）
    if (ug.bossPhase === 3) {
        gameState.input.jump = false;
        // ⚠渦の位置は**画面内**で決める（1.570）。闘技場は40タイル=1,280pxあるが、カメラは camMaxX＝
        //   闘技場の左端で止まるので、実際に見えているのは左から GAME_WIDTH(820〜1150) ぶんだけ。
        //   部屋の幅(ch.x1-ch.x0)から比率で置くと、狭い端末では渦もボスも画面の外に出る。
        if (ug.bossTimer === 1) ug.bossSpawnX = gameState.camera.x + GAME_WIDTH * 0.60;
        if (ug.bossTimer >= UG_BOSS_APPEAR_FRAMES) {
            ug.boss = ugSpawnPriestess(ch, ug.bossSpawnX);
            ug.bossPhase = 4; ug.bossTimer = 0;
            if (soundManager) { try { soundManager.playBGM('bossUnderground'); } catch (_) {} }
        }
        return;
    }

    // ④ 戦闘（闇の巫女・SPEC §7）
    if (ug.bossPhase === 4) {
        var b = ug.boss;
        if (!b) { ug.bossPhase = 5; ug.bossTimer = 0; return; }
        // 弾/必殺で倒れた場合はここで拾う（AIを1フレーム余計に回して弾を撒かせない）
        if (b.hp <= 0) { ugPriestessDefeated(b); return; }
        ugPriestessAI(b);
        ugPriestessCollision(b);
        ugUpdateSigils();
        ugSpawnArenaMobs(ch, b);
        // ⚠呪弾は bossState.eggs を流用しているので、**ここで updateEggs を回さないと弾が動かない**
        //   （通常ボスは updateBoss の phase3 からしか呼ばれない）。
        updateEggs();
        if (b.hp <= 0) ugPriestessDefeated(b);
        return;
    }

    // ⑤ 撃破演出 → 退場（報酬は SPEC §8）
    if (ug.bossPhase === 5) {
        // 崩れ落ちる巫女（描画は drawUgBossRoom）。爆ぜる音と光を散らしてから消す
        if (ug.boss && ug.bossTimer % 9 === 0 && ug.bossTimer < UG_BOSS_DEFEAT_FRAMES * 0.55) {
            spawnExplosionEffect(ug.boss.x + Math.random() * ug.boss.width,
                                 ug.boss.y + Math.random() * ug.boss.height);
            if (soundManager) soundManager.playKill();
        }
        if (ug.bossTimer === 1) ugGrantPriestessRewards();
        if (ug.bossTimer >= UG_BOSS_DEFEAT_FRAMES) exitUnderground();
        return;
    }
}

// ═══════════════════════════════════════════════════════════════════
// 闇の巫女（地底のボス・P3/1.570・正の仕様は SPEC_UNDERGROUND.md §7）
// ═══════════════════════════════════════════════════════════════════
// 【設計の骨格】カカシ(1.535)で学んだ「攻撃と踏みチャンスを必ず交互に出す」をそのまま踏襲する。
//   奇数サイクル=攻撃／偶数サイクル=詠唱（＝降りてきて硬直＝踏める窓）。倒し方の学習が1回の観察で済む。
// 【この部屋の高さが全部を決めている】床 worldY=1180・天井の下端 860 の320pxしかない。
//   地底の歩行3.0px/f・最高到達175px ＝ 床から跳んでも**足元は 1005 までしか上がらない**。
//   ・浮遊時の上端 916 → 踏み判定線(上端+60%) 988 は 1005 より上 ＝ **届かない＝踏めない**（格上感）
//   ・詠唱時の上端 1046 → 上端が足元の最高到達より41px下 ＝ **踏める**
//   この2つの高さのどちらかだけを動かすと戦闘が成立しなくなる。必ずセットで見直すこと。
// 【弾は bossState.eggs を流用】SPEC §7.2 の指定どおり。updateEggs のシールド判定・移動・被弾・
//   消滅がそのまま効く（isFlame=闇の炎弾の見た目）。⚠その代わり updateEggs をここから呼ぶ必要がある。
// ─────────────────────────────────────────────────────────────

function ugSpawnPriestess(ch, spawnX) {
    var hoverY = ch.topY + UG_BOSS_HOVER_DY;
    return {
        kind: 'priestess',
        x: spawnX - UG_BOSS_W / 2, y: hoverY, baseY: hoverY,
        width: UG_BOSS_W, height: UG_BOSS_H,
        hp: UG_BOSS_HP, maxHp: UG_BOSS_HP,
        hoverY: hoverY, castY: ch.topY + UG_BOSS_CAST_DY,
        mode: 'recover', timer: 50, cycle: 0,      // 登場直後は少し間を置く（いきなり撃たない）
        vx: 0.9, anim: 0, hurt: 0, flash: 0, stompCd: 0,
        phaseSeen: 1,        // 到達済みのフェーズ。HP60%/30%を割った瞬間に「解放」演出を1回だけ挟むための記録
        spiralLeft: 0, spiralAng: 0,               // 螺旋弾幕（P3）の残弾と現在角
        trail: [],           // 残像 {x,y}（先頭が最新）。瞬間移動と高速移動で尾を引かせる
        exposed: false,      // true の間だけ踏みでダメージが通る（＝詠唱/分身中）
        solid: true,         // 瞬間移動の最中は false ＝当たり判定なし
        facing: 'left',
        clones: [],          // 分身（にせもの）。本物は b 自身
        cloneFire: 0,
        ghostTimer: 0, ghostX: 0, ghostY: 0        // 瞬間移動の残光（描画用）
    };
}

// ボス戦中に画面外から歩いてくる雑魚（1.570・ユーザー指定）。
// ⚠通常ボスの spawnEdgeEnemy / spawnEdgeFlyingEnemy は **GROUND_Y と bossState.arenaLeft/Right** を見るので
//   地底では使えない（床は ch.topY+384、闘技場の左右は camera.x と GAME_WIDTH から出す）。専用に用意する。
// ⚠**地上の雑魚だけ**にすること（✅ユーザー決定1.570）。空中雑魚を混ぜると、呪弾を避けるための
//   縦の逃げ場（跳ぶ・くぐる）まで塞がってしまい、固定1画面では避け切れなくなる。
// ⚠出すのは**右からだけ**。左は扉が降りて地形の壁になっているので、左に湧かせると壁の外で足踏みする。
// ⚠**ゼロにはしない**（✅ユーザー指定）: 闘技場ではカメラが止まっていて距離が増えないため、
//   ぴよフラッシュのゲージ加算源が**撃破(+4%/体)しか無い**（距離加算 0.08%/m はここでは効かない）。
//   雑魚が湧かないとボス戦中に必殺技を貯める手段が消える。
function ugSpawnArenaMobs(ch, b) {
    var ug = undergroundState;
    // 演出中と大詠唱中は湧かせない（暗転中に見えない敵が歩いてくるのは理不尽）
    if (b.mode === 'awaken' || b.mode === 'dark' || b.mode === 'darkTele') return;
    if (ug.mobTimer > 0) { ug.mobTimer--; return; }
    var alive = 0, i;
    for (i = 0; i < enemies.length; i++) if (enemies[i].arenaMob) alive++;
    var enc = bossEncounter();
    var cap = Math.min(4, 1 + enc);                    // 1巡目=2体まで（2巡目以降で増える＝周回強化のひとつ）
    if (alive >= cap) { ug.mobTimer = 60; return; }
    // ⚠キーは **kind**（ugMakeEnemy は pe.kind を見る）。'k' と書くと undefined → default で null が返り、
    //   エラーも出ないまま**一体も湧かない**（1.570の実測で発覚）。
    var e = ugMakeEnemy({
        x: gameState.camera.x + GAME_WIDTH + 24,
        bottom: ch.topY + 12 * UG_TILE,
        kind: (Math.random() < 0.35) ? 'm' : 'c'
    });
    if (!e) return;
    e.arenaMob = true;
    enemies.push(e);
    // 間隔は約6〜8秒（1.570でユーザー指定により約2倍に薄めた）。⚠ゲージは撃破+4%＝25体で満タンなので、
    //   1回のボス戦（実測107秒）で十数体＝**半分強**貯まる程度。必殺技を撃てる目はあるが連発はできない。
    ug.mobTimer = Math.max(240, Math.round((430 - (enc - 1) * 45) * (0.85 + Math.random() * 0.3)));
}

// HPで3段階（SPEC §7.2）。P1=呪弾のみ／P2=瞬間移動と魔法陣が加わる／P3=分身と大詠唱
function ugPriestessPhase(b) {
    var r = b.hp / b.maxHp;
    return r > 0.6 ? 1 : r > 0.3 ? 2 : 3;
}
function ugPriestessMode(b, mode, frames) { b.mode = mode; b.timer = frames; }

function ugPriestessAI(b) {
    var ph = ugPriestessPhase(b);
    // 周回強化（SPEC §7.2「2巡目以降は増加」）。⚠HPは増やさない＝**2巡目のHP仕様が未決**のため。
    //   代わりに行動サイクルを詰める＝通常ボスと同じ「難度は攻撃パターンで上げる」方針（BOSS_MAX_HP のコメント）。
    var enc = bossEncounter();                                  // R7=1 / R14=2 / R21=3 …
    var mul = (enc >= 4 ? 0.66 : enc >= 3 ? 0.76 : enc >= 2 ? 0.87 : 1) *
              (ph === 3 ? 0.78 : ph === 2 ? 0.89 : 1);
    // ⚠左右の可動域は**画面**から出す（部屋の幅ではない）。camera.x は闘技場では固定なので実質「部屋の壁」。
    var lo = gameState.camera.x + 80, hi = gameState.camera.x + GAME_WIDTH - 80 - b.width;

    b.anim++;
    if (b.hurt > 0) b.hurt--;
    if (b.flash > 0) b.flash--;
    if (b.ghostTimer > 0) b.ghostTimer--;
    if (undergroundState.flash > 0) undergroundState.flash--;
    b.facing = (player.x + player.width / 2 < b.x + b.width / 2) ? 'left' : 'right';
    // 残像（描画用）。⚠先頭が最新。位置だけを持たせる＝当たり判定には一切関与しない
    b.trail.unshift({ x: b.x, y: b.y });
    if (b.trail.length > UG_BOSS_TRAIL) b.trail.length = UG_BOSS_TRAIL;

    // ── フェーズ移行の「解放」演出（1.570）。HP60%/30%を割った瞬間に1回だけ割り込む ──
    // ⚠**この間は無敵ではなく無防備でもない**（exposed=false・stompCdで踏み不可）＝ただの見せ場。
    //   飛んでいる呪弾を消してから入るので、演出中に理不尽な被弾は起きない。
    if (ph > b.phaseSeen && b.mode !== 'awaken') {
        b.phaseSeen = ph;
        b.exposed = false;
        if (b.clones.length) ugEndClones(b);
        bossState.eggs = [];
        undergroundState.sigils.length = 0; undergroundState.dark = null;
        b.stompCd = UG_BOSS_PHASE_TELE;
        undergroundState.flash = 26; undergroundState.flashMax = 26;
        if (typeof screenShake !== 'undefined') { screenShake.intensity = 11; screenShake.timer = 40; }
        if (soundManager) { try { soundManager.playUgAwaken(); } catch (_) {} }
        ugPriestessMode(b, 'awaken', UG_BOSS_PHASE_TELE);
    }

    // ── 高度: 目標へ滑らかに寄せる。⚠浮遊の上下は **b.y に直接入れる**（描画と当たりを絶対にズラさない） ──
    var low = (b.mode === 'cast' || b.mode === 'castTele' || b.mode === 'clone' || b.mode === 'cloneTele');
    b.baseY += ((low ? b.castY : b.hoverY) - b.baseY) * 0.16;
    var still = (b.mode === 'cast' || b.mode === 'clone');       // 硬直中は揺れない＝止まったのが見て分かる
    b.y = b.baseY + (still ? 0 : Math.sin(b.anim * 0.045) * 9);

    // ── 横の漂い（硬直・詠唱・瞬間移動の最中は止まる） ──
    if (b.mode === 'hover' || b.mode === 'curseTele' || b.mode === 'recover') {
        b.x += b.vx * mul;
        if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx); }
        if (b.x > hi) { b.x = hi; b.vx = -Math.abs(b.vx); }
    }
    if (b.clones.length) { for (var ci = 0; ci < b.clones.length; ci++) b.clones[ci].y = b.y; }

    b.timer--;
    switch (b.mode) {

    case 'hover':                       // 次の行動を選ぶ
        if (b.timer > 0) break;
        b.cycle++;
        if (b.cycle % 2 === 0) {
            // 偶数＝踏みチャンス。P3は半分の確率で分身（見分けて本物を踏む窓）に置き換わる
            if (ph === 3 && Math.random() < 0.5) ugPriestessMode(b, 'cloneTele', 26);
            else ugPriestessMode(b, 'castTele', UG_BOSS_CAST_DROP);
        } else {
            var pool = (ph === 1) ? ['curse']
                     : (ph === 2) ? ['curse', 'blink', 'sigil']
                                  : ['curse', 'blink', 'sigil', 'dark', 'spiral'];
            var pick = pool[Math.floor(Math.random() * pool.length)];
            if (pick === 'curse') ugPriestessMode(b, 'curseTele', Math.max(20, Math.round(UG_BOSS_CURSE_TELE * mul)));
            else if (pick === 'blink') ugPriestessMode(b, 'blinkOut', UG_BOSS_BLINK_OUT);
            else if (pick === 'sigil') { ugSpawnSigils(ph === 3 ? 4 : 3); ugPriestessMode(b, 'sigilTele', UG_BOSS_SIGIL_TELE); }
            else if (pick === 'dark') { ugStartDarkChant(); ugPriestessMode(b, 'darkTele', UG_BOSS_DARK_TELE); }
            else {
                // 螺旋弾幕（P3・見た目の山場）。⚠**避けやすさは角度差で担保**＝渦なので必ず隙間が回ってくる。
                b.spiralLeft = UG_BOSS_SPIRAL_N; b.spiralAng = Math.random() * Math.PI * 2;
                ugPriestessMode(b, 'spiralTele', Math.max(24, Math.round(UG_BOSS_CURSE_TELE * mul)));
            }
        }
        break;

    case 'spiralTele':                  // 螺旋の溜め（袖の光が強く回る＝描画側）
        if (b.timer > 0) break;
        ugPriestessMode(b, 'spiral', UG_BOSS_SPIRAL_GAP);
        undergroundState.flash = 14; undergroundState.flashMax = 14;
        break;

    case 'spiral':                      // 2方向へ同時に、角度を回しながら連射＝渦
        if (b.timer > 0) break;
        ugSpawnCurseSpiral(b);
        b.spiralAng += UG_BOSS_SPIRAL_STEP;
        if (--b.spiralLeft > 0) { b.timer = UG_BOSS_SPIRAL_GAP; break; }
        ugPriestessMode(b, 'recover', Math.max(18, Math.round(34 * mul)));
        break;

    case 'awaken':                      // フェーズ移行の解放（見せ場・攻撃はしない）
        if (b.timer === Math.round(UG_BOSS_PHASE_TELE * 0.55)) {
            ugSpawnCurseRing(b, ph === 3 ? 10 : 8);   // 力が弾けて周囲へ散る
            undergroundState.flash = 22; undergroundState.flashMax = 22;
        }
        if (b.timer > 0) break;
        ugPriestessMode(b, 'recover', Math.max(16, Math.round(26 * mul)));
        break;

    case 'curseTele':                   // 呪弾の予告（袖に紫が集まる＝描画側）
        if (b.timer > 0) break;
        // 本数は 3→5→7（1.570で 3/4/5 から増量＝派手さ）。⚠角度差は据え置きなので扇は広がるだけ＝
        //   「隙間を抜けて避ける」設計は変わらない（詰めると避けられなくなるので UG_BOSS_CURSE_STEP は触らない）。
        ugSpawnCurse(b, ph === 1 ? 3 : ph === 2 ? 5 : 7);
        ugPriestessMode(b, 'recover', Math.max(18, Math.round(34 * mul)));
        break;

    case 'blinkOut':                    // 瞬間移動: 消える → 行き先はプレイヤーを挟んだ反対側
        if (b.timer > 0) break;
        b.solid = false;
        b.ghostX = b.x; b.ghostY = b.y; b.ghostTimer = UG_BOSS_BLINK_IN;   // 紫の残光を置いてくる
        b.x = (player.x + player.width / 2 > gameState.camera.x + GAME_WIDTH / 2) ? lo : hi;
        ugPriestessMode(b, 'blinkIn', UG_BOSS_BLINK_IN);
        if (soundManager) { try { soundManager.playUgSigil(); } catch (_) {} }
        break;

    case 'blinkIn':                     // 渦から実体化 → そのまま撃つ（予告は短い）
        if (b.timer > 0) break;
        b.solid = true;
        ugPriestessMode(b, 'curseTele', Math.max(16, Math.round(UG_BOSS_CURSE_TELE * 0.62 * mul)));
        break;

    case 'sigilTele':                   // 魔法陣の予告（床に円）→ 光柱が立つ
        if (b.timer > 0) break;
        for (var si = 0; si < undergroundState.sigils.length; si++) undergroundState.sigils[si].live = 1;
        if (soundManager) { try { soundManager.playUgSigil(); } catch (_) {} }
        if (typeof screenShake !== 'undefined') { screenShake.intensity = 5; screenShake.timer = 12; }
        ugPriestessMode(b, 'sigil', UG_BOSS_SIGIL_ACTIVE);
        break;

    case 'sigil':
        if (b.timer > 0) break;
        undergroundState.sigils.length = 0;
        ugPriestessMode(b, 'recover', Math.max(18, Math.round(30 * mul)));
        break;

    case 'darkTele':                    // 大詠唱: 暗転していく（安全地帯はもう光っている）
        if (b.timer > 0) break;
        ugPriestessMode(b, 'dark', UG_BOSS_DARK_HOLD);
        break;

    case 'dark':
        if (b.timer > 0) break;
        ugResolveDarkChant();           // ⚠判定は**終わった瞬間に1回だけ**（暗い間ずっと判定すると理不尽）
        ugPriestessMode(b, 'recover', Math.max(20, Math.round(36 * mul)));
        break;

    case 'castTele':                    // 詠唱: 高度を下げる（この間はまだ踏めない＝降りきってから）
        if (b.timer > 0) break;
        b.exposed = true;
        if (soundManager) { try { soundManager.playSummon(); } catch (_) {} }
        ugPriestessMode(b, 'cast', Math.max(48, Math.round(UG_BOSS_CAST_WINDOW * mul)));
        break;

    case 'cast':                        // 硬直＝踏みチャンス（踏まれたら ugPriestessCollision が counter へ飛ばす）
        if (b.timer > 0) break;
        b.exposed = false;
        ugPriestessMode(b, 'recover', UG_BOSS_RISE);
        break;

    case 'cloneTele':                   // 分身の予告（紫が3つに割れる）
        if (b.timer > 0) break;
        ugStartClones(b);
        break;

    case 'clone':                       // ⚠**本物だけが撃つ**＝これが見分ける唯一の手がかり（SPEC §7.2）
        if (--b.cloneFire <= 0) { b.cloneFire = UG_BOSS_CLONE_FIRE; ugSpawnCurse(b, 2); }
        if (b.timer > 0) break;
        ugEndClones(b);
        ugPriestessMode(b, 'recover', Math.max(20, Math.round(30 * mul)));
        break;

    case 'counter':                     // ⚠踏まれた直後の反撃（必須・SPEC §7.2「カカシの教訓」）
        if (b.timer > 0) break;         //   頭上に居座って踏み続けるだけで勝てないようにする
        ugSpawnCurseRing(b, 6);
        ugPriestessMode(b, 'recover', Math.max(20, Math.round(30 * mul)));
        break;

    default:                            // 'recover' もここ（袖を戻して浮遊高度へ）
        if (b.timer > 0) break;
        ugPriestessMode(b, 'hover', Math.max(16, Math.round((ph === 3 ? 26 : ph === 2 ? 34 : 44) * mul)));
        break;
    }
}

// 呪弾＝扇状の魔法弾（SPEC §7.2）。⚠**隙間を抜けて避ける**設計なので角度差を詰めない（UG_BOSS_CURSE_STEP）。
// bossState.eggs を流用＝シールドで消える／被弾する／画面外で消える、が全部そのまま効く。
function ugSpawnCurse(b, n) {
    var oy = b.y + b.height * UG_BOSS_ORB_DY;          // 絵の中の「両手の間の玉」の高さ（実測値）
    var ox = b.x + b.width / 2;
    var base = Math.atan2(player.y + player.height / 2 - oy, player.x + player.width / 2 - ox);
    for (var i = 0; i < n; i++) {
        var a = base + (i - (n - 1) / 2) * UG_BOSS_CURSE_STEP;
        ugPushCurse(ox, oy, a, UG_BOSS_CURSE_SPD);
    }
    b.flash = 14;
    if (soundManager) { try { soundManager.playUgCurse(); } catch (_) {} }
}

// 呪弾1発。⚠isCurse は**描画専用のフラグ**（drawEggProjectiles が尾を引く彗星として描く）。
//   移動/被弾/シールド/消滅は isFlame の既存経路のまま＝挙動は増やさず見た目だけ派手にする。
function ugPushCurse(ox, oy, ang, spd) {
    bossState.eggs.push({
        x: ox - 8, y: oy - 8, width: 16, height: 16,
        velX: Math.cos(ang) * spd, velY: Math.sin(ang) * spd,
        grav: 0,                                       // 呪弾はまっすぐ飛ぶ（卵弾の微重力は使わない）
        timer: 0, isFlame: true, isCurse: true, spin: ang
    });
}

// 螺旋弾幕（P3・1.570）。2方向へ同時に撃ち、1発ごとに角度を回す＝渦を巻く。
// ⚠見た目は最大級に派手だが、**必ず隙間が回ってくる**ので立ち位置を変えれば抜けられる。
//   角度差(UG_BOSS_SPIRAL_STEP=0.55rad≒31°)は扇撃ち(0.40rad)より広い＝実は1発あたりは避けやすい。
function ugSpawnCurseSpiral(b) {
    var oy = b.y + b.height * UG_BOSS_ORB_DY, ox = b.x + b.width / 2;
    ugPushCurse(ox, oy, b.spiralAng, UG_BOSS_CURSE_SPD * 0.92);
    ugPushCurse(ox, oy, b.spiralAng + Math.PI, UG_BOSS_CURSE_SPD * 0.92);
    b.flash = 10;
    if (soundManager) { try { soundManager.playUgCurse(); } catch (_) {} }
}

// 踏まれた直後の反撃＝自分を中心に全方位へ。⚠真下にも飛ぶので「踏んだ位置に留まる」が一番危ない。
function ugSpawnCurseRing(b, n) {
    var ox = b.x + b.width / 2, oy = b.y + b.height * 0.5;
    for (var i = 0; i < n; i++) ugPushCurse(ox, oy, (Math.PI * 2 / n) * i + 0.3, UG_BOSS_CURSE_SPD * 0.85);
    b.flash = 18;
    undergroundState.flash = 16; undergroundState.flashMax = 16;
    if (typeof screenShake !== 'undefined') { screenShake.intensity = 6; screenShake.timer = 14; }
    if (soundManager) { try { soundManager.playUgCurse(); } catch (_) {} }
}

// 魔法陣＝床に円の予告 → 光柱（SPEC §7.2「カカシの帯予告と同思想」）。
// ⚠必ず**円と円の間に立てる幅**を残すこと。画面を等分して置けば、間隔(≒画面幅/n)は必ず直径より広い。
function ugSpawnSigils(n) {
    var ug = undergroundState;
    ug.sigils.length = 0;
    var seg = GAME_WIDTH / n;
    for (var i = 0; i < n; i++) {
        ug.sigils.push({
            x: gameState.camera.x + seg * (i + 0.5) + (Math.random() - 0.5) * (seg * 0.3),
            timer: 0, live: 0
        });
    }
}
function ugUpdateSigils() {
    var ug = undergroundState, i, s;
    for (i = 0; i < ug.sigils.length; i++) {
        s = ug.sigils[i];
        s.timer++;
        if (!s.live) continue;
        // 光柱は床から天井まで＝高さでは避けられない。横に出るしかない（予告54フレーム＝162px 歩ける）
        // ⚠横の余裕はトゲ/炎と同じ UG_HAZARD_SHRINK_X ぶん削る＝地底の他の当たりと寛容さを揃える。
        // ⚠シールドで防げる（トゲ等の「地形の罠」ではなく**ボスの攻撃**なので、呪弾=updateEggs と同じ扱いにする）。
        var pcx = player.x + player.width / 2;
        if (Math.abs(pcx - s.x) < UG_BOSS_SIGIL_R + player.width / 2 - UG_HAZARD_SHRINK_X &&
            !isPlayerProtected()) takeDamage();
    }
}

// 大詠唱＝画面が暗転し、安全地帯が1箇所だけ光る（SPEC §7.2・フクロウの暗転と同じ思想）。
// ⚠安全地帯は**必ず歩いて届く距離**に置く: 3.0px/f × (予告60+保持96=156フレーム) = 468px 歩ける。
//   プレイヤーから 150〜380px 離れた位置に置く（最大でも 380-100=280px の移動で入れる）。
function ugStartDarkChant() {
    var pcx = player.x + player.width / 2;
    var lo = gameState.camera.x + UG_BOSS_SAFE_W / 2 + 20;
    var hi = gameState.camera.x + GAME_WIDTH - UG_BOSS_SAFE_W / 2 - 20;
    var dist = 150 + Math.random() * 230;
    var sx = (pcx > gameState.camera.x + GAME_WIDTH / 2) ? pcx - dist : pcx + dist;
    if (sx < lo) sx = lo; if (sx > hi) sx = hi;
    undergroundState.dark = { timer: 0, safeX: sx, hit: false };
    // ⚠暗転する前に**雑魚と飛んでいる呪弾を巻き込んで消す**（1.570／弾は1.571で追加）。
    //   暗幕で見えない敵や弾に当たるのは理不尽（雑魚だけ消して弾を残していたのは片手落ちだった）。
    //   「巫女の力が闘技場ごと薙ぎ払う」という絵にもなる（＝派手さと公平さが両立する）。
    bossState.eggs = [];
    for (var qi = enemies.length - 1; qi >= 0; qi--) {
        if (!enemies[qi].arenaMob) continue;
        spawnExplosionEffect(enemies[qi].x + enemies[qi].width / 2, enemies[qi].y + enemies[qi].height / 2);
        enemies.splice(qi, 1);
    }
    for (var qf = flyingEnemies.length - 1; qf >= 0; qf--) {
        if (!flyingEnemies[qf].arenaMob) continue;
        spawnExplosionEffect(flyingEnemies[qf].x + flyingEnemies[qf].width / 2, flyingEnemies[qf].y + flyingEnemies[qf].height / 2);
        flyingEnemies.splice(qf, 1);
    }
    if (soundManager) { try { soundManager.playUgDark(); } catch (_) {} }
}
function ugResolveDarkChant() {
    var d = undergroundState.dark;
    if (d) {
        var pcx = player.x + player.width / 2;
        // ⚠シールドで防げる（呪弾/光柱と同じ＝ボスの攻撃はすべてシールドが効く、で統一）
        if (Math.abs(pcx - d.safeX) > UG_BOSS_SAFE_W / 2 && !isPlayerProtected()) takeDamage();
        if (typeof screenShake !== 'undefined') { screenShake.intensity = 9; screenShake.timer = 20; }
        if (soundManager) { try { soundManager.playUgSigil(); } catch (_) {} }
    }
    undergroundState.dark = null;
}

// 分身（P3）＝3体に分かれ、本物だけが撃つ。⚠にせものは**触れても踏んでも痛くない**（外しても損しない）。
function ugStartClones(b) {
    var seg = GAME_WIDTH / 3, slots = [], i;
    for (i = 0; i < 3; i++) slots.push(gameState.camera.x + seg * (i + 0.5) - b.width / 2);
    var real = Math.floor(Math.random() * 3);
    b.x = slots[real];
    b.clones.length = 0;
    for (i = 0; i < 3; i++) if (i !== real) b.clones.push({ x: slots[i], y: b.y });
    b.exposed = true;
    b.cloneFire = Math.round(UG_BOSS_CLONE_FIRE * 0.6);
    ugPriestessMode(b, 'clone', UG_BOSS_CLONE_TIME);
    if (soundManager) { try { soundManager.playSummon(); } catch (_) {} }
}
function ugEndClones(b) {
    for (var i = 0; i < b.clones.length; i++) spawnExplosionEffect(b.clones[i].x + b.width / 2, b.clones[i].y + 30);
    b.clones.length = 0;
    b.exposed = false;
}

function ugPriestessCollision(b) {
    if (b.stompCd > 0) b.stompCd--;
    if (!b.solid || b.hp <= 0) return;

    // ── にせもの: 踏むと弾けて消えるだけ。ダメージのやり取りは一切ない ──
    for (var i = b.clones.length - 1; i >= 0; i--) {
        var c = b.clones[i];
        var cbox = { x: c.x, y: c.y, width: b.width, height: b.height };
        if (player.velY > 0 && aabbShrink(player, cbox, 12, 14) &&
            player.y + player.height <= c.y + b.height * 0.6) {
            b.clones.splice(i, 1);
            player.velY = JUMP_FORCE / 2;
            spawnExplosionEffect(c.x + b.width / 2, c.y + 30);
            if (soundManager) soundManager.playProtect();   // 「キン」＝手応えが無い音（装甲弾きと同じ音）
        }
    }

    // ── 本体。⚠踏めるのは exposed（＝詠唱/分身で降りている間）だけ ──
    if (b.stompCd <= 0 && b.exposed && player.velY > 0 &&
        aabbShrink(player, b, 12, 14) && player.y + player.height <= b.y + b.height * 0.6) {
        b.hp -= (UG_BOSS_STOMP_DMG + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, b.y);
        b.hurt = 16; b.stompCd = UG_BOSS_STOMP_CD;
        player.velY = JUMP_FORCE / 2;
        endSamuraiDiveOnBossStomp();
        spawnExplosionEffect(player.x + player.width / 2, b.y + 24);
        gainScore(500);                                     // 通常ボスの踏みと同額（撃破数には入れない）
        if (soundManager) soundManager.playKill();
        if (b.hp > 0) {
            // ⚠踏んだら**必ず**反撃へ移す。ここを外すと頭の上に居座って踏み続けるだけで勝ててしまう（1.535の反省）
            b.exposed = false;
            if (b.clones.length) ugEndClones(b);
            ugPriestessMode(b, 'counter', UG_BOSS_COUNTER_TELE);
        }
        return;
    }
    // 触れて被弾するのは**浮遊高度に戻りきっている時だけ**。
    // ⚠**`!b.exposed` だけで判定してはいけない**（1.571で修正）。高度の更新は switch より前にあり、
    //   `low`（＝降りるモードか）は**更新前の mode** で評価される。そのため:
    //     ①`case 'cast'` が exposed を false にするフレームの巫女は**まだ castY(1034) に静止したまま**で、
    //       同じフレームの当たり判定が通る＝踏み損ねて真下に立っているだけで**予告ゼロの確定被弾**。
    //       分身の終了（ugEndClones）も同じ。5秒間「触って本物を探せ」と言いながら終了フレームで殴っていた。
    //     ②降下(castTele)の後半も exposed はまだ false なので、踏みに行くと降りてくる巫女に当たっていた。
    //   ＝「踏めた時だけ安全・踏み損ねると必ず殴られる」という、設計意図と正反対の挙動になっていた。
    // ⚠高さで見れば①②の両方が一度に閉じる。浮遊高度(916±9)なら true＝**跳び込みは従来どおり痛い**。
    //   +80 の根拠: 立位プレイヤー(y=1132)と箱が重なり始めるのは b.y>1014 なので、それより上の 996 で切る。
    var settled = (b.y <= b.hoverY + 80);
    if (!b.exposed && settled && b.stompCd <= 0 && !isPlayerProtected() && aabbShrink(player, b, 18, 14)) takeDamage();
}

function ugPriestessDefeated(b) {
    var ug = undergroundState;
    b.hp = 0;
    b.exposed = false; b.solid = false;
    b.clones.length = 0;
    ug.sigils.length = 0; ug.dark = null;
    bossState.eggs = [];                                    // 残った呪弾で勝利中に被弾させない
    // ⚠**乱入していた雑魚も消すこと**（1.571）。撃破演出は180フレーム（3秒）あり、その間プレイヤーは
    //   操作できるが「勝った」と思って気を抜く。残った雑魚に当たってゲームオーバーになるのは理不尽。
    //   巫女の力が解けて道連れに消える、という絵にもなる。
    for (var qi = enemies.length - 1; qi >= 0; qi--) {
        if (!enemies[qi].arenaMob) continue;
        spawnExplosionEffect(enemies[qi].x + enemies[qi].width / 2, enemies[qi].y + enemies[qi].height / 2);
        enemies.splice(qi, 1);
    }
    for (var qf = flyingEnemies.length - 1; qf >= 0; qf--) {
        if (!flyingEnemies[qf].arenaMob) continue;
        spawnExplosionEffect(flyingEnemies[qf].x + flyingEnemies[qf].width / 2, flyingEnemies[qf].y + flyingEnemies[qf].height / 2);
        flyingEnemies.splice(qf, 1);
    }
    // ⚠画面の閃光も消す。⚠**減算しているのは ugPriestessAI だけ**で、フェーズ5ではAIが回らないので、
    //   閃光の最中に倒すと紫の膜が張ったまま撃破演出3秒が終わるまで固まる。
    ug.flash = 0;
    ug.bossPhase = 5; ug.bossTimer = 0;
    if (typeof screenShake !== 'undefined') { screenShake.intensity = 12; screenShake.timer = 30; }
    if (soundManager) { try { soundManager.stopAllBGM(); soundManager.playBossFanfare(); } catch (_) {} }
}

// 撃破報酬（SPEC §8・✅ユーザー決定）＝スコア10,000（通常ボスの倍額）＋コイン多め＋**ゴールデンエッグ1個（毎回）**。
// ⚠エッグは1.565まで「仮ボスは10回踏めば倒せる＝希少性が壊れる」ため保留していた。本実装で解禁。
function ugGrantPriestessRewards() {
    var ug = undergroundState;
    var b = ug.boss;
    var ch = ug.rooms[ug.rooms.length - 1];
    var cx = b ? b.x + b.width / 2 : player.x, cy = b ? b.y + 20 : player.y - 40;
    gainScore(UG_BOSS_SCORE);
    // ⚠**コインは床の近くに撒くこと**（1.571）。ボスのワールドYを基準にすると、浮遊高度(上端916)で
    //   倒した時にコインが y=876〜996 に散り、**跳んでも届かない高さ**になる（立位1132からの
    //   最高到達で頭が957・足元1005まで。876〜925のぶんは取れない）。20回踏んで得た報酬を
    //   取り逃がさせないため、床から少し上に固定する。⚠横方向はボス中心のままでよい。
    var floorY = ch ? (ch.topY + 12 * UG_TILE) : (cy + 200);
    for (var ci = 0; ci < UG_BOSS_COINS; ci++) {
        coins.push({ x: cx + (Math.random() - 0.5) * 260, y: floorY - 52 - Math.random() * 96,
                     width: 32, height: 32, collected: false, animFrame: Math.random() * 20 });
    }
    gameState.enemyKills++;
    gameState.bossKills++;
    zukanAddKill('boss:priestess');                         // ずかん: 撃破時のみ登録（1.474の統一ルール）
    floatEffects.push({ type: 'boss_defeated_text', worldX: cx, worldY: cy, timer: 0, duration: 180, offsetY: 0 });
    floatEffects.push({ type: 'score_text', worldX: cx, worldY: cy - 40, timer: 0, duration: 90, offsetY: 0, score: UG_BOSS_SCORE });
    // ゴールデンエッグ1個。⚠既存の取得経路と同じ関数を通す（図鑑登録・保存がここに集約されている）
    if (typeof collectGoldenEgg === 'function') collectGoldenEgg(false);
    if (typeof showRewardToast === 'function') {
        showRewardToast('<img src="images/item_golden_egg.png" width="22" height="22" style="image-rendering:pixelated; vertical-align:middle;"> ×1 ' +
                        escapeHtml(t('ug_boss_egg_toast')), 'linear-gradient(180deg,#ffe07a,#ffb400)', '#5a3d00');
    }
}

// 毎フレームの状態更新。戻り値 true = 崩壊中（＝当たり判定を消す＝骨の山は素通りできる）
function ugUpdateSkully(e) {
    if (!e.collapsed) return false;
    e.velX = 0;                                   // 骨の山は動かない（重力は updateEnemyPhysics に任せる）
    e.reviveTimer--;
    if (e.reviveTimer <= 0) {
        e.collapsed = false;
        e.velX = e.savedVelX || -0.9;
        if (soundManager) { try { soundManager.playJump(); } catch (_) {} }
    }
    return true;
}

// 地底から地上へ復帰。camera.x はそのまま（距離を巻き戻さない）＝地上地形をここから作り直す。
function exitUnderground() {
    if (!undergroundState.active) return;
    undergroundState.active = false;
    undergroundState.cleared = true;
    gameState.gameSpeed = undergroundState.savedGameSpeed || gameState.gameSpeed;
    // 地上の地形をカメラ位置から作り直す（manageTerrain のガードが外れるので以後は通常生成）
    terrain.length = 0; platforms.length = 0;
    var startX = gameState.camera.x - 200;
    for (var gx = startX; gx < gameState.camera.x + GAME_WIDTH + 400; gx += 100) {
        terrain.push({ x: gx, y: GROUND_Y, width: 100, height: 130, type: 'ground' });
    }
    gameState.lastTerrainX = gameState.camera.x + GAME_WIDTH + 400;
    gameState.lastHoleX = null;
    // ⚠縦カメラを必ず戻す（1.563）。地上は camera.y=0 が前提（背景/地形/HUDが全部その想定で描かれている）
    undergroundState.camY = 0; gameState.camera.y = 0;
    undergroundState.lava.length = 0; undergroundState.spikes.length = 0; undergroundState.decor.length = 0;
    undergroundState.fireBars.length = 0; undergroundState.fireballs.length = 0;
    undergroundState.rooms.length = 0; undergroundState.pendingEnemies = [];
    undergroundState.shop = null; undergroundState.idol = null; undergroundState.braziers.length = 0;
    undergroundState.bossPhase = 0; undergroundState.bossTimer = 0; undergroundState.boss = null;
    // 闇の巫女の攻撃の後始末（1.570）。⚠**呪弾は bossState.eggs を借りているので必ずここで空にする**。
    //   残すと地上へ戻った直後に画面外から飛んできて当たる（弾は世界座標のまま生き続けるため）。
    undergroundState.sigils.length = 0; undergroundState.dark = null;
    undergroundState.flash = 0; undergroundState.mobTimer = 0;
    bossState.eggs = [];
    // ⚠闘技場に湧かせた雑魚を残さない（地上へ持ち帰ると、床の高さが違うので宙に浮いたまま流れてくる）
    enemies.length = 0; flyingEnemies.length = 0;
    player.y = GROUND_Y - player.height; player.velY = 0; player.onGround = true;
    // ⚠ステージ進行のグリッドを引き直す（1.553・ユーザー指定「地底のあとも草原→砂漠→雪山→夜→ボス」）。
    //   地底は2,400mの倍数でない量(800m)を足すので、そのままだと以降ずっとバイオームとボスがずれる
    //   （実測: R8が3,982m＝砂漠→雪山→夜→草原→砂漠→雪山→夜 になっていた）。
    //   ここで「地底ラウンドのボス距離＝本来次のラウンドが始まる位置」と実際の退場位置の差を補正に入れると、
    //   バイオームもボス距離も同じ量だけずれる＝退場地点がちょうど草原の頭になり、次のボスは2,400m先になる。
    //   ⚠gameRound++ より前に計算すること（gameRound はまだ地底ラウンドの番号）。周回しても自動で累積する。
    // ⚠実際の退場距離ではなく「設計値どおりの退場位置」から計算する（1.555・ユーザー指定「mの端数を出さない」）。
    //   全ボスは「WARNING演出(120フレーム)の間もスクロールが続く」ため、アリーナが固定される距離が
    //   常にトリガー距離＋18m になっている（120×1.5px/f÷10）。通常ラウンドは次のボスが絶対距離で決まるので
    //   累積せず表に出ないが、実測値でズレ補正を作ると**この18mが以降のボス距離とバイオーム境界に永久に残る**。
    //   そこで「カカシのボス距離 ＋ 地底の設計加算量」を退場位置とみなして補正を作る＝補正値が必ずキリの良い数になる。
    //   プレイヤーが実際に稼いだ18mは距離としてそのまま残る（損得なし）。境界だけが整数に揃う。
    var ugAddM = UG_TRAVEL_PX * UG_DIST_SCALE / 10;                  // 地底の設計加算量(m)＝800
    var cleanExitM = bossDistanceFor(gameRound - 1) + ugAddM;        // カカシのボス距離（補正込み）＋800
    gameState.stageShiftM = cleanExitM - bossDistanceBaseFor(gameRound);
    // ラウンド前進（通常ボス撃破と同じ扱い）。⚠P3で「闇の巫女」を実装したら、撃破時にこの前進を移す。
    gameRound++;
    undergroundState.visited = false; // 次の地底ラウンド(R14…)のために解除
    bossState.bossTriggered = false;
    // ⚠ショップの「1ラウンド1回」フラグもここで戻すこと（1.573で修正）。
    //   地底の老婆の店も地上と同じ openStageShop() を通って shopState.visited=true を立てるが、
    //   ラウンド前進をするのが通常ボスの撃破処理(下の updateBoss case 5)と**この2箇所**あるのに、
    //   こちらだけ戻し忘れていた＝老婆の店に入ると R8/R15/R22 の地上おみせが最初から訪問済み扱いになり、
    //   建物は建つのに「CLOSED」で入店も貯金もできなくなっていた（次のボスを倒すまで直らない）。
    //   ⚠この4行は updateBoss の case 5 と対で維持すること（片方だけ足すと同じバグが再発する）。
    shopState.visited = false;
    shopState.deposited = false;
    shopState.buildingPlaced = false;
    shopState.buildingX = 0;
    // pipeRoomState は checkPipeTrigger が targetRound !== gameRound で毎ラウンド引き直す＝ここでは不要。
    try { playStageBGM(); } catch (_) {}
}

// 地底の毎フレーム更新（通常の updatePlayer 等はそのまま走る。ここは地底固有の処理だけ）
function updateUnderground() {
    // ── 入場土管のせり上がり（1.554）。⚠地上に居る間＝地底に入る前に進む演出なので active 判定より前に置く ──
    // 当たり判定(platform.y)も一緒に動かす＝見た目とズレない。せり上がり切るまでは入場もヒント表示もしない。
    if (undergroundState.pipePlaced && undergroundState.pipeRise < UG_PIPE_RISE_FRAMES) {
        undergroundState.pipeRise += (typeof frameSteps === 'number' && frameSteps > 0) ? 1 : 1;
        var rp = Math.min(1, undergroundState.pipeRise / UG_PIPE_RISE_FRAMES);
        // ⚠3秒(1.557)になったのでイージングを変更。cubic ease-out だと最初の0.5秒で出切って残り2.5秒が
        //   這うだけになる。ease-in-out sine ＝「重いものがゆっくり動き出し→中盤で一番速く→静かに収まる」
        //   ＝地響きが3秒鳴り続ける演出と動きが合う。
        var eased = 0.5 - 0.5 * Math.cos(Math.PI * rp);
        for (var pi = 0; pi < platforms.length; pi++) {
            // ⚠+UG_PIPE_MOUTH_RY は当たり判定を口の楕円の中心に置くぶん（1.559）。eased=0で完全に地中、
            //   eased=1で上面が GROUND_Y - UG_PIPE_H + UG_PIPE_MOUTH_RY ＝口の中心に一致する。
            if (platforms[pi].ugEntrance) { platforms[pi].y = GROUND_Y + UG_PIPE_MOUTH_RY - UG_PIPE_H * eased; break; }
        }
        // 地響き（既存の screenShake を毎フレーム焼き直して継続させる）。
        // ⚠3秒間ずっと同じ強さで揺らすと目が疲れるので、山なり(sin)にして中盤が一番揺れる＝動きと一致させる。
        if (typeof screenShake !== 'undefined') {
            screenShake.intensity = 4.5 * Math.sin(Math.PI * rp);
            screenShake.timer = 10;
        }
        // ⚠せり上がり切ったら地響きSEを止めて無音にする（1.556・ユーザー指定）。
        //   音源(pipe_rise.mp3)は10.8秒あるので、止めないと土管が出切った後も鳴り続ける。
        if (undergroundState.pipeRise >= UG_PIPE_RISE_FRAMES && soundManager) {
            try { soundManager.stopRumble(); } catch (_) {}
        }
    }
    if (!undergroundState.active) return;
    // 落下導入中は入力ロック＋無敵（着地したら解除）
    if (undergroundState.introTimer > 0) {
        undergroundState.introTimer--;
        gameState.isInvincible = true;
        gameState.input.left = false; gameState.input.right = false;
        gameState.input.jump = false; gameState.input.jumpPressed = false;
        if (player.onGround) undergroundState.introTimer = 0;
    }
    // ボス闘技場（1.564）。⚠移行演出が始まったら**通常の追従カメラは止める**（演出側がカメラを寄せる）。
    updateUgBoss();
    if (undergroundState.bossPhase > 0) {
        ugUpdateCameraY();
        // 闘技場は固定1画面＝左右クランプだけ効かせる（カメラは動かないので実質「部屋の壁」になる）
        var bl = gameState.camera.x + UG_PLAYER_MARGIN;
        if (player.x < bl) { player.x = bl; if (player.velX < 0) player.velX = 0; }
        var br = gameState.camera.x + GAME_WIDTH - UG_PLAYER_MARGIN - player.width;
        if (player.x > br) { player.x = br; if (player.velX > 0) player.velX = 0; }
        return;
    }
    // 追従カメラ（左壁クランプ＝単調増加のみ。巻き戻すと距離が減りランキングの単調性が壊れる）
    var target = player.x - GAME_WIDTH * UG_CAM_LEAD;
    if (target > undergroundState.camMaxX) target = undergroundState.camMaxX; // ⚠画面幅に依存しない終端
    // ⚠距離加算の速さに上限をかける（1.542／1.544で歩行と一本化）: 地底は自分の足で進むため上限が要る。
    //   MOVE_SPEED を基準にするのが肝＝**地底の歩行速度と完全に一致**するので、プレイヤーが画面右端の
    //   クランプに貼り付かない（貼り付くと velX=0 されて前方へジャンプできなくなる）。
    //   MOVE_SPEED(6) === BASE_SCROLL_SPEED*5.0(6)＝地上のスクロール上限なので、0.5 なら地上の半分＝18m/秒。
    //   はやあし(1.3倍)は speedMul 側で地底無効にしてあるので、ここには掛からない。
    var maxAdvance = MOVE_SPEED * UG_SPEED_RATE;
    var capped = gameState.camera.x + maxAdvance;
    if (target > capped) target = capped;
    // 「見かけ上のm」の圧縮（1.548）: カメラが進んだ量の (1-UG_DIST_SCALE) 倍を ugDistOffset に積む。
    // ⚠カメラ自体は従来どおり満額進める＝描画・当たり判定・踏破時間・レベル長は一切変わらない。
    //   距離の式が (camera.x - ugDistOffset) を見るので、**距離表示の増え方だけ**が UG_DIST_SCALE 倍になる。
    if (target > gameState.camera.x) {
        gameState.ugDistOffset += (target - gameState.camera.x) * (1 - UG_DIST_SCALE);
        gameState.camera.x = target;
    }
    // プレイヤーは画面左端より左へ戻れない（SMB式）
    var leftLimit = gameState.camera.x + UG_PLAYER_MARGIN;
    if (player.x < leftLimit) { player.x = leftLimit; if (player.velX < 0) player.velX = 0; }
    // カメラ上限より速く走った場合は画面右端で頭打ち（カメラを置き去りにして画面外へ出るのを防ぐ）
    var rightLimit = gameState.camera.x + GAME_WIDTH - UG_PLAYER_MARGIN - player.width;
    if (player.x > rightLimit) { player.x = rightLimit; if (player.velX > 0) player.velX = 0; }
    // 縦カメラ＋敵の遅延スポーン（1.563）
    ugUpdateCameraY();
    ugSpawnPendingEnemies();
    // 直近の安全な足場をチェックポイントとして記録（落下復帰を溶岩の上に戻さない）
    // ⚠画面内で接地している時だけ記録する。落下中のフレームを拾うと、復帰先が画面外になり無限に落ち続ける。
    //   縦カメラが入った(1.563)ので、判定は**画面座標ではなくカメラ相対**にすること
    //   （旧 player.y < GAME_HEIGHT のままだと、下の部屋へ降りた時点で記録が止まる）。
    // ⚠さらに「動かない足場の上」に限定する。動く床の上を記録すると、復帰先に床が無くて落ち→また復帰、
    //   の無限ループでライフを削り切ってしまう。
    if (player.onGround && undergroundState.introTimer <= 0 &&
        player.y < gameState.camera.y + GAME_HEIGHT && ugOnStaticGround()) {
        undergroundState.checkpointX = player.x;
        undergroundState.checkpointY = player.y;
    }
    // ⚠1.563までは「カメラが終端に着いたら即退場」だったが、1.564で**ボス闘技場**を挟んだので撤去した。
    //   退場は updateUgBoss のフェーズ5（撃破演出の終わり）からのみ呼ばれる。
    //   カメラ終端(camMaxX)＝闘技場の左端なので、800mの加算は闘技場に入る時点で必ず完了している。
}

// ─── チュートリアル「はじまりの地」（Phase3.5） ───
// 通常ランと同じエンジンで動く台本つき固定面。tutorialState.active 中は
// ランダム生成（地形/敵/コイン/アイテム/足場）とボス/土管/ショップの自動配置を止め、ここで確定配置する。
function setupTutorialStage() {
    tutorialState.active = true;
    tutorialState.stepIdx = 0;
    tutorialState.hintKey = '';
    tutorialState.hintTimer = 0;
    tutorialState.slowTimer = 0;
    tutorialState.bossGuided = false;
    tutorialState.skipArmed = 0;
    tutorialState.gate = '';
    tutorialState.gateKills = 0;
    // 舞台は専用バイオーム「はじまりの地」（街・index4）。遷移演出なしで最初から適用
    biomeState.current = 4;
    biomeState.previous = 4;
    biomeState.transition = 0;
    if (typeof bgCache !== 'undefined') bgCache = null; // 空グラデのキャッシュを街の空で作り直させる
    // 固定地形: 全面平地＋練習用の穴1つ（150m・幅90px）。resetGameが敷いた初期地形を丸ごと置き換える
    terrain.length = 0;
    var segs = [[0, 1500], [1590, 9400]]; // px（1m=10px）
    for (var si = 0; si < segs.length; si++) {
        for (var gx = segs[si][0]; gx < segs[si][1]; gx += 100) {
            terrain.push({ x: gx, y: GROUND_Y, width: Math.min(100, segs[si][1] - gx), height: 130, type: 'ground' });
        }
    }
    terrain.push({ x: 1500, y: GROUND_Y, width: 0, height: 0, type: 'hole' }); // 穴マーカー（generateTerrainと同形式）
    gameState.lastTerrainX = 9400; // ランダム地形生成は再開させない（manageTerrainもガード済み）
    gameState.lastHoleX = null;
    // コイン列（340m〜・走って取れる高さ）
    for (var ci = 0; ci < 6; ci++) {
        coins.push({ x: 3400 + ci * 44, y: GROUND_Y - 90, width: 32, height: 32, collected: false, animFrame: ci * 3 });
    }
    // 土管（530m・checkPipeTriggerはガード＝ここで確定配置）
    pipeRoomState.targetRound = gameRound;
    pipeRoomState.placed = true;
    pipeRoomState.visited = false;
    pipeRoomState.targetDist = 530;
    pipeRoomState.x = 5300;
    platforms.push({ x: 5300, y: GROUND_Y - PIPE_H, width: PIPE_W, height: PIPE_H, type: 'pipe' });
    // おみせ（640m・checkShopTriggerの自動配置はガード＝ここで確定配置）
    shopState.buildingPlaced = true;
    shopState.buildingX = 6400;
}

// 台本用のひよこ（ゆっくり・平地歩き）
function tutorialChick() {
    return { x: gameState.camera.x + GAME_WIDTH + 60, y: GROUND_Y - 38, width: 42, height: 38,
             velX: -0.6, velY: 0, onGround: false, type: 'chick', animFrame: 0, walkSprite: 'chick_walk' };
}

// テロップが出る前にプレイヤーが自力で課題を済ませてしまったか（1.446）。
// クランプ緩和(656px)で少し先の課題に先取りで着手できるようになったため、状態が残る課題は事前クリアを検知して褒める。
// stompはゲート発火と同時に練習ひよこが湧く＝事前クリア不可のためfalse。
function tutorialGatePreCleared(g) {
    if (g === 'stock') return (gameState.puShield > 0) ||
        !stockState.items.some(function(it) { return it.id === 'barrier'; }); // バリア使用済み or 持っていない
    if (g === 'pipe')  return pipeRoomState.visited || pipeRoomState.active || pipeRoomState.anim !== 'none'; // 既に土管へ
    if (g === 'shop')  return shopState.visited || shopState.active; // 既に入店済み
    if (g === 'jump') { // 練習用の穴を既に跳び越えている（穴の右端がプレイヤーより後方＝クリア済み）
        for (var i = 0; i < terrain.length; i++) {
            var h = terrain[i];
            if (h.type === 'hole' && h.x + h.width < player.x && h.x + h.width > player.x - 500) return true;
        }
        return false;
    }
    return false;
}

// 毎フレーム呼ばれる台本進行（bootstrapのgameLoopから・非アクティブ時は即return）
function updateTutorial() {
    if (!tutorialState.active) return;
    // 台本より先へ走り込めないようにする前進クランプ（1.444→1.446→1.448）:
    // テロップ/ゲートはスクロール距離（camera）基準で発火するため、走り込みすぎると案内タイミングがずれる。
    // 738px＝画面(820px)の右側9割の位置（ユーザー指定・420→656→738 と段階的に緩和）。通常時のプレイヤー
    // 可動域(camera+25〜camera+795)の内側で、課題のかなり手前まで近づけるが台本を追い越さない。
    // この前進クランプがあるので、土管/ショップ個別の通り過ぎ防止クランプは不要（1.448で撤去）。
    // ボス戦はアリーナ全域を使うため対象外。
    if (!bossState.active && !bossState.bossTriggered) {
        var tutMaxX = gameState.camera.x + 738;
        if (player.x > tutMaxX) { player.x = tutMaxX; if (player.velX > 0) player.velX = 0; }
    }
    while (tutorialState.stepIdx < TUTORIAL_SCRIPT.length &&
           gameState.distance >= TUTORIAL_SCRIPT[tutorialState.stepIdx].atM) {
        var st = TUTORIAL_SCRIPT[tutorialState.stepIdx++];
        // テロップが出るより先に課題をクリア済みなら、ゲートを張らず褒めるだけ（1.446・クランプ緩和で先取り可能に）
        var preCleared = st.gate ? tutorialGatePreCleared(st.gate) : false;
        // 事前クリア時はゲート別の具体的な褒め(doneKey)を表示。doneKey='' の課題(ショップ等)は褒めを出さない。
        // ＝汎用「もうできてましたね」を「もうジャンプをマスターしましたね」等に、ショップ退店後の重複テロップも抑止（ユーザー指摘）。
        tutorialState.hintKey = preCleared ? (st.doneKey !== undefined ? st.doneKey : 'tut_already_done') : st.key;
        tutorialState.hintTimer = tutorialState.hintKey ? st.dur : 0;
        if (st.slow && !preCleared) tutorialState.slowTimer = 150; // 2.5秒だけゆっくり＝読んで構えられる
        if (st.spawn === 'chick' && !preCleared) enemies.push(tutorialChick());
        if (st.gate && !preCleared) { // 達成待ちゲート開始（1.427）: その行動を実行するまで世界停止
            tutorialState.gate = st.gate;
            tutorialState.gateKills = gameState.enemyKills;
        }
        if (soundManager) soundManager.playCursorMove();
    }
    // ── 達成待ちゲート: 世界を止めて（プレイヤーと敵は動ける）、対象の行動を検知したら再開 ──
    if (tutorialState.gate) {
        gameState.gameSpeed = 0; // updateGameSpeedが毎tick再計算するため、ここで毎tick上書き
        tutorialState.hintTimer = Math.max(tutorialState.hintTimer, 2); // ゲート中は案内を出し続ける
        var g = tutorialState.gate, cleared = false;
        if (g === 'jump') {
            cleared = (player.velY < -2); // ジャンプ入力で上昇した
        } else if (g === 'stomp') {
            cleared = (gameState.enemyKills > tutorialState.gateKills);
            // 保険: 練習台のひよこが穴落ち等でいなくなったら出し直す（ゲートが詰まないように）
            if (!cleared && enemies.length === 0) enemies.push(tutorialChick());
        } else if (g === 'stock') {
            // バリアを使った（シールド発動中）か、ストックにもうバリアが無い＝使用済み
            cleared = (gameState.puShield > 0) ||
                      !stockState.items.some(function(it) { return it.id === 'barrier'; });
        } else if (g === 'pipe') {
            cleared = pipeRoomState.visited || pipeRoomState.active || pipeRoomState.anim !== 'none';
            // 保険: 土管が消えていたら前方に出し直す（stompの再湧きと同思想・ゲートが詰まないように）。
            // 通り過ぎ防止の個別クランプは前進クランプ(738px)があるため撤去（1.448）＝土管の手前で必ず止まる。
            if (!cleared) {
                var hasPipe = false;
                for (var pi = 0; pi < platforms.length; pi++) { if (platforms[pi].type === 'pipe') { hasPipe = true; break; } }
                if (!hasPipe) platforms.push({ x: gameState.camera.x + 500, y: GROUND_Y - PIPE_H, width: PIPE_W, height: PIPE_H, type: 'pipe' });
            }
        } else if (g === 'shop') {
            // 入店（openStageShopがvisitedを立てる）まで停止（1.443）。
            // ドア通り過ぎ防止の個別クランプは前進クランプ(738px)があるため撤去（1.448）。
            cleared = shopState.visited || shopState.active;
        }
        if (cleared) {
            tutorialState.gate = '';
            tutorialState.hintTimer = 90; // 案内は少し残してからフェード
            if (soundManager) soundManager.playItem();
        }
    }
    if (tutorialState.hintTimer > 0) {
        tutorialState.hintTimer--;
        if (tutorialState.hintTimer === 0) tutorialState.hintKey = '';
    }
    if (tutorialState.slowTimer > 0) {
        tutorialState.slowTimer--;
        gameState.gameSpeed *= 0.35; // updateGameSpeedが毎tick再計算するため乗算方式（土管タイムと同じ）
    }
    if (tutorialState.skipArmed > 0) {
        tutorialState.skipArmed--;
        if (tutorialState.skipArmed === 0) {
            var sb = document.getElementById('tutorialSkipBtn');
            if (sb) sb.textContent = t('tut_skip');
        }
    }
    // ボス戦が始まったら倒し方を案内
    if (bossState.active && bossState.phase === 3 && !tutorialState.bossGuided) {
        tutorialState.bossGuided = true;
        tutorialState.hintKey = 'tut_boss_fight';
        tutorialState.hintTimer = 600;
    }
}

// チュートリアル完了（ボス撃破演出の後に呼ばれる）: 初回のみゴールデンエッグ報酬→完了画面
function finishTutorial() {
    tutorialState.active = false;
    tutorialState.forced = false;
    tutorialState.hintKey = '';
    gameState.gameStarted = false;
    gameState.gamePaused = true;
    bossState.active = false; bossState.phase = 0; bossState.boss = null;
    bossState.bossTriggered = false; bossState.eggs = [];
    var first = !gameSettings.tutorialCleared;
    gameSettings.tutorialCleared = true;
    if (first) {
        gameSettings.goldenEggs = (gameSettings.goldenEggs || 0) + TUTORIAL_CLEAR_EGGS;
        markZukanSeen('item:golden_egg');
    }
    saveSettings();
    var rw = document.getElementById('tutorialClearReward');
    if (rw) {
        rw.style.display = first ? 'block' : 'none';
        if (first) rw.innerHTML = '<img src="images/item_golden_egg.png" width="26" height="26" style="image-rendering:pixelated; vertical-align:middle;"> ×' + TUTORIAL_CLEAR_EGGS + '　' + escapeHtml(t('tut_clear_reward'));
    }
    var tsb = document.getElementById('tutorialSkipBtn');
    if (tsb) tsb.style.display = 'none';
    if (typeof checkBadges === 'function') checkBadges(); // 「操作方法マスター」称号を解放（トースト通知）
    updateStockUI(); // gameStarted=false になったのでストック枠を隠す（クリア画面に残さない）
    // クリアの一枚絵を隠さないよう、左上HUDと操作バーを隠す（次ランのstartGameで復帰）
    var _uiEl = document.getElementById('ui'); if (_uiEl) _uiEl.style.display = 'none';
    var _cbEl = document.getElementById('controlBar'); if (_cbEl) _cbEl.style.display = 'none';
    showScreenEl('tutorialClearScreen');
    if (soundManager) { try { soundManager.playBGM('tutorial'); } catch (_) {} } // クリア画面のBGMは はじまりの地の曲
}

// スキップ（二度押し確認）: クリア扱い（報酬なし）にしてタイトルへ
function tapTutorialSkip() {
    if (!tutorialState.active) return;
    if (tutorialState.skipArmed > 0) {
        tutorialState.skipArmed = 0;
        tutorialState.active = false;
        tutorialState.forced = false;
        tutorialState.hintKey = '';
        gameSettings.tutorialCleared = true; // スキップ=クリア扱い（報酬は出ない）
        saveSettings();
        var b2 = document.getElementById('tutorialSkipBtn');
        if (b2) { b2.style.display = 'none'; b2.textContent = t('tut_skip'); }
        showRewardToast(escapeHtml(t('tut_skipped_toast')), 'linear-gradient(180deg,#ccc,#888)', '#222');
        showStartScreen();
        return;
    }
    tutorialState.skipArmed = 180; // 3秒以内にもう一度で確定
    if (soundManager) soundManager.playCursorMove();
    var b = document.getElementById('tutorialSkipBtn');
    if (b) b.textContent = t('tut_skip_confirm');
}

// ── ラウンド境界（ボス出現距離） ──
// 初回ラン圧縮（Phase3 案A）: 生涯プレイ0回のラン（gameState.isFirstRun・resetGameで確定）だけ、
// 最初のボスを半分の距離(1200m)に前倒し。以降のラウンド境界も同じ量だけ手前にずれる＝ラウンド間隔2400mは不変。
// ショップ配置・安全地帯・土管抽選・バイオーム遷移抑制はすべて本関数経由なので自動で連動する。
// ボス出現距離スケジュールの「素の値」（ズレ補正を含まない）。
//   ラウンド1・2は1200mごと（R1=1200m, R2=2400m）、ラウンド3以降は2400mごと（R3=4800m, R4=7200m…）。
// これで新規プレイヤーは1200mで最初のボスに会える（旧・初回ラン圧縮 isFirstRun 分岐は本スケジュールに統合＝廃止）。
// bossDistanceBaseFor(0)=0（ラウンド起点・ショップ/土管配置の基準に使用）。
function bossDistanceBaseFor(round) {
    if (round <= 0) return 0;
    if (round === 1) return 1200;
    return BOSS_TRIGGER_DISTANCE * (round - 1); // R2=2400, R3=4800, R4=7200 …（2400mごと）
}
// 実際に使うボス距離＝素の値＋ステージ進行のズレ補正（1.553）。
// ⚠バイオーム(getBiomeIndex)にも**同じ stageShiftM** を掛けてあるので、両者は常に同じグリッドに乗る＝
//   「1ラウンド＝草原→砂漠→雪山→夜→ボス」が地底を挟んでも崩れない。通常プレイでは stageShiftM=0。
function bossDistanceFor(round) {
    return bossDistanceBaseFor(round) + (gameState.stageShiftM || 0);
}

// ── ステージショップ ──
function checkShopTrigger() {
    if (bossState.active || bossState.bossTriggered) return;
    // 地底（1.569）: 地上のおみせは出さないが、**怪しい老婆の店**の入店判定はここで行う。
    // ⚠ボス闘技場へ入ったら閉店（逃げ場を作らない）。1ラウンド1回は shopState.visited が担保する。
    if (undergroundState.active) {
        var ugs = undergroundState.shop;
        if (!ugs || shopState.visited || shopState.active) return;
        if (undergroundState.bossPhase > 0) return;
        var ugCX = ugs.x + UG_SHOP_W / 2;
        if (Math.abs((player.x + player.width / 2) - ugCX) < UG_SHOP_NEAR &&
            player.onGround && gameState.input.up) openStageShop();
        return;
    }
    var bossDistance = bossDistanceFor(gameRound);

    // ショップ建物をワールドに配置（一度だけ） — 安全地帯より100m手前で配置開始（チュートリアルは固定配置済み）
    if (!tutorialState.active && !shopState.buildingPlaced && gameState.distance >= bossDistance - SHOP_SAFE_ZONE_START - 100) {
        shopState.buildingPlaced = true;
        shopState.buildingX = (bossDistance - SHOP_BUILDING_OFFSET) * 10; // m→px
    }

    // ショップの前で上入力 → 入店
    if (shopState.buildingPlaced && !shopState.visited && !shopState.active) {
        var shopDoorX = shopState.buildingX + 90; // ドア中央（建物幅180の中央）
        var playerCX = player.x + player.width / 2;
        var nearDoor = Math.abs(playerCX - shopDoorX) < 80 && player.onGround;
        if (nearDoor && gameState.input.up) {
            openStageShop();
        }
    }
}

// ── 土管ボーナス部屋 ──
// ショップ手前の安全地帯に土管を1ラウンド1回出す。土管の上で下スワイプ→1画面の隠し部屋へ。
// 部屋では死なず、ハート/コイン/販売アイテム/ゴールデンエッグを拾って出口土管から本編へ戻る。
// このラウンドの土管目標距離を抽選（ステージ開始〜安全地帯手前の通常エリア内のランダム）
function pickPipeTargetDist() {
    pipeRoomState.targetRound = gameRound;
    pipeRoomState.placed = false;
    pipeRoomState.visited = false;
    pipeRoomState.x = 0;
    pipeRoomState.extraDist = 0;
    // 初回ラン圧縮（Phase3 案A-2）: 最初の土管を200〜400mに保証＝ボーナス部屋を最初のランで必ず見せる
    if (gameRound === 1 && gameState.isFirstRun) {
        pipeRoomState.targetDist = 200 + Math.random() * 200;
        return;
    }
    var roundStart = Math.max(0, bossDistanceFor(gameRound - 1));
    var safeStart  = bossDistanceFor(gameRound) - SHOP_SAFE_ZONE_START;
    var lo = roundStart + 150, hi = safeStart - 150;
    pipeRoomState.targetDist = (hi > lo) ? (lo + Math.random() * (hi - lo)) : 0;
    // ラッキーチャーム(1.506): 期待出現1.5倍＝50%で同ラウンドに2本目を予約。
    // 窓を前半(1本目)/後半(2本目)に分け最小300m離す＝成立率が窓幅に依存しない（R1-2は窓650mと狭く、
    // 「1本目+400m以降の空き」方式だと実測17%まで落ちたため方式変更）。
    // 予約分は checkPipeTrigger が1本目消化後に targetDist へ昇格させる
    var CHARM_PIPE_GAP = 300; // 2本の最小間隔(m)・調整ノブ
    if (gameState.luckyCharm && pipeRoomState.targetDist > 0 && hi - lo > CHARM_PIPE_GAP && Math.random() < 0.5) {
        var mid = (lo + hi) / 2;
        pipeRoomState.targetDist = lo + Math.random() * (mid - CHARM_PIPE_GAP / 2 - lo);
        pipeRoomState.extraDist = mid + CHARM_PIPE_GAP / 2 + Math.random() * (hi - mid - CHARM_PIPE_GAP / 2);
    }
}

// 平地（穴でも高台でもない GROUND_Y の地面）か判定
function isFlatGroundAt(worldX) {
    for (var i = 0; i < terrain.length; i++) {
        var t = terrain[i];
        if (t.type === 'hole' || t.width <= 0 || t.y !== GROUND_Y) continue;
        if (worldX >= t.x && worldX <= t.x + t.width) return true;
    }
    return false;
}
// 土管の設置可否（1.412で全面修正）: 足場全幅＋左右クリアランスにわたって「表面が地面の高さ(GROUND_Y)」であること。
// 旧実装は「GROUND_Yの地面スラブが存在するか」を3点だけ見ていたため、高台の下にも基礎スラブが続く地形では
// 高台の直下・直隣にも合格してしまい、柱に密着した土管が建っていた。表面高さ(terrainTopAt)基準に変更し、
// 高台(表面がより上)・穴(null)・未生成地形(null)はすべて不可。細かい刻みで全幅を走査（3点サンプルの取りこぼしも解消）。
var PIPE_SIDE_CLEARANCE = 60; // 土管の左右に要求する平地マージン(px)＝壁・高台に密着して建たない（近づく余地を保証）
function pipeFootprintFlat(x, w) {
    var from = x - PIPE_SIDE_CLEARANCE, to = x + w + PIPE_SIDE_CLEARANCE;
    for (var px = from; px < to; px += 20) {
        if (terrainTopAt(px) !== GROUND_Y) return false;
    }
    return terrainTopAt(to) === GROUND_Y; // 右端も明示チェック（刻みの取りこぼし防止）
}

function checkPipeTrigger() {
    if (tutorialState.active) return; // チュートリアルは setupTutorialStage で固定配置済み（再抽選もしない）
    if (undergroundState.active) return; // 地底ではボーナス土管を出さない
    if (undergroundState.pipePlaced) return; // 入場土管が出ている間はボーナス土管を重ねない（1.545）
    if (bossState.active || bossState.bossTriggered || pipeRoomState.active) return;
    // ラウンドが変わったら、このラウンドの目標距離を新規抽選（1ラウンド1回）
    if (pipeRoomState.targetRound !== gameRound) pickPipeTargetDist();
    // ラッキーチャーム2本目(1.506): 1本目を消化済みで予約距離に達し、1本目の土管が画面後方に消えていたら再武装。
    // visited も戻すが、1本目は既にカメラ左外＝ヒント描画も入場判定も届かないので再入場は起きない
    if (pipeRoomState.placed && pipeRoomState.extraDist > 0 &&
        gameState.distance >= pipeRoomState.extraDist &&
        pipeRoomState.x + PIPE_W < gameState.camera.x) {
        pipeRoomState.placed = false;
        pipeRoomState.visited = false;
        pipeRoomState.targetDist = pipeRoomState.extraDist;
        pipeRoomState.extraDist = 0;
    }
    if (pipeRoomState.placed || pipeRoomState.targetDist <= 0) return;
    if (gameState.distance < pipeRoomState.targetDist) return;
    // 安全地帯に入ってしまったら今ラウンドは見送り（手前の平地に置けなかった）
    var safeStart = bossDistanceFor(gameRound) - SHOP_SAFE_ZONE_START;
    if (gameState.distance >= safeStart) { pipeRoomState.placed = true; return; }
    // 目標距離を過ぎたら、画面右外の平地が見つかり次第そこに配置（スクロールで自然に入ってくる）
    var spawnX = gameState.camera.x + GAME_WIDTH + 20;
    if (pipeFootprintFlat(spawnX, PIPE_W)) {
        pipeRoomState.placed = true;
        pipeRoomState.x = spawnX;
        platforms.push({ x: spawnX, y: GROUND_Y - PIPE_H, width: PIPE_W, height: PIPE_H, type: 'pipe' });
        // 土管の真上にある浮遊足場（雲/floating_ground）を除去＝下スワイプ入場を妨げない
        for (var _pj = platforms.length - 1; _pj >= 0; _pj--) {
            var _pl = platforms[_pj];
            if (_pl.type === 'pipe') continue;
            if (_pl.x + _pl.width > spawnX - 40 && _pl.x < spawnX + PIPE_W + 40 && _pl.y + _pl.height < GROUND_Y) {
                platforms.splice(_pj, 1);
            }
        }
    }
}

// 入場可能な土管を返す（接地して土管の上にいる時）。findPlatformUnder(重なり任意+足元±5px)より
// 寛容に、水平±12px・足元±8pxまで許容＝縁ギリギリや1px浮きでも入場できる（1.407 入場性改善）。
function getEnterablePipe() {
    if (!player.onGround) return null;
    var pb = player.y + player.height;
    for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];
        if (p.type !== 'pipe') continue;
        if (player.x + player.width > p.x - 12 && player.x < p.x + p.width + 12 && Math.abs(pb - p.y) <= 8) return p;
    }
    return null;
}

// 「土管そのものに対し下スワイプ」で入場（1.449）: 上に乗っていなくても、スワイプ地点(ワールド座標)が土管の絵の上で、
// プレイヤーが土管の近く（横に約1.5土管幅）なら入場。入場アニメが中央へ吸い付くので横からでも綺麗に入る。
function tryEnterPipeAtWorld(wx, wy) {
    if (pipeRoomState.active || pipeRoomState.anim !== 'none') return false;
    if (!player.onGround) return false; // 空中からの割り込み入場は避ける（接地時のみ）
    var pcx = player.x + player.width / 2;
    for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];
        if (p.type !== 'pipe') continue;
        // ⚠visited(このラウンドはボーナス土管使用済み)でも、地底の入場土管だけは入れる（1.545）。
        //   元は関数の頭で visited を弾いていたが、それだと「土管の横で下スワイプ」の救済経路だけ地底に入れなくなる。
        if (pipeRoomState.visited && !p.ugEntrance) continue;
        // 地底の入場土管は**画面内ならどこからでも**入れる（1.552）。強制入場の門であり、スクロールが
        // 止まって1画面に閉じ込められる以上、届かない位置が生まれてはいけない。⚠実測: 通常の許容
        // (幅×1.5+40=238px) では、土管を通り過ぎて右端クランプ(747)まで行くと254pxで**わずかに届かなかった**。
        var reach = p.ugEntrance ? GAME_WIDTH : (p.width * 1.5 + 40);
        if (wx >= p.x - 20 && wx <= p.x + p.width + 20 && wy >= p.y - 20 && wy <= p.y + p.height + 20 &&
            Math.abs(pcx - (p.x + p.width / 2)) < reach) {
            enterPipeRoom(p);
            return true;
        }
    }
    return false;
}

// 「お店の入り口に対し上スワイプ」で入店（1.449）: スワイプ地点(ワールド座標)が建物の絵の上で、プレイヤーがドアの近く
// （±160px＝checkShopTriggerの±80より寛容）なら入店。建物サイズは render.js の描画(180×131)に合わせる。
function tryEnterShopAtWorld(wx, wy) {
    // 地底の老婆の店（1.569）: 洞窟の入口そのものへ上スワイプしても入れる（地上の1.449と同じ救済）
    if (undergroundState.active) {
        var us = undergroundState.shop;
        if (!us || shopState.visited || shopState.active || undergroundState.bossPhase > 0) return false;
        if (!player.onGround) return false;
        if (wx >= us.x - 20 && wx <= us.x + UG_SHOP_W + 20 &&
            wy >= us.baseY - UG_SHOP_H - 20 && wy <= us.baseY + 20 &&
            Math.abs((player.x + player.width / 2) - (us.x + UG_SHOP_W / 2)) < UG_SHOP_NEAR * 1.8) {
            openStageShop();
            return true;
        }
        return false;
    }
    if (!shopState.buildingPlaced || shopState.visited || shopState.active) return false;
    // ⚠ボス戦中は入店不可（1.550）。checkShopTrigger の同じガードがこちらに無く、カカシ戦の最中に
    //   おみせへ入れてしまっていた。ここで false を返すと上スワイプは消費されず他の操作に回る。
    if (bossState.active || bossState.bossTriggered) return false;
    if (!player.onGround) return false;
    var bx = shopState.buildingX, bw = 180, bh = 131, by = GROUND_Y - bh;
    var doorX = bx + 90;
    if (wx >= bx - 20 && wx <= bx + bw + 20 && wy >= by - 20 && wy <= GROUND_Y + 20 &&
        Math.abs((player.x + player.width / 2) - doorX) < 160) {
        openStageShop();
        return true;
    }
    return false;
}

// ── 土管タイム（入場アシスト・1.407） ──
// 土管に乗った瞬間から一定時間、世界のスクロールを大幅減速（updateGameSpeed が pipeAssistTimer>0 で乗算）。
// 高速域では狭い土管上で下スワイプする猶予がほぼ無いための救済。1つの土管につき1回だけ（離れると即解除・再発動なし）。
var pipeAssistTimer = 0;
var pipeAssistPipe = null;
function updatePipeAssist() {
    if (pipeRoomState.active || bossState.active || shopState.active || pipeRoomState.visited) {
        pipeAssistTimer = 0; pipeAssistPipe = null; return;
    }
    var onPipe = getEnterablePipe();
    // 消費済みの土管から離れたら used を解除＋減速も終了（同じ土管に再び乗ったら再発動できるように）。
    // 乗り続けている間は pipeAssistPipe===onPipe なので解除されず＝「乗っている間は1回だけ」が保たれる。
    if (pipeAssistPipe && pipeAssistPipe !== onPipe) {
        pipeAssistPipe.assistUsed = false;
        pipeAssistPipe = null;
        pipeAssistTimer = 0;
    }
    if (onPipe && !onPipe.assistUsed && pipeAssistTimer === 0) {
        onPipe.assistUsed = true; // 乗っている間は1回だけ（離れると上のブロックで解除され、再乗車で再発動）
        pipeAssistPipe = onPipe;
        pipeAssistTimer = PIPE_ASSIST_FRAMES;
    }
    if (pipeAssistTimer > 0) {
        pipeAssistTimer--;
    }
}

// ── マリオ風 出入り演出（1.408）──
// 入場: enterPipeRoom(公開)→ anim='in'（中央へスナップ→土管へ沈む・世界は停止）→ _enterPipeRoomNow()
// 退場: 出口ゲージ完了→ anim='outRoom'（横土管へ歩き込む）→ _exitPipeRoomNow() → anim='outWorld'（本編の土管から上昇）
// Android戻る等の exitPipeRoom(公開) は歩き込みを省いて即退室＋上昇演出のみ。
var PIPE_ANIM_SNAP = 9;   // 中央スナップのフレーム数
var PIPE_ANIM_MOVE = 30;  // 沈む/上昇のフレーム数（66px≒0.5秒）

function enterPipeRoom(targetPipe) { // 公開API（下スワイプ/キーボード↓から）。targetPipe省略時は土管上に立っている前提
    // ⚠地底の入場土管はここで横取りする（ボーナス部屋ではなく地底へ行く）。
    //   pipeRoomState.visited のガードより**前**に判定すること＝同ラウンドで既にボーナス土管を使っていても入場できる。
    var _ug = (targetPipe && targetPipe.type === 'pipe') ? targetPipe : getEnterablePipe();
    if (_ug && _ug.ugEntrance) { startUndergroundPipeAnim(_ug); return; }
    if (pipeRoomState.active || pipeRoomState.visited || pipeRoomState.anim !== 'none') return;
    if (gameState.specialCutinTimer > 0) return; // 必殺カットイン中は入室しない（カットインが凍結し演出が飛ぶのを防ぐ。activateSpecialMoveと対称・監査LOW）
    var pipe = (targetPipe && targetPipe.type === 'pipe') ? targetPipe : getEnterablePipe();
    if (!pipe) return;
    pipeRoomState.visited = true;               // 演出開始時点で消費（多重開始・再入場防止）
    pipeAssistTimer = 0; pipeAssistPipe = null; // 土管タイム解除（速度はupdateGameSpeedが次tickで復帰）
    // ⚠**通常のボーナス土管は必ず pipeAnim を降ろしてから始める**（1.571の保険）。
    //   この関数は地上の土管専用で、地底の入場土管は startUndergroundPipeAnim が pipeAnim=true にして入る。
    //   前のランの残留フラグがここに残っていると、演出の完了時に _enterPipeRoomNow() ではなく
    //   enterUnderground() が走る（resetGame 側でも消しているが、経路が2つあるので二重の保険にする）。
    undergroundState.pipeAnim = false;
    pipeRoomState.anim = 'in';
    pipeRoomState.animTimer = 0;
    pipeRoomState.animPipe = pipe;
    // 入力消費（演出中は専用分岐が走り通常updateは止まる）
    gameState.input.down = false; gameState.input.up = false;
    gameState.input.left = false; gameState.input.right = false;
    gameState.input.jump = false; gameState.input.jumpPressed = false;
    gameState.downSwipeActive = false; gameState.downSwipeTimer = 0;
    if (soundManager) soundManager.playPipeWarp();
}

// 本編側の演出（gameLoopの専用分岐から毎tick呼ばれる。この間 世界の通常updateは走らない）
function updatePipeAnim() {
    var p = pipeRoomState.animPipe;
    if (!p) { pipeRoomState.anim = 'none'; return; }
    pipeRoomState.animTimer++;
    var t = pipeRoomState.animTimer;
    var cx = p.x + p.width / 2 - player.width / 2; // 土管中央
    var standY = p.y - player.height;              // 土管上に立つy
    if (pipeRoomState.anim === 'in') {
        if (t <= PIPE_ANIM_SNAP) {
            player.x += (cx - player.x) * 0.4;     // 中央へ吸い付き
            player.y = standY;
        } else if (t <= PIPE_ANIM_SNAP + PIPE_ANIM_MOVE) {
            // ⚠沈む距離は土管ごとに変える（1.559・ユーザー報告「消える位置が僅かにずれる」）。
            //   全土管一律 PIPE_H(66px) だったが、地底の入場土管はクリップ線まで72px必要で**6px足りず**、
            //   沈み切ってもプレイヤーの頭が口から覗いていた。入場土管は自分の高さ(p.height)ぶん沈める。
            var sinkH = p.ugEntrance ? p.height : PIPE_H;
            player.x = cx;
            player.y = standY + sinkH * ((t - PIPE_ANIM_SNAP) / PIPE_ANIM_MOVE); // 沈む（土管がプレイヤーの後に再描画され隠れる）
        } else {
            player.x = cx; player.y = standY;      // 実座標は立ち位置へ（savedPlayer=退室後の復帰位置になる）
            player.velX = 0; player.velY = 0;
            pipeRoomState.anim = 'none';
            // 地底の入場土管なら部屋ではなく地底へ（1.545）。enterUnderground がスポーン位置を上書きする
            if (undergroundState.pipeAnim) {
                undergroundState.pipeAnim = false;
                pipeRoomState.animPipe = null;
                enterUnderground();
            } else {
                _enterPipeRoomNow();
            }
        }
    } else if (pipeRoomState.anim === 'outWorld') {
        if (t <= PIPE_ANIM_MOVE) {
            player.x = cx;
            player.y = (standY + PIPE_H) - PIPE_H * (t / PIPE_ANIM_MOVE); // 上昇して出てくる
        } else {
            player.y = standY;
            player.velX = 0; player.velY = 0; player.onGround = true;
            pipeRoomState.anim = 'none';
            pipeRoomState.animPipe = null;
            // 出た直後の理不尽被弾を防ぐ短い無敵（1秒）
            gameState.isInvincible = true;
            gameState.invincibleTimer = Math.max(gameState.invincibleTimer, 60);
        }
    }
}

function _enterPipeRoomNow() { // 実際の入室処理（演出完了後に呼ばれる）
    if (pipeRoomState.active) return;
    pipeRoomState.active = true;
    // Android戻る用に履歴を積む（無いと部屋内で戻る=即アプリ離脱）。戻る→BACK_HANDLERSがexitPipeRoom()＝pushと相殺。
    // 横土管から歩いて出た場合はこのstateが1つ余るが、余りは次の戻るでポーズになるだけ（無害）。
    history.pushState({ screen: 'pipeRoom' }, '');
    // 進行中の演出はワールド座標発行＝部屋(画面座標)では誤った位置に描かれるため破棄（部屋内の取得演出は画面座標で発行される）
    floatEffects.length = 0;
    if (typeof markZukanSeen === 'function') markZukanSeen('biome:bonus'); // ずかん(ステージ): ボーナス部屋を発見
    pipeRoomState.exitHold = 0; // 退室ゲージを初期化
    pipeRoomState.roomType = pickPipeRoomType().id; // 部屋タイプを抽選（背景色/小物/報酬が変わる・1.450〜）
    pipeRoomState.introTimer = 90; // 入場「BONUS!」演出（約1.5秒）
    pipeRoomState.savedGameSpeed = gameState.gameSpeed;
    gameState.gameSpeed = 0;
    // 入室前のプレイヤー状態を退避（退室時に復元）
    pipeRoomState.savedPlayer = { x: player.x, y: player.y, velX: player.velX, velY: player.velY, onGround: player.onGround, facing: player.facing };
    // 入力リセット（暴発防止）
    gameState.input.down = false; gameState.input.up = false;
    gameState.input.left = false; gameState.input.right = false;
    gameState.input.jump = false; gameState.input.jumpPressed = false;
    gameState.downSwipeActive = false; gameState.downSwipeTimer = 0;
    gameState.recentlyDropped = false; gameState.dropFromY = 0; // 部屋出入りでフラグ残留を防ぐ
    // 以後 player.x/y は画面座標として扱う（部屋は固定カメラ）。左上から落下して入場
    player.x = PIPE_ROOM_LEFT; player.y = -player.height - 20;
    player.velX = 0; player.velY = 0; player.onGround = false; player.facing = 'right';
    initPipeRoom();
    if (typeof updateStockUI === 'function') updateStockUI(); // ストック枠(＋所持アップグレードアイコン)を読み取り専用で表示（部屋では使わない）
    if (soundManager) soundManager.playBGM('bonus');
}

// 出口ゲージ完了: 部屋側で横土管へ歩き込む演出を開始（updatePipeRoom冒頭の分岐が進める）
function startPipeExitWalk() {
    if (pipeRoomState.anim !== 'none') return;
    pipeRoomState.anim = 'outRoom';
    pipeRoomState.animTimer = 0;
    pipeRoomState.exitHold = 0;
    gameState.input.left = false; gameState.input.right = false; gameState.input.jump = false;
    if (soundManager) soundManager.playPipeWarp();
}

// 本編側: 土管から上昇して出てくる演出をセット（土管参照が無ければ演出なしで即操作復帰）
function _startPipeRiseOut() {
    var p = pipeRoomState.animPipe;
    if (!p) { pipeRoomState.anim = 'none'; return; }
    pipeRoomState.anim = 'outWorld';
    pipeRoomState.animTimer = 0;
    player.x = p.x + p.width / 2 - player.width / 2;
    player.y = p.y - player.height + PIPE_H; // 沈んだ位置から上昇開始
    player.velX = 0; player.velY = 0;
    if (soundManager) soundManager.playPipeWarp();
}

function exitPipeRoom() { // 公開API（Android戻る等）: 部屋の歩き込みは省き、即時退室＋本編の上昇演出のみ
    if (!pipeRoomState.active) return;
    if (pipeRoomState.anim === 'outRoom') return; // 歩き込み演出中は完了に任せる（二重退室防止）
    _exitPipeRoomNow();
    _startPipeRiseOut();
}

function _exitPipeRoomNow() { // 実際の退室処理（savedPlayer復元・BGM復帰など）
    if (!pipeRoomState.active) return;
    pipeRoomState.active = false;
    bonusRoomItems.length = 0;
    floatEffects.length = 0; // 部屋内の取得演出は画面座標発行＝本編(ワールド座標)では誤った位置に描かれるため破棄
    // プレイヤー状態を復元（本編は同じ位置から再開）
    var sp = pipeRoomState.savedPlayer;
    if (sp) { player.x = sp.x; player.y = sp.y; player.velX = sp.velX; player.velY = sp.velY; player.onGround = sp.onGround; player.facing = sp.facing; }
    pipeRoomState.savedPlayer = null;
    gameState.gameSpeed = pipeRoomState.savedGameSpeed || gameState.gameSpeed;
    gameState.input.down = false; gameState.input.up = false;
    gameState.input.left = false; gameState.input.right = false;
    gameState.input.jump = false; gameState.input.jumpPressed = false;
    if (typeof updateStockUI === 'function') updateStockUI(); // ストック枠を再表示
    playStageBGM(); // 本編BGMに復帰
}

// 出口（横）土管の左端X（口）。右壁の内側に接して置く（右へ抜けられるのは口から退室する時だけ）。GAME_WIDTHは可変なので実行時算出。
function pipeRoomExitX() { return GAME_WIDTH - PIPE_ROOM_WALL_W - SIDE_PIPE_W; }

// ── 土管ボーナス部屋のタイプ（1.450〜）──
// 「毎回同じ」を解消するため、入室時に部屋タイプを重み付き抽選。タイプごとに背景色/小物/報酬が変わる。
// ⚠ ゴールデンエッグは全タイプ共通で独立に1%(1/100)抽選（部屋タイプは一切関与しない）。希少化: 5%→2%→1%（1.455）。
// build() は bonusRoomItems へ報酬を積む。fallback で「そのタイプの報酬が無意味な状態」（在庫満杯/HP満タン等）はコインに振替。
// weight=0 は未実装/無効。Phase毎に増やす（Phase1: treasure, coin）。
var ROOM_TYPES = [
    { id: 'treasure', weight: 40, build: buildTreasureRoom }, // たからの間（現状＝バランス・基準）
    { id: 'coin',     weight: 20, build: buildCoinRoom },     // コインの間（金貨ざくざく・ハート/在庫なし）
    { id: 'potion',   weight: 15, build: buildPotionRoom },   // ポーションの間（在庫補給・満杯ならコイン振替）
    { id: 'heal',     weight: 10, build: buildHealRoom },     // おやすみの間（ハート2確定・満タンは既存で+1000点変換）
    { id: 'lucky',    weight: 15, build: buildLuckyRoom }     // ラッキーの間（宝箱3つから1つ踏んで開封→ランダム報酬・残り2つ消滅）
];

function pipeRoomBounds() {
    var rightLimit = pipeRoomExitX() - 30; // 報酬は出口（横）土管に重ねない
    return { floorY: PIPE_ROOM_FLOOR_Y, left: PIPE_ROOM_LEFT, right: rightLimit, span: rightLimit - PIPE_ROOM_LEFT };
}
function addRoomCoin(x, y) { bonusRoomItems.push({ type: 'coin', x: x, y: y, width: 32, height: 32, collected: false }); }
function addRoomHeart(x, y) { bonusRoomItems.push({ type: 'heart', x: x, y: y, width: 36, height: 36, collected: false, floatOffset: Math.random() * Math.PI * 2, animFrame: 0 }); }

// たからの間（現状の中身をそのまま踏襲）: コイン10横一列＋ハート1(+12%で2)＋在庫アイテム1(空きあれば)
function buildTreasureRoom() {
    var b = pipeRoomBounds();
    var n = 10, x0 = b.left + 60, x1 = b.right - 20;
    for (var i = 0; i < n; i++) addRoomCoin(x0 + (x1 - x0) * (i / (n - 1)), b.floorY - 72);
    var posL = b.left + b.span * 0.3, posC = b.left + b.span * 0.5, posR = b.left + b.span * 0.7;
    addRoomHeart(posL, b.floorY - 150);
    if (Math.random() < 0.12) addRoomHeart(posR, b.floorY - 150);
    if (stockState.items.length < stockState.maxSlots) {
        var pool = ['barrier', 'lemon_special', 'full_charge'];
        bonusRoomItems.push({ type: 'shopitem', itemId: pool[Math.floor(Math.random() * pool.length)], x: posC, y: b.floorY - 152, width: 40, height: 40, collected: false, floatOffset: Math.random() * Math.PI * 2 });
    }
}

// コインの間: 18〜22枚を山型（跳んで集める）。ハート/在庫なし＝合計価値はたからの間と同程度に寄せる。
function buildCoinRoom() {
    var b = pipeRoomBounds();
    var n = 18 + Math.floor(Math.random() * 5); // 18〜22
    var x0 = b.left + 50, x1 = b.right - 30;
    for (var i = 0; i < n; i++) {
        var f = i / (n - 1);
        var arc = Math.sin(f * Math.PI);              // 中央ほど高い山型
        var y = b.floorY - 66 - arc * 150;            // 床上66px〜最高216px（ジャンプ圏内）
        addRoomCoin(x0 + (x1 - x0) * f, y);
    }
}

// ポーションの間: 在庫アイテムを棚に2〜3個（空き枠分だけ）＋床にコイン。在庫満杯ならハズレ防止でコインに振替。
// ※取得は addToStock が満杯時 false を返す＝空き分しか取れないので、出す数を空き枠に合わせる。
function buildPotionRoom() {
    var b = pipeRoomBounds();
    var freeSlots = Math.max(0, stockState.maxSlots - stockState.items.length);
    var nPotion = Math.min(3, freeSlots);
    if (nPotion === 0) { // 在庫満杯 → コイン振替（15枚横一列）
        var n = 15, x0 = b.left + 55, x1 = b.right - 25;
        for (var c = 0; c < n; c++) addRoomCoin(x0 + (x1 - x0) * (c / (n - 1)), b.floorY - 72);
        return;
    }
    // 棚の上に在庫アイテムを重複なく配置
    var pool = ['barrier', 'lemon_special', 'full_charge', 'heal_stock'];
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    var shelfY = b.floorY - 150;
    for (var p = 0; p < nPotion; p++) {
        var fx = (nPotion === 1) ? 0.5 : (0.3 + 0.4 * (p / (nPotion - 1))); // 中央寄せに等間隔
        bonusRoomItems.push({ type: 'shopitem', itemId: pool[p], x: b.left + b.span * fx, y: shelfY, width: 40, height: 40, collected: false, floatOffset: Math.random() * Math.PI * 2 });
    }
    // 床に少しコイン（部屋を空にしない）
    var cn = 6, cx0 = b.left + 70, cx1 = b.right - 40;
    for (var k = 0; k < cn; k++) addRoomCoin(cx0 + (cx1 - cx0) * (k / (cn - 1)), b.floorY - 72);
}

// おやすみの間: ハート2確定（ジャンプで取る）＋床にコイン。HP満タン時は既存のハート取得処理が +1000点へ自動変換＝ハズレにならない。
function buildHealRoom() {
    var b = pipeRoomBounds();
    addRoomHeart(b.left + b.span * 0.38, b.floorY - 150);
    addRoomHeart(b.left + b.span * 0.62, b.floorY - 150);
    var cn = 6, cx0 = b.left + 70, cx1 = b.right - 40;
    for (var k = 0; k < cn; k++) addRoomCoin(cx0 + (cx1 - cx0) * (k / (cn - 1)), b.floorY - 72);
}

// ラッキーの間（1.452〜）: 床に宝箱3つを等間隔で並べる。プレイヤーは1つを「上から踏んで」開ける（横歩きでは開かない＝3つから選べる）。
// 開封→中身ランダム[大コイン/ハート/在庫]・残り2つは消滅。ゴールデンエッグは他タイプ同様 initPipeRoom が独立1%(1/100)で別途抽選。
var LUCKY_CHEST_W = 52, LUCKY_CHEST_H = 40;
function buildLuckyRoom() {
    var b = pipeRoomBounds();
    var fxs = [0.26, 0.5, 0.74]; // 左・中央・右
    for (var i = 0; i < 3; i++) {
        bonusRoomItems.push({
            type: 'chest', idx: i,
            x: b.left + b.span * fxs[i] - LUCKY_CHEST_W / 2,
            y: b.floorY - LUCKY_CHEST_H,   // 床に置く
            width: LUCKY_CHEST_W, height: LUCKY_CHEST_H,
            collected: false, opened: false, vanishing: false,
            openTimer: 0, vanishTimer: 0, floatOffset: i * 1.1
        });
    }
}

// 宝箱を開封（updatePipeRoom の踏みつけ判定から呼ばれる）: 中身を抽選（1.453〜 大当たり枠つき）→付与→残り2つを消滅。
// 報酬5段: ふっかつやく(超大当たり)/やくそう(大当たり)/在庫3種/ハート/大コイン。在庫系(revive/herb/stock)は満杯でも
// addToStock が貯金へ自動換算＝ハズレなし（convertItemToSavings が独自トーストを出す）。ハート満タンは既存で+1000点。
// 調整ノブ: 下記 r のしきい値（revive4%/herb12%/stock24%/heart22%/大コイン38%）・大コイン価値(1500)・在庫プール。
function openLuckyChest(chest) {
    if (pipeRoomState.chestPicked) return;
    pipeRoomState.chestPicked = true;
    chest.opened = true; chest.openTimer = 0;
    var r = Math.random();
    // ラッキーチャーム(1.506)所持なら当たり枠を強化: revive4%→8% / herb12%→20%（stock24%/heart22%は据え置き・bigcoinが38%→26%に縮む）
    var reward = gameState.luckyCharm
        ? ((r < 0.08) ? 'revive' : (r < 0.28) ? 'herb' : (r < 0.52) ? 'stock' : (r < 0.74) ? 'heart' : 'bigcoin')
        : ((r < 0.04) ? 'revive' : (r < 0.16) ? 'herb' : (r < 0.40) ? 'stock' : (r < 0.62) ? 'heart' : 'bigcoin');
    chest.reward = reward;
    var cx = chest.x + chest.width / 2, cy = chest.y;

    // 在庫アイテム付与（満杯時は addToStock が貯金換算＝非ハズレ）。枠に入った時だけアイコンを見せる。
    function grantStockReward(id) {
        var before = stockState.items.length;
        var ok = addToStock(id);
        if (ok) markZukanSeen('item:' + id);
        if (ok && stockState.items.length > before) {
            floatEffects.push({ type: 'chest_item', worldX: cx, worldY: cy - 28, timer: 0, duration: 80, itemId: id });
        }
        if (soundManager) soundManager.playItem();
    }

    if (reward === 'revive' || reward === 'herb') { // 大当たり／超大当たり
        spawnChestRewardEffect(cx, cy - 8, true);
        floatEffects.push({ type: 'lucky_label', worldX: cx, worldY: cy - 48, timer: 0, duration: 95, offsetY: 0,
            text: t(reward === 'revive' ? 'lucky_superjackpot' : 'lucky_jackpot') });
        grantStockReward(reward === 'revive' ? 'revive_potion' : 'heal_stock');
    } else if (reward === 'stock') {
        spawnChestRewardEffect(cx, cy - 8, false);
        var pool = ['barrier', 'lemon_special', 'full_charge'];
        grantStockReward(pool[Math.floor(Math.random() * pool.length)]);
    } else if (reward === 'heart') {
        spawnChestRewardEffect(cx, cy - 8, false);
        if (gameState.lives < 10) gameState.lives++; else gainScore(1000);
        spawnLifeUpEffect(cx, cy - 18);
        if (soundManager) soundManager.playItem();
    } else { // bigcoin
        spawnChestRewardEffect(cx, cy - 8, false);
        gainScore(1500);
        floatEffects.push({ type: 'score_text', worldX: cx, worldY: cy - 22, timer: 0, duration: 70, offsetY: 0, score: 1500 });
        if (soundManager) soundManager.playCoin();
    }
    // 残り2つの宝箱を消滅（開いた宝箱は開状態のまま残す＝どれを選んだか分かる）
    for (var k = 0; k < bonusRoomItems.length; k++) {
        var o = bonusRoomItems[k];
        if (o.type === 'chest' && o !== chest && !o.opened) { o.vanishing = true; o.vanishTimer = 0; }
    }
    player.velY = JUMP_FORCE * 0.35; player.onGround = false; // 開封の小さなホップ（気持ちよさ）
}

// 入室時に部屋タイプを重み付き抽選（有効な weight>0 のみ）。将来、状態依存のフォールバックはここか各buildで。
function pickPipeRoomType() {
    var pool = ROOM_TYPES.filter(function(rt) { return rt.weight > 0; });
    var total = 0; for (var i = 0; i < pool.length; i++) total += pool[i].weight;
    var r = Math.random() * total;
    for (var j = 0; j < pool.length; j++) { r -= pool[j].weight; if (r < 0) return pool[j]; }
    return pool[0];
}

// 部屋の報酬生成: タイプ別 build を呼ぶ＋ゴールデンエッグは全タイプ共通で独立1%(1/100)。
function initPipeRoom() {
    bonusRoomItems.length = 0;
    pipeRoomState.chestPicked = false; // ラッキーの間の3択を毎入室リセット
    var rt = null;
    for (var i = 0; i < ROOM_TYPES.length; i++) { if (ROOM_TYPES[i].id === pipeRoomState.roomType) { rt = ROOM_TYPES[i]; break; } }
    if (!rt) rt = ROOM_TYPES[0];
    rt.build();
    // ゴールデンエッグ: 1%(1/100・部屋タイプに依存しない)。土管は1ラウンド1つ＝回数が多いので希少化(5%→2%→1% 1.455)。チュートリアルでは出さない（稼ぎ場防止）。
    if (!tutorialState.active && Math.random() < 0.01) {
        var b = pipeRoomBounds();
        bonusRoomItems.push({ type: 'golden_egg', x: b.left + b.span * 0.5, y: b.floorY - 215, width: 40, height: 40, collected: false, floatOffset: Math.random() * Math.PI * 2 });
    }
}

// 部屋の毎フレーム更新（簡易物理・死なない）
function updatePipeRoom() {
    // 退室演出: 横土管へ歩き込んで消える（drawPipeRoomが土管を後描きして隠す）。入力は無効
    if (pipeRoomState.anim === 'outRoom') {
        pipeRoomState.animTimer++;
        player.facing = 'right';
        player.velX = 0; player.velY = 0;
        // 口の穴は床より約10px上（item_pipe_side.png 実測: 開口部下端=高さの87%）。
        // 床のまま歩き込むと「足が穴じゃない位置」に見えるため、最初の数フレームで段差を上がるように足を口の下端へ合わせる（1.442）
        player.y = PIPE_ROOM_FLOOR_Y - player.height - Math.min(10, pipeRoomState.animTimer * 1.5);
        player.x += 2.4;                              // 一定速度で口の奥へ
        player.animFrame++;                           // 歩きモーション
        // 体の左端が「口の内側の縁」ラインを越えたら完全に見えなくなる（クリップ方式・1.410）
        if (player.x >= pipeRoomExitX() + SIDE_PIPE_MOUTH_LINE + 4) {
            pipeRoomState.anim = 'none';
            _exitPipeRoomNow();
            _startPipeRiseOut();
        }
        return;
    }
    var accel = 1.2, fric = 0.85;
    if (gameState.input.left) { player.velX = Math.max(player.velX - accel, -MOVE_SPEED); player.facing = 'left'; }
    else if (gameState.input.right) { player.velX = Math.min(player.velX + accel, MOVE_SPEED); player.facing = 'right'; }
    else { player.velX *= fric; }
    // ジャンプ
    if (gameState.input.jump && !gameState.input.jumpPressed && player.onGround) {
        player.velY = JUMP_FORCE; player.onGround = false; gameState.input.jumpPressed = true;
        if (soundManager) soundManager.playJump();
    }
    if (!gameState.input.jump) gameState.input.jumpPressed = false;
    // 重力＋移動
    player.velY += GRAVITY; if (player.velY > 15) player.velY = 15;
    player.x += player.velX; player.y += player.velY;
    // 床着地（固定床・死なない）
    if (player.y + player.height >= PIPE_ROOM_FLOOR_Y) {
        player.y = PIPE_ROOM_FLOOR_Y - player.height; player.velY = 0; player.onGround = true;
    } else {
        player.onGround = false;
    }
    // 左壁（見える壁）で止める：壁の内側でプレイヤーが停止する
    if (player.x < PIPE_ROOM_WALL_W) { player.x = PIPE_ROOM_WALL_W; if (player.velX < 0) player.velX = 0; }
    // 出口（横）土管：上に乗れる／床で口に接触し右を一定時間押し続けたら退室。土管の胴体がある高さだけ壁になり、上空は素通り（＝右壁で止まる）
    var exX = pipeRoomExitX(), exTop = PIPE_ROOM_FLOOR_Y - SIDE_PIPE_H;
    var exitCharging = false;
    if (player.x + player.width > exX) {
        var feetY = player.y + player.height, prevFeet = feetY - player.velY;
        if (player.velY >= 0 && prevFeet <= exTop + 4 && feetY >= exTop) {
            player.y = exTop - player.height; player.velY = 0; player.onGround = true; // 土管の上面に着地（足が上面に達した時だけ＝空中でワープしない）
        } else if (feetY >= PIPE_ROOM_FLOOR_Y - 2) {
            player.x = exX - player.width; if (player.velX > 0) player.velX = 0; // 口の手前で停止（左から接触）
            if (gameState.input.right) { // 右を押し続けている間だけゲージを溜め、一定時間(≒0.7秒)で退室（誤操作防止）
                exitCharging = true;
                pipeRoomState.exitHold++;
                if (pipeRoomState.exitHold >= PIPE_EXIT_HOLD_FRAMES) { startPipeExitWalk(); return; } // 歩き込み演出→退室
            }
        } else if (feetY > exTop) {
            player.x = exX - player.width; if (player.velX > 0) player.velX = 0; // 土管の胴体（口）の高さで側面に衝突
        }
        // feetY <= exTop（土管より上の空間）は素通り → 下の右壁クランプでのみ止める
    }
    if (!exitCharging) pipeRoomState.exitHold = 0; // 右を離した/口から離れた/上に乗った ら退室ゲージをリセット（継続押しを要求）
    // 右壁（見える壁）で止める：土管の上空でも必ずここで停止（見えない壁をなくす）
    var rightWallX = GAME_WIDTH - PIPE_ROOM_WALL_W;
    if (player.x + player.width > rightWallX) { player.x = rightWallX - player.width; if (player.velX > 0) player.velX = 0; }
    player.animFrame++;
    // ラッキーの間: 宝箱は「上から踏んで」開ける（横歩きでは開かない＝3つから1つを選べる）。1入室1回だけ。
    if (!pipeRoomState.chestPicked) {
        for (var ci = 0; ci < bonusRoomItems.length; ci++) {
            var ch = bonusRoomItems[ci];
            if (ch.type !== 'chest' || ch.opened || ch.vanishing) continue;
            var chFeet = player.y + player.height, chPrevFeet = chFeet - player.velY;
            var chOverX = (player.x + player.width > ch.x + 6) && (player.x < ch.x + ch.width - 6);
            if (chOverX && player.velY >= 0 && chPrevFeet <= ch.y + 4 && chFeet >= ch.y) {
                openLuckyChest(ch);
                break;
            }
        }
    }
    // 報酬取得
    for (var i = 0; i < bonusRoomItems.length; i++) {
        var it = bonusRoomItems[i];
        if (it.collected || !aabb(player, it)) continue;
        if (it.type === 'coin') {
            it.collected = true; gainScore(150); if (soundManager) soundManager.playCoin();
        } else if (it.type === 'heart') {
            it.collected = true;
            if (gameState.lives < 10) gameState.lives++; else gainScore(1000);
            spawnLifeUpEffect(it.x + it.width / 2, it.y);
            if (soundManager) soundManager.playItem();
        } else if (it.type === 'shopitem') {
            if (addToStock(it.itemId)) { it.collected = true; markZukanSeen('item:' + it.itemId); if (soundManager) soundManager.playItem(); }
        } else if (it.type === 'golden_egg') {
            it.collected = true; collectGoldenEgg(false);
            spawnGoldenEggEffect(it.x + it.width / 2, it.y);
            if (soundManager) soundManager.playItem();
        }
    }
}

function openStageShop() {
    // ⚠ボス戦中は絶対に開かない（1.550・ユーザー報告「ショップから出る時にバグになる」の原因）。
    //   おみせはボスの100m手前＝アリーナのすぐ隣に建つので、1.449の「建物に上スワイプで入店」経路から
    //   カカシ戦の最中でも入店できてしまっていた（checkShopTrigger には元からボスガードがあるが、
    //   tryEnterShopAtWorld には無かった）。入店するとボス戦の gameSpeed=0 が savedGameSpeed に保存され、
    //   退店時に playStageBGM() でステージ曲へ戻る＝ボス戦なのに曲が変わり世界が止まったように見える。
    //   入口を全部ふさぐため、呼ばれる側でも弾く。
    if (shopState.active || bossState.active || bossState.bossTriggered) return;
    shopState.active = true;
    shopState.visited = true;
    shopState.savedGameSpeed = gameState.gameSpeed;
    rewardAdState.shopAdUsedThisVisit = false; // ショップ訪問ごとにリセット
    gameState.gameSpeed = 0;
    gameState.gamePaused = true;
    gameState.input.up = false;    // 入力消費（ジャンプ暴発防止）
    gameState.input.jump = false;
    // ショップ中もストックを表示（何を持っているか＝購入判断の参考に）。
    // updateStockUI が shopState.active を見て onclick 無し(使用不可)で描画する。
    updateStockUI();
    preloadShopImages();
    // 怪しい老婆の店だけ専用BGM（1.570・ユーザー提供）。⚠ここは地上のステージショップと**同じ関数**を通るので、
    //   分岐しないと地上の陽気な店の曲が洞窟で鳴る。退店後に地底の曲へ戻すのは playStageBGM 側（1.569）が担当。
    if (soundManager) soundManager.playBGM(undergroundState.active ? 'shopUnderground' : 'shop');
    showStageShopScreen();
}

var shopClosing = false; // 退店確認中フラグ
var shopDepositing = false; // 貯金確認中フラグ

// Android戻る(popstate)専用: ショップは「買う/売る→メニュー→退店確認」と多段UIなのに履歴pushは
// 開店時の1つだけ。popstateで消費された分をここで積み直し、店内に居る限り戻る=1段戻るを維持する
// （積み直さないと2回目の戻るでアプリごと離脱してしまう）。UIの「もどる」ボタンは従来どおり closeStageShop 直呼び。
function stageShopOnBack() {
    closeStageShop();
    if (shopState.active) history.pushState({ screen: 'stageShop' }, '');
}

function closeStageShop() {
    if (shopClosing) return;
    if (Date.now() < shopInputCooldown) return; // 退店あいさつ中などの再入力を無視（タップ貫通と同じガード）
    if (soundManager) soundManager.playCursorMove();
    // buy/sellモードではメニューに戻る
    if (shopMode !== 'menu') {
        returnToShopMenu();
        return;
    }
    // メニューモードでは退店確認ダイアログ表示
    shopConfirmingItem = null;
    shopHighlightedItem = null;
    // 貯金/売却の確認中にAndroid戻るで来た場合のフラグ残留を防ぐ
    // （shopDepositing が残ると、次の任意の「はい」が購入ではなく貯金として実行されてしまう）
    shopDepositing = false;
    shopSellingIndex = null;
    shopClosing = true;
    setKeeperText('shop_keeper_leave_confirm');
    showShopConfirm(true);
}

function confirmCloseShop() {
    if (soundManager) soundManager.playCursorMove();
    showShopConfirm(false);
    shopClosing = false;
    // 退店あいさつ(2秒)〜フェード完了まで入力を無効化。この間に「出る」を再タップされると
    // shopClosing が立ったまま画面が閉じ、次回訪問の最初の「はい」が即退店になってしまうのを防ぐ。
    shopInputCooldown = Date.now() + 3200;
    setKeeperText('shop_keeper_close');
    setTimeout(function() {
        shopExitSequence(function() {
            shopState.active = false;
            gameState.gamePaused = false;
            gameState.gameSpeed = shopState.savedGameSpeed || gameState.gameSpeed;
            playStageBGM();
            hideStageShopScreen();
        });
    }, 2000);
}

function cancelCloseShop() {
    if (soundManager) soundManager.playCursorMove();
    showShopConfirm(false);
    shopClosing = false;
    setKeeperText('shop_keeper_greet');
}

var shopConfirmingItem = null;  // DQ風：確認中のアイテムID
var shopHighlightedItem = null; // DQ風：カーソル選択中のアイテムID（説明表示用）
var shopMode = 'menu'; // 'menu' | 'buy' | 'sell'
var shopInputCooldown = 0; // タップ貫通防止用タイムスタンプ
var shopSellingIndex = null; // 売却確認中のストックインデックス
var shopSellHighlightIndex = null; // 売却モードでハイライト中のストックインデックス

// ─── DQ風はい/いいえ確認ボックス共通エンジン（ステージ/タイトルショップ共用） ───
// 2タップ式: 1回目のタップでカーソル合わせ、同じ選択肢への2回目のタップで決定。
// カーソル状態は内部に保持する。
// ids: { box, keeperBox, itemsList, yes, no } 各要素ID
// onYes / onNo: カーソルが合った状態で再タップされたときの決定処理
// opts.instant: true=単タップで決定（従来はカーソル合わせ→再タップの2段階）
// opts.sideAnchor: true=店員セリフ枠のすぐ右に浮かせる（リストと重ならない＝margin/pointer-events操作なし）
// show(visible, labels): labels={yes,no} でボタン文言を差し替え（省略時は はい/いいえ）
function createConfirmBox(ids, onYes, onNo, opts) {
    opts = opts || {};
    var cursor = null; // null | 'yes' | 'no'
    var labels = null; // {yes,no} 表示文言（かう/かわない・うる/うらない等）

    function updateCursor() {
        var yesEl = document.getElementById(ids.yes);
        var noEl = document.getElementById(ids.no);
        var yesTxt = (labels && labels.yes) || t('shop_confirm_yes');
        var noTxt = (labels && labels.no) || t('shop_confirm_no');
        if (yesEl) {
            yesEl.textContent = (cursor === 'yes' ? '> ' : '　 ') + yesTxt;
            yesEl.style.background = cursor === 'yes' ? 'rgba(255,255,255,0.15)' : '';
        }
        if (noEl) {
            noEl.textContent = (cursor === 'no' ? '> ' : '　 ') + noTxt;
            noEl.style.background = cursor === 'no' ? 'rgba(255,255,255,0.15)' : '';
        }
    }

    function show(visible, newLabels) {
        var box = document.getElementById(ids.box);
        var keeperBox = document.getElementById(ids.keeperBox);
        var itemsList = document.getElementById(ids.itemsList);
        cursor = null;
        labels = newLabels || null;
        // ラベル付き（かう/かわない・うる/うらない）だけセリフ枠のすぐ右へ。
        // はい/いいえ（退店確認など・labels無し）は従来どおりセリフ枠のすぐ下＋リスト退避
        var side = opts.sideAnchor && !!labels;
        if (visible && opts.sideAnchor && box && keeperBox) {
            if (side) {
                // fixed=パネルのoverflow:hiddenにクリップされない。枠のtopは説明の長さに依らず一定
                var kr = keeperBox.getBoundingClientRect();
                box.style.position = 'fixed';
                box.style.left = (kr.right + 8) + 'px';
                box.style.top = kr.top + 'px';
                box.style.marginTop = '0';
            } else {
                // 従来位置（セリフ枠のすぐ下）へ戻す（右横表示の後でも復元できるよう明示指定）
                box.style.position = 'absolute';
                box.style.left = '4px';
                box.style.top = '100%';
                box.style.marginTop = '2px';
            }
        }
        if (visible) {
            if (soundManager) soundManager.playConfirmSelect();
            updateCursor();
        }
        if (box) box.style.display = visible ? 'block' : 'none';
        if (side) {
            // リストと重ならないので退避処理は不要（一覧は表示中もタップ可能）。残留していたら解除
            if (keeperBox) { keeperBox.style.marginBottom = '3px'; keeperBox.style.zIndex = ''; }
            if (itemsList) itemsList.style.pointerEvents = '';
            return;
        }
        // 確認ボックス表示中はmarginを広げてアイテムリストとの重なりを防止
        if (keeperBox) {
            keeperBox.style.marginBottom = visible ? '54px' : '3px';
            keeperBox.style.zIndex = visible ? '12' : '';
        }
        // 確認ダイアログ表示中はアイテムリストのタッチを無効化（タッチ奪取防止）
        if (itemsList) itemsList.style.pointerEvents = visible ? 'none' : '';
    }

    function tap(which, action) {
        if (opts.instant) { // 単タップで決定（ダイアログの表示自体が確認ステップ）
            cursor = null;
            if (soundManager) soundManager.playCursorMove();
            action();
            return;
        }
        if (cursor !== which) {
            cursor = which;
            if (soundManager) soundManager.playCursorMove();
            updateCursor();
            return;
        }
        // カーソルが合った状態で再タップ → 決定
        cursor = null;
        if (soundManager) soundManager.playCursorMove();
        action();
    }

    return {
        show: show,
        tapYes: function() { tap('yes', onYes); },
        tapNo: function() { tap('no', onNo); }
    };
}

// ステージショップの陳列（1.426）: チュートリアル=専用3品（いちごショート/たて/ゼロレモン）・
// 通常ラン=チュートリアル限定品(tutorialOnly)を除く全品
var TUTORIAL_SHOP_IDS = ['shortcake', 'barrier', 'lemon_special'];
function stageShopLineup() {
    if (tutorialState.active) {
        return STAGE_SHOP_ITEMS.filter(function(i) { return TUTORIAL_SHOP_IDS.indexOf(i.id) >= 0; });
    }
    // 地底＝怪しい老婆の店（1.569）。⚠地上の品揃えとは**完全に入れ替える**（混ぜない）。
    //   老婆は地上の店員とは別人で、扱う物も違う、という見せ方にするため。
    if (undergroundState.active) {
        var ups = gameSettings.upgrades || {};
        return STAGE_SHOP_ITEMS.filter(function(i) {
            if (!i.ugOnly) return false;
            // 永続品は買い切り＝所持していたら陳列から外す（maxPerVisit は訪問ごとの制限なので再訪で復活してしまう）
            if (i.permaUpgrade && (ups[i.permaUpgrade] || 0) > 0) return false;
            return true;
        });
    }
    return STAGE_SHOP_ITEMS.filter(function(i) { return !i.tutorialOnly && !i.ugOnly; });
}

// 店員セリフ表示の共通処理（ステージ/タイトルショップ共用）
// ⚠地底（怪しい老婆の店・1.569）は**ここ1箇所でセリフを差し替える**。呼び出し側は10箇所以上あるので、
//   個別に分岐を足すと必ず取りこぼす。「ug_ を前置したキーが辞書にあればそれを使う」方式にして、
//   用意した分だけ老婆の口調になり、無い分は地上の文言にそのまま落ちる（＝壊れない）。
function setKeeperTextFor(elementId, key, replacements) {
    if (undergroundState.active && elementId === 'shopKeeperText') {
        var ugKey = 'ug_' + key;
        if (typeof LANG !== 'undefined' && LANG && LANG.ja && (ugKey in LANG.ja)) key = ugKey;
    }
    var txt = t(key);
    if (replacements) {
        for (var k in replacements) {
            txt = txt.replace('{' + k + '}', replacements[k]);
        }
    }
    var el = document.getElementById(elementId);
    if (el) el.textContent = txt;
}

function setKeeperText(key, replacements) {
    setKeeperTextFor('shopKeeperText', key, replacements);
}

// ステージショップ用 確認ボックス（決定処理: confirmShopBuy / cancelShopBuy）
// 1.418: タイトルショップと同方式＝アイテム1タップでセリフ枠のすぐ右に「かう/かわない・うる/うらない」（単タップ決定）。
// はい/いいえ（貯金/退店確認・labels無し）は従来どおりセリフ枠のすぐ下＋リスト退避
var shopConfirmUI = createConfirmBox(
    { box: 'shopConfirmBox', keeperBox: 'shopKeeperBox', itemsList: 'stageShopItems', yes: 'shopConfirmYes', no: 'shopConfirmNo' },
    function() { confirmShopBuy(); },
    function() { cancelShopBuy(); },
    { instant: true, sideAnchor: true }
);
function showShopConfirm(show, labels) { shopConfirmUI.show(show, labels); }
function handleConfirmYes() { shopConfirmUI.tapYes(); }
function handleConfirmNo() { shopConfirmUI.tapNo(); }

// 店員の顔アイコンを店に合わせて差し替える（1.569）。
// ⚠地底の老婆は専用の画像アセットがまだ無いので、**その場で描いた32pxのドット絵**を data URL にして使う。
//   洞窟タイル/入場土管/宝箱と同じ「画像を増やさず手続きで描く」方針。絵が用意できたら
//   ugKeeperFaceURL() を捨てて images/keeper_crone.png を指すだけで差し替わる。
var _ugKeeperURL = null;
function ugKeeperFaceURL() {
    if (_ugKeeperURL) return _ugKeeperURL;
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#0d1a16'; x.fillRect(0, 0, 32, 32);                 // 洞窟の闇
    x.fillStyle = '#16302a';                                           // 奥の灯り
    x.beginPath(); x.arc(16, 26, 15, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1a1424';                                           // フード（外）
    x.beginPath();
    x.moveTo(16, 3); x.quadraticCurveTo(30, 8, 29, 32);
    x.lineTo(3, 32); x.quadraticCurveTo(2, 8, 16, 3);
    x.closePath(); x.fill();
    x.fillStyle = '#090610';                                           // フードの内側＝顔の影
    x.beginPath();
    x.moveTo(16, 8); x.quadraticCurveTo(25, 12, 24, 32);
    x.lineTo(8, 32); x.quadraticCurveTo(7, 12, 16, 8);
    x.closePath(); x.fill();
    x.fillStyle = '#6b5f52';                                           // 鉤鼻（横向きに突き出す）
    x.fillRect(12, 18, 5, 2); x.fillRect(11, 19, 3, 2); x.fillRect(10, 20, 2, 2);
    x.fillStyle = '#b8ffd0';                                           // 光る目
    x.fillRect(11, 15, 4, 2); x.fillRect(18, 15, 4, 2);
    x.fillStyle = '#3fd894';
    x.fillRect(10, 14, 6, 1); x.fillRect(17, 14, 6, 1);
    x.fillStyle = '#2a2334';                                           // フードの縁のハイライト
    x.fillRect(6, 11, 2, 12); x.fillRect(24, 11, 2, 12);
    _ugKeeperURL = c.toDataURL('image/png');
    return _ugKeeperURL;
}
function applyShopKeeperFace() {
    var el = document.getElementById('shopKeeperImg');
    if (!el) return;
    el.src = undergroundState.active ? ugKeeperFaceURL() : 'images/keeper_stage.png';
}

function showStageShopScreen() {
    shopState.purchaseCounts = {};
    shopConfirmingItem = null;
    shopHighlightedItem = null;
    shopMode = 'menu';
    shopSellingIndex = null;
    shopSellHighlightIndex = null;
    shopDepositing = false;
    shopClosing = false; // 前回訪問の退店確認フラグが残ると「はい」が即退店になるため必ずリセット
    shopInputCooldown = Date.now() + 350;
    applyShopKeeperFace();
    setShopBg('shop01');
    showScreenEl('stageShopScreen');
    // ゲームHUDを非表示（z-index:100がショップz-index:30の上に出るため）
    var uiEl = document.getElementById('ui');
    if (uiEl) uiEl.style.display = 'none';
    history.pushState({ screen: 'stageShop' }, '');
    setKeeperText('shop_keeper_greet');
    showShopConfirm(false);
    // はい/いいえの表示テキスト更新
    var yesEl = document.getElementById('shopConfirmYes');
    var noEl = document.getElementById('shopConfirmNo');
    if (yesEl) yesEl.textContent = '　 ' + t('shop_confirm_yes');
    if (noEl) noEl.textContent = '　 ' + t('shop_confirm_no');
    updateStageShopUI();
}

function returnToShopMenu() {
    if (soundManager) soundManager.playCursorMove();
    shopMode = 'menu';
    shopConfirmingItem = null;
    shopHighlightedItem = null;
    shopSellingIndex = null;
    shopSellHighlightIndex = null;
    shopDepositing = false;
    showShopConfirm(false);
    setKeeperText('shop_keeper_greet');
    shopInputCooldown = Date.now() + 350;
    updateStageShopUI();
}

function hideStageShopScreen() {
    hideScreenEl('stageShopScreen');
    // ゲームHUDを復帰
    var uiEl = document.getElementById('ui');
    if (uiEl) uiEl.style.display = 'block';
    // ストックスロットを復帰
    updateStockUI();
    setShopBg('shop01');  // 次回用にリセット
}

// ── ショップ背景差分切替 ──
// shop01:入店(デフォルト) shop02/03:成功(交互) shop04:所持金不足 shop05:退店
var shopBgCurrent = 'shop01';
var shopSuccessBgToggle = false; // 成功時にshop02/shop03を交互に切替
function getSuccessShopBg() {
    shopSuccessBgToggle = !shopSuccessBgToggle;
    return shopSuccessBgToggle ? 'shop02' : 'shop03';
}
var shopBgTimer = null;
var shopImgsPreloaded = false;
function preloadShopImages() {
    if (shopImgsPreloaded) return;
    shopImgsPreloaded = true;
    for (var i = 1; i <= 5; i++) {
        var img = new Image();
        img.src = 'images/shop0' + i + '.jpg';
    }
}

function setShopBg(name, revertMs) {
    var bgEl = document.getElementById('shopBgImg');
    if (!bgEl) return;
    shopBgCurrent = name;
    // 地底＝怪しい老婆の店（1.569）は地上の店の背景（明るい木の店内 shop01〜05）を使わない。
    // ✅1.570で専用の一枚絵を配置（OpenAI生成・洞窟の中の薬屋）。⚠**中央〜下が暗い絵を選んである**＝
    //   商品リストと老婆のセリフがその上に乗るため。明るい絵に差し替えるとUIが読めなくなる。
    // ⚠画像の読み込みに失敗しても真っ黒/前の絵の残りにならないよう、下地の色は必ず塗っておく。
    // ⚠地上のように名前(shop01〜05)で切り替えず1枚に固定＝老婆の店は1軒しかない。
    if (undergroundState.active) {
        bgEl.style.backgroundImage =
            "url('images/ug_shop01.jpg'), linear-gradient(180deg, #0a0812 0%, #140f1e 45%, #1d1526 78%, #0c0a12 100%)";
        bgEl.style.backgroundColor = '#0a0812';
        if (shopBgTimer) { clearTimeout(shopBgTimer); shopBgTimer = null; }
        return;
    }
    bgEl.style.backgroundImage = "url('images/" + name + ".jpg')";
    if (shopBgTimer) { clearTimeout(shopBgTimer); shopBgTimer = null; }
    if (revertMs) {
        shopBgTimer = setTimeout(function() {
            shopBgTimer = null;
            setShopBg('shop01');
        }, revertMs);
    }
}

var shopExiting = false;
function shopExitSequence(callback) {
    if (shopExiting) return;
    shopExiting = true;
    setShopBg('shop05');
    var bgEl = document.getElementById('shopBgImg');
    // UIパネル（左側=child1）をフェードアウト
    var panels = document.querySelectorAll('#shopUIPanel');
    panels.forEach(function(p) { p.style.transition = 'opacity 0.4s ease'; p.style.opacity = '0'; });
    setTimeout(function() {
        if (bgEl) { bgEl.style.opacity = '0'; }
        setTimeout(function() {
            if (bgEl) { bgEl.style.opacity = '1'; }
            panels.forEach(function(p) { p.style.opacity = '1'; p.style.transition = ''; });
            shopExiting = false;
            if (callback) callback();
        }, 350);
    }, 800);
}

function renderStageShopItem(item, purchaseCount) {
    var canBuy = gameState.score >= item.price && purchaseCount < item.maxPerVisit;
    if (item.stockItem && !stockHasRoom(item.id)) canBuy = false; // 永続枠/通常枠のどちらにも空きが無ければ買えない
    // ライフ上限チェック（回復薬はライフ10で買えない）
    var isHpItem = (item.id === 'heal' || item.id === 'shortcake'); // 即時回復系（そば/いちごショート）
    if (isHpItem && gameState.lives >= 10) canBuy = false;
    var soldOut = purchaseCount >= item.maxPerVisit;
    var hpFull = (isHpItem && gameState.lives >= 10);
    // DQ風メニュー項目：> アイテム名　　　価格
    var isConfirming = (shopConfirmingItem === item.id);
    var isHighlighted = (shopHighlightedItem === item.id);
    var cursor = (isConfirming || isHighlighted) ? '>' : '　';
    var highlighted = isConfirming || isHighlighted;
    var textColor = canBuy ? '#fff' : 'rgba(180,180,180,0.5)';
    var priceText = soldOut ? t('shop_sold_out') : (hpFull ? '―' : item.price + t('currency_unit'));
    return '<div data-item-id="' + item.id + '" class="shop-row shop-row-item' +
        (highlighted ? ' hl' : '') + (canBuy ? '' : ' dim') + '">' +
        '<span class="shop-cursor">' + cursor + '</span>' +
        (item.iconImg
            ? '<img src="' + item.iconImg + '" width="18" height="18" class="shop-icon-img">'
            : '<span class="shop-icon-txt">' + item.icon + '</span>') +
        '<span class="shop-name" style="color:' + textColor + ';">' + escapeHtml(t(item.nameKey)) + '</span>' +
        '<span class="shop-price" style="color:#ffd700;">' + escapeHtml(priceText) + '</span>' +
    '</div>';
}

function renderShopMenuItem(id, icon, text) {
    var isHighlighted = (shopHighlightedItem === id);
    var cursor = isHighlighted ? '>' : '　';
    return '<div data-item-id="' + id + '" class="shop-row shop-row-menu' + (isHighlighted ? ' hl' : '') + '">' +
        '<span class="shop-cursor">' + cursor + '</span>' +
        '<span class="shop-icon-txt">' + icon + '</span>' +
        '<span class="shop-name">' + escapeHtml(text) + '</span>' +
    '</div>';
}

// 売却対象（ストック枠）の解決：表示indexから { id, perma, index } を返す（売れない枠は null）。
// 表示index規則は useStockItem と同じ＝ 0..permaLevel()-1 が永続枠(まほうのポーチ)、それ以降が通常枠。
// perma:true なら index は永続枠の位置、false なら stockState.items の位置。
function stockSlotSellTarget(displayIndex) {
    var pl = permaLevel();
    if (displayIndex < pl) {
        var ps = stockState.perma[displayIndex];
        // 永続枠は「中身があり かつ 今ラン未使用」のものだけ売れる（使用済み=空表示なので対象外）
        if (ps && ps.id && !ps.used) return { id: ps.id, perma: true, index: displayIndex };
        return null;
    }
    var ni = displayIndex - pl;
    var it = stockState.items[ni];
    return it ? { id: it.id, perma: false, index: ni } : null;
}

// 売却できる枠の表示indexリスト（永続枠=中身あり&未使用 / 通常枠=アイテムあり）。ポーチも通常枠も区別なく対象。
function sellableStockSlots() {
    var pl = permaLevel();
    var list = [];
    for (var i = 0; i < pl; i++) {
        var ps = stockState.perma[i];
        if (ps && ps.id && !ps.used) list.push(i);
    }
    for (var n = 0; n < stockState.items.length; n++) list.push(pl + n);
    return list;
}

function renderSellItem(displayIndex) {
    var target = stockSlotSellTarget(displayIndex);
    if (!target) return '';
    var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === target.id; });
    if (!shopItem) return '';
    var sellPrice = Math.floor(shopItem.price / 2);
    var isHighlighted = (shopSellHighlightIndex === displayIndex);
    var isConfirming = (shopSellingIndex === displayIndex);
    var highlighted = isHighlighted || isConfirming;
    var cursor = highlighted ? '>' : '　';
    return '<div data-item-id="_sell_' + displayIndex + '" class="shop-row shop-row-item' + (highlighted ? ' hl' : '') + '">' +
        '<span class="shop-cursor">' + cursor + '</span>' +
        (shopItem.iconImg
            ? '<img src="' + shopItem.iconImg + '" width="18" height="18" class="shop-icon-img">'
            : '<span class="shop-icon-txt">' + shopItem.icon + '</span>') +
        '<span class="shop-name" style="color:#fff;">' + escapeHtml(t(shopItem.nameKey)) + '</span>' +
        '<span class="shop-price" style="color:#ffd700;">' + sellPrice + t('currency_unit') + '</span>' +
    '</div>';
}

function updateStageShopUI() {
    document.getElementById('stageShopScore').innerHTML = _ic('icon_money.png', 'ui-icon-sm') + ' ' + gameState.score + t('currency_unit') +
        ' <span style="margin-left:10px; white-space:nowrap;">🥚 ' + (gameSettings.goldenEggs || 0) + '</span>';
    var livesEl = document.getElementById('stageShopLives');
    if (livesEl) livesEl.innerHTML = _ic('icon_lives.png', 'ui-icon-sm') + ' ' + gameState.lives;
    var container = document.getElementById('stageShopItems');
    var closeBtn = document.getElementById('stageShopCloseBtn');
    var html = '';

    if (shopMode === 'menu') {
        // メニューモード：買う/売る/貯金/出る
        html += renderShopMenuItem('_menu_buy', _ic('icon_cart.png'), t('shop_menu_buy'));
        html += renderShopMenuItem('_menu_sell', _ic('icon_money.png'), t('shop_menu_sell'));
        // 貯金メニュー項目
        var depAmt = Math.floor(gameState.score * 0.5);
        var depLabel = t('shop_deposit_btn');
        if (shopState.deposited) {
            depLabel = t('shop_deposited');
        } else if (gameState.score > 0) {
            depLabel = depLabel + ' (' + depAmt + t('currency_unit') + ')';
        }
        if (!tutorialState.active) html += renderShopMenuItem('_menu_deposit', _ic('icon_bank.png'), depLabel); // チュートリアルでは貯金を隠す（永続資産の稼ぎ場防止）
        // リワード広告ボーナス（チュートリアルでは出さない）。未ロード時は「準備中…」表示（A案・押下は可）
        if (!rewardAdState.shopAdUsedThisVisit && !gameSettings.adFree && !tutorialState.active) {
            var _adRdy = (typeof window.isRewardReady !== 'function') || window.isRewardReady();
            html += renderShopMenuItem('_menu_reward_ad', _ic('icon_money.png'), _adRdy ? t('reward_ad_shop_money') : t('ad_preparing_btn'));
        }
        // 貯金プレビュー情報
        if (!shopState.deposited && gameState.score > 0 && !tutorialState.active) {
            html += '<div style="color:rgba(136,204,255,0.7); font-family:DotGothic16,monospace; font-size:clamp(7px,1.3vw,10px); text-align:center; padding:1px 6px; text-shadow:0 1px 2px rgba(0,0,0,0.8);">' +
                t('shop_deposit_preview', { sf: gameSettings.savings, st: gameSettings.savings + depAmt, cf: gameState.score, ct: gameState.score - depAmt }) + '</div>';
        } else {
            html += '<div style="color:rgba(136,204,255,0.7); font-family:DotGothic16,monospace; font-size:clamp(7px,1.3vw,10px); text-align:center; padding:1px 6px; text-shadow:0 1px 2px rgba(0,0,0,0.8);">' +
                t('shop_current_savings', { savings: gameSettings.savings + t('currency_unit') }) + '</div>';
        }
        html += renderShopMenuItem('_menu_leave', _ic('icon_door.png'), t('shop_close').replace('&gt; ', '').replace('> ', ''));
        if (closeBtn) closeBtn.parentElement.style.display = 'none';
    } else if (shopMode === 'buy') {
        // 購入モード：商品リスト（チュートリアルは専用ラインナップ）
        var lineup = stageShopLineup();
        for (var i = 0; i < lineup.length; i++) {
            var item = lineup[i];
            var count = shopState.purchaseCounts[item.id] || 0;
            html += renderStageShopItem(item, count);
        }
        if (closeBtn) {
            closeBtn.innerHTML = t('shop_back');
            closeBtn.parentElement.style.display = 'flex';
        }
    } else if (shopMode === 'sell') {
        // 売却モード：ストックアイテムリスト（通常枠＋まほうのポーチを区別なく列挙）
        var sellSlots = sellableStockSlots();
        if (sellSlots.length === 0) {
            html += '<div style="color:rgba(255,255,255,0.5); font-family:DotGothic16,monospace; font-size:clamp(9px,1.8vw,12px); padding:8px 6px; text-align:center;">---</div>';
        } else {
            for (var j = 0; j < sellSlots.length; j++) {
                html += renderSellItem(sellSlots[j]);
            }
        }
        if (closeBtn) {
            closeBtn.innerHTML = t('shop_back');
            closeBtn.parentElement.style.display = 'flex';
        }
    }

    container.innerHTML = html;
    // 旧 #depositBtn/#depositInfo の更新コードは1.406で撤去（1.399のメニュー化以降は常時非表示の死にUIで、
    // レイアウト変更で再表示されると「確認なしの即貯金」ボタンが復活するリスクだった。貯金は _menu_deposit 項目から）
}

// DQ風：デスクトップ用ホバープレビュー（マウスオーバーで説明表示）
function previewShopItem(itemId) {
    if (shopConfirmingItem) return; // 確認中は上書きしない
    if (shopMode !== 'buy') return; // 購入モード以外ではプレビューしない
    if (shopConfirmingItem) return; // 確認ダイアログ表示中はhoverで説明を上書きしない
    var item = STAGE_SHOP_ITEMS.find(function(i) { return i.id === itemId; });
    if (!item) return;
    shopHighlightedItem = itemId;
    var el = document.getElementById('shopKeeperText');
    if (el) el.textContent = t(item.descKey);
    updateStageShopUI();
}

// DQ風：アイテム選択 → 説明表示 → 確認ダイアログ
function selectShopItem(itemId) {
    // タップ貫通防止：モード遷移直後の入力を無視
    if (Date.now() < shopInputCooldown) return;
    // ── メニューモード ──
    if (shopMode === 'menu') {
        if (itemId === '_menu_buy') {
            if (soundManager) soundManager.playCursorMove();
            shopMode = 'buy';
            shopHighlightedItem = null;
            setKeeperText('shop_keeper_buy_greet');
            shopInputCooldown = Date.now() + 350;
            updateStageShopUI();
        } else if (itemId === '_menu_sell') {
            if (sellableStockSlots().length === 0) {
                setKeeperText('shop_keeper_sell_empty');
                if (soundManager) soundManager.playDamage();
                return;
            }
            if (soundManager) soundManager.playCursorMove();
            shopMode = 'sell';
            shopSellHighlightIndex = null;
            setKeeperText('shop_keeper_sell_greet');
            shopInputCooldown = Date.now() + 350;
            updateStageShopUI();
        } else if (itemId === '_menu_deposit') {
            if (shopState.deposited) {
                if (soundManager) soundManager.playDamage();
                return;
            }
            if (gameState.score <= 0) {
                setKeeperText('shop_keeper_deposit_zero');
                if (soundManager) soundManager.playDamage();
                return;
            }
            if (soundManager) soundManager.playCursorMove();
            var depAmt = Math.floor(gameState.score * 0.5);
            shopDepositing = true;
            setKeeperText('shop_keeper_deposit_confirm', { amount: depAmt });
            showShopConfirm(true);
        } else if (itemId === '_menu_reward_ad') {
            if (rewardAdState.shopAdUsedThisVisit) {
                if (soundManager) soundManager.playDamage();
                return;
            }
            if (soundManager) soundManager.playCursorMove();
            adShopBonus();
        } else if (itemId === '_menu_leave') {
            if (soundManager) soundManager.playCursorMove();
            shopClosing = true;
            shopHighlightedItem = null;
            setKeeperText('shop_keeper_leave_confirm');
            showShopConfirm(true);
        }
        return;
    }

    // ── 売却モード ──
    if (shopMode === 'sell') {
        if (itemId.indexOf('_sell_') !== 0) return;
        var sellIdx = parseInt(itemId.replace('_sell_', ''));
        if (isNaN(sellIdx)) return;
        var sellTarget = stockSlotSellTarget(sellIdx);
        if (!sellTarget) return;
        var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === sellTarget.id; });
        if (!shopItem) return;
        // 1タップで選択＝説明+売値＋すぐ右に「うる/うらない」（1.418: タイトルショップと同方式・2度タップ廃止）。
        // 別の行をタップすれば選択がそのまま切り替わる
        var sellPrice = Math.floor(shopItem.price / 2);
        shopSellHighlightIndex = sellIdx;
        shopSellingIndex = sellIdx;
        var el = document.getElementById('shopKeeperText');
        if (el) el.textContent = t(shopItem.descKey) + '\n' + t('shop_keeper_sell_confirm', { item: t(shopItem.nameKey), price: sellPrice });
        showShopConfirm(true, tshopSellLabels());
        updateStageShopUI();
        return;
    }

    // ── 購入モード ──
    var item = STAGE_SHOP_ITEMS.find(function(i) { return i.id === itemId; });
    if (!item) return;
    // 1タップで選択（1.418: 2度タップ廃止）。買えない事情があれば説明＋理由を案内してダイアログは出さない。
    // 買える場合は説明+価格＋すぐ右に「かう/かわない」。購入時の再検証は buyStageItem 側にもある
    shopHighlightedItem = itemId;
    var bought = shopState.purchaseCounts[itemId] || 0;
    var blockKey = null;
    var moneyBg = false;
    if (bought >= item.maxPerVisit) { blockKey = 'shop_keeper_sold_out'; moneyBg = true; }
    else if ((item.id === 'heal' || item.id === 'shortcake') && gameState.lives >= 10) { blockKey = 'shop_keeper_heal_maxhp'; }
    else if (gameState.score < item.price) { blockKey = 'shop_keeper_no_money'; moneyBg = true; }
    else if (item.stockItem && !stockHasRoom(item.id) && !isTempReviveCase(item.id)) { blockKey = 'shop_keeper_stock_full'; }
    if (blockKey) {
        shopConfirmingItem = null;
        showShopConfirm(false);
        var blockEl = document.getElementById('shopKeeperText');
        if (blockEl) blockEl.textContent = t(item.descKey) + '\n' + t(blockKey); // 説明は見せつつ買えない理由を添える
        if (soundManager) soundManager.playDamage();
        if (moneyBg) setShopBg('shop04', 1200);
        updateStageShopUI();
        return;
    }
    if (item.stockItem && !stockHasRoom(item.id) && isTempReviveCase(item.id)) {
        // 全枠ポーチ: 復活薬は永続保存できないが「今回かぎり」で購入可＝保存不可を説明して かう/かわない へ
        shopConfirmingItem = itemId;
        setKeeperText('shop_keeper_revive_nosave_confirm', { price: item.price });
        showShopConfirm(true, tshopBuyLabels());
        updateStageShopUI();
        return;
    }
    // 説明+価格＋確認ダイアログ
    shopConfirmingItem = itemId;
    var descEl = document.getElementById('shopKeeperText');
    if (descEl) descEl.textContent = t(item.descKey) + '\n' + t('shop_keeper_confirm', { item: t(item.nameKey), price: item.price });
    showShopConfirm(true, tshopBuyLabels());
    updateStageShopUI();
}

// ── 売却実行 ──
function executeSellItem() {
    showShopConfirm(false);
    var idx = shopSellingIndex;
    shopSellingIndex = null;
    shopSellHighlightIndex = null;
    var target = stockSlotSellTarget(idx);
    if (!target) return;
    var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === target.id; });
    if (!shopItem) return;
    var sellPrice = Math.floor(shopItem.price / 2);
    if (target.perma) {
        // まほうのポーチ(永続枠): この枠を空ける。永続保存(permaStock)も消す＝翌ラン補充されない（無限売却の防止）。
        // ポーチのLv(pouchLevel)は維持＝金枠自体は残り、拾った品でまた埋められる。
        stockState.perma[target.index] = { id: '', used: false };
        if (gameSettings.permaStock) gameSettings.permaStock[target.index] = '';
        saveSettings();
    } else {
        // 通常枠: 詰め配列から除去
        stockState.items.splice(target.index, 1);
    }
    // お金を加算
    gameState.score += sellPrice;
    if (soundManager) soundManager.playItem();
    setKeeperText('shop_keeper_sell_ok', { price: sellPrice });
    setShopBg(getSuccessShopBg(), 1500);
    updateStageShopUI();
    updateStockUI(); // 売却で減った分を浮いてるストック表示にも反映（枠からアイテムを消す）
    // 売れるものが無くなったらメニューに戻る
    if (sellableStockSlots().length === 0) {
        setTimeout(function() {
            returnToShopMenu();
        }, 1500);
    }
}

function confirmShopBuy() {
    // 退店確認中なら退店実行
    if (shopClosing) { confirmCloseShop(); return; }
    // 貯金確認中なら貯金実行
    if (shopDepositing) {
        showShopConfirm(false);
        shopDepositing = false;
        depositScore();
        updateStageShopUI();
        return;
    }
    // 売却確認中なら売却実行
    if (shopSellingIndex !== null) { executeSellItem(); return; }
    showShopConfirm(false);
    if (!shopConfirmingItem) return;
    var itemId = shopConfirmingItem;
    shopConfirmingItem = null;
    buyStageItem(itemId);
}

function cancelShopBuy() {
    if (soundManager) soundManager.playCursorMove();
    // 退店確認中ならキャンセル
    if (shopClosing) { cancelCloseShop(); return; }
    // 貯金確認中ならキャンセル
    if (shopDepositing) {
        showShopConfirm(false);
        shopDepositing = false;
        setKeeperText('shop_keeper_greet');
        updateStageShopUI();
        return;
    }
    showShopConfirm(false);
    shopConfirmingItem = null;
    shopHighlightedItem = null;
    shopSellingIndex = null;
    shopSellHighlightIndex = null;
    if (shopMode === 'sell') {
        setKeeperText('shop_keeper_sell_greet');
    } else if (shopMode === 'buy') {
        setKeeperText('shop_keeper_buy_greet');
    } else {
        setKeeperText('shop_keeper_greet');
    }
    updateStageShopUI();
}

function buyStageItem(itemId) {
    var item = STAGE_SHOP_ITEMS.find(function(i) { return i.id === itemId; });
    if (!item) return false;
    // ライフ上限チェック（回復薬はライフ10で買えない）。⚠極楽まんじゅう(1.569)も同じ扱いにする＝
    //   満タンで買わせて0回復、という損な買い物を成立させない。
    if ((item.id === 'heal' || item.id === 'shortcake' || item.id === 'ug_manju') && gameState.lives >= 10) {
        setKeeperText('shop_keeper_heal_maxhp');
        if (soundManager) soundManager.playDamage();
        shopConfirmingItem = null;
        updateStageShopUI();
        return false;
    }
    if (gameState.score < item.price) {
        setKeeperText('shop_keeper_no_money');
        if (soundManager) soundManager.playDamage();
        setShopBg('shop04', 1200);
        shopConfirmingItem = null;
        updateStageShopUI();
        return false;
    }
    var bought = shopState.purchaseCounts[itemId] || 0;
    if (bought >= item.maxPerVisit) {
        setKeeperText('shop_keeper_sold_out');
        if (soundManager) soundManager.playDamage();
        setShopBg('shop04', 1200);
        shopConfirmingItem = null;
        updateStageShopUI();
        return false;
    }
    if (item.stockItem) {
        if (stockHasRoom(itemId)) {
            addToStock(itemId); // 空き保証済み→未割当永続枠 or 通常枠へ
        } else if (isTempReviveCase(itemId)) {
            // 全枠ポーチ(通常枠0)の例外: 復活薬だけ通常枠へオーバーフロー追加。
            // stockState.items は毎ラン resetGame で =[] になり localStorage にも保存されない＝持ち越し不可。
            // 死亡時の自動復活は tryRevive がこの配列を走査して発動する。
            stockState.items.push({ id: itemId });
            updateStockUI();
        } else {
            // 有料購入は満杯なら弾く（貯金換算③には落とさない＝金を払って半額戻りの損を防ぐ）。
            setKeeperText('shop_keeper_stock_full');
            if (soundManager) soundManager.playDamage();
            setShopBg('shop04', 1200);
            shopConfirmingItem = null;
            updateStageShopUI();
            return false;
        }
    }
    gameState.score -= item.price;
    shopState.purchaseCounts[itemId] = bought + 1;
    markZukanSeen('item:' + itemId); // ずかん: ショップ品を購入＝発見
    var livesBefore = gameState.lives;
    // 永続アップグレード品（地底の主の加護・1.569）: effect() ではなく gameSettings.upgrades に積んで保存する。
    // ⚠applyUpgrades は**ラン開始時**にしか走らないので、その場で効かせたい値はここで直接触ること
    //   （加護は「次に地底へ入る時」に効くので、ここでは保存だけでよい）。
    if (item.permaUpgrade) {
        gameSettings.upgrades = gameSettings.upgrades || {};
        gameSettings.upgrades[item.permaUpgrade] = 1;
        saveSettings();
    } else if (!item.stockItem) item.effect();
    // たちぐいそば/いちごショート：フルスクリーン演出＋実回復量の表示（画像だけ差し替えて同方式）
    if (item.id === 'heal' && typeof showSobaScene === 'function') showSobaScene(gameState.lives - livesBefore);
    if (item.id === 'shortcake' && typeof showSobaScene === 'function') showSobaScene(gameState.lives - livesBefore, 'images/shortcake_scene.jpg');
    // 極楽まんじゅう（1.569）: 専用の一枚絵（食べるシーン）。⚠画像が未納品でも壊れないよう
    //   showSobaScene 側で読み込み失敗を握りつぶす（下の onerror）。
    if (item.id === 'ug_manju' && typeof showSobaScene === 'function') showSobaScene(gameState.lives - livesBefore, 'images/manju_scene.jpg');
    if (soundManager) soundManager.playItem();
    setKeeperText('shop_keeper_buy_ok');
    setShopBg(getSuccessShopBg(), 1500);
    shopConfirmingItem = null;
    updateStageShopUI();
    return true;
}

function depositScore() {
    if (shopState.deposited) return false;
    if (gameState.score <= 0) {
        setKeeperText('shop_keeper_deposit_zero');
        if (soundManager) soundManager.playDamage();
        return false;
    }
    var depositAmount = Math.floor(gameState.score * 0.5);
    gameSettings.savings += depositAmount;
    gameState.score = gameState.score - depositAmount;
    shopState.deposited = true;
    saveSettings();
    if (soundManager) soundManager.playCoin();
    setKeeperText('shop_keeper_deposit_ok', { amount: depositAmount, total: gameSettings.savings });
    setShopBg(getSuccessShopBg(), 1500);
    updateStageShopUI();
    return true;
}

// ── タイトルショップ ──
var tshopHighlightedItem = null;  // カーソル選択中のアイテムID
var tshopConfirmingItem = null;   // 購入確認中のアイテムID
var tshopMode = 'menu';           // タイトルショップのモード 'menu'|'buy'|'sell'（ステージショップ同様：最初にメニューで選択）
var tshopLeaving = false;         // 退店確認中フラグ

function formatTshopPrice(num) {
    return String(num);
}

function setTshopKeeperText(key, replacements) {
    setKeeperTextFor('tshopKeeperText', key, replacements);
}

// タイトルショップ用 確認ボックス（決定処理: confirmTshopBuy / cancelTshopBuy）
// 1.416: アイテム1タップで説明枠のすぐ右に「かう/かわない」を出す方式（単タップ決定・一覧は表示中もタップ可＝選択切り替え）
var tshopConfirmUI = createConfirmBox(
    { box: 'tshopConfirmBox', keeperBox: 'tshopKeeperBox', itemsList: 'titleShopList', yes: 'tshopConfirmYes', no: 'tshopConfirmNo' },
    function() { confirmTshopBuy(); },
    function() { cancelTshopBuy(); },
    { instant: true, sideAnchor: true }
);
function showTshopConfirm(show, labels) { tshopConfirmUI.show(show, labels); }
function tshopBuyLabels() { return { yes: t('shop_confirm_buy'), no: t('shop_confirm_nobuy') }; }
function tshopSellLabels() { return { yes: t('shop_confirm_sell'), no: t('shop_confirm_nosell') }; }
function handleTshopConfirmYes() { tshopConfirmUI.tapYes(); }
function handleTshopConfirmNo() { tshopConfirmUI.tapNo(); }

function requestTshopLeave() {
    if (tshopConfirmingItem || tshopLeaving) return;
    tshopLeaving = true;
    if (soundManager) soundManager.playCursorMove();
    setTshopKeeperText('tshop_keeper_leave_confirm');
    showTshopConfirm(true);
}

function confirmTshopBuy() {
    if (tshopLeaving) {
        showTshopConfirm(false);
        tshopLeaving = false;
        setTshopKeeperText('tshop_keeper_leave_bye');
        setTimeout(function() { closeTitleShop(); }, 600);
        return;
    }
    if (!tshopConfirmingItem) return;
    if (tshopConfirmingItem.indexOf('egg:') === 0) { confirmEggBuy(tshopConfirmingItem.slice(4)); return; } // エッグこうかん確定
    if (tshopConfirmingItem.indexOf('_psell_') === 0 || tshopConfirmingItem.indexOf('_nsell_') === 0) { confirmTshopSell(tshopConfirmingItem); return; } // 売却確定(ポーチ/通常)
    var upgrade = TITLE_SHOP_UPGRADES.find(function(u) { return u.id === tshopConfirmingItem; });
    if (!upgrade) return;
    var currentLevel = (gameSettings.upgrades || {})[tshopConfirmingItem] || 0;
    var price = upgrade.prices[currentLevel];
    // お金不足チェック
    if (gameSettings.savings < price) {
        if (soundManager) soundManager.playDamage();
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        setTshopKeeperText('tshop_keeper_cant_afford');
        updateTitleShopUI();
        return;
    }
    gameSettings.savings -= price;
    if (!gameSettings.upgrades) gameSettings.upgrades = {};
    gameSettings.upgrades[tshopConfirmingItem] = currentLevel + 1;
    // アバター商品（1.509 侍ぴよ〜）: 購入でスキン所持を付与（きせかえに出る）。upgradesフラグはMAX表示/図鑑用
    if (upgrade.grantSkin) {
        if (!gameSettings.ownedSkins) gameSettings.ownedSkins = [];
        if (gameSettings.ownedSkins.indexOf(upgrade.grantSkin) < 0) gameSettings.ownedSkins.push(upgrade.grantSkin);
    }
    saveSettings();
    applyUpgrades(); // 購入効果を即反映（stock_expand の maxSlots 再計算＋updateStockUI）。無いと枠増が再入場まで表示されない
    if (soundManager) soundManager.playItem();
    showTshopConfirm(false);
    tshopConfirmingItem = null;
    setTshopKeeperText(upgrade.grantSkin ? 'tshop_keeper_egg_bought' : 'tshop_keeper_bought'); // スキンは「きせかえで装備」案内
    updateTitleShopUI();
}

function cancelTshopBuy() {
    if (soundManager) soundManager.playCursorMove();
    if (tshopLeaving) {
        showTshopConfirm(false);
        tshopLeaving = false;
        setTshopKeeperText('tshop_keeper_greet');
        return;
    }
    showTshopConfirm(false);
    tshopConfirmingItem = null;
    // モードに合った店員あいさつへ戻す（買う=何を買うのだ？/売る=何を売るのだ？）
    setTshopKeeperText(tshopMode === 'buy' ? 'tshop_keeper_buy_greet' : tshopMode === 'sell' ? 'tshop_keeper_sell_greet' : 'tshop_keeper_greet');
    updateTitleShopUI();
}

function selectTshopItem(upgradeId) {
    // 退店確認が開いたまま項目をタップしたら、退店を取り下げて通常操作へ
    // （ダイアログ表示中も一覧はタップ可能なので、ここで状態をほどく）
    if (tshopLeaving) {
        tshopLeaving = false;
        showTshopConfirm(false);
        setTshopKeeperText('tshop_keeper_greet');
    }
    // ── メニューモード（ステージショップ同様：買う/売る/広告/出る をまず選ぶ）──
    if (tshopMode === 'menu') {
        if (upgradeId === '_tmenu_buy') {
            if (soundManager) soundManager.playCursorMove();
            tshopMode = 'buy'; tshopHighlightedItem = null; tshopConfirmingItem = null; showTshopConfirm(false);
            setTshopKeeperText('tshop_keeper_buy_greet');
            updateTitleShopUI();
        } else if (upgradeId === '_tmenu_sell') {
            if (!tshopHasSellable()) { // 売れるものが無ければメニューのまま案内
                setTshopKeeperText('tshop_sell_empty');
                if (soundManager) soundManager.playDamage();
                return;
            }
            if (soundManager) soundManager.playCursorMove();
            tshopMode = 'sell'; tshopHighlightedItem = null; tshopConfirmingItem = null; showTshopConfirm(false);
            setTshopKeeperText('tshop_keeper_sell_greet');
            updateTitleShopUI();
        } else if (upgradeId === '_tmenu_reward_ad') {
            adTshopBonus(); // クールダウン判定は adTshopBonus 内（待機中は案内＋ダメージ音）
        } else if (upgradeId === '_tmenu_leave') {
            requestTshopLeave();
        }
        return;
    }
    if (upgradeId && upgradeId.indexOf('egg:') === 0) { selectEggShopItem(upgradeId.slice(4)); return; } // エッグこうかん行
    if (upgradeId && (upgradeId.indexOf('_psell_') === 0 || upgradeId.indexOf('_nsell_') === 0)) { selectTshopSell(upgradeId); return; } // 売却行(ポーチ/通常)
    var upgrade = TITLE_SHOP_UPGRADES.find(function(u) { return u.id === upgradeId; });
    if (!upgrade) return;
    var currentLevel = (gameSettings.upgrades || {})[upgradeId] || 0;
    var isMax = currentLevel >= upgrade.maxLevel;
    // 課金アイテム（スターターパック購入済みなら解放）: 説明のみ・ダイアログは出さない
    if (upgrade.premium && !gameSettings.purchased['starter_pack']) {
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        if (soundManager) soundManager.playCursorMove();
        tshopHighlightedItem = upgradeId;
        var premEl = document.getElementById('tshopKeeperText');
        var premDesc = t(upgrade.descKey);
        var premEffArr = (gameSettings.language === 'en' && upgrade.effectDescEn) ? upgrade.effectDescEn : upgrade.effectDesc;
        if (currentLevel < upgrade.maxLevel) premDesc += ' → ' + premEffArr[currentLevel];
        if (premEl) premEl.innerHTML = (upgrade.iconImg ? '<img src="' + upgrade.iconImg + '" class="ui-icon">' : '') + ' ' + escapeHtml(t(upgrade.nameKey)) + '\n' + escapeHtml(premDesc) + '\n<span style="color:#ff69b4;">' + escapeHtml(t('tshop_price_preparing')) + '</span>';
        updateTitleShopUI();
        return;
    }
    // MAX到達: 案内のみ・ダイアログは出さない。アバター(grantSkin)は「強化済み」でなく
    // 「きせかえで装備」と案内する（アバターは強化でなく所持アイテムのため・1.521ユーザー指摘）。
    if (isMax) {
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        if (soundManager) { if (upgrade.grantSkin) soundManager.playCursorMove(); else soundManager.playDamage(); }
        tshopHighlightedItem = upgradeId;
        setTshopKeeperText(upgrade.grantSkin ? 'tshop_keeper_owned_avatar' : 'tshop_keeper_max');
        updateTitleShopUI();
        return;
    }
    var price = upgrade.prices[currentLevel];
    // 1タップで選択＝説明＋すぐ右に「かう/かわない」ダイアログ（1.416: 同じ行を2度タップする方式を廃止）。
    // 別の行をタップすればダイアログを閉じずに選択がそのまま切り替わる
    tshopHighlightedItem = upgradeId;
    tshopConfirmingItem = upgradeId;
    var effArr = (gameSettings.language === 'en' && upgrade.effectDescEn) ? upgrade.effectDescEn : upgrade.effectDesc;
    var desc = t(upgrade.descKey) + ' → ' + effArr[currentLevel];
    var el = document.getElementById('tshopKeeperText');
    if (el) el.innerHTML = (upgrade.iconImg ? '<img src="' + upgrade.iconImg + '" class="ui-icon">' : '') + ' ' + escapeHtml(t(upgrade.nameKey)) + '\n' + escapeHtml(desc) +
        '\n<span style="color:#ffd700;">' + escapeHtml(t('tshop_buy_q', { price: formatTshopPrice(price) + t('currency_unit') })) + '</span>';
    showTshopConfirm(true, tshopBuyLabels());
    updateTitleShopUI();
}

// ── タイトルショップの売却（ステージショップと同様に「買う/売る」を選び、売るモードで一覧）──
// 通常ストックも まほうのポーチ(永続枠)も区別なく 半額で貯金へ売却。ポーチは枠が空く(Lvは維持・次ランで拾った品が入る)。
function tshopSellItemId(key) {
    if (key.indexOf('_psell_') === 0) return (gameSettings.permaStock || [])[parseInt(key.slice(7), 10)] || '';
    if (key.indexOf('_nsell_') === 0) { var it = stockState.items[parseInt(key.slice(7), 10)]; return it ? it.id : ''; }
    return '';
}
function renderTshopSellRow(key, itemId) {
    var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === itemId; });
    if (!shopItem) return '';
    var isHighlighted = (tshopHighlightedItem === key) || (tshopConfirmingItem === key);
    var sellPrice = Math.floor(shopItem.price / 2);
    return '<div data-tshop-id="' + key + '" class="shop-row shop-row-tshop' + (isHighlighted ? ' hl' : '') + '">' +
        '<span class="shop-cursor">' + (isHighlighted ? '>' : '　') + '</span>' +
        (shopItem.iconImg ? '<img src="' + shopItem.iconImg + '" width="18" height="18" class="shop-icon-img">' : '<span class="shop-icon-txt">?</span>') +
        '<span class="shop-name" style="color:#fff;">' + escapeHtml(t(shopItem.nameKey)) + '</span>' +
        '<span class="shop-price" style="color:#ffd700;">+' + formatTshopPrice(sellPrice) + t('currency_unit') + '</span>' +
    '</div>';
}
function renderTshopSellList() {
    var html = '', any = false;
    var pl = permaLevel(), ps = gameSettings.permaStock || [];
    for (var i = 0; i < pl; i++) { if (ps[i]) { html += renderTshopSellRow('_psell_' + i, ps[i]); any = true; } }                 // ポーチ(永続枠)
    for (var n = 0; n < stockState.items.length; n++) { html += renderTshopSellRow('_nsell_' + n, stockState.items[n].id); any = true; } // 通常ストック(区別なく)
    if (!any) html += '<div style="color:rgba(255,255,255,0.5); text-align:center; padding:16px 0; font-family:\'M PLUS Rounded 1c\',sans-serif; font-size:clamp(10px,2vw,13px);">' + escapeHtml(t('tshop_sell_empty')) + '</div>';
    return html;
}
// 売れるものが1つでもあるか（ポーチ=永続枠 or 通常ストック）。売るメニューの可否判定に使用。
function tshopHasSellable() {
    var pl = permaLevel(), ps = gameSettings.permaStock || [];
    for (var i = 0; i < pl; i++) { if (ps[i]) return true; }
    return stockState.items.length > 0;
}
// メニュー項目（買う/売る/広告/出る）を1行描画（ステージショップの renderShopMenuItem 相当・data-tshop-id版）
function renderTshopMenuItem(id, icon, text) {
    var isHighlighted = (tshopHighlightedItem === id);
    var cursor = isHighlighted ? '>' : '　';
    return '<div data-tshop-id="' + id + '" class="shop-row shop-row-menu' + (isHighlighted ? ' hl' : '') + '">' +
        '<span class="shop-cursor">' + cursor + '</span>' +
        '<span class="shop-icon-txt">' + icon + '</span>' +
        '<span class="shop-name">' + escapeHtml(text) + '</span>' +
    '</div>';
}
// 売る/買うモードからメニューへ戻る（ステージショップの returnToShopMenu 相当）
function returnToTshopMenu() {
    if (soundManager) soundManager.playCursorMove();
    tshopMode = 'menu';
    tshopHighlightedItem = null;
    tshopConfirmingItem = null;
    tshopLeaving = false;
    showTshopConfirm(false);
    setTshopKeeperText('tshop_keeper_greet');
    updateTitleShopUI();
}
// 画面下「もどる/お店を出る」ボタン：買う/売るモードならメニューへ、メニューなら退店確認
function tshopBack() {
    if (tshopMode !== 'menu') { returnToTshopMenu(); return; }
    requestTshopLeave();
}
// Android戻る(popstate)専用: ステージショップ同様、1段戻して消費された履歴を積み直す
// （従来は hideTitleShop 直呼び＝どの階層からでも即閉店で、画面の「もどる」と挙動が食い違っていた）。
// 退店確認で「はい」→closeTitleShop が history.back() するので、積み直した分もそこで相殺される。
function titleShopOnBack() {
    tshopBack();
    if (isScreenVisible('titleShopScreen')) history.pushState({ screen: 'titleShop' }, '');
}
function selectTshopSell(key) {
    var itemId = tshopSellItemId(key);
    var shopItem = itemId ? STAGE_SHOP_ITEMS.find(function(s) { return s.id === itemId; }) : null;
    if (!shopItem) return;
    var sellPrice = Math.floor(shopItem.price / 2);
    // 1タップで選択＝内容確認＋すぐ右に「うる/うらない」ダイアログ（1.416）
    tshopHighlightedItem = key;
    tshopConfirmingItem = key;
    setTshopKeeperText('tshop_keeper_sell_confirm', { item: t(shopItem.nameKey), price: formatTshopPrice(sellPrice) });
    showTshopConfirm(true, tshopSellLabels());
    updateTitleShopUI();
}
function confirmTshopSell(key) {
    var itemId = tshopSellItemId(key);
    var shopItem = itemId ? STAGE_SHOP_ITEMS.find(function(s) { return s.id === itemId; }) : null;
    showTshopConfirm(false);
    tshopConfirmingItem = null;
    tshopHighlightedItem = null;
    if (!shopItem) { updateTitleShopUI(); return; }
    var sellPrice = Math.floor(shopItem.price / 2);
    gameSettings.savings += sellPrice;
    if (key.indexOf('_psell_') === 0) {                       // ポーチ: 永続枠を空ける
        gameSettings.permaStock[parseInt(key.slice(7), 10)] = '';
        saveSettings();
        buildPermaSlots();
    } else {                                                  // 通常ストック: 消費
        stockState.items.splice(parseInt(key.slice(7), 10), 1);
    }
    if (soundManager) soundManager.playItem();
    setTshopKeeperText('tshop_keeper_sold', { item: t(shopItem.nameKey), price: formatTshopPrice(sellPrice) });
    updateTitleShopUI();
    updateStockUI();
}

// ── エッグこうかん（タイトルショップ内・ゴールデンエッグ払い） ──
function eggShopItemById(id) { return EGG_SHOP_ITEMS.find(function(i) { return i.id === id; }) || null; }
function isEggItemOwned(item) {
    if (item.type === 'pouch') return (gameSettings.pouchLevel || 0) >= stockState.maxSlots; // 永続枠が上限＝MAX（これ以上買えない）
    if (item.type === 'upgrade') return ((gameSettings.upgrades || {})[item.upgradeId] || 0) > 0; // Lv1のみの永続アイテム（コインマスター等）
    return item.type === 'skin' && !!(gameSettings.ownedSkins && gameSettings.ownedSkins.indexOf(item.skinId) !== -1);
}
function selectEggShopItem(itemId) {
    var item = eggShopItemById(itemId);
    if (!item) return;
    var key = 'egg:' + itemId;
    if (isEggItemOwned(item)) { // 交換済み: 案内だけ・ダイアログは出さない
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        if (soundManager) soundManager.playCursorMove();
        tshopHighlightedItem = key;
        setTshopKeeperText(item.type === 'skin' ? 'tshop_keeper_egg_owned' : 'tshop_keeper_egg_owned_pouch'); // skin以外は「きせかえで装備」と言わない汎用文
        updateTitleShopUI();
        return;
    }
    // 1タップで選択＝説明＋すぐ右に「かう/かわない」ダイアログ（1.416）
    tshopHighlightedItem = key;
    tshopConfirmingItem = key;
    var el = document.getElementById('tshopKeeperText');
    if (el) el.innerHTML = '<img src="' + item.iconImg + '" class="ui-icon"> ' + escapeHtml(t(item.nameKey)) + '\n' + escapeHtml(t(item.descKey)) +
        '\n<span style="color:#ffd700;">' + escapeHtml(t('tshop_egg_q', { price: item.eggPrice })) + '</span>';
    showTshopConfirm(true, tshopBuyLabels());
    updateTitleShopUI();
}
function confirmEggBuy(itemId) {
    var item = eggShopItemById(itemId);
    if (!item) return;
    if ((gameSettings.goldenEggs || 0) < item.eggPrice) { // エッグ不足
        if (soundManager) soundManager.playDamage();
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        setTshopKeeperText('tshop_keeper_egg_poor');
        updateTitleShopUI();
        return;
    }
    // ポーチ: 永続枠が上限（ストック枠数）に達していたら買えない（減算前に弾く）
    if (item.type === 'pouch' && (gameSettings.pouchLevel || 0) >= stockState.maxSlots) {
        if (soundManager) soundManager.playDamage();
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        setTshopKeeperText('tshop_keeper_egg_pouch_max');
        updateTitleShopUI();
        return;
    }
    // 付与処理が未実装の type は減算前に弾く（新type追加時の実装漏れでエッグだけ消えるのを防ぐ）
    if (item.type !== 'skin' && item.type !== 'pouch' && item.type !== 'upgrade') {
        if (soundManager) soundManager.playDamage();
        showTshopConfirm(false);
        tshopConfirmingItem = null;
        setTshopKeeperText('tshop_keeper_egg_error');
        updateTitleShopUI();
        return;
    }
    gameSettings.goldenEggs -= item.eggPrice;
    if (item.type === 'pouch') {
        gameSettings.pouchLevel = (gameSettings.pouchLevel || 0) + 1; // 永続枠+1（上から順に永続化）
        buildPermaSlots(); // 新しい金枠をストック表示に即反映（permaStockから再構築・購入時に空枠が増える）
    } else if (item.type === 'upgrade') { // Lv1のみの永続アイテム（コインマスター等）
        if (!gameSettings.upgrades) gameSettings.upgrades = {};
        gameSettings.upgrades[item.upgradeId] = 1;
        applyUpgrades(); // 効果を即反映（円建てアップグレード購入と同じ扱い）
    } else { // skin
        if (!gameSettings.ownedSkins) gameSettings.ownedSkins = [];
        if (gameSettings.ownedSkins.indexOf(item.skinId) === -1) gameSettings.ownedSkins.push(item.skinId);
    }
    saveSettings();
    if (soundManager) soundManager.playItem();
    showTshopConfirm(false);
    tshopConfirmingItem = null;
    // skin以外は「きせかえ装備」案内を出さない（ポーチ=金枠案内・upgrade=永続効果案内）
    setTshopKeeperText(item.type === 'pouch' ? 'tshop_keeper_egg_bought_pouch'
        : item.type === 'upgrade' ? 'tshop_keeper_egg_bought_upgrade' : 'tshop_keeper_egg_bought');
    updateTitleShopUI();
    if (item.type === 'pouch') updateStockUI(); // 永続枠（金枠）の表示を更新
}

function previewTshopItem(upgradeId) {
    if (tshopConfirmingItem) return;
    if (upgradeId && upgradeId.indexOf('egg:') === 0) { // エッグこうかん行の hover プレビュー
        var eggItem = eggShopItemById(upgradeId.slice(4));
        if (!eggItem) return;
        tshopHighlightedItem = upgradeId;
        var eggEl = document.getElementById('tshopKeeperText');
        if (eggEl) eggEl.innerHTML = '<img src="' + eggItem.iconImg + '" class="ui-icon"> ' + escapeHtml(t(eggItem.nameKey)) + '\n' + escapeHtml(t(eggItem.descKey));
        updateTitleShopUI();
        return;
    }
    var upgrade = TITLE_SHOP_UPGRADES.find(function(u) { return u.id === upgradeId; });
    if (!upgrade) return;
    tshopHighlightedItem = upgradeId;
    var currentLevel = (gameSettings.upgrades || {})[upgradeId] || 0;
    var isMax = currentLevel >= upgrade.maxLevel;
    var desc = t(upgrade.descKey);
    if (!isMax) {
        var effArr2 = (gameSettings.language === 'en' && upgrade.effectDescEn) ? upgrade.effectDescEn : upgrade.effectDesc;
        desc += ' → ' + effArr2[currentLevel];
    }
    var el = document.getElementById('tshopKeeperText');
    if (el) el.innerHTML = (upgrade.iconImg ? '<img src="' + upgrade.iconImg + '" class="ui-icon">' : '') + ' ' + escapeHtml(t(upgrade.nameKey)) + '\n' + escapeHtml(desc);
    updateTitleShopUI();
}

function showTitleShop() {
    showScreenEl('titleShopScreen');
    history.pushState({ screen: 'titleShop' }, '');
    tshopHighlightedItem = null;
    tshopConfirmingItem = null;
    tshopMode = 'menu'; // 開くたびメニューから（買う/売る/広告を選ぶ）
    tshopLeaving = false;
    setTshopKeeperText('tshop_keeper_greet');
    showTshopConfirm(false); // カーソルリセットも内包
    // 旧・独立リワード広告ボタンはメニュー項目(_tmenu_reward_ad)へ統合したので常に隠す
    var tshopAdBtnEl = document.getElementById('tshopRewardAdBtn');
    if (tshopAdBtnEl) tshopAdBtnEl.style.display = 'none';
    updateTitleShopUI();
    buildPermaSlots(); // ゲーム未開始でも permaStock から永続枠を構築（返却プレイヤーが初回プレイ前にショップを開いた時の表示ズレ防止）
    updateStockUI(); // タイトルショップでもストック(枠＋所持アイテム)を表示＝拡張アイテム購入の参考に
    if (soundManager) soundManager.playBGM('shop');
}

function hideTitleShop() {
    hideScreenEl('titleShopScreen');
    tshopHighlightedItem = null;
    tshopConfirmingItem = null;
    updateStockUI(); // タイトルへ戻るのでストック表示を隠す
    if (soundManager) soundManager.playBGM('title');
}

function closeTitleShop() {
    hideTitleShop();
    history.back();
}

function renderTitleShopItem(upgrade) {
    var currentLevel = (gameSettings.upgrades || {})[upgrade.id] || 0;
    var isMax = currentLevel >= upgrade.maxLevel;
    var isPremium = !!upgrade.premium && !gameSettings.purchased['starter_pack'];
    var price = isMax ? 0 : upgrade.prices[currentLevel];
    var canBuy = !isMax && !isPremium && gameSettings.savings >= price;
    var isHighlighted = (tshopHighlightedItem === upgrade.id) || (tshopConfirmingItem === upgrade.id);
    var cursor = isHighlighted ? '>' : '　';
    // レベル表示
    var levelDots = currentLevel + '/' + upgrade.maxLevel;
    // 価格テキスト
    var priceText;
    var priceHtml = '';
    if (isMax) {
        priceText = 'MAX';
    } else if (isPremium) {
        priceText = t('tshop_price_preparing');
    } else if (upgrade.saleFrom && !isMax) {
        priceHtml = '<span style="text-decoration:line-through; color:rgba(255,255,255,0.5); font-size:clamp(6px,1.1vw,9px);">' +
            formatTshopPrice(upgrade.saleFrom) + t('currency_unit') + '</span> ' +
            '<span style="color:#ff4444;">SALE </span>' + formatTshopPrice(price) + t('currency_unit');
        priceText = '';
    } else {
        priceText = formatTshopPrice(price) + t('currency_unit');
    }
    var priceColor = isMax ? '#4CAF50' : (isPremium ? '#ff69b4' : '#ffd700');
    var textColor = isPremium ? 'rgba(255,105,180,0.6)' : '#fff';
    return '<div data-tshop-id="' + upgrade.id + '" class="shop-row shop-row-tshop' +
        (isHighlighted ? ' hl' : '') + (isPremium ? ' dim' : '') + '">' +
        '<span class="shop-cursor">' + cursor + '</span>' +
        (upgrade.iconImg
            ? '<img src="' + upgrade.iconImg + '" width="18" height="18" class="shop-icon-img">'
            : '<span class="shop-icon-txt">' + upgrade.icon + '</span>') +
        '<span class="shop-name" style="color:' + textColor + ';">' + escapeHtml(t(upgrade.nameKey)) +
            ' <span style="font-size:clamp(7px,1.3vw,10px);color:#ffd700;">' + levelDots + '</span></span>' +
        '<span class="shop-price" style="color:' + priceColor + ';">' + (priceHtml || escapeHtml(priceText)) + '</span>' +
    '</div>';
}

function renderEggShopItem(item) {
    var owned = isEggItemOwned(item);
    var key = 'egg:' + item.id;
    var isHighlighted = (tshopHighlightedItem === key) || (tshopConfirmingItem === key);
    var cursor = isHighlighted ? '>' : '　';
    var priceHtml = owned
        ? '<span style="color:#4CAF50;">' + escapeHtml(t('tshop_egg_owned')) + '</span>'
        : '<img src="images/item_golden_egg.png" width="12" height="12" style="image-rendering:pixelated; vertical-align:-1px;"> ' + item.eggPrice;
    return '<div data-tshop-id="' + key + '" class="shop-row shop-row-tshop' + (isHighlighted ? ' hl' : '') + '">' +
        '<span class="shop-cursor">' + cursor + '</span>' +
        '<img src="' + item.iconImg + '" width="18" height="18" class="shop-icon-img">' +
        '<span class="shop-name" style="color:#fff;">' + escapeHtml(t(item.nameKey)) + (item.type === 'pouch' ? ' <span style="color:#ffd24a; font-size:0.82em;">Lv' + (gameSettings.pouchLevel || 0) + '/' + stockState.maxSlots + '</span>' : '') + '</span>' +
        '<span class="shop-price" style="color:#ffd700;">' + priceHtml + '</span>' +
    '</div>';
}

function updateTitleShopUI() {
    document.getElementById('titleShopSavings').innerHTML = _ic('icon_bank.png', 'ui-icon-sm') + ' ' + t('tshop_savings_display', { amount: formatTshopPrice(gameSettings.savings) }) +
        '　' + _ic('item_golden_egg.png', 'ui-icon-sm') + ' ' + (gameSettings.goldenEggs || 0);
    var container = document.getElementById('titleShopList');
    var backBtn = document.getElementById('titleShopBackBtn');
    var html = '';
    if (tshopMode === 'menu') {
        // メニュー：買う/売る/(広告)/出る をまず選ぶ（ステージショップ同様）
        html += renderTshopMenuItem('_tmenu_buy', _ic('icon_cart.png'), t('shop_menu_buy'));
        html += renderTshopMenuItem('_tmenu_sell', _ic('icon_money.png'), t('shop_menu_sell'));
        if (!gameSettings.adFree) {
            var _tAdRdy = (typeof window.isRewardReady !== 'function') || window.isRewardReady();
            html += renderTshopMenuItem('_tmenu_reward_ad', _ic('icon_bank.png'), _tAdRdy ? t('reward_ad_shop_money') : t('ad_preparing_btn'));
        }
        html += renderTshopMenuItem('_tmenu_leave', _ic('icon_door.png'), t('shop_close').replace('&gt; ', '').replace('> ', ''));
        if (backBtn) backBtn.style.display = 'none'; // メニューでは「出る」項目から退店
    } else if (tshopMode === 'sell') {
        html += renderTshopSellList(); // 売る: 通常ストックも ポーチも 区別なく一覧
        if (backBtn) { backBtn.style.display = 'block'; backBtn.innerHTML = t('shop_back'); }
    } else { // buy
        for (var i = 0; i < TITLE_SHOP_UPGRADES.length; i++) {
            html += renderTitleShopItem(TITLE_SHOP_UPGRADES[i]);
        }
        // エッグこうかんセクション（ゴールデンエッグ払い・コスメ等）
        if (EGG_SHOP_ITEMS.length) {
            html += '<div style="color:rgba(255,215,0,0.75); font-family:DotGothic16,monospace; font-size:clamp(8px,1.5vw,11px); text-align:center; padding:3px 0 1px;">─ ' + escapeHtml(t('tshop_egg_section')) + ' ─</div>';
            for (var e = 0; e < EGG_SHOP_ITEMS.length; e++) {
                html += renderEggShopItem(EGG_SHOP_ITEMS[e]);
            }
        }
        if (backBtn) { backBtn.style.display = 'block'; backBtn.innerHTML = t('shop_back'); }
    }
    var _prevScroll = container.scrollTop; // 再描画でスクロール位置が最上部へ飛ぶのを防ぐ（ポーチ選択時など）
    container.innerHTML = html;
    container.scrollTop = _prevScroll;
}

function applyUpgrades() {
    // チュートリアル（はじまりの地）はサンドボックス＝初期状態のロードアウト固定（案A・1.421）。
    // アップグレード/ポーチ/スキン効果を持ち込まない＝案内が全員の画面と一致し、永続資産にも一切触れない。
    // gameSettings は書き換えないので、次の通常ランでは本関数が従来どおり全効果を復元する
    if (tutorialState.active) {
        gameState.coinBonus = 1.0;
        gameState.lives = 5;
        gameState.crystalLives = 0; // サンドボックス＝クリスタルハートも持ち込まない
        gameState.luckyCharm = false; // ラッキーチャームも持ち込まない
        gameState.eggMagnet = false; // エッグマグネットも持ち込まない
        stockState.maxSlots = 3;
        gameState.magnetRange = 200;
        gameState.magnetDurMult = 1;
        COMBO_TIMEOUT = 60;
        gameState.speedMultiplier = 1.0;
        gameState.revivesLeft = 0;
        gameState.specialMoveLevel = 0;
        updateStockUI();
        return;
    }
    var ups = gameSettings.upgrades || {};
    var coinLv = ups.coin_master || 0;
    gameState.coinBonus = coinLv > 0 ? 1.3 : 1.0; // コインマスター（🥚こうかん・Lv1のみ）: コイン獲得+30%
    var toughLv = ups.toughness || 0;
    gameState.lives = 5 + toughLv;
    // クリスタルハート: 青ハート(Lv=個数)。赤より先に削れ・ラン中は回復不可(ここでの補充のみ)
    gameState.crystalLives = ups.crystal_heart || 0;
    // ラッキーチャーム: 土管の期待出現1.5倍＋ラッキーの間の当たり枠強化(pickPipeTargetDist/openLuckyChest参照)
    gameState.luckyCharm = (ups.lucky_charm || 0) > 0;
    // エッグマグネット: ゴールデンエッグを全画面から吸い寄せ(updatePowerUps冒頭)＝取り逃し防止
    gameState.eggMagnet = (ups.egg_magnet || 0) > 0;
    var stockLv = ups.stock_expand || 0;
    stockState.maxSlots = 3 + stockLv;
    var magnetLv = ups.magnet_boost || 0;
    // マグネット強化: L1=コイン吸い寄せを全範囲(画面全体)化、L2=マグネット持続時間2倍
    gameState.magnetRange = magnetLv >= 1 ? 99999 : 200;
    gameState.magnetDurMult = magnetLv >= 2 ? 2 : 1;
    var comboLv = ups.combo_master || 0;
    COMBO_TIMEOUT = 60 + comboLv * 30; // コンボマスター: 受付時間延長
    // はやあし: 横移動速度1.3倍
    var swiftLv = ups.swift_feet || 0;
    gameState.speedMultiplier = swiftLv > 0 ? 1.3 : 1.0;
    // 復活の羽: Lv1=1回/ラン, Lv2=2回/ラン
    var revivalLv = ups.revival_feather || 0;
    gameState.revivesLeft = revivalLv;
    // 必殺技: 所持レベル（ボスへのダメージ量が上がる）
    gameState.specialMoveLevel = ups.special_move || 0;
    // 永久型アップグレードの所持アイコンは updateStockUI 内でストック枠の下に表示する（旧 #skillIcons は撤廃）
    updateStockUI(); // 効果反映＋所持永久型アイコンの更新（stock_expand購入で枠も即増える）
}

// ── ストックシステム ──
// 永続ストック枠（まほうのポーチ）: stockState.perma=[{id,used}] を先頭に、その後ろに通常枠 stockState.items（詰め）。
// 表示スロット index: 0..permaLevel()-1 = 永続枠 / それ以降 = 通常枠。
function permaLevel() {
    if (tutorialState.active) return 0; // サンドボックス: ポーチ（永続枠）は存在しない扱い
    return Math.max(0, Math.min(gameSettings.pouchLevel || 0, stockState.maxSlots));
}
function normalMaxSlots() { return Math.max(0, stockState.maxSlots - permaLevel()); }

// 永続ストック枠を permaStock から構築（毎ラン補充・used=false）。resetGame と startGame の両方から呼ぶ
// （startGame は resetGame を経由しない初回プレイでも走る＝初回でも永続枠が確実に構築される）。
// 長さ=pouchLevel（購入時に pouchLevel<=maxSlots を保証済み。permaLevel()が読み取り時に再クランプ）。
function buildPermaSlots() {
    stockState.perma = [];
    var n = tutorialState.active ? 0 : Math.max(0, gameSettings.pouchLevel || 0); // サンドボックス: 永続枠を作らない
    for (var i = 0; i < n; i++) {
        var id = (gameSettings.permaStock && gameSettings.permaStock[i]) || '';
        stockState.perma.push({ id: id, used: false });
    }
}

// 急降下する空中雑魚「アカバネ」のAI（1.527・R11以降）。updateEnemies から60Hz固定ステップで呼ばれる。
//   fly  = 通常飛行（既存の空中敵と同じふわふわ）
//   warn = プレイヤーの前方に入ったら空中で狙いを定める＝予告（震え＋地面の着弾マーカー・render側）
//   dive = プレイヤー目がけて急降下（真下だけだと避けやすすぎるので少しだけ横に寄せる）
//   leave= 地面で跳ねて上へ抜ける（そのまま画面外へ＝cullByXが回収）
// ⚠踏み・弾・ぴよフラッシュ・急降下斬りの処理は既存の空中敵と共通＝倒し方は変わらない。
// ⚠**横移動もこの関数が持つ**（1.570）。以前は updateEnemies 側の共通処理
//   `e.x += e.velX - gameState.gameSpeed` に任せていたが、それだと予告中もスクロールに流され続け、
//   降下を始める頃にはプレイヤーの遥か後ろ＝一度も攻撃せずに離脱していた（DIVE_BIRD_LOCK_SPD のコメントに実測）。
function updateDiveBird(e) {
    if (e.diveState === 'warn') {
        e.diveTimer--;
        e.y += Math.sin(gameState.time * 0.4 + e.waveOffset) * 0.6; // 予告中は小刻みに震える
        // 狙いを定める＝スクロール分を打ち消しつつ、上限速度でプレイヤーの真上へ寄せる。
        // ⚠一気に真上へは行かない（上限 DIVE_BIRD_LOCK_SPD）＝「寄ってくる」のが見えるので避ける判断ができる。
        var lockDx = (player.x + player.width / 2) - (e.x + e.width / 2);
        e.x += gameState.gameSpeed + Math.max(-DIVE_BIRD_LOCK_SPD, Math.min(DIVE_BIRD_LOCK_SPD, lockDx * 0.25));
        if (e.diveTimer <= 0) { e.diveState = 'dive'; e.diveVelY = 0; }
        return;
    }
    if (e.diveState === 'dive') {
        e.diveVelY = Math.min(DIVE_BIRD_SPEED_Y, e.diveVelY + DIVE_BIRD_ACC_Y);
        e.y += e.diveVelY;
        // 降下中も画面に置いていかれないようスクロール分を足す（＋わずかに追尾）
        e.x += gameState.gameSpeed + (player.x - e.x) * DIVE_BIRD_HOME_X;
        // ⚠**足元より下の地形**を探すこと（1.571）。terrainTopAt は「一番高い地形」を返すので、
        //   天井のある地底では天井が返り、降下1フレーム目に上へワープして貫通していた。
        //   床が1枚も無い（溶岩の裂け目の真上）場合、地上用の GROUND_Y へ落とすと地底では大きくズレるので、
        //   地底ではその部屋の落下死ラインを使う＝そのまま下へ抜けて消える（＝穴の上を通過した時と同じ絵）。
        // ⚠基準は**鳥の上端(e.y)**であって足元ではない。足元を渡すと、着地の直前に足が床面を1pxでも
        //   下回った瞬間に床が候補(t.y >= fromY)から外れて null になり、**床を突き抜けて落下死ラインまで落ちる**
        //   （1.571の実測で踏んだ。最高落下速度9px/fに対し体高54pxあるので、上端基準なら必ず着地判定が先に立つ）。
        var surf = terrainTopBelow(e.x + e.width / 2, e.y);
        var floorY = (surf !== null ? surf
                      : (undergroundState.active ? ugDeathY() : GROUND_Y)) - e.height;
        if (e.y >= floorY) { e.y = floorY; e.diveState = 'leave'; e.diveVelY = DIVE_BIRD_BOUNCE_Y; }
        return;
    }
    if (e.diveState === 'leave') {
        // 地面で跳ねたあとは機首を引き起こして上へ抜ける（必ず上昇＝地面をすり抜けて落ち続けない）
        e.diveVelY = Math.min(-3, e.diveVelY + 0.2);
        e.y += e.diveVelY;
        e.x += e.velX - gameState.gameSpeed;        // 離脱は従来どおり流れて画面外へ（cullByXが回収）
        return;
    }
    // fly: 通常飛行。プレイヤーの前方(右)で射程に入ったら予告へ。すでに追い越していたら降下しない
    e.x += e.velX - gameState.gameSpeed;
    e.y += Math.sin(gameState.time * 0.05 + e.waveOffset) * 0.8;
    var dx = e.x - player.x;
    if (dx > 0 && dx < DIVE_BIRD_TRIGGER_X) {
        e.diveState = 'warn';
        e.diveTimer = DIVE_BIRD_WARN_F;
        if (soundManager) { try { soundManager.playFlash(); } catch (_) {} }  // 予告に音をつける（画面外を見ていても気づける）
    }
}

// ポーチ(永続枠)の中身を permaStock へ確定保存する（1.526・ユーザー方針＝転売対策）。
// 呼ぶのは「ゲームオーバー時」と「ラン開始時の配布直後(ログボ)」だけ＝ラン中に拾った品は
// リタイア・アプリ強制終了では残らない（旧実装は拾った瞬間に保存＝拾う→リタイア→次ランで補充→売る、が無限に回せた）。
// ⚠temp=true の枠は「今回かぎり」補充(1.477)なので確定しない＝翌ランは設定したポーチ内容に戻る。
function commitPermaStock() {
    if (typeof tutorialState !== 'undefined' && tutorialState.active) return; // サンドボックス＝永続枠なし
    if (!gameSettings.permaStock) gameSettings.permaStock = [];
    for (var i = 0; i < stockState.perma.length; i++) {
        if (stockState.perma[i].temp) continue;
        gameSettings.permaStock[i] = stockState.perma[i].id || '';
    }
}

// itemId を今この瞬間ストックに入れる余地があるか（購入可否・満杯判定に使用）
function stockHasRoom(itemId) {
    // 未割当の永続枠（復活薬など永続化不可品は永続枠に入れられない）
    if (PERMA_STOCK_EXCLUDE.indexOf(itemId) === -1) {
        for (var p = 0; p < stockState.perma.length; p++) {
            // 未割当の空き枠、または今ラン使用済み（表示は空の金枠）の枠には入る余地がある
            if (!stockState.perma[p].id || stockState.perma[p].used) return true;
        }
    }
    // 通常枠の空き
    return stockState.items.length < normalMaxSlots();
}

// 全枠が永続(ポーチ)＝通常枠ゼロのとき、復活薬だけは「今回かぎり(保存されない)」で通常枠へ一時追加して購入できる例外ケース
function isTempReviveCase(itemId) { return itemId === 'revive_potion' && normalMaxSlots() === 0; }

// ストック満杯時の入手品を貯金へ換算（損なし・売値=定価の半分）。永続化してsaveSettings。
function convertItemToSavings(itemId) {
    var si = STAGE_SHOP_ITEMS.find(function(s) { return s.id === itemId; });
    var amount = si ? Math.max(1, Math.floor(si.price / 2)) : 0;
    if (amount > 0) {
        gameSettings.savings = (gameSettings.savings || 0) + amount;
        saveSettings();
    }
    if (typeof showRewardToast === 'function') {
        showRewardToast(escapeHtml(t('stock_full_savings', { amount: amount })),
            'linear-gradient(180deg,#7ad0ff,#2a7fd0)', '#062a44');
    }
}

function addToStock(itemId) {
    // ① 永続枠（まほうのポーチ）へ。復活薬など永続化不可品は除外
    if (PERMA_STOCK_EXCLUDE.indexOf(itemId) === -1) {
        // 1) 未割当の空き枠に自動割当 → 毎ラン補充される金枠に定着
        //    ⚠永続保存(permaStock)はここでは行わず commitPermaStock() でゲームオーバー時にまとめて確定する(1.526)。
        //    拾った瞬間に保存していた頃は「拾う→リタイア(or強制終了)→次ランで補充→売る」を繰り返せた＝無限売却(転売)。
        for (var p = 0; p < stockState.perma.length; p++) {
            if (!stockState.perma[p].id) {
                stockState.perma[p] = { id: itemId, used: false };
                updateStockUI();
                return true;
            }
        }
        // 2) 今ラン使用済みで空いている枠に「今回かぎり」補充（保存しない＝翌ランは元の永続品に戻り、設定した
        //    ポーチ内容は保持）。使用済み枠は表示が空の金枠なので「空きなのに拾えず売却」バグの修正。
        for (var q = 0; q < stockState.perma.length; q++) {
            if (stockState.perma[q].id && stockState.perma[q].used) {
                stockState.perma[q] = { id: itemId, used: false, temp: true }; // temp=確定しない印(commitPermaStock)
                updateStockUI();
                return true;
            }
        }
    }
    // ② 通常枠に空きがあれば追加
    if (stockState.items.length < normalMaxSlots()) {
        stockState.items.push({ id: itemId });
        updateStockUI();
        return true;
    }
    // ③ 満杯 → 貯金換算（損なし）。チュートリアル中は貯金へ漏らさない＝拾えず、その場に残る
    if (tutorialState.active) return false;
    convertItemToSavings(itemId);
    return true;
}

function useStockItem(displayIndex) {
    if (gameState.gamePaused) return false; // ポーズ中の誤タップで消費しない（表示は読み取り専用だが二重ガード）
    if (pipeRoomState.anim !== 'none') return false; // 土管出入り演出中も消費しない
    var pl = permaLevel();
    if (displayIndex < pl) {
        // 永続枠: 使っても枠は残す（used=true）。翌ラン resetGame で used=false に補充される。
        var pslot = stockState.perma[displayIndex];
        if (!pslot || !pslot.id || pslot.used) return false;
        var pItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === pslot.id; });
        if (!pItem || !pItem.stockEffect) return false;
        pItem.stockEffect();
        pslot.used = true;
        if (soundManager) soundManager.playItem();
        updateStockUI();
        return true;
    }
    // 通常枠（詰め配列）: 表示index から永続枠ぶんを引いた位置
    var ni = displayIndex - pl;
    if (ni < 0 || ni >= stockState.items.length) return false;
    var item = stockState.items[ni];
    // 復活薬は死亡時に自動発動する保険専用（tryRevive が処理）＝手動使用は不可。タップ時はヒントだけ出す。
    if (item.id === 'revive_potion') {
        if (typeof showRewardToast === 'function') {
            showRewardToast(escapeHtml(t('revive_auto_hint')), 'linear-gradient(180deg,#8ad1ff,#3a7bd0)', '#fff');
        }
        if (soundManager) soundManager.playCursorMove();
        return false;
    }
    var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === item.id; });
    if (!shopItem || !shopItem.stockEffect) return false;
    shopItem.stockEffect();
    stockState.items.splice(ni, 1);
    if (soundManager) soundManager.playItem();
    updateStockUI();
    return true;
}

// 永続枠へ移せない品（復活薬）をドロップした時のフィードバック
function rejectPermaToast() {
    if (typeof showRewardToast === 'function') {
        showRewardToast(escapeHtml(t('egg_perma_no_revive')), 'linear-gradient(180deg,#c8a2ff,#7d4fd0)', '#fff');
    }
    if (soundManager) soundManager.playDamage();
}

// ドラッグでストック枠の中身を入替（perma/通常どちらも可）。永続枠へ復活薬は不可。
// a,b は表示スロット index。used中の永続枠はロック（対象外）。
function swapStockSlots(a, b) {
    if (gameState.gamePaused) return false; // ポーズ中はドラッグ入替も無効（読み取り専用の二重ガード）
    var pl = permaLevel();
    var maxN = stockState.maxSlots;
    if (a < 0 || b < 0 || a >= maxN || b >= maxN || a === b) return false;
    // 使用済みの永続枠はドラッグ元/先ともに不可（この操作で復活してしまうのを防ぐ）
    function isUsedPerma(idx) { return idx < pl && stockState.perma[idx] && stockState.perma[idx].id && stockState.perma[idx].used; }
    if (isUsedPerma(a) || isUsedPerma(b)) return false;
    // 位置スナップショット（各セル= {id,used} or null）。永続枠の used はここで保持される。
    var snap = [];
    for (var i = 0; i < maxN; i++) {
        if (i < pl) {
            var ps = stockState.perma[i];
            snap.push((ps && ps.id) ? { id: ps.id, used: !!ps.used, temp: !!ps.temp } : null);
        } else {
            var it = stockState.items[i - pl];
            snap.push(it ? { id: it.id, used: false } : null);
        }
    }
    var A = snap[a], B = snap[b];
    if (!A && !B) return false;
    // 復活薬を永続枠へ入れる操作は拒否
    if (a < pl && B && B.id === 'revive_potion') { rejectPermaToast(); return false; }
    if (b < pl && A && A.id === 'revive_potion') { rejectPermaToast(); return false; }
    // 入替
    snap[a] = B; snap[b] = A;
    // 永続枠へ書き戻し（used/temp は snap のまま＝スワップした側は元の状態を持ち回る／未関与枠は不変）。
    // ⚠permaStockへの保存はここでは行わない＝ゲームオーバー時の commitPermaStock() で確定する(1.526)。
    for (var p = 0; p < pl; p++) {
        var s = snap[p];
        if (s) { stockState.perma[p] = { id: s.id, used: s.used, temp: s.temp }; }
        else { stockState.perma[p] = { id: '', used: false }; }
    }
    // 通常枠は詰めて再構築
    var newItems = [];
    for (var n = pl; n < maxN; n++) { if (snap[n]) newItems.push({ id: snap[n].id }); }
    stockState.items = newItems;
    saveSettings();
    updateStockUI();
    if (soundManager) soundManager.playCursorMove();
    return true;
}

function updateStockUI() {
    var container = document.getElementById('stockSlots');
    if (!container) return;
    // ボーナス部屋(土管)中も枠は表示する（「でる」は左へずらして重なり回避）。ただし部屋では使わないので読み取り専用にする。
    var inPipeRoom = (typeof pipeRoomState !== 'undefined' && pipeRoomState.active);
    // ゲームプレイ中は、空でも maxSlots ぶんの枠を常に表示する（所持可能数を可視化＋拡張アイテム購入の動機）。
    // タイトル/ゲームオーバー中(gameStarted=false)は隠す。ショップ中は別途 display:none で隠している(誤タップ防止)。
    var inTitleShop = isScreenVisible('titleShopScreen');
    // 表示条件: ゲームプレイ中、または ステージ/タイトルショップ表示中（タイトル/ゲームオーバーでは隠す）
    if (!gameState.gameStarted && !inTitleShop) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    // タイトルショップ(z-index:9999・不透明)中は枠を前面に出す。それ以外は通常の100(ポーズ画面等の下に隠れる)。
    container.style.zIndex = inTitleShop ? '10000' : '100';
    var inShop = shopState.active || inTitleShop; // どちらのショップ中も枠・アイテムを見せるが使用不可（購入判断の参考用）
    var readOnly = inShop || inPipeRoom || gameState.gamePaused; // ショップ/部屋/ポーズ中は 表示のみ（タップ使用/ドラッグ入替を無効化）
    container.classList.toggle('stock-panel', inShop); // ショップ中のみ背景パネルで視認性UP（ゲーム中・部屋では付けず視界を塞がない）
    var html = '';
    var pl = permaLevel();
    var iconFor = function(id) {
        var s = STAGE_SHOP_ITEMS.find(function(x) { return x.id === id; });
        return (s && s.iconImg) ? '<img src="' + s.iconImg + '" class="ui-icon">' : '?';
    };
    // 一時オーバーフロー枠（全枠ポーチ時に一時追加した復活薬など）も末尾に描く。通常時は maxSlots のまま
    var _slotCount = Math.max(stockState.maxSlots, pl + stockState.items.length);
    for (var i = 0; i < _slotCount; i++) {
        if (i < pl) {
            // ── 永続枠（まほうのポーチ・金枠＋スロット番号バッジ） ──
            var pslot = stockState.perma[i] || { id: '', used: false };
            var badge = '<span class="perma-badge">' + (i + 1) + '</span>';
            if (pslot.id && !pslot.used) {
                // 使用可能な永続アイテム: タップ=使用／ドラッグ=入替
                if (readOnly) {
                    html += '<div class="stock-slot stock-slot-perma stock-slot-readonly">' + badge + iconFor(pslot.id) + '</div>';
                } else {
                    html += '<div class="stock-slot stock-slot-perma" data-idx="' + i + '" data-slot="' + i + '">' + badge + iconFor(pslot.id) + '</div>';
                }
            } else if (pslot.id && pslot.used) {
                // 使用済み: アイコンは消す（空の金枠のまま＝使ったら消える。中身は翌ラン自動補充）。ゲーム中はドロップ先にしない（ロック）。
                html += '<div class="stock-slot stock-slot-perma stock-slot-perma-used">' + badge + '</div>';
            } else {
                // 未割当の永続枠（空の金枠）: ドロップ先候補
                html += '<div class="stock-slot stock-slot-perma stock-slot-perma-empty"' + (readOnly ? '' : ' data-slot="' + i + '"') + '>' + badge + '</div>';
            }
        } else {
            // ── 通常枠 ──
            var ni = i - pl;
            if (ni < stockState.items.length) {
                var itm = stockState.items[ni];
                if (readOnly) {
                    // ショップ/部屋中: アイコンは見せるが操作不可（pointer-events:none）
                    html += '<div class="stock-slot stock-slot-readonly">' + iconFor(itm.id) + '</div>';
                } else {
                    // ゲーム中: data-idx で識別。委譲タップ(touchend)で即使用／ドラッグ=入替
                    html += '<div class="stock-slot" data-idx="' + i + '" data-slot="' + i + '">' + iconFor(itm.id) + '</div>';
                }
            } else {
                html += '<div class="stock-slot stock-slot-empty"' + (readOnly ? '' : ' data-slot="' + i + '"') + '></div>';
            }
        }
    }
    container.innerHTML = html;
    // 所持している永久型アップグレードのアイコンは左パネル(#ui内 #ownedUpgradeIcons)へ表示（1.522で右の枠下から移設＝
    // 最大所持時に右の縦積みが画面下へはみ出す問題の解消）。チュートリアルはサンドボックス＝効果なしなので出さない(1.430)。
    // ⚠grantSkinのアバター(侍/サイバー)は購入時に upgrades にもフラグが入る（MAX表示/図鑑用）が、
    //   HUDは「所持している永続アイテム」の欄なのでアバターは除外する（見た目は装備中のぴよ氏本体＋きせかえ画面が担当）。
    updateOwnedUpgradeIcons();
}

function updateOwnedUpgradeIcons() {
    var el = document.getElementById('ownedUpgradeIcons');
    if (!el) return;
    var ownedHtml = '';
    var ownedUps = (typeof tutorialState !== 'undefined' && tutorialState.active) ? {} : (gameSettings.upgrades || {});
    for (var u = 0; u < TITLE_SHOP_UPGRADES.length; u++) {
        var up = TITLE_SHOP_UPGRADES[u];
        if (up.grantSkin) continue; // アバター商品(侍/サイバー)はHUDの永続アイテム欄に出さない
        var upLv = ownedUps[up.id] || 0;
        if (upLv > 0 && up.iconImg) {
            var nm = up.nameKey ? escapeHtml(t(up.nameKey)) : '';
            var lvBadge = upLv >= 2 ? '<span class="skill-lv-badge">' + upLv + '</span>' : ''; // Lv2以上のみレベル数字
            ownedHtml += '<span class="owned-skill-wrap" title="' + nm + '"><img src="' + up.iconImg + '" class="owned-skill-icon">' + lvBadge + '</span>';
        }
    }
    el.innerHTML = ownedHtml;
    el.style.display = ownedHtml ? 'flex' : 'none';
}

// ─── ボスバトルシステム ───

function checkBossTrigger() {
    if (bossState.active || bossState.bossTriggered) return;
    if (undergroundState.active) return; // 地底の中では通常ボスを出さない（「闇の巫女」戦はP3で地底内に実装）
    // ⚠地底ラウンド(R7/R14/R21…)は**距離を待たずに、その場で**入場土管を出す（1.552・ユーザー指定）。
    //   闇のカカシは「門番」＝倒した時点で門が開く、という設計。撃破 → ROUND表示 → スクロール再開の瞬間に
    //   目の前へ土管がせり出し、そのままもぐる。R7に地上区間は無い（走らせない）。
    //   ⚠1.551までは bossDistanceFor(round) まで走らせる実装だった（撃破地点から2,400m＝約113秒）。
    //   これは仕様書§3の初版の記述に引きずられた誤実装で、ユーザーの意図と違っていた。
    if (!tutorialState.active && isUndergroundRound(gameRound) && !undergroundState.visited) {
        placeUndergroundPipe();
        return;
    }
    // チュートリアルは専用距離(760m)で弱いボスを出す
    var _trigDist = tutorialState.active ? TUTORIAL_BOSS_M : bossDistanceFor(gameRound);
    if (gameState.distance >= _trigDist) {
        // ⚠地底ラウンドの分岐は上（距離を待たない即時配置）へ移動した。ここへは到達しない。
        bossState.bossTriggered = true;
        bossState.active = true;
        bossState.phase = 1; // WARNING
        bossState.warningTimer = BOSS_WARNING_DURATION;
        // ⚠トリガーした瞬間にスクロールを止める（1.559・ユーザー報告「17mずれたまま」）。
        //   旧: 止めるのは setupBossArena（WARNING演出の完了時）だったため、演出の120フレームぶん
        //   world が進み、**全ボスのアリーナがトリガー距離＋18mで固定**されていた
        //   （120フレーム × 1.5px/f(安全地帯速度) ÷ 10）。R1=1,218m / R6=12,017m のように
        //   HUDの距離が常に半端な値になる。ここで止めればトリガー距離ちょうどで固定される。
        //   ⚠updateGameSpeed は先頭で bossState.active を見て return するので、0のまま維持される。
        //   ⚠savedGameSpeed は0にする前の値を保存すること（ラウンド移行のスクロール復帰に使う）。
        bossState.savedGameSpeed = gameState.gameSpeed;
        gameState.gameSpeed = 0;
        if (soundManager) soundManager.playBossWarning();
    }
}

function setupBossArena() {
    // ⚠checkBossTrigger が既に 0 にして savedGameSpeed も保存済み（1.559）。ここで上書きすると
    //   ラウンド移行時の復帰速度が 0 になってしまうので、まだ止まっていない時だけ保存する。
    if (gameState.gameSpeed > 0) bossState.savedGameSpeed = gameState.gameSpeed;
    gameState.gameSpeed = 0;
    // 既存エンティティクリア
    enemies = []; flyingEnemies = []; coins = []; powerUps = [];
    bossState.eggs = [];
    // アリーナ壁
    bossState.arenaLeft = gameState.camera.x + 30;
    bossState.arenaRight = gameState.camera.x + GAME_WIDTH - 30;
    var aL = bossState.arenaLeft;
    var aR = bossState.arenaRight;
    // ─── 固定ボスステージ地形 ───
    // 画面内の既存地形を除去
    terrain = terrain.filter(function(t) {
        return t.x + t.width < aL - 100 || t.x > aR + 100;
    });
    // 既存プラットフォームも除去
    platforms = platforms.filter(function(p) {
        return p.x + p.width < aL - 100 || p.x > aR + 100;
    });
    // フラットな地面を敷き詰め（穴なし、ギミックなし）
    for (var tx = aL - 100; tx < aR + 100; tx += 100) {
        terrain.push({ x: tx, y: GROUND_Y, width: 100, height: 130, type: 'ground' });
    }
    // 戦術用の固定プラットフォーム（踏みつけ用の足場）
    var arenaW = aR - aL;
    platforms.push({
        x: aL + 30, y: GROUND_Y - 110, width: 130, height: 30,
        type: 'floating_ground', special: 'normal', isBossArena: true
    });
    platforms.push({
        x: aR - 160, y: GROUND_Y - 120, width: 130, height: 30,
        type: 'floating_ground', special: 'normal', isBossArena: true
    });
    platforms.push({
        x: aL + arenaW / 2 - 55, y: GROUND_Y - 190, width: 110, height: 30,
        type: 'cloud', special: 'normal', isBossArena: true
    });
    // ボスオブジェクト生成
    // HP増は「ボスが一巡した次のラウンド」から（1周目=一律100）＋上限。難度はラウンド連動の攻撃パターンでも上げる（bossEncounter参照）。
    // ⚠BOSS_CYCLE_ROUNDS 連動（1.536）: カカシ追加で一巡が6ラウンドになったのに旧5周期のまま(gameRound-5)で、
    //   まだ一巡していないR6のカカシがHP120になっていた（ユーザー指摘）。地底ステージのボスを足せば自動でR8起点になる。
    var bossMaxHp = BOSS_MAX_HP + Math.min(Math.max(0, gameRound - BOSS_CYCLE_ROUNDS), BOSS_HP_ROUND_CAP) * BOSS_HP_PER_ROUND;
    if (tutorialState.active) bossMaxHp = 30; // チュートリアル専用の弱いボス（AI=ニワトリ流用・見た目=ひよこ大王）
    bossState.maxHp = bossMaxHp;
    bossState.boss = {
        x: gameState.camera.x + GAME_WIDTH + 50,
        y: GROUND_Y - BOSS_HEIGHT,
        width: BOSS_WIDTH, height: BOSS_HEIGHT,
        hp: bossMaxHp,
        velX: 0, velY: 0,
        facing: 'left',
        animFrame: 0,
        patrolDir: -1,
        attackTimer: 180,
        angerTimer: 0,
        isAngry: false,
        isRushing: false,
        rushTargetX: 0,
        isJumping: false,
        isFlaming: false,
        flameTimer: 0,
        isCharging: false,
        chargeTimer: 0,
        spriteFrame: 0,
        spriteResetTimer: 0,
        stompCooldown: 0,
        // ボス種＝ラウンドで決定（5種ローテ／6の倍数は門番「闇のカカシ」）。bossKindForRound は core-state.js
        kind: bossKindForRound(gameRound),
        // 空中ボス(hawk)専用ステート
        hawkMode: 'hover',   // hover→charge→dive→stun→rise
        hawkBob: 0,          // 滞空の上下揺れ位相
        chargeTimer: 0,      // ダイブ前の溜め
        stunTimer: 0,        // ダイブ着地後の硬直（=踏める窓）
        diveTargetX: 0,
        pendingDoubleDive: false, // (hawk用) 2連ダイブ予約
        // 装甲卵ボス(egg)専用ステート
        eggMode: 'idle',     // idle→roll/slam/summon→exposed→idle
        eggTimer: 0,         // 各モードの残り時間
        rollAngle: 0,        // 転がり回転角（描画用）
        rollDir: -1,         // 転がり方向
        exposed: false,      // (egg/snake共用) 弱点/頭の露出中（この間だけ踏み/弾でダメージが通る）
        exposedTimer: 0,
        // 闇の大蛇(snake)専用ステート
        serpMode: 'burrowed',// burrowed→telegraph→strike→exposed→retreat（時々 sweep/spit）
        serpTimer: 0,
        strikeX: 0,          // 突き上げ狙いのX
        headY: 0,            // 頭の上端Y（描画/当たり＝地面から生える）
        // 闇のフクロウ(owl)専用ステート
        owlMode: 'hover',    // hover→aim→swoop→hoot→perch
        owlTimer: 0,
        swoopY: 0,           // 横薙ぎ急襲の高さ（screen/world共通・縦カメラ無し）
        swoopDir: -1,
        darkness: 0,         // 暗転の濃さ 0..1（描画）
        darkWant: 0,         // 暗転の目標値
        darkTimer: 0,
        // 闇のカカシ(scarecrow)専用ステート
        scMode: 'plant',     // plant(登場)→idle→summonTele→sweepTele→sweep→expose→recover
        scTimer: 0,
        scCycle: 0,          // 攻撃とexpose(踏みチャンス)を交互にするカウンタ
        headLow: 0,          // 頭の下がり具合 0(防御=高い)..1(露出=低い)
        sweepDir: -1,        // 腕薙ぎの向き（見た目）
        planted: false       // 登場の落下→着地フラグ
    };
    // 空中ボスは地面より高い滞空高度から登場させる
    if (bossState.boss.kind === 'hawk' || bossState.boss.kind === 'owl') {
        bossState.boss.y = GROUND_Y - BOSS_HEIGHT - 80;
    }
    if (tutorialState.active && bossState.boss.kind === 'rooster') bossState.boss.hiyoko = true; // ひよこ大王（見た目/図鑑だけ専用・AIはニワトリ）
    // ずかん: ボスは「撃破時のみ」登録する（zukanAddKill・ボス撃破報酬ブロック内）。倒していないのに図鑑に載る/コンプできるのは
    // 設計ミスのため、遭遇時の登録は撤去（1.474・ユーザー指摘）。チュートリアルは死なず ひよこ大王に必ず勝てる＝確実に登録される。
    bossState.phase = 2; // entering
    bossState.summonTimer = BOSS_SUMMON_INTERVAL;
    bossState.itemSpawnTimer = 480; // ボス戦アイテム初回出現まで8秒（ショップ導入で抑制）
    bossState.flashAttackTimer = 0; // 閃光攻撃タイマー
    bossState.edgeSpawnTimer = 180; // 画面外雑魚スポーンタイマー
    bossState.flyingEdgeSpawnTimer = 240; // 画面外飛行敵スポーンタイマー
    // ボス戦は常に夜(3)の見た目に固定（R1は砂漠/雪山の境界で凍結し地面=砂漠・ブロック=氷でちぐはぐ＝ユーザー指摘。
    // R2以降は元々夜なので実質無変化）。地面パレット/背景/ブロックタイル/物理を夜のBOSS_SKYと揃える。撃破後は
    // updateBiome が通常の遷移で次バイオーム（R1後=雪山）へ戻す。
    biomeState.previous = biomeState.current = BOSS_BIOME;
    biomeState.transition = 0;
    biomeState._lastStep = -1;
    applyBiomePalette(BOSS_BIOME);
    bgCache = null; // ボス戦背景に切り替え
    if (soundManager) soundManager.playBossBGM();
}

function updateBoss() {
    if (!bossState.active) return;
    var b = bossState.boss;

    switch (bossState.phase) {
    case 1: // WARNING
        bossState.warningTimer--;
        if (bossState.warningTimer <= 0) setupBossArena();
        return;

    case 2: // 登場
        var targetX = gameState.camera.x + GAME_WIDTH * 0.62;
        if (b.kind === 'hawk') {
            // 空中ボス: 滞空高度を保ったまま右から飛んで入場（羽ばたき）
            b.x -= 3;
            b.animFrame++;
            b.spriteFrame = HAWK_HOVER_CYCLE[Math.floor(b.animFrame / 4) % HAWK_HOVER_CYCLE.length];
            if (b.x <= targetX) {
                b.x = targetX;
                b.y = GROUND_Y - BOSS_HEIGHT - 80;
                b.hawkMode = 'hover';
                b.attackTimer = 80;
                bossState.phase = 3;
            }
            return;
        }
        if (b.kind === 'owl') {
            // 闇のフクロウ: 空中を右から飛んで入場
            b.x -= 3;
            b.animFrame++;
            b.y = GROUND_Y - BOSS_HEIGHT - 70;
            if (b.x <= targetX) { b.x = targetX; b.owlMode = 'hover'; b.owlTimer = 55; bossState.phase = 3; }
            return;
        }
        if (b.kind === 'snake') {
            // 闇の大蛇: 地中から登場（歩き入場しない）。アリーナ中央に潜って即戦闘へ
            b.x = gameState.camera.x + GAME_WIDTH * 0.5 - b.width / 2;
            b.headY = GROUND_Y + b.height;  // 完全に地中（見えない）
            b.y = b.headY;
            b.serpMode = 'burrowed'; b.serpTimer = 55; b.exposed = false;
            bossState.phase = 3;
            return;
        }
        if (b.kind === 'egg') {
            // 装甲卵ボス: 右から転がって入場
            b.x -= 2.5;
            b.animFrame++;
            b.rollAngle -= 0.1;
            if (b.x <= targetX) { b.x = targetX; b.eggMode = 'idle'; b.eggTimer = 45; bossState.phase = 3; }
            return;
        }
        if (b.kind === 'scarecrow') {
            // 闇のカカシ: 動かないので歩き入場せず、アリーナ中央やや右へ空から突き立つ（落下→着地）
            if (!b.planted) {
                b.planted = true;
                b.x = gameState.camera.x + GAME_WIDTH * 0.60;
                b.y = GROUND_Y - BOSS_HEIGHT - 160;
                b.velY = 0;
            }
            b.velY += 1.5; b.y += b.velY;
            b.animFrame++;
            if (b.y >= GROUND_Y - BOSS_HEIGHT) {
                b.y = GROUND_Y - BOSS_HEIGHT; b.velY = 0;
                b.scMode = 'idle'; b.scTimer = 48; b.scCycle = 0;
                spawnExplosionEffect(b.x + b.width / 2, GROUND_Y); // 着地の土煙
                if (soundManager) soundManager.playKill();
                bossState.phase = 3;
            }
            return;
        }
        // 地上ボス: 右から歩いて入場
        b.x -= 2;
        b.animFrame++;
        b.spriteFrame = (Math.floor(b.animFrame / 10) % 2 === 0) ? BOSS_FRAME_IDLE : BOSS_FRAME_WALK;
        if (b.x <= targetX) { b.x = targetX; bossState.phase = 3; }
        return;

    case 3: // 戦闘
        updateBossAI(b);
        updateBossCollision(b);
        updateEggs();
        updateBossItems();
        b.animFrame++;
        // スプライトリセットタイマー
        if (b.spriteResetTimer > 0) {
            b.spriteResetTimer--;
            if (b.spriteResetTimer <= 0) b.spriteFrame = BOSS_FRAME_IDLE;
        }
        // ── 閃光攻撃ダメージ判定 ──
        if (bossState.flashAttackTimer > 0) {
            bossState.flashAttackTimer--;
            // 発動直後（残り27フレーム時点）にダメージ判定：地面近くにいたら被弾
            if (bossState.flashAttackTimer === 27) {
                if (!isPlayerProtected() && player.y + player.height >= GROUND_Y - 70) {
                    takeDamage();
                }
            }
        }
        // ── ROUND2+: 画面外から雑魚敵スポーン ──
        if (gameRound >= 2) {
            bossState.edgeSpawnTimer--;
            if (bossState.edgeSpawnTimer <= 0) {
                spawnEdgeEnemy();
                bossState.edgeSpawnTimer = Math.max(90, 180 - (gameRound - 2) * 20);
            }
        }
        // ── ボスを一巡した次のラウンドから: 飛行敵も画面外からスポーン（開始ラウンドを最も緩い間隔に） ──
        // ⚠開始は「ボスが一巡し終えた次」＝BOSS_KINDS.length+1（現在6体でR7）。カカシ追加前はR6だったが、
        //   R6はカカシ初登場＝まだ一巡していないので早すぎるとユーザー判断（地底ステージのボスを足せば自動でR8になる）。
        if (gameRound >= BOSS_FLYING_EDGE_ROUND) {
            bossState.flyingEdgeSpawnTimer--;
            if (bossState.flyingEdgeSpawnTimer <= 0) {
                spawnEdgeFlyingEnemy();
                bossState.flyingEdgeSpawnTimer = Math.max(120, 240 - (gameRound - BOSS_FLYING_EDGE_ROUND) * 20);
            }
        }
        return;

    case 4: // 撃破演出
        bossState.defeatedTimer++;
        // フクロウ戦: 暗転(darkness)はAI(phase3)でしか更新されないため、暗転中に倒すと
        // 撃破演出〜ラウンド表示がほぼ真っ暗のまま進んでいた。撃破後は約1秒でフェードアウトさせる。
        if (bossState.boss && bossState.boss.kind === 'owl' && bossState.boss.darkness > 0) {
            bossState.boss.darkness = Math.max(0, bossState.boss.darkness - 0.02);
        }
        // ボス撃破時に全敵消去
        if (bossState.defeatedTimer === 1) {
            for (var ei = 0; ei < enemies.length; ei++) {
                spawnExplosionEffect(enemies[ei].x + enemies[ei].width / 2, enemies[ei].y + enemies[ei].height / 2);
            }
            for (var fi = 0; fi < flyingEnemies.length; fi++) {
                spawnExplosionEffect(flyingEnemies[fi].x + flyingEnemies[fi].width / 2, flyingEnemies[fi].y + flyingEnemies[fi].height / 2);
            }
            enemies = [];
            flyingEnemies = [];
            bossState.eggs = [];
        }
        // 時間差爆発 (15フレームごと × 5回)
        if (bossState.defeatedTimer % 15 === 0 && bossState.defeatedTimer <= 75) {
            var ex = b.x + Math.random() * b.width;
            var ey = b.y + Math.random() * b.height;
            spawnExplosionEffect(ex, ey);
            if (soundManager) soundManager.playKill();
        }
        // コイン散布 + スコア + ファンファーレ
        if (bossState.defeatedTimer === 90) {
            for (var ci = 0; ci < BOSS_COINS_ON_DEFEAT; ci++) {
                coins.push({
                    x: b.x + b.width / 2 + (Math.random() - 0.5) * 250,
                    y: b.y + (Math.random() - 0.5) * 120,
                    width: 32, height: 32,
                    collected: false, animFrame: Math.random() * 20
                });
            }
            gainScore(BOSS_DEFEAT_SCORE);
            gameState.enemyKills++; // ボス撃破を撃破数に加算
            gameState.bossKills++;  // デイリーミッション(ボス撃破)用
            zukanAddKill(b.hiyoko ? 'boss:hiyoko' : 'boss:' + b.kind); // ずかん: ボス撃破数を加算
            if (soundManager) soundManager.playBossFanfare();
            floatEffects.push({
                type: 'boss_defeated_text',
                worldX: b.x + b.width / 2, worldY: b.y,
                timer: 0, duration: 180, offsetY: 0
            });
            floatEffects.push({
                type: 'score_text',
                worldX: b.x + b.width / 2, worldY: b.y - 40,
                timer: 0, duration: 90, offsetY: 0,
                score: BOSS_DEFEAT_SCORE
            });
        }
        // 5秒後に移行（チュートリアルは勝利ファンファーレ win.mp3≈7.8秒 が鳴り終わるまで待ってから完了画面へ）
        if (bossState.defeatedTimer >= (tutorialState.active ? 480 : 300)) {
            if (tutorialState.active) { finishTutorial(); return; } // チュートリアル: 次ラウンドへ行かず完了画面へ
            bossState.phase = 5;
            bossState.roundTextTimer = 180;
        }
        return;

    case 5: // ラウンド移行
        bossState.roundTextTimer--;
        if (bossState.roundTextTimer <= 0) {
            gameRound++;
            bossState.active = false;
            bossState.phase = 0;
            bossState.boss = null;
            bossState.bossTriggered = false;
            bossState.eggs = [];
            // ボスステージ用プラットフォーム除去
            platforms = platforms.filter(function(p) { return !p.isBossArena; });
            // 通常地形生成の再開ポイントを設定
            gameState.lastTerrainX = bossState.arenaRight + 100;
            // スクロール再開（ラウンド倍率適用）
            var roundMult = 1 + (gameRound - 1) * 0.2;
            gameState.gameSpeed = Math.min(bossState.savedGameSpeed * roundMult, BASE_SCROLL_SPEED * 5.0);
            // ⚠地底ラウンドへ移る時は1pxも動かさない（1.554・ユーザー指定「1mも移動せずその場で土管が出る」）。
            //   ここで0にしておかないと、次tickで checkBossTrigger が土管を置くまでの1フレームぶん進んでしまう。
            if (isUndergroundRound(gameRound)) gameState.gameSpeed = 0;
            // 通常BGM・背景復帰
            bgCache = null;
            // ⚠地底ラウンドへ移る時はBGMを鳴らさず**無音のまま**にする（1.556・ユーザー指定）。
            //   撃破ファンファーレ → 無音 → 土管がせり上がる轟音 → もぐる → 地底BGM、という流れにする。
            //   ここでステージBGMを鳴らすと、せり上がりの轟音が通常曲に埋もれて緊張感が出ない。
            if (isUndergroundRound(gameRound)) { try { soundManager && soundManager.stopAllBGM(); } catch (_) {} }
            else playStageBGM();
            // ショップ訪問フラグリセット（次ラウンド用）。⚠exitUnderground にも同じ4行がある＝対で維持（1.573）
            shopState.visited = false;
            shopState.deposited = false;
            shopState.buildingPlaced = false;
            shopState.buildingX = 0;
            pipeRoomState.visited = false;
            pipeRoomState.placed = false;
            pipeRoomState.x = 0;
        }
        return;
    }
}

// ボススプライトフレーム定数
var BOSS_FRAME_IDLE    = 0;
var BOSS_FRAME_WALK    = 1;
var BOSS_FRAME_RUSH    = 2;
var BOSS_FRAME_JUMP    = 3;
var BOSS_FRAME_SUMMON  = 4;
var BOSS_FRAME_DAMAGED = 5;
var BOSS_FRAME_FLAME   = 6;

// 空中ボス(hawk)スプライトフレーム定数（boss_hawk シート: 0:idle 1:flap 2:dive 3:shoot 4:damaged）
var HAWK_FRAME_IDLE    = 0;
var HAWK_FRAME_FLAP    = 1;
var HAWK_FRAME_DIVE    = 2;
var HAWK_FRAME_SHOOT   = 3;
var HAWK_FRAME_DAMAGED = 4;
var HAWK_FRAME_FLAP2   = 5; // 羽ばたき下端(Veo f28)。frame 6-9 = f4/f10/f16/f22（同じ羽ばたき動画の連続コマ）
// ホバーの羽ばたき: f4(上)→f10→f16→f22→f28(下)→f22→f16→f10 の連続5コマ往復（8ステップ＝滑らか。2〜3枚だとカクつく）
var HAWK_HOVER_CYCLE = [6, 7, 8, 9, 5, 9, 8, 7];

function updateBossAI(b) {
    if (b.kind === 'hawk') { updateBossAI_hawk(b); }
    else if (b.kind === 'egg') { updateBossAI_egg(b); }
    else if (b.kind === 'snake') { updateBossAI_snake(b); }
    else if (b.kind === 'owl') { updateBossAI_owl(b); }
    else if (b.kind === 'scarecrow') { updateBossAI_scarecrow(b); }
    else { updateBossAI_mama(b); }
}

// そのボスの「何回目の登場か」。ボスは BOSS_KINDS.length 周期で循環するので /その周期（各ボスは自分の初登場を1として1,2,3…）。
// ラウンド連動の攻撃解禁の共通基準。新ボスもこれで技をぶら下げる（bossEncounter()>=N）。
// ⚠周期はローテ数(5)ではなくボスが一巡するラウンド数(BOSS_CYCLE_ROUNDS=6)で割る（1.537）。
//   カカシ追加で一巡が6になったため、5で割ると「そのボスの何回目か」とズレる
//   （例: フクロウはR5→R11→R17だが ceil(11/5)=3 で2回目が3回目扱いになっていた）。
//   6で割ると各ボスのN回目の遭遇が正しく enc=N になる（ニワトリR1/R7/R13→1/2/3）。
function bossEncounter() { return Math.ceil(gameRound / BOSS_CYCLE_ROUNDS); }

// 黄色メイド服の特殊効果: 攻撃1回につき1/20(5%)でクリティカル＝与ダメージ2倍。ダメージに掛ける倍率(1 or 2)を返す。
// 当たった時だけ演出（クリティカル！）を出す。メイド服以外・スキン無効時は常に1。
function critMultiplier(worldX, worldY) {
    if (typeof SKIN_FEATURE_ENABLED !== 'undefined' && SKIN_FEATURE_ENABLED &&
        runActiveSkin() === 'maid' && Math.random() < 0.05) {
        if (typeof spawnCritText === 'function') spawnCritText(worldX, worldY, (typeof t === 'function') ? t('crit_text') : 'CRITICAL!');
        if (typeof soundManager !== 'undefined' && soundManager) soundManager.playCritical();
        return 2;
    }
    return 1;
}

// ─────────────────────────────────────────────────────────────
// 空中ボス(hawk)のAI: 滞空して左右に漂い、ダイブ爆撃と羽根弾で攻める。
// 主ダメージ源はエナジー弾（updateBossCollision_hawk参照）、
// 補助はダイブ着地硬直(stun)中の踏みつけ。滞空中の本体は踏めない設計。
// ※ updateBossAI_mama は一切変更しないこと（地上ボスの既存挙動を保持）。
// ─────────────────────────────────────────────────────────────
function updateBossAI_hawk(b) {
    var maxHp = bossState.maxHp || BOSS_MAX_HP;
    var hpRatio = b.hp / maxHp;
    var phase = hpRatio > 0.7 ? 1 : hpRatio > 0.3 ? 2 : 3; // 3=瀕死で攻撃が速く/連続化
    var hoverY = GROUND_Y - BOSS_HEIGHT - 80;
    var groundSit = GROUND_Y - BOSS_HEIGHT;   // ダイブ着地時のY（地面に降りる）
    var aL = bossState.arenaLeft, aR = bossState.arenaRight;

    // 怒りモード（踏まれた / 瀕死）のカウントダウン
    if (b.isAngry) { b.angerTimer--; if (b.angerTimer <= 0) b.isAngry = false; }
    var angryMult = (b.isAngry || phase === 3) ? 1.5 : 1;

    switch (b.hawkMode) {
    case 'charge': {
        // プレイヤーの真上へ素早く寄せてからダイブ（溜め）
        var lockX = Math.max(aL, Math.min(aR - b.width, player.x + player.width / 2 - b.width / 2));
        if (Math.abs(lockX - b.x) > 1) b.x += Math.sign(lockX - b.x) * Math.min(4.5, Math.abs(lockX - b.x));
        b.y = hoverY + Math.sin(b.animFrame * 0.5) * 3; // 小刻みに震える
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        b.spriteFrame = HAWK_FRAME_DIVE;
        b.chargeTimer--;
        if (b.chargeTimer <= 0) {
            b.hawkMode = 'dive';
            b.velY = 0;
            if (soundManager) soundManager.playFlash();
        }
        break;
    }
    case 'dive': {
        // 真下へ急降下（横移動なし＝横に避ければ回避できる）
        b.spriteFrame = HAWK_FRAME_DIVE;
        b.velY += GRAVITY * 1.7;
        b.y += b.velY;
        if (b.y >= groundSit) {
            b.y = groundSit;
            b.velY = 0;
            b.hawkMode = 'stun';
            b.stunTimer = (phase === 3 ? 70 : 100); // 着地硬直=踏める窓。瀕死ほど短い
            floatEffects.push({ type: 'boss_shockwave', worldX: b.x + b.width / 2, worldY: GROUND_Y, timer: 0, duration: 20 });
        }
        break;
    }
    case 'stun': {
        // 着地硬直: 地面に降りて無防備（踏む or エナジー弾で削るチャンス）
        b.spriteFrame = HAWK_FRAME_DAMAGED;
        b.stunTimer--;
        if (b.stunTimer <= 0) b.hawkMode = 'rise';
        break;
    }
    case 'rise': {
        // 滞空高度まで上昇して滞空へ復帰
        b.spriteFrame = HAWK_FRAME_FLAP;
        b.y -= 4.5;
        if (b.y <= hoverY) {
            b.y = hoverY;
            if (b.pendingDoubleDive) {
                // 【3回目登場〜(R14+)】2連ダイブ: 滞空に戻らず即・再ダイブ（畳みかけ・毎回の着地硬直=踏みチャンスは残す）
                b.pendingDoubleDive = false;
                b.hawkMode = 'charge';
                b.chargeTimer = (phase === 3 ? 14 : 20);
            } else {
                b.hawkMode = 'hover';
                b.attackTimer = (phase === 3 ? 45 : 85);
            }
        }
        break;
    }
    case 'hover':
    default: {
        // 滞空: 上下に漂いつつプレイヤーのX座標を緩く追う
        b.hawkBob += 0.06;
        b.y = hoverY + Math.sin(b.hawkBob) * 12;
        var tx = Math.max(aL, Math.min(aR - b.width, player.x + player.width / 2 - b.width / 2));
        var hoverSpeed = (phase === 3 ? 1.7 : phase === 2 ? 1.3 : 1.0) * angryMult;
        if (Math.abs(tx - b.x) > 1) b.x += Math.sign(tx - b.x) * Math.min(hoverSpeed, Math.abs(tx - b.x));
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        b.spriteFrame = HAWK_HOVER_CYCLE[Math.floor(b.animFrame / 4) % HAWK_HOVER_CYCLE.length];

        b.attackTimer--;
        if (b.attackTimer <= 0) {
            var enc = bossEncounter();
            var diveChance = phase === 3 ? 0.6 : phase === 2 ? 0.5 : 0.4;
            if (Math.random() < diveChance) {
                // ダイブ爆撃（溜めへ）。3回目登場〜(R14+)は一定確率で2連ダイブを予約
                b.hawkMode = 'charge';
                b.chargeTimer = (phase === 3 ? 16 : 26);
                b.pendingDoubleDive = (enc >= 3 && Math.random() < 0.45);
            } else if (enc >= 2 && Math.random() < 0.5) {
                // 【2回目登場〜(R8+)】広角・高密度の羽根バースト（ほぼ水平まで広げて横に避けにくく隙間を突かせる。上向きにはしない）
                spawnHawkFeathers(b, phase === 3 ? 11 : 9, Math.PI * 0.95);
                b.spriteFrame = HAWK_FRAME_SHOOT;
                b.spriteResetTimer = 20;
                b.attackTimer = (phase === 3 ? 75 : 115);
            } else {
                // 通常の羽根弾ばらまき（真下中心の扇）
                spawnHawkFeathers(b, phase === 3 ? 7 : 5, Math.PI * 0.75);
                b.spriteFrame = HAWK_FRAME_SHOOT;
                b.spriteResetTimer = 20;
                b.attackTimer = (phase === 3 ? 70 : 110);
            }
        }
        break;
    }
    }
}

// 羽根弾: 滞空位置から扇状に下方へ。bossState.eggs を流用するので
// updateEggs() のシールド判定・移動・消滅がそのまま効く（isFeather は描画用フラグ）。
function spawnHawkFeathers(boss, count, arcSpan) {
    var bx = boss.x + boss.width / 2;
    var by = boss.y + boss.height * 0.55;
    var speed = 4.2;
    var span = arcSpan || Math.PI * 0.75; // 既定=真下中心±約67°の扇（広角バーストは呼び出し側で拡大）
    for (var i = 0; i < count; i++) {
        var t = count > 1 ? (i / (count - 1)) : 0.5;             // 0..1
        var angle = Math.PI * 0.5 + (t - 0.5) * span;           // 真下中心の扇（span で広がりを可変）
        bossState.eggs.push({
            x: bx - 8, y: by,
            width: 16, height: 16,
            velX: Math.cos(angle) * speed,
            velY: Math.sin(angle) * speed,
            timer: 0, isFeather: true
        });
    }
    if (soundManager) soundManager.playFlash();
}

function updateBossAI_mama(b) {
    // フェーズ判定
    var maxHp = bossState.maxHp || BOSS_MAX_HP;
    var hpRatio = b.hp / maxHp;
    var phase = hpRatio > 0.7 ? 1 : hpRatio > 0.3 ? 2 : 3;
    var enc = bossEncounter(); // 3回目の遭遇(R13+)で2連突進を解禁

    // 怒りモードカウントダウン
    if (b.isAngry) {
        b.angerTimer--;
        if (b.angerTimer <= 0) b.isAngry = false;
    }
    var speedMult = b.isAngry ? 2.0 : 1.0;

    // ── 突進中 ──
    if (b.isRushing) {
        var rushDir = b.rushTargetX > b.x + b.width / 2 ? 1 : -1;
        b.x += rushDir * 5 * speedMult;
        b.facing = rushDir < 0 ? 'left' : 'right';
        b.spriteFrame = BOSS_FRAME_RUSH;
        if (Math.abs(b.x + b.width / 2 - b.rushTargetX) < 15 ||
            b.x <= bossState.arenaLeft || b.x + b.width >= bossState.arenaRight) {
            if (b.x <= bossState.arenaLeft) b.x = bossState.arenaLeft;
            if (b.x + b.width >= bossState.arenaRight) b.x = bossState.arenaRight - b.width;
            if (enc >= 3 && !b.didDoubleRush) {   // 【3回目登場〜(R13+)】逆方向の端へ折り返してもう一度＝2連突進
                b.didDoubleRush = true;
                var mid = (bossState.arenaLeft + bossState.arenaRight) / 2;
                b.rushTargetX = (b.x + b.width / 2 < mid) ? bossState.arenaRight : bossState.arenaLeft;
            } else {
                b.isRushing = false;
                b.spriteFrame = BOSS_FRAME_IDLE;
                b.attackTimer = phase === 3 ? 60 : 120;
            }
        }
        return;
    }

    // ── ジャンプ中 ──
    if (b.isJumping) {
        b.spriteFrame = BOSS_FRAME_JUMP;
        b.velY += GRAVITY;
        b.y += b.velY;
        if (b.y >= GROUND_Y - b.height) {
            b.y = GROUND_Y - b.height;
            b.velY = 0;
            b.isJumping = false;
            b.spriteFrame = BOSS_FRAME_IDLE;
            b.attackTimer = 90;
            floatEffects.push({
                type: 'boss_shockwave',
                worldX: b.x + b.width / 2, worldY: GROUND_Y,
                timer: 0, duration: 20
            });
        }
        return;
    }

    // ── 闇の炎ブレス中 ──
    if (b.isFlaming) {
        b.spriteFrame = BOSS_FRAME_FLAME;
        b.flameTimer--;
        // 10フレームごとに炎弾を発射（合計6発）
        if (b.flameTimer % 10 === 0 && b.flameTimer > 0) {
            var fdir = b.facing === 'left' ? -1 : 1;
            var fx = b.facing === 'left' ? b.x - 10 : b.x + b.width + 10;
            var fy = b.y + b.height * 0.35;
            bossState.eggs.push({
                x: fx, y: fy, width: 24, height: 24,
                velX: fdir * (5 + Math.random() * 2),
                velY: -1.5 + Math.random() * 3,
                timer: 0, isFlame: true
            });
        }
        if (b.flameTimer <= 0) {
            b.isFlaming = false;
            b.spriteFrame = BOSS_FRAME_IDLE;
            b.attackTimer = phase === 3 ? 80 : 120;
        }
        return;
    }

    // ── 閃光チャージ中（ROUND2+） ──
    if (b.isCharging) {
        b.chargeTimer--;
        // チャージ中はその場で停止、プレイヤーの方を向く
        b.facing = b.x + b.width / 2 > player.x + player.width / 2 ? 'left' : 'right';
        b.spriteFrame = BOSS_FRAME_SUMMON; // チャージポーズ
        if (b.chargeTimer <= 0) {
            b.isCharging = false;
            b.spriteFrame = BOSS_FRAME_FLAME;
            b.spriteResetTimer = 30;
            // 閃光発動！
            bossState.flashAttackTimer = 30;
            if (soundManager) soundManager.playFlash(); // 閃光音
        }
        return;
    }

    // ── パトロール移動 ──
    var patrolSpeed = (phase === 1 ? 1.0 : phase === 2 ? 1.5 : 2.0) * speedMult;
    b.x += b.patrolDir * patrolSpeed;
    b.facing = b.x + b.width / 2 > player.x + player.width / 2 ? 'left' : 'right';
    // 歩行アニメ: idle/walk を交互
    b.spriteFrame = (Math.floor(b.animFrame / 12) % 2 === 0) ? BOSS_FRAME_IDLE : BOSS_FRAME_WALK;
    // 壁で反転
    if (b.x <= bossState.arenaLeft) { b.x = bossState.arenaLeft; b.patrolDir = 1; }
    if (b.x + b.width >= bossState.arenaRight) { b.x = bossState.arenaRight - b.width; b.patrolDir = -1; }

    // ── 召喚タイマー ──
    bossState.summonTimer--;
    if (bossState.summonTimer <= 0) {
        spawnBossChick(b);
        b.spriteFrame = BOSS_FRAME_SUMMON;
        b.spriteResetTimer = 30;
        bossState.summonTimer = phase === 1 ? BOSS_SUMMON_INTERVAL : phase === 2 ? 240 : 180;
    }

    // ── 攻撃タイマー ──
    b.attackTimer--;
    if (b.attackTimer > 0) return;

    // ── 攻撃選択 ──
    var r = Math.random();
    var rates = BOSS_ATTACK_RATES[phase];
    var canFlash = gameRound >= 2; // ROUND2以降で閃光攻撃解禁
    if (phase === 1) {
        // Phase1: パトロール＋召喚のみ（ROUND2+は閃光チャンス有り）
        if (canFlash && r < rates.flash) {
            b.isCharging = true;
            b.chargeTimer = 50; // チャージ時間
        }
        b.attackTimer = 180;
    } else if (phase === 2) {
        if (canFlash && r < rates.flash) {
            // 閃光攻撃（チャージ開始）
            b.isCharging = true;
            b.chargeTimer = 45;
        } else if (r < rates.rush) {
            // 突進
            b.isRushing = true;
            b.didDoubleRush = false; // 3周目の2連突進フラグをリセット（毎回1回だけ折り返せる）
            b.rushTargetX = player.x + player.width / 2;
            b.spriteFrame = BOSS_FRAME_RUSH;
        } else if (r < rates.egg) {
            // 卵3発
            spawnEggProjectiles(b, 3);
            b.spriteFrame = BOSS_FRAME_SUMMON;
            b.spriteResetTimer = 20;
            b.attackTimer = 120;
        } else if (r < rates.flame) {
            // 闇の炎ブレス
            b.isFlaming = true;
            b.flameTimer = 60; // 1秒間
            b.spriteFrame = BOSS_FRAME_FLAME;
        } else {
            b.attackTimer = 90;
        }
    } else { // phase 3
        if (canFlash && r < rates.flash) {
            // 閃光攻撃（チャージ短い）
            b.isCharging = true;
            b.chargeTimer = 35;
        } else if (r < rates.rush) {
            b.isRushing = true;
            b.didDoubleRush = false; // 3周目の2連突進フラグをリセット
            b.rushTargetX = player.x + player.width / 2;
            b.spriteFrame = BOSS_FRAME_RUSH;
        } else if (r < rates.egg) {
            spawnEggProjectiles(b, 4);
            b.spriteFrame = BOSS_FRAME_SUMMON;
            b.spriteResetTimer = 20;
            b.attackTimer = 90;
        } else if (r < rates.jump) {
            // ジャンプ攻撃
            b.isJumping = true;
            b.velY = -14;
            b.spriteFrame = BOSS_FRAME_JUMP;
        } else if (r < rates.flame) {
            // 闇の炎ブレス（Phase3は長い）
            b.isFlaming = true;
            b.flameTimer = 90; // 1.5秒間
            b.spriteFrame = BOSS_FRAME_FLAME;
        } else {
            b.attackTimer = 60;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 装甲卵ボス(egg)のAI: 硬い殻で通常の踏みを弾く（ダメージ0）。転がり/叩きつけ/召喚の各攻撃後に
// 「弱点露出（exposed）」の隙ができ、その間だけ踏み/弾でダメージが通る＝タイミング勝負。
// 転がりは低くジャンプで回避／叩きつけは衝撃波を飛び越え。攻撃はbossEncounter()で解禁。
// ─────────────────────────────────────────────────────────────
function updateBossAI_egg(b) {
    var maxHp = bossState.maxHp || BOSS_MAX_HP;
    var hpRatio = b.hp / maxHp;
    var phase = hpRatio > 0.6 ? 1 : hpRatio > 0.3 ? 2 : 3; // 瀕死ほど攻撃が速く隙が短い
    var enc = bossEncounter();
    var aL = bossState.arenaLeft, aR = bossState.arenaRight;
    var groundY = GROUND_Y - b.height;
    if (b.isAngry) { b.angerTimer--; if (b.angerTimer <= 0) b.isAngry = false; }

    switch (b.eggMode) {
    case 'idle':
        b.exposed = false;
        b.y = groundY;
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        b.eggTimer--;
        if (b.eggTimer <= 0) {
            var r = Math.random();
            if (r < 0.55) {
                b.eggMode = 'rollWind';
                b.rollDir = (player.x + player.width / 2 < b.x + b.width / 2) ? -1 : 1;
                b.eggTimer = 26;         // 溜め（転がりの予告）
                b.didDoubleRoll = false;
            } else if (r < 0.82) {
                b.eggMode = 'slam';
                b.velY = -13;
            } else {
                b.eggMode = 'summon';
                b.eggTimer = 26;
            }
        }
        break;

    case 'rollWind':                     // その場で震えて予告（回避の猶予）
        b.y = groundY;
        b.rollAngle += (Math.floor(b.animFrame / 2) % 2 === 0 ? 1 : -1) * 0.06;
        b.eggTimer--;
        if (b.eggTimer <= 0) b.eggMode = 'roll';
        break;

    case 'roll': {
        var rollSpeed = (phase === 3 ? 8 : phase === 2 ? 7 : 6) * (enc >= 2 ? 1.2 : 1); // 【2回目〜(R9+)】高速化
        b.x += b.rollDir * rollSpeed;
        b.rollAngle += b.rollDir * (rollSpeed / (b.width * 0.45)); // 見た目の転がり回転
        b.facing = b.rollDir < 0 ? 'left' : 'right';
        b.y = groundY;
        var hitWall = (b.rollDir < 0 && b.x <= aL) || (b.rollDir > 0 && b.x + b.width >= aR);
        if (hitWall) {
            b.x = Math.max(aL, Math.min(aR - b.width, b.x));
            floatEffects.push({ type: 'boss_shockwave', worldX: b.x + b.width / 2, worldY: GROUND_Y, timer: 0, duration: 18 });
            if (enc >= 3 && !b.didDoubleRoll) {   // 【3回目〜(R15+)】壁ヒットで一度だけ逆方向へ2連転がり
                b.didDoubleRoll = true;
                b.rollDir *= -1;
            } else {
                b.eggMode = 'exposed';
                b.exposed = true;
                b.exposedTimer = (phase === 3 ? 80 : 108); // ダウン＝踏める窓
            }
        }
        break;
    }

    case 'slam':                          // ジャンプ→落下→着地で衝撃波＋露出
        b.velY += GRAVITY;
        b.y += b.velY;
        b.rollAngle = 0;
        if (b.y >= groundY) {
            b.y = groundY;
            b.velY = 0;
            floatEffects.push({ type: 'boss_shockwave', worldX: b.x + b.width / 2, worldY: GROUND_Y, timer: 0, duration: 22 });
            if (!isPlayerProtected() && player.y + player.height >= GROUND_Y - 60 &&
                Math.abs((player.x + player.width / 2) - (b.x + b.width / 2)) < b.width * 1.3) {
                takeDamage(); // 着地の衝撃波（地上にいると被弾／ジャンプで回避）
            }
            if (enc >= 2) spawnEggShards(b, phase); // 【2回目〜(R9+)】着地で殻の破片を左右へ飛散＝遠距離の脅威を追加
            b.eggMode = 'exposed';
            b.exposed = true;
            b.exposedTimer = (phase === 3 ? 66 : 92);
        }
        break;

    case 'summon':
        b.y = groundY;
        b.eggTimer--;
        if (b.eggTimer <= 0) {
            spawnBossChick(b);
            if (phase >= 2) spawnBossChick(b);
            b.eggMode = 'exposed';
            b.exposed = true;
            b.exposedTimer = 76;          // 召喚後の隙
        }
        break;

    case 'exposed':                       // 弱点露出（踏み/弾が通る窓）。停止してプレイヤーを向く
    default:
        b.y = groundY;
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        b.exposedTimer--;
        if (b.exposedTimer <= 0) {
            b.exposed = false;
            b.eggMode = 'idle';
            b.eggTimer = (phase === 3 ? 28 : 46); // 次の攻撃までの間
        }
        break;
    }
}

// ─────────────────────────────────────────────────────────────
// 闇の大蛇(snake)のAI: 地中に潜り、足元を予告してから"下から"突き上げる。頂点で頭が露出(exposed)＝踏むチャンス。
// カラスの"上から"の対。回避は「予告位置から離れる（横移動）」＋地這いは「ジャンプで飛び越え」。攻撃はbossEncounter()で解禁。
// headY=頭の上端Y（描画/当たり）。地中はGROUND_Y下（drawBossでGROUND_Yより上だけ描画＝生えてくる演出）。
// ─────────────────────────────────────────────────────────────
function updateBossAI_snake(b) {
    var maxHp = bossState.maxHp || BOSS_MAX_HP;
    var hpRatio = b.hp / maxHp;
    var phase = hpRatio > 0.6 ? 1 : hpRatio > 0.3 ? 2 : 3;
    var enc = bossEncounter();
    var aL = bossState.arenaLeft, aR = bossState.arenaRight;
    var APEX = GROUND_Y - 92;             // 突き上げ頂点（頭の上端Y）＝踏める高さ
    var HIDDEN = GROUND_Y + 30;           // 地中（頭も隠れる）
    if (b.isAngry) { b.angerTimer--; if (b.angerTimer <= 0) b.isAngry = false; }

    switch (b.serpMode) {
    case 'burrowed':
        b.exposed = false;
        b.headY = HIDDEN; b.y = b.headY;
        b.serpTimer--;
        if (b.serpTimer <= 0) {
            var r = Math.random();
            if (enc >= 2 && r < 0.24) {              // 【2回目〜】毒吐き
                b.serpMode = 'spit'; b.serpTimer = 26;
                b.x = Math.max(aL, Math.min(aR - b.width, player.x + player.width / 2 - b.width / 2));
            } else if (r < 0.30) {                   // 地這い（横断・飛び越え）
                b.serpMode = 'sweep';
                b.rollDir = (player.x + player.width / 2 < b.x + b.width / 2) ? 1 : -1; // 逆側から来る
                b.x = (b.rollDir > 0) ? (aL - b.width) : aR;
                b.facing = b.rollDir < 0 ? 'left' : 'right';
            } else {                                 // 突き上げ（足元を予告）
                b.serpMode = 'telegraph';
                b.x = Math.max(aL, Math.min(aR - b.width, player.x + player.width / 2 - b.width / 2));
                b.serpTimer = (phase === 3 ? 20 : 32) * (enc >= 3 ? 0.7 : 1); // 【3回目〜】予告が短い
            }
        }
        break;

    case 'telegraph':                     // 足元に土煙予告（drawBoss）＝ここから離れれば回避
        b.headY = HIDDEN; b.y = b.headY;
        b.serpTimer--;
        if (b.serpTimer <= 0) { b.serpMode = 'strike'; b.velY = -20; }
        break;

    case 'strike':                        // 頭が地面から突き上がる
        b.velY += 1.3;
        b.headY += b.velY;
        b.y = b.headY;
        if (b.headY <= APEX) {
            b.headY = APEX; b.y = b.headY;
            b.serpMode = 'exposed'; b.exposed = true;
            b.exposedTimer = (phase === 3 ? 52 : 76); // 頭が出て踏める窓
        }
        break;

    case 'exposed':                       // 頭が露出（無防備＝踏むチャンス）。接近は許す（本体接触ダメージなし）
        b.headY = APEX; b.y = b.headY;
        b.exposedTimer--;
        if (b.exposedTimer <= 0) { b.exposed = false; b.serpMode = 'retreat'; }
        break;

    case 'retreat':                       // 地中へ引っ込む
        b.exposed = false;
        b.headY += 9; b.y = b.headY;
        if (b.headY >= HIDDEN) { b.headY = HIDDEN; b.serpMode = 'burrowed'; b.serpTimer = (phase === 3 ? 24 : 42); }
        break;

    case 'sweep': {                       // 地を這って横断（頭を地面すぐ上に）＝ジャンプで飛び越え
        b.headY = GROUND_Y - 44; b.y = b.headY; b.exposed = false;
        var sweepSpeed = (phase === 3 ? 7 : 6) * (enc >= 2 ? 1.15 : 1);
        b.x += b.rollDir * sweepSpeed;
        if ((b.rollDir > 0 && b.x > aR) || (b.rollDir < 0 && b.x + b.width < aL)) {
            b.serpMode = 'burrowed'; b.serpTimer = (phase === 3 ? 22 : 38);
        }
        break;
    }

    case 'spit': {                        // 頭を少し出して毒（闇の飛沫）を前方へ吐く
        b.headY = GROUND_Y - 68; b.y = b.headY; b.exposed = false;
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        b.serpTimer--;
        if (b.serpTimer === 12) spawnSnakeVenom(b, phase === 3 ? 4 : 3);
        if (b.serpTimer <= 0) { b.serpMode = 'exposed'; b.exposed = true; b.exposedTimer = 58; }
        break;
    }

    default:
        b.serpMode = 'burrowed'; b.serpTimer = 40;
        break;
    }
}

// 大蛇の毒（闇の飛沫）: 頭から前方へ扇状に。isFlame を流用（updateEggs のシールド判定/移動/描画/被弾がそのまま効く）。
function spawnSnakeVenom(boss, count) {
    var bx = boss.x + boss.width / 2;
    var by = boss.headY + 18;
    var dir = (player.x + player.width / 2 < bx) ? -1 : 1;
    for (var i = 0; i < count; i++) {
        var t = count > 1 ? i / (count - 1) : 0.5;
        bossState.eggs.push({
            x: bx - 11, y: by, width: 22, height: 22,
            velX: dir * (4 + t * 2.2),
            velY: -3.2 + t * 3.6,   // 上向き〜やや下の扇（前方へ散る）
            timer: 0, isFlame: true
        });
    }
    if (soundManager) soundManager.playFlash();
}

// ─────────────────────────────────────────────────────────────
// 闇のフクロウ(owl)のAI: アリーナを暗転（プレイヤー周囲だけ見える vignette）させ、光る目と明るい予告で攻める。
// 攻撃: 横一線を予告→"横薙ぎ急襲"（高さをズラして回避＝カラスの縦ダイブの対）／音波（地上被弾＝ジャンプ回避）／
// 止まり(perch)＝暗転が晴れて無防備＝踏むチャンス。暗転の濃さ=b.darkness（drawOwlDarknessが描画）。
// ─────────────────────────────────────────────────────────────
function updateBossAI_owl(b) {
    var maxHp = bossState.maxHp || BOSS_MAX_HP;
    var hpRatio = b.hp / maxHp;
    var phase = hpRatio > 0.6 ? 1 : hpRatio > 0.3 ? 2 : 3;
    var enc = bossEncounter();
    var aL = bossState.arenaLeft, aR = bossState.arenaRight;
    var hoverY = GROUND_Y - BOSS_HEIGHT - 70;
    if (b.isAngry) { b.angerTimer--; if (b.angerTimer <= 0) b.isAngry = false; }

    // 暗転はperch中は晴らす（踏みやすく）。それ以外はdarkWantへ滑らかに寄せる
    var darkTarget = (b.owlMode === 'perch') ? 0 : b.darkWant;
    b.darkness += (darkTarget - b.darkness) * 0.06;

    switch (b.owlMode) {
    case 'hover': {
        b.owlBob = (b.owlBob || 0) + 0.05;
        b.y = hoverY + Math.sin(b.owlBob) * 10;
        var tx = Math.max(aL, Math.min(aR - b.width, player.x + player.width / 2 - b.width / 2));
        var hspeed = phase === 3 ? 1.6 : phase === 2 ? 1.2 : 0.9;
        if (Math.abs(tx - b.x) > 1) b.x += (tx > b.x ? 1 : -1) * Math.min(hspeed, Math.abs(tx - b.x));
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        // 暗転: 一定周期でトグル（enc2+は濃い/長い）
        b.darkTimer--;
        if (b.darkTimer <= 0) {
            b.darkWant = (b.darkWant > 0.1) ? 0 : (enc >= 2 ? 0.98 : 0.85);
            b.darkTimer = (b.darkWant > 0 ? (enc >= 2 ? 210 : 165) : 120);
        }
        b.owlTimer--;
        if (b.owlTimer <= 0) {
            var r = Math.random();
            if (r < 0.5) {                 // 横薙ぎ急襲（予告へ）
                b.owlMode = 'aim';
                b.swoopY = Math.max(hoverY - 20, Math.min(GROUND_Y - b.height, player.y + player.height / 2 - b.height / 2));
                b.swoopDir = (b.x + b.width / 2 > player.x + player.width / 2) ? -1 : 1;
                b.x = (b.swoopDir > 0) ? aL : (aR - b.width); // 反対側から助走
                b.owlTimer = (phase === 3 ? 22 : 34);
                b.didDoubleSwoop = false;
            } else if (r < 0.78) {          // 音波
                b.owlMode = 'hoot'; b.owlTimer = 34;
            } else {                        // 止まり（踏みチャンス）
                b.owlMode = 'perch'; b.owlTimer = (phase === 3 ? 62 : 88);
            }
        }
        break;
    }
    case 'aim':                            // 横一線を予告（drawOwlDarknessで赤線）。目が光る
        b.y = b.swoopY;
        b.owlTimer--;
        if (b.owlTimer <= 0) { b.owlMode = 'swoop'; if (soundManager) soundManager.playFlash(); }
        break;

    case 'swoop': {                        // 横薙ぎ急襲（swoopYを水平ダッシュ）
        b.y = b.swoopY;
        var sp = (phase === 3 ? 15 : 12) * (enc >= 3 ? 1.15 : 1);
        b.x += b.swoopDir * sp;
        b.facing = b.swoopDir < 0 ? 'left' : 'right';
        if ((b.swoopDir > 0 && b.x + b.width >= aR) || (b.swoopDir < 0 && b.x <= aL)) {
            if (enc >= 2 && !b.didDoubleSwoop) {   // 【2回目〜(R11+)】反対へ2連急襲
                b.didDoubleSwoop = true; b.swoopDir *= -1;
                b.owlMode = 'aim'; b.owlTimer = (phase === 3 ? 16 : 24);
                b.swoopY = Math.max(hoverY - 20, Math.min(GROUND_Y - b.height, player.y + player.height / 2 - b.height / 2));
            } else {
                b.owlMode = 'recover'; b.owlTimer = 20;
            }
        }
        break;
    }
    case 'recover':                        // 滞空へ戻る
        b.y += (hoverY - b.y) * 0.15;
        b.owlTimer--;
        if (b.owlTimer <= 0) { b.owlMode = 'hover'; b.owlTimer = (phase === 3 ? 40 : 60); }
        break;

    case 'hoot': {                         // 音波: 地面に衝撃波リング（これを見たらジャンプ）
        b.y = hoverY + Math.sin(b.animFrame * 0.3) * 4;
        b.owlTimer--;
        if (b.owlTimer === 26) {
            floatEffects.push({ type: 'boss_shockwave', worldX: b.x + b.width / 2, worldY: GROUND_Y, timer: 0, duration: 30 });
            if (soundManager) soundManager.playFlash();
        }
        if (b.owlTimer <= 14 && b.owlTimer >= 8 && !isPlayerProtected() && player.y + player.height >= GROUND_Y - 42) {
            takeDamage(); b.owlTimer = 7; // 着弾（地上）＝一度だけ
        }
        if (b.owlTimer <= 0) { b.owlMode = 'hover'; b.owlTimer = (phase === 3 ? 45 : 65); }
        break;
    }
    case 'perch': {                        // 低く止まって無防備（暗転が晴れ＝踏むチャンス）
        var perchY = GROUND_Y - b.height;
        b.y += (perchY - b.y) * 0.2;
        b.facing = (b.x + b.width / 2 > player.x + player.width / 2) ? 'left' : 'right';
        b.owlTimer--;
        if (b.owlTimer <= 0) { b.owlMode = 'hover'; b.owlTimer = (phase === 3 ? 40 : 60); }
        break;
    }
    default:
        b.owlMode = 'hover'; b.owlTimer = 50;
        break;
    }
}

// ─────────────────────────────────────────────────────────────
// 闇のカカシ(scarecrow)のAI: 畑に突き立ったまま動かない定点ボス。頭が弱点。
// 普段は頭を高く保って防御（踏み/弾を弾く）。expose中だけ頭を下げて無防備になり踏み/弾が通る。
// 攻撃を1回はさむごとにexpose（踏みチャンス）を交互に出す＝倒し方の学習が容易。
//  攻撃: 召喚(カラスを湧かす・spawnBossChick)／腕薙ぎ(低い横薙ぎ=ジャンプor足場で回避)。
//  当たり/描画で使う頭の位置は headLow から算出（updateBossCollision_scarecrow / drawScarecrow と一致）。
// ─────────────────────────────────────────────────────────────
function updateBossAI_scarecrow(b) {
    var maxHp = bossState.maxHp || BOSS_MAX_HP;
    var hpRatio = b.hp / maxHp;
    var phase = hpRatio > 0.6 ? 1 : hpRatio > 0.3 ? 2 : 3;
    var enc = bossEncounter();
    // 周回ごとの強化（他ボスと同様に bossEncounter で段階的に強くする）。カカシは R6/R12/R18/R24 に出るので enc=1,2,3,4。
    //  encMul=行動サイクル全体の速さ（周回が進むほど短い間合いで攻める）。sweepReady/召喚数/expose短縮も enc 連動。
    //  ⚠1.537で bossEncounter が「一巡=6ラウンド」基準になり、カカシ初登場R6が enc=2→1 になったため閾値を1つずつ下げた
    //    （強化カーブ自体は据え置き＝R6=素の状態／R12から加速・R18で空中雑魚…と従来の検証どおり）。
    var encMul = enc >= 4 ? 0.62 : enc >= 3 ? 0.72 : enc >= 2 ? 0.85 : 1;
    var sweepReady = (phase >= 2 || enc >= 2);                 // 2回目の遭遇(R12+)からは満タンでも腕薙ぎ
    var sweepChance = enc >= 3 ? 0.62 : enc >= 2 ? 0.55 : 0.5;
    if (b.isAngry) { b.angerTimer--; if (b.angerTimer <= 0) b.isAngry = false; }

    // 頭の上下を目標へ滑らかに（expose中は下げる＝踏める／それ以外は上げる＝防御）
    var headTarget = (b.scMode === 'expose') ? 1 : 0;
    b.headLow += (headTarget - b.headLow) * 0.18;
    if (b.headLow < 0.001) b.headLow = 0;

    switch (b.scMode) {
    case 'idle':
        b.exposed = false;
        b.scTimer--;
        if (b.scTimer <= 0) {
            b.scCycle++;
            // 攻撃(奇数)と踏みチャンス=expose(偶数)を交互に。exposeは頭が下がってから当たり有効化。
            if (b.scCycle % 2 === 0) {
                b.scMode = 'expose';
                // expose窓は周回・HPで短縮（＝周回が進むほど踏みチャンスが短い）。ただし下限40で理不尽化を防ぐ。
                b.scTimer = Math.max(40, Math.round(SC_EXPOSE_WINDOW * (phase === 3 ? 0.7 : phase === 2 ? 0.85 : 1) * (enc >= 3 ? 0.85 : enc >= 2 ? 0.92 : 1)));
            } else {
                // 頭上に居座って踏み続ける戦法への対抗（1.535）: プレイヤーが頭の上にいるなら高確率で対空。
                // 居なくても一定確率で混ぜる＝「上は安全」と学習させない。
                var pcx = player.x + player.width / 2;
                var overHead = pcx > b.x - SC_SPIKE_PAD && pcx < b.x + b.width + SC_SPIKE_PAD &&
                               (player.y + player.height) <= b.y + b.height * 0.5;
                if (Math.random() < (overHead ? SC_SPIKE_OVER_RATE : SC_SPIKE_MIX_RATE)) {
                    b.scMode = 'spikeTele';
                    // ⚠下限は30フレーム=0.5秒（1.551で12→30）。周回を重ねて encMul が下がっても、
                    //   「本体が白く光る→横へ逃げる」が成立する最低限の猶予を必ず残す。
                    b.scTimer = Math.max(30, Math.round(SC_SPIKE_TELEGRAPH * (phase === 3 ? 0.75 : 1) * encMul));
                } else if (sweepReady && Math.random() < sweepChance) { // 腕薙ぎ（phase2以降 or 周回3以降）
                    b.scMode = 'sweepTele';
                    b.scTimer = Math.max(16, Math.round(SC_SWEEP_TELEGRAPH * (phase === 3 ? 0.7 : 1) * encMul));
                    b.sweepDir = (player.x + player.width / 2 < b.x + b.width / 2) ? -1 : 1;
                } else {
                    b.scMode = 'summonTele';
                    b.scTimer = Math.max(14, Math.round(SC_SUMMON_TELE * encMul));
                }
            }
        }
        break;

    case 'summonTele':                    // 腕を上げて召喚を予告
        b.scTimer--;
        if (b.scTimer <= 0) {
            // 召喚数は周回で増える（1回目:2 / 2回目:3 / 3回目:4 / 4回目以降:5、＋HP2/3以降に+1・上限6）
            var n = Math.min(6, SC_SUMMON_BASE + Math.min(3, Math.max(0, enc - 1)) + (phase >= 2 ? 1 : 0));
            for (var s = 0; s < n; s++) {
                b.facing = s % 2 === 0 ? 'left' : 'right';
                spawnBossChick(b);
                // ⚠湧いた位置で闇が弾ける（1.558）。これが無いと雑魚が静かに増えるだけで召喚に気づけない。
                var _sc = enemies[enemies.length - 1];
                if (_sc) floatEffects.push({ type: 'summon_burst', worldX: _sc.x + _sc.width / 2,
                                             worldY: _sc.y + _sc.height / 2, timer: 0, duration: 26 });
            }
            if (enc >= 3) spawnEdgeFlyingEnemy();             // 3回目の遭遇(R18+)からは空からカラスも1羽
            // ⚠1.558: 対空(spike)と同じ playFlash だったため「何も攻撃が起きていないのにSEだけ鳴る」と
            //   聞こえていた（召喚は攻撃モーションが無く、湧いた雑魚と音が結びつかない）。専用の音に分離。
            if (soundManager) { try { soundManager.playSummon(); } catch (_) {} }
            b.scMode = 'recover'; b.scTimer = Math.max(16, Math.round(28 * encMul));
        }
        break;

    case 'sweepTele':                     // 腕を溜めて低い薙ぎを予告（drawBossが赤帯）
        b.scTimer--;
        if (b.scTimer <= 0) {
            b.scMode = 'sweep'; b.scTimer = SC_SWEEP_ACTIVE;
            // 横薙ぎのSE（1.556で追加→1.558でユーザー指定により対空と同じ playFlash に統一）。
            // ⚠playFlash は「カカシの2つの攻撃パターン（横薙ぎ・対空）」専用。召喚は playSummon で別音。
            if (soundManager) soundManager.playFlash();
        }
        break;

    case 'sweep':                         // 低い横薙ぎ（当たり判定は updateBossCollision_scarecrow）
        b.scTimer--;
        if (b.scTimer <= 0) { b.scMode = 'recover'; b.scTimer = Math.max(14, Math.round(24 * encMul)); }
        break;

    case 'spikeTele':                     // 対空の予告（drawScarecrowが頭上に黄色い危険帯）＝横へ逃げる猶予
        b.scTimer--;
        if (b.scTimer <= 0) {
            b.scMode = 'spike'; b.scTimer = SC_SPIKE_ACTIVE;
            if (soundManager) soundManager.playFlash();
        }
        break;

    case 'spike':                         // 対空「藁の棘」（当たり判定は updateBossCollision_scarecrow）
        b.scTimer--;
        if (b.scTimer <= 0) { b.scMode = 'recover'; b.scTimer = Math.max(14, Math.round(22 * encMul)); }
        break;

    case 'expose':                        // 頭を下げて無防備＝踏み/弾が通る
        if (b.headLow > 0.7) b.exposed = true; // 十分下がってから有効化（見た目と一致）
        b.scTimer--;
        if (b.scTimer <= 0) { b.exposed = false; b.scMode = 'recover'; b.scTimer = Math.max(14, Math.round(22 * encMul)); }
        break;

    case 'recover':                       // 頭を戻して次へ
        b.exposed = false;
        b.scTimer--;
        if (b.scTimer <= 0) { b.scMode = 'idle'; b.scTimer = Math.max(12, Math.round((phase === 3 ? 18 : phase === 2 ? 28 : 40) * encMul)); }
        break;

    default:
        b.scMode = 'idle'; b.scTimer = 40; b.exposed = false;
        break;
    }
}

// 侍ぴよ急降下斬りでボスに乗った（1.516）: 斬りを終了して通常踏みのバウンスに乗せ、跳ね中の連続発動を
// ロックする（着地でリセット=index.html側／ジャンプすれば再度出せる）。ダメージは通常踏みと完全に同一
// （10/空中ボス5/装甲0）。雑魚への貫通（バウンスなし撃破継続）は従来どおり敵衝突ループ側。
function endSamuraiDiveOnBossStomp() {
    if (!player.samuraiDive) return;
    player.samuraiDive = false;
    player.samuraiDiveLock = true;
}
// 侍ぴよ急降下斬り中のボス踏みダメージ加算（1.521・ユーザー指定=通常踏み10/5に対し斬りは11/6）。
// 各ボスの踏み成功ダメージ行で (基本値 + samuraiDiveDmgBonus()) として使う。装甲弾き(卵の殻)は0のまま。
function samuraiDiveDmgBonus() { return player.samuraiDive ? 1 : 0; }

function updateBossCollision(b) {
    if (!b || b.hp <= 0) return;
    if (b.kind === 'hawk') { updateBossCollision_hawk(b); return; }
    if (b.kind === 'egg') { updateBossCollision_egg(b); return; }
    if (b.kind === 'snake') { updateBossCollision_snake(b); return; }
    if (b.kind === 'owl') { updateBossCollision_owl(b); return; }
    if (b.kind === 'scarecrow') { updateBossCollision_scarecrow(b); return; }
    // stompCooldownカウントダウン
    if (b.stompCooldown > 0) b.stompCooldown--;
    var stompHit = aabbShrink(player, b, 10, 15);
    var bodyHit = aabbShrink(player, b, 20, 15);

    if (b.stompCooldown <= 0 && stompHit && player.velY > 0 && player.y + player.height <= b.y + b.height * 0.3) {
        // 踏みつけ成功！
        b.hp -= (10 + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, b.y);
        player.velY = JUMP_FORCE * 0.5; // 低めバウンス（連続踏み防止）
        endSamuraiDiveOnBossStomp();
        if (soundManager) soundManager.playKill();
        spawnExplosionEffect(player.x + player.width / 2, b.y);
        gainScore(500); // ボス踏みは撃破数に含めない
        // 被弾フレーム表示 + 怒り発動 + 踏みつけ無敵
        b.spriteFrame = BOSS_FRAME_DAMAGED;
        b.spriteResetTimer = 30;
        b.isAngry = true;
        b.angerTimer = BOSS_ANGER_DURATION;
        b.stompCooldown = 90; // 1.5秒間踏み無敵
        b.isRushing = false;
        b.isJumping = false;
        b.isFlaming = false;
        b.isCharging = false;
        if (b.hp <= 0) {
            bossState.phase = 4;
            bossState.defeatedTimer = 0;
        }
    } else if (bodyHit && !isPlayerProtected() && b.stompCooldown <= 0) {
        // ボスが踏みつけ無敵中は体当たりダメージなし / シールド中もダメージなし
        takeDamage();
    }
}

// 空中ボスの当たり判定:
// ・上から踏める。着地硬直(stun)中=フルダメージ(HP-1) / 空中(滞空/溜め/ダイブ/上昇)=半分(HP-0.5)。
// ・踏みでない本体接触（特にダイブ）はプレイヤーがダメージ（シールド中は無効）。
//   踏みつけ直後(stompCooldown中)は本体接触も無効化して連続被弾を防ぐ。
// ・羽根弾の被弾とシールド判定は updateEggs() 側で処理済み。
// ・エナジー弾によるHP減少は既存のプレイヤー弾→ボス判定を流用（kind非依存）。
function updateBossCollision_hawk(b) {
    if (b.stompCooldown > 0) b.stompCooldown--;

    var grounded = (b.hawkMode === 'stun');
    // 踏み判定: プレイヤーが上から（落下中＆ボス上部に乗る）
    var stompHit = aabbShrink(player, b, 10, 12);
    var stompPose = stompHit && player.velY > 0 && player.y + player.height <= b.y + b.height * 0.45;

    if (b.stompCooldown <= 0 && stompPose) {
        // 踏みつけ成功（着地硬直中=フル10 / 空中=半分5。急降下斬りは+1=11/6・1.521ユーザー指定）
        b.hp -= ((grounded ? 10 : 5) + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, b.y);
        player.velY = JUMP_FORCE * 0.5;
        endSamuraiDiveOnBossStomp();
        if (soundManager) soundManager.playKill();
        spawnExplosionEffect(player.x + player.width / 2, b.y);
        gainScore(grounded ? 500 : 300);
        b.spriteFrame = HAWK_FRAME_DAMAGED;
        b.spriteResetTimer = 20;
        b.isAngry = true;
        b.angerTimer = BOSS_ANGER_DURATION;
        b.stompCooldown = grounded ? 50 : 40;
        b.hawkMode = 'rise'; // 踏まれたら硬直/攻撃を解いて上昇へ
        b.stunTimer = 0;
        if (b.hp <= 0) { bossState.phase = 4; bossState.defeatedTimer = 0; }
        return;
    }

    // 踏みでない接触: 着地硬直中は無傷。それ以外は本体接触ダメージ（シールド/踏み直後は無効）
    if (!grounded && b.stompCooldown <= 0) {
        var bodyHit = aabbShrink(player, b, 18, 14);
        if (bodyHit && !isPlayerProtected()) takeDamage();
    }
}

function spawnBossItem() {
    // ボスアリーナ内のランダム位置にアイテムを出現させる
    var aL = bossState.arenaLeft;
    var aR = bossState.arenaRight;
    var r = Math.random();
    // ボス戦アイテム: エネルギー弾50%/ハート30%/シールド20%
    var t = r < 0.50 ? 'energy' : r < 0.80 ? 'heart' : 'shield';
    powerUps.push({
        x: aL + 60 + Math.random() * (aR - aL - 120),
        y: 160 + Math.random() * 100,
        width: 36, height: 36, type: t,
        collected: false, animFrame: 0,
        floatOffset: Math.random() * Math.PI * 2,
        lifetime: 600, // 10秒（60fps × 10）
        maxLifetime: 600
    });
}

// 装甲卵ボスの当たり判定:
// ・弱点露出中(exposed)のみ踏み/弾でダメージ。露出してない殻への踏みは弾かれる（ダメージ0＋高バウンス）。
// ・転がり中の本体接触は地上付近のプレイヤーのみ被弾（ジャンプで回避可）。特殊技(ぴよフラッシュ)は殻貫通（特殊/弾はkind非依存の既存処理・弾は露出ゲートを別途追加）。
function updateBossCollision_egg(b) {
    if (b.stompCooldown > 0) b.stompCooldown--;
    var topHit = aabbShrink(player, b, 12, 12);
    var stompPose = topHit && player.velY > 0 && player.y + player.height <= b.y + b.height * 0.4;

    if (b.stompCooldown <= 0 && stompPose) {
        if (b.exposed) {
            // 弱点露出中: ダメージ
            b.hp -= (10 + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, b.y);
            player.velY = JUMP_FORCE * 0.5;
            endSamuraiDiveOnBossStomp();
            if (soundManager) soundManager.playKill();
            spawnExplosionEffect(player.x + player.width / 2, b.y);
            gainScore(500);
            b.isAngry = true; b.angerTimer = BOSS_ANGER_DURATION;
            b.stompCooldown = 35;
            if (b.hp <= 0) { bossState.phase = 4; bossState.defeatedTimer = 0; }
        } else {
            // 装甲: 弾かれる（ダメージなし）。高めにバウンス＋リングで「今は踏んでも無駄」と伝える
            player.velY = JUMP_FORCE * 0.62;
            endSamuraiDiveOnBossStomp();
            b.stompCooldown = 14;
            floatEffects.push({ type: 'boss_shockwave', worldX: player.x + player.width / 2, worldY: b.y + 12, timer: 0, duration: 12 });
            if (soundManager) soundManager.playProtect(); // 装甲で弾いた「キン」専用SE
        }
        return;
    }
    // 転がり中の本体接触（地上付近のみ被弾＝ジャンプで回避可）
    if (b.eggMode === 'roll' && !isPlayerProtected() && b.stompCooldown <= 0) {
        var lowHit = aabbShrink(player, b, 8, 6);
        if (lowHit && player.y + player.height >= GROUND_Y - 55) {
            takeDamage();
        }
    }
}

// 大蛇の当たり判定:
// ・突き上げ(strike)中: 頭がプレイヤーを下から突く（頭の位置にいると被弾／予告で離れれば回避）。
// ・地這い(sweep)中: 地上付近のプレイヤーに被弾（ジャンプで回避）。
// ・頭露出(exposed)中: 頭を踏む=ダメージ。露出中の本体接触は無効（接近して踏める）。
function updateBossCollision_snake(b) {
    if (b.stompCooldown > 0) b.stompCooldown--;
    var headTop = b.headY;
    var headBox = { x: b.x + 16, y: headTop, width: b.width - 32, height: 58 };

    if (b.serpMode === 'strike' && !isPlayerProtected() && b.stompCooldown <= 0) {
        if (aabb(player, headBox)) { takeDamage(); return; } // 下から突かれる
    }
    if (b.serpMode === 'sweep' && !isPlayerProtected() && b.stompCooldown <= 0) {
        if (aabb(player, { x: b.x + 10, y: GROUND_Y - 46, width: b.width - 20, height: 46 }) &&
            player.y + player.height >= GROUND_Y - 42) { takeDamage(); return; } // 地上=被弾（ジャンプ回避）
    }
    if (b.exposed && b.stompCooldown <= 0) {
        var stompPose = player.velY > 0 && aabb(player, headBox) && player.y + player.height <= headTop + headBox.height * 0.75;
        if (stompPose) {
            b.hp -= (10 + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, headTop);
            player.velY = JUMP_FORCE * 0.5;
            endSamuraiDiveOnBossStomp();
            if (soundManager) soundManager.playKill();
            spawnExplosionEffect(player.x + player.width / 2, headTop);
            gainScore(500);
            b.isAngry = true; b.angerTimer = BOSS_ANGER_DURATION;
            b.stompCooldown = 30;
            if (b.hp <= 0) { bossState.phase = 4; bossState.defeatedTimer = 0; }
        }
    }
}

// フクロウの当たり判定:
// ・空中でも踏める（頭上から落下でボス上部45%に乗る＝hawk方式）。止まり(perch=地上に降りて無防備)踏み-10/空中踏み-5＝闇のカラスと同じ。踏むとhoverへ飛び上がりひるむ。
// ・swoop(横薙ぎ)中: 上から踏めなければ本体接触で被弾（高さをズラして回避）。音波の着弾はAI側で処理。
function updateBossCollision_owl(b) {
    if (b.stompCooldown > 0) b.stompCooldown--;
    // 踏み判定: プレイヤーが上から（落下中＆ボス上部45%に乗る）。perch/hover/aim/hoot/swoop 問わず空中で踏める
    var stompPose = aabbShrink(player, b, 12, 13) && player.velY > 0 && player.y + player.height <= b.y + b.height * 0.45;
    if (b.stompCooldown <= 0 && stompPose) {
        var groundStomp = (b.owlMode === 'perch'); // 止まり(地上)=フル10 / 空中=半分5（闇のカラスと同じ）
        b.hp -= ((groundStomp ? 10 : 5) + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, b.y); // 急降下斬りは+1=11/6(1.521)
        player.velY = JUMP_FORCE * 0.5;
        endSamuraiDiveOnBossStomp();
        if (soundManager) soundManager.playKill();
        spawnExplosionEffect(player.x + player.width / 2, b.y);
        gainScore(groundStomp ? 500 : 300);
        b.isAngry = true; b.angerTimer = BOSS_ANGER_DURATION;
        b.stompCooldown = groundStomp ? 50 : 40;
        b.owlMode = 'hover'; b.owlTimer = 28; // 踏まれたら滞空へ飛び上がってひるむ（攻撃を一旦解除）
        if (b.hp <= 0) { bossState.phase = 4; bossState.defeatedTimer = 0; }
        return;
    }
    // 踏みでない接触: swoop(横薙ぎ)中の本体接触で被弾（高さをズラして回避）
    if (b.owlMode === 'swoop' && !isPlayerProtected() && b.stompCooldown <= 0) {
        if (aabbShrink(player, b, 10, 12)) { takeDamage(); }
    }
}

// 闇のカカシの当たり判定（定点・正面向き立ち絵）:
// ・弱点=頭（上部）。expose中のみ頭上部を踏む/弾でダメージ。非exposeの踏みは弾かれる（装甲卵と同じexposedゲート）。
//   踏み到達=ジャンプ175pxで頭上部(GROUND_Y-84付近)に余裕で届く（実測）。本体接触は無害（定点なので接近可）。
// ・腕薙ぎ(sweep)中: 地面付近の危険帯に接地していると被弾（ジャンプ or 足場で回避）。
function updateBossCollision_scarecrow(b) {
    if (b.stompCooldown > 0) b.stompCooldown--;

    // 腕薙ぎ: 低い横薙ぎの危険帯（GROUND_Y近く）に接地していたら被弾
    if (b.scMode === 'sweep' && !isPlayerProtected() && b.stompCooldown <= 0) {
        var band = { x: bossState.arenaLeft, y: GROUND_Y - SC_SWEEP_BAND_Y, width: bossState.arenaRight - bossState.arenaLeft, height: SC_SWEEP_BAND_Y };
        if (aabb(player, band) && player.y + player.height >= GROUND_Y - (SC_SWEEP_BAND_Y - 6)) { takeDamage(); return; }
    }

    // 対空「藁の棘」: 頭上の危険帯に居たら被弾（1.535）。
    // ＝非露出中の弾かれ跳ね返りを使って真上に居座り、踏み続けるだけで倒せてしまう問題への対抗。
    // 判定は頭より上だけ（地上に立っている間は当たらない: 地上プレイヤーの頭頂=GROUND_Y-48 は帯の下端より下）。
    if (b.scMode === 'spike' && !isPlayerProtected() && b.stompCooldown <= 0) {
        var scol = { x: b.x - SC_SPIKE_PAD, y: b.y - SC_SPIKE_H,
                     width: b.width + SC_SPIKE_PAD * 2, height: SC_SPIKE_H + b.height * 0.30 };
        if (aabb(player, scol)) { takeDamage(); return; }
    }

    // 頭（上部）を踏む
    if (b.stompCooldown <= 0) {
        var topHit = aabbShrink(player, b, 10, 12);
        var stompPose = topHit && player.velY > 0 && player.y + player.height <= b.y + b.height * 0.34;
        if (stompPose) {
            if (b.exposed) {
                // 無防備の頭: ダメージ
                b.hp -= (10 + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, b.y);
                player.velY = JUMP_FORCE * 0.5;
                endSamuraiDiveOnBossStomp();
                if (soundManager) soundManager.playKill();
                spawnExplosionEffect(player.x + player.width / 2, b.y + b.height * 0.2);
                gainScore(500);
                b.isAngry = true; b.angerTimer = BOSS_ANGER_DURATION;
                b.stompCooldown = 32;
                if (b.hp <= 0) { bossState.phase = 4; bossState.defeatedTimer = 0; }
            } else {
                // 防御中（頭が光っていない）: 弾かれる（ダメージなし・「今は無駄」と伝える）
                player.velY = JUMP_FORCE * 0.62;
                endSamuraiDiveOnBossStomp();
                b.stompCooldown = 14;
                floatEffects.push({ type: 'boss_shockwave', worldX: player.x + player.width / 2, worldY: b.y + b.height * 0.2, timer: 0, duration: 12 });
                if (soundManager) soundManager.playProtect();
            }
        }
    }
}

function updateBossItems() {
    // ボス戦中のアイテムスポーン管理
    if (!bossState.active || bossState.phase !== 3) return;
    // ROUND3以降はアイテムドロップなし（寿命管理のみ実行）
    if (gameRound >= 3) {
        for (var j = powerUps.length - 1; j >= 0; j--) {
            var pu2 = powerUps[j];
            if (pu2.collected || pu2.lifetime === undefined) continue;
            pu2.lifetime--;
            if (pu2.lifetime <= 0) powerUps.splice(j, 1);
        }
        return;
    }
    bossState.itemSpawnTimer--;
    if (bossState.itemSpawnTimer <= 0) {
        spawnBossItem();
        bossState.itemSpawnTimer = 540 + Math.floor(Math.random() * 360); // 9〜15秒間隔（ショップ導入で抑制）
    }
    // アイテム寿命管理
    for (var i = powerUps.length - 1; i >= 0; i--) {
        var pu = powerUps[i];
        if (pu.collected || pu.lifetime === undefined) continue;
        pu.lifetime--;
        if (pu.lifetime <= 0) {
            powerUps.splice(i, 1);
        }
    }
}

function spawnBossChick(boss) {
    var dir = boss.facing === 'left' ? -1 : 1;
    enemies.push({
        x: boss.x + (dir < 0 ? -20 : boss.width + 20),
        y: GROUND_Y - 38,
        width: 42, height: 38,
        velX: dir * 1.5,
        type: 'chick',
        animFrame: Math.floor(Math.random() * 100),
        walkSprite: randomBossWalkSprite() // ボス戦は全バイオームの見た目をランダムに（行動は不変）
    });
}

function spawnEdgeEnemy() {
    var fromLeft = Math.random() < 0.5;
    var spawnX = fromLeft ? bossState.arenaLeft - 50 : bossState.arenaRight + 10;
    var dir = fromLeft ? 1 : -1;
    enemies.push({
        x: spawnX,
        y: GROUND_Y - 38,
        width: 42, height: 38,
        velX: dir * (1.2 + Math.random() * 0.8),
        type: 'chick',
        animFrame: Math.floor(Math.random() * 100),
        walkSprite: randomBossWalkSprite() // ボス戦は全バイオームの見た目をランダムに（行動は不変）
    });
}

function spawnEdgeFlyingEnemy() {
    var fromLeft = Math.random() < 0.5;
    var spawnX = fromLeft ? bossState.arenaLeft - 50 : bossState.arenaRight + 10;
    var dir = fromLeft ? 1 : -1;
    flyingEnemies.push({
        x: spawnX,
        y: 80 + Math.random() * 150,
        width: 56, height: 50,
        velX: dir * (1.0 + Math.random() * 0.5),
        type: 'flying_chick',
        // R6以降のボス戦は空中雑魚も全バイオームの見た目をランダムに（R1〜5は従来どおり夜=コウモリ）
        flySprite: (gameRound >= 6 ? randomBossFlySprite() : biomeFlyingSprite()), // 見た目のみ（行動/判定は不変）
        animFrame: Math.floor(Math.random() * 100),
        waveOffset: Math.random() * Math.PI * 2
    });
}

function spawnEggProjectiles(boss, count) {
    var bx = boss.x + boss.width / 2;
    var by = boss.y + boss.height * 0.4;
    var dir = boss.facing === 'left' ? -1 : 1;
    for (var i = 0; i < count; i++) {
        var spread = count > 1 ? -0.3 + (i / (count - 1)) * 0.6 : 0;
        bossState.eggs.push({
            x: bx, y: by,
            width: 16, height: 20,
            velX: dir * 4 * Math.cos(spread),
            velY: -3 + 4 * Math.sin(spread),
            timer: 0
        });
    }
}

// 【装甲卵ボスの2回目登場〜(R8+)】叩きつけ着地で殻の破片を左右へ低く飛散させる（ジャンプで回避）。
// タマゴは従来"接触ダメージのみ"だったので遠距離の脅威を追加＝2周目で難度が一段上がる。
// bossState.eggs を流用（updateEggs の移動/弱重力/被弾/消滅がそのまま効く・isShard は描画用フラグ）。
function spawnEggShards(boss, phase) {
    var cx = boss.x + boss.width / 2;
    var cy = GROUND_Y - 14;
    var perSide = (phase === 3 ? 3 : 2);            // 瀕死ほど破片が多い
    for (var side = -1; side <= 1; side += 2) {     // 左(-1)/右(+1)の両方へ散らす
        for (var i = 0; i < perSide; i++) {
            var t = perSide > 1 ? (i / (perSide - 1)) : 0.5; // 0..1
            bossState.eggs.push({
                x: cx - 7, y: cy,
                width: 14, height: 14,
                velX: side * (3.2 + t * 2.4),       // 手前は遅く奥は速く＝広がる
                velY: -2.6 - t * 1.4,               // 低い弧（弱重力0.15で下りてくる＝ジャンプで越せる高さ）
                rot0: t * Math.PI, rotSpeed: side * (0.18 + t * 0.12), // 転がる見た目
                timer: 0, isShard: true
            });
        }
    }
    if (soundManager) soundManager.playFlash();
}

function updateEggs() {
    for (var i = bossState.eggs.length - 1; i >= 0; i--) {
        var egg = bossState.eggs[i];
        egg.x += egg.velX;
        // 微重力。⚠闇の巫女の呪弾だけ grav:0 ＝まっすぐ飛ぶ（扇の隙間を抜けて避ける設計・1.570）
        egg.velY += (egg.grav === undefined ? 0.15 : egg.grav);
        egg.y += egg.velY;
        egg.timer++;
        // 画面外除去。⚠**カメラ相対で見ること**（1.570）: 縦カメラのある地底では画面座標(y > GAME_HEIGHT+50)で
        //   判定すると、闘技場のワールドy(860〜1180)が最初から条件を満たし**撃った次のフレームに全部消える**
        //   （1.564でプレイヤーの弾に起きたのと同じ罠）。地上は camera.y=0 なので式の値は従来と完全に同じ。
        if (egg.y > gameState.camera.y + GAME_HEIGHT + 50 || egg.timer > 300 ||
            egg.x < gameState.camera.x - 50 || egg.x > gameState.camera.x + GAME_WIDTH + 50) {
            bossState.eggs.splice(i, 1);
            continue;
        }
        // プレイヤー衝突（シールド中は卵を消滅させてダメージなし）
        if (aabb(player, egg)) {
            if (isPlayerProtected()) {
                bossState.eggs.splice(i, 1);
            } else {
                bossState.eggs.splice(i, 1);
                takeDamage();
            }
        }
    }
}

function gameOver() {
    gameState.gameStarted = false;
    gameState.gamePaused = true;
    recordMissionProgress(); // デイリーミッション進捗を記録（広告復活でも二重計上しない）
    commitPermaStock(); // まほうのポーチの中身をここで確定＝ゲームオーバーなら持ち越せる／リタイアでは消える(1.526)
    if (typeof saveSettings === 'function') saveSettings(); // ずかん撃破数など今回ランの記録を確定保存
    if (soundManager) soundManager.playBGM('gameover');

    // インタースティシャルは「死亡毎」ではなくリトライ時(retryGame)に表示する。
    // 死亡毎だと黒画面が頻発し、直後の復活リワードとも競合するため（ユーザー指摘）。

    finalGameStats = {
        score: gameState.rankScore,
        distance: gameState.distance,
        enemyKills: gameState.enemyKills,
        speedLevel: gameState.speedLevel,
        // 復活ランキング記録方式(1.523・魂の共鳴v3.799から移植): 広告復活を使ったランは ↺ 付きで記録する。
        // 対象は広告復活のみ（アイテム=復活ポーション/ふっかつマシーンは対象外＝ユーザー決定）。
        // ここで値を確定させる＝保存より先に resetGame がフラグを戻しても記録内容が狂わない（仕様書の落とし穴対策）。
        revived: !!(typeof rewardAdState !== 'undefined' && rewardAdState.reviveUsedThisRun)
    };

    // 記録は「ランが本当に終わったとき」に1回だけ行う＝ここでは記録せず、まず復活の選択肢があるゲームオーバー画面を出す。
    // 復活を選べばプレイ続行（記録なし）、リトライ/タイトルを選べば finalizeRunAndThen が記録してから遷移する。
    setTimeout(function() { showGameOverScreen(); }, 500);
}

// リワード広告「準備中」表示（A案）。ロード済み＝通常の光るボタン／未ロード＝淡色＋「準備中…」。
// 未ロードでも押せる（adRevive内で裏ロード→間に合えば表示）。isRewardReady未定義(旧/Web環境)は表示可能扱い。
function updateAdReviveBtnState() {
    var btn = document.getElementById('adReviveBtn');
    if (!btn) return;
    var ready = (typeof window.isRewardReady !== 'function') || window.isRewardReady();
    if (ready) {
        btn.innerHTML = t('gameover_ad_revive');
        btn.style.opacity = '1';
        btn.style.filter = 'none';
        btn.style.animation = 'adRevivePulse 2s ease-in-out infinite';
        btn.style.background = 'linear-gradient(180deg, #ffb347 0%, #ff6723 50%, #cc4400 100%)';
    } else {
        btn.innerHTML = _ic('icon_retry.png') + ' ' + t('ad_preparing_btn');
        btn.style.opacity = '0.6';
        btn.style.filter = 'grayscale(0.55)';
        btn.style.animation = 'none';
        btn.style.background = 'linear-gradient(180deg, #999 0%, #777 50%, #555 100%)';
    }
}

// 広告の準備状態が変わった時に monetization.js から呼ばれる（window.onRewardReadyChange）。
// 表示中の復活ボタン／ショップメニューだけを更新（確認ダイアログ中のショップは触らない）。
function refreshRewardButtons() {
    if (isScreenVisible('gameOverScreen')) updateAdReviveBtnState();
    if (isScreenVisible('stageShopScreen') && shopMode === 'menu' && !shopClosing && !shopDepositing) updateStageShopUI();
    if (isScreenVisible('titleShopScreen') && tshopMode === 'menu' && !tshopLeaving) updateTitleShopUI();
}

// ── 自社ゲーム紹介カード（実広告が出せない時の代替・視聴で報酬付与。config駆動・ローテーション） ──
// リリース時は魂の共鳴(4+)のみ。14番地(12+)はApp Store公開後に配列へ1要素追加で有効化（本作9+との年齢整合のため）。
// アイコン/スクショ画像は images/promo/ に配置（未配置でも onerror で崩れずカードは成立）。
var HOUSE_AD_GAMES = [
    {
        id: 'tamashii',
        storeUrl: 'https://apps.apple.com/app/id6783816824',
        icon: 'images/promo/tamashii_icon.png',
        shot: 'images/promo/tamashii_shot.jpg',
        title:   { ja: '魂の共鳴',      en: 'Tamashii no Kyomei' },
        sub:     { ja: '〜私を信じて〜',  en: '~Believe in Me~' },
        genre:   { ja: '色合わせパズル',  en: 'Color-match Puzzle' },
        tagline: { ja: '同じ色をそろえて消す爽快パズル。コンボでフィーバー！', en: 'Match colors to clear — combo into Fever!' }
    },
    {
        // 14番地は12+のため、カードの文言は9+寄りに抑える（ホラー/恐怖の語は使わない・方針: 本作9+据え置き）
        id: 'banchi14',
        storeUrl: 'https://apps.apple.com/app/id6785090823',
        icon: 'images/promo/14banchi_icon.png',
        shot: 'images/promo/14banchi_shot.jpg',
        title:   { ja: '14番地',                en: '14th Block' },
        sub:     { ja: '〜ぴよ氏の怪異街歩き〜',  en: "Piyo's Night Walk" },
        genre:   { ja: '異変探しアドベンチャー',  en: 'Anomaly-Spotting Adventure' },
        tagline: { ja: '夜のまちで「いつもとちがう」を見つけよう。全41種の異変をあつめる探索ゲーム！', en: 'Stroll the night town and spot what\'s different — collect all 41 anomalies!' }
    }
];
var houseAdRotIndex = 0;
var houseAdDoneCb = null;
var houseAdTimer = null;

function houseAdLang() { return (typeof gameSettings !== 'undefined' && gameSettings.language === 'en') ? 'en' : 'ja'; }
function houseAdText(g, field) { var v = g && g[field]; return v ? (v[houseAdLang()] || v.ja || '') : ''; }
function pickHouseAdGame() {
    if (!HOUSE_AD_GAMES.length) return null;
    var g = HOUSE_AD_GAMES[houseAdRotIndex % HOUSE_AD_GAMES.length];
    houseAdRotIndex = (houseAdRotIndex + 1) % HOUSE_AD_GAMES.length;
    return g;
}

// monetization.js の settleReward から呼ばれる: 実広告が無い時にカードを表示→3秒視聴→onDone(true)で報酬付与。
function showHouseAd(onDone) {
    var g = pickHouseAdGame();
    var card = document.getElementById('houseAdCard');
    if (!g || !card) { if (onDone) onDone(true); return; } // カード無し=そのまま報酬（実務上は起きない）
    houseAdDoneCb = onDone || function() {};
    // 横向きゲーム＝縦に短いので、スクショは info の横に置く（縦積みだと landscape で収まらない）。
    // 画像が無い/読めない時は img が display:none になり、info だけの1カラムになる。
    // max-height/max-width の組で縦横比を常に維持（height固定+max-widthだと横長スクショが潰れる）
    var shotHtml = g.shot ? '<img src="' + g.shot + '" alt="" onerror="this.style.display=\'none\'" style="max-height:min(240px,52vh); max-width:42vw; width:auto; height:auto; border-radius:8px; border:1px solid rgba(255,255,255,0.12); flex-shrink:0;">' : '';
    card.innerHTML =
        '<div style="color:rgba(255,255,255,0.55); font-size:clamp(9px,1.7vw,12px); font-family:\'M PLUS Rounded 1c\',sans-serif; margin-bottom:8px;">' + escapeHtml(t('house_ad_pr')) + '</div>' +
        '<div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; justify-content:center;">' +
            shotHtml +
            '<div style="flex:1 1 200px; min-width:180px; text-align:left;">' +
                '<div style="display:flex; gap:10px; align-items:center; margin-bottom:6px;">' +
                    '<img src="' + g.icon + '" alt="" onerror="this.style.visibility=\'hidden\'" style="width:52px; height:52px; border-radius:12px; flex-shrink:0; border:1px solid rgba(255,255,255,0.15);">' +
                    '<div style="min-width:0;">' +
                        '<div style="color:#fff; font-size:clamp(15px,3.2vw,21px); font-weight:800; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + escapeHtml(houseAdText(g, 'title')) + '</div>' +
                        '<div style="color:rgba(255,255,255,0.55); font-size:clamp(9px,1.6vw,12px);">' + escapeHtml(houseAdText(g, 'sub')) + '</div>' +
                        '<div style="color:#ffd77a; font-size:clamp(9px,1.5vw,12px);">' + escapeHtml(houseAdText(g, 'genre')) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="color:#eee; font-size:clamp(11px,2vw,15px); margin:6px 2px 10px; font-family:\'M PLUS Rounded 1c\',sans-serif; line-height:1.5;">' + escapeHtml(houseAdText(g, 'tagline')) + '</div>' +
                '<button id="houseAdStoreBtn" class="game-button" style="width:100%; margin-bottom:8px; padding:7px 12px; font-size:clamp(10px,2.1vw,14px); background:linear-gradient(180deg,#4ec0ca,#2a9db0); -webkit-tap-highlight-color:transparent;">' + t('house_ad_get') + '</button>' +
                '<button id="houseAdRewardBtn" class="game-button" disabled style="width:100%; padding:9px 12px; font-size:clamp(11px,2.3vw,15px); background:linear-gradient(180deg,#888,#555); opacity:0.65; -webkit-tap-highlight-color:transparent;"></button>' +
            '</div>' +
        '</div>';
    var storeBtn = document.getElementById('houseAdStoreBtn');
    if (storeBtn) storeBtn.onclick = function() { openExternalUrl(g.storeUrl); };
    var rewardBtn = document.getElementById('houseAdRewardBtn');
    var remain = 3;
    if (rewardBtn) rewardBtn.innerHTML = t('house_ad_wait', { n: remain });
    if (houseAdTimer) clearInterval(houseAdTimer);
    houseAdTimer = setInterval(function() {
        remain--;
        if (!rewardBtn) { clearInterval(houseAdTimer); houseAdTimer = null; return; }
        if (remain > 0) { rewardBtn.innerHTML = t('house_ad_wait', { n: remain }); return; }
        clearInterval(houseAdTimer); houseAdTimer = null;
        rewardBtn.disabled = false;
        rewardBtn.style.opacity = '1';
        rewardBtn.style.background = 'linear-gradient(180deg,#ffb347,#ff6723)';
        rewardBtn.innerHTML = t('house_ad_reward');
        rewardBtn.onclick = finishHouseAd;
    }, 1000);
    showScreenEl('houseAdScreen');
}

function finishHouseAd() {
    if (houseAdTimer) { clearInterval(houseAdTimer); houseAdTimer = null; }
    hideScreenEl('houseAdScreen');
    var cb = houseAdDoneCb; houseAdDoneCb = null;
    if (soundManager) soundManager.playItem();
    if (cb) cb(true);
}

function openExternalUrl(url) {
    try {
        if (typeof isNativeApp === 'function' && isNativeApp()) window.open(url, '_system');
        else window.open(url, '_blank');
    } catch (e) { try { window.open(url, '_blank'); } catch (e2) {} }
}

function showGameOverScreen() {
    markScreenTransition();
    // スタッツ表示
    var statsEl = document.getElementById('gameOverStats');
    statsEl.innerHTML =
        t('gameover_distance') + finalGameStats.distance + 'm<br>' +
        t('gameover_score') + finalGameStats.score + t('ranking_unit_score') + '<br>' +
        t('gameover_kills') + finalGameStats.enemyKills + t('ranking_unit_kills') + '<br>' +
        t('gameover_level') + finalGameStats.speedLevel;
    // リワード広告復活ボタンの表示制御（1プレイ1回、広告非表示設定時は非表示）
    var adReviveContainer = document.getElementById('adReviveContainer');
    if (adReviveContainer) {
        adReviveContainer.style.display = (!rewardAdState.reviveUsedThisRun && !gameSettings.adFree) ? 'block' : 'none';
    }
    updateAdReviveBtnState(); // 広告のロード状態に応じて「準備中」/「広告を見て復活」を切り替え（A案）
    // 初回ランのゲームオーバーだけ「まほうのポーチ」予告カードを見せる（Phase3 案B-2・継続動機の注入）
    var pouchTeaser = document.getElementById('firstRunPouchTeaser');
    if (pouchTeaser) pouchTeaser.style.display = gameState.isFirstRun ? 'block' : 'none';
    showScreenEl('gameOverScreen');
    history.pushState({ screen: 'gameOver' }, '');
}

function hideGameOverScreen() {
    hideScreenEl('gameOverScreen');
}

// ─── リザルト共有 ───
// 正方形のリザルトカード画像をcanvasで生成（背景＋距離＋スコア＋装備スキンの立ち絵）。
function buildResultCard() {
    return new Promise(function(resolve) {
        try {
            var cv = document.createElement('canvas');
            cv.width = 1080; cv.height = 1080;
            var c = cv.getContext('2d');
            // 背景グラデ（空→ピンク→草）
            var g = c.createLinearGradient(0, 0, 0, 1080);
            g.addColorStop(0, '#8ec5e8'); g.addColorStop(0.55, '#f6b6c8'); g.addColorStop(1, '#bfe6a0');
            c.fillStyle = g; c.fillRect(0, 0, 1080, 1080);
            // パネル枠
            c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(64, 64, 952, 952);
            c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 5; c.strokeRect(64, 64, 952, 952);
            c.textAlign = 'center';
            // タイトル
            c.fillStyle = '#ffffff';
            c.font = 'bold 72px "M PLUS Rounded 1c", sans-serif';
            c.fillText('ぴよ氏の冒険', 540, 196);
            // 距離（大）
            c.fillStyle = '#ffd84d';
            c.font = 'bold 150px "M PLUS Rounded 1c", sans-serif';
            c.fillText(finalGameStats.distance + 'm', 540, 392);
            // スコア / 撃破 / Lv
            c.fillStyle = '#ffffff';
            c.font = 'bold 46px "M PLUS Rounded 1c", sans-serif';
            c.fillText(t('share_card_score') + ' ' + finalGameStats.score + '　' + t('share_card_kills') + ' ' + finalGameStats.enemyKills + '　Lv' + finalGameStats.speedLevel, 540, 474);
            // 装備スキンのキャラ立ち絵（ドット維持で拡大）
            try {
                var spriteName = ((typeof SKIN_FEATURE_ENABLED !== 'undefined' && SKIN_FEATURE_ENABLED && gameSettings.activeSkin === 'maid') ? 'skin_maid_' : 'player_') + 'idle';
                c.imageSmoothingEnabled = false;
                spriteManager.draw(c, spriteName, 0, 540 - 190, 540, 380, 380, false);
            } catch (_) {}
            // ハッシュタグ
            c.fillStyle = 'rgba(255,255,255,0.92)';
            c.font = 'bold 42px "M PLUS Rounded 1c", sans-serif';
            c.fillText('#ぴよ氏の冒険', 540, 984);
            cv.toBlob(function(b) { resolve(b); }, 'image/png');
        } catch (_) { resolve(null); }
    });
}

// シェア: Web Share API（画像＋テキスト）→ テキストのみ → X intent の順でフォールバック。
function shareResult() {
    var url = 'https://shinomiyapiyo.github.io/piyos-adventure/';
    var text = t('share_text', { distance: finalGameStats.distance, score: finalGameStats.score });
    buildResultCard().then(function(blob) {
        var file = null;
        try { if (blob) file = new File([blob], 'piyo_result.png', { type: 'image/png' }); } catch (_) {}
        // 1) 画像つき共有（モバイル/PWA）
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], text: text, url: url }).catch(function() {});
            return;
        }
        // 2) テキストのみ共有
        if (navigator.share) {
            navigator.share({ text: text, url: url }).catch(function() {});
            return;
        }
        // 3) フォールバック: X(Twitter) 投稿画面を新規タブ
        var intent = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
        window.open(intent, '_blank');
    });
}

// リトライ/タイトルの押下＝「このランは終わり」の確定（1.523）。先にハイスコア判定・記録を済ませてから遷移する。
// ⚠resetGame は記録の後に走る＝保存前にフラグが戻る事故を構造的に防ぐ。
function retryGame() {
    if (isInTransitionCooldown()) return;
    finalizeRunAndThen(function () {
        // インタースティシャルはセッションの区切り（リトライ）で表示。広告が閉じてから再開する
        // （死亡毎の黒画面＆復活リワードとの競合を回避）。広告が無ければ即再開。
        showAd('interstitial', function () {
            hideGameOverScreen();
            resetGame();
            startGame();
        });
    });
}

function goToTitle() {
    if (isInTransitionCooldown()) return;
    finalizeRunAndThen(function () {
        hideGameOverScreen();
        showStartScreen();
    });
}
