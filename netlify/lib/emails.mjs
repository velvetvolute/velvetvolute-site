// Every new email, as { subject, html, text }. Pure functions: pass them data, get a rendered email.
// Preview locally with docs/EMAIL-PREVIEW.md (tools/email-preview.mjs renders each one with sample data).
import { layout, h2, h3, p, small, rule, button, link, codeCard, scentRow, orderRows, signoff, toText, esc, money, SITE, SHOP_EMAIL, GOOGLE_REVIEW_URL, REVIEW_IS_GOOGLE, fmtDate, C, SANS, SERIF, absUrl } from "./mail.mjs";
import { storyLine, priceRange, fullName, WHO, famLine, imgFor, vialLabel } from "./scents.mjs";

const hi = (first) => (first ? `Hi ${esc(first)},` : "Hi,");
const PICKUP = "Pickup is at the Shoppers Drug Mart on Carling Ave in Ottawa. Free local hand delivery on $65+ across Ottawa, Orléans, Kanata and Barrhaven. Shipping anywhere in Canada is $9, free over $85.";

const out = (subject, html) => ({ subject, html, text: toText(html) });

// 1. Scent Sherpa picks: the three scents, a line each, the price range, the code.
export function sherpaPicksEmail({ first, picks, code, expiresAt, shopUrl, unsubUrl, who, codeKind = "sherpa" }) {
  const rows = picks.map((p, k) => scentRow({ img: p.img, brand: p.brand, name: p.short, line: storyLine(p), price: `${priceRange(p)} · ${famLine(p)} · ${WHO(p)}`, href: absUrl(p.url), tag: k ? "Also on your trail" : "The Sherpa's top pick" })).join("");
  const body = `
   ${h2("Here's where I'd start")}
   ${p(`${hi(first)} the Scent Sherpa went through the collection with your answers${who === "her" ? " for her" : who === "him" ? " for him" : ""}. These three fit. Every one of them has a story, and I wear them myself. If I wouldn't wear it, I wouldn't sell it.`)}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
   ${!code ? "" : codeKind === "sherpa" ? codeCard(code, "10% off your top 3, any size", expiresAt, "One use, on these three scents only.")
     : codeCard(code, "Your 10% code works on these too", expiresAt, "This is the sign-up code you already have (one per person). One use, on any decant, these three included.")}
   ${button(shopUrl || SITE + "/#shop", "Shop your picks")}
   ${small(`Not sure which size? A 2 ml is about 20 sprays, enough for a week of wear. A 5 ml is about 50. A 10 ml is a month of daily wear. ${link(SITE + "/fragrance-101", "Fragrance 101")} has the rest.`)}
   ${small(PICKUP)}`;
  return out(`Your Sherpa picks${first ? ", " + first : ""}${code ? ": 3 scents and 10% off them" : ""}`, layout({ kicker: "Your Sherpa picks", title: "Your Sherpa picks", body, unsubUrl, reason: "you asked the Scent Sherpa to email your picks", preheader: "Three scents that fit your answers, and a one-time code for 10% off." }));
}

