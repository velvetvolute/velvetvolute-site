// Saves the cart once the shopper has typed their email (abandoned-cart reminders, cart-reminders.mjs).
// POST { id, email, first?, consent, lines: [{sq,v,z,q}|{b,z,s?,q}], ship, promo }  → { ok }
// GET  ?id=<cart id>  → { lines, ship, promo }  (restores a cart from the "Finish checkout" link; no email is returned)
// The cart id is a random 20-character string the browser makes and keeps in localStorage.
import { allowed, saveCart, getCart, upsertContact, EMAIL_RE, normEmail, firstName, CART_ID_RE } from "../lib/store.mjs";
import { syncContact } from "../lib/resend.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function cleanLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 40).map((l) => {
    const q = Math.max(1, Math.min(10, parseInt(l.q, 10) || 1)), z = Number(l.z) || 0;
    if (l.b) return /^[a-z0-9-]{2,40}$/.test(String(l.b)) ? (l.s === "luxe" ? { b: String(l.b), z, s: "luxe", q } : { b: String(l.b), z, q }) : null;
    if (!/^[A-Z0-9]{10,40}$/.test(String(l.sq || ""))) return null;
    return { sq: String(l.sq), v: ["classic", "luxe", "roll"].includes(l.v) ? l.v : "classic", z, q };
  }).filter(Boolean);
}

export default async (req) => {
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!CART_ID_RE.test(id)) return json(400, { error: "Bad cart" });
    const c = await getCart(id);
    if (!c) return json(404, { error: "That cart has expired." });
    return json(200, { lines: c.lines || [], ship: c.ship || null, promo: c.promo || null });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let input; try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const id = String(input.id || "");
  if (!CART_ID_RE.test(id)) return json(400, { error: "Bad cart id" });
  const email = normEmail(input.email);
  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });
  if (!(await allowed(req, "cart", 60))) return json(429, { error: "Slow down a little." });
  const lines = cleanLines(input.lines);
  const consent = input.consent === true;
  try {
    const cur = await getCart(id);
    await saveCart(id, {
      email, first: firstName(input.first), consent, lines, ship: ["pickup", "local", "canada"].includes(input.ship) ? input.ship : null,
      promo: input.promo ? String(input.promo).slice(0, 30) : null,
      ts: Date.now(), // when the cart last changed: the reminder waits 60–120 minutes from here
      ordered: cur?.ordered || false, reminded: cur?.reminded || null, orderNo: cur?.orderNo || null,
    });
    const contact = await upsertContact(email, { first: input.first, consent, source: "cart", lastCartId: id });
    if (consent && !contact.resendSynced) {
      await syncContact({ email, first: contact.first, unsubscribed: false }).then(() => upsertContact(email, { resendSynced: true })).catch((e) => console.error("resend contact", e));
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Couldn't save the cart." });
  }
};
