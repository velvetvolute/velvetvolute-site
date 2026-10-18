// Emails sent when an order's fulfillment is marked complete in Square:
//  - pickup / local hand delivery: "Enjoy your order", with wear and care tips from Fragrance 101
//    (the decants are in their hands at that point).
//  - Canada Post shipping: a short "Your order is on its way" with tracking, then "Enjoy your order"
//    5 days later (queued by the webhook, sent by enjoy-followup.mjs with { delivered: true }).
import { sq } from "./square.mjs";
import { summarize } from "../functions/order.mjs";

const SITE = process.env.SITE_URL || "https://velvetvolute.ca";
const SHOP_EMAIL = "velvetvolute@gmail.com";
const MAIL_FROM = process.env.ORDER_EMAIL_FROM || "Velvet Volute <orders@velvetvolute.ca>";
const MAIL_COPY = process.env.ORDER_COPY_TO || SHOP_EMAIL;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Spray guide by concentration, read from the product name (Fragrance 101: "How to wear it").
export function spraysFor(name) {
  const n = String(name || "").toLowerCase();
  if (/extrait/.test(n) || (/\bparfum\b/.test(n) && !/eau de parfum/.test(n))) return "2 sprays";
  if (/eau de parfum/.test(n)) return "3 to 4 sprays";
  return "4 or more sprays"; // Eau de Toilette, and anything without a concentration in its name
}

// Who to email: the fulfillment recipient, then the Square customer, then the buyer on the payment.
export async function buyerEmail(order, token) {
  for (const f of order.fulfillments || []) {
    const r = (f.pickup_details || f.shipment_details || f.delivery_details || {}).recipient;
    if (r?.email_address) return { email: r.email_address, name: r.display_name || "" };
  }
  if (order.customer_id) {
    try {
      const { customer: c } = await sq(`/customers/${order.customer_id}`, token);
      if (c?.email_address) return { email: c.email_address, name: c.given_name || "" };
    } catch (e) { console.error(e); }
  }
  for (const t of order.tenders || []) {
    if (!t.payment_id) continue;
    try {
      const { payment: p } = await sq(`/payments/${t.payment_id}`, token);
      if (p?.buyer_email_address) return { email: p.buyer_email_address, name: "" };
    } catch (e) { console.error(e); }
  }
  return { email: "", name: "" };
}

const H3 = (t) => `<h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:24px 0 6px">${t}</h3>`;

