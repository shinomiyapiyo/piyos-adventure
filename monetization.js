// ============================================================
// monetization.js — 広告/課金ブリッジ（index.html から分離 / Ver.1.333, Step2）
// 内容: 広告ブリッジ(showAd stub)・課金ブリッジ(purchaseItem stub)/IAP商品/購入ロジック/
//       課金ストアUI・リワード広告の状態管理。
// ※現状すべて stub（ネイティブ未統合）。Capacitor+AdMob / IAP 導入時はこのファイルを差し替える。
// 依存: gameSettings/saveSettings/soundManager/各UI関数 等のグローバルを実行時参照。
// 読み込み順: スプライト定義の後・ゲーム本体ロジックの前（元の実行順を保持）。
// ============================================================
// ─── 広告ブリッジ（AdMob / Capacitor 統合）───
// showAd(type, callback): 'interstitial'=インタースティシャル(callback不要) / 'reward'=リワード(callback(success))
//  - ネイティブ(iOS/Android): @capacitor-community/admob を Capacitor.Plugins.AdMob 経由で使用
//  - Web/PWA: 従来どおりの簡易フォールバック（reward=成功扱い / interstitial=無し）
//  - gameSettings.adFree（広告非表示を購入済み）は常に広告をスキップして成功扱い
(function () {
    var Cap = window.Capacitor;
    var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
    var AdMob = (isNative && Cap.Plugins) ? Cap.Plugins.AdMob : null;

    // ★★ リリースビルドでは必ず false（本番の広告ユニットIDを使う）。開発中は true = Googleのテスト広告 ★★
    var AD_TEST = false;

    // Google公式テスト広告ユニットID（iOS/Android共通で使用可）
    var TEST_IDS = {
        interstitial: 'ca-app-pub-3940256099942544/4411468910',
        reward:       'ca-app-pub-3940256099942544/1712485313'
    };
    // 本番の広告ユニットID（プラットフォーム別・AdMobコンソールで発行済み）
    var PROD_IDS = {
        ios:     { interstitial: 'ca-app-pub-4148293353679224/7011611961', reward: 'ca-app-pub-4148293353679224/3275426791' },
        android: { interstitial: 'ca-app-pub-4148293353679224/8133121941', reward: 'ca-app-pub-4148293353679224/7418806070' }
    };
    function adUnit(kind) {
        if (AD_TEST) return TEST_IDS[kind];
        var plat = (Cap && Cap.getPlatform) ? Cap.getPlatform() : 'ios';
        return (PROD_IDS[plat] || PROD_IDS.ios)[kind];
    }

    // プラグインのイベント名（@capacitor-community/admob v8）
    var EV = {
        interLoaded:   'interstitialAdLoaded',
        interShowed:   'interstitialAdShowed',
        interDismiss:  'interstitialAdDismissed',
        interFailShow: 'interstitialAdFailedToShow',
        rewLoaded:     'onRewardedVideoAdLoaded',
        rewFailLoad:   'onRewardedVideoAdFailedToLoad',
        rewReward:     'onRewardedVideoAdReward',
        rewShowed:     'onRewardedVideoAdShowed',
        rewDismiss:    'onRewardedVideoAdDismissed',
        rewFailShow:   'onRewardedVideoAdFailedToShow'
    };

    var interReady = false, rewardReady = false;
    var pendingReward = null;      // 視聴中リワードのcallback（1本のみ・解決で即null）
    var rewardWantShow = false;    // リワード未ロード時「ロード完了で表示」の予約
    var pendingInterDone = null;   // インタースティシャルを閉じたら呼ぶ（リトライの順序制御）
    var rewardWatchdog = null;     // 表示後に報酬/閉じイベントが来ない場合の保険タイマー（pendingRewardの詰まり防止）
    var rewardRetryScheduled = false; // ロード失敗後の自動リトライが予約済みか（多重予約を防ぐ）
    // 1.521: 報酬コールバックは「広告が実際に閉じた(Dismiss)後」に実行する＝復活/入金が広告表示中に
    // 起きて見えない/ゲームが裏で進む問題の対策。Reward発火では結果を記録するだけ（取りこぼし防止）。
    var rewardShownResult;         // 表示中広告の視聴結果（undefined=未確定 / true=報酬獲得 / false=未獲得で閉じ）
    var rewardFinalizeTimer = null; // Dismissのグレース/保険用タイマー（Reward/Dismissの発火順ゆれ対策）
    // ⚠1.597: 「今フルスクリーン広告が画面に出ているか」。1.596まではこの状態を一切持っておらず、
    //   プラグインが出す Showed イベント（onRewardedVideoAdShowed / interstitialAdShowed・iOS/Android共通）を
    //   購読していなかった。そのため 20秒ウォッチドッグが**視聴中の実広告を「未表示」と誤判定**して
    //   finalizeReward(false,false) を実行 → house ad が実広告の裏で起動していた（ユーザー報告のバグ③）。
    //   Showed↔Dismiss/FailShow で必ず対にすること。
    var adOnScreen = false;
    // ⚠1.603: `Showed` イベントが届かない端末でも「広告を出しに行った」ことを知るための第2の手掛かり。
    //   presentReward で立て、Dismiss/FailShow/showRewardVideoAd の reject で必ず落とす。
    //   showRewardVideoAd が reject もせず FailShow も来ていない＝**広告は画面に出ている**とみなす。
    var rewardPresenting = false;
    // ⚠1.606: 「この視聴要求で、広告が**実際に画面に出たことが一度でもあるか**」。
    //   これが false のまま終わった＝ユーザーは見ることも閉じることもできていない＝**本人に非がない**。
    //   その場合は自社カードへ回して**必ず報酬を出す**（ユーザー指定「ユーザーには非がないため確実に付与」）。
    //   ⚠逆に true なら「見せたのに途中で閉じた」＝報酬なしのまま（従来どおり・不正視聴の抑止）。
    var rewardEverShown = false;
    // ⚠1.606: 見張りの空振り回数。Showed が来ないまま REWARD_STALL_LIMIT 回（20秒×3＝60秒）待っても
    //   何も起きなければ「広告は出なかった」と判断して自社カードへ回す＝報酬を必ず出す。
    var rewardStallCount = 0;
    var REWARD_STALL_LIMIT = 3;
    // ⚠1.603: 「広告を最後まで見たのに復活できない」への救済（ユーザー実機報告・スクショで確認）。
    //   AdMob は「報酬を獲得しました」を出しているのに、JS側が先に失敗として片付けていると
    //   rewReward が `if (!pendingReward) return;` で**捨てられ、視聴が丸ごと無駄になる**。
    //   失敗で片付けた時のコールバックをここに覚えておき、遅れて報酬が届いたら成功として実行する。
    var lateReward = null;           // { cb: function, done: boolean }
    var pendingInterWatchdog = null; // インタースティシャルが閉じイベントを返さない詰まりへの保険
    var INTER_WATCHDOG_MS = 60000;   // 表示要求からこの時間で音沙汰が無ければリトライを再開させる
    var REWARD_WATCHDOG_MS = 20000;   // 表示後この時間イベントが来なければ失敗解決（1.591・60秒は長すぎた＝下のrecoverStuckRewardAd参照）
    var REWARD_RELOAD_DELAY_MS = 30000; // ロード失敗後の再ロード間隔（在庫回復待ち）
    var REWARD_LOAD_WAIT_MS    = 10000; // 未ロードで要求された時、表示できるまで待つ上限（1.606・6秒から延長）

    // 自社ゲーム紹介カードが使えるか（実広告が無くても報酬を出せる backstop）。
    function houseAdReady() { return typeof window.showHouseAd === 'function' && !!(window.HOUSE_AD_GAMES && window.HOUSE_AD_GAMES.length); }
    // リワードが「今すぐ実行できるか」。Web/PWA(AdMob無し)＝常にtrue／実広告ready／自社カードbackstopがあればtrue＝ボタン常時有効。
    function rewardAvailable() { return !AdMob || rewardReady || houseAdReady(); }
    window.isRewardReady = rewardAvailable;

    // rewardReady が変化したら UI(復活/ショップの「準備中」表示)へ通知。同値なら何もしない。
    function setRewardReady(v) {
        v = !!v;
        if (rewardReady === v) return;
        rewardReady = v;
        if (typeof window.onRewardReadyChange === 'function') { try { window.onRewardReadyChange(rewardAvailable()); } catch (e) {} }
    }

    // ロード失敗後、一定時間後に1回だけ再ロードを試みる（在庫ゼロ/一時失敗からの復帰。多重予約は防ぐ）。
    function scheduleRewardReload() {
        if (rewardRetryScheduled || !AdMob) return;
        rewardRetryScheduled = true;
        setTimeout(function () { rewardRetryScheduled = false; if (!rewardReady && !pendingReward) prepareReward(); }, REWARD_RELOAD_DELAY_MS);
    }

    // 表示要求後イベントが来ない詰まりへの保険（1.591で新設・1.597で「視聴中は決着させない」に修正）。
    // ⚠このタイマーの目的は「広告が**出せなかった**のに無反応で終わるのを防ぐ」こと。
    //   広告が実際に画面に出ている間に発火させてはいけない＝出ている間は決着せず見張りだけ続ける
    //   （出しっぱなしで閉じられないのは①の既知バグ＝プラグイン側の問題で、脱出は
    //    visibilitychange の recoverStuckRewardAd が受け持つ。ここで勝手に決着させると house ad が裏で開く）。
    function armRewardWatchdog() {
        if (rewardWatchdog) clearTimeout(rewardWatchdog);
        rewardWatchdog = setTimeout(function () {
            rewardWatchdog = null;
            if (!pendingReward) return;
            // ⚠1.603: `adOnScreen`（Showedイベント）だけに頼らない。**showRewardVideoAd を呼んで
            //   reject も FailShow も来ていない間**は、広告が出ていると考えて決着させない。
            //   実機で「30秒級の広告を最後まで見たのに『広告を読み込めませんでした』が出て復活できない」
            //   という報告があり、Showed が届いていない端末では旧コードがここで失敗確定していた。
            //   本当に閉じられない場合の脱出は visibilitychange の recoverStuckRewardAd が受け持つ。
            // ⚠Showed を受け取っている＝広告は本当に画面に出ている。ここで勝手に決着させると
            //   自社カードが実広告の裏で開く（1.597で直したバグ③）。脱出は recoverStuckRewardAd に任せて待ち続ける。
            if (adOnScreen) { armRewardWatchdog(); return; }
            // ⚠1.606: Showed が一度も来ていないのに音沙汰が無いケース。**無限に待たない**。
            //   ユーザー実機報告「1つ再生して2つ目が再生されず、報酬獲得失敗に終わった」＝この状態だった。
            //   REWARD_STALL_LIMIT 回ぶん待って何も起きなければ「広告は出なかった」と判断し、
            //   wasShown=false で決着＝自社カードへ回して**必ず報酬を出す**（ユーザーに非がないため）。
            if (rewardPresenting && ++rewardStallCount < REWARD_STALL_LIMIT) { armRewardWatchdog(); return; }
            finalizeReward(rewardShownResult === true, rewardEverShown);
        }, REWARD_WATCHDOG_MS);
    }

    // リワードを実際に表示する（ready確定後の共通処理）。表示後イベントが来ない詰まりに保険タイマーを張る。
    function presentReward() {
        setRewardReady(false);
        rewardShownResult = undefined; // 新しい広告表示ごとに視聴結果をリセット
        adOnScreen = false;            // Showed を受け取るまでは「未表示」
        rewardPresenting = true;       // ⚠1.603: reject/FailShow/Dismiss が来るまでは「出しに行った」状態
        rewardStallCount = 0;          // 1.606: 見張りの空振り回数をリセット
        if (rewardFinalizeTimer) { clearTimeout(rewardFinalizeTimer); rewardFinalizeTimer = null; }
        armRewardWatchdog();
        // ⚠1.603: **resolve は「報酬を獲得した」ことを意味する**（プラグインの実装をiOS/Android両方で確認済み）。
        //   iOS: AdRewardExecutor.swift の ad.present(userDidEarnRewardHandler:{ … call.resolve(…) })
        //   Android: RewardedAdCallbackAndListeners.kt の OnUserEarnedRewardListener{ … call.resolve(…) }
        //   ＝報酬を得ずに閉じた場合は resolve も reject もされない。よって then は「視聴完了」の確実な信号になる。
        //   ⚠これを使う理由: 実機で「AdMobは『報酬を獲得しました』と出しているのにゲームは復活しない」報告があり、
        //   onRewardedVideoAdReward **イベントだけに頼ると取りこぼした時に視聴が丸ごと無駄になる**。
        //   イベントと then の**どちらか一方でも届けば**報酬が成立するようにする（二重でも rewardShownResult は true のまま）。
        AdMob.showRewardVideoAd()
            .then(function () {
                if (!pendingReward) {
                    // すでに片付けた後に届いた＝救済経路へ回す（rewReward リスナーと同じ扱い）
                    if (lateReward && !lateReward.done) {
                        lateReward.done = true;
                        var lcb = lateReward.cb; lateReward = null;
                        try { lcb(true, { shown: true, late: true }); } catch (_) {}
                    }
                    return;
                }
                rewardShownResult = true;
                armRewardFinalizeFallback();
            })
            .catch(function () { rewardPresenting = false; finalizeReward(false, false); });
    }

    function prepareInterstitial() {
        if (!AdMob) return;
        AdMob.prepareInterstitial({ adId: adUnit('interstitial'), npa: true }) // npa=非パーソナライズ広告（トラッキングなし方針）
            .then(function () { interReady = true; })
            .catch(function () { interReady = false; });
    }
    function prepareReward() {
        if (!AdMob) return;
        AdMob.prepareRewardVideoAd({ adId: adUnit('reward'), npa: true }) // npa=非パーソナライズ広告（トラッキングなし方針）
            .then(function () { setRewardReady(true); })
            .catch(function () { setRewardReady(false); scheduleRewardReload(); });
    }

    // リワードのコールバックを「1回だけ」実行（＝実際の報酬付与/復活/入金）。1.521で settleReward から改名し、
    // 「広告が閉じた後に呼ぶ」設計に変更（下のリスナー参照）。取りこぼし防止は rewardShownResult で担保。
    // wasShown: 広告が実際に画面表示されたか（=機会を消費してよいか）。callbackへ {shown} で渡す。
    function finalizeReward(result, wasShown) {
        if (rewardWatchdog) { clearTimeout(rewardWatchdog); rewardWatchdog = null; }
        if (rewardFinalizeTimer) { clearTimeout(rewardFinalizeTimer); rewardFinalizeTimer = null; }
        // ⚠1.597: 未ロード時の「ロード完了で表示」予約はここで必ず落とす。落とさないと pendingReward が
        //   別経路で消えた後に rewLoaded が来て、**誰も要求していない実広告が勝手に再生される**。
        rewardWantShow = false;
        var cb = pendingReward;
        if (!cb) { return; }
        pendingReward = null;
        rewardShownResult = undefined;
        setRewardReady(false);
        prepareReward();            // 次のリワードを事前ロード
        // 実広告が表示されなかった(在庫ゼロ/ロード失敗)＝ユーザーに非がない → 自社ゲーム紹介カードを見せて報酬を出す。
        // ③実広告を途中で閉じた(wasShown:true)は対象外＝報酬なしのまま。
        // ⚠1.597: `!adOnScreen` が最後の砦。実広告が画面に出ている最中に自社カードを開くと、
        //   カードはネイティブ広告の**裏**（z-index:2147483000 のDOM）で3秒カウントまで終わり、
        //   実広告を閉じた瞬間に露出する＝ユーザー報告の「実広告の直後に自社カードも出た」の正体。
        // ⚠1.603: 失敗で片付ける時は、遅れて届く報酬で救済できるようコールバックを覚えておく。
        //   成功で片付けた時は救済枠を空にする（二重付与を防ぐ）。
        lateReward = (result === false) ? { cb: cb, done: false } : null;
        if (result === false && wasShown === false && !adOnScreen && houseAdReady()) {
            window.showHouseAd(function (viewed) {
                if (!lateReward || lateReward.done) return;   // 実広告の報酬で既に救済済み＝二重付与しない
                lateReward = null;
                cb(!!viewed, { shown: !!viewed, house: true });
            });
            return;
        }
        cb(result, { shown: !!wasShown });
    }

    // ⚠1.591: リワード広告が閉じられず復帰不能になる不具合対策（ユーザー報告）。
    //   原因は @capacitor-community/admob 側の既知の未解決バグ＝Dynamic Islandがリワード広告の閉じるボタンに
    //   被って押せなくなる（GitHub issue #197、8.0.0=最新でも未修正）。この関数はJS側からは直せない前提で、
    //   「強制終了しなくても脱出できる経路」を用意するための保険。visibilitychange（本当の背景化。native でも
    //   信頼できる＝bootstrap.js参照）で復帰した瞬間、リワードが詰まっていれば強制的に片付ける。
    //   ⚠報酬は与えない(result=false)＝視聴完了か脱出かを区別できないため、見なかった扱いで統一する。
    function recoverStuckRewardAd() {
        // ⚠1.597: ここで adOnScreen を必ず落とす。落とし忘れると true が residual に残り、以後
        //   「実広告が出せない時の自社カード」が finalizeReward の !adOnScreen ガードで永久に出せなくなる
        //   （＝報酬を1つも受け取れなくなる）。復帰した＝画面を覆っていた広告はもう無い、と扱う。
        adOnScreen = false;
        rewardPresenting = false;      // 1.603: 復帰した＝画面を覆っていた広告はもう無い
        if (!pendingReward) return;
        // ⚠1.604: **すでに報酬を受け取っていたら、それを尊重して成功で片付ける**（ユーザー実機報告）。
        //   旧コードは `finalizeReward(false, true)` と false 決め打ちで、
        //   「広告が途中で止まる → ホームへ戻る → 復帰 → 続きが再生されて報酬獲得」という流れでも、
        //   **復帰した瞬間にこの関数が報酬を捨てて失敗確定**していた（＝ボーナスがもらえない）。
        //   1.591の「視聴完了か脱出かを区別できない」という前提は、rewardShownResult / showRewardVideoAd の
        //   resolve を見るようになった今は成り立たない＝区別できる。
        //   ⚠1.606: wasShown も **true 決め打ちをやめる**。広告が一度も画面に出ていなければ本人に非がないので
        //   自社カードへ回して必ず報酬を出す。出た上で離脱した場合だけ従来どおり報酬なし。
        finalizeReward(rewardShownResult === true, rewardEverShown);
    }
    window.recoverStuckRewardAd = recoverStuckRewardAd;

    // 広告が閉じた直後にゲーム側の音声を張り直す（1.597）。
    // ⚠実機報告「広告を挟むとBGM/SEが完全に鳴らなくなる」への対策。BGMはHTML5 <audio> 要素なので、
    //   要素が paused=false のまま無音に固まると SoundManager.resume() の paused ガードで**永久に空振り**する。
    //   ⚠これはJS側で戻せる分だけの対策。Google Mobile Ads SDK が iOS の AVAudioSession を
    //   返さないケースはネイティブ層の問題でここでは直せない（アプリにもプラグインにも
    //   AVAudioSession を触るコードは1行も無く、セッション管理はSDK内部に委ねられている）。
    function recoverGameAudio() {
        setTimeout(function () {
            try {
                if (typeof soundManager === 'undefined' || !soundManager) return;
                if (typeof soundManager.resumeHard === 'function') soundManager.resumeHard();
                else if (typeof soundManager.resume === 'function') soundManager.resume();
            } catch (_) {}
        }, 250); // 広告のViewControllerが畳まれて音声セッションが戻るのを少し待つ
    }

    // Reward発火で報酬結果を記録するが、cbの実行は広告が閉じるまで待つ。Dismissが来ない稀な実装に
    // 備えて保険タイマーを張る（通常はDismissで即確定）。
    function armRewardFinalizeFallback() {
        if (rewardFinalizeTimer || !pendingReward) return;
        rewardFinalizeTimer = setTimeout(function () {
            rewardFinalizeTimer = null;
            if (!pendingReward) return;
            // ⚠1.597: 広告がまだ画面に出ている間は cb を走らせない。走らせると (a)復活/入金が広告の裏で起きて
            //   プレイヤーに見えない（1.521で直したはずの症状が3秒保険から漏れていた）、(b)AdMobが
            //   iOSの音声セッションを握っている最中にゲーム側がBGMを鳴らしに行く＝広告後に無音が
            //   固着する一因になる。Dismissを待ち、来なければ見張りを続ける。
            if (adOnScreen) { armRewardFinalizeFallback(); return; }
            finalizeReward(rewardShownResult === true, true);
        }, 3000);
    }
    // Dismissが先に来た時（順序ゆれ）、遅れて来るRewardを少し待ってから確定する。
    // ⚠1.603: 500ms → 1800ms に延長。実機で「AdMobは報酬を出しているのに復活できない」報告があり、
    //   再現の結果**閉じるイベントが報酬より先に届き、500msを過ぎてから報酬が来る**ケースだと確認した。
    //   ネイティブ→JSはCapacitorのブリッジ往復なので、500msは短すぎる。
    //   ⚠それでも間に合わなかった場合は lateReward の救済が最後の砦（報酬は必ず出る）。
    //   ⚠副作用: 本当に「報酬なしで閉じた」時にトーストが出るまで1.8秒かかる（許容範囲と判断）。
    function armRewardFinalizeGrace() {
        if (rewardFinalizeTimer) clearTimeout(rewardFinalizeTimer);
        rewardFinalizeTimer = setTimeout(function () {
            // ⚠1.606: wasShown を **true 決め打ちにしない**。広告が一度も画面に出ていない（rewardEverShown=false）なら
            //   ユーザーは見ることも閉じることもできていない＝本人に非がない → 自社カードへ回して必ず報酬を出す。
            //   ユーザー実機報告「2つ目以降の広告で失敗する。ユーザーには非がないため確実に報酬を付与したい」。
            if (pendingReward) finalizeReward(rewardShownResult === true, rewardEverShown);
        }, 1800);
    }

    // 開発者の実機テスト端末（この端末だけテスト広告になる＝配信版でも安全に広告フローを確認できる／一般ユーザーは本番広告のまま）。
    // 端末IDはGoogle Mobile Ads SDKが出す「To get test ads on this device...」のハッシュ。ATT撤去でIDFAが無いため管理画面登録は不可＝コード側で登録する。
    // ⚠これは秘密情報(APIキー等)ではなく端末フィンガープリント。他人がこの値を使っても自分の端末では効かないため公開しても無害。端末を足す時はこの配列に追記。
    var TEST_DEVICE_IDS = ['813d9fbc60131fe5bda48ff671516b51']; // Rhyn-iPhone Air（白柳）

    function initAds() {
        if (!AdMob) return;
        // 非パーソナライズ広告(NPA)方針＝ATT(トラッキング許可)は要求しない。初期化→リスナー登録→事前ロード。失敗しても続行。
        // ⚠プラグイン仕様(AdMobPlugin.swift): testingDevices は initializeForTesting=true の時しか testDeviceIdentifiers に反映されない。
        //   よってテスト端末が1台でも登録されていれば true にする（=その端末だけテスト広告／一般ユーザーは testDeviceIdentifiers に含まれず本番広告のまま＝収益に影響なし）。
        //   本番広告ユニットID/テストIDの切替は adUnit() の AD_TEST が担う（この true 化は端末allowlistの適用だけで、ユニットIDは変えない）。
        Promise.resolve(AdMob.initialize({ initializeForTesting: (AD_TEST || TEST_DEVICE_IDS.length > 0), testingDevices: TEST_DEVICE_IDS }))
            .then(function () {
                // 永続リスナー（初期化後に1回だけ登録）。1.521: cbの実行は「広告が閉じた(Dismiss)後」に統一。
                AdMob.addListener(EV.rewReward,     function () {            // 報酬獲得＝結果を記録（cbはDismissで実行）
                    if (!pendingReward) {
                        // ⚠1.603: すでに失敗として片付けた後に報酬が届いた＝**視聴自体は成立している**。
                        //   ここで捨てると「広告を最後まで見たのに復活できない」になる（ユーザー実機報告）。
                        //   覚えておいたコールバックを成功で実行して救済する（1回だけ）。
                        if (lateReward && !lateReward.done) {
                            lateReward.done = true;
                            var lcb = lateReward.cb;
                            lateReward = null;
                            try { lcb(true, { shown: true, late: true }); } catch (_) {}
                        }
                        return;
                    }
                    rewardShownResult = true;
                    armRewardFinalizeFallback();                            // Dismissが来ない実装への保険
                });
                // ⚠1.597: 「広告が画面に出た」を受け取る（1.596まで未購読＝バグ③の根本原因）。
                AdMob.addListener(EV.rewShowed,     function () { adOnScreen = true; rewardEverShown = true; }); // 1.606
                AdMob.addListener(EV.rewDismiss,    function () {            // 広告が閉じた＝ここで確定＆cb実行
                    adOnScreen = false;                                     // ⚠pendingRewardの有無より先に必ず落とす
                    rewardPresenting = false;                               // 1.603
                    recoverGameAudio();                                     // 広告が握っていた音声をゲーム側へ戻す（1.597）
                    if (!pendingReward) return;
                    if (rewardShownResult !== undefined) finalizeReward(rewardShownResult, true);
                    else armRewardFinalizeGrace();                          // Reward未着なら少し待つ（順序ゆれ）
                });
                AdMob.addListener(EV.rewFailShow,   function () {           // 表示に失敗＝未表示（即・自社カードへ）
                    adOnScreen = false;
                    rewardPresenting = false;                               // 1.603
                    finalizeReward(false, false);
                });
                AdMob.addListener(EV.rewLoaded,     function () {
                    setRewardReady(true);
                    // 復活/ボーナスのタップ時に未ロードだったら、ロード完了したこの瞬間に表示する
                    if (rewardWantShow) { rewardWantShow = false; presentReward(); }
                });
                AdMob.addListener(EV.rewFailLoad,   function () {
                    setRewardReady(false);
                    if (rewardWantShow) { rewardWantShow = false; finalizeReward(false, false); }
                    else { scheduleRewardReload(); }
                });
                AdMob.addListener(EV.interLoaded,   function () { interReady = true; });
                AdMob.addListener(EV.interShowed,   function () { adOnScreen = true; });   // 1.597
                AdMob.addListener(EV.interDismiss,  function () { adOnScreen = false; recoverGameAudio(); finishInterstitial(); });
                AdMob.addListener(EV.interFailShow, function () { adOnScreen = false; finishInterstitial(); });
                prepareInterstitial();
                prepareReward();
            })
            .catch(function () {});
    }

    // インタースティシャルの後始末を1箇所に集約（1.597）。Dismiss / FailShow / 例外 / 保険タイマーの
    // どこから来ても「onDone を1回だけ実行」を保証する。⚠ここが詰まるとゲームオーバー後のリトライが
    // 永久に再開しない（①「広告が閉じない」をインタースティシャルで踏んだ場合に起こりうる）。
    function finishInterstitial() {
        if (pendingInterWatchdog) { clearTimeout(pendingInterWatchdog); pendingInterWatchdog = null; }
        interReady = false;
        prepareInterstitial();
        var d = pendingInterDone;
        pendingInterDone = null;
        if (d) d();
    }

    // 表示要求後に閉じイベントが返らない詰まりへの保険（1.597・リワードの armRewardWatchdog と同じ考え方）。
    // ⚠表示中(adOnScreen)は勝手に進めない＝閉じれば Dismiss が来る。見張りだけ続ける。
    function armInterWatchdog() {
        if (pendingInterWatchdog) clearTimeout(pendingInterWatchdog);
        pendingInterWatchdog = setTimeout(function () {
            pendingInterWatchdog = null;
            if (!pendingInterDone) return;
            if (adOnScreen) { armInterWatchdog(); return; }
            finishInterstitial();
        }, INTER_WATCHDOG_MS);
    }

    // onDone: 広告が閉じた後（または表示できなかった時）に呼ぶ。リトライで「広告→終わってから再開」を順序通りに。
    function showInterstitial(onDone) {
        if (!interReady) { prepareInterstitial(); if (onDone) onDone(); return; }
        interReady = false;
        adOnScreen = false;               // Showed を受け取るまでは「未表示」
        pendingInterDone = onDone || null;
        armInterWatchdog();
        AdMob.showInterstitial().catch(function () { adOnScreen = false; finishInterstitial(); });
    }

    function showReward(callback) {
        if (pendingReward) { return; }      // 既に視聴要求が進行中：二重起動を無視（消費/報酬の二重発火を防ぐ）
        lateReward = null;                  // ⚠1.603: 前回ぶんの救済枠は破棄（古いcbを新しい視聴で誤爆させない）
        rewardEverShown = false;            // ⚠1.606: この視聴要求で広告が実際に出たか（前回の値を持ち越さない）
        pendingReward = callback || function () {};
        if (rewardReady) { presentReward(); return; }
        // 未ロード: 準備してロード完了(rewLoaded)で表示。時間内に用意できなければ失敗解決（無音で失敗しない）。
        // ⚠1.606: 6秒 → REWARD_LOAD_WAIT_MS(10秒) に延長。**1本目を見た直後の2本目**は、消費済みの広告を
        //   作り直すところから始まるので6秒では間に合わないことがあった（ユーザー実機報告
        //   「大抵1つ目はすんなり再生されるが2つ目以降で失敗する」）。打ち切っても自社カードで報酬は出るが、
        //   実広告が出せるならその方がよい（収益にもなる）。⚠打ち切り時は wasShown=false ＝必ず自社カードへ。
        rewardWantShow = true;
        prepareReward();
        setTimeout(function () { if (rewardWantShow) { rewardWantShow = false; finalizeReward(false, false); } }, REWARD_LOAD_WAIT_MS);
    }

    window.showAd = function (type, callback) {
        if (typeof gameSettings !== 'undefined' && gameSettings.adFree) { if (callback) callback(true); return; }
        if (!AdMob) {
            // Web/PWA・未統合環境: 広告なしで即続行（interstitial=callback即実行 / reward=成功扱い）
            if (callback) callback(true, { shown: false });
            return;
        }
        if (type === 'interstitial') showInterstitial(callback);
        else if (type === 'reward') showReward(callback);
    };

    // ネイティブのみ初期化（Web/PWAでは何もしない）
    if (AdMob) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAds);
        else initAds();
    }
})();

