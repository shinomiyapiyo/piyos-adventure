# -*- coding: utf-8 -*-
"""Generate multiple boss sprite poses via PixelLab API using yaminiwa.png reference"""
import base64, json, urllib.request, os, io, time, sys

# Windows cp932 encoding fix
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API_KEY = "c4cbc488-4128-432a-b6dc-5721dcd510c4"
API_URL = "https://api.pixellab.ai/v1/generate-image-pixflux"

BASE_DESC = "dark evil giant rooster boss monster, pixel art game sprite, thick bulky body, dark purple and black feathers, bat-like demon wings, glowing red angry eyes, big red comb, purple flame aura, side view facing left, 16-bit retro game boss style"
NEG_DESC = "cute, friendly, small, thin, skinny, white background, bright colors, realistic, photo, blurry, low quality, human, girl"

POSES = [
    {
        "name": "boss_idle",
        "desc": f"A massive {BASE_DESC}, standing idle menacing pose, wings folded at sides, strong thick legs planted firmly, mouth closed, calm but threatening",
        "strength": 280,
    },
    {
        "name": "boss_walk",
        "desc": f"A massive {BASE_DESC}, walking animation, one leg stepping forward, other leg back, wings slightly bouncing, body tilted forward while walking, mid-stride movement",
        "strength": 250,
    },
    {
        "name": "boss_rush",
        "desc": f"A massive {BASE_DESC}, aggressive charging rush attack, body lunging far forward horizontally, bat-like wings fully spread wide open to both sides, beak wide open screaming, legs stretched behind, intense forward momentum, speed lines",
        "strength": 150,
    },
    {
        "name": "boss_jump",
        "desc": f"A massive {BASE_DESC}, high in the air jumping, bat wings fully extended upward above body, both legs pulled up tucked under round body, airborne with no ground contact, floating in mid-air, purple energy below",
        "strength": 120,
    },
    {
        "name": "boss_summon",
        "desc": f"A massive {BASE_DESC}, head raised straight up screaming to sky, neck stretched upward, beak pointed up wide open, bat wings spread open at sides, purple magic circle energy radiating outward, summoning ritual pose",
        "strength": 150,
    },
    {
        "name": "boss_damaged",
        "desc": f"A massive {BASE_DESC}, taking heavy damage hit, body knocked backward tilting right, wings crumpled inward defensively, head recoiling back, eyes shut in pain, feathers scattered, impact flash effect",
        "strength": 150,
    },
    {
        "name": "boss_flame",
        "desc": f"A massive {BASE_DESC}, breathing huge dark purple fire breath forward, beak wide open with massive dark flames shooting out horizontally to the left, wings pulled back, intense dark fire blast stream from mouth, powerful breath attack",
        "strength": 130,
    },
]

def load_image_b64(path, resize=None):
    if resize:
        from PIL import Image
        img = Image.open(path).convert("RGBA")
        img = img.resize(resize, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")

def generate(description, init_image_b64, output_path, strength=300, guidance=10.0):
    payload = {
        "description": description,
        "negative_description": NEG_DESC,
        "image_size": {"width": 128, "height": 128},
        "no_background": True,
        "init_image": {"base64": init_image_b64},
        "init_image_strength": strength,
        "view": "side",
        "text_guidance_scale": guidance
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")

    print(f"  Sending request ({len(data)} bytes)...")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        img_b64 = None
        if "image" in result:
            img_val = result["image"]
            if isinstance(img_val, str):
                img_b64 = img_val
            elif isinstance(img_val, dict) and "base64" in img_val:
                img_b64 = img_val["base64"]

        if img_b64:
            img_data = base64.b64decode(img_b64)
            with open(output_path, "wb") as f:
                f.write(img_data)
            cost = result.get("usage", {}).get("usd", "?")
            print(f"  OK - Saved {os.path.basename(output_path)} ({len(img_data)} bytes, ${cost})")
            return img_b64
        else:
            print(f"  FAIL - Could not extract image")
            print(json.dumps(result, indent=2, default=str)[:500])
            return None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  FAIL - HTTP {e.code}: {body[:300]}")
        return None
    except Exception as e:
        print(f"  FAIL - Error: {type(e).__name__}: {e}")
        return None

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    img_dir = os.path.join(base_dir, "images")
    ref_path = os.path.join(img_dir, "yaminiwa.png")

    print("Loading reference image (yaminiwa.png)...")
    ref_b64 = load_image_b64(ref_path, resize=(128, 128))
    print(f"Reference: {len(ref_b64)} chars base64\n")

    idle_b64 = None
    results = {}

    for i, pose in enumerate(POSES):
        name = pose["name"]
        out_path = os.path.join(img_dir, f"{name}.png")
        print(f"[{i+1}/{len(POSES)}] Generating {name}...")

        # idle result is used as init_image for subsequent poses (consistency)
        init_b64 = idle_b64 if (idle_b64 and i > 0) else ref_b64
        strength = pose["strength"]

        result_b64 = generate(
            pose["desc"],
            init_b64,
            out_path,
            strength=strength,
            guidance=10.0
        )

        if result_b64:
            results[name] = True
            if name == "boss_idle":
                idle_b64 = result_b64
        else:
            results[name] = False

        # Rate limit
        if i < len(POSES) - 1:
            time.sleep(2)

    print(f"\n=== Results ===")
    for name, ok in results.items():
        status = "OK" if ok else "FAIL"
        print(f"  [{status}] {name}.png")
    print(f"\nTotal: {sum(results.values())}/{len(results)} succeeded")
