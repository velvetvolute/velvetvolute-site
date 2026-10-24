// Prices a velvetvolute.ca cart against the Square catalogue, for both ways of paying:
// checkout.mjs (card, Square-hosted checkout) and etransfer.mjs (Interac e-Transfer).
// Prices always come from Square and the site's JSON files, never from the browser.
import { sq, normalizeCode } from "./square.mjs";
import { resolveCoupon } from "./codes.mjs";

export const BOOKING_URL = "https://calendar.app.google/9Gg9gioRktiA5eocA";
export const DELIVERY_BOOKING_URL = process.env.DELIVERY_BOOKING_URL || BOOKING_URL;
export const FREE_SHIPPING_CENTS = 8500;
export const LOCAL_FREE_CENTS = 6500; // free local delivery (Ottawa incl. Orléans, Kanata, Barrhaven) at $65+
export const OTTAWA_PC = /^K(1[A-Z]|2[A-Z]|4A)\s?\d[A-Z]\d$/i;
export const SHIPPING = {
  pickup: { cents: 0, label: "Ottawa pickup" },
  local: { cents: 0, label: "Local hand delivery (Ottawa)" },
  canada: { cents: 900, label: "Shipping (Canada-wide, tracked)" },
  // carts saved before the flat rate still send these; same flat $9
  onqc: { cents: 900, label: "Shipping (Canada-wide, tracked)" },
  roc: { cents: 900, label: "Shipping (Canada-wide, tracked)" },
};