// ─── 課金ブリッジ (Capacitor/ネイティブ側で上書きする) ───
// purchaseItem(productId, callback) : アプリ内課金を実行
// callback(success) : 購入成功/キャンセルを通知
// ネイティブ未接続時はstub（常に成功）。Capacitor導入時にIAPプラグインに差し替える。
window.purchaseItem = window.purchaseItem || function(productId, callback) {
    // stub: テスト用に常に成功
    if (callback) callback(true);
};

// ─── 課金商品定義 ───
var IAP_PRODUCTS = [
    { id: 'starter_pack', type: 'once', price: 480, labelKey: 'iap_starter_pack', descKey: 'iap_starter_pack_desc', iconImg: 'images/icon_celebrate.png', tag: 'iap_tag_best' },
    { id: 'ad_free',      type: 'once', price: 160, labelKey: 'iap_ad_free',      descKey: 'iap_ad_free_desc',      iconImg: 'images/icon_settings.png' },
    { id: 'login_pass',   type: 'duration', price: 320, labelKey: 'iap_login_pass',  descKey: 'iap_login_pass_desc',  iconImg: 'images/icon_level.png' },
    { id: 'savings_50k',  type: 'consumable', price: 160, labelKey: 'iap_savings_50k',  descKey: 'iap_savings_50k_desc',  iconImg: 'images/icon_money.png', savingsAmount: 50000 },
    { id: 'savings_200k', type: 'consumable', price: 480, labelKey: 'iap_savings_200k', descKey: 'iap_savings_200k_desc', iconImg: 'images/icon_money.png', savingsAmount: 200000, tag: 'iap_tag_popular' },
    { id: 'savings_500k', type: 'consumable', price: 960, labelKey: 'iap_savings_500k', descKey: 'iap_savings_500k_desc', iconImg: 'images/icon_money.png', savingsAmount: 500000 },
    { id: 'savings_1200k',type: 'consumable', price: 1840, labelKey: 'iap_savings_1200k',descKey: 'iap_savings_1200k_desc',iconImg: 'images/icon_money.png', savingsAmount: 1200000, tag: 'iap_tag_best_value' }
];
// スキンは将来追加: { id: 'skin_xxx', type: 'once', price: 160, ... }

