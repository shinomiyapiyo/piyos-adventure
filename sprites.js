/**
 * ぴよ氏の冒険 - ハイブリッドスプライトシステム
 * キャラクター/アイテム: 画像ファイル (PixelLab生成)
 * 地形/背景: プロシージャル生成ピクセルアート (SFC 16色パレット)
 */

// ─── 画像スプライト定義 (PNG読み込み) ───
var IMAGE_SPRITES = {
    // プレイヤー (64x64, 右向き, flipHで左向き)
    player_idle: { files: ['images/player_idle_v1.png'] },
    player_walk: { files: [
        'images/player_walk_1.png',
        'images/player_walk_2.png',
        'images/player_walk_3.png',
        'images/player_walk_4.png'
    ]},
    player_jump: { files: ['images/player_jump.png'] },
    player_fall: { files: ['images/player_fall.png'], flip: true },

    // 黄色メイド服スキン（player_* を再スキンした版・並び/flipを揃える）
    skin_maid_idle: { files: ['images/skin_maid_idle.png'] },
    skin_maid_walk: { files: [
        'images/skin_maid_walk_1.png',
        'images/skin_maid_walk_2.png',
        'images/skin_maid_walk_3.png',
        'images/skin_maid_walk_4.png'
    ]},
    skin_maid_jump: { files: ['images/skin_maid_jump.png'] },
    skin_maid_fall: { files: ['images/skin_maid_fall.png'], flip: true },

    // アイドルぴよスキン（タイトルショップ200,000円・1.667。ぴよ氏本人のアイドル衣装・公認）
    // 立ち絵=Gemini（正面）／歩行=Veo veo_idol_walk.mp4 の f_24/30/36/42 を切り出し。
    // ⚠jump/fall は**まだ無い**。sprites に無いキーは既存の自動フォールバックで player_* が使われるので
    //   壊れない（侍ぴよ/サイバーぴよと同じ状態）。作ったらここへ足すこと。
    skin_idol_idle: { files: ['images/skin_idol_idle.png'] },
    skin_idol_walk: { files: [
        'images/skin_idol_walk_1.png',
        'images/skin_idol_walk_2.png',
        'images/skin_idol_walk_3.png',
        'images/skin_idol_walk_4.png'
    ]},

    // でんきネズミきぐるみスキン（エッグ交換限定・player_* と並びを揃える）
    skin_kigurumi_idle: { files: ['images/skin_kigurumi_idle.png'] },
    skin_kigurumi_walk: { files: [
        'images/skin_kigurumi_walk_1.png',
        'images/skin_kigurumi_walk_2.png',
        'images/skin_kigurumi_walk_3.png',
        'images/skin_kigurumi_walk_4.png'
    ]},
    skin_kigurumi_jump: { files: ['images/skin_kigurumi_jump.png'] },
    skin_kigurumi_fall: { files: ['images/skin_kigurumi_fall.png'] },

    // 忍者ぴよスキン（エッグ交換🥚200・黄色装束+頭巾。歩行=Veo veo_ninja_walk.mp4 f_27/33/38/44）
    skin_ninja_idle: { files: ['images/skin_ninja_idle.png'] },
    skin_ninja_walk: { files: [
        'images/skin_ninja_walk_1.png',
        'images/skin_ninja_walk_2.png',
        'images/skin_ninja_walk_3.png',
        'images/skin_ninja_walk_4.png'
    ]},
    skin_ninja_jump: { files: ['images/skin_ninja_jump.png'] },
    skin_ninja_fall: { files: ['images/skin_ninja_fall.png'] },
    // 忍者の手裏剣弾（グレー=夜ステージでも視認可・drawBulletで回転描画）
    shuriken: { files: ['images/shuriken.png'] },

    // 魔女ぴよスキン（エッグ交換🥚200・1.457／立ち絵=OpenAI・歩行=Veo veo_witch_walk.mp4 f_22/30/38/46・fall=ほうき滑空ポーズ）
    skin_witch_idle: { files: ['images/skin_witch_idle.png'] },
    skin_witch_walk: { files: [
        'images/skin_witch_walk_1.png',
        'images/skin_witch_walk_2.png',
        'images/skin_witch_walk_3.png',
        'images/skin_witch_walk_4.png'
    ]},
    skin_witch_jump: { files: ['images/skin_witch_jump.png'] },
    skin_witch_fall: { files: ['images/skin_witch_fall.png'] },

    // 侍ぴよスキン（タイトルショップ100万・1.512／立ち絵=OpenAI samurai_anchor_1・歩行=Veo veo_samurai_walk f_22/26/30/33・
    // jump/fall=Veo veo_samurai_jumpfall f_38/47・dive=急降下斬り専用ポーズ Veo veo_samurai_dive f_37=render.jsがsamuraiDive中に使用）
    skin_samurai_idle: { files: ['images/skin_samurai_idle.png'] },
    skin_samurai_walk: { files: [
        'images/skin_samurai_walk_1.png',
        'images/skin_samurai_walk_2.png',
        'images/skin_samurai_walk_3.png',
        'images/skin_samurai_walk_4.png'
    ]},
    skin_samurai_jump: { files: ['images/skin_samurai_jump.png'] },
    skin_samurai_fall: { files: ['images/skin_samurai_fall.png'] },
    skin_samurai_dive: { files: ['images/skin_samurai_dive.png'] },

    // サイバーぴよのドローンビット（1.520・随伴機・立ち絵OpenAI cyber_drone_3から32×32）
    cyber_drone: { files: ['images/cyber_drone.png'] },

    // サイバーぴよスキン（タイトルショップ200万・1.524／立ち絵=OpenAI cyber_anchor_3・
    // 歩行=Veo veo_cyber_walk f_50/54/61/66（周期23〜24・接地A/閉じ/接地B/閉じ）・
    // jump/fall=Veo veo_cyber_jumpfall f_27（上昇=腕を上げ膝タック）/f_62（下降=腕を下げ脚を流す））
    skin_cyber_idle: { files: ['images/skin_cyber_idle.png'] },
    skin_cyber_walk: { files: [
        'images/skin_cyber_walk_1.png',
        'images/skin_cyber_walk_2.png',
        'images/skin_cyber_walk_3.png',
        'images/skin_cyber_walk_4.png'
    ]},
    skin_cyber_jump: { files: ['images/skin_cyber_jump.png'] },
    skin_cyber_fall: { files: ['images/skin_cyber_fall.png'] },

    // 敵 (左向き固定 - 元画像が右向きのものだけflip:trueで反転)
    chick_walk:        { files: [
        'images/enemy_chick_walk_1.png',
        'images/enemy_chick_walk_2.png',
        'images/enemy_chick_walk_3.png',
        'images/enemy_chick_walk_4.png'
    ], flip: true },
    // バイオーム連動の雑魚見た目（chick と同じ行動/判定・砂漠=うずら/雪山=シマエナガ/夜=ふくろう）
    quail_walk:        { files: [
        'images/enemy_quail_walk_1.png',
        'images/enemy_quail_walk_2.png',
        'images/enemy_quail_walk_3.png',
        'images/enemy_quail_walk_4.png'
    ], flip: true },
    enaga_walk:        { files: [
        'images/enemy_enaga_walk_1.png',
        'images/enemy_enaga_walk_2.png',
        'images/enemy_enaga_walk_3.png',
        'images/enemy_enaga_walk_4.png'
    ], flip: true },
    owl_walk:          { files: [
        'images/enemy_owl_walk_1.png',
        'images/enemy_owl_walk_2.png',
        'images/enemy_owl_walk_3.png',
        'images/enemy_owl_walk_4.png'
    ], flip: true },
    golden_chick_walk: { files: [
        'images/enemy_golden_chick_walk_1.png',
        'images/enemy_golden_chick_walk_2.png',
        'images/enemy_golden_chick_walk_3.png',
        'images/enemy_golden_chick_walk_4.png'
    ] },
    mama_chick_walk:   { files: [
        'images/enemy_mama_chick_walk_1.png',
        'images/enemy_mama_chick_walk_2.png',
        'images/enemy_mama_chick_walk_3.png',
        'images/enemy_mama_chick_walk_4.png'
    ] },
    flying_chick_fly:  { files: [
        'images/enemy_flying_chick_fly_1.png',
        'images/enemy_flying_chick_fly_2.png',
        'images/enemy_flying_chick_fly_3.png',
        'images/enemy_flying_chick_fly_4.png'
    ] },
    // 急降下する攻撃型の空中雑魚（1.527・R11以降）: flying_chick を赤く染めた専用見た目。
    // ⚠バイオームで見た目を変えない＝全ステージ共通の赤＝「赤いやつは突っ込んでくる」と学習できるようにする。
    dive_bird_fly:     { files: [
        'images/enemy_flying_chick_fly_1.png',
        'images/enemy_flying_chick_fly_2.png',
        'images/enemy_flying_chick_fly_3.png',
        'images/enemy_flying_chick_fly_4.png'
    ],
    // tint=寄せる色 / amount=寄せる強さ(0-1) / gain=明度の倍率（暗い赤に沈まないよう軽く持ち上げる）
    recolor: { tint: [235, 45, 45], amount: 0.66, gain: 1.06 } },
    // 飛行雑魚v2（バイオーム見た目・行動/判定/出現率は不変）: 砂漠=ハゲタカ/雪山=白フクロウ/夜=コウモリ
    vulture_fly:       { files: [
        'images/enemy_vulture_fly_1.png',
        'images/enemy_vulture_fly_2.png',
        'images/enemy_vulture_fly_3.png',
        'images/enemy_vulture_fly_4.png'
    ] },
    snowowl_fly:       { files: [
        'images/enemy_snowowl_fly_1.png',
        'images/enemy_snowowl_fly_2.png',
        'images/enemy_snowowl_fly_3.png',
        'images/enemy_snowowl_fly_4.png'
    ] },
    bat_fly:           { files: [
        'images/enemy_bat_fly_1.png',
        'images/enemy_bat_fly_2.png',
        'images/enemy_bat_fly_3.png',
        'images/enemy_bat_fly_4.png'
    ],
    // 元画像の暗紫色は夜空(濃紺)と同化して見にくいため、読み込み時に灰色寄りへ変換
    // desat=彩度を落とす率(0-1) / lift=明るさの底上げ(0-255)
    recolor: { desat: 0.75, lift: 100 } },

    // アイテム
    // ⚠1.580でゴールドへ変更（ユーザー決定）。旧 images/item_coin.png は銀色の星コインで、
    //   ①図鑑・HUD・ランキング・ショップの金額表示がすべて icon_money.png のゴールドなのに拾う物だけ銀
    //   ②空色の背景（草原/昼）で白っぽく沈んで見つけにくい、の2点があった。
    //   UIの金額アイコンと**同じファイルを共有**することで、今後どちらかだけ差し替えてもズレない。
    //   旧ファイルは images/item_coin.png に残してある（戻す場合はここを差し替えるだけ）。
    coin_spin:       { files: ['images/icon_money.png'] },
    powerup_lemon:   { files: ['images/item_lemon.png'] },
    powerup_shield:  { files: ['images/item_shield.png'] },
    powerup_heart:   { files: ['images/item_heart.png'] },
    powerup_energy:  { files: ['images/item_energy.png'] },
    bullet_energy:   { files: ['images/bullet_energy.png'] },

    // ボス (128x128, PixelLab生成 闇の巨大ニワトリ - 7ポーズ)
    // 0:idle, 1:walk, 2:rush, 3:jump, 4:summon, 5:damaged, 6:flame
    boss_rooster:    { files: [
        'images/boss_idle.png',
        'images/boss_walk.png',
        'images/boss_rush.png',
        'images/boss_jump.png',
        'images/boss_summon.png',
        'images/boss_damaged.png',
        'images/boss_flame.png'
    ] },

    // チュートリアルボス「ひよこ大王」(128x128, OpenAI立ち絵+Veoコマ切り出し)
    // boss_rooster と同じフレーム順(0:idle,1:walk,2:rush,3:jump,4:summon,5:damaged,6:flame)に合わせる
    // （AI/描画はニワトリ流用のため。4/6は行進/突進コマで代用＝チュートリアルでは召喚・火炎は使わない）
    boss_hiyoko:     { files: [
        'images/boss_hiyoko_idle.png',
        'images/boss_hiyoko_walk_2.png',
        'images/boss_hiyoko_rush.png',
        'images/boss_hiyoko_jump.png',
        'images/boss_hiyoko_walk_4.png',
        'images/boss_hiyoko_damaged.png',
        'images/boss_hiyoko_rush.png'
    ] },

    // ボス2 (128x128, Gemini[gemini-3-pro-image]生成 闇の空中タカ - 5ポーズ)
    // 0:idle, 1:flap, 2:dive, 3:shoot, 4:damaged
    boss_hawk:       { files: [
        'images/boss2_idle.png',
        'images/boss2_flap.png',
        'images/boss2_dive.png',
        'images/boss2_shoot.png',
        'images/boss2_damaged.png',
        'images/boss2_flap2.png',
        'images/boss2_flap3.png',
        'images/boss2_flap4.png',
        'images/boss2_flap5.png',
        'images/boss2_flap6.png'
    ] },

    // ボス3 (128x128, OpenAI生成 闇の巨卵ゴーレム - 立ち絵1枚。転がり=回転／弱点露出=グロー overlay で procedural)
    boss_egg:        { files: ['images/boss_egg_idle.png'] },

    // ボス4 (128x128, OpenAI生成 闇の大蛇 - 立ち絵1枚。地中→突き上げは headY＋地面クリップで procedural)
    boss_snake:      { files: ['images/boss_snake_idle.png'] },

    // ボス5 (128x128, OpenAI生成 闇のフクロウ - 立ち絵1枚。暗転(vignette)＋光る目は drawOwlDarkness で procedural)
    boss_owl:        { files: ['images/boss_owl_idle.png'] },

    // ボス6/門番 (128x128, OpenAI生成 闇のカカシ - 立ち絵1枚。定点＝正面向き。露出中の弱点グロー/腕薙ぎ赤帯は drawScarecrow で procedural)
    boss_scarecrow:  { files: ['images/boss_scarecrow_idle.png'] },

    // ボス7/地底 (104x132, OpenAI生成 闇の巫女 - 立ち絵1枚。⚠**手続き描画は不可**（ユーザー指定1.570）＝
    //   tools/generate-boss-priestess-openai.mjs で生成したもの以外を使わないこと。
    //   縦長なのは人型だから＝他のボス(128x128)と違い**実寸をそのまま描く**（core-state.js の UG_BOSS_W/H と一致）。
    //   浮遊/詠唱/被弾/瞬間移動の見え方は drawPriestessBody 側の光と高さで作る procedural。
    //   ⚠動きの差分コマが欲しくなったら [[piyo-sprite-motion-rule]] に従い**Veo動画からコマ切り出し**すること。
    boss_priestess:  { files: ['images/boss_priestess_idle.png'] },

    // 邪神の巨像 (220x300, OpenAI生成・1.570)。ボス闘技場の奥に立つ**飾り**＝当たり判定なし。
    // 門を歩いている間から見えて「この先がボス部屋」と分かるようにするための目印（ユーザー指定）。
    ug_idol:         { files: ['images/ug_idol.png'] }
};

