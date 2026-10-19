// Hourly: one "You left these in your cart" email per saved cart that is 60–180 minutes old, still has
// lines, was never checked out and has no paid order behind it. Never a second reminder.
// Schedule lives in netlify.toml ([functions."cart-reminders"] schedule = "0 * * * *").
import { stores, listAll, getJSON, saveCart, getContact, upsertContact } from "../lib/store.mjs";
import { sq, LOCATION_ID } from "../lib/square.mjs";
import { buyerEmail } from "../lib/enjoy.mjs";
import { bySq, imgFor, sitePrice, vialLabel, BUNDLES } from "../lib/scents.mjs";
import { abandonedCartEmail } from "../lib/emails.mjs";
import { sendMail, MARKETING_FROM, unsubscribeUrl, SITE } from "../lib/mail.mjs";

const MIN_AGE = 60 * 60e3, MAX_AGE = 180 * 60e3;

// Emails of everyone who paid at the location since `since` (one Square search per run, cached).
async function paidEmailsSince(since, token) {
  const emails = new Set();
  try {
    const body = { location_ids: [LOCATION_ID], limit: 100, query: { filter: { date_time_filter: { created_at: { start_at: new Date(since).toISOString() } } }, sort: { sort_field: "CREATED_AT", sort_order: "DESC" } } };
    const { orders = [] } = await sq("/orders/search", token, body);
    for (const o of orders) {
      if (!(o.tenders || []).length) continue;
      const { email } = await buyerEmail(o, token);
      if (email) emails.add(email.toLowerCase());
    }
  } catch (e) { console.error("orders search", e); }
  return emails;
}

function describe(lines) {
  const out = [];
  let subtotal = 0;
  for (const l of lines) {
    if (l.b) {
      const b = (BUNDLES.bundles || []).find((x) => x.id === l.b);
      if (!b) continue;
      const items = b.sq.map(bySq).filter(Boolean);
      const base = items.reduce((a, p) => a + (p.p?.[l.z] || 0), 0);
      const price = Math.floor((base * (100 - BUNDLES.pct)) / 100);
      out.push({ img: items[0]?.img, brand: b.house, name: b.name, variation: `${items.length} × ${l.z} ml classic`, qty: l.q, price, url: `/collections/${b.id}/` });
      subtotal += price * l.q;
      continue;
    }
    const p = bySq(l.sq);
    if (!p) continue;
    const price = sitePrice(p, l.v, l.z);
    out.push({ img: imgFor(p, l.v), brand: p.brand, name: p.short, variation: `${vialLabel[l.v] || "Classic"} · ${l.z} ml`, qty: l.q, price, url: p.url });
    subtotal += (price || 0) * l.q;
  }
  return { lines: out, subtotal };
}

export default async () => {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!process.env.RESEND_API_KEY) return new Response("no resend key", { status: 500 });
  const now = Date.now();
  const carts = stores.carts();
  const blobs = await listAll(carts);
  let sent = 0, skipped = 0;
  let paid = null;
  for (const { key } of blobs) {
    const c = await getJSON(carts, key);
    if (!c || !c.email || !(c.lines || []).length || c.reminded || c.ordered || c.orderNo) continue;
    const age = now - Number(c.ts || c.updated || 0);
    if (age < MIN_AGE) continue;
    if (age > MAX_AGE) { await saveCart(key, { reminded: "expired" }); continue; } // too late to be useful; mark so it isn't rechecked
    const contact = await getContact(c.email);
    if (contact?.unsubscribed) { await saveCart(key, { reminded: "unsubscribed" }); skipped++; continue; }
    if (contact?.seg?.lastOrderAt && contact.seg.lastOrderAt >= c.ts - 10 * 60e3) { await saveCart(key, { ordered: true }); skipped++; continue; }
    if (!paid && token) paid = await paidEmailsSince(now - MAX_AGE - 60 * 60e3, token);
    if (paid?.has(c.email)) { await saveCart(key, { ordered: true }); skipped++; continue; }
    const { lines, subtotal } = describe(c.lines);
    if (!lines.length) { await saveCart(key, { reminded: "empty" }); continue; }
    try {
      const unsubUrl = await unsubscribeUrl(c.email);
      const m = abandonedCartEmail({ first: c.first || contact?.first || "", lines, subtotal, restoreUrl: `${SITE}/?cart=${key}#cart-page`, unsubUrl });
      await sendMail({ from: MARKETING_FROM, to: c.email, subject: m.subject, html: m.html, text: m.text, unsubUrl, tags: [{ name: "kind", value: "abandoned-cart" }] });
      await saveCart(key, { reminded: now });
      await upsertContact(c.email, { lastReminderAt: now }).catch(() => {});
      sent++;
    } catch (e) { console.error("cart reminder failed", key, e); }
  }
  return new Response(`sent ${sent}, skipped ${skipped}`);
};
