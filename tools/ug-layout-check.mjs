#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 地底ステージ レイアウト検証ツール（1.610）
//   使い方: node tools/ug-layout-check.mjs [7|14|21]   （省略時は全ラウンド）
//
// ⚠**地底のマップを触ったら必ずこれを通すこと**。R14 の作業中に「取れない位置のハート」
//   「宙に浮いたトゲ」を実際に検出した（R7 にも1件あった）。目視では絶対に見つからない。
//
// 判定の要点（過去にここで間違えた）:
//   ・床は**下から上へ**走査して求める（上から見ると天井を拾う）
//   ・'^' は**そのマスの底に生える**＝**1つ下の行に足場が必須**（無いと宙に浮く）
//   ・アイテム/コインは**真下5行以内に足場があるか**（跳躍の最高到達175px=5行）で見る。
//     落下部屋と亀裂の落下口だけは例外＝「落下線の上か」で見る
//   ・縦の部屋は「隣の列との段差」が無意味（片道足場で登る）＝チェック対象外
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 32, JUMP_ROWS = 5, MAX_HOLE = 3, MAX_STEP_ROWS = 4, MAX_SPIKE_RUN = 2;
const TOTAL_TILES = 790, TRAVEL_TILES = 750, SHOP_TILE = 643, IDOL_TILE = 735;

const SOLID = new Set(['#', 'B']);          // 当たり判定のある地形
const PLAT  = new Set(['=', 'M']);          // 片道足場（'M'=動く床）
const ITEM  = new Set(['1', '2', '3', '4', '5']);
const GROUND_ENEMY = new Set(['c', 'm', 'g', 'S']);
const FLY_ENEMY    = new Set(['v', 'd']);
const BAR   = new Set(['F', 'G', 'H']);
const SPOUT = new Set(['f', 'e']);
const DECOR = new Set(['b', 'i', 'I', 'W']);

// ── core-state.js を読み込む。ugRow は「後から書いた部品が前の部品を黙って上書きする」ので、
//    重なりを検出できるようにパッチしてから評価する（重なり＝置いたはずの敵/ギミックが消える事故）。
function loadRooms() {
    let src = readFileSync(join(ROOT, 'core-state.js'), 'utf8');
    const NEEDLE = "for (k = 0; k < s.length; k++) if (c + k >= 0 && c + k < w) a[c + k] = s.charAt(k);";
    if (!src.includes(NEEDLE)) throw new Error('ugRow の中身が変わっている。このツールのパッチ位置を直すこと');
    src = src.replace(NEEDLE,
        "for (k = 0; k < s.length; k++) if (c + k >= 0 && c + k < w) {" +
        "  if (__ugWritten[c + k] && s.charAt(k) !== ' ' && __ugWritten[c + k] !== ' ')" +
        "    __ugOverlaps.push({ col: c + k, was: __ugWritten[c + k], now: s.charAt(k) });" +
        "  __ugWritten[c + k] = s.charAt(k); a[c + k] = s.charAt(k); }");
    src = src.replace('function ugRow(w, base, parts) {\n    var a = new Array(w), i, p, k;',
                      'function ugRow(w, base, parts) {\n    var a = new Array(w), i, p, k; var __ugWritten = new Array(w);');
    src = 'var __ugOverlaps = [];\n' + src;

    // ⚠core-state.js は先頭で canvas を取りに行くので、最低限の DOM スタブを渡す
    const stubEl = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'style' ? {} : () => stubEl)) });
    const ctx = vm.createContext({
        Math, JSON, Array, Object, String, Number, console, Date, Set, Map,
        document: { getElementById: () => stubEl, createElement: () => stubEl,
                    querySelector: () => stubEl, addEventListener: () => {}, body: stubEl },
        window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0
    });
    vm.runInContext(src, ctx, { filename: 'core-state.js' });
    return {
        overlaps: ctx.__ugOverlaps,
        forRound: (r) => vm.runInContext(`ugRoomsForRound(${r})`, ctx)
    };
}

// 部屋を2次元配列にして、各セルの worldY / worldCol を引けるようにする
function grid(room) {
    const g = room.map.map((line) => {
        const row = new Array(room.wT);
        for (let c = 0; c < room.wT; c++) row[c] = c < line.length ? line.charAt(c) : ' ';
        return row;
    });
    return g;
}
const isFooting = (ch) => SOLID.has(ch) || PLAT.has(ch);

