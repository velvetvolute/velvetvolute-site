// Static page generator for velvetvolute.ca. Runs at deploy time (netlify.toml build command) and
// writes: /fragrance/<slug>/ (one page per scent), /houses/ + /houses/<slug>/ (fragrance houses),
// /collections/ + /collections/<id>/ (special collections), /guides/ + /guides/<slug>/ (from content/guides/*.md),
// /compare/ + /compare/<slug>/ (from content/compare/posts.json + web.json and the charts in img/compare/),
// /site.css (the homepage stylesheet, extracted so every page shares one source of styling), /search.json and /sitemap.xml.
// All content comes from index.html's data (PRODUCTS, MOOD, SHERPA, FIT, HER, TAGS), bundles.json and
// content/, so stock, prices and copy stay in sync with the shop without a second edit.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = new URL(".", import.meta.url).pathname;
const SITE = "https://velvetvolute.ca";
const TODAY = new Date().toISOString().slice(0, 10);
const html = readFileSync(join(ROOT, "index.html"), "utf8");

/* ---------- data: evaluate the homepage's own constants in a sandbox ---------- */
const grab = (name) => {
  const m = html.match(new RegExp(`\\n(const ${name}=[\\s\\S]*?;)\\n`));
  if (!m) throw new Error("missing const " + name);
  return m[1];
};
const ctx = {};
vm.createContext(ctx);
for (const n of ["IMG", "IMG_L", "IMG_R", "PRODUCTS", "MOOD", "HER", "SHERPA", "FIT", "TAGS", "ADDED", "FAM_LABEL"]) vm.runInContext(grab(n).replace(/^const /, "var "), ctx);
const { PRODUCTS, MOOD, HER, SHERPA, FIT, TAGS, FAM_LABEL } = ctx;
const ROLL_EXTRA = 4;
for (const p of PRODUCTS) {
  if (MOOD[p.name]) p.mood = MOOD[p.name];
  const h = HER[p.name]; if (h) { p.her = h[0]; p.herWhy = h[1]; }
  const t = TAGS[p.name]; if (t) { p.str = t.s; p.x = t.x || []; }
  p.r = { 5: p.p[5] + ROLL_EXTRA, 10: p.p[10] + ROLL_EXTRA };
}
const inStock = (p) => !!p.sq && !p.soon;
const BUNDLES = JSON.parse(readFileSync(join(ROOT, "bundles.json"), "utf8"));
const HOUSES = JSON.parse(readFileSync(join(ROOT, "content", "houses.json"), "utf8"));
const bItems = (b) => b.sq.map((id) => PRODUCTS.find((p) => p.sq === id)).filter(Boolean);
const bReady = (b) => bItems(b).length === b.sq.length && bItems(b).every(inStock);
const bBase = (b, z) => bItems(b).reduce((a, p) => a + p.p[z], 0);
const bPrice = (b, z) => Math.floor(bBase(b, z) * (100 - BUNDLES.pct) / 100);

/* ---------- helpers ---------- */
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const attr = esc;
const CONC = / (Extrait de Parfum|Eau de Parfum|Eau de Toilette|Parfum)$/;
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const pSlug = (p) => slugify(p.brand + " " + p.name.replace(CONC, ""));
const hSlug = (brand) => slugify(brand);
const pUrl = (p) => `/fragrance/${pSlug(p)}/`;
const hUrl = (brand) => `/houses/${hSlug(brand)}/`;
const cUrl = (b) => `/collections/${b.id}/`;
const shortName = (p) => p.name.replace(/^Uomo Born in Roma /, "").replace(/^Gentleman /, "").replace(/^Replica /, "").replace(CONC, "");
const low = (p) => Math.min(...Object.values(p.p));
const money = (n) => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
const SEA_TXT = { c: "Fall & winter", w: "Spring & summer", a: "All year" }, TM_TXT = { d: "Daytime", n: "Evenings", b: "Day or night" }, STR_TXT = { 1: "Soft & close", 2: "Noticeable", 3: "Bold" };
const SPRAYS = { 2: 25, 3: 35, 5: 60, 10: 120 };
const VIALS = { classic: { label: "Classic", key: "p", sizes: [2, 5, 10] }, luxe: { label: "Luxury", key: "l", sizes: [3, 5, 10] }, roll: { label: "Roll-on", key: "r", sizes: [5, 10] } };
const noteList = (p) => p.n ? [...p.n.t, ...p.n.h, ...p.n.b] : p.notes.replace(/\.$/, "").split(/,| and | over | with /).map((s) => s.trim()).filter(Boolean);
const noteKey = (s) => s.toLowerCase().replace(/\b(notes?|accord|absolute|bark|leaf|bean|wood)\b/g, "").replace(/[^a-z]+/g, " ").trim().split(" ")[0];

/* similar scents: shared family, descriptors and notes; in-stock first */
function similar(p, n = 8) {
  const mine = new Set(noteList(p).map(noteKey));
  const score = (q) => {
    let s = 0;
    if (q.cat === p.cat) s += 5; if (q.cat2 && q.cat2 === p.cat2) s += 2.5;
    if (q.cat === p.cat2 || q.cat2 === p.cat) s += 2;
    s += (q.x || []).filter((t) => (p.x || []).includes(t)).length * 2;
    s += noteList(q).map(noteKey).filter((k) => k && mine.has(k)).length * 1.5;
    if (q.sea === p.sea) s += 1; if (q.tm === p.tm) s += .5; if (q.brand === p.brand) s += .5;
    return s;
  };
  const r = PRODUCTS.filter((q) => q !== p).map((q) => ({ q, s: score(q) })).sort((a, b) => b.s - a.s || a.q.name.localeCompare(b.q.name));
  return [...r.filter((x) => inStock(x.q)), ...r.filter((x) => !inStock(x.q))].slice(0, n).map((x) => x.q);
}

/* ---------- shared chrome ---------- */
const styleBlock = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const FONTS = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const OG_DEFAULT = { src: "img/og-velvetvolute-bb4b0b5447.jpg", w: 1200, h: 630, alt: "Tom Ford Tuscan Leather bottle beside Velvet Volute decant vials, with the VV logo" };
/* image: { src, w, h, alt } for the social card (defaults to the site card); type: og:type (product, article, website);
   dates: { published, modified } for articles; jsonld: one object or an array, each written as its own script tag. */
function head({ title, desc, url, image, jsonld, current, type, dates }) {
  const im = image && image.src ? image : OG_DEFAULT;
  const ogType = type || (url.startsWith("/fragrance/") ? "product" : "website");
  const ld = jsonld ? (Array.isArray(jsonld) ? jsonld : [jsonld]).map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/<\//g, "<\\/")}</script>`).join("\n") : "";
  return `<!DOCTYPE html>
<html lang="en-CA" data-palette="camel-m" data-tiles="camel">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#4a0e1e">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="Velvet Volute"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}"><meta property="og:url" content="${SITE}${url}"><meta property="og:locale" content="en_CA">
<meta property="og:image" content="${SITE}/${im.src}"><meta property="og:image:width" content="${im.w || 1000}"><meta property="og:image:height" content="${im.h || 1000}"><meta property="og:image:alt" content="${attr(im.alt || title)}">${dates ? `<meta property="article:published_time" content="${dates.published}"><meta property="article:modified_time" content="${dates.modified || dates.published}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${attr(title)}"><meta name="twitter:description" content="${attr(desc)}"><meta name="twitter:image" content="${SITE}/${im.src}"><meta name="twitter:image:alt" content="${attr(im.alt || title)}">
${ld}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONTS}
<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/pages.css"><link rel="stylesheet" href="/nav.css"><script src="/nav.js" defer></script><script src="/track.js" defer></script>
</head>
<body>
<div class="bar">Free Ottawa hand delivery over $65 · Free Canada-wide shipping over $85 · Ottawa pickup · Authentic bottles only</div>
<header><div class="wrap nav">
  <button type="button" class="menu-open" id="menu-open" aria-label="Open menu" aria-expanded="false" aria-controls="mnav"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><a class="logo" href="/"><span class="mono">VV</span>Velvet <span>Volute</span></a>
  <nav><a href="/#shop">Shop</a><a href="/houses/"${current === "houses" ? ' aria-current="page"' : ""}>Fragrance Houses</a><a href="/collections/"${current === "collections" ? ' aria-current="page"' : ""}>Curated Collections</a><a href="/fragrance-101">Fragrance 101</a><a href="/about">About the Brand</a><a href="/how-it-works">How It Works</a><a href="/contact">Contact</a></nav><div class="icons"><button type="button" class="search-open" id="search-open" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg></button><a class="cart-open" href="/#cart-page" aria-label="Open cart"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg><span class="cart-lbl">Cart</span><span class="cart-count" id="cart-count" hidden>0</span></a></div>
</div></header>
<main>`;
}
const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><div class="wrap">${items.map((c, i) => c.href && i < items.length - 1 ? `<a href="${c.href}">${esc(c.name)}</a>` : `<span aria-current="page">${esc(c.name)}</span>`).join('<span class="sep">›</span>')}</div></nav>`;
const crumbLD = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, ...(c.href ? { item: SITE + c.href } : {}) })) });
/* The footer is the homepage's; the Guides and Compare links are added here so every generated page carries them
   (skipped once the homepage footer has them itself). */
