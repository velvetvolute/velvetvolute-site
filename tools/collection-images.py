# Builds one square group shot per collection from the full-quality product photos (classic shot of each scent).
# Every bottle is cut out of its own photo and stood on one table line; the backdrops behind them glow into each other.
# Masks: tools/coll-masks/m_<photo>.png (re-make with tools/coll-masks/make-masks.py after changing a photo or its BOX).
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
import cv2
S, TABLE_Y, HB = 1200, 1000, 640            # canvas, where every bottle stands, tallest bottle height
def full(k): return re.sub(r"\.w1080\.jpg$", ".jpg", IMG[k])
def render(k, s, cx_c):
    """the whole photo mapped onto the canvas: bottle centred at cx_c, its base on TABLE_Y, scale s (canvas px per photo px)"""
    im = cv2.imread(full(k)); H, W = im.shape[:2]
    l, t, r, b = BOX[k]; cx, by1 = (l + r) / 2 * W, b * H
    M = np.float32([[s, 0, cx_c - cx * s], [0, s, TABLE_Y - by1 * s]])
    out = cv2.warpAffine(im, M, (S, S), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    top = int(round(TABLE_Y - by1 * s))                      # canvas row of the photo's top edge
    if top > 0:                                              # above the photo: a smooth, slightly lighter wall
        row = cv2.GaussianBlur(out[top:top + 1], (0, 0), 40)[0]
        g = np.linspace(1, 0, top)[:, None, None]
        out[:top] = row[None] * (1 - g * .5) + (row[None] * .8 + np.array([240, 248, 255]) * .2) * (g * .5)
    bot = int(round(TABLE_Y + (H - by1) * s))
    if bot < S:                                              # below the photo: the table fades into merlot
        row = cv2.GaussianBlur(out[bot - 1:bot], (0, 0), 40)[0]
        g = np.linspace(0, 1, S - bot)[:, None, None]
        out[bot:] = row[None] * (1 - g) + np.array([14, 6, 40]) * g
    m = cv2.imread(f"tools/coll-masks/m_{k[:-4]}.png", 0)
    m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)
    m = cv2.warpAffine(m, M, (S, S), flags=cv2.INTER_LINEAR, borderValue=0).astype(np.float32) / 255
    m = cv2.GaussianBlur(cv2.dilate(m, np.ones((3, 3), np.uint8)), (0, 0), 1.2)
    return out, m
for b in B["bundles"]:
    srcs = [img_of[s] for s in b["sq"] if s in img_of and img_of[s] in BOX]; n = len(srcs)
    dims = []
    for k in srcs:
        im = cv2.imread(full(k)); H, W = im.shape[:2]; l, t, r, bb = BOX[k]
        dims.append(((r - l) * W, (bb - t) * H))
    # every bottle the same height, packed side by side with an even gap, the row centred
    gap = S * 0.035; ratios = [bw / bh for bw, bh in dims]
    Ht = min(HB, (S * 0.9 - gap * (n - 1)) / sum(ratios))
    widths = [Ht * q for q in ratios]; x = (S - sum(widths) - gap * (n - 1)) / 2; xs = []
    for w_ in widths: xs.append(x + w_ / 2); x += w_ + gap
    layers = [render(k, Ht / bh, xc) for k, (bw, bh), xc in zip(srcs, dims, xs)]
    X = np.arange(S, dtype=np.float32); sig = max(widths) * 0.55
    wts = [np.exp(-0.5 * ((X - xc) / sig) ** 2) for xc in xs]
    tot = np.sum(wts, axis=0) + 1e-6
    bg = sum(L[0] * (w / tot)[None, :, None] for L, w in zip(layers, wts))
    bg = cv2.GaussianBlur(bg, (0, 0), 14)                    # a soft, glowing blend of every bottle's own backdrop
    out = bg.copy()
    for (img, m) in layers:                                   # a soft reflection of each bottle in the glossy table
        rr = np.flipud(img[TABLE_Y - (S - TABLE_Y):TABLE_Y]); rm = np.flipud(m[TABLE_Y - (S - TABLE_Y):TABLE_Y])
        fade = np.linspace(0.32, 0, S - TABLE_Y)[:, None]
        a = cv2.GaussianBlur(rm * fade, (0, 0), 3)[..., None]
        out[TABLE_Y:] = out[TABLE_Y:] * (1 - a) + cv2.GaussianBlur(rr, (0, 0), 2) * a
    for (img, m) in layers: out = out * (1 - m[..., None]) + img * m[..., None]
    out = out.clip(0, 255).astype(np.uint8)
    out = Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))
    vig = Image.new("L", (S, S), 0); ImageDraw.Draw(vig).ellipse((-S * .25, -S * .35, S * 1.25, S * 1.3), fill=255); vig = vig.filter(ImageFilter.GaussianBlur(160))
    out = Image.composite(out, Image.blend(out, Image.new("RGB", (S, S), (30, 4, 10)), 0.35), vig)
    tmp = f"/tmp/coll-{b['id']}.jpg"; out.save(tmp, quality=92, optimize=True, subsampling=0)
    hh = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:10]
    for old in [f for f in os.listdir("img") if f.startswith(f"coll-{b['id']}-")]: os.remove("img/" + old)
    dest = f"img/coll-{b['id']}-{hh}.jpg"; os.replace(tmp, dest); print(dest, os.path.getsize(dest) // 1024, "KB", n, "bottles")
art = {re.match(r"coll-(.+)-[0-9a-f]{10}\.jpg", f).group(1): "img/" + f for f in sorted(os.listdir("img")) if f.startswith("coll-")}
h2 = re.sub(r"const COLL_ART=\{.*?\};", "const COLL_ART=" + json.dumps(art, sort_keys=True) + ";", h, count=1)
open("index.html", "w", encoding="utf-8").write(h2)
