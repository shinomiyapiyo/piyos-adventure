// ============================================================
// gameplay.js — ショップ＋ボス（index.html から分離 / Ver.1.334, Step3）
// 内容: ショップシステムロジック(ステージ/タイトル/ストック)・DQ風確認ボックス(createConfirmBox)・
//       ボスバトルシステム(AI/攻撃/固定ボス地形)。retryGame 等もここ。
// 依存: gameState/player/各state/spriteManager/ctx/各UI関数 等のグローバルを実行時参照。
// 読み込み順: 後半インラインの「元の位置」で読む(3分割)＝setupInput等より前に評価される。
// ============================================================
// ─── ショップシステム ロジック ───

// ラウンドに応じたステージBGMを再生（stage→stage2→stage3→stage→...）
// チュートリアル「はじまりの地」は専用BGM（土管部屋から戻る時もここを通るので自動で復帰する）
function playStageBGM() {
    if (!soundManager) return;
    if (tutorialState.active) { soundManager.playBGM('tutorial'); return; }
    var cycle = ((gameRound - 1) % 5); // 5ラウンド/1周に対応: 0=stage,1=stage2,2=stage3,3=stage4,4=stage5
    var bgmType = cycle === 0 ? 'stage' : 'stage' + (cycle + 1);
    soundManager.playBGM(bgmType);
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
function bossDistanceFor(round) {
    // ボス出現距離スケジュール（ユーザー指定・1.446）:
    //   ラウンド1・2は1200mごと（R1=1200m, R2=2400m）、ラウンド3以降は2400mごと（R3=4800m, R4=7200m…）。
    // これで新規プレイヤーは1200mで最初のボスに会える（旧・初回ラン圧縮 isFirstRun 分岐は本スケジュールに統合＝廃止）。
    // 返り値は絶対距離(m)。bossDistanceFor(0)=0（ラウンド起点・ショップ/土管配置の基準に使用）。
    if (round <= 0) return 0;
    if (round === 1) return 1200;
    return BOSS_TRIGGER_DISTANCE * (round - 1); // R2=2400, R3=4800, R4=7200 …（2400mごと）
}

// ── ステージショップ ──
function checkShopTrigger() {
    if (bossState.active || bossState.bossTriggered) return;
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
    if (pipeRoomState.active || pipeRoomState.visited || pipeRoomState.anim !== 'none') return false;
    if (!player.onGround) return false; // 空中からの割り込み入場は避ける（接地時のみ）
    var pcx = player.x + player.width / 2;
    for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];
        if (p.type !== 'pipe') continue;
        if (wx >= p.x - 20 && wx <= p.x + p.width + 20 && wy >= p.y - 20 && wy <= p.y + p.height + 20 &&
            Math.abs(pcx - (p.x + p.width / 2)) < p.width * 1.5 + 40) {
            enterPipeRoom(p);
            return true;
        }
    }
    return false;
}

// 「お店の入り口に対し上スワイプ」で入店（1.449）: スワイプ地点(ワールド座標)が建物の絵の上で、プレイヤーがドアの近く
// （±160px＝checkShopTriggerの±80より寛容）なら入店。建物サイズは render.js の描画(180×131)に合わせる。
function tryEnterShopAtWorld(wx, wy) {
    if (!shopState.buildingPlaced || shopState.visited || shopState.active) return false;
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
    if (pipeRoomState.active || pipeRoomState.visited || pipeRoomState.anim !== 'none') return;
    if (gameState.specialCutinTimer > 0) return; // 必殺カットイン中は入室しない（カットインが凍結し演出が飛ぶのを防ぐ。activateSpecialMoveと対称・監査LOW）
    var pipe = (targetPipe && targetPipe.type === 'pipe') ? targetPipe : getEnterablePipe();
    if (!pipe) return;
    pipeRoomState.visited = true;               // 演出開始時点で消費（多重開始・再入場防止）
    pipeAssistTimer = 0; pipeAssistPipe = null; // 土管タイム解除（速度はupdateGameSpeedが次tickで復帰）
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
            player.x = cx;
            player.y = standY + PIPE_H * ((t - PIPE_ANIM_SNAP) / PIPE_ANIM_MOVE); // 沈む（土管がプレイヤーの後に再描画され隠れる）
        } else {
            player.x = cx; player.y = standY;      // 実座標は立ち位置へ（savedPlayer=退室後の復帰位置になる）
            player.velX = 0; player.velY = 0;
            pipeRoomState.anim = 'none';
            _enterPipeRoomNow();
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
    if (soundManager) soundManager.playBGM('shop');
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
    return STAGE_SHOP_ITEMS.filter(function(i) { return !i.tutorialOnly; });
}

