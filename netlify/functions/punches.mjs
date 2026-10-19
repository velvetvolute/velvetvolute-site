// Read-only punch-card status for an email: GET /.netlify/functions/punches?email=…
// → { punches, cycle, earned, pending, claimUrl? }  (used by /the-real-ones and the enjoy email render)
import { getPunches, allowed, normEmail, EMAIL_RE } from "../lib/store.mjs";
import { SITE } from "../lib/mail.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const email = normEmail(new URL(req.url).searchParams.get("email"));
  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });
  if (!(await allowed(req, "punches", 30))) return json(429, { error: "Slow down a little." });
  const p = await getPunches(email);
  return json(200, { drops: p.drops, cycle: p.cycle, earned: p.earned, pending: p.pending, ...(p.pending > 0 && p.claim ? { claimUrl: `${SITE}/the-real-ones?claim=${p.claim}` } : {}) });
};
