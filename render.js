// ============================================================
// render.js — 描画レイヤー（index.html から分離 / Ver.1.332, Step1）
// 内容: drawPlayerAura・各種エフェクト描画・EFFECT_RENDERERS・Canvas HUDヘルパー・
//       ショップ建物描画・地面焼き付けキャッシュ・render()・updateUI()
// 依存: gameState/player/ctx/canvas/spriteManager 等のグローバルを実行時参照（index.html本体で定義）。
//       読み込み順は index.html 本体スクリプトの後（全グローバル定義後に評価される）。
// ============================================================
// ─── 描画 ───

// 描画パフォーマンス: グラデ/グローのキャッシュ（毎フレームの再生成/影処理を避ける・監査LOW）
var _auraShieldGrad = null; // シールドオーラの外側グロー（色停止は定数・半径はpulseで一様scale＝見た目一致）
var _flameEggGrad = null;   // 闇の炎弾の外側オーラ（中心均一・半径はflickerでscale）
var _glowBulletCache = {};  // 弾のグロー焼き込みスプライト（type×サイズ別に1度だけ生成）
// スプライトにグローを焼き込んだ offscreen canvas を返す。未ロード時は null（呼び出し側が従来の shadowBlur にフォールバック）。
function getGlowBulletSprite(name, w, h, glowColor, blur) {
    var frames = spriteManager.cache[name];
    if (!frames || !frames[0] || !frames[0].normal) return null;
    var key = name + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + glowColor + '|' + blur;
    var hit = _glowBulletCache[key];
    if (hit) return hit;
    var pad = Math.ceil(blur) + 2;
    function bake(src) {
        var cnv = document.createElement('canvas');
        cnv.width = Math.round(w) + pad * 2;
        cnv.height = Math.round(h) + pad * 2;
        var g = cnv.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.shadowColor = glowColor;
        g.shadowBlur = blur;
        g.drawImage(src, pad, pad, w, h);
        return cnv;
    }
    hit = { normal: bake(frames[0].normal), flipped: bake(frames[0].flipped), pad: pad };
    _glowBulletCache[key] = hit;
    return hit;
}

