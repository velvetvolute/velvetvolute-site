// Static page generator for velvetvolute.ca. Runs at deploy time (netlify.toml build command) and
// writes: /fragrance/<slug>/ (one page per scent), /houses/ + /houses/<slug>/ (fragrance houses),
// /collections/ + /collections/<id>/ (special collections), /site.css (the homepage stylesheet,
// extracted so every page shares one source of styling) and /sitemap.xml.
// All content comes from index.html's data (PRODUCTS, MOOD, SHERPA, FIT, HER, TAGS), bundles.json and
// content/houses.json, so stock, prices and copy stay in sync with the shop without a second edit.
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
function head({ title, desc, url, image, jsonld, current }) {
  return `<!DOCTYPE html>
<html lang="en" data-palette="camel-m" data-tiles="camel">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#4a0e1e">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${url.startsWith("/fragrance/") ? "product" : "website"}"><meta property="og:site_name" content="Velvet Volute"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}"><meta property="og:url" content="${SITE}${url}"><meta property="og:locale" content="en_CA">
<meta property="og:image" content="${SITE}/${image || "img/og-velvetvolute-bb4b0b5447.jpg"}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${attr(title)}"><meta name="twitter:description" content="${attr(desc)}"><meta name="twitter:image" content="${SITE}/${image || "img/og-velvetvolute-bb4b0b5447.jpg"}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
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
const FOOT = html.match(/<footer>[\s\S]*?<\/footer>/)[0];
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
const scentTile = (p) => `<a class="stile" href="${pUrl(p)}"><span class="ph"><img src="/${p.img}" width="720" height="720" alt="${attr(p.brand + " " + p.name)} bottle" loading="lazy" decoding="async"></span><span class="t"><span class="b">${esc(p.brand)}</span><span class="nm">${esc(p.name)}</span><span class="pr">${inStock(p) ? `From ${money(low(p))}` : `<em>${esc(p.limited || "Arriving soon")}</em>`}</span></span></a>`;

/* ---------- product page ---------- */
function productPage(p) {
  const sh = SHERPA[p.name] || {}, meta = HOUSES[p.brand] || {};
  const url = pUrl(p), title = `${p.brand} ${p.name} decant & sample | Velvet Volute`;
  const desc = `${p.brand} ${p.name} hand-decanted from an authentic bottle: 2 to 10 ml sprays and roll-ons from ${money(low(p))} CAD. ${sh.vibe || p.notes} Ottawa pickup, free local hand delivery over $65, or shipping across Canada.`;
  const sizes = Object.entries(VIALS).map(([k, v]) => v.sizes.map((z) => ({ k, z, price: p[v.key][z] }))).flat();
  const ld = [{
    "@context": "https://schema.org", "@type": "Product", name: `${p.brand} ${p.name} (decant)`, image: [`${SITE}/${p.img}`], description: desc, brand: { "@type": "Brand", name: p.brand }, sku: p.sq, url: SITE + url,
    offers: { "@type": "AggregateOffer", priceCurrency: "CAD", lowPrice: Math.min(...sizes.map((s) => s.price)), highPrice: Math.max(...sizes.map((s) => s.price)), offerCount: sizes.length, availability: inStock(p) ? "https://schema.org/InStock" : "https://schema.org/PreOrder", url: SITE + url, seller: { "@type": "Organization", name: "Velvet Volute" } },
  }, crumbLD([{ name: "Shop", href: "/" }, { name: p.brand, href: hUrl(p.brand) }, { name: p.name }])];
  const sims = similar(p);
  const pyramid = p.n ? (p.n.h.length || p.n.b.length ? `<dl class="pyr3"><div><dt>Top</dt><dd>${p.n.t.map(esc).join(", ")}</dd></div><div><dt>Heart</dt><dd>${p.n.h.map(esc).join(", ")}</dd></div><div><dt>Base</dt><dd>${p.n.b.map(esc).join(", ")}</dd></div></dl>` : `<dl class="pyr3 flat"><div><dt>Key notes</dt><dd>${p.n.t.map(esc).join(", ")}</dd></div></dl>`) : `<p>${esc(p.notes)}</p>`;
  const data = { sq: p.sq, name: p.name, brand: p.brand, img: p.img, imgL: p.imgL, imgR: p.imgR, p: p.p, l: p.l, r: p.r, stock: inStock(p) };
  return head({ title, desc, url, image: p.img, jsonld: ld }) + crumbs([{ name: "Shop", href: "/" }, { name: p.brand, href: hUrl(p.brand) }, { name: p.name }]) + `
<article class="pp wrap">
 <div class="pp-left">
 <div class="pp-photo carousel" id="ppcar"><div class="track">${[["classic", p.img, "classic decant vials", "Classic vials"], ["luxe", p.imgL || p.img, "luxury decant bottles", "Luxury bottles"], ["roll", p.imgR || p.img, "roll-on vials", "Roll-ons"]].map(([k, src, what, cap], i) => `<figure class="slide" data-v="${k}"><img src="/${src}" width="720" height="720" alt="${attr(p.brand + " " + p.name)} bottle beside ${what} on a wooden table" decoding="async"${i ? ' loading="lazy"' : ' fetchpriority="high"'}><figcaption><b>${cap}</b></figcaption></figure>`).join("")}</div>
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
  const desc = `${brand} fragrance decants and samples, hand-poured from authentic bottles in Ottawa: ${items.map((p) => p.name.replace(CONC, "")).slice(0, 4).join(", ")}${items.length > 4 ? " and more" : ""}. 2 to 10 ml from ${money(Math.min(...items.map(low)))} CAD.`;
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
  const desc = `Browse decants by fragrance house: ${groups.map(([b]) => b).join(", ")}. Hand-poured samples from authentic bottles, 2 to 10 ml, with Ottawa pickup, free local hand delivery over $65, or shipping across Canada.`;
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
  const desc = `${b.blurb} ${items.length} scents as 2 ml or 5 ml decants, ${BUNDLES.pct}% off the set.`;
  const ld = [crumbLD([{ name: "Shop", href: "/" }, { name: "Curated Collections", href: "/collections/" }, { name: b.name }]), { "@context": "https://schema.org", "@type": "Product", name: b.name, description: desc, url: SITE + url, image: items.map((p) => `${SITE}/${p.img}`), brand: { "@type": "Brand", name: b.house }, offers: { "@type": "AggregateOffer", priceCurrency: "CAD", lowPrice: bPrice(b, BUNDLES.sizes[0]), highPrice: bPrice(b, BUNDLES.sizes[BUNDLES.sizes.length - 1]), offerCount: BUNDLES.sizes.length, availability: ready ? "https://schema.org/InStock" : "https://schema.org/PreOrder" } }];
  return head({ title, desc, url, image: collArt(b) || items[0]?.img, jsonld: ld, current: "collections" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Curated Collections", href: "/collections/" }, { name: b.name }]) + `
<section class="coll wrap">
 <div class="coll-left">
 <div class="coll-head"><div class="eyebrow">${esc(b.house)} · ${items.length} scents · ${BUNDLES.pct}% off the set</div><h1>${esc(b.name)}</h1>
 <p class="lede">${esc(b.blurb)}</p></div>
 </div>
 <div class="coll-right">
 <div class="carousel" id="car"><div class="track" role="link" title="Open the full page" aria-label="Scents in this collection, swipe to change">${items.map((p, i) => `<figure class="slide" id="s${i}" data-href="${pUrl(p)}"><img src="/${p.img}" width="720" height="720" alt="${attr(p.brand + " " + p.name)} bottle" loading="${i ? "lazy" : "eager"}" decoding="async"><figcaption><b>${esc(shortName(p))}</b><span>${esc(p.brand)} · ${inStock(p) ? `from ${money(low(p))}` : esc(p.limited || "arriving soon")}</span><a class="more" href="${pUrl(p)}">Full page →</a></figcaption></figure>`).join("")}</div>
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
  const desc = `Curated decant sets, ${BUNDLES.pct}% off: ${BUNDLES.bundles.map((b) => b.name.replace(/^The /, "").replace(/ Collection$/, "")).join(", ")}. Each scent as a 2 ml or 5 ml decant from an authentic bottle.`;
  return head({ title, desc, url, jsonld: crumbLD([{ name: "Shop", href: "/" }, { name: "Curated Collections" }]), current: "collections" }) + crumbs([{ name: "Shop", href: "/" }, { name: "Curated Collections" }]) + `
<section class="colls wrap">
 <h1>Curated Collections</h1>
 <p class="lede">Several scents from one house or one idea, poured as a matching set and ${BUNDLES.pct}% off together. Try the whole story, then go big on the one you love.</p>
 <div class="ctiles">${BUNDLES.bundles.map((b) => { const items = bItems(b); return `<a class="ctile" href="${cUrl(b)}"><span class="ph${collArt(b) ? " one" : ""}">${collArt(b) ? `<img src="/${collArt(b)}" width="1200" height="1200" alt="${attr(b.name)}: ${attr(items.map(shortName).join(", "))}" loading="lazy">` : items.slice(0, 4).map((p) => `<img src="/${p.img}" width="360" height="360" alt="" loading="lazy">`).join("")}</span><span class="t"><span class="b">${esc(b.house)} · ${items.length} scents</span><span class="nm">${esc(b.name)}</span><span class="pr">${bReady(b) ? `Set from ${money(bPrice(b, BUNDLES.sizes[0]))}` : "<em>Arriving soon</em>"}</span></span></a>`; }).join("")}</div>
</section>` + tail();
}

/* ---------- write everything ---------- */
const out = (rel, content) => { const f = join(ROOT, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, content); };
for (const d of ["fragrance", "houses", "collections"]) if (existsSync(join(ROOT, d))) rmSync(join(ROOT, d), { recursive: true });
writeFileSync(join(ROOT, "site.css"), styleBlock);
const urls = [["/", 1.0], ["/fragrance-101", .7], ["/about", .6], ["/how-it-works", .6], ["/contact", .5], ["/houses/", .8], ["/collections/", .8]];
for (const p of PRODUCTS) { out(`fragrance/${pSlug(p)}/index.html`, productPage(p)); urls.push([pUrl(p), inStock(p) ? .8 : .5]); }
const groups = Object.entries(PRODUCTS.reduce((m, p) => ((m[p.brand] = m[p.brand] || []).push(p), m), {})).sort((a, b) => a[0].localeCompare(b[0]));
for (const [brand, items] of groups) { out(`houses/${hSlug(brand)}/index.html`, housePage(brand, items)); urls.push([hUrl(brand), .7]); }
out("houses/index.html", housesIndex(groups));
for (const b of BUNDLES.bundles) { out(`collections/${b.id}/index.html`, collectionPage(b)); urls.push([cUrl(b), .7]); }
out("collections/index.html", collectionsIndex());
/* search index for the header search (nav.js): scents, houses, collections and the main pages */
const SEARCH = [
  ...PRODUCTS.map((p) => ({ t: "scent", b: p.brand, n: p.name, u: pUrl(p), i: "/" + p.img, s: inStock(p) ? `From ${money(low(p))}` : (p.limited || "Arriving soon"),
    k: [p.cat, p.cat2, FAM_LABEL[p.cat], FAM_LABEL[p.cat2], ...(p.x || []), ...noteList(p), p.g, SEA_TXT[p.sea], TM_TXT[p.tm]].filter(Boolean).join(" ") })),
  ...groups.map(([brand, items]) => ({ t: "house", b: "Fragrance house", n: brand, u: hUrl(brand), s: `${items.length} scent${items.length === 1 ? "" : "s"}`, k: items.map((p) => p.name).join(" ") })),
  ...BUNDLES.bundles.map((b) => ({ t: "collection", b: "Curated collection", n: b.name, u: cUrl(b), s: `${bItems(b).length} scents, ${BUNDLES.pct}% off`, k: bItems(b).map((p) => p.brand + " " + p.name).join(" ") })),
  { t: "page", b: "Guide", n: "Fragrance 101", u: "/fragrance-101", s: "EDT vs EDP vs Extrait vs Parfum, notes, families, how to wear it", k: "concentration edt edp extrait parfum beginner guide longevity sillage projection notes families glossary" },
  { t: "page", b: "Page", n: "How It Works", u: "/how-it-works", s: "Ordering, pickup and shipping", k: "order pickup shipping e-transfer square canada post free shipping" },
  { t: "page", b: "Page", n: "About the Brand", u: "/about", s: "Who Velvet Volute is", k: "about izzi story brand curated" },
  { t: "page", b: "Page", n: "Contact", u: "/contact", s: "Email, Messenger, pickup booking", k: "contact email messenger facebook message pickup booking" },
];
writeFileSync(join(ROOT, "search.json"), JSON.stringify(SEARCH));
writeFileSync(join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod><priority>${pr}</priority></url>`).join("\n")}\n</urlset>\n`);
const missing = groups.filter(([b]) => !HOUSES[b]).map(([b]) => b);
console.log(`built ${PRODUCTS.length} scent pages, ${groups.length} houses, ${BUNDLES.bundles.length} collections, ${urls.length} sitemap urls${missing.length ? `; houses missing content: ${missing.join(", ")}` : ""}`);