const FOOT = html.match(/<footer>[\s\S]*?<\/footer>/)[0].replace(/<a class="pol-link" href="\/how-it-works#policies">Policies<\/a>/, (m, _o, s) => s.includes('href="/guides/"') ? m : `<a class="pol-link" href="/guides/">Guides</a> · <a class="pol-link" href="/compare/">Compare</a> · ${m}`);
const tail = (extraScript = "") => `</main>
${FOOT}
<a class="sh-fab" href="/#quiz" aria-label="Ask the Scent Sherpa" title="Ask the Scent Sherpa"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="12.5"/><path d="M16 5.5v2.2M16 24.3v2.2M5.5 16h2.2M24.3 16h2.2"/><path d="M19.8 12.2l-2.2 5.4-5.4 2.2 2.2-5.4z" fill="currentColor" stroke="none"/></svg><span class="sh-lbl">Ask the Scent Sherpa</span></a>
<script>
/* Cart badge: the cart itself lives on the homepage; pages only read the same saved cart. */
/* Scent Sherpa pill: shrinks to the compass while scrolling down, grows back on scroll-up or near the top (same as the static pages). */
(function(){var fab=document.querySelector(".sh-fab");if(!fab)return;var lastY=scrollY;function pill(){var y=scrollY;if(y<160)fab.classList.remove("compact");else if(y>lastY+6)fab.classList.add("compact");else if(y<lastY-6)fab.classList.remove("compact");lastY=y}
 addEventListener("scroll",pill,{passive:true});addEventListener("pageshow",function(){lastY=scrollY;fab.classList.toggle("compact",scrollY>320)});pill()})();
(function(){try{var s=JSON.parse(localStorage.getItem("vv-cart-v1")||"null"),n=s&&s.lines?s.lines.reduce(function(a,l){return a+(l.q||0)},0):0,b=document.getElementById("cart-count");if(b){b.textContent=n;b.hidden=!n}}catch(e){}})();
/* vvStrip(track, N, onIdx, onTap): a photo strip moved by hand, not by native scrolling, so one swipe (hard or soft) always moves exactly one slide, and it wraps:
   a copy of the last slide sits before the first and a copy of the first after the last; after sliding onto a copy we jump (unanimated) to the real one.
   onIdx(i) fires when a swipe or step lands on slide i; onTap(i) fires on a tap (not a swipe) while slide i is showing. */
function vvStrip(tr,N,onIdx,onTap){var SL=[].slice.call(tr.children),vi=0,settle,swiped=false;
 var cL=SL[N-1].cloneNode(true),cF=SL[0].cloneNode(true);cL.setAttribute("aria-hidden","true");cF.setAttribute("aria-hidden","true");tr.insertBefore(cL,SL[0]);tr.appendChild(cF);SL=[cL].concat(SL,[cF]);
 function place(off,anim){SL.forEach(function(s){s.style.transition=anim?"":"none";s.style.transform="translateX(calc("+(-(vi+1)*100)+"% + "+off+"px))"})}
 function norm(){clearTimeout(settle);if(vi<0||vi>=N){vi=(vi+N)%N;place(0,false)}}
 function cur(){return ((vi%N)+N)%N}
 function go(at){vi=at;place(0,true);clearTimeout(settle);if(vi<0||vi>=N)settle=setTimeout(norm,380)}
 function step(d){var ni=vi+d;if(onIdx)onIdx((ni+N)%N);go(ni)}
 place(0,false);
 var sx=null,sy=0,dx=0,drag=null,pid=null;
 tr.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse"&&e.button!==0)return;norm();sx=e.clientX;sy=e.clientY;dx=0;drag=null;pid=e.pointerId;try{tr.setPointerCapture(pid)}catch(x){}});
 tr.addEventListener("pointermove",function(e){if(sx===null||e.pointerId!==pid)return;var mx=e.clientX-sx,my=e.clientY-sy;
  if(drag===null){if(Math.hypot(mx,my)<8)return;drag=Math.abs(mx)>=Math.abs(my)*.8;if(drag)tr.classList.add("drag")}
  if(!drag)return;dx=mx;place(dx,false);e.preventDefault()});
 /* a quick flick may deliver only a couple of move events, so the decision is made from where the finger lifted, not just the last move */
 function end(e){if(sx===null||e.pointerId!==pid)return;var fx=e.type==="pointercancel"?dx:e.clientX-sx,fy=e.type==="pointercancel"?0:e.clientY-sy;
  if(drag===null&&Math.abs(fx)>=8&&Math.abs(fx)>=Math.abs(fy)*.8)drag=true;
  if(drag){tr.classList.remove("drag");swiped=true;var th=Math.min(40,tr.clientWidth*.1);if(Math.abs(fx)>th)step(fx<0?1:-1);else place(0,true)}
  else if(drag===null&&e.type==="pointerup"&&onTap&&!(e.target.closest&&e.target.closest("a,button")))onTap(cur());sx=null;drag=null;pid=null}
 tr.addEventListener("pointerup",end);tr.addEventListener("pointercancel",end);
 tr.addEventListener("lostpointercapture",function(e){if(sx!==null&&e.pointerId===pid)end({type:"pointercancel",pointerId:pid})});
 tr.addEventListener("dragstart",function(e){e.preventDefault()});
 /* a swipe that started on a link must not also follow the link */
 tr.addEventListener("click",function(e){if(swiped){e.preventDefault();e.stopPropagation()}swiped=false},true);
 /* trackpad / horizontal mouse wheel: one step per gesture */
 var wacc=0,wt=0,wdone=false;
 tr.addEventListener("wheel",function(e){if(Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;e.preventDefault();var now=Date.now();if(now-wt>200){wacc=0;wdone=false}wt=now;wacc+=e.deltaX;if(!wdone&&Math.abs(wacc)>40){wdone=true;step(wacc>0?1:-1)}},{passive:false});
 return {go:function(i){if(i!==cur())go(i)},step:step,index:cur}}
${extraScript}
</script>
</body>
</html>`;

/* ---------- tiles ---------- */
const collArt = (b) => { const f = readdirSync(join(ROOT, "img")).find((n) => n.startsWith(`coll-${b.id}-`) && n.endsWith(".jpg")); return f ? "img/" + f : null; };
const houseArt = (brand) => ["svg", "png"].map((e) => `content/houses/${hSlug(brand)}.${e}`).find((f) => existsSync(join(ROOT, f)));
// Bottle shown on each house tile: Justin's pick per house (first entry that has a real photo), else the first scent with a real photo, else none.
const HOUSE_BOTTLE = { "Armani": ["I Will"], "Claude Marsal": ["Or Noir"], "Ferragamo": ["Uomo Signature"], "Gabriella Antosh": ["Zoltan"], "Givenchy": ["Gentleman"], "Maison Francis Kurkdjian": ["Baccarat Rouge"], "Maison Margiela": ["Jazz Club"], "Nishane": ["Tempfluo"], "Tom Ford": ["Tuscan Leather"], "Valentino": ["Green Stravaganza"], "Xerjoff": ["Erba Pura"], "Yves Saint Laurent": ["La Nuit"] };
const realPhoto = (p) => p.img && !/coming-soon/.test(p.img);
const houseBottle = (brand) => { const own = PRODUCTS.filter((p) => p.brand === brand && realPhoto(p)); const want = (HOUSE_BOTTLE[brand] || []).map((k) => own.find((p) => p.name.includes(k))).find(Boolean); return (want || own[0] || {}).img; };
const houseTile = (brand, meta, count, soon) => { const art = houseArt(brand), bottle = art ? null : houseBottle(brand); return `<a class="htile${soon ? " soon" : ""}${bottle ? " has-bottle" : ""}" href="${hUrl(brand)}">${bottle ? `<img class="bottle" src="/${bottle}" alt="" width="400" height="240" loading="lazy" decoding="async"><span class="txt">` : ""}${art ? `<img class="art" src="/${art}" alt="${attr(brand)}" width="200" height="80" loading="lazy">` : `${meta.pre ? `<span class="pre">${esc(meta.pre)}</span>` : ""}<span class="n${(meta.mark || brand).length > 10 ? " two" : ""}">${esc(meta.mark || brand)}</span>`}<span class="rule"></span><span class="o">${esc(meta.city || "")}</span><span class="cnt">${soon ? "arriving soon" : `${count} scent${count === 1 ? "" : "s"}`}</span>${bottle ? "</span>" : ""}</a>`; };
const scentTile = (p) => `<a class="stile" href="${pUrl(p)}"><span class="ph"><img src="/${p.img}" width="720" height="720" alt="${attr(p.brand + " " + nameNoConc(p))} bottle with Velvet Volute decant vials" loading="lazy" decoding="async"></span><span class="t"><span class="b">${esc(p.brand)}</span><span class="nm">${esc(p.name)}</span><span class="pr">${inStock(p) ? `From ${money(low(p))}` : `<em>${esc(p.limited || "Arriving soon")}</em>`}</span></span></a>`;

