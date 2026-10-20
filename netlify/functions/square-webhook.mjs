// Square webhook for velvetvolute.ca. Subscribe this URL in the Square Developer dashboard to
// "payment.updated" and "order.fulfillment.updated"; set SQUARE_WEBHOOK_SIGNATURE_KEY in Netlify.
// Square sends payment.updated several times per payment (often 2–3 within a second, all
// status COMPLETED), so each payment id is claimed once in Netlify Blobs before anything fires.
// On a paid order it: 1) pings Justin's phone (NTFY_TOPIC) with the Sherpa's pick, 2) retires a
// one-time promo code (and credits the referrer when a REF- code was used), 3) emails the buyer a
// Velvet Volute order confirmation via Resend (RESEND_API_KEY) and the shop its own copy with the
// Sherpa's pick and the mark-shipped link, 4) updates the contact's segments and stamp card.
// Each of those is skipped silently when its env vars are missing.
import { getStore } from "@netlify/blobs";
import { sq, LOCATION_ID, isReusableCode, isReferralCode } from "../lib/square.mjs";
import { summarize } from "./order.mjs";
import { sendEnjoy, buyerEmail } from "../lib/enjoy.mjs";
import { stores, getJSON, getCode, recordPaid, saveCart, getContact, upsertContact, setPunchClaim, newToken, normEmail, EMAIL_RE, firstName, addDrops, dropsFor } from "../lib/store.mjs";
import { retireCode, issueCode, PUNCH_REWARD_CAP_CENTS } from "../lib/codes.mjs";
import { scentsInOrder, sherpasPick, segmentsFromOrder, parseVariation, byName, fullName } from "../lib/scents.mjs";
import { shopExtrasBlock, rewardEmail, referralThanksEmail, cardImg, fmtPunch } from "../lib/emails.mjs";
import { sendMail, MARKETING_FROM, unsubscribeUrl, emailSignature, SIG_TEXT } from "../lib/mail.mjs";

const SITE = process.env.SITE_URL || "https://velvetvolute.ca";
const BOOKING_URL = "https://calendar.app.google/9Gg9gioRktiA5eocA";
const DELIVERY_BOOKING_URL = process.env.DELIVERY_BOOKING_URL || "https://calendar.app.google/9Gg9gioRktiA5eocA";
const SHOP_EMAIL = "velvetvolute@gmail.com";
const MAIL_FROM = process.env.ORDER_EMAIL_FROM || "Velvet Volute <orders@velvetvolute.ca>";
const MAIL_COPY = process.env.ORDER_COPY_TO || SHOP_EMAIL;
const money = (c) => "$" + (c / 100).toFixed(2);

// Who placed the order, from the checkout's pickup/shipping recipient (Square Online doesn't always
// create a customer profile). Shop-only: goes in the ntfy alert and the shop copy, never the buyer's email.
export function contactOf(order, buyer = {}) {
  let r = {};
  for (const f of order.fulfillments || []) {
    r = (f.shipment_details || f.delivery_details || f.pickup_details || {}).recipient || {};
    if (r.display_name || r.email_address || r.phone_number) break;
  }
  const a = r.address || {};
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || r.display_name || buyer.name || "";
  const phone = String(r.phone_number || "").replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
  const address = [a.address_line_1, a.address_line_2, [a.locality, a.administrative_district_level_1].filter(Boolean).join(", "), a.postal_code].filter(Boolean).join(", ");
  return { name, email: r.email_address || buyer.email || "", phone, address };
}
const contactLines = (c) => [c.name && `Name: ${c.name}`, c.email && `Email: ${c.email}`, c.phone && `Phone: ${c.phone}`, c.address && `Address: ${c.address}`].filter(Boolean);

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

