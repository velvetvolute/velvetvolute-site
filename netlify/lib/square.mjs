// Shared Square helpers for the Netlify functions (checkout, coupon, square-webhook, email codes).
export const SQUARE = "https://connect.squareup.com/v2";
export const VERSION = "2024-10-17";
export const LOCATION_ID = process.env.SQUARE_LOCATION_ID || "LQAEH3F1YK86M";

export async function sq(path, token, body, method) {
  const r = await fetch(SQUARE + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token}`, "Square-Version": VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Square ${path} ${r.status}: ${JSON.stringify(data.errors || data).slice(0, 400)}`);
  return data;
}

// Promo codes are Square catalog Discounts (Dashboard → Items & services → Discounts) whose NAME is the code.
// A code is one-time by default: the webhook deletes it after the first paid order that used it.
// Name a discount "OPEN-…" (e.g. OPEN-LAUNCH10) to make it reusable. "REF-…" codes are personal
// referral codes (see netlify/lib/codes.mjs): reusable too, and never deleted by the webhook.
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,29}$/;
export const normalizeCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
export const isReusableCode = (name) => /^(OPEN|REF)-/i.test(String(name || ""));
export const isReferralCode = (name) => /^REF-/i.test(String(name || ""));

export async function findCoupon(code, token) {
  code = normalizeCode(code);
  if (!CODE_RE.test(code)) return null;
  let cursor = "";
  do {
    const data = await sq(`/catalog/list?types=DISCOUNT${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token);
    for (const o of data.objects || []) {
      if (o.is_deleted || o.type !== "DISCOUNT") continue;
      const d = o.discount_data || {};
      if (normalizeCode(d.name) !== code) continue;
      const pct = d.discount_type === "FIXED_PERCENTAGE" ? Number(d.percentage) : 0;
      const cents = d.discount_type === "FIXED_AMOUNT" ? Number(d.amount_money?.amount || 0) : 0;
      if (!pct && !cents) return null; // variable-amount discounts can't be applied automatically
      return { id: o.id, name: d.name, pct, cents, reusable: isReusableCode(d.name) };
    }
    cursor = data.cursor || "";
  } while (cursor);
  return null;
}

// Restriction and expiry of a code, read from Square itself: the PRICING_RULE that points at the
// discount (created by createOneTimeCode) carries valid_until_date and a PRODUCT_SET of item /
// variation ids. Returns { ids: Set|null, expiresAt: ms|null } (ids null = applies to everything).
export async function couponRules(discountId, token) {
  const out = { ids: null, expiresAt: null };
  let cursor = "";
  let rule = null;
  do {
    const data = await sq(`/catalog/list?types=PRICING_RULE${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token);
    rule = (data.objects || []).find((o) => !o.is_deleted && o.pricing_rule_data?.discount_id === discountId);
    cursor = rule ? "" : data.cursor || "";
  } while (cursor);
  if (!rule) return out;
  const pr = rule.pricing_rule_data;
  if (pr.valid_until_date) out.expiresAt = Date.parse(pr.valid_until_date + "T23:59:59-04:00");
  if (pr.match_products_id) {
    const { object } = await sq(`/catalog/object/${pr.match_products_id}`, token).catch(() => ({}));
    const ps = object?.product_set_data;
    if (ps && !ps.all_products) out.ids = new Set([...(ps.product_ids_any || []), ...(ps.product_ids_all || [])]);
  }
  return out;
}

// Code letters: no 0/O/1/I so a code reads clearly on a phone (same alphabet as VV order numbers).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(prefix, len = 5) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return `${prefix}-${Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join("")}`;
}