// ─── 課金購入ロジック ───
function executePurchase(productId) {
    var product = IAP_PRODUCTS.find(function(p) { return p.id === productId; });
    if (!product) return;
    // 買い切り済みチェック
    if (product.type === 'once' && gameSettings.purchased[productId]) return;

    purchaseItem(productId, function(success) {
        if (!success) return;

        if (product.id === 'ad_free') {
            gameSettings.purchased['ad_free'] = true;
            gameSettings.adFree = true;
        } else if (product.id === 'starter_pack') {
            gameSettings.purchased['starter_pack'] = true;
            gameSettings.adFree = true;
            gameSettings.savings += 100000;
            // premiumアイテム(coin_master)を解放: Lv0 → 購入可能にする（premium flagはコードで判定変更）
        } else if (product.id === 'login_pass') {
            gameSettings.loginPassExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30日
        } else if (product.savingsAmount) {
            gameSettings.savings += product.savingsAmount;
        }
        saveSettings();
        if (soundManager) soundManager.playItem();
        updateStoreUI();
    });
}

function isLoginPassActive() {
    return gameSettings.loginPassExpiry > Date.now();
}

// ─── 課金ストアUI ───
function showStore() {
    var el = document.getElementById('storeScreen');
    el.style.display = 'flex';
    history.pushState({ screen: 'store' }, '');
    updateStoreUI();
}