// ─── 地形/背景用パレット定義 (SFC 16色) ───
var PALETTES = {
    terrain: [
        'transparent','#90ee90','#32cd32','#228b22','#006400','#c8a060',
        '#a08040','#887030','#e0c880','#556b2f','#7cfc00','#2e8b57',
        '#2e8b57','#8fbc8f','#daa520','#b8860b'
    ],
    cloud: [
        'transparent','#ffffff','#f0f8ff','#dce8f0','#c8d8e8',
        '#000000','#000000','#000000','#000000','#000000',
        '#000000','#000000','#000000','#000000','#000000','#000000'
    ],
    cloud_desert: [
        'transparent','#e8c878','#d4a850','#c09038','#a87828',
        '#000000','#000000','#000000','#000000','#000000',
        '#000000','#000000','#000000','#000000','#000000','#000000'
    ],
    cloud_ice: [
        'transparent','#b8c0c8','#a0a8b0','#8890a0','#707880',
        '#000000','#000000','#000000','#000000','#000000',
        '#000000','#000000','#000000','#000000','#000000','#000000'
    ],
    magnet: [
        'transparent','#ff2255','#cc0033','#3366ff','#0044cc',
        '#dddddd','#aaaaaa','#777777','#ffffff','#ff8899',
        '#88aaff','#dd55ff','#ffcc22','#ff4477','#5588ff','#555555'
    ],
    // 地底への入場土管（1.549）: 赤い石の土管。他の地形タイルと同じ16色パレット方式で、
    // ディザ（市松のドット）で階調を作る＝PS1期の2Dドット絵の作り。グラデーションは使わない。
    ug_pipe: [
        'transparent','#ffb9a6','#f07a68','#d4483c','#b0322a',
        '#8a2320','#5e1512','#360b09','#1b0507','#000000',
        '#ff9a3c','#ffd98a','#7e2b26','#a85148','#2a0a0a','#fff0c8'
    ],
    // シャレコ（骨だけの鳥・1.563）。⚠眼窩の光は**紫**にする＝地底の炎(橙)と混ざらず、
    //   暗い洞窟でも「敵がそこに居る」と一目で分かる。9+レーティング維持のため血や生々しさは描かない。
    skully: [
        'transparent','#f4efe2','#ddd4c0','#b6ab94','#7d7361',
        '#2b2622','#b07cff','#e4ccff','#8a6bd0','#5b5346',
        '#000000','#000000','#000000','#000000','#000000','#000000'
    ],
};

