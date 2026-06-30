"""PixelLab API background generator for Piyo Adventure title shop"""
import json, base64, urllib.request, urllib.error, time, os, io
from PIL import Image

API_KEY = "c4cbc488-4128-432a-b6dc-5721dcd510c4"
BASE_URL = "https://api.pixellab.ai/v1"
IMAGES_DIR = "D:/piyo-adventure/images"

# Generation size (pixflux max 400px per dimension)
GEN_W = 400
GEN_H = 267
# Final output size
OUT_W = 480
OUT_H = 320

def load_and_resize_b64(path, width, height):
    """Load image, resize it, return base64 PNG string"""
    img = Image.open(path)
    img = img.convert("RGB")
    img = img.resize((width, height), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def generate_background(description, output_path, init_image_b64=None, init_strength=300):
    """Generate a background image using PixelLab pixflux"""
    url = BASE_URL + "/generate-image-pixflux"
    headers = {
        "Authorization": "Bearer " + API_KEY,
        "Content-Type": "application/json"
    }
    params = {
        "description": description,
        "image_size": {"width": GEN_W, "height": GEN_H},
        "no_background": False,
        "outline": "selective outline",
        "shading": "detailed shading",
        "detail": "highly detailed",
        "text_guidance_scale": 8
    }
    if init_image_b64:
        params["init_image"] = {"type": "base64", "base64": init_image_b64}
        params["init_image_strength"] = init_strength

    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))
            img_b64 = result["image"]["base64"]
            img_bytes = base64.b64decode(img_b64)

            # Resize to final output size and save as JPEG
            img = Image.open(io.BytesIO(img_bytes))
            img = img.convert("RGB")
            img = img.resize((OUT_W, OUT_H), Image.LANCZOS)
            img.save(output_path, "JPEG", quality=85)
            file_size = os.path.getsize(output_path)

            cost = result.get("usage", {}).get("usd", 0)
            print("  OK (480x320 JPEG): " + os.path.basename(output_path) + " (" + str(file_size) + " bytes, $" + str(cost) + ")")
            return True
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        print("  FAIL [HTTP " + str(e.code) + "]: " + err[:300])
        return False
    except Exception as e:
        print("  FAIL: " + str(e))
        return False

# Title Shop Backgrounds (5 variations)
BACKGROUNDS = [
    ("title_shop01.jpg",
     "Pixel art anime style interior of a cozy wooden magic item shop with warm lantern lighting. A witch shopkeeper with brown hair wearing a large blue star-patterned hat and blue robe stands behind a wooden counter smiling warmly welcoming a customer. A small chibi girl with long black hair cat ears yellow ribbon and yellow frilly dress with black trim stands in front of the counter. Shelves filled with colorful potions scrolls and magical items line the walls. Peaceful warm atmosphere",
     350),
    ("title_shop02.jpg",
     "Pixel art anime style interior of a cozy wooden magic item shop with bright warm lighting. A witch shopkeeper with brown hair and blue star hat happily holding out a magical item with both hands presenting it. A small chibi girl with long black hair cat ears and yellow frilly dress jumping with joy arms raised excited to receive the item. Sparkle effects around the item. Cheerful bright happy atmosphere",
     300),
    ("title_shop03.jpg",
     "Pixel art anime style interior of a cozy wooden magic item shop. A witch shopkeeper with brown hair and blue star hat winking one eye with a playful smile giving a thumbs up. A small chibi girl with long black hair cat ears and yellow frilly dress closely examining a glowing item she just received with curious wide eyes. Warm cozy atmosphere with magical sparkles",
     300),
    ("title_shop04.jpg",
     "Pixel art anime style interior of a wooden magic item shop with dim slightly dark lighting. A witch shopkeeper with brown hair and blue star hat looking worried with a troubled apologetic expression hands together. A small chibi girl with long black hair cat ears and yellow frilly dress looking down sadly at an empty coin purse in her hands. Somber subdued atmosphere darker tones",
     300),
    ("title_shop05.jpg",
     "Pixel art anime style interior of a wooden magic item shop doorway view. A witch shopkeeper with brown hair and blue star hat waving goodbye hand raised from behind the counter with a friendly smile. A small chibi girl with long black hair cat ears and yellow frilly dress walking toward the open door looking back and waving. Warm farewell sunset light coming through the door",
     300),
]

def main():
    # Load and resize reference image to generation size
    ref_path = IMAGES_DIR + "/title_shop.jpg"
    print("Loading and resizing reference: " + ref_path + " -> " + str(GEN_W) + "x" + str(GEN_H))
    ref_b64 = load_and_resize_b64(ref_path, GEN_W, GEN_H)
    print("Reference ready: " + str(len(ref_b64)) + " chars")
    print()

    total = len(BACKGROUNDS)
    success = 0

    print("=" * 50)
    print("Category A: Title Shop Backgrounds (5 images)")
    print("=" * 50)
    for i, (filename, desc, strength) in enumerate(BACKGROUNDS):
        path = IMAGES_DIR + "/" + filename
        print("[" + str(i + 1) + "/" + str(total) + "] Generating " + filename + "...")
        if generate_background(desc, path, init_image_b64=ref_b64, init_strength=strength):
            success += 1
        else:
            # Retry without init_image if it fails
            print("  Retrying without init_image...")
            if generate_background(desc, path):
                success += 1
        time.sleep(1)

    print()
    print("=" * 50)
    print("DONE: " + str(success) + "/" + str(total) + " backgrounds generated")
    print("=" * 50)

    # Clean up test file if exists
    test_path = IMAGES_DIR + "/title_shop_test.png"
    if os.path.exists(test_path):
        os.remove(test_path)
        print("Cleaned up test file")

if __name__ == "__main__":
    main()
