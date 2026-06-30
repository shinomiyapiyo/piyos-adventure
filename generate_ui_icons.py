import requests, base64, os, time, sys
sys.stdout.reconfigure(encoding='utf-8')

API_KEY = 'c4cbc488-4128-432a-b6dc-5721dcd510c4'
URL = 'https://api.pixellab.ai/v1/generate-image-pixflux'
OUT_DIR = r'D:\piyo-adventure\images'

icons = [
    # HUD icons
    ('icon_distance.png', 'a small yellow measuring ruler icon, distance meter, pixel art, bright'),
    ('icon_money.png', 'a small shiny gold yen coin with yen symbol, money icon, pixel art, bright'),
    ('icon_lives.png', 'a bright red heart icon, health life, pixel art, cute, shiny'),
    ('icon_kills.png', 'a small angry red demon oni face icon, enemy monster, pixel art'),
    ('icon_level.png', 'a bright yellow lightning bolt icon, electric, power level, pixel art'),
    ('icon_progress.png', 'a small green upward arrow with sparkle, level up progress, pixel art'),
    # Title/Nav button icons
    ('icon_settings.png', 'a silver metallic gear cog icon, settings, pixel art, shiny'),
    ('icon_trophy.png', 'a shiny golden trophy cup icon with star, ranking award, pixel art'),
    ('icon_cart.png', 'a small blue shopping cart icon, shop, pixel art, cute'),
    ('icon_pause.png', 'two white vertical pause bars icon on dark background, pause button, pixel art'),
    ('icon_play.png', 'a white right-pointing triangle play button icon, resume, pixel art'),
    ('icon_flag.png', 'a small white flag icon on a brown pole, surrender retire, pixel art'),
    ('icon_back.png', 'a white left arrow icon in a blue circle, back return, pixel art'),
    ('icon_home.png', 'a small cute house icon with red roof, home title, pixel art'),
    ('icon_retry.png', 'two green circular arrows icon, refresh retry reload, pixel art'),
    ('icon_skull.png', 'a white skull icon, game over death, pixel art, cute style'),
    ('icon_register.png', 'a small pencil writing on paper icon, submit register, pixel art'),
    ('icon_skip.png', 'a double right arrow fast forward icon, skip, pixel art, white'),
    # Shop icons
    ('icon_bank.png', 'a small blue piggy bank icon with gold coin, savings deposit, pixel art'),
    ('icon_door.png', 'a small brown wooden door icon, exit leave, pixel art'),
    ('icon_speedup.png', 'a small red rocket icon with flame trail, speed boost, pixel art'),
    # Misc UI icons
    ('icon_warning.png', 'a yellow warning triangle icon with exclamation mark, alert danger, pixel art'),
    ('icon_sound.png', 'a blue speaker icon with sound waves, audio volume, pixel art'),
    ('icon_lock.png', 'a small golden padlock icon, privacy security, pixel art'),
    ('icon_celebrate.png', 'a colorful party popper icon with confetti, celebration, pixel art'),
]

headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {API_KEY}'}
success = 0
fail = 0

for filename, desc in icons:
    out_path = os.path.join(OUT_DIR, filename)
    if os.path.exists(out_path):
        print(f"  SKIP (exists): {filename}")
        success += 1
        continue
    print(f"Generating {filename}...")
    payload = {
        'description': desc,
        'image_size': {'width': 32, 'height': 32},
        'no_background': True,
        'outline': 'single color black outline',
        'shading': 'flat shading',
        'detail': 'low detail',
        'text_guidance_scale': 8
    }
    try:
        resp = requests.post(URL, json=payload, headers=headers, timeout=60)
        if resp.status_code == 200:
            data = resp.json()
            img_b64 = data['image']['base64']
            with open(out_path, 'wb') as f:
                f.write(base64.b64decode(img_b64))
            print(f"  OK: {filename}")
            success += 1
        else:
            print(f"  ERROR {resp.status_code}: {resp.text[:200]}")
            fail += 1
    except Exception as e:
        print(f"  EXCEPTION: {e}")
        fail += 1
    time.sleep(0.3)

print(f"\nDone! Success: {success}, Failed: {fail}")
