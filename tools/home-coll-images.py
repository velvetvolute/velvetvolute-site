"""Homepage copies of the collection group shots, without the baked-in VV stamp.

The homepage crops each group shot to a frame that fits its bottles, so a stamp
baked into the photo's corner gets clipped. These copies have the stamp painted
out; the homepage draws the stamp on top of every card instead (.bstamp in
index.html), so it always sits whole in the frame's top-right corner.

Writes img/home-coll-<id>-<hash>-1600.jpg plus .w1080 / .w640 copies and prints
the COLL_ART map for index.html. Run from the repo root:  python3 tools/home-coll-images.py
"""
import glob, hashlib, io, json, os, re
import numpy as np, cv2
from PIL import Image

# the stamp sits at the same place in every group shot (fractions of the square photo)
CX, CY, R = 0.9226, 0.0771, 0.042
SIZES = (1600, 1080, 640)

out = {}
for src in sorted(glob.glob("img/coll-*-[0-9][0-9][0-9][0-9].jpg")):
    cid = re.match(r"img/coll-(.+)-[0-9a-f]{10}-\d+\.jpg$", src).group(1)
    im = cv2.imread(src).astype(np.float32)
    H, W = im.shape[:2]
    cx, cy, r = CX * W, CY * H, R * W
    # work in a box around the stamp
    x0, x1 = int(cx - 1.7 * r), min(W, int(cx + 1.7 * r))
    y0, y1 = max(0, int(cy - 1.7 * r)), int(cy + 1.7 * r)
    box = im[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(xx - cx, yy - cy) / r
    hole = d < 1.035                                   # the stamp, edge included
    ring = (d > 1.08) & (d < 1.65)
    # keep only wall in the ring (drops a bottle cap that comes close, e.g. Le Male in Vanilla)
    med = np.median(box[ring], 0)
    ring &= np.linalg.norm(box - med, axis=2) < 28
    # the wall's smooth light falloff: a quadratic surface fitted to the ring
    u, v = (xx - cx) / r, (yy - cy) / r
    A = np.stack([np.ones_like(u), u, v, u * u, u * v, v * v], -1)
    smooth = np.empty_like(box)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A[ring], box[..., c][ring], rcond=None)
        smooth[..., c] = A @ coef
    # real wall texture: the fine detail of a patch of plain wall further left
    dx = int(4 * r)
    donor = im[y0:y1, x0 - dx:x1 - dx]
    sig = r / 6
    texture = donor - cv2.GaussianBlur(donor, (0, 0), sig)
    fill = smooth + texture
    # feather the edge over a few pixels so no seam shows
    alpha = np.clip((1.065 - d) / 0.03, 0, 1)
    alpha[(d > 1.02) & (np.linalg.norm(box - med, axis=2) > 28)] = 0   # never paint over a bottle
    alpha = alpha[..., None]
    box[:] = alpha * fill + (1 - alpha) * box
    filled = np.clip(im, 0, 255).astype(np.uint8)
    rgb = Image.fromarray(cv2.cvtColor(filled, cv2.COLOR_BGR2RGB))
    big = rgb.resize((1600, 1600), Image.LANCZOS)
    buf = io.BytesIO(); big.save(buf, "JPEG", quality=86, optimize=True, progressive=True)
    h = hashlib.sha1(buf.getvalue()).hexdigest()[:10]
    base = f"img/home-coll-{cid}-{h}-1600"
    for old in glob.glob(f"img/home-coll-{cid}-*"):
        os.remove(old)
    with open(base + ".jpg", "wb") as f: f.write(buf.getvalue())
    for w in SIZES[1:]:
        rgb.resize((w, w), Image.LANCZOS).save(f"{base}.w{w}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    out[cid] = base + ".w1080.jpg"
print("const COLL_ART=" + json.dumps(out) + ";")
