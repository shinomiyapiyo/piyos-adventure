// ── index.html 側で定義されているグローバルのうち、描画に要るものだけを用意する ──
// ⚠canvas / ctx は **core-state.js が const で宣言済み**（#gameCanvas から取る）。
//   ここで var 宣言すると SyntaxError でこのファイルが丸ごと実行されない（実際に踏んだ）。
//   なのでページ側に #gameCanvas を1枚置き、そこへ描いてから各パネルへコピーする。
var GROUND_Y = 348;
var frameSteps = 1;

function makeBoss(kind, x, y) {
    return { kind: kind, x: x, y: y, width: BOSS_WIDTH, height: BOSS_HEIGHT,
             hp: 60, animFrame: 0, spriteFrame: 0, facing: 'left',
             owlMode: 'hover', owlTimer: 0, darkness: 0, darkWant: 0,
             featherWarn: 0, featherCount: 0, featherSpan: 0 };
}

// 本番と同じ背景（BOSS_SKY のグラデ）＋地面＋ボス戦オーバーレイ
function drawStage(img) {
    var g = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    g.addColorStop(0, BOSS_SKY[0]); g.addColorStop(0.25, BOSS_SKY[1]);
    g.addColorStop(0.5, BOSS_SKY[2]); g.addColorStop(0.75, BOSS_SKY[3]);
    g.addColorStop(1, BOSS_SKY[4]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // 地面（夜のボスアリーナ相当の暗い土＋草の縁）
    ctx.fillStyle = '#241a30'; ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
    ctx.fillStyle = '#3a2a4c'; ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 6);
    // 足場（setupBossArena と同じ位置）
    ctx.fillStyle = '#2e2340';
    ctx.fillRect(60, GROUND_Y - 110, 130, 30);
    ctx.fillRect(GAME_WIDTH - 190, GROUND_Y - 120, 130, 30);
    ctx.fillRect(GAME_WIDTH / 2 - 55, GROUND_Y - 190, 110, 30);
    // ボス戦専用オーバーレイ（render() と同じ）
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = 'rgba(10,0,30,1)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.restore();
}

function drawPlayer(px, py) {
    var img = IMGS.player;
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, px, py, 48, 48);
    else { ctx.fillStyle = '#ffd84d'; ctx.fillRect(px, py, 48, 48); }
}
function drawBossImg(key, b) {
    var img = IMGS[key];
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, b.x, b.y, b.width, b.height);
    else { ctx.fillStyle = '#4a3a66'; ctx.fillRect(b.x, b.y, b.width, b.height); }
}

// 羽根弾を「撃った直後 n フレーム」の位置まで進めた状態にする（updateEggs と同じ式）
function advanceEggs(frames) {
    for (var f = 0; f < frames; f++) {
        for (var i = 0; i < bossState.eggs.length; i++) {
            var e = bossState.eggs[i];
            e.x += e.velX; e.velY += 0.15; e.y += e.velY; e.timer++;
        }
    }
}

// ⚠画像は data URI で埋め込む（tools/telegraph-preview-imgs.js）。
//   ブラウザペインだと ../images/*.png の読み込みが返ってこず、onload待ちで描画が始まらなかった。
//   さらに**描画は同期で1回やってから、画像が焼けたらもう一度描き直す**＝待ちに依存しない。
var IMGS = {};
function panel(id, fn) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.imageSmoothingEnabled = false;
    fn();                                             // 実物の描画コードは常に ctx(=#gameCanvas) に描く
    var out = document.getElementById(id).getContext('2d');
    out.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    out.drawImage(canvas, 0, 0);                      // 描き上がりをパネルへ転写
}

function drawAll() {
    gameState.camera.x = 0; gameState.camera.y = 0;
    player.width = 48; player.height = 48;

    // ── ① 闇のカラス ──────────────────────────────────────────
    var hawk = makeBoss('hawk', 380, GROUND_Y - BOSS_HEIGHT - 80);
    bossState.active = true; bossState.phase = 3; bossState.boss = hawk;
    bossState.arenaLeft = 30; bossState.arenaRight = GAME_WIDTH - 30;
    player.x = 300; player.y = GROUND_Y - 48;

    // 現状: 予告なしで撃たれ、弾が飛んでいる瞬間（発射から14フレーム後）
    panel('c1', function () {
        drawStage();
        bossState.eggs = [];
        spawnHawkFeathers(hawk, 9, Math.PI * 0.95);
        advanceEggs(26);
        drawBossImg('hawk', hawk);
        drawEggProjectiles();
        drawPlayer(player.x, player.y);
    });

    // 予告あり: 明るい瞬間 / 暗い瞬間（animFrame で点滅位相を作る）
    function hawkWarnPanel(warnLeft, animFrame) {
        return function () {
            drawStage();
            bossState.eggs = [];
            hawk.featherWarn = warnLeft; hawk.featherSpan = Math.PI * 0.95;
            hawk.animFrame = animFrame;
            hawk.spriteFrame = 3;
            drawBossImg('hawk', hawk);
            drawPlayer(player.x, player.y);
            drawHawkFeatherWarn(hawk);
        };
    }
    // 予告の開始直後（ゆっくり点滅）と、発射直前（残り12f未満＝倍速点滅）
    panel('c2', hawkWarnPanel(28, Math.round((Math.PI / 2) / 0.42)));
    panel('c3', hawkWarnPanel(6,  Math.round((Math.PI / 2) / 0.80)));

    // ── ② 闇のフクロウ ────────────────────────────────────────
    var owl = makeBoss('owl', 430, GROUND_Y - BOSS_HEIGHT - 70);
    bossState.boss = owl; bossState.eggs = [];
    owl.darkness = 0.98; owl.darkWant = 0.98;
    player.x = 170; player.y = GROUND_Y - 48;

    function owlPanel(mode, owlTimer, animFrame) {
        return function () {
            drawStage();
            owl.owlMode = mode; owl.owlTimer = owlTimer; owl.animFrame = animFrame;
            drawBossImg('owl', owl);
            drawPlayer(player.x, player.y);
            // いまの手がかり＝地面の衝撃波リング（floatEffect）。ワールド描画なので暗転の下になる
            EFFECT_RENDERERS.boss_shockwave({ worldY: GROUND_Y }, owl.x + owl.width / 2, 0.45);
            drawOwlDarkness(owl);
        };
    }
    // 現状（音波の予告なし＝暗転だけ。リングは暗転の下）
    panel('c4', owlPanel('hover', 0, 40));
    // 改善後（hoot 中＝新しい危険帯。着弾間際 owlTimer=16 の点滅の山/谷）
    // 予告の開始（owlTimer=32・薄くゆっくり）と、着弾の直前（owlTimer=10・濃く速い）
    panel('c5', owlPanel('hoot', 32, Math.round((Math.PI / 2) / 0.36)));
    panel('c6', owlPanel('hoot', 10, Math.round((Math.PI / 2) / 0.80)));
}