// Monthly spotlight: same spotlight.json the site shows, read from this deploy, so the
// discount charged always matches the discount displayed. Prices round down to whole dollars.
async function loadSpotlight(req) {
  try {
    const r = await fetch(new URL("/spotlight.json", req.url), { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const j = await r.json();
    const now = Date.now();
    if (j.until && now > Date.parse(j.until + "T23:59:59-05:00")) return null;
    if (j.from && now < Date.parse(j.from + "T00:00:00-04:00")) return null;
    const pct = Math.max(0, Math.min(50, Number(j.pct) || 0));
    const ids = new Set((j.picks || []).map((p) => String(p.sq)));
    return pct && ids.size ? { pct, ids, label: String(j.label || "").slice(0, 30) } : null;
  } catch { return null; }
}

// Zodiac season pick: same zodiac.json as the site. Smaller discount, never stacks with the Spotlight.
async function loadZodiac(req) {
  try {
    const r = await fetch(new URL("/zodiac.json", req.url), { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const j = await r.json();
    const t = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }));
    const md = (t.getMonth() + 1) * 100 + t.getDate();
    const z = (j.signs || []).find((x) => { const a = x.from[0] * 100 + x.from[1], b = x.to[0] * 100 + x.to[1]; return a <= b ? md >= a && md <= b : md >= a || md <= b; });
    const pct = Math.max(0, Math.min(50, Number(j.pct) || 0));
    return z && z.sq && pct ? { pct, sq: String(z.sq), label: `${z.sign} season pick` } : null;
  } catch { return null; }
}

// Special Collections: same bundles.json the site shows. A set is charged as its scents' Classic
// (sizes) or Luxury (lux_sizes) prices minus pct, rounded down to whole dollars, exactly as the site displays it.
async function loadBundles(req) {
  try {
    const r = await fetch(new URL("/bundles.json", req.url), { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const j = await r.json();
    const pct = Math.max(0, Math.min(50, Number(j.pct) || 0));
    const sizes = (j.sizes || [2, 5]).map(Number);
    const luxSizes = (j.lux_sizes || []).map(Number);
    return { pct, sizes, luxSizes, list: Array.isArray(j.bundles) ? j.bundles : [] };
  } catch { return null; }
}

// Velvet Volute order number, e.g. VV-K7Q4M2 (no 0/O/1/I so it reads clearly over text or email).
const NO_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newOrderNumber() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "VV-" + Array.from(b, (x) => NO_CHARS[x % NO_CHARS.length]).join("");
}

class CartError extends Error {}
export const isCartError = (e) => e instanceof CartError;
const fail = (m) => { throw new CartError(m); };

// Returns { lineItems, discounts, subtotal, shipCents, ship, pc, coupon }.
// Throws a CartError (message safe to show the customer) when the cart can't be priced.
export async function priceCart(req, input, token) {
  const items = Array.isArray(input.items) ? input.items.slice(0, 40) : [];
  const ship = SHIPPING[input.ship] ? input.ship : null;
  if (!items.length || !ship) fail("Your cart is empty or no delivery option was chosen.");
  const pc = String(input.pc || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (ship === "local" && !OTTAWA_PC.test(pc)) fail("Local hand delivery needs an Ottawa postal code (Orléans, Kanata and Barrhaven included). Choose pickup or shipping instead.");
  const code = normalizeCode(input.coupon);

  // Promo code: a Square catalog Discount named after the code (see netlify/lib/square.mjs).
  // It stacks with Spotlight / Zodiac / Collection prices, as Justin prefers.
  // Codes issued by email (netlify/lib/codes.mjs) can be limited to certain scents or sizes and carry an
  // expiry; those only discount the matching lines (see applyCoupon below).
  let coupon = null;
  if (code) {
    coupon = await resolveCoupon(code, token);
    if (!coupon) fail("That promo code isn't valid or has already been used. Remove it to continue.");
    if (coupon.expired) fail("That promo code has expired. Remove it to continue.");
  }
  const bundles = items.some((i) => i.bundle) ? await loadBundles(req) : null;
  const setOf = (it) => (bundles ? bundles.list.find((b) => b.id === String(it.bundle)) : null);
  for (const it of items) {
    if (!it.bundle) continue;
    const b = setOf(it);
    const lux = it.s === "luxe";
    if (!b || !(lux ? bundles.luxSizes : bundles.sizes).includes(Number(it.z))) fail(`"${it.label || it.bundle}" is no longer available. Please remove it and try again.`);
  }
  const allSq = items.flatMap((i) => (i.bundle ? setOf(i).sq : [i.sq]));
  const ids = [...new Set(allSq.map((s) => String(s || "")).filter((s) => /^[A-Z0-9]{10,40}$/.test(s)))];
  if (!ids.length) fail("Unknown items in cart.");
  const { objects = [] } = await sq("/catalog/batch-retrieve", token, { object_ids: ids, include_related_objects: false });
  const variations = {};
  for (const o of objects) {
    if (o.type !== "ITEM" || o.is_deleted) continue;
    for (const v of o.item_data?.variations || []) {
      const name = (v.item_variation_data?.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      variations[`${o.id}|${name}`] = { id: v.id, item: o.id, cents: Number(v.item_variation_data?.price_money?.amount || 0) };
    }
  }

  const [spot, zod] = await Promise.all([loadSpotlight(req), loadZodiac(req)]);
  const lineItems = [];
  const discounts = [];
  let subtotal = 0;
  for (const it of items) {
    if (it.bundle) {
      const b = setOf(it), z = Number(it.z);
      const qty = Math.max(1, Math.min(10, parseInt(it.q, 10) || 1));
      const vs = b.sq.map((id) => variations[`${id}|${it.s === "luxe" ? "luxury" : "classic"}, ${z} ml`]);
      if (vs.some((v) => !v)) fail(`"${b.name}" is no longer available. Please remove it and try again.`);
      const sum = vs.reduce((a, v) => a + v.cents, 0);
      const sale = Math.floor((sum * (100 - bundles.pct)) / 100 / 100) * 100;
      const top = vs.reduce((m, v, k) => (v.cents > vs[m].cents ? k : m), 0);
      for (let n = 0; n < qty; n++) {
        const uid = `set${discounts.length + 1}`;
        if (sum > sale) discounts.push({ uid, name: `${b.name} ${bundles.pct}% off`, type: "FIXED_AMOUNT", amount_money: { amount: sum - sale, currency: "CAD" }, scope: "LINE_ITEM" });
        vs.forEach((v, k) => lineItems.push(k === top && sum > sale ? { catalog_object_id: v.id, quantity: "1", applied_discounts: [{ discount_uid: uid }] } : { catalog_object_id: v.id, quantity: "1" }));
      }
      subtotal += sale * qty;
      continue;
    }
    const key = `${it.sq}|${String(it.v || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
    const v = variations[key];
    const qty = Math.max(1, Math.min(10, parseInt(it.q, 10) || 1));
    if (!v) fail(`"${it.label || it.v}" is no longer available. Please remove it and try again.`);
    // Spotlight and Zodiac never stack: the bigger discount wins (Spotlight on a tie), same rule as the site
    const sD = spot && spot.ids.has(String(it.sq)) ? { pct: spot.pct, name: `${spot.label} Spotlight ${spot.pct}% off`.trim() } : null;
    const zD = zod && zod.sq === String(it.sq) ? { pct: zod.pct, name: `${zod.label} ${zod.pct}% off` } : null;
    const deal = sD && (!zD || sD.pct >= zD.pct) ? sD : zD;
    if (deal) {
      // one line per unit so each fixed discount applies to exactly one vial
      const sale = Math.floor((v.cents * (100 - deal.pct)) / 100 / 100) * 100;
      for (let n = 0; n < qty; n++) {
        const uid = `spot${discounts.length + 1}`;
        discounts.push({ uid, name: deal.name, type: "FIXED_AMOUNT", amount_money: { amount: v.cents - sale, currency: "CAD" }, scope: "LINE_ITEM" });
        lineItems.push({ catalog_object_id: v.id, quantity: "1", applied_discounts: [{ discount_uid: uid }] });
      }
      subtotal += sale * qty;
    } else {
      lineItems.push({ catalog_object_id: v.id, quantity: String(qty) });
      subtotal += v.cents * qty;
    }
  }

  // Free shipping is judged on the subtotal before the promo code, so a code never costs anyone free shipping.
  if (ship === "local" && subtotal < LOCAL_FREE_CENTS) fail("Local hand delivery is free on orders of $65 or more. Add a little more, or choose pickup or shipping.");
  const shipCents = ship === "pickup" || ship === "local" || subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING[ship].cents;
  if (coupon) applyCoupon(coupon, lineItems, discounts, variations);
  return { lineItems, discounts, subtotal, shipCents, ship, pc, coupon };
}

// A plain code discounts the whole order. A restricted code (its PRODUCT_SET names items or variations)
// is attached line by line: a percentage to every matching line, a fixed amount to one matching unit
// only (Square applies a LINE_ITEM fixed amount to each line it is attached to).
function applyCoupon(coupon, lineItems, discounts, variations) {
  if (!coupon.ids) { discounts.push({ uid: "promo", catalog_object_id: coupon.id, scope: "ORDER" }); return; }
  const byVid = Object.fromEntries(Object.values(variations).map((v) => [v.id, v]));
  const matches = (li) => { const v = byVid[li.catalog_object_id]; return !!v && (coupon.ids.has(v.id) || coupon.ids.has(v.item)); };
  const hits = lineItems.map((li, k) => (matches(li) ? k : -1)).filter((k) => k >= 0);
  if (!hits.length) fail(`Code ${coupon.name} only applies to certain scents or sizes, and none of them are in your cart. Remove it to continue.`);
  discounts.push({ uid: "promo", catalog_object_id: coupon.id, scope: "LINE_ITEM" });
  const attach = (li) => { li.applied_discounts = [...(li.applied_discounts || []), { discount_uid: "promo" }]; };
  if (coupon.pct) { hits.forEach((k) => attach(lineItems[k])); return; }
  // fixed amount: the priciest matching unit, split off its line when the quantity is more than one
  const k = hits.sort((a, b) => byVid[lineItems[b].catalog_object_id].cents - byVid[lineItems[a].catalog_object_id].cents)[0];
  const li = lineItems[k], qty = Number(li.quantity || 1);
  if (qty > 1) { li.quantity = String(qty - 1); const one = { ...li, quantity: "1", applied_discounts: [...(li.applied_discounts || [])] }; lineItems.splice(k + 1, 0, one); attach(one); }
  else attach(li);
}

export function refFor(orderNo, { ship, pc, coupon }, extra = "") {
  return `${orderNo} ${ship === "pickup" ? "PICKUP" : ship === "local" ? `LOCAL ${pc.replace(" ", "")}` : ship.toUpperCase()}${extra}${coupon ? ` CODE:${coupon.name}` : ""}`;
}