// ─── 地形/背景 プロシージャル生成 ───
(function() {
    function G(w, h) {
        var g = [];
        for (var y = 0; y < h; y++) { g[y] = []; for (var x = 0; x < w; x++) g[y][x] = 0; }
        return g;
    }
    function R(g, x, y, w, h, c) {
        for (var dy = 0; dy < h; dy++) for (var dx = 0; dx < w; dx++) {
            var py = y + dy, px = x + dx;
            if (py >= 0 && py < g.length && px >= 0 && px < g[0].length) g[py][px] = c;
        }
    }
    function E(g, cx, cy, rx, ry, c) {
        for (var dy = -ry; dy <= ry; dy++) for (var dx = -rx; dx <= rx; dx++) {
            if ((dx * dx) / (rx * rx + 0.01) + (dy * dy) / (ry * ry + 0.01) <= 1) {
                var py = cy + dy, px = cx + dx;
                if (py >= 0 && py < g.length && px >= 0 && px < g[0].length) g[py][px] = c;
            }
        }
    }
    function P(g, x, y, c) {
        if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
    }

    // ─── 地形タイル (32x32) ───

    function buildGrassTop() {
        var g = G(32, 32);
        R(g, 0, 10, 32, 22, 5); R(g, 0, 12, 32, 20, 6);
        R(g, 0, 6, 32, 6, 1); R(g, 0, 4, 32, 3, 2);
        for (var i = 0; i < 32; i += 4) {
            R(g, i, 2, 2, 3, 2); R(g, i + 1, 1, 1, 2, 10); R(g, i + 2, 3, 1, 2, 1);
        }
        for (var j = 0; j < 32; j += 6) { P(g, j, 5, 10); P(g, j + 2, 4, 3); P(g, j + 4, 6, 4); }
        for (var k = 0; k < 32; k += 7) { P(g, k, 15, 7); P(g, k + 3, 18, 8); P(g, k + 5, 22, 7); }
        P(g, 10, 20, 14); P(g, 22, 16, 14); P(g, 5, 25, 15);
        return g;
    }

    function buildDirt() {
        var g = G(32, 32);
        R(g, 0, 0, 32, 32, 5); R(g, 0, 2, 32, 28, 6);
        for (var i = 0; i < 32; i += 5) for (var j = 0; j < 32; j += 6) { P(g, i, j, 7); P(g, i + 2, j + 3, 8); }
        P(g, 8, 10, 14); P(g, 20, 20, 15); P(g, 4, 24, 14); P(g, 26, 8, 15);
        return g;
    }

    function buildElevatedTop() {
        var g = G(32, 32);
        R(g, 0, 10, 32, 22, 11); R(g, 0, 12, 32, 20, 12);
        R(g, 0, 6, 32, 6, 11); R(g, 0, 4, 32, 3, 3);
        for (var i = 0; i < 32; i += 4) { R(g, i, 2, 2, 3, 3); R(g, i + 1, 1, 1, 2, 4); R(g, i + 2, 3, 1, 2, 11); }
        for (var j = 0; j < 32; j += 6) { P(g, j, 5, 4); P(g, j + 3, 4, 9); }
        for (var k = 0; k < 32; k += 7) { P(g, k, 16, 7); P(g, k + 4, 22, 8); }
        return g;
    }

    function buildQuicksandTop() {
        // 流砂: 砂漠バイオーム用 (黄土色ベース、波模様)
        var g = G(32, 32);
        R(g, 0, 10, 32, 22, 8); R(g, 0, 12, 32, 20, 9);
        R(g, 0, 6, 32, 6, 8); R(g, 0, 4, 32, 3, 14);
        for (var i = 0; i < 32; i += 3) {
            var wy = 5 + Math.floor(Math.sin(i * 0.8) * 2);
            R(g, i, wy, 2, 2, 15); P(g, i, wy + 2, 14);
        }
        for (var j = 0; j < 32; j += 5) { P(g, j, 14, 15); P(g, j + 2, 20, 14); P(g, j + 3, 17, 15); }
        P(g, 8, 24, 15); P(g, 20, 22, 14); P(g, 14, 26, 15);
        return g;
    }

    function buildIceTop() {
        // 氷床: 雪バイオーム用 (水色ベース、光沢)
        var g = G(32, 32);
        R(g, 0, 10, 32, 22, 1); R(g, 0, 12, 32, 20, 1);
        R(g, 0, 6, 32, 6, 2); R(g, 0, 4, 32, 3, 1);
        // 表面の光沢ライン
        for (var i = 0; i < 32; i += 6) { R(g, i, 5, 4, 1, 2); R(g, i + 2, 7, 3, 1, 2); }
        // 氷のひび割れ
        for (var k = 4; k < 28; k += 8) { P(g, k, 9, 13); P(g, k + 1, 10, 13); P(g, k + 3, 11, 13); }
        for (var j = 0; j < 32; j += 7) { P(g, j, 16, 2); P(g, j + 3, 20, 2); }
        return g;
    }

    function buildCloudPlatform() {
        var g = G(32, 32);
        E(g, 16, 16, 14, 10, 1);
        E(g, 10, 12, 8, 7, 1); E(g, 22, 12, 8, 7, 1);
        E(g, 16, 10, 6, 5, 2); E(g, 16, 16, 12, 8, 2);
        E(g, 12, 10, 3, 2, 1); P(g, 10, 9, 1);
        R(g, 6, 22, 20, 4, 3); R(g, 8, 24, 16, 3, 4);
        return g;
    }

    function buildGroundPlatform() {
        var g = G(32, 32);
        R(g, 0, 2, 32, 28, 5); R(g, 0, 0, 32, 4, 8); R(g, 0, 28, 32, 4, 7);
        for (var y = 4; y < 28; y += 6) { R(g, 0, y, 32, 1, 8); R(g, 0, y + 1, 32, 4, 6); R(g, 0, y + 5, 32, 1, 7); }
        P(g, 2, 2, 7); P(g, 29, 2, 7); P(g, 2, 29, 7); P(g, 29, 29, 7);
        return g;
    }

    // ─── 背景 ───

    function buildBgCloud() {
        var g = G(32, 16);
        E(g, 16, 10, 14, 5, 1); E(g, 10, 8, 7, 5, 1); E(g, 22, 7, 7, 5, 1);
        E(g, 16, 6, 5, 4, 2); E(g, 8, 9, 5, 3, 2);
        return g;
    }

    function buildBgMountain() {
        var g = G(64, 40);
        for (var y = 0; y < 40; y++) {
            var w = Math.floor(y * 32 / 40);
            R(g, 32 - w, y, w * 2, 1, y < 8 ? 13 : y < 20 ? 11 : 3);
        }
        for (var sy = 0; sy < 6; sy++) {
            var sw = Math.floor(sy * 32 / 40);
            R(g, 32 - sw, sy, sw * 2, 1, 1);
        }
        for (var y2 = 15; y2 < 40; y2++) {
            var w2 = Math.floor((y2 - 15) * 20 / 25);
            R(g, 48 - w2, y2, w2 * 2, 1, y2 < 25 ? 13 : 9);
        }
        return g;
    }

    // ─── アイテム: マグネット (32x32) ───
    function buildMagnet() {
        var g = G(32, 32);
        // 上部バー (銀色の接続部)
        R(g, 8, 3, 16, 3, 7);  // 外枠 (暗い銀)
        R(g, 9, 4, 14, 2, 6);  // 中間 (銀)
        R(g, 10, 4, 12, 1, 5); // ハイライト (明るい銀)
        R(g, 8, 6, 16, 3, 6);  // 接続帯
        R(g, 9, 7, 14, 1, 5);
        // 左プロング (赤 = N極)
        R(g, 7, 6, 8, 19, 2);   // 暗い赤ベース
        R(g, 8, 7, 6, 17, 1);   // 明るい赤
        R(g, 9, 8, 4, 15, 9);   // ハイライト (ピンク)
        P(g, 9, 8, 8);          // 白いきらめき
        // 右プロング (青 = S極)
        R(g, 17, 6, 8, 19, 4);  // 暗い青ベース
        R(g, 18, 7, 6, 17, 3);  // 明るい青
        R(g, 19, 8, 4, 15, 10); // ハイライト (水色)
        P(g, 22, 8, 8);         // 白いきらめき
        // 底部 (丸み)
        R(g, 8, 25, 6, 2, 1);   // 赤の底
        R(g, 18, 25, 6, 2, 3);  // 青の底
        P(g, 7, 24, 2); P(g, 24, 24, 4);  // 角丸
        // 上部のバー上書き (銀色を維持)
        R(g, 9, 3, 14, 3, 6);
        R(g, 10, 4, 12, 1, 5);
        R(g, 11, 3, 10, 1, 8);  // 上端ハイライト
        // 磁力線エフェクト (紫の光)
        P(g, 5, 10, 11); P(g, 4, 15, 11); P(g, 5, 20, 11);
        P(g, 26, 11, 11); P(g, 27, 16, 11); P(g, 26, 21, 11);
        // 黄金スパーク
        P(g, 3, 5, 12); P(g, 28, 4, 12); P(g, 15, 1, 12);
        P(g, 2, 18, 12); P(g, 29, 19, 12);
        return g;
    }

    function buildBgTrees() {
        var g = G(32, 48);
        R(g, 13, 30, 6, 18, 7); R(g, 14, 30, 4, 18, 6);
        for (var ly = 0; ly < 20; ly++) {
            var lw = Math.floor(ly * 14 / 20);
            R(g, 16 - lw, 8 + ly, lw * 2, 1, ly < 6 ? 2 : ly < 12 ? 3 : 4);
        }
        E(g, 13, 14, 3, 3, 1); E(g, 18, 10, 2, 2, 10);
        R(g, 24, 38, 3, 10, 7);
        for (var ry = 0; ry < 10; ry++) {
            var rw = Math.floor(ry * 5 / 10);
            R(g, 25 - rw, 30 + ry, rw * 2 + 1, 1, ry < 4 ? 2 : 3);
        }
        return g;
    }

    // ─── 地底ステージ専用タイル（1.542・SPEC_UNDERGROUND.md P2） ───
    // ⚠作り込みステージなので、既存タイルの単なるリカラーにはしない（草の形が残ると洞窟に見えない）。
    //   パレット index は他の地形タイルと共通（terrain）＝BIOME_CONFIGS の地底パレットで色が決まる。
    //   1=明るい岩 2=岩 3=陰 4=最暗 5/6=土台 7/8=土のノイズ 9=苔 10=ハイライト 11/12=石材 13=石の目地 14/15=結晶

    // 洞窟の床（上面）: 草ではなくゴツゴツした岩肌。上端は不規則な砕けた縁、面は岩の陰影で立体を出す。
    // ⚠32pxで横に反復するので、規則的な点の列を作らないこと（＝縞に見えて安っぽくなる）。
    //   結晶は「たまに光る」程度に留め、明るい黄ではなく青寄り(14)を主にする。
    function buildCaveTop() {
        var g = G(32, 32);
        R(g, 0, 7, 32, 25, 3);           // 岩の本体
        R(g, 0, 12, 32, 20, 4);          // 下ほど暗く
        // 砕けた上端（高さを不規則に・2px刻みで細かく）
        // ⚠**上端は必ず y=0 に届かせる**（1.570・ユーザー報告「地底でプレイヤーが地面から浮いて見える」）。
        //   旧版は top = 8-h で岩肌が y=1〜5 から始まっていた。当たり判定の面はタイルの y=0 なので、
        //   足が最大5px宙に浮いて見えていた（地上のタイルは草が足に重なるので同じ隙間でも目立たない）。
        //   ⚠ドット絵の「砕けた岩」らしさは残したいので、**大半を0にして所々1〜2だけ凹ませる**形にした。
        var edge = [0, 2, 1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 1];
        for (var i = 0; i < 16; i++) {
            var x = i * 2, top = edge[i];
            R(g, x, top, 2, 12 - top, 2);          // 明るい岩の面（下端は旧版と同じ y=11 まで）
            P(g, x, top, 1);                        // 縁のハイライト
            if (i % 3 === 0) P(g, x + 1, top + 1, 1);
        }
        // 岩の面の陰影（斜めの割れ目＝直線的に並べない）
        R(g, 4, 13, 1, 6, 4); P(g, 5, 19, 4); P(g, 5, 20, 4);
        R(g, 18, 16, 1, 7, 4); P(g, 17, 23, 4);
        R(g, 27, 12, 1, 5, 4); P(g, 26, 17, 4);
        // 岩のハイライト（面の向きを示す小さな明部）
        P(g, 9, 15, 2); P(g, 10, 16, 2); P(g, 22, 19, 2); P(g, 23, 20, 2); P(g, 13, 25, 2);
        // 結晶（1タイルに2点だけ・青寄り。黄は1点のみでアクセント）
        P(g, 11, 22, 14); P(g, 12, 23, 14);
        P(g, 29, 27, 15);
        return g;
    }

    // 洞窟の内部（床の下を埋める岩）: ひび割れと小石。
    function buildCaveDirt() {
        var g = G(32, 32);
        R(g, 0, 0, 32, 32, 4);
        R(g, 0, 1, 32, 30, 3);
        for (var i = 0; i < 32; i += 6) for (var j = 0; j < 32; j += 7) { P(g, i, j, 4); P(g, i + 2, j + 3, 4); }
        // ひび
        R(g, 6, 4, 1, 9, 4); P(g, 7, 13, 4); P(g, 7, 14, 4);
        R(g, 21, 16, 1, 10, 4); P(g, 20, 26, 4);
        // 小石のハイライト
        P(g, 12, 8, 2); P(g, 13, 9, 2); P(g, 26, 12, 2); P(g, 4, 22, 2); P(g, 18, 28, 2);
        return g;
    }

    // 城の石ブロック（作り込み足場用）: 目地の入った石積み。SMBの城ステージの質感。
    function buildCaveBrick() {
        var g = G(32, 32);
        R(g, 0, 0, 32, 32, 12);         // 石材の地
        // 目地（横2段・段違いの縦目地）
        R(g, 0, 0, 32, 1, 13);
        R(g, 0, 15, 32, 1, 13);
        R(g, 0, 31, 32, 1, 13);
        R(g, 15, 1, 1, 14, 13);         // 上段の縦目地（中央）
        R(g, 0, 16, 1, 15, 13); R(g, 31, 16, 1, 15, 13); // 下段は端で割る＝段違い
        // 石の面のハイライトと汚れ
        for (var by = 1; by < 31; by += 15) {
            R(g, 1, by, 13, 1, 11); R(g, 17, by, 13, 1, 11);   // 上辺の明るい線
        }
        P(g, 5, 6, 11); P(g, 22, 8, 11); P(g, 9, 22, 11); P(g, 26, 24, 11);
        P(g, 3, 10, 13); P(g, 19, 5, 13); P(g, 12, 26, 13); P(g, 28, 19, 13);
        // 苔（下側にわずかに）
        P(g, 2, 29, 9); P(g, 3, 30, 9); P(g, 17, 30, 9); P(g, 18, 29, 9);
        return g;
    }

    // ─── 地底への入場土管 (66x50 → 画面では2倍の132x100で描く・1.549) ───
    // ⚠ユーザー指摘「イラレで雑に描いたように見える」→ 楕円/グラデーションのベクタ描画をやめ、
    //   地形タイルと同じドット絵システム(G/R/E/P＋16色パレット)で描き直したもの。
    //   階調は**ディザ(市松のドット)**で作る＝PS1期の2Dドット絵の作法。滑らかなグラデは一切使わない。
    // ⚠幾何の約束: 一番広い部分(リップ)が左右いっぱい＝当たり判定幅ちょうど／最下段が地面。
    //   口の楕円の中心は y=6・縦半径6（画面では中心12・半径12）＝ UG_PIPE_MOUTH_RY と一致させること。
    function buildUndergroundPipe() {
        var W = 66, H = 50, g = G(W, H);
        var LIP_H = 15, SX = 8, SW = 50;   // リップ高さ / 胴の左端 / 胴の幅
        var i, x, y;

        // ── 胴（石積み）。縦の色帯＋境界にディザで、丸みを出す ──
        var body = [[0,4,6],[4,4,5],[8,5,4],[13,6,3],[19,5,2],[24,4,1],[28,5,2],[33,6,3],[39,5,4],[44,4,5],[48,2,6]];
        for (i = 0; i < body.length; i++) R(g, SX + body[i][0], LIP_H - 2, body[i][1], H - LIP_H + 2, body[i][2]);
        for (i = 1; i < body.length; i++) {                       // 帯の境目を1列ディザで馴染ませる
            x = SX + body[i][0];
            for (y = LIP_H - 2; y < H; y += 2) P(g, x, y, body[i - 1][2]);
        }
        // 石積みの目地（横）＋縦の継ぎ目を互い違いに＝城の遺構らしさ
        for (y = LIP_H + 4; y < H - 1; y += 7) {
            R(g, SX, y, SW, 1, 12);
            R(g, SX, y + 1, SW, 1, 6);
            var off = ((y / 7) | 0) % 2 ? 12 : 30;
            for (i = off; i < SW - 2; i += 24) R(g, SX + i, y + 2, 1, 5, 6);
        }
        R(g, SX, H - 2, SW, 2, 7);                                 // 接地際の暗がり
        R(g, SX - 1, LIP_H - 2, 1, H - LIP_H + 2, 7);              // 胴の輪郭
        R(g, SX + SW, LIP_H - 2, 1, H - LIP_H + 2, 7);

        // ── リップ（縁）＝左右いっぱい。上面の楕円で上端をふさぐ ──
        var lip = [[0,5,6],[5,5,5],[10,6,4],[16,7,3],[23,6,2],[29,5,1],[34,6,2],[40,7,3],[47,6,4],[53,6,5],[59,7,6]];
        for (i = 0; i < lip.length; i++) R(g, lip[i][0], 6, lip[i][1], LIP_H - 6, lip[i][2]);
        for (i = 1; i < lip.length; i++) {
            x = lip[i][0];
            for (y = 6; y < LIP_H; y += 2) P(g, x, y, lip[i - 1][2]);
        }
        R(g, 0, LIP_H - 2, W, 2, 7);                               // リップ下辺の影
        R(g, 0, 6, 1, LIP_H - 6, 7); R(g, W - 1, 6, 1, LIP_H - 6, 7);

        // ── 上面（乗る面）＝楕円。上端が y=0 ＝ 当たり判定の上面と一致 ──
        E(g, 33, 6, 33, 6, 3);
        E(g, 33, 6, 32, 5, 2);
        for (x = 2; x < W - 2; x += 2) P(g, x, 2, 1);              // ふちのハイライトをディザで
        E(g, 33, 6, 31, 4, 7);                                     // 内側の縁（暗）

        // ── 口の中（奥へ落ちる闇）。底に溶岩の明かりをディザで置く ──
        E(g, 33, 6, 26, 4, 8);
        E(g, 33, 6, 24, 3, 9);
        for (x = 22; x <= 44; x += 2) { P(g, x, 8, 10); P(g, x + 1, 9, 14); }
        for (x = 26; x <= 40; x += 4) P(g, x, 9, 11);

        return g;
    }

    // ─── シャレコ（骨だけの鳥・1.563・地底専用の「倒せない敵」） ───
    // 22×20 で描いて画面では2倍(44×40)＝ちょうど整数倍なのでドットの角が崩れない。
    // ⚠他の雑魚と同じく **左向き**が基準（drawEnemy が velX>0 のとき flipH する）。
    // ⚠既存の雑魚は全部PNG画像だが、これは既存方針「画像アセットを増やさず手続きで描く」
    //   （洞窟タイル1.542／入場土管1.549／宝箱1.452と同じ）に合わせた。

    // 歩行フレーム。legPhase で脚の前後、bob で体の上下だけを変える（骨格そのものは不変＝同一個体に見える）
    // ⚠**胴を塗りつぶさないこと**。初版はあばらを楕円で塗ってしまい「毛のある小動物」に見えた。
    //   骨に見えるかどうかは線の巧さではなく**骨と骨の間が透けているか**で決まる。ここは必ず抜く。
    function buildSkully(legPhase, bob) {
        var g = G(22, 20), i;
        var B = bob;                                   // 0 or -1（体を1px持ち上げる）

        // ── 尾の骨（右端・3本に開く。板にしないで隙間を作る）──
        R(g, 19, 8 + B, 3, 1, 3);
        R(g, 19, 10 + B, 3, 1, 2);
        R(g, 19, 12 + B, 2, 1, 3);
        P(g, 21, 7 + B, 4); P(g, 21, 13 + B, 4);

        // ── 背骨（1本の水平線。ここが体の「芯」）──
        R(g, 10, 8 + B, 9, 1, 1);
        R(g, 10, 9 + B, 9, 1, 3);                      // 下辺の陰＝厚みが出る

        // ── あばら（4本の縦線。**間は透明のまま**＝骨として読める）──
        for (i = 0; i < 4; i++) {
            var rx = 11 + i * 2, rh = (i === 0 || i === 3) ? 3 : 4;
            R(g, rx, 10 + B, 1, rh, 1);
            P(g, rx, 10 + B + rh, 3);                  // 先端の陰
        }
        R(g, 11, 14 + B, 7, 1, 3);                     // 胸骨（あばらの下をつなぐ細い線）
        P(g, 11, 14 + B, 2); P(g, 17, 14 + B, 2);

        // ── 翼の骨（背骨の上に細く畳む）──
        R(g, 12, 6 + B, 5, 1, 2);
        P(g, 17, 7 + B, 3); P(g, 11, 7 + B, 3); P(g, 14, 5 + B, 1);

        // ── 首 ──
        P(g, 10, 7 + B, 2); P(g, 9, 6 + B, 2); P(g, 10, 6 + B, 1);

        // ── 頭蓋（左向き・小さめ。大きいと鳥ではなく獣の頭に見える）──
        E(g, 6, 4 + B, 3, 3, 2);
        E(g, 6, 4 + B, 3, 2, 1);
        R(g, 4, 6 + B, 5, 1, 3);                       // あご
        P(g, 9, 2 + B, 3); P(g, 9, 6 + B, 3);
        // くちばし（左へ尖らせる。矩形だと"鼻づら"に見えるので必ず三角に）
        P(g, 3, 4 + B, 2); R(g, 2, 5 + B, 2, 1, 2); R(g, 0, 5 + B, 3, 1, 1);
        P(g, 1, 6 + B, 3); P(g, 2, 6 + B, 3);
        // 眼窩（黒い穴＋紫の光）
        R(g, 4, 3 + B, 3, 2, 5);
        P(g, 5, 3 + B, 6); P(g, 4, 4 + B, 8); P(g, 5, 4 + B, 7);
        P(g, 7, 2 + B, 1);                             // 頭頂のハイライト

        // ── 骨盤 ──
        R(g, 13, 15 + B, 4, 1, 2);

        // ── 脚（2本・legPhase で前後を入れ替える）──
        var la = legPhase, lb = 1 - legPhase;
        R(g, 12 + la, 16 + B, 1, 3, 2); R(g, 11 + la, 19, 3, 1, 3);
        R(g, 16 - lb, 16 + B, 1, 3, 3); R(g, 15 - lb, 19, 3, 1, 4);
        return g;
    }

    // 崩壊中＝骨の山。⚠「同じ骨が積まれている」と分かる形にする（頭蓋・あばら・脚が見分けられる）＝
    //   プレイヤーが「消えたのではなく崩れただけ」と理解でき、復活が理不尽に感じられない。
    //   ここも塗りつぶさず、骨と骨の間を抜くこと。
    function buildSkullyBones() {
        var g = G(22, 20), i;
        R(g, 3, 18, 16, 2, 4);                         // 影のたまり
        // 転がった頭蓋（左・横倒し）
        E(g, 6, 15, 3, 3, 2);
        E(g, 6, 15, 3, 2, 1);
        R(g, 2, 15, 4, 1, 2);                          // くちばし
        R(g, 5, 14, 2, 2, 5);                          // 眼窩
        P(g, 5, 14, 6); P(g, 6, 15, 8);
        // ばらけたあばら（互い違いに散らす＝崩れた感じ）
        for (i = 0; i < 4; i++) R(g, 10 + i * 2, 15 - (i % 2), 1, 4, (i % 2) ? 2 : 1);
        R(g, 10, 13, 7, 1, 3);                         // 背骨のかけら
        // 脚の骨（右・交差して転がる）
        R(g, 16, 16, 5, 1, 2);
        R(g, 17, 18, 4, 1, 3);
        P(g, 21, 15, 3);
        return g;
    }

    // ─── SPRITE_DATA 構築 (地形/背景のみ) ───
    window.SPRITE_DATA = {
        // シャレコ（1.563）: 歩行4コマ＋骨の山
        skully_walk:  { w: 22, h: 20, palette: 'skully',
                        frames: [buildSkully(0, 0), buildSkully(1, -1), buildSkully(1, 0), buildSkully(0, -1)] },
        skully_bones: { w: 22, h: 20, palette: 'skully', frames: [buildSkullyBones()] },
        // 地底ステージ（1.542／入場土管は1.549）
        pipe_underground:   { w: 66, h: 50, palette: 'ug_pipe', frames: [buildUndergroundPipe()] },
        terrain_cave_top:   { w: 32, h: 32, palette: 'terrain', frames: [buildCaveTop()] },
        terrain_cave_dirt:  { w: 32, h: 32, palette: 'terrain', frames: [buildCaveDirt()] },
        terrain_cave_brick: { w: 32, h: 32, palette: 'terrain', frames: [buildCaveBrick()] },
        // 地形タイル (32x32)
        terrain_grass_top:    { w: 32, h: 32, palette: 'terrain', frames: [buildGrassTop()] },
        terrain_dirt:         { w: 32, h: 32, palette: 'terrain', frames: [buildDirt()] },
        terrain_elevated_top: { w: 32, h: 32, palette: 'terrain', frames: [buildElevatedTop()] },
        terrain_quicksand:   { w: 32, h: 32, palette: 'terrain', frames: [buildQuicksandTop()] },
        terrain_ice:         { w: 32, h: 32, palette: 'cloud',   frames: [buildIceTop()] },

        // アイテム (プロシージャル)
        powerup_magnet: { w: 32, h: 32, palette: 'magnet', frames: [buildMagnet()] },

        platform_cloud:         { w: 32, h: 32, palette: 'cloud',         frames: [buildCloudPlatform()] },
        platform_cloud_desert:  { w: 32, h: 32, palette: 'cloud_desert',  frames: [buildCloudPlatform()] },
        platform_cloud_ice:     { w: 32, h: 32, palette: 'cloud_ice',     frames: [buildCloudPlatform()] },
        platform_ground: { w: 32, h: 32, palette: 'terrain', frames: [buildGroundPlatform()] },

        // 背景
        bg_cloud:    { w: 32, h: 16, palette: 'cloud', frames: [buildBgCloud()] },
        bg_mountain: { w: 64, h: 40, palette: 'terrain', frames: [buildBgMountain()] },
        bg_trees:    { w: 32, h: 48, palette: 'terrain', frames: [buildBgTrees()] }
    };

    // バイオーム用: ビルド関数群をエクスポート
    window.TERRAIN_BUILDERS = {
        buildCaveTop: buildCaveTop,
        buildCaveDirt: buildCaveDirt,
        buildCaveBrick: buildCaveBrick,
        buildGrassTop: buildGrassTop,
        buildDirt: buildDirt,
        buildElevatedTop: buildElevatedTop,
        buildQuicksandTop: buildQuicksandTop,
        buildIceTop: buildIceTop,
        buildGroundPlatform: buildGroundPlatform,
        buildBgMountain: buildBgMountain,
        buildBgTrees: buildBgTrees
    };
})();