/* ---------- product page ---------- */
/* "Nishane Kredo extrait bottle with 2, 5 and 10 ml Velvet Volute decants": the concentration word comes from the product name */
const CONC_WORD = { "Extrait de Parfum": "extrait", "Eau de Parfum": "eau de parfum", "Eau de Toilette": "eau de toilette", "Parfum": "parfum" };
const concOf = (p) => (p.name.match(CONC) || [])[1] || "";
const nameNoConc = (p) => p.name.replace(CONC, "");
const bottleAlt = (p, vial) => `${p.brand} ${nameNoConc(p)}${concOf(p) ? " " + CONC_WORD[concOf(p)] : ""} bottle with ${vial === "luxe" ? "3, 5 and 10 ml Velvet Volute luxury decant bottles" : vial === "roll" ? "5 and 10 ml Velvet Volute roll-on decants" : "2, 5 and 10 ml Velvet Volute decants"}`;
const PROPER = /^(Calabrian|Madagascar|Turkish|Sicilian|Italian|Indian|Chinese|Java|Haitian|Bourbon|Mediterranean|Sichuan|Tahitian|Virginia|Bulgarian|Florentine|Egyptian|Tonka)\b/;
const lcNote = (s) => PROPER.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
const joinAnd = (a) => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
/* Title: "Tom Ford Tuscan Leather decant · 2, 5 & 10 ml | Velvet Volute Ottawa", trimmed step by step for long names */
function productTitle(p) {
  const tail = " decant · 2, 5 & 10 ml | Velvet Volute Ottawa";
  for (const lead of [`${p.brand} ${nameNoConc(p)}`, nameNoConc(p), `${p.brand} ${shortName(p)}`, shortName(p)]) if ((lead + tail).length <= 68) return lead + tail;
  return shortName(p) + tail;
}
/* fit(candidates): the first description between 140 and 160 characters, else the longest one under 160, else the shortest */
const fit = (cands) => cands.find((c) => c.length >= 140 && c.length <= 160) || cands.filter((c) => c.length <= 160).sort((a, b) => b.length - a.length)[0] || [...cands].sort((a, b) => a.length - b.length)[0];
/* Description, 140 to 160 characters: house, name, notes, sizes, price and Ottawa / Canada delivery */
function productDesc(p) {
  const notes = [...new Set(noteList(p).map((n) => n.trim()).filter(Boolean))];
  const from = `from ${money(low(p))} CAD`;
  const cands = [];
  for (const n of [3, 2, 4, 1]) {
    const ns = joinAnd(notes.slice(0, n).map(lcNote));
    for (const lead of [`${p.brand} ${nameNoConc(p)} decant`, `${p.brand} ${shortName(p)} decant`]) {
      cands.push(`${lead}: ${ns}. Hand-poured from a sealed bottle in 2, 5 and 10 ml ${from}. Ottawa pickup, hand delivery or shipping across Canada.`);
      cands.push(`${lead}: ${ns}. Hand-poured from a sealed bottle, 2 to 10 ml ${from}. Ottawa pickup or shipping across Canada.`);
      cands.push(`${lead}: ${ns}. Poured from a sealed bottle, 2 to 10 ml ${from}. Ottawa pickup or shipped across Canada.`);
    }
  }
  return fit(cands);
}
const SHIP_LD = { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: 9, currency: "CAD" }, shippingDestination: { "@type": "DefinedRegion", addressCountry: "CA" }, deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 8, unitCode: "DAY" } } };
const RETURN_LD = { "@type": "MerchantReturnPolicy", applicableCountry: "CA", returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" };
const comparesOf = (p) => COMPARES.filter((c) => c.cols.some((x) => x.sq === p.sq));
const bundlesOf = (p) => BUNDLES.bundles.filter((b) => b.sq.includes(p.sq));
function productPage(p) {
  const sh = SHERPA[p.name] || {}, meta = HOUSES[p.brand] || {};
  const url = pUrl(p), title = productTitle(p), desc = productDesc(p);
  const sizes = Object.entries(VIALS).map(([k, v]) => v.sizes.map((z) => ({ k, z, label: v.label, price: p[v.key][z] }))).flat();
  const avail = inStock(p) ? "https://schema.org/InStock" : "https://schema.org/PreOrder";
  const images = [...new Set([p.img, p.imgL, p.imgR].filter(Boolean))].map((i) => `${SITE}/${i}`);
  const ld = [{
    "@context": "https://schema.org", "@type": "Product", name: `${p.brand} ${p.name} decant`, image: images, description: desc, brand: { "@type": "Brand", name: p.brand }, sku: p.sq, url: SITE + url,
    category: "Fragrance decants", ...(concOf(p) ? { additionalProperty: [{ "@type": "PropertyValue", name: "Concentration", value: concOf(p) }] } : {}),
    audience: { "@type": "PeopleAudience", suggestedGender: p.g === "Men" ? "male" : "unisex" },
    offers: sizes.map((s) => ({ "@type": "Offer", name: `${s.z} ml ${s.label} decant`, sku: `${p.sq}-${s.k}-${s.z}`, price: s.price, priceCurrency: "CAD", availability: avail, itemCondition: "https://schema.org/NewCondition", url: SITE + url + "#buy",
      seller: { "@type": "Organization", name: "Velvet Volute", url: SITE + "/" }, areaServed: { "@type": "Country", name: "Canada" },
      availableDeliveryMethod: ["https://schema.org/OnSitePickup", "https://schema.org/ParcelService"], shippingDetails: SHIP_LD, hasMerchantReturnPolicy: RETURN_LD })),
  }, crumbLD([{ name: "Shop", href: "/" }, { name: p.brand, href: hUrl(p.brand) }, { name: p.name }])];
  const sims = similar(p);
  const pyramid = p.n ? (p.n.h.length || p.n.b.length ? `<dl class="pyr3"><div><dt>Top</dt><dd>${p.n.t.map(esc).join(", ")}</dd></div><div><dt>Heart</dt><dd>${p.n.h.map(esc).join(", ")}</dd></div><div><dt>Base</dt><dd>${p.n.b.map(esc).join(", ")}</dd></div></dl>` : `<dl class="pyr3 flat"><div><dt>Key notes</dt><dd>${p.n.t.map(esc).join(", ")}</dd></div></dl>`) : `<p>${esc(p.notes)}</p>`;
  const data = { sq: p.sq, name: p.name, brand: p.brand, img: p.img, imgL: p.imgL, imgR: p.imgR, p: p.p, l: p.l, r: p.r, stock: inStock(p) };
  const partOf = [...bundlesOf(p).map((b) => `<li><a href="${cUrl(b)}">${esc(b.name)}</a><span>${bItems(b).length} scents as a set, ${BUNDLES.pct}% off</span></li>`),
    ...comparesOf(p).map((c) => `<li><a href="${compUrl(c)}">${esc(compName(c))}, compared</a><span>${esc(c.cols.map((x) => x.short).join(" vs "))}</span></li>`)];
  return head({ title, desc, url, image: { src: p.img, w: 1000, h: 1000, alt: bottleAlt(p, "classic") }, jsonld: ld }) + crumbs([{ name: "Shop", href: "/" }, { name: p.brand, href: hUrl(p.brand) }, { name: p.name }]) + `
<article class="pp wrap">
 <div class="pp-left">
 <div class="pp-photo carousel" id="ppcar"><div class="track">${[["classic", p.img, "Classic vials"], ["luxe", p.imgL || p.img, "Luxury bottles"], ["roll", p.imgR || p.img, "Roll-ons"]].map(([k, src, cap], i) => `<figure class="slide" data-v="${k}"><img src="/${src}" width="720" height="720" alt="${attr(bottleAlt(p, k))}" decoding="async"${i ? ' loading="lazy"' : ' fetchpriority="high"'}><figcaption><b>${cap}</b></figcaption></figure>`).join("")}</div>
  <button type="button" class="car-btn prev" aria-label="Previous vial type">‹</button><button type="button" class="car-btn next" aria-label="Next vial type">›</button>
  <div class="dots" role="tablist" aria-label="Vial type photos">${Object.entries(VIALS).map(([k, o], i) => `<button type="button" role="tab" data-v="${k}" aria-label="${o.label}"${i ? "" : ' aria-selected="true" class="on"'}></button>`).join("")}</div></div>
 <div class="pp-buy">
  <section class="buy" id="buy">
   <div class="vials" role="group" aria-label="Vial type">${Object.entries(VIALS).map(([k, o], i) => `<button type="button" class="vt${i ? "" : " on"}" data-v="${k}" aria-pressed="${!i}">${o.label}${k === "luxe" ? '<span class="vup">+$3</span>' : k === "roll" ? '<span class="vup">+$4</span>' : ""}</button>`).join("")}</div>
   <p class="vdesc" id="vdesc"></p>
   <div class="sizes" role="group" aria-label="Size" id="sizes"></div>
   <div class="buyrow"><div class="price" id="price"></div>${inStock(p) ? `<button type="button" class="order add" id="add">Add to cart</button>` : `<span class="soon-tag">${esc(p.limited || "Arriving soon")} · not yet orderable</span>`}</div>
   <p class="fine">Hand-decanted from an authentic bottle into a new vial. Free shipping in Canada over $85, or pick up in Ottawa.</p>
  </section>
 </div>
 </div>
 <div class="pp-right">
 <div class="pp-head">
  <a class="pp-brand" href="${hUrl(p.brand)}">${esc(p.brand)}<span>${p.g === "Men" ? "For him" : "Unisex"}</span></a>
  <h1>${esc(p.name)}</h1>
  ${p.limited ? `<div class="limited">${esc(p.limited)}</div>` : ""}
  <ul class="chips"><li>${esc(FAM_LABEL[p.cat] || p.cat)}${p.cat2 ? ` with ${esc((FAM_LABEL[p.cat2] || p.cat2).toLowerCase())}` : ""}</li><li>${SEA_TXT[p.sea]}</li><li>${TM_TXT[p.tm]}</li><li>${STR_TXT[p.str || 2]}</li></ul>
  ${sh.vibe ? `<p class="lede">${esc(sh.vibe)}</p>` : ""}
 </div>
 <div class="pp-story">
  ${p.mood ? `<h2>The story</h2><p class="mood">${esc(p.mood)}</p>` : ""}
  ${sh.when ? `<h2>When to wear it</h2><p>${esc(sh.when)}</p>` : ""}
  ${p.herWhy ? `<h2>Why it <em>also</em> works for her</h2><p>${esc(p.herWhy)}</p>` : ""}
  <h2>Notes</h2>${pyramid}
  ${meta.about ? `<h2>About ${esc(p.brand)}</h2><p>${esc(meta.about.split(/(?<=\.)\s/)[0])} <a href="${hUrl(p.brand)}">More about the house →</a></p>` : ""}
  ${partOf.length ? `<h2>Part of</h2><ul class="pp-links">${partOf.join("")}</ul>` : ""}
 </div>
 </div>
</article>
<section class="also"><div class="wrap"><h2>You may also like</h2><p class="sub">Picked by shared notes and families</p></div><div class="rail-wrap"><div class="rail wrap">${sims.map(scentTile).join("")}</div></div></section>
` + tail(`
(function(){var P=${JSON.stringify(data)},V=${JSON.stringify(VIALS)},SPR=${JSON.stringify(SPRAYS)},ROLL={5:"",10:""};
var v="classic",z=2,$=function(i){return document.getElementById(i)};
var VD={classic:"A clear glass vial with a fine-mist atomizer. Our everyday decant.",luxe:"A weighted glass bottle with a gold cap and a fine-mist atomizer. The gift-ready one.",roll:"A glass roll-on for the wrist and neck, no spray. Ideal for travel and the office."};
function price(){var b=P[V[v].key][z];return b}
function draw(){$("sizes").innerHTML=V[v].sizes.map(function(s){return '<button type="button" class="sz'+(s===z?" on":"")+'" data-s="'+s+'" aria-pressed="'+(s===z)+'">'+s+' ml<span class="pml-b">$'+(P[V[v].key][s]/s).toFixed(2)+'/ml</span></button>'}).join("");
 $("price").innerHTML='$'+price()+'<small>CAD · '+z+' ml '+V[v].label.toLowerCase()+'</small><span class="sprays">'+(v==="roll"?"":"About "+SPR[z]+" sprays")+'</span>';
 $("vdesc").textContent=VD[v];
 document.querySelectorAll(".vt,#ppcar .dots button").forEach(function(b){var on=b.dataset.v===v;b.classList.toggle("on",on);b.setAttribute(b.classList.contains("vt")?"aria-pressed":"aria-selected",on)});
 document.querySelectorAll(".sz").forEach(function(b){b.onclick=function(){z=+b.dataset.s;ZS[v]=z;draw()}})}
/* the photo is a swipeable strip: classic, luxury, roll-on. Swiping it changes the vial type; the vial tabs, dots and arrows step it. */
var KEYS=Object.keys(V),tr=document.querySelector("#ppcar .track"),ZS={classic:2};
/* size follows you between vial types: a size you tapped is remembered for that type; otherwise the current size carries over when the new type offers it, else its smallest */
function setV(nv,fromSwipe){if(nv!==v){v=nv;var S0=V[v].sizes;z=S0.indexOf(ZS[v])>=0?ZS[v]:S0.indexOf(z)>=0?z:S0[0];draw()}if(!fromSwipe)S.go(KEYS.indexOf(v))}
var S=vvStrip(tr,KEYS.length,function(i){setV(KEYS[i],true)},null);
document.querySelectorAll(".vt,#ppcar .dots button").forEach(function(b){b.onclick=function(){setV(b.dataset.v)}});
document.querySelector("#ppcar .prev").onclick=function(){S.step(-1)};
document.querySelector("#ppcar .next").onclick=function(){S.step(1)};
tr.tabIndex=0;tr.addEventListener("keydown",function(e){if(e.key==="ArrowLeft"){S.step(-1);e.preventDefault()}if(e.key==="ArrowRight"){S.step(1);e.preventDefault()}});
var add=$("add");if(add)add.onclick=function(){try{var K="vv-cart-v1",s=JSON.parse(localStorage.getItem(K)||"null")||{lines:[],ship:null,promo:null};s.lines=s.lines||[];var l=s.lines.find(function(x){return x.sq===P.sq&&x.v===v&&x.z===z});if(l)l.q=Math.min(10,l.q+1);else s.lines.push({sq:P.sq,v:v,z:z,q:1});localStorage.setItem(K,JSON.stringify(s));var n=s.lines.reduce(function(a,l){return a+l.q},0),c=$("cart-count");c.textContent=n;c.hidden=false}catch(e){}
 add.textContent="Added ✓";add.classList.add("done");var t=document.createElement("div");t.className="cart-toast on";t.innerHTML='Added '+P.name.split(" Eau")[0].split(" Extrait")[0]+' · '+z+' ml '+V[v].label.toLowerCase()+' <a href="/#cart-page">View cart</a>';document.body.appendChild(t);setTimeout(function(){add.textContent="Add to cart";add.classList.remove("done")},1400);setTimeout(function(){t.remove()},3200)};
draw()})();`);
}

/* ---------- house pages ---------- */
function housePage(brand, items) {
  const meta = HOUSES[brand] || {}, url = hUrl(brand), live = items.filter(inStock), soon = items.filter((p) => !inStock(p));
  const title = `${brand} decants & samples | Velvet Volute`;
  const names = items.map((p) => shortName(p)), from = money(Math.min(...items.map(low)));
  const list = (n) => `${names.slice(0, n).join(", ")}${names.length > n ? " and more" : ""}`;
  const desc = fit([5, 4, 3, 2, 6, 1].flatMap((n) => [`${brand} decants in Ottawa: ${list(n)}. Hand-poured from sealed bottles, 2 to 10 ml from ${from} CAD. Ottawa pickup, hand delivery or shipping across Canada.`,
    `${brand} decants in Ottawa: ${list(n)}. Hand-poured from sealed bottles in 2, 5 and 10 ml from ${from} CAD. Ottawa pickup or shipping across Canada.`,
    `${brand} fragrance decants and samples: ${list(n)}. Poured from sealed bottles, 2 to 10 ml from ${from} CAD. Ottawa pickup or shipped across Canada.`,
    `${brand} decants: ${list(n)}. 2 to 10 ml from ${from} CAD, poured from sealed bottles. Ottawa pickup or shipped across Canada.`]));
  const facts = [meta.founded ? ["Founded", meta.founded] : null, meta.city ? ["Home", meta.city] : null, meta.known ? ["Known for", meta.known] : null].filter(Boolean);
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Fragrance Houses", href: "/houses/" }, { name: brand }]), { "@context": "https://schema.org", "@type": "CollectionPage", name: `${brand} at Velvet Volute`, url: SITE + url, description: desc }];
  return head({ title, desc, url, jsonld: ld, current: "houses" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Fragrance Houses", href: "/houses/" }, { name: brand }]) + `
<section class="house wrap">
 <div class="house-head">${houseTile(brand, meta, items.length, false).replace("<a ", '<div ').replace("</a>", "</div>").replace(/href="[^"]*"/, "")}
  <div class="house-about"><h1>${esc(brand)}</h1>
   ${(meta.about || "").split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join("")}
   ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
   ${meta.source ? `<p class="src">Facts checked against the house's own site and independent references.</p>` : ""}
  </div>
 </div>
 <h2 class="sec-h">${live.length ? `${live.length} ${brand} scent${live.length === 1 ? "" : "s"} in stock` : `${brand} at Velvet Volute`}</h2>
 <div class="stiles">${live.map(scentTile).join("")}${soon.map(scentTile).join("")}</div>
 ${soon.length && live.length ? `<p class="note">${soon.length === 1 ? "One is" : soon.length + " are"} arriving soon and can't be ordered yet.</p>` : ""}
</section>` + tail();
}

function housesIndex(groups) {
  const url = "/houses/", title = "Fragrance houses | Velvet Volute decants, Ottawa";
  const desc = fit([6, 5, 4, 3, 2].flatMap((n) => [`Fragrance decants by house: ${groups.map(([b]) => b).slice(0, n).join(", ")} and more. ${groups.length} houses, ${PRODUCTS.length} scents, 2 to 10 ml, poured from sealed bottles. Ottawa pickup or shipping across Canada.`,
    `Decants by house: ${groups.map(([b]) => b).slice(0, n).join(", ")} and more. ${groups.length} houses, ${PRODUCTS.length} scents, 2 to 10 ml from sealed bottles. Ottawa pickup or shipped across Canada.`]));
  /* every house sits in the one grid; "arriving soon" is shown on the scent tiles inside each house page */
  return head({ title, desc, url, jsonld: crumbLD([{ name: "Shop", href: "/" }, { name: "Fragrance Houses" }]), current: "houses" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Fragrance Houses" }]) + `
<section class="houses wrap">
 <h1>Every house we pour from</h1>
 <p class="lede">${groups.length} houses, ${PRODUCTS.length} scents, one standard: every decant comes from an authentic bottle we own. Pick a house to read its story and see what we carry.</p>
 <div class="htiles">${groups.map(([b, items]) => houseTile(b, HOUSES[b] || {}, items.length, false)).join("")}</div>
</section>` + tail();
}

/* ---------- collection pages ---------- */
function collectionPage(b) {
  const items = bItems(b), url = cUrl(b), ready = bReady(b);
  const title = `${b.name} | ${b.house} decant set | Velvet Volute`;
  const desc = fit([`${b.name}: ${joinAnd(items.map(shortName))} as a matching decant set, ${BUNDLES.pct}% off. 2 ml or 5 ml each, poured from sealed bottles. Ottawa pickup or shipping across Canada.`,
    `${b.name}: ${joinAnd(items.map(shortName))} as a matching set of decants, ${BUNDLES.pct}% off. 2 or 5 ml each, from sealed bottles. Ottawa pickup or shipped across Canada.`,
    `${b.name}: ${joinAnd(items.map(shortName))}, ${BUNDLES.pct}% off as a set of 2 ml or 5 ml decants. Ottawa pickup or shipping across Canada.`,
    `${b.name}: ${joinAnd(items.map(shortName))}. ${BUNDLES.pct}% off as a set of 2 or 5 ml decants. Ottawa pickup or shipped across Canada.`,
    `${b.name}: ${joinAnd(items.map(shortName))}, ${BUNDLES.pct}% off as a set of 2 or 5 ml decants. Ottawa pickup or shipping in Canada.`,
    `${b.name}: ${joinAnd(items.map(shortName))} as 2 or 5 ml decants, ${BUNDLES.pct}% off the set. Ottawa pickup or shipped in Canada.`,
    `${b.name}: ${items.length} ${b.house} scents as a matching set of 2 ml or 5 ml decants, ${BUNDLES.pct}% off. Poured from sealed bottles. Ottawa pickup or shipping across Canada.`,
    `${b.name}: ${items.length} scents as a matching set of 2 ml or 5 ml decants, ${BUNDLES.pct}% off. Poured from sealed bottles. Ottawa pickup or shipped across Canada.`]);
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Curated Collections", href: "/collections/" }, { name: b.name }]), { "@context": "https://schema.org", "@type": "Product", name: b.name, description: desc, url: SITE + url, image: items.map((p) => `${SITE}/${p.img}`), brand: { "@type": "Brand", name: b.house }, offers: { "@type": "AggregateOffer", priceCurrency: "CAD", lowPrice: bPrice(b, BUNDLES.sizes[0]), highPrice: bPrice(b, BUNDLES.sizes[BUNDLES.sizes.length - 1]), offerCount: BUNDLES.sizes.length, availability: ready ? "https://schema.org/InStock" : "https://schema.org/PreOrder" } }];
  return head({ title, desc, url, image: collArt(b) || items[0]?.img, jsonld: ld, current: "collections" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Curated Collections", href: "/collections/" }, { name: b.name }]) + `
<section class="coll wrap">
 <div class="coll-left">
 <div class="coll-head"><div class="eyebrow">${esc(b.house)} · ${items.length} scents · ${BUNDLES.pct}% off the set</div><h1>${esc(b.name)}</h1>
 <p class="lede">${esc(b.blurb)}</p></div>
 </div>
 <div class="coll-right">
 <div class="carousel" id="car"><div class="track" role="link" title="Open the full page" aria-label="Scents in this collection, swipe to change">${items.map((p, i) => `<figure class="slide" id="s${i}" data-href="${pUrl(p)}"><img src="/${p.img}" width="720" height="720" alt="${attr(bottleAlt(p, "classic"))}" loading="${i ? "lazy" : "eager"}" decoding="async"><figcaption><b>${esc(shortName(p))}</b><span>${esc(p.brand)} · ${inStock(p) ? `from ${money(low(p))}` : esc(p.limited || "arriving soon")}</span><a class="more" href="${pUrl(p)}">Full page →</a></figcaption></figure>`).join("")}</div>
  <button type="button" class="car-btn prev" aria-label="Previous scent">‹</button><button type="button" class="car-btn next" aria-label="Next scent">›</button>
  <div class="dots" role="tablist" aria-label="Scents in this collection">${items.map((p, i) => `<button type="button" role="tab" data-i="${i}" aria-label="${attr(shortName(p))}"${i ? "" : ' aria-selected="true" class="on"'}></button>`).join("")}</div>
 </div>
 </div>
 <div class="coll-left coll-left-2">
 <div class="coll-buy">
  <div class="sizes" role="group" aria-label="Vial size">${BUNDLES.sizes.map((z, k) => `<button type="button" class="sz${k ? "" : " on"}" data-z="${z}" aria-pressed="${!k}">${z} ml each</button>`).join("")}</div>
  <div class="buyrow"><div class="price" id="cprice"></div>${ready ? `<button type="button" class="order add" id="cadd">Add the set</button>` : `<span class="soon-tag">Available once every scent in the set is in stock</span>`}</div>
  <ul class="coll-list">${items.map((p) => `<li><a href="${pUrl(p)}">${esc(p.brand)} ${esc(p.name)}</a>${inStock(p) ? "" : ` <em>· ${esc(p.limited || "arriving soon")}</em>`}</li>`).join("")}</ul>
 </div>
 </div>
</section>` + tail(`
(function(){var B=${JSON.stringify({ id: b.id, name: b.name, base: Object.fromEntries(BUNDLES.sizes.map((z) => [z, bBase(b, z)])), price: Object.fromEntries(BUNDLES.sizes.map((z) => [z, bPrice(b, z)])), n: items.length })},z=${BUNDLES.sizes[0]},$=function(i){return document.getElementById(i)};
function draw(){$("cprice").innerHTML='<s class="was">$'+B.base[z]+'</s>$'+B.price[z]+'<small>CAD · '+B.n+' × '+z+' ml classic · save $'+(B.base[z]-B.price[z])+'</small>';document.querySelectorAll(".coll-buy .sz").forEach(function(b){b.classList.toggle("on",+b.dataset.z===z);b.setAttribute("aria-pressed",+b.dataset.z===z)})}
document.querySelectorAll(".coll-buy .sz").forEach(function(b){b.onclick=function(){z=+b.dataset.z;draw()}});
var add=$("cadd");if(add)add.onclick=function(){try{var K="vv-cart-v1",s=JSON.parse(localStorage.getItem(K)||"null")||{lines:[],ship:null,promo:null};s.lines=s.lines||[];var l=s.lines.find(function(x){return x.b===B.id&&x.z===z});if(l)l.q=Math.min(10,l.q+1);else s.lines.push({b:B.id,z:z,q:1});localStorage.setItem(K,JSON.stringify(s));var n=s.lines.reduce(function(a,l){return a+l.q},0),c=$("cart-count");c.textContent=n;c.hidden=false}catch(e){}
 add.textContent="Added ✓";add.classList.add("done");var t=document.createElement("div");t.className="cart-toast on";t.innerHTML='Added '+B.name+' · '+z+' ml each <a href="/#cart-page">View cart</a>';document.body.appendChild(t);setTimeout(function(){add.textContent="Add the set";add.classList.remove("done")},1400);setTimeout(function(){t.remove()},3200)};
/* the photos are a swipeable strip: one swipe moves one slide, it wraps around, the dots and arrows step it, a tap opens that scent's page */
var tr=document.querySelector("#car .track"),dots=document.querySelectorAll("#car .dots button"),HREF=[].slice.call(tr.children).map(function(f){return f.dataset.href});
var S=vvStrip(tr,HREF.length,function(i){dots.forEach(function(d,k){d.classList.toggle("on",k===i);d.setAttribute("aria-selected",k===i)})},function(i){location.href=HREF[i]});
dots.forEach(function(d){d.onclick=function(){S.go(+d.dataset.i)}});
document.querySelector("#car .prev").onclick=function(){S.step(-1)};document.querySelector("#car .next").onclick=function(){S.step(1)};
tr.tabIndex=0;tr.addEventListener("keydown",function(e){if(e.key==="ArrowLeft"){S.step(-1);e.preventDefault()}if(e.key==="ArrowRight"){S.step(1);e.preventDefault()}});
draw()})();`);
}
function collectionsIndex() {
  const url = "/collections/", title = "Curated Collections | Velvet Volute decant sets";
  const desc = fit([6, 5, 4, 3, 2].flatMap((n) => [`Curated decant sets, ${BUNDLES.pct}% off: ${BUNDLES.bundles.map((b) => b.name.replace(/^The /, "").replace(/ Collection$/, "")).slice(0, n).join(", ")} and more. Each scent as a 2 ml or 5 ml decant from a sealed bottle. Ottawa pickup or shipping across Canada.`,
    `Decant sets, ${BUNDLES.pct}% off: ${BUNDLES.bundles.map((b) => b.name.replace(/^The /, "").replace(/ Collection$/, "")).slice(0, n).join(", ")} and more. Each scent as a 2 or 5 ml decant from a sealed bottle. Ottawa pickup or shipped across Canada.`]));
  return head({ title, desc, url, jsonld: crumbLD([{ name: "Shop", href: "/" }, { name: "Curated Collections" }]), current: "collections" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Curated Collections" }]) + `
<section class="colls wrap">
 <h1>Curated Collections</h1>
 <p class="lede">Several scents from one house or one idea, poured as a matching set and ${BUNDLES.pct}% off together. Try the whole story, then go big on the one you love.</p>
 <div class="ctiles">${BUNDLES.bundles.map((b) => { const items = bItems(b); return `<a class="ctile" href="${cUrl(b)}"><span class="ph${collArt(b) ? " one" : ""}">${collArt(b) ? `<img src="/${collArt(b)}" width="1200" height="1200" alt="${attr(b.name)}: ${attr(items.map(shortName).join(", "))}" loading="lazy">` : items.slice(0, 4).map((p) => `<img src="/${p.img}" width="360" height="360" alt="${attr(p.brand + " " + nameNoConc(p))} bottle" loading="lazy">`).join("")}</span><span class="t"><span class="b">${esc(b.house)} · ${items.length} scents</span><span class="nm">${esc(b.name)}</span><span class="pr">${bReady(b) ? `Set from ${money(bPrice(b, BUNDLES.sizes[0]))}` : "<em>Arriving soon</em>"}</span></span></a>`; }).join("")}</div>
</section>` + tail();
}

/* ---------- guides: content/guides/<slug>.md -> /guides/<slug>/ ---------- */
/* Front matter between --- lines (title, slug, description, summary, date, updated, image, imageAlt, scents = Square ids for the rail),
   then a small Markdown subset: #/##/### headings, paragraphs, - and 1. lists, | tables |, > quotes, **bold**, *italic*, [text](url).
   {{count}}, {{houses}}, {{from2}} and {{from10}} are filled from the live product data so the copy can't drift from the shop. */
const GUIDE_DIR = join(ROOT, "content", "guides");
const TOKENS = { count: PRODUCTS.length, houses: new Set(PRODUCTS.map((p) => p.brand)).size, from2: money(Math.min(...PRODUCTS.filter(inStock).map((p) => p.p[2]))), from10: money(Math.min(...PRODUCTS.filter(inStock).map((p) => p.p[10]))) };
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
const hid = (t) => slugify(t.replace(/<[^>]+>/g, "")).slice(0, 60);
const plain = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
function parseGuide(file) {
  const raw = readFileSync(join(GUIDE_DIR, file), "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => TOKENS[k] ?? m);
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  for (const line of fm[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1"); }
  const lines = raw.slice(fm[0].length).split("\n");
  const out = [], heads = [], faq = [];
  let para = [], list = null, table = null, quote = [], faqMode = false, q = null;
  const flush = () => {
    if (para.length) { const h = `<p>${inline(para.join(" "))}</p>`; out.push(h); if (q) q.a.push(plain(h)); para = []; }
    if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`); if (q) q.a.push(list.items.map(plain).join(" ")); list = null; }
    if (table) { const [hd, ...rows] = table; out.push(`<div class="tbl"><table><thead><tr>${hd.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => i ? `<td>${inline(c)}</td>` : `<th scope="row">${inline(c)}</th>`).join("")}</tr>`).join("")}</tbody></table></div>`); table = null; }
    if (quote.length) { out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`); quote = []; }
  };
  const words = lines.join(" ").split(/\s+/).filter((w) => /\w/.test(w)).length;
  for (const line of lines) {
    const h = line.match(/^(#{1,6}) (.+)$/), li = line.match(/^- (.+)$/), oi = line.match(/^\d+\. (.+)$/);
    if (!line.trim()) { flush(); continue; }
    if (h) { flush(); const lvl = h[1].length, txt = inline(h[2]), id = hid(h[2]);
      if (lvl === 2) { faqMode = /^faq$|questions/i.test(h[2]); q = null; heads.push({ id, txt }); }
      if (lvl === 3 && faqMode) { q = { q: plain(txt), a: [] }; faq.push(q); }
      out.push(`<h${lvl} id="${id}">${txt}</h${lvl}>`); continue; }
    if (li || oi) { const t = li ? "ul" : "ol"; if (!list || list.t !== t) { flush(); list = { t, items: [] }; } list.items.push((li || oi)[1]); continue; }
    if (line.startsWith("|")) { if (!table) { flush(); table = []; } const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()); if (!cells.every((c) => /^:?-+:?$/.test(c))) table.push(cells); continue; }
    if (line.startsWith("> ")) { if (para.length || list || table) flush(); quote.push(line.slice(2)); continue; }
    para.push(line.trim());
  }
  flush();
  return { ...meta, scents: (meta.scents || "").split(/\s*,\s*/).filter(Boolean), body: out.join("\n"), heads, faq, minutes: Math.max(1, Math.round(words / 220)) };
}
const GUIDES = existsSync(GUIDE_DIR) ? readdirSync(GUIDE_DIR).filter((f) => f.endsWith(".md")).map(parseGuide).sort((a, b) => a.date < b.date ? 1 : -1) : [];
const gUrl = (g) => `/guides/${g.slug}/`;
const niceDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const AUTHOR = { "@type": "Person", name: "Izzi", alternateName: "Justin Izzi", url: SITE + "/about" };
const PUBLISHER = { "@type": "Organization", "@id": SITE + "/#org", name: "Velvet Volute", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/apple-touch-icon.png" } };
const ctaBox = (txt) => `<aside class="panel cta-box"><p>${txt}</p><p class="cta-row"><a class="order" href="/#shop">Shop the collection</a><a class="ghost" href="/#quiz">Ask the Scent Sherpa</a></p></aside>`;
function guidePage(g) {
  const url = gUrl(g), title = `${g.title} | Velvet Volute`;
  const scents = g.scents.map((id) => PRODUCTS.find((p) => p.sq === id)).filter(Boolean);
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Guides", href: "/guides/" }, { name: g.title }]),
    { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, image: [SITE + "/" + g.image], datePublished: g.date, dateModified: g.updated || g.date, author: AUTHOR, publisher: PUBLISHER, mainEntityOfPage: SITE + url, inLanguage: "en-CA", wordCount: g.minutes * 220, about: scents.map((p) => ({ "@type": "Product", name: `${p.brand} ${p.name}`, url: SITE + pUrl(p) })) }];
  if (g.faq.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a.join(" ") } })) });
  const others = GUIDES.filter((x) => x !== g);
  return head({ title, desc: g.description, url, image: { src: g.image, w: 1000, h: 1000, alt: g.imageAlt || g.title }, jsonld: ld, type: "article", dates: { published: g.date, modified: g.updated || g.date } }) + crumbs([{ name: "Shop", href: "/" }, { name: "Guides", href: "/guides/" }, { name: g.title }]) + `
<article class="guide wrap">
 <div class="guide-head">
  <p class="eyebrow">Guide</p>
  <h1>${esc(g.title)}</h1>
  <p class="lede">${esc(g.description)}</p>
  <p class="guide-meta">By Izzi · Updated <time datetime="${g.updated || g.date}">${niceDate(g.updated || g.date)}</time> · ${g.minutes} min read</p>
 </div>
 <div class="guide-side">
  <figure class="guide-hero"><img src="/${g.image}" width="1000" height="1000" alt="${attr(g.imageAlt || g.title)}" fetchpriority="high" decoding="async"></figure>
  ${g.heads.length > 3 ? `<div class="toc" role="navigation" aria-label="In this guide"><p>In this guide</p><ol>${g.heads.map((h) => `<li><a href="#${h.id}">${h.txt}</a></li>`).join("")}</ol></div>` : ""}
 </div>
 <div class="guide-body">
  ${g.body}
  ${ctaBox("Every decant is poured from a sealed full bottle, in 2, 5 or 10 ml. Ottawa pickup, free hand delivery over $65, or shipped across Canada.")}
  ${others.length ? `<div class="more-guides" role="navigation" aria-label="More guides"><h2>More guides</h2><ul>${others.map((x) => `<li><a href="${gUrl(x)}">${esc(x.title)}</a><span>${esc(x.summary)}</span></li>`).join("")}<li><a href="/compare/">Compare the collection</a><span>Side-by-side tables for the sets and the house essentials.</span></li></ul></div>` : ""}
 </div>
</article>
${scents.length ? `<section class="also"><div class="wrap"><h2>Mentioned in this guide</h2><p class="sub">Tap a bottle for notes, story and sizes</p></div><div class="rail-wrap"><div class="rail wrap">${scents.map(scentTile).join("")}</div></div></section>` : ""}` + tail();
}
function guidesIndex() {
  const url = "/guides/", title = "Fragrance guides: decants, Nishane, EDT vs EDP | Velvet Volute";
  const desc = "Short, useful fragrance guides from Velvet Volute in Ottawa: how decants work and where to get them, Nishane for beginners, and EDT vs EDP vs Extrait explained.";
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Guides" }]), { "@context": "https://schema.org", "@type": "CollectionPage", name: "Velvet Volute guides", url: SITE + url, description: desc, hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: SITE + gUrl(g) })) }];
  return head({ title, desc, url, jsonld: ld }) + crumbs([{ name: "Shop", href: "/" }, { name: "Guides" }]) + `
<section class="guides wrap">
 <h1>Guides</h1>
 <p class="lede">The things I wish someone had told me at the start. Short reads, no gatekeeping, written for Ottawa.</p>
 <div class="gtiles">${GUIDES.map((g) => `<a class="gtile" href="${gUrl(g)}"><span class="ph"><img src="/${g.image}" width="600" height="600" alt="${attr(g.imageAlt || g.title)}" loading="lazy" decoding="async"></span><span class="t"><span class="b">Guide · ${g.minutes} min read</span><span class="nm">${esc(g.title)}</span><span class="s">${esc(g.summary)}</span></span></a>`).join("")}
  <a class="gtile" href="/compare/"><span class="ph"><img src="/${compImg(COMPARES[0]).jpg}" width="600" height="750" alt="${attr(compAlt(COMPARES[0]))}" loading="lazy" decoding="async"></span><span class="t"><span class="b">Compare · ${COMPARES.length} tables</span><span class="nm">Compare the collection</span><span class="s">Side-by-side: the Time Capsule, Born in Roma, four leathers, the Tom Ford essentials and more.</span></span></a>
 </div>
 <p class="guides-more">Start with <a href="/fragrance-101">Fragrance 101</a> if the words on the bottle still look like French homework.</p>
</section>` + tail();
}

