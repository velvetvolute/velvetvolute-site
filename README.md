# Velvet Volute

Website for velvetvolute.ca, deployed by Netlify from this repo (one push to `main` = one production deploy).

- `index.html` – the shop, cart and Scent Sherpa (products, stories and tags live at the top of the main script)
- `about.html`, `how-it-works.html`, `fragrance-101.html`, `contact.html` – the other top-level pages (Contact is a Netlify form named `contact`, like the `suggestion` form on the homepage)
- `nav.css` + `nav.js` – shared navigation: top links on desktop, hamburger + slide-out side menu below 1200px. The menu is built from each page's `<nav>`, so change the link order in the page headers (and in `build.mjs` for generated pages)
- `bundles.json`, `spotlight.json`, `zodiac.json` – Special Collections, monthly Spotlight and Zodiac pick (the checkout reads the same files)
- `thanks.html` – order confirmation shown after Square checkout (VV order number, items, next steps)
- `netlify/lib/cart.mjs` – prices the cart from the Square catalogue (Spotlight, Zodiac, Collections, promo codes, delivery); shared by both ways to pay
- `netlify/functions/checkout.mjs` – builds the Square-hosted checkout for card / Apple Pay / Google Pay (needs `SQUARE_ACCESS_TOKEN`)
- `netlify/functions/etransfer.mjs` – "Pay by Interac e-Transfer" in the cart: Square calculates the total (no Square order, no fee), the customer gets the e-Transfer details by email with a copy to the shop, plus a phone alert
- `netlify/functions/coupon.mjs` – checks a promo code for the cart
- `netlify/functions/order.mjs` – looks the paid order up for the thank-you page
- `netlify/functions/square-webhook.mjs` – runs when Square reports a completed payment: phone alert, one-time promo-code retirement, order-confirmation email
- `netlify/lib/square.mjs` – shared Square helpers

## Delivery options
Cart → `ship` is `pickup` (free, no minimum), `local` (free local hand delivery by Justin across Ottawa incl. Orléans/Kanata/Barrhaven on orders $65+, Ottawa postal code K1x/K2x/K4A required, Square collects the address) or `canada` ($9, free $85+). `checkout.mjs` re-checks the threshold and postal code. Set `DELIVERY_BOOKING_URL` in Netlify to the "Local delivery" Google Calendar booking page; until then it falls back to the pickup booking page.

## Interac e-Transfer orders
The cart's "Pay by Interac e-Transfer" form collects name, email, phone (optional) and, for delivery, the address. The customer is asked to send the total to `ETRANSFER_EMAIL` (default `velvetvolute@gmail.com`) with the VV order number in the message. Nothing is recorded in Square: the emailed copy in the shop's Gmail is the order record, and Justin confirms by hand once the e-Transfer arrives. A one-time promo code is retired when the order is placed. Needs `RESEND_API_KEY`; without it the e-Transfer form shows an error and card checkout is unaffected. Limited to 5 orders per connection per hour.

## Order numbers
Every order gets a Velvet Volute number like `VV-K7Q4M2`, saved on the Square order (reference ID and payment note), so it can be searched in the Square dashboard.

## Promo codes
A promo code is a Square catalog **Discount** (Dashboard → Items & services → Discounts) whose name is the code, e.g. `ANNA10` at 10%.
Customers enter it in the cart (or under "Add coupon" on the Square payment page). A code is **one-time** by default: the webhook deletes it after the first paid order that used it. Name a discount `OPEN-…` (e.g. `OPEN-LAUNCH10`) to make it reusable.

## Netlify environment variables
- `SQUARE_ACCESS_TOKEN` – required for checkout, coupons, order lookup, webhook
- `SQUARE_WEBHOOK_SIGNATURE_KEY` – from the Square Developer dashboard; subscribe `https://velvetvolute.ca/.netlify/functions/square-webhook` to `payment.updated` (Square has no payment.completed event; the function acts once per COMPLETED payment, deduped in Netlify Blobs)
- `NTFY_TOPIC` – optional, phone alerts for new orders via ntfy.sh (e-Transfer orders arrive as "awaiting payment")
- `ETRANSFER_EMAIL` – optional, where customers send Interac e-Transfers (default `velvetvolute@gmail.com`)
- `RESEND_API_KEY` – optional, sends the Velvet Volute order-confirmation email through [Resend](https://resend.com) from `orders@velvetvolute.ca` (domain verified in Resend; DNS records live in Netlify DNS). The shop gets an identical BCC copy at `velvetvolute@gmail.com`; override the sender with `ORDER_EMAIL_FROM` and the copy address with `ORDER_COPY_TO`.

## Generated pages (build.mjs)
Netlify runs `node build.mjs` on every deploy (see netlify.toml). It reads the data already in `index.html` (PRODUCTS, MOOD, SHERPA, FIT, HER, TAGS), `bundles.json` and `content/houses.json`, and writes:
- `/fragrance/<house>-<scent>/` – one page per scent (photo, story, notes, size picker, add to cart, "you may also like" by shared notes), with Product schema markup
- `/houses/` and `/houses/<house>/` – fragrance houses: typographic tile grid, "About the house" copy from `content/houses.json`, then every scent we carry from that house
- `/collections/` and `/collections/<id>/` – special collections with a swipeable bottle carousel and "add the set"
- `/guides/` and `/guides/<slug>/` – articles written as Markdown in `content/guides/<slug>.md` (front matter: `title`, `slug`, `description`, `summary`, `date`, `updated`, `image`, `imageAlt`, `scents` = Square ids for the "mentioned" rail). A `## FAQ` section with `###` questions becomes FAQPage schema. `{{count}}`, `{{houses}}`, `{{from2}}`, `{{from10}}` are filled from the live product data
- `/compare/` and `/compare/<slug>/` – the comparison charts: `content/compare/posts.json` is the approved post data (same file the Instagram/Facebook infographics are rendered from), `content/compare/web.json` holds the web copy per slug (`name`, `h1`, `desc`, `intro`, `pick`, `bundle`), and the chart itself is served from `img/compare/<slug>-<hash>.jpg` + `.webp` (converted from the 1080×1350 PNGs; keep the PNGs out of the repo). Each page repeats the chart as an accessible HTML table with live decant prices
- `/site.css` (the homepage stylesheet, extracted so all pages share one source), `/search.json` and `/sitemap.xml` (every page, with lastmod and images)

The output folders are git-ignored; to preview locally run `node build.mjs` and serve the folder. Product-page "Add to cart" writes to the same saved cart the homepage uses, so checkout is unchanged.
House copy lives in `content/houses.json` (`about`, `founded`, `city`, `known`; `pre`/`mark` split a long name across the tile).

## SEO conventions
- Scent pages: title `"<House> <Scent> decant · 2, 5 & 10 ml | Velvet Volute Ottawa"` (the house is dropped when that runs past ~68 characters), description 140–160 characters built from the notes, sizes, lowest price and Ottawa/Canada delivery, Product JSON-LD with one Offer per vial size (CAD, availability, shipping, no-returns policy), BreadcrumbList, canonical, Open Graph + Twitter card with the scent photo, and alt text like "Nishane Kredo extrait bottle with 2, 5 and 10 ml Velvet Volute decants"
- The homepage carries Organization + Store/LocalBusiness + WebSite schema (Ottawa ON, service area Canada, Facebook + Instagram `sameAs`, no street address); Fragrance 101 and How It Works carry FAQPage schema from the Q&As on the page
- Every page is `lang="en-CA"` with one `<h1>`; `robots.txt` points at `/sitemap.xml`, and `netlify.toml` serves the sitemap as XML
