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
            // 取得位置がプレイヤー(=画面左寄り)なので、文字全体(アイコン込み)が画面内に収まるようXをクランプ
            var halfPx = (half + 40) * scale;
            var cx = Math.max(gameState.camera.x + halfPx,
                     Math.min(wx, gameState.camera.x + GAME_WIDTH - halfPx));
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
    // 元のdrawTerrainと同一条件で列数・土の行数を算出（高さが連続値でも行数は離散になる）
    var cols = 0;
    for (var xx = 0; xx < width; xx += TILE) cols++;
    var rows = 0;
    for (var yy = TILE; yy < height + GRASS_OFFSET; yy += TILE) rows++;

    var key = type + '_' + cols + '_' + rows;
    if (terrainCache[key]) return terrainCache[key];

    var topTile;
    switch (type) {
        case 'elevated':           topTile = 'terrain_elevated_top'; break;
        case 'quicksand':          topTile = 'terrain_quicksand'; break;
        case 'quicksand_elevated': topTile = 'terrain_quicksand'; break;
        case 'ice':                topTile = 'terrain_ice'; break;
        case 'ice_elevated':       topTile = 'terrain_ice'; break;
        default:                   topTile = 'terrain_grass_top'; break;
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
            spriteManager.draw(cc, 'terrain_dirt', 0, lx2, ly, TILE, TILE, false);
        }
    }

    terrainCache[key] = cv;
    return cv;
}

function drawTerrain(t) {
    if (t.type === 'hole') return;
    // 焼き付け済みの地面画像を1枚blitするだけ（原点 = 元コードの (t.x, t.y - GRASS_OFFSET)）
    ctx.drawImage(getTerrainCache(t.type, t.width, t.height), t.x, t.y - 5);
}

