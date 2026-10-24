"""Turn Justin's square group shot into a collection's site images, with the VV stamp.

    python3 tools/coll-images.py <collection-id> <photo.jpg>

Writes img/coll-<id>-<hash>-<W>.jpg plus .w1600/.w1080/.w640 copies (replacing that
collection's old ones). The stamp is img/vv-stamp.svg, drawn top-right at the same size and
place as on every other group shot. Afterwards run tools/home-coll-images.py, paste its
COLL_ART line into index.html, and add the collection's [cap top, base, top under the stamp
corner] to COLL_FIT so the homepage frame fits its bottles.
"""
import glob, hashlib, io, os, sys
from PIL import Image, ImageOps
from playwright.sync_api import sync_playwright

CX, CY, D = 0.9226, 0.0771, 0.084   # stamp centre and diameter, fractions of the photo width
cid, src = sys.argv[1], sys.argv[2]
im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
W, H = im.size
if W != H:
    s = min(W, H); im = im.crop(((W - s) // 2, (H - s) // 2, (W + s) // 2, (H + s) // 2)); W = H = s
d = round(D * W)
svg = open("img/vv-stamp.svg").read().replace("<svg", f'<svg width="{d}" height="{d}"', 1)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": d, "height": d})
    pg.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
    png = pg.screenshot(clip={"x": 0, "y": 0, "width": d, "height": d}, omit_background=True); b.close()
stamp = Image.open(io.BytesIO(png)).convert("RGBA")
im.paste(stamp, (round(CX * W - d / 2), round(CY * W - d / 2)), stamp)
buf = io.BytesIO(); im.save(buf, "JPEG", quality=92, optimize=True)
h = hashlib.sha1(buf.getvalue()).hexdigest()[:10]
for old in glob.glob(f"img/coll-{cid}-*"):
    os.remove(old)
base = f"img/coll-{cid}-{h}-{W}"
open(base + ".jpg", "wb").write(buf.getvalue())
for w in (1600, 1080, 640):
    im.resize((w, w), Image.LANCZOS).save(f"{base}.w{w}.jpg", "JPEG", quality=85, optimize=True, progressive=True)
print(base + ".w1080.jpg")
