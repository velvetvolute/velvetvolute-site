// Order confirmation for velvetvolute.ca/thanks.html.
// Square sends the buyer back with ?orderId=... after payment. This looks the order up in Square,
// returns a short summary (no names, addresses or card details), and, the first time a paid order
// is confirmed, pings Justin's phone through ntfy (set NTFY_TOPIC in Netlify to turn that on).
const SQUARE = "https://connect.squareup.com/v2";
const VERSION = "2024-10-17";
const LOCATION_ID = process.env.SQUARE_LOCATION_ID || "LQAEH3F1YK86M";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const cents = (m) => Number(m?.amount || 0);
const money = (c) => "$" + (c / 100).toFixed(2);

// Orders placed since this update carry their VV number in reference_id ("VV-K7Q4M2 PICKUP").
// Older ones get a number built from the end of Square's order ID, so every order has one.
export function orderNumber(order) {
  const m = /\bVV-[A-Z0-9]{6}\b/.exec(order.reference_id || "");
  return m ? m[0] : "VV-" + String(order.id || "").slice(-7, -1).toUpperCase();
}

export function methodOf(order) {
  const ref = (order.reference_id || "").toUpperCase();
  if (ref.includes("PICKUP")) return "pickup";
  if (ref.includes("LOCAL")) return "local";
  if (ref.includes("CANADA") || ref.includes("ONQC") || ref.includes("ROC")) return "ship";
  return "unknown";
}

export function summarize(order) {
  const items = (order.line_items || []).map((li) => ({
    name: li.name || "Item",
    variation: li.variation_name || "",
    qty: Number(li.quantity || 1),
    total: cents(li.total_money),
  }));
  const charges = (order.service_charges || []).map((s) => ({ name: s.name || "Shipping", total: cents(s.total_money) }));
  const paid = (order.tenders || []).length > 0 && cents(order.net_amount_due_money) === 0;
  return {
    no: orderNumber(order),
    paid,
    method: methodOf(order),
    placed: order.created_at,
    items,
    charges,
    discount: cents(order.total_discount_money),
    tax: cents(order.total_tax_money),
    total: cents(order.total_money),
  };
}

async function notify(s) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  // the Square webhook already sends the full alert (with customer details); don't double-ping
  if (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) return true;
  const how = s.method === "pickup" ? "Ottawa pickup" : s.method === "local" ? "Local hand delivery" : s.method === "ship" ? "Shipping" : "";
  const lines = s.items.map((i) => `${i.qty}× ${i.name}${i.variation ? ` (${i.variation})` : ""}`);
  try {
    const r = await fetch("https://ntfy.sh/" + encodeURIComponent(topic), {
      method: "POST",
      headers: { Title: `New order ${s.no} · ${money(s.total)}`, Priority: "high", Tags: "shopping_bags" },
      body: [how, ...lines].filter(Boolean).join("\n"),
    });
    return r.ok;
  } catch { return false; }
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!/^[A-Za-z0-9]{20,40}$/.test(id)) return json(400, { error: "Missing order" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return json(500, { error: "Not configured" });

  try {
    const r = await fetch(`${SQUARE}/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}`, "Square-Version": VERSION },
    });
    if (r.status === 404) return json(404, { error: "Order not found" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.order) throw new Error(`Square ${r.status}: ${JSON.stringify(data.errors || data).slice(0, 300)}`);
    const order = data.order;
    if (order.location_id !== LOCATION_ID) return json(404, { error: "Order not found" });

    const s = summarize(order);
    // Only alert for paid orders placed in the last 2 hours, so an old link can't re-send alerts.
    const fresh = Date.now() - Date.parse(order.created_at || 0) < 2 * 60 * 60 * 1000;
    if (url.searchParams.get("notify") === "1" && s.paid && fresh) await notify(s);
    return json(200, s);
  } catch (e) {
    console.error(e);
    return json(502, { error: "Couldn't load the order" });
  }
};
