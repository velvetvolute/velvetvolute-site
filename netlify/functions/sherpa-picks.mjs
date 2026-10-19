// "Email me my picks → 10% off your top 3" on the Scent Sherpa results.
// POST { email, first?, consent, picks: [square item id ×3], who?, website? (honeypot) }
// Stores the contact (Blobs + Resend audience), records the picks and emails "Your Sherpa picks".
// The 10% code is the sign-up offer: ONE per email, ever (codes.mjs signupOffer), 30 days, limited to the picks.
//   never had one      → new VV-SHERPA code on these picks
//   live Sherpa code   → re-issued on the NEW picks, keeping the original expiry (re-taking the quiz never extends it)
//   live welcome code  → no new code; the email shows the welcome code (it works on any decant)
//   used/expired/customer → picks only, no code. 5 per IP per hour.
import { allowed, upsertContact, getContact, EMAIL_RE, normEmail, clip, firstName, canMarket, addDrops, SIGNUP_DROPS } from "../lib/store.mjs";
import { syncContact } from "../lib/resend.mjs";
import { issueCode, retireCode, signupOffer, SIGNUP_DAYS, DAY } from "../lib/codes.mjs";
import { bySq, inStock } from "../lib/scents.mjs";
import { sherpaPicksEmail } from "../lib/emails.mjs";
import { sendMail, MARKETING_FROM, unsubscribeUrl, SITE } from "../lib/mail.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || !process.env.RESEND_API_KEY) return json(500, { error: "Email isn't set up yet. Screenshot your picks for now, or email velvetvolute@gmail.com." });
  let input; try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  if (input.website) return json(200, { ok: true });
  const email = normEmail(input.email);
  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });
  const first = firstName(input.first);
  const consent = input.consent === true;
  const picks = [...new Set((Array.isArray(input.picks) ? input.picks : []).map(String))].map(bySq).filter((p) => p && inStock(p)).slice(0, 3);
  if (!picks.length) return json(400, { error: "Your picks didn't come through. Try the Sherpa once more." });
  if (!(await allowed(req, "sherpa", 5))) return json(429, { error: "Too many requests from this connection. Try again in a little while." });
  const who = ["him", "her", "all"].includes(input.who) ? input.who : undefined;

  try {
    const prev = await getContact(email);
    const offer = await signupOffer(prev);
    let code = null, codeKind = "sherpa", starterDrops = 0;
    if (offer.state === "none" && SIGNUP_DROPS > 0) { await addDrops(email, SIGNUP_DROPS, "signup"); starterDrops = SIGNUP_DROPS; }
    if (offer.state === "none" || (offer.state === "active" && offer.kind === "sherpa")) {
      const days = offer.state === "active" ? Math.max(1, (offer.rec.expiresAt - Date.now()) / DAY) : SIGNUP_DAYS;
      if (offer.state === "active") await retireCode(offer.code, token, { force: true }).catch(() => {});
      code = await issueCode({ kind: "sherpa", email, prefix: "VV-SHERPA", percent: 10, variationIds: picks.map((p) => p.sq), days }, token);
    } else if (offer.state === "active") { code = { code: offer.code, expiresAt: offer.rec.expiresAt }; codeKind = "welcome"; }
    const contact = await upsertContact(email, {
      first, consent, source: "sherpa", picks: picks.map((p) => p.sq), picksAt: Date.now(),
      ...(code && codeKind === "sherpa" ? { codes: { sherpa: code.code } } : {}), seg: { who: who === "all" ? "anyone" : who, families: [...new Set(picks.flatMap((p) => [p.cat, p.cat2].filter(Boolean)))], houses: [...new Set(picks.map((p) => p.brand))] },
    });
    await syncContact({ email, first: contact.first, unsubscribed: !canMarket(contact) }).catch((e) => console.error("resend contact", e));
    const shopUrl = `${SITE}/?picks=${picks.map((p) => p.sq).join(",")}#shop`;
    const unsubUrl = await unsubscribeUrl(email);
    const m = sherpaPicksEmail({ first: contact.first, picks, code: code?.code || null, expiresAt: code?.expiresAt || null, codeKind, shopUrl, unsubUrl, who, starterDrops });
    // The picks email is something they asked for (a code), so it goes regardless of the marketing tick;
    // the footer still carries the unsubscribe link.
    await sendMail({ from: MARKETING_FROM, to: email, subject: m.subject, html: m.html, text: m.text, unsubUrl, tags: [{ name: "kind", value: "sherpa-picks" }] });
    return json(200, { ok: true, code: !!code, again: offer.state !== "none", expiresAt: code?.expiresAt || null });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Couldn't send your picks right now. Please try again, or email velvetvolute@gmail.com." });
  }
};
