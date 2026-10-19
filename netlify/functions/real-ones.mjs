// The Real Ones punch card: "Choose your free 5 ml" (/the-real-ones?claim=TOKEN).
// GET  ?claim=TOKEN         → { first, capCents, used, options: [{ vid, sq, brand, name, img, vial, label, cents, overCap }] }
//                             every in-stock 5 ml (Classic, Luxury, Roll-on), prices from Square
// POST { claim, vid }       → creates the one-time code (100% off that variation, or $CAP off it when it
//                             costs more than the cap), emails it, marks the claim used. Never returns the code.
import { stores, getJSON, allowed, getContact, upsertContact } from "../lib/store.mjs";
import { itemVariations } from "../lib/square.mjs";
import { issueCode, PUNCH_REWARD_CAP_CENTS } from "../lib/codes.mjs";
import { PRODUCTS, inStock, imgFor, vialLabel, parseVariation, bySq } from "../lib/scents.mjs";
import { punchCodeEmail } from "../lib/emails.mjs";
import { sendMail, MARKETING_FROM, MAIL_COPY } from "../lib/mail.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const TOKEN_RE = /^[a-z0-9]{20,40}$/;

async function options(token) {
  const items = PRODUCTS.filter(inStock);
  const vars = await itemVariations(items.map((p) => p.sq), token);
  const out = [];
  for (const p of items) {
    for (const v of Object.values(vars[p.sq] || {})) {
      const { ml, vial } = parseVariation(v.name);
      if (ml !== 5) continue;
      out.push({ vid: v.id, sq: p.sq, brand: p.brand, name: p.short, img: imgFor(p, vial), vial, label: v.name, cents: v.cents, overCap: v.cents > PUNCH_REWARD_CAP_CENTS });
    }
  }
  const order = { classic: 0, luxe: 1, roll: 2 };
  return out.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name) || order[a.vial] - order[b.vial]);
}

export default async (req) => {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return json(500, { error: "Not configured" });
  if (req.method === "GET") {
    const t = String(new URL(req.url).searchParams.get("claim") || "");
    if (!TOKEN_RE.test(t)) return json(400, { error: "That link is missing its claim code." });
    const claim = await getJSON(stores.claims(), t);
    if (!claim) return json(404, { error: "That claim link isn't valid." });
    if (!(await allowed(req, "claim", 30))) return json(429, { error: "Slow down a little." });
    try {
      return json(200, { first: claim.first || "", capCents: claim.capCents || PUNCH_REWARD_CAP_CENTS, used: !!claim.used, usedFor: claim.usedFor || null, options: claim.used ? [] : await options(token) });
    } catch (e) { console.error(e); return json(502, { error: "Couldn't load the collection right now." }); }
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!process.env.RESEND_API_KEY) return json(500, { error: "Email isn't set up yet." });
  let input; try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const t = String(input.claim || ""), vid = String(input.vid || "");
  if (!TOKEN_RE.test(t) || !/^[A-Z0-9]{10,40}$/.test(vid)) return json(400, { error: "Bad request" });
  if (!(await allowed(req, "claim-post", 10))) return json(429, { error: "Slow down a little." });
  const s = stores.claims();
  const claim = await getJSON(s, t);
  if (!claim) return json(404, { error: "That claim link isn't valid." });
  if (claim.used) return json(409, { error: "This reward was already claimed. The code is in your inbox." });
  try {
    const opt = (await options(token)).find((o) => o.vid === vid);
    if (!opt) return json(400, { error: "That size isn't available right now. Pick another." });
    const cap = claim.capCents || PUNCH_REWARD_CAP_CENTS;
    const overCap = opt.cents > cap;
    const code = await issueCode({ kind: "punch", email: claim.email, prefix: "VV-FREE5", ...(overCap ? { amountCents: cap } : { percent: 100 }), variationIds: [vid], days: 90 }, token);
    await s.setJSON(t, { ...claim, used: true, usedAt: Date.now(), usedFor: `${opt.brand} ${opt.name} · ${opt.label}`, code: code.code });
    const p = bySq(opt.sq);
    const contact = await getContact(claim.email);
    await upsertContact(claim.email, { codes: { punch: code.code }, punchClaimed: (contact?.punchClaimed || 0) + 1 }).catch(() => {});
    // the claim is spent: clear it from the punch record so the enjoy email stops linking to it
    const pr = stores.punches(); const pj = await getJSON(pr, claim.email); if (pj) { delete pj.claim; await pr.setJSON(claim.email, pj); }
    const m = punchCodeEmail({ first: claim.first || contact?.first || "", code: code.code, expiresAt: code.expiresAt, p, variation: opt.label, overCap, capCents: cap, price: opt.cents / 100 });
    await sendMail({ from: MARKETING_FROM, to: claim.email, bcc: [MAIL_COPY], subject: m.subject, html: m.html, text: m.text, tags: [{ name: "kind", value: "punch-code" }] });
    return json(200, { ok: true, overCap, pay: overCap ? (opt.cents - cap) / 100 : 0 });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Couldn't create your code right now. Try again, or email velvetvolute@gmail.com." });
  }
};