async function notify(s, picks, contact = {}) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const lines = s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""}`);
  const sp = picks.length ? ["", "Sherpa's pick (1 ml surprise):", ...picks.map((x, k) => `${k + 1}. ${fullName(x.p)}`)] : [];
  await fetch("https://ntfy.sh/" + encodeURIComponent(topic), {
    method: "POST",
    headers: { Title: `New order ${s.no} · ${money(s.total)}`, Priority: "high", Tags: "shopping_bags" },
    body: [s.method === "pickup" ? "Ottawa pickup" : s.method === "local" ? "LOCAL HAND DELIVERY" : s.method === "ship" ? "Shipping" : "", ...contactLines(contact), "", ...lines, ...sp].filter((x, k, a) => x || (k > 0 && a[k - 1])).join("\n"),
  }).catch(() => {});
}

// One-time promo codes: delete the catalog Discount (and, for codes we issued, its pricing rule and
// product set) after its first paid order. OPEN-… and REF-… codes stay.
async function retireCoupon(order, token) {
  const used = [];
  for (const d of order.discounts || []) {
    if (!d.catalog_object_id) continue;
    used.push(d.name || "");
    if (isReusableCode(d.name)) continue;
    const done = await retireCode(d.name, token).catch((e) => { console.error(e); return false; });
    if (!done) { try { await sq(`/catalog/object/${d.catalog_object_id}`, token, null, "DELETE"); } catch (e) { console.error(e); } }
  }
  return used;
}

// A REF- code was used: the friend got $5 off; the referrer gets a one-time $5 code by email, if this
// really is the buyer's first order and the buyer isn't the referrer.
async function creditReferrer(codeName, buyer, s, token) {
  const rec = await getCode(codeName).catch(() => null);
  if (!rec || rec.kind !== "referral" || !rec.email) return;
  const buyerEmail = normEmail(buyer.email);
  if (!buyerEmail || buyerEmail === rec.email) return;
  const c = await getContact(buyerEmail);
  if ((c?.seg?.orders || 0) > 0) { console.log("referral code used by a returning customer, no credit", codeName); return; }
  const referrer = await getContact(rec.email);
  if (referrer?.unsubscribed) return; // the thank-you is transactional, but respect a hard opt-out anyway
  const thanks = await issueCode({ kind: "thanks", email: rec.email, prefix: "VV-THANKS", amountCents: 500, days: 60 }, token);
  const unsubUrl = await unsubscribeUrl(rec.email);
  const m = referralThanksEmail({ first: referrer?.first || "", code: thanks.code, expiresAt: thanks.expiresAt, unsubUrl });
  await sendMail({ from: MARKETING_FROM, to: rec.email, subject: m.subject, html: m.html, text: m.text, tags: [{ name: "kind", value: "referral-thanks" }] });
  await upsertContact(rec.email, { referrals: (referrer?.referrals || 0) + 1 }).catch(() => {});
}

// Segments + stamp card for the buyer. Punches go by size (store.mjs dropsFor): 2/3 ml a drop (half a stamp),
// 5 ml a punch, 10 ml a stamp and a half. A free 5 ml paid for with a punch code doesn't earn its own drops.
// At six stamps (12 drops), a claim link goes out.
async function loyalty(s, buyer, order, usedCodes, token) {
  const email = normEmail(buyer.email);
  if (!EMAIL_RE.test(email)) return;
  const first = firstName(buyer.name);
  const c = await getContact(email);
  const seg = segmentsFromOrder(s.items, s.method);
  const tenMl = s.items.filter((i) => parseVariation(i.variation).ml >= 10).map((i) => byName(i.name)?.sq).filter(Boolean);
  const qty = s.items.reduce((a, i) => a + Number(i.qty || 0), 0);
  const freeUnits = (await Promise.all(usedCodes.map((n) => getCode(n).catch(() => null)))).filter((r) => r?.kind === "punch").length;
  await upsertContact(email, {
    first, source: "order",
    seg: { ...seg, tenMl, orders: (c?.seg?.orders || 0) + 1, decants: (c?.seg?.decants || 0) + qty, repeat: (c?.seg?.orders || 0) > 0, firstOrderAt: c?.seg?.firstOrderAt || Date.now(), lastOrderAt: Date.now(), lastOrderNo: s.no },
  });
  const drops = s.items.reduce((a, i) => a + dropsFor(parseVariation(i.variation).ml) * Number(i.qty || 0), 0);
  const earned = Math.max(0, drops - freeUnits * dropsFor(5));
  const p = await addDrops(email, earned, s.no);
  let reward = null;
  if (p.pending > 0 && !p.claim) {
    const tokenId = newToken(28);
    await stores.claims().setJSON(tokenId, { email, first, created: Date.now(), used: false, capCents: PUNCH_REWARD_CAP_CENTS });
    await setPunchClaim(email, tokenId);
    // sent after the order confirmation, so the confirmation (with the full card) lands first
    reward = async () => {
      const m = rewardEmail({ first, claimUrl: `${SITE}/the-real-ones?claim=${tokenId}`, unsubUrl: await unsubscribeUrl(email), capCents: PUNCH_REWARD_CAP_CENTS });
      await sendMail({ from: MARKETING_FROM, to: email, bcc: [MAIL_COPY], subject: m.subject, html: m.html, text: m.text, tags: [{ name: "kind", value: "punch-reward" }] });
    };
  }
  return { earned, p, reward };
}

// "The Real Ones" block for the order confirmation: the drops this order added and the card as it stands now.
export function cardBlock(punch) {
  if (!punch || !punch.earned) return "";
  const full = punch.p.pending > 0, n = punch.earned;
  const line = full
    ? `This order added <b>${n} velvet drop${n > 1 ? "s" : ""}</b> and filled your card. Lucky #7 is on us: the link to choose your free 5 ml is on its way in a separate email.`
    : `This order added <b>${n} velvet drop${n > 1 ? "s" : ""}</b>. You're at <b>${fmtPunch(punch.p.cycle)} of 6 stamps</b>; ${fmtPunch(6 - punch.p.cycle)} more and lucky #7, a free 5 ml, is on us.`;
  return `<h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:22px 0 6px">The Real Ones stamp card</h3><p style="margin:0">${line}</p>${cardImg(full ? "full" : punch.p.cycleDrops)}<p style="margin:6px 0 0;font-size:13px"><a href="${SITE}/the-real-ones" style="color:#6e1a31">See your card and how it works</a></p>`;
}