export function enjoyHTML(s, firstName) {
  const hi = firstName ? `, ${esc(firstName)}` : "";
  const rows = s.items.map((i) => {
    const sprays = spraysFor(i.name);
    return `<tr><td style="padding:6px 0;border-bottom:1px solid #eadfcd">${i.qty > 1 ? i.qty + "× " : ""}${esc(i.name)}${i.variation ? `<br><span style="color:#8a6d4b;font-size:13px">${esc(i.variation)}</span>` : ""}</td><td style="padding:6px 0;border-bottom:1px solid #eadfcd;text-align:right;white-space:nowrap;color:#6e1a31">${sprays}</td></tr>`;
  }).join("");
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2c0610">
  <div style="background:#4a0e1e;color:#e8d3b4;padding:22px 24px;text-align:center"><div style="font-size:26px;letter-spacing:.08em">VELVET VOLUTE</div><div style="font-size:13px;letter-spacing:.2em;margin-top:4px">ENJOY YOUR ORDER</div></div>
  <div style="padding:24px;background:#fbf6ee;line-height:1.55">
   <p style="font-size:18px;margin:0 0 6px">Your decants are officially yours${hi}.</p>
   <p style="margin:0 0 16px">Thank you for choosing Velvet Volute. Here's a little guide so you get the most out of every spray.</p>
   <table style="width:100%;border-collapse:collapse;font-size:15px"><tr><td style="padding:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a6d4b">Order ${esc(s.no)}</td><td style="padding:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a6d4b;text-align:right">How much</td></tr>${rows}</table>

   ${H3("Where to spray")}
   <p style="margin:0 0 8px">On clean, moisturized skin where you run warm: the <b>neck</b>, <b>chest</b> and <b>inside the wrists</b>. Warmth is what carries a scent off your skin.</p>
   <p style="margin:0 0 8px"><b>Don't rub your wrists together.</b> Let it settle on its own; rubbing rushes the opening.</p>
   <p style="margin:0">A spray on a scarf or sweater can last for days, but skin tells the full story.</p>

   ${H3("How much")}
   <p style="margin:0">Extraits and Parfums: <b>2 sprays</b>. Eau de Parfum: <b>3 to 4</b>. Eau de Toilette: <b>4 or more</b>. The higher the oil, the less you need, and an Extrait can still be there the next morning.</p>

   ${H3("Give it an hour")}
   <p style="margin:0">Every fragrance is a story in three acts. The <b>top notes</b> are the first 15 minutes, bright and loud. The <b>heart</b> takes over for the next few hours. Then the <b>dry-down</b> (woods, amber, musk, leather, vanilla) is what people actually smell on you most of the day. Never judge a scent by the first spray.</p>

   ${H3("How to store them")}
   <p style="margin:0">Somewhere <b>cool and dark</b>, cap on. A drawer or a closet shelf is perfect. <b>Not the bathroom:</b> heat and steam are what age a fragrance fastest.</p>

   ${H3("Match the moment")}
   <p style="margin:0">Heat amplifies a fragrance; cold mutes it. Sweet, spicy, leather and amber scents bloom in cooler weather and after dark. Fresh, citrus, tea and green scents are made for daytime, the office and the gym, where you want to be noticed, not announced.</p>

   ${H3("A few fun facts")}
   <p style="margin:0 0 8px">&bull; A 10 ml decant is roughly <b>100 sprays</b>, about a month of daily wear.</p>
   <p style="margin:0 0 8px">&bull; The same scent smells different on two people. That's <b>skin chemistry</b>: pH, warmth, diet, even your moisturizer.</p>
   <p style="margin:0">&bull; The trail you leave when you walk past is called <b>sillage</b>, pronounced <i>see-yazh</i>.</p>

   <p style="margin:24px 0 8px">Want to go deeper? <a href="${SITE}/fragrance-101.html" style="color:#6e1a31">Fragrance 101</a> covers it all. When you're ready for your next find, the <a href="${SITE}" style="color:#6e1a31">Scent Sherpa</a> can help you curate your own playlist.</p>
   <p style="margin:0">Fell for one? Reply and tell me which, I'd love to hear it.</p>
   <p style="margin-top:22px">Peace &amp; Love,<br>Izzi</p>
   <p style="color:#8a6d4b;font-size:13px"><a href="${SITE}" style="color:#6e1a31">velvetvolute.ca</a></p>
  </div></div>`;
}

export function enjoyText(s, firstName) {
  return [
    `Enjoy your Velvet Volute order ${s.no}${firstName ? ", " + firstName : ""}.`,
    ...s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""}${spraysFor(i.name) ? `: ${spraysFor(i.name)}` : ""}`),
    "Where to spray: clean, moisturized skin where you're warm (neck, chest, inside the wrists). Don't rub your wrists together.",
    "How much: Extraits and Parfums 2 sprays, Eau de Parfum 3 to 4, Eau de Toilette 4 or more.",
    "Give it an hour: the dry-down is the real scent.",
    "Storage: cool and dark, cap on. Not the bathroom.",
    `More: ${SITE}/fragrance-101.html`,
    "Peace & Love, Izzi",
  ].join("\n");
}

// Tracking link for the "on its way" email: Square's own tracking URL, else Canada Post's tracker.
export function trackingFor(order) {
  for (const f of order.fulfillments || []) {
    const d = f.shipment_details;
    if (!d?.tracking_number && !d?.tracking_url) continue;
    const no = String(d.tracking_number || "").replace(/\s+/g, "");
    const url = d.tracking_url || (no ? `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(no)}` : "");
    return { no, url, carrier: d.carrier || "Canada Post" };
  }
  return null;
}

