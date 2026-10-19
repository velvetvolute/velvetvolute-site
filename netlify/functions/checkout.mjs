// Creates a Square-hosted checkout (card, Apple Pay, Google Pay) for the cart on velvetvolute.ca.
// Pricing lives in ../lib/cart.mjs, shared with the e-Transfer option (etransfer.mjs).
import { sq, LOCATION_ID } from "../lib/square.mjs";
import { priceCart, isCartError, newOrderNumber, refFor, SHIPPING, BOOKING_URL, DELIVERY_BOOKING_URL } from "../lib/cart.mjs";
import { saveCart, upsertContact, stores, EMAIL_RE, normEmail, CART_ID_RE } from "../lib/store.mjs";
const SITE = process.env.SITE_URL || "https://velvetvolute.ca";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return json(500, { error: "Checkout is not configured yet." });

  let input;
  try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }

  try {
    const cart = await priceCart(req, input, token);
    const { lineItems, discounts, shipCents, ship, pc } = cart;
    const checkout_options = {
      ask_for_shipping_address: ship !== "pickup",
      redirect_url: `${SITE}/thanks.html`,
      merchant_support_email: "velvetvolute@gmail.com",
      allow_tipping: false,
      enable_coupon: false, // one code per order: codes go in the site cart only, so nothing can be stacked on Square's payment page
      accepted_payment_methods: { apple_pay: true, google_pay: true },
    };
    if (shipCents > 0) checkout_options.shipping_fee = { name: SHIPPING[ship].label, charge: { amount: shipCents, currency: "CAD" } };

    const orderNo = newOrderNumber();
    // The cart asks for the email first: prefill it on Square's payment page and tie the saved cart
    // (cart-save.mjs) to this order number, so the abandoned-cart reminder knows it was checked out.
    const email = normEmail(input.email);
    const cartId = CART_ID_RE.test(String(input.cartId || "")) ? String(input.cartId) : "";
    if (cartId) {
      saveCart(cartId, { orderNo, checkoutAt: Date.now(), ...(EMAIL_RE.test(email) ? { email } : {}) }).catch((e) => console.error("cart-save", e));
      stores.paid().setJSON("cart-" + orderNo, { cartId, ts: Date.now() }).catch((e) => console.error("cart link", e)); // the webhook marks the cart ordered
    }
    if (EMAIL_RE.test(email)) upsertContact(email, { source: "checkout", ...(input.consent ? { consent: true } : {}) }).catch((e) => console.error("contact", e));
    const note = `Order ${orderNo} · ` + (
      ship === "pickup"
        ? `Ottawa pickup at Shoppers Drug Mart, Carling Ave. Book your 15-min slot: ${BOOKING_URL}`
        : ship === "local"
          ? `Free local hand delivery (by Izzi) to ${pc}. Pick your delivery window: ${DELIVERY_BOOKING_URL}`
        : shipCents === 0
          ? `${SHIPPING[ship].label}: free (order over $85)`
          : SHIPPING[ship].label);

    const link = await sq("/online-checkout/payment-links", token, {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: LOCATION_ID,
        line_items: lineItems,
        ...(discounts.length ? { discounts } : {}),
        pricing_options: { auto_apply_taxes: true },
        reference_id: refFor(orderNo, cart),
      },
      checkout_options,
      ...(EMAIL_RE.test(email) ? { pre_populated_data: { buyer_email: email } } : {}),
      payment_note: note,
    });
    return json(200, { url: link.payment_link?.url || link.payment_link?.long_url });
  } catch (e) {
    if (isCartError(e)) return json(400, { error: e.message });
    console.error(e);
    return json(502, { error: "Checkout couldn't be started. Please try again, or email velvetvolute@gmail.com." });
  }
};