/* ---------- comparison pages: content/compare/posts.json + web.json -> /compare/<slug>/ ---------- */
const COMP_DIR = join(ROOT, "content", "compare");
const COMP_WEB = existsSync(join(COMP_DIR, "web.json")) ? JSON.parse(readFileSync(join(COMP_DIR, "web.json"), "utf8")) : {};
const COMPARES = (existsSync(join(COMP_DIR, "posts.json")) ? JSON.parse(readFileSync(join(COMP_DIR, "posts.json"), "utf8")) : []).map((c) => ({ ...c, slug: c.slug.replace(/^\d+-/, "") })).filter((c) => COMP_WEB[c.slug]);
const compUrl = (c) => `/compare/${c.slug}/`;
const compName = (c) => COMP_WEB[c.slug].name;
const compImg = (c) => { const dir = join(ROOT, "img", "compare"), files = existsSync(dir) ? readdirSync(dir) : []; const f = (ext) => { const n = files.find((x) => x.startsWith(c.slug + "-") && x.endsWith("." + ext)); return n ? "img/compare/" + n : null; }; return { jpg: f("jpg"), webp: f("webp") }; };
const compAlt = (c) => `Comparison chart of ${joinAnd(c.cols.map((x) => x.house + " " + x.short))}: launch year, full-bottle retail, Velvet Volute decant prices, intensity, scent family, key notes, vibe and season`;
const unesc = (s) => String(s).replace(/&amp;/g, "&");
function comparePage(c) {
  const w = COMP_WEB[c.slug], url = compUrl(c), img = compImg(c);
  const cols = c.cols.map((x) => ({ ...x, p: PRODUCTS.find((p) => p.sq === x.sq) })).filter((x) => x.p);
  const names = cols.map((x) => unesc(x.short));
  const title = `${compName(c)} compared: ${names.join(" vs ")} | Velvet Volute`;
  const bundle = w.bundle ? BUNDLES.bundles.find((b) => b.id === w.bundle) : null;
  const retail = (x) => x.retail_text ? `${esc(x.retail_text)}${x.retail_small ? `<small>${esc(x.retail_small)}</small>` : ""}` : [x.r50 != null || x.s50 ? `<span class="rp">${typeof x.r50 === "number" ? "$" + x.r50 : esc(x.r50 ?? "—")}<small>${esc(x.s50 || "50 ml")}</small></span>` : null, x.r100 != null ? `<span class="rp">${typeof x.r100 === "number" ? "$" + x.r100 : esc(x.r100)}<small>${esc(x.s100 || "100 ml")}</small></span>` : null].filter(Boolean).join("") || "—";
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Compare", href: "/compare/" }, { name: compName(c) }]),
    { "@context": "https://schema.org", "@type": "WebPage", name: title.replace(/ \| Velvet Volute$/, ""), url: SITE + url, description: w.desc, inLanguage: "en-CA", primaryImageOfPage: { "@type": "ImageObject", url: SITE + "/" + img.jpg, width: 1080, height: 1350, caption: compAlt(c) }, author: AUTHOR, publisher: PUBLISHER,
      mainEntity: { "@type": "ItemList", name: `${compName(c)} compared`, itemListOrder: "https://schema.org/ItemListUnordered", numberOfItems: cols.length, itemListElement: cols.map((x, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Product", name: `${x.p.brand} ${x.p.name} decant`, url: SITE + pUrl(x.p), image: SITE + "/" + x.p.img, brand: { "@type": "Brand", name: x.p.brand } } })) } }];
  const rows = [
    ["Launched", (x) => esc(String(x.year ?? "—"))],
    ["Retail, full bottle", retail],
    ["Velvet Volute decants", (x) => inStock(x.p) ? `<a href="${pUrl(x.p)}">$${x.p.p[2]}–${x.p.p[10]}</a><small>2 to 10 ml</small>` : `<a href="${pUrl(x.p)}">${esc(x.p.limited || "Arriving soon")}</a>`],
    ["Intensity", (x) => `${x.intensity ?? 3} / 5<span class="dots-i" aria-hidden="true">${"●".repeat(x.intensity ?? 3)}${"○".repeat(5 - (x.intensity ?? 3))}</span>`],
    ["Family", (x) => esc(unesc(x.family))],
    ["Key notes", (x) => x.notes.map(esc).join("<br>")],
    ["Vibe", (x) => `<em>${esc(unesc(x.vibe))}</em>`],
    ["Season", (x) => `${SEA_TXT[x.p.sea]}<small>${TM_TXT[x.p.tm]}</small>`],
  ];
  return head({ title, desc: w.desc, url, image: { src: img.jpg, w: 1080, h: 1350, alt: compAlt(c) }, jsonld: ld, type: "article" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Compare", href: "/compare/" }, { name: compName(c) }]) + `
<section class="cmp wrap">
 <div class="cmp-head">
  <p class="eyebrow">${esc(unesc(c.eyebrow).toLowerCase().replace(/^\w/, (m) => m.toUpperCase()).replace(/\bx\b/g, "X"))}</p>
  <h1>${esc(w.h1)}</h1>
  <p class="lede">${esc(unesc(c.subtitle))}</p>
 </div>
 <figure class="cmp-img"><picture>${img.webp ? `<source type="image/webp" srcset="/${img.webp}">` : ""}<img src="/${img.jpg}" width="1080" height="1350" alt="${attr(compAlt(c))}" fetchpriority="high" decoding="async"></picture><figcaption>${esc(unesc(c.footer || ""))} The same numbers are in the table below.</figcaption></figure>
 <div class="cmp-text">
  ${w.intro.map((t) => `<p>${esc(t)}</p>`).join("")}
  <div class="tbl cmp-tbl"><table>
   <caption class="sr">${esc(compName(c))}: ${esc(names.join(" vs "))}</caption>
   <thead><tr><th scope="col"><span class="sr">Scent</span></th>${cols.map((x) => `<th scope="col"><a href="${pUrl(x.p)}"><img src="/${x.p.img}" width="120" height="120" alt="" decoding="async"><b>${esc(unesc(x.short))}</b><small>${esc(x.p.brand)}</small></a></th>`).join("")}</tr></thead>
   <tbody>${rows.map(([lbl, fn]) => `<tr><th scope="row">${lbl}</th>${cols.map((x) => `<td>${fn(x)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>
  <p class="tbl-note">Retail is the regular Canadian price for a full bottle. Decant prices are Velvet Volute's, in CAD, for the 2 ml and 10 ml Classic vials. Swipe the table sideways on a phone.</p>
  <h2>Where to start</h2>
  <p>${esc(w.pick)}</p>
  <ul class="cmp-links">${cols.map((x) => `<li><a href="${pUrl(x.p)}">${esc(x.p.brand)} ${esc(nameNoConc(x.p))}</a><span>${inStock(x.p) ? `from ${money(low(x.p))} · ${esc((SHERPA[x.p.name] || {}).vibe || x.p.notes)}` : esc(x.p.limited || "Arriving soon")}</span></li>`).join("")}</ul>
  ${bundle ? `<p class="cmp-set">Want all ${bItems(bundle).length}? <a href="${cUrl(bundle)}">${esc(bundle.name)}</a> pours them as a matching set, ${BUNDLES.pct}% off.</p>` : ""}
  ${ctaBox("Every decant is poured from a sealed full bottle, in 2, 5 or 10 ml. Ottawa pickup, free hand delivery over $65, or shipped across Canada.")}
  <div class="more-guides" role="navigation" aria-label="More comparisons"><h2>More comparisons</h2><ul>${COMPARES.filter((x) => x !== c).map((x) => `<li><a href="${compUrl(x)}">${esc(compName(x))}</a><span>${esc(x.cols.map((y) => unesc(y.short)).join(" vs "))}</span></li>`).join("")}</ul></div>
 </div>
</section>` + tail();
}
function compareIndex() {
  const url = "/compare/", title = "Compare fragrances side by side | Velvet Volute decants, Ottawa";
  const desc = "Side-by-side fragrance comparison tables from Velvet Volute, Ottawa: Nishane's Time Capsule, Valentino Born in Roma, four leathers, Tom Ford, vanilla and more.";
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Compare" }]), { "@context": "https://schema.org", "@type": "CollectionPage", name: "Compare the collection", url: SITE + url, description: desc, hasPart: COMPARES.map((c) => ({ "@type": "WebPage", name: `${compName(c)} compared`, url: SITE + compUrl(c) })) }];
  return head({ title, desc, url, jsonld: ld }) + crumbs([{ name: "Shop", href: "/" }, { name: "Compare" }]) + `
<section class="cmps wrap">
 <h1>Compare the collection</h1>
 <p class="lede">The same scents, side by side: launch year, retail, decant prices, intensity, notes, vibe and season. Each chart has an accessible table underneath it.</p>
 <div class="ctiles cmp-tiles">${COMPARES.map((c, i) => { const img = compImg(c); return `<a class="ctile" href="${compUrl(c)}"><span class="ph one"><picture>${img.webp ? `<source type="image/webp" srcset="/${img.webp}">` : ""}<img src="/${img.jpg}" width="1080" height="1350" alt="${attr(compAlt(c))}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async"></picture></span><span class="t"><span class="b">${esc(unesc(c.eyebrow).toLowerCase().replace(/^\w/, (m) => m.toUpperCase()).replace(/\bx\b/g, "X"))} · ${c.cols.length} scents</span><span class="nm">${esc(compName(c))}</span><span class="pr">${esc(c.cols.map((x) => unesc(x.short)).join(" vs "))}</span></span></a>`; }).join("")}</div>
 <p class="guides-more">New to all this? The <a href="/guides/">guides</a> explain decants, Nishane and what EDT, EDP and Extrait mean.</p>
</section>` + tail();
}

/* ---------- write everything ---------- */
const out = (rel, content) => { const f = join(ROOT, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, content); };
for (const d of ["fragrance", "houses", "collections", "guides", "compare"]) if (existsSync(join(ROOT, d))) rmSync(join(ROOT, d), { recursive: true });
writeFileSync(join(ROOT, "site.css"), styleBlock);
/* sitemap rows: [url, priority, lastmod, images[]] */
const urls = [["/", 1.0, TODAY, [OG_DEFAULT.src]], ["/fragrance-101", .7], ["/about", .6], ["/how-it-works", .6], ["/contact", .5], ["/houses/", .8], ["/collections/", .8], ["/guides/", .8], ["/compare/", .8]];
for (const p of PRODUCTS) { out(`fragrance/${pSlug(p)}/index.html`, productPage(p)); urls.push([pUrl(p), inStock(p) ? .8 : .5, TODAY, [...new Set([p.img, p.imgL, p.imgR].filter(Boolean))]]); }
const groups = Object.entries(PRODUCTS.reduce((m, p) => ((m[p.brand] = m[p.brand] || []).push(p), m), {})).sort((a, b) => a[0].localeCompare(b[0]));
for (const [brand, items] of groups) { out(`houses/${hSlug(brand)}/index.html`, housePage(brand, items)); urls.push([hUrl(brand), .7]); }
out("houses/index.html", housesIndex(groups));
for (const b of BUNDLES.bundles) { out(`collections/${b.id}/index.html`, collectionPage(b)); urls.push([cUrl(b), .7, TODAY, [collArt(b)].filter(Boolean)]); }
out("collections/index.html", collectionsIndex());
for (const g of GUIDES) { out(`guides/${g.slug}/index.html`, guidePage(g)); urls.push([gUrl(g), .7, g.updated || g.date, [g.image]]); }
if (GUIDES.length) out("guides/index.html", guidesIndex());
for (const c of COMPARES) { if (!compImg(c).jpg) throw new Error("missing img/compare image for " + c.slug); out(`compare/${c.slug}/index.html`, comparePage(c)); urls.push([compUrl(c), .7, TODAY, [compImg(c).jpg]]); }
if (COMPARES.length) out("compare/index.html", compareIndex());
/* search index for the header search (nav.js): scents, houses, collections and the main pages */
const SEARCH = [
  ...PRODUCTS.map((p) => ({ t: "scent", b: p.brand, n: p.name, u: pUrl(p), i: "/" + p.img, s: inStock(p) ? `From ${money(low(p))}` : (p.limited || "Arriving soon"),
    k: [p.cat, p.cat2, FAM_LABEL[p.cat], FAM_LABEL[p.cat2], ...(p.x || []), ...noteList(p), p.g, SEA_TXT[p.sea], TM_TXT[p.tm]].filter(Boolean).join(" ") })),
  ...groups.map(([brand, items]) => ({ t: "house", b: "Fragrance house", n: brand, u: hUrl(brand), s: `${items.length} scent${items.length === 1 ? "" : "s"}`, k: items.map((p) => p.name).join(" ") })),
  ...BUNDLES.bundles.map((b) => ({ t: "collection", b: "Curated collection", n: b.name, u: cUrl(b), s: `${bItems(b).length} scents, ${BUNDLES.pct}% off`, k: bItems(b).map((p) => p.brand + " " + p.name).join(" ") })),
  { t: "page", b: "Guide", n: "Fragrance 101", u: "/fragrance-101", s: "EDT vs EDP vs Extrait vs Parfum, notes, families, how to wear it", k: "concentration edt edp extrait parfum beginner guide longevity sillage projection notes families glossary" },
  { t: "page", b: "Page", n: "How It Works", u: "/how-it-works", s: "Ordering, pickup and shipping", k: "order pickup shipping e-transfer square canada post free shipping" },
  { t: "page", b: "Page", n: "About the Brand", u: "/about", s: "Who Velvet Volute is", k: "about izzi story brand curated" },
  { t: "page", b: "Page", n: "Contact", u: "/contact", s: "Email, Messenger, pickup & delivery", k: "contact email messenger facebook message pickup booking" },
  ...GUIDES.map((g) => ({ t: "page", b: "Guide", n: g.title, u: gUrl(g), s: g.summary, k: plain(g.body).toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 400).join(" ") })),
  ...COMPARES.map((c) => ({ t: "page", b: "Compare", n: `${compName(c)} compared`, u: compUrl(c), s: c.cols.map((x) => unesc(x.short)).join(" vs "), k: c.cols.map((x) => `${x.house} ${unesc(x.short)} ${unesc(x.family)} ${x.notes.join(" ")}`).join(" ") + " compare comparison versus side by side" })),
];
writeFileSync(join(ROOT, "search.json"), JSON.stringify(SEARCH));
/* sitemap: every page, generated ones included, with lastmod and the page's images */
const smImg = (imgs) => (imgs || []).map((i) => `<image:image><image:loc>${SITE}/${i}</image:loc></image:image>`).join("");
writeFileSync(join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map(([u, pr, lm, imgs]) => `  <url><loc>${SITE}${u}</loc><lastmod>${lm || TODAY}</lastmod><priority>${pr}</priority>${smImg(imgs)}</url>`).join("\n")}\n</urlset>\n`);
const missing = groups.filter(([b]) => !HOUSES[b]).map(([b]) => b);
console.log(`built ${PRODUCTS.length} scent pages, ${groups.length} houses, ${BUNDLES.bundles.length} collections, ${GUIDES.length} guides, ${COMPARES.length} comparisons, ${urls.length} sitemap urls${missing.length ? `; houses missing content: ${missing.join(", ")}` : ""}`);
