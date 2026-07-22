// ============================================================
// bootstrap.js — 起動処理（index.html から分離 / Ver.1.336, Step5・分割の最終ファイル）
// 内容: gameLoop・リサイズ・タイトル画像・setupInput(入力)・グローバルイベント・
//       initialize・DOMContentLoaded＋forceUpdate。
// ★必ず最後(render.jsの後)に読み込む。全関数定義後にトップレベル実行
//   (setupInput IIFE / イベント登録 / DOMContentLoaded)が走る。
//   setupInput と forceUpdate は同一ファイルに保ち、現状のクロージャ構造を維持(バグ4再発防止)。
// ============================================================


// ─── メインループ（固定60fpsタイムステップ） ───

var lastFrameTime = 0;
var accumulator = 0;
var FIXED_DT = 1000 / 60; // 16.67ms per tick
// このrAFフレームで実際に進んだ固定ステップ数。render側の演出タイマー/パーティクル積分は
// 「++」でなく「+= frameSteps」で進める＝90/120Hz端末でも60Hz進行・ポーズ中(0)は凍結。
var frameSteps = 0;

function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    var delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // 異常値ガード（タブ復帰時など）
    if (delta > 200) delta = FIXED_DT;

    accumulator += delta;

    frameSteps = 0;
    while (accumulator >= FIXED_DT) {
        if (gameState.gameStarted && !gameState.gamePaused) {
            frameSteps++;
            if (pipeRoomState.active) {
                updatePipeRoom(); // 土管ボーナス部屋中は世界を止め、部屋だけ更新
            } else if (pipeRoomState.anim === 'in' || pipeRoomState.anim === 'outWorld') {
                updatePipeAnim(); // 土管出入り演出中も世界を止め、演出だけ進める（マリオ風・1.408）
            } else if (gameState.specialCutinTimer > 0) {
                updateSpecialCutin(); // 必殺技カットイン中は世界を止め演出だけ進める
            } else {
            updateGameSpeed();
            checkShopTrigger();
            checkPipeTrigger();
            updatePipeAssist(); // 土管タイム（土管上でスクロール減速・updateGameSpeedの直後に判定）
            updateTutorial();   // チュートリアル台本（非アクティブ時は即return・減速はupdateGameSpeed後に乗算）
            checkBossTrigger();
            updateBoss();
            updateBiome();
            updatePlayer();
            updatePlatforms();
            updateEnemies();
            updateCoins();
            updatePowerUps();
            updateBullets();
            manageTerrain();
            manageObjects();
            updateWeatherParticles();
            updateMissionToasts(); // 案D: デイリーミッションの「あと少し/達成」HUDトースト
            }
        }
        accumulator -= FIXED_DT;
    }

    render();
    updateUI();
    requestAnimationFrame(gameLoop);
}

// ─── リサイズ ───

function resizeCanvas() {
    var aw = window.innerWidth;
    var ah = window.innerHeight;
    if (aw <= ah) return;

    // セーフエリア取得（ノッチ・ホームインジケータを避ける）
    var rs = getComputedStyle(document.documentElement);
    var safeL = parseInt(rs.getPropertyValue('--sal')) || 0;
    var safeR = parseInt(rs.getPropertyValue('--sar')) || 0;
    var safeT = parseInt(rs.getPropertyValue('--sat')) || 0;
    var safeB = parseInt(rs.getPropertyValue('--sab')) || 0;
    var safeW = aw - safeL - safeR;
    var safeH = ah - safeT - safeB;

    // セーフエリア内のアスペクト比でGAME_WIDTHを調整
    var screenRatio = safeW / safeH;
    var newWidth = Math.round(GAME_HEIGHT * screenRatio);
    newWidth = Math.max(820, Math.min(newWidth, 1150));
    if (newWidth !== GAME_WIDTH) {
        GAME_WIDTH = newWidth;
        canvas.width = GAME_WIDTH;
        canvas.height = GAME_HEIGHT;
        bgCache = null;
    }

    // アスペクト比を維持してセーフエリア中央にスケーリング
    var ratio = GAME_WIDTH / GAME_HEIGHT;
    var scale = (safeW / safeH > ratio) ? safeH / GAME_HEIGHT : safeW / GAME_WIDTH;
    var sw = GAME_WIDTH * scale;
    var sh = GAME_HEIGHT * scale;

    canvas.style.width  = sw + 'px';
    canvas.style.height = sh + 'px';
    canvas.style.left   = Math.round(safeL + (safeW - sw) / 2) + 'px';
    canvas.style.top    = Math.round(safeT + (safeH - sh) / 2) + 'px';
}

function requestFullscreen() {
    // ネイティブ(Capacitor)は元々全画面。Fullscreen APIを呼ぶと iOS の「swipe down to exit」バナー＋×ボタンが出る上、
    // 全画面モード中は safe-area-inset が 0 になりHUDがダイナミックアイランドに被るため、ネイティブでは呼ばない。
    if (isNativeApp()) return;
    var el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen || function(){}).call(el);
}

function checkOrientation() {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(function() {});
    }
    // 縦向きになったらラン中は自動ポーズ。縦画面中はCSSオーバーレイでゲームが見えないのに
    // 進行だけ続き、見えないまま穴/敵で死ぬのを防ぐ。pauseGame()はトグル式＋画面遷移
    // クールダウンで弾かれる可能性があるため、ここでは直接ポーズ状態にする（再開は通常のポーズ画面から）。
    if (!isNativeApp() && window.innerHeight > window.innerWidth && gameState.gameStarted && !gameState.gamePaused) {
        gameState.gamePaused = true;
        var ps = document.getElementById('pauseScreen');
        if (ps) ps.classList.remove('hidden');
        var pb = document.getElementById('pauseButton');
        if (pb) pb.innerHTML = _ic('icon_play.png');
        if (typeof updateStockUI === 'function') updateStockUI(); // ストック枠も読み取り専用へ
    }
}