export function emailHTML(s, ref, etransfer = false, extra = "", card = "") {
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
   ${card}
   <p style="margin-top:22px">Questions? Reply to this email or write to ${SHOP_EMAIL} and include ${esc(s.no)}.</p>
   ${extra}
   <p style="margin-top:22px">Peace &amp; Love,<br>Izzi</p>
   ${emailSignature()}
   <p style="color:#8a6d4b;font-size:13px">Velvet Volute · Ottawa, ON · <a href="${SITE}" style="color:#6e1a31">velvetvolute.ca</a></p>
  </div></div>`;
}

// Resend (https://resend.com): one HTTPS call, no SDK. The buyer gets the confirmation; the shop gets
// its own copy with the Sherpa's pick (three 1 ml candidates) and the mark-shipped link, so Justin
// sees what the customer saw plus what to pour. Replies go to the shop's Gmail.
// etransfer: the payment was recorded by hand in Square (source_type EXTERNAL), e.g. an Interac
// e-Transfer, so the email reads "Invoice paid" instead of "Order confirmation".
async function emailBuyer(s, to, ref, etransfer = false, picks = [], punch = null, contact = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const text = [etransfer ? `Invoice paid. Thank you, your e-Transfer has been received. Order number ${s.no}.` : `Thank you for your order. Order number ${s.no}.`, ...s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""} ${money(i.total)}`), `Total paid ${money(s.total)}`, s.method === "pickup" ? `Pickup: book your slot at ${BOOKING_URL}` : "I'll email you once your decants ship.", "", "Peace & Love, Izzi", SIG_TEXT].join("\n");
  const subject = etransfer ? `Your Velvet Volute order ${s.no}: invoice paid` : `Your Velvet Volute order ${s.no}`;
  const adminKey = process.env.ADMIN_KEY;
  const admin = (q) => (adminKey ? `${SITE}/.netlify/functions/mark-shipped?order=${encodeURIComponent(s.no)}&key=${encodeURIComponent(adminKey)}${q}` : "");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cl = contactLines(contact);
  const who = cl.length ? `<div style="margin-top:22px;padding:14px 16px;border:1px dashed #b5946a;background:#fff"><div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8a6d4b">Shop copy only · Customer</div><p style="margin:8px 0 0;font-size:15px;line-height:1.6">${cl.map((l) => esc(l)).join("<br>")}</p></div>` : "";
  const extras = who + (picks.length || adminKey ? shopExtrasBlock({ picks, method: s.method, markShippedUrl: admin(""), pickUrl: adminKey ? (sqId) => admin(`&pick=${encodeURIComponent(sqId)}&only=pick`) : null }) : "");
  const sends = [];
  const card = cardBlock(punch);
  if (to) sends.push({ to: [to], html: emailHTML(s, ref, etransfer, "", card) });
  sends.push({ to: [MAIL_COPY], html: emailHTML(s, ref, etransfer, extras, card), text: text + (cl.length ? `\n\nCustomer:\n${cl.join("\n")}` : "") + (picks.length ? `\n\nSherpa's pick (1 ml surprise): ${picks.map((x) => fullName(x.p)).join("; ")}` : "") });
  for (const m of sends) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: MAIL_FROM, to: m.to, reply_to: SHOP_EMAIL, subject: m.to[0] === MAIL_COPY && to ? `[shop copy] ${subject}` : subject, text: m.text || text, html: m.html }) });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  }
}