function hideStore() {
    var el = document.getElementById('storeScreen');
    el.style.display = 'none';
}

function closeStore() {
    hideStore();
    history.back();
}

function updateStoreUI() {
    var list = document.getElementById('storeItemList');
    var savingsEl = document.getElementById('storeSavingsDisplay');
    if (savingsEl) savingsEl.innerHTML = _ic('icon_bank.png', 'ui-icon-sm') + ' ' + t('tshop_savings_display', { amount: gameSettings.savings.toLocaleString() });
    var html = '';
    for (var i = 0; i < IAP_PRODUCTS.length; i++) {
        var p = IAP_PRODUCTS[i];
        var purchased = (p.type === 'once' && gameSettings.purchased[p.id]);
        // ログインパス: activeなら「有効中」
        var isActive = (p.id === 'login_pass' && isLoginPassActive());
        // スターターパックに含まれる広告非表示を個別購入済みの場合もチェック
        var statusText = '';
        if (purchased) {
            statusText = t('iap_purchased');
        } else if (isActive) {
            var days = Math.ceil((gameSettings.loginPassExpiry - Date.now()) / (24*60*60*1000));
            statusText = t('iap_active', { days: days });
        }
        var tagHtml = '';
        if (p.tag && !purchased && !isActive) {
            tagHtml = '<span style="position:absolute; top:-6px; right:-4px; background:#ff4466; color:#fff; font-size:clamp(6px,1.1vw,9px); font-weight:800; padding:1px 5px; border-radius:8px; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + t(p.tag) + '</span>';
        }
        var disabled = purchased || isActive;
        html += '<div data-iap-id="' + p.id + '" style="' +
            'display:flex; align-items:center; gap:6px; padding:6px 8px; cursor:' + (disabled ? 'default' : 'pointer') + ';' +
            'background:' + (disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)') + ';' +
            'border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:4px;' +
            'position:relative; opacity:' + (disabled ? '0.5' : '1') + ';' +
            'transition:background 0.15s;">' +
            tagHtml +
            '<img src="' + p.iconImg + '" width="22" height="22" style="flex-shrink:0; image-rendering:pixelated;">' +
            '<div style="flex:1; min-width:0;">' +
                '<div style="color:#fff; font-size:clamp(9px,1.8vw,13px); font-weight:700; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + t(p.labelKey) + '</div>' +
                '<div style="color:rgba(255,255,255,0.6); font-size:clamp(7px,1.3vw,10px); font-family:\'M PLUS Rounded 1c\',sans-serif; white-space:pre-line;">' + t(p.descKey) + '</div>' +
            '</div>' +
            '<div style="flex-shrink:0; text-align:right;">' +
                (statusText
                    ? '<span style="color:#4CAF50; font-size:clamp(8px,1.5vw,11px); font-weight:700; font-family:\'M PLUS Rounded 1c\',sans-serif;">' + statusText + '</span>'
                    : '<span style="color:#ffd700; font-size:clamp(10px,2vw,14px); font-weight:800; font-family:\'M PLUS Rounded 1c\',sans-serif;">¥' + p.price + '</span>') +
            '</div>' +
        '</div>';
    }
    list.innerHTML = html;
}