try {
    drawAll();                                   // まず画像なしで描く（絶対に空にしない）
    ['hawk', 'owl', 'player'].forEach(function (k) {
        var im = new Image();
        im.onload = function () { IMGS[k] = im; drawAll(); };   // 焼けたら描き直す
        im.src = IMG_DATA[k];
    });
} catch (e) {
    var dbg = document.createElement('pre');
    dbg.style.color = '#ff8a8a'; dbg.textContent = 'ERROR: ' + e.message + '\n' + e.stack;
    document.body.appendChild(dbg);
}

// ── 検証用の書き出し（?save=1 で開くと合成PNGを保存サーバへPOSTする・1.674） ──
// ⚠ブラウザペインのスクリーンショットはファイルとして残せないので、ページ側から吐き出す。
function exportSheet() {
    var W = 820, H = 450, cols = 3, pad = 14, capH = 54, headH = 96, secH = 34;
    var sheet = document.createElement('canvas');
    sheet.width = cols * W + pad * (cols + 1);
    sheet.height = headH + (secH + H + capH + pad) * 2 + pad;
    var s = sheet.getContext('2d');
    s.fillStyle = '#14121a'; s.fillRect(0, 0, sheet.width, sheet.height);
    s.fillStyle = '#ffffff'; s.font = 'bold 34px -apple-system, "Hiragino Sans", sans-serif';
    s.fillText('Ver.1.674「点滅予告」の見え方くらべ', pad, 44);
    s.fillStyle = '#a9a2bd'; s.font = '20px -apple-system, "Hiragino Sans", sans-serif';
    s.fillText('実物の描画コード(render.js)をそのまま呼んで描画。背景・暗転・弾の色も本番と同じ値。', pad, 78);
    var groups = [
        { title: '① 闇のカラス：羽根弾（真下へ扇状に撃つ）', color: '#ff6a6a', ids: ['c1', 'c2', 'c3'],
          caps: ['いまの状態：予告なしで即発射。弾は#2a1840＝ほぼ黒で\n背景に溶けて見えない',
                 '予告あり：撃つ0.53秒前から発射口が光り\n扇の向きを破線で示す（ゆっくり点滅）',
                 '発射直前：点滅が倍速になる\n＝「今きます」'] },
        { title: '② 闇のフクロウ：音波（地上にいると被弾＝ジャンプで回避）', color: '#ffcc44', ids: ['c4', 'c5', 'c6'],
          caps: ['いまの状態：手がかりは地面の衝撃波リングだけ\n暗転(0.98)の下に埋まって見えない',
                 '予告の開始：暗転の"上"に危険帯を描く\n全幅なのは判定が画面全体の地上だから',
                 '着弾の直前：濃く・速く点滅する\n帯の上端＝実際の判定ライン'] }
    ];
    var y = headH;
    for (var g = 0; g < groups.length; g++) {
        var gr = groups[g];
        s.fillStyle = gr.color; s.fillRect(pad, y + 4, 5, 24);
        s.fillStyle = '#ffffff'; s.font = 'bold 23px -apple-system, "Hiragino Sans", sans-serif';
        s.fillText(gr.title, pad + 14, y + 24);
        y += secH;
        for (var i = 0; i < 3; i++) {
            var x = pad + i * (W + pad);
            s.drawImage(document.getElementById(gr.ids[i]), x, y);
            s.strokeStyle = '#322c40'; s.lineWidth = 2; s.strokeRect(x, y, W, H);
            s.fillStyle = '#d6d0e6'; s.font = '19px -apple-system, "Hiragino Sans", sans-serif';
            var lines = gr.caps[i].split('\n');
            for (var l = 0; l < lines.length; l++) s.fillText(lines[l], x, y + H + 24 + l * 24);
        }
        y += H + capH + pad;
    }
    return sheet.toDataURL('image/png');
}

if (location.search.indexOf('save=1') >= 0) {
    setTimeout(function () {
        fetch('http://localhost:8125/save', { method: 'POST', body: exportSheet() })
            .then(function () { document.title = 'SAVED'; })
            .catch(function (e) { document.title = 'SAVE-ERR ' + e.message; });
    }, 600);   // 画像が焼けて drawAll が2度目を描くのを待つ
}