// ─── タイトル画像（固定1枚: title.jpg） ───
// 旧: 33枚のランダムスライドショー → 新: 全画面背景1枚

// ─── 入力 ───

// タップボタン共通ヘルパー: touchendで即実行（iOSのclick遅延回避）し、
// 後続のsynthesized clickを内部フラグで抑止する。
// opts.guardTouchStart: touchstartで親への伝播を止める（ゲーム中HUD上のボタン用）
// opts.stopClickPropagation: clickイベントの伝播を止める（オーバーレイ画面内のボタン用）
function bindTapButton(el, handler, opts) {
    opts = opts || {};
    var touchFired = false;
    if (opts.guardTouchStart) {
        el.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
    }
    el.addEventListener('touchend', function(e) {
        e.preventDefault();
        e.stopPropagation();
        touchFired = true;
        handler();
    });
    el.addEventListener('click', function(e) {
        if (opts.stopClickPropagation) e.stopPropagation();
        if (touchFired) { touchFired = false; return; }
        handler();
    });
}

// リスト項目のタップ委譲ヘルパー: コンテナ内の[attrName]属性を持つ要素のタップを検出し、
// 属性値をhandlerに渡す。タッチは終了座標から要素を特定（指ずれ対策）。
function bindTapDelegate(container, attrName, handler) {
    var touchFired = false;
    container.addEventListener('touchend', function(e) {
        e.preventDefault();
        e.stopPropagation();
        touchFired = true;
        var touch = e.changedTouches[0];
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        var itemEl = target ? target.closest('[' + attrName + ']') : null;
        if (!itemEl) return;
        handler(itemEl.getAttribute(attrName));
    });
    container.addEventListener('click', function(e) {
        if (touchFired) { touchFired = false; return; }
        var itemEl = e.target.closest('[' + attrName + ']');
        if (!itemEl) return;
        handler(itemEl.getAttribute(attrName));
    });
}

