# Previewing the emails

Every email the site sends is a plain function in `netlify/lib/emails.mjs` (the two older ones, "Enjoy your order" and "On its way", live in `netlify/lib/enjoy.mjs`). They take data and return `{ subject, html, text }`, so you can render them without Square, Resend or Netlify.

## Render them

```sh
npm install                 # once: @netlify/blobs is imported by enjoy.mjs (never called during a preview)
node build.mjs              # writes netlify/lib/catalog.mjs, the catalogue the templates read
node tools/email-preview.mjs
open email-previews/index.html
```

`email-previews/` (git-ignored) then holds one `.html` per email, a `.txt` with the plain-text alternative, and an `index.html` listing them:

| File | Email | Sent by |
|---|---|---|
| `01-sherpa-picks` | Your Sherpa picks (3 picks + 10% code) | `sherpa-picks` |
| `02-welcome-1`, `02b-welcome-1-no-code` | Welcome #1, with / without a code | `subscribe`, `drip` |
| `03-welcome-2` | How decants work (day 3) | `drip` |
| `04-welcome-3` | Find the one that's yours (day 7) | `drip` |
| `05-abandoned-cart` | You left these in your cart | `cart-reminders` |
| `06-punch-reward` | Lucky #7 is on us (claim link) | webhook, at 6 punches |
| `07-punch-code`, `07b-punch-code-over-cap` | The code for the chosen 5 ml | `real-ones` |
| `08-referral-thanks` | A friend of yours just ordered ($5 code) | webhook |
| `09-upsize-loved-the-2ml` | Loved the 2 ml? (10% off the 10 ml) | `drip`, 21 days after delivery |
| `10-enjoy-with-loyalty`, `10b-enjoy-six-punches` | Enjoy your order, with review / return code / referral / punch card / Sherpa's pick | webhook or `mark-shipped` |
| `11-on-its-way` | Your order is on its way | webhook or `mark-shipped` |
| `12-shop-copy-extras` | The block only the shop sees in its copy of the confirmation | webhook |
| `13-unsubscribe-page` | The page after a one-click unsubscribe | `unsubscribe` |

Images point at `https://velvetvolute.ca/img/…`, so they show once the site is deployed (and in the previews, as long as you're online).

## Screenshots at 600 px

With Python Playwright installed (`pip install playwright && playwright install chromium`):

```python
import asyncio, glob
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); page = await b.new_page(viewport={"width": 600, "height": 900})
        for f in glob.glob("email-previews/*.html"):
            await page.goto("file://" + __import__("os").path.abspath(f)); await page.screenshot(path=f[:-5] + ".png", full_page=True)
        await b.close()
asyncio.run(main())
```

## Sending a real test

Set `RESEND_API_KEY` locally and run `netlify dev`, then hit a function, e.g.

```sh
curl -X POST http://localhost:8888/.netlify/functions/subscribe -H 'content-type: application/json' \
  -d '{"email":"you@example.com","first":"Justin","consent":true,"source":"test"}'
```

`subscribe`, `sherpa-picks` and `real-ones` also need `SQUARE_ACCESS_TOKEN`, because they create the code in the Square catalogue first. Codes created during tests show up in Square → Items & services → Discounts; delete them there or let `drip` sweep them after they expire.

## Changing the copy

- Brand voice and wording: edit the template functions in `netlify/lib/emails.mjs`. Keep sentences short; say Him / Her / Anyone; no hype.
- Shared frame (header, gold rules, footer, button, code card): `netlify/lib/mail.mjs`.
- Scent lines in the emails come from the site itself (`SHERPA[...].vibe`, then `MOOD`, in `index.html`), through the generated `netlify/lib/catalog.mjs`.
- Sender addresses: `MARKETING_EMAIL_FROM` and `ORDER_EMAIL_FROM` in Netlify.
