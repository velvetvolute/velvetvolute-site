// Netlify Blobs state for the email and loyalty layer. Everything is keyed so Justin can read it in
// the Netlify UI (Blobs tab): contacts by lower-cased email, carts by cart id, codes by the code itself.
//
//  vv-contacts   email → contact (consent, segments, welcome-series progress, codes issued, picks)
//  vv-carts      cart id → saved cart (email, lines, timestamps, reminder state)
//  vv-codes      CODE → { kind, email, discountId, productSetId, pricingRuleId, variationIds, expiresAt }
//  vv-punches    email → { drops, rewarded, history[] }   (The Real Ones punch card; 2 drops = 1 punch)
//  vv-claims     claim token → { email, created, used, code }
//  vv-followups  job id → { type, due, ... }                 (21-day "loved the 2 ml?" etc.)
//  vv-paid       VV order number → { email, orderId, ts, cartId }
//  vv-meta       small settings written at runtime (Resend audience id, Square customer group id)
//  vv-ratelimit  per-IP counters
import { getStore } from "@netlify/blobs";

export const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
export const normEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 254);
export const clip = (s, n) => String(s || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
export const firstName = (s) => clip(s, 40).split(/\s+/)[0] || "";

const store = (name) => getStore(name);
export const stores = {
  contacts: () => store("vv-contacts"),
  carts: () => store("vv-carts"),
  codes: () => store("vv-codes"),
  punches: () => store("vv-punches"),
  claims: () => store("vv-claims"),
  followups: () => store("vv-followups"),
  paid: () => store("vv-paid"),
  meta: () => store("vv-meta"),
  orders: () => store("vv-orders"),
};

export async function getJSON(s, key) { try { return await s.get(key, { type: "json" }); } catch { return null; } }
export async function listAll(s, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await s.list({ prefix, cursor });
    out.push(...(r.blobs || []));
    cursor = r.cursor;
  } while (cursor);
  return out;
}

// ---- rate limit (same idea as etransfer.mjs): at most `max` hits per IP per `windowMs` ----
export async function allowed(req, bucket, max = 5, windowMs = 3600e3) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "";
  if (!ip) return true;
  try {
    const s = stores.meta();
    const key = `rl-${bucket}-` + ip.replace(/[^0-9a-f.:]/gi, "");
    const now = Date.now();
    const recent = ((await getJSON(s, key)) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    await s.setJSON(key, [...recent, now]);
  } catch (e) { console.error("blobs unavailable, skipping rate limit", e); }
  return true;
}

// ---- meta ----
export async function meta(key) { return getJSON(stores.meta(), key); }
export async function setMeta(key, value) { return stores.meta().setJSON(key, value); }

// ---- contacts ----
export async function getContact(email) {
  email = normEmail(email);
  if (!EMAIL_RE.test(email)) return null;
  return getJSON(stores.contacts(), email);
}

// Creates or updates a contact. `patch` is merged shallowly; `seg` merges one level deeper and its
// array fields are unioned (houses, families, fulfil). Consent is only ever turned on here; it is
// turned off by unsubscribe() alone.
export async function upsertContact(email, patch = {}) {
  email = normEmail(email);
  if (!EMAIL_RE.test(email)) throw new Error("bad email");
  const s = stores.contacts();
  const cur = (await getJSON(s, email)) || { email, created: Date.now(), consent: false, unsubscribed: false, seg: {}, welcome: {}, codes: {}, sources: [] };
  const next = { ...cur, ...patch, email, updated: Date.now() };
  if (patch.first && !cur.first) next.first = firstName(patch.first); else if (patch.first && cur.first) next.first = cur.first;
  if (patch.consent === true && !cur.consent) { next.consent = true; next.consentAt = Date.now(); next.unsubscribed = false; }
  else if (patch.consent === false) next.consent = cur.consent;
  if (patch.source) { next.sources = [...new Set([...(cur.sources || []), patch.source])]; delete next.source; }
  if (patch.seg) {
    const seg = { ...(cur.seg || {}) };
    for (const [k, v] of Object.entries(patch.seg)) {
      if (Array.isArray(v)) seg[k] = [...new Set([...(seg[k] || []), ...v])].slice(0, 40);
      else if (v !== undefined && v !== null && v !== "") seg[k] = v;
    }
    next.seg = seg;
  }
  if (patch.welcome) next.welcome = { ...(cur.welcome || {}), ...patch.welcome };
  if (patch.codes) next.codes = { ...(cur.codes || {}), ...patch.codes };
  await s.setJSON(email, next);
  return next;
}

