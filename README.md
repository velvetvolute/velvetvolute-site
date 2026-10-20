# Velvet Volute

Website for velvetvolute.ca, deployed by Netlify from this repo (one push to `main` = one production deploy).

- `index.html` – the shop, cart and Scent Sherpa (products, stories and tags live at the top of the main script)
- `about.html`, `how-it-works.html`, `fragrance-101.html`, `contact.html` – the other top-level pages (Contact is a Netlify form named `contact`, like the `suggestion` form on the homepage)
- `subscribe.html` (`/subscribe`) – "10% off your first decant" sign-up page for the link in bio; `rewards.html` (`/rewards`, "Rewards" in the side menu; the old `/the-real-ones` link 301s here) – The Real Ones stamp card and the "Choose your free 5 ml" claim flow
- `nav.css` + `nav.js` – shared navigation: top links on desktop, hamburger + slide-out side menu below 1200px. The menu is built from each page's `<nav>`, so change the link order in the page headers (and in `build.mjs` for generated pages)
- `bundles.json`, `spotlight.json`, `zodiac.json` – Special Collections, monthly Spotlight and Zodiac pick (the checkout reads the same files)
- `thanks.html` – order confirmation shown after Square checkout (VV order number, items, next steps)
- `netlify/lib/cart.mjs` – prices the cart from the Square catalogue (Spotlight, Zodiac, Collections, promo codes incl. restricted ones, delivery); shared by both ways to pay
- `netlify/functions/checkout.mjs` – builds the Square-hosted checkout for card / Apple Pay / Google Pay (needs `SQUARE_ACCESS_TOKEN`); prefills the buyer email and links the saved cart to the order number
- `netlify/functions/etransfer.mjs` – "Pay by Interac e-Transfer" in the cart: Square calculates the total (no Square order, no fee), the customer gets the e-Transfer details by email with a copy to the shop, plus a phone alert
- `netlify/functions/coupon.mjs` – checks a promo code for the cart (returns `only` for codes limited to certain scents or sizes)
- `netlify/functions/order.mjs` – looks the paid order up for the thank-you page
- `netlify/functions/square-webhook.mjs` – runs when Square reports a completed payment: phone alert (with the Sherpa's pick), one-time promo-code retirement and referral credit, order-confirmation email to the buyer plus the shop's own copy, contact segments and punch card
- `netlify/lib/square.mjs` – shared Square helpers, including `createOneTimeCode`
- Email & loyalty layer: `netlify/lib/{store,mail,emails,codes,resend,scents}.mjs` and the functions `sherpa-picks`, `cart-save`, `cart-reminders`, `subscribe`, `unsubscribe`, `drip`, `mark-shipped`, `punches`, `real-ones`, `segments-export` (see **Email & loyalty**)

## Delivery options
Cart → `ship` is `pickup` (free, no minimum), `local` (free local hand delivery by Justin across Ottawa incl. Orléans/Kanata/Barrhaven on orders $65+, Ottawa postal code K1x/K2x/K4A required, Square collects the address) or `canada` ($9, free $85+). `checkout.mjs` re-checks the threshold and postal code. Set `DELIVERY_BOOKING_URL` in Netlify to the "Local delivery" Google Calendar booking page; until then it falls back to the pickup booking page.

## Interac e-Transfer orders
The cart's "Pay by Interac e-Transfer" form collects name, email, phone (optional) and, for delivery, the address. The customer is asked to send the total to `ETRANSFER_EMAIL` (default `velvetvolute@gmail.com`) with the VV order number in the message. Nothing is recorded in Square: the emailed copy in the shop's Gmail is the order record, and Justin confirms by hand once the e-Transfer arrives (recording the payment in Square fires the webhook, which handles punches, codes and the confirmation email like any other order). A one-time promo code is retired when the order is placed. Needs `RESEND_API_KEY`; without it the e-Transfer form shows an error and card checkout is unaffected. Limited to 5 orders per connection per hour.

## Order numbers
Every order gets a Velvet Volute number like `VV-K7Q4M2`, saved on the Square order (reference ID and payment note), so it can be searched in the Square dashboard.

## Promo codes
A promo code is a Square catalog **Discount** (Dashboard → Items & services → Discounts) whose name is the code, e.g. `ANNA10` at 10%.
Customers enter it in the cart (or under "Add coupon" on the Square payment page). A code is **one-time** by default: the webhook deletes it after the first paid order that used it. Name a discount `OPEN-…` (e.g. `OPEN-LAUNCH10`) to make it reusable. `REF-…` codes are personal referral codes (reusable too, see below).

### Codes the site issues by email
`createOneTimeCode({ prefix, percent | amountCents, variationIds?, maxUsesPerOrder?, expiresAt })` in `netlify/lib/square.mjs` (wrapped by `issueCode()` in `netlify/lib/codes.mjs`) makes a unique code such as `VV-SHERPA-7K3Q2`: a catalog **Discount** named after the code, a **Product set** (the item or variation ids it applies to, or every product) and a **Pricing rule** carrying the expiry date. Every pricing rule is pinned to an empty customer group ("Velvet Volute email codes (do not add customers)") so Square never auto-applies it at the POS or on Square Online; velvetvolute.ca reads the rule as metadata and applies the discount itself. A record of each code lives in Netlify Blobs (`vv-codes`) with its kind, owner email, expiry and restriction. The webhook deletes all three catalog objects after the first paid order, and `drip` sweeps expired ones a day after they lapse. Codes are never shown on screen, only emailed, and never contain 0/O/1/I.

| Kind | Code | Offer | Expiry | Issued by |
|---|---|---|---|---|
| sherpa | `VV-SHERPA-…` | 10% off the 3 Sherpa picks, any size | 14 days | `sherpa-picks` |
| welcome | `VV-HELLO-…` | 10% off a first decant | 14 days | `subscribe`, `drip` |
| return | `VV-BACK-…` | 10% off the next order | 30 days | enjoy email |
| referral | `REF-NAME-…` | $5 off a friend's first order (reusable) | 1 year | enjoy email |
| thanks | `VV-THANKS-…` | $5 off for the referrer, each time a friend orders | 60 days | webhook |
| upsize | `VV-GO10-…` | 10% off the 10 ml of a scent they tried | 21 days | `drip`, 21 days after delivery |
| punch | `VV-FREE5-…` | 100% off one 5 ml, or $45 off a dearer one | 90 days | `real-ones` |

A restricted code (`only` in the `coupon` response) is applied line by line in `cart.mjs`: a percentage to every matching line, a fixed amount to one matching unit. A code whose scents aren't in the cart is refused with a clear message; an expired code is refused too.

## Email & loyalty
Marketing email goes from `hello@velvetvolute.ca` (`MARKETING_EMAIL_FROM`), transactional email from `orders@velvetvolute.ca`; both are on the Resend-verified domain, so no new DNS is needed. Every new email is table-based HTML with a plain-text alternative, the dark-wine header, gold rules and a CASL footer (Velvet Volute · Ottawa, ON · velvetvolute@gmail.com · one-click unsubscribe); marketing mail also carries `List-Unsubscribe` headers. State lives in Netlify Blobs: `vv-contacts` (by lower-cased email: consent, segments, welcome progress, codes held), `vv-carts`, `vv-codes`, `vv-punches`, `vv-claims`, `vv-followups`, `vv-paid`, `vv-meta`.

- **Scent Sherpa capture** – "Email me my picks → 10% off your top 3" under the results. `sherpa-picks.mjs` stores the contact (Blobs + the Resend audience `velvet-volute`, created through the API on first use), records the picks, issues the restricted code and emails the three picks with photo, story line, price range and the code. The "Shop your picks" button opens `/?picks=ID,ID,ID`, which shows just those scents. 5 per IP per hour.
- **Cart: email first** – the cart asks for the email before the pay buttons ("Where should we send your order details?", remembered in the browser, prefilled on Square's payment page through `pre_populated_data.buyer_email` and in the e-Transfer form) with an unticked "First dibs" box. `cart-save.mjs` keeps `{ email, lines, ship, consent, ts }` under a cart id the browser generates and stores in `localStorage`.
- **Abandoned cart** – `cart-reminders.mjs` (hourly) emails one reminder per saved cart that is 60–180 minutes old, still has lines and has no checkout behind it (checked against the cart's own order link, the contact's last order and a Square order search by buyer email). Never a second one. The "Finish checkout" link (`/?cart=<id>`) restores the cart and opens it. On the site, a returning visitor with a cart older than an hour sees a small dismissible bar.
- **Sign-up** – bottom-right card after 30 s or on exit intent (desktop), once per 30 days, never for a known email; the same form lives at `/subscribe` for the link in bio. `subscribe.mjs` issues the welcome code (unless they already hold a live Sherpa or welcome code) and sends welcome #1 at once. The code arrives whether or not "first dibs" is ticked; only the series depends on the tick.
- **Welcome series** – `drip.mjs` (hourly): #1 to anyone who opted in and hasn't had it (an hour after opting in via the Sherpa or the cart, with a code only if they hold none), #2 at day 3 (how decants work, sizes, pickup / delivery / shipping, Fragrance 101), #3 at day 7 (find yours: Sherpa + Curated Collections).
- **Post-order** – the buyer's order confirmation is unchanged. The shop's copy adds the **Sherpa's pick** (three in-stock scents the buyer didn't order, closest to what they bought by family, descriptors and shared notes, one line of why each, with "I poured this one" links) and a **Mark as shipped** link; the ntfy alert lists the same three. The "Enjoy your order" email adds a review link (`GOOGLE_REVIEW_URL`, else the Facebook Page recommendations link), a one-time `VV-BACK` code, the customer's referral code, the punch-card line ("3 of 6 punched · Lucky #7 is on us") and the Sherpa's-pick note when one was recorded, and queues "Loved the 2 ml?" for 21 days later (only for a 2 / 3 ml of a scent whose 10 ml wasn't bought).
- **Marking shipped** – marking the fulfillment complete in Square still works. Without Square, open the **Mark as shipped** link in the shop copy: `/.netlify/functions/mark-shipped?order=VV-XXXXXX&key=ADMIN_KEY` sends "on its way" (shipping) or "enjoy" (pickup / local) once, never twice, and queues "enjoy" five days after shipping. Add `&pick=<square item id>&only=pick` (the "I poured this one" links do this) to record the 1 ml surprise.
- **Referrals** – each customer gets a personal `REF-NAME-XXXX` code in the enjoy email: $5 off a friend's order. When the webhook sees a REF code on a paid order from a different email with no earlier orders, it issues a one-time `VV-THANKS` $5 code to the referrer and emails it.
- **The Real Ones punch card** – every decant in a paid order is a punch (a Collection set counts each vial; a free 5 ml bought with a punch code doesn't count). At six, the webhook emails a claim link (`/rewards?claim=TOKEN`). The page lists every in-stock 5 ml (Classic, Luxury, Roll-on) with photo and Square price; `real-ones.mjs` issues a 100%-off code for the chosen variation, or a `PUNCH_REWARD_CAP_CENTS` ($45) code when it costs more, and the page says what they'll pay. The code is emailed, never shown. `punches?email=` is a read-only status endpoint.
- **Segments** – stored per contact in Blobs: houses, families (cat / cat2), who (him / her / anyone, from the Sherpa), fulfil (pickup / local / ship), orders, decants, repeat / first-time, last scent, 10 ml bought. Resend contacts only carry first name + unsubscribed, so `/.netlify/functions/segments-export?key=ADMIN_KEY` (add `&consent=1` for opted-in only, `&format=json` for JSON) returns a CSV to build Broadcast segments from.
- **Unsubscribe** – `/.netlify/functions/unsubscribe?e=…&t=…` (GET shows a page, POST is RFC 8058 one-click) flips the Blobs flag and marks the Resend contact unsubscribed. Unsubscribed contacts still receive transactional email (order confirmation, on its way, enjoy, punch rewards, referral thank-you) and nothing else.
- **Previews** – `node tools/email-preview.mjs` renders every email with sample data; see `docs/EMAIL-PREVIEW.md`.

## Netlify environment variables
- `SQUARE_ACCESS_TOKEN` – required for checkout, coupons, order lookup, webhook, codes
- `SQUARE_WEBHOOK_SIGNATURE_KEY` – from the Square Developer dashboard; subscribe `https://velvetvolute.ca/.netlify/functions/square-webhook` to `payment.updated` and `order.fulfillment.updated` (Square has no payment.completed event; the function acts once per COMPLETED payment, deduped in Netlify Blobs)
- `NTFY_TOPIC` – optional, phone alerts for new orders via ntfy.sh (e-Transfer orders arrive as "awaiting payment")
- `ETRANSFER_EMAIL` – optional, where customers send Interac e-Transfers (default `velvetvolute@gmail.com`)
- `RESEND_API_KEY` – sends every email through [Resend](https://resend.com) (domain verified in Resend; DNS records live in Netlify DNS). Order email goes from `orders@velvetvolute.ca`; the shop gets its own copy at `velvetvolute@gmail.com`. Override the sender with `ORDER_EMAIL_FROM` and the copy address with `ORDER_COPY_TO`. Required for everything under Email & loyalty.
- `ADMIN_KEY` – a long random string. Protects `mark-shipped` and `segments-export` and signs the unsubscribe links (set `UNSUB_SECRET` to use a separate secret for those). Without it the shop copy carries no admin links.
- `MARKETING_EMAIL_FROM` – optional, default `Izzi at Velvet Volute <hello@velvetvolute.ca>` (same verified domain, no new DNS)
- `GOOGLE_REVIEW_URL` – optional, the review link in the enjoy email; falls back to the Facebook Page recommendations link
- `PUNCH_REWARD_CAP_CENTS` – optional, default `4500`: the value of the free 5 ml on the punch card
- `RESEND_AUDIENCE_ID` – optional; otherwise the audience `velvet-volute` is found or created through the API and its id cached in Blobs (`vv-meta`)
- `SITE_URL` – optional, default `https://velvetvolute.ca` (links inside emails)

Scheduled functions are declared in `netlify.toml`: `cart-reminders` hourly at :00 and `drip` hourly at :30; `enjoy-followup` keeps its own daily schedule in its file.

## Generated pages (build.mjs)
Netlify runs `node build.mjs` on every deploy (see netlify.toml). It reads the data already in `index.html` (PRODUCTS, MOOD, SHERPA, FIT, HER, TAGS), `bundles.json` and `content/houses.json`, and writes:
- `/fragrance/<house>-<scent>/` – one page per scent (photo, story, notes, size picker, add to cart, "you may also like" by shared notes), with Product schema markup
- `/houses/` and `/houses/<house>/` – fragrance houses: typographic tile grid, "About the house" copy from `content/houses.json`, then every scent we carry from that house
- `/collections/` and `/collections/<id>/` – special collections with a swipeable bottle carousel and "add the set"
- `/guides/` and `/guides/<slug>/` – articles written as Markdown in `content/guides/<slug>.md` (front matter: `title`, `slug`, `description`, `summary`, `date`, `updated`, `image`, `imageAlt`, `scents` = Square ids for the "mentioned" rail). A `## FAQ` section with `###` questions becomes FAQPage schema. `{{count}}`, `{{houses}}`, `{{from2}}`, `{{from10}}` are filled from the live product data
- `/compare/` and `/compare/<slug>/` – the comparison charts: `content/compare/posts.json` is the approved post data (same file the Instagram/Facebook infographics are rendered from), `content/compare/web.json` holds the web copy per slug (`name`, `h1`, `desc`, `intro`, `pick`, `bundle`), and the chart itself is served from `img/compare/<slug>-<hash>.jpg` + `.webp` (converted from the 1080×1350 PNGs; keep the PNGs out of the repo). Each page repeats the chart as an accessible HTML table with live decant prices
- `/site.css` (the homepage stylesheet, extracted so all pages share one source), `/search.json`, `/sitemap.xml` (every page, with lastmod and images) and `netlify/lib/catalog.mjs` (the same catalogue as an ES module for the functions: emails, Sherpa's pick, punch-card rewards)

The output folders are git-ignored; to preview locally run `node build.mjs` and serve the folder. Product-page "Add to cart" writes to the same saved cart the homepage uses, so checkout is unchanged.
House copy lives in `content/houses.json` (`about`, `founded`, `city`, `known`; `pre`/`mark` split a long name across the tile).

## SEO conventions
- Scent pages: title `"<House> <Scent> decant · 2, 5 & 10 ml | Velvet Volute Ottawa"` (the house is dropped when that runs past ~68 characters), description 140–160 characters built from the notes, sizes, lowest price and Ottawa/Canada delivery, Product JSON-LD with one Offer per vial size (CAD, availability, shipping, no-returns policy), BreadcrumbList, canonical, Open Graph + Twitter card with the scent photo, and alt text like "Nishane Kredo extrait bottle with 2, 5 and 10 ml Velvet Volute decants"
- The homepage carries Organization + Store/LocalBusiness + WebSite schema (Ottawa ON, service area Canada, Facebook + Instagram `sameAs`, no street address); Fragrance 101 and How It Works carry FAQPage schema from the Q&As on the page
- Every page is `lang="en-CA"` with one `<h1>`; `robots.txt` points at `/sitemap.xml`, and `netlify.toml` serves the sitemap as XML