// ─── リワード広告の状態管理 ───
var rewardAdState = {
    reviveUsedThisRun: false,    // 今回のプレイで復活広告を使ったか（1プレイ1回）
    shopAdUsedThisVisit: false   // 今回のショップ訪問で広告ボーナスを使ったか
};
var REWARD_AD_REVIVE_LIVES = 3;        // 広告復活で回復するライフ数
var REWARD_AD_SHOP_BONUS_RATE = 0.3;   // ステージショップ: 現在所持金の30%ボーナス
var REWARD_AD_SHOP_BONUS_MIN = 100;    // ステージショップ: 最低ボーナス額
var REWARD_AD_SHOP_BONUS_MAX = 3000;   // ステージショップ: 上限ボーナス額
// 怪しい老婆の店（地底）だけは所持金に関係なく定額（1.577・ユーザー指定）。
// ⚠地上は「所持金の30%・上限3,000」なので、所持金が少ないと100円しか出ない。地底の品は
//   9,000〜200,000円と桁が違い、割合式だと広告を見る意味がほぼ無くなるため定額にしてある。
var REWARD_AD_SHOP_BONUS_UG = 5000;    // 老婆の店: 定額ボーナス額
var REWARD_AD_TSHOP_BONUS = 3000;      // タイトルショップ: 固定3,000円ボーナス
var REWARD_AD_TSHOP_COOLDOWN = 14400000; // タイトルショップ: クールダウン4時間

