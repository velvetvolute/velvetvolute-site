// Branded email layout + Resend send for velvetvolute.ca. No Blobs here, so the templates can be
// rendered locally (see docs/EMAIL-PREVIEW.md).
//
// Senders: orders@velvetvolute.ca for transactional email (order confirmation, on its way, enjoy),
// hello@velvetvolute.ca for marketing (Sherpa picks, welcome series, abandoned cart, rewards).
// Both are on the domain already verified in Resend, so no new DNS records are needed.
export const SITE = process.env.SITE_URL || "https://velvetvolute.ca";
export const SHOP_EMAIL = "velvetvolute@gmail.com";
export const ORDER_FROM = process.env.ORDER_EMAIL_FROM || "Velvet Volute <orders@velvetvolute.ca>";
export const MARKETING_FROM = process.env.MARKETING_EMAIL_FROM || "Izzi at Velvet Volute <hello@velvetvolute.ca>";
export const MAIL_COPY = process.env.ORDER_COPY_TO || SHOP_EMAIL;
export const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL || "https://www.facebook.com/share/19pYKmRDYj/";
export const REVIEW_IS_GOOGLE = !!process.env.GOOGLE_REVIEW_URL;

export const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const money = (c) => "$" + (c / 100).toFixed(c % 100 ? 2 : 0);
export const moneyDollars = (n) => "$" + (Number.isInteger(n) ? n : Number(n).toFixed(2));
export const absUrl = (p) => (/^https?:/.test(p) ? p : `${SITE}/${String(p).replace(/^\//, "")}`);
export const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" });

// Palette (the site's: deep wine, cream, gold)
export const C = { wine: "#4a0e1e", wineDeep: "#2c0610", cream: "#fbf6ee", gold: "#d6b077", goldInk: "#8a6d4b", ink: "#2c0610", soft: "#5a3a2a", rule: "#eadfcd", link: "#6e1a31", paper: "#ffffff" };
export const SERIF = "'GFS Didot','Cormorant Garamond',Didot,'Bodoni MT',Georgia,'Times New Roman',serif";
export const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---- one-click unsubscribe ----
// Token = first 20 hex chars of HMAC-SHA256(email) with UNSUB_SECRET (falls back to ADMIN_KEY, then
// RESEND_API_KEY). The unsubscribe function checks it before flipping the flag.
async function hmacHex(message, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}
const unsubSecret = () => process.env.UNSUB_SECRET || process.env.ADMIN_KEY || process.env.RESEND_API_KEY || "velvet-volute-dev";
export async function unsubToken(email) { return (await hmacHex(String(email).trim().toLowerCase(), unsubSecret())).slice(0, 20); }
export async function unsubscribeUrl(email) { return `${SITE}/.netlify/functions/unsubscribe?e=${encodeURIComponent(String(email).trim().toLowerCase())}&t=${await unsubToken(email)}`; }

// ---- building blocks (tables + inline CSS, email-client safe) ----
export const h2 = (t) => `<h2 style="margin:0 0 10px;font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.2;color:${C.ink}">${t}</h2>`;
export const h3 = (t) => `<h3 style="margin:26px 0 8px;font-family:${SANS};font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${C.goldInk};font-weight:600">${t}</h3>`;
export const p = (t, extra = "") => `<p style="margin:0 0 12px;font-family:${SANS};font-size:15.5px;line-height:1.6;color:${C.ink};${extra}">${t}</p>`;
export const small = (t) => `<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.soft}">${t}</p>`;
export const rule = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:14px 0"><div style="height:1px;background:${C.gold};line-height:1px;font-size:0">&nbsp;</div></td></tr></table>`;
export const button = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto"><tr><td style="background:${C.wine};border:1px solid ${C.gold}" bgcolor="${C.wine}"><a href="${esc(href)}" style="display:inline-block;padding:13px 30px;font-family:${SANS};font-size:12.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.gold};text-decoration:none;font-weight:600">${label}</a></td></tr></table>`;
export const link = (href, label) => `<a href="${esc(href)}" style="color:${C.link};text-decoration:underline">${label}</a>`;

// A promo code card: the code large and centred, with its expiry.
export function codeCard(code, what, expiresAt, note = "") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0"><tr><td align="center" style="padding:18px 16px;border:1px solid ${C.gold};background:${C.paper}" bgcolor="${C.paper}">
    <div style="font-family:${SANS};font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.goldInk};margin-bottom:6px">${what}</div>
    <div style="font-family:${SANS};font-size:24px;letter-spacing:.1em;font-weight:700;color:${C.ink}">${esc(code)}</div>
    <div style="font-family:${SANS};font-size:13px;color:${C.soft};margin-top:6px">${expiresAt ? `Good until ${fmtDate(expiresAt)}. ` : ""}Enter it in the cart under “Promo code”.${note ? ` ${note}` : ""}</div>
  </td></tr></table>`;
}

// A scent row: photo left, name + one line + price right.
export function scentRow({ img, brand, name, line, price, href, tag }) {
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.rule}" valign="top">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="84" valign="top" style="padding-right:14px">${img ? `<a href="${esc(href || SITE)}"><img src="${esc(absUrl(img))}" width="84" height="84" alt="" style="display:block;width:84px;height:84px;border-radius:4px;border:0"></a>` : ""}</td>
    <td valign="top" style="font-family:${SANS};color:${C.ink}">
      ${tag ? `<div style="font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.goldInk};margin-bottom:3px">${tag}</div>` : ""}
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.goldInk}">${esc(brand)}</div>
      <div style="font-family:${SERIF};font-size:20px;line-height:1.2;margin:2px 0 4px"><a href="${esc(href || SITE)}" style="color:${C.ink};text-decoration:none">${esc(name)}</a></div>
      ${line ? `<div style="font-size:14px;line-height:1.5;color:${C.soft}">${esc(line)}</div>` : ""}
      ${price ? `<div style="font-size:14px;margin-top:5px;color:${C.ink};font-weight:600">${esc(price)}</div>` : ""}
    </td></tr></table></td></tr>`;
}

