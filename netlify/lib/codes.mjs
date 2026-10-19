// Unique one-time codes: Square catalog objects (see square.mjs createOneTimeCode) plus a record in
// Netlify Blobs (vv-codes) so the cart can enforce restrictions and the webhook can retire the whole set.
//
// Kinds:  sherpa   10% off the three Sherpa picks (all sizes), 30 days          VV-SHERPA-XXXXX
//         welcome  10% off a first decant, 30 days                              VV-HELLO-XXXXX
//         (welcome + sherpa are the same sign-up offer: ONE per email, ever; see signupOffer below)
//         return   10% off the next order, 30 days (enjoy email)                VV-BACK-XXXXX
//         referral personal reusable code, $5 off a friend's first order         REF-NAME-XXXX
//         thanks   $5 off for the referrer each time a friend orders, 60 days   VV-THANKS-XXXXX
//         upsize   10% off the 10 ml of a scent they tried, 21 days             VV-GO10-XXXXX
//         punch    free 5 ml (100% off one variation) or $35 off a pricier 5 ml VV-FREE5-XXXXX
import { createOneTimeCode, deleteCode, findCoupon, couponRules, normalizeCode, isReusableCode, randomCode, codesCustomerGroup } from "./square.mjs";
import { recordCode, getCode, forgetCode, meta, setMeta } from "./store.mjs";

export const DAY = 864e5;
export const PUNCH_REWARD_CAP_CENTS = Number(process.env.PUNCH_REWARD_CAP_CENTS || 3500);

async function groupId(token) {
  let id = await meta("square-codes-group").catch(() => null);
  if (id) return id;
  id = await codesCustomerGroup(token);
  await setMeta("square-codes-group", id).catch(() => {});
  return id;
}

// Issues a code and records it. Returns { code, expiresAt, pct, cents, variationIds }.
export async function issueCode({ kind, email, prefix, percent, amountCents, variationIds, days = 14, maxUsesPerOrder = 1, code }, token) {
  const customerGroupId = await groupId(token).catch(() => null);
  const c = await createOneTimeCode({ prefix, percent, amountCents, variationIds, maxUsesPerOrder, expiresAt: Date.now() + days * DAY, code, customerGroupId }, token);
  await recordCode(c.code, { kind, email: String(email || "").toLowerCase(), discountId: c.discountId, productSetId: c.productSetId, pricingRuleId: c.pricingRuleId, variationIds: c.variationIds, expiresAt: c.expiresAt, pct: c.pct, cents: c.cents, reusable: isReusableCode(c.code) });
  return c;
}

// A personal referral code for a customer: REF-<first name>-XXXX, reusable, $5 off the friend's order.
// The webhook checks "first order" and credits the referrer. Valid for a year, renewed when re-issued.
export function referralPrefix(first) {
  const nm = String(first || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "FRIEND";
  return `REF-${nm}`;
}
export async function issueReferralCode(email, first, token) {
  const code = randomCode(referralPrefix(first), 4);
  return issueCode({ kind: "referral", email, code, amountCents: 500, days: 365, maxUsesPerOrder: 1 }, token);
}

// Full picture of a code for the cart: Square discount + restriction + expiry.
// Blobs record first (fast, written when we issued it); Square's pricing rule as the fallback for
// codes Justin makes by hand in the Dashboard. Returns null when invalid or expired.
export async function resolveCoupon(code, token) {
  code = normalizeCode(code);
  const c = await findCoupon(code, token);
  if (!c) return null;
  const rec = await getCode(code).catch(() => null);
  let ids = null, expiresAt = null, kind = rec?.kind || "", owner = rec?.email || "";
  if (rec) {
    if (rec.variationIds?.length) ids = new Set(rec.variationIds);
    expiresAt = rec.expiresAt || null;
  } else {
    const r = await couponRules(c.id, token).catch(() => ({ ids: null, expiresAt: null }));
    ids = r.ids; expiresAt = r.expiresAt;
  }
  if (expiresAt && Date.now() > expiresAt) return { ...c, expired: true, ids, expiresAt, kind, owner };
  return { ...c, ids, expiresAt, kind, owner };
}

// The code of this kind a contact holds, if it is still live (its Blobs record exists and hasn't expired).
export async function activeCode(contact, kind) {
  const code = contact?.codes?.[kind];
  if (!code) return null;
  const rec = await getCode(code).catch(() => null);
  return rec && (!rec.expiresAt || rec.expiresAt > Date.now()) ? rec : null;
}

// Retire a code after use: delete the discount + rule + set and forget the record. Reusable codes
// (OPEN-…, REF-…) are kept.
export async function retireCode(nameOrId, token, { force = false } = {}) {
  const rec = await getCode(nameOrId).catch(() => null);
  if (!force && isReusableCode(rec?.code || nameOrId)) return false;
  if (rec) {
    await deleteCode(rec, token).catch((e) => console.error("delete code", e));
    await forgetCode(rec.code);
    return true;
  }
  return false;
}

// ---- the sign-up offer: one 10% code per email address, ever ----
// The sign-up card, /subscribe, the Sherpa capture and the welcome drip all go through this, so nobody collects
// a welcome code AND a Sherpa code. Returns:
//   { state: "none" }                      never had one and never ordered → issue one (SIGNUP_DAYS)
//   { state: "active", kind, code, rec }   holds a live one → reuse it, never mint a second
//   { state: "spent" }                     had one (used or expired), or has already ordered → no new code
export const SIGNUP_DAYS = 30;
export async function signupOffer(contact) {
  if (!contact) return { state: "none" };
  for (const kind of ["welcome", "sherpa"]) {
    const rec = await activeCode(contact, kind);
    if (rec) return { state: "active", kind, code: contact.codes[kind], rec };
  }
  if (contact.codes?.welcome || contact.codes?.sherpa || (contact.seg?.orders || 0) > 0) return { state: "spent" };
  return { state: "none" };
}
