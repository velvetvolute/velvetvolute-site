// Checks a promo code for the cart on velvetvolute.ca (read-only). GET /.netlify/functions/coupon?code=ABC10
import { findCoupon, normalizeCode, CODE_RE } from "../lib/square.mjs";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const code = normalizeCode(new URL(req.url).searchParams.get("code"));
  if (!CODE_RE.test(code)) return json(400, { ok: false, error: "Please enter a valid promo code." });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return json(500, { ok: false, error: "Promo codes aren't set up yet." });
  try {
    const c = await findCoupon(code, token);
    if (!c) return json(404, { ok: false, error: "That promo code isn't valid or has already been used." });
    return json(200, { ok: true, code, pct: c.pct, cents: c.cents });
  } catch (e) {
    console.error(e);
    return json(502, { ok: false, error: "Couldn't check that code right now. You can also enter it at checkout." });
  }
};