export default async (req) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(req, raw))) return new Response("bad signature", { status: 401 });
  let ev; try { ev = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  // Order marked fulfilled in Square (picked up, delivered or shipped): send the "Enjoy your order"
  // email once per order. Needs "order.fulfillment.updated" ticked on the Square webhook subscription.
  if (ev.type === "order.fulfillment.updated") {
    const fu = ev?.data?.object?.order_fulfillment_updated || {};
    const done = (fu.fulfillment_update || []).some((u) => u.new_state === "COMPLETED");
    if (!done || !fu.order_id || (fu.location_id && fu.location_id !== LOCATION_ID)) return new Response("ignored");
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return new Response("not configured", { status: 500 });
    if (!(await firstDelivery("enjoy-" + fu.order_id))) return new Response("duplicate");
    try {
      const result = await sendEnjoy(fu.order_id, token);
      // Shipped orders just got "on its way": queue "Enjoy your order" for 5 days later (enjoy-followup.mjs).
      if (result === "shipped") {
        await getStore("vv-enjoy-queue").setJSON(fu.order_id, { due: Date.now() + 5 * 864e5 }).catch((e) => console.error(e));
      }
      return new Response(result);
    } catch (e) {
      console.error(e);
      await getStore("vv-orders").delete("enjoy-" + fu.order_id).catch(() => {});
      return new Response("error", { status: 500 });
    }
  }
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
    const buyer = await buyerEmail(order, token).catch(() => ({ email: "", name: "" }));
    if (!buyer.email && pay.buyer_email_address) buyer.email = pay.buyer_email_address;
    const contact = contactOf(order, buyer);
    const picks = sherpasPick(scentsInOrder(s.items));
    // Record the paid order and release the saved cart (checkout.mjs linked cart id → order number).
    const cartLink = await getJSON(stores.paid(), "cart-" + s.no).catch(() => null);
    await recordPaid(s.no, { email: normEmail(buyer.email), orderId: order.id, paymentId: pay.id, items: s.items, method: s.method, total: s.total, cartId: cartLink?.cartId || null, picks: picks.map((x) => x.p.sq) }).catch((e) => console.error(e));
    if (cartLink?.cartId) await saveCart(cartLink.cartId, { ordered: true, orderNo: s.no }).catch(() => {});
    // drops are added first so the confirmation shows the updated card; the lucky #7 email (if the card filled) follows it
    const [, usedCodes] = await Promise.all([notify(s, picks, contact), retireCoupon(order, token)]);
    const punch = await loyalty(s, buyer, order, usedCodes, token).catch((e) => { console.error("loyalty", e); return null; });
    await emailBuyer(s, pay.buyer_email_address || buyer.email, pay.receipt_number, pay.source_type === "EXTERNAL", picks, punch, contact);
    if (punch?.reward) await punch.reward().catch((e) => console.error("punch reward", e));
    for (const name of usedCodes) if (isReferralCode(name)) await creditReferrer(name, buyer, s, token).catch((e) => console.error("referral", e));
    return new Response("ok");
  } catch (e) {
    console.error(e);
    // Release the claim so Square's automatic retry of this event can go through.
    await getStore("vv-orders").delete(pay.id).catch(() => {});
    return new Response("error", { status: 500 });
  }
};