// 列 c で「立てる面」の worldY をすべて返す（＝ソリッドで、真上が塞がっていないマス）。
// ⚠必ず**下から上へ**走査する。上から見ると天井を床と誤認する。
// ⚠マップ最上行は「上が塞がっていない」ように見えるが天井の上面なので面として数えない。
function surfaces(g, room, c) {
    const out = [];
    for (let r = g.length - 1; r >= 1; r--) {
        if (!SOLID.has(g[r][c])) continue;
        if (!SOLID.has(g[r - 1][c])) out.push(room.topY + r * TILE);
    }
    return out;
}
// 列 c は「渡れる」か＝床の高さ±4行の帯に足場（岩・石積み・片道足場・動く床）が1つでもあるか。
// ⚠石橋('B')や動く床('M')で跨いである溶岩を「穴」と誤検出しないための判定（R7の回廊/熔炉が実例）。
function crossable(g, floorRow, c) {
    for (let r = Math.max(0, floorRow - MAX_STEP_ROWS); r <= floorRow; r++) if (isFooting(g[r][c])) return true;
    return false;
}
// 敵/物の真下を掘って、最初にぶつかるものを返す（' '=空を突き抜ける）
function firstBelow(g, r, c) {
    for (let k = r + 1; k < g.length; k++) if (g[k][c] !== ' ') return g[k][c];
    return null;   // マップの底まで何も無い
}

