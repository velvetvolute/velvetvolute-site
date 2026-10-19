# Renders The Real Ones card (punchcard.js) to PNGs for emails, where SVG doesn't display:
#   img/punch/card-0.png … card-12.png (drops in the current card) and card-full.png (lucky #7 ready).
# Usage: FONTS=/path/with/CormorantGaramond-Italic[wght].ttf,Jost[wght].ttf python3 tools/punch-card-images.py
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
fonts = os.environ.get("FONTS", "")
ff = ""
for f in [x for x in fonts.split(",") if x]:
    fam = "Cormorant Garamond" if "Cormorant" in f else "Jost"
    style = "italic" if "Italic" in f else "normal"
    ff += f"@font-face{{font-family:'{fam}';font-style:{style};src:url('file://{f}')}}"
js = (ROOT / "punchcard.js").read_text()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 360, "height": 150}, device_scale_factor=2)
    for n in list(range(13)) + ["full"]:
        pg.set_content(f"<html><head><style>{ff}html,body{{margin:0;background:transparent}}svg{{display:block;width:360px;height:150px}}</style></head><body><div id=c></div><script>{js}</script>"
                       f"<script>document.getElementById('c').innerHTML=vvCard({0 if n=='full' else n},{'true' if n=='full' else 'false'})</script></body></html>")
        pg.wait_for_timeout(150)
        pg.query_selector("svg").screenshot(path=str(ROOT / "img" / "punch" / f"card-{n}.png"), omit_background=True)
    b.close()
print("wrote", len(list((ROOT / "img" / "punch").glob("card-*.png"))), "cards")
