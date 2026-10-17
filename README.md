# Velvet Volute

Website for velvetvolute.ca, deployed by Netlify from this repo (one push to `main` = one production deploy).

- `index.html` – the shop, cart and Scent Sherpa (products, stories and tags live at the top of the main script)
- `about.html`, `how-it-works.html`, `fragrance-101.html`, `contact.html` – the other top-level pages (Contact is a Netlify form named `contact`, like the `suggestion` form on the homepage)
- `nav.css` + `nav.js` – shared navigation: top links on desktop, hamburger + slide-out side menu below 1200px. The menu is built from each page's `<nav>`, so change the link order in the page headers (and in `build.mjs` for generated pages)
- `bundles.json`, `spotlight.json`, `zodiac.json` – Special Collections, monthly Spotlight and Zodiac pick (the checkout reads the same files)
- `thanks.html` – order confirmation shown after Square checkout (VV order number, items, next steps)
- `netlify/functions/checkout.mjs` – builds the Square-hosted checkout (needs `SQUARE_ACCESS_TOKEN`)
- `netlify/functions/coupon.mjs` – checks a promo code for the cart
- `netlify/functions/order.mjs` – looks the paid order up for the thank-you page
- `netlify/functions/square-webhook.mjs` – runs when Square reports a completed payment: phone alert, one-time promo-code retirement, order-confirmation email
- `netlify/lib/square.mjs` – shared Square helpers

## Delivery options
Cart → `ship` is `pickup` (free, no minimum), `local` (free local delivery across Ottawa incl. Orléans/Kanata/Barrhaven on orders $65+, Ottawa postal code K1x/K2x/K4A required, Square collects the address) or `canada` ($9, free $85+). `checkout.mjs` re-checks the threshold and postal code. Set `DELIVERY_BOOKING_URL` in Netlify to the "Local delivery" Google Calendar booking page; until then it falls back to the pickup booking page.

## Order numbers
Every order gets a Velvet Volute number like `VV-K7Q4M2`, saved on the Square order (reference ID and payment note), so it can be searched in the Square dashboard.

## Promo codes
A promo code is a Square catalog **Discount** (Dashboard → Items & services → Discounts) whose name is the code, e.g. `ANNA10` at 10%.
Customers enter it in the cart (or under "Add coupon" on the Square payment page). A code is **one-time** by default: the webhook deletes it after the first paid order that used it. Name a discount `OPEN-…` (e.g. `OPEN-LAUNCH10`) to make it reusable.

## Netlify environment variables
- `SQUARE_ACCESS_TOKEN` – required for checkout, coupons, order lookup, webhook
- `SQUARE_WEBHOOK_SIGNATURE_KEY` – from the Square Developer dashboard; subscribe `https://velvetvolute.ca/.netlify/functions/square-webhook` to `payment.updated` (Square has no payment.completed event; the function acts once per COMPLETED payment, deduped in Netlify Blobs)
- `NTFY_TOPIC` – optional, phone alerts for new orders via ntfy.sh
- `RESEND_API_KEY` – optional, sends the Velvet Volute order-confirmation email through [Resend](https://resend.com) from `orders@velvetvolute.ca` (domain verified in Resend; DNS records live in Netlify DNS). The shop gets an identical BCC copy at `velvetvolute@gmail.com`; override the sender with `ORDER_EMAIL_FROM` and the copy address with `ORDER_COPY_TO`.

## Generated pages (build.mjs)
Netlify runs `node build.mjs` on every deploy (see netlify.toml). It reads the data already in `index.html` (PRODUCTS, MOOD, SHERPA, FIT, HER, TAGS), `bundles.json` and `content/houses.json`, and writes:
- `/fragrance/<house>-<scent>/` – one page per scent (photo, story, notes, size picker, add to cart, "you may also like" by shared notes), with Product schema markup
- `/houses/` and `/houses/<house>/` – fragrance houses: typographic tile grid, "About the house" copy from `content/houses.json`, then every scent we carry from that house
- `/collections/` and `/collections/<id>/` – special collections with a swipeable bottle carousel and "add the set"
- `/site.css` (the homepage stylesheet, extracted so all pages share one source) and `/sitemap.xml`

The output folders are git-ignored; to preview locally run `node build.mjs` and serve the folder. Product-page "Add to cart" writes to the same saved cart the homepage uses, so checkout is unchanged.
House copy lives in `content/houses.json` (`about`, `founded`, `city`, `known`; `pre`/`mark` split a long name across the tile).