// 2. Welcome #1: who Izzi is, the code if they don't already have one.
export function welcome1Email({ first, code, expiresAt, unsubUrl, codeWhat = "10% off your first decant", codeNote = "One use, on any decant in the collection." }) {
  const body = `
   ${h2("Welcome to the real ones")}
   ${p(`${hi(first)} I'm Izzi. Velvet Volute is my collection: luxury fragrances I've chosen one at a time, hand-poured into 2, 5 and 10 ml decants in Ottawa.`)}
   ${p(`I don't just sell decants. I curate, very much like putting together the perfect playlist. Some are smooth and sexy, some make you feel like a boss, some make you want to party till 5am. Either way, it's one banger after another.`)}
   ${p(`Every scent on the shelf has a story. If I wouldn't wear it, I wouldn't sell it.`)}
   ${code ? codeCard(code, codeWhat, expiresAt, codeNote) : p(`The 10% sign-up code is one per person, and yours has already been used or has run out, so there's no new one here. The Real Ones punch card has you covered from your first order on, and lucky #7 is on me.`)}
   ${button(SITE + "/#shop", "Browse the collection")}
   ${rule()}
   ${h3("What's coming")}
   ${p(`Over the next week I'll send you two short notes: how decants work and how to get the most out of yours, then how to find the scent that's actually yours. After that, only first dibs on new drops, collections and sales. No noise.`)}
   ${signoff()}`;
  return out(`Welcome to Velvet Volute${first ? ", " + first : ""}`, layout({ kicker: "Welcome", title: "Welcome to Velvet Volute", body, unsubUrl, reason: "you asked for 10% off your first decant at velvetvolute.ca", preheader: "Who I am, what this collection is, and 10% off your first decant." }));
}

// 3. Welcome #2 (day 3): how decants work, sizes, pickup / delivery / shipping.
export function welcome2Email({ first, unsubUrl }) {
  const size = (a, b) => `<tr><td style="padding:7px 0;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:15px;color:${C.ink}"><b>${a}</b></td><td style="padding:7px 0;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:14px;color:${C.soft}">${b}</td></tr>`;
  const body = `
   ${h2("How decants work")}
   ${p(`${hi(first)} a decant is the real fragrance, poured by hand from an authentic bottle into a smaller vial. Same juice, no 100 ml commitment. You get to live with a scent for a week or a month before deciding whether it's yours.`)}
   ${h3("Sizes")}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   ${size("Classic · 2, 5, 10 ml", "A glass screw-top atomizer. The 2 ml is about 20 sprays, a week of wear. The 10 ml is about 100, a month.")}
   ${size("Luxury · 3, 5, 10 ml", "Thick glass, crimp-sealed, a fine even mist. For the scents you already know you love.")}
   ${size("Roll-on · 5, 10 ml", "Glass with a steel rollerball and a walnut cap. A precise dab, no spray, good for travel.")}
   </table>
   ${h3("Wearing it")}
   ${p(`Two to four sprays on warm skin: neck, chest, inside the wrists. Don't rub. Give it an hour, because the dry-down is the real scent. Store it cool and dark, cap on, not in the bathroom.`)}
   ${h3("Getting it")}
   ${p(PICKUP)}
   ${button(SITE + "/fragrance-101", "Read Fragrance 101")}
   ${small(`Questions? Reply to this email. It comes to me.`)}`;
  return out("How decants work (and which size to start with)", layout({ kicker: "Fragrance 101", title: "How decants work", body, unsubUrl, preheader: "Sizes, sprays, how to wear it and how to get it." }));
}

// 4. Welcome #3 (day 7): find yours — Sherpa + Curated Collections.
export function welcome3Email({ first, unsubUrl }) {
  const body = `
   ${h2("Find the one that's yours")}
   ${p(`${hi(first)} two ways in, depending on how you like to shop.`)}
   ${h3("Ask the Scent Sherpa")}
   ${p(`Eight quick questions: who's wearing it, what you love, what you'd rather avoid, where you'll wear it. It reads the whole collection and hands you three picks with the reasons. Takes about a minute.`)}
   ${button(SITE + "/#quiz", "Ask the Scent Sherpa")}
   ${h3("Or take a Curated Collection")}
   ${p(`Several scents that belong together, poured as a matching set and 10% off: a house like Tom Ford or Nishane, or a mood like leather, boozy or warm. Try the set, then go big on the one you keep reaching for.`)}
   ${button(SITE + "/collections/", "See the collections")}
   ${rule()}
   ${p(`That's the last of the welcome notes. From here on you'll only hear from me when something new lands on the shelf, a collection drops or there's a sale. For the real ones.`)}
   ${signoff()}`;
  return out("Find the scent that's actually yours", layout({ kicker: "Find yours", title: "Find yours", body, unsubUrl, preheader: "The Scent Sherpa, or a Curated Collection. Pick your way in." }));
}

// 5. Abandoned cart: one reminder, with the lines and a link that restores the cart.
export function abandonedCartEmail({ first, lines, subtotal, restoreUrl, unsubUrl }) {
  const rows = lines.map((l) => scentRow({ img: l.img, brand: l.brand, name: l.name, line: l.variation + (l.qty > 1 ? ` × ${l.qty}` : ""), price: l.price != null ? `$${l.price}` : "", href: l.url ? absUrl(l.url) : SITE })).join("");
  const body = `
   ${h2("You left these in your cart")}
   ${p(`${hi(first)} your decants are still waiting. Nothing's been charged, nothing's been poured. If you're still deciding, the cart is exactly as you left it.`)}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
   ${subtotal != null ? p(`<b>Subtotal: $${subtotal}</b>`, "text-align:right;margin-top:10px") : ""}
   ${button(restoreUrl, "Finish checkout")}
   ${small(PICKUP)}
   ${small(`Changed your mind? No problem, this is the only reminder you'll get. Questions, reply here.`)}`;
  return out("You left these in your cart", layout({ kicker: "Your cart", title: "You left these in your cart", body, unsubUrl, reason: "you left your email in the cart at velvetvolute.ca (this is the only reminder)", preheader: "Your decants are still waiting. The cart is exactly as you left it." }));
}

// 6. Punch card: six punches, pick the free one.
export function rewardEmail({ first, claimUrl, unsubUrl, capCents = 4500 }) {
  const body = `
   ${h2("Lucky #7 is on us")}
   ${p(`${hi(first)} six punches in, and that puts you with the real ones. Your seventh is free: any 5 ml in the collection up to $${capCents / 100}, or $${capCents / 100} toward a bigger one.`)}
   ${cardImg("full")}
   ${button(claimUrl, "Choose your free 5 ml")}
   ${p(`Pick the one you've been circling. I'll email you a one-time code the moment you choose, and it'll show up as 100% off that 5 ml in your cart.`)}
   ${small(`The link is yours alone. It keeps working until you've used it.`)}
   ${signoff()}`;
  return out("Lucky #7 is on us: choose your free 5 ml", layout({ kicker: "The Real Ones", title: "Lucky #7 is on us", body, unsubUrl, kind: "transactional", preheader: "Six punches. Your seventh decant is on the house." }));
}

// 7. Punch card: the code for the 5 ml they chose.
export function punchCodeEmail({ first, code, expiresAt, p: scent, variation, overCap, capCents = 4500, price }) {
  const body = `
   ${h2(overCap ? `$${capCents / 100} toward your ${esc(scent.short)}` : `Your free ${esc(scent.short)}`)}
   ${p(`${hi(first)} good choice.${overCap ? ` This 5 ml is $${price}, so the code takes $${capCents / 100} off and you cover the difference.` : " This one's on the house."}`)}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${scentRow({ img: scent.img, brand: scent.brand, name: scent.short, line: storyLine(scent), price: variation, href: absUrl(scent.url) })}</table>
   ${codeCard(code, overCap ? `$${capCents / 100} off this 5 ml` : "100% off this 5 ml", expiresAt, "One use, on this exact size only.")}
   ${button(absUrl(scent.url), "Add it to your cart")}
   ${small(`Add the ${esc(variation)} to your cart, enter the code, and choose pickup, local delivery or shipping as usual. Shipping, if any, still applies.`)}
   ${signoff()}`;
  return out(`Your ${overCap ? "$" + capCents / 100 + " toward" : "free"} ${scent.short} is ready`, layout({ kicker: "The Real Ones", title: "Your free 5 ml", body, kind: "transactional", preheader: "The code for your free decant." }));
}

// 8. Referral paid off: $5 code for the referrer.
export function referralThanksEmail({ first, code, expiresAt, unsubUrl }) {
  const body = `
   ${h2("A friend of yours just ordered")}
   ${p(`${hi(first)} someone used your code on their first order. That's how this collection grows: one real one tells another. Thank you.`)}
   ${codeCard(code, "$5 off your next order", expiresAt, "One use.")}
   ${button(SITE + "/#shop", "Shop the collection")}
   ${small(`Your referral code keeps working. Every friend's first order sends you another $5.`)}
   ${signoff()}`;
  return out("Your friend ordered. Here's $5.", layout({ kicker: "Thank you", title: "A friend of yours just ordered", body, unsubUrl, kind: "transactional", preheader: "Someone used your referral code. $5 off your next order." }));
}

// 9. 21 days after delivery: "loved the 2 ml?" with the 10 ml price and a code on that variation.
export function upsizeEmail({ first, p: scent, ml, price10, code, expiresAt, unsubUrl, variation10 }) {
  const body = `
   ${h2(`Loved the ${ml} ml?`)}
   ${p(`${hi(first)} it's been three weeks with ${esc(fullName(scent))}. If you're still reaching for it, the 10 ml is about 100 sprays, a month of daily wear, and the best price per ml on the shelf.`)}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${scentRow({ img: scent.img, brand: scent.brand, name: scent.short, line: storyLine(scent), price: `${variation10 || "Classic, 10 ml"} · $${price10}`, href: absUrl(scent.url) })}</table>
   ${codeCard(code, "10% off the 10 ml", expiresAt, "One use, on this size only.")}
   ${button(absUrl(scent.url), "Go big on the 10 ml")}
   ${small(`Didn't click with you? Tell me which way it went. Reply and I'll point you somewhere closer.`)}
   ${signoff()}`;
  return out(`Loved the ${ml} ml of ${scent.short}? 10% off the 10 ml`, layout({ kicker: "Go big", title: `Loved the ${ml} ml?`, body, unsubUrl, reason: "you ordered from velvetvolute.ca and asked for first dibs", preheader: `The 10 ml of ${scent.short} with 10% off, for three weeks.` }));
}

// 10. Blocks appended to the "Enjoy your order" email: review link, return code, referral code,
// punch-card status, Sherpa's pick note. Rendered inline in enjoy.mjs's existing template.
export function loyaltyBlock({ returnCode, returnExpires, referralCode, punches, sherpaPickName, claimUrl, email }) {
  const H3 = (t) => `<h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:24px 0 6px">${t}</h3>`;
  const parts = [];
  parts.push(`${H3("Tell the next real one")}<p style="margin:0 0 8px">A review takes a minute and does more for a small shop than any ad. <a href="${esc(GOOGLE_REVIEW_URL)}" style="color:#6e1a31">${REVIEW_IS_GOOGLE ? "Leave a Google review" : "Recommend Velvet Volute on Facebook"}</a>.</p>`);
  if (returnCode) parts.push(`${H3("Your next one")}${codeCard(returnCode, "10% off your next order", returnExpires, "One use.")}`);
  if (referralCode) parts.push(`${H3("Bring a friend")}<p style="margin:0 0 8px">Your personal code is <b style="letter-spacing:.08em">${esc(referralCode)}</b>. A friend gets $5 off their first order with it, and every time one orders, I email you $5 off too. Reusable, no limit.</p>`);
  if (punches) {
    const line = punches.pending > 0
      ? `<b>6 of 6 punched · Lucky #7 is on us.</b> ${claimUrl ? `<a href="${esc(claimUrl)}" style="color:#6e1a31">Choose your free 5 ml</a>.` : "Check your inbox for the link to choose your free 5 ml."}`
      : `<b>${fmtPunch(punches.cycle)} of 6 punches · Lucky #7 is on us.</b> A 2 or 3 ml is a drop (half a punch), a 5 ml is a punch, a 10 ml is a punch and a half. At six, the seventh is free: any 5 ml up to $45, or $45 toward a bigger one.`;
    parts.push(`${H3("The Real Ones punch card")}<p style="margin:0 0 4px">${line}</p>${cardImg(punches.pending > 0 ? "full" : punches.cycleDrops ?? Math.round(punches.cycle * 2))}<p style="margin:6px 0 0;font-size:13px;color:#8a6d4b"><a href="${SITE}/the-real-ones" style="color:#6e1a31">See your card and how it works</a></p>`);
  }
  if (sherpaPickName) parts.push(`${H3("Sherpa's pick")}<p style="margin:0">There's a 1 ml of <b>${esc(sherpaPickName)}</b> tucked in with your order. It's close to what you chose, with a twist. Tell me what you think.</p>`);
  return parts.join("");
}
// 3.5 → "3½"; dots: ● full punch, ◐ a drop (half), ○ empty
// The card as an image (img/punch/card-N.png, drawn by punchcard.js); email clients don't show SVG
export const cardImg = (n) => `<img src="${SITE}/img/punch/card-${n}.png" width="360" height="150" alt="${n === "full" ? "Your punch card is full: lucky #7 is ready" : `${fmtPunch(Number(n) / 2)} of 6 punches`}" style="display:block;width:100%;max-width:360px;height:auto;border:0;margin:8px 0 0">`;
export const fmtPunch = (n) => `${Math.floor(n) || (n % 1 ? "" : "0")}${n % 1 ? "½" : ""}`;
export const punchDots = (n) => Array.from({ length: 6 }, (_, i) => (i + 1 <= n ? "●" : i + 0.5 <= n ? "◐" : "○")).join(" ");