function checkRound(round, rooms, overlaps, out) {
    const err = (m) => out.errors.push(`[R${round}] ${m}`);
    const warn = (m) => out.warns.push(`[R${round}] ${m}`);
    const stat = out.stats[round] = { rooms: rooms.length, tiles: 0, bars: 0, balls: 0,
                                      enemies: 0, coins: 0, items: 0, spikes: 0, lava: 0, movers: 0 };

    // ── 全体 ───────────────────────────────────────────────────────
    let col0 = 0;
    const starts = rooms.map((r) => { const s = col0; col0 += r.wT; return s; });
    stat.tiles = col0;
    if (col0 !== TOTAL_TILES) err(`総幅が ${col0} タイル（${TOTAL_TILES} でないと距離加算＝ランキングの前提が壊れる）`);
    const last = rooms[rooms.length - 1];
    if (last.key !== 'chamber') err(`最後の部屋が '${last.key}'（updateUgBoss は末尾が 'chamber' でないとボスに移行しない）`);
    if (col0 - last.wT !== TRAVEL_TILES) err(`闘技場の手前が ${col0 - last.wT} タイル（${TRAVEL_TILES}=UG_TRAVEL_PX でない）`);

    rooms.forEach((room, ri) => {
        const g = grid(room), rowsN = g.length, tag = `${room.key}`;
        const vertical = (room.topY + rowsN * TILE - 450 - room.topY) > 64;
        const floorRow = rowsN - 3;

        // 行の長さ
        room.map.forEach((line, r) => {
            if (line.length !== room.wT) err(`${tag} 行${r} の長さが ${line.length}（wT=${room.wT}）`);
        });
        // 床は必ずマップ最下行の3行上
        const floorY = room.topY + floorRow * TILE;
        if (![1180, 508, -164].includes(floorY) && room.key !== 'chamber')
            warn(`${tag} 床の worldY が ${floorY}（想定の3段=1180/508/-164 の外）`);

        // ── 隣の部屋とのつなぎ目: 立てる面の高さが共有されているか ──
        if (ri < rooms.length - 1) {
            const nxt = rooms[ri + 1], gn = grid(nxt);
            const a = surfaces(g, room, room.wT - 1), b = surfaces(gn, nxt, 0);
            if (!a.some((y) => b.includes(y)))
                err(`${tag} → ${nxt.key} のつなぎ目で床の高さが合わない（左端=${a.join('/')} 右端=${b.join('/')}）`);
        }

        for (let r = 0; r < rowsN; r++) {
            for (let c = 0; c < room.wT; c++) {
                const ch = g[r][c];
                if (ch === ' ') continue;
                const below = r + 1 < rowsN ? g[r + 1][c] : '#';

                if (BAR.has(ch))  { stat.bars++;  if (SOLID.has(below) && SOLID.has(g[r][c])) {} }
                if (SPOUT.has(ch)) stat.balls++;
                if (ch === 'o')   stat.coins++;
                if (ITEM.has(ch)) stat.items++;
                if (ch === 'L')   stat.lava++;
                if (ch === 'M')   stat.movers++;
                if (GROUND_ENEMY.has(ch) || FLY_ENEMY.has(ch)) stat.enemies++;

                // トゲ: そのマスの底に生えるので、1つ下の行に足場が要る
                if (ch === '^') {
                    stat.spikes++;
                    if (!isFooting(below)) err(`${tag} 行${r} 列${c} のトゲが宙に浮いている（真下=' ${below} '）`);
                    if (below === 'M') err(`${tag} 行${r} 列${c} のトゲが動く床の上にある（トゲは静止するので分離する）`);
                }
                // 地上敵が溶岩の**真隣**に居ないか（湧いた直後に踏み外して溶岩の中に立つ絵になりやすい）。
                // ⚠'m'/'S' は穴の手前で引き返すので致命ではない＝警告に留める。
                if (GROUND_ENEMY.has(ch)) {
                    for (let dc = -1; dc <= 1; dc += 2) {
                        const cc = c + dc;
                        if (cc < 0 || cc >= room.wT) continue;
                        if (g[r + 1] && g[r + 1][cc] === 'L')
                            warn(`${tag} 行${r} 列${c} の地上敵 '${ch}' が溶岩(列${cc})の真隣＝溶岩の中に立って見えることがある`);
                    }
                }
                // 火の玉の噴出口は**必ずマグマ(溶岩)の上**に置く（ユーザー指定「火の玉はマグマから
                // 出てくるのが絶対」）。真下1〜2行以内に 'L' が無ければ、岩から火が噴いていることになる。
                if (SPOUT.has(ch)) {
                    var onLava = false;
                    for (var k = 1; k <= 2 && r + k < rowsN; k++) if (g[r + k][c] === 'L') { onLava = true; break; }
                    if (!onLava) err(`${tag} 行${r} 列${c} の噴出口 '${ch}' の真下にマグマが無い（岩から火が噴いてしまう）`);
                }
                // 敵（地上）: 落ちた先が足場であること。⚠空中に書いても落ちて着地するので
                //   「真下が空」は問題ない。**落ちた先が溶岩／マップの底**だと湧いた瞬間に消える。
                if (GROUND_ENEMY.has(ch)) {
                    const land = firstBelow(g, r, c);
                    if (land === null) err(`${tag} 行${r} 列${c} の地上敵 '${ch}' の下に床が無い（湧いた瞬間に落ちて消える）`);
                    else if (land === 'L') err(`${tag} 行${r} 列${c} の地上敵 '${ch}' が溶岩の真上（湧いた瞬間に落ちて消える）`);
                }
                // ファイアバー/噴出口/敵/アイテムが地形に埋まっていないか
                if ((BAR.has(ch) || SPOUT.has(ch)) && SOLID.has(ch)) {}
            }
        }

        // トゲの連続は最大2タイル
        for (let r = 0; r < rowsN; r++) {
            let run = 0;
            for (let c = 0; c <= room.wT; c++) {
                if (c < room.wT && g[r][c] === '^') run++;
                else { if (run > MAX_SPIKE_RUN) err(`${tag} 行${r} でトゲが ${run} タイル連続（最大${MAX_SPIKE_RUN}）`); run = 0; }
            }
        }

        // ── アイテム/コインが取れる位置にあるか（真下5行以内に足場） ──
        const dropCols = room.dropCols;   // 落下部屋/落下口の例外
        for (let r = 0; r < rowsN; r++) {
            for (let c = 0; c < room.wT; c++) {
                const ch = g[r][c];
                if (ch !== 'o' && !ITEM.has(ch)) continue;
                // ⚠踏切は真下でなくてよい。跳び越えている最中に取れるので**左右2タイルまで**を見る
                //   （2〜3タイルの溶岩の上に置いたコインは、跨ぐ跳躍の頂点で取れる＝R7の熔炉が実例）。
                let ok = false;
                for (let dc = -2; dc <= 2 && !ok; dc++) {
                    const cc = c + dc;
                    if (cc < 0 || cc >= room.wT) continue;
                    for (let k = 1; k <= JUMP_ROWS && r + k < rowsN; k++) if (isFooting(g[r + k][cc])) { ok = true; break; }
                }
                if (!ok && dropCols && c >= dropCols[0] && c <= dropCols[1]) ok = true;   // 落下線の上＝落ちながら取れる
                if (!ok) err(`${tag} 行${r} 列${c} の '${ch}' が取れない（真下${JUMP_ROWS}行±2列に足場が無い）`);
            }
        }

        // ── 床の穴（横の部屋のみ。縦の部屋の底は溶岩が正しい） ──
        if (!vertical && room.key !== 'chamber') {
            let run = 0;
            for (let c = 0; c <= room.wT; c++) {
                if (c < room.wT && !crossable(g, floorRow, c)) run++;
                else { if (run > MAX_HOLE) err(`${tag} 床(行${floorRow})の列${c - run}〜${c - 1} に ${run} タイルの穴（最大${MAX_HOLE}・橋も動く床も無い）`); run = 0; }
            }
            // 段差（横の部屋は床が平らである前提。床の帯に面がある列どうしだけ比べる）
            let prev = null;
            for (let c = 0; c < room.wT; c++) {
                const band = surfaces(g, room, c).filter((y) => y <= floorY && y >= floorY - MAX_STEP_ROWS * TILE);
                if (!band.length) continue;
                const y = Math.max(...band);
                if (prev !== null && Math.abs(y - prev) > MAX_STEP_ROWS * TILE)
                    err(`${tag} 列${c} で段差 ${Math.abs(y - prev)}px（最大${MAX_STEP_ROWS * TILE}px）`);
                prev = y;
            }
        }

        // ── 追加の床ライン（亀裂の中段の桟道など）の穴チェック ──
        if (room.extraFloor) {
            const { row, from, to } = room.extraFloor;
            let run = 0;
            for (let c = from; c <= to + 1; c++) {
                const solidHere = c <= to && SOLID.has(g[row][c]);
                if (!solidHere && c <= to) run++;
                else { if (run > MAX_HOLE) err(`${tag} 桟道(行${row})に ${run} タイルの穴（最大${MAX_HOLE}）`); run = 0; }
            }
        }

        // ── 片道足場が「どこかから乗れる」か ────────────────────────────
        // ⚠分岐や階段を作ったときに一番怖いのが「乗れない足場」＝そこで進行不能になる。
        //   実測値: 水平跳躍135px・最高到達175px。下から跳ぶか、上から落ちてくるかのどちらかで
        //   届く足場が1つでもあれば OK とする。
        const foot = [];   // {y, x0, x1, plat}
        for (let r = 0; r < rowsN; r++) {
            let c = 0;
            while (c < room.wT) {                                   // 片道足場（'='/'M'）の連なり
                if (!PLAT.has(g[r][c])) { c++; continue; }
                const s = c; while (c + 1 < room.wT && PLAT.has(g[r][c + 1])) c++;
                foot.push({ y: room.topY + r * TILE, x0: s, x1: c, plat: true }); c++;
            }
            if (r === 0) continue;
            c = 0;
            while (c < room.wT) {                                   // ソリッドの上面の連なり
                if (!(SOLID.has(g[r][c]) && !SOLID.has(g[r - 1][c]))) { c++; continue; }
                const s = c; while (c + 1 < room.wT && SOLID.has(g[r][c + 1]) && !SOLID.has(g[r - 1][c + 1])) c++;
                foot.push({ y: room.topY + r * TILE, x0: s, x1: c, plat: false }); c++;
            }
        }
        foot.filter((p) => p.plat).forEach((p) => {
            const ok = foot.some((q) => {
                if (q === p) return false;
                const gapT = Math.max(0, Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1) - 1);
                if (gapT * TILE > 135) return false;
                const dy = p.y - q.y;                               // 正 = q が下にある
                return dy > 0 ? dy <= 175 : true;                   // 下からは175pxまで／上からは落ちてこられる
            });
            if (!ok) err(`${tag} 足場 y=${p.y} 列${p.x0}-${p.x1} にどこからも乗れない（跳躍135px/175pxの外）`);
        });

        // ── 「上から下へ絶対に落ちられない」床（R28の分水嶺の上ルート）に穴が1マスも無いか ──
        if (room.sealedFloor) {
            const { row, from, to, thick = 32 } = room.sealedFloor;   // ⚠深いマグマを掘っても下の岩で塞がっていればよい
            // ⚠**帯のどこか1行でも岩なら塞がっている**。最上行を溶岩にして「マグマの池」を作っても
            //   下の行が岩なら落下は起きない（1.613で上ルートに溶岩を入れたため、単一行判定から変更）。
            for (let c = from; c <= to; c++) {
                let solid = false;
                for (let k = 0; k < thick && row + k < rowsN; k++) if (SOLID.has(g[row + k][c])) { solid = true; break; }
                if (!solid) err(`${tag} 行${row}〜${row + thick - 1} 列${c} で上ルートの床が抜けている（＝下ルートへ落ちられてしまう）`);
            }
        }

        // ── 降りる部屋: 立っている面から**次の下の面が画面に入るか** ────────────
        // ⚠カメラは足元を画面の下から `gap` の位置に置くので、**足元より下に見えるのは
        //   (gap - 96)px だけ**（通常の部屋 gap=96 → 0px相当／descend gap=250 → 250px）。
        //   次の足場がそれより下だと「見えない床へ跳ぶ」ことになる（1.619・ユーザー実機報告
        //   「この位置に来たら下方向が見えなければならない」＝R28の合流の大広間で実際に起きた）。
        // ⚠導入の落下部屋（dropCols 指定＝天井の穴から落ちてくる部屋）は、長く落ちること自体が
        //   演出なので対象外にする。
        if (room.descend && !room.dropCols) {
            const VIS_BELOW = 250;   // UG_CAM_DESCEND_GAP
            const tops = [];         // 立てる面（片道足場＋ソリッドの上面）を y でまとめる
            for (let r = 0; r < rowsN; r++) for (let c = 0; c < room.wT; c++) {
                const ch = g[r][c];
                const isTop = PLAT.has(ch) || (SOLID.has(ch) && r >= 1 && !SOLID.has(g[r - 1][c]));
                if (isTop) tops.push({ y: room.topY + r * TILE, c });
            }
            tops.sort((a, b) => a.y - b.y);
            const ys = [...new Set(tops.map((t) => t.y))];
            for (let i = 0; i < ys.length - 1; i++) {
                const gapPx = ys[i + 1] - ys[i];
                if (gapPx > VIS_BELOW)
                    warn(`${tag} y=${ys[i]} の足場から次の足場(y=${ys[i + 1]})まで ${gapPx}px`
                       + `＝カメラが見せる ${VIS_BELOW}px を超える（降りる先が画面に入らない）`);
            }
        }

        // ── 'c'(ひよこ)は穴/溶岩に落ちる種。床に穴のある部屋に置いたら警告 ──
        const hasHole = !vertical && [...Array(room.wT).keys()].some((c) => !SOLID.has(g[floorRow][c]));
        if (hasHole) for (let c = 0; c < room.wT; c++) for (let r = 0; r < rowsN; r++)
            if (g[r][c] === 'c') warn(`${tag} 行${r} 列${c} の 'c'(ひよこ) は穴に落ちて消える（'m'/'S' は穴の手前で引き返す）`);

        // ── 店と巨像の絶対位置 ──
        for (let r = 0; r < rowsN; r++) for (let c = 0; c < room.wT; c++) {
            if (g[r][c] === 'W' && starts[ri] + c !== SHOP_TILE)
                err(`${tag} 老婆の店が ${starts[ri] + c} タイル目（R7/R14と揃えるなら ${SHOP_TILE}）`);
            if (g[r][c] === 'I' && starts[ri] + c !== IDOL_TILE)
                err(`${tag} 邪神の巨像が ${starts[ri] + c} タイル目（R7/R14と揃えるなら ${IDOL_TILE}）`);
        }
    });

}