export function shippedHTML(s, firstName, track) {
  const hi = firstName ? `, ${esc(firstName)}` : "";
  const rows = s.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eadfcd">${i.qty > 1 ? i.qty + "× " : ""}${esc(i.name)}${i.variation ? `<br><span style="color:#8a6d4b;font-size:13px">${esc(i.variation)}</span>` : ""}</td></tr>`).join("");
  const trackBlock = track
    ? `<div style="border:1px solid #b5946a;padding:14px 16px;margin:18px 0;background:#fff;text-align:center"><div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin-bottom:6px">${esc(track.carrier)} tracking</div>${track.no ? `<div style="font-size:18px;letter-spacing:.06em;font-weight:bold;margin-bottom:8px">${esc(track.no)}</div>` : ""}${track.url ? `<a href="${esc(track.url)}" style="display:inline-block;background:#4a0e1e;color:#e8d3b4;padding:9px 18px;text-decoration:none;letter-spacing:.1em">TRACK YOUR ORDER</a>` : ""}</div>`
    : "";
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2c0610">
  <div style="background:#4a0e1e;color:#e8d3b4;padding:22px 24px;text-align:center"><div style="font-size:26px;letter-spacing:.08em">VELVET VOLUTE</div><div style="font-size:13px;letter-spacing:.2em;margin-top:4px">YOUR ORDER IS ON ITS WAY</div></div>
  <div style="padding:24px;background:#fbf6ee;line-height:1.55">
   <p style="font-size:18px;margin:0 0 6px">Your decants are on their way${hi}.</p>
   <p style="margin:0 0 4px">Hand-poured, labelled and packed with care, now in Canada Post's hands.</p>
   ${trackBlock}
   <table style="width:100%;border-collapse:collapse;font-size:15px"><tr><td style="padding:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a6d4b">Order ${esc(s.no)}</td></tr>${rows}</table>
   <p style="margin:18px 0 0">Once they land, I'll send you a little guide on how to wear and store them so you get the most out of every spray.</p>
   <p style="margin:12px 0 0;font-size:13px;color:#8a6d4b">Something arrive damaged? Reply within 24 hours of delivery with a photo and your order number.</p>
   <p style="margin-top:22px">Peace &amp; Love,<br>Izzi</p>
   <p style="color:#8a6d4b;font-size:13px"><a href="${SITE}" style="color:#6e1a31">velvetvolute.ca</a></p>
  </div></div>`;
}

// Called from the Square webhook on order.fulfillment.updated once a fulfillment reaches COMPLETED.
// Shipped orders get "on its way"; everything else (and shipped orders once delivered) gets "enjoy".
export async function sendEnjoy(orderId, token, { delivered = false } = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "no resend key";
  const { order } = await sq(`/orders/${orderId}`, token);
  if (!order) return "no order";
  const s = summarize(order);
  const { email, name } = await buyerEmail(order, token);
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const onItsWay = s.method === "ship" && !delivered;
  const track = onItsWay ? trackingFor(order) : null;
  const body = {
    from: MAIL_FROM,
    to: [email || MAIL_COPY],
    bcc: email ? [MAIL_COPY] : [],
    reply_to: SHOP_EMAIL,
    subject: onItsWay ? `Your Velvet Volute order ${s.no} is on its way` : `Enjoy your Velvet Volute order ${s.no}`,
    text: onItsWay
      ? [`Your Velvet Volute order ${s.no} is on its way.`, ...(track?.url ? [`Track it: ${track.url}`] : []), ...s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""}`), "Once it lands, I'll send you a guide on how to wear and store your decants.", "Peace & Love, Izzi"].join("\n")
      : enjoyText(s, first),
    html: onItsWay ? shippedHTML(s, first, track) : enjoyHTML(s, first),
  };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return onItsWay ? "shipped" : "sent";
}
