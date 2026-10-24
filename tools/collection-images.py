# Builds one square group shot per collection from the full-quality product photos (classic shot of each scent).
# Each bottle keeps its own real backdrop as a vertical panel; panels melt into each other at the seams.
# Re-run after swapping a bottle photo:  python3 tools/collection-images.py   (needs Pillow + numpy)
# BOX = the bottle (cap to base) in that scent's classic photo, as fractions of the photo: left, top, right, bottom.
import json, re, hashlib, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
h = open("index.html", encoding="utf-8").read()
IMG = json.loads(re.search(r"const IMG=(\{.*?\});\n", h).group(1))
img_of = {sq: k for sq, k in re.findall(r'sq:"([A-Z0-9]+)".*?img:IMG\["([^"]+)"\]', h)}
BOX = {"givenchy-gentleman-rp.jpg": (.01, 0.071, .47, 0.928), "tf-black-orchid.jpg": (.08, 0.018, .51, 0.96), "tf-ombre-leather.jpg": (.03, 0.154, .44, 0.932),
       "tf-tuscan-leather.jpg": (.04, 0.116, .47, 0.928), "u-coffee.jpg": (.08, 0.044, .43, 0.924), "u-coral.jpg": (.02, 0.067, .51, 0.887),
       "u-deziro.jpg": (.02, 0.215, .47, 0.835), "u-ferragamo.jpg": (.03, 0.062, .52, 0.934), "u-fyf.jpg": (.02, 0.208, .43, 0.92),
       "u-fyfx.jpg": (.02, 0.252, .43, 0.875), "u-green.jpg": (.01, 0.062, .505, 0.889), "u-hswx.jpg": (.05, 0.201, .43, 0.85),
       "u-iwill.jpg": (.055, 0.055, .42, 0.927), "u-jazz.jpg": (.06, 0.041, .44, 0.958), "u-kredo.jpg": (.02, 0.266, .42, 0.885),
       "u-nefs.jpg": (.015, 0.215, .40, 0.867), "u-ornoir.jpg": (.05, 0.069, .505, 0.946), "u-papilefiko.jpg": (.05, 0.268, .42, 0.89),
       "u-purple.jpg": (.02, 0.074, .50, 0.872), "u-suede.jpg": (.03, 0.23, .43, 0.87), "u-tempfluo.jpg": (.08, 0.252, .45, 0.875),
       "u-tero.jpg": (.02, 0.263, .41, 0.9), "u-tfnoir.jpg": (.02, 0.338, .57, 0.926), "u-wulong.jpg": (.04, 0.188, .445, 0.83),
       "u-wulongx.jpg": (.015, 0.242, .44, 0.917), "u-yellow.jpg": (.04, 0.064, .48, 0.852)}
B = json.load(open("bundles.json"))
S, TABLE_Y, HB = 1200, 1040, 600          # canvas, where bottles stand, target bottle height
def full(k): return re.sub(r"\.w1080\.jpg$", ".jpg", IMG[k])
def panel(k, w):
    im = Image.open(full(k)).convert("RGB"); W, H = im.size
    l, t, r, b = BOX[k]; bx0, by0, bx1, by1 = l * W, t * H, r * W, b * H; bw, bh = bx1 - bx0, by1 - by0
    s = min(HB / bh, 0.86 * w / bw)                      # canvas px per photo px
    cx = (bx0 + bx1) / 2; cw = w / s
    left = int(round(min(max(0, cx - cw / 2), W - cw)))  # stay inside the photo sideways
    top = by1 - TABLE_Y / s; bot = by1 + (S - TABLE_Y) / s
    t0, b0 = int(max(0, top)), int(min(H, bot))
    real = im.crop((left, t0, int(left + cw), b0))
    sw = w; sh_top = int(round((t0 - top) * s)); sh_real = int(round((b0 - t0) * s)); sh_bot = S - sh_top - sh_real
    real = real.resize((sw, max(1, sh_real)), Image.LANCZOS)
    out = Image.new("RGB", (sw, S))
    out.paste(real, (0, sh_top))
    a = np.asarray(out).astype(np.float32)
    if sh_top > 0:                                         # continue the wall upward: smooth, a little lighter toward the top
        row = a[sh_top:sh_top + 12].mean(0); row = np.asarray(Image.fromarray(row[None].clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(25))).astype(np.float32)[0]
        g = np.linspace(1, 0, sh_top)[:, None, None]
        a[:sh_top] = row[None] * (1 - g) + (row[None] * 0.82 + np.array([255, 250, 240]) * 0.18) * g
    if sh_bot > 0:                                         # table continues into the merlot base
        row = a[S - sh_bot - 6:S - sh_bot].mean(0)
        g = np.linspace(0, 1, sh_bot)[:, None, None]
        a[S - sh_bot:] = row[None] * (1 - g) + np.array([40, 6, 14]) * g
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))
for b in B["bundles"]:
    srcs = [img_of[s] for s in b["sq"] if s in img_of and img_of[s] in BOX]; n = len(srcs)
    stride = 0.84; w = int(S / (1 + (n - 1) * stride))
    canvas = Image.new("RGB", (S, S), (74, 14, 30))
    mask = Image.new("L", (w, S), 255); md = ImageDraw.Draw(mask); fe = int(w * 0.2)
    for x in range(fe):
        aa = int(255 * (x / fe) ** 1.4); md.line([(x, 0), (x, S)], fill=aa); md.line([(w - 1 - x, 0), (w - 1 - x, S)], fill=aa)
    ps = [panel(k, w) for k in srcs]
    xs = [int(i * w * stride) + (S - int((n - 1) * w * stride) - w) // 2 for i in range(n)]
    for p, x in zip(ps, xs): canvas.paste(p, (x, 0))
    for i, (p, x) in enumerate(zip(ps, xs)):
        if i: canvas.paste(p, (x, 0), mask)
    out = canvas
    vig = Image.new("L", (S, S), 0); ImageDraw.Draw(vig).ellipse((-S * .25, -S * .35, S * 1.25, S * 1.3), fill=255); vig = vig.filter(ImageFilter.GaussianBlur(160))
    out = Image.composite(out, Image.blend(out, Image.new("RGB", (S, S), (30, 4, 10)), 0.35), vig)
    tmp = f"/tmp/coll-{b['id']}.jpg"; out.save(tmp, quality=92, optimize=True, subsampling=0)
    hh = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:10]
    for old in [f for f in os.listdir("img") if f.startswith(f"coll-{b['id']}-")]: os.remove("img/" + old)
    dest = f"img/coll-{b['id']}-{hh}.jpg"; os.replace(tmp, dest); print(dest, os.path.getsize(dest) // 1024, "KB", n, "bottles")
art = {re.match(r"coll-(.+)-[0-9a-f]{10}\.jpg", f).group(1): "img/" + f for f in sorted(os.listdir("img")) if f.startswith("coll-")}
h2 = re.sub(r"const COLL_ART=\{.*?\};", "const COLL_ART=" + json.dumps(art, sort_keys=True) + ";", h, count=1)
open("index.html", "w", encoding="utf-8").write(h2)
