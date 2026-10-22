// Renders every email with sample data to HTML files, so they can be opened in a browser or screenshotted.
//   node build.mjs && node tools/email-preview.mjs [outDir]      (default: ./email-previews, git-ignored)
// Needs `npm install` once (@netlify/blobs is imported by enjoy.mjs even though previews never touch Blobs).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCTS, bySq } from "../netlify/lib/scents.mjs";
import * as E from "../netlify/lib/emails.mjs";
import { enjoyHTML, shippedHTML } from "../netlify/lib/enjoy.mjs";

const out = process.argv[2] || join(new URL("..", import.meta.url).pathname, "email-previews");
mkdirSync(out, { recursive: true });
const DAY = 864e5, now = Date.now();
const first = "Justin";
const unsubUrl = "https://velvetvolute.ca/.netlify/functions/unsubscribe?e=justin%40example.com&t=0123456789abcdef0123";
const p = (name) => PRODUCTS.find((x) => x.name.startsWith(name));
const fyf = p("Fan Your Flames Extrait"), tuscan = p("Tuscan Leather"), jazz = p("Replica Jazz Club"), ani = p("Ani"), kredo = p("Kredo");

const order = { no: "VV-K7Q4M2", method: "pickup", items: [
  { name: fyf.name, variation: "Classic, 2 ml", qty: 1, total: 1500 },
  { name: tuscan.name, variation: "Luxury, 3 ml", qty: 2, total: 6400 },
  { name: jazz.name, variation: "Classic, 10 ml", qty: 1, total: 3800 },
], charges: [], discount: 0, tax: 0, total: 11700 };

const files = {
  "01-sherpa-picks": E.sherpaPicksEmail({ first, picks: [fyf, jazz, ani], code: "VV-SHERPA-7K3Q2", expiresAt: now + 14 * DAY, shopUrl: `https://velvetvolute.ca/?picks=${[fyf, jazz, ani].map((x) => x.sq).join(",")}#shop`, unsubUrl, who: "him" }),
  "02-welcome-1": E.welcome1Email({ first, code: "VV-HELLO-M4N7P", expiresAt: now + 14 * DAY, unsubUrl }),
  "02b-welcome-1-no-code": E.welcome1Email({ first: "", code: null, unsubUrl }),
  "03-welcome-2": E.welcome2Email({ first, unsubUrl }),
  "04-welcome-3": E.welcome3Email({ first, unsubUrl }),
  "05-abandoned-cart": E.abandonedCartEmail({ first, lines: [
    { img: fyf.img, brand: fyf.brand, name: fyf.short, variation: "Classic · 5 ml", qty: 1, price: 32, url: fyf.url },
    { img: tuscan.imgL, brand: tuscan.brand, name: tuscan.short, variation: "Luxury · 3 ml", qty: 2, price: 32, url: tuscan.url },
  ], subtotal: 96, restoreUrl: "https://velvetvolute.ca/?cart=k3j4h5g6f7d8s9a0q1w2#cart-page", unsubUrl }),
  "06-punch-reward": E.rewardEmail({ first, claimUrl: "https://velvetvolute.ca/rewards?claim=abcdefghij1234567890abcd", unsubUrl }),
  "07-punch-code": E.punchCodeEmail({ first, code: "VV-FREE5-R8T2W", expiresAt: now + 90 * DAY, p: kredo, variation: "Classic, 5 ml", overCap: false, price: 40 }),
  "07b-punch-code-over-cap": E.punchCodeEmail({ first, code: "VV-FREE5-X2Y9Z", expiresAt: now + 90 * DAY, p: tuscan, variation: "Luxury, 5 ml", overCap: true, price: 46 }),
  "08-referral-thanks": E.referralThanksEmail({ first, code: "VV-THANKS-H6J2K", expiresAt: now + 60 * DAY, unsubUrl }),
  "09-upsize-loved-the-2ml": E.upsizeEmail({ first, p: fyf, ml: 2, price10: 55, code: "VV-GO10-Q7R3S", expiresAt: now + 21 * DAY, unsubUrl, variation10: "Classic, 10 ml" }),
};
// enjoy + on-its-way (existing templates, now with the loyalty block and sender identity)
const loyalty = E.loyaltyBlock({ returnCode: "VV-BACK-P4Q8R", returnExpires: now + 30 * DAY, referralCode: "REF-JUSTIN-A7K2", punches: { punches: 3, cycle: 3, earned: 0, pending: 0 }, sherpaPickName: "Nishane Ani", claimUrl: "" });
const loyalty6 = E.loyaltyBlock({ returnCode: "VV-BACK-P4Q8R", returnExpires: now + 30 * DAY, referralCode: "REF-JUSTIN-A7K2", punches: { punches: 6, cycle: 0, earned: 1, pending: 1 }, sherpaPickName: "", claimUrl: "https://velvetvolute.ca/rewards?claim=abcdefghij1234567890abcd" });
files["10-enjoy-with-loyalty"] = { subject: `Enjoy your Velvet Volute order ${order.no}`, html: enjoyHTML(order, first, loyalty) };
files["10b-enjoy-six-punches"] = { subject: `Enjoy your Velvet Volute order ${order.no}`, html: enjoyHTML(order, first, loyalty6) };
files["11-on-its-way"] = { subject: `Your Velvet Volute order ${order.no} is on its way`, html: shippedHTML({ ...order, method: "ship" }, first, { no: "7023 2100 0012 3456", url: "https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=7023210000123456", carrier: "Canada Post" }) };
// shop-copy extras block (as it appears inside the order confirmation sent to the shop)
const { sherpasPick, scentsInOrder } = await import("../netlify/lib/scents.mjs");
const picks = sherpasPick(scentsInOrder(order.items));
files["12-shop-copy-extras"] = { subject: "[shop copy] Sherpa's pick block", html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px;background:#fbf6ee;color:#3e1019">${E.shopExtrasBlock({ picks, method: "ship", markShippedUrl: "https://velvetvolute.ca/.netlify/functions/mark-shipped?order=VV-K7Q4M2&key=ADMIN_KEY", pickUrl: (sq) => `https://velvetvolute.ca/.netlify/functions/mark-shipped?order=VV-K7Q4M2&key=ADMIN_KEY&pick=${sq}&only=pick` })}</div>` };
files["13-unsubscribe-page"] = { subject: "Unsubscribe landing page", html: E.unsubscribePage({ ok: true, email: "justin@example.com" }) };

const index = [];
for (const [name, m] of Object.entries(files)) {
  writeFileSync(join(out, name + ".html"), m.html);
  if (m.text) writeFileSync(join(out, name + ".txt"), m.text);
  index.push(`<li><a href="${name}.html">${name}</a> <small>${m.subject}</small></li>`);
}
writeFileSync(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Velvet Volute email previews</title><body style="font-family:system-ui;padding:24px;max-width:720px;margin:auto"><h1>Email previews</h1><ul>${index.join("")}</ul>`);
console.log(`wrote ${Object.keys(files).length} previews to ${out}`);
