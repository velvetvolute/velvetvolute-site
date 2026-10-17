# Velvet Volute

Website for velvetvolute.ca, deployed by Netlify from this repo (one push to `main` = one production deploy).

- `index.html` – the shop, cart and Scent Sherpa (products, stories and tags live at the top of the main script)
- `bundles.json`, `spotlight.json`, `zodiac.json` – Special Collections, monthly Spotlight and Zodiac pick (the checkout reads the same files)
- `thanks.html` – order confirmation shown after Square checkout (VV order number, items, next steps)
- `netlify/functions/checkout.mjs` – builds the Square-hosted checkout (needs `SQUARE_ACCESS_TOKEN`)
- `netlify/functions/coupon.mjs` – checks a promo code for the cart
- `netlify/functions/order.mjs` – looks the paid order up for the thank-you page
- `netlify/functions/square-webhook.mjs` – runs when Square reports a completed payment: phone alert, one-time promo-code retirement, order-confirmation email
- `netlify/lib/square.mjs` – shared Square helpers

## Order numbers
Every order gets a Velvet Volute number like `VV-K7Q4M2`, saved on the Square order (reference ID and payment note), so it can be searched in the Square dashboard.

## Promo codes
A promo code is a Square catalog **Discount** (Dashboard → Items & services → Discounts) whose name is the code, e.g. `ANNA10` at 10%.
Customers enter it in the cart (or under "Add coupon" on the Square payment page). A code is **one-time** by default: the webhook deletes it after the first paid order that used it. Name a discount `OPEN-…` (e.g. `OPEN-LAUNCH10`) to make it reusable.

## Netlify environment variables
- `SQUARE_ACCESS_TOKEN` – required for checkout, coupons, order lookup, webhook
- `SQUARE_WEBHOOK_SIGNATURE_KEY` – from the Square Developer dashboard; subscribe `https://velvetvolute.ca/.netlify/functions/square-webhook` to `payment.completed`
- `NTFY_TOPIC` – optional, phone alerts for new orders via ntfy.sh
- `GMAIL_USER` + `GMAIL_APP_PASSWORD` – optional, sends the Velvet Volute order-confirmation email from that Gmail account (needs a Google "app password")
