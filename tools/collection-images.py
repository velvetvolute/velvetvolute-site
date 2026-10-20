# Builds one square group-shot per special collection from the product photos in index.html.
# Re-run after swapping a bottle photo:  python3 tools/collection-images.py   (needs Pillow)
# Output: img/coll-<collection id>-<hash>.jpg, picked up automatically by build.mjs.
import json, re, hashlib, os
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
h = open("index.html", encoding="utf-8").read()
IMG = json.loads(re.search(r"const IMG=(\{.*?\});\n", h).group(1))
img_of = {sq: k for sq, k in re.findall(r'sq:"([A-Z0-9]+)".*?img:IMG\["([^"]+)"\]', h)}
# Bottle centre (x), table line (y) and zoom (bottle size vs. the original shot) in the 1000 px Classic photo, for photos framed differently
# from the default (bottle centred at x=300, standing at y=830). Re-measure if one of these photos changes.
CROP = {"givenchy-gentleman-rp.jpg": (280, 815, 1.0), "u-coffee.jpg": (243, 815, 1.014), "u-ferragamo.jpg": (288, 815, 1.007),
        "u-iwill.jpg": (255, 815, 1.094), "u-jazz.jpg": (247, 815, 1.014), "u-lanuit.jpg": (293, 815, 1.12),
        "u-zoltan.jpg": (267, 815, 1.111), "u-najim.jpg": (294, 815, 0.958), "u-althair.jpg": (268, 815, 0.823),
        "mfk-br540.jpg": (247, 815, 0.972), "u-pmatin.jpg": (239, 815, 1.045), "u-lemale.jpg": (269, 815, 0.866),
        "u-nefs.jpg": (278, 815, 0.935), "u-hswx.jpg": (290, 815, 1.014), "u-fyfx.jpg": (247, 815, 1.078),
        "u-wulong.jpg": (276, 815, 0.959)}
B = json.load(open("bundles.json"))
S, TABLE_Y = 1200, 1060
lerp = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
for b in B["bundles"]:
    srcs = [img_of[s] for s in b["sq"] if s in img_of]; n = len(srcs)
    crops = []
    for k in srcs:
        im = Image.open(IMG[k]).convert("RGB")
        if im.size != (1000, 1000): im = im.resize((1000, 1000))
        cx, ty, z = CROP.get(k, (300, 830, 1))
        pad = Image.new("RGB", (1600, 1600)); pad.paste(im, (300, 300))
        for y in range(300): pad.paste(im.crop((0, 0, 1000, 1)), (300, y))          # extend the wall upward
        box = (cx - 200 * z + 300, ty - 830 * z + 300, cx + 200 * z + 300, ty + 110 * z + 300)
        crops.append(pad.crop(tuple(int(round(b)) for b in box)).resize((400, 940), Image.LANCZOS))           # bottle + the full backdrop above it; table at y≈830 of 940 (400 px wide: bottles read 20% larger)
    stride = 0.82
    w = int(S / (1 + (n - 1) * stride)); scale = w / 400; hgt = int(940 * scale); base = int(830 * scale)
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
# index.html keeps a COLL_ART map (home-page collection cards) pointing at the current files
art = {re.match(r"coll-(.+)-[0-9a-f]{10}\.jpg", f).group(1): "img/" + f for f in sorted(os.listdir("img")) if f.startswith("coll-")}
h2 = re.sub(r"const COLL_ART=\{.*?\};", "const COLL_ART=" + json.dumps(art, sort_keys=True) + ";", h, count=1)
open("index.html", "w", encoding="utf-8").write(h2)
