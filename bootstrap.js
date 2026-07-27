// ============================================================
// bootstrap.js — 起動処理（index.html から分離 / Ver.1.336, Step5・分割の最終ファイル）
// 内容: gameLoop・リサイズ・タイトル画像・setupInput(入力)・グローバルイベント・
//       initialize・DOMContentLoaded。（PWA用のforceUpdate/SW登録は1.510で撤去=Web配信はウォールのみ）
// ★必ず最後(render.jsの後)に読み込む。全関数定義後にトップレベル実行
//   (setupInput IIFE / イベント登録 / DOMContentLoaded)が走る。
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
            updateGroundReturnFade(); // 地底エンディング→地上復帰の白フェード（非アクティブ時は即return・1.588）
            checkShopTrigger();
            checkPipeTrigger();
            updatePipeAssist(); // 土管タイム（土管上でスクロール減速・updateGameSpeedの直後に判定）
            updateTutorial();   // チュートリアル台本（非アクティブ時は即return・減速はupdateGameSpeed後に乗算）
            updateUnderground(); // 地底: 追従カメラ＋左壁クランプ＋チェックポイント（非アクティブ時は即return）
            checkBossTrigger();
            updateBoss();
            updateBiome();
            updatePlayer();
            updatePlatforms();
            updateEnemies();
            // 地底ギミック（溶岩/トゲ/ファイアバー/火の玉）。⚠**updatePlayer より後**に呼ぶこと＝
            // プレイヤーの最終位置で当たりを見る（前に置くと1フレーム古い位置で判定してすり抜ける）。
            updateUndergroundHazards();
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
        document.body.classList.add('is-paused');   // ⚠復帰は「再開」ボタンだけ（1.613）
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
    // スクロールとタップの区別(1.507): 旧実装はtouchendで無条件に指位置の行を選択していたため、
    // リストをスクロールして指を離すとその位置のアイテムが選ばれてしまった（ユーザー報告）。
    // 指の移動量10px超 or リスト自体のスクロール量3px超なら「スクロール操作」としてタップ扱いしない。
    var tapStartX = 0, tapStartY = 0, tapStartScroll = 0, tapMoved = false;
    container.addEventListener('touchstart', function(e) {
        var t = e.touches[0];
        tapStartX = t.clientX; tapStartY = t.clientY;
        tapStartScroll = container.scrollTop;
        tapMoved = false;
    }, { passive: true });
    container.addEventListener('touchmove', function(e) {
        var t = e.touches[0];
        if (Math.abs(t.clientX - tapStartX) > 10 || Math.abs(t.clientY - tapStartY) > 10) tapMoved = true;
    }, { passive: true });
    container.addEventListener('touchend', function(e) {
        e.preventDefault();
        e.stopPropagation();
        touchFired = true;
        if (tapMoved || Math.abs(container.scrollTop - tapStartScroll) > 3) return; // スクロールの指離し＝選択しない
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
                return;
            }
            // 侍ぴよ（1.509）: 空中で下スワイプ→急降下斬り（非所持/条件外は何もしない）。
            // 地上系（土管入場/すり抜け）を先に判定するので入力衝突なし。
            if (typeof startSamuraiDive === 'function' && startSamuraiDive()) {
                moveSwiped = true;
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
    // 急降下斬りの下スワイプはジャンプエリアでも受け付ける（1.563・ユーザー指定）。
    // ⚠従来は L/R エリア(onMoveMove→handleSwipeDown)だけが下スワイプを見ていたが、
    //   「跳ぶ→落ちながら斬る」は同じ右手の親指で完結する操作なので、ジャンプを押した指のまま
    //   下へ払えるほうが自然。ジャンプ指を L/R まで動かす必要があった従来は実質出しにくかった。
    // ⚠ここで受けるのは**急降下斬りだけ**（土管入場/足場すり抜けは L/R のまま）。
    //   ジャンプは押しっぱなしになる操作なので、すり抜けまで拾うと意図しない落下が起きる。
    //   startSamuraiDive() は「侍スキン＋空中＋未発動」を自前で全部見て false を返すので、
    //   侍以外のプレイヤーにはこの分岐は一切影響しない。
    var jumpSwipeY = 0, jumpSwipeTime = 0, jumpSwiped = false;
    jumpArea.addEventListener('touchstart', function(e) {
        if (!gameState.gameStarted || gameState.gamePaused) return;
        e.preventDefault();
        var jt = e.changedTouches[0];   // このエリアで今始まった指（L/R側と同じ流儀・1.459）
        if (jt) { jumpSwipeY = jt.clientY; jumpSwipeTime = Date.now(); jumpSwiped = false; }
        if (ctrlJump) ctrlJump.classList.add('active');
        gameState.input.jump = true;
    });
    jumpArea.addEventListener('touchmove', function(e) {
        if (!gameState.gameStarted || gameState.gamePaused) return;
        e.preventDefault();
        if (jumpSwiped) return;                 // 1回の押しにつき1回だけ（連続発火を防ぐ）
        var jt = e.targetTouches[0];            // このエリア上の指だけを見る
        if (!jt) return;
        // しきい値は L/R の下スワイプ（handleSwipeDown）と同一＝どちらで払っても同じ手応えにする
        if (jt.clientY - jumpSwipeY > 15 && Date.now() - jumpSwipeTime < 500) {
            jumpSwiped = true;                  // 成否に関わらず latch（侍以外で毎フレーム試さない）
            // ⚠土管を狙った下スワイプなら土管を優先する（L/R側 handleSwipeDown と同じ優先順）。
            //   gameContainer の全画面ハンドラ(1.449)が dy>20 で同じ指の土管入場を拾うので、
            //   ここで先に斬りを出すと「土管に入りつつ急降下斬りが発動している」状態になりうる。
            var _wp = touchToWorld(jt);
            if (_wp && typeof tryEnterPipeAtWorld === 'function' && tryEnterPipeAtWorld(_wp.x, _wp.y)) return;
            if (typeof startSamuraiDive === 'function') startSamuraiDive();
        }
    });
    // touchend と touchcancel(OS割込み)の両方でジャンプ解除。touchcancelを拾わないと、長押し
    // ジャンプ中にOS割込みで input.jump が true 固着し、以後 jumpJustPressed が発火せずジャンプ不可になる（監査M-2）。
    function onJumpEnd(e) {
        e.preventDefault();
        jumpSwiped = false;
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
    // （UPDATEボタンのバインドはPWA廃止に伴い撤去 — 1.510）

    // ストックアイテム: **タップ=使用／長押し=つかむ→ドラッグで入替**（1.597・ユーザー指定）。枠は動的生成のため委譲。
    // ⚠1.596までは「少しでも動かしたらドラッグ」だったため、使おうとして指がわずかに滑るだけで入替に化けていた。
    //   長押しでしかつかめないようにして、タップ（使用）と入替を明確に分ける。
    //   ⚠**長押しに至らないまま動かした場合は「何もしない」**（使用もしない・入替もしない）＝ユーザー指定
    //   「それ以外の挙動はいらない」。誤操作でアイテムを失わないための安全側の倒し方でもある。
    (function bindStockTaps() {
        var sc = document.getElementById('stockSlots');
        if (!sc) return;
        var DRAG_THRESH = 8;       // 長押し成立前にこれ以上動いたら「操作をやめた」とみなす
        var LONG_PRESS_MS = 350;   // この時間押し続けるとつかむ（.dragging の見た目で分かる）
        var fired = false;         // touchend 処理済み→直後の click 無視
        var suppressClick = false; // ドラッグ/取り消しの後の click 無視
        var drag = null;           // {from,x,y,dragging,cancelled,el,timer}

        function srcSlot(e) { return (e.target && e.target.closest) ? e.target.closest('.stock-slot[data-idx]') : null; }
        // 長押しの計時を止める（つかんだ後／指を離した後／取り消した後は必ず呼ぶ）
        function clearHold() { if (drag && drag.timer) { clearTimeout(drag.timer); drag.timer = null; } }
        // 押し始め。ここではまだ何も起きない＝長押しが成立して初めて「つかむ」
        function beginPress(el, x, y) {
            drag = { from: parseInt(el.getAttribute('data-idx'), 10), x: x, y: y,
                     dragging: false, cancelled: false, el: el, timer: null };
            var d0 = drag;
            drag.timer = setTimeout(function () {
                if (drag !== d0 || drag.cancelled || drag.dragging) return;
                drag.dragging = true;                    // つかんだ
                drag.timer = null;
                drag.el.classList.add('dragging');       // 半透明＋少し縮む＝持ち上がった合図
            }, LONG_PRESS_MS);
        }
        // 長押し成立前に動いた＝操作の取り消し（使用も入替もしない）
        function cancelPress() {
            if (!drag || drag.dragging) return false;
            clearHold();
            drag.cancelled = true;
            return true;
        }
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
            beginPress(el, tt.clientX, tt.clientY);
        }, { passive: true });
        sc.addEventListener('touchmove', function(e) {
            if (!drag) return;
            var tt = e.touches[0];
            if (!drag.dragging) {
                // まだつかんでいない：閾値を超えて動いたら操作を取り消す（＝離しても何も起きない）
                if (Math.abs(tt.clientX - drag.x) > DRAG_THRESH || Math.abs(tt.clientY - drag.y) > DRAG_THRESH) cancelPress();
                return;
            }
            e.preventDefault(); e.stopPropagation();
            highlight(tt.clientX, tt.clientY, drag.from);
        }, { passive: false });
        sc.addEventListener('touchend', function(e) {
            if (!drag) return;
            e.preventDefault(); e.stopPropagation();
            fired = true;
            clearHold();
            var tt = (e.changedTouches && e.changedTouches[0]) || { clientX: drag.x, clientY: drag.y };
            if (drag.dragging) finishDrag(tt.clientX, tt.clientY);        // 長押しでつかんでいた＝入替
            else if (!drag.cancelled) useStockItem(drag.from);            // 長押し前に離した＝タップ＝使用
            // 取り消し済み（つかむ前に動かした）は何もしない
            drag = null;
        });
        // 通知やシステムジェスチャで指が奪われた時に長押しが残らないようにする
        sc.addEventListener('touchcancel', function() {
            if (!drag) return;
            clearHold(); clearVisuals(); drag = null;
        });

        // ── マウス（デスクトップ／Preview検証用）※タッチと同じ「長押しでつかむ」に揃える ──
        sc.addEventListener('mousedown', function(e) {
            var el = srcSlot(e); if (!el) return;
            e.stopPropagation();
            beginPress(el, e.clientX, e.clientY);
        });
        document.addEventListener('mousemove', function(e) {
            if (!drag) return;
            if (!drag.dragging) {
                if (Math.abs(e.clientX - drag.x) > DRAG_THRESH || Math.abs(e.clientY - drag.y) > DRAG_THRESH) cancelPress();
                return;
            }
            highlight(e.clientX, e.clientY, drag.from);
        });
        document.addEventListener('mouseup', function(e) {
            if (!drag) return;
            clearHold();
            // ドラッグでも取り消しでも、直後の click（=使用）は抑止する。素早いクリックだけが使用になる
            if (drag.dragging) { finishDrag(e.clientX, e.clientY); suppressClick = true; }
            else if (drag.cancelled) { clearVisuals(); suppressClick = true; }
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

    // ⚠1.613: ここには「ポーズ画面の背景タップで復帰」があったが撤去した（ユーザー指示
    //   「再開ボタン以外で復帰は禁止」）。背景を触っただけで戦闘に戻され、そのまま被弾する事故が起きていた。

    // （デバッグモードの配線=ポーズタイトル連打/BOSS FIGHT/SHOP WARP はネイティブ提出前に撤去済み — Ver.1.461）

    window.addEventListener('keydown', function(e) {
        // ⚠1.613: Esc/P は**ポーズ専用**にした（pauseGame はトグルをやめた）。Space での復帰も撤去。
        //   復帰は「再開」ボタンだけ（ユーザー指示「再開ボタン以外で復帰は禁止」）。
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); pauseGame(); return; }
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
                } else if (typeof startSamuraiDive === 'function') {
                    startSamuraiDive(); // 侍ぴよ（1.509）: 空中の下キー=急降下斬り（タッチの空中下スワイプと同等）
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
    if (e.target.closest('#nameInputScreen, #rankingScreen, #settingsScreen, #pauseScreen, #gameOverScreen, #stageShopScreen, #titleShopScreen, #guideScreen, #achievementScreen, #badgeScreen, #missionScreen, #skinScreen, #zukanScreen, #titleMenuScreen, #gameModal, .transferOverlay, #houseAdScreen')) return;
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
    document.body.classList.add('is-paused');   // ⚠復帰は「再開」ボタンだけ（1.613）
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
        // ⚠1.597: resumeHard を優先。広告を挟んだ後は要素が paused=false のまま無音になることがあり、
        //   その状態だと resume() は paused ガードで永久に空振りする（実機報告の「広告後ずっと無音」）。
        if (soundManager && typeof soundManager.resumeHard === 'function') soundManager.resumeHard();
        else if (soundManager && typeof soundManager.resume === 'function') soundManager.resume();
        // ⚠1.591: リワード広告が閉じるボタンごと反応しなくなり復帰できない不具合（ユーザー報告・
        //   @capacitor-community/admob の既知バグ=Dynamic Islandが閉じるボタンに被る等）への保険。
        //   ホームへスワイプ→戻る、で本当に背景化→復帰した瞬間なら、詰まっていたリワードを片付ける。
        //   これで強制終了しなくても脱出でき、ポーズ画面から普通に再開できる（ランは失われない）。
        if (typeof recoverStuckRewardAd === 'function') recoverStuckRewardAd();
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
    // 地底モード（1.629）: パス未所持ならボタン側で pointer-events:none にしてあるが、
    // startUndergroundMode 内でも所持を再確認する（入口が増えても穴が開かないように）
    bindTapButton(document.getElementById('ugModeButton'), function() { startUndergroundMode(); }, { stopClickPropagation: true });
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

    // タイトル右上の言語切替 JA|EN（1.623・英語圏向け）
    // ⚠タイトルは「どこをタップでもメニューが開く」ので、伝播を止めないとメニューが同時に開く。
    //   bindTapButton の touchend は常に stopPropagation する＋guardTouchStart で touchstart も止め、
    //   click は stopClickPropagation で startScreen の click ハンドラへ届かないようにする。
    bindTapButton(document.getElementById('titleLangJa'), function() { setTitleLanguage('ja'); },
                  { stopClickPropagation: true, guardTouchStart: true });
    bindTapButton(document.getElementById('titleLangEn'), function() { setTitleLanguage('en'); },
                  { stopClickPropagation: true, guardTouchStart: true });

    // タイトル画面のタップでメニューを開く（Phase3.6 P4: 直接ゲーム開始しない）
    startScreen.addEventListener('click', function(e) {
        handleTitleScreenClick(e);
    });
    startScreen.addEventListener('touchend', function(e) {
        if (e.target.classList.contains('game-button')) return;
        if (e.target.closest('a')) return;
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
            checkOrientation();
            setTimeout(function() { window.scrollTo(0, 1); }, 100);

            // Service Worker: PWA廃止(1.510)に伴い登録は撤去（sw.js自体も削除済み）。
            // 旧PWA時代のSW/キャッシュが端末に残っていれば掃除だけ行う（ネイティブ旧インストール・開発環境の残骸対策）。
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
