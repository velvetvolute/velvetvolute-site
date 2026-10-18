// Square webhook for velvetvolute.ca. Subscribe this URL in the Square Developer dashboard to
// "payment.updated" only; set SQUARE_WEBHOOK_SIGNATURE_KEY in Netlify.
// Square sends payment.updated several times per payment (often 2–3 within a second, all
// status COMPLETED), so each payment id is claimed once in Netlify Blobs before anything fires.
// On a paid order it: 1) pings Justin's phone (NTFY_TOPIC), 2) retires a one-time promo code,
// 3) emails the buyer a Velvet Volute order confirmation via Resend (RESEND_API_KEY), with an
//    identical copy to the shop (ORDER_COPY_TO). Each of those is skipped silently when its env vars are missing.
import { getStore } from "@netlify/blobs";
import { sq, LOCATION_ID, isReusableCode } from "../lib/square.mjs";
import { summarize } from "./order.mjs";

const SITE = process.env.SITE_URL || "https://velvetvolute.ca";
const BOOKING_URL = "https://calendar.app.google/9Gg9gioRktiA5eocA";
const DELIVERY_BOOKING_URL = process.env.DELIVERY_BOOKING_URL || "https://calendar.app.google/9Gg9gioRktiA5eocA";
const SHOP_EMAIL = "velvetvolute@gmail.com";
const MAIL_FROM = process.env.ORDER_EMAIL_FROM || "Velvet Volute <orders@velvetvolute.ca>";
const MAIL_COPY = process.env.ORDER_COPY_TO || SHOP_EMAIL;
const money = (c) => "$" + (c / 100).toFixed(2);

async function validSignature(req, raw) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return false;
  const url = process.env.SQUARE_WEBHOOK_URL || `${SITE}/.netlify/functions/square-webhook`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(url + raw)));
  const sig = btoa(String.fromCharCode(...mac));
  return sig === (req.headers.get("x-square-hmacsha256-signature") || "");
}

// Atomically claim a payment id; returns false if another delivery already claimed it.
// If Blobs is unavailable we proceed anyway (a rare duplicate beats a missed order) and log it.
async function firstDelivery(paymentId) {
  try {
    const { modified } = await getStore("vv-orders").set(paymentId, new Date().toISOString(), { onlyIfNew: true });
    return modified;
  } catch (e) {
    console.error("blobs unavailable, skipping dedupe", e);
    return true;
  }
}

