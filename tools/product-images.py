"""Turn Justin's three product shots for one scent into site images, with the VV stamp.

    python3 tools/product-images.py <key> <classic.jpg> <luxury.jpg> <rollon.jpg>

<key> is the short name used in index.html's IMG / IMG_L / IMG_R maps (e.g. "kalan" -> "u-kalan.jpg").
Writes img/u-<key>-…, img/lux-u-<key>-…, img/roll-u-<key>-… at full size plus .w1600/.w1080/.w640,
with the stamp (img/vv-stamp.svg) top-right at the same size and place as every other product photo,
and prints the three map entries to paste into index.html.
"""
import glob, hashlib, io, os, sys
from PIL import Image, ImageOps
from playwright.sync_api import sync_playwright

CX, CY, D = 0.9226, 0.0771, 0.084   # stamp centre and diameter, fractions of the photo width
key, shots = sys.argv[1], dict(zip(("u", "lux-u", "roll-u"), sys.argv[2:5]))
svg_src = open("img/vv-stamp.svg").read()

def stamp_png(d):
    svg = svg_src.replace("<svg", f'<svg width="{d}" height="{d}"', 1)
    pg.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
    return Image.open(io.BytesIO(pg.screenshot(clip={"x": 0, "y": 0, "width": d, "height": d}, omit_background=True))).convert("RGBA")

out = {}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 400, "height": 400})
    for prefix, src in shots.items():
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        W, H = im.size
        if W != H:
            s = min(W, H); im = im.crop(((W - s) // 2, (H - s) // 2, (W + s) // 2, (H + s) // 2)); W = H = s
        d = round(D * W); st = stamp_png(d)
        im.paste(st, (round(CX * W - d / 2), round(CY * W - d / 2)), st)
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=92, optimize=True)
        h = hashlib.sha1(buf.getvalue()).hexdigest()[:10]
        for old in glob.glob(f"img/{prefix}-{key}-*"):
            os.remove(old)
        base = f"img/{prefix}-{key}-{h}-{W}"
        open(base + ".jpg", "wb").write(buf.getvalue())
        for w in (1600, 1080, 640):
            im.resize((w, w), Image.LANCZOS).save(f"{base}.w{w}.jpg", "JPEG", quality=85, optimize=True, progressive=True)
        out[prefix] = base + ".w1080.jpg"
    b.close()
for prefix, m in (("u", "IMG"), ("lux-u", "IMG_L"), ("roll-u", "IMG_R")):
    print(f'{m}: "u-{key}.jpg":"{out[prefix]}"')
