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

    // 物理コントローラー（1.724）。⚠Gamepad API はイベントではなくポーリングなので毎フレーム読む。
    //   ⚠固定ステップの while の**外**で呼ぶこと（中だと1フレームに複数回走り、押した瞬間の判定が壊れる）。
    //   ⚠**必ず try で囲む**（1.728）。ここは requestAnimationFrame(gameLoop) より前なので、
    //     素で呼んで例外が出ると**次のフレームが二度と回らずゲームが完全停止する**。
    //     コントローラーは機種ごとに報告内容が違う＝想定外の形が来ても本編は絶対に止めない。
    if (typeof pollGamepad === 'function') {
        try { pollGamepad(); }
        catch (e) { if (!gameLoop._gpErr) { gameLoop._gpErr = true; try { console.error('gamepad', e); } catch (_) {} } }
    }

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

    // ── 押した瞬間/離した瞬間の処理（キーボードと物理コントローラーで共有・1.724） ──
    // ⚠**下方向だけは「押した瞬間にしかできないこと」がある**（土管への入室・急降下斬り）ので、
    //   真偽値を立てるだけでは足りない。コントローラー側で同じ処理を書き写すと必ずズレるため、
    //   ここに1本化して両方から呼ぶ。
    function pressDown() {
        if (pipeRoomState.active) return;                 // 部屋内では下入力の特殊動作なし（タッチと同等）
        if (getEnterablePipe()) { enterPipeRoom(); return; } // 土管の上なら入室（タッチの下スワイプと同等）
        if (isOnPlatform()) {
            gameState.input.down = true;
            gameState.downSwipeActive = true;
            gameState.downSwipeTimer = DOWN_SWIPE_FRAMES;
        } else if (typeof startSamuraiDive === 'function') {
            startSamuraiDive(); // 侍ぴよ（1.509）: 空中の下=急降下斬り
        }
    }
    function releaseDown() {
        gameState.input.down = false;
        gameState.downSwipeActive = false;
        gameState.downSwipeTimer = 0;
    }
    // ⚠ジャンプは up も同時に立てる（up はおみせへの入店判定に使われる＝checkShopTrigger）。
    function pressJump() { gameState.input.jump = true; gameState.input.up = true; }
    function releaseJump() { gameState.input.jump = false; gameState.input.up = false; }

    window.addEventListener('keydown', function(e) {
        // ⚠1.613: Esc/P は**ポーズ専用**にした（pauseGame はトグルをやめた）。Space での復帰も撤去。
        //   復帰は「再開」ボタンだけ（ユーザー指示「再開ボタン以外で復帰は禁止」）。
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); pauseGame(); return; }
        if (!gameState.gameStarted || gameState.gamePaused) return;
        switch (e.key) {
            case 'ArrowLeft': case 'a': case 'A': gameState.input.left = true; break;
            case 'ArrowRight': case 'd': case 'D': gameState.input.right = true; break;
            case 'ArrowDown': case 's': case 'S': pressDown(); break;
            case ' ': case 'ArrowUp': case 'w': case 'W':
                pressJump();
                e.preventDefault(); break;
        }
    });

    window.addEventListener('keyup', function(e) {
        switch (e.key) {
            case 'ArrowLeft': case 'a': case 'A': gameState.input.left = false; break;
            case 'ArrowRight': case 'd': case 'D': gameState.input.right = false; break;
            case 'ArrowDown': case 's': case 'S': releaseDown(); break;
            case ' ': case 'ArrowUp': case 'w': case 'W': releaseJump(); break;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // 物理コントローラー（Gamepad API・1.724）
    // ⚠**ゲーム本体には一切手を入れない。** タッチ/キーボードと同じ gameState.input を立てるだけ。
    //   ⚠iOS(WKWebView)・Android(Chromium WebView) とも Gamepad API が使える。Xbox / DualSense は
    //   `mapping === 'standard'` で返るのでボタン番号は W3C 標準配置に揃う。
    //   標準でない機種のために、方向は**十字キーとスティックの両方**を見る（どちらかが効けば動く）。
    // ⚠**イベントではなくポーリング**（Gamepad API の仕様）。gameLoop から毎フレーム pollGamepad() を呼ぶ。
    // ⚠押しっぱなしを毎フレーム「押した瞬間」と誤認しないよう、前フレームの状態と比較する（prevBtn）。
    // ─────────────────────────────────────────────────────────────
    var GP_DEADZONE = 0.35;   // スティックの遊び。小さすぎるとドリフトで勝手に歩く（調整ノブ）
    var GP = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 }; // W3C standard mapping
    var prevBtn = {};         // 前フレームで押されていたか（押した瞬間の検出用）
    var gpConnectedId = null; // 接続中のコントローラー名（重複トースト防止も兼ねる）

    function gpPressed(pad, idx) {
        var b = pad.buttons[idx];
        if (!b) return false;
        return (typeof b === 'object') ? (b.pressed || b.value > 0.5) : (b > 0.5);
    }
    function gpAxis(pad, idx) {
        var v = pad.axes[idx];
        return (typeof v === 'number' && isFinite(v)) ? v : 0;
    }
    // ⚠標準配置(standard)でない機種の保険（1.728）。十字キーが**ボタン12〜15ではなく軸(hat)**で
    //   来る機種があり、その場合 GP.UP/DOWN/LEFT/RIGHT が一切反応しない（メニューが動かせない）。
    //   ⚠standard の機種では余計な軸を読まない（axes[9]は存在しないか0のまま）＝挙動を変えない。
    //   hat は -1..1 に8方向を詰めた値。厳密な機種別対応はせず、**上下左右が取れれば十分**とする。
    function gpHat(pad, dir) {
        if (pad.mapping === 'standard') return false;
        var h = pad.axes[9];
        if (typeof h !== 'number' || !isFinite(h) || h > 1.2 || h < -1.2) return false;
        var a = (h + 1) * 3.5;              // 0..7（上から時計回り）。無入力は範囲外の値で来る
        if (a < -0.2 || a > 7.2) return false;
        var i = Math.round(a) % 8;
        if (dir === 'up')    return i === 0 || i === 1 || i === 7;
        if (dir === 'right') return i === 1 || i === 2 || i === 3;
        if (dir === 'down')  return i === 3 || i === 4 || i === 5;
        if (dir === 'left')  return i === 5 || i === 6 || i === 7;
        return false;
    }

    // ─── メニュー操作（1.726・ユーザー要望「ショップ内やメニュー画面も操作したい」） ───
    // ⚠**画面ごとに項目表を持たない。** 表示中の画面から押せる要素をその場で拾う＝
    //   画面が増えても勝手に効く（図鑑やきせかえのように中身が動的に作られる画面にも対応できる）。
    // ⚠重なり順は z-index ではなく**この配列の順**で決める（同じ z-index の画面が複数あるため）。
    //   先頭ほど手前。表示中で最初に見つかったものを操作対象にする。
    // ⚠**動的に作られるモーダル**（DOMに後から差し込まれる）。固定idの画面より必ず手前にある。
    //   これを入れておかないと、ラン中に枠が満杯でアイテムを拾った瞬間に操作不能になる（実測で発覚）。
    var GP_MODALS = ['.stockSwapOverlay', '#gameModal'];
    var GP_SCREENS = [
        // ⚠**splashScreen を必ず入れる**（1.729）。スプラッシュ表示中は startScreen が display:none なので、
        //   入れていないと操作対象がゼロ＝「Please Tap から先に進めない」（ユーザー実機報告）。
        'splashScreen',
        'nameInputScreen', 'houseAdScreen', 'tutorialClearScreen', 'guideScreen', 'tutorialScreen',
        'pauseSkinView',
        // ⚠**ポーズはショップより手前**（1.729）。ショップを開いたままポーズすると、順番を誤ると
        //   ショップ側が操作対象になり「A を押しても再開できない」（実測で発生）。
        //   ポーズ幕はどの画面の上にも出るので、サブ画面(pauseSkinView)の次に置く。
        'pauseScreen',
        'settingsScreen', 'skinScreen', 'zukanScreen', 'rankingScreen',
        'achievementScreen', 'badgeScreen', 'missionScreen', 'storeScreen',
        'titleShopScreen', 'stageShopScreen', 'titleMenuScreen',
        'gameOverScreen', 'startScreen'
    ];
    // ⚠一覧の行は button ではなく **data-* 属性つきの div**（bindTapDelegate で委譲している）。
    //   委譲は click でも効くので、行を .click() すればタップと同じ経路を通る。
    //   ⚠新しい一覧を作る時はここに属性を足すこと（足し忘れるとその画面だけ操作できなくなる）。
    var GP_FOCUS_SEL = 'button, [onclick], [data-idx], [data-slot], [data-item-id], [data-tshop-id],'
        + ' [data-zid], [data-zcat], [data-skin-equip], [data-mission-claim], [data-mission-bonus],'
        + ' [data-ach-claim], .dq-confirm-opt, input, select';
    var gpFocusEl = null;      // いまカーソルが当たっている要素
    var gpFocusScreen = null;  // その要素が属する画面（切り替わったら選び直す）

    function gpVisible(el) {
        if (!el || el.disabled) return false;
        var r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return false;               // 0サイズ・飾りは除外
        var st = window.getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.05;
    }
    function gpTopScreen() {
        var i, el;
        for (i = 0; i < GP_MODALS.length; i++) {
            el = document.querySelector(GP_MODALS[i]);
            if (el && gpVisible(el)) return el;
        }
        for (i = 0; i < GP_SCREENS.length; i++) {
            if (isScreenVisible(GP_SCREENS[i])) return document.getElementById(GP_SCREENS[i]);
        }
        return null;
    }

    // ─── 持ち物（ストック枠）の操作（1.727・ユーザー決定: □=使用 / L・R=切替） ───
    // ⚠**枠の数は可変**（既定3・ストック拡張で最大6）。先頭が まほうのポーチ の金枠。
    //   使用の入口は useStockItem(表示index) の1本＝タップと完全に同じ経路を通す（挙動をズラさない）。
    var gpStockIdx = 0;
    function gpSlotFilled(i) {
        var pl = (typeof permaLevel === 'function') ? permaLevel() : 0;
        if (i < pl) { var p = stockState.perma[i]; return !!(p && p.id && !p.used); }
        var ni = i - pl;
        return ni >= 0 && ni < stockState.items.length;
    }
    // 中身のある枠だけを巡る。⚠空き枠を選ばせない＝押しても何も起きない位置で止まらないように。
    function gpStockStep(dir) {
        var n = stockState.maxSlots, i, idx;
        for (i = 1; i <= n; i++) {
            idx = ((gpStockIdx + dir * i) % n + n) % n;
            if (gpSlotFilled(idx)) { gpStockIdx = idx; return true; }
        }
        return false;   // 持ち物が空
    }
    // 選択中の枠が空になったら（使った/売った）、隣の中身のある枠へ寄せる
    function gpStockNormalize() {
        if (gpSlotFilled(gpStockIdx)) return;
        var n = stockState.maxSlots, i;
        for (i = 0; i < n; i++) { if (gpSlotFilled(i)) { gpStockIdx = i; return; } }
        gpStockIdx = 0;
    }
    // 選択枠の光らせ方。⚠updateStockUI は innerHTML を作り直すのでクラスが消える＝毎フレーム当て直す。
    //   （querySelector 2回だけなので負荷は無視できる。当たっていれば何もしない）
    function gpApplySlotMark(on) {
        var cont = document.getElementById('stockSlots');
        if (!cont) return;
        var cur = cont.querySelector('.gp-slot');
        var want = on ? cont.querySelector('[data-idx="' + gpStockIdx + '"]') : null;
        if (cur === want) return;
        if (cur) cur.classList.remove('gp-slot');
        if (want) want.classList.add('gp-slot');
    }
    function gpItems(root) {
        var all = root.querySelectorAll(GP_FOCUS_SEL), out = [], i;
        for (i = 0; i < all.length; i++) {
            // ⚠画面そのもの（onclick付きの外枠）は拾わない＝画面全体が1項目になってしまう
            if (all[i] === root) continue;
            if (gpVisible(all[i])) out.push(all[i]);
        }
        return out;
    }
    function gpCenter(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    function gpSetFocus(el) {
        if (gpFocusEl === el) return;
        if (gpFocusEl) gpFocusEl.classList.remove('gp-focus');
        gpFocusEl = el || null;
        if (gpFocusEl) {
            gpFocusEl.classList.add('gp-focus');
            // ⚠スクロールする画面（図鑑・きせかえ・ショップ）ではカーソルが画面外に出るので必ず追う
            try { gpFocusEl.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
        }
    }
    // 方向キーで「その向きにある一番近い要素」へ移す。⚠並び順(DOM順)ではなく**見た目の位置**で選ぶ＝
    //   図鑑のような格子でも、横並びのボタン列でも、同じ関数で自然に動く。
    // 2つの区間の隙間（重なっていれば0）。⚠**横ずれは中心どうしの距離では測らない**（1.732）。
    //   幅いっぱいの「地底モード」から下を押すと、中心が真ん中にあるせいで下の段の**真ん中の項目**
    //   （ずかん/ランキング）へ飛んでいた。ユーザー報告「地底モードから下は設定に来てほしい」。
    //   重なっている候補は横ずれ0＝**同点になり、先に見つかった＝DOM順で先頭**が選ばれる（＝左端の設定）。
    function gpSpan(a1, a2, b1, b2) { return Math.max(0, Math.max(a1 - b2, b1 - a2)); }
    function gpPick(items, dx, dy, sameParentOnly) {
        var c = gpCenter(gpFocusEl), rc = gpFocusEl.getBoundingClientRect();
        var best = null, bestScore = Infinity, i, t, rt, v, along, across, score;
        for (i = 0; i < items.length; i++) {
            if (items[i] === gpFocusEl) continue;
            if (sameParentOnly && items[i].parentElement !== gpFocusEl.parentElement) continue;
            t = gpCenter(items[i]);
            rt = items[i].getBoundingClientRect();
            v = { x: t.x - c.x, y: t.y - c.y };
            along  = dx ? v.x * dx : v.y * dy;           // 進みたい向きの成分
            across = dx ? gpSpan(rc.top, rc.bottom, rt.top, rt.bottom)
                        : gpSpan(rc.left, rc.right, rt.left, rt.right); // 横ずれ（重なっていれば0）
            if (along <= 4) continue;                    // その向きに無いものは対象外
            // ⚠**進んだ距離を最優先**にする（1.729）。横ずれの重みが大きすぎると、
            //   すぐ下の行より「真下だが遠い行」を選んでしまい、間の項目を飛び越える
            //   （タイトルメニューで「さいしょから」から最下段の「もどる」へ飛んだ）。
            //   along を強く効かせ、across は同距離の候補を捌くための補助に留める。
            score = along * 3 + across;
            if (score < bestScore) { bestScore = score; best = items[i]; }
        }
        return best ? { el: best, score: bestScore } : null;   // 距離も返す（一覧優先の判断に使う）
    }
    // 同じ親に「一覧」と呼べるだけの項目があるか。⚠**2個しか無い親は一覧ではない**（1.729）。
    //   タイトルメニューの外枠は「さいしょから」と「もどる」の2個しか直接持たず、8個のボタンは
    //   内側の別の枠にある。ここで同じ親を優先すると**8個を丸ごと飛び越して「もどる」へ落ちる**。
    function gpIsList(el, items) {
        var n = 0;
        for (var i = 0; i < items.length; i++) if (items[i].parentElement === el.parentElement) n++;
        return n >= 3;
    }
    function gpMove(items, dx, dy) {
        if (!gpFocusEl) { gpSetFocus(items[0]); return; }
        // ⚠一覧（同じ親に3つ以上）の中に居る時は、**その一覧の中を優先**する。
        //   商品一覧を上下に辿る途中で脇に浮いた「でる」ボタンへ飛ぶのを防ぐため（実測で発生）。
        var best = gpPick(items, dx, dy, false);
        if (gpIsList(gpFocusEl, items)) {
            var inList = gpPick(items, dx, dy, true);
            // ⚠**ただし画面全体の候補のほうが明らかに近いなら、そちらを採る**（1.732）。
            //   タイトルメニューの外枠は「つづきから/地底モード/もどる」の3つを直接持つ＝**一覧と判定される**ため、
            //   地底モードから下を押すと、すぐ下の「設定」を飛び越して最下段の「もどる」へ落ちていた
            //   （ユーザー実機報告）。1.6倍までなら一覧の並びを尊重し、それより遠ければ近い方を選ぶ。
            if (inList && (!best || inList.score <= best.score * 1.6)) best = inList;
        }
        if (best) gpSetFocus(best.el);
    }
    function gpBack(root) {
        // 「もどる」に相当するボタンを探して押す。⚠無ければ何もしない（勝手に画面を閉じない）
        // ⚠**id の命名規則も見る**。「> お店を出る」のように data-i18n="btn_back" を持たない戻るボタンがあり、
        //   クラスだけの判定では タイトルショップ で B が効かなかった（実測）。
        var cand = root.querySelectorAll(
            '[data-i18n="btn_back"], .head-btn, [id$="BackBtn"], [id$="CloseBtn"], [id$="Back"], [id$="Close"]');
        for (var i = 0; i < cand.length; i++) { if (gpVisible(cand[i])) { cand[i].click(); return true; } }
        // ⚠ショップは「お店を出る」が**ボタンではなく一覧の行**（同名のボタンは display:none で存在する）。
        //   行の識別子で拾う（gameplay.js の _menu_leave / _tmenu_leave と対で維持すること）。
        var leave = root.querySelector('[data-item-id="_menu_leave"], [data-tshop-id="_tmenu_leave"]');
        if (leave && gpVisible(leave)) { leave.click(); return true; }
        return false;
    }

    // メニュー画面をコントローラーで操作する。操作対象があれば true（＝ゲーム側の入力は動かさない）
    function gpMenuMode(pad) {
        var root = gpTopScreen();
        if (!root) { gpSetFocus(null); gpFocusScreen = null; return false; }
        // ⚠**押す対象が無い画面を先に片づける**（1.729）。スプラッシュとタイトルは
        //   「画面のどこをタップでも進む」作りで、押せる要素が0件になる。
        //   ⚠これを items の件数チェックより**前**に置くこと。後ろに置くと0件の早期returnに阻まれて
        //   A が一切効かない（「Please Tap から進めない」の直接原因だった）。
        var tapThrough = (root.id === 'splashScreen') ? startApp
                       : (root.id === 'startScreen')  ? showTitleMenu : null;
        if (tapThrough) {
            var aT = gpPressed(pad, GP.A);
            if (aT && !prevBtn._mA) { try { tapThrough(); } catch (_) {} }
            prevBtn._mA = aT;
            // タイトルは言語切替(JA|EN)も押せるので、項目があればカーソルは出す。無ければここで終わり。
            if (root.id === 'splashScreen') { gpSetFocus(null); return true; }
        }
        var items = gpItems(root);
        // ⚠「はい/いいえ」の確認が出ている間は**それだけ**を対象にする。
        //   背後の商品一覧にカーソルが取られると、決定したつもりで別の物を買ってしまう。
        var confirm = [], ci, allC = root.querySelectorAll('.dq-confirm-opt');
        for (ci = 0; ci < allC.length; ci++) if (gpVisible(allC[ci])) confirm.push(allC[ci]);
        if (confirm.length) items = confirm;
        if (!items.length) { gpSetFocus(null); return true; }   // 画面はあるが押せる物が無い＝操作は吸収する
        // 画面が変わった / カーソルが消えた場合は先頭へ。
        // ⚠ポーズ画面は「再開」を初期位置にする（1.613「再開ボタン以外で復帰は禁止」を守ったまま
        //   コントローラーから復帰できるようにするため。A で押されるのは再開ボタンそのもの）
        if (gpFocusScreen !== root || !gpFocusEl || !root.contains(gpFocusEl) || !gpVisible(gpFocusEl)
            || items.indexOf(gpFocusEl) < 0) {
            gpFocusScreen = root;
            var pref = root.querySelector('#resumeButton');
            gpSetFocus((pref && gpVisible(pref)) ? pref : items[0]);
        }
        var ax = gpAxis(pad, 0), ay = gpAxis(pad, 1);
        var L = gpPressed(pad, GP.LEFT)  || ax < -GP_DEADZONE || gpHat(pad, 'left');
        var R = gpPressed(pad, GP.RIGHT) || ax >  GP_DEADZONE || gpHat(pad, 'right');
        var U = gpPressed(pad, GP.UP)    || ay < -GP_DEADZONE || gpHat(pad, 'up');
        var D = gpPressed(pad, GP.DOWN)  || ay >  GP_DEADZONE || gpHat(pad, 'down');
        // ⚠押した瞬間だけ動かす（押しっぱなしで一覧を突き抜けないように）
        if (L && !prevBtn._mL) gpMove(items, -1, 0);
        if (R && !prevBtn._mR) gpMove(items,  1, 0);
        if (U && !prevBtn._mU) gpMove(items, 0, -1);
        if (D && !prevBtn._mD) gpMove(items, 0,  1);
        prevBtn._mL = L; prevBtn._mR = R; prevBtn._mU = U; prevBtn._mD = D;

        if (!tapThrough) {   // スプラッシュ/タイトルは上で処理済み（二重に発火させない）
            var a = gpPressed(pad, GP.A);
            if (a && !prevBtn._mA && gpFocusEl) { try { gpFocusEl.click(); } catch (_) {} }
            prevBtn._mA = a;
        }

        var b = gpPressed(pad, GP.B);
        if (b && !prevBtn._mB) gpBack(root);
        prevBtn._mB = b;

        return true;
    }

    function pollGamepad() {
        if (!navigator.getGamepads) return;
        var pads;
        try { pads = navigator.getGamepads(); } catch (_) { return; }
        if (!pads) return;
        var pad = null, i;
        for (i = 0; i < pads.length; i++) { if (pads[i] && pads[i].connected) { pad = pads[i]; break; } }

        if (!pad) {
            if (gpConnectedId !== null) {   // 切断: 押しっぱなしが残らないように必ず落とす
                gpConnectedId = null; prevBtn = {};
                gameState.input.left = false; gameState.input.right = false;
                gameState.input.jump = false; gameState.input.up = false;
                releaseDown();
                gpSetFocus(null); gpFocusScreen = null;
                gpApplySlotMark(false);
            }
            return;
        }
        if (gpConnectedId !== pad.id) {     // 接続を検出（機種名はトーストに出す＝実機で何が繋がったか分かる）
            gpConnectedId = pad.id;
            prevBtn = {};
            try {
                if (typeof showRewardToast === 'function') {
                    // ⚠1.728: **機種名と mapping をそのまま出す**。標準配置(standard)でない機種は
                    //   ボタン番号がずれるため、実機で何が繋がったのかを本人が読めないと原因が特定できない
                    //   （PS4のサードパーティ製で「まったく操作できない」報告あり）。
                    var _gpName = String(pad.id || '').slice(0, 40);
                    var _gpMap = pad.mapping ? pad.mapping : 'non-standard';
                    showRewardToast(escapeHtml(t('gamepad_connected') + ' [' + _gpMap + '] ' + _gpName),
                        'linear-gradient(180deg,#8ad1ff,#3a7bd0)', '#fff');
                }
            } catch (_) {}
        }

        // ⚠ポーズは**ゲーム中かどうかに関係なく**先に見る（キーボードの Esc と同じ扱い）。
        //   ⚠pauseGame はトグルではない（1.613）＝ここから復帰はさせない。復帰は「再開」ボタンだけ。
        var startNow = gpPressed(pad, GP.START);
        if (startNow && !prevBtn[GP.START]) { try { pauseGame(); } catch (_) {} }
        prevBtn[GP.START] = startNow;

        // ⚠メニュー/ショップ/ポーズが出ている間は**そちらの操作を優先**し、ゲーム側の入力は動かさない。
        //   （プレイ中でも おみせ や ポーズ は開くので、gameStarted だけでは判定できない）
        if (!gameState.gameStarted || gameState.gamePaused || gpTopScreen()) {
            gameState.input.left = false; gameState.input.right = false;
            gameState.input.jump = false; gameState.input.up = false;
            releaseDown();
            // 押しっぱなしがゲーム復帰の瞬間に暴発しないよう、ゲーム側の前回値も更新しておく
            prevBtn._down = gpPressed(pad, GP.DOWN) || gpPressed(pad, GP.B) || gpAxis(pad, 1) > GP_DEADZONE;
            gpApplySlotMark(false);
            gpMenuMode(pad);
            return;
        }
        // ゲームに戻ったらカーソルは消す
        if (gpFocusEl) { gpSetFocus(null); gpFocusScreen = null; }

        // ── 左右（十字キー / 左スティック の両対応・同時なら十字キーを優先） ──
        var ax = gpAxis(pad, 0);
        var left  = gpPressed(pad, GP.LEFT)  || ax < -GP_DEADZONE || gpHat(pad, 'left');
        var right = gpPressed(pad, GP.RIGHT) || ax >  GP_DEADZONE || gpHat(pad, 'right');
        if (left && right) { left = false; right = false; }   // 同時入力は打ち消す（歩き続ける事故を防ぐ）
        gameState.input.left = left;
        gameState.input.right = right;

        // ── ジャンプ（A ボタン）──
        // ⚠1.725: **ジャンプと入店は分ける**（ユーザー指摘）。タッチ操作でも
        //   「タップ＝ジャンプ／上スワイプ＝入店」と別のジェスチャーになっており、そちらが正。
        //   ⚠キーボード（Space/↑ が jump+up 兼用）とは意図的に挙動を変えている。触らないこと。
        gameState.input.jump = gpPressed(pad, GP.A);

        // ── 上＝おみせに入る（十字キー上 / 左スティック上）＝タッチの上スワイプと同じ ──
        // ⚠スティックの縦軸は**上が負**（W3C standard）。十字キーと連動させる（1.725・ユーザー指摘）。
        //   ⚠up はジャンプを兼ねない＝走行中に少し上へ倒しても跳ばない。
        gameState.input.up = gpPressed(pad, GP.UP) || gpAxis(pad, 1) < -GP_DEADZONE || gpHat(pad, 'up');

        // ── 下（十字キー下 / B ボタン / 左スティック下）＝キーボードの ↓ と同じ ──
        // 押した瞬間にだけ土管入室・急降下斬りが走る（pressDown が面倒を見る）
        var downNow = gpPressed(pad, GP.DOWN) || gpPressed(pad, GP.B) || gpAxis(pad, 1) > GP_DEADZONE
            || gpHat(pad, 'down');
        if (downNow && !prevBtn._down) pressDown();
        else if (!downNow && prevBtn._down) releaseDown();
        prevBtn._down = downNow;

        // ── 持ち物: L / R で選択、□(X) で使用（1.727・ユーザー決定） ──
        gpStockNormalize();
        var l1 = gpPressed(pad, GP.L1), r1 = gpPressed(pad, GP.R1);
        if (l1 && !prevBtn._l1) { if (gpStockStep(-1) && soundManager) { try { soundManager.playCursorMove(); } catch (_) {} } }
        if (r1 && !prevBtn._r1) { if (gpStockStep(1)  && soundManager) { try { soundManager.playCursorMove(); } catch (_) {} } }
        prevBtn._l1 = l1; prevBtn._r1 = r1;
        var x = gpPressed(pad, GP.X);
        // ⚠**タップと同じ useStockItem を呼ぶ**。確認が要る品は向こうが確認モーダルを出す（gameModal は
        //   GP_MODALS に入れてあるので、そのままコントローラーで答えられる）。
        if (x && !prevBtn._x && gpSlotFilled(gpStockIdx)) { try { useStockItem(gpStockIdx); } catch (_) {} }
        prevBtn._x = x;

        // ── ひっさつわざ「ぴよフラッシュ」: Y（PSは △）（1.732・ユーザー要望） ──
        // ⚠**画面上のボタンと同じ activateSpecialMove を呼ぶだけ**（発動条件はあちらが全部見ている＝
        //   ゲージ未満/未購入/土管の部屋/カットイン中などは向こうで弾かれる）。
        var yb = gpPressed(pad, GP.Y);
        if (yb && !prevBtn._y) { try { activateSpecialMove(); } catch (_) {} }
        prevBtn._y = yb;
        gpApplySlotMark(true);
    }
    window.pollGamepad = pollGamepad;

    // 接続/切断のイベントは**検出の補助**（実際の読み取りは毎フレームのポーリング）。
    window.addEventListener('gamepadconnected', function() { /* 次のpollで拾う */ });
    window.addEventListener('gamepaddisconnected', function() { /* 次のpollで落とす */ });
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
    // ⚠1.718: **真エンディング中はポーズさせない**（監査で発見）。`pauseGame` は
    //   `isOutroInvulnerable()` で弾いているのに、割り込みポーズ（背景化・縦持ち）だけが素通りしていた。
    //   ここが開くと「エンディング中にリタイア」できてしまい、`confirmRetire` は resetGame へ直行して
    //   `exitUnderground()` を通らないので `undergroundState.ending` が次のランへ残る（無敵＋ポーズ不能）。
    //   resetGame 側でも落とすようにしたが、**そもそも開かせない**のが筋。
    if (typeof isOutroInvulnerable === 'function' && isOutroInvulnerable()) return;
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
    // ⚠1.634: しおり（中断セーブ）がある時は「さいしょから」＝確認ダイアログを挟む経路に変わる。
    //   セーブが無ければ startNewRunFromMenu はそのまま startGame() を呼ぶ＝従来と同じ挙動。
    bindTapButton(document.getElementById('menuStartButton'), function() { startNewRunFromMenu(); }, { stopClickPropagation: true });
    // つづきから（1.634）: セーブが無い時はボタン自体が非表示なので、押される経路は存在しない。
    //   それでも continueRunFromSave 側で loadRunState() を見て弾く（入口が増えても穴が開かないように）
    bindTapButton(document.getElementById('menuContinueButton'), function() { continueRunFromSave(); }, { stopClickPropagation: true });
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
