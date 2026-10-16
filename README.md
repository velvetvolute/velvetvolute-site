# Velvet Volute

Website for velvetvolute.ca, deployed by Netlify.

- `index.html` – the shop
- `thanks.html` – order confirmation shown after Square checkout (order number, items, next steps)
- `netlify/functions/checkout.mjs` – creates the Square checkout (needs the `SQUARE_ACCESS_TOKEN` environment variable in Netlify)
- `netlify/functions/order.mjs` – looks up the paid order for the thank-you page and sends a phone alert for new orders (needs `NTFY_TOPIC` in Netlify to turn alerts on)

Every order gets a Velvet Volute number like `VV-K7Q4M2`. It's saved on the Square order (reference ID and payment note), so it can be searched in the Square dashboard.