// ゲームオーバー時のリワード広告復活
function adRevive() {
    if (rewardAdState.reviveUsedThisRun) return;
    // A案: 未ロードでもボタンは押せる。押した瞬間「準備中」を通知し、裏でロード→間に合えば表示。
    if (typeof window.isRewardReady === 'function' && !window.isRewardReady()) {
        if (typeof showRewardToast === 'function') showRewardToast(t('ad_preparing'), 'linear-gradient(180deg,#888,#555)', '#fff');
    }
    showAd('reward', function(success) {
        if (!success) { if (typeof showRewardToast === 'function') showRewardToast(t('ad_load_failed'), 'linear-gradient(180deg,#666,#333)', '#fff'); return; }
        rewardAdState.reviveUsedThisRun = true;
        // 復活処理
        hideGameOverScreen();
        gameState.lives = REWARD_AD_REVIVE_LIVES;
        gameState.gameStarted = true;
        gameState.gamePaused = false;
        gameState.isInvincible = true;
        gameState.invincibleTimer = INVINCIBLE_FRAMES; // 3秒間無敵
        gameState.revivalFlashTimer = 90; // 1.5秒の復活演出
        resetPlayerPosition(); // 上空からリスポーン（死因に関わらず統一）
        // ボス戦中の復活は戦闘が続くのでボスBGMを維持（薬/羽の復活=tryReviveがBGMを触らないのと同じ挙動）
        if (bossState.active && soundManager) { soundManager.playBossBGM(); }
        else { playStageBGM(); }
        document.getElementById('ui').style.display = 'block';
        document.getElementById('controlBar').style.display = 'flex';
        // gameLoopはrequestAnimationFrameで常時動作しているため呼び不要
        // （引数なしで呼ぶとaccumulatorがNaNになりフリーズする）
        lastFrameTime = 0;  // タイムスタンプをリセットして大きなdeltaを防ぐ
    });
}