// ─────────────────────────────────────────────────────────────────
const { forRound, overlaps } = loadRooms();
const want = process.argv[2] ? [Number(process.argv[2])] : [7, 14, 21, 28];
const out = { errors: [], warns: [], stats: {} };

// 例外指定（落下線の上のコインを許す列範囲・追加の床ライン）
const EXTRA = {
    fall:    { dropCols: [0, 4] },                                 // R7/R14 の落下部屋
    shaft:   { dropCols: [0, 4] },                                 // R21 の落下部屋
    plummet: { dropCols: [0, 4] },                                 // R28 の落下部屋
    rift:    { dropCols: [44, 49], extraFloor: { row: 12, from: 0, to: 43 } }, // R21 の落下口＋中段の桟道
    // R28 の分水嶺: 中段の通路(行32・入口側)と上ルートのトンネル床(行11)も穴が無いことを確かめる。
    // ⚠上ルートの床に穴があると「上から下へ落ちられる」＝この面の前提が崩れるので、ここは必ず見る。
    divide:  { extraFloor: { row: 32, from: 0, to: 39 }, sealedFloor: { row: 11, from: 60, to: 145 } }
};

for (const r of want) {
    const rooms = forRound(r).map((room) => Object.assign({}, room, EXTRA[room.key] || {}));
    checkRound(r, rooms, [], out);
}
// ⚠ugRow の部品どうしの重なり（＝先に書いたものが黙って消える）。ファイル全体で1回だけ集計される。
if (overlaps.length) out.warns.push(`ugRow で部品が重なって上書きされた箇所が ${overlaps.length} 件`
    + `（置いたものが消える・R7/R14/R21 の全部屋をまとめて集計）: `
    + overlaps.map((o) => `列${o.col} '${o.was}'→'${o.now}'`).join(', '));