(function setupInput() {
    var leftArea  = document.getElementById('leftArea');
    var rightArea = document.getElementById('rightArea');
    var jumpArea  = document.getElementById('jumpArea');
    var ctrlLeft  = document.getElementById('ctrlLeft');
    var ctrlRight = document.getElementById('ctrlRight');
    var ctrlJump  = document.getElementById('ctrlJump');
    var moveStartY = 0, moveStartTime = 0, moveSwiped = false;

    function highlightControl(zone) {
        if (ctrlLeft)  ctrlLeft.classList.remove('active');
        if (ctrlRight) ctrlRight.classList.remove('active');
        if (zone) zone.classList.add('active');
    }

    // 指の現在X位置から移動方向を判定（L/Rエリア境界 = CSS変数 --touch-l と同一値で一元管理）
    var TOUCH_DEADZONE_LEFT = 20; // 左端20pxは拇指球の誤タッチ防止デッドゾーン
    var TOUCH_BOUNDARY_RATIO = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-l')) || 18) / 100;
    function updateMoveFromTouch(touch) {
        if (moveSwiped) return;
        if (touch.clientX < TOUCH_DEADZONE_LEFT) return;
        var boundary = window.innerWidth * TOUCH_BOUNDARY_RATIO;
        if (touch.clientX < boundary) {
            gameState.input.left = true; gameState.input.right = false;
            highlightControl(ctrlLeft);
        } else {
            gameState.input.right = true; gameState.input.left = false;
            highlightControl(ctrlRight);
        }
    }

    // タッチ座標(clientX/Y)をゲームのワールド座標へ変換（canvasの実表示矩形基準・スケール/セーフエリアに追従）。1.449
    function touchToWorld(touch) {
        var r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return {
            x: gameState.camera.x + ((touch.clientX - r.left) / r.width) * GAME_WIDTH,
            y: ((touch.clientY - r.top) / r.height) * GAME_HEIGHT
        };
    }

    // ─ 下スワイプ（足場貫通）/ 上スワイプ（ショップ入店）共通処理 ─
    function handleSwipeDown(touch) {
        if (moveSwiped || !touch) return;
        var dy = touch.clientY - moveStartY;
        var dt = Date.now() - moveStartTime;
        if (dy > 15 && dt < 500) {
            // 土管ボーナス部屋中は下スワイプ無効（出口は右の横土管に歩いて入る）
            if (pipeRoomState.active) { moveSwiped = true; return; }
            // 土管の上で下スワイプ → 入室（判定は寛容版=水平±12px・通常のすり抜けにはしない）
            if (getEnterablePipe()) {
                moveSwiped = true;
                enterPipeRoom();
                gameState.input.left = false; gameState.input.right = false;
                highlightControl(null);
                return;
            }
            // 土管そのものに対し下スワイプ → 横にいても入場（1.449）
            var wpd = touchToWorld(touch);
            if (wpd && tryEnterPipeAtWorld(wpd.x, wpd.y)) {
                moveSwiped = true;
                gameState.input.left = false; gameState.input.right = false;
                highlightControl(null);
                return;
            }
            if (isOnPlatform()) {
                moveSwiped = true;
                gameState.input.down = true;
                gameState.downSwipeActive = true;
                gameState.downSwipeTimer = DOWN_SWIPE_FRAMES;
                gameState.input.left = false; gameState.input.right = false;
                highlightControl(null);
            }
        } else if (dy < -20 && dt < 500) {
            // 上スワイプ: ショップ入店用
            moveSwiped = true;
            // お店の入り口に対し上スワイプ → 直接入店（1.449）。外れたら従来どおり input.up（nearDoor判定）
            var wpu = touchToWorld(touch);
            if (!(wpu && tryEnterShopAtWorld(wpu.x, wpu.y))) {
                gameState.input.up = true;
                setTimeout(function() { gameState.input.up = false; }, 200);
            }
        }
    }

    // ─ 移動タッチ共通ハンドラ（leftArea / rightArea 共用） ─
    function onMoveStart(e) {
        if (!gameState.gameStarted || gameState.gamePaused) return;
        e.preventDefault();
        // このエリアで今始まった指を使う（touches[0]=画面最初の指だと、ジャンプ長押し中は
        // ジャンプ指[右側]を誤参照して左押しが右になる＝滑空中にLが効かない不具合の原因）。1.459
        var touch = e.changedTouches[0];
        if (!touch) return;
        moveStartY = touch.clientY; moveStartTime = Date.now(); moveSwiped = false;
        updateMoveFromTouch(touch);
    }
    function onMoveMove(e) {
        if (!gameState.gameStarted || gameState.gamePaused) return;
        e.preventDefault();
        var touch = e.targetTouches[0]; // このエリア上の指だけを見る（他指=ジャンプを拾わない＝滑空中も左右が効く）
        if (!touch) return;
        handleSwipeDown(touch);
        if (!moveSwiped) updateMoveFromTouch(touch);
    }
    // touchend/touchcancel 後も L/R エリア上に指が残っていれば、その指で方向を再判定する。
    // 従来は両方向を無条件クリア → 2本指で方向を切り替え中に片方を離すと、残っている指の方向
    // まで消え、静止した指では touchmove が出ず復帰せず停止していた（監査M-3）。
    function remainingMoveTouch(e) {
        var rL = leftArea.getBoundingClientRect(), rR = rightArea.getBoundingClientRect();
        for (var i = 0; i < e.touches.length; i++) {
            var tx = e.touches[i].clientX, ty = e.touches[i].clientY;
            if ((tx >= rL.left && tx <= rL.right && ty >= rL.top && ty <= rL.bottom) ||
                (tx >= rR.left && tx <= rR.right && ty >= rR.top && ty <= rR.bottom)) return e.touches[i];
        }
        return null;
    }
    function onMoveEnd(e) {
        e.preventDefault();
        var rem = remainingMoveTouch(e);
        if (rem) { moveSwiped = false; updateMoveFromTouch(rem); return; } // 残った指の方向を維持
        highlightControl(null);
        gameState.input.left = false; gameState.input.right = false;
    }

    // ─ 左・右エリア: 指スライドで左右切替 ─（touchcancel=OS割込みで指が奪われた時も必ず解除。監査M-2）
    leftArea.addEventListener('touchstart', onMoveStart);
    leftArea.addEventListener('touchmove',  onMoveMove);
    leftArea.addEventListener('touchend',   onMoveEnd);
    leftArea.addEventListener('touchcancel', onMoveEnd);
    rightArea.addEventListener('touchstart', onMoveStart);
    rightArea.addEventListener('touchmove',  onMoveMove);
    rightArea.addEventListener('touchend',   onMoveEnd);
    rightArea.addEventListener('touchcancel', onMoveEnd);

    // ─ ジャンプエリア（右側） ─
    jumpArea.addEventListener('touchstart', function(e) {
        if (!gameState.gameStarted || gameState.gamePaused) return;
        e.preventDefault();
        if (ctrlJump) ctrlJump.classList.add('active');
        gameState.input.jump = true;
    });
    // touchend と touchcancel(OS割込み)の両方でジャンプ解除。touchcancelを拾わないと、長押し
    // ジャンプ中にOS割込みで input.jump が true 固着し、以後 jumpJustPressed が発火せずジャンプ不可になる（監査M-2）。
    function onJumpEnd(e) {
        e.preventDefault();
        if (ctrlJump) ctrlJump.classList.remove('active');
        gameState.input.jump = false;
    }
    jumpArea.addEventListener('touchend', onJumpEnd);
    jumpArea.addEventListener('touchcancel', onJumpEnd);

    // ─ 画面全体の上スワイプ検出（ショップ入店用） ─
    // デッドゾーン・ジャンプエリアでも上スワイプで入店できるように
    var shopSwipeStartY = 0, shopSwipeStartTime = 0, shopSwipeStartId = -1;
    var gameContainer = document.getElementById('gameContainer');
    gameContainer.addEventListener('touchstart', function(e) {
        if (tutorialHintsActive) dismissTutorialHints(); // 初回ヒントは最初の操作で消す
        if (!gameState.gameStarted || gameState.gamePaused) return;
        // 今この touchstart で触れた指を追跡。e.touches[0]（画面で最初の指）だと、ジャンプ長押し中は
        // ジャンプ指を誤参照してスワイプ入店が成立しない（移動系のv1.459と同型のバグ・監査LOW）。
        var st = e.changedTouches[0];
        shopSwipeStartId = st.identifier;
        shopSwipeStartY = st.clientY;
        shopSwipeStartTime = Date.now();
    }, { passive: true });
    gameContainer.addEventListener('touchmove', function(e) {
        if (!gameState.gameStarted || gameState.gamePaused) return;
        if (pipeRoomState.active) return;
        // touchstartで記録した指だけを見る（gameContainerは全指を含むので targetTouches では絞れない）
        var touch = null;
        for (var _ti = 0; _ti < e.touches.length; _ti++) { if (e.touches[_ti].identifier === shopSwipeStartId) { touch = e.touches[_ti]; break; } }
        if (!touch) return;
        var dy = touch.clientY - shopSwipeStartY;
        var dt = Date.now() - shopSwipeStartTime;
        if (dt >= 500 || shopSwipeStartY === 0) return;
        if (dy < -20) {
            // 上スワイプ: お店の入り口に対してなら直接入店、外れたら従来どおり input.up（nearDoor判定）
            var wpu = touchToWorld(touch);
            if (!(wpu && tryEnterShopAtWorld(wpu.x, wpu.y))) {
                if (!shopState.buildingPlaced || shopState.visited || shopState.active) return;
                gameState.input.up = true;
                setTimeout(function() { gameState.input.up = false; }, 200);
            }
            shopSwipeStartY = 0; // 一度だけ発火
        } else if (dy > 20) {
            // 下スワイプ: 土管そのものに対してなら入場（デッドゾーン/ジャンプエリアから土管を狙った時の保険・1.449）
            var wpd = touchToWorld(touch);
            if (wpd && tryEnterPipeAtWorld(wpd.x, wpd.y)) shopSwipeStartY = 0;
        }
    }, { passive: true });

    // ─ HUD/オーバーレイ上のボタン群: touchend で即反応（iOS click 遅延回避） ─
    bindTapButton(document.getElementById('pauseButton'), pauseGame, { guardTouchStart: true });
    bindTapButton(document.getElementById('soundToggleBtn'), toggleSound, { guardTouchStart: true });
    bindTapButton(document.getElementById('submitBtn'), submitScore, { guardTouchStart: true });
    bindTapButton(document.getElementById('skipBtn'), skipSubmit, { guardTouchStart: true });
    bindTapButton(document.getElementById('retryBtn'), retryGame, { guardTouchStart: true });
    bindTapButton(document.getElementById('toTitleBtn'), goToTitle, { guardTouchStart: true });
    bindTapButton(document.getElementById('shareBtn'), shareResult, { guardTouchStart: true });
    bindTapButton(document.getElementById('adReviveBtn'), adRevive, { guardTouchStart: true });
    // 広告の準備完了/失敗で「準備中」表示を自動更新（monetization.js から呼ばれる・A案）
    window.onRewardReadyChange = function() { if (typeof refreshRewardButtons === 'function') refreshRewardButtons(); };
    // UPDATEボタン: 旧onclick(iOSで遅延・指の微動で無効化)→ touchend即時に統一。タイトルの「タップで開始」誤爆も防ぐ。
    // ※ forceUpdate は後段(DOMContentLoaded内)で window.forceUpdate として定義されるため、
    //   ここで素の forceUpdate を直接渡すと「未定義参照」でこのIIFE(setupInput)が中断し、
    //   結果 initialize() の登録まで実行されず起動不能になる。クロージャで包んでタップ時に解決する。
    bindTapButton(document.getElementById('forceUpdateBtn'), function() { if (window.forceUpdate) window.forceUpdate(); }, { guardTouchStart: true, stopClickPropagation: true });

    // ストックアイテム: タップ=使用／ドラッグ=枠の中身を入替（永続枠の並べ替え）。枠は動的生成のため委譲。
    // 使用可能枠(data-idx)からドラッグ開始・任意の枠(data-slot)へドロップ。閾値未満の動きはタップ=即使用（iOS遅延/微動回避）。
    (function bindStockTaps() {
        var sc = document.getElementById('stockSlots');
        if (!sc) return;
        var DRAG_THRESH = 8;       // これ以上動いたらドラッグ扱い
        var fired = false;         // touchend 処理済み→直後の click 無視
        var suppressClick = false; // mouseドラッグ後の click 無視
        var drag = null;           // {from,x,y,dragging,el}

        function srcSlot(e) { return (e.target && e.target.closest) ? e.target.closest('.stock-slot[data-idx]') : null; }
        function clearVisuals() {
            var els = sc.querySelectorAll('.stock-slot');
            for (var i = 0; i < els.length; i++) els[i].classList.remove('dragging', 'drag-over');
        }
        function dropIndexAt(cx, cy) {
            var els = sc.querySelectorAll('.stock-slot[data-slot]');
            for (var i = 0; i < els.length; i++) {
                var r = els[i].getBoundingClientRect();
                if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return parseInt(els[i].getAttribute('data-slot'), 10);
            }
            return null;
        }
        function highlight(cx, cy, from) {
            var idx = dropIndexAt(cx, cy);
            var els = sc.querySelectorAll('.stock-slot[data-slot]');
            for (var i = 0; i < els.length; i++) {
                var di = parseInt(els[i].getAttribute('data-slot'), 10);
                els[i].classList.toggle('drag-over', idx !== null && di === idx && di !== from);
            }
        }
        function finishDrag(cx, cy) {
            if (drag && drag.dragging) {
                var to = dropIndexAt(cx, cy);
                if (to !== null && to !== drag.from && typeof swapStockSlots === 'function') swapStockSlots(drag.from, to);
            }
            clearVisuals();
        }

        // ── タッチ（モバイル・主） ──
        sc.addEventListener('touchstart', function(e) {
            var el = srcSlot(e); if (!el) return;
            e.stopPropagation();
            var tt = e.touches[0];
            drag = { from: parseInt(el.getAttribute('data-idx'), 10), x: tt.clientX, y: tt.clientY, dragging: false, el: el };
        }, { passive: true });
        sc.addEventListener('touchmove', function(e) {
            if (!drag) return;
            var tt = e.touches[0];
            if (!drag.dragging && (Math.abs(tt.clientX - drag.x) > DRAG_THRESH || Math.abs(tt.clientY - drag.y) > DRAG_THRESH)) {
                drag.dragging = true; drag.el.classList.add('dragging');
            }
            if (drag.dragging) { e.preventDefault(); e.stopPropagation(); highlight(tt.clientX, tt.clientY, drag.from); }
        }, { passive: false });
        sc.addEventListener('touchend', function(e) {
            if (!drag) return;
            e.preventDefault(); e.stopPropagation();
            fired = true;
            var tt = (e.changedTouches && e.changedTouches[0]) || { clientX: drag.x, clientY: drag.y };
            if (drag.dragging) finishDrag(tt.clientX, tt.clientY);
            else useStockItem(drag.from);
            drag = null;
        });

        // ── マウス（デスクトップ／Preview検証用） ──
        sc.addEventListener('mousedown', function(e) {
            var el = srcSlot(e); if (!el) return;
            e.stopPropagation();
            drag = { from: parseInt(el.getAttribute('data-idx'), 10), x: e.clientX, y: e.clientY, dragging: false, el: el };
        });
        document.addEventListener('mousemove', function(e) {
            if (!drag) return;
            if (!drag.dragging && (Math.abs(e.clientX - drag.x) > DRAG_THRESH || Math.abs(e.clientY - drag.y) > DRAG_THRESH)) {
                drag.dragging = true; drag.el.classList.add('dragging');
            }
            if (drag.dragging) highlight(e.clientX, e.clientY, drag.from);
        });
        document.addEventListener('mouseup', function(e) {
            if (!drag) return;
            if (drag.dragging) { finishDrag(e.clientX, e.clientY); suppressClick = true; }
            drag = null;
        });

        // ── click（touchend の後追い or デスクトップのタップ=使用） ──
        sc.addEventListener('click', function(e) {
            var el = srcSlot(e); if (!el) return;
            if (fired) { fired = false; return; }
            if (suppressClick) { suppressClick = false; return; }
            useStockItem(parseInt(el.getAttribute('data-idx'), 10));
        });
    })();

    document.getElementById('pauseScreen').addEventListener('click', function(e) {
        if (e.target === document.getElementById('pauseScreen')) pauseGame();
    });

    // （デバッグモードの配線=ポーズタイトル連打/BOSS FIGHT/SHOP WARP はネイティブ提出前に撤去済み — Ver.1.461）

    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); pauseGame(); return; }
        if (gameState.gamePaused && e.key === ' ') { e.preventDefault(); pauseGame(); return; }
        if (!gameState.gameStarted || gameState.gamePaused) return;
        switch (e.key) {
            case 'ArrowLeft': case 'a': case 'A': gameState.input.left = true; break;
            case 'ArrowRight': case 'd': case 'D': gameState.input.right = true; break;
            case 'ArrowDown': case 's': case 'S':
                if (pipeRoomState.active) break; // 部屋内では下入力の特殊動作なし（タッチと同等）
                // 土管の上なら入室（タッチの下スワイプと同等・判定は寛容版=水平±12px）
                if (getEnterablePipe()) { enterPipeRoom(); break; }
                if (isOnPlatform()) {
                    gameState.input.down = true;
                    gameState.downSwipeActive = true;
                    gameState.downSwipeTimer = DOWN_SWIPE_FRAMES;
                }
                break;
            case ' ': case 'ArrowUp': case 'w': case 'W':
                gameState.input.jump = true;
                gameState.input.up = true;
                e.preventDefault(); break;
        }
    });

    window.addEventListener('keyup', function(e) {
        switch (e.key) {
            case 'ArrowLeft': case 'a': case 'A': gameState.input.left = false; break;
            case 'ArrowRight': case 'd': case 'D': gameState.input.right = false; break;
            case 'ArrowDown': case 's': case 'S':
                gameState.input.down = false;
                gameState.downSwipeActive = false;
                gameState.downSwipeTimer = 0;
                break;
            case ' ': case 'ArrowUp': case 'w': case 'W':
                gameState.input.jump = false;
                gameState.input.up = false;
                break;
        }
    });
})();

