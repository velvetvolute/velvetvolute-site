// Tiny admin endpoint for Justin, linked from the shop copy of each order confirmation.
//   /.netlify/functions/mark-shipped?order=VV-XXXX&key=ADMIN_KEY
//       shipped order → sends "Your order is on its way" and queues "Enjoy your order" for 5 days later;
//       pickup / local order → sends "Enjoy your order" now. Same as marking the fulfillment complete in Square.
//   …&pick=<square item id>&only=pick
//       records which Sherpa's pick (1 ml surprise) he poured, so the enjoy email can name it.
import { getStore } from "@netlify/blobs";
import { sq, LOCATION_ID } from "../lib/square.mjs";
import { sendEnjoy } from "../lib/enjoy.mjs";
import { stores, getJSON } from "../lib/store.mjs";
import { bySq, fullName } from "../lib/scents.mjs";

const page = (status, title, body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#4a0e1e;color:#e8d3b4;font:300 17px/1.6 -apple-system,system-ui,sans-serif;padding:24px"><main style="max-width:440px;text-align:center"><div style="width:56px;height:56px;margin:0 auto 16px;border:1px solid #d6b077;border-radius:50%;display:grid;place-items:center;font:italic 22px Georgia,serif;color:#d6b077">VV</div><h1 style="font:400 30px/1.15 Georgia,serif;margin:0 0 10px">${title}</h1><p>${body}</p></main>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// Find the Square order for a VV number: the webhook's record first, then the last 90 days of orders.
async function findOrder(no, token) {
  const rec = await getJSON(stores.paid(), no);
  if (rec?.orderId) return rec.orderId;
  const body = { location_ids: [LOCATION_ID], limit: 500, query: { filter: { date_time_filter: { created_at: { start_at: new Date(Date.now() - 90 * 864e5).toISOString() } } }, sort: { sort_field: "CREATED_AT", sort_order: "DESC" } } };
  let cursor;
  do {
    const r = await sq("/orders/search", token, cursor ? { ...body, cursor } : body);
    const hit = (r.orders || []).find((o) => (o.reference_id || "").includes(no));
    if (hit) return hit.id;
    cursor = r.cursor;
  } while (cursor);
  return null;
}

export default async (req) => {
  const url = new URL(req.url);
  const key = process.env.ADMIN_KEY;
  if (!key || url.searchParams.get("key") !== key) return page(401, "Not for you", "This link needs the shop's admin key.");
  const no = String(url.searchParams.get("order") || "").toUpperCase().trim();
  if (!/^VV-[A-Z0-9]{6}$/.test(no)) return page(400, "Which order?", "Add <code>?order=VV-XXXXXX</code> to the link.");
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return page(500, "Not configured", "SQUARE_ACCESS_TOKEN is missing in Netlify.");

  const pick = String(url.searchParams.get("pick") || "");
  if (pick) {
    const p = bySq(pick);
    if (!p) return page(400, "Unknown scent", `No scent with Square id ${pick}.`);
    const rec = (await getJSON(stores.paid(), no)) || { orderNo: no };
    await stores.paid().setJSON(no, { ...rec, pick: p.name, pickAt: Date.now() });
    if (url.searchParams.get("only") === "pick") return page(200, "Noted", `${fullName(p)} is the Sherpa's pick for ${no}. The enjoy email will name it.`);
  }

  try {
    const orderId = await findOrder(no, token);
    if (!orderId) return page(404, "Order not found", `${no} isn't in Square yet, or is older than 90 days.`);
    const { modified } = await getStore("vv-orders").set("enjoy-" + orderId, new Date().toISOString(), { onlyIfNew: true });
    if (!modified) return page(200, "Already done", `${no} already had its on-its-way / enjoy email. Nothing was sent again.`);
    const result = await sendEnjoy(orderId, token);
    if (result === "shipped") await getStore("vv-enjoy-queue").setJSON(orderId, { due: Date.now() + 5 * 864e5 }).catch((e) => console.error(e));
    return page(200, result === "shipped" ? "On its way" : "Enjoy sent", result === "shipped" ? `${no}: the customer has the "on its way" email. "Enjoy your order" follows in five days.` : `${no}: the customer has the "Enjoy your order" email.`);
  } catch (e) {
    console.error(e);
    return page(500, "Didn't work", String(e.message || e).slice(0, 200));
  }
};