// 11. Shop-copy extras for the order confirmation: Sherpa's pick (top 3 to pour as a 1 ml surprise)
// and the mark-shipped link.
export function shopExtrasBlock({ picks, markShippedUrl, pickUrl, method }) {
  const H3 = (t) => `<h3 style="font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#8a6d4b;margin:24px 0 6px">${t}</h3>`;
  const rows = picks.map((x, k) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eadfcd;vertical-align:top"><img src="${esc(absUrl(x.p.img))}" width="48" height="48" alt="" style="display:block;border-radius:4px"></td><td style="padding:8px 10px;border-bottom:1px solid #eadfcd;vertical-align:top"><b>${k + 1}. ${esc(fullName(x.p))}</b><br><span style="font-size:13px;color:#5a3a2a">${esc(x.why)}</span>${pickUrl ? `<br><a href="${esc(pickUrl(x.p.sq))}" style="font-size:13px;color:#6e1a31">I poured this one</a>` : ""}</td></tr>`).join("");
  return `<div style="margin-top:22px;padding:14px 16px;border:1px dashed #b5946a;background:#fff">
   <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8a6d4b">Shop copy only</div>
   ${H3("Sherpa's pick: 1 ml surprise")}
   <p style="margin:0 0 6px;font-size:14px">Top 3 to tuck in, closest to what they bought. Pour one and tap "I poured this one" so the enjoy email can name it.</p>
   <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
   ${method === "ship" && markShippedUrl ? `${H3("When it's in the mail")}<p style="margin:0;font-size:14px"><a href="${esc(markShippedUrl)}" style="color:#6e1a31">Mark as shipped</a> sends the customer the "on its way" email and queues "enjoy" for five days later. Marking the fulfillment complete in Square does the same.</p>` : ""}
  </div>`;
}

// 12. Unsubscribe landing page (not an email).
export function unsubscribePage({ ok, email, already }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? "Unsubscribed" : "Hmm"} | Velvet Volute</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#4a0e1e;color:#e8d3b4;font:300 16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px}main{max-width:460px;text-align:center}.vv{width:60px;height:60px;margin:0 auto 18px;border:1px solid #d6b077;border-radius:50%;display:grid;place-items:center;font:italic 24px Georgia,serif;color:#d6b077}h1{font:400 34px/1.1 Georgia,'Times New Roman',serif;margin:0 0 10px}a{color:#d6b077}</style></head>
<body><main><div class="vv">VV</div>
<h1>${ok ? (already ? "You were already off the list" : "You're off the list") : "That link didn't work"}</h1>
<p>${ok ? `No more first-dibs emails to <b>${esc(email)}</b>. You'll still get order emails if you buy something.` : `The unsubscribe link looks incomplete. Reply to any email from me or write to <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a> and I'll take you off by hand.`}</p>
<p><a href="${SITE}">velvetvolute.ca</a></p></main></body></html>`;
}