// ═══════════════════════════════════════════════════════════════════════════
// ② 実機と同じパーサを通す検証。gameplay.js の setupUndergroundStage() を**実際に呼んで**、
//    出来上がった部屋（カメラの上下限・死亡ライン）とエンティティを見る。
//    ⚠テキストマップの見た目が正しくても、部屋の継ぎ目でカメラが飛ぶ／店の位置がズレる、は
//      ここでしか分からない（マップ単体を見ても分からない）。
// ═══════════════════════════════════════════════════════════════════════════
function runtimeCheck(round, out) {
    const err = (m) => out.errors.push(`[R${round}/実機] ${m}`);
    const stubEl = new Proxy(function () {}, {
        get: (t, k) => (k === 'style' ? {} : k === 'length' ? 0 : stubEl), apply: () => stubEl, set: () => true
    });
    const base = {
        Math, JSON, Array, Object, String, Number, console, Date, Set, Map, isNaN, parseInt, parseFloat,
        document: { getElementById: () => stubEl, createElement: () => stubEl, querySelector: () => stubEl,
                    querySelectorAll: () => [], addEventListener: () => {}, body: stubEl },
        window: { addEventListener: () => {}, innerWidth: 820, innerHeight: 450, devicePixelRatio: 1 },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0, setTimeout: () => 0,
        setInterval: () => 0, performance: { now: () => 0 }
    };
    const ctx = vm.createContext(new Proxy(base, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) }));
    for (const file of ['core-state.js', 'gameplay.js'])
        vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), ctx, { filename: file });

    const r = vm.runInContext(`
        gameRound = ${round};
        undergroundState.originX = 100000;
        setupUndergroundStage();
        (function () {
            var ug = undergroundState;
            return {
                rooms: ug.rooms.map(function (x) { return { key: x.key, x0: x.x0, x1: x.x1, topY: x.topY,
                    camMinY: x.camMinY, camMaxY: x.camMaxY, deathY: x.deathY, vertical: x.vertical, descend: x.descend }; }),
                endX: ug.endX, origin: ug.originX,
                terrain: terrain.length, platforms: platforms.length, movers: platforms.filter(function (p) { return p.special === 'moving'; }).length,
                coins: coins.length, items: powerUps.length, spikes: ug.spikes.length,
                bars: ug.fireBars.length, balls: ug.fireballs.length, enemies: ug.pendingEnemies.length,
                lava: ug.lava.length, decor: ug.decor.length, braziers: ug.braziers.length,
                shopX: ug.shop ? ug.shop.x : null, idolX: ug.idol ? ug.idol.x : null,
                hearts: powerUps.filter(function (p) { return p.type === 'heart'; }).length
            };
        })()`, ctx);

    const T = 32, O = r.origin;
    if (r.endX - O !== TOTAL_TILES * T) err(`endX が ${(r.endX - O) / T} タイル（${TOTAL_TILES} でない）`);
    const arena = r.rooms[r.rooms.length - 1];
    if (arena.x0 - O !== 24000) err(`闘技場の左端が ${arena.x0 - O}px（UG_TRAVEL_PX=24000 でない＝距離加算がズレる）`);
    if (r.shopX === null) err('老婆の店 (W) が無い');
    if (r.idolX === null) err('邪神の巨像 (I) が無い');

    // ── カメラの継ぎ目: 部屋を出る高さと入る高さでカメラ y が一致するか ──
    //   横の部屋は camMaxY 固定。縦の部屋は「接地した足元 − (450 − すき間)」。
    const camAt = (room, feetY) => {
        if (!room.vertical) return room.camMaxY;
        const gap = room.descend ? 250 : 96;
        return Math.min(room.camMaxY, Math.max(room.camMinY, feetY - (450 - gap)));
    };
    const roomsSrc = forRound(round);
    for (let i = 0; i < r.rooms.length - 1; i++) {
        const A = r.rooms[i], B = r.rooms[i + 1];
        const ga = grid(roomsSrc[i]), gb = grid(roomsSrc[i + 1]);
        const sa = surfaces(ga, roomsSrc[i], roomsSrc[i].wT - 1), sb = surfaces(gb, roomsSrc[i + 1], 0);
        const shared = sa.filter((y) => sb.includes(y));
        if (!shared.length) continue;                      // つなぎ目の不一致は①で報告済み
        const feet = shared[0];
        const ca = camAt(A, feet), cb = camAt(B, feet);
        // ⚠降りる部屋へ入る瞬間だけはカメラが下を向く＝R7/R14 と同じ意図的な差なので許す
        if (ca !== cb && !B.descend)
            err(`${A.key} → ${B.key} でカメラ y が ${ca} → ${cb} に飛ぶ（床 ${feet} を歩いて渡るのに）`);
    }
    out.runtime[round] = r;
}