// Square auto-applies any PRICING_RULE to POS and Square Online orders. Every rule we create is
// limited to an (empty) customer group, so it never fires on its own: velvetvolute.ca reads the rule
// as metadata (expiry, allowed items) and applies the discount itself. The group is created once.
export async function codesCustomerGroup(token) {
  const NAME = "Velvet Volute email codes (do not add customers)";
  let cursor = "";
  do {
    const data = await sq(`/customers/groups${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, token);
    const g = (data.groups || []).find((x) => x.name === NAME);
    if (g) return g.id;
    cursor = data.cursor || "";
  } while (cursor);
  const { group } = await sq("/customers/groups", token, { idempotency_key: crypto.randomUUID(), group: { name: NAME } });
  return group.id;
}

// Creates a unique one-time code: a catalog DISCOUNT named after the code, a PRODUCT_SET (the item
// or variation ids it applies to, or every product) and a PRICING_RULE tying them together with the
// expiry date. Returns { code, discountId, productSetId, pricingRuleId, expiresAt, pct, cents, variationIds }.
//   percent      e.g. 10 (percentage off the matching lines)
//   amountCents  e.g. 500 ($5 off one matching line; a fixed amount is applied to one unit only)
//   variationIds Square ITEM or ITEM_VARIATION ids the code is limited to (optional)
//   expiresAt    ms timestamp or Date (optional, default 14 days)
//   maxUsesPerOrder  kept on the rule for the record (Square has no such field; the cart applies a fixed amount once)
export async function createOneTimeCode({ prefix, percent, amountCents, variationIds, maxUsesPerOrder = 1, expiresAt, code, customerGroupId }, token) {
  if (!percent && !amountCents) throw new Error("createOneTimeCode needs percent or amountCents");
  code = normalizeCode(code || randomCode(prefix || "VV"));
  if (!CODE_RE.test(code)) throw new Error("bad code " + code);
  const until = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 14 * 864e5);
  const untilDate = until.toISOString().slice(0, 10);
  const ids = [...new Set((variationIds || []).map(String).filter((s) => /^[A-Z0-9]{10,40}$/.test(s)))];
  const group = customerGroupId || (await codesCustomerGroup(token).catch((e) => { console.error("customer group", e); return null; }));
  const discount = {
    type: "DISCOUNT", id: "#discount", present_at_all_locations: true,
    discount_data: percent
      ? { name: code, discount_type: "FIXED_PERCENTAGE", percentage: String(percent), pin_required: false, modify_tax_basis: "MODIFY_TAX_BASIS" }
      : { name: code, discount_type: "FIXED_AMOUNT", amount_money: { amount: Math.round(amountCents), currency: "CAD" }, pin_required: false, modify_tax_basis: "MODIFY_TAX_BASIS" },
  };
  const set = { type: "PRODUCT_SET", id: "#set", present_at_all_locations: true, product_set_data: { name: `${code} items`, ...(ids.length ? { product_ids_any: ids } : { all_products: true }) } };
  const rule = {
    type: "PRICING_RULE", id: "#rule", present_at_all_locations: true,
    pricing_rule_data: {
      name: `${code} (one-time${maxUsesPerOrder > 1 ? `, up to ${maxUsesPerOrder} per order` : ""})`,
      discount_id: "#discount", match_products_id: "#set", valid_until_date: untilDate,
      ...(group ? { customer_group_ids_any: [group] } : {}),
    },
  };
  const res = await sq("/catalog/batch-upsert", token, { idempotency_key: crypto.randomUUID(), batches: [{ objects: [discount, set, rule] }] });
  const map = Object.fromEntries((res.id_mappings || []).map((m) => [m.client_object_id, m.object_id]));
  return { code, discountId: map["#discount"], productSetId: map["#set"], pricingRuleId: map["#rule"], expiresAt: until.getTime(), pct: percent || 0, cents: amountCents || 0, variationIds: ids };
}

// Removes a code and the objects that came with it (discount, product set, pricing rule).
export async function deleteCode({ discountId, productSetId, pricingRuleId }, token) {
  const ids = [discountId, productSetId, pricingRuleId].filter(Boolean);
  if (!ids.length) return;
  await sq("/catalog/batch-delete", token, { object_ids: ids });
}

// Item variations of a catalog ITEM as { "classic, 10 ml": { id, cents }, ... } (keys lower-cased).
export async function itemVariations(itemIds, token) {
  const ids = [...new Set(itemIds.map(String).filter((s) => /^[A-Z0-9]{10,40}$/.test(s)))];
  if (!ids.length) return {};
  const { objects = [] } = await sq("/catalog/batch-retrieve", token, { object_ids: ids, include_related_objects: false });
  const out = {};
  for (const o of objects) {
    if (o.type !== "ITEM" || o.is_deleted) continue;
    out[o.id] = {};
    for (const v of o.item_data?.variations || []) {
      const name = (v.item_variation_data?.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      out[o.id][name] = { id: v.id, cents: Number(v.item_variation_data?.price_money?.amount || 0), name: v.item_variation_data?.name || "" };
    }
  }
  return out;
}
