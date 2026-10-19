// Catalogue helpers for the functions, built on the generated ./catalog.mjs (see build.mjs).
import { PRODUCTS, FAM_LABEL } from "./catalog.mjs";

export { PRODUCTS, FAM_LABEL };
export const inStock = (p) => !!p && !!p.sq && !p.soon;
export const bySq = (sq) => PRODUCTS.find((p) => p.sq === String(sq || ""));
export const byName = (name) => PRODUCTS.find((p) => p.name === name) || PRODUCTS.find((p) => name && (name.includes(p.name) || p.name.includes(name)));
export const fullName = (p) => `${p.brand} ${p.short}`;
export const storyLine = (p) => p.vibe || (p.mood ? p.mood.split(/(?<=\.)\s/)[0] : p.notes);
export const famLine = (p) => `${FAM_LABEL[p.cat] || p.cat}${p.cat2 ? " with " + (FAM_LABEL[p.cat2] || p.cat2).toLowerCase() : ""}`;
export const WHO = (p) => (p.her === 1 ? "Her" : p.g === "Unisex" || p.her === 2 ? "Anyone" : "Him");

// Price range across every size and vial, e.g. "$10 to $43"
export function priceRange(p) {
  const all = [...Object.values(p.p || {}), ...Object.values(p.l || {}), ...Object.values(p.r || {})].filter((n) => n > 0);
  const lo = Math.min(...all), hi = Math.max(...all);
  return lo === hi ? `$${lo}` : `$${lo} to $${hi}`;
}
export const lowPrice = (p) => Math.min(...Object.values(p.p || {}));

// Square variation names look like "Classic, 2 ml", "Luxury, 5 ml", "Roll-on, 10 ml".
export function parseVariation(name) {
  const s = String(name || "");
  const ml = Number((/(\d+(?:\.\d+)?)\s*ml/i.exec(s) || [])[1]) || 0;
  const vial = /roll/i.test(s) ? "roll" : /lux/i.test(s) ? "luxe" : "classic";
  return { ml, vial };
}
export const vialLabel = { classic: "Classic", luxe: "Luxury", roll: "Roll-on" };
export const imgFor = (p, vial) => (vial === "luxe" ? p.imgL : vial === "roll" ? p.imgR : p.img) || p.img;
export const sitePrice = (p, vial, ml) => (vial === "luxe" ? p.l : vial === "roll" ? p.r : p.p)?.[ml];

// Order line items (from order.mjs summarize) → the catalogue scents they contain.
// A line's name in Square is the item name as it appears in the Square catalogue, which is the scent name on the site.
export function scentsInOrder(items) {
  const out = [];
  for (const i of items || []) {
    const p = byName(i.name);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

const NOTE_STOP = new Set(["black", "white", "red", "pink", "blue", "green", "dry", "italian", "calabrian", "turkish", "madagascar", "haitian", "chinese", "bourbon", "sicilian", "indian", "java", "night", "star", "sea", "ice", "spicy", "creamy", "salted", "yellow", "mediterranean", "ethyl", "fruit"]);
const noteKey = (s) => { const w = s.toLowerCase().replace(/\b(notes?|accord|absolute|bark|leaf|bean|wood|woods)\b/g, "").replace(/[^a-z]+/g, " ").trim().split(" ").filter((x) => x && !NOTE_STOP.has(x)); return w[0] || ""; };
const noteList = (p) => (p.n ? [...p.n.t, ...p.n.h, ...p.n.b] : p.notes.replace(/\.$/, "").split(/,| and | over | with /).map((s) => s.trim()).filter(Boolean));

// "Sherpa's pick": three in-stock scents the buyer did not order, closest to what they bought
// (same logic as the product pages' "you may also like": shared family, descriptors and notes),
// each with one line of why. Used in the shop copy of the order confirmation and the ntfy alert.
export function sherpasPick(bought, n = 3, exclude = []) {
  const skip = new Set([...bought.map((p) => p.sq), ...exclude]);
  const scored = PRODUCTS.filter((q) => inStock(q) && !skip.has(q.sq)).map((q) => {
    let best = 0, why = "", via = null;
    for (const p of bought) {
      const mine = new Map(noteList(p).map((n) => [noteKey(n), n]).filter(([k]) => k));
      const sharedKeys = [...new Set(noteList(q).map(noteKey).filter((k) => k && mine.has(k)))];
      const shared = sharedKeys.map((k) => mine.get(k).toLowerCase().replace(/\b(accord|absolute)\b/g, "").trim());
      const tags = (q.x || []).filter((t) => (p.x || []).includes(t));
      let s = 0;
      if (q.cat === p.cat) s += 5; if (q.cat2 && q.cat2 === p.cat2) s += 2.5; if (q.cat === p.cat2 || q.cat2 === p.cat) s += 2;
      s += tags.length * 2 + shared.length * 1.5;
      if (q.sea === p.sea) s += 1; if (q.tm === p.tm) s += .5; if (q.brand === p.brand) s += .5;
      if (s > best) {
        best = s; via = p;
        const bits = [];
        if (shared.length) bits.push(`shares ${list(uniq(shared).slice(0, 3))}`);
        if (tags.length) bits.push(`same ${list(tags.slice(0, 2))} lean`);
        if (q.cat === p.cat) bits.push(`${(FAM_LABEL[q.cat] || q.cat).toLowerCase()} too`);
        why = `Next to ${p.short}: ${bits.length ? bits.join(", ") : famLine(q).toLowerCase()}.`;
      }
    }
    return { q, s: best, why, via };
  }).sort((a, b) => b.s - a.s || a.q.name.localeCompare(b.q.name));
  // spread the picks: at most two from the same house, so the surprise feels curated
  const out = [];
  for (const x of scored) {
    if (out.length >= n) break;
    if (out.filter((o) => o.q.brand === x.q.brand).length >= 2) continue;
    out.push(x);
  }
  return out.map((x) => ({ p: x.q, why: x.why }));
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const uniq = (a) => [...new Set(a)];
export const list = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

// Segments from an order: houses, families, how it was fulfilled, the last scent.
export function segmentsFromOrder(items, method) {
  const scents = scentsInOrder(items);
  return {
    houses: uniq(scents.map((p) => p.brand)),
    families: uniq(scents.flatMap((p) => [p.cat, p.cat2].filter(Boolean))),
    fulfil: method && method !== "unknown" ? [method] : [],
    lastScent: scents.length ? fullName(scents[scents.length - 1]) : undefined,
  };
}
