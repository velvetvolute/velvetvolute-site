// One-click unsubscribe. GET or POST /.netlify/functions/unsubscribe?e=<email>&t=<token>
// The token is an HMAC of the email (netlify/lib/mail.mjs unsubToken). Flips the contact's flag in
// Blobs and marks the Resend contact unsubscribed. POST (RFC 8058 one-click from Gmail / Apple Mail)
// returns 200 with no body; GET shows a small confirmation page.
import { unsubscribe, normEmail, EMAIL_RE } from "../lib/store.mjs";
import { unsubscribeContact } from "../lib/resend.mjs";
import { unsubToken } from "../lib/mail.mjs";
import { unsubscribePage } from "../lib/emails.mjs";

const page = (status, html) => new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const email = normEmail(url.searchParams.get("e"));
  const t = String(url.searchParams.get("t") || "");
  const ok = EMAIL_RE.test(email) && t.length >= 16 && t === (await unsubToken(email));
  const isPost = req.method === "POST";
  if (!ok) return isPost ? new Response("bad token", { status: 400 }) : page(400, unsubscribePage({ ok: false }));
  let already = false;
  try { already = await unsubscribe(email); } catch (e) { console.error("unsubscribe blobs", e); }
  await unsubscribeContact(email).catch((e) => console.error("unsubscribe resend", e));
  return isPost ? new Response("", { status: 200 }) : page(200, unsubscribePage({ ok: true, email, already }));
};