function drawPlayerAura(x, y, t) {
    var cx = x + player.width / 2, cy = y + player.height / 2;
    var pw = player.width, ph = player.height;

    if (gameState.puShield > 0) {
        // ─── シールド: 青い魔法陣オーラ ───
        var sr = Math.max(pw, ph) * 0.7;
        var pulse = 0.85 + Math.sin(t * 0.12) * 0.15;
        var r = sr * pulse;

        // 外側グロー（色停止は定数・内外半径とも pulse で一様に変わる＝原点に1度だけ生成し translate+scale で再利用。見た目一致・監査LOW）
        if (!_auraShieldGrad) {
            _auraShieldGrad = ctx.createRadialGradient(0, 0, sr * 0.5, 0, 0, sr * 1.3);
            _auraShieldGrad.addColorStop(0, 'rgba(65,105,225,0)');
            _auraShieldGrad.addColorStop(0.6, 'rgba(65,105,225,0.08)');
            _auraShieldGrad.addColorStop(0.85, 'rgba(100,149,237,0.2)');
            _auraShieldGrad.addColorStop(1, 'rgba(65,105,225,0)');
        }
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(pulse, pulse);
        ctx.fillStyle = _auraShieldGrad;
        ctx.beginPath(); ctx.arc(0, 0, sr * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // メインシールド円
        ctx.strokeStyle = 'rgba(100,149,237,' + (0.5 + Math.sin(t * 0.15) * 0.2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

        // 内側の回転リング
        ctx.strokeStyle = 'rgba(135,206,250,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.85, t * 0.05, t * 0.05 + Math.PI * 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.85, t * 0.05 + Math.PI, t * 0.05 + Math.PI * 2.2);
        ctx.stroke();

        // 回転パーティクル (小さな光の粒)
        for (var si = 0; si < 6; si++) {
            var sa = t * 0.04 + si * Math.PI / 3;
            var sd = r * (0.9 + Math.sin(t * 0.1 + si * 2) * 0.15);
            var sx = cx + Math.cos(sa) * sd;
            var sy = cy + Math.sin(sa) * sd;
            var ss = 2 + Math.sin(t * 0.2 + si) * 1;
            var salpha = 0.4 + Math.sin(t * 0.15 + si * 1.5) * 0.3;
            ctx.fillStyle = 'rgba(200,220,255,' + salpha + ')';
            ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI * 2); ctx.fill();
        }

        // 六角形の紋章 (ゆっくり回転)
        ctx.strokeStyle = 'rgba(100,149,237,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var hi = 0; hi < 6; hi++) {
            var ha = t * 0.02 + hi * Math.PI / 3;
            var hx = cx + Math.cos(ha) * r * 0.6;
            var hy = cy + Math.sin(ha) * r * 0.6;
            if (hi === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath(); ctx.stroke();
    }

    if (gameState.puLemon > 0) {
        // ─── ジャンプ強化: 緑の上昇オーラ + 風柱 + スパーク + 渦巻き ───
        var lr = Math.max(pw, ph) * 0.75;
        var lPulse = 0.85 + Math.sin(t * 0.12) * 0.15;

        // 大きな上昇グロー (緑〜黄色)
        var lGlow = ctx.createRadialGradient(cx, cy + 8, 0, cx, cy - 10, lr * 1.4 * lPulse);
        lGlow.addColorStop(0, 'rgba(120,255,80,0.22)');
        lGlow.addColorStop(0.4, 'rgba(180,255,60,0.12)');
        lGlow.addColorStop(0.8, 'rgba(255,255,100,0.05)');
        lGlow.addColorStop(1, 'rgba(255,255,0,0)');
        ctx.fillStyle = lGlow;
        ctx.beginPath(); ctx.arc(cx, cy, lr * 1.4 * lPulse, 0, Math.PI * 2); ctx.fill();

        // 風柱エフェクト (プレイヤーの下から上へ伸びる半透明の柱)
        var pillarW = pw * 0.7;
        var pillarH = ph * 1.8;
        var pillarY = y - pillarH * 0.3;
        var pillarGrad = ctx.createLinearGradient(cx, y + ph, cx, pillarY);
        pillarGrad.addColorStop(0, 'rgba(100,255,100,0.18)');
        pillarGrad.addColorStop(0.5, 'rgba(150,255,80,' + (0.08 + Math.sin(t * 0.1) * 0.04) + ')');
        pillarGrad.addColorStop(1, 'rgba(200,255,100,0)');
        ctx.fillStyle = pillarGrad;
        ctx.fillRect(cx - pillarW / 2, pillarY, pillarW, pillarH);

        // 上昇する風パーティクル (増量 + 大きめ)
        for (var li = 0; li < 14; li++) {
            var lt = (t * 3.5 + li * 37) % 140;
            var spread = pw * 0.55;
            var lx = cx - spread + ((li * 11.7) % (spread * 2));
            lx += Math.sin(t * 0.08 + li * 2.1) * 6;
            var ly = cy + ph * 0.5 - lt * 1.0;
            var lAlpha = lt < 25 ? lt / 25 : lt > 100 ? (140 - lt) / 40 : 1;
            lAlpha *= 0.65;
            var lSize = 2.0 + Math.sin(li + t * 0.12) * 1.2;
            // 緑〜黄色のグラデーションパーティクル
            var lc = li % 3 === 0 ? '120,255,80' : li % 3 === 1 ? '180,255,60' : '255,240,100';
            ctx.fillStyle = 'rgba(' + lc + ',' + lAlpha + ')';
            ctx.beginPath(); ctx.arc(lx, ly, lSize, 0, Math.PI * 2); ctx.fill();
        }

        // 渦巻きリング (プレイヤー周りを回転)
        ctx.strokeStyle = 'rgba(100,255,120,' + (0.25 + Math.sin(t * 0.1) * 0.1) + ')';
        ctx.lineWidth = 1.5;
        var vr1 = lr * 0.75;
        ctx.beginPath();
        ctx.arc(cx, cy, vr1, t * 0.06, t * 0.06 + Math.PI * 1.0);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(180,255,80,' + (0.2 + Math.sin(t * 0.14 + 1) * 0.1) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, vr1 * 0.85, -t * 0.04, -t * 0.04 + Math.PI * 0.8);
        ctx.stroke();

        // 回転スパークル (足元 + 周囲)
        for (var fi = 0; fi < 8; fi++) {
            var fa = t * 0.07 + fi * Math.PI / 4;
            var fd = pw * 0.35 + Math.sin(t * 0.1 + fi) * 8;
            var fx = cx + Math.cos(fa) * fd;
            var fy = y + ph - 4 + Math.sin(t * 0.18 + fi * 3) * 6;
            var fAlpha = 0.4 + Math.sin(t * 0.15 + fi * 2) * 0.25;
            ctx.fillStyle = 'rgba(120,255,80,' + fAlpha + ')';
            ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, Math.PI * 2); ctx.fill();
        }

        // 上方向に飛ぶスター
        for (var sti = 0; sti < 5; sti++) {
            var stTime = (t * 2.5 + sti * 60) % 150;
            var stx = cx - pw * 0.3 + ((sti * 19.3) % (pw * 0.6));
            stx += Math.sin(t * 0.06 + sti * 3) * 4;
            var sty = y + ph * 0.3 - stTime * 0.7;
            var stAlpha = stTime < 20 ? stTime / 20 : stTime > 110 ? (150 - stTime) / 40 : 1;
            stAlpha *= 0.6;
            if (stAlpha > 0.02) {
                var stSize = 3 + Math.sin(sti * 2 + t * 0.15) * 1;
                drawStar(stx, sty, stSize, stSize * 0.4, 4, 'rgba(200,255,100,' + stAlpha + ')');
            }
        }
    }

    if (gameState.puEnergy > 0) {
        // ─── エネルギー弾: 赤〜オレンジの炎オーラ ───
        var er = Math.max(pw, ph) * 0.7;
        var ePulse = 0.85 + Math.sin(t * 0.15) * 0.15;

        // 外側グロー (赤〜オレンジ)
        var eGlow = ctx.createRadialGradient(cx, cy, er * 0.2, cx, cy, er * 1.3 * ePulse);
        eGlow.addColorStop(0, 'rgba(255,100,0,0.18)');
        eGlow.addColorStop(0.4, 'rgba(255,60,20,0.1)');
        eGlow.addColorStop(0.75, 'rgba(255,140,40,0.06)');
        eGlow.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = eGlow;
        ctx.beginPath(); ctx.arc(cx, cy, er * 1.3 * ePulse, 0, Math.PI * 2); ctx.fill();

        // 内側のエネルギーリング (回転)
        ctx.strokeStyle = 'rgba(255,120,30,' + (0.45 + Math.sin(t * 0.12) * 0.2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, er * 0.8, t * 0.08, t * 0.08 + Math.PI * 1.1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,80,20,' + (0.35 + Math.sin(t * 0.16 + 1) * 0.15) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, er * 0.65, -t * 0.06, -t * 0.06 + Math.PI * 0.9);
        ctx.stroke();

        // 炎パーティクル (上昇)
        for (var ei = 0; ei < 12; ei++) {
            var et = (t * 3 + ei * 30) % 120;
            var eSpread = pw * 0.5;
            var ex = cx - eSpread + ((ei * 13.3) % (eSpread * 2));
            ex += Math.sin(t * 0.1 + ei * 1.7) * 5;
            var ey = cy + ph * 0.3 - et * 0.8;
            var eAlpha = et < 20 ? et / 20 : et > 85 ? (120 - et) / 35 : 1;
            eAlpha *= 0.6;
            var eSize = 2.0 + Math.sin(ei + t * 0.14) * 1.0;
            var ec = ei % 3 === 0 ? '255,100,20' : ei % 3 === 1 ? '255,160,40' : '255,200,80';
            ctx.fillStyle = 'rgba(' + ec + ',' + eAlpha + ')';
            ctx.beginPath(); ctx.arc(ex, ey, eSize, 0, Math.PI * 2); ctx.fill();
        }

        // 回転スパーク (周囲を回転)
        for (var esi = 0; esi < 6; esi++) {
            var esa = t * 0.09 + esi * Math.PI / 3;
            var esd = er * (0.85 + Math.sin(t * 0.12 + esi * 2) * 0.15);
            var esx = cx + Math.cos(esa) * esd;
            var esy = cy + Math.sin(esa) * esd;
            var ess = 2.5 + Math.sin(t * 0.2 + esi) * 1;
            var esAlpha = 0.5 + Math.sin(t * 0.18 + esi * 1.5) * 0.3;
            ctx.fillStyle = 'rgba(255,150,50,' + esAlpha + ')';
            ctx.beginPath(); ctx.arc(esx, esy, ess, 0, Math.PI * 2); ctx.fill();
        }

        // 十字エネルギー紋章 (ゆっくり回転)
        ctx.strokeStyle = 'rgba(255,120,40,0.25)';
        ctx.lineWidth = 1.5;
        for (var eci = 0; eci < 4; eci++) {
            var eca = t * 0.03 + eci * Math.PI / 2;
            var ecx1 = cx + Math.cos(eca) * er * 0.3;
            var ecy1 = cy + Math.sin(eca) * er * 0.3;
            var ecx2 = cx + Math.cos(eca) * er * 0.7;
            var ecy2 = cy + Math.sin(eca) * er * 0.7;
            ctx.beginPath(); ctx.moveTo(ecx1, ecy1); ctx.lineTo(ecx2, ecy2); ctx.stroke();
        }
    }

    if (gameState.puMagnet > 0) {
        // ─── マグネット: 紫の磁場オーラ ───
        var mr = Math.max(pw, ph) * 0.75;
        var mPulse = 0.85 + Math.sin(t * 0.12) * 0.15;

        // 外側グロー (紫〜マゼンタ)
        var mGlow = ctx.createRadialGradient(cx, cy, mr * 0.2, cx, cy, mr * 1.3 * mPulse);
        mGlow.addColorStop(0, 'rgba(180,60,255,0.15)');
        mGlow.addColorStop(0.4, 'rgba(140,40,220,0.1)');
        mGlow.addColorStop(0.75, 'rgba(200,80,255,0.05)');
        mGlow.addColorStop(1, 'rgba(160,40,255,0)');
        ctx.fillStyle = mGlow;
        ctx.beginPath(); ctx.arc(cx, cy, mr * 1.3 * mPulse, 0, Math.PI * 2); ctx.fill();

        // 楕円軌道リング (磁力線を表現)
        ctx.save();
        ctx.translate(cx, cy);
        for (var mi = 0; mi < 3; mi++) {
            var mAngle = t * 0.04 + mi * Math.PI * 2 / 3;
            ctx.save();
            ctx.rotate(mAngle);
            ctx.scale(1, 0.4);
            ctx.strokeStyle = 'rgba(180,100,255,' + (0.3 + Math.sin(t * 0.1 + mi * 2) * 0.15) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, mr * 0.9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

        // 引き寄せパーティクル (外側から内側へ収束)
        for (var mpi = 0; mpi < 10; mpi++) {
            var mpt = (t * 2.5 + mpi * 40) % 120;
            var mpAngle = mpi * Math.PI * 2 / 10 + t * 0.03;
            var mpDist = mr * 1.2 * (1 - mpt / 120); // 外から内へ
            var mpx = cx + Math.cos(mpAngle) * mpDist;
            var mpy = cy + Math.sin(mpAngle) * mpDist;
            var mpAlpha = mpt < 15 ? mpt / 15 : mpt > 90 ? (120 - mpt) / 30 : 1;
            mpAlpha *= 0.55;
            var mpSize = 1.5 + (mpt / 120) * 2; // 内側ほど大きく
            var mpc = mpi % 3 === 0 ? '200,100,255' : mpi % 3 === 1 ? '255,80,200' : '140,80,255';
            ctx.fillStyle = 'rgba(' + mpc + ',' + mpAlpha + ')';
            ctx.beginPath(); ctx.arc(mpx, mpy, mpSize, 0, Math.PI * 2); ctx.fill();
        }

        // 回転するN/S極マーク (小さな赤青ドット)
        for (var msi = 0; msi < 4; msi++) {
            var msa = t * 0.06 + msi * Math.PI / 2;
            var msd = mr * 0.7;
            var msx = cx + Math.cos(msa) * msd;
            var msy = cy + Math.sin(msa) * msd;
            var msAlpha = 0.4 + Math.sin(t * 0.15 + msi * 2) * 0.2;
            ctx.fillStyle = msi % 2 === 0
                ? 'rgba(255,50,80,' + msAlpha + ')'
                : 'rgba(60,100,255,' + msAlpha + ')';
            ctx.beginPath(); ctx.arc(msx, msy, 2.5, 0, Math.PI * 2); ctx.fill();
        }
    }
}

function drawInvincibleEffect(x, y, t) {
    // ─── 被ダメ無敵: 金色の残像 + 点滅 ───
    var cx = x + player.width / 2, cy = y + player.height / 2;
    var r = Math.max(player.width, player.height) * 0.55;
    var pulse = 0.8 + Math.sin(t * 0.25) * 0.2;

    // 金色グロー
    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
    glow.addColorStop(0, 'rgba(255,215,0,0.12)');
    glow.addColorStop(0.7, 'rgba(255,215,0,0.06)');
    glow.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2); ctx.fill();

    // 散る星パーティクル
    for (var i = 0; i < 5; i++) {
        var st = (t * 2 + i * 31) % 80;
        var sa = (i * 1.3 + t * 0.06);
        var sd = r * 0.3 + st * 0.4;
        var sx = cx + Math.cos(sa) * sd;
        var sy = cy + Math.sin(sa) * sd - st * 0.3;
        var sAlpha = st < 15 ? st / 15 : (80 - st) / 65;
        sAlpha *= 0.6;
        if (sAlpha > 0) {
            ctx.fillStyle = 'rgba(255,223,100,' + sAlpha + ')';
            // 星形
            drawStar(sx, sy, 2.5, 1, 4, 'rgba(255,223,100,' + sAlpha + ')');
        }
    }
}

function drawStar(cx, cy, outerR, innerR, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
        var a = i * Math.PI / points - Math.PI / 2;
        var r = i % 2 === 0 ? outerR : innerR;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
}

// ─── フロートエフェクトシステム ───
function spawnDamageEffect(worldX, worldY) {
    // -1 テキスト浮上
    floatEffects.push({
        type: 'damage_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 70,
        offsetY: 0
    });
    // 赤パーティクル散布
    for (var i = 0; i < 8; i++) {
        var angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        var speed = 1.5 + Math.random() * 2.5;
        floatEffects.push({
            type: 'damage_particle',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            timer: 0, duration: 30 + Math.floor(Math.random() * 15),
            size: 2.5 + Math.random() * 3
        });
    }
}

function spawnRevivalEffect(worldX, worldY, textKey) {
    // 復活テキスト浮上
    floatEffects.push({
        type: 'revival_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 90,
        offsetY: 0, textKey: textKey
    });
    // 金色パーティクル散布
    for (var i = 0; i < 12; i++) {
        var angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        var speed = 2 + Math.random() * 3;
        floatEffects.push({
            type: 'revival_particle',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            timer: 0, duration: 40 + Math.floor(Math.random() * 20),
            size: 2 + Math.random() * 3
        });
    }
}

function spawnExplosionEffect(worldX, worldY) {
    // 爆発リング (2重)
    floatEffects.push({
        type: 'explosion_ring',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 45
    });
    // 炎パーティクル散布
    for (var i = 0; i < 12; i++) {
        var angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        var speed = 2.5 + Math.random() * 3.5;
        floatEffects.push({
            type: 'explosion_particle',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.0,
            timer: 0, duration: 45 + Math.floor(Math.random() * 25),
            size: 3.5 + Math.random() * 4,
            hue: Math.floor(Math.random() * 40) + 15 // オレンジ〜黄色
        });
    }
    // フラッシュ (白い閃光)
    floatEffects.push({
        type: 'explosion_flash',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 18
    });
}

// 汎用ボーナステキスト（ニアミス/ノーダメ等）: ラベル＋加点をふわっと浮かせる（コンボの金系と区別する水色系）
function spawnBonusText(worldX, worldY, label, score) {
    floatEffects.push({
        type: 'bonus_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 70,
        label: label, score: score
    });
}

// クリティカル演出（黄色メイド服）: 金色の「クリティカル！」がポップ＋金色フラッシュリング＋スパーク放射（分かりやすく）
function spawnCritText(worldX, worldY, label) {
    floatEffects.push({
        type: 'crit_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 60,
        label: label
    });
    // 金色の衝撃リング（一気に広がって消える＝ヒットが分かりやすい）
    floatEffects.push({
        type: 'crit_ring',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 26
    });
    // 金色スパークの放射（combo_spark を金色で流用）
    for (var i = 0; i < 14; i++) {
        var angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        var speed = 3 + Math.random() * 2.5;
        floatEffects.push({
            type: 'combo_spark',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
            timer: 0, duration: 30 + Math.floor(Math.random() * 15),
            size: 2.5 + Math.random() * 2.5,
            hue: 45 + Math.floor(Math.random() * 12) // 金〜黄
        });
    }
}

function spawnComboEffect(worldX, worldY, count, score) {
    floatEffects.push({
        type: 'combo_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 75,
        offsetY: 0,
        comboCount: count,
        comboScore: score
    });
    // スパーク数: コンボ数に応じて増加（6→最大18）
    var sparkCount = Math.min(6 + count * 2, 18);
    var sparkSpeed = 2 + Math.min(count * 0.3, 2);
    for (var i = 0; i < sparkCount; i++) {
        var angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        var speed = sparkSpeed + Math.random() * 2;
        // コンボ数で色相変化: 金(40)→橙(25)→赤(0)
        var hue = Math.max(0, 40 - count * 3);
        floatEffects.push({
            type: 'combo_spark',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            timer: 0, duration: 35 + Math.floor(Math.random() * 15),
            size: 2 + Math.random() * 2.5,
            hue: hue + Math.floor(Math.random() * 10)
        });
    }
    // コンボリング（3コンボ以上）
    if (count >= 3) {
        floatEffects.push({
            type: 'combo_ring',
            worldX: worldX, worldY: worldY,
            timer: 0, duration: 30,
            comboCount: count
        });
    }
}

function spawnLifeUpEffect(worldX, worldY) {
    // テキスト浮上エフェクト
    floatEffects.push({
        type: 'lifeup_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 90,
        offsetY: 0
    });
    // ハート型パーティクル散布
    for (var i = 0; i < 12; i++) {
        var angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        var speed = 1.5 + Math.random() * 2.5;
        floatEffects.push({
            type: 'heart_particle',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.0,
            timer: 0, duration: 50 + Math.floor(Math.random() * 30),
            size: 3 + Math.random() * 4,
            hue: Math.floor(Math.random() * 40) + 330 // ピンク〜赤
        });
    }
    // リング拡大エフェクト
    floatEffects.push({
        type: 'lifeup_ring',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 40
    });
}

// ゴールデンエッグ取得演出（レア通貨＝ハートの LIFE UP! とは別物）:
// 金色「ゴールデンエッグ GET！」＋エッグアイコン＋金フラッシュ二重リング＋金スパーク放射＋時間差の星きらめき
function spawnGoldenEggEffect(worldX, worldY) {
    floatEffects.push({
        type: 'goldenegg_text',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 100
    });
    floatEffects.push({
        type: 'goldenegg_ring',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 45
    });
    // 金色スパークの放射（クリティカルより多め＝レア感）
    for (var i = 0; i < 18; i++) {
        var angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        var speed = 3 + Math.random() * 3;
        floatEffects.push({
            type: 'combo_spark',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            timer: 0, duration: 40 + Math.floor(Math.random() * 20),
            size: 2.5 + Math.random() * 3,
            hue: 42 + Math.floor(Math.random() * 14) // 金〜黄
        });
    }
    // 星のきらめき（周囲にランダム配置・timerを負にして時間差で点滅開始）
    for (var s = 0; s < 7; s++) {
        floatEffects.push({
            type: 'goldenegg_star',
            worldX: worldX + (Math.random() - 0.5) * 100,
            worldY: worldY + (Math.random() - 0.5) * 80,
            timer: -Math.floor(Math.random() * 30),
            duration: 28,
            size: 4 + Math.random() * 5
        });
    }
}

// 装甲/非露出ボスに弾かれた「キン」演出（卵の殻・大蛇の横這い中など）:
// ダメージ時の爆発(spawnExplosionEffect)とは色形を変え「効いていない」ことを伝える。
// 白銀の十字グリント＋小リング＋銀の火花（SEは呼び出し側で playProtect）
function spawnDeflectEffect(worldX, worldY) {
    floatEffects.push({
        type: 'deflect_glint',
        worldX: worldX, worldY: worldY,
        timer: 0, duration: 16
    });
    for (var i = 0; i < 6; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 2 + Math.random() * 2.5;
        floatEffects.push({
            type: 'deflect_spark',
            worldX: worldX, worldY: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.2, // やや上方向に飛散
            timer: 0, duration: 16 + Math.floor(Math.random() * 10),
            size: 1.5 + Math.random() * 1.5
        });
    }
}

// ─── エフェクト描画関数テーブル ───
// key: floatEffectsのtype / 値: 描画関数(ef, wx, progress)
// 新しいエフェクトを追加するときはここに1エントリ追加するだけでよい
var EFFECT_RENDERERS = {
    lifeup_text: function(ef, wx, progress) {
            // テキスト浮上 + フェードアウト + スケール
            ef.offsetY += 1.2 * frameSteps;
            var alpha = progress < 0.7 ? 1 : (1 - progress) / 0.3;
            var scale = progress < 0.15 ? 0.5 + progress / 0.15 * 0.5 : 1.0;
            var sy = ef.worldY - ef.offsetY;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(wx, sy);
            ctx.scale(scale, scale);
            // 外側グロー
            ctx.shadowColor = 'rgba(255,80,120,0.8)';
            ctx.shadowBlur = 14;
            ctx.font = "bold 22px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(t('hud_lifeup'), 0, 0);
            ctx.shadowBlur = 0;
            // ハートアイコン (テキスト両側)
            ctx.fillStyle = 'rgba(255,70,100,' + alpha + ')';
            drawHeart(ctx, -62, -2, 10);
            ctx.fillStyle = 'rgba(255,70,100,' + alpha + ')';
            drawHeart(ctx, 52, -2, 10);
            ctx.restore();
        },
    damage_text: function(ef, wx, progress) {
            // -1 テキスト浮上 + 赤グロー
            ef.offsetY += 1.0 * frameSteps;
            var da = progress < 0.6 ? 1 : (1 - progress) / 0.4;
            var ds = progress < 0.1 ? 0.5 + progress / 0.1 * 0.8 : (progress < 0.2 ? 1.3 - (progress - 0.1) / 0.1 * 0.3 : 1.0);
            var dy = ef.worldY - ef.offsetY;
            ctx.save();
            ctx.globalAlpha = da;
            ctx.translate(wx, dy);
            ctx.scale(ds, ds);
            ctx.shadowColor = 'rgba(255,0,0,0.9)';
            ctx.shadowBlur = 12;
            ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ff3333';
            ctx.fillText('-1', 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        },
    damage_particle: function(ef, wx, progress) {
            ef.worldX += ef.vx * frameSteps;
            ef.worldY += ef.vy * frameSteps;
            ef.vy += 0.07 * frameSteps;
            ef.vx *= Math.pow(0.97, frameSteps);
            var dpA = progress < 0.2 ? progress / 0.2 : (1 - progress) / 0.8;
            dpA *= 0.85;
            ctx.save();
            ctx.globalAlpha = dpA;
            ctx.fillStyle = 'rgba(255,' + Math.floor(30 + Math.random() * 40) + ',30,1)';
            ctx.beginPath();
            ctx.arc(ef.worldX, ef.worldY, ef.size * (1 - progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    // ── 復活テキスト ──
    revival_text: function(ef, wx, progress) {
            ef.offsetY += 0.8 * frameSteps;
            var ra = progress < 0.7 ? 1 : (1 - progress) / 0.3;
            var rs = progress < 0.1 ? 0.5 + progress / 0.1 * 0.8 : (progress < 0.25 ? 1.3 - (progress - 0.1) / 0.15 * 0.3 : 1.0);
            var ry = ef.worldY - ef.offsetY;
            ctx.save();
            ctx.globalAlpha = ra;
            ctx.translate(wx, ry);
            ctx.scale(rs, rs);
            ctx.shadowColor = 'rgba(255,215,0,0.9)';
            ctx.shadowBlur = 16;
            ctx.font = "bold 22px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(t(ef.textKey), 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        },
    // ── 復活パーティクル（金色） ──
    revival_particle: function(ef, wx, progress) {
            ef.worldX += ef.vx * frameSteps;
            ef.worldY += ef.vy * frameSteps;
            ef.vy += 0.05 * frameSteps;
            ef.vx *= Math.pow(0.97, frameSteps);
            var rpA = progress < 0.2 ? progress / 0.2 : (1 - progress) / 0.8;
            rpA *= 0.9;
            ctx.save();
            ctx.globalAlpha = rpA;
            // shadowBlur 撤去（監査M-5・モバイルで最も重い描画。復活演出の粒子も explosion と同様に glow なしで十分）。
            ctx.fillStyle = 'rgba(255,' + (200 + Math.floor(Math.random() * 55)) + ',0,1)';
            ctx.beginPath();
            ctx.arc(ef.worldX, ef.worldY, ef.size * (1 - progress * 0.4), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    heart_particle: function(ef, wx, progress) {
            ef.worldX += ef.vx * frameSteps;
            ef.worldY += ef.vy * frameSteps;
            ef.vy += 0.06 * frameSteps; // 軽い重力
            var pa = progress < 0.3 ? progress / 0.3 : (1 - progress) / 0.7;
            pa *= 0.85;
            ctx.save();
            ctx.globalAlpha = pa;
            var hsl = 'hsl(' + ef.hue + ',100%,65%)';
            ctx.fillStyle = hsl;
            drawHeart(ctx, ef.worldX, ef.worldY, ef.size);
            ctx.restore();
        },
    explosion_ring: function(ef, wx, progress) {
            var erAlpha = 1 - progress;
            var erR1 = 8 + progress * 55;
            ctx.save();
            ctx.globalAlpha = erAlpha * 0.9;
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 4 * (1 - progress);
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, erR1, 0, Math.PI * 2);
            ctx.stroke();
            if (progress > 0.1) {
                var erP2 = (progress - 0.1) / 0.9;
                ctx.globalAlpha = (1 - erP2) * 0.6;
                ctx.lineWidth = 3 * (1 - erP2);
                ctx.strokeStyle = '#ffcc44';
                ctx.beginPath();
                ctx.arc(wx, ef.worldY, 5 + erP2 * 42, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        },
    explosion_particle: function(ef, wx, progress) {
            ef.worldX += ef.vx * frameSteps;
            ef.worldY += ef.vy * frameSteps;
            ef.vy += 0.08 * frameSteps;
            ef.vx *= Math.pow(0.97, frameSteps);
            var epA = progress < 0.2 ? progress / 0.2 : (1 - progress) / 0.8;
            epA *= 0.9;
            ctx.save();
            ctx.globalAlpha = epA;
            // shadowBlur はモバイルで最も重い Canvas2D 描画。コンボ/ボス撃破時に大量の粒子×毎フレームで
            // フレーム落ちの主因だったため撤去（監査M-5）。フェードする小ドットに glow はほぼ見えない。
            ctx.fillStyle = 'hsl(' + ef.hue + ',100%,60%)';
            ctx.beginPath();
            ctx.arc(ef.worldX, ef.worldY, ef.size * (1 - progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    explosion_flash: function(ef, wx, progress) {
            var efA = 1 - progress;
            var efR = 8 + progress * 20;
            ctx.save();
            ctx.globalAlpha = efA * 0.6;
            var efGrad = ctx.createRadialGradient(wx, ef.worldY, 0, wx, ef.worldY, efR);
            efGrad.addColorStop(0, 'rgba(255,255,220,1)');
            efGrad.addColorStop(0.4, 'rgba(255,200,80,0.5)');
            efGrad.addColorStop(1, 'rgba(255,120,20,0)');
            ctx.fillStyle = efGrad;
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, efR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    lifeup_ring: function(ef, wx, progress) {
            var rAlpha = 1 - progress;
            var rRadius = 10 + progress * 60;
            ctx.save();
            ctx.globalAlpha = rAlpha * 0.6;
            ctx.strokeStyle = '#ff6090';
            ctx.lineWidth = 3 * (1 - progress);
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, rRadius, 0, Math.PI * 2);
            ctx.stroke();
            // 2つ目のリング（遅延）
            if (progress > 0.15) {
                var p2 = (progress - 0.15) / 0.85;
                ctx.globalAlpha = (1 - p2) * 0.4;
                ctx.lineWidth = 2 * (1 - p2);
                ctx.strokeStyle = '#ffaacc';
                ctx.beginPath();
                ctx.arc(wx, ef.worldY, 8 + p2 * 50, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        },
    combo_text: function(ef, wx, progress) {
            ef.offsetY += 1.5 * frameSteps;
            var ctAlpha = progress < 0.7 ? 1 : (1 - progress) / 0.3;
            var ctScale = progress < 0.1 ? 0.5 + progress / 0.1 * 0.5 : 1.0;
            // 高コンボでスケールをさらにポップさせる
            if (ef.comboCount >= 5) ctScale *= 1 + Math.sin(ef.timer * 0.4) * 0.08;
            var ctShake = ef.comboCount >= 5 ? Math.sin(ef.timer * 0.8) * (1 + ef.comboCount * 0.3) : 0;
            var ctY = ef.worldY - ef.offsetY;
            // 色エスカレーション: 金→橙→赤
            var ctHue = Math.max(0, 45 - ef.comboCount * 3);
            var ctColor = 'hsl(' + ctHue + ',100%,60%)';
            var ctGlow = 'hsla(' + ctHue + ',100%,50%,0.8)';
            ctx.save();
            ctx.globalAlpha = ctAlpha;
            ctx.translate(wx + ctShake, ctY);
            ctx.scale(ctScale, ctScale);
            ctx.shadowColor = ctGlow;
            ctx.shadowBlur = 12 + ef.comboCount;
            ctx.font = "bold " + Math.min(16 + ef.comboCount * 2, 36) + "px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = ctColor;
            // マイルストーンテキスト
            var comboLabel = ef.comboCount + ' COMBO!';
            if (ef.comboCount >= 15) comboLabel = ef.comboCount + ' COMBO! INSANE!';
            else if (ef.comboCount >= 10) comboLabel = ef.comboCount + ' COMBO! AMAZING!';
            else if (ef.comboCount >= 5) comboLabel = ef.comboCount + ' COMBO! GREAT!';
            ctx.fillText(comboLabel, 0, 0);
            ctx.shadowBlur = 0;
            ctx.font = "bold 12px 'DotGothic16', monospace";
            ctx.fillStyle = '#fff';
            ctx.fillText('+' + ef.comboScore, 0, 18);
            ctx.restore();
        },
    bonus_text: function(ef, wx, progress) {
            var btY = ef.worldY - progress * 34; // ゆっくり上昇
            var btAlpha = progress < 0.15 ? progress / 0.15 : (progress > 0.75 ? (1 - progress) / 0.25 : 1);
            var btScale = progress < 0.15 ? 0.6 + 0.4 * (progress / 0.15) : 1;
            ctx.save();
            ctx.globalAlpha = btAlpha;
            ctx.translate(wx, btY);
            ctx.scale(btScale, btScale);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(90,220,255,0.85)';
            ctx.shadowBlur = 10;
            ctx.font = "bold 15px 'M PLUS Rounded 1c', sans-serif";
            ctx.fillStyle = '#8ee7ff';
            ctx.fillText(ef.label, 0, 0);
            ctx.shadowBlur = 0;
            ctx.font = "bold 12px 'DotGothic16', monospace";
            ctx.fillStyle = '#fff';
            ctx.fillText('+' + ef.score, 0, 16);
            ctx.restore();
        },
        crit_text: function(ef, wx, progress) {
            var cy = ef.worldY - progress * 34;
            var alpha = progress < 0.12 ? progress / 0.12 : (progress > 0.72 ? (1 - progress) / 0.28 : 1);
            // 大きく弾む: 0.25まで 0.4→1.3、その後ゆっくり戻す
            var scale = progress < 0.25 ? 0.4 + 0.9 * (progress / 0.25) : 1.3 - (progress - 0.25) * 0.2;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(wx, cy);
            ctx.scale(scale, scale);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = "900 23px 'M PLUS Rounded 1c', sans-serif";
            ctx.lineWidth = 5; ctx.strokeStyle = '#7a1500';
            ctx.strokeText(ef.label, 0, 0);
            ctx.shadowColor = 'rgba(255,170,0,1)'; ctx.shadowBlur = 15;
            ctx.fillStyle = '#ffe24a';
            ctx.fillText(ef.label, 0, 0);
            ctx.restore();
        },
        goldenegg_text: function(ef, wx, progress) {
            var gy = ef.worldY - progress * 40;
            var alpha = progress < 0.1 ? progress / 0.1 : (progress > 0.75 ? (1 - progress) / 0.25 : 1);
            // 大きく弾んで着地→ゆるくキラキラ脈動
            var scale = progress < 0.2 ? 0.3 + 1.1 * (progress / 0.2) : 1.4 - (progress - 0.2) * 0.25;
            scale *= 1 + Math.sin(ef.timer * 0.35) * 0.04;
            var label = t('hud_goldenegg');
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = "900 24px 'M PLUS Rounded 1c', sans-serif";
            var half = ctx.measureText(label).width / 2;
            // 取得位置がプレイヤー(=画面左寄り)なので、文字全体(アイコン込み)が画面内に収まるようXをクランプ。
            // ⚠クランプ基準は座標系で切替: 本編=translate(-camera.x)内で描くためcamera.x基準／
            // 土管部屋=無変換の画面座標系のため基準0（camera.xは凍結された本編の値=数万pxでGETテキストが画面外に飛んでいた・1.504修正）
            var halfPx = (half + 40) * scale;
            var camL = pipeRoomState.active ? 0 : gameState.camera.x;
            var cx = Math.max(camL + halfPx,
                     Math.min(wx, camL + GAME_WIDTH - halfPx));
            ctx.translate(cx, gy);
            ctx.scale(scale, scale);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 6; ctx.strokeStyle = '#6b4a00';
            ctx.strokeText(label, 0, 0);
            ctx.shadowColor = 'rgba(255,200,0,1)'; ctx.shadowBlur = 16;
            ctx.fillStyle = '#ffd700';
            ctx.fillText(label, 0, 0);
            ctx.shadowBlur = 0;
            // 白いハイライトを重ねて金属感
            ctx.globalAlpha = alpha * 0.55;
            ctx.fillStyle = '#fff8d0';
            ctx.fillText(label, 0, -1);
            // 両側にゴールデンエッグのアイコン
            if (goldenEggImg.complete && goldenEggImg.naturalWidth) {
                ctx.globalAlpha = alpha;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(goldenEggImg, -half - 32, -13, 26, 26);
                ctx.drawImage(goldenEggImg, half + 6, -13, 26, 26);
            }
            ctx.restore();
        },
        goldenegg_ring: function(ef, wx, progress) {
            ctx.save();
            // 中心の金フラッシュ（出だしだけ）
            if (progress < 0.4) {
                var fa = (1 - progress / 0.4) * 0.7;
                var fr = 12 + progress * 60;
                var grad = ctx.createRadialGradient(wx, ef.worldY, 0, wx, ef.worldY, fr);
                grad.addColorStop(0, 'rgba(255,255,220,' + fa + ')');
                grad.addColorStop(0.5, 'rgba(255,215,0,' + (fa * 0.5) + ')');
                grad.addColorStop(1, 'rgba(255,180,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(wx, ef.worldY, fr, 0, Math.PI * 2);
                ctx.fill();
            }
            // 二重の金リング（2本目は遅延）
            ctx.globalAlpha = (1 - progress) * 0.9;
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 5 * (1 - progress) + 1;
            ctx.shadowColor = 'rgba(255,190,0,0.9)'; ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, 10 + progress * 75, 0, Math.PI * 2);
            ctx.stroke();
            if (progress > 0.2) {
                var p2 = (progress - 0.2) / 0.8;
                ctx.globalAlpha = (1 - p2) * 0.6;
                ctx.strokeStyle = '#fff0a0';
                ctx.lineWidth = 3 * (1 - p2);
                ctx.beginPath();
                ctx.arc(wx, ef.worldY, 8 + p2 * 58, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        },
        deflect_glint: function(ef, wx, progress) {
            var a = 1 - progress;
            var s = 6 + progress * 10;
            ctx.save();
            ctx.globalAlpha = a * 0.9;
            // 小さな白リング（すぐ消える＝軽い手応え）
            ctx.strokeStyle = '#e8f0ff';
            ctx.lineWidth = 2 * (1 - progress) + 0.5;
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, 3 + progress * 14, 0, Math.PI * 2);
            ctx.stroke();
            // 十字グリント（金属で「キン」と光る）
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(200,220,255,0.9)'; ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(wx, ef.worldY - s); ctx.lineTo(wx + s * 0.22, ef.worldY);
            ctx.lineTo(wx, ef.worldY + s); ctx.lineTo(wx - s * 0.22, ef.worldY);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(wx - s, ef.worldY); ctx.lineTo(wx, ef.worldY - s * 0.22);
            ctx.lineTo(wx + s, ef.worldY); ctx.lineTo(wx, ef.worldY + s * 0.22);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        },
        deflect_spark: function(ef, wx, progress) {
            ef.worldX += ef.vx * frameSteps;
            ef.worldY += ef.vy * frameSteps;
            ef.vy += 0.12 * frameSteps;
            ctx.save();
            ctx.globalAlpha = (1 - progress) * 0.9;
            ctx.fillStyle = '#dde8f5'; // 銀色（爆発の橙と差別化）
            ctx.beginPath();
            ctx.arc(ef.worldX, ef.worldY, ef.size * (1 - progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
        goldenegg_star: function(ef, wx, progress) {
            if (progress < 0) return; // 負timer=時間差待機中は描かない
            var sa = Math.sin(progress * Math.PI); // ふわっと出てふわっと消える
            var ss = ef.size * (0.5 + sa * 0.5);
            ctx.save();
            ctx.globalAlpha = sa * 0.95;
            ctx.fillStyle = '#fff8c0';
            ctx.shadowColor = 'rgba(255,215,0,0.9)'; ctx.shadowBlur = 8;
            // 縦横2枚のひし形でキラッと光る星
            ctx.beginPath();
            ctx.moveTo(wx, ef.worldY - ss);
            ctx.lineTo(wx + ss * 0.3, ef.worldY);
            ctx.lineTo(wx, ef.worldY + ss);
            ctx.lineTo(wx - ss * 0.3, ef.worldY);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(wx - ss, ef.worldY);
            ctx.lineTo(wx, ef.worldY - ss * 0.3);
            ctx.lineTo(wx + ss, ef.worldY);
            ctx.lineTo(wx, ef.worldY + ss * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        },
        crit_ring: function(ef, wx, progress) {
            var r = 8 + progress * 48;
            var a = (1 - progress) * 0.85;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.strokeStyle = '#ffe24a';
            ctx.lineWidth = 5 * (1 - progress) + 1;
            ctx.shadowColor = 'rgba(255,180,0,0.9)'; ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        },
    combo_spark: function(ef, wx, progress) {
            ef.worldX += ef.vx * frameSteps;
            ef.worldY += ef.vy * frameSteps;
            ef.vy += 0.06 * frameSteps;
            var csA = progress < 0.3 ? progress / 0.3 : (1 - progress) / 0.7;
            csA *= 0.8;
            var csHue = ef.hue !== undefined ? ef.hue : (40 + Math.floor(ef.size * 8));
            ctx.save();
            ctx.globalAlpha = csA;
            ctx.fillStyle = 'hsl(' + csHue + ',100%,60%)';
            ctx.beginPath();
            ctx.arc(ef.worldX, ef.worldY, ef.size * (1 - progress * 0.4), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
    // コンボリングエフェクト
    combo_ring: function(ef, wx, progress) {
            var crRadius = 10 + progress * (30 + ef.comboCount * 5);
            var crAlpha = (1 - progress) * 0.6;
            var crHue = Math.max(0, 45 - ef.comboCount * 3);
            ctx.save();
            ctx.globalAlpha = crAlpha;
            ctx.strokeStyle = 'hsl(' + crHue + ',100%,60%)';
            ctx.lineWidth = 2.5 * (1 - progress);
            ctx.beginPath();
            ctx.arc(wx, ef.worldY, crRadius, 0, Math.PI * 2);
            ctx.stroke();
            // 二重リング（高コンボ時）
            if (ef.comboCount >= 7) {
                ctx.globalAlpha = crAlpha * 0.5;
                ctx.strokeStyle = 'hsl(' + (crHue + 15) + ',100%,70%)';
                ctx.lineWidth = 1.5 * (1 - progress);
                ctx.beginPath();
                ctx.arc(wx, ef.worldY, crRadius * 0.7, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        },
    // ボス撃破テキスト（ワールド座標系）
    boss_defeated_text: function(ef, wx, progress) {
            ef.offsetY += 0.5 * frameSteps;
            var bdAlpha = progress < 0.8 ? 1 : (1 - progress) / 0.2;
            var bdScale = 1 + Math.sin(ef.timer * 0.1) * 0.05;
            ctx.save();
            ctx.globalAlpha = bdAlpha;
            ctx.translate(wx, ef.worldY - ef.offsetY);
            ctx.scale(bdScale, bdScale);
            ctx.font = "bold 36px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffd700';
            ctx.shadowColor = 'rgba(255,215,0,0.8)'; ctx.shadowBlur = 10;
            ctx.fillText(t('boss_defeated'), 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        },
    // ボスジャンプ着地衝撃波
    // 闇のカカシの召喚（1.558）: 湧いた雑魚の位置で紫黒の闇が弾ける＝「今ここに呼び出された」と分かる。
    // ⚠これが無いと、雑魚が音もなく画面に増えるだけで召喚に気づけない（ユーザー報告）。
    summon_burst: function(ef, wx, progress) {
            ctx.save();
            var r = 5 + progress * 26;
            ctx.globalAlpha = (1 - progress) * 0.8;
            ctx.fillStyle = '#3d1259';
            for (var i = 0; i < 7; i++) {                        // 外へ弾ける闇の粒（2pxグリッド＝ドット絵に馴染ませる）
                var a = (i / 7) * Math.PI * 2 + progress * 1.4;
                var s = Math.max(2, Math.round((8 - progress * 6) / 2) * 2);
                ctx.fillRect(Math.round((wx + Math.cos(a) * r) / 2) * 2,
                             Math.round((ef.worldY + Math.sin(a) * r * 0.55) / 2) * 2, s, s);
            }
            ctx.globalAlpha = (1 - progress) * 0.95;             // 中心の閃光
            ctx.fillStyle = '#c98cff';
            var cs = Math.max(2, Math.round((10 - progress * 8) / 2) * 2);
            ctx.fillRect(Math.round((wx - cs / 2) / 2) * 2, Math.round((ef.worldY - cs / 2) / 2) * 2, cs, cs);
            ctx.restore();
        },
    boss_shockwave: function(ef, wx, progress) {
            var swRadius = progress * 120;
            var swAlpha = (1 - progress) * 0.5;
            ctx.save();
            ctx.globalAlpha = swAlpha;
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 3 * (1 - progress);
            ctx.beginPath();
            ctx.ellipse(wx, ef.worldY, swRadius, swRadius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        },
    // 宝箱から出た在庫アイテムのアイコンを一瞬上へ見せる（ラッキーの間・1.452〜）
    chest_item: function(ef, wx, progress) {
            var img = roomItemImg[ef.itemId];
            var rise = progress * 24;
            var ciAlpha = progress < 0.65 ? 1 : (1 - progress) / 0.35;
            var sz = 36;
            ctx.save();
            ctx.globalAlpha = ciAlpha;
            if (img && img.complete && img.naturalWidth) {
                ctx.drawImage(img, wx - sz / 2, ef.worldY - rise - sz / 2, sz, sz);
            } else {
                ctx.fillStyle = '#88ccff'; ctx.fillRect(wx - sz / 2, ef.worldY - rise - sz / 2, sz, sz);
            }
            ctx.restore();
        },
    // 大当たり／超大当たりの金文字ポップ（ラッキーの間・1.453〜。ef.text は発行時に翻訳済み）
    lucky_label: function(ef, wx, progress) {
            ef.offsetY = (ef.offsetY || 0) + 0.5 * frameSteps;
            var llAlpha = progress < 0.75 ? 1 : (1 - progress) / 0.25;
            var pop = 1 + 0.7 * Math.max(0, 1 - progress / 0.12); // 序盤にポップ
            ctx.save();
            ctx.globalAlpha = llAlpha;
            ctx.translate(wx, ef.worldY - ef.offsetY);
            ctx.scale(pop, pop);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = "bold 26px 'M PLUS Rounded 1c', sans-serif";
            ctx.lineWidth = 5; ctx.strokeStyle = '#7a4a00'; ctx.strokeText(ef.text, 0, 0);
            ctx.shadowColor = 'rgba(255,200,40,0.9)'; ctx.shadowBlur = 14;
            ctx.fillStyle = '#ffe23a'; ctx.fillText(ef.text, 0, 0);
            ctx.restore();
        },
    // スコアテキスト（汎用、ボス撃破時も使用）
    score_text: function(ef, wx, progress) {
            ef.offsetY += 0.8 * frameSteps;
            var stAlpha = progress < 0.7 ? 1 : (1 - progress) / 0.3;
            ctx.save();
            ctx.globalAlpha = stAlpha;
            ctx.font = "bold 22px 'DotGothic16', monospace";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffee00';
            ctx.shadowColor = 'rgba(255,200,0,0.6)'; ctx.shadowBlur = 8;
            ctx.fillText('+' + ef.score, wx, ef.worldY - ef.offsetY);
            ctx.shadowBlur = 0;
            ctx.restore();
        }
};

// ─── はじまりの地（チュートリアル・biome4）専用の街パララックス ───
// 遠景: パステルカラーの家並み（0.15x）。家ごとに壁色/屋根色/高さを決め打ちでローテーション
var TOWN_HOUSES = [
    { w: 120, h: 78, wall: '#f0e2c8', roof: '#c86850', win: '#ffe9a0' },
    { w: 96,  h: 96, wall: '#e8d8e8', roof: '#7898b8', win: '#fff4c0' },
    { w: 132, h: 66, wall: '#f4e8d0', roof: '#88a868', win: '#ffe9a0' },
    { w: 104, h: 88, wall: '#f8e0cc', roof: '#c88848', win: '#fff4c0' },
    { w: 116, h: 72, wall: '#e0e8dc', roof: '#a87888', win: '#ffe9a0' }
];
// ─────────────────────────────────────────────────────────────
// 地底ステージの背景（1.542・SPEC_UNDERGROUND.md P2）
// 作り込みステージなので、単なる暗い塗りにせず4層のパララックスで奥行きを出す:
//   ①遠景の岩壁（0.10x）②奥の石柱＝城の遺構（0.18x）③天井の鍾乳石と床の石筍（0.30x）④底の溶岩の照り返し
// ⚠すべて手続き描画（既存の街=drawTownSkyline と同じ方式）＝画像アセットを増やさない。
//   ドット感を保つため座標は整数に丸め、色はバイオームのパレット系統に合わせる。
// ─────────────────────────────────────────────────────────────
function drawCaveBackdrop() {
    var camX = gameState.camera.x;
    var H = GAME_HEIGHT, W = GAME_WIDTH;

    // ── 縦パララックスと「深さ」（1.563・SPEC §11.4 の Hollow Knight らしさ④⑥）──
    // ⚠背景は translate の外＝ワールドの縦スクロールが効かないので、ここで camera.y を見て自分でずらす。
    // ⚠ずらし量は**必ず有界**にすること（camera.y をそのまま掛けると層が画面外へ飛んで隙間が空く）。
    //   depth = 0（王の廊下＝最上部）〜 1（回廊/尖塔の底）に正規化し、±1 の範囲でだけ動かす。
    var camY  = undergroundState.active ? gameState.camera.y : 0;
    var depth = (camY + 518) / 1344;                    // -518 = 最上部の camY / 826 = 最下部の camY
    if (depth < 0) depth = 0; else if (depth > 1) depth = 1;
    var vs = (depth - 0.5) * 2;                         // -1..+1
    // ⚠ずらすのは「隙間が出ない作りにした層」だけ（①遠景の稜線・②石柱のリング/目地）。
    //   ③の鍾乳石/石筍は額縁なので動かさない（1.564・上下移動で表示が壊れる報告への対応）。
    var vFar = -vs * 26, vPil = -vs * 46;                     // 奥ほど動かない＝距離感が出る

    // ① 遠景の岩壁（ゴツゴツした稜線を2段）
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#171225';
    var farW = 120;
    for (var f = -1; f < W / farW + 2; f++) {
        var fx = Math.floor(f * farW - (camX * 0.10) % farW);
        var fh = 54 + ((f % 3) * 16);
        // ⚠+400 は縦にずらした時に下端が浮かないための余白（見た目は変わらない＝下は必ず画面外）
        ctx.fillRect(fx, H - 150 - fh + vFar, farW, fh + 150 + 400);
        ctx.fillRect(fx + 12, H - 168 - fh + vFar, farW - 24, 20); // 出っ張り
    }
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#1f1830';
    var midW = 90;
    for (var m = -1; m < W / midW + 2; m++) {
        var mx = Math.floor(m * midW - (camX * 0.14) % midW);
        var mh = 40 + ((m % 4) * 13);
        ctx.fillRect(mx, H - 120 - mh + vFar, midW, mh + 120 + 400);
    }
    ctx.restore();

    // ② 奥の石柱（城の遺構・アーチ）
    // ⚠**柱の胴は画面いっぱいに通すこと**（1.564修正）。1.563は上端44/下端H-96の固定長で描いて全体を
    //   縦にずらしていたため、上下に動くと柱の端が画面内に入ってきて「柱が浮く・下が途切れる」状態になった
    //   （ユーザー報告「上下に移動すると背景の柱などの表示がおかしくなる」）。
    //   → 胴は常に画面外まで伸ばし、**柱頭/柱脚のリングと目地だけを縦に流す**。これなら隙間が原理的に出ず、
    //     「遺構の柱が縦にどこまでも続いている」＝Hollow Knight 的な深さの表現にもなる。
    ctx.save();
    ctx.globalAlpha = 0.5;
    var pilW = 34, pilGap = 210;
    var ringP = 260;                                     // 柱頭〜柱脚の1区画ぶんの高さ
    var ringOff = ((vPil % ringP) + ringP) % ringP;
    var jointOff = ((vPil % 22) + 22) % 22;
    for (var p = -1; p < W / pilGap + 2; p++) {
        var px = Math.floor(p * pilGap - (camX * 0.18) % pilGap);
        ctx.fillStyle = '#2a2140';
        ctx.fillRect(px, -30, pilW, H + 60);             // 胴（画面外まで）
        ctx.fillStyle = '#352a4e';                       // 明るい面（左）
        ctx.fillRect(px, -30, 7, H + 60);
        ctx.fillStyle = '#1d1730';                       // 目地（縦に流れる）
        for (var by = jointOff - 22; by < H + 22; by += 22) ctx.fillRect(px, by, pilW, 2);
        ctx.fillStyle = '#3c3058';                       // 柱頭・柱脚（区画の切れ目）
        for (var ry = ringOff - ringP; ry < H + ringP; ry += ringP) {
            ctx.fillRect(px - 6, ry, pilW + 12, 10);
            ctx.fillRect(px - 6, ry + ringP - 22, pilW + 12, 12);
        }
    }
    ctx.restore();

    // ③ 天井の鍾乳石／床の石筍
    ctx.save();
    ctx.globalAlpha = 0.85;
    // ⚠この層は**縦にずらさない**（1.564修正）。1.563は 0.30x 相当で縦にも動かしていたが、下へ降りると
    //   鍾乳石が画面上へ抜けて消え、代わりに埋め合わせの帯がベタ塗りの板として見えていた。
    //   鍾乳石/石筍は「今見ている空間の天井と床」を示す**額縁**なので、画面に固定するのが正しい。
    //   縦の深さは①遠景の稜線と②石柱のリング/目地が担当する（そちらは隙間が原理的に出ない作りにした）。
    var stW = 26, stGap = 78, stTop = 0;
    for (var s = -1; s < W / stGap + 2; s++) {
        var sx = Math.floor(s * stGap - (camX * 0.30) % stGap);
        var seed = ((s % 5) + 5) % 5;
        // 天井から垂れる鍾乳石（三角）
        var sh = 26 + seed * 11;
        ctx.fillStyle = '#241d38';
        ctx.beginPath();
        ctx.moveTo(sx, stTop); ctx.lineTo(sx + stW, stTop); ctx.lineTo(sx + stW / 2, stTop + sh);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#31284a';                       // 縁のハイライト
        ctx.beginPath();
        ctx.moveTo(sx + 3, stTop); ctx.lineTo(sx + 9, stTop); ctx.lineTo(sx + stW / 2 - 1, stTop + sh - 8);
        ctx.closePath(); ctx.fill();
        // 床から生える石筍（1つおき）
        if (seed % 2 === 0) {
            var gh = 18 + seed * 7, gy = H - 96;
            ctx.fillStyle = '#241d38';
            ctx.beginPath();
            ctx.moveTo(sx + 8, gy); ctx.lineTo(sx + stW + 4, gy); ctx.lineTo(sx + stW / 2 + 6, gy - gh);
            ctx.closePath(); ctx.fill();
        }
    }
    ctx.restore();

    // ④ 石柱の松明（城ステージらしい暖色のアクセント。⚠背景なので当たり判定は無い＝ただの飾り）
    ctx.save();
    for (var q = -1; q < W / pilGap + 2; q++) {
        // ⚠松明は石柱の**中央**に置く（1.561・ユーザー指定）。旧 `+ pilW + 4` は石柱の右端からさらに4px右＝
        //   柱にくっついていない位置だった。石柱は px..px+pilW なので中央は px + pilW/2。
        //   視差(0.18x)は石柱と同じ式なので、ずらしても常に同じ柱に乗り続ける。
        var qx = Math.floor(q * pilGap - (camX * 0.18) % pilGap) + Math.round(pilW / 2);
        var qy = 150 + vPil;   // ⚠石柱と同じ縦ずらし＝どの高さでも柱の上に乗り続ける（1.563）
        var flick = 0.75 + 0.25 * Math.sin(gameState.time * 0.25 + q * 2.1);
        // 受け皿
        ctx.fillStyle = '#3c3058';
        ctx.fillRect(qx - 3, qy, 6, 4);
        // 炎（2層＝外炎と芯）
        ctx.globalAlpha = 0.9 * flick;
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath();
        ctx.moveTo(qx - 4, qy); ctx.lineTo(qx + 4, qy); ctx.lineTo(qx, qy - 13 * flick);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe07a';
        ctx.beginPath();
        ctx.moveTo(qx - 2, qy); ctx.lineTo(qx + 2, qy); ctx.lineTo(qx, qy - 7 * flick);
        ctx.closePath(); ctx.fill();
        // 周囲へのぼんやりした光
        ctx.globalAlpha = 0.16 * flick;
        var tg = ctx.createRadialGradient(qx, qy - 6, 2, qx, qy - 6, 46);
        tg.addColorStop(0, 'rgba(255,170,70,1)');
        tg.addColorStop(1, 'rgba(255,140,50,0)');
        ctx.fillStyle = tg;
        ctx.beginPath(); ctx.arc(qx, qy - 6, 46, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // ⑤ 床の手前から立ちのぼる溶岩の照り返し（ゆっくり明滅＝生きている感じ）
    // ⚠地面より下は地形タイルで覆われるので、光は地面の“上”に置く。地底は縦カメラなので画面基準にする。
    // ⚠**深さで強さを変える**（1.563・SPEC の軸「登る＝報われる／降りる＝危険が増す」）:
    //   最上部(王の廊下)では赤がほぼ抜け、最下部(尖塔の底/回廊)で最も濃くなる。
    var pulse = (0.20 + 0.07 * Math.abs(Math.sin(gameState.time * 0.02))) * (0.30 + depth * 1.35);
    var glowTop = GAME_HEIGHT - 102 - 78, glowH = 78 + 102;
    var lg = ctx.createLinearGradient(0, glowTop, 0, glowTop + glowH);
    lg.addColorStop(0, 'rgba(255,120,40,0)');
    lg.addColorStop(1, 'rgba(255,110,30,' + pulse.toFixed(3) + ')');
    ctx.fillStyle = lg;
    ctx.fillRect(0, glowTop, W, glowH);

    // 天井から落ちる水滴（数点・地底の生活音的なアクセント）
    ctx.save();
    ctx.fillStyle = 'rgba(150,210,255,0.5)';
    for (var d = 0; d < 5; d++) {
        var dx = Math.floor((d * 173 - camX * 0.30) % (W + 120));
        if (dx < -10) dx += W + 120;
        var dy = ((gameState.time * 1.6 + d * 90) % (H - 120));
        ctx.fillRect(dx, Math.floor(dy), 2, 6);
    }
    ctx.restore();
}

function drawTownSkyline(alpha) {
    var baseY = GAME_HEIGHT - 74; // 山と同じ地平ライン
    var span = 760; // 5軒ぶんの繰り返し幅
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var hi = 0; hi < 12; hi++) {
        var spec = TOWN_HOUSES[hi % TOWN_HOUSES.length];
        var hx = ((hi * 152) % span - gameState.camera.x * 0.15) % span;
        if (hx < -spec.w) hx += span;
        if (hx > GAME_WIDTH) continue;
        var top = baseY - spec.h;
        // 壁
        ctx.fillStyle = spec.wall;
        ctx.fillRect(hx, top, spec.w, spec.h);
        // 屋根（三角）
        ctx.fillStyle = spec.roof;
        ctx.beginPath();
        ctx.moveTo(hx - 8, top);
        ctx.lineTo(hx + spec.w / 2, top - 34);
        ctx.lineTo(hx + spec.w + 8, top);
        ctx.closePath();
        ctx.fill();
        // 窓（2列）
        ctx.fillStyle = spec.win;
        for (var wy = top + 14; wy < baseY - 18; wy += 30) {
            ctx.fillRect(hx + 14, wy, 14, 14);
            ctx.fillRect(hx + spec.w - 28, wy, 14, 14);
        }
        // ドア
        ctx.fillStyle = spec.roof;
        ctx.fillRect(hx + spec.w / 2 - 9, baseY - 26, 18, 26);
    }
    ctx.restore();
}
// 中景: 街灯と生け垣（0.25x）
function drawTownStreet(alpha) {
    var baseY = GAME_HEIGHT - 45; // 木と同じ地平ライン
    var span = 1920;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var si = 0; si < 12; si++) {
        var sx = ((si * 160) % span - gameState.camera.x * 0.25) % span;
        if (sx < -70) sx += span;
        if (sx > GAME_WIDTH) continue;
        if (si % 2 === 0) {
            // 街灯: 支柱＋アーム＋やわらかい灯り
            ctx.fillStyle = '#5a5048';
            ctx.fillRect(sx, baseY - 88, 5, 88);
            ctx.fillRect(sx, baseY - 88, 22, 4);
            ctx.fillStyle = '#ffd870';
            ctx.fillRect(sx + 16, baseY - 86, 12, 12);
            ctx.globalAlpha = alpha * 0.35;
            ctx.beginPath();
            ctx.arc(sx + 22, baseY - 80, 20, 0, Math.PI * 2);
            ctx.fillStyle = '#ffe9a0';
            ctx.fill();
            ctx.globalAlpha = alpha;
        } else {
            // 生け垣
            ctx.fillStyle = '#88b868';
            ctx.beginPath();
            ctx.arc(sx + 16, baseY - 12, 16, Math.PI, 0);
            ctx.arc(sx + 44, baseY - 12, 16, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(sx, baseY - 12, 60, 12);
        }
    }
    ctx.restore();
}

function drawFloatEffects() {
    for (var i = floatEffects.length - 1; i >= 0; i--) {
        var ef = floatEffects[i];
        ef.timer += frameSteps;
        if (ef.timer > ef.duration) { floatEffects.splice(i, 1); continue; }
        var renderer = EFFECT_RENDERERS[ef.type];
        if (renderer) renderer(ef, ef.worldX, ef.timer / ef.duration);
    }
}

function drawHeart(c, cx, cy, size) {
    var s = size / 10;
    c.beginPath();
    c.moveTo(cx, cy + s * 3);
    c.bezierCurveTo(cx, cy - s * 2, cx - s * 10, cy - s * 2, cx - s * 10, cy + s * 2);
    c.bezierCurveTo(cx - s * 10, cy + s * 6, cx, cy + s * 10, cx, cy + s * 12);
    c.bezierCurveTo(cx, cy + s * 10, cx + s * 10, cy + s * 6, cx + s * 10, cy + s * 2);
    c.bezierCurveTo(cx + s * 10, cy - s * 2, cx, cy - s * 2, cx, cy + s * 3);
    c.closePath();
    c.fill();
}

// ─── Canvas HUD リッチ描画ヘルパー ───
function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawHudPanel(x, y, w, h, bgColor1, bgColor2, accentColor, glowColor) {
    ctx.save();
    // Glow shadow
    if (glowColor) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
    // Rounded rect gradient background
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, bgColor1);
    grad.addColorStop(1, bgColor2);
    ctx.fillStyle = grad;
    drawRoundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Border
    ctx.strokeStyle = accentColor || 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Top accent line
    if (accentColor) {
        var ag = ctx.createLinearGradient(x + 10, y, x + w - 10, y);
        ag.addColorStop(0, 'transparent');
        ag.addColorStop(0.3, accentColor);
        ag.addColorStop(0.7, accentColor);
        ag.addColorStop(1, 'transparent');
        ctx.strokeStyle = ag;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 1);
        ctx.lineTo(x + w - 10, y + 1);
        ctx.stroke();
    }
    // Inner highlight
    var hl = ctx.createLinearGradient(x, y, x, y + h * 0.4);
    hl.addColorStop(0, 'rgba(255,255,255,0.12)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    drawRoundRect(x + 1, y + 1, w - 2, h * 0.4, 9);
    ctx.fill();
    ctx.restore();
}

function drawProgressBar(x, y, w, h, ratio, color1, color2, bgColor) {
    ctx.save();
    // Background
    ctx.fillStyle = bgColor || 'rgba(0,0,0,0.4)';
    drawRoundRect(x, y, w, h, h / 2);
    ctx.fill();
    // Fill
    if (ratio > 0) {
        var fw = Math.max(h, w * ratio);
        var fg = ctx.createLinearGradient(x, y, x + fw, y);
        fg.addColorStop(0, color1);
        fg.addColorStop(1, color2);
        ctx.fillStyle = fg;
        drawRoundRect(x, y, fw, h, h / 2);
        ctx.fill();
        // Shine
        var sg = ctx.createLinearGradient(x, y, x, y + h * 0.5);
        sg.addColorStop(0, 'rgba(255,255,255,0.35)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg;
        drawRoundRect(x + 1, y + 1, fw - 2, h * 0.5, h / 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawPlayer(x, y) {
    ctx.save();
    var gt = gameState.time;

    // 被ダメ無敵: 赤点滅→金点滅
    if (gameState.isInvincible) {
        var blink = Math.sin(gt * 0.5) * 0.35 + 0.65;
        ctx.globalAlpha = blink;
        if (damageFlashTimer > 0) {
            // 被弾直後: 赤く点滅
            ctx.globalAlpha = Math.sin(gt * 1.2) > 0 ? 0.9 : 0.2;
        }
        drawInvincibleEffect(x, y, gt);
    }

    // パワーアップオーラ (スプライトの後ろに描画)
    if (gameState.puLemon > 0 || gameState.puShield > 0 || gameState.puEnergy > 0 || gameState.puMagnet > 0) {
        drawPlayerAura(x, y, gt);
    }

    var walk = gameState.input.left || gameState.input.right;
    var flipH = player.facing === 'left';
    var spriteName, frameIdx;

    var pose;
    if (!player.onGround && player.velY < 0) {
        pose = 'jump'; frameIdx = 0;
    } else if (!player.onGround && player.velY > 0) {
        pose = 'fall'; frameIdx = 0;
    } else if (walk) {
        pose = 'walk'; frameIdx = Math.floor(player.animFrame / 8) % 4;
    } else {
        pose = 'idle'; frameIdx = 0;
    }
    // 装備中スキンでスプライト解決（デフォルト=player_*、スキン=skin_<id>_*。sprites.js に同名登録が必要）
    // 【一時措置】SKIN_FEATURE_ENABLED が false の間は、activeSkin があっても
    // 未完成スキンを出さないよう必ずデフォルト見た目で描画する。
    // 未登録のスキンID（壊れたセーブ・sprites.js登録漏れ）はポーズ単位でデフォルトへフォールバック（透明プレイヤー防止）。
    // 判定は spriteManager.cache（IMAGE_SPRITES はロード完了後に null 解放されるため使わない）
    var runSkin = runActiveSkin(); // チュートリアル中はデフォルト（サンドボックス）
    // 侍ぴよ 急降下斬り(1.512): 降下攻撃中は専用ポーズに差し替え（dive登録済みスキンのみ・他スキンは通常のfallのまま）
    if (player.samuraiDive && runSkin && spriteManager.cache['skin_' + runSkin + '_dive']) pose = 'dive';
    var skinKey = 'skin_' + runSkin + '_' + pose;
    spriteName = (SKIN_FEATURE_ENABLED && runSkin && spriteManager.cache[skinKey]) ? skinKey : 'player_' + pose;

    spriteManager.draw(ctx, spriteName, frameIdx, x, y, player.width, player.height, flipH);
    player.animFrame += frameSteps;
    ctx.restore();
}

// ─── ショップ建物描画 ───
// ショップ建物画像のプリロード
var shopBuildingImg = new Image();
shopBuildingImg.src = 'images/shop.png';

function drawShopBuilding() {
    if (!shopState.buildingPlaced) return;
    var screenX = shopState.buildingX - gameState.camera.x;
    if (screenX < -200 || screenX > GAME_WIDTH + 200) return; // 画面外チェック

    // shop.png（700x508）を180x131に縮小して地面に配置
    var bw = 180, bh = 131;
    var bx = shopState.buildingX, by = GROUND_Y - bh; // ワールド座標（ctx.translate適用済み）

    ctx.save();
    if (shopBuildingImg.complete && shopBuildingImg.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false; // ピクセルアート感を保持
        ctx.drawImage(shopBuildingImg, bx, by, bw, bh);
    }

    // 入店プロンプト（未訪問 & ドア近く）
    if (!shopState.visited && !shopState.active) {
        var playerCX = player.x + player.width / 2;
        var doorCX = shopState.buildingX + bw / 2;
        if (Math.abs(playerCX - doorCX) < 80 && player.onGround) {
            var bounce = Math.sin(gameState.time * 0.08) * 3;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px DotGothic16, monospace';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 4;
            ctx.fillText(t('shop_swipe_up'), bx + bw / 2, by - 8 + bounce);
            ctx.shadowBlur = 0;
        }
    }
    // 訪問済み表示
    if (shopState.visited && !shopState.active) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 9px DotGothic16, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 3;
        ctx.fillText('CLOSED', bx + bw / 2, by - 4);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

// ─── 地面タイルの焼き付けキャッシュ ───
// 地面は毎フレーム34pxタイルを敷き詰めて描画していた（1ブロック約12枚 × 画面内十数ブロック
// ＝毎フレーム約170 drawImage）。(type, 列数, 土の行数) が同じブロックは描画結果が完全に同一なので、
// 初回だけオフスクリーンcanvasへ焼き付け、以降は完成画像を1枚blitするだけにする。
// → 地面のdrawImage回数を約9割削減。見た目は1ピクセルも変わらない。
// 高台(elev)は連続ランダム高さだが、キーを (type,列,行) にするため行数は離散＝キャッシュは数件で頭打ち。
var terrainCache = {};

function getTerrainCache(type, width, height) {
    var TILE = 34, GRASS_OFFSET = 5;
    var caveFillKey = (typeof undergroundState !== 'undefined' && undergroundState.active);
    // 元のdrawTerrainと同一条件で列数・土の行数を算出（高さが連続値でも行数は離散になる）
    var cols = 0;
    for (var xx = 0; xx < width; xx += TILE) cols++;
    var rows = 0;
    for (var yy = TILE; yy < height + GRASS_OFFSET; yy += TILE) rows++;

    var key = type + '_' + cols + '_' + rows + (caveFillKey ? '_ug' : '');
    if (terrainCache[key]) return terrainCache[key];

    var topTile;
    // 地底ステージ（1.542）: 洞窟の岩肌タイルに差し替える。type は 'ground'/'elevated' のままなので
    // 物理（当たり判定・滑り等）は地上と完全に同じ＝見た目だけを洞窟にする。
    var caveFill = (typeof undergroundState !== 'undefined' && undergroundState.active);
    switch (type) {
        case 'elevated':           topTile = caveFill ? 'terrain_cave_brick' : 'terrain_elevated_top'; break;
        case 'quicksand':          topTile = 'terrain_quicksand'; break;
        case 'quicksand_elevated': topTile = 'terrain_quicksand'; break;
        case 'ice':                topTile = 'terrain_ice'; break;
        case 'ice_elevated':       topTile = 'terrain_ice'; break;
        default:                   topTile = caveFill ? 'terrain_cave_top' : 'terrain_grass_top'; break;
    }

    var cv = document.createElement('canvas');
    cv.width = cols * TILE;
    cv.height = (rows + 1) * TILE; // 上段1行 + 土rows行
    var cc = cv.getContext('2d');
    cc.imageSmoothingEnabled = false; // 元描画と同じニアレストネイバー

    // 上段（草/氷/流砂/高台）: localY = 0
    for (var lx = 0; lx < width; lx += TILE) {
        spriteManager.draw(cc, topTile, 0, lx, 0, TILE, TILE, false);
    }
    // 土: localY = TILE, 2*TILE, ...（元ループと同じ行数）
    for (var ly = TILE, r = 0; r < rows; ly += TILE, r++) {
        for (var lx2 = 0; lx2 < width; lx2 += TILE) {
            spriteManager.draw(cc, caveFill ? 'terrain_cave_dirt' : 'terrain_dirt', 0, lx2, ly, TILE, TILE, false);
        }
    }

    terrainCache[key] = cv;
    return cv;
}

// ─── 地底（P2-b・1.563）の地形タイル ───
// ⚠地上の getTerrainCache は使えない。あちらは TILE=34 で「高さ+1行ぶん」余分に焼くので、
//   ブロックの下へ約32pxはみ出す（地上の地面は下がずっと土なので見えないだけ）。地底は空中に
//   ブロックを置くので、はみ出した土が宙に浮いて見えてしまう。→ **32pxちょうど**で敷き直す。
// ⚠メモリ対策: 矩形まるごとを焼くと 4000×96 のような巨大キャッシュが何十枚もできる。
//   **幅1タイルの縦帯**だけ焼いて横に並べる＝キャッシュは (種類×行数) の数十枚・各32px幅で済む。
var caveStripCache = {};
function getCaveStrip(type, rows) {
    var key = type + '_' + rows;
    if (caveStripCache[key]) return caveStripCache[key];
    var cv = document.createElement('canvas');
    cv.width = UG_TILE; cv.height = rows * UG_TILE;
    var cc = cv.getContext('2d');
    cc.imageSmoothingEnabled = false;
    for (var r = 0; r < rows; r++) {
        // 石積み(elevated)は全段が石材＝城の壁/遺構。岩(ground)は上段だけ岩肌で、下は洞窟の内部。
        var tile = (type === 'elevated') ? 'terrain_cave_brick'
                 : (r === 0 ? 'terrain_cave_top' : 'terrain_cave_dirt');
        spriteManager.draw(cc, tile, 0, 0, r * UG_TILE, UG_TILE, UG_TILE, false);
    }
    caveStripCache[key] = cv;
    return cv;
}
function drawCaveBlock(t) {
    var camY = gameState.camera.y;
    if (t.y > camY + GAME_HEIGHT || t.y + t.height < camY) return;   // 縦のカリング（塔の壁は画面外が長い）
    var rows = Math.round(t.height / UG_TILE);
    if (rows < 1) return;
    var strip = getCaveStrip(t.type === 'elevated' ? 'elevated' : 'ground', rows);
    var camX = gameState.camera.x;
    var x0 = t.x, x1 = t.x + t.width;
    if (x0 < camX - UG_TILE) x0 = t.x + Math.floor((camX - UG_TILE - t.x) / UG_TILE) * UG_TILE;
    if (x1 > camX + GAME_WIDTH + UG_TILE) x1 = camX + GAME_WIDTH + UG_TILE;
    for (var x = x0; x < x1; x += UG_TILE) ctx.drawImage(strip, x, t.y);
}

function drawTerrain(t) {
    if (t.type === 'hole') return;
    if (t.ugTile) { drawCaveBlock(t); return; }   // 地底は32pxぴったりの専用描画（1.563）
    // 焼き付け済みの地面画像を1枚blitするだけ（原点 = 元コードの (t.x, t.y - GRASS_OFFSET)）
    ctx.drawImage(getTerrainCache(t.type, t.width, t.height), t.x, t.y - 5);
}

// ─── 地底ギミックの描画（1.563・当たり判定は gameplay.js の updateUndergroundHazards が正） ───

// 溶岩の池: 明滅する面＋ゆっくり上下する波＋気泡。⚠見た目の面(y)と当たり判定の面を必ず一致させる
function drawUndergroundLava(camL, camR) {
    var lv = undergroundState.lava, camY = gameState.camera.y;
    for (var i = 0; i < lv.length; i++) {
        var L = lv[i];
        if (L.x + L.width < camL || L.x > camR) continue;
        if (L.y > camY + GAME_HEIGHT || L.y + L.height < camY) continue;
        var g = ctx.createLinearGradient(0, L.y, 0, L.y + L.height);
        g.addColorStop(0, '#ffcf5a');
        g.addColorStop(0.18, '#ff8a1e');
        g.addColorStop(1, '#8c1c06');
        ctx.fillStyle = g;
        ctx.fillRect(L.x, L.y, L.width, L.height);
        // 表面の波（2pxグリッドに丸めてドット絵の粒に揃える）
        ctx.fillStyle = '#ffe9a8';
        for (var wx = L.x; wx < L.x + L.width; wx += 8) {
            var wy = L.y + Math.round(Math.sin(gameState.time * 0.06 + wx * 0.05) * 2) - 2;
            ctx.fillRect(Math.round(wx / 2) * 2, Math.round(wy / 2) * 2, 6, 4);
        }
        // 気泡（乱数を使わず time と位置から出す＝毎フレーム跳ねない）
        ctx.save();
        for (var b = 0; b < Math.max(1, Math.floor(L.width / 96)); b++) {
            var ph = (gameState.time * 0.7 + b * 53) % 100;
            var bx = L.x + 24 + b * 96 + Math.sin(b * 2.3) * 10;
            if (bx > L.x + L.width - 8) continue;
            ctx.globalAlpha = 0.75 * (1 - ph / 100);
            ctx.fillStyle = '#ffd98a';
            ctx.fillRect(Math.round(bx / 2) * 2, Math.round((L.y + 6 - ph * 0.16) / 2) * 2, 4, 4);
        }
        ctx.restore();
    }
}

// トゲ床 / ファイアバー / 火の玉
function drawUndergroundHazards(camL, camR) {
    var ug = undergroundState, camY = gameState.camera.y, i, j;

    // ── トゲ床: 石の台座＋鉄のトゲ（3本/タイル）。⚠当たりは下側 UG_SPIKE_H だけ＝見た目より寛容 ──
    for (i = 0; i < ug.spikes.length; i++) {
        var sp = ug.spikes[i];
        if (sp.x + sp.w < camL || sp.x > camR) continue;
        if (sp.y > camY + GAME_HEIGHT || sp.y + UG_TILE < camY) continue;
        var baseY = sp.y + UG_SPIKE_H;
        ctx.fillStyle = '#39304a';
        ctx.fillRect(sp.x, baseY - 4, sp.w, 6);
        // ⚠三角は**当たり判定(UG_SPIKE_INSET)より内側**に描く＝「絵に触れたら当たる」で、絵の手前では当たらない。
        //   1タイルあたり3本。結合された幅(sp.w)ぶん繰り返す。
        var spikeN = Math.max(1, Math.round(sp.w / UG_TILE) * 3);
        for (j = 0; j < spikeN; j++) {
            var tx = sp.x + UG_SPIKE_INSET + 1 + j * ((sp.w - UG_SPIKE_INSET * 2 - 8) / Math.max(1, spikeN - 1));
            ctx.fillStyle = '#c8ccd8';
            ctx.beginPath();
            ctx.moveTo(tx, baseY - 3); ctx.lineTo(tx + 8, baseY - 3); ctx.lineTo(tx + 4, baseY - 3 - UG_SPIKE_H);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#7e8496';                    // 右側に陰＝立体に見せる
            ctx.beginPath();
            ctx.moveTo(tx + 4, baseY - 3); ctx.lineTo(tx + 8, baseY - 3); ctx.lineTo(tx + 4, baseY - 3 - UG_SPIKE_H);
            ctx.closePath(); ctx.fill();
        }
    }

    // ── ファイアバー: 支点の石＋炎セグメント。回転は updateUndergroundHazards が進める ──
    for (i = 0; i < ug.fireBars.length; i++) {
        var fb = ug.fireBars[i];
        var reach = fb.len * UG_FIREBAR_SEG + 20;
        if (fb.x + reach < camL || fb.x - reach > camR) continue;
        if (fb.y - reach > camY + GAME_HEIGHT || fb.y + reach < camY) continue;
        ctx.save();
        ctx.fillStyle = '#4a3f5c';                        // 支点（石のハブ）
        ctx.fillRect(fb.x - 7, fb.y - 7, 14, 14);
        ctx.fillStyle = '#6b5c82';
        ctx.fillRect(fb.x - 5, fb.y - 5, 10, 4);
        for (j = 1; j <= fb.len; j++) {
            var sg = j * UG_FIREBAR_SEG;
            var sx = fb.x + Math.cos(fb.ang) * sg, sy = fb.y + Math.sin(fb.ang) * sg;
            var fl = 1 + Math.sin(gameState.time * 0.3 + j) * 0.12;   // 揺らぎ
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ff7a1e';
            ctx.beginPath(); ctx.arc(sx, sy, UG_FIREBAR_R * 1.7 * fl, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ff9a2e';
            ctx.beginPath(); ctx.arc(sx, sy, UG_FIREBAR_R * fl, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffe07a';
            ctx.beginPath(); ctx.arc(sx, sy, UG_FIREBAR_R * 0.5 * fl, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    // ── 火の玉: 上がっている間だけ描く。尾を引かせて軌道（＝次に落ちる位置）を読ませる ──
    for (i = 0; i < ug.fireballs.length; i++) {
        var fl2 = ug.fireballs[i];
        if (!fl2.live) continue;
        if (fl2.x < camL || fl2.x > camR) continue;
        if (fl2.cy > camY + GAME_HEIGHT || fl2.cy < camY - 60) continue;
        ctx.save();
        for (j = 3; j >= 1; j--) {                        // 尾（過去位置を近似で置く）
            ctx.globalAlpha = 0.16 * j;
            ctx.fillStyle = '#ff7a1e';
            ctx.beginPath(); ctx.arc(fl2.x, fl2.cy - fl2.vy * j * 1.6, UG_FIREBALL_R * (1 - j * 0.16), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath(); ctx.arc(fl2.x, fl2.cy, UG_FIREBALL_R * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffa63c';
        ctx.beginPath(); ctx.arc(fl2.x, fl2.cy, UG_FIREBALL_R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff0b0';
        ctx.beginPath(); ctx.arc(fl2.x - 2, fl2.cy - 3, UG_FIREBALL_R * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// 地底への入場土管（1.549）。本体は sprites.js の buildUndergroundPipe（66x50のドット絵）を2倍で描く。
// ⚠1.546〜1.548は楕円＋グラデーションのベクタ描画だったが「イラレで雑に描いたように見える／土管だけ浮く」
//   というユーザー指摘により、地形タイルと同じドット絵システム(16色パレット＋ディザ)へ全面的に描き直した。
//   ここに残すのは**アニメーションする飾りだけ**（グロー/溶岩の明滅/火の粉）。それらも2pxグリッドに丸めて粒を揃える。
// ⚠幾何の原則:「一番広い部分（リップ＝乗る面）の幅を p.width ちょうどにし、下端を p.y+p.height（＝GROUND_Y）
//   にぴったり置く」。スプライト側も同じ約束で描いてあるので、当たり判定と見た目が常に一致し地面から浮かない。
// ⚠口の楕円の縦半径は UG_PIPE_MOUTH_RY 1つで決まる（スプライトの口＝中心y6/縦半径6 の2倍）。沈む演出のクリップも同じ定数。
function drawUndergroundPipe(p) {
    // ⚠描画原点は当たり判定の上面より UG_PIPE_MOUTH_RY ぶん**上**（1.559）。当たり判定の上面は
    //   「口の楕円の中心」に置いてあり（＝プレイヤーが口の中に立って見える）、スプライトの最上端は
    //   楕円の奥側の縁だから。サイズは判定用に詰めた p.width/p.height ではなく定数を使う。
    var x = p.x, w = UG_PIPE_W, h = UG_PIPE_H;
    var y = p.y - UG_PIPE_MOUTH_RY;
    var cx = x + w / 2, bottom = y + h;
    // せり上がり中（1.554）: 地面より下は「まだ地中」なので描かない＝地面から生えてくるように見える。
    // ⚠プラットフォームは地形より**後**に描かれるので、クリップしないと地中部分が地面の上に見えてしまう。
    var rising = undergroundState.pipeRise < UG_PIPE_RISE_FRAMES;
    if (rising) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 60, GROUND_Y - 2000, w + 120, 2000);   // 地面から上だけ
        ctx.clip();
    }

    // 誘目グロー（脈動）＝「ここが入口」の特別感。⚠ドット絵の後ろに敷く（上に乗せると絵がにじむ）
    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.18 + Math.sin(gameState.time * 0.09) * 0.09);
    var rg = ctx.createRadialGradient(cx, y + h * 0.35, 6, cx, y + h * 0.35, w);
    rg.addColorStop(0, 'rgba(255,90,60,0.9)'); rg.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - w, y - h * 0.5, w * 2, h * 1.8);
    ctx.restore();
    // 接地影（ドットに合わせて矩形2段・楕円にするとここだけ滑らかになって浮く）
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + 6, bottom, w - 12, 4);
    ctx.fillRect(x + 16, bottom + 4, w - 32, 2);

    // 本体＝ドット絵スプライト（sprites.js の buildUndergroundPipe・66x50を2倍で描く）。
    // ⚠imageSmoothingEnabled=false でニアレストネイバー＝拡大してもドットの角が残る。
    ctx.imageSmoothingEnabled = false;
    spriteManager.draw(ctx, 'pipe_underground', 0, x, y, w, h, false);

    // 口の奥の明滅（溶岩の照り返し）。⚠2pxグリッドに丸めてドット絵と粒を揃える
    var lit = 0.22 + Math.sin(gameState.time * 0.13) * 0.16;
    if (lit > 0) {
        ctx.save();
        ctx.globalAlpha = lit;
        ctx.fillStyle = '#ff9a3c';
        var lw = Math.round(w * 0.30 / 2) * 2, lh = 6;
        ctx.fillRect(Math.round((cx - lw / 2) / 2) * 2, Math.round((y + 14) / 2) * 2, lw, lh);
        ctx.restore();
    }

    // 口から立ちのぼる火の粉（飾り・当たり判定なし）。乱数を使わず time 基準＝毎フレーム跳ばない。
    // ⚠2x2pxの矩形を2pxグリッドに丸める＝スプライトのドットと同じ粒に見える
    ctx.save();
    for (var i = 0; i < 5; i++) {
        var ph = (gameState.time * 0.9 + i * 37) % 100;
        ctx.globalAlpha = Math.max(0, 0.8 * (1 - ph / 100));
        ctx.fillStyle = (i % 2) ? '#ffd98a' : '#ff9a3c';
        var ex = Math.round((cx + Math.sin(gameState.time * 0.05 + i * 1.7) * (w * 0.22)) / 2) * 2;
        ctx.fillRect(ex, Math.round((y + 12 - ph * 0.55) / 2) * 2, 2, 2);
    }
    ctx.restore();

    if (rising) {
        ctx.restore();                                  // クリップ解除（以降は地面より下にも描ける）
        // せり上がりで押し出された土煙と、地面の割れ目から飛ぶ小石（当たり判定なしの飾り）。
        // ⚠乱数を使わず index と time から出す＝毎フレーム位置が跳ねない。2pxグリッドでドットの粒を揃える。
        var rp = undergroundState.pipeRise / UG_PIPE_RISE_FRAMES;
        ctx.save();
        for (var di = 0; di < 10; di++) {
            var side = (di % 2) ? 1 : -1;
            var spread = (18 + (di >> 1) * 22) * (0.4 + rp * 1.1);
            var dx = Math.round((cx + side * (w * 0.42 + spread)) / 2) * 2;
            var dy = Math.round((GROUND_Y - 4 - Math.sin(rp * Math.PI) * (10 + (di >> 1) * 5)) / 2) * 2;
            ctx.globalAlpha = Math.max(0, 0.55 * Math.sin(rp * Math.PI)) * (1 - (di >> 1) / 6);
            ctx.fillStyle = (di % 3) ? '#c8b49a' : '#8a7660';
            ctx.fillRect(dx, dy, 4 + (di % 2) * 2, 4);
        }
        ctx.restore();
    }
}

function drawPlatform(p) {
    // 土管ボーナス部屋の入口（縦土管）: 専用スプライトで描く＋上に下向き矢印（乗って下スワイプ＝もぐる、の示唆）
    if (p.type === 'pipe') {
        // item_pipe.png は上13%/下10%に加え左右21.9%ずつも透明余白（実測: 192px中 可視x=42..149=108px）。
        // 素直に p.width で描くと見える管が当たり判定(PIPE_W)の約6割になり「土管に接していないのに乗れる」
        // 見た目のズレが出る（1.429ユーザー報告）。可視部分（最広部=上のリップ＝乗る面）が判定幅ちょうどに
        // 広がるよう横も相殺して描く＝PIPE_Wを変えても見た目と判定は常に一致する。
        // 縦は従来どおり: 上へ16pxずらし＋高さ+25（見える管の上端=足元・下端=地面）。
        if (p.ugEntrance) {
            drawUndergroundPipe(p);                     // 地底の入場土管は専用の手続き描画（赤・大型・粗さゼロ）
        } else if (pipeImg.complete && pipeImg.naturalWidth) {
            var _pw = p.width * (192 / 108);            // 全体描画幅（可視108pxが p.width になる倍率）
            var _px = p.x - p.width * (42 / 108);       // 左余白42pxぶん左へ
            // ⚠縦のオフセット(-16/+25)は PIPE_H=66 での実測値。高さを変えた土管に素で使うと管の下端が
            //   地面から浮く（高さ100で実測3.5px）。p.height に比例させて高さが変わっても接地を保つ。
            var _vs = p.height / PIPE_H;
            ctx.drawImage(pipeImg, _px, p.y - 16 * _vs, _pw, p.height + 25 * _vs);
        } else {
            ctx.fillStyle = '#3cb043'; ctx.fillRect(p.x, p.y, p.width, p.height + 12);
        }
        if (pipeRoomState.anim !== 'none' && pipeRoomState.animPipe === p) return; // 出入り演出中は矢印/ヒントを消す（後描き側が管のみ描く）
        // ⚠地底の入場土管(1.545)は visited を無視して必ずヒントを出す。同ラウンドで既にボーナス土管を使っていても
        //   入場は可能（enterPipeRoom が visited より前で横取りする）ので、ここで消すと「入れるのに案内が出ない」になる。
        if (pipeRoomState.visited && !p.ugEntrance) return; // 入室済み（このラウンドは入れない）土管には矢印/ヒントを出さない
        // せり上がり中はまだ入れないのでヒントも出さない（1.554）。出切ってから案内する
        if (p.ugEntrance && undergroundState.pipeRise < UG_PIPE_RISE_FRAMES) return;
        var ax = p.x + p.width / 2, ay = p.y - 30 + Math.sin(gameState.time * 0.12) * 3;
        ctx.fillStyle = p.ugEntrance ? 'rgba(255,140,120,0.95)' : 'rgba(255,224,102,0.9)';
        ctx.beginPath();
        ctx.moveTo(ax, ay + 7); ctx.lineTo(ax - 6, ay - 2); ctx.lineTo(ax + 6, ay - 2);
        ctx.closePath(); ctx.fill();
        // 入場ヒント（1.407）: 矢印の上に「したにスワイプ」。土管タイム中は速い点滅で「今入れる」を強調
        var hintA = (pipeAssistTimer > 0 || p.ugEntrance)
            ? 0.55 + 0.45 * Math.sin(gameState.time * 0.4)   // 入場土管は常に速い点滅＝「ここに入る」と分かるように
            : 0.55 + 0.25 * Math.sin(gameState.time * 0.1);
        var hintTxt = p.ugEntrance ? t('ug_pipe_hint') : t('pipe_enter_hint');
        ctx.save();
        ctx.globalAlpha = Math.max(0.2, hintA);
        ctx.fillStyle = p.ugEntrance ? '#ffb0a0' : '#ffe066';
        ctx.font = "bold " + (p.ugEntrance ? 13 : 11) + "px 'DotGothic16', monospace";
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(hintTxt, ax, ay - 8);
        ctx.fillText(hintTxt, ax, ay - 8);
        ctx.restore();
        return;
    }
    // 地底（1.563）: 作り込みの足場は城の石積み。⚠getBiomeIndex は距離から算出するので地底では
    // 草原/砂漠のタイルを返してしまう（updateBiome の地底固定=5 はここに効かない）。先に分岐する。
    if (p.ugTile) {
        var pcamY = gameState.camera.y;
        if (p.y > pcamY + GAME_HEIGHT || p.y + p.height < pcamY) return;
        for (var ux = p.x; ux < p.x + p.width; ux += UG_TILE) {
            spriteManager.draw(ctx, 'terrain_cave_brick', 0, ux, p.y, UG_TILE, UG_TILE, false);
        }
        if (p.special === 'moving') {   // 上下矢印（既存の動く床と同じ示唆）
            var max = p.x + p.width / 2, mab = Math.sin(gameState.time * 0.1) * 3;
            ctx.fillStyle = 'rgba(255,220,60,0.7)';
            ctx.beginPath();
            ctx.moveTo(max, p.y - 8 + mab); ctx.lineTo(max - 5, p.y - 3 + mab); ctx.lineTo(max + 5, p.y - 3 + mab);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(max, p.y + p.height + 8 - mab); ctx.lineTo(max - 5, p.y + p.height + 3 - mab);
            ctx.lineTo(max + 5, p.y + p.height + 3 - mab);
            ctx.closePath(); ctx.fill();
        }
        return;
    }
    // ボス戦中は夜(3)固定＝ブロックも通常タイル(platform_ground/cloud・夜パレット)にして地面/背景と揃える
    // （R1は getBiomeIndex が雪山を返し氷ブロックになってしまうため）
    var pBiome = bossState.active ? BOSS_BIOME : getBiomeIndex(gameState.distance);
    var tileName;
    if (p.type === 'cloud') {
        // 雲足場: バイオーム別カラー（砂漠=茶, 冬=グレー）
        tileName = pBiome === 1 ? 'platform_cloud_desert' : pBiome === 2 ? 'platform_cloud_ice' : 'platform_cloud';
    } else {
        // floating_ground: バイオームに応じたタイル
        tileName = pBiome === 1 ? 'terrain_quicksand' : pBiome === 2 ? 'terrain_ice' : 'platform_ground';
    }
    var TILE = 34;

    // 消える足場: 点滅エフェクト
    if (p.special === 'disappearing' && p.disappearTimer >= 0) {
        var prog = p.disappearTimer / p.disappearDuration;
        var blinkSpeed = 4 + prog * 16; // 進行に伴い高速化
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(gameState.time * 0.1 * blinkSpeed));
        if (prog > 0.7) ctx.globalAlpha *= (1 - prog) / 0.3; // 最後はフェードアウト
    }

    var PLAT_OFFSET = p.type === 'cloud' ? 10 : 5; // 雲は上部透明が大きいため多めに補正
    for (var tx = p.x; tx < p.x + p.width; tx += TILE) {
        spriteManager.draw(ctx, tileName, 0, tx, p.y - PLAT_OFFSET, TILE, p.height + PLAT_OFFSET, false);
    }

    // 消える足場のalpha復元
    if (p.special === 'disappearing' && p.disappearTimer >= 0) {
        ctx.globalAlpha = 1;
    }

    // 移動足場: 上下矢印インジケーター
    if (p.special === 'moving') {
        var arrowX = p.x + p.width / 2;
        var arrowBounce = Math.sin(gameState.time * 0.1) * 3;
        ctx.fillStyle = 'rgba(255,220,60,0.7)';
        // 上矢印
        ctx.beginPath();
        ctx.moveTo(arrowX, p.y - 8 + arrowBounce);
        ctx.lineTo(arrowX - 5, p.y - 3 + arrowBounce);
        ctx.lineTo(arrowX + 5, p.y - 3 + arrowBounce);
        ctx.closePath(); ctx.fill();
        // 下矢印
        ctx.beginPath();
        ctx.moveTo(arrowX, p.y + p.height + 8 - arrowBounce);
        ctx.lineTo(arrowX - 5, p.y + p.height + 3 - arrowBounce);
        ctx.lineTo(arrowX + 5, p.y + p.height + 3 - arrowBounce);
        ctx.closePath(); ctx.fill();
    }

    // バネ足場: コイルバネ表示
    if (p.special === 'spring') {
        var springCx = p.x + p.width / 2;
        var springTop = p.y - 2;
        var compress = p.springAnim > 0 ? (p.springAnim / 15) * 6 : 0;

        // バネのコイル (3本の横線 + カラーバー)
        ctx.strokeStyle = '#ff6644';
        ctx.lineWidth = 2.5;
        for (var si = 0; si < 3; si++) {
            var sy = springTop - 4 - si * (4 - compress);
            var sw = 14 - si * 2;
            ctx.beginPath();
            ctx.moveTo(springCx - sw, sy);
            ctx.lineTo(springCx + sw, sy);
            ctx.stroke();
        }

        // 上端のプレート
        ctx.fillStyle = '#ff4422';
        ctx.fillRect(springCx - 16, springTop - 16 + compress, 32, 4);

        // 発光エフェクト (着地時)
        if (p.springAnim > 0) {
            var sAlpha = p.springAnim / 15;
            ctx.fillStyle = 'rgba(255,100,50,' + (sAlpha * 0.4) + ')';
            ctx.beginPath();
            ctx.arc(springCx, springTop - 8, 20 + (15 - p.springAnim) * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawCoin(c, time) {
    if (c.collected) return;
    var frameIdx = Math.floor(time / 8) % 4;
    spriteManager.draw(ctx, 'coin_spin', frameIdx, c.x, c.y, c.width, c.height, false);
}

function drawEnemy(e) {
    if (e.type === 'skully') { drawSkully(e); return; }   // 骨だけの鳥は専用描画（崩壊/再生の状態がある・1.563）
    markZukanSeen(enemyZukanId(e)); // ずかん: 画面に映った＝遭遇として発見登録（既発見なら無処理）
    var bounce = Math.sin(e.animFrame / 3);
    var cy = e.y + bounce;
    var frameIdx = Math.floor(e.animFrame / 8) % 4;
    var spriteName;

    switch (e.type) {
        case 'golden_chick': spriteName = 'golden_chick_walk'; break;
        case 'mama_chick':   spriteName = 'mama_chick_walk'; break;
        default:             spriteName = e.walkSprite || 'chick_walk'; break; // バイオーム見た目（スポーン時に確定）
    }

    var flipH = (e.velX > 0); // 右移動中なら反転して右向きに
    spriteManager.draw(ctx, spriteName, frameIdx, e.x, cy, e.width, e.height, flipH);
    e.animFrame += frameSteps;
}

// ─── 紫の燭台（1.568）: ボス部屋が近いことの予告 ───
// ⚠色は**紫**にする。洞窟の松明＝橙／老婆の店＝緑 と使い分けてあり、紫は闇の巫女の色（SPEC §7）。
//   門へ近づくほど間隔が詰まるよう**マップ側で**置いてあるので、ここは1本を描くことに専念する。
// ⚠数を増やすより「間隔が詰まっていく」ほうが予告として効く。等間隔にすると ただの街灯に見える。
function drawUgBraziers(camL, camR) {
    var bz = undergroundState.braziers;
    if (!bz || !bz.length) return;
    var camY = gameState.camera.y, t = gameState.time;
    var g2 = function (v) { return Math.round(v / 2) * 2; };
    for (var i = 0; i < bz.length; i++) {
        var b = bz[i];
        if (b.x < camL - 40 || b.x > camR + 40) continue;
        if (b.baseY > camY + GAME_HEIGHT + 60 || b.baseY < camY - 120) continue;
        var x = g2(b.x), base = b.baseY, top = g2(base - 54);
        // 撃破後は1本ずつ消える（1.584）。seed で順番をばらして「静まっていく」感じを出す。
        // ⚠柱と受け皿(石)は消さない＝炎だけ落とす。calm=1 で完全に消灯し、紫の煙だけが残る。
        var calm = undergroundState.endCalm || 0;
        var outAt = 0.25 + ((b.seed * 7) % 10) / 10 * 0.55;      // この進行度で消える
        var lit = calm <= 0 ? 1 : Math.max(0, 1 - Math.max(0, (calm - outAt) / 0.22));
        var flick = (0.72 + 0.28 * Math.sin(t * 0.26 + b.seed * 1.7)) * lit;
        if (lit <= 0.001) {                                       // 消えた後: 立ちのぼる紫の煙だけ
            ctx.fillStyle = '#2e2640'; ctx.fillRect(x - 4, top + 6, 8, 48);
            ctx.fillStyle = '#463a5e'; ctx.fillRect(x - 4, top + 6, 3, 48);
            ctx.fillRect(x - 9, top, 18, 7);
            ctx.fillStyle = '#2e2640'; ctx.fillRect(x - 11, base - 6, 22, 6);
            ctx.save(); ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#8f6fd0';
            for (var sm = 0; sm < 3; sm++) {
                var sy = top - 6 - sm * 12 - ((t * 0.6 + b.seed * 9) % 14);
                ctx.fillRect(g2(x - 2 + Math.sin(t * 0.05 + sm + b.seed) * 4), g2(sy), 3, 5);
            }
            ctx.restore();
            continue;
        }
        var lean = Math.sin(t * 0.15 + b.seed * 0.9) * 3;
        // 柱と受け皿（石）
        ctx.fillStyle = '#2e2640';
        ctx.fillRect(x - 4, top + 6, 8, 48);
        ctx.fillStyle = '#463a5e';
        ctx.fillRect(x - 4, top + 6, 3, 48);
        ctx.fillRect(x - 9, top, 18, 7);
        ctx.fillStyle = '#2e2640';
        ctx.fillRect(x - 11, base - 6, 22, 6);                  // 台座
        // 炎（外炎→中炎→芯。三角1枚だと矢印に見えるので必ず3層）
        ctx.fillStyle = '#6a2fc0';
        ctx.beginPath();
        ctx.moveTo(x - 7, top);
        ctx.quadraticCurveTo(g2(x - 8 + lean), g2(top - 14), g2(x + lean), g2(top - 26 * flick));
        ctx.quadraticCurveTo(g2(x + 8 + lean), g2(top - 14), x + 7, top);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b07cff';
        ctx.beginPath();
        ctx.moveTo(x - 4, top);
        ctx.quadraticCurveTo(g2(x - 5 + lean), g2(top - 10), g2(x + lean * 0.7), g2(top - 16 * flick));
        ctx.quadraticCurveTo(g2(x + 5 + lean), g2(top - 10), x + 4, top);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8d8ff';
        ctx.fillRect(g2(x - 1 + lean * 0.4), g2(top - 9 * flick), 2, g2(8 * flick));
        // 周囲のにじみ
        ctx.save();
        ctx.globalAlpha = 0.20 * flick;
        var bg = ctx.createRadialGradient(x, top - 8, 2, x, top - 8, 54);
        bg.addColorStop(0, 'rgba(176,124,255,1)'); bg.addColorStop(1, 'rgba(176,124,255,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(x, top - 8, 54, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// ─── 怪しい老婆の店（1.567）: 岩壁に掘られた洞窟の入口 ───
// ⚠地上のショップは「建物が建っている」絵だが、地底でそれをやると壁から家が生えて見える。
//   ここは**岩を掘った穴**として描く＝背景の岩壁と地続きに見えることを最優先にした。
// ⚠「怪しい」を出しているのは3点: ①中が見えない深い闇 ②緑がかった不気味な灯り（松明の暖色と対比）
//   ③奥にうずくまる人影と光る片目。看板や商品を並べると「普通の店」になってしまうので置かない。
// ⚠ドット絵の粒を揃えるため座標は2pxグリッドに丸める（洞窟タイル/入場土管と同じ作法）。滑らかな
//   グラデは「灯りのにじみ」だけに使う。
function drawUgShop() {
    var s = undergroundState.shop;
    if (!s) return;
    var camX = gameState.camera.x, camY = gameState.camera.y;
    if (s.x + UG_SHOP_W < camX - 80 || s.x > camX + GAME_WIDTH + 80) return;
    var W = UG_SHOP_W, H = UG_SHOP_H;
    var bx = s.x, by = s.baseY;              // 左端・床
    var top = by - H, cx = bx + W / 2;
    var g2 = function (v) { return Math.round(v / 2) * 2; };   // 2pxグリッド
    // ⚠時間の変数名を `t` にしないこと（1.576で修正）。i18n の翻訳関数がグローバルの `t()` なので、
    //   `var t = gameState.time` にすると関数内で翻訳関数が数値に覆い隠され、
    //   下の t('ug_shop_swipe_up') が「数値を関数として呼ぶ」＝TypeError で落ちる。
    //   描画中の例外は gameLoop の rAF 連鎖を切るので、**店に近づいた瞬間にぴよ氏が消えてゲームが固まっていた**
    //   （drawUgShop は drawPlayer より前に走るため、その手前で描画が中断する）。上スワイプは不要＝通りかかるだけで発生。
    var tm = gameState.time;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // ── ① 岩の張り出し（穴の周りだけ岩肌を厚くして「掘った」感じを出す）──
    ctx.fillStyle = '#2a2334';
    ctx.beginPath();
    ctx.moveTo(g2(bx - 12), by);
    ctx.lineTo(g2(bx - 6),  g2(top + 30));
    ctx.lineTo(g2(bx + 16), g2(top + 6));
    ctx.lineTo(g2(cx - 24), g2(top - 12));
    ctx.lineTo(g2(cx + 26), g2(top - 8));
    ctx.lineTo(g2(bx + W - 14), g2(top + 10));
    ctx.lineTo(g2(bx + W + 6),  g2(top + 34));
    ctx.lineTo(g2(bx + W + 12), by);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3048';                                  // 岩の明部（左上から光が来ている想定）
    ctx.beginPath();
    ctx.moveTo(g2(bx - 12), by);
    ctx.lineTo(g2(bx - 6), g2(top + 30));
    ctx.lineTo(g2(bx + 16), g2(top + 6));
    ctx.lineTo(g2(cx - 24), g2(top - 12));
    ctx.lineTo(g2(cx - 18), g2(top + 4));
    ctx.lineTo(g2(bx + 8), g2(top + 40));
    ctx.lineTo(g2(bx + 2), by);
    ctx.closePath(); ctx.fill();

    // ── ② 穴（アーチ）──
    // ⚠**中は真っ黒にしないこと**（初版の失敗）。真っ黒だと奥の老婆が黒地に黒で完全に消え、
    //   ただのトンネルに見えた。「灯りのある奥＋手前に黒い人影」の順に重ねて初めてシルエットが立つ。
    var oX = bx + 16, oW = W - 32, oTop = top + 22, oBot = by;
    var arch = function () {
        ctx.beginPath();
        ctx.moveTo(g2(oX), oBot);
        ctx.lineTo(g2(oX), g2(oTop + 26));
        ctx.quadraticCurveTo(g2(cx), g2(oTop - 16), g2(oX + oW), g2(oTop + 26));
        ctx.lineTo(g2(oX + oW), oBot);
        ctx.closePath();
    };
    var pulse = 0.55 + 0.25 * Math.sin(tm * 0.06) + 0.08 * Math.sin(tm * 0.23);
    arch();
    ctx.fillStyle = '#0d1a16';                                  // 奥の壁（緑に寄せた暗色＝黒ではない）
    ctx.fill();
    ctx.strokeStyle = '#171224'; ctx.lineWidth = 4; ctx.stroke();   // 掘り口の縁

    ctx.save();
    arch(); ctx.clip();                                         // 以下は穴の中だけ

    // ── ③ 中の灯り。奥の壁をしっかり照らす（松明の暖色と対比させて「別の場所」に見せる）──
    var lg = ctx.createRadialGradient(cx, by - 30, 6, cx, by - 30, 92);
    lg.addColorStop(0,   'rgba(170,255,205,' + (0.80 * pulse).toFixed(3) + ')');
    lg.addColorStop(0.4, 'rgba(90,215,160,'  + (0.44 * pulse).toFixed(3) + ')');
    lg.addColorStop(1,   'rgba(30,110,90,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(oX, oTop - 20, oW, H + 20);

    // ── ④ 大鍋（灯りの出どころ。これがあると「何かを煮ている店」になる）──
    var potY = by - 10;
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(g2(cx - 20), g2(potY - 12), 40, 12);
    ctx.fillRect(g2(cx - 23), g2(potY - 14), 46, 3);
    ctx.fillStyle = '#7affc0';                                  // 煮えている面
    ctx.fillRect(g2(cx - 18), g2(potY - 12), 36, 3);
    for (var pb = 0; pb < 3; pb++) {                            // 泡（乱数を使わず time から）
        var ph = (tm * 0.9 + pb * 33) % 40;
        ctx.globalAlpha = Math.max(0, 0.85 * (1 - ph / 40));
        ctx.fillStyle = '#c8ffe0';
        ctx.fillRect(g2(cx - 12 + pb * 11), g2(potY - 14 - ph * 0.5), 3, 3);
    }
    ctx.globalAlpha = 1;

    // ── ⑤ 奥にうずくまる老婆の影（丸めた背中＋鉤鼻＋光る片目）──
    var sy = by - 12, bob = Math.sin(tm * 0.03) * 1.5;
    ctx.fillStyle = '#080610';
    ctx.beginPath();                                            // 丸めた背中〜フード
    ctx.moveTo(g2(cx - 34), sy);
    ctx.lineTo(g2(cx - 32), g2(sy - 24 + bob));
    ctx.quadraticCurveTo(g2(cx - 30), g2(sy - 54 + bob), g2(cx - 10), g2(sy - 58 + bob));
    ctx.lineTo(g2(cx - 2),  g2(sy - 52 + bob));                 // フードの前が尖る＝鉤鼻の影
    ctx.lineTo(g2(cx - 12), g2(sy - 46 + bob));
    ctx.quadraticCurveTo(g2(cx - 4), g2(sy - 30 + bob), g2(cx - 8), sy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#080610';                                  // 杖
    ctx.fillRect(g2(cx - 40), g2(sy - 50 + bob), 3, 50);
    ctx.fillRect(g2(cx - 43), g2(sy - 54 + bob), 9, 4);
    var eyeA = (Math.sin(tm * 0.11) > -0.8) ? 1 : 0.12;          // たまに瞬きする
    ctx.globalAlpha = eyeA;
    ctx.fillStyle = '#eaffe0';
    ctx.fillRect(g2(cx - 20), g2(sy - 48 + bob), 5, 3);
    ctx.globalAlpha = eyeA * 0.45;
    ctx.fillRect(g2(cx - 23), g2(sy - 49 + bob), 11, 5);
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── ⑥ 穴の外にこぼれる灯り（床を照らす）──
    ctx.save();
    ctx.globalAlpha = 0.28 * pulse;
    var fg = ctx.createLinearGradient(0, by - 40, 0, by + 6);
    fg.addColorStop(0, 'rgba(120,230,175,0)');
    fg.addColorStop(1, 'rgba(120,230,175,0.9)');
    ctx.fillStyle = fg;
    ctx.fillRect(bx - 6, by - 40, W + 12, 46);
    ctx.restore();

    // ── ⑥ 入口に吊るしたお守り（骨と玉。ゆっくり揺れる＝生活感と不気味さ）──
    ctx.save();
    for (var ci = 0; ci < 5; ci++) {
        var hx = g2(oX + 12 + ci * ((oW - 24) / 4));
        var hy = g2(oTop + 10 + Math.abs(ci - 2) * 7);          // アーチなりに垂らす
        var sw = Math.sin(tm * 0.045 + ci * 1.3) * 2;
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(g2(hx + sw), g2(hy + 16)); ctx.stroke();
        if (ci % 2 === 0) {                                     // 骨
            ctx.fillStyle = '#ddd4c0';
            ctx.fillRect(g2(hx + sw - 3), g2(hy + 16), 6, 2);
            ctx.fillRect(g2(hx + sw - 4), g2(hy + 15), 2, 4);
            ctx.fillRect(g2(hx + sw + 2), g2(hy + 15), 2, 4);
        } else {                                                // 玉（灯りを弱く反射する）
            ctx.fillStyle = '#7a5a8c';
            ctx.fillRect(g2(hx + sw - 2), g2(hy + 16), 4, 4);
            ctx.fillStyle = '#b08cc0';
            ctx.fillRect(g2(hx + sw - 2), g2(hy + 16), 2, 2);
        }
    }
    ctx.restore();

    // ── ⑧ 入口脇の燭台（緑の炎。遠目に「ここが店だ」と分かる目印）──
    // ⚠炎は三角1枚だと矢印に見える（初版の失敗）。**外炎を左右非対称に揺らして芯を重ねる**と炎に見える。
    for (var qi = 0; qi < 2; qi++) {
        var qx = g2(qi === 0 ? bx + 6 : bx + W - 8), qy = g2(by - 42);
        var flick = 0.72 + 0.28 * Math.sin(tm * 0.3 + qi * 2.2);
        var lean = Math.sin(tm * 0.17 + qi * 1.7) * 3;
        ctx.fillStyle = '#4a3f5c';
        ctx.fillRect(qx - 3, qy, 6, 42);                        // 燭台の柱
        ctx.fillRect(qx - 6, qy - 2, 12, 4);                    // 受け皿
        ctx.fillStyle = '#3fd894';                              // 外炎（揺れる）
        ctx.beginPath();
        ctx.moveTo(qx - 6, qy - 3);
        ctx.quadraticCurveTo(g2(qx - 7 + lean), g2(qy - 14), g2(qx + lean), g2(qy - 3 - 22 * flick));
        ctx.quadraticCurveTo(g2(qx + 7 + lean), g2(qy - 14), qx + 6, qy - 3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a8ffd0';                              // 中炎
        ctx.beginPath();
        ctx.moveTo(qx - 3, qy - 3);
        ctx.quadraticCurveTo(g2(qx - 4 + lean), g2(qy - 11), g2(qx + lean * 0.7), g2(qy - 3 - 13 * flick));
        ctx.quadraticCurveTo(g2(qx + 4 + lean), g2(qy - 11), qx + 3, qy - 3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f0fff6';                              // 芯
        ctx.fillRect(g2(qx - 1 + lean * 0.4), g2(qy - 3 - 7 * flick), 2, g2(6 * flick));
        ctx.save();                                             // 周囲のにじみ
        ctx.globalAlpha = 0.22 * flick;
        var qg = ctx.createRadialGradient(qx, qy - 10, 2, qx, qy - 10, 46);
        qg.addColorStop(0, 'rgba(120,255,190,1)'); qg.addColorStop(1, 'rgba(120,255,190,0)');
        ctx.fillStyle = qg;
        ctx.beginPath(); ctx.arc(qx, qy - 10, 46, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // ── ⑨ 入店ヒント（近づいた時だけ）。⚠地上のおみせ（drawShopBuilding）と同じ作法・同じ文言体系 ──
    if (!shopState.visited && !shopState.active && undergroundState.bossPhase <= 0) {
        var pcx2 = player.x + player.width / 2;
        if (Math.abs(pcx2 - cx) < UG_SHOP_NEAR && player.onGround) {
            var hb = Math.sin(tm * 0.08) * 3;
            ctx.fillStyle = '#b8ffd0';
            ctx.font = "bold 12px 'DotGothic16', monospace";
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
            ctx.fillText(t('ug_shop_swipe_up'), cx, top - 16 + hb);
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}

// ─── ボス闘技場（1.564・ロックマン式の部屋切替） ───
// ⚠ワールド座標系（カメラtranslateの中）で描く。HPバーだけは画面座標なので render の後半で描く。
function drawUgBossRoom() {
    var ug = undergroundState;
    if (ug.bossPhase <= 0) return;
    var ch = ug.rooms[ug.rooms.length - 1];
    if (!ch) return;

    // ── 背後の扉（フェーズ2で降りてくる／撃破後は上がって道が開く・1.584）──
    if (ug.bossPhase >= 2) {
        var dp = (ug.bossPhase === 2) ? Math.min(1, ug.bossTimer / UG_BOSS_DOOR_FRAMES) : 1;
        // 撃破後は endCalm に合わせて巻き上がる＝「帰り道が開いた」ことを絵で言う
        if (ug.bossPhase === 5) dp = Math.max(0, 1 - (ug.endCalm || 0));
        var dTop = ch.topY + 2 * UG_TILE, dH = 10 * UG_TILE;
        var dx = ug.bossDoorX - UG_TILE;
        ctx.save();
        ctx.beginPath(); ctx.rect(dx - 4, dTop, UG_TILE + 8, dH); ctx.clip();  // 降りてくる分だけ見せる
        for (var dy = 0; dy < dH; dy += UG_TILE) {
            spriteManager.draw(ctx, 'terrain_cave_brick', 0, dx, dTop - dH + dH * dp + dy, UG_TILE, UG_TILE, false);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.35)';                                    // 縁の陰＝厚みを出す
        ctx.fillRect(dx, dTop - dH + dH * dp, 3, dH);
        ctx.restore();
    }

    // ── 魔法陣→光柱（P2〜・床から天井まで立つので高さでは避けられない）──
    drawUgSigils(ch);

    // ── ボス登場の渦（フェーズ3）──
    // ⚠中心は ug.bossSpawnX（＝画面内で決めた実体化位置）。部屋の幅から比率で置くと、
    //   闘技場40タイル(1,280px)は画面幅(820〜1,150)より広いので**渦だけ画面の外**に出る（1.570で修正）。
    if (ug.bossPhase === 3) {
        drawUgVortex(ug.bossSpawnX || (gameState.camera.x + GAME_WIDTH * 0.6),
                     ch.topY + UG_BOSS_HOVER_DY + UG_BOSS_H * 0.5,
                     ug.bossTimer / UG_BOSS_APPEAR_FRAMES);
    }

    var b = ug.boss;
    if (!b) return;

    // ── 残像（1.570）。動いた軌跡に薄い分身が残る＝常時ふわっと尾を引いて「実体が薄い」感じを出す ──
    if (b.trail && b.trail.length > 2) {
        for (var tr = b.trail.length - 1; tr >= 2; tr -= 2) {
            var tp = b.trail[tr];
            if (Math.abs(tp.x - b.x) < 1.2 && Math.abs(tp.y - b.y) < 1.2) continue;  // 止まっている時は出さない
            drawPriestessBody(tp.x, tp.y, b, 1, (1 - tr / b.trail.length) * 0.20);
        }
    }
    // ── 瞬間移動の残光（消えた場所に紫が尾を引く＝「どこへ行った」を追う手がかり）──
    if (b.ghostTimer > 0) drawPriestessBody(b.ghostX, b.ghostY, b, 1, (b.ghostTimer / UG_BOSS_BLINK_IN) * 0.42);
    // 実体化していない間は渦だけ（当たり判定も無い＝b.solid=false ＝ 'blinkIn' の間だけ）
    if (!b.solid && ug.bossPhase === 4) {
        drawUgVortex(b.x + b.width / 2, b.y + b.height / 2, 1 - b.timer / UG_BOSS_BLINK_IN);
        return;
    }
    // ── 分身（P3）。⚠**本物と一切見分けがつかないように描く**＝手がかりは「撃つかどうか」だけ ──
    for (var cl = 0; cl < b.clones.length; cl++) drawPriestessBody(b.clones[cl].x, b.clones[cl].y, b, 1, 1);

    // ── 本体 ──
    if (ug.bossPhase === 5) {
        // 撃破: 光に灼かれて崩れ落ちる（沈みながら消える）
        var dp = Math.min(1, ug.bossTimer / (UG_BOSS_DEFEAT_FRAMES * 0.8));
        drawPriestessBody(b.x, b.y + dp * 40, b, 1, 1 - dp);
        return;
    }
    // 消えかけ（blinkOut）はだんだん透ける＝「今から消える」が見て分かる
    drawPriestessBody(b.x, b.y, b, 0,
                      b.mode === 'blinkOut' ? Math.max(0.12, b.timer / UG_BOSS_BLINK_OUT) : 1);
}

// 闇の巫女の本体1体ぶん。分身も撃破演出も残光も全部これを通す＝見た目が絶対にズレない。
// スプライトは sprites.js の手続き生成（32×40を96×120＝**3倍**で表示＝地形32pxタイルと粒が揃う）。
// ⚠alpha は**掛け算で使う**こと（残光/消えかけ/撃破の透過を、中で使う個々の globalAlpha が上書きしないため）。
function drawPriestessBody(x, y, b, quiet, alpha) {
    if (alpha <= 0.01) return;
    var cx = x + b.width / 2, cy = y + b.height * 0.5;
    var casting = (b.mode === 'cast' || b.mode === 'castTele' || b.mode === 'clone' ||
                   b.mode === 'cloneTele' || b.mode === 'counter');
    var awake = (b.mode === 'awaken');
    var charging = (b.mode === 'curseTele' || b.mode === 'spiralTele' || b.mode === 'spiral' || awake);
    ctx.save();
    // ── 背後の魔法陣（1.570）。⚠**逆回転の二重リング**にすると、静止画でも「回っている」と分かる。
    //   詠唱/溜め/解放のときだけ濃くする＝今が何のモーションか色で読める。
    var ringP = (charging ? 1 : casting ? 0.7 : 0.34) * (awake ? 1.35 : 1);
    ctx.globalAlpha = alpha * 0.55 * ringP;
    var rr = b.width * (0.78 + (awake ? 0.35 : 0)) + Math.sin(b.anim * 0.06) * 4;
    for (var ri = 0; ri < 2; ri++) {
        var rot = b.anim * (ri ? -0.014 : 0.021), rad = rr * (ri ? 0.62 : 1);
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, 0.42);   // 床に寝かせず、やや斜めの円＝奥行きが出る
        ctx.strokeStyle = ri ? '#f2e6ff' : '#a273f0';
        ctx.lineWidth = ri ? 2 : 3;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
        for (var rk = 0; rk < 8; rk++) {                              // 呪符（回るドット）
            var ra = (Math.PI / 4) * rk;
            ctx.fillStyle = (rk % 2) ? '#f2e6ff' : '#c9a4ff';
            ctx.fillRect(Math.cos(ra) * rad - 3, Math.sin(ra) * rad - 3, 6, 6);
        }
        ctx.restore();
    }
    // ── 周囲の闇（大きさで格上感を出す。⚠緑は使わない＝SPEC §7 のハロ回避）──
    ctx.globalAlpha = alpha * (awake ? 1 : 0.92);
    var bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, b.width * (awake ? 1.5 : 1));
    bg.addColorStop(0, awake ? 'rgba(190,140,255,0.75)' : 'rgba(96,44,166,0.5)');
    bg.addColorStop(1, 'rgba(60,20,110,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(x - b.width, y - 60, b.width * 3, b.height + 130);
    // ── 足元の光＝「今なら踏める」の合図 ──
    // ⚠**`b.exposed` で出すこと**（1.571）。以前は casting（castTele＝降下中も含む）で光らせていたので、
    //   まだ踏めない降下中から光っていた＝「光っている＝踏める」という約束が守られていなかった。
    if (b.exposed && !b.hurt) {
        ctx.globalAlpha = alpha * (0.30 + 0.14 * Math.sin(b.anim * 0.18));
        var lg = ctx.createRadialGradient(cx, y + b.height, 6, cx, y + b.height, 74);
        lg.addColorStop(0, 'rgba(201,164,255,0.9)'); lg.addColorStop(1, 'rgba(122,74,208,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.ellipse(cx, y + b.height, 74, 20, 0, 0, Math.PI * 2); ctx.fill();
    }
    // ── 予告（呪弾の溜め）: 両手の間の玉に紫が集まり、光の粒が渦を巻いて吸い込まれる ──
    var orbY = y + b.height * UG_BOSS_ORB_DY;
    if (charging && !quiet) {
        var tp = charging && b.mode === 'curseTele' ? (1 - b.timer / Math.max(1, UG_BOSS_CURSE_TELE)) : 0.85;
        ctx.globalAlpha = alpha * Math.min(0.95, 0.3 + tp * 0.7);
        var tg = ctx.createRadialGradient(cx, orbY, 2, cx, orbY, 14 + tp * 26);
        tg.addColorStop(0, 'rgba(255,245,255,0.98)'); tg.addColorStop(1, 'rgba(162,115,240,0)');
        ctx.fillStyle = tg;
        ctx.beginPath(); ctx.arc(cx, orbY, 14 + tp * 26, 0, Math.PI * 2); ctx.fill();
        // 吸い込まれる粒（決定的な式＝配列を持たない＝実機の負荷が読める）
        for (var sp = 0; sp < 7; sp++) {
            var sa = b.anim * 0.16 + sp * 0.9, sr = 44 - ((b.anim * 2.2 + sp * 13) % 44);
            ctx.globalAlpha = alpha * (1 - sr / 44) * 0.9;
            ctx.fillStyle = (sp % 2) ? '#f2e6ff' : '#c9a4ff';
            ctx.fillRect(cx + Math.cos(sa) * sr - 2, orbY + Math.sin(sa) * sr - 2, 4, 4);
        }
    }
    // ── 目から伸びる細い光（狙いを定めている＝次に来る方向が読める）──
    if ((b.mode === 'curseTele' || b.mode === 'spiralTele') && !quiet) {
        var eyY = y + b.height * UG_BOSS_EYE_DY;
        var pa = Math.atan2(player.y + player.height / 2 - eyY, player.x + player.width / 2 - cx);
        ctx.globalAlpha = alpha * (0.28 + 0.22 * Math.sin(b.anim * 0.35));
        ctx.strokeStyle = '#e6d0ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, eyY);
        ctx.lineTo(cx + Math.cos(pa) * 420, eyY + Math.sin(pa) * 420); ctx.stroke();
    }
    // 被弾の点滅（通常ボスと同じ見せ方）
    ctx.globalAlpha = alpha * ((b.hurt > 0 && !quiet && Math.floor(gameState.time / 3) % 2 === 0) ? 0.5 : 1);
    // ⚠スプライトは**右向きで描いてある**（顔の闇と目が右へ1ドット寄っている）＝左を向く時に反転する
    // ⚠立ち絵1枚（OpenAI生成・104×132を等倍で描く）。他のボス(owl/snake/scarecrow)と同じ「1枚＋procedural」方式。
    //   姿勢の差（浮遊/詠唱/被弾）はコマではなく**高さと光**で作る＝この下の目の光・足元の光・閃光が担当。
    spriteManager.draw(ctx, 'boss_priestess', 0, x, y, b.width, b.height, false);
    // ── 光る目（絵の中の目の位置=UG_BOSS_EYE_DY に光をにじませる＝暗い洞窟でも位置が分かる）──
    ctx.globalAlpha = alpha * (0.85 + 0.15 * Math.sin(b.anim * 0.11)) * (awake ? 1.3 : 1);
    for (var e = -1; e <= 1; e += 2) {
        var ex = cx + e * 4, ey = y + b.height * UG_BOSS_EYE_DY;   // 絵の顔は小さい＝目の間隔も狭い（実測±3px）
        var eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, awake ? 17 : 11);
        eg.addColorStop(0, 'rgba(255,245,255,0.98)');
        eg.addColorStop(0.4, 'rgba(201,164,255,0.72)');
        eg.addColorStop(1, 'rgba(122,74,208,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(ex, ey, awake ? 17 : 11, 0, Math.PI * 2); ctx.fill();
    }
    // ── 発射／解放の閃光（広がる二重リング）──
    if (b.flash > 0 && !quiet) {
        var fp = b.flash / 18;
        ctx.globalAlpha = alpha * fp;
        ctx.fillStyle = 'rgba(245,235,255,0.9)';
        ctx.beginPath(); ctx.arc(cx, orbY, 10 + (18 - b.flash) * 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha * fp * 0.8;
        ctx.strokeStyle = '#c9a4ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, orbY, 18 + (18 - b.flash) * 3.4, 0, Math.PI * 2); ctx.stroke();
    }
    // ── 解放（フェーズ移行）: 立ち昇る光の柱＋弾ける輪 ──
    if (awake && !quiet) {
        // ⚠0..1 に必ず収めること。JS の % は負の被除数で**負を返す**ので、下の awp が負になると
        //   ellipse の半径が負になり IndexSizeError で**そのフレームの描画が丸ごと落ちる**
        //   （1.570の負荷試験で timer を人為的に伸ばして再現した）。通常プレイでは起きないが保険を置く。
        var ap2 = Math.max(0, Math.min(1, 1 - b.timer / UG_BOSS_PHASE_TELE));
        ctx.globalAlpha = alpha * (0.45 + 0.35 * Math.sin(b.anim * 0.5)) * (1 - Math.abs(ap2 - 0.5) * 1.2);
        var pg = ctx.createLinearGradient(cx - 44, 0, cx + 44, 0);
        pg.addColorStop(0, 'rgba(162,115,240,0)');
        pg.addColorStop(0.5, 'rgba(255,245,255,0.85)');
        pg.addColorStop(1, 'rgba(162,115,240,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(cx - 44, y - 300, 88, b.height + 320);
        for (var aw = 0; aw < 3; aw++) {                     // 弾ける輪（時間差で3枚）
            var awp = ((ap2 * 2.2 + aw * 0.33) % 1);
            ctx.globalAlpha = alpha * (1 - awp) * 0.7;
            ctx.strokeStyle = '#f2e6ff'; ctx.lineWidth = 4 - awp * 3;
            ctx.beginPath(); ctx.ellipse(cx, cy, 40 + awp * 240, (40 + awp * 240) * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        }
    }
    ctx.restore();
}

// 紫の渦（登場・瞬間移動で共用）。p=0..1 で密度が上がり中心へ収束する
function drawUgVortex(vx, vy, p) {
    p = Math.max(0, Math.min(1, p));
    ctx.save();
    for (var vi = 0; vi < 5; vi++) {
        var a = gameState.time * 0.12 + vi * 1.25;
        var r = (110 - p * 82) + vi * 7;
        ctx.globalAlpha = 0.16 + p * 0.5;
        ctx.fillStyle = (vi % 2) ? '#b07cff' : '#6a3fb0';
        ctx.beginPath();
        ctx.arc(vx + Math.cos(a) * r, vy + Math.sin(a) * r * 0.55, 7 + p * 9, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = p * 0.6;
    var vg = ctx.createRadialGradient(vx, vy, 4, vx, vy, 90);
    vg.addColorStop(0, 'rgba(200,150,255,0.9)'); vg.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.arc(vx, vy, 90, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// 魔法陣（床の円で予告）→ 光柱（床から天井まで）。カカシの帯予告と同じ「見てから横へ逃げる」設計。
function drawUgSigils(ch) {
    var ug = undergroundState;
    if (!ug.sigils.length) return;
    var floorY = ch.topY + 12 * UG_TILE, ceilY = ch.topY + 2 * UG_TILE;
    for (var i = 0; i < ug.sigils.length; i++) {
        var s = ug.sigils[i], R = UG_BOSS_SIGIL_R;
        ctx.save();
        if (!s.live) {
            // 予告: 床に紫の円が浮かび、二重の輪が逆回転しながら濃くなる
            var tp = Math.min(1, s.timer / UG_BOSS_SIGIL_TELE);
            ctx.globalAlpha = 0.25 + tp * 0.6;
            ctx.strokeStyle = '#c9a4ff'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.ellipse(s.x, floorY - 3, R, R * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 0.18 + tp * 0.42;
            ctx.beginPath(); ctx.ellipse(s.x, floorY - 3, R * 0.6, R * 0.19, 0, 0, Math.PI * 2); ctx.stroke();
            for (var k = 0; k < 6; k++) {                       // 回る呪符の点
                var a = s.timer * 0.05 * (k % 2 ? -1 : 1) + k * (Math.PI / 3);
                ctx.fillStyle = (k % 2) ? '#f2e6ff' : '#a273f0';
                ctx.fillRect(s.x + Math.cos(a) * R * 0.8 - 2, floorY - 3 + Math.sin(a) * R * 0.26 - 2, 4, 4);
            }
        } else {
            // 光柱: 床→天井。⚠横幅は予告の円と同じ＝見た目と当たりを一致させる
            var lp = 0.55 + 0.45 * Math.sin(s.timer * 0.5);
            ctx.globalAlpha = 0.55 * lp;
            var pg = ctx.createLinearGradient(s.x - R, 0, s.x + R, 0);
            pg.addColorStop(0, 'rgba(122,74,208,0)');
            pg.addColorStop(0.5, 'rgba(242,230,255,0.95)');
            pg.addColorStop(1, 'rgba(122,74,208,0)');
            ctx.fillStyle = pg;
            ctx.fillRect(s.x - R, ceilY, R * 2, floorY - ceilY);
            ctx.globalAlpha = 0.85 * lp;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(s.x - 4, ceilY, 8, floorY - ceilY);
        }
        ctx.restore();
    }
}

// 邪神の巨像（1.570・ユーザー指定）。⚠**飾り＝当たり判定なし**（マップの 'I' から設置）。
// ⚠置き場所は**ボス部屋の中ではなく「ボス部屋に入る直前の祭壇」**（巫女の門・列96）。
//   門をくぐる前にこれを見上げる＝「この先がボスだ」と目で分かる、というのが狙い。
// ⚠地形より手前・足場より奥に描く（岩壁から迫り出して立っている見え方）。
// 像が「起きる」時に重ねる赤版スプライト（1.597）。生成画像の**光っている紫の画素だけ**を赤へ置き換えた
// 複製を1度だけ作って使い回す。⚠キャラクターを手続き描画しているのではなく、既存の生成画像の色を
// 置換しているだけ＝絵柄は元のまま。目の位置を狙い撃ちしないので、頭部の目・その下のもう1つの顔の目・
// 胸元の光を取りこぼさない。⚠左右の燭台の炎（UG_IDOL_FLAME_BOX）は紫のまま残す（ユーザー指定）。
var _ugIdolRedCanvas;   // undefined=未生成（スプライト未ロードならこのまま＝次フレームで再挑戦）
function getUgIdolRedCanvas() {
    if (_ugIdolRedCanvas) return _ugIdolRedCanvas;
    var frames = spriteManager.cache['ug_idol'];
    var src = frames && frames[0] && frames[0].normal;
    if (!src || !src.width) return null;
    var w = src.width, h = src.height;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c2 = cv.getContext('2d');
    c2.drawImage(src, 0, 0);
    var im, d;
    try { im = c2.getImageData(0, 0, w, h); d = im.data; } catch (_) { return null; }
    // 炎の箱は画像座標(220×300)基準なので、実際のスプライト解像度へ合わせる
    var sx = w / UG_IDOL_W, sy = h / UG_IDOL_H;
    for (var y = 0; y < h; y++) {
        // この行にかかる炎の箱だけ拾っておく（左右2つとも同じ行に来る）
        var bands = [];
        for (var f = 0; f < UG_IDOL_FLAME_BOX.length; f++) {
            var bx = UG_IDOL_FLAME_BOX[f];
            if (y >= bx.y0 * sy && y <= bx.y1 * sy) bands.push([bx.x0 * sx, bx.x1 * sx]);
        }
        for (var x = 0; x < w; x++) {
            var inFlame = false;
            for (var k = 0; k < bands.length; k++) if (x >= bands[k][0] && x <= bands[k][1]) { inFlame = true; break; }
            if (inFlame) continue;                                      // 炎は紫のまま残す
            var i = (y * w + x) * 4;
            if (!d[i + 3]) continue;
            var r = d[i], g = d[i + 1], b = d[i + 2];
            // 紫らしさ＝赤と青がそろって緑を上回る量。金の王冠や灰色の石はここで弾かれる
            var purple = Math.min(r - g, b - g);
            if (purple <= 4) continue;
            var lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // 「光っている紫」ほど強く赤へ寄せる。暗い紫の石はほとんど変えない＝石は石のまま
            var wgt = Math.min(1, purple / 55) * Math.min(1, lum / 110);
            if (wgt <= 0.02) continue;
            // 赤へ寄せる先。⚠緑と青をしっかり落とさないとサーモン色になって「不穏さ」が出ない（実測して調整）
            var peak = Math.max(r, b);
            d[i]     = r + (peak - r) * wgt;
            d[i + 1] = g + (g * 0.24 - g) * wgt;
            d[i + 2] = b + (Math.min(g, b) * 0.20 - b) * wgt;
        }
    }
    c2.putImageData(im, 0, 0);
    _ugIdolRedCanvas = cv;
    return cv;
}

// 滝（1.611・**演出専用**／ユーザー指定「ただの演出でありギミックではない」）。
// ⚠当たり判定は一切無い＝通り抜けられる。プレイヤーより奥（地形の直後・足場より手前でない）に描く。
// ⚠グラデーションは**高さごとに1つだけ作って使い回す**（毎フレーム createLinearGradient すると
//   滝の本数ぶんアロケーションが増える。エッグ弾のグラデをキャッシュしたのと同じ理由）。
var _ugFallGrad = {};
function drawUgFalls(camL, camR) {
    var fs = undergroundState.falls, i, f;
    if (!fs || !fs.length) return;
    var t = gameState.time;
    for (i = 0; i < fs.length; i++) {
        f = fs[i];
        if (f.x + f.w < camL || f.x > camR) continue;
        // ⚠**滝ごとに save/restore する**。setTransform で行列を組み直すと、画面揺れなど
        //   呼び出し元が積んでいるオフセットを取りこぼす（1.611で一度やりかけた）。
        ctx.save();
        var key = f.h;
        if (!_ugFallGrad[key]) {
            var g = ctx.createLinearGradient(0, 0, 0, f.h);
            g.addColorStop(0.00, 'rgba(150,198,224,0.34)');   // 落ち口＝岩から染み出す
            g.addColorStop(0.12, 'rgba(196,228,242,0.46)');
            g.addColorStop(0.80, 'rgba(178,216,235,0.38)');
            g.addColorStop(1.00, 'rgba(206,234,245,0.22)');   // 着水点はぼかす
            _ugFallGrad[key] = g;
        }
        ctx.translate(f.x, f.y);
        ctx.fillStyle = _ugFallGrad[key];
        ctx.fillRect(0, 0, f.w, f.h);
        // 流れの筋。位相を seed でずらす＝隣の列と揃わないので「幅のある流れ」に見える
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(238,250,255,0.55)';
        ctx.lineWidth = 2;
        for (var k = 3; k < f.w; k += 9) {
            var off = ((t * (3.0 + (k % 3) * 0.6) + f.seed * 13 + k * 29) % (f.h + 60)) - 60;
            ctx.beginPath();
            ctx.moveTo(k, Math.max(0, off));
            ctx.lineTo(k, Math.min(f.h, off + 54));
            ctx.stroke();
        }
        // 着水の水煙
        ctx.globalAlpha = 0.22 + 0.06 * Math.sin(t * 0.06 + f.seed);
        ctx.fillStyle = '#dff2fb';
        ctx.beginPath();
        ctx.ellipse(f.w / 2, f.h, f.w * 0.85, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawUgIdol() {
    var idol = undergroundState.idol;
    if (!idol) return;
    var ix = idol.x, iy = idol.baseY - UG_IDOL_H;                 // 台座の底＝マスの下端＝床の面
    if (ix + UG_IDOL_W < gameState.camera.x - 60 || ix > gameState.camera.x + GAME_WIDTH + 60) return;
    // 像の前を通ると赤くなる（1.597）。0=遠い（紫のまま） / 1=像の前（赤）。updateIdolGaze が距離から決める。
    var gaze = idol.eyeGlow || 0;
    ctx.save();
    // 背後の光（脈打つ）＝「起きている」感じ。⚠光は像の後ろだけ＝手前のプレイヤーを白くしない
    // ⚠近づくと紫→赤へ色そのものを寄せる（後光だけ紫のままだと目や胸元の赤が浮く）
    var mix = function (a, b) { return Math.round(a + (b - a) * gaze); };
    ctx.globalAlpha = 0.30 + 0.12 * Math.sin(gameState.time * 0.05);
    var g = ctx.createRadialGradient(ix + UG_IDOL_W / 2, iy + UG_IDOL_H * 0.42, 20,
                                     ix + UG_IDOL_W / 2, iy + UG_IDOL_H * 0.42, UG_IDOL_W * 0.9);
    g.addColorStop(0, 'rgba(' + mix(150, 240) + ',' + mix(90, 40) + ',' + mix(235, 40) + ',0.85)');
    g.addColorStop(1, 'rgba(' + mix(70, 130) + ',' + mix(25, 10) + ',' + mix(130, 15) + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(ix - UG_IDOL_W * 0.5, iy - 40, UG_IDOL_W * 2, UG_IDOL_H + 80);
    ctx.globalAlpha = 0.88;                                       // わずかに落として岩壁に馴染ませる
    spriteManager.draw(ctx, 'ug_idol', 0, ix, iy, UG_IDOL_W, UG_IDOL_H, false);
    // 赤版を上から重ねてクロスフェード＝発光部分だけが赤く灯る
    if (gaze > 0.01) {
        var red = getUgIdolRedCanvas();
        if (red) {
            // ゆっくり揺らす＝石が脈打って見える。⚠揺れを深くすると下の紫が透けて濁るので浅くする
            var flick = 0.94 + 0.06 * Math.sin(gameState.time * 0.11);
            ctx.globalAlpha = 0.88 * gaze * flick;
            ctx.drawImage(red, ix, iy, UG_IDOL_W, UG_IDOL_H);
            // ⚠1.605: 点いた瞬間だけ**強く閃かせる**（ユーザー指定「いきなり一気に赤くなる」）。
            //   加算合成で赤版をもう一枚重ねる＝発光部分だけが白熱したように跳ねる。
            //   閃きは flashTimer が切れれば消えるので、通常時の見た目は変わらない。
            var ft = idol.flashTimer || 0;
            if (ft > 0) {
                var fp = ft / UG_IDOL_FLASH_FRAMES;              // 1→0
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.85 * fp * fp;                // 二乗で落として「バッと光ってスッと引く」
                ctx.drawImage(red, ix, iy, UG_IDOL_W, UG_IDOL_H);
                // 像の周りにも赤い光を散らす（背後の後光より手前・広がりながら薄れる）
                var fr = UG_IDOL_W * (0.55 + 0.75 * (1 - fp));
                var fg2 = ctx.createRadialGradient(ix + UG_IDOL_W / 2, iy + UG_IDOL_H * 0.30, 0,
                                                   ix + UG_IDOL_W / 2, iy + UG_IDOL_H * 0.30, fr);
                fg2.addColorStop(0, 'rgba(255,70,50,0.55)');
                fg2.addColorStop(1, 'rgba(255,0,0,0)');
                ctx.globalAlpha = 0.9 * fp;
                ctx.fillStyle = fg2;
                ctx.fillRect(ix - UG_IDOL_W, iy - 60, UG_IDOL_W * 3, UG_IDOL_H + 120);
                ctx.globalCompositeOperation = 'source-over';
            }
        }
    }
    ctx.restore();
}

// 画面全体の閃光（1.570・フェーズ移行や大技の瞬間）。⚠**画面座標**なのでワールドの translate の外から呼ぶ。
function drawUgFlash() {
    var ug = undergroundState;
    if (ug.flash <= 0) return;
    var p = ug.flash / (ug.flashMax || 1);
    ctx.save();
    ctx.globalAlpha = Math.min(0.62, p * 0.62);
    ctx.fillStyle = '#d9bcff';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.restore();
}

// ─── 地底クリアの「真のエンディング」（1.584）───
// ⚠**画面座標**で描く＝ワールドの translate の外から呼ぶこと（drawUgDarkChant と同じ扱い）。
// 流れは updateUndergroundBoss の bossPhase 5 が ug.bossTimer で駆動する:
//   〜110F 崩れる ／ 〜300F 洞窟が静まる（燭台が消える=drawUgBraziers・扉が上がる=drawUgBossRoom・ここで光が差す）
//   300F〜 一枚絵をフェードイン → 保持 → フェードアウト → exitUnderground
function drawUgEnding() {
    var ug = undergroundState;
    if (ug.bossPhase !== 5) return;
    var tt = ug.bossTimer;

    // ① 天井から差し込む光（洞窟が静まるのに合わせて強くなる）。一枚絵が出る前だけ。
    var calm = ug.endCalm || 0;
    if (calm > 0 && !ug.ending) {
        var lx = GAME_WIDTH * 0.5, lw = GAME_WIDTH * 0.26;
        ctx.save();
        ctx.globalAlpha = 0.42 * calm;
        var lg = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        lg.addColorStop(0, 'rgba(255,236,180,0.95)');
        lg.addColorStop(1, 'rgba(255,236,180,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();                                  // 上が細く下が広がる光の柱
        ctx.moveTo(lx - lw * 0.30, 0); ctx.lineTo(lx + lw * 0.30, 0);
        ctx.lineTo(lx + lw, GAME_HEIGHT); ctx.lineTo(lx - lw, GAME_HEIGHT);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.18 * calm;                    // 光の中に舞う塵
        ctx.fillStyle = '#fff4d0';
        for (var d = 0; d < 14; d++) {
            var dx = lx + Math.sin(gameState.time * 0.02 + d * 1.7) * lw * 0.8;
            var dy = ((gameState.time * 0.5 + d * 43) % GAME_HEIGHT);
            ctx.fillRect(Math.round(dx), Math.round(dy), 2, 2);
        }
        ctx.restore();
    }

    // ② 一枚絵（フェードイン → 保持 → 白へ覆われる）
    if (!ug.ending) return;
    var e = tt - UG_END_CALM;
    // フェードイン → テロップを読んでいる間は不透明 → 最後の文を送ったら**不透明のまま**（1.588）。
    // ⚠白く覆っていくのは drawGroundReturnFade が上に重ねて描く（ここで a を下げると、白が完全に
    //   覆いきる前に下地が先に透けて見え、絵と文字が先にチラつく）。
    var a = (ug.endOut > 0) ? 1
          : Math.min(1, e / UG_END_SCENE_IN);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);          // 暗幕（画像が無くても演出は成立する）
    // ⚠画像は index.html で先読みしている ugEndingImg。読み込み失敗時は暗幕だけで完結させる
    //   （壊れた画像アイコンを全画面で見せない＝showSobaScene と同じ作法）。
    if (typeof ugEndingImg !== 'undefined' && ugEndingImg.complete && ugEndingImg.naturalWidth > 0) {
        var iw = ugEndingImg.naturalWidth, ih = ugEndingImg.naturalHeight;
        var sc = Math.min(GAME_WIDTH / iw, GAME_HEIGHT / ih);   // contain（切らずに全部見せる）
        var dw = iw * sc, dh = ih * sc;
        ctx.imageSmoothingEnabled = false;                       // ドット絵なので補間しない
        ctx.drawImage(ugEndingImg, (GAME_WIDTH - dw) / 2, (GAME_HEIGHT - dh) / 2, dw, dh);
    }
    // ── テロップ（1.587）: 会話と同じ作法で画面下部に1文ずつ。タップで送る ──
    // ⚠フェードイン中は出さない（絵が見えないうちに文字だけ浮くのを避ける）。
    if (a >= 1 && ug.endLine) {
        var bw = Math.min(GAME_WIDTH - 60, 720), bh = 96;
        var bx = (GAME_WIDTH - bw) / 2, by = GAME_HEIGHT - bh - 26;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(12,6,26,0.86)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#b07cff'; ctx.lineWidth = 2;
        ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
        ctx.font = "16px 'DotGothic16', monospace";
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        var lines = String(t('ug_end_' + ug.endLine)).split('\n');
        for (var li = 0; li < lines.length; li++) ctx.fillText(lines[li], bx + 22, by + 22 + li * 24);
        // 「タップですすむ」＝送れるようになってから点滅で出す
        if ((ug.endLineTimer || 0) >= UG_END_LINE_MIN && ug.endOut <= 0) {
            ctx.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(gameState.time * 0.09));
            ctx.font = "12px 'DotGothic16', monospace";
            ctx.textAlign = 'right'; ctx.fillStyle = '#e4ccff';
            ctx.fillText('\u25B6 ' + t('ug_end_tap'), bx + bw - 18, by + bh - 22);
        }
    }
    ctx.restore();
}

// \u5730\u5E95\u30A8\u30F3\u30C7\u30A3\u30F3\u30B0\u2192\u5730\u4E0A\u5FA9\u5E30\u306E\u767D\u30D5\u30A7\u30FC\u30C9\uFF081.588\uFF09\u3002\u26A0undergroundState.active \u306B\u95A2\u4FC2\u306A\u304F\u6BCE\u30D5\u30EC\u30FC\u30E0\u547C\u3076\u3053\u3068
//   \uFF08\u5730\u4E0A\u306B\u623B\u3063\u305F\u76F4\u5F8C\u306E 'hold'/'in' \u306F\u3001\u5730\u5E95\u306E\u72B6\u614B\u304C\u3082\u3046\u30EA\u30BB\u30C3\u30C8\u3055\u308C\u305F\u5F8C\u3060\u304B\u3089\uFF09\u3002
// \u767D\u3078\u8986\u308F\u308C\u308B(ug.endOut\u30FB\u4E00\u679A\u7D75\u306E\u4E0A\u306B\u91CD\u306D\u308B) \u2192 \u767D\u4E00\u8272\u3067\u9759\u6B62(groundReturnFade.phase='hold') \u2192
//   \u767D\u304B\u3089\u660E\u3051\u308B('in')\u3002**render \u306E\u6700\u5F8C**\u3067\u547C\u3076\uFF1DHUD\u30FB\u30DC\u30B9HP\u30D0\u30FC\u30FB\u30DC\u30B9\u6483\u7834/ROUND \u30C6\u30AD\u30B9\u30C8\u3088\u308A\u4E0A\u306B\u51FA\u3059\u3002
function drawGroundReturnFade() {
    var ug = undergroundState;
    var alpha = 0;
    if (ug.ending && ug.endOut > 0) {
        alpha = 1 - ug.endOut / UG_END_SCENE_OUT;                  // 0\u21921\uFF08\u4E00\u679A\u7D75\u306E\u4E0A\u306B\u767D\u304C\u6E80\u3061\u3066\u3044\u304F\uFF09
    } else if (groundReturnFade.phase === 'hold') {
        alpha = 1;
    } else if (groundReturnFade.phase === 'in') {
        alpha = groundReturnFade.timer / UG_RETURN_FADE_IN;        // 1\u21920\uFF08\u767D\u304B\u3089\u5143\u306E\u8272\u5408\u3044\u3078\uFF09
    }
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.restore();

    // 「ROUND N」テロップ（1.592）。⚠HUD常時表示は「行はいらない」と却下されたので、通常ボスの
    //   撃破後に出る一過性テロップ（bossState.roundTextTimer・render.js「─── ラウンドテキスト ───」）と
    //   同じ体裁に揃える。白一色(hold)の間だけ、台形状（フェードイン→保持→フェードアウト）で出す。
    //   ⚠通常ボス版は gameRound+1（まだ増える前の予告）だが、地底は exitUnderground で既に増えているので +1 しない。
    if (groundReturnFade.phase === 'hold') {
        var elapsed = UG_RETURN_HOLD - groundReturnFade.timer;
        var remaining = groundReturnFade.timer;
        var rAlpha = Math.min(1, elapsed / UG_RETURN_ROUND_FADE, remaining / UG_RETURN_ROUND_FADE);
        if (rAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = rAlpha;
            ctx.font = "bold 50px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#3a2266';                              // 白背景の上で読める濃い紫（通常版の白文字は白背景に沈むため専用色）
            ctx.shadowColor = 'rgba(176,124,255,0.7)'; ctx.shadowBlur = 15;
            ctx.fillText(t('boss_round') + gameRound, GAME_WIDTH / 2, GAME_HEIGHT / 2);
            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }
}

// 大詠唱（P3）＝画面が暗転し、安全地帯が1箇所だけ光る（SPEC §7.2・フクロウの暗転を流用した思想）。
// ⚠**画面座標**で描く＝ワールドの translate の外から呼ぶこと（呼び出しは render の後半）。
function drawUgDarkChant() {
    var d = undergroundState.dark;
    if (!d) return;
    var b = undergroundState.boss;
    // 予告(darkTele)の間に濃くなり、保持(dark)の間は最大のまま
    var p = (b && b.mode === 'darkTele') ? (1 - b.timer / UG_BOSS_DARK_TELE) : 1;
    var sx = d.safeX - gameState.camera.x, hw = UG_BOSS_SAFE_W / 2;
    ctx.save();
    ctx.globalAlpha = 0.92 * p;
    ctx.fillStyle = 'rgba(3,0,12,1)';
    ctx.fillRect(0, 0, sx - hw, GAME_HEIGHT);                   // 安全地帯の左右だけ塗る＝安全地帯は素通しで明るい
    ctx.fillRect(sx + hw, 0, GAME_WIDTH - (sx + hw), GAME_HEIGHT);
    // 安全地帯の縁を光らせる（どこが安全かを線で断言する）
    ctx.globalAlpha = (0.5 + 0.4 * Math.sin(gameState.time * 0.18)) * p;
    var eg = ctx.createLinearGradient(sx - hw, 0, sx + hw, 0);
    eg.addColorStop(0, 'rgba(255,236,160,0.85)');
    eg.addColorStop(0.5, 'rgba(255,236,160,0)');
    eg.addColorStop(1, 'rgba(255,236,160,0.85)');
    ctx.fillStyle = eg;
    ctx.fillRect(sx - hw, 0, hw * 2, GAME_HEIGHT);
    ctx.globalAlpha = p;
    ctx.fillStyle = '#ffec9f';
    ctx.fillRect(sx - hw - 2, 0, 3, GAME_HEIGHT); ctx.fillRect(sx + hw, 0, 3, GAME_HEIGHT);
    // ── 判定後の余韻（1.584）: 結果を暗幕の**上**に重ねて必ず分かるようにする ──
    // ⚠-1 の浮上テキスト(floatEffects)はこの暗幕より先に描かれるので、暗幕が出ている間は見えない。
    //   だから「被弾したか否か」は色で断言する: 被弾=赤／回避成功=金。
    //   暗幕が明けた後も -1 は52フレーム残るので、二段構えで気づける。
    if (d.impact) {
        var ip = d.impact / UG_DARK_IMPACT;
        ctx.globalAlpha = 0.6 * ip;
        ctx.fillStyle = d.hit ? '#ff2b3c' : '#ffe08a';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
    ctx.restore();
}

// シャレコ（骨だけの鳥・1.563）。⚠**図鑑は遭遇では登録しない**（1.474の「倒してないのに載る」是正に従う）。
//   登録は ugCollapseSkully（＝崩壊させた時点）だけ＝プレイヤーの能動的な行動が要る点は撃破と同じ。
function drawSkully(e) {
    var flipH = (e.velX > 0);
    if (e.collapsed) {
        // 再生の予兆（1.563）: 残り UG_SKULLY_WARN フレームでガタガタ震え、紫の燐光が集まる。
        // ⚠予兆なしで復活すると「理不尽に湧いた」になる。必ず「来るぞ」と分かるようにする。
        var warn = e.reviveTimer <= UG_SKULLY_WARN;
        var jit = warn ? Math.round(Math.sin(gameState.time * 1.1) * 2) : 0;
        if (warn) {
            var wp = 1 - e.reviveTimer / UG_SKULLY_WARN;
            ctx.save();
            ctx.globalAlpha = 0.20 + 0.30 * wp * (0.6 + 0.4 * Math.sin(gameState.time * 0.4));
            var gr = ctx.createRadialGradient(e.x + e.width / 2, e.y + e.height * 0.75, 2,
                                              e.x + e.width / 2, e.y + e.height * 0.75, e.width * 0.8);
            gr.addColorStop(0, 'rgba(176,124,255,0.95)');
            gr.addColorStop(1, 'rgba(176,124,255,0)');
            ctx.fillStyle = gr;
            ctx.fillRect(e.x - e.width * 0.4, e.y - e.height * 0.3, e.width * 1.8, e.height * 1.6);
            ctx.restore();
        }
        spriteManager.draw(ctx, 'skully_bones', 0, e.x + jit, e.y, e.width, e.height, flipH);
        return;
    }
    var frameIdx = Math.floor(e.animFrame / 9) % 4;
    spriteManager.draw(ctx, 'skully_walk', frameIdx, e.x, e.y + Math.sin(e.animFrame / 4) * 0.6,
                       e.width, e.height, flipH);
    e.animFrame += frameSteps;
}

function drawFlyingEnemy(e) {
    markZukanSeen(enemyZukanId(e)); // ずかん: 遭遇として発見登録（バイオーム見た目ごとに別エントリ）
    // 上下ふわふわ(e.yの加算)は updateEnemies(index.html) 側へ移設＝当たり判定と描画が常に一致・リフレッシュレート非依存
    var bounce = Math.sin(e.animFrame / 2) * 0.5;
    var cy = e.y + bounce;
    var frameIdx = Math.floor(e.animFrame / 5) % 4;

    var flipH = (e.velX < 0); // 左移動中なら反転して左向きに

    // 急降下型「アカバネ」(1.527): 予告＝着弾マーカー＋本体点滅／降下中＝前傾させて「突っ込んでくる」を伝える
    if (e.type === 'dive_bird' && (e.diveState === 'warn' || e.diveState === 'dive')) {
        drawDiveBirdTelegraph(e);
        if (e.diveState === 'warn' && Math.floor(gameState.time / 4) % 2 === 0) {
            e.animFrame += frameSteps; // 点滅の消灯フレーム（本体を描かない＝予告が目に留まる）
            return;
        }
        if (e.diveState === 'dive') {
            var dcx = e.x + e.width / 2, dcy = cy + e.height / 2;
            ctx.save();
            ctx.translate(dcx, dcy);
            ctx.rotate((flipH ? -1 : 1) * 0.35); // 頭を下へ向けた前傾姿勢
            spriteManager.draw(ctx, e.flySprite, frameIdx, -e.width / 2, -e.height / 2, e.width, e.height, flipH);
            ctx.restore();
            e.animFrame += frameSteps;
            return;
        }
    }

    spriteManager.draw(ctx, e.flySprite || 'flying_chick_fly', frameIdx, e.x, cy, e.width, e.height, flipH);
    e.animFrame += frameSteps;
}

// アカバネの予告表示（1.527）: 落ちてくる先の地面に赤い着弾マーカー＋本体から下へ伸びる照準線。
// ⚠ワールド座標系で描く（ctxはカメラ変換済み・土管部屋では空中敵を描かないので座標系の食い違いは起きない）。
function drawDiveBirdTelegraph(e) {
    var cx = e.x + e.width / 2;
    // ⚠**AI側(updateDiveBird)と同じ関数を使うこと**（1.571）。別々の式にすると照準線の着弾点と
    //   実際の着地点がズレる。terrainTopAt だと地底では天井を拾い、照準線が**上向き**に伸びていた。
    var surf = terrainTopBelow(cx, e.y);
    var gy = (surf !== null ? surf
              : (undergroundState.active ? ugDeathY() : GROUND_Y));
    var warn = (e.diveState === 'warn');
    var pulse = warn ? (0.45 + 0.4 * Math.abs(Math.sin(gameState.time * 0.35))) : 0.55;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff3b3b';
    ctx.lineWidth = 2;
    // 照準線（本体の下端から着弾点まで）
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(cx, e.y + e.height);
    ctx.lineTo(cx, gy - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    // 着弾マーカー
    ctx.fillStyle = 'rgba(255,60,60,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 3, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawGoldenEggSprite(x, y, w, h) {
    if (!goldenEggImg.complete || !goldenEggImg.naturalWidth) return;
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,0,0.9)';
    ctx.shadowBlur = 12 + Math.sin(gameState.time * 0.15) * 4;  // ふわっと発光
    ctx.drawImage(goldenEggImg, x, y, w, h);
    ctx.restore();
}

function drawPowerUp(pu) {
    if (pu.collected) return;
    if (pu.type === 'golden_egg') {
        drawGoldenEggSprite(pu.x, pu.y + Math.sin(gameState.time * 0.1 + pu.floatOffset) * 3, pu.width, pu.height);
        return;
    }
    // 消滅直前の点滅（残り2秒=120f: 速い点滅）
    if (pu.lifetime !== undefined && pu.lifetime <= 120) {
        var blinkRate = pu.lifetime <= 60 ? 4 : 8; // 最後1秒はさらに速く
        if (Math.floor(pu.lifetime / blinkRate) % 2 === 0) return; // 点滅で非表示フレーム
    }
    var fy = pu.y + Math.sin(gameState.time * 0.1 + pu.floatOffset) * 3;
    var spriteName;

    switch (pu.type) {
        case 'lemon_can': spriteName = 'powerup_lemon'; break;
        case 'shield':    spriteName = 'powerup_shield'; break;
        case 'heart':     spriteName = 'powerup_heart'; break;
        case 'energy':    spriteName = 'powerup_energy'; break;
        case 'magnet':    spriteName = 'powerup_magnet'; break;
        default: return;
    }

    // 消えかけ半透明（残り3秒以下で徐々に薄く）
    if (pu.lifetime !== undefined && pu.lifetime <= 180) {
        ctx.globalAlpha = Math.max(0.3, pu.lifetime / 180);
    }
    spriteManager.draw(ctx, spriteName, 0, pu.x, fy, pu.width, pu.height, false);
    if (pu.lifetime !== undefined && pu.lifetime <= 180) {
        ctx.globalAlpha = 1;
    }
    pu.animFrame += frameSteps;
}

function drawBullet(b) {
    ctx.save();
    if (b.isZap) {
        // きぐるみのエネルギー弾（水色の発光オーブ）。旧=青白い稲妻の電気弾→1.497でエネルギー攻撃に変更
        // （「黄色ネズミ＋電気」=ピカチュウ連想の回避。稲妻ビジュアルもオーブに置換）。
        var zx = b.x + b.width / 2, zy = b.y + b.height / 2;
        ctx.shadowColor = '#7fe6ff'; ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(127,230,255,0.5)';                 // 外側グロー
        ctx.beginPath(); ctx.arc(zx, zy, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#bff2ff';                               // 本体
        ctx.beginPath(); ctx.arc(zx, zy, 4.4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 6; ctx.fillStyle = '#ffffff';           // 白コア
        ctx.beginPath(); ctx.arc(zx, zy, 2, 0, Math.PI * 2); ctx.fill();
    } else if (b.isDrone) {
        // サイバーぴよのドローンレーザー（金色の発光オーブ・1.520）。ザップ弾の白×金パレット版（スーツとお揃い）
        var dbx = b.x + b.width / 2, dby = b.y + b.height / 2;
        ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(255,215,94,0.5)';                  // 外側グロー
        ctx.beginPath(); ctx.arc(dbx, dby, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe9a8';                               // 本体
        ctx.beginPath(); ctx.arc(dbx, dby, 4.4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 6; ctx.fillStyle = '#ffffff';           // 白コア
        ctx.beginPath(); ctx.arc(dbx, dby, 2, 0, Math.PI * 2); ctx.fill();
    } else if (b.isShuriken) {
        // 忍者の手裏剣（グレー・回転・薄い発光=夜ステージでの視認性）。グローを焼き込んだスプライトを再利用（毎フレームのshadowBlur回避・監査LOW）
        var shx = b.x + b.width / 2, shy = b.y + b.height / 2;
        ctx.translate(shx, shy);
        ctx.rotate(b.spin || 0);
        var gsh = getGlowBulletSprite('shuriken', b.width, b.height, '#dfe7ee', 7);
        if (gsh) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(gsh.normal, -b.width / 2 - gsh.pad, -b.height / 2 - gsh.pad);
        } else {
            ctx.shadowColor = '#dfe7ee'; ctx.shadowBlur = 7;
            spriteManager.draw(ctx, 'shuriken', 0, -b.width / 2, -b.height / 2, b.width, b.height, false);
        }
    } else {
        // エナジー弾（発光）。グローを焼き込んだスプライトを再利用（監査LOW）
        var ge = getGlowBulletSprite('bullet_energy', b.width, b.height, '#ff6600', 12);
        if (ge) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(b.dir < 0 ? ge.flipped : ge.normal, b.x - ge.pad, b.y - ge.pad);
        } else {
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 12;
            spriteManager.draw(ctx, 'bullet_energy', 0, b.x, b.y, b.width, b.height, b.dir < 0);
        }
    }
    ctx.restore();
}

// サイバーぴよのドローンビット（1.520）: プレイヤー随伴の丸型機。位置は index.html updateBullets が毎tick更新。
// ワールド座標系（カメラtranslate適用済みの区間から呼ぶ）。土管部屋/出入り演出中は非表示。
function drawCyberDrone() {
    if (typeof SKIN_FEATURE_ENABLED === 'undefined' || !SKIN_FEATURE_ENABLED || runActiveSkin() !== 'cyber') return;
    if (pipeRoomState.active || pipeRoomState.anim === 'in' || pipeRoomState.anim === 'outWorld') return;
    if (gameState.droneX === undefined) return;
    var s = CYBER_DRONE_SIZE;
    var bob = Math.sin(gameState.time * 0.1) * 3; // ふわふわ（描画時のみ・物理位置は滑らか追従のまま）
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    spriteManager.draw(ctx, 'cyber_drone', 0, gameState.droneX - s / 2, gameState.droneY - s / 2 + bob, s, s, player.facing === 'left');
    ctx.restore();
}

function drawBoss(b) {
    ctx.save();
    var isHawk = b.kind === 'hawk';
    var flipH = b.facing === 'right';
    var bounce = Math.sin(b.animFrame * 0.08) * 3;
    var drawY = b.y + bounce;
    // 影（空中ボスは薄く小さめ／大蛇は地面の穴＋突き上げ予告）
    if (b.kind === 'snake') {
        var shx = b.x + b.width / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.ellipse(shx, GROUND_Y + 3, b.width * 0.3, 9, 0, 0, Math.PI * 2); ctx.fill();
        if (b.serpMode === 'telegraph') { // 突き上げ位置を危険ゾーン＋土煙で予告（ここから離れれば回避）
            var wp = 0.55 + Math.sin(b.animFrame * 0.5) * 0.35;
            ctx.save();
            ctx.globalAlpha = wp * 0.5;   // 危険ゾーンの赤い塗り
            ctx.fillStyle = '#ff2a2a';
            ctx.beginPath(); ctx.ellipse(shx, GROUND_Y + 2, b.width * 0.36, 13, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = wp;         // 明滅する赤リング
            ctx.strokeStyle = '#ff5555'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.ellipse(shx, GROUND_Y + 2, b.width * 0.36, 13, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = wp * 0.9;   // 噴き上がる土煙
            ctx.fillStyle = '#8a6a44';
            for (var di = 0; di < 6; di++) {
                var ddx = shx - 10 + Math.sin(b.animFrame * 0.35 + di * 1.4) * b.width * 0.28;
                var ddy = GROUND_Y - 6 - (Math.floor(b.animFrame * 0.4 + di * 3) % 16);
                ctx.fillRect(ddx, ddy, 5, 5);
            }
            ctx.restore();
        }
    } else {
        var aerial = isHawk || b.kind === 'owl'; // 空中ボスは薄く小さめの影
        ctx.fillStyle = aerial ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(b.x + b.width / 2, GROUND_Y + 2, b.width * (aerial ? 0.26 : 0.4), aerial ? 6 : 8, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // 踏み無敵時の点滅 + 怒り時の赤点滅
    if (b.stompCooldown > 0 && Math.floor(b.animFrame / 3) % 2 === 0) {
        ctx.globalAlpha = 0.35;
    } else if (b.isAngry && Math.floor(b.animFrame / 4) % 2 === 0) {
        ctx.globalAlpha = 0.7;
    }
    // ボス本体スプライト（kindでシート切替: 地上=boss_rooster / 空中=boss_hawk / 装甲卵=boss_egg[回転]）
    if (b.kind === 'egg') {
        // 装甲卵: 転がり=回転で描画（立ち絵1枚を回す）
        var ecx = b.x + b.width / 2, ecy = drawY + b.height / 2;
        ctx.save();
        ctx.translate(ecx, ecy);
        ctx.rotate(b.rollAngle || 0);
        spriteManager.draw(ctx, 'boss_egg', 0, -b.width / 2, -b.height / 2, b.width, b.height, false);
        ctx.restore();
        // 弱点露出中: コア/ヒビを光らせる overlay（＝ここが踏みチャンス）
        if (b.exposed) {
            var gpulse = 0.5 + Math.sin(b.animFrame * 0.35) * 0.35;
            ctx.save();
            ctx.globalAlpha = gpulse;
            var ggrd = ctx.createRadialGradient(ecx, ecy, 4, ecx, ecy, b.width * 0.5);
            ggrd.addColorStop(0, 'rgba(255,130,255,0.95)');
            ggrd.addColorStop(0.5, 'rgba(200,60,255,0.5)');
            ggrd.addColorStop(1, 'rgba(150,0,255,0)');
            ctx.fillStyle = ggrd;
            ctx.beginPath();
            ctx.ellipse(ecx, ecy, b.width * 0.42, b.height * 0.46, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else if (b.kind === 'snake') {
        // 大蛇: 頭がheadYに来る縦スプライトを、地面(GROUND_Y)より上だけ描画＝地面から生えてくる演出
        if (b.headY < GROUND_Y - 2) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(b.x - 12, b.headY - 6, b.width + 24, GROUND_Y - b.headY + 6);
            ctx.clip();
            spriteManager.draw(ctx, 'boss_snake', 0, b.x, b.headY, b.width, b.height, flipH);
            ctx.restore();
        }
    } else if (b.kind === 'owl') {
        spriteManager.draw(ctx, 'boss_owl', 0, b.x, drawY, b.width, b.height, flipH);
    } else if (b.kind === 'scarecrow') {
        drawScarecrow(b, drawY);
    } else {
        spriteManager.draw(ctx, isHawk ? 'boss_hawk' : (b.hiyoko ? 'boss_hiyoko' : 'boss_rooster'), b.spriteFrame, b.x, drawY, b.width, b.height, flipH);
    }
    // 怒り赤オーバーレイ（楕円放射グラデーション）※大蛇は頭が地上に出ている時だけ（地中で地面下に描かない）
    if (b.isAngry && (b.kind !== 'snake' || b.headY < GROUND_Y - 20)) {
        var acx = b.x + b.width / 2;
        var acy = (b.kind === 'snake') ? b.headY + b.height * 0.3 : drawY + b.height * 0.45;
        var arx = b.width * 0.55;
        var ary = b.height * 0.48;
        ctx.globalAlpha = 0.25 + Math.sin(b.animFrame * 0.3) * 0.15;
        var agrd = ctx.createRadialGradient(acx, acy, arx * 0.1, acx, acy, arx);
        agrd.addColorStop(0, 'rgba(255,50,0,0.7)');
        agrd.addColorStop(0.6, 'rgba(255,0,0,0.3)');
        agrd.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = agrd;
        ctx.beginPath();
        ctx.ellipse(acx, acy, arx, ary, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    // 空中ボス: ダイブ予兆（落下地点を警告して「横に避ける」を促す）
    if (isHawk && b.hawkMode === 'charge') {
        var hx = b.x + b.width / 2;
        var pulse = 0.35 + Math.sin(b.animFrame * 0.4) * 0.25;
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#ff3030';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(hx, drawY + b.height * 0.6);
        ctx.lineTo(hx, GROUND_Y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = Math.min(1, pulse + 0.3);
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.moveTo(hx - 12, GROUND_Y - 2);
        ctx.lineTo(hx + 12, GROUND_Y - 2);
        ctx.lineTo(hx, GROUND_Y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    // 閃光チャージエフェクト（白い光がボスに集まる）
    if (b.isCharging) {
        var ccx = b.x + b.width / 2;
        var ccy = drawY + b.height * 0.4;
        var chargeProgress = 1 - (b.chargeTimer / 50); // 0→1
        var glowSize = 40 + chargeProgress * 80;
        // 外側の白い光輪
        ctx.globalAlpha = 0.3 + chargeProgress * 0.5;
        var cgrd = ctx.createRadialGradient(ccx, ccy, 5, ccx, ccy, glowSize);
        cgrd.addColorStop(0, 'rgba(255,255,200,0.9)');
        cgrd.addColorStop(0.4, 'rgba(255,255,100,0.5)');
        cgrd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cgrd;
        ctx.beginPath();
        ctx.arc(ccx, ccy, glowSize, 0, Math.PI * 2);
        ctx.fill();
        // 収束する光線パーティクル
        ctx.globalAlpha = 0.6 + chargeProgress * 0.4;
        for (var ci = 0; ci < 8; ci++) {
            var cAngle = (ci / 8) * Math.PI * 2 + b.animFrame * 0.15;
            var cDist = (1 - chargeProgress) * 80 + 15;
            var cpx = ccx + Math.cos(cAngle) * cDist;
            var cpy = ccy + Math.sin(cAngle) * cDist;
            ctx.fillStyle = '#ffffcc';
            ctx.beginPath();
            ctx.arc(cpx, cpy, 2 + chargeProgress * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        // 「！」警告マーク
        if (chargeProgress > 0.3) {
            ctx.globalAlpha = Math.min(1, (chargeProgress - 0.3) * 2);
            ctx.font = "bold 28px 'M PLUS Rounded 1c', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff0000';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 10;
            ctx.fillText('！', ccx, drawY - 15);
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();
}

// ボスの立ち絵を「白いシルエット」にしたキャンバスを返す（1.550・予告の発光用）。
// 立ち絵を描いてから source-atop で白を塗る＝不透明部分だけが白くなる＝輪郭どおりに光る。
// ⚠スプライトは非同期読み込みなので、未ロードならnullを返して呼び出し側で描画をスキップさせる
//   （空のキャンバスをキャッシュすると、以後ずっと光らなくなる）。
var _bossWhiteCache = {};
function getBossWhiteSilhouette(name, w, h, color) {
    var frames = spriteManager.cache[name];
    if (!frames || !frames.length || !frames[0]) return null;
    var col = color || '#ffffff';
    var cw = Math.max(1, Math.round(w)), ch = Math.max(1, Math.round(h));
    var key = name + '_' + col;
    var c = _bossWhiteCache[key];
    if (c && c.w === cw && c.h === ch) return c.cv;
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var cc = cv.getContext('2d');
    cc.imageSmoothingEnabled = false;
    spriteManager.draw(cc, name, 0, 0, 0, cw, ch, false);
    cc.globalCompositeOperation = 'source-atop';
    cc.fillStyle = col;
    cc.fillRect(0, 0, cw, ch);
    _bossWhiteCache[key] = { w: cw, h: ch, cv: cv };
    return cv;
}

// ─── 闇のカカシ（scarecrow）の描画：OpenAI立ち絵1枚＋procedural overlay（露出グロー/腕薙ぎ赤帯）───
// 定点・正面向き。expose中だけ頭が光って踏み/弾が通る（非露出は装甲＝弾かれる）。他の単一立ち絵ボス(owl/egg)と同系統。
function drawScarecrow(b, drawY) {
    // 腕薙ぎの予告/発動＝地面付近の赤い危険帯（ジャンプor足場で回避を伝える）
    if (b.scMode === 'sweepTele' || b.scMode === 'sweep') {
        var active = (b.scMode === 'sweep');
        var pulse = active ? 0.5 : (0.3 + Math.abs(Math.sin(b.animFrame * 0.4)) * 0.25);
        ctx.save(); ctx.globalAlpha = pulse; ctx.fillStyle = active ? '#ff3a3a' : '#ff6a6a';
        ctx.fillRect(bossState.arenaLeft, GROUND_Y - SC_SWEEP_BAND_Y, bossState.arenaRight - bossState.arenaLeft, SC_SWEEP_BAND_Y);
        ctx.restore();
    }
    // 対空「藁の棘」（1.550でリニューアル）。⚠旧版は頭上に黄色い**長方形**を敷いていたが「四角形でダサい」との
    //   ユーザー指摘により廃止。代わりに①カカシ本体が白く発光して予告 ②棘が下から伸びてくる、の2段構えにした。
    //   予告でも棘の位置が見える＝「どこが危ないか」は長方形より正確に伝わる（真上に居座らせない意図は維持）。
    var spikeTele = (b.scMode === 'spikeTele'), spikeOn = (b.scMode === 'spike');
    if (spikeTele || spikeOn) {
        var sx = b.x - SC_SPIKE_PAD, sw = b.width + SC_SPIKE_PAD * 2;
        var sTopY = drawY - SC_SPIKE_H, sBaseY = drawY + b.height * 0.28;
        // 予告中は棘が伸びる途中（0→1）。発動で全長
        var grow = spikeOn ? 1 : Math.max(0, Math.min(1, 1 - (b.scTimer / SC_SPIKE_TELEGRAPH)));
        // ⚠予告中の棘は「これから生える」程度に留める（伸びきると発動と見分けがつかず回避判断を誤らせる）
        var tipY = sBaseY - (sBaseY - (sTopY + 10)) * (spikeOn ? 1 : grow * 0.35);
        ctx.save();
        ctx.globalAlpha = spikeOn ? 1 : (0.25 + grow * 0.35);
        ctx.fillStyle = spikeOn ? '#f2c14e' : '#ffe9a8';
        for (var si = 0; si < 7; si++) {
            var sbx = sx + (sw / 7) * (si + 0.5), sHalf = spikeOn ? 7 : 4 + grow * 3;
            ctx.beginPath();
            ctx.moveTo(sbx - sHalf, sBaseY); ctx.lineTo(sbx, tipY); ctx.lineTo(sbx + sHalf, sBaseY);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
    // 召喚の予告（1.558）。⚠これまで summonTele には描画が一切無く、攻撃モーションも無いため
    //   「召喚していることに気づけない」とユーザー報告。**足元の魔法陣＋吸い上がる闇の粒**で可視化する
    //   （対空=白、横薙ぎ=赤 に対し 召喚=紫 と色で役割を分ける）。
    if (b.scMode === 'summonTele') {
        var sp = 1 - Math.max(0, Math.min(1, b.scTimer / Math.max(1, SC_SUMMON_TELE)));  // 0→1で溜まる
        var mcx = b.x + b.width / 2;
        ctx.save();
        // 足元の魔法陣（二重の楕円・回転）
        ctx.globalAlpha = 0.35 + sp * 0.45;
        ctx.strokeStyle = '#b06cff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(mcx, GROUND_Y - 4, b.width * (0.32 + sp * 0.38), 12 + sp * 8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#5e2a99'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(mcx, GROUND_Y - 4, b.width * (0.20 + sp * 0.26), 8 + sp * 5, 0, 0, Math.PI * 2); ctx.stroke();
        // 陣から吸い上がる闇の粒（2pxグリッドでドットの粒を揃える）
        ctx.fillStyle = '#c98cff';
        for (var mi = 0; mi < 8; mi++) {
            var mph = ((gameState.time * 2.2 + mi * 19) % 60) / 60;
            var mang = (mi / 8) * Math.PI * 2;
            var mx = mcx + Math.cos(mang) * b.width * (0.34 - mph * 0.24);
            var my = GROUND_Y - 4 - mph * (b.height * 0.55);
            ctx.globalAlpha = (0.3 + sp * 0.5) * (1 - mph);
            ctx.fillRect(Math.round(mx / 2) * 2, Math.round(my / 2) * 2, 3, 3);
        }
        ctx.restore();
    }
    // 立ち絵本体
    spriteManager.draw(ctx, 'boss_scarecrow', 0, b.x, drawY, b.width, b.height, false);
    // 召喚の溜め＝本体を紫に発光させる（対空の白と役割で色分け）
    if (b.scMode === 'summonTele') {
        var pur = getBossWhiteSilhouette('boss_scarecrow', b.width, b.height, '#9b4dff');
        if (pur) {
            var sp2 = 1 - Math.max(0, Math.min(1, b.scTimer / Math.max(1, SC_SUMMON_TELE)));
            ctx.save();
            ctx.globalAlpha = Math.min(0.85, (0.25 + sp2 * 0.45) * (0.75 + Math.abs(Math.sin(b.animFrame * 0.4)) * 0.25));
            ctx.drawImage(pur, b.x, drawY, b.width, b.height);
            ctx.restore();
        }
    }
    // 対空の予告＝**本体が白く光る**（ユーザー指定1.550）。立ち絵の不透明部分だけを白で塗ったシルエットを
    // 重ねる＝輪郭どおりに発光する。⚠シルエットはサイズ変化時だけ作り直してキャッシュ（毎フレーム生成しない）。
    if (spikeTele || spikeOn) {
        var wht = getBossWhiteSilhouette('boss_scarecrow', b.width, b.height);
        if (wht) {
            ctx.save();
            // ⚠予告の1フレーム目から必ず明るく光らせる（1.551）。旧版は b.animFrame の sin をそのまま使っていたため、
            //   予告開始のタイミング次第では暗い位相から始まり「光ったと同時に攻撃が来た」ように見えていた。
            //   ベースを予告の進行(grow)で単調に上げ、そこへ明滅を乗せる＝開始直後から確実に見える。
            ctx.globalAlpha = spikeOn ? 0.30
                : Math.min(0.95, (0.45 + grow * 0.35) * (0.7 + Math.abs(Math.sin(b.animFrame * 0.5)) * 0.3));
            ctx.drawImage(wht, b.x, drawY, b.width, b.height);
            ctx.restore();
        }
    }
    // 露出の予兆＝頭(上部)に弱点グロー。headLow(0→1)でランプ＝expose移行中からじわっと光る。
    var glowAmt = b.exposed ? 1 : (b.headLow || 0);
    if (glowAmt > 0.05) {
        var hx = b.x + b.width / 2, hy = drawY + b.height * 0.24;
        var gp = glowAmt * (0.55 + Math.sin(b.animFrame * 0.35) * 0.35);
        ctx.save(); ctx.globalAlpha = Math.max(0, gp);
        var gg = ctx.createRadialGradient(hx, hy, 4, hx, hy, b.width * 0.36);
        gg.addColorStop(0, 'rgba(255,140,90,0.95)'); gg.addColorStop(0.55, 'rgba(255,50,40,0.45)'); gg.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(hx, hy, b.width * 0.32, b.height * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

function drawEggProjectiles() {
    for (var i = 0; i < bossState.eggs.length; i++) {
        var egg = bossState.eggs[i];
        ctx.save();
        if (egg.isFlame) {
            // 闇の炎弾
            var fx = egg.x + egg.width / 2;
            var fy = egg.y + egg.height / 2;
            var flicker = Math.sin(egg.timer * 0.5) * 2;
            // 闇の巫女の呪弾（1.570）だけ**尾を引く彗星**にする。⚠見た目だけ＝当たり判定は元の16pxのまま。
            //   飛んできた方向が尾で分かる＝どこへ避ければいいかが一目で読める（派手さと親切さの両立）。
            if (egg.isCurse) {
                var sp = Math.sqrt(egg.velX * egg.velX + egg.velY * egg.velY) || 1;
                var tx = -egg.velX / sp, ty = -egg.velY / sp;
                ctx.save();
                for (var ti = 1; ti <= 6; ti++) {
                    ctx.globalAlpha = 0.30 * (1 - ti / 7);
                    ctx.fillStyle = (ti % 2) ? '#c9a4ff' : '#7a4ad0';
                    ctx.beginPath();
                    ctx.arc(fx + tx * ti * 7, fy + ty * ti * 7, 7 - ti * 0.9, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
            // 外側の闇オーラ（色停止定数・中心均一→原点に1度だけ生成し translate+scale で再利用。flickerの膨張も保持・監査LOW）
            if (!_flameEggGrad) {
                _flameEggGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
                _flameEggGrad.addColorStop(0, 'rgba(180,60,255,0.9)');
                _flameEggGrad.addColorStop(0.5, 'rgba(80,0,160,0.6)');
                _flameEggGrad.addColorStop(1, 'rgba(30,0,50,0)');
            }
            var _fs = (14 + flicker) / 14;
            ctx.save();
            ctx.translate(fx, fy); ctx.scale(_fs, _fs);
            ctx.fillStyle = _flameEggGrad;
            ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // 内側の炎コア
            ctx.fillStyle = '#cc44ff';
            ctx.beginPath();
            ctx.arc(fx, fy, 5 + flicker * 0.5, 0, Math.PI * 2);
            ctx.fill();
            // 白い中心
            ctx.fillStyle = 'rgba(255,200,255,0.8)';
            ctx.beginPath();
            ctx.arc(fx, fy, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (egg.isFeather) {
            // 羽根弾（進行方向へ向けた暗紫のダート＋赤い先端）
            var fex = egg.x + egg.width / 2, fey = egg.y + egg.height / 2;
            ctx.translate(fex, fey);
            ctx.rotate(Math.atan2(egg.velY, egg.velX));
            ctx.fillStyle = '#2a1840';
            ctx.beginPath();
            ctx.moveTo(9, 0); ctx.lineTo(-7, 4); ctx.lineTo(-4, 0); ctx.lineTo(-7, -4);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#c0344e';
            ctx.beginPath();
            ctx.moveTo(9, 0); ctx.lineTo(2, 2); ctx.lineTo(2, -2);
            ctx.closePath(); ctx.fill();
        } else if (egg.isShard) {
            // 殻の破片（叩きつけで飛散するギザギザの欠片・回転しながら飛ぶ）
            var sx = egg.x + egg.width / 2, sy = egg.y + egg.height / 2;
            ctx.translate(sx, sy);
            ctx.rotate((egg.rot0 || 0) + egg.timer * (egg.rotSpeed || 0.2));
            ctx.fillStyle = '#f0dcae';
            ctx.strokeStyle = '#b89050';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-6, -3); ctx.lineTo(5, -5); ctx.lineTo(6, 4); ctx.lineTo(-2, 6); ctx.lineTo(-6, 2);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = 'rgba(120,90,50,0.55)';
            ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(1, 3); ctx.stroke();
        } else {
            // 通常の卵弾
            ctx.fillStyle = '#ffe8c0';
            ctx.strokeStyle = '#c0a060';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(egg.x + egg.width / 2, egg.y + egg.height / 2,
                        egg.width / 2, egg.height / 2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath();
            ctx.ellipse(egg.x + egg.width * 0.35, egg.y + egg.height * 0.3,
                        3, 4, -0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// 背景グラデーションのキャッシュ
var bgCache = null;
// ボス戦専用背景の空色（暗紫〜暗赤のグラデーション）
var BOSS_SKY = ['#0a0018', '#120028', '#1a0030', '#200020', '#180010'];

function getBgCache() {
    if (bgCache) return bgCache;
    bgCache = document.createElement('canvas');
    bgCache.width = GAME_WIDTH;
    bgCache.height = GAME_HEIGHT;
    var bc = bgCache.getContext('2d');
    var grad = bc.createLinearGradient(0, 0, 0, GAME_HEIGHT);

    var sky;
    if (bossState.active && bossState.phase >= 2) {
        // ボス戦専用背景
        sky = BOSS_SKY;
    } else if (biomeState.transition > 0 && biomeState.transition < 1) {
        // バイオーム対応: 遷移中は前後のグラデーションを補間
        var prevSky = BIOME_CONFIGS[biomeState.previous].sky;
        var nextSky = BIOME_CONFIGS[biomeState.current].sky;
        sky = [];
        for (var si = 0; si < 5; si++) {
            sky.push(lerpColor(prevSky[si], nextSky[si], biomeState.transition));
        }
    } else {
        sky = BIOME_CONFIGS[biomeState.current].sky;
    }

    grad.addColorStop(0,    sky[0]);
    grad.addColorStop(0.25, sky[1]);
    grad.addColorStop(0.5,  sky[2]);
    grad.addColorStop(0.75, sky[3]);
    grad.addColorStop(1,    sky[4]);
    bc.fillStyle = grad;
    bc.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    return bgCache;
}

// DOM参照キャッシュ
var uiElements = {};
function cacheUIElements() {
    uiElements.distance = document.getElementById('distance');
    uiElements.score = document.getElementById('score');
    uiElements.lives = document.getElementById('lives');
    uiElements.crystalLives = document.getElementById('crystalLives');
    uiElements.enemyKills = document.getElementById('enemyKills');
    uiElements.speedLevel = document.getElementById('speedLevel');
    uiElements.speedPercent = document.getElementById('speedPercent');
    uiElements.nextSpeedUp = document.getElementById('nextSpeedUp');
    uiElements.reviveIndicator = document.getElementById('reviveIndicator');
    uiElements.goldenEggCount = document.getElementById('goldenEggCount');
}
var prevUI = {};

// B-2: パワーアップHUDの定義は毎フレーム作り直すとGC負荷になるため、静的データはここで1度だけ確保する。
// 可変分（残り時間=gameState[key]、ラベル=t(labelKey)）は render 内で都度参照する。
var PU_HUD_DEFS = [
    { key: 'puLemon',  max: 300, labelKey: 'hud_jump',   color1: '#44dd44', color2: '#88ff88', text: '#aaffaa', bg: 'rgba(20,60,20,0.85)', border: '#66ff66' },
    { key: 'puShield', max: 300, labelKey: 'hud_shield', color1: '#4488ff', color2: '#88bbff', text: '#aaccff', bg: 'rgba(20,20,70,0.85)', border: '#66aaff' },
    { key: 'puEnergy', max: 480, labelKey: 'hud_energy', color1: '#ff6622', color2: '#ffaa44', text: '#ffcc88', bg: 'rgba(70,25,10,0.85)', border: '#ff8844' },
    { key: 'puMagnet', max: 600, labelKey: 'hud_magnet', color1: '#aa44ff', color2: '#cc88ff', text: '#ddaaff', bg: 'rgba(50,15,70,0.85)', border: '#cc66ff' }
];

// 土管部屋: ドロップした販売アイテム（アイコン画像）を描く
function drawRoomShopItem(it) {
    var img = roomItemImg[it.itemId];
    var fy = it.y + Math.sin(gameState.time * 0.1 + (it.floatOffset || 0)) * 3;
    if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, it.x, fy, it.width, it.height);
    } else {
        ctx.fillStyle = '#88ccff'; ctx.fillRect(it.x, fy, it.width, it.height);
    }
}

// ラッキーの間の宝箱（手続き描画・1.452〜）。閉=ぷかぷか＋グロー＋"?"、開=フタが後ろへ持ち上がり中身が光る、消滅=縮んでフェード。
// 素材差し替え時はこの関数を drawImage 1枚に置き換えるだけ（判定/配置は gameplay 側で不変）。
function drawChest(it) {
    var x = it.x, y = it.y, w = it.width, h = it.height;
    if (it.vanishing) { // 選ばれなかった2つ: 縮んでフェード
        it.vanishTimer += frameSteps;
        var vp = Math.min(1, it.vanishTimer / 22);
        if (vp >= 1) { it.collected = true; return; } // 消滅完了（collected=trueで両ループがスキップ）
        ctx.save();
        ctx.globalAlpha = 1 - vp;
        var sc = 1 - vp * 0.5;
        ctx.translate(x + w / 2, y + h);
        ctx.scale(sc, sc);
        ctx.translate(-(x + w / 2), -(y + h));
        drawChestBody(x, y, w, h, 0);
        ctx.restore();
        return;
    }
    var lidOpen = 0;
    if (it.opened) { it.openTimer += frameSteps; lidOpen = Math.min(1, it.openTimer / 12); }
    var bob = it.opened ? 0 : Math.sin(gameState.time * 0.08 + (it.floatOffset || 0)) * 3;
    // 未開封は誘目グロー
    if (!it.opened && !pipeRoomState.chestPicked) {
        var gl = 0.28 + Math.sin(gameState.time * 0.1 + (it.floatOffset || 0)) * 0.14;
        ctx.save(); ctx.globalAlpha = gl;
        var rg = ctx.createRadialGradient(x + w / 2, y + h / 2 + bob, 4, x + w / 2, y + h / 2 + bob, w * 0.85);
        rg.addColorStop(0, 'rgba(255,225,130,0.85)'); rg.addColorStop(1, 'rgba(255,225,130,0)');
        ctx.fillStyle = rg; ctx.fillRect(x - w * 0.4, y - h * 0.6 + bob, w * 1.8, h * 1.9); ctx.restore();
    }
    drawChestBody(x, y + bob, w, h, lidOpen);
    // 未開封は "?" を上でチカチカ
    if (!it.opened && !pipeRoomState.chestPicked) {
        ctx.save();
        ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + Math.sin(gameState.time * 0.12 + (it.floatOffset || 0)) * 0.3).toFixed(2) + ')';
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3;
        ctx.fillText('?', x + w / 2, y - 14 + bob);
        ctx.restore();
    }
}

// 宝箱本体の描画（lidOpen 0..1 でフタが後ろへ持ち上がる）。
function drawChestBody(x, y, w, h, lidOpen) {
    var lidH = h * 0.42;
    var bodyY = y + lidH * 0.5, bodyH = h - lidH * 0.5;
    // 接地影
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 2, w * 0.5, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 本体（木箱）
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(x, bodyY, w, bodyH);
    ctx.fillStyle = '#5e3717'; ctx.fillRect(x, bodyY + bodyH - 6, w, 6);      // 底の暗がり
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(x, bodyY, w, 4);                   // 上辺ハイライト
    // 縦の金具
    ctx.fillStyle = '#e9b23a'; ctx.fillRect(x + 7, bodyY, 6, bodyH); ctx.fillRect(x + w - 13, bodyY, 6, bodyH);
    // 開いた中身（光）＋光の柱
    if (lidOpen > 0) {
        var glowY = bodyY + 2;
        ctx.save();
        ctx.fillStyle = 'rgba(255,242,175,' + (0.5 + 0.5 * lidOpen).toFixed(2) + ')';
        ctx.fillRect(x + 9, glowY, w - 18, 8 + lidOpen * 6);
        ctx.globalAlpha = 0.5 * lidOpen;
        var lg = ctx.createLinearGradient(0, glowY - 46, 0, glowY);
        lg.addColorStop(0, 'rgba(255,242,175,0)'); lg.addColorStop(1, 'rgba(255,242,175,0.85)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(x + 10, glowY); ctx.lineTo(x + w - 10, glowY); ctx.lineTo(x + w - 2, glowY - 46); ctx.lineTo(x + 2, glowY - 46); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    // フタ（開くと後ろへ持ち上がる＝上へ移動＆薄くなる）
    var lidTopY = y - lidOpen * (lidH + 6);
    var lidCurH = lidH * (1 - lidOpen * 0.55);
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(x - 2, lidTopY, w + 4, lidCurH);
    ctx.beginPath();                                                          // フタの丸み（上辺）
    ctx.fillStyle = '#8a5a2e';
    ctx.moveTo(x - 2, lidTopY);
    ctx.quadraticCurveTo(x + w / 2, lidTopY - 8 * (1 - lidOpen * 0.5), x + w + 2, lidTopY);
    ctx.fill();
    ctx.fillStyle = '#e9b23a';                                               // フタの金具
    ctx.fillRect(x + 7, lidTopY, 6, lidCurH); ctx.fillRect(x + w - 13, lidTopY, 6, lidCurH);
    ctx.fillRect(x - 2, lidTopY + lidCurH - 4, w + 4, 4);                    // フタ下辺の帯
    // 錠前（ほぼ閉じている時だけ）
    if (lidOpen < 0.25) {
        ctx.fillStyle = '#ffd766'; ctx.fillRect(x + w / 2 - 6, bodyY - 3, 12, 12);
        ctx.fillStyle = '#7a5310'; ctx.fillRect(x + w / 2 - 2, bodyY + 2, 4, 5); // 鍵穴
    }
}

// 宝箱開封の演出（リング＋金スパーク）。lifeup_ring / combo_spark / goldenegg_ring を再利用（新レンダラー不要）。
// big=true（やくそう/ふっかつやくの大当たり）は二重リング＋スパーク増量で豪華に。
function spawnChestRewardEffect(x, y, big) {
    floatEffects.push({ type: 'lifeup_ring', worldX: x, worldY: y, timer: 0, duration: big ? 52 : 40 });
    if (big) floatEffects.push({ type: 'goldenegg_ring', worldX: x, worldY: y, timer: 0, duration: 46 });
    var n = big ? 28 : 16;
    for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        var sp = (big ? 3 : 2.5) + Math.random() * 3;
        floatEffects.push({
            type: 'combo_spark', worldX: x, worldY: y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (big ? 2 : 1.5),
            timer: 0, duration: 36 + Math.floor(Math.random() * (big ? 26 : 18)),
            size: (big ? 3 : 2.5) + Math.random() * 3, hue: 42 + Math.floor(Math.random() * 14)
        });
    }
}

// 土管ボーナス部屋の背景：紙吹雪（ジャックポット感）。アイテムより奥に描く。
var PIPE_CONFETTI_COLORS = ['#ff5a7a', '#4fd1e5', '#ffd34d', '#7ee081', '#c98cff'];
function updateAndDrawPipeConfetti() {
    if (pipeConfetti.length === 0) {
        for (var i = 0; i < 34; i++) {
            pipeConfetti.push({
                x: Math.random() * GAME_WIDTH, y: Math.random() * PIPE_ROOM_FLOOR_Y,
                vy: 0.6 + Math.random() * 1.1, sway: Math.random() * Math.PI * 2,
                swaySpd: 0.02 + Math.random() * 0.03, size: 4 + Math.random() * 4,
                rot: Math.random() * Math.PI, vrot: (Math.random() - 0.5) * 0.2,
                color: PIPE_CONFETTI_COLORS[i % PIPE_CONFETTI_COLORS.length]
            });
        }
    }
    for (var j = 0; j < pipeConfetti.length; j++) {
        var c = pipeConfetti[j];
        c.y += c.vy * frameSteps; c.sway += c.swaySpd * frameSteps; c.rot += c.vrot * frameSteps; c.x += Math.sin(c.sway) * 0.6 * frameSteps;
        if (c.y > PIPE_ROOM_FLOOR_Y + 8) { c.y = -8; c.x = Math.random() * GAME_WIDTH; }
        ctx.save();
        ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 1.4);
        ctx.restore();
    }
}

// 部屋の左右の壁（見える壁）を1枚描く。isLeft=左壁か。プレイヤーはこの壁の内側で止まる
function drawPipeRoomWall(x, w, isLeft) {
    var H = PIPE_ROOM_FLOOR_Y; // 天井（画面上端）〜床上端までの縦長の壁
    ctx.fillStyle = '#4a3826'; // 石レンガ本体
    ctx.fillRect(x, 0, w, H);
    ctx.fillStyle = '#2a1d11'; // 目地（レンガの継ぎ目）
    for (var by = 0, row = 0; by < H; by += 20, row++) {
        ctx.fillRect(x, by, w, 2);                             // 横目地
        ctx.fillRect(x + ((row % 2) ? w * 0.5 : 0), by, 2, 20); // 縦目地（1段おきに互い違い）
    }
    ctx.fillStyle = 'rgba(255,228,190,0.12)'; // 内側の縁を明るく（立体感で壁と分かる）
    ctx.fillRect(isLeft ? x + w - 3 : x, 0, 3, H);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';       // 外側（画面端）の縁を暗く
    ctx.fillRect(isLeft ? x : x + w - 3, 0, 3, H);
}

// 土管ボーナス部屋の描画（固定カメラ・画面座標）
// 部屋タイプ別の見た目（背景グラデ2色・放射光色・床色・紙吹雪ON/OFF・タイトル）。1.450〜。
// 未定義タイプは treasure にフォールバック。
var PIPE_ROOM_THEMES = {
    treasure: { bg0: '#103038', bg1: '#0a1f26', ray: 'rgba(255,255,255,0.05)',  floor: '#3a2a18', floorLine: '#241a10', confetti: true,  titleKey: 'room_treasure', props: null },
    coin:     { bg0: '#3a2c08', bg1: '#25190a', ray: 'rgba(255,214,90,0.07)',   floor: '#4a3410', floorLine: '#32220a', confetti: true,  titleKey: 'room_coin',     props: null },
    potion:   { bg0: '#2a1840', bg1: '#17092a', ray: 'rgba(200,150,255,0.06)',  floor: '#2e2038', floorLine: '#20142c', confetti: true,  titleKey: 'room_potion',   props: 'shelf' },
    heal:     { bg0: '#163524', bg1: '#0c2016', ray: 'rgba(150,255,190,0.06)',  floor: '#243a2a', floorLine: '#1a2c1f', confetti: false, titleKey: 'room_heal',     props: 'flowers' },
    lucky:    { bg0: '#3a1030', bg1: '#1a0818', ray: 'rgba(255,120,200,0.07)',  floor: '#38243a', floorLine: '#261628', confetti: true,  titleKey: 'room_lucky',    props: null }
};

// タイプ別の小物（手続き描画・床の後/アイテムより奥に描く）。1.451
function drawPipeRoomProps(kind) {
    var floorY = PIPE_ROOM_FLOOR_Y;
    if (kind === 'shelf') {
        // ポーション棚: アイテム(y=floorY-150,高40)の真下に木の棚板を1枚
        var shelfTop = floorY - 150 + 40 + 4, sx = GAME_WIDTH * 0.24, sw = GAME_WIDTH * 0.52;
        ctx.fillStyle = '#5a3d22'; ctx.fillRect(sx, shelfTop, sw, 10);
        ctx.fillStyle = '#3c2814'; ctx.fillRect(sx, shelfTop + 10, sw, 5);           // 棚の影
        ctx.fillStyle = '#4a3018'; ctx.fillRect(sx + 8, shelfTop + 15, 8, floorY - (shelfTop + 15)); // 左脚
        ctx.fillRect(sx + sw - 16, shelfTop + 15, 8, floorY - (shelfTop + 15));      // 右脚
    } else if (kind === 'flowers') {
        // おやすみの間: 床沿いに小さな花を点々と
        var cols = ['#ff9ec4', '#ffd36b', '#a7e0ff', '#c9a0ff'];
        for (var i = 0; i < 7; i++) {
            var fx = GAME_WIDTH * (0.1 + 0.8 * (i / 6)) + Math.sin(i * 2.3) * 10;
            var fy = floorY - 6, col = cols[i % cols.length];
            ctx.fillStyle = '#3a7d4a'; ctx.fillRect(fx - 1, fy - 14, 2, 14);          // 茎
            ctx.fillStyle = col;                                                     // 花びら4枚＋芯
            ctx.beginPath();
            ctx.arc(fx - 4, fy - 16, 3, 0, Math.PI * 2); ctx.arc(fx + 4, fy - 16, 3, 0, Math.PI * 2);
            ctx.arc(fx, fy - 20, 3, 0, Math.PI * 2); ctx.arc(fx, fy - 12, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(fx, fy - 16, 2, 0, Math.PI * 2); ctx.fill();
        }
    }
}

function drawPipeRoom() {
    gameState.time += frameSteps; // 本編render末尾の time 加算を肩代わり（早期returnのため）
    var tm = Date.now() / 50;
    var theme = PIPE_ROOM_THEMES[pipeRoomState.roomType] || PIPE_ROOM_THEMES.treasure;
    // 背景: ジャックポット風（タイプ別の地色＋ゆっくり回転する放射光＋紙吹雪）
    var bg = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    bg.addColorStop(0, theme.bg0); bg.addColorStop(1, theme.bg1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // 回転放射光（低コントラストでアイテムの視認性を保つ）
    var scx = GAME_WIDTH / 2, scy = PIPE_ROOM_FLOOR_Y * 0.45;
    var rayR = GAME_WIDTH + GAME_HEIGHT, rayN = 16, rayStep = Math.PI * 2 / rayN, rayRot = gameState.time * 0.004;
    ctx.fillStyle = theme.ray;
    for (var ri = 0; ri < rayN; ri++) {
        var a0 = rayRot + ri * rayStep, a1 = a0 + rayStep * 0.5;
        ctx.beginPath();
        ctx.moveTo(scx, scy);
        ctx.lineTo(scx + Math.cos(a0) * rayR, scy + Math.sin(a0) * rayR);
        ctx.lineTo(scx + Math.cos(a1) * rayR, scy + Math.sin(a1) * rayR);
        ctx.closePath(); ctx.fill();
    }
    // 紙吹雪（背景装飾・アイテムより奥）
    if (theme.confetti) updateAndDrawPipeConfetti();
    // 床（レンガ・タイプ別色）
    ctx.fillStyle = theme.floor; ctx.fillRect(0, PIPE_ROOM_FLOOR_Y, GAME_WIDTH, GAME_HEIGHT - PIPE_ROOM_FLOOR_Y);
    ctx.fillStyle = theme.floorLine;
    for (var fx = 0; fx < GAME_WIDTH; fx += 40) ctx.fillRect(fx + 2, PIPE_ROOM_FLOOR_Y + 5, 36, 6);
    // タイプ別の小物（棚/花・アイテムより奥）
    if (theme.props) drawPipeRoomProps(theme.props);
    // 左右の壁（見える壁）: プレイヤーはここで止まる（見えない壁をなくす）
    drawPipeRoomWall(0, PIPE_ROOM_WALL_W, true);
    drawPipeRoomWall(GAME_WIDTH - PIPE_ROOM_WALL_W, PIPE_ROOM_WALL_W, false);
    var exitX = pipeRoomExitX();
    // 入口の縦土管は無し（入場は左上からの落下）。出口（横）土管のみ描く。
    // 出口（横）土管：画面右（口が左向き＝右へ歩いて入ると地上へ戻る）
    if (pipeSideImg.complete && pipeSideImg.naturalWidth) {
        ctx.drawImage(pipeSideImg, exitX, PIPE_ROOM_FLOOR_Y - SIDE_PIPE_H, SIDE_PIPE_W, SIDE_PIPE_H);
    }
    // 出口ヒント（→ でる）: 土管のすぐ左上に右寄せで配置＝画面右のストック枠（所持アイテム）と重ならない。
    // 口は左向きなのでテキスト右端を土管の左端(exitX)に合わせ、「→」が土管の口を指す。
    ctx.save();
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 15px DotGothic16, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(t('pipe_room_exit'), exitX, PIPE_ROOM_FLOOR_Y - SIDE_PIPE_H - 8 + Math.sin(gameState.time * 0.1) * 3);
    ctx.restore();
    // 退室ゲージ表示は1.410で撤去（判定時間を半減=0.35秒にしたためUI不要。判定自体は updatePipeRoom の exitHold のまま）
    // 報酬
    for (var i = 0; i < bonusRoomItems.length; i++) {
        var it = bonusRoomItems[i];
        if (it.collected) continue;
        if (it.type === 'coin') drawCoin(it, tm);
        else if (it.type === 'heart') drawPowerUp(it);
        else if (it.type === 'golden_egg') drawGoldenEggSprite(it.x, it.y + Math.sin(gameState.time * 0.1 + (it.floatOffset || 0)) * 3, it.width, it.height);
        else if (it.type === 'shopitem') drawRoomShopItem(it);
        else if (it.type === 'chest') drawChest(it);
    }
    // ラッキーの間: 未開封なら「踏んで選ぶ」ヒント（BONUS!演出が消えてから）
    if (pipeRoomState.roomType === 'lucky' && !pipeRoomState.chestPicked && pipeRoomState.introTimer <= 0) {
        ctx.save();
        ctx.fillStyle = '#ffe066';
        ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
        ctx.fillText(t('room_lucky_hint'), GAME_WIDTH / 2, PIPE_ROOM_FLOOR_Y * 0.52 + Math.sin(gameState.time * 0.1) * 3);
        ctx.restore();
    }
    // プレイヤー
    if (gameState.gameStarted) {
        if (pipeRoomState.anim === 'outRoom') {
            // 退室演出: 「口の内側の縁」ラインより左だけプレイヤーを描く（クリップ方式・1.410）。
            // 旧「横土管全体を後描き」は口が見える絵柄のため「土管の裏に回った」ように見えた。
            // クリップなら下地の口(暗部)と手前の縁が残り、口に入っていく見た目になる（本編側1.409と同方式）。
            var _mouthX = exitX + SIDE_PIPE_MOUTH_LINE;
            ctx.save();
            ctx.beginPath();
            ctx.rect(-100, -100, _mouthX + 100, GAME_HEIGHT + 200);
            ctx.clip();
            drawPlayer(player.x, player.y);
            ctx.restore();
        } else {
            drawPlayer(player.x, player.y);
        }
    }
    // 取得演出（らいふあっぷ！等）。部屋内のエフェクトは worldX=画面座標で発行されるのでそのまま描ける
    // （従来はここで描いておらず、部屋でのハート/エッグ取得演出が一切表示されなかった）
    if (floatEffects.length > 0) drawFloatEffects();
    // 入場演出「BONUS!」（約1.5秒: 大きく飛び出て→ゆらゆら→フェード）
    if (pipeRoomState.introTimer > 0) {
        pipeRoomState.introTimer = Math.max(0, pipeRoomState.introTimer - frameSteps);
        var bIn = 90 - pipeRoomState.introTimer;                      // 経過フレーム
        var bScale = 1 + 1.2 * Math.max(0, 1 - bIn / 12);             // 最初の12Fで2.2→1にポップ
        var bAlpha = pipeRoomState.introTimer < 20 ? pipeRoomState.introTimer / 20 : 1; // 最後の20Fでフェード
        var bRot = Math.sin(bIn * 0.15) * 0.05;                       // ゆらゆら
        ctx.save();
        ctx.globalAlpha = bAlpha;
        ctx.translate(GAME_WIDTH / 2, PIPE_ROOM_FLOOR_Y * 0.35);
        ctx.rotate(bRot);
        ctx.scale(bScale, bScale);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = "bold 56px 'M PLUS Rounded 1c', sans-serif";
        ctx.shadowColor = 'rgba(255,200,40,0.9)';
        ctx.shadowBlur = 24;
        ctx.lineWidth = 8; ctx.strokeStyle = '#7a4a00';
        ctx.strokeText('BONUS!', 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffd84a';
        ctx.fillText('BONUS!', 0, 0);
        // 部屋タイプ名（サブタイトル・1.450〜）
        if (theme.titleKey) {
            ctx.font = "bold 22px 'M PLUS Rounded 1c', sans-serif";
            ctx.lineWidth = 5; ctx.strokeStyle = '#7a4a00';
            ctx.strokeText(t(theme.titleKey), 0, 40);
            ctx.fillStyle = '#fff2c0';
            ctx.fillText(t(theme.titleKey), 0, 40);
        }
        ctx.restore();
    }
}

// 闇のフクロウの暗転（screen座標・render()のボスオーバーレイから呼ぶ）。
// プレイヤー周囲はクリアな vignette（モバイルで見えなくならないよう clearR広め・端も真っ黒にしない）＋
// 暗転を貫く"光る目"（フクロウを追える）＋横薙ぎ急襲の明るい予告線（高さをズラして回避）。
function drawOwlDarkness(b) {
    var dark = b.darkness || 0;
    if (dark > 0.02) {
        var px = player.x + player.width / 2 - gameState.camera.x;
        var py = player.y + player.height / 2;
        var g = ctx.createRadialGradient(px, py, 62, px, py, GAME_WIDTH * 0.62);
        g.addColorStop(0, 'rgba(2,0,10,0)');
        g.addColorStop(0.3, 'rgba(2,0,10,' + (0.74 * dark).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(0,0,3,' + (1.0 * dark).toFixed(3) + ')');
        ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.restore();
    }
    if (bossState.phase !== 3) return;
    var ox = b.x + b.width / 2 - gameState.camera.x;
    var oy = b.y + b.height * 0.32;
    var eyeGlow = Math.min(1, 0.55 + Math.sin(b.animFrame * 0.2) * 0.15 + dark * 0.35);
    ctx.save();
    ctx.globalAlpha = eyeGlow;
    for (var e = -1; e <= 1; e += 2) {
        var exx = ox + e * b.width * 0.15;
        var gg = ctx.createRadialGradient(exx, oy, 1, exx, oy, 15);
        gg.addColorStop(0, 'rgba(255,235,150,1)');
        gg.addColorStop(0.4, 'rgba(255,190,50,0.75)');
        gg.addColorStop(1, 'rgba(255,150,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(exx, oy, 15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (b.owlMode === 'aim') { // 横薙ぎ急襲の予告（明るい赤の水平線＋方向矢印）＝この高さに来る。見て高さをズラす
        var ly = b.swoopY + b.height / 2;
        var pulse = 0.5 + Math.sin(b.animFrame * 0.4) * 0.3;
        ctx.save();
        // 薄い危険帯（線の周りをうっすら赤く）
        ctx.globalAlpha = pulse * 0.35;
        ctx.fillStyle = '#ff3030';
        ctx.fillRect(0, ly - 14, GAME_WIDTH, 28);
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#ff6060'; ctx.lineWidth = 4;
        ctx.setLineDash([14, 9]);
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(GAME_WIDTH, ly); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = Math.min(1, pulse + 0.35);
        ctx.fillStyle = '#ff5050';
        var axDir = b.swoopDir > 0 ? 1 : -1;
        var ax = b.swoopDir > 0 ? 40 : GAME_WIDTH - 40;
        ctx.beginPath();
        ctx.moveTo(ax, ly - 9); ctx.lineTo(ax + axDir * 16, ly); ctx.lineTo(ax, ly + 9); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
}

function render() {
    // タイトル/スプラッシュ(不透明オーバーレイ)中はワールド描画を丸ごと省略＝メニュー待機中の電池/発熱を抑える。
    // 半透明のポーズ/ゲームオーバーは背景が見えるので従来どおり描く。
    if (isScreenVisible('startScreen') || isScreenVisible('splashScreen')) return;

    // nearest-neighbor拡大でドット絵くっきり
    ctx.imageSmoothingEnabled = false;

    // 土管ボーナス部屋中は専用画面を描いて終了（本編ワールドは描かない）
    if (pipeRoomState.active) { drawPipeRoom(); return; }

    // 画面シェイク適用
    var shaking = screenShake.timer > 0;
    if (shaking) {
        screenShake.timer = Math.max(0, screenShake.timer - frameSteps);
        var shakeDecay = screenShake.timer / 12;
        ctx.save();
        ctx.translate(
            (Math.random() - 0.5) * screenShake.intensity * shakeDecay * 2,
            (Math.random() - 0.5) * screenShake.intensity * shakeDecay * 2
        );
    }

    // 背景グラデーション（キャッシュから描画）
    ctx.drawImage(getBgCache(), 0, 0);

    // バイオーム: 現在のコンフィグ取得
    var curBiome = BIOME_CONFIGS[biomeState.current];
    var biMtnAlpha = curBiome.mountainAlpha;
    var biTreeAlpha = curBiome.treeAlpha;
    if (biomeState.transition > 0 && biomeState.transition < 1) {
        var prevBiome = BIOME_CONFIGS[biomeState.previous];
        biMtnAlpha = prevBiome.mountainAlpha + (curBiome.mountainAlpha - prevBiome.mountainAlpha) * biomeState.transition;
        biTreeAlpha = prevBiome.treeAlpha + (curBiome.treeAlpha - prevBiome.treeAlpha) * biomeState.transition;
    }

    // 夜バイオーム: 星エフェクト (背景の上、パララックスの前に描画)
    if (biomeState.current === 3 || (biomeState.transition > 0 && (biomeState.current === 3 || biomeState.previous === 3))) {
        var starAlpha = biomeState.current === 3 ? (biomeState.transition > 0 ? biomeState.transition : 1) : (1 - biomeState.transition);
        for (var sti = 0; sti < biomeState.stars.length; sti++) {
            var star = biomeState.stars[sti];
            var twinkle = 0.4 + 0.6 * Math.abs(Math.sin(gameState.time * 0.05 + star.twinkleOffset));
            ctx.globalAlpha = starAlpha * twinkle;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    if (biomeState.current === 5) {
        // 地底（1.542）: 遠景=岩壁と石柱・中景=鍾乳石/石筍・底=溶岩の照り返し（山/木/雲の代わり）
        drawCaveBackdrop();
    } else if (biomeState.current === 4) {
        // はじまりの地（街）: 遠景=家並み・中景=街灯（山/木の代わり・チュートリアル専用）
        drawTownSkyline(biMtnAlpha);
        drawTownStreet(biTreeAlpha);
    } else {
    // パララックス: 遠景山 (0.15x速度)
    var mountainDispW = 160, mountainDispH = 100;
    var mountainY = GAME_HEIGHT - mountainDispH - 74;
    ctx.globalAlpha = biMtnAlpha;
    for (var mi = 0; mi < 8; mi++) {
        var mx = (mi * mountainDispW - gameState.camera.x * 0.15) % (mountainDispW * 8);
        if (mx < -mountainDispW) mx += mountainDispW * 8;
        if (mx > GAME_WIDTH) continue; // B-3: 画面外(右)はスキップ
        spriteManager.draw(ctx, 'bg_mountain', 0, mx, mountainY, mountainDispW, mountainDispH, false);
    }
    ctx.globalAlpha = 1.0;

    // パララックス: 中景木 (0.25x速度)
    var treeDispW = 64, treeDispH = 96;
    var treeY = GAME_HEIGHT - treeDispH - 45;
    ctx.globalAlpha = biTreeAlpha;
    for (var ti = 0; ti < 12; ti++) {
        var treeX = (ti * treeDispW * 2.5 - gameState.camera.x * 0.25) % (treeDispW * 30);
        if (treeX < -treeDispW) treeX += treeDispW * 30;
        if (treeX > GAME_WIDTH) continue; // B-3: 画面外(右)はスキップ（木は12本中〜5本が画面外）
        spriteManager.draw(ctx, 'bg_trees', 0, treeX, treeY, treeDispW, treeDispH, false);
    }
    ctx.globalAlpha = 1.0;
    }

    // 背景雲 (夜は半透明に)。⚠地底は空が無いので雲を描かない
    var cloudAlpha = (biomeState.current === 3) ? 0.25 : 1;
    if (biomeState.current === 5) cloudAlpha = 0;
    var cloudDispW = 80, cloudDispH = 40;
    ctx.globalAlpha = cloudAlpha;
    for (var i = 0; i < 10; i++) {
        var cx = (i * 280 - gameState.camera.x * 0.3 + gameState.time * 0.2) % (GAME_WIDTH + 200);
        if (cx < -cloudDispW) cx += GAME_WIDTH + 200;
        if (cx > GAME_WIDTH) continue; // B-3: 画面外(右)はスキップ
        var cy = 30 + Math.sin(i * 0.7 + gameState.time * 0.01) * 40;
        spriteManager.draw(ctx, 'bg_cloud', 0, cx, cy, cloudDispW, cloudDispH, false);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    // ⚠縦カメラ（1.563）。世界の描画は全部この中にあるので、-camera.y を足すだけで縦スクロールが成立する。
    //   物理はワールド座標なので無改修。**距離は camera.x のみ由来なので縦は距離/Lv/ランキングに影響しない**。
    //   背景・パララックスは translate の外なので、縦の視差は drawCaveBackdrop 側で camera.y を見て作る。
    ctx.translate(-gameState.camera.x, -gameState.camera.y);

    var camL = gameState.camera.x - 100, camR = gameState.camera.x + GAME_WIDTH + 100;
    var j;

    for (j = 0; j < terrain.length; j++) {
        var tr = terrain[j];
        if (tr.x + tr.width > camL && tr.x < camR) drawTerrain(tr);
    }
    if (undergroundState.active) {
        // 当たり判定なしの石積み（門/アーチ）。⚠**暗く落として奥に見せる**＝プレイヤーが
        //   「通れる飾り」と「乗れる/ぶつかる石」を色の濃さで即座に見分けられるようにする。
        // ⚠邪神の巨像は**石積みの飾りより先**に描く（1.570）。門のまぐさが像の頭に重なって
        //   「壁龕（へきがん）に据えられた像」に見える＝建築と像がひとつの祭壇として読める。
        //   後に描くと、像がアーチの石を塗りつぶして門が消える。
        drawUgFalls(camL, camR);           // 滝（演出専用・一番奥＝石積みの飾りより手前に出さない）
        drawUgIdol();
        ctx.save();
        ctx.globalAlpha = 0.55;
        for (var dk = 0; dk < undergroundState.decor.length; dk++) drawCaveBlock(undergroundState.decor[dk]);
        ctx.restore();
        drawUndergroundLava(camL, camR);   // 溶岩は地形の直後（足場より奥）
        drawUgShop();                      // 怪しい老婆の店（地形の上・足場より奥＝壁に掘られて見える）
        drawUgBraziers(camL, camR);        // 紫の燭台（ボス前の予告）
    }
    drawShopBuilding(); // ショップ建物（地形の上、足場の下）
    for (j = 0; j < platforms.length; j++) {
        var p = platforms[j];
        if (p.x + p.width > camL && p.x < camR) drawPlatform(p);
    }
    if (undergroundState.active) {
        drawUndergroundHazards(camL, camR);          // トゲ/ファイアバー/火の玉
        drawUgBossRoom();                            // 闘技場の扉と仮ボス（1.564）
    }

    var time = Date.now() / 50;
    for (j = 0; j < coins.length; j++) {
        if (!coins[j].collected && coins[j].x > camL && coins[j].x < camR) drawCoin(coins[j], time);
    }
    for (j = 0; j < enemies.length; j++) {
        if (enemies[j].x > camL && enemies[j].x < camR) drawEnemy(enemies[j]);
    }
    for (j = 0; j < flyingEnemies.length; j++) {
        if (flyingEnemies[j].x > camL && flyingEnemies[j].x < camR) drawFlyingEnemy(flyingEnemies[j]);
    }
    for (j = 0; j < powerUps.length; j++) {
        if (!powerUps[j].collected && powerUps[j].x > camL && powerUps[j].x < camR) drawPowerUp(powerUps[j]);
    }
    for (j = 0; j < bullets.length; j++) {
        if (bullets[j].x > camL && bullets[j].x < camR) drawBullet(bullets[j]);
    }

    // ボス描画 (ワールド座標系)
    if (bossState.boss && bossState.phase >= 2 && bossState.phase <= 4) drawBoss(bossState.boss);
    if (bossState.eggs.length > 0) drawEggProjectiles();

    if (gameState.gameStarted) {
        if ((pipeRoomState.anim === 'in' || pipeRoomState.anim === 'outWorld') && pipeRoomState.animPipe) {
            // 土管出入り演出: 「上面の穴の手前縁」ラインより上だけプレイヤーを描く（クリップ方式・1.409）。
            // 土管スプライトは口の穴が見える絵なので、全体を前面に再描画する旧方式だと
            // 「土管の裏に回った」ように見えてしまう。クリップなら穴に沈む/穴から出てくる見た目になる
            // （ラインより下は描かれず、下地の土管の穴と手前の縁がそのまま見える）。
            var _ap = pipeRoomState.animPipe;
            // ⚠クリップ位置＝「上面の穴の手前縁」。入場土管は**穴（暗い開口部）の最下部**を使う。
            //   リップの縁(UG_PIPE_MOUTH_RY=12)で切ると穴の最下部より4px下まで体が残る（1.560で修正）。
            var _mouthY = _ap.y + (_ap.ugEntrance ? UG_PIPE_MAW_BOTTOM : PIPE_MOUTH_LINE);
            ctx.save();
            ctx.beginPath();
            ctx.rect(gameState.camera.x - 60, _mouthY - 600, GAME_WIDTH + 120, 600);
            ctx.clip();
            drawPlayer(player.x, player.y);
            ctx.restore();
        } else {
            drawPlayer(player.x, player.y);
        }
        drawCyberDrone(); // サイバーぴよのドローン（プレイヤーの手前・ガードは関数内・1.520）
    }

    // フロートエフェクト描画 (カメラtranslate適用済み)
    if (floatEffects.length > 0) drawFloatEffects();

    ctx.restore();

    // ボス戦 or 夜バイオーム: 暗いオーバーレイ
    if (bossState.active && bossState.phase >= 2) {
        // ボス戦専用オーバーレイ（暗紫）
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = 'rgba(10,0,30,1)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.globalAlpha = 1;
        // ランダム稲妻フラッシュ（低確率で一瞬明るくなる）
        if (Math.random() < 0.006) {
            ctx.globalAlpha = 0.08 + Math.random() * 0.07;
            ctx.fillStyle = '#8040c0';
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            ctx.globalAlpha = 1;
        }
        // 闇のフクロウ: 暗転ギミック（プレイヤー周囲は見える vignette＋光る目/急襲予告を上から）
        if (bossState.boss && bossState.boss.kind === 'owl' && bossState.phase >= 2) drawOwlDarkness(bossState.boss);
    } else {
      var nightOverlay = BIOME_CONFIGS[3].overlay;
      var isNightInvolved = biomeState.current === 3 || biomeState.previous === 3;
      if (isNightInvolved && nightOverlay) {
        var overlayAlpha;
        if (biomeState.transition > 0 && biomeState.transition < 1) {
            overlayAlpha = biomeState.current === 3 ? biomeState.transition : (1 - biomeState.transition);
        } else {
            overlayAlpha = biomeState.current === 3 ? 1 : 0;
        }
        if (overlayAlpha > 0.01) {
            ctx.globalAlpha = overlayAlpha;
            ctx.fillStyle = nightOverlay;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            ctx.globalAlpha = 1;
        }
      }
    }

    // ─── 天候パーティクル描画 ───
    if (weatherParticles.length > 0) drawWeatherParticles();

    // ─── 地底ボスのHPバー（画面座標なのでワールドのtranslateの外で描く） ───
    // ⚠**画面下部**に置くこと（1.568・ユーザー報告）。1.564は画面上部に描いていたため、
    //   上部中央の「ぴよフラッシュ」ゲージ(#specialMoveUI)と重なって読めなかった。
    //   位置・サイズ・パネル/バーの描き方は通常ボス（この下のブロック）と完全に同じにし、色だけ紫にする。
    // ⚠大詠唱の暗転は**HPバーより先**に描く（バーが暗幕に隠れると残りHPが読めなくなる）
    if (undergroundState.active) { drawUgDarkChant(); drawUgFlash(); }
    if (undergroundState.active && undergroundState.boss && undergroundState.bossPhase !== 5) {   // ⚠撃破演出中は出さない（0/200 が残る／一枚絵に被る・1.584）
        var _ub = undergroundState.boss;
        var _uw = 300, _uh = 32;
        var _ux = GAME_WIDTH / 2 - _uw / 2, _uy = GAME_HEIGHT - 48;
        drawHudPanel(_ux, _uy, _uw, _uh,
            'rgba(38,10,60,0.9)', 'rgba(22,5,40,0.95)', '#b07cff', 'rgba(176,124,255,0.3)');
        ctx.font = "bold 11px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e4ccff';
        ctx.fillText(t('ug_boss_name'), _ux + 16, _uy + 10);   // ラスボス格なので名前を出す（通常ボスの'BOSS'と差をつける）
        ctx.fillStyle = '#c8a8ff';
        ctx.textAlign = 'right';
        ctx.fillText(Math.max(0, Math.ceil(_ub.hp)) + '/' + _ub.maxHp, _ux + _uw - 12, _uy + 10);
        ctx.textAlign = 'left';
        drawProgressBar(_ux + 16, _uy + 19, _uw - 32, 8, Math.max(0, _ub.hp / _ub.maxHp), '#8a3fd0', '#e4ccff');
    }

    // ─── ダメージ赤フラッシュ ───
    if (damageFlashTimer > 0) {
        damageFlashTimer = Math.max(0, damageFlashTimer - frameSteps);
        var dfAlpha = damageFlashTimer / 20 * 0.45;
        ctx.fillStyle = 'rgba(255,0,0,' + dfAlpha + ')';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // ─── 復活ゴールドフラッシュ ───
    if (gameState.revivalFlashTimer > 0) {
        gameState.revivalFlashTimer = Math.max(0, gameState.revivalFlashTimer - frameSteps);
        var rvAlpha = gameState.revivalFlashTimer / 90 * 0.35;
        ctx.fillStyle = 'rgba(255,215,0,' + rvAlpha + ')';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // ─── コンボマイルストーンフラッシュ ───
    if (comboFlashTimer > 0) {
        comboFlashTimer = Math.max(0, comboFlashTimer - frameSteps);
        var cfAlpha = comboFlashTimer / 15 * 0.25;
        ctx.fillStyle = 'rgba(255,200,0,' + cfAlpha + ')';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // 画面シェイク復元（HUDはシェイクしない）
    if (shaking) ctx.restore();

    // ─── HUDオーバーレイ (複数パワーアップ対応) ───
    // ぴよフラッシュゲージ(#specialMoveUI: 上部中央 top:8px・高さ~38px)の表示中は、
    // 上部中央のcanvas HUD(無敵/コンボ/スピードアップ通知)を下げて視覚的な重なりを防ぐ
    var hudTopOffset = (gameState.specialMoveLevel > 0) ? 36 : 0;
    var puBarY = 75;
    for (var pi = 0; pi < PU_HUD_DEFS.length; pi++) {
        var pu = PU_HUD_DEFS[pi];
        var puTimer = gameState[pu.key]; // B-2: 残り時間は都度参照（配列・オブジェクトの毎フレーム再生成を廃止）
        if (puTimer <= 0) continue;
        var puX = GAME_WIDTH - 215;
        var puRt = Math.ceil(puTimer / 60);
        var puMax = (pu.key === 'puMagnet') ? pu.max * (gameState.magnetDurMult || 1) : pu.max;
        var puRatio = puTimer / puMax;
        // Compact bar background
        ctx.fillStyle = pu.bg;
        ctx.strokeStyle = pu.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(puX, puBarY, 200, 22, 4);
        ctx.fill(); ctx.stroke();
        // Label
        ctx.font = "bold 11px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = pu.text;
        ctx.fillText(t(pu.labelKey), puX + 6, puBarY + 11);
        // Timer
        ctx.font = "bold 10px 'DotGothic16', monospace";
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.fillText(puRt + t('hud_sec'), puX + 196, puBarY + 11);
        // Mini progress bar
        ctx.textAlign = 'left';
        var barX = puX + 70, barW = 90, barH = 6, barY = puBarY + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
        var grad = ctx.createLinearGradient(barX, 0, barX + barW * puRatio, 0);
        grad.addColorStop(0, pu.color1); grad.addColorStop(1, pu.color2);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * puRatio, barH, 2); ctx.fill();
        puBarY += 24;
    }

    if (gameState.isInvincible) {
        var ri = Math.ceil(gameState.invincibleTimer / 60);
        var iRatio = gameState.invincibleTimer / INVINCIBLE_FRAMES;
        var ix = GAME_WIDTH / 2 - 110, iy = 14 + hudTopOffset;
        // Gold panel
        drawHudPanel(ix, iy, 220, 52, 'rgba(80,60,10,0.9)', 'rgba(50,35,5,0.92)', '#ffd700', 'rgba(255,215,0,0.4)');
        // Star icon shimmer
        var starPulse = 0.7 + 0.3 * Math.sin(gameState.time * 0.2);
        ctx.fillStyle = 'rgba(255,215,0,' + starPulse + ')';
        drawStar(ix + 18, iy + 17, 7, 3, 5, 'rgba(255,223,100,' + starPulse + ')');
        // Text
        ctx.font = "bold 15px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffeebb';
        ctx.shadowColor = 'rgba(255,215,0,0.6)'; ctx.shadowBlur = 6;
        ctx.fillText(t('hud_invincible') + ri + t('hud_sec'), ix + 120, iy + 17);
        ctx.shadowBlur = 0;
        // Progress bar
        drawProgressBar(ix + 12, iy + 33, 196, 8, iRatio, '#ffc800', '#ffee66');
    }

    // ボスHPバー
    if (bossState.active && bossState.boss && bossState.phase >= 3 && bossState.phase <= 4) {
        var bossB = bossState.boss;
        var bossMaxHp = bossState.maxHp || BOSS_MAX_HP;
        var bhpRatio = Math.max(0, bossB.hp / bossMaxHp);
        var bHpW = 300, bHpH = 32;
        var bHpX = GAME_WIDTH / 2 - bHpW / 2;
        var bHpY = GAME_HEIGHT - 48;
        drawHudPanel(bHpX, bHpY, bHpW, bHpH,
            'rgba(60,10,10,0.9)', 'rgba(40,5,5,0.95)', '#ff4444', 'rgba(255,50,50,0.3)');
        ctx.font = "bold 11px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffcccc';
        ctx.fillText('BOSS', bHpX + 40, bHpY + 10);
        // HPテキスト
        ctx.fillStyle = '#ff8888';
        ctx.textAlign = 'right';
        ctx.fillText(Math.max(0, Math.ceil(bossB.hp)) + '/' + bossMaxHp, bHpX + bHpW - 12, bHpY + 10); // 内部HP=表示HP（統一スケール）。撃破時マイナスにならないよう0でクランプ
        ctx.textAlign = 'left';
        // HPバー
        drawProgressBar(bHpX + 16, bHpY + 19, bHpW - 32, 8, bhpRatio, '#ff2222', '#ff6666');
    }

    // コンボHUD（色エスカレーション＋強化パルス）
    if (gameState.comboCount >= 2) {
        var comboY = (gameState.isInvincible ? 72 : 14) + hudTopOffset;
        var comboAlpha = gameState.comboTimer / COMBO_TIMEOUT;
        var cc = gameState.comboCount;
        // パルス強度: コンボ数に応じて増加
        var pulseAmp = Math.min(0.05 + cc * 0.01, 0.15);
        var comboPulse = 1 + Math.sin(gameState.time * 0.3) * pulseAmp;
        // 色エスカレーション: 金→橙→赤
        var hudHue = Math.max(0, 45 - cc * 3);
        var hudR = hudHue <= 20 ? 255 : Math.floor(200 + (45 - hudHue));
        var hudG = Math.floor(150 * (hudHue / 45));
        var hudBorder = 'hsl(' + hudHue + ',100%,50%)';
        var hudGlow = 'hsla(' + hudHue + ',100%,50%,0.3)';
        var hudBg = 'rgba(' + Math.floor(80 - cc) + ',' + Math.floor(Math.max(10, 60 - cc * 4)) + ',10,0.85)';
        ctx.save();
        ctx.globalAlpha = Math.max(0.4, comboAlpha);
        var comboX = GAME_WIDTH / 2 - 90;
        drawHudPanel(comboX, comboY, 180, 42, hudBg, 'rgba(50,35,5,0.9)', hudBorder, hudGlow);
        ctx.font = "bold " + Math.floor(18 * comboPulse) + "px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'hsl(' + hudHue + ',100%,65%)';
        ctx.shadowColor = 'hsla(' + hudHue + ',100%,50%,0.7)';
        ctx.shadowBlur = 8 + cc;
        var hudLabel = cc + ' COMBO';
        if (cc >= 15) hudLabel = cc + ' COMBO INSANE';
        else if (cc >= 10) hudLabel = cc + ' COMBO AMAZING';
        else if (cc >= 5) hudLabel = cc + ' COMBO GREAT';
        ctx.fillText(hudLabel, GAME_WIDTH / 2, comboY + 22);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // （デバッグモード表示はネイティブ提出前に撤去済み — Ver.1.461）

    if (gameState.speedUpNotification) {
        var a = Math.min(1.0, gameState.speedUpNotificationTimer / 30);
        // ⚠地底は専用の表示にする（1.586・ユーザー指摘）。地底はオートスクロールせず
        //   updateGameSpeed が gameSpeed=0 に固定するので、**速さは一切変わらない**。
        //   それなのに「SPEED UP! (500%)」と出るのは嘘になるので、地底では
        //   速さの話を消して「LEVEL UP! Lv.41」だけにする（レベル自体は距離で上がり続ける）。
        var ugLv = undergroundState.active;
        var sx2 = GAME_WIDTH / 2 - 150, sy2 = 68 + hudTopOffset;
        ctx.save();
        ctx.globalAlpha = a;
        // 地底は紫（地底のUIと同系）、地上は従来のピンク
        if (ugLv) drawHudPanel(sx2, sy2, 300, 52, 'rgba(56,20,100,0.9)', 'rgba(30,10,60,0.92)', '#b07cff', 'rgba(176,124,255,0.4)');
        else      drawHudPanel(sx2, sy2, 300, 52, 'rgba(100,20,60,0.9)', 'rgba(60,10,35,0.92)', '#ff69b4', 'rgba(255,100,180,0.4)');
        ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = ugLv ? 'rgba(176,124,255,0.7)' : 'rgba(255,100,180,0.7)'; ctx.shadowBlur = 8;
        var label;
        if (ugLv) {
            label = t('hud_levelup') + gameState.speedLevel;                 // 速度%は出さない
        } else {
            var sp = Math.min(MAX_SPEED_PERCENT, 100 + (gameState.speedLevel - 1) * 20);
            label = t('hud_speedup') + gameState.speedLevel + ' (' + sp + '%)';
        }
        ctx.fillText(label, GAME_WIDTH / 2, sy2 + 27);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    if (gameState.gamePaused) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        // Pause panel
        var pw = 320, ph = 100;
        var ppx = (GAME_WIDTH - pw) / 2, ppy = (GAME_HEIGHT - ph) / 2 - 20;
        drawHudPanel(ppx, ppy, pw, ph, 'rgba(30,30,60,0.95)', 'rgba(15,15,40,0.98)', '#8888ff', 'rgba(100,100,255,0.3)');
        // Text
        ctx.font = "bold 36px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(150,150,255,0.6)'; ctx.shadowBlur = 10;
        ctx.fillText(t('hud_pause'), GAME_WIDTH / 2, ppy + ph / 2);
        ctx.shadowBlur = 0;
    }

    // ─── ボス閃光攻撃エフェクト ───
    if (bossState.active && bossState.flashAttackTimer > 0) {
        var fProgress = 1 - bossState.flashAttackTimer / 30; // 0→1
        ctx.save();
        if (fProgress < 0.15) {
            // 最初の瞬間：画面全体が白くフラッシュ
            var flashAlpha = (1 - fProgress / 0.15) * 0.85;
            ctx.fillStyle = 'rgba(255,255,240,' + flashAlpha + ')';
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        }
        // 地面レベルを走る閃光ビーム
        if (fProgress < 0.7) {
            var beamAlpha = fProgress < 0.1 ? fProgress / 0.1 : (0.7 - fProgress) / 0.6;
            beamAlpha = Math.max(0, beamAlpha) * 0.8;
            var beamY = GROUND_Y - 35;
            var beamH = 70;
            // メインビーム（黄白い光）
            var bgrd = ctx.createLinearGradient(0, beamY - beamH / 2, 0, beamY + beamH / 2);
            bgrd.addColorStop(0, 'rgba(255,255,200,0)');
            bgrd.addColorStop(0.3, 'rgba(255,255,150,' + beamAlpha * 0.6 + ')');
            bgrd.addColorStop(0.5, 'rgba(255,255,255,' + beamAlpha + ')');
            bgrd.addColorStop(0.7, 'rgba(255,255,150,' + beamAlpha * 0.6 + ')');
            bgrd.addColorStop(1, 'rgba(255,255,200,0)');
            ctx.fillStyle = bgrd;
            ctx.fillRect(0, beamY - beamH / 2, GAME_WIDTH, beamH);
            // ビーム中心の輝線
            ctx.globalAlpha = beamAlpha;
            ctx.strokeStyle = '#ffffee';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ffffaa';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.moveTo(0, beamY);
            ctx.lineTo(GAME_WIDTH, beamY);
            ctx.stroke();
            ctx.shadowBlur = 0;
            // 光の粒子が飛び散る
            for (var fi = 0; fi < 6; fi++) {
                var fpx = Math.random() * GAME_WIDTH;
                var fpy = beamY - beamH / 2 + Math.random() * beamH;
                ctx.fillStyle = 'rgba(255,255,200,' + (beamAlpha * 0.7) + ')';
                ctx.beginPath();
                ctx.arc(fpx, fpy, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // ─── ボス WARNING オーバーレイ ───
    if (bossState.active && bossState.phase === 1) {
        var wAlpha = 0.3 + Math.sin(bossState.warningTimer * 0.2) * 0.2;
        ctx.fillStyle = 'rgba(255,0,0,' + wAlpha + ')';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        var textScale = 1 + Math.sin(bossState.warningTimer * 0.15) * 0.1;
        ctx.save();
        ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
        ctx.scale(textScale, textScale);
        ctx.font = "bold 48px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.strokeText(t('boss_warning'), 0, 0);
        ctx.fillText(t('boss_warning'), 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ─── ボス撃破テキスト ───
    if (bossState.active && bossState.phase === 4 && bossState.defeatedTimer >= 90) {
        var dAlpha = Math.min(1, (bossState.defeatedTimer - 90) / 30);
        ctx.save();
        ctx.globalAlpha = dAlpha;
        ctx.font = "bold 42px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = 'rgba(255,215,0,0.8)'; ctx.shadowBlur = 15;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.strokeText(t('boss_defeated'), GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.fillText(t('boss_defeated'), GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ─── ラウンドテキスト ───
    if (bossState.active && bossState.phase === 5) {
        var rAlpha = Math.min(1, bossState.roundTextTimer / 60);
        ctx.save();
        ctx.globalAlpha = rAlpha;
        ctx.font = "bold 50px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(100,100,255,0.8)'; ctx.shadowBlur = 15;
        ctx.fillText(t('boss_round') + (gameRound + 1), GAME_WIDTH / 2, GAME_HEIGHT / 2);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // チュートリアル案内バナー（画面上部中央・スクリーン座標）
    if (tutorialState.active && tutorialState.hintKey && !pipeRoomState.active) drawTutorialHint();

    drawSpecialCutin();
    gameState.time += frameSteps;
    // ⚠**最後に描く**（1.584）。真のエンディングの一枚絵は HUD・ボスHPバー・SPEED UP 表示より上に出す。
    if (undergroundState.active) drawUgEnding();
    // ⚠地上に戻った後（undergroundState.active=false）も白フェードは続くので、上の if の外＝無条件で呼ぶ（1.588）。
    drawGroundReturnFade();
}

// チュートリアルの案内バナー: 紺地+白枠のDQ風・複数行対応・残り20フレームでフェードアウト
function drawTutorialHint() {
    var lines = t(tutorialState.hintKey).split('\n');
    ctx.save();
    ctx.font = "bold 16px 'DotGothic16', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = 0;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    var lh = 22;
    var bw = w + 40, bh = lines.length * lh + 14;
    var bx = GAME_WIDTH / 2, by = 52 + bh / 2;
    ctx.globalAlpha = Math.min(1, tutorialState.hintTimer / 20) * 0.95;
    ctx.fillStyle = 'rgba(0,0,48,0.88)';
    drawRoundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    drawRoundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (var li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], bx, by - bh / 2 + 7 + lh / 2 + li * lh);
    }
    ctx.restore();
}

function updateUI() {
    if (!uiElements.distance) cacheUIElements();
    updateSpecialMoveUI();
    var pct  = Math.min(MAX_SPEED_PERCENT, 100 + (gameState.speedLevel - 1) * 20);
    var next = Math.max(0, gameState.speedLevel * SPEED_UP_INTERVAL - gameState.distance);
    // 差分更新: 値が変わった時だけDOMを更新
    if (prevUI.distance !== gameState.distance) { uiElements.distance.textContent = gameState.distance; prevUI.distance = gameState.distance; }
    if (prevUI.score !== gameState.score) { uiElements.score.textContent = gameState.score; prevUI.score = gameState.score; }
    if (uiElements.goldenEggCount && prevUI.eggs !== gameSettings.goldenEggs) { uiElements.goldenEggCount.textContent = (gameSettings.goldenEggs || 0); prevUI.eggs = gameSettings.goldenEggs; }
    if (prevUI.lives !== gameState.lives) { uiElements.lives.textContent = gameState.lives; prevUI.lives = gameState.lives; }
    // クリスタルハート（青）: 残数を「+N」で赤ライフの隣に表示（0なら非表示）
    var _cl = gameState.crystalLives || 0;
    if (prevUI.crystalLives !== _cl) {
        uiElements.crystalLives.textContent = _cl > 0 ? '+' + _cl : '';
        uiElements.crystalLives.style.display = _cl > 0 ? '' : 'none';
        prevUI.crystalLives = _cl;
    }
    if (prevUI.enemyKills !== gameState.enemyKills) { uiElements.enemyKills.textContent = gameState.enemyKills; prevUI.enemyKills = gameState.enemyKills; }
    if (prevUI.speedLevel !== gameState.speedLevel) { uiElements.speedLevel.textContent = gameState.speedLevel; prevUI.speedLevel = gameState.speedLevel; }
    if (prevUI.pct !== pct) { uiElements.speedPercent.textContent = pct; prevUI.pct = pct; }
    if (prevUI.next !== next) { uiElements.nextSpeedUp.textContent = next; prevUI.next = next; }
    // ふっかつマシーン（永続アップグレード）の所持数を HP の右に表示。
    // ふっかつやく（復活薬）は消費アイテムでストック枠に表示されるため、ここでは重複表示しない（1.496）。
    var revEl = uiElements.reviveIndicator;
    if (revEl) {
        var revCount = gameState.revivesLeft;
        if (revCount > 0 && prevUI.revives !== revCount) {
            // 旧: 🪶(羽の絵文字)＝内部名 revival_feather の名残。現在は「ふっかつマシーン」なので実アイコンに。
            var revIconsHtml = '';
            for (var fi = 0; fi < revCount; fi++) revIconsHtml += _ic('icon_revival_machine.png', 'ui-icon-sm');
            revEl.innerHTML = revIconsHtml;
            revEl.style.display = 'inline';
            prevUI.revives = revCount;
        } else if (revCount === 0 && prevUI.revives !== 0) {
            revEl.style.display = 'none';
            prevUI.revives = 0;
        }
    }
}