function drawPlatform(p) {
    // 土管ボーナス部屋の入口（縦土管）: 専用スプライトで描く＋上に下向き矢印（乗って下スワイプ＝もぐる、の示唆）
    if (p.type === 'pipe') {
        // item_pipe.png は上13%/下10%に加え左右21.9%ずつも透明余白（実測: 192px中 可視x=42..149=108px）。
        // 素直に p.width で描くと見える管が当たり判定(PIPE_W)の約6割になり「土管に接していないのに乗れる」
        // 見た目のズレが出る（1.429ユーザー報告）。可視部分（最広部=上のリップ＝乗る面）が判定幅ちょうどに
        // 広がるよう横も相殺して描く＝PIPE_Wを変えても見た目と判定は常に一致する。
        // 縦は従来どおり: 上へ16pxずらし＋高さ+25（見える管の上端=足元・下端=地面）。
        if (pipeImg.complete && pipeImg.naturalWidth) {
            var _pw = p.width * (192 / 108);            // 全体描画幅（可視108pxが p.width になる倍率）
            var _px = p.x - p.width * (42 / 108);       // 左余白42pxぶん左へ
            ctx.drawImage(pipeImg, _px, p.y - 16, _pw, p.height + 25);
        } else {
            ctx.fillStyle = '#3cb043'; ctx.fillRect(p.x, p.y, p.width, p.height + 12);
        }
        if (pipeRoomState.anim !== 'none' && pipeRoomState.animPipe === p) return; // 出入り演出中は矢印/ヒントを消す（後描き側が管のみ描く）
        if (pipeRoomState.visited) return; // 入室済み（このラウンドは入れない）土管には矢印/ヒントを出さない
        var ax = p.x + p.width / 2, ay = p.y - 30 + Math.sin(gameState.time * 0.12) * 3;
        ctx.fillStyle = 'rgba(255,224,102,0.9)';
        ctx.beginPath();
        ctx.moveTo(ax, ay + 7); ctx.lineTo(ax - 6, ay - 2); ctx.lineTo(ax + 6, ay - 2);
        ctx.closePath(); ctx.fill();
        // 入場ヒント（1.407）: 矢印の上に「したにスワイプ」。土管タイム中は速い点滅で「今入れる」を強調
        var hintA = pipeAssistTimer > 0
            ? 0.55 + 0.45 * Math.sin(gameState.time * 0.4)
            : 0.55 + 0.25 * Math.sin(gameState.time * 0.1);
        ctx.save();
        ctx.globalAlpha = Math.max(0.2, hintA);
        ctx.fillStyle = '#ffe066';
        ctx.font = "bold 11px 'DotGothic16', monospace";
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(t('pipe_enter_hint'), ax, ay - 8);
        ctx.fillText(t('pipe_enter_hint'), ax, ay - 8);
        ctx.restore();
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

function drawFlyingEnemy(e) {
    markZukanSeen(enemyZukanId(e)); // ずかん: 遭遇として発見登録（バイオーム見た目ごとに別エントリ）
    // 上下ふわふわ(e.yの加算)は updateEnemies(index.html) 側へ移設＝当たり判定と描画が常に一致・リフレッシュレート非依存
    var bounce = Math.sin(e.animFrame / 2) * 0.5;
    var cy = e.y + bounce;
    var frameIdx = Math.floor(e.animFrame / 5) % 4;

    var flipH = (e.velX < 0); // 左移動中なら反転して左向きに
    spriteManager.draw(ctx, e.flySprite || 'flying_chick_fly', frameIdx, e.x, cy, e.width, e.height, flipH);
    e.animFrame += frameSteps;
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
        // きぐるみの電気弾（青白い稲妻＋発光）
        var zx = b.x + b.width / 2, zy = b.y + b.height / 2, zd = b.dir < 0 ? -1 : 1;
        ctx.shadowColor = '#8ecbff'; ctx.shadowBlur = 14;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(zx - zd * 8, zy - 5); ctx.lineTo(zx - zd * 2, zy - 1);
        ctx.lineTo(zx - zd * 4, zy + 2); ctx.lineTo(zx + zd * 8, zy + 5);
        ctx.stroke();
        ctx.strokeStyle = '#5bb8ff'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.shadowBlur = 8; ctx.fillStyle = '#eaf6ff';
        ctx.beginPath(); ctx.arc(zx, zy, 2.6, 0, Math.PI * 2); ctx.fill();
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

function drawEggProjectiles() {
    for (var i = 0; i < bossState.eggs.length; i++) {
        var egg = bossState.eggs[i];
        ctx.save();
        if (egg.isFlame) {
            // 闇の炎弾
            var fx = egg.x + egg.width / 2;
            var fy = egg.y + egg.height / 2;
            var flicker = Math.sin(egg.timer * 0.5) * 2;
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

    if (biomeState.current === 4) {
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

    // 背景雲 (夜は半透明に)
    var cloudAlpha = (biomeState.current === 3) ? 0.25 : 1;
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
    ctx.translate(-gameState.camera.x, 0);

    var camL = gameState.camera.x - 100, camR = gameState.camera.x + GAME_WIDTH + 100;
    var j;

    for (j = 0; j < terrain.length; j++) {
        var tr = terrain[j];
        if (tr.x + tr.width > camL && tr.x < camR) drawTerrain(tr);
    }
    drawShopBuilding(); // ショップ建物（地形の上、足場の下）
    for (j = 0; j < platforms.length; j++) {
        var p = platforms[j];
        if (p.x + p.width > camL && p.x < camR) drawPlatform(p);
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
            var _mouthY = _ap.y + PIPE_MOUTH_LINE;
            ctx.save();
            ctx.beginPath();
            ctx.rect(gameState.camera.x - 60, _mouthY - 600, GAME_WIDTH + 120, 600);
            ctx.clip();
            drawPlayer(player.x, player.y);
            ctx.restore();
        } else {
            drawPlayer(player.x, player.y);
        }
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
        var sp = Math.min(MAX_SPEED_PERCENT, 100 + (gameState.speedLevel - 1) * 20);
        ctx.save();
        ctx.globalAlpha = a;
        var sx2 = GAME_WIDTH / 2 - 150, sy2 = 68 + hudTopOffset;
        drawHudPanel(sx2, sy2, 300, 52, 'rgba(100,20,60,0.9)', 'rgba(60,10,35,0.92)', '#ff69b4', 'rgba(255,100,180,0.4)');
        // Rocket + text
        ctx.font = "bold 18px 'M PLUS Rounded 1c', sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(255,100,180,0.7)'; ctx.shadowBlur = 8;
        ctx.fillText(t('hud_speedup') + gameState.speedLevel + ' (' + sp + '%)', GAME_WIDTH / 2, sy2 + 27);
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
    if (prevUI.enemyKills !== gameState.enemyKills) { uiElements.enemyKills.textContent = gameState.enemyKills; prevUI.enemyKills = gameState.enemyKills; }
    if (prevUI.speedLevel !== gameState.speedLevel) { uiElements.speedLevel.textContent = gameState.speedLevel; prevUI.speedLevel = gameState.speedLevel; }
    if (prevUI.pct !== pct) { uiElements.speedPercent.textContent = pct; prevUI.pct = pct; }
    if (prevUI.next !== next) { uiElements.nextSpeedUp.textContent = next; prevUI.next = next; }
    // 復活の羽 残り回数表示
    var revEl = uiElements.reviveIndicator;
    if (revEl) {
        // ストック内の復活薬の数もカウント
        var potionCount = 0;
        for (var ri = 0; ri < stockState.items.length; ri++) {
            if (stockState.items[ri].id === 'revive_potion') potionCount++;
        }
        var totalRevives = gameState.revivesLeft + potionCount;
        if (totalRevives > 0 && prevUI.revives !== totalRevives) {
            var featherStr = '';
            for (var fi = 0; fi < gameState.revivesLeft; fi++) featherStr += '\u{1FAB6}';
            for (var pi = 0; pi < potionCount; pi++) featherStr += '\u{1F48A}';
            revEl.textContent = featherStr;
            revEl.style.display = 'inline';
            prevUI.revives = totalRevives;
        } else if (totalRevives === 0 && prevUI.revives !== 0) {
            revEl.style.display = 'none';
            prevUI.revives = 0;
        }
    }
}
