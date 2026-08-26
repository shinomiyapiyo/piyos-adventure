// 広告イベントの発火順シミュレータ（1.750で新設）。
//
// 何のためのものか:
//   monetization.js の広告フローは「イベントが来ない／順序が入れ替わる／二重に来る」で何度も事故っている
//   （1.591 / 1.597 / 1.603 / 1.606 / 1.646 / 1.718）。最悪ケースは**リトライが永久に再開しない**で、
//   実機テストでは運が悪くないと踏まない。ここで机上から潰す。
//
// 仕組み:
//   実物の monetization.js を「偽window + 偽AdMob + **仮想時計**」で実行し、プラグインのイベントを
//   任意の順序で発火させる。20秒/60秒のウォッチドッグを実時間で待たずに検証できる。
//   ⚠製品コードは一切書き換えない（読み込んで実行するだけ）。
//
// 使い方: node tools/ad-event-order-sim.mjs   （リポジトリ直下から）
//
// 合格条件: **全シナリオで cbCount が必ず 1**。
//   0 = コールバックが来ない＝リトライが再開しない（致命）／2以上 = 二重実行＝報酬の二重付与
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'monetization.js'), 'utf8');

function makeEnv(opts = {}) {
    // ── 仮想時計 ──
    let now = 1000000;
    let seq = 0;
    const timers = new Map();   // id -> {at, fn}
    const setTimeoutV = (fn, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn }); return id; };
    const clearTimeoutV = (id) => { timers.delete(id); };
    function advance(ms) {
        const end = now + ms;
        for (;;) {
            let next = null;
            for (const [id, t] of timers) if (t.at <= end && (next === null || t.at < timers.get(next).at)) next = id;
            if (next === null) break;
            const t = timers.get(next);
            timers.delete(next);
            now = t.at;
            try { t.fn(); } catch (e) { log.push('TIMER_THREW ' + e.message); }
        }
        now = end;
    }

    const log = [];
    const listeners = {};      // event -> fn
    const calls = [];          // AdMobへの呼び出し記録

    // ── 偽AdMob（プラグイン相当）──
    const AdMob = {
        initialize: (o) => { calls.push(['initialize', o]); return Promise.resolve(); },
        addListener: (ev, fn) => { listeners[ev] = fn; return Promise.resolve({ remove() {} }); },
        requestConsentInfo: () => Promise.resolve({ status: 'NOT_REQUIRED', canRequestAds: true }),
        prepareInterstitial: (o) => { calls.push(['prepareInterstitial', o.adId]); return Promise.resolve(); },
        prepareRewardVideoAd: (o) => { calls.push(['prepareReward', o.adId]); return Promise.resolve(); },
        prepareRewardInterstitialAd: (o) => {
            calls.push(['prepareRI', o.adId]);
            return opts.riLoadFails ? Promise.reject(new Error('no fill')) : Promise.resolve();
        },
        showInterstitial: () => { calls.push(['showInterstitial']); return Promise.resolve(); },
        showRewardVideoAd: () => { calls.push(['showReward']); return Promise.resolve(); },
        showRewardInterstitialAd: () => {
            calls.push(['showRI']);
            return opts.riShowThrows ? Promise.reject(new Error('present failed')) : Promise.resolve();
        }
    };

    const win = {
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { AdMob } },
        addEventListener() {}, removeEventListener() {},
        // ゲーム側から差し込まれる受け口。遅れて来た報酬の入金はここに落ちる
        onRetryAdRewardLate: () => { log.push('LATE_BONUS'); }
    };
    const gameSettings = { adFree: !!opts.adFree, language: 'ja', savings: 0, purchased: {}, tshopAdCooldown: 0 };
    const soundManager = { playItem() {}, playDamage() {} };
    const doc = {
        readyState: 'complete',
        addEventListener() {},
        getElementById: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {} }),
        body: { appendChild() {}, removeChild() {} }
    };

    // monetization.js は末尾でIAPのUI関数なども定義するが、実行時参照なので読み込み自体は通る
    const fn = new Function(
        'window', 'gameSettings', 'soundManager', 'setTimeout', 'clearTimeout', 'document',
        'Date', 'showRewardToast', 't', 'saveSettings', 'setKeeperText', 'setTshopKeeperText',
        'updateStageShopUI', 'updateTitleShopUI', 'gameState', 'undergroundState', 'rewardAdState',
        'escapeHtml', 'console',
        SRC + '\n;return { showAd: window.showAd, isRetryRewardAdReady: window.isRetryRewardAdReady, showRetryRewardAd: window.showRetryRewardAd };'
    );

    const FakeDate = { now: () => now };
    const api = fn(
        win, gameSettings, soundManager, setTimeoutV, clearTimeoutV, doc,
        FakeDate, () => {}, (k) => k, () => {}, () => {}, () => {},
        () => {}, () => {}, { runToken: 1, score: 0 }, { active: false }, {},
        (s) => s, { log() {}, warn() {}, error() {} }
    );

    return { api, win, listeners, calls, advance, log, now: () => now, AdMob };
}

