// Resend Audience sync for the "first dibs" list. The audience "velvet-volute" is created once through
// the API (id kept in Blobs vv-meta, or set RESEND_AUDIENCE_ID in Netlify to pin it). Contacts carry
// email, first name and the unsubscribed flag; richer segments live in Blobs (segments-export.mjs).
import { meta, setMeta } from "./store.mjs";

const API = "https://api.resend.com";
const AUDIENCE_NAME = "velvet-volute";

async function rs(path, body, method) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  const r = await fetch(API + path, { method: method || (body ? "POST" : "GET"), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${path} ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

export async function audienceId() {
  if (process.env.RESEND_AUDIENCE_ID) return process.env.RESEND_AUDIENCE_ID;
  const cached = await meta("resend-audience-id").catch(() => null);
  if (cached) return cached;
  const list = await rs("/audiences");
  let a = (list.data || []).find((x) => x.name === AUDIENCE_NAME);
  if (!a) a = await rs("/audiences", { name: AUDIENCE_NAME });
  await setMeta("resend-audience-id", a.id).catch(() => {});
  return a.id;
}

// Create or update the contact. Resend accepts the email address in place of the contact id on PATCH.
export async function syncContact({ email, first, unsubscribed = false }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const aud = await audienceId();
  try {
    const r = await rs(`/audiences/${aud}/contacts`, { email, first_name: first || undefined, unsubscribed });
    return { id: r.id };
  } catch (e) {
    if (!/409|already/i.test(String(e.message))) throw e;
    await rs(`/audiences/${aud}/contacts/${encodeURIComponent(email)}`, { first_name: first || undefined, unsubscribed }, "PATCH");
    return { updated: true };
  }
}

export async function unsubscribeContact(email) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const aud = await audienceId();
  try {
    await rs(`/audiences/${aud}/contacts/${encodeURIComponent(email)}`, { unsubscribed: true }, "PATCH");
  } catch (e) {
    if (!/404/.test(String(e.message))) throw e;
    await rs(`/audiences/${aud}/contacts`, { email, unsubscribed: true });
  }
  return { ok: true };
}