// ─── グローバルイベント ───

var resizeTimer = null;
window.addEventListener('resize', function() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { resizeCanvas(); checkOrientation(); }, 100);
});
window.addEventListener('orientationchange', function() {
    setTimeout(function() { resizeCanvas(); checkOrientation(); }, 100);
});
document.addEventListener('touchmove', function(e) {
    // INPUT要素とオーバーレイ画面内のスクロールは許可
    if (e.target.tagName === 'INPUT') return;
    if (e.target.closest('#nameInputScreen, #rankingScreen, #settingsScreen, #pauseScreen, #gameOverScreen, #stageShopScreen, #titleShopScreen, #guideScreen, #achievementScreen, #badgeScreen, #missionScreen, #skinScreen, #zukanScreen, #titleMenuScreen, #gameModal, #iosPwaWall, .transferOverlay, #houseAdScreen')) return;
    e.preventDefault();
}, { passive: false });

// ネイティブ(Capacitor/WKWebView)判定。ネイティブでは広告/ATT/システムUIで blur が頻発して誤ポーズの原因になるため、
// blur由来の自動ポーズと「縦向きポーズ」を無効化する（向きは Info.plist で OS が横固定するので縦検知は不要）。
function isNativeApp() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}

// 割り込み由来の自動ポーズ（フォーカス喪失/縦向き）。pauseGame() は画面遷移クールダウン(300ms)で弾かれ得るため、
// 直接ポーズ状態にして確実に止める。ラン開始/再開の直後に背景化すると「止まらず生存→復帰時に被弾」になる問題を防ぐ（監査M-13/LOW）。再開は通常のポーズ画面から。
function pauseForInterrupt() {
    if (!gameState.gameStarted || gameState.gamePaused) return;
    gameState.gamePaused = true;
    var ps = document.getElementById('pauseScreen'); if (ps) ps.classList.remove('hidden');
    var pb = document.getElementById('pauseButton'); if (pb) pb.innerHTML = _ic('icon_play.png');
    if (typeof updateStockUI === 'function') updateStockUI();
}

