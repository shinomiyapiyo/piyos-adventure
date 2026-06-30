"""PixelLab API icon generator for Piyo Adventure"""
import json, base64, urllib.request, urllib.error, time, sys, os

API_KEY = "c4cbc488-4128-432a-b6dc-5721dcd510c4"
BASE_URL = "https://api.pixellab.ai/v1"
IMAGES_DIR = "D:/piyo-adventure/images"

def generate_pixflux(description, width, height, output_path, no_bg=True,
                     outline="single color black outline", shading="flat shading",
                     detail="medium detail", init_image_b64=None, init_strength=300):
    """Generate an image using PixelLab pixflux endpoint"""
    url = BASE_URL + "/generate-image-pixflux"
    headers = {
        "Authorization": "Bearer " + API_KEY,
        "Content-Type": "application/json"
    }
    params = {
        "description": description,
        "image_size": {"width": width, "height": height},
        "no_background": no_bg,
        "outline": outline,
        "shading": shading,
        "detail": detail,
        "text_guidance_scale": 10
    }
    if init_image_b64:
        params["init_image"] = {"type": "base64", "base64": init_image_b64}
        params["init_image_strength"] = init_strength

    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
            img_b64 = result["image"]["base64"]
            img_bytes = base64.b64decode(img_b64)
            with open(output_path, "wb") as f:
                f.write(img_bytes)
            cost = result.get("usage", {}).get("usd", 0)
            print("  OK: " + os.path.basename(output_path) + " (" + str(len(img_bytes)) + " bytes, $" + str(cost) + ")")
            return True
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        print("  FAIL [HTTP " + str(e.code) + "]: " + err[:200])
        return False
    except Exception as e:
        print("  FAIL: " + str(e))
        return False

# =============================================================
# Category B: Title Shop Skill Icons (32x32, transparent PNG)
# =============================================================
CATEGORY_B = [
    ("icon_coin_master.png",
     "A pile of golden shiny coins stacked together with sparkle star effects around them, treasure, gold, pixel art game icon"),
    ("icon_toughness.png",
     "A red heart with golden metallic border and a small shield emblem overlaid, defense health, pixel art game icon"),
    ("icon_stock_expand.png",
     "A brown leather backpack pouch with the flap open showing colorful items peeking out, inventory bag, pixel art game icon"),
    ("icon_lucky_star.png",
     "A large golden star radiating bright yellow light with small sparkle particles scattered around, lucky charm, pixel art game icon"),
    ("icon_swift_dash.png",
     "Blue running boots with cyan wind speed lines trailing behind, fast movement, pixel art game icon"),
    ("icon_treasure_hunter.png",
     "An open wooden treasure chest overflowing with gold coins and gems, adventure loot, pixel art game icon"),
    ("icon_second_wind.png",
     "A pair of glowing white angel wings with soft holy light aura, revival resurrection, pixel art game icon"),
    ("icon_fever_boost.png",
     "A burning letter F made of red and orange fire flames, fever mode power, pixel art game icon"),
]

# =============================================================
# Category C: Stage Shop Item Icons (32x32, transparent PNG)
# =============================================================
CATEGORY_C = [
    ("icon_heal.png",
     "A glass flask bottle filled with red bubbling healing potion liquid, medicine, pixel art game icon"),
    ("icon_heal_stock.png",
     "A white first aid kit box with a red cross medical symbol on the front, health supply, pixel art game icon"),
    ("icon_barrier.png",
     "A blue glowing magical shield with a star crest emblem in the center, barrier protection, pixel art game icon"),
    ("icon_lemon_special.png",
     "A bright shining whole lemon fruit with juice splash sparkle effects, fresh citrus, pixel art game icon"),
    ("icon_full_charge.png",
     "A large rainbow colored star with power wave energy radiating outward, maximum power, pixel art game icon"),
    ("icon_revive_potion.png",
     "A purple magical potion bottle with swirling mystic energy effects inside, revival elixir, pixel art game icon"),
]

def main():
    total = 0
    success = 0

    print("=" * 50)
    print("Category B: Title Shop Skill Icons (8 icons)")
    print("=" * 50)
    for filename, desc in CATEGORY_B:
        total += 1
        path = IMAGES_DIR + "/" + filename
        print("[" + str(total) + "] Generating " + filename + "...")
        if generate_pixflux(desc, 32, 32, path):
            success += 1
        time.sleep(0.5)  # Rate limit courtesy

    print()
    print("=" * 50)
    print("Category C: Stage Shop Item Icons (6 icons)")
    print("=" * 50)
    for filename, desc in CATEGORY_C:
        total += 1
        path = IMAGES_DIR + "/" + filename
        print("[" + str(total) + "] Generating " + filename + "...")
        if generate_pixflux(desc, 32, 32, path):
            success += 1
        time.sleep(0.5)

    print()
    print("=" * 50)
    print("DONE: " + str(success) + "/" + str(total) + " icons generated")
    print("=" * 50)

if __name__ == "__main__":
    main()
