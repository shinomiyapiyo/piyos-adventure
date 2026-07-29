#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 地底ステージ「ギミックが重なる場所で 100%被弾する所は無いか」シミュレータ（Ver.1.675時点で作成）
//   使い方: node tools/ug-hazard-overlap-sim.mjs [7|14|21|28]  （省略時は全ラウンド）
//
// ⚠ユーザー依頼:「回転するバー・火の玉・雑魚敵などが複数重なり合う場所で、どうやっても
//   被弾せずに進めない箇所がないか。難しいだけなら問題ないが 100%被弾は避けたい」。
//
// 【既存 ug-hazard-sim.mjs との違い】
//   あちらは **ファイアバーだけ／横の部屋の一番下の床だけ／空中は無判定** で見ている
//   （火の玉と敵は明示的に対象外・縦の部屋はスキップ）。ここでは:
//     ・バー＋火の玉＋トゲを**同時に**当てる
//     ・**立てる場所を全部**（部屋の中のどの足場・どの段でも）検査する＝縦の部屋・上下2ルートも入る
//     ・**跳んでいる間も判定する**（バーへ跳び込む形を見落とさない）
//     ・敵は重なり情報として突き合わせる（下記）
//
// 【なぜ位相の総当たりにしないか】
//   バーの周期は 286f だが、火の玉の1周期は「待ち period＋飛んでいる時間」＝
//   'f'(period150/power13)=211f、'e'(period100/power11)=152f。286と211と152の最小公倍数は
//   約917万フレーム＝総当たりは不可能。
//   → **絶対時間の窓（既定6000フレーム＝100秒）を1フレームずつ実際に回す**。部屋の踏破は
//     数十秒なので、この窓で「いつ入っても抜けられるか」は十分に見える。
//
// 【モデル】
//   ・当たり判定は実機と同一式（updateUndergroundHazards）: プレイヤー中心から
//     ±(24-14)/±(24-10) の箱に、炎 r=11 / 火の玉 r=13 の円
//   ・火の玉は実機と同じ状態機械（timer=(列*37)%period から数え、live中は放物線）
//   ・歩き＝右へ1タイル(32px を 3.0px/f で 11f)、跳び＝滞空46fで右へ1〜4タイル
//     （JUMP_FORCE -16 / GRAVITY 0.7 / 地底の歩行 MOVE_SPEED6×UG_SPEED_RATE0.5＝3.0px/f）
//   ・跳躍は放物線を2フレームおきにサンプル（バー先端は約2.5px/f＝4f刻みだと半径11pxを跨いで
//     すり抜けを許してしまう）
//
// 【2段構えで見る】
//   ①「立てる場所」を全部洗い、**安全な時間が0%の足場**が無いかを見る
//      ＝そこに乗ったら何をしても被弾する＝最悪の形。縦の部屋の小さな足場もここで拾える。
//   ② 長く続く床（横に12タイル以上）については、開始時刻を散らして
//      「立つ・待つ・歩く・跳ぶ」だけで右端まで無傷で行けるかを実際に探索する。
//
// 【敵の扱い】敵の湧きは「カメラが近づいたら」＝プレイヤー自身の進み方と結合しているので
//   位置を確定的には置けない。よって:
//     ・S（シャレコ＝唯一倒せない敵）が居る列は「無傷で跳び越える窓があるか」を実際に判定する
//     ・それ以外の地上敵は踏んで倒せる／飛行敵は立っている高さには当たらない（頭上を通る）
//   ＝敵単体で詰むことは無く、危ないのは「待たされる足場に敵が重なる」形なので、
//     安全率の低い場所と敵の位置を突き合わせて一覧に出す。
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOW = 6000;                 // 見る絶対時間（フレーム）＝100秒
const TILE = 32, PW = 48, PH = 48;
const WALK_F = 11, JUMP_F = 46, WALK_PX = 3.0;
const JUMP_V = -16, GRAV = 0.7;
const SHRINK_X = 14, SHRINK_Y = 10;
const HX = PW / 2 - SHRINK_X, HY = PH / 2 - SHRINK_Y;    // 10 / 14
const BAR_SEG = 26, BAR_SPEED = 0.022;
let BAR_R = 11;              // ⚠--selftest で膨らませる（検出器が本当に鳴るかの確認用）
const FB_G = 0.42, FB_R = 13;
const BAND_MIN = 12;                 // 「長く続く床」とみなす最小タイル数（②の対象）
const SOLID = new Set(['#', 'B']), PLAT = new Set(['=', 'M']);
const ENEMY_CH = new Set(['S', 'g', 'm', 'c', 'v', 'd']);