// ステージショップでのリワード広告ボーナス
function adShopBonus() {
    if (rewardAdState.shopAdUsedThisVisit) return;
    // A案: 未ロードでも押せる。押した瞬間「準備中」を表示し、裏でロード→間に合えば表示。
    if (typeof window.isRewardReady === 'function' && !window.isRewardReady()) {
        setKeeperText('ad_preparing');
    }
    showAd('reward', function(success, info) {
        // 消費は「広告が実際に表示された時」だけ＝ショップ訪問につき1回（在庫ゼロ/ロード失敗では消費せず機会を残す）。
        // 二重視聴の悪用は showReward の進行中ガード＋「表示された時のみ消費」で防ぐ（旧1.484のタップ即消費の欠点を解消）。
        if (success || (info && info.shown)) { rewardAdState.shopAdUsedThisVisit = true; }
        if (!success) { setKeeperText('ad_load_failed'); updateStageShopUI(); return; }
        // 老婆の店は定額5,000円／地上は所持金の30%（100〜3,000円）
        var _ug = (typeof undergroundState !== 'undefined' && undergroundState.active);
        var bonus = _ug ? REWARD_AD_SHOP_BONUS_UG
                        : Math.min(REWARD_AD_SHOP_BONUS_MAX, Math.max(REWARD_AD_SHOP_BONUS_MIN, Math.floor(gameState.score * REWARD_AD_SHOP_BONUS_RATE)));
        gameState.score += bonus;
        if (soundManager) soundManager.playItem();
        setKeeperText('reward_ad_shop_money_ok', { amount: bonus });
        updateStageShopUI();
    });
}

// タイトルショップでのリワード広告ボーナス
function adTshopBonus() {
    if (Date.now() < gameSettings.tshopAdCooldown) {
        setTshopKeeperText('reward_ad_cooldown');
        if (soundManager) soundManager.playDamage();
        return;
    }
    // A案: 未ロードでも押せる。押した瞬間「準備中」を表示し、裏でロード→間に合えば表示。
    // クールダウンは従来どおり成功時のみ設定＝失敗しても4時間の権利を失わない。
    if (typeof window.isRewardReady === 'function' && !window.isRewardReady()) {
        setTshopKeeperText('ad_preparing');
    }
    showAd('reward', function(success) {
        if (!success) { setTshopKeeperText('ad_load_failed'); return; }
        gameSettings.tshopAdCooldown = Date.now() + REWARD_AD_TSHOP_COOLDOWN;
        gameSettings.savings += REWARD_AD_TSHOP_BONUS;
        saveSettings();
        if (soundManager) soundManager.playItem();
        setTshopKeeperText('reward_ad_tshop_savings_ok', { amount: REWARD_AD_TSHOP_BONUS });
        updateTitleShopUI();
    });
}
