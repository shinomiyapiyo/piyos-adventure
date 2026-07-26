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
        this.stage6BGM   = this._createBGM('sounds/stage6.mp3',   0.5); // R6（闇のカカシのラウンド・Suno生成/タグ除去済み）
        // 地底ステージ(R7)とそのボス「闇の巫女」。素材はタグ除去済み（[[piyo-suno-audio-tags]]）。
        // ⚠**呼び名は playBGM(type) の type + 'BGM' で引かれる**（playBGM 参照）。つまり鳴らす側は
        //   playBGM('underground') / playBGM('bossUnderground')。'boss_underground' と書くと
        //   this['boss_undergroundBGM'] を探して見つからず、**stopAllBGM だけ効いて無音になる**（1.570で修正）。
        this.undergroundBGM     = this._createBGM('sounds/underground.mp3',     0.5); // R7 地底ステージ
        this.bossUndergroundBGM = this._createBGM('sounds/boss_underground.mp3', 0.6); // R7 ボス（ラスボス的存在）
        this.tutorialBGM = this._createBGM('sounds/tutorial.mp3', 0.5); // チュートリアル「はじまりの地」（Suno生成・タグ除去済み）
        this.gameoverBGM = this._createBGM('sounds/gameover.mp3', 0.7);
        this.rankingBGM  = this._createBGM('sounds/ranking.mp3',  0.6);
        this.bossBGM     = this._createBGM('sounds/boss.mp3',     0.6);
        this.shopBGM     = this._createBGM('sounds/shop.mp3',     0.5);
        // 怪しい老婆の店（地底）専用（1.570・ユーザー提供 "Oddity Cabinet.mp3"）。
        // ⚠[[piyo-suno-audio-tags]] のとおり ffmpeg でタグとアルバムアート(mjpegストリーム)を全除去して
        //   sounds/shop_underground.mp3 として置いてある。元ファイル名の空白もここで解消している。
        this.shopUndergroundBGM = this._createBGM('sounds/shop_underground.mp3', 0.5);
        this.bonusBGM    = this._createBGM('sounds/bonus.mp3',    0.5);
        // 地底クリアの「真のエンディング」専用BGM（1.584・Suno生成予定）。
        // ⚠mp3がまだ無い間は play() が失敗するだけで落ちない。hasBGM() が false を返すので、
        //   呼び出し側（ugPriestessDefeated 後の演出）はファンファーレの余韻をそのまま続ける。
        //   届いたら sounds/ug_ending.mp3 として置くだけで自動的に鳴る（[[piyo-suno-audio-tags]]＝タグ除去を忘れずに）。
        this.ugEndingBGM = this._createBGM('sounds/ug_ending.mp3', 0.6);
        this.ugEndingBGM.loop = false;
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
        // 地底の入場土管がせり上がる地響き（1.556・ユーザー提供「地響き.mp3」→ pipe_rise.mp3 にリネーム＋タグ除去済み）。
        // ⚠1.557で3.0秒ちょうどに切り出し済み（末尾0.5秒フェードアウト）＝UG_PIPE_RISE_FRAMES(180=3.0秒)と一致。
        //   原盤10.79秒は tools/_raw/pipe_rise_full.mp3 に保管。念のため stopRumble() でも止める。
        this.pipeRiseSE = new Audio('sounds/pipe_rise.mp3');
        this.pipeRiseSE.volume = 0.7;
        // 闇の巫女の技（1.570・ユーザー提供の魔法SE 4種。⚠元のファイル名と用途は無関係＝
        // 音の質感で割り当てた。暗黒魔法→大詠唱／重力魔法1→魔法陣の光柱／雷魔法1→呪弾／
        // ステータス上昇魔法1→フェーズ移行の解放。タグとアルバムアートは ffmpeg で除去済み）。
        this.ugCurseSE  = new Audio('sounds/ug_boss_curse.mp3');   // 呪弾（扇・螺旋・反撃）
        this.ugCurseSE.volume  = 0.45;                             // ⚠連射するので他のSEより控えめに
        this.ugSigilSE  = new Audio('sounds/ug_boss_sigil.mp3');   // 魔法陣→光柱
        this.ugSigilSE.volume  = 0.6;
        this.ugDarkSE   = new Audio('sounds/ug_boss_dark.mp3');    // 大詠唱（暗転）
        this.ugDarkSE.volume   = 0.65;
        this.ugAwakenSE = new Audio('sounds/ug_boss_awaken.mp3');  // フェーズ移行の解放
        this.ugAwakenSE.volume = 0.7;
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

    // ─── 闇のカカシ 召喚（雑魚を呼ぶ）の合図（1.558）───
    // ⚠攻撃2種（横薙ぎ・対空）は共通で playFlash（ユーザー指定＝同じSEはこの2パターンだけ）。
    //   召喚は対空と同じ playFlash を鳴らしていたため
    // 「何も攻撃が起きていないのにSEだけ鳴る」とユーザーに聞こえていた。攻撃モーションが無い技なので、
    // 「呼んでいる」と分かる専用の音に分ける。2音を上向きに滑らせる不気味なコール。
    playSummon() {
        if (!this.ctx || !gameSettings.soundEnabled) return;
        var t = this.ctx.currentTime;
        var base = [300, 452];   // わずかにずらした2音＝濁った響き（藁人形が呼ぶ感じ）
        for (var i = 0; i < 2; i++) {
            var o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.connect(g); g.connect(this.ctx.destination);
            o.type = 'square';
            o.frequency.setValueAtTime(base[i], t);
            o.frequency.linearRampToValueAtTime(base[i] * 2.2, t + 0.26);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.10, t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
            o.start(t); o.stop(t + 0.38);
        }
    }

    // ─── 地底の入場土管がせり上がる轟音（1.554）───
    // 「地面の下から巨大な石造りが押し上がってくる」音。⚠mp3は増やさず WebAudio で合成する（playKill と同方式）。
    // 低音のこぎり波を2本わずかにデチューンして重ねる＝うなりが出て“轟音”になる。ピッチを上げていくことで
    // 迫り上がる動きと一致させ、さらに矩形波のサブベースで地響きの芯を足す。
    // ⚠音源(pipe_rise.mp3)があればそれを使い、無ければ下の合成音にフォールバックする（playPipeWarp と同じ形）。
    playRumble(dur) {
        if (!gameSettings.soundEnabled) return;
        if (this.pipeRiseSE && !this.pipeRiseSE.error) {
            try { this.pipeRiseSE.volume = 0.7; } catch (_) {}   // 前回のフェードアウトから音量を戻す
            this._playSE(this.pipeRiseSE);
            return;
        }
        if (!this.ctx) return;
        var t = this.ctx.currentTime, d = dur || 0.9;
        for (var i = 0; i < 2; i++) {
            var o = this.ctx.createOscillator();
            var g = this.ctx.createGain();
            o.connect(g); g.connect(this.ctx.destination);
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(38 + i * 3, t);          // わずかにずらして"うなり"を作る
            o.frequency.linearRampToValueAtTime(70 + i * 5, t + d);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.14, t + 0.12); // 立ち上がり
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);  // 出切ったら収束
            o.start(t); o.stop(t + d + 0.05);
        }
        var sub = this.ctx.createOscillator();
        var sg = this.ctx.createGain();
        sub.connect(sg); sg.connect(this.ctx.destination);
        sub.type = 'square';
        sub.frequency.setValueAtTime(26, t);
        sub.frequency.linearRampToValueAtTime(44, t + d);
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.10, t + 0.16);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + d);
        sub.start(t); sub.stop(t + d + 0.05);
    }

    // 地響きを止める（1.556・ユーザー指定「せり上がり切ったところで止めて無音に」）。
    // ⚠音源は10.8秒あるので、演出(0.9秒)が終わったら必ずこれを呼ぶこと。
    // ⚠即 pause するとプツッと切れるので、120msだけフェードしてから止める（"無音になる"は同じ）。
    stopRumble() {
        var a = this.pipeRiseSE;
        if (!a) return;
        if (this._rumbleFade) { clearInterval(this._rumbleFade); this._rumbleFade = null; }
        var self = this, steps = 6;
        this._rumbleFade = setInterval(function () {
            steps--;
            try {
                if (steps <= 0) {
                    a.pause(); a.currentTime = 0; a.volume = 0.7;
                    clearInterval(self._rumbleFade); self._rumbleFade = null;
                } else {
                    a.volume = Math.max(0, a.volume - 0.7 / 6);
                }
            } catch (_) { clearInterval(self._rumbleFade); self._rumbleFade = null; }
        }, 20);
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
    // ─── 闇の巫女の技（1.570）───
    // ⚠通常のSE(playFlash等)と分けてある＝地上の攻撃音と混ざらず「ボス専用の音」として聞こえる。
    playUgCurse()  { if (gameSettings.soundEnabled) this._playSE(this.ugCurseSE); }   // 呪弾
    playUgSigil()  { if (gameSettings.soundEnabled) this._playSE(this.ugSigilSE); }   // 魔法陣→光柱
    playUgDark()   { if (gameSettings.soundEnabled) this._playSE(this.ugDarkSE); }    // 大詠唱
    playUgAwaken() { if (gameSettings.soundEnabled) this._playSE(this.ugAwakenSE); }  // フェーズ移行の解放
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

    // そのBGMの音源が実在するか（未配置のmp3を鳴らそうとして「無音になるだけ」を避ける）。
    // ⚠networkState===3 は NETWORK_NO_SOURCE＝取得に失敗した状態。error も併せて見る。
    hasBGM(type) {
        var a = this[type + 'BGM'];
        if (!a) return false;
        return !a.error && a.networkState !== 3;
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
        // ⚠新しいBGMを足したら**必ずこの配列にも足す**（漏れると前の曲が止まらず二重に鳴る）
        var bgms = [this.titleBGM, this.stageBGM, this.stage2BGM, this.stage3BGM, this.stage4BGM, this.stage5BGM, this.stage6BGM, this.undergroundBGM, this.bossUndergroundBGM, this.tutorialBGM, this.gameoverBGM, this.rankingBGM, this.bossBGM, this.shopBGM, this.shopUndergroundBGM, this.bonusBGM, this.winBGM, this.ugEndingBGM];
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

    // ─── バックグラウンド/ATT/広告からの復帰: 音を確実に戻す ───
    // iOSは前面を離れるとHTML5のBGMを一時停止し、AudioContextもsuspendする。前面復帰やユーザー操作時に両方戻す。
    resume() {
        if (!gameSettings.soundEnabled) return;
        if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (_) {} }
        var b = this.currentBGM;
        if (b && b.paused && !b.ended) { b.play().then(function(){}).catch(function(){}); }
    }
}
