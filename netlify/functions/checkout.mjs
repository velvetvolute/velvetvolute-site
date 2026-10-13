// Creates a Square-hosted checkout for the cart on velvetvolute.ca.
// Prices always come from the Square catalogue, never from the browser.
const SQUARE = "https://connect.squareup.com/v2";
const VERSION = "2024-10-17";
const LOCATION_ID = process.env.SQUARE_LOCATION_ID || "LQAEH3F1YK86M";
const SITE = process.env.SITE_URL || "https://velvetvolute.ca";
const FREE_SHIPPING_CENTS = 8500;
const SHIPPING = {
  pickup: { cents: 0, label: "Ottawa pickup" },
  onqc: { cents: 1800, label: "Shipping (Ontario & Quebec)" },
  roc: { cents: 2300, label: "Shipping (rest of Canada)" },
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

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sq(path, token, body) {
  const r = await fetch(SQUARE + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Square-Version": VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Square ${path} ${r.status}: ${JSON.stringify(data.errors || data).slice(0, 400)}`);
  return data;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return json(500, { error: "Checkout is not configured yet." });

  let input;
  try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const items = Array.isArray(input.items) ? input.items.slice(0, 40) : [];
  const ship = SHIPPING[input.ship] ? input.ship : null;
  if (!items.length || !ship) return json(400, { error: "Your cart is empty or no delivery option was chosen." });

  try {
    const ids = [...new Set(items.map((i) => String(i.sq || "")).filter((s) => /^[A-Z0-9]{10,40}$/.test(s)))];
    if (!ids.length) return json(400, { error: "Unknown items in cart." });
    const { objects = [] } = await sq("/catalog/batch-retrieve", token, { object_ids: ids, include_related_objects: false });
    const variations = {};
    for (const o of objects) {
      if (o.type !== "ITEM" || o.is_deleted) continue;
      for (const v of o.item_data?.variations || []) {
        const name = (v.item_variation_data?.name || "").toLowerCase().replace(/\s+/g, " ").trim();
        variations[`${o.id}|${name}`] = { id: v.id, cents: Number(v.item_variation_data?.price_money?.amount || 0) };
      }
    }

    const [spot, zod] = await Promise.all([loadSpotlight(req), loadZodiac(req)]);
    const lineItems = [];
    const discounts = [];
    let subtotal = 0;
    for (const it of items) {
      const key = `${it.sq}|${String(it.v || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
      const v = variations[key];
      const qty = Math.max(1, Math.min(10, parseInt(it.q, 10) || 1));
      if (!v) return json(400, { error: `"${it.label || it.v}" is no longer available. Please remove it and try again.` });
      const deal = spot && spot.ids.has(String(it.sq)) ? { pct: spot.pct, name: `${spot.label} Spotlight ${spot.pct}% off`.trim() }
        : zod && zod.sq === String(it.sq) ? { pct: zod.pct, name: `${zod.label} ${zod.pct}% off` } : null;
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

    const shipCents = ship === "pickup" || subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING[ship].cents;
    const checkout_options = {
      ask_for_shipping_address: ship !== "pickup",
      redirect_url: `${SITE}/thanks.html`,
      merchant_support_email: "velvetvolute@gmail.com",
      allow_tipping: false,
      accepted_payment_methods: { apple_pay: true, google_pay: true },
    };
    if (shipCents > 0) checkout_options.shipping_fee = { name: SHIPPING[ship].label, charge: { amount: shipCents, currency: "CAD" } };

    const note =
      ship === "pickup"
        ? "Ottawa pickup: I'll email you to set a time."
        : shipCents === 0
          ? `${SHIPPING[ship].label}: free (order over $85)`
          : SHIPPING[ship].label;

    const link = await sq("/online-checkout/payment-links", token, {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: LOCATION_ID,
        line_items: lineItems,
        ...(discounts.length ? { discounts } : {}),
        pricing_options: { auto_apply_taxes: true },
        reference_id: ship === "pickup" ? "PICKUP" : ship.toUpperCase(),
      },
      checkout_options,
      payment_note: note,
    });
    return json(200, { url: link.payment_link?.url || link.payment_link?.long_url });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Checkout couldn't be started. Please try again, or email velvetvolute@gmail.com." });
  }
};
