// "Pay by Interac e-Transfer" for the velvetvolute.ca cart.
// Prices the cart exactly like the card checkout (../lib/cart.mjs), has Square calculate the total
// (so discounts and any tax match what a card order would charge) without creating a Square order,
// then emails the customer the e-Transfer instructions, BCCs the shop (with the customer's contact
// and delivery details) and pings Justin's phone. Nothing is charged here; Justin confirms the order
// by hand once the e-Transfer lands. No Square card fee applies to these orders.
//
// Netlify env: SQUARE_ACCESS_TOKEN and RESEND_API_KEY (required), ETRANSFER_EMAIL (where the
// e-Transfer goes, default velvetvolute@gmail.com), NTFY_TOPIC (optional phone alert).
import { getStore } from "@netlify/blobs";
import { sq, LOCATION_ID, isReusableCode } from "../lib/square.mjs";
import { priceCart, isCartError, newOrderNumber, refFor, SHIPPING, BOOKING_URL, DELIVERY_BOOKING_URL } from "../lib/cart.mjs";
import { summarize } from "./order.mjs";

const SITE = process.env.SITE_URL || "https://velvetvolute.ca";
const SHOP_EMAIL = "velvetvolute@gmail.com";
const PAY_TO = process.env.ETRANSFER_EMAIL || SHOP_EMAIL;
const MAIL_FROM = process.env.ORDER_EMAIL_FROM || "Velvet Volute <orders@velvetvolute.ca>";
const MAIL_COPY = process.env.ORDER_COPY_TO || SHOP_EMAIL;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const CA_PC = /^[ABCEGHJ-NPRSTVXY]\d[A-Z]\s?\d[A-Z]\d$/i;
const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const money = (c) => "$" + (c / 100).toFixed(2);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => String(s || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);

// At most 5 e-Transfer orders per visitor per hour, so the form can't be used to spam inboxes.
async function allowed(req) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "";
  if (!ip) return true;
  try {
    const store = getStore("vv-etransfer");
    const key = "ip-" + ip.replace(/[^0-9a-f.:]/gi, "");
    const now = Date.now();
    const recent = ((await store.get(key, { type: "json" })) || []).filter((t) => now - t < 3600e3);
    if (recent.length >= 5) return false;
    await store.setJSON(key, [...recent, now]);
  } catch (e) { console.error("blobs unavailable, skipping rate limit", e); }
  return true;
}

function readContact(input, ship) {
  const c = input.contact || {};
  const out = {
    name: clip(c.name, 80),
    email: clip(c.email, 254).toLowerCase(),
    phone: clip(c.phone, 30),
    street: clip(c.street, 120),
    city: clip(c.city, 60),
    prov: clip(c.prov, 2).toUpperCase(),
    postal: clip(c.postal, 7).toUpperCase(),
  };
  if (out.name.length < 2) return { error: "Please enter your name." };
  if (!EMAIL_RE.test(out.email)) return { error: "Please enter a valid email address, so I can send you the e-Transfer details." };
  if (ship !== "pickup") {
    if (out.street.length < 4 || out.city.length < 2) return { error: "Please enter your street address and city." };
    if (!PROVINCES.includes(out.prov)) return { error: "Please choose your province." };
    if (!CA_PC.test(out.postal)) return { error: "Please enter a valid Canadian postal code." };
  }
  return { contact: out };
}

function nextStep(method) {
  return method === "pickup"
    ? `<p>Once it's in, I'll hand-pour your decants for pickup at the Shoppers Drug Mart on Carling Ave, Ottawa. <a href="${BOOKING_URL}" style="color:#6e1a31">Book your 15-minute slot here</a> (24 hours' notice).</p>`
    : method === "local"
      ? `<p>Once it's in, I'll hand-pour your decants and bring them to your door myself. <a href="${DELIVERY_BOOKING_URL}" style="color:#6e1a31">Pick a delivery window here</a> (24 hours' notice).</p>`
      : `<p>Once it's in, I'll hand-pour your decants, ship them with Canada Post and email you when they're on the way.</p>`;
}

