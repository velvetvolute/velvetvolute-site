// Hourly drip: the welcome series (#1 for opted-in contacts who haven't had it, #2 at day 3, #3 at
// day 7), the 21-day "loved the 2 ml?" follow-ups queued by the enjoy email, and a sweep that removes
// expired codes from the Square catalogue. Schedule lives in netlify.toml.
import { stores, listAll, getJSON, upsertContact, canMarket, forgetCode } from "../lib/store.mjs";
import { issueCode, activeCode, DAY, signupOffer, SIGNUP_DAYS } from "../lib/codes.mjs";
import { deleteCode, itemVariations } from "../lib/square.mjs";
import { welcome1Email, welcome2Email, welcome3Email, upsizeEmail } from "../lib/emails.mjs";
import { sendMail, MARKETING_FROM, unsubscribeUrl } from "../lib/mail.mjs";
import { bySq } from "../lib/scents.mjs";

const HOUR = 3600e3;

async function send(email, m, kind, unsubUrl) {
  await sendMail({ from: MARKETING_FROM, to: email, subject: m.subject, html: m.html, text: m.text, unsubUrl, tags: [{ name: "kind", value: kind }] });
}

async function welcomeSeries(token, now, stats) {
  const s = stores.contacts();
  for (const { key } of await listAll(s)) {
    const c = await getJSON(s, key);
    if (!canMarket(c)) continue;
    const w = c.welcome || {};
    try {
      const unsubUrl = await unsubscribeUrl(c.email);
      if (!w[1]) {
        // Opted in through the Sherpa or the cart: welcome #1 an hour later, with a code only if they hold none.
        if (now - Number(c.consentAt || c.created || 0) < HOUR) continue;
        let code = null, expiresAt = null;
        // one sign-up code per email, ever: only someone who has never had one (and never ordered) gets one here
        if ((await signupOffer(c)).state === "none") {
          const k = await issueCode({ kind: "welcome", email: c.email, prefix: "VV-HELLO", percent: 10, days: SIGNUP_DAYS }, token); code = k.code; expiresAt = k.expiresAt;
        }
        await send(c.email, welcome1Email({ first: c.first, code, expiresAt, unsubUrl }), "welcome-1", unsubUrl);
        await upsertContact(c.email, { welcome: { 1: now }, ...(code ? { codes: { welcome: code } } : {}) });
        stats.w1++;
      } else if (!w[2] && now - w[1] >= 3 * DAY) {
        await send(c.email, welcome2Email({ first: c.first, unsubUrl }), "welcome-2", unsubUrl);
        await upsertContact(c.email, { welcome: { 2: now } }); stats.w2++;
      } else if (w[2] && !w[3] && now - w[1] >= 7 * DAY) {
        await send(c.email, welcome3Email({ first: c.first, unsubUrl }), "welcome-3", unsubUrl);
        await upsertContact(c.email, { welcome: { 3: now } }); stats.w3++;
      }
    } catch (e) { console.error("welcome", key, e); }
  }
}

// "Loved the 2 ml?" 21 days after delivery / pickup, queued by enjoy.mjs as { type: "upsize", due, email, first, sq, ml }.
async function followups(token, now, stats) {
  const s = stores.followups();
  for (const { key } of await listAll(s)) {
    const job = await getJSON(s, key);
    if (!job || now < Number(job.due || 0)) continue;
    try {
      if (job.type === "upsize") {
        const c = await getJSON(stores.contacts(), job.email);
        const p = bySq(job.sq);
        const boughtTen = (c?.seg?.tenMl || []).includes(job.sq);
        if (!c || c.unsubscribed || !p || p.soon || boughtTen) { await s.delete(key); stats.skipped++; continue; }
        const vars = await itemVariations([p.sq], token);
        const ten = Object.values(vars[p.sq] || {}).find((v) => /^classic/i.test(v.name) && /\b10\s*ml/i.test(v.name)) || Object.values(vars[p.sq] || {}).find((v) => /\b10\s*ml/i.test(v.name));
        if (!ten) { await s.delete(key); stats.skipped++; continue; }
        const code = await issueCode({ kind: "upsize", email: job.email, prefix: "VV-GO10", percent: 10, variationIds: [ten.id], days: 21 }, token);
        const unsubUrl = await unsubscribeUrl(job.email);
        await send(job.email, upsizeEmail({ first: c.first || job.first, p, ml: job.ml, price10: ten.cents / 100, code: code.code, expiresAt: code.expiresAt, unsubUrl, variation10: ten.name }), "upsize", unsubUrl);
        await upsertContact(job.email, { codes: { upsize: code.code } });
        stats.upsize++;
      }
      await s.delete(key);
    } catch (e) { console.error("followup", key, e); } // stays queued, retried next hour
  }
}

// Expired codes: remove the catalogue objects a day after expiry (max 25 per run).
async function sweepCodes(token, now, stats) {
  const s = stores.codes();
  let n = 0;
  for (const { key } of await listAll(s)) {
    if (n >= 25) break;
    const rec = await getJSON(s, key);
    if (!rec || !rec.expiresAt || now < rec.expiresAt + DAY) continue;
    try { await deleteCode(rec, token); } catch (e) { if (!/404|NOT_FOUND/.test(String(e))) { console.error("sweep", key, e); continue; } }
    await forgetCode(key); n++; stats.swept++;
  }
}

export default async () => {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || !process.env.RESEND_API_KEY) return new Response("not configured", { status: 500 });
  const now = Date.now();
  const stats = { w1: 0, w2: 0, w3: 0, upsize: 0, skipped: 0, swept: 0 };
  await welcomeSeries(token, now, stats);
  await followups(token, now, stats);
  await sweepCodes(token, now, stats);
  return new Response(JSON.stringify(stats));
};