// フォーカス喪失(タブ非表示/別窓/OS)時は、押しっぱなしの入力を必ずクリアしてから自動ポーズ。
// フォーカス喪失中に離したキーの keyup が届かず、再開後に「走りっぱなし」になるのを防ぐ（監査M-4）。
// pauseForInterrupt は遷移クールダウンを迂回して確実にポーズする（監査M-13）。
document.addEventListener('visibilitychange', function() {
    if (document.hidden && gameState.gameStarted) {
        if (typeof clearHeldInput === 'function') clearHeldInput();
        pauseForInterrupt();
    } else if (!document.hidden) {
        // 復帰時にWebAudio＋BGMを再開（iOSはバックグラウンド/ATTでHTML5 BGMを一時停止＋AudioContextをsuspendする）
        if (soundManager && typeof soundManager.resume === 'function') soundManager.resume();
    }
});
window.addEventListener('blur', function() {
    if (isNativeApp()) return; // ネイティブは広告/ATT/システムUIでblurが頻発＝誤ポーズになるため無視（本当の背景化はvisibilitychangeで捕捉）
    if (gameState.gameStarted) {
        if (typeof clearHeldInput === 'function') clearHeldInput();
        pauseForInterrupt();
    }
});
// ATT/広告のあとに音が戻らない対策: 次のユーザー操作(タッチ)で音を確実に復帰（iOSはユーザー操作時のみ再生を許可）
document.addEventListener('pointerdown', function() {
    if (soundManager && typeof soundManager.resume === 'function') soundManager.resume();
}, { passive: true });