// Order lines: name, variation and price.
export function orderRows(items, { showPrice = true, right } = {}) {
  return items.map((i) => `<tr><td style="padding:7px 0;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:15px;color:${C.ink}">${i.qty > 1 ? i.qty + "× " : ""}${esc(i.name)}${i.variation ? `<br><span style="color:${C.goldInk};font-size:13px">${esc(i.variation)}</span>` : ""}</td><td align="right" style="padding:7px 0;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:15px;color:${C.ink};white-space:nowrap">${right ? right(i) : showPrice && i.total != null ? money(i.total) : ""}</td></tr>`).join("");
}

export const signoff = () => p(`Peace &amp; Love,<br><span style="font-family:${SERIF};font-size:20px">Izzi</span>`, "margin-top:22px");

// The frame: dark wine header with the monogram and VELVET VOLUTE, gold rules, cream body, footer.
// kind: "marketing" (CASL footer with the one-click unsubscribe link) or "transactional" (sender identity only).
export function layout({ kicker, title, body, kind = "marketing", unsubUrl = "", preheader = "", reason = "" }) {
  const footer = kind === "marketing"
    ? `You're getting this because ${reason || "you asked for first dibs on new drops, collections and sales at velvetvolute.ca"}.<br>Velvet Volute · Ottawa, ON · <a href="mailto:${SHOP_EMAIL}" style="color:${C.goldInk}">${SHOP_EMAIL}</a> · <a href="${esc(unsubUrl || `${SITE}/.netlify/functions/unsubscribe`)}" style="color:${C.goldInk}">Unsubscribe</a>`
    : `Sent by Velvet Volute · Ottawa, ON · <a href="mailto:${SHOP_EMAIL}" style="color:${C.goldInk}">${SHOP_EMAIL}</a> · <a href="${SITE}" style="color:${C.goldInk}">velvetvolute.ca</a><br>Hand-poured from authentic bottles. Not affiliated with any fragrance house.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#efe6d8" bgcolor="#efe6d8">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#efe6d8">${esc(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#efe6d8" style="background:#efe6d8"><tr><td align="center" style="padding:18px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%">
 <tr><td align="center" bgcolor="${C.wine}" style="background:${C.wine};padding:26px 24px 22px;border-bottom:1px solid ${C.gold}">
   <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px"><tr><td align="center" style="width:46px;height:46px;border:1px solid ${C.gold};border-radius:50%;font-family:${SERIF};font-style:italic;font-size:19px;line-height:46px;color:${C.gold}">VV</td></tr></table>
   <div style="font-family:${SERIF};font-size:27px;letter-spacing:.14em;color:#e8d3b4">VELVET VOLUTE</div>
   ${kicker ? `<div style="font-family:${SANS};font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:${C.gold};margin-top:8px">${kicker}</div>` : ""}
 </td></tr>
 <tr><td bgcolor="${C.cream}" style="background:${C.cream};padding:28px 26px 24px">
   ${body}
 </td></tr>
 <tr><td bgcolor="${C.wineDeep}" style="background:${C.wineDeep};padding:16px 24px;border-top:1px solid ${C.gold};font-family:${SANS};font-size:12px;line-height:1.6;color:#cdb08a;text-align:center">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

// One HTTPS call to Resend, no SDK. Marketing mail carries List-Unsubscribe headers for one-click
// unsubscribe in Gmail / Apple Mail; the same URL is in the footer.
export async function sendMail({ from, to, bcc, subject, html, text, replyTo = SHOP_EMAIL, unsubUrl, tags }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY missing; not sending", subject); return { skipped: true }; }
  const body = { from, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: replyTo };
  if (bcc && bcc.length) body.bcc = bcc;
  if (unsubUrl) body.headers = { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  if (tags) body.tags = tags;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json().catch(() => ({}));
}

// Plain-text version of a rendered HTML body (good enough for the text/plain alternative).
export function toText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => `${label.replace(/<[^>]+>/g, "").trim()} (${href.replace(/&amp;/g, "&")})`)
    .replace(/<(br|\/p|\/h[1-6]|\/tr|\/li|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