// The only way consent is turned off. Returns true when the contact was already unsubscribed.
export async function unsubscribe(email) {
  email = normEmail(email);
  const s = stores.contacts();
  const cur = (await getJSON(s, email)) || { email, created: Date.now(), seg: {}, welcome: {}, codes: {}, sources: [] };
  const already = !!cur.unsubscribed;
  await s.setJSON(email, { ...cur, consent: false, unsubscribed: true, unsubscribedAt: cur.unsubscribedAt || Date.now(), updated: Date.now() });
  return already;
}

// Marketing email may go to this contact: opted in and not unsubscribed.
export const canMarket = (c) => !!c && c.consent === true && !c.unsubscribed;

// ---- carts ----
export const CART_ID_RE = /^[a-z0-9]{12,40}$/;
export async function getCart(id) { return CART_ID_RE.test(String(id || "")) ? getJSON(stores.carts(), id) : null; }
export async function saveCart(id, data) {
  if (!CART_ID_RE.test(String(id || ""))) throw new Error("bad cart id");
  const cur = (await getJSON(stores.carts(), id)) || { id, created: Date.now() };
  const next = { ...cur, ...data, id, updated: Date.now() };
  await stores.carts().setJSON(id, next);
  return next;
}

// ---- codes ----
export async function recordCode(code, data) { await stores.codes().setJSON(code, { ...data, code, created: Date.now() }); }
export async function getCode(code) { return getJSON(stores.codes(), String(code || "").toUpperCase()); }
export async function forgetCode(code) { await stores.codes().delete(String(code || "").toUpperCase()).catch(() => {}); }

// ---- paid orders (written by the webhook, read by the abandoned-cart check) ----
export async function recordPaid(orderNo, data) { await stores.paid().setJSON(orderNo, { ...data, orderNo, ts: data.ts || Date.now() }); }
export async function paidSince(email, sinceMs) {
  email = normEmail(email);
  const c = await getContact(email);
  if (c?.seg?.lastOrderAt && c.seg.lastOrderAt >= sinceMs) return true;
  return false;
}

// ---- punch card ----
// Counted in DROPS: 2 ml / 3 ml = 1 drop (half a punch), 5 ml = 2 drops (a punch), 10 ml = 3 drops (a punch and a half).
// Six punches = 12 drops fills the card; lucky #7 is the free 5 ml. Everything customer-facing shows punches.
export const PUNCHES_FOR_REWARD = 6, DROPS_PER_PUNCH = 2, DROPS_FOR_REWARD = PUNCHES_FOR_REWARD * DROPS_PER_PUNCH;
export const dropsFor = (ml) => (ml >= 10 ? 3 : ml >= 5 ? 2 : ml > 0 ? 1 : 0);
export async function getPunches(email) {
  email = normEmail(email);
  const p = (await getJSON(stores.punches(), email)) || { email, drops: 0, rewarded: 0, history: [] };
  const drops = p.drops || 0, cycleDrops = drops % DROPS_FOR_REWARD;
  const earned = Math.floor(drops / DROPS_FOR_REWARD);
  return { ...p, drops, cycleDrops, cycle: cycleDrops / DROPS_PER_PUNCH, earned, pending: Math.max(0, earned - (p.rewarded || 0)), claim: p.claim || null };
}
export async function addDrops(email, n, note) {
  email = normEmail(email);
  const s = stores.punches();
  const p = (await getJSON(s, email)) || { email, drops: 0, rewarded: 0, history: [] };
  p.drops = Math.max(0, (p.drops || 0) + n);
  p.history = [...(p.history || []), { drops: n, note, ts: Date.now() }].slice(-60);
  await s.setJSON(email, p);
  return getPunches(email);
}
export async function setPunchClaim(email, claimToken) {
  email = normEmail(email);
  const s = stores.punches();
  const p = (await getJSON(s, email)) || { email, drops: 0, rewarded: 0, history: [] };
  p.rewarded = (p.rewarded || 0) + 1;
  p.claim = claimToken;
  await s.setJSON(email, p);
}

// ---- followups queue ----
export async function queueFollowup(id, job) { await stores.followups().setJSON(id, { ...job, id, created: Date.now() }); }

export const newToken = (len = 24) => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const b = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(b, (x) => chars[x % chars.length]).join("");
};
