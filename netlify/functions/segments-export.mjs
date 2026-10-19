// Admin: every contact with its segments as CSV, for targeting Resend Broadcasts.
//   /.netlify/functions/segments-export?key=ADMIN_KEY            all contacts
//   …&consent=1                                                 only contacts who may receive marketing
//   …&format=json                                               JSON instead of CSV
// Segments (Blobs vv-contacts → seg): houses bought, families (cat/cat2), who (him/her/anyone, from the
// Sherpa), fulfil (pickup/local/ship), orders, decants, repeat, lastScent, punches.
import { stores, listAll, getJSON, canMarket, getPunches } from "../lib/store.mjs";

const COLS = ["email", "first", "consent", "unsubscribed", "created", "sources", "who", "houses", "families", "fulfil", "orders", "decants", "repeat", "first_time", "last_scent", "last_order", "punches", "picks", "welcome_stage", "codes"];
const csv = (v) => { const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

export default async (req) => {
  const url = new URL(req.url);
  const key = process.env.ADMIN_KEY;
  if (!key || url.searchParams.get("key") !== key) return new Response("unauthorized", { status: 401 });
  const onlyConsent = url.searchParams.get("consent") === "1";
  const s = stores.contacts();
  const rows = [];
  for (const { key: email } of await listAll(s)) {
    const c = await getJSON(s, email);
    if (!c || (onlyConsent && !canMarket(c))) continue;
    const seg = c.seg || {}, w = c.welcome || {};
    const p = await getPunches(email).catch(() => ({ punches: 0 }));
    rows.push({
      email, first: c.first || "", consent: c.consent ? "yes" : "no", unsubscribed: c.unsubscribed ? "yes" : "no", created: day(c.created), sources: c.sources || [],
      who: seg.who || "", houses: seg.houses || [], families: seg.families || [], fulfil: seg.fulfil || [], orders: seg.orders || 0, decants: seg.decants || 0,
      repeat: (seg.orders || 0) > 1 ? "yes" : "no", first_time: (seg.orders || 0) === 1 ? "yes" : "no", last_scent: seg.lastScent || "", last_order: day(seg.lastOrderAt),
      punches: p.punches || 0, picks: (c.picks || []).length, welcome_stage: w[3] ? 3 : w[2] ? 2 : w[1] ? 1 : 0, codes: Object.entries(c.codes || {}).map(([k, v]) => `${k}:${v}`),
    });
  }
  if (url.searchParams.get("format") === "json") return new Response(JSON.stringify(rows), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const out = [COLS.join(","), ...rows.map((r) => COLS.map((k) => csv(r[k])).join(","))].join("\n");
  return new Response(out, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="velvet-volute-contacts-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
};
