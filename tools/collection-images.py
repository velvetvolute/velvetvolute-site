# Builds one square group-shot per special collection from the product photos in index.html.
# Re-run after swapping a bottle photo:  python3 tools/collection-images.py   (needs Pillow)
# Output: img/coll-<collection id>-<hash>.jpg, picked up automatically by build.mjs.
import json, re, hashlib, os
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
h = open("index.html", encoding="utf-8").read()
IMG = json.loads(re.search(r"const IMG=(\{.*?\});\n", h).group(1))
img_of = {sq: IMG[k] for sq, k in re.findall(r'sq:"([A-Z0-9]+)".*?img:IMG\["([^"]+)"\]', h)}
B = json.load(open("bundles.json"))
S, TABLE_Y = 1200, 1000
lerp = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
for b in B["bundles"]:
    srcs = [img_of[s] for s in b["sq"] if s in img_of]; n = len(srcs)
    crops = []
    for f in srcs:
        im = Image.open(f).convert("RGB")
        if im.size != (1000, 1000): im = im.resize((1000, 1000))
        crops.append(im.crop((60, 120, 540, 940)))          # bottle + its backdrop; table at y≈710 of 820
    stride = 0.82
    w = int(S / (1 + (n - 1) * stride)); scale = w / 480; hgt = int(820 * scale); base = int(710 * scale)
    top = TABLE_Y - base
    canvas = Image.new("RGB", (S, S), (74, 14, 30))
    # feathered side edges so neighbouring backdrops melt into each other
    mask = Image.new("L", (w, hgt), 255); md = ImageDraw.Draw(mask); fe = int(w * 0.22)
    for x in range(fe):
        a = int(255 * (x / fe) ** 1.4); md.line([(x, 0), (x, hgt)], fill=a); md.line([(w - 1 - x, 0), (w - 1 - x, hgt)], fill=a)
    sized = [c.resize((w, hgt), Image.LANCZOS) for c in crops]
    for i, c in enumerate(sized): canvas.paste(c, (int(i * w * stride), top))          # hard pass: no gaps
    for i, c in enumerate(sized): canvas.paste(c, (int(i * w * stride), top), mask)    # soft pass: melt the seams
    # continue each column's backdrop upward from the row's top edge, lightening toward the top (as in the photos)
    px = canvas.load(); row = [px[x, top + 3] for x in range(S)]
    for x in range(S):
        c = row[x]; light = lerp(c, (255, 250, 240), 0.18)
        for y in range(top + 3):
            px[x, y] = lerp(c, light, (top - y) / top)
    # table: continue the merlot table across the full width below the bottles
    for y in range(TABLE_Y + int(60 * scale), S):
        t = (y - TABLE_Y) / (S - TABLE_Y)
        for x in range(S): px[x, y] = lerp(px[x, y], lerp((74, 14, 30), (40, 6, 14), t), min(1, t * 1.6))
    out = canvas.filter(ImageFilter.GaussianBlur(0.6))
    out = ImageEnhance.Color(out).enhance(0.92)
    out = Image.blend(out, Image.new("RGB", (S, S), (160, 123, 82)), 0.05)
    vig = Image.new("L", (S, S), 0); ImageDraw.Draw(vig).ellipse((-S * .25, -S * .35, S * 1.25, S * 1.3), fill=255); vig = vig.filter(ImageFilter.GaussianBlur(160))
    out = Image.composite(out, Image.blend(out, Image.new("RGB", (S, S), (30, 4, 10)), 0.4), vig)
    tmp = f"/tmp/coll-{b['id']}.jpg"; out.save(tmp, quality=86, optimize=True)
    hh = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:10]
    for old in [f for f in os.listdir("img") if f.startswith(f"coll-{b['id']}-")]: os.remove("img/" + old)
    dest = f"img/coll-{b['id']}-{hh}.jpg"; os.replace(tmp, dest); print(dest, os.path.getsize(dest) // 1024, "KB", n, "bottles")