// ─── 初期化 ───

function initialize() {
    // ネイティブ(アプリ)ではタイトルのUPDATEボタン（PWA用の強制更新）を隠す＝アプリ更新はストア経由で不要
    if (isNativeApp()) {
        var _ub = document.getElementById('forceUpdateBtn');
        if (_ub) _ub.style.display = 'none';
    }
    // 未所持スキンが装備中なら（解放条件導入前に装備していた等）デフォルトへ戻す
    if (gameSettings.activeSkin && !isSkinOwned(gameSettings.activeSkin)) { gameSettings.activeSkin = ''; saveSettings(); }
    // 所持アップグレードを起動時に反映（stock_expand の maxSlots 等）。従来は初回ラン開始まで反映されず、
    // 起動直後にタイトルショップを開くと maxSlots=3 のままポーチが誤って「MAX」判定される等の表示ズレがあった
    applyUpgrades();
    spriteManager.init(function() {
        // 画像スプライト読み込み完了
    });
    initTerrain();
    resizeCanvas();
    applyLanguage();

    // タイトル画面のイベント設定
    var startScreen = document.getElementById('startScreen');
    var rankingBtn = document.getElementById('rankingButton');

    // ボタンはtouchendで即反応（clickより先に発火）+ 二重発火防止
    bindTapButton(rankingBtn, showRanking, { stopClickPropagation: true });
    bindTapButton(document.getElementById('settingsButton'), showSettings, { stopClickPropagation: true });

    // タイトルメニュー（Phase3.6 P4）: ぼうけんスタート/図鑑/もどる
    bindTapButton(document.getElementById('menuStartButton'), function() { startGame(); }, { stopClickPropagation: true });
    bindTapButton(document.getElementById('zukanButton'), showZukanScreen, { stopClickPropagation: true });
    bindTapButton(document.getElementById('menuBackButton'), closeTitleMenu, { stopClickPropagation: true });

    // ショップボタン（タイトル画面）
    var shopBtn = document.getElementById('shopButton');
    shopBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); showTitleShop(); });
    shopBtn.addEventListener('click', function(e) { e.stopPropagation(); showTitleShop(); });

    // ミッションボタン（タイトル画面）
    var missionBtn = document.getElementById('missionButton');
    missionBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); showMissionScreen(); });
    missionBtn.addEventListener('click', function(e) { e.stopPropagation(); showMissionScreen(); });
    var missionBackBtn = document.getElementById('missionBackBtn');
    missionBackBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); closeMissionScreen(); });
    missionBackBtn.addEventListener('click', function(e) { e.stopPropagation(); closeMissionScreen(); });
    var missionListEl = document.getElementById('missionList');
    missionListEl.addEventListener('click', handleMissionClick);
    missionListEl.addEventListener('touchend', function(e) { if (handleMissionClick(e)) e.preventDefault(); });

    // 実績ボタン（タイトル画面）＋実績画面
    var achBtn = document.getElementById('achievementButton');
    if (achBtn) {
        achBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); showAchievementScreen(); });
        achBtn.addEventListener('click', function(e) { e.stopPropagation(); showAchievementScreen(); });
    }
    var achBackBtn = document.getElementById('achievementBackBtn');
    if (achBackBtn) {
        achBackBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); closeAchievementScreen(); });
        achBackBtn.addEventListener('click', function(e) { e.stopPropagation(); closeAchievementScreen(); });
    }
    var achListEl = document.getElementById('achievementList');
    if (achListEl) {
        achListEl.addEventListener('click', handleAchievementClick);
        achListEl.addEventListener('touchend', function(e) { if (handleAchievementClick(e)) e.preventDefault(); });
    }

    // バッジ（称号）ボタン（タイトル画面）＋バッジ画面
    var badgeBtn = document.getElementById('badgeButton');
    if (badgeBtn) {
        badgeBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); showBadgeScreen(); });
        badgeBtn.addEventListener('click', function(e) { e.stopPropagation(); showBadgeScreen(); });
    }
    var badgeBackBtn = document.getElementById('badgeBackBtn');
    if (badgeBackBtn) {
        badgeBackBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); closeBadgeScreen(); });
        badgeBackBtn.addEventListener('click', function(e) { e.stopPropagation(); closeBadgeScreen(); });
    }

    // きせかえボタン（タイトル画面）＋きせかえ画面
    var skinBtn = document.getElementById('skinButton');
    if (skinBtn) {
        if (SKIN_FEATURE_ENABLED) {
            skinBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); showSkinScreen(); });
            skinBtn.addEventListener('click', function(e) { e.stopPropagation(); showSkinScreen(); });
        } else {
            // 【一時措置】スキン素材が未完成のためグレーアウト＆無効化（タイトルショップと同じ扱い）
            // ※ #titleButtons button に pointer-events:auto !important が掛かっているため
            //   setProperty で !important を付けて確実に無効化する。
            skinBtn.disabled = true;
            skinBtn.style.opacity = '0.5';
            skinBtn.style.filter = 'grayscale(0.5)';
            skinBtn.style.setProperty('pointer-events', 'none', 'important');
        }
    }
    var skinBackBtn = document.getElementById('skinBackBtn');
    if (skinBackBtn) {
        skinBackBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); closeSkinScreen(); });
        skinBackBtn.addEventListener('click', function(e) { e.stopPropagation(); closeSkinScreen(); });
    }
    var skinListEl = document.getElementById('skinList');
    if (skinListEl) {
        skinListEl.addEventListener('click', handleSkinClick);
        skinListEl.addEventListener('touchend', function(e) { if (handleSkinClick(e)) e.preventDefault(); });
    }

    // 必殺技 発動ボタン（ゲージ満タン時のみ pointer-events:auto）
    var specialBtnEl = document.getElementById('specialMoveBtn');
    if (specialBtnEl) {
        specialBtnEl.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); activateSpecialMove(); });
        specialBtnEl.addEventListener('click', function(e) { e.stopPropagation(); activateSpecialMove(); });
    }

    // ストアボタン（タイトル画面）
    var storeBtn = document.getElementById('storeButton');
    storeBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); showStore(); });
    storeBtn.addEventListener('click', function(e) { e.stopPropagation(); showStore(); });

    // ストア閉じるボタン
    var storeCloseBtn = document.getElementById('storeCloseBtn');
    storeCloseBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); closeStore(); });
    storeCloseBtn.addEventListener('click', function(e) { e.stopPropagation(); closeStore(); });

    // ストア商品クリック（イベント委譲）
    var storeList = document.getElementById('storeItemList');
    storeList.addEventListener('click', function(e) {
        var el = e.target.closest('[data-iap-id]');
        if (el) executePurchase(el.getAttribute('data-iap-id'));
    });
    storeList.addEventListener('touchend', function(e) {
        var el = e.target.closest('[data-iap-id]');
        if (el) { e.preventDefault(); executePurchase(el.getAttribute('data-iap-id')); }
    });

    // タイトルショップ：リワード広告ボタン
    var tshopAdBtn = document.getElementById('tshopRewardAdBtn');
    tshopAdBtn.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); adTshopBonus(); });
    tshopAdBtn.addEventListener('click', function(e) { e.stopPropagation(); adTshopBonus(); });

    // タイトルショップ戻るボタン（買う/売るモードならメニューへ、メニューなら退店確認）
    var tShopBack = document.getElementById('titleShopBackBtn');
    tShopBack.addEventListener('touchend', function(e) { e.preventDefault(); e.stopPropagation(); tshopBack(); });
    tShopBack.addEventListener('click', function(e) { e.stopPropagation(); tshopBack(); });

    // タイトルショップ：アイテム選択（DQ風イベント委譲）
    var tshopList = document.getElementById('titleShopList');
    bindTapDelegate(tshopList, 'data-tshop-id', selectTshopItem);
    var tshopLastHovered = null;
    tshopList.addEventListener('mouseover', function(e) {
        var itemEl = e.target.closest('[data-tshop-id]');
        var itemId = itemEl ? itemEl.getAttribute('data-tshop-id') : null;
        if (itemId && itemId !== tshopLastHovered) {
            tshopLastHovered = itemId;
            previewTshopItem(itemId);
        }
    });
    tshopList.addEventListener('mouseleave', function() { tshopLastHovered = null; });

    // タイトルショップ はい/いいえ確認ボタン
    bindTapButton(document.getElementById('tshopConfirmYes'), handleTshopConfirmYes, { stopClickPropagation: true });
    bindTapButton(document.getElementById('tshopConfirmNo'), handleTshopConfirmNo, { stopClickPropagation: true });

    // ── ステージショップ：アイテム選択（イベント委譲 — タッチ・マウス両対応） ──
    var shopItemsContainer = document.getElementById('stageShopItems');
    bindTapDelegate(shopItemsContainer, 'data-item-id', selectShopItem);
    // デスクトップ用ホバープレビュー（mouseover で委譲、mouseenter は非バブルのため不可）
    var shopLastHoveredItem = null;
    shopItemsContainer.addEventListener('mouseover', function(e) {
        var itemEl = e.target.closest('[data-item-id]');
        var itemId = itemEl ? itemEl.getAttribute('data-item-id') : null;
        if (itemId && itemId !== shopLastHoveredItem) {
            shopLastHoveredItem = itemId;
            previewShopItem(itemId);
        }
    });
    shopItemsContainer.addEventListener('mouseleave', function() {
        shopLastHoveredItem = null;
    });

    // ステージショップ閉じるボタン（貯金はメニュー項目 _menu_deposit から。旧depositBtnは1.406で撤去）
    bindTapButton(document.getElementById('stageShopCloseBtn'), closeStageShop, { stopClickPropagation: true });

    // DQ風 はい/いいえ確認ボタン（カーソル合わせ→決定の2ステップ）
    // チュートリアル（はじまりの地）: スキップ・完了画面・設定からの再プレイ
    bindTapButton(document.getElementById('tutorialSkipBtn'), tapTutorialSkip, { stopClickPropagation: true });
    bindTapButton(document.getElementById('tutorialClearBtn'), function() {
        hideScreenEl('tutorialClearScreen');
        showStartScreen();
    });
    bindTapButton(document.getElementById('playTutorialBtn'), function() {
        tutorialState.forced = true;
        hideScreenEl('settingsScreen');
        startGame();
    });
    bindTapButton(document.getElementById('shopConfirmYes'), handleConfirmYes, { stopClickPropagation: true });
    bindTapButton(document.getElementById('shopConfirmNo'), handleConfirmNo, { stopClickPropagation: true });

    // タイトル画面のタップでメニューを開く（Phase3.6 P4: 直接ゲーム開始しない）
    startScreen.addEventListener('click', function(e) {
        handleTitleScreenClick(e);
    });
    startScreen.addEventListener('touchend', function(e) {
        if (e.target.classList.contains('game-button')) return;
        if (e.target.closest('a')) return;
        if (e.target.closest('#forceUpdateBtn')) return;
        e.preventDefault();
        showTitleMenu();
    });

    requestAnimationFrame(gameLoop);
    showSplashScreen();
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        try {
            initialize();
            // iOSのブラウザ/PWAはアプリ版へ移行（引き継ぎコード＋App Storeリンクのウォール表示・ゲーム不可）。
            // ネイティブアプリ内と他OSは通常起動（Android版クローズドテスト開始後に全PWAへ拡大予定）
            if (typeof maybeShowIosPwaMigrationWall === 'function') maybeShowIosPwaMigrationWall();
            if (typeof showUrlChangeNotice === 'function') showUrlChangeNotice(); // 旧URLからの遷移(?from=old)なら再インストール案内
            checkOrientation();
            setTimeout(function() { window.scrollTo(0, 1); }, 100);

            // Service Worker登録（Web/PWAのみ）。ネイティブ(Capacitor)ではキャッシュ不要な上に、
            // 更新後に古いコードを配信してしまうため登録せず、既存のSW/キャッシュがあれば掃除する。
            if (isNativeApp()) {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(function(regs) {
                        regs.forEach(function(r) { r.unregister(); });
                    }).catch(function() {});
                }
                if (window.caches && caches.keys) {
                    caches.keys().then(function(keys) {
                        keys.forEach(function(k) { caches.delete(k); });
                    }).catch(function() {});
                }
            } else if ('serviceWorker' in navigator) {
                // updateViaCache:'none' で sw.js 自体のHTTPキャッシュ(max-age=600)を無効化し、
                // 起動時の update() で新バージョンを確実に検知できるようにする
                navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function(reg) {
                    if (reg) { try { reg.update(); } catch (_) {} }
                }).catch(function() {});
            }

            // 強制アップデート関数
            window.forceUpdate = function() {
                var btn = document.getElementById('forceUpdateBtn');
                if (btn) {
                    btn.textContent = '↻ updating...';
                    btn.disabled = true;
                    btn.style.background = 'rgba(50,180,50,0.8)';
                    btn.style.color = '#fff';
                    btn.style.transform = 'scale(0.93)';
                    btn.style.border = '2px solid rgba(100,255,100,0.6)';
                }
                // iOSのホーム画面PWAでは caches/SW操作のPromiseが解決せずフリーズする事が
                // あるため、何があっても一定時間後に必ずリロードする安全網を張る。
                // go は1度だけ実行（正常終了時は即・ハング時は1.2秒後に発火）。
                // リロードさえすれば updateViaCache:'none' + cache-buster + cache:'reload' で更新は成立する。
                var navigated = false;
                var go = function() {
                    if (navigated) return;
                    navigated = true;
                    // HTTPキャッシュ(max-age=600)を確実にバイパスするためcache-buster付きで再取得
                    location.replace(location.pathname + '?u=' + Date.now());
                };
                setTimeout(go, 1200);
                var p = Promise.resolve();
                if ('caches' in window) {
                    p = caches.keys().then(function(names) {
                        return Promise.all(names.map(function(n) { return caches.delete(n); }));
                    });
                }
                p.then(function() {
                    if ('serviceWorker' in navigator) {
                        return navigator.serviceWorker.getRegistrations().then(function(regs) {
                            return Promise.all(regs.map(function(r) { return r.unregister(); }));
                        });
                    }
                }).then(go).catch(go);
            };

            // Android戻るボタン対応
            // Android戻るボタン/ブラウザバック: BACK_HANDLERS（優先順位付きレジストリ）の
            // 先頭から評価し、最初に「開いている」画面のonBackを1つだけ実行する。
            // 新しい画面を追加する場合はBACK_HANDLERSに1エントリ追加するだけでよい。
            window.addEventListener('popstate', function(e) {
                // タイトルメニューの上に重ねた画面（設定/図鑑/ランキング等）を閉じるボタンで閉じると、
                // 「hide済み→history.back()」のpopstateがここへ届き、走査の先頭ヒットがメニュー自身になる。
                // その時はメニューへ「戻ってきた」だけなので閉じない。
                // （ハード戻るで子画面が開いたままの場合は子画面が先にヒットし、従来通り子画面だけ閉じる）
                var backToMenu = !!(e.state && e.state.screen === 'titleMenu');
                for (var i = 0; i < BACK_HANDLERS.length; i++) {
                    if (BACK_HANDLERS[i].isOpen()) {
                        if (backToMenu && BACK_HANDLERS[i].menuSelf) return;
                        BACK_HANDLERS[i].onBack();
                        return;
                    }
                }
            });
        } catch (err) {
            showGameModal(t('error_init'));
        }
    }, 100);
});
