// Shared Square helpers for the Netlify functions (checkout, coupon, square-webhook).
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
// Name a discount "OPEN-…" (e.g. OPEN-LAUNCH10) to make it reusable.
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,29}$/;
export const normalizeCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
export const isReusableCode = (name) => /^OPEN-/i.test(String(name || ""));

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
