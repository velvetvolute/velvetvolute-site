// "10% off your first decant" sign-up (bottom-right card on the homepage, /subscribe page, link in bio).
// POST { email, first?, consent, source?, website? (honeypot) }
// Stores the contact in Blobs + the Resend audience, issues a one-time 10% code (14 days) unless they
// already hold an active welcome or Sherpa code, and sends welcome email #1. Welcome #2 and #3 follow
// from drip.mjs for contacts who ticked "first dibs".
import { allowed, upsertContact, getContact, EMAIL_RE, normEmail, firstName, canMarket } from "../lib/store.mjs";
import { syncContact } from "../lib/resend.mjs";
import { issueCode, activeCode } from "../lib/codes.mjs";
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
    if (prev?.welcome?.[1] && (await activeCode(prev, "welcome"))) {
      // Already welcomed with a live code: don't mint another, just record the (possibly new) consent.
      const c = await upsertContact(email, { first, consent, source });
      await syncContact({ email, first: c.first, unsubscribed: !canMarket(c) }).catch((e) => console.error("resend contact", e));
      return json(200, { ok: true, again: true });
    }
    let code = null, expiresAt = null;
    const sherpa = await activeCode(prev, "sherpa");
    if (!sherpa) { const c = await issueCode({ kind: "welcome", email, prefix: "VV-HELLO", percent: 10, days: 14 }, token); code = c.code; expiresAt = c.expiresAt; }
    const contact = await upsertContact(email, { first, consent, source, ...(code ? { codes: { welcome: code } } : {}), welcome: { 1: Date.now() } });
    await syncContact({ email, first: contact.first, unsubscribed: !canMarket(contact) }).catch((e) => console.error("resend contact", e));
    const unsubUrl = await unsubscribeUrl(email);
    const m = welcome1Email({ first: contact.first, code, expiresAt, unsubUrl });
    await sendMail({ from: MARKETING_FROM, to: email, subject: m.subject, html: m.html, text: m.text, unsubUrl, tags: [{ name: "kind", value: "welcome-1" }] });
    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Couldn't sign you up right now. Please try again, or email velvetvolute@gmail.com." });
  }
};
