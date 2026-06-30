"""Create boss sprites from the reference image niwatorimihon.png"""
from PIL import Image, ImageEnhance, ImageFilter
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
img_dir = os.path.join(base_dir, "images")

def find_content_bbox(img):
    """Find bounding box of non-transparent content"""
    pixels = img.load()
    w, h = img.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if pixels[x, y][3] > 10:  # Non-transparent
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    return (min_x, min_y, max_x + 1, max_y + 1)

def clean_background(img, threshold=240):
    """Remove near-white background pixels"""
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 10:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            # Remove near-white pixels
            if r > threshold and g > threshold and b > threshold:
                pixels[x, y] = (0, 0, 0, 0)
            # Remove very light gray near edges
            elif r > 200 and g > 200 and b > 200 and a < 200:
                pixels[x, y] = (0, 0, 0, 0)
    return img

def create_boss_idle(ref_path, output_path):
    """Create 128x128 boss idle sprite from reference"""
    img = Image.open(ref_path).convert("RGBA")

    # Clean background
    img = clean_background(img)

    # Crop to content
    bbox = find_content_bbox(img)
    print(f"  Content bbox: {bbox}")
    cropped = img.crop(bbox)
    cw, ch = cropped.size
    print(f"  Cropped size: {cw}x{ch}")

    # Make square by padding the shorter dimension
    max_dim = max(cw, ch)
    square = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))
    paste_x = (max_dim - cw) // 2
    paste_y = max_dim - ch  # Align to bottom so feet are at bottom
    square.paste(cropped, (paste_x, paste_y), cropped)

    # Resize to 128x128 with high quality
    result = square.resize((128, 128), Image.LANCZOS)

    # Slight contrast enhancement
    r, g, b, a = result.split()
    rgb = Image.merge("RGB", (r, g, b))
    enhancer = ImageEnhance.Contrast(rgb)
    rgb = enhancer.enhance(1.1)
    r2, g2, b2 = rgb.split()
    result = Image.merge("RGBA", (r2, g2, b2, a))

    result.save(output_path)
    print(f"  Saved idle: {output_path}")
    return result

def create_boss_attack(idle_img, output_path):
    """Create attack variant from idle sprite - slight lean forward, redder tint"""
    img = idle_img.copy()
    w, h = img.size

    # Create a slightly modified version for attack:
    # 1. Slight horizontal shear (lean forward)
    # 2. Redder/more intense coloring
    # 3. Slightly larger (more threatening)

    # Apply a subtle red/anger tint
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a > 10:
                # Boost reds, reduce blues slightly for angry look
                r = min(255, int(r * 1.15 + 15))
                g = max(0, int(g * 0.9))
                b = max(0, int(b * 0.85))
                pixels[x, y] = (r, g, b, a)

    # Scale up slightly (105%) to look bigger/more threatening
    bigger = img.resize((int(w * 1.08), int(h * 1.05)), Image.LANCZOS)

    # Paste back centered, cropped to 128x128
    result = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    bw, bh = bigger.size
    px = (128 - bw) // 2
    py = 128 - bh  # Align to bottom
    result.paste(bigger, (px, py), bigger)

    # Crop to 128x128
    result = result.crop((0, 0, 128, 128))

    result.save(output_path)
    print(f"  Saved attack: {output_path}")

# Main
ref_path = os.path.join(img_dir, "niwatorimihon.png")
idle_path = os.path.join(img_dir, "boss_idle.png")
attack_path = os.path.join(img_dir, "boss_attack.png")

print("Creating boss idle sprite from reference...")
idle_img = create_boss_idle(ref_path, idle_path)

print("Creating boss attack sprite variant...")
create_boss_attack(idle_img, attack_path)

print("\nDone! Boss sprites created from reference image.")