// 店員セリフ表示の共通処理（ステージ/タイトルショップ共用）
function setKeeperTextFor(elementId, key, replacements) {
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
    // ライフ上限チェック（回復薬はライフ10で買えない）
    if ((item.id === 'heal' || item.id === 'shortcake') && gameState.lives >= 10) {
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
    if (!item.stockItem) item.effect();
    // たちぐいそば/いちごショート：フルスクリーン演出＋実回復量の表示（画像だけ差し替えて同方式）
    if (item.id === 'heal' && typeof showSobaScene === 'function') showSobaScene(gameState.lives - livesBefore);
    if (item.id === 'shortcake' && typeof showSobaScene === 'function') showSobaScene(gameState.lives - livesBefore, 'images/shortcake_scene.jpg');
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
function updateDiveBird(e) {
    if (e.diveState === 'warn') {
        e.diveTimer--;
        e.y += Math.sin(gameState.time * 0.4 + e.waveOffset) * 0.6; // 予告中は小刻みに震える
        if (e.diveTimer <= 0) { e.diveState = 'dive'; e.diveVelY = 0; }
        return;
    }
    if (e.diveState === 'dive') {
        e.diveVelY = Math.min(DIVE_BIRD_SPEED_Y, e.diveVelY + DIVE_BIRD_ACC_Y);
        e.y += e.diveVelY;
        e.x += (player.x - e.x) * DIVE_BIRD_HOME_X; // わずかに追尾
        var surf = terrainTopAt(e.x + e.width / 2);
        var floorY = (surf !== null ? surf : GROUND_Y) - e.height;
        if (e.y >= floorY) { e.y = floorY; e.diveState = 'leave'; e.diveVelY = DIVE_BIRD_BOUNCE_Y; }
        return;
    }
    if (e.diveState === 'leave') {
        // 地面で跳ねたあとは機首を引き起こして上へ抜ける（必ず上昇＝地面をすり抜けて落ち続けない）
        e.diveVelY = Math.min(-3, e.diveVelY + 0.2);
        e.y += e.diveVelY;
        return;
    }
    // fly: 通常飛行。プレイヤーの前方(右)で射程に入ったら予告へ。すでに追い越していたら降下しない
    e.y += Math.sin(gameState.time * 0.05 + e.waveOffset) * 0.8;
    var dx = e.x - player.x;
    if (dx > 0 && dx < DIVE_BIRD_TRIGGER_X) {
        e.diveState = 'warn';
        e.diveTimer = DIVE_BIRD_WARN_F;
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
    // チュートリアルは専用距離(760m)で弱いボスを出す
    var _trigDist = tutorialState.active ? TUTORIAL_BOSS_M : bossDistanceFor(gameRound);
    if (gameState.distance >= _trigDist) {
        bossState.bossTriggered = true;
        bossState.active = true;
        bossState.phase = 1; // WARNING
        bossState.warningTimer = BOSS_WARNING_DURATION;
        if (soundManager) soundManager.playBossWarning();
    }
}

function setupBossArena() {
    bossState.savedGameSpeed = gameState.gameSpeed;
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
    // HP増はR6から（1週目R1-R5=一律100）＋上限（R6から+20/ラウンド・R12で240頭打ち）。難度はラウンド連動の攻撃パターンで上げる（bossEncounter参照）
    var bossMaxHp = BOSS_MAX_HP + Math.min(Math.max(0, gameRound - 5), BOSS_HP_ROUND_CAP) * BOSS_HP_PER_ROUND;
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
        // ── ROUND6+: 飛行敵も画面外からスポーン（一巡目R1-5は空中雑魚を出さない・R6を最も緩い間隔に） ──
        if (gameRound >= 6) {
            bossState.flyingEdgeSpawnTimer--;
            if (bossState.flyingEdgeSpawnTimer <= 0) {
                spawnEdgeFlyingEnemy();
                bossState.flyingEdgeSpawnTimer = Math.max(120, 240 - (gameRound - 6) * 20);
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
            // 通常BGM・背景復帰
            bgCache = null;
            playStageBGM();
            // ショップ訪問フラグリセット（次ラウンド用）
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
function bossEncounter() { return Math.ceil(gameRound / BOSS_KINDS.length); }

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
                // 【3回目登場〜(R6+)】2連ダイブ: 滞空に戻らず即・再ダイブ（畳みかけ・毎回の着地硬直=踏みチャンスは残す）
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
                // ダイブ爆撃（溜めへ）。3回目登場〜(R6+)は一定確率で2連ダイブを予約
                b.hawkMode = 'charge';
                b.chargeTimer = (phase === 3 ? 16 : 26);
                b.pendingDoubleDive = (enc >= 3 && Math.random() < 0.45);
            } else if (enc >= 2 && Math.random() < 0.5) {
                // 【2回目登場〜(R4+)】広角・高密度の羽根バースト（ほぼ水平まで広げて横に避けにくく隙間を突かせる。上向きにはしない）
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
    var enc = bossEncounter(); // 3周目(R11+)で2連突進を解禁

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
            if (enc >= 3 && !b.didDoubleRush) {   // 【3回目登場〜(R11+)】逆方向の端へ折り返してもう一度＝2連突進
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
        var rollSpeed = (phase === 3 ? 8 : phase === 2 ? 7 : 6) * (enc >= 2 ? 1.2 : 1); // 【2回目〜(R6+)】高速化
        b.x += b.rollDir * rollSpeed;
        b.rollAngle += b.rollDir * (rollSpeed / (b.width * 0.45)); // 見た目の転がり回転
        b.facing = b.rollDir < 0 ? 'left' : 'right';
        b.y = groundY;
        var hitWall = (b.rollDir < 0 && b.x <= aL) || (b.rollDir > 0 && b.x + b.width >= aR);
        if (hitWall) {
            b.x = Math.max(aL, Math.min(aR - b.width, b.x));
            floatEffects.push({ type: 'boss_shockwave', worldX: b.x + b.width / 2, worldY: GROUND_Y, timer: 0, duration: 18 });
            if (enc >= 3 && !b.didDoubleRoll) {   // 【3回目〜(R9+)】壁ヒットで一度だけ逆方向へ2連転がり
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
            if (enc >= 2) spawnEggShards(b, phase); // 【2回目〜(R8+)】着地で殻の破片を左右へ飛散＝遠距離の脅威を追加
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
            if (enc >= 2 && !b.didDoubleSwoop) {   // 【2回目〜(R7+)】反対へ2連急襲
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
                b.scTimer = Math.round(SC_EXPOSE_WINDOW * (phase === 3 ? 0.7 : phase === 2 ? 0.85 : 1));
            } else {
                var r = Math.random();
                if (phase >= 2 && r < 0.5) {                 // 【HP2/3以降】腕薙ぎ解禁
                    b.scMode = 'sweepTele';
                    b.scTimer = Math.round(SC_SWEEP_TELEGRAPH * (phase === 3 ? 0.7 : 1));
                    b.sweepDir = (player.x + player.width / 2 < b.x + b.width / 2) ? -1 : 1;
                } else {
                    b.scMode = 'summonTele';
                    b.scTimer = SC_SUMMON_TELE;
                }
            }
        }
        break;

    case 'summonTele':                    // 腕を上げて召喚を予告
        b.scTimer--;
        if (b.scTimer <= 0) {
            var n = SC_SUMMON_BASE + (phase >= 2 ? 1 : 0) + (enc >= 3 ? 1 : 0);
            for (var s = 0; s < n; s++) { b.facing = s % 2 === 0 ? 'left' : 'right'; spawnBossChick(b); }
            if (soundManager) soundManager.playFlash();
            b.scMode = 'recover'; b.scTimer = 28;
        }
        break;

    case 'sweepTele':                     // 腕を溜めて低い薙ぎを予告（drawBossが赤帯）
        b.scTimer--;
        if (b.scTimer <= 0) { b.scMode = 'sweep'; b.scTimer = SC_SWEEP_ACTIVE; }
        break;

    case 'sweep':                         // 低い横薙ぎ（当たり判定は updateBossCollision_scarecrow）
        b.scTimer--;
        if (b.scTimer <= 0) { b.scMode = 'recover'; b.scTimer = 24; }
        break;

    case 'expose':                        // 頭を下げて無防備＝踏み/弾が通る
        if (b.headLow > 0.7) b.exposed = true; // 十分下がってから有効化（見た目と一致）
        b.scTimer--;
        if (b.scTimer <= 0) { b.exposed = false; b.scMode = 'recover'; b.scTimer = 22; }
        break;

    case 'recover':                       // 頭を戻して次へ
        b.exposed = false;
        b.scTimer--;
        if (b.scTimer <= 0) { b.scMode = 'idle'; b.scTimer = (phase === 3 ? 18 : phase === 2 ? 28 : 40); }
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

// 闇のカカシ(scarecrow)の頭のワールドY（当たり/描画で共用＝一致必須）。b.y はブレなし（描画は±3のバウンスのみ）。
function scarecrowHeadY(b) { return b.y + SC_HEAD_REST + (SC_HEAD_LOW - SC_HEAD_REST) * (b.headLow || 0); }

// 闇のカカシの当たり判定:
// ・弱点=頭。expose中(頭が下がって無防備)のみ踏み/弾でダメージ。非exposeの踏みは弾かれる（装甲卵と同じ演出）。
// ・腕薙ぎ(sweep)中: 地面付近の危険帯に接地していると被弾（ジャンプ or 足場で回避）。本体接触は無害（定点なので接近可）。
function updateBossCollision_scarecrow(b) {
    if (b.stompCooldown > 0) b.stompCooldown--;
    var headY = scarecrowHeadY(b);
    var headBox = { x: b.x + b.width * 0.26, y: headY, width: b.width * 0.48, height: 46 };

    // 腕薙ぎ: 低い横薙ぎの危険帯（GROUND_Y近く）に接地していたら被弾
    if (b.scMode === 'sweep' && !isPlayerProtected() && b.stompCooldown <= 0) {
        var band = { x: bossState.arenaLeft, y: GROUND_Y - SC_SWEEP_BAND_Y, width: bossState.arenaRight - bossState.arenaLeft, height: SC_SWEEP_BAND_Y };
        if (aabb(player, band) && player.y + player.height >= GROUND_Y - (SC_SWEEP_BAND_Y - 6)) { takeDamage(); return; }
    }

    // 頭を踏む
    if (b.stompCooldown <= 0) {
        var stompPose = player.velY > 0 && aabb(player, headBox) && player.y + player.height <= headY + headBox.height * 0.75;
        if (stompPose) {
            if (b.exposed) {
                // 無防備の頭: ダメージ
                b.hp -= (10 + samuraiDiveDmgBonus()) * critMultiplier(b.x + b.width / 2, headY);
                player.velY = JUMP_FORCE * 0.5;
                endSamuraiDiveOnBossStomp();
                if (soundManager) soundManager.playKill();
                spawnExplosionEffect(player.x + player.width / 2, headY);
                gainScore(500);
                b.isAngry = true; b.angerTimer = BOSS_ANGER_DURATION;
                b.stompCooldown = 32;
                if (b.hp <= 0) { bossState.phase = 4; bossState.defeatedTimer = 0; }
            } else {
                // 頭を高く保った防御中: 弾かれる（ダメージなし・「今は無駄」と伝える）
                player.velY = JUMP_FORCE * 0.62;
                endSamuraiDiveOnBossStomp();
                b.stompCooldown = 14;
                floatEffects.push({ type: 'boss_shockwave', worldX: player.x + player.width / 2, worldY: headY + 10, timer: 0, duration: 12 });
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
        egg.velY += 0.15; // 微重力
        egg.y += egg.velY;
        egg.timer++;
        // 画面外除去
        if (egg.y > GAME_HEIGHT + 50 || egg.timer > 300 ||
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
