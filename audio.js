// ============================================================
// audio.js — SoundManagerクラス（BGM/SE全般）
// 依存: なし（クラス定義のみ。インスタンス化はindex.html側で行う）
// メソッドはgameSettings.soundEnabled（index.html側で定義）を実行時に参照する
// ============================================================

// ─── サウンド ───
class SoundManager {
    constructor() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) {
            this.ctx = null;
        }

        this.titleBGM    = this._createBGM('sounds/title.mp3',    0.6);
        this.stageBGM    = this._createBGM('sounds/stage.mp3',    0.5);
        this.stage2BGM   = this._createBGM('sounds/stage2.mp3',   0.5);
        this.stage3BGM   = this._createBGM('sounds/stage3.mp3',   0.5);
        this.stage4BGM   = this._createBGM('sounds/stage4.mp3',   0.5);
        this.stage5BGM   = this._createBGM('sounds/stage5.mp3',   0.5);
        this.tutorialBGM = this._createBGM('sounds/tutorial.mp3', 0.5); // チュートリアル「はじまりの地」（Suno生成・タグ除去済み）
        this.gameoverBGM = this._createBGM('sounds/gameover.mp3', 0.7);
        this.rankingBGM  = this._createBGM('sounds/ranking.mp3',  0.6);
        this.bossBGM     = this._createBGM('sounds/boss.mp3',     0.6);
        this.shopBGM     = this._createBGM('sounds/shop.mp3',     0.5);
        this.bonusBGM    = this._createBGM('sounds/bonus.mp3',    0.5);
        this.winBGM      = new Audio('sounds/win.mp3');
        this.winBGM.loop = false;
        this.winBGM.volume = 0.7;
        this.currentBGM  = null;

        // SE（効果音mp3）
        this.selectSE = new Audio('sounds/select.mp3');
        this.selectSE.volume = 0.5;
        this.orSE = new Audio('sounds/or.mp3');
        this.orSE.volume = 0.5;
        this.flashSE = new Audio('sounds/flash.mp3');
        this.flashSE.volume = 0.5;
        this.warningSE = new Audio('sounds/warning.mp3');
        this.warningSE.volume = 0.5;
        this.protectSE = new Audio('sounds/protect.mp3'); // 闇の卵の装甲で踏みを弾いた時の「キン」
        this.protectSE.volume = 0.55;
        this.criticalSE = new Audio('sounds/critical.mp3'); // 黄色メイド服のクリティカル演出
        this.criticalSE.volume = 0.6;
        this.pipeWarpSE = new Audio('sounds/dokan.mp3'); // 土管出入り（アルスパーク素材・商用可/クレジット任意）
        this.pipeWarpSE.volume = 0.6;
        // ぴよフラッシュ（必殺技）: チャージ音＋ビーム音
        this.specialChargeSE = new Audio('sounds/piyoflash_charge.mp3');
        this.specialChargeSE.volume = 0.6;
        this.specialFireSE = new Audio('sounds/piyoflash.mp3');
        this.specialFireSE.volume = 0.6;
    }

    _createBGM(src, vol) {
        var a = new Audio(src);
        a.loop = true;
        a.volume = vol;
        return a;
    }

    _osc(freq, dur, type, vol, startAt) {
        if (!this.ctx) return;
        var t = startAt || this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.value = freq;
        o.type = type || 'sine';
        g.gain.setValueAtTime(vol || 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + dur);
        o.start(t); o.stop(t + dur);
        return { osc: o, gain: g };
    }

    playJump() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        var t = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        o.frequency.exponentialRampToValueAtTime(600, t + 0.25);
        o.type = 'sine';
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        o.start(t); o.stop(t + 0.3);
    }

    playKill() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        var t = this.ctx.currentTime;
        // 連打スロットル: 50ms以内の連続呼び出しは無視（敵を一度に複数撃破した際のoscillator大量生成による処理落ちを防ぐ）
        if (this._killT && t - this._killT < 0.05) return;
        this._killT = t;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.setValueAtTime(800, t);
        o.frequency.exponentialRampToValueAtTime(200, t + 0.15);
        o.type = 'square';
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        o.start(t); o.stop(t + 0.2);
    }

    playItem() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        var notes = [523, 659, 784];
        var delays = [0, 50, 100];
        var vols = [0.25, 0.25, 0.3];
        for (var i = 0; i < notes.length; i++) this._itemNote(notes[i], delays[i], vols[i]);
        // エコー
        var self = this;
        setTimeout(function() {
            for (var i = 0; i < notes.length; i++) self._itemNote(notes[i], delays[i], vols[i] * 0.5);
        }, 150);
    }

    _itemNote(freq, delay, vol) {
        if (!this.ctx) return;
        var self = this;
        setTimeout(function() { self._osc(freq, 0.4, 'sine', vol); }, delay);
    }

    playCoin() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        // 連打スロットル: 50ms以内の連続呼び出しは無視（マグネットでコイン列を一気取得した際のoscillator大量生成による処理落ちを防ぐ）
        var t = this.ctx.currentTime;
        if (this._coinT && t - this._coinT < 0.05) return;
        this._coinT = t;
        this._osc(2093, 0.0625, 'sine', 0.1);
        var self = this;
        setTimeout(function() { self._osc(2637, 0.25, 'sine', 0.1); }, 63);
    }

    playDamage() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        var t = this.ctx.currentTime;
        var d = 0.125;
        this._dissonant(311.13, 329.63, t, d);
        this._dissonant(293.66, 311.13, t + d, d);
        this._dissonant(277.18, 293.66, t + d * 2, d);
    }

    _dissonant(f1, f2, start, dur) {
        if (!this.ctx) return;
        var o1 = this.ctx.createOscillator(), g1 = this.ctx.createGain();
        var o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
        o1.connect(g1); g1.connect(this.ctx.destination);
        o2.connect(g2); g2.connect(this.ctx.destination);
        o1.frequency.value = f1; o1.type = 'square';
        o2.frequency.value = f2; o2.type = 'square';
        g1.gain.setValueAtTime(0.15, start);
        g1.gain.exponentialRampToValueAtTime(0.01, start + dur);
        g2.gain.setValueAtTime(0.12, start);
        g2.gain.exponentialRampToValueAtTime(0.01, start + dur);
        o1.start(start); o2.start(start);
        o1.stop(start + dur); o2.stop(start + dur);
    }

    // mp3 SE共通再生（頭出しして再生）
    _playSE(audio) {
        audio.currentTime = 0;
        audio.play().catch(function(){});
    }

    playFlash() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        this._playSE(this.flashSE);
    }
    playProtect() { // 闇の卵の装甲で弾かれた時の「キン」
        if (!gameSettings.soundEnabled) return;
        this._playSE(this.protectSE);
    }
    playCritical() { // 黄色メイド服のクリティカル
        if (!gameSettings.soundEnabled) return;
        this._playSE(this.criticalSE);
    }
    playPipeWarp() { // 土管出入りの「シュポッ」（dokan.mp3＝アルスパーク素材。読めない環境はオシレータ合成にフォールバック）
        if (!gameSettings.soundEnabled) return;
        if (this.pipeWarpSE && !this.pipeWarpSE.error) { this._playSE(this.pipeWarpSE); return; }
        if (!this.ctx) return;
        var t = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(520, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.42);
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        o.start(t); o.stop(t + 0.5);
    }

    playLevelUp() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        var t = this.ctx.currentTime;
        var dur = 1.2;

        var mkOsc = function(ctx, type, freqs, times, gainVals) {
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = type;
            for (var i = 0; i < freqs.length; i++) {
                if (i === 0) o.frequency.setValueAtTime(freqs[i], times[i]);
                else o.frequency.exponentialRampToValueAtTime(freqs[i], times[i]);
            }
            for (var j = 0; j < gainVals.length; j++) {
                if (j === 0) g.gain.setValueAtTime(gainVals[j][0], gainVals[j][1]);
                else g.gain.exponentialRampToValueAtTime(gainVals[j][0], gainVals[j][1]);
            }
            return { osc: o, gain: g };
        };

        // melody
        var m = mkOsc(this.ctx, 'sine',
            [659.25, 698.46, 783.99, 880], [t, t+0.3, t+0.6, t+dur],
            [[0.05, t], [0.25, t+0.3], [0.01, t+dur+0.2]]);
        // harmony
        var h = mkOsc(this.ctx, 'sine',
            [523.25, 587.33, 659.25, 698.46], [t, t+0.3, t+0.6, t+dur],
            [[0.05, t], [0.2, t+0.3], [0.01, t+dur+0.2]]);
        // bass
        var b = mkOsc(this.ctx, 'triangle',
            [261.63, 293.66, 329.63, 349.23], [t, t+0.3, t+0.6, t+dur],
            [[0.05, t], [0.15, t+0.3], [0.01, t+dur+0.2]]);
        // sparkle
        var s = mkOsc(this.ctx, 'square',
            [1318.51, 1760], [t+0.2, t+0.8],
            [[0, t+0.2], [0.15, t+0.5], [0.01, t+0.9]]);

        m.osc.start(t); h.osc.start(t); b.osc.start(t); s.osc.start(t+0.2);
        m.osc.stop(t+dur+0.2); h.osc.stop(t+dur+0.2); b.osc.stop(t+dur+0.2); s.osc.stop(t+0.9);
    }

    // ─── ボス警告SE ───
    playBossWarning() {
        if (!gameSettings.soundEnabled) return;
        try {
            this._playSE(this.warningSE);
            setTimeout(() => { this.warningSE.pause(); }, 2000); // 2秒で停止
        } catch (_) {}
    }

    // ─── ボス撃破ファンファーレ (win.mp3) ───
    playBossFanfare() {
        if (!gameSettings.soundEnabled) return;
        this.stopAllBGM();
        this.winBGM.currentTime = 0;
        this.winBGM.play().then(function(){}).catch(function(){});
        this.currentBGM = this.winBGM;
    }

    // ─── ボスBGM再生 ───
    playBossBGM() {
        if (!gameSettings.soundEnabled) return;
        this.stopAllBGM();
        this.bossBGM.currentTime = 0;
        this.bossBGM.play().then(function(){}).catch(function(){});
        this.currentBGM = this.bossBGM;
    }

    playBGM(type) {
        this.stopAllBGM();
        if (!gameSettings.soundEnabled) return;
        var target = this[type + 'BGM'];
        if (!target) return;
        target.currentTime = 0;
        target.play().then(function() {}).catch(function() {});
        this.currentBGM = target;
    }

    stopAllBGM() {
        var bgms = [this.titleBGM, this.stageBGM, this.stage2BGM, this.stage3BGM, this.stage4BGM, this.stage5BGM, this.tutorialBGM, this.gameoverBGM, this.rankingBGM, this.bossBGM, this.shopBGM, this.bonusBGM, this.winBGM];
        for (var i = 0; i < bgms.length; i++) {
            if (bgms[i]) { bgms[i].pause(); bgms[i].currentTime = 0; }
        }
        this.currentBGM = null;
    }

    // ─── カーソル移動・クリック音（select.mp3） ───
    playCursorMove() {
        if (!gameSettings.soundEnabled) return;
        this._playSE(this.selectSE);
    }

    // ─── はい/いいえ決定音（or.mp3） ───
    playConfirmSelect() {
        if (!gameSettings.soundEnabled) return;
        this._playSE(this.orSE);
    }

    // ─── ぴよフラッシュ: チャージ音（発動演出の頭から） ───
    playSpecialCharge() {
        if (!gameSettings.soundEnabled) return;
        this._playSE(this.specialChargeSE);
    }
    stopSpecialCharge() {
        try { this.specialChargeSE.pause(); this.specialChargeSE.currentTime = 0; } catch (_) {}
    }
    // ─── ぴよフラッシュ: ビーム発射音（着弾時） ───
    playSpecialFire() {
        if (!gameSettings.soundEnabled) return;
        this._playSE(this.specialFireSE);
    }
}