// ── シナリオ実行 ──
const results = [];
const tick = () => new Promise((r) => setImmediate(r));
async function scenario(name, fn, opts) {
    const env = makeEnv(opts || {});
    // 初期化は本物のPromise（同意フロー→initialize→addListener）なので、マイクロタスクを十分に回す
    for (let i = 0; i < 20; i++) { await tick(); env.advance(1); }
    try {
        const r = await fn(env);
        results.push({ name, ...r });
    } catch (e) {
        results.push({ name, FATAL: e.message });
    }
}

function ev(env, n) { const f = env.listeners[n]; if (!f) throw new Error('listener not registered: ' + n); f({}); }

const EV = {
    riLoaded: 'onRewardedInterstitialAdLoaded',
    riFailLoad: 'onRewardedInterstitialAdFailedToLoad',
    riReward: 'onRewardedInterstitialAdReward',
    riShowed: 'onRewardedInterstitialAdShowed',
    riDismiss: 'onRewardedInterstitialAdDismissed',
    riFailShow: 'onRewardedInterstitialAdFailedToShow'
};

const run = async () => {

// 1) 正常順: Loaded → show → Showed → Reward → Dismiss
await scenario('①正常順（Reward→Dismiss）', (env) => {
    ev(env, EV.riLoaded);
    const ready = env.api.isRetryRewardAdReady();
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    ev(env, EV.riShowed);
    ev(env, EV.riReward);
    ev(env, EV.riDismiss);
    env.advance(10000);
    return { ready, done, cbCount: count, late: env.log.filter(x => x === 'LATE_BONUS').length };
});

// 2) 逆順: Dismiss が先に来て、あとから Reward（1.603で実機で起きた順序）
await scenario('②逆順（Dismiss→Reward・1.5秒後）', (env) => {
    ev(env, EV.riLoaded);
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    ev(env, EV.riShowed);
    ev(env, EV.riDismiss);          // 先に閉じイベント
    env.advance(1500);
    ev(env, EV.riReward);           // 遅れて報酬
    env.advance(10000);
    return { done, cbCount: count, late: env.log.filter(x => x === 'LATE_BONUS').length };
});

// 3) 猶予切れ: Dismiss の 6秒後に Reward（5秒の猶予を過ぎている）
await scenario('③猶予切れ（Dismissの6秒後にReward）', (env) => {
    ev(env, EV.riLoaded);
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    ev(env, EV.riShowed);
    ev(env, EV.riDismiss);
    env.advance(6000);
    ev(env, EV.riReward);
    env.advance(10000);
    return { done, cbCount: count, late: env.log.filter(x => x === 'LATE_BONUS').length };
});

// 4) 表示失敗: FailShow
await scenario('④表示失敗（FailShow）', (env) => {
    ev(env, EV.riLoaded);
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    ev(env, EV.riFailShow);
    env.advance(10000);
    return { done, cbCount: count };
});

// 5) 沈黙: show したのにイベントが1つも来ない（最悪ケース＝リトライが再開しない）
await scenario('⑤イベントが1つも来ない（60秒）', (env) => {
    ev(env, EV.riLoaded);
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    env.advance(30000);
    const at30 = count;
    env.advance(40000);             // 合計70秒＝見張り(60秒)を越える
    return { doneAt30s: at30, done, cbCount: count };
});

// 6) Showed だけ来て閉じない（広告が画面に出たまま＝既知の「閉じない」バグ）
await scenario('⑥Showedのみ・閉じない（180秒）', (env) => {
    ev(env, EV.riLoaded);
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    ev(env, EV.riShowed);
    env.advance(180000);
    const stuck = count;
    ev(env, EV.riDismiss);          // あとから閉じた
    env.advance(1000);
    return { cbWhileOnScreen: stuck, done, cbCount: count };
});

// 7) 本当に未ロード（在庫ゼロでロードが失敗し続ける）
await scenario('⑦未ロード（ロード失敗）でshow', (env) => {
    let done = null, count = 0;
    const ready = env.api.isRetryRewardAdReady();
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    env.advance(1000);
    return { ready, done, cbCount: count, showCalls: env.calls.filter(c => c[0] === 'showRI').length };
}, { riLoadFails: true });

// 7b) show を呼んだのに present が例外（プラグイン側の reject）
await scenario('⑦b present が例外', async (env) => {
    ev(env, EV.riLoaded);
    let done = null, count = 0;
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    for (let i = 0; i < 5; i++) { await tick(); env.advance(1); }   // reject はマイクロタスクで届く
    return { done, cbCount: count };
}, { riShowThrows: true });

// 8) 二重呼び出し（連打）
await scenario('⑧連続で2回show', (env) => {
    ev(env, EV.riLoaded);
    let c1 = 0, c2 = 0, d1 = null, d2 = null;
    env.api.showRetryRewardAd((r) => { c1++; d1 = r; });
    env.api.showRetryRewardAd((r) => { c2++; d2 = r; });   // 2回目は未ロード扱いで即false
    ev(env, EV.riShowed);
    ev(env, EV.riReward);
    ev(env, EV.riDismiss);
    env.advance(10000);
    return { first: { cb: c1, done: d1 }, second: { cb: c2, done: d2 },
             showCalls: env.calls.filter(c => c[0] === 'showRI').length };
});

// 9) 広告非表示を購入済み
await scenario('⑨adFree購入済み', (env) => {
    let done = null, count = 0;
    const ready = env.api.isRetryRewardAdReady();
    env.api.showRetryRewardAd((r) => { count++; done = r; });
    env.advance(1000);
    return { ready, done, cbCount: count,
             prepareCalls: env.calls.filter(c => c[0] === 'prepareRI').length,
             showCalls: env.calls.filter(c => c[0] === 'showRI').length };
}, { adFree: true });

// 10) ロード失敗が続く → 30秒後に再ロードされるか
const s10 = scenario('⑩ロード失敗→30秒後に再ロード', (env) => {
    ev(env, EV.riFailLoad);
    const before = env.calls.filter(c => c[0] === 'prepareRI').length;
    env.advance(31000);
    const after = env.calls.filter(c => c[0] === 'prepareRI').length;
    return { prepareBefore: before, prepareAfter: after, reloaded: after > before };
});
await s10;

// 11) 使い終わったあと、次のリトライ用に再ロードされるか
await scenario('⑪視聴後に次回ぶんを再ロード', (env) => {
    ev(env, EV.riLoaded);
    const before = env.calls.filter(c => c[0] === 'prepareRI').length;
    env.api.showRetryRewardAd(() => {});
    ev(env, EV.riShowed); ev(env, EV.riReward); ev(env, EV.riDismiss);
    env.advance(1000);
    const after = env.calls.filter(c => c[0] === 'prepareRI').length;
    return { prepareBefore: before, prepareAfter: after, reloaded: after > before };
});

// 12) 既存のインタースティシャルが壊れていないか（回帰）
await scenario('⑫【回帰】通常インタースティシャル', (env) => {
    env.listeners['interstitialAdLoaded']({});
    let count = 0;
    env.api.showAd('interstitial', () => { count++; });
    env.listeners['interstitialAdShowed']({});
    env.listeners['interstitialAdDismissed']({});
    env.advance(1000);
    return { cbCount: count };
});

// 13) 既存のリワード（復活）が壊れていないか（回帰）
await scenario('⑬【回帰】通常リワード', (env) => {
    env.listeners['onRewardedVideoAdLoaded']({});
    let count = 0, ok = null;
    env.api.showAd('reward', (s) => { count++; ok = s; });
    env.listeners['onRewardedVideoAdShowed']({});
    env.listeners['onRewardedVideoAdReward']({});
    env.listeners['onRewardedVideoAdDismissed']({});
    env.advance(5000);
    return { cbCount: count, success: ok };
});

// ── 判定 ──
const bad = [];
for (const r of results) {
    if (r.FATAL) { bad.push(`${r.name}: 実行時エラー ${r.FATAL}`); continue; }
    if ('cbCount' in r && r.cbCount !== 1) bad.push(`${r.name}: cbCount=${r.cbCount}（1でなければならない）`);
    if (r.first && r.first.cb !== 1) bad.push(`${r.name}: 1回目 cb=${r.first.cb}`);
    if (r.second && r.second.cb !== 1) bad.push(`${r.name}: 2回目 cb=${r.second.cb}`);
    if (r.showCalls !== undefined && r.showCalls > 1) bad.push(`${r.name}: showを${r.showCalls}回呼んでいる`);
    if (r.cbWhileOnScreen) bad.push(`${r.name}: 広告が画面に出ている間にコールバックが走った（1.597のバグ③の再発）`);
    if (r.reloaded === false) bad.push(`${r.name}: 次回ぶんが再ロードされていない`);
}
console.log(JSON.stringify(results, null, 2));
console.log('\n===== 判定 =====');
if (bad.length) { console.log('❌ NG'); for (const b of bad) console.log('  - ' + b); process.exitCode = 1; }
else console.log(`✅ OK — ${results.length} シナリオすべてでコールバックはちょうど1回`);
};

run();