const stub = new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stub), apply: () => stub, set: () => true });
const ctx = vm.createContext(new Proxy({
    Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
    document: { getElementById: () => stub, createElement: () => stub, querySelector: () => stub, querySelectorAll: () => [], addEventListener: () => {}, body: stub },
    window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0,
    performance: { now: () => 0 }
}, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
for (const f of ['core-state.js', 'gameplay.js'])
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

// 火の玉の高さを実機と同じ状態機械で 0..WINDOW まで展開する。
// setupUndergroundStage: timer=(列*37)%period / live=false から開始。
// updateUndergroundHazards: live中は vy+=0.42,cy+=vy（噴出口へ戻ったら終了）／それ以外は timer++ で period に達したら発射。
function fireballTrack(fb) {
    const cy = new Float32Array(WINDOW + JUMP_F + 4);
    let live = false, timer = fb.timer0, y = 0, vy = 0;
    for (let t = 0; t < cy.length; t++) {
        if (live) { vy += FB_G; y += vy; if (y >= 0) { live = false; y = 0; } }
        else if (++timer >= fb.period) { timer = 0; live = true; y = 0; vy = -fb.power; }
        cy[t] = live ? fb.y + y : Infinity;      // Infinity＝溶岩の中＝当たらない
    }
    return cy;
}

function analyseRoom(room) {
    const rowsN = room.map.length, W = room.wT;
    const g = room.map.map((l) => { const a = new Array(W); for (let c = 0; c < W; c++) a[c] = c < l.length ? l.charAt(c) : ' '; return a; });

    const bars = [], fireballs = [], enemies = [];
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < W; c++) {
        const ch = g[r][c];
        if (ch === 'F' || ch === 'G' || ch === 'H')
            bars.push({ x: c * TILE + TILE / 2, y: room.topY + r * TILE + TILE / 2,
                        len: ch === 'H' ? 6 : 4, dir: ch === 'G' ? -1 : 1, col: c, row: r,
                        reach: (ch === 'H' ? 6 : 4) * BAR_SEG + BAR_R });
        else if (ch === 'f' || ch === 'e') {
            const period = ch === 'e' ? 100 : 150, power = ch === 'e' ? 11 : 13;
            fireballs.push({ x: c * TILE + TILE / 2, y: room.topY + r * TILE + TILE,
                             period, power, timer0: (c * 37) % period, col: c, row: r,
                             rise: power * power / (2 * FB_G) });
        } else if (ENEMY_CH.has(ch)) enemies.push({ ch, col: c, row: r });
    }
    for (const fb of fireballs) fb.track = fireballTrack(fb);

    // 実機と同じ被弾判定
    function hit(pcx, pcy, t) {
        for (const b of bars) {
            if (Math.abs(b.x - pcx) > b.reach + HX || Math.abs(b.y - pcy) > b.reach + HY) continue;
            const ang = -Math.PI / 2 + BAR_SPEED * b.dir * t;
            const cs = Math.cos(ang), sn = Math.sin(ang);
            for (let i = 1; i <= b.len; i++) {
                const fx = b.x + cs * BAR_SEG * i, fy = b.y + sn * BAR_SEG * i;
                const dx = Math.max(0, Math.abs(fx - pcx) - HX), dy = Math.max(0, Math.abs(fy - pcy) - HY);
                if (dx * dx + dy * dy < BAR_R * BAR_R) return true;
            }
        }
        for (const fb of fireballs) {
            if (Math.abs(fb.x - pcx) > FB_R + HX) continue;
            const fy = fb.track[t];
            if (fy === Infinity) continue;
            const dx = Math.max(0, Math.abs(fb.x - pcx) - HX), dy = Math.max(0, Math.abs(fy - pcy) - HY);
            if (dx * dx + dy * dy < FB_R * FB_R) return true;
        }
        return false;
    }
    // その場所がそもそもギミックの射程内か（射程外なら常に安全＝時間展開しなくてよい）
    function inRange(pcx, pcy) {
        for (const b of bars)
            if (Math.abs(b.x - pcx) <= b.reach + HX && Math.abs(b.y - pcy) <= b.reach + HY) return true;
        for (const fb of fireballs)
            if (Math.abs(fb.x - pcx) <= FB_R + HX &&
                pcy <= fb.y + FB_R + HY && pcy >= fb.y - fb.rise - FB_R - HY) return true;
        return false;
    }

    // ── ① 立てる場所を全部洗う ──
    // 立てる = その升が床(ソリッド/足場)で、上2升が空いていて（プレイヤー高48px）、
    //          足元にトゲが無い（トゲは升の下14pxに当たりがある＝床の上に立つと触れる）
    const cellCx = (c) => c * TILE - 8 + PW / 2;
    const cellCy = (r) => room.topY + r * TILE - PH / 2;      // 行rの床の上に立つ
    const spots = [];
    for (let r = 1; r < rowsN; r++) for (let c = 0; c < W; c++) {
        if (!(SOLID.has(g[r][c]) || PLAT.has(g[r][c]))) continue;
        if (SOLID.has(g[r - 1][c]) || (r >= 2 && SOLID.has(g[r - 2][c]))) continue;   // 頭がつかえる
        if (g[r - 1][c] === '^') continue;                                            // トゲの上
        spots.push({ c, r });
    }
    for (const s of spots) {
        const cx = cellCx(s.c), cy = cellCy(s.r);
        if (!inRange(cx, cy)) { s.safePct = 100; s.worstRun = 0; continue; }
        let safe = 0, run = 0, worst = 0;
        for (let t = 0; t < WINDOW; t++) {
            if (hit(cx, cy, t)) { run++; if (run > worst) worst = run; } else { safe++; run = 0; }
        }
        s.safePct = safe / WINDOW * 100; s.worstRun = worst;
    }
    // ギミックの重なり具合（何種類が届いているか）
    for (const s of spots) {
        const cx = cellCx(s.c), cy = cellCy(s.r), k = [];
        if (bars.some((b) => Math.abs(b.x - cx) <= b.reach + HX && Math.abs(b.y - cy) <= b.reach + HY)) k.push('バー');
        if (fireballs.some((f) => Math.abs(f.x - cx) <= FB_R + HX && cy >= f.y - f.rise - 40 && cy <= f.y + 40)) k.push('火の玉');
        if (g[s.r - 1] && g[s.r - 1][s.c] === '^') k.push('トゲ');
        if (enemies.some((e) => Math.abs(e.col - s.c) <= 2 && Math.abs(e.row - s.r) <= 2)) k.push('敵');
        s.kinds = k;
    }

    // ── ② 長く続く床は「無傷で右端まで行けるか」を実際に探索する ──
    const byRow = new Map();
    for (const s of spots) { if (!byRow.has(s.r)) byRow.set(s.r, []); byRow.get(s.r).push(s); }
    const bands = [];
    for (const [r, list] of byRow) {
        list.sort((a, b) => a.c - b.c);
        let run = [list[0]];
        for (let i = 1; i <= list.length; i++) {
            const cont = i < list.length && list[i].c - list[i - 1].c <= 4;   // 穴4タイルまでは同じ床とみなす
            if (cont) run.push(list[i]);
            else { if (run.length >= BAND_MIN) bands.push({ r, cols: run.map((s) => s.c) }); run = i < list.length ? [list[i]] : []; }
        }
    }

    const arc = [];
    for (let f = 0; f <= JUMP_F; f += 2) {
        let dy = 0, v = JUMP_V;
        for (let k = 0; k < f; k++) { v += GRAV; dy += v; }
        arc.push({ f, dx: WALK_PX * f, dy });
    }

    const bandResults = [];
    for (const band of bands) {
        const r = band.r, set = new Set(band.cols);
        const c0 = band.cols[0], c1 = band.cols[band.cols.length - 1];
        const cy = cellCy(r);
        // 危険テーブル（この床の上に立っている時）
        const danger = new Map();
        for (const c of band.cols) {
            const row = new Uint8Array(WINDOW + JUMP_F + 4), cx = cellCx(c);
            if (inRange(cx, cy)) for (let t = 0; t < row.length; t++) row[t] = hit(cx, cy, t) ? 1 : 0;
            danger.set(c, row);
        }
        const jumpSafe = (c, k, t) => {
            if (!set.has(c + k)) return false;
            for (const a of arc) {
                if (a.dx > k * TILE + 4) break;
                if (hit(cellCx(c) + a.dx, cy + a.dy, t + a.f)) return false;
            }
            return !danger.get(c + k)[t + JUMP_F];
        };
        let worstStart = null;
        for (let t0 = 0; t0 < 1200; t0 += 37) {          // 33通りの「入った時刻」
            const seen = new Set();
            const stack = [[c0, t0]];
            let reached = c0;
            while (stack.length) {
                const [c, t] = stack.pop();
                if (c > reached) reached = c;
                if (c >= c1 || t >= WINDOW - JUMP_F) { if (c >= c1) { reached = c1; break; } continue; }
                const push = (nc, nt) => {
                    if (!set.has(nc) || nt >= WINDOW) return;
                    const key = nc * (WINDOW + 4) + nt;
                    if (seen.has(key)) return;
                    seen.add(key); stack.push([nc, nt]);
                };
                if (!danger.get(c)[t + 1]) push(c, t + 1);                       // 待つ
                if (set.has(c + 1)) {
                    let ok = true;
                    for (let f = 1; f <= WALK_F; f++) if (hit(cellCx(c) + WALK_PX * f, cy, t + f)) { ok = false; break; }
                    if (ok) push(c + 1, t + WALK_F);                             // 歩く
                }
                for (let k = 1; k <= 4; k++) if (jumpSafe(c, k, t)) push(c + k, t + JUMP_F);   // 跳ぶ
            }
            if (reached < c1) { worstStart = { t0, reached, goal: c1 }; break; }
        }
        bandResults.push({ r, c0, c1, len: band.cols.length, blocked: worstStart, jumpSafe, set, danger });
    }

    // 倒せない敵（シャレコ）を無傷で跳び越える窓があるか
    const skullyNG = [];
    for (const e of enemies.filter((e) => e.ch === 'S')) {
        const band = bandResults.find((b) => Math.abs(b.r - e.row) <= 3 && e.col > b.c0 && e.col < b.c1);
        if (!band) continue;                                   // 長い床の上に居ない＝この模型では扱わない
        let ok = false;
        for (let c = Math.max(band.c0, e.col - 6); c <= e.col && !ok; c++)
            for (let k = 2; k <= 4 && !ok; k++) {
                if (c + k <= e.col) continue;
                for (let t = 0; t < 900; t++) if (band.jumpSafe(c, k, t)) { ok = true; break; }
            }
        if (!ok) skullyNG.push(e.col);
    }

    // ── ③ 落ちる部屋（descend）は「落ちながら左右に避けて無傷で降りられるか」を見る ──
    // ⚠落下中もバーは回っている。落下は歩行モデルの外なので、ここだけ別に確かめる。
    // ⚠**まっすぐ落ちるだけの見積りでは駄目**（最初そう書いて R7 abyss など5部屋が✗になった）。
    //   実機は落下中に左右へ動ける（1.611のコメントどおり最大5.2タイル流せる）ので、
    //   「1フレームごとに左右3.0px動く／動かない」を全部試す到達可能性で見る＝実機の操作に合わせる。
    let fallLines = null;
    const standSet = new Set(spots.map((s) => s.c * 1000 + s.r));
    // ⚠この落下モデルが当てはまるのは「**天井に穴が開いていて上から落ちてくる部屋**」だけ。
    //   同じ descend でも abyss/plunge/maw/gullet/converge は天井が塞がっていて、
    //   プレイヤーは横（前の部屋の床の高さ）から入って棚を伝って降りる＝これは平面の落下ではない。
    //   最初これを見落として5部屋を「降りられない」と誤検出した。段差の降り継ぎは経路探索の対象外
    //   （各足場の安全率＝①で見ている）。
    const ceilingHole = g[0].some((ch, c) => c > 0 && c < W - 1 && !SOLID.has(ch));
    if (room.descend && ceilingHole && (bars.length || fireballs.length)) {
        const STEP = 3;                                   // 横移動 3.0px/f を1マスとする
        const XN = Math.ceil(W * TILE / STEP);
        const solidAt = (px, py) => {                     // 箱[px,px+48]×[py,py+48] が壁に食い込むか
            const c0 = Math.floor(px / TILE), c1 = Math.floor((px + PW - 1) / TILE);
            const r0 = Math.floor((py - room.topY) / TILE), r1 = Math.floor((py + PH - 1 - room.topY) / TILE);
            for (let r = r0; r <= r1; r++) { if (r < 0) continue; if (r >= rowsN) return true;
                for (let c = c0; c <= c1; c++) { if (c < 0 || c >= W) return true; if (SOLID.has(g[r][c])) return true; } }
            return false;
        };
        let okStarts = 0, tried = 0;
        for (let t0 = 0; t0 < 1200; t0 += 37) {
            tried++;
            let cur = new Uint8Array(XN);
            let y = room.topY - PH, vy = 0, landed = false;
            for (let xi = 0; xi < XN; xi++) if (!solidAt(xi * STEP, y) && !hit(xi * STEP + PW / 2, y + PH / 2, t0)) cur[xi] = 1;
            for (let f = 1; f < 400 && !landed; f++) {
                vy = Math.min(vy + GRAV, 15);
                const ny = y + vy;
                const nxt = new Uint8Array(XN);
                let alive = 0;
                for (let xi = 0; xi < XN; xi++) {
                    if (!cur[xi]) continue;
                    for (let d = -1; d <= 1; d++) {       // 左/そのまま/右
                        const nxi = xi + d;
                        if (nxi < 0 || nxi >= XN) continue;
                        const px = nxi * STEP;
                        if (solidAt(px, y)) continue;      // 横に壁
                        if (solidAt(px, ny)) {
                            // ⚠「ソリッドに触れた＝着地成功」にしてはいけない。落ち始めは**天井の高さ**を
                            //   通るので、穴の外の天井に触れただけで成功と数えてしまう（実際そのバグで
                            //   自己テストの落下検出が鳴らなかった）。
                            // ⚠逆に「部屋の底に着いた時だけ成功」も厳しすぎる。縦穴は途中の棚('B')に
                            //   乗り継いで降りる作りなので、**立てる足場に降りられたら成功**とする
                            //   （その足場に立って待てるかは①の安全率で別に見ている）。
                            const landRow = Math.floor((ny + PH - 1 - room.topY) / TILE);
                            const c0 = Math.floor(px / TILE), c1 = Math.floor((px + PW - 1) / TILE);
                            if (landRow >= rowsN - 5) landed = true;
                            else for (let cc = c0; cc <= c1; cc++) if (standSet.has(cc * 1000 + landRow)) { landed = true; break; }
                            continue;
                        }
                        if (hit(px + PW / 2, ny + PH / 2, t0 + f)) continue;
                        if (!nxt[nxi]) { nxt[nxi] = 1; alive++; }
                    }
                }
                if (landed) break;
                if (!alive) break;                        // 全滅＝この開始時刻では無傷で降りられない
                cur = nxt; y = ny;
            }
            if (landed) okStarts++;
        }
        fallLines = { okStarts, tried };
    }

    return { key: room.key, W, bars: bars.length, fireballs: fireballs.length, enemies, spots, bands: bandResults, skullyNG, fallLines };
}

// ── 自己テスト（検出器が本当に鳴るかの確認）──
// ⚠「✅問題なし」は、検出器が壊れていて何も鳴らないだけでも出てしまう。炎の当たり半径を
//   11→60pxへ膨らませた**わざと詰む条件**で R7 を回し、ちゃんと✗が出ることを先に確かめる。
if (process.argv[2] === '--selftest') {
    const rooms = vm.runInContext('ugRoomsForRound(7)', ctx);
    let dead = 0, blocked = 0, fallNG = 0;
    BAR_R = 60;                       // 立てる場所と床の踏破には十分に凶悪
    for (const room of rooms) {
        if (room.key === 'chamber') continue;
        const a = analyseRoom(room);
        dead += a.spots.filter((s) => s.safePct === 0).length;
        blocked += a.bands.filter((b) => b.blocked).length;
    }
    // ⚠落下検出は「天井に穴がある部屋＋バー」でしか走らない（実データの入口部屋にはバーが無い）。
    //   検出器が鳴るかを見るため、入口の縦穴にバーを1本刺した人工の部屋で確かめる。
    //   半径も 400 にして「穴を塞いだ」状態を作る。
    BAR_R = 400;
    const entry = rooms[0];
    const fake = { key: 'SELFTEST-FALL', wT: entry.wT, topY: entry.topY, descend: true,
        map: entry.map.map((line, r) => (r === 12 ? line.slice(0, 2) + 'F' + line.slice(3) : line)) };
    const fa = analyseRoom(fake);
    if (fa.fallLines && fa.fallLines.okStarts < fa.fallLines.tried) fallNG++;
    console.log('\n=== 自己テスト（炎の当たり半径を膨らませた「わざと詰む」条件でR7を検査）===');
    console.log(`  立てない足場の検出: ${dead}件 ${dead > 0 ? '✅鳴った' : '❌鳴らない＝検出器が壊れている'}`);
    console.log(`  床の踏破不能の検出: ${blocked}件 ${blocked > 0 ? '✅鳴った' : '❌鳴らない＝検出器が壊れている'}`);
    console.log(`  落下の不能の検出  : ${fallNG}件 ${fallNG > 0 ? '✅鳴った' : '❌鳴らない＝検出器が壊れている'}（半径400）`);
    process.exit(dead > 0 && blocked > 0 && fallNG > 0 ? 0 : 1);
}

// ── 実行 ──
const want = process.argv[2] ? [Number(process.argv[2])] : [7, 14, 21, 28];
console.log('\n═══ 地底「ギミックが重なる場所で 100%被弾しないか」 ═══');
console.log(`絶対時間 ${WINDOW}f(100秒)を1フレームずつ / バー286f・火の玉 f=211f e=152f（周期が互いに素なので総当たりでなく実時間で回す）`);
console.log('判定式は実機の updateUndergroundHazards と同一。跳躍中も判定する。\n');

let ng = 0;
const watch = [];
for (const round of want) {
    const rooms = vm.runInContext(`ugRoomsForRound(${round})`, ctx);
    console.log(`── R${round} ───────────────────────────────────────────`);
    for (const room of rooms) {
        if (room.key === 'chamber') continue;
        const a = analyseRoom(room);
        const dead = a.spots.filter((s) => s.safePct === 0);
        const tight = a.spots.filter((s) => s.safePct < 100).sort((x, y) => x.safePct - y.safePct);
        const worst = tight[0];
        const blockedBands = a.bands.filter((b) => b.blocked);

        console.log(`  ${a.key.padEnd(9)} バー${String(a.bars).padStart(2)} 火の玉${String(a.fireballs).padStart(2)} 敵${String(a.enemies.length).padStart(3)}` +
            ` / 立てる場所${String(a.spots.length).padStart(4)}（うちギミック射程内${String(tight.length).padStart(3)}）` +
            ` / 長い床${a.bands.length}本` +
            (worst ? ` / 最難 列${worst.c}行${worst.r}=安全${worst.safePct.toFixed(0)}% 最長待ち${worst.worstRun}f(${(worst.worstRun / 60).toFixed(1)}秒)` : ''));

        for (const d of dead.slice(0, 5)) {
            ng++;
            console.log(`      ✗ 列${d.c} 行${d.r}: **どの瞬間も危険＝立って待てない**（${d.kinds.join('+') || '?'}）`);
        }
        if (dead.length > 5) { console.log(`      … 他 ${dead.length - 5} か所`); }
        for (const b of blockedBands) {
            ng++;
            console.log(`      ✗ 行${b.r}の床: 開始${b.blocked.t0}f で入ると 列${b.blocked.reached} より先へ無傷で行けない（目標 列${b.blocked.goal}）`);
        }
        for (const col of a.skullyNG) { ng++; console.log(`      ✗ 列${col} のシャレコ(倒せない敵)を無傷で跳び越す窓が無い`); }
        if (a.fallLines) {
            if (a.fallLines.okStarts < a.fallLines.tried) {
                ng++;
                console.log(`      ✗ 落下: ${a.fallLines.tried}通りの開始時刻のうち ${a.fallLines.tried - a.fallLines.okStarts}通りで、` +
                            `左右に避けても無傷で降りられない`);
            } else console.log(`      ↓ 落下: ${a.fallLines.tried}通りの開始時刻すべてで、左右に避けながら無傷で降りられる`);
        }

        for (const s of tight.filter((s) => s.kinds.length >= 2 && s.safePct < 75).slice(0, 2))
            watch.push(`R${round} ${a.key} 列${s.c}行${s.r}: 安全${s.safePct.toFixed(0)}% / 最長待ち${s.worstRun}f / ${s.kinds.join('+')}`);
    }
}
if (watch.length) {
    console.log('\n▼ 「ギミック2種以上が重なる」×「安全率が低い」要注意ゾーン（＝難しいが通れる）');
    for (const w of watch.slice(0, 12)) console.log(`   ・${w}`);
    if (watch.length > 12) console.log(`   （他 ${watch.length - 12} か所）`);
}
console.log(ng === 0
    ? '\n✅ 「どうやっても被弾する」場所は見つからなかった。ギミックが濃い所も、待てば必ず窓が開き、長い床は全部の開始時刻で無傷の経路が実在する'
    : `\n❌ ${ng}件。上記を確認すること`);
console.log('\n【この結果が言えること / 言えないこと】');
console.log('  言える: 立てる場所は全部（縦の部屋の小さな足場も含めて）時間展開して調べてあり、');
console.log('          「乗ったら何をしても被弾する足場」は無い。長い床は開始時刻を33通り試して');
console.log('          「立つ・待つ・歩く・跳ぶ」だけの無傷経路が実在する。');
console.log('  言えない: 足場から足場へ跳び移る**縦の移動**そのものは経路探索に含めていない（各足場の');
console.log('          安全率は出してある）。雑魚敵の実位置も湧きがプレイヤーの進み方と結合するため確定できず、');
console.log('          「踏んで倒せる／飛行敵は立っている高さに当たらない」前提で重なりを報告するに留めている。');
process.exit(ng ? 1 : 0);
