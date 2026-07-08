// 画像最適化ツール（v1.435: 重量級アセットの削減）
// - PNG(透過あり): リサイズ + パレット化(libimagequant)
// - 不透明PNGの一枚絵: JPEG(mozjpeg)へ変換
// 使い方: cd tools && node optimize-images.mjs
import sharp from 'sharp';
import { statSync } from 'fs';

const kb = p => Math.round(statSync(p).size / 1024) + 'KB';
const jobs = [
    // ロゴ: 1536→1024幅(表示38vw・2xタブレットでも十分) + 256色パレット
    { in: '../images/logo.png', out: '../images/logo.png',
      run: s => s.resize({ width: 1024 }).png({ palette: true, quality: 90, effort: 10 }) },
    // ショップ建物: 描画180x131の2倍=360幅で十分（元700x508）
    { in: '../images/shop.png', out: '../images/shop.png',
      run: s => s.resize({ width: 360 }).png({ palette: true, quality: 90, effort: 10 }) },
    // PWAアイコン: 寸法維持でパレット化
    { in: '../images/icon-512.png', out: '../images/icon-512.png',
      run: s => s.png({ palette: true, quality: 90, effort: 10 }) },
    // 不透明の一枚絵PNG → JPEG化（寸法維持）
    { in: '../images/shortcake_scene.png', out: '../images/shortcake_scene.jpg',
      run: s => s.jpeg({ quality: 85, mozjpeg: true }) },
    { in: '../images/tutorial_clear.png', out: '../images/tutorial_clear.jpg',
      run: s => s.jpeg({ quality: 85, mozjpeg: true }) },
    { in: '../images/soba_shop_scene.png', out: '../images/soba_shop_scene.jpg',
      run: s => s.jpeg({ quality: 85, mozjpeg: true }) },
    // タイトルショップ背景: 再圧縮のみ
    { in: '../tools/_raw/originals-v1435/title_shop.jpg', out: '../images/title_shop.jpg',
      run: s => s.jpeg({ quality: 82, mozjpeg: true }) },
];
for (const j of jobs) {
    const before = kb(j.in);
    const buf = await j.run(sharp(j.in)).toBuffer();
    const { writeFileSync } = await import('fs');
    writeFileSync(j.out, buf);
    console.log(`${j.in.replace('../','')} ${before} -> ${j.out.replace('../','')} ${kb(j.out)}`);
}
