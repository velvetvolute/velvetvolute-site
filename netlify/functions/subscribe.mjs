// "10% off your first decant" sign-up (bottom-right card on the homepage, /subscribe page, link in bio).
// POST { email, first?, consent, source?, website? (honeypot) }
// Stores the contact in Blobs + the Resend audience and sends welcome email #1 with the sign-up offer:
// ONE 10% code per email, ever, shared with the Sherpa capture (codes.mjs signupOffer). A live code is re-sent,
// never doubled; a used or expired one, or an existing customer, gets the welcome without a code. 30 days.
// Welcome #2 and #3 follow from drip.mjs for contacts who ticked "first dibs".
import { allowed, upsertContact, getContact, EMAIL_RE, normEmail, firstName, canMarket } from "../lib/store.mjs";
import { syncContact } from "../lib/resend.mjs";
import { issueCode, signupOffer, SIGNUP_DAYS } from "../lib/codes.mjs";
import { welcome1Email } from "../lib/emails.mjs";
import { sendMail, MARKETING_FROM, unsubscribeUrl } from "../lib/mail.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || !process.env.RESEND_API_KEY) return json(500, { error: "Sign-up isn't set up yet. Email velvetvolute@gmail.com and I'll send your code by hand." });
  let input; try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  if (input.website) return json(200, { ok: true });
  const email = normEmail(input.email);
  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });
  if (!(await allowed(req, "subscribe", 5))) return json(429, { error: "Too many sign-ups from this connection. Try again in a little while." });
  const first = firstName(input.first);
  const consent = input.consent === true;
  const source = /^[a-z-]{2,20}$/.test(String(input.source || "")) ? input.source : "signup";
  try {
    const prev = await getContact(email);
    const offer = await signupOffer(prev);
    let code = null, expiresAt = null, codeWhat, codeNote;
    if (offer.state === "none") {
      const c = await issueCode({ kind: "welcome", email, prefix: "VV-HELLO", percent: 10, days: SIGNUP_DAYS }, token); code = c.code; expiresAt = c.expiresAt;
    } else if (offer.state === "active") {
      // already holds the sign-up code: send the same one again (they may have lost the email), never a second
      code = offer.code; expiresAt = offer.rec.expiresAt;
      if (offer.kind === "sherpa") { codeWhat = "Your 10% code from the Scent Sherpa"; codeNote = "One per person, so this is the one you already have. One use, on your three Sherpa picks."; }
      else codeNote = "One per person, so this is the one you already have. One use, on any decant.";
    }
    const contact = await upsertContact(email, { first, consent, source, ...(offer.state === "none" ? { codes: { welcome: code } } : {}), welcome: { 1: prev?.welcome?.[1] || Date.now() } });
    await syncContact({ email, first: contact.first, unsubscribed: !canMarket(contact) }).catch((e) => console.error("resend contact", e));
    const unsubUrl = await unsubscribeUrl(email);
    const m = welcome1Email({ first: contact.first, code, expiresAt, unsubUrl, codeWhat, codeNote });
    await sendMail({ from: MARKETING_FROM, to: email, subject: offer.state === "active" ? "Your Velvet Volute code (again)" : m.subject, html: m.html, text: m.text, unsubUrl, tags: [{ name: "kind", value: "welcome-1" }] });
    return json(200, { ok: true, code: offer.state !== "spent", again: offer.state !== "none", expiresAt });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Couldn't sign you up right now. Please try again, or email velvetvolute@gmail.com." });
  }
};
