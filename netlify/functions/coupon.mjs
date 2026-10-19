// Checks a promo code for the cart on velvetvolute.ca (read-only). GET /.netlify/functions/coupon?code=ABC10
// Codes issued by email can be limited to certain scents or sizes: `only` lists them as { sq, v } pairs
// (v = Square variation name in lower case, or null for any size) so the cart can estimate the discount.
import { sq, normalizeCode, CODE_RE } from "../lib/square.mjs";
import { resolveCoupon } from "../lib/codes.mjs";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Translate the restriction set (item or variation ids) into { sq, v } the cart understands.
async function onlyFor(ids, token) {
  const list = [...ids];
  const { objects = [] } = await sq("/catalog/batch-retrieve", token, { object_ids: list, include_related_objects: false }).catch(() => ({ objects: [] }));
  const out = [];
  for (const o of objects) {
    if (o.is_deleted) continue;
    if (o.type === "ITEM") out.push({ sq: o.id, v: null });
    else if (o.type === "ITEM_VARIATION") out.push({ sq: o.item_variation_data?.item_id, v: (o.item_variation_data?.name || "").toLowerCase().replace(/\s+/g, " ").trim() });
  }
  return out;
}

export default async (req) => {
  const code = normalizeCode(new URL(req.url).searchParams.get("code"));
  if (!CODE_RE.test(code)) return json(400, { ok: false, error: "Please enter a valid promo code." });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return json(500, { ok: false, error: "Promo codes aren't set up yet." });
  try {
    const c = await resolveCoupon(code, token);
    if (!c) return json(404, { ok: false, error: "That promo code isn't valid or has already been used." });
    if (c.expired) return json(410, { ok: false, error: "That promo code has expired." });
    const only = c.ids ? await onlyFor(c.ids, token) : null;
    return json(200, { ok: true, code, pct: c.pct, cents: c.cents, only, expiresAt: c.expiresAt || null });
  } catch (e) {
    console.error(e);
    return json(502, { ok: false, error: "Couldn't check that code right now. You can also enter it at checkout." });
  }
};
