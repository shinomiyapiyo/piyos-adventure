// ============================================================
// gameplay.js — ショップ＋ボス（index.html から分離 / Ver.1.334, Step3）
// 内容: ショップシステムロジック(ステージ/タイトル/ストック)・DQ風確認ボックス(createConfirmBox)・
//       ボスバトルシステム(AI/攻撃/固定ボス地形)。retryGame 等もここ。
// 依存: gameState/player/各state/spriteManager/ctx/各UI関数 等のグローバルを実行時参照。
// 読み込み順: 後半インラインの「元の位置」で読む(3分割)＝setupInput等より前に評価される。
// ============================================================
// ─── ショップシステム ロジック ───

// ラウンドに応じたステージBGMを再生（stage→stage2→stage3→stage→...）
function playStageBGM() {
    if (!soundManager) return;
    var cycle = ((gameRound - 1) % 3); // 0=stage, 1=stage2, 2=stage3
    var bgmType = cycle === 0 ? 'stage' : cycle === 1 ? 'stage2' : 'stage3';
    soundManager.playBGM(bgmType);
}

// ── ステージショップ ──
function checkShopTrigger() {
    if (bossState.active || bossState.bossTriggered) return;
    var bossDistance = BOSS_TRIGGER_DISTANCE * gameRound;

    // ショップ建物をワールドに配置（一度だけ） — 安全地帯より100m手前で配置開始
    if (!shopState.buildingPlaced && gameState.distance >= bossDistance - SHOP_SAFE_ZONE_START - 100) {
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
    var roundStart = BOSS_TRIGGER_DISTANCE * (gameRound - 1);
    var safeStart  = BOSS_TRIGGER_DISTANCE * gameRound - SHOP_SAFE_ZONE_START;
    var lo = roundStart + 150, hi = safeStart - 150;
    pipeRoomState.targetDist = (hi > lo) ? (lo + Math.random() * (hi - lo)) : 0;
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
function pipeFootprintFlat(x, w) {
    return isFlatGroundAt(x + 4) && isFlatGroundAt(x + w / 2) && isFlatGroundAt(x + w - 4);
}

function checkPipeTrigger() {
    if (bossState.active || bossState.bossTriggered || pipeRoomState.active) return;
    // ラウンドが変わったら、このラウンドの目標距離を新規抽選（1ラウンド1回）
    if (pipeRoomState.targetRound !== gameRound) pickPipeTargetDist();
    if (pipeRoomState.placed || pipeRoomState.targetDist <= 0) return;
    if (gameState.distance < pipeRoomState.targetDist) return;
    // 安全地帯に入ってしまったら今ラウンドは見送り（手前の平地に置けなかった）
    var safeStart = BOSS_TRIGGER_DISTANCE * gameRound - SHOP_SAFE_ZONE_START;
    if (gameState.distance >= safeStart) { pipeRoomState.placed = true; return; }
    // 目標距離を過ぎたら、画面右外の平地が見つかり次第そこに配置（スクロールで自然に入ってくる）
    var spawnX = gameState.camera.x + GAME_WIDTH + 20;
    if (pipeFootprintFlat(spawnX, PIPE_W)) {
        pipeRoomState.placed = true;
        pipeRoomState.x = spawnX;
        platforms.push({ x: spawnX, y: GROUND_Y - PIPE_H, width: PIPE_W, height: PIPE_H, type: 'pipe' });
    }
}

function enterPipeRoom() {
    if (pipeRoomState.active || pipeRoomState.visited) return; // 入室中・このラウンド入室済みは弾く（再入室防止）
    pipeRoomState.active = true;
    pipeRoomState.visited = true;
    pipeRoomState.exitHold = 0; // 退室ゲージを初期化
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
    if (soundManager) soundManager.playBGM('bonus');
}

function exitPipeRoom() {
    if (!pipeRoomState.active) return;
    pipeRoomState.active = false;
    bonusRoomItems.length = 0;
    // プレイヤー状態を復元（本編は同じ位置から再開）
    var sp = pipeRoomState.savedPlayer;
    if (sp) { player.x = sp.x; player.y = sp.y; player.velX = sp.velX; player.velY = sp.velY; player.onGround = sp.onGround; player.facing = sp.facing; }
    pipeRoomState.savedPlayer = null;
    gameState.gameSpeed = pipeRoomState.savedGameSpeed || gameState.gameSpeed;
    gameState.input.down = false; gameState.input.up = false;
    gameState.input.left = false; gameState.input.right = false;
    gameState.input.jump = false; gameState.input.jumpPressed = false;
    playStageBGM(); // 本編BGMに復帰
}

// 出口（横）土管の左端X（口）。右壁の内側に接して置く（右へ抜けられるのは口から退室する時だけ）。GAME_WIDTHは可変なので実行時算出。
function pipeRoomExitX() { return GAME_WIDTH - PIPE_ROOM_WALL_W - SIDE_PIPE_W; }

// 部屋の報酬生成: ハート1+低確率2 / コイン10 / 販売アイテム1（満杯なら無）/ ゴールデンエッグ1/20
function initPipeRoom() {
    bonusRoomItems.length = 0;
    var floorY = PIPE_ROOM_FLOOR_Y;
    var rightLimit = pipeRoomExitX() - 30; // 報酬は出口（横）土管に重ねない
    var span = rightLimit - PIPE_ROOM_LEFT;
    // コイン10枚: 床のすぐ上を横一列（歩いて取れる）
    var n = 10, x0 = PIPE_ROOM_LEFT + 60, x1 = rightLimit - 20;
    for (var i = 0; i < n; i++) {
        var cx = x0 + (x1 - x0) * (i / (n - 1));
        bonusRoomItems.push({ type: 'coin', x: cx, y: floorY - 72, width: 32, height: 32, collected: false });
    }
    var posL = PIPE_ROOM_LEFT + span * 0.3, posC = PIPE_ROOM_LEFT + span * 0.5, posR = PIPE_ROOM_LEFT + span * 0.7;
    // ハート: 1個確定＋低確率(12%)で2個目（ジャンプで取る高さ）
    bonusRoomItems.push({ type: 'heart', x: posL, y: floorY - 150, width: 36, height: 36, collected: false, floatOffset: Math.random() * Math.PI * 2, animFrame: 0 });
    if (Math.random() < 0.12) {
        bonusRoomItems.push({ type: 'heart', x: posR, y: floorY - 150, width: 36, height: 36, collected: false, floatOffset: Math.random() * Math.PI * 2, animFrame: 0 });
    }
    // 販売アイテム（≤5000）: ストックに空きがある時だけ1個ランダム
    if (stockState.items.length < stockState.maxSlots) {
        var pool = ['barrier', 'lemon_special', 'full_charge'];
        var id = pool[Math.floor(Math.random() * pool.length)];
        bonusRoomItems.push({ type: 'shopitem', itemId: id, x: posC, y: floorY - 152, width: 40, height: 40, collected: false, floatOffset: Math.random() * Math.PI * 2 });
    }
    // ゴールデンエッグ: 1/20
    if (Math.random() < 0.05) {
        bonusRoomItems.push({ type: 'golden_egg', x: posC, y: floorY - 215, width: 40, height: 40, collected: false, floatOffset: Math.random() * Math.PI * 2 });
    }
}

// 部屋の毎フレーム更新（簡易物理・死なない）
function updatePipeRoom() {
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
                if (pipeRoomState.exitHold >= PIPE_EXIT_HOLD_FRAMES) { exitPipeRoom(); return; }
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
            spawnLifeUpEffect(it.x + it.width / 2, it.y);
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

function closeStageShop() {
    if (shopClosing) return;
    if (soundManager) soundManager.playCursorMove();
    // buy/sellモードではメニューに戻る
    if (shopMode !== 'menu') {
        returnToShopMenu();
        return;
    }
    // メニューモードでは退店確認ダイアログ表示
    shopConfirmingItem = null;
    shopHighlightedItem = null;
    shopClosing = true;
    setKeeperText('shop_keeper_leave_confirm');
    showShopConfirm(true);
}

function confirmCloseShop() {
    if (soundManager) soundManager.playCursorMove();
    showShopConfirm(false);
    shopClosing = false;
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
function createConfirmBox(ids, onYes, onNo) {
    var cursor = null; // null | 'yes' | 'no'

    function updateCursor() {
        var yesEl = document.getElementById(ids.yes);
        var noEl = document.getElementById(ids.no);
        if (yesEl) {
            yesEl.textContent = (cursor === 'yes' ? '> ' : '　 ') + t('shop_confirm_yes');
            yesEl.style.background = cursor === 'yes' ? 'rgba(255,255,255,0.15)' : '';
        }
        if (noEl) {
            noEl.textContent = (cursor === 'no' ? '> ' : '　 ') + t('shop_confirm_no');
            noEl.style.background = cursor === 'no' ? 'rgba(255,255,255,0.15)' : '';
        }
    }

    function show(visible) {
        var box = document.getElementById(ids.box);
        var keeperBox = document.getElementById(ids.keeperBox);
        var itemsList = document.getElementById(ids.itemsList);
        cursor = null;
        if (box) box.style.display = visible ? 'block' : 'none';
        if (visible) {
            if (soundManager) soundManager.playConfirmSelect();
            updateCursor();
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
var shopConfirmUI = createConfirmBox(
    { box: 'shopConfirmBox', keeperBox: 'shopKeeperBox', itemsList: 'stageShopItems', yes: 'shopConfirmYes', no: 'shopConfirmNo' },
    function() { confirmShopBuy(); },
    function() { cancelShopBuy(); }
);
function showShopConfirm(show) { shopConfirmUI.show(show); }
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
    if (item.id === 'heal' && gameState.lives >= 10) canBuy = false;
    var soldOut = purchaseCount >= item.maxPerVisit;
    var hpFull = (item.id === 'heal' && gameState.lives >= 10);
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

function renderSellItem(stockIndex) {
    var stockItem = stockState.items[stockIndex];
    var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === stockItem.id; });
    if (!shopItem) return '';
    var sellPrice = Math.floor(shopItem.price / 2);
    var isHighlighted = (shopSellHighlightIndex === stockIndex);
    var isConfirming = (shopSellingIndex === stockIndex);
    var highlighted = isHighlighted || isConfirming;
    var cursor = highlighted ? '>' : '　';
    return '<div data-item-id="_sell_' + stockIndex + '" class="shop-row shop-row-item' + (highlighted ? ' hl' : '') + '">' +
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
        html += renderShopMenuItem('_menu_deposit', _ic('icon_bank.png'), depLabel);
        // リワード広告ボーナス
        if (!rewardAdState.shopAdUsedThisVisit && !gameSettings.adFree) {
            html += renderShopMenuItem('_menu_reward_ad', _ic('icon_money.png'), t('reward_ad_shop_money'));
        }
        // 貯金プレビュー情報
        if (!shopState.deposited && gameState.score > 0) {
            html += '<div style="color:rgba(136,204,255,0.7); font-family:DotGothic16,monospace; font-size:clamp(7px,1.3vw,10px); text-align:center; padding:1px 6px; text-shadow:0 1px 2px rgba(0,0,0,0.8);">' +
                t('shop_deposit_preview', { sf: gameSettings.savings, st: gameSettings.savings + depAmt, cf: gameState.score, ct: gameState.score - depAmt }) + '</div>';
        } else {
            html += '<div style="color:rgba(136,204,255,0.7); font-family:DotGothic16,monospace; font-size:clamp(7px,1.3vw,10px); text-align:center; padding:1px 6px; text-shadow:0 1px 2px rgba(0,0,0,0.8);">' +
                t('shop_current_savings', { savings: gameSettings.savings + t('currency_unit') }) + '</div>';
        }
        html += renderShopMenuItem('_menu_leave', _ic('icon_door.png'), t('shop_close').replace('&gt; ', '').replace('> ', ''));
        if (closeBtn) closeBtn.parentElement.style.display = 'none';
    } else if (shopMode === 'buy') {
        // 購入モード：商品リスト
        for (var i = 0; i < STAGE_SHOP_ITEMS.length; i++) {
            var item = STAGE_SHOP_ITEMS[i];
            var count = shopState.purchaseCounts[item.id] || 0;
            html += renderStageShopItem(item, count);
        }
        if (closeBtn) {
            closeBtn.innerHTML = t('shop_back');
            closeBtn.parentElement.style.display = 'flex';
        }
    } else if (shopMode === 'sell') {
        // 売却モード：ストックアイテムリスト
        if (stockState.items.length === 0) {
            html += '<div style="color:rgba(255,255,255,0.5); font-family:DotGothic16,monospace; font-size:clamp(9px,1.8vw,12px); padding:8px 6px; text-align:center;">---</div>';
        } else {
            for (var j = 0; j < stockState.items.length; j++) {
                html += renderSellItem(j);
            }
        }
        if (closeBtn) {
            closeBtn.innerHTML = t('shop_back');
            closeBtn.parentElement.style.display = 'flex';
        }
    }

    container.innerHTML = html;

    // 貯金ボタン＆貯金額の更新（メニューモード以外では非表示）
    var depBtn = document.getElementById('depositBtn');
    var depInfo = document.getElementById('depositInfo');
    var depAmount = Math.floor(gameState.score * 0.5);
    if (shopMode !== 'menu') {
        if (depBtn) { depBtn.style.display = 'none'; }
        if (depInfo) { depInfo.style.display = 'none'; }
    } else {
        if (depBtn) {
            depBtn.style.display = 'block';
            if (shopState.deposited) {
                depBtn.disabled = true;
                depBtn.style.opacity = '0.4';
                depBtn.style.pointerEvents = 'none';
                depBtn.textContent = t('shop_deposited');
            } else if (gameState.score <= 0) {
                depBtn.disabled = true;
                depBtn.style.opacity = '0.4';
                depBtn.style.pointerEvents = 'none';
                depBtn.innerHTML = _ic('icon_bank.png', 'ui-icon-sm') + ' ' + t('shop_deposit_btn');
            } else {
                depBtn.disabled = false;
                depBtn.style.opacity = '1';
                depBtn.style.pointerEvents = 'auto';
                depBtn.innerHTML = _ic('icon_bank.png', 'ui-icon-sm') + ' ' + t('shop_deposit_btn') + ' (' + depAmount + t('currency_unit') + ')';
            }
        }
        if (depInfo) {
            depInfo.style.display = 'block';
            if (!shopState.deposited && gameState.score > 0) {
                depInfo.textContent = t('shop_deposit_preview', { sf: gameSettings.savings, st: gameSettings.savings + depAmount, cf: gameState.score, ct: gameState.score - depAmount });
            } else {
                depInfo.textContent = t('shop_current_savings', { savings: gameSettings.savings + t('currency_unit') });
            }
        }
    }
}

// DQ風：デスクトップ用ホバープレビュー（マウスオーバーで説明表示）
function previewShopItem(itemId) {
    if (shopConfirmingItem) return; // 確認中は上書きしない
    if (shopMode !== 'buy') return; // 購入モード以外ではプレビューしない
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
            if (stockState.items.length === 0) {
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
        if (isNaN(sellIdx) || sellIdx < 0 || sellIdx >= stockState.items.length) return;
        var stockItem = stockState.items[sellIdx];
        var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === stockItem.id; });
        if (!shopItem) return;
        // 1回目タップ：説明＋売値表示
        if (shopSellHighlightIndex !== sellIdx) {
            if (soundManager) soundManager.playCursorMove();
            shopSellingIndex = null;
            showShopConfirm(false);
            shopSellHighlightIndex = sellIdx;
            var sellPrice = Math.floor(shopItem.price / 2);
            var el = document.getElementById('shopKeeperText');
            if (el) el.textContent = t(shopItem.descKey) + t('shop_sell_price_suffix', { price: sellPrice });
            updateStageShopUI();
            return;
        }
        // 2回目タップ：売却確認ダイアログ
        if (soundManager) soundManager.playCursorMove();
        shopSellHighlightIndex = null;
        var sellPrice2 = Math.floor(shopItem.price / 2);
        shopSellingIndex = sellIdx;
        setKeeperText('shop_keeper_sell_confirm', { item: t(shopItem.nameKey), price: sellPrice2 });
        showShopConfirm(true);
        updateStageShopUI();
        return;
    }

    // ── 購入モード（従来のロジック） ──
    var item = STAGE_SHOP_ITEMS.find(function(i) { return i.id === itemId; });
    if (!item) return;

    // 1回目タップ：説明表示（まだハイライトされていない場合）
    if (shopHighlightedItem !== itemId) {
        if (soundManager) soundManager.playCursorMove();
        shopConfirmingItem = null;
        showShopConfirm(false);
        shopHighlightedItem = itemId;
        var descEl = document.getElementById('shopKeeperText');
        if (descEl) descEl.textContent = t(item.descKey);
        updateStageShopUI();
        return;
    }

    // 2回目タップ：購入チェック＆確認ダイアログ
    if (soundManager) soundManager.playCursorMove();
    shopHighlightedItem = null;
    var bought = shopState.purchaseCounts[itemId] || 0;
    // 売り切れチェック
    if (bought >= item.maxPerVisit) {
        setKeeperText('shop_keeper_sold_out');
        if (soundManager) soundManager.playDamage();
        setShopBg('shop04', 1200);
        updateStageShopUI();
        return;
    }
    // ライフ上限チェック
    if (item.id === 'heal' && gameState.lives >= 10) {
        setKeeperText('shop_keeper_heal_maxhp');
        if (soundManager) soundManager.playDamage();
        updateStageShopUI();
        return;
    }
    // 所持金チェック
    if (gameState.score < item.price) {
        setKeeperText('shop_keeper_no_money');
        if (soundManager) soundManager.playDamage();
        setShopBg('shop04', 1200);
        updateStageShopUI();
        return;
    }
    // ストック満杯チェック
    if (item.stockItem && !stockHasRoom(item.id)) {
        setKeeperText('shop_keeper_stock_full');
        if (soundManager) soundManager.playDamage();
        updateStageShopUI();
        return;
    }
    // 確認ダイアログ表示
    shopConfirmingItem = itemId;
    setKeeperText('shop_keeper_confirm', { item: t(item.nameKey), price: item.price });
    showShopConfirm(true);
    updateStageShopUI();
}

// ── 売却実行 ──
function executeSellItem() {
    showShopConfirm(false);
    var idx = shopSellingIndex;
    shopSellingIndex = null;
    shopSellHighlightIndex = null;
    if (idx === null || idx < 0 || idx >= stockState.items.length) return;
    var stockItem = stockState.items[idx];
    var shopItem = STAGE_SHOP_ITEMS.find(function(s) { return s.id === stockItem.id; });
    if (!shopItem) return;
    var sellPrice = Math.floor(shopItem.price / 2);
    // ストックから除去
    stockState.items.splice(idx, 1);
    // お金を加算
    gameState.score += sellPrice;
    if (soundManager) soundManager.playItem();
    setKeeperText('shop_keeper_sell_ok', { price: sellPrice });
    setShopBg(getSuccessShopBg(), 1500);
    updateStageShopUI();
    updateStockUI(); // 売却で減った分を浮いてるストック表示にも反映（枠からアイテムを消す）
    // ストックが空になったらメニューに戻る
    if (stockState.items.length === 0) {
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
    if (item.id === 'heal' && gameState.lives >= 10) {
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
        // 有料購入は満杯なら弾く（貯金換算③には落とさない＝金を払って半額戻りの損を防ぐ）。
        if (!stockHasRoom(itemId)) {
            setKeeperText('shop_keeper_stock_full');
            if (soundManager) soundManager.playDamage();
            setShopBg('shop04', 1200);
            shopConfirmingItem = null;
            updateStageShopUI();
            return false;
        }
        addToStock(itemId); // 空き保証済み→未割当永続枠 or 通常枠へ
    }
    gameState.score -= item.price;
    shopState.purchaseCounts[itemId] = bought + 1;
    markZukanSeen('item:' + itemId); // ずかん: ショップ品を購入＝発見
    var livesBefore = gameState.lives;
    if (!item.stockItem) item.effect();
    if (item.id === 'heal' && typeof showSobaScene === 'function') showSobaScene(gameState.lives - livesBefore); // たちぐいそば：フルスクリーン演出＋実回復量の表示
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
var tshopLeaving = false;         // 退店確認中フラグ

function formatTshopPrice(num) {
    return String(num);
}

function setTshopKeeperText(key, replacements) {
    setKeeperTextFor('tshopKeeperText', key, replacements);
}

// タイトルショップ用 確認ボックス（決定処理: confirmTshopBuy / cancelTshopBuy）
var tshopConfirmUI = createConfirmBox(
    { box: 'tshopConfirmBox', keeperBox: 'tshopKeeperBox', itemsList: 'titleShopList', yes: 'tshopConfirmYes', no: 'tshopConfirmNo' },
    function() { confirmTshopBuy(); },
    function() { cancelTshopBuy(); }
);
function showTshopConfirm(show) { tshopConfirmUI.show(show); }
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
    saveSettings();
    if (soundManager) soundManager.playItem();
    showTshopConfirm(false);
    tshopConfirmingItem = null;
    setTshopKeeperText('tshop_keeper_bought');
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
    setTshopKeeperText('tshop_keeper_greet');
    updateTitleShopUI();
}

function selectTshopItem(upgradeId) {
    if (upgradeId && upgradeId.indexOf('egg:') === 0) { selectEggShopItem(upgradeId.slice(4)); return; } // エッグこうかん行
    var upgrade = TITLE_SHOP_UPGRADES.find(function(u) { return u.id === upgradeId; });
    if (!upgrade) return;
    // 確認ダイアログ表示中は無視
    if (tshopConfirmingItem) return;
    var currentLevel = (gameSettings.upgrades || {})[upgradeId] || 0;
    var isMax = currentLevel >= upgrade.maxLevel;
    // 課金アイテム（スターターパック購入済みなら解放）
    if (upgrade.premium && !gameSettings.purchased['starter_pack']) {
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
    // MAX到達
    if (isMax) {
        if (soundManager) soundManager.playDamage();
        tshopHighlightedItem = upgradeId;
        setTshopKeeperText('tshop_keeper_max');
        updateTitleShopUI();
        return;
    }
    var price = upgrade.prices[currentLevel];
    // 1回目タップ：ハイライト＋説明表示
    if (tshopHighlightedItem !== upgradeId) {
        tshopHighlightedItem = upgradeId;
        if (soundManager) soundManager.playCursorMove();
        var effArr = (gameSettings.language === 'en' && upgrade.effectDescEn) ? upgrade.effectDescEn : upgrade.effectDesc;
        var desc = t(upgrade.descKey) + ' → ' + effArr[currentLevel];
        var el = document.getElementById('tshopKeeperText');
        if (el) el.innerHTML = (upgrade.iconImg ? '<img src="' + upgrade.iconImg + '" class="ui-icon">' : '') + ' ' + escapeHtml(t(upgrade.nameKey)) + '\n' + escapeHtml(desc);
        updateTitleShopUI();
        return;
    }
    // 2回目タップ：購入確認ダイアログ
    tshopConfirmingItem = upgradeId;
    if (soundManager) soundManager.playConfirmSelect();
    setTshopKeeperText('tshop_keeper_buy_confirm', {
        item: t(upgrade.nameKey),
        price: formatTshopPrice(price)
    });
    showTshopConfirm(true);
    updateTitleShopUI();
}

// ── エッグこうかん（タイトルショップ内・ゴールデンエッグ払い） ──
function eggShopItemById(id) { return EGG_SHOP_ITEMS.find(function(i) { return i.id === id; }) || null; }
function isEggItemOwned(item) {
    if (item.type === 'pouch') return (gameSettings.pouchLevel || 0) >= stockState.maxSlots; // 永続枠が上限＝MAX（これ以上買えない）
    return item.type === 'skin' && !!(gameSettings.ownedSkins && gameSettings.ownedSkins.indexOf(item.skinId) !== -1);
}
function selectEggShopItem(itemId) {
    var item = eggShopItemById(itemId);
    if (!item || tshopConfirmingItem) return;
    var key = 'egg:' + itemId;
    if (isEggItemOwned(item)) { // 交換済み: 案内だけ
        if (soundManager) soundManager.playCursorMove();
        tshopHighlightedItem = key;
        setTshopKeeperText('tshop_keeper_egg_owned');
        updateTitleShopUI();
        return;
    }
    if (tshopHighlightedItem !== key) { // 1回目タップ: ハイライト＋説明
        tshopHighlightedItem = key;
        if (soundManager) soundManager.playCursorMove();
        var el = document.getElementById('tshopKeeperText');
        if (el) el.innerHTML = '<img src="' + item.iconImg + '" class="ui-icon"> ' + escapeHtml(t(item.nameKey)) + '\n' + escapeHtml(t(item.descKey));
        updateTitleShopUI();
        return;
    }
    // 2回目タップ: 交換確認
    tshopConfirmingItem = key;
    if (soundManager) soundManager.playConfirmSelect();
    setTshopKeeperText('tshop_keeper_egg_confirm', { item: t(item.nameKey), price: item.eggPrice });
    showTshopConfirm(true);
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
    if (item.type !== 'skin' && item.type !== 'pouch') {
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
    } else { // skin
        if (!gameSettings.ownedSkins) gameSettings.ownedSkins = [];
        if (gameSettings.ownedSkins.indexOf(item.skinId) === -1) gameSettings.ownedSkins.push(item.skinId);
    }
    saveSettings();
    if (soundManager) soundManager.playItem();
    showTshopConfirm(false);
    tshopConfirmingItem = null;
    setTshopKeeperText('tshop_keeper_egg_bought');
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
    tshopLeaving = false;
    setTshopKeeperText('tshop_keeper_greet');
    showTshopConfirm(false); // カーソルリセットも内包
    // リワード広告ボタンの表示制御
    var tshopAdBtnEl = document.getElementById('tshopRewardAdBtn');
    if (tshopAdBtnEl) {
        tshopAdBtnEl.style.display = gameSettings.adFree ? 'none' : 'block';
    }
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
    var html = '';
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
    container.innerHTML = html;
}

function applyUpgrades() {
    var ups = gameSettings.upgrades || {};
    var coinLv = ups.coin_master || 0;
    gameState.coinBonus = 1.0 + coinLv * 0.1;
    var toughLv = ups.toughness || 0;
    gameState.lives = 5 + toughLv;
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
function permaLevel() { return Math.max(0, Math.min(gameSettings.pouchLevel || 0, stockState.maxSlots)); }
function normalMaxSlots() { return Math.max(0, stockState.maxSlots - permaLevel()); }

// 永続ストック枠を permaStock から構築（毎ラン補充・used=false）。resetGame と startGame の両方から呼ぶ
// （startGame は resetGame を経由しない初回プレイでも走る＝初回でも永続枠が確実に構築される）。
// 長さ=pouchLevel（購入時に pouchLevel<=maxSlots を保証済み。permaLevel()が読み取り時に再クランプ）。
function buildPermaSlots() {
    stockState.perma = [];
    var n = Math.max(0, gameSettings.pouchLevel || 0);
    for (var i = 0; i < n; i++) {
        var id = (gameSettings.permaStock && gameSettings.permaStock[i]) || '';
        stockState.perma.push({ id: id, used: false });
    }
}

// itemId を今この瞬間ストックに入れる余地があるか（購入可否・満杯判定に使用）
function stockHasRoom(itemId) {
    // 未割当の永続枠（復活薬など永続化不可品は永続枠に入れられない）
    if (PERMA_STOCK_EXCLUDE.indexOf(itemId) === -1) {
        for (var p = 0; p < stockState.perma.length; p++) {
            if (!stockState.perma[p].id) return true;
        }
    }
    // 通常枠の空き
    return stockState.items.length < normalMaxSlots();
}

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
    // ① 未割当の永続枠へ自動割当（復活薬など永続化不可品は除外）→ 毎ラン補充される金枠に定着
    if (PERMA_STOCK_EXCLUDE.indexOf(itemId) === -1) {
        for (var p = 0; p < stockState.perma.length; p++) {
            if (!stockState.perma[p].id) {
                stockState.perma[p] = { id: itemId, used: false };
                if (!gameSettings.permaStock) gameSettings.permaStock = [];
                gameSettings.permaStock[p] = itemId;
                saveSettings();
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
    // ③ 満杯 → 貯金換算（損なし）
    convertItemToSavings(itemId);
    return true;
}

function useStockItem(displayIndex) {
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
            snap.push((ps && ps.id) ? { id: ps.id, used: !!ps.used } : null);
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
    // 永続枠へ書き戻し（used は snap のまま＝スワップした側は元 used を持ち回る／未関与枠は不変）
    for (var p = 0; p < pl; p++) {
        var s = snap[p];
        if (s) { stockState.perma[p] = { id: s.id, used: s.used }; }
        else { stockState.perma[p] = { id: '', used: false }; }
        if (!gameSettings.permaStock) gameSettings.permaStock = [];
        gameSettings.permaStock[p] = s ? s.id : '';
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
    container.classList.toggle('stock-panel', inShop); // ショップ中のみ背景パネルで視認性UP（ゲーム中は付けず視界を塞がない）
    var html = '';
    var pl = permaLevel();
    var iconFor = function(id) {
        var s = STAGE_SHOP_ITEMS.find(function(x) { return x.id === id; });
        return (s && s.iconImg) ? '<img src="' + s.iconImg + '" class="ui-icon">' : '?';
    };
    for (var i = 0; i < stockState.maxSlots; i++) {
        if (i < pl) {
            // ── 永続枠（まほうのポーチ・金枠＋スロット番号バッジ） ──
            var pslot = stockState.perma[i] || { id: '', used: false };
            var badge = '<span class="perma-badge">' + (i + 1) + '</span>';
            if (pslot.id && !pslot.used) {
                // 使用可能な永続アイテム: タップ=使用／ドラッグ=入替
                if (inShop) {
                    html += '<div class="stock-slot stock-slot-perma stock-slot-readonly">' + badge + iconFor(pslot.id) + '</div>';
                } else {
                    html += '<div class="stock-slot stock-slot-perma" data-idx="' + i + '" data-slot="' + i + '">' + badge + iconFor(pslot.id) + '</div>';
                }
            } else if (pslot.id && pslot.used) {
                // 使用済み: 薄いアイコン＋金枠（翌ラン補充）。ゲーム中はドロップ先候補にはしない（ロック）。
                html += '<div class="stock-slot stock-slot-perma stock-slot-perma-used">' + badge + iconFor(pslot.id) + '</div>';
            } else {
                // 未割当の永続枠（空の金枠）: ドロップ先候補
                html += '<div class="stock-slot stock-slot-perma stock-slot-perma-empty"' + (inShop ? '' : ' data-slot="' + i + '"') + '>' + badge + '</div>';
            }
        } else {
            // ── 通常枠 ──
            var ni = i - pl;
            if (ni < stockState.items.length) {
                var itm = stockState.items[ni];
                if (inShop) {
                    // ショップ中: アイコンは見せるが操作不可（pointer-events:none）
                    html += '<div class="stock-slot stock-slot-readonly">' + iconFor(itm.id) + '</div>';
                } else {
                    // ゲーム中: data-idx で識別。委譲タップ(touchend)で即使用／ドラッグ=入替
                    html += '<div class="stock-slot" data-idx="' + i + '" data-slot="' + i + '">' + iconFor(itm.id) + '</div>';
                }
            } else {
                html += '<div class="stock-slot stock-slot-empty"' + (inShop ? '' : ' data-slot="' + i + '"') + '></div>';
            }
        }
    }
    // 所持している永久型アップグレードのアイコンを枠の下にまとめて表示（ゲーム中・両ショップで一貫表示）
    var ownedHtml = '';
    var ownedUps = gameSettings.upgrades || {};
    for (var u = 0; u < TITLE_SHOP_UPGRADES.length; u++) {
        var up = TITLE_SHOP_UPGRADES[u];
        var upLv = ownedUps[up.id] || 0;
        if (upLv > 0 && up.iconImg) {
            var nm = up.nameKey ? escapeHtml(t(up.nameKey)) : '';
            // Lv2以上は右下に小さくレベル数字を添える（Lv1は素のアイコン＝基本所持状態）
            var lvBadge = upLv >= 2 ? '<span class="skill-lv-badge">' + upLv + '</span>' : '';
            ownedHtml += '<span class="owned-skill-wrap" title="' + nm + '"><img src="' + up.iconImg + '" class="owned-skill-icon">' + lvBadge + '</span>';
        }
    }
    if (ownedHtml) html += '<div class="owned-skills">' + ownedHtml + '</div>';
    container.innerHTML = html;
}

// ─── ボスバトルシステム ───

function checkBossTrigger() {
    if (bossState.active || bossState.bossTriggered) return;
    if (gameState.distance >= BOSS_TRIGGER_DISTANCE * gameRound) {
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
    var bossMaxHp = BOSS_MAX_HP + Math.max(0, gameRound - 3) * 3; // ROUND4以降+3ずつ
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
        // 奇数ラウンド=地上ボス(rooster) / 偶数ラウンド=空中ボス(hawk) を交互に
        kind: (gameRound % 2 === 1) ? 'rooster' : 'hawk',
        // 空中ボス(hawk)専用ステート
        hawkMode: 'hover',   // hover→charge→dive→stun→rise
        hawkBob: 0,          // 滞空の上下揺れ位相
        chargeTimer: 0,      // ダイブ前の溜め
        stunTimer: 0,        // ダイブ着地後の硬直（=踏める窓）
        diveTargetX: 0
    };
    // 空中ボスは地面より高い滞空高度から登場させる
    if (bossState.boss.kind === 'hawk') {
        bossState.boss.y = GROUND_Y - BOSS_HEIGHT - 80;
    }
    markZukanSeen('boss:' + bossState.boss.kind); // ずかん: ボス遭遇（rooster/hawk）を発見
    bossState.phase = 2; // entering
    bossState.summonTimer = BOSS_SUMMON_INTERVAL;
    bossState.itemSpawnTimer = 480; // ボス戦アイテム初回出現まで8秒（ショップ導入で抑制）
    bossState.flashAttackTimer = 0; // 閃光攻撃タイマー
    bossState.edgeSpawnTimer = 180; // 画面外雑魚スポーンタイマー
    bossState.flyingEdgeSpawnTimer = 240; // 画面外飛行敵スポーンタイマー
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
        // ── ROUND3+: 飛行敵も画面外からスポーン ──
        if (gameRound >= 3) {
            bossState.flyingEdgeSpawnTimer--;
            if (bossState.flyingEdgeSpawnTimer <= 0) {
                spawnEdgeFlyingEnemy();
                bossState.flyingEdgeSpawnTimer = Math.max(120, 240 - (gameRound - 3) * 20);
            }
        }
        return;

    case 4: // 撃破演出
        bossState.defeatedTimer++;
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
            zukanAddKill('boss:' + b.kind); // ずかん: ボス撃破数を加算
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
        // 5秒後に移行
        if (bossState.defeatedTimer >= 300) {
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
    else { updateBossAI_mama(b); }
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
            b.hawkMode = 'hover';
            b.attackTimer = (phase === 3 ? 45 : 85);
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
            var diveChance = phase === 3 ? 0.6 : phase === 2 ? 0.5 : 0.4;
            if (Math.random() < diveChance) {
                // ダイブ爆撃（溜めへ）
                b.hawkMode = 'charge';
                b.chargeTimer = (phase === 3 ? 16 : 26);
            } else {
                // 羽根弾ばらまき
                spawnHawkFeathers(b, phase === 3 ? 7 : 5);
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
function spawnHawkFeathers(boss, count) {
    var bx = boss.x + boss.width / 2;
    var by = boss.y + boss.height * 0.55;
    var speed = 4.2;
    for (var i = 0; i < count; i++) {
        var t = count > 1 ? (i / (count - 1)) : 0.5;             // 0..1
        var angle = Math.PI * 0.5 + (t - 0.5) * (Math.PI * 0.75); // 真下中心に±約67°の扇
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
            b.isRushing = false;
            b.spriteFrame = BOSS_FRAME_IDLE;
            b.attackTimer = phase === 3 ? 60 : 120;
            if (b.x <= bossState.arenaLeft) b.x = bossState.arenaLeft;
            if (b.x + b.width >= bossState.arenaRight) b.x = bossState.arenaRight - b.width;
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

function updateBossCollision(b) {
    if (!b || b.hp <= 0) return;
    if (b.kind === 'hawk') { updateBossCollision_hawk(b); return; }
    // stompCooldownカウントダウン
    if (b.stompCooldown > 0) b.stompCooldown--;
    var stompHit = aabbShrink(player, b, 10, 15);
    var bodyHit = aabbShrink(player, b, 20, 15);

    if (b.stompCooldown <= 0 && stompHit && player.velY > 0 && player.y + player.height <= b.y + b.height * 0.3) {
        // 踏みつけ成功！
        b.hp -= 1;
        player.velY = JUMP_FORCE * 0.5; // 低めバウンス（連続踏み防止）
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
        // 踏みつけ成功（着地硬直中=フル1.0 / 空中=半分0.5）
        b.hp -= grounded ? 1 : 0.5;
        player.velY = JUMP_FORCE * 0.5;
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
        walkSprite: biomeChickSprite() // バイオーム見た目（行動は不変）
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
        walkSprite: biomeChickSprite() // バイオーム見た目（行動は不変）
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
    if (typeof saveSettings === 'function') saveSettings(); // ずかん撃破数など今回ランの記録を確定保存
    if (soundManager) soundManager.playBGM('gameover');

    // 広告表示（インタースティシャル）
    showAd('interstitial');

    finalGameStats = {
        score: gameState.rankScore,
        distance: gameState.distance,
        enemyKills: gameState.enemyKills,
        speedLevel: gameState.speedLevel
    };

    if (gameState.hasRecordedHighScore) {
        // 既にハイスコア記録済み（復活後の再ゲームオーバー）→ 直接ゲームオーバー画面へ
        setTimeout(function() { showGameOverScreen(); }, 500);
    } else {
        checkHighScore(finalGameStats).then(function(isHigh) {
            setTimeout(function() {
                if (isHigh) {
                    showNameInput();
                } else {
                    showGameOverScreen();
                }
            }, 500);
        });
    }
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
            c.fillText('スコア ' + finalGameStats.score + '　撃破 ' + finalGameStats.enemyKills + '　Lv' + finalGameStats.speedLevel, 540, 474);
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

function retryGame() {
    if (isInTransitionCooldown()) return;
    hideGameOverScreen();
    resetGame();
    startGame();
}

function goToTitle() {
    if (isInTransitionCooldown()) return;
    hideGameOverScreen();
    showStartScreen();
}