async function notify(s) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const lines = s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""}`);
  await fetch("https://ntfy.sh/" + encodeURIComponent(topic), {
    method: "POST",
    headers: { Title: `New order ${s.no} · ${money(s.total)}`, Priority: "high", Tags: "shopping_bags" },
    body: [s.method === "pickup" ? "Ottawa pickup" : s.method === "local" ? "LOCAL HAND DELIVERY" : s.method === "ship" ? "Shipping" : "", ...lines].filter(Boolean).join("\n"),
  }).catch(() => {});
}

// One-time promo codes: delete the catalog Discount after its first paid order (OPEN-… codes stay).
async function retireCoupon(order, token) {
  for (const d of order.discounts || []) {
    if (!d.catalog_object_id || isReusableCode(d.name)) continue;
    try { await sq(`/catalog/object/${d.catalog_object_id}`, token, null, "DELETE"); } catch (e) { console.error(e); }
  }
}

function emailHTML(s, ref, etransfer = false) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = s.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eadfcd">${i.qty > 1 ? i.qty + "× " : ""}${esc(i.name)}${i.variation ? `<br><span style="color:#8a6d4b;font-size:13px">${esc(i.variation)}</span>` : ""}</td><td style="padding:6px 0;border-bottom:1px solid #eadfcd;text-align:right;white-space:nowrap">${money(i.total)}</td></tr>`).join("");
  const charges = s.charges.map((c) => `<tr><td style="padding:6px 0">${esc(c.name)}</td><td style="padding:6px 0;text-align:right">${money(c.total)}</td></tr>`).join("");
  const next = s.method === "pickup"
    ? `<p>Pickup is at the Shoppers Drug Mart on Carling Ave, Ottawa. <a href="${BOOKING_URL}" style="color:#6e1a31">Book your 15-minute slot here</a> (24 hours' notice). I'll confirm by email.</p>`
    : s.method === "local"
      ? `<p>Your order qualifies for free local hand delivery: I bring it to your door myself, no courier. <a href="${DELIVERY_BOOKING_URL}" style="color:#6e1a31">Pick a delivery window here</a> (24 hours' notice) and I'll bring your decants to the address you gave at checkout. I'll confirm by email.</p>`
    : `<p>I'll hand-pour your decants and ship them with Canada Post, and email you once they're on the way.</p>`;
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2c0610">
  <div style="background:#4a0e1e;color:#e8d3b4;padding:22px 24px;text-align:center"><div style="font-size:26px;letter-spacing:.08em">VELVET VOLUTE</div><div style="font-size:13px;letter-spacing:.2em;margin-top:4px">${etransfer ? "ORDER CONFIRMATION / INVOICE PAID" : "ORDER CONFIRMATION"}</div></div>
  <div style="padding:24px;background:#fbf6ee">
   <p style="font-size:18px;margin:0 0 6px">${etransfer ? "Thank you, your e-Transfer has been received." : "Thank you for your order."}</p>
   <p style="margin:0 0 18px">Order number <b style="letter-spacing:.06em">${esc(s.no)}</b>${ref ? ` · Square reference ${esc(ref)}` : ""}</p>
   <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}${charges}${s.method === "ship" && !s.charges.length ? `<tr><td style="padding:6px 0">Shipping</td><td style="padding:6px 0;text-align:right">Free</td></tr>` : ""}${s.discount ? `<tr><td style="padding:6px 0">Discounts</td><td style="padding:6px 0;text-align:right">−${money(s.discount)}</td></tr>` : ""}${s.tax ? `<tr><td style="padding:6px 0">Tax</td><td style="padding:6px 0;text-align:right">${money(s.tax)}</td></tr>` : ""}<tr><td style="padding:10px 0;border-top:1px solid #b5946a;font-weight:bold">Total paid</td><td style="padding:10px 0;border-top:1px solid #b5946a;text-align:right;font-weight:bold">${money(s.total)}</td></tr></table>
   <h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:22px 0 6px">What happens next</h3>${next}
   <p style="margin-top:22px">Questions? Reply to this email or write to ${SHOP_EMAIL} and include ${esc(s.no)}.</p>
   <p style="color:#8a6d4b;font-size:13px">Peace &amp; Love, Izzi · <a href="${SITE}" style="color:#6e1a31">velvetvolute.ca</a></p>
  </div></div>`;
}

// Resend (https://resend.com): one HTTPS call, no SDK. The buyer gets the confirmation; the shop
// gets an identical copy via BCC, so Justin sees exactly what the customer saw. Replies go to the
// shop's Gmail. When no buyer email is on the payment, the copy is sent to the shop alone.
// etransfer: the payment was recorded by hand in Square (source_type EXTERNAL), e.g. an Interac
// e-Transfer, so the email reads "Invoice paid" instead of "Order confirmation".
async function emailBuyer(s, to, ref, etransfer = false) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const body = {
    from: MAIL_FROM,
    to: [to || MAIL_COPY],
    bcc: to ? [MAIL_COPY] : [],
    reply_to: SHOP_EMAIL,
    subject: etransfer ? `Your Velvet Volute order ${s.no}: invoice paid` : `Your Velvet Volute order ${s.no}`,
    text: [etransfer ? `Invoice paid. Thank you, your e-Transfer has been received. Order number ${s.no}.` : `Thank you for your order. Order number ${s.no}.`, ...s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""} ${money(i.total)}`), `Total paid ${money(s.total)}`, s.method === "pickup" ? `Pickup: book your slot at ${BOOKING_URL}` : "I'll email you once your decants ship."].join("\n"),
    html: emailHTML(s, ref, etransfer),
  };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

export default async (req) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(req, raw))) return new Response("bad signature", { status: 401 });
  let ev; try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const pay = ev?.data?.object?.payment;
  // Square has no payment.completed event: payment.updated fires on every change, so act only
  // when the payment is COMPLETED, and only on the first delivery for that payment id.
  if (!["payment.updated", "payment.created"].includes(ev.type) || pay?.status !== "COMPLETED" || !pay.order_id || (pay.location_id && pay.location_id !== LOCATION_ID)) return new Response("ignored");
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 500 });
  if (!(await firstDelivery(pay.id))) return new Response("duplicate");
  try {
    const { order } = await sq(`/orders/${pay.order_id}`, token);
    if (!order) return new Response("no order");
    const s = summarize(order);
    await Promise.all([notify(s), retireCoupon(order, token), emailBuyer(s, pay.buyer_email_address, pay.receipt_number, pay.source_type === "EXTERNAL")]);
    return new Response("ok");
  } catch (e) {
    console.error(e);
    // Release the claim so Square's automatic retry of this event can go through.
    await getStore("vv-orders").delete(pay.id).catch(() => {});
    return new Response("error", { status: 500 });
  }
};