function emailHTML(s, c, ship) {
  const rows = s.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eadfcd">${i.qty > 1 ? i.qty + "× " : ""}${esc(i.name)}${i.variation ? `<br><span style="color:#8a6d4b;font-size:13px">${esc(i.variation)}</span>` : ""}</td><td style="padding:6px 0;border-bottom:1px solid #eadfcd;text-align:right;white-space:nowrap">${money(i.total)}</td></tr>`).join("");
  const charges = s.charges.map((x) => `<tr><td style="padding:6px 0">${esc(x.name)}</td><td style="padding:6px 0;text-align:right">${money(x.total)}</td></tr>`).join("");
  const where = ship === "pickup" ? "Ottawa pickup (Shoppers Drug Mart, Carling Ave)"
    : `${esc(c.street)}, ${esc(c.city)}, ${esc(c.prov)} ${esc(c.postal)}${ship === "local" ? " (local hand delivery)" : " (Canada Post)"}`;
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2c0610">
  <div style="background:#4a0e1e;color:#e8d3b4;padding:22px 24px;text-align:center"><div style="font-size:26px;letter-spacing:.08em">VELVET VOLUTE</div><div style="font-size:13px;letter-spacing:.2em;margin-top:4px">ORDER RECEIVED · AWAITING E-TRANSFER</div></div>
  <div style="padding:24px;background:#fbf6ee">
   <p style="font-size:18px;margin:0 0 6px">Thank you, ${esc(c.name.split(" ")[0])}.</p>
   <p style="margin:0 0 18px">Order number <b style="letter-spacing:.06em">${esc(s.no)}</b></p>
   <div style="border:1px solid #b5946a;padding:14px 16px;margin:0 0 20px;background:#fff">
    <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin-bottom:8px">How to pay</div>
    <p style="margin:0 0 6px">Send an Interac e-Transfer of <b>${money(s.total)}</b> to <b>${esc(PAY_TO)}</b></p>
    <p style="margin:0">In the e-Transfer message, write your order number: <b>${esc(s.no)}</b></p>
   </div>
   <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}${charges}${s.method === "ship" && !s.charges.length ? `<tr><td style="padding:6px 0">Shipping</td><td style="padding:6px 0;text-align:right">Free</td></tr>` : ""}${s.discount ? `<tr><td style="padding:6px 0">Discounts</td><td style="padding:6px 0;text-align:right">−${money(s.discount)}</td></tr>` : ""}${s.tax ? `<tr><td style="padding:6px 0">Tax</td><td style="padding:6px 0;text-align:right">${money(s.tax)}</td></tr>` : ""}<tr><td style="padding:10px 0;border-top:1px solid #b5946a;font-weight:bold">Total to send</td><td style="padding:10px 0;border-top:1px solid #b5946a;text-align:right;font-weight:bold">${money(s.total)}</td></tr></table>
   <h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:22px 0 6px">What happens next</h3>
   <p>I'll email you as soon as your e-Transfer arrives.</p>${nextStep(s.method)}
   <h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:22px 0 6px">Your details</h3>
   <p style="margin:0">${esc(c.name)} · ${esc(c.email)}${c.phone ? ` · ${esc(c.phone)}` : ""}<br>${where}</p>
   <p style="margin-top:22px">Questions or a change to your order? Reply to this email and include ${esc(s.no)}.</p>
   <p style="color:#8a6d4b;font-size:13px">Peace &amp; Love, Izzi · <a href="${SITE}" style="color:#6e1a31">velvetvolute.ca</a></p>
  </div></div>`;
}

async function sendEmail(s, c, ship) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  const text = [
    `Thank you for your order. Order number ${s.no}.`,
    `To pay: send an Interac e-Transfer of ${money(s.total)} to ${PAY_TO} and write ${s.no} in the message.`,
    ...s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""} ${money(i.total)}`),
    `Total to send ${money(s.total)}`,
    "I'll email you as soon as your e-Transfer arrives.",
  ].join("\n");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: [c.email], bcc: [MAIL_COPY], reply_to: SHOP_EMAIL, subject: `Your Velvet Volute order ${s.no}: e-Transfer details`, text, html: emailHTML(s, c, ship) }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

async function notify(s, c) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const how = s.method === "pickup" ? "Ottawa pickup" : s.method === "local" ? "LOCAL HAND DELIVERY" : "Shipping";
  await fetch("https://ntfy.sh/" + encodeURIComponent(topic), {
    method: "POST",
    headers: { Title: `E-transfer order ${s.no} · ${money(s.total)} (awaiting payment)`, Priority: "high", Tags: "hourglass" },
    body: [`${c.name} · ${c.email}`, how, ...s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""}`)].join("\n"),
  }).catch(() => {});
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || !process.env.RESEND_API_KEY) return json(500, { error: "E-Transfer ordering isn't available right now. Please pay by card, or email velvetvolute@gmail.com." });

  let input;
  try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  if (input.website) return json(200, { ok: true }); // honeypot field: bots fill it, people never see it

  const ship = SHIPPING[input.ship] ? input.ship : null;
  const { contact, error } = readContact(input, ship);
  if (error) return json(400, { error });
  if (ship === "local" && contact.postal.replace(/\s/g, "") !== String(input.pc || "").toUpperCase().replace(/\s/g, "")) {
    return json(400, { error: "Your address postal code doesn't match the delivery postal code in your cart. Please check them." });
  }
  if (!(await allowed(req))) return json(429, { error: "Too many orders from this connection. Please wait a little, or email velvetvolute@gmail.com." });

  try {
    const cart = await priceCart(req, input, token);
    const orderNo = newOrderNumber();
    const order = {
      location_id: LOCATION_ID,
      reference_id: refFor(orderNo, cart),
      line_items: cart.lineItems,
      ...(cart.discounts.length ? { discounts: cart.discounts } : {}),
      ...(cart.shipCents > 0 ? { service_charges: [{ name: SHIPPING[cart.ship].label, amount_money: { amount: cart.shipCents, currency: "CAD" }, calculation_phase: "TOTAL_PHASE" }] } : {}),
      pricing_options: { auto_apply_taxes: true },
    };
    const { order: priced } = await sq("/orders/calculate", token, { order });
    const s = summarize(priced);
    await sendEmail(s, contact, cart.ship);
    await notify(s, contact);
    // One-time promo codes are retired now, since an e-Transfer never reaches the Square webhook.
    if (cart.coupon && !isReusableCode(cart.coupon.name)) {
      await sq(`/catalog/object/${cart.coupon.id}`, token, null, "DELETE").catch((e) => console.error(e));
    }
    return json(200, { ok: true, no: s.no, total: s.total, payTo: PAY_TO, method: s.method, items: s.items, charges: s.charges, discount: s.discount, tax: s.tax });
  } catch (e) {
    if (isCartError(e)) return json(400, { error: e.message });
    console.error(e);
    return json(502, { error: "Your order couldn't be sent. Please try again, or email velvetvolute@gmail.com." });
  }
};