const f = (n, w) => String(n).padStart(w);
out.runtime = {};
for (const r of want) runtimeCheck(r, out);

console.log('\n=== 地底レイアウト検証 ===');
for (const r of want) {
    const s = out.stats[r];
    console.log(`R${f(r, 2)}: 部屋${f(s.rooms, 3)} 幅${f(s.tiles, 4)}T  バー${f(s.bars, 3)} 火の玉${f(s.balls, 3)} `
        + `敵${f(s.enemies, 4)} コイン${f(s.coins, 4)} アイテム${f(s.items, 3)} トゲ${f(s.spikes, 4)} `
        + `溶岩${f(s.lava, 4)} 動く床${f(s.movers, 3)}`);
}
console.log('\n--- 実機と同じパーサ（setupUndergroundStage）を通した結果 ---');
for (const r of want) {
    const s = out.runtime[r], O = s.origin;
    console.log(`R${f(r, 2)}: 地形${f(s.terrain, 4)} 足場${f(s.platforms, 3)}(動く${f(s.movers, 2)}) トゲ${f(s.spikes, 3)} `
        + `溶岩${f(s.lava, 3)} 敵${f(s.enemies, 4)} 回復${f(s.hearts, 2)} `
        + `店=${f((s.shopX - O) / 32 | 0, 3)}T 巨像=${f((s.idolX - O) / 32 | 0, 3)}T 闘技場=${(s.rooms.at(-1).x0 - O)}px`);
    console.log('      ' + s.rooms.map((x) => `${x.key}[${x.camMinY}..${x.camMaxY}]`).join(' '));
}
if (out.warns.length) { console.log(`\n--- 警告 ${out.warns.length}件 ---`); out.warns.forEach((w) => console.log('  ⚠ ' + w)); }
if (out.errors.length) { console.log(`\n--- エラー ${out.errors.length}件 ---`); out.errors.forEach((e) => console.log('  ✗ ' + e)); }
else console.log('\n✅ エラーなし');
process.exit(out.errors.length ? 1 : 0);
