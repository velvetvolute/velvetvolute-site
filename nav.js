/* Shared header behaviour: the mobile side menu (built from the links already in the page header, so the menu
   order lives in one place per page) and the search overlay (reads /search.json, written by build.mjs). */
(function(){
  var ROOT=(document.currentScript&&document.currentScript.src)?document.currentScript.src.replace(/nav\.js(\?.*)?$/,""):"/";
  function href(u){return u.charAt(0)==="/"?u:ROOT+u}
  function lock(c,on){document.body.classList.toggle(c,on)}
  /* iOS sometimes opens a page tapped from the side menu scrolled to the bottom: a plain navigation (not back/forward, no #anchor) starts at the top */
  addEventListener("pageshow",function(e){try{var nt=performance.getEntriesByType("navigation")[0];
    if(!e.persisted&&!location.hash&&(!nt||nt.type==="navigate")&&scrollY>0)scrollTo(0,0)}catch(x){}});

  /* ---------- concentration tips (EDT / EDP / Extrait / Parfum): hover on desktop, press and hold on phones ---------- */
  (function(){var tip=null,cur=null,hold=null;
    function el(){if(!tip){tip=document.createElement("div");tip.className="vv-tip";tip.setAttribute("role","tooltip");document.body.appendChild(tip)}return tip}
    function show(t){var s=t.getAttribute("data-tip");if(!s)return;cur=t;var d=el();d.textContent=s;d.classList.remove("below");d.style.left="0px";d.style.top="0px";
      var r=t.getBoundingClientRect(),w=d.offsetWidth,h=d.offsetHeight,vw=document.documentElement.clientWidth,x=r.left+r.width/2-w/2;x=Math.max(10,Math.min(x,vw-w-10));
      var y=r.top-h-10;if(y<70){y=r.bottom+10;d.classList.add("below")}
      d.style.left=x+"px";d.style.top=y+"px";d.style.setProperty("--ax",(r.left+r.width/2-x)+"px");d.classList.add("on")}
    function hide(){clearTimeout(hold);cur=null;if(tip)tip.classList.remove("on")}
    var fine=window.matchMedia&&matchMedia("(hover:hover) and (pointer:fine)").matches;
    if(fine){document.addEventListener("mouseover",function(e){var t=e.target.closest&&e.target.closest("[data-tip]");if(t&&t!==cur)show(t);else if(!t&&cur)hide()})}
    document.addEventListener("touchstart",function(e){var t=e.target.closest&&e.target.closest("[data-tip]");if(!t){if(cur)hide();return}clearTimeout(hold);hold=setTimeout(function(){show(t)},120)},{passive:true});
    ["touchend","touchcancel"].forEach(function(n){document.addEventListener(n,hide,{passive:true})});
    document.addEventListener("contextmenu",function(e){if(e.target.closest&&e.target.closest("[data-tip]"))e.preventDefault()});
    addEventListener("scroll",hide,{passive:true});
  })();

  /* fragrance page story: read more / read less */
  document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".m-cut .rm");if(!b)return;var p=b.closest(".m-cut"),o=p.classList.toggle("open");
    p.querySelectorAll(".rm").forEach(function(x){x.setAttribute("aria-expanded",String(o))});if(!o)p.scrollIntoView({block:"nearest"})});

  /* ---------- side menu ---------- */
  var btn=document.getElementById("menu-open"),src=document.querySelector("header .nav nav");
  if(btn&&src){
    var wrap=document.createElement("div");wrap.className="mnav";wrap.id="mnav";wrap.hidden=true;
    wrap.innerHTML='<div class="mnav-back"></div><aside class="mnav-panel" role="dialog" aria-modal="true" aria-label="Menu">'
     +'<div class="mnav-head"><span class="mono" aria-hidden="true">VV</span><button type="button" class="mnav-x" aria-label="Close menu">&times;</button></div>'
     +'<nav class="mnav-links"></nav>'
     +'<div class="mnav-foot"><a class="mnav-fb" href="https://www.facebook.com/velvetvolute" target="_blank" rel="noopener" aria-label="Velvet Volute on Facebook"><span class="mnav-fb-t">Follow us<small>Facebook: 10% off your first order</small></span><span class="mnav-fb-i"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg></span><span class="mnav-fb-i mnav-ig" data-href="https://www.instagram.com/velvetvolute.ca/" role="link" tabindex="0" aria-label="Velvet Volute on Instagram"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg></span></a><a class="mnav-cta" href="'+href("index.html").replace(/\/index\.html$/,"/")+'#shop">Shop the collection</a><a class="mnav-cta ghost" href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz">Ask the Scent Sherpa</a><a class="mnav-mail" href="/rewards">The Real Ones stamp card: lucky #7 is on us</a><a class="mnav-mail" href="mailto:velvetvolute@gmail.com">velvetvolute@gmail.com</a></div>'
     +'</aside>';
    var links=wrap.querySelector(".mnav-links");
    [].forEach.call(src.querySelectorAll("a"),function(a){links.appendChild(a.cloneNode(true))});
    document.body.insertBefore(wrap,document.body.firstChild);
    var panel=wrap.querySelector(".mnav-panel"),back=wrap.querySelector(".mnav-back"),x=wrap.querySelector(".mnav-x"),last=null,t;
    function mOpen(){last=document.activeElement;clearTimeout(t);wrap.hidden=false;lock("mnav-lock",true);btn.setAttribute("aria-expanded","true");
      requestAnimationFrame(function(){requestAnimationFrame(function(){wrap.classList.add("on");try{x.focus({preventScroll:true})}catch(e){x.focus()}})})}
    function mClose(){wrap.classList.remove("on");lock("mnav-lock",false);btn.setAttribute("aria-expanded","false");
      t=setTimeout(function(){wrap.hidden=true},300);if(last&&last.focus){try{last.focus({preventScroll:true})}catch(e){last.focus()}}}
    btn.addEventListener("click",mOpen);x.addEventListener("click",mClose);back.addEventListener("click",mClose);
    links.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.getAttribute("href").charAt(0)==="#")mClose()});
    var ig=wrap.querySelector(".mnav-ig");if(ig){function goIg(e){e.preventDefault();e.stopPropagation();window.open(ig.getAttribute("data-href"),"_blank","noopener")}ig.addEventListener("click",goIg);ig.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" ")goIg(e)})}
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!wrap.hidden)mClose()});
    panel.addEventListener("keydown",function(e){if(e.key!=="Tab")return;var f=panel.querySelectorAll("a,button"),a=f[0],z=f[f.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});
  }

  /* ---------- search ---------- */
  var sbtn=document.getElementById("search-open");
  if(!sbtn)return;
  var CHIPS=["Nishane","Tom Ford","Citrus","Fresh","Sweet","Amber","Leather","Spicy","Vanilla","Oud","Tea","Coffee","Rum tobacco","Lavender vanilla","Evenings"];
  var ov=document.createElement("div");ov.className="vvs";ov.id="vvs";ov.hidden=true;
  ov.innerHTML='<div class="vvs-box" role="dialog" aria-modal="true" aria-label="Search">'
   +'<div class="vvs-bar"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>'
   +'<input class="vvs-in" id="vvs-in" type="search" placeholder="Search scents, notes, houses…" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Search">'
   +'<button type="button" class="vvs-x" aria-label="Close search">&times;</button></div>'
   +'<div id="vvs-body"><p class="vvs-hint">Try a fragrance, a house, a mood, or notes together like “lavender vanilla”</p><div class="vvs-chips">'+CHIPS.map(function(c){return '<button type="button">'+c+'</button>'}).join("")+'</div></div></div>';
  document.body.insertBefore(ov,document.body.firstChild);
  var inp=ov.querySelector("#vvs-in"),body=ov.querySelector("#vvs-body"),sx=ov.querySelector(".vvs-x"),DATA=null,slast=null,st,sel=-1;
  var home=ov.querySelector("#vvs-body").innerHTML;
  function norm(s){return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}
  function load(){if(DATA)return Promise.resolve(DATA);return fetch(ROOT+"search.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){DATA=j.map(function(d){d._n=norm(d.b+" "+d.n);d._k=norm(d.k||"");return d});return DATA})}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  /* Note search: type one or more notes ("lavender vanilla", "tobacco, rum") and every fragrance that has ALL of them comes up, with the matching notes shown */
  var NOTEW=null;
  function noteWords(){if(NOTEW)return NOTEW;NOTEW={};DATA.forEach(function(d){if(d.o){d._o=d.o.map(function(x){return{raw:x,w:norm(x).split(/[^a-z0-9]+/).filter(Boolean)}});d._o.forEach(function(x){x.w.forEach(function(w){NOTEW[w]=1})})}});return NOTEW}
  /* family words pull in every note that belongs to them: "fruit" finds raspberry, "citrus" finds lemon and lime, "cigar" finds tobacco */
  var GROUPS={"fruit": "apple pear melon pineapple plum peach apricot raspberry strawberry blackberry blueberry blackcurrant cassis berry berries cherry fig passion mango coconut pomegranate lychee date fruit fruity quince guava papaya banana", "fruits": "apple pear melon pineapple plum peach apricot raspberry strawberry blackberry blueberry blackcurrant cassis berry berries cherry fig passion mango coconut pomegranate lychee date fruit fruity quince guava papaya banana", "fruity": "apple pear melon pineapple plum peach apricot raspberry strawberry blackberry blueberry blackcurrant cassis berry berries cherry fig passion mango coconut pomegranate lychee date fruit fruity quince guava papaya banana", "berry": "raspberry blackcurrant cassis berry berries strawberry blackberry blueberry", "berries": "raspberry blackcurrant cassis berry berries strawberry blackberry blueberry", "citrus": "lemon lime bergamot orange mandarin tangerine clementine grapefruit yuzu citron citrus litsea pomelo", "citrusy": "lemon lime bergamot orange mandarin tangerine clementine grapefruit yuzu citron citrus litsea pomelo", "citric": "lemon lime bergamot orange mandarin tangerine clementine grapefruit yuzu citron citrus litsea pomelo", "tobacco": "tobacco cigar", "cigar": "tobacco cigar", "cigars": "tobacco cigar", "cigarette": "tobacco", "pipe": "tobacco", "smoke": "smoke smoky incense olibanum frankincense birch tar styrax tobacco", "smoky": "smoke smoky incense olibanum frankincense birch tar styrax tobacco", "smokey": "smoke smoky incense olibanum frankincense birch tar styrax tobacco", "incense": "incense olibanum frankincense", "spice": "pepper cardamom cinnamon nutmeg clove ginger saffron coriander caraway anise spice spices gingerbread", "spices": "pepper cardamom cinnamon nutmeg clove ginger saffron coriander caraway anise spice spices gingerbread", "spicy": "pepper cardamom cinnamon nutmeg clove ginger saffron coriander caraway anise spice spices gingerbread", "wood": "wood woods woody cedar cedarwood sandalwood vetiver guaiac oud oak cypress timberwood clearwood cypriol cashmere", "woods": "wood woods woody cedar cedarwood sandalwood vetiver guaiac oud oak cypress timberwood clearwood cypriol cashmere", "woody": "wood woods woody cedar cedarwood sandalwood vetiver guaiac oud oak cypress timberwood clearwood cypriol cashmere", "flower": "rose jasmine iris orris violet tuberose gardenia blossom neroli ylang magnolia freesia cyclamen geranium osmanthus heliotrope hawthorn orchid lily lavender lavandin floral flower", "flowers": "rose jasmine iris orris violet tuberose gardenia blossom neroli ylang magnolia freesia cyclamen geranium osmanthus heliotrope hawthorn orchid lily lavender lavandin floral flower", "floral": "rose jasmine iris orris violet tuberose gardenia blossom neroli ylang magnolia freesia cyclamen geranium osmanthus heliotrope hawthorn orchid lily lavender lavandin floral flower", "sweet": "vanilla tonka caramel praline toffee honey chocolate cocoa kulfi milk maltol sugar candy gingerbread", "gourmand": "vanilla tonka caramel praline toffee honey chocolate cocoa kulfi milk maltol sugar candy gingerbread coffee", "dessert": "vanilla tonka caramel praline toffee honey chocolate cocoa kulfi milk maltol sugar candy gingerbread", "booze": "rum whisky whiskey cognac brandy wine liquor", "boozy": "rum whisky whiskey cognac brandy wine liquor", "alcohol": "rum whisky whiskey cognac brandy wine liquor", "liquor": "rum whisky whiskey cognac brandy wine liquor", "whiskey": "whisky whiskey", "bourbon": "whisky whiskey", "herb": "mint peppermint spearmint sage thyme basil lavender lavandin artemisia bay rosemary juniper clary", "herbs": "mint peppermint spearmint sage thyme basil lavender lavandin artemisia bay rosemary juniper clary", "herbal": "mint peppermint spearmint sage thyme basil lavender lavandin artemisia bay rosemary juniper clary", "aromatic": "mint peppermint spearmint sage thyme basil lavender lavandin artemisia bay rosemary juniper clary", "mint": "mint peppermint spearmint", "minty": "mint peppermint spearmint", "green": "green tea mint leaves leaf basil fig", "sea": "marine sea aquatic water ocean", "marine": "marine sea aquatic water ocean", "aquatic": "marine sea aquatic water ocean", "ocean": "marine sea aquatic water ocean", "salty": "salt salted sea marine", "musk": "musk musks ambrette", "musky": "musk musks ambrette", "suede": "suede leather", "espresso": "coffee", "cafe": "coffee", "nut": "chestnut almond hazelnut pistachio praline", "nutty": "chestnut almond hazelnut pistachio praline", "amber": "amber ambergris ambroxan ambrox benzoin labdanum", "resin": "benzoin styrax olibanum frankincense labdanum elemi myrrh incense resin", "resinous": "benzoin styrax olibanum frankincense labdanum elemi myrrh incense resin", "tea": "tea oolong", "caramel": "caramel toffee praline"};
  /* notes that aren't in any of our fragrances, mapped to the nearest ones that are */
  var RELATED={lemongrass:"litsea verbena lemon",maychang:"litsea",verbena:"verbena litsea lemon",watermelon:"melon",cucumber:"melon green",honeysuckle:"jasmine orange-blossom",lilac:"violet heliotrope",gardenia:"gardenia tuberose jasmine",lily:"tuberose jasmine",patchouli:"patchouli",pistachio:"praline chestnut",almond:"heliotrope praline tonka",cherry:"plum black-plum",strawberry:"raspberry",blueberry:"blackcurrant",chocolate:"cocoa praline coffee",whisky:"whisky rum",cognac:"rum whisky",smoke:"incense olibanum styrax"};
  /* "orange blossom" is a flower, not a citrus or a fruit */
  var NOTFOR=/^(citrus|citrusy|citric|fruit|fruits|fruity)$/;
  function noteHit(d,w){noteWords();if(!d._o)return null;var rel=w.charAt(0)==="~";if(rel)w=w.slice(1);var g=rel?RELATED[w].split(" ").map(function(x){return x.replace(/-/g," ")}):GROUPS[w]?GROUPS[w].split(" "):[];
    for(var i=0;i<d._o.length;i++){var ws=d._o[i].w,full=ws.join(" ");
      if(!rel)for(var j=0;j<ws.length;j++)if(ws[j].indexOf(w)===0)return d._o[i].raw;
      if(rel)for(var r=0;r<g.length;r++)if(g[r].indexOf(" ")>0&&full.indexOf(g[r])>=0)return d._o[i].raw;
      if(g.length&&!(NOTFOR.test(w)&&/blossom|flower/.test(full)))for(var k=0;k<g.length;k++)for(var j2=0;j2<ws.length;j2++)if(ws[j2].indexOf(g[k])===0)return d._o[i].raw}
    return null}
  function isNoteWord(w){if(GROUPS[w]||RELATED[w])return true;var N=noteWords();if(N[w])return true;if(w.length<3)return false;for(var k in N)if(k.indexOf(w)===0)return true;return false}
  function thumb(d){return d.i?'<img class="vvs-th" src="'+href(d.i)+'" alt="" loading="lazy">':'<span class="vvs-th ico">'+(d.t==="house"?"H":d.t==="collection"?"C":"VV")+'</span>'}
  function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}
  function render(q){
    var raw=q;q=norm(q.trim());sel=-1;
    if(!q){body.innerHTML=home;return}
    q=q.replace(/lemon ?grass/g,"lemongrass").replace(/may ?chang/g,"maychang");var words=q.split(/[\s,+&\/;]+/).map(function(w){return w.replace(/[^a-z0-9'-]/g,"")}).filter(function(w){return w&&w!=="and"&&w!=="with"&&w!=="notes"&&w!=="note"});
    if(!words.length){body.innerHTML=home;return}
    /* note mode when every word is a note and none of them is part of a house or fragrance name on its own */
    var nameHit=DATA.some(function(d){return d.t!=="scent"&&words.every(function(w){return d._n.indexOf(w)>=0})})||DATA.some(function(d){return d.t==="scent"&&words.every(function(w){return d._n.indexOf(" "+w)>=0||d._n.indexOf(w)===0})});
    if(!nameHit&&words.every(isNoteWord)){
      var find=function(ws){var out=[];DATA.forEach(function(d){if(d.t!=="scent")return;var m=[];for(var i=0;i<ws.length;i++){var h=noteHit(d,ws[i]);if(!h)return;if(m.indexOf(h)<0)m.push(h)}out.push({d:d,m:m,soon:!/^From/.test(d.s)})});return out};
      var res=find(words),near="";
      /* a note nobody lists (lemongrass…): say so, then show the closest notes we do carry */
      if(!res.length&&words.some(function(w){return RELATED[w]})){var alt=words.map(function(w){return RELATED[w]?"~"+w:w});res=find(alt);if(res.length)near=words.filter(function(w){return RELATED[w]}).map(cap).join(" or ")}
      res.sort(function(a,b){return a.soon-b.soon||a.d.b.localeCompare(b.d.b)});
      var label=words.map(function(w){return cap(w)}).join(" + ");
      if(!res.length){body.innerHTML='<p class="vvs-none">No fragrance in the collection has '+esc(label)+' together yet. Try fewer notes, or <a href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz">ask the Scent Sherpa</a>.</p>';return}
      body.innerHTML=(near?'<p class="vvs-nh">No fragrance here lists <b>'+esc(near)+'</b> yet. These have the closest notes:</p>':'<p class="vvs-nh">'+res.length+' fragrance'+(res.length===1?"":"s")+' with <b>'+esc(label)+'</b></p>')+'<ul class="vvs-res">'+res.map(function(h){var d=h.d;
        return '<li><a href="'+href(d.u)+'">'+thumb(d)+'<span class="vvs-t"><span class="vvs-b">'+esc(d.b)+'</span><span class="vvs-n">'+esc(d.n)+'</span><span class="vvs-s"><span class="vvs-nt">'+h.m.map(esc).join(" · ")+'</span> · '+esc(d.s)+'</span></span></a></li>'}).join("")+'</ul>'+seeAll(res.map(function(h){return h.d}),label);
      return}
    var hits=DATA.map(function(d){var s=0;
      words.forEach(function(w){if(d._n.indexOf(w)===0||d._n.indexOf(" "+w)>=0)s+=6;else if(d._n.indexOf(w)>=0)s+=4;else if(d._k.indexOf(w)>=0)s+=2;else s-=10});
      if(d.t==="scent")s+=1;var all=words.every(function(w){return d._n.indexOf(w)>=0||d._k.indexOf(w)>=0});return{d:d,s:s,all:all}}).filter(function(h){return h.s>0});
    /* a mixed search like "tom ford vanilla" keeps only results that match every word, when there are any */
    if(hits.some(function(h){return h.all}))hits=hits.filter(function(h){return h.all});
    hits=hits.sort(function(a,b){return b.s-a.s});var scentHits=hits.filter(function(h){return h.d.t==="scent"}).map(function(h){return h.d});hits=hits.slice(0,12);
    if(!hits.length){body.innerHTML='<p class="vvs-none">Nothing matches “'+esc(raw.trim())+'”. Try a note (vanilla, oud, tea), a house, or <a href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz">ask the Scent Sherpa</a>.</p>';return}
    body.innerHTML='<ul class="vvs-res">'+hits.map(function(h){var d=h.d;
      return '<li><a href="'+href(d.u)+'">'+thumb(d)+'<span class="vvs-t"><span class="vvs-b">'+esc(d.b)+'</span><span class="vvs-n">'+esc(d.n)+'</span><span class="vvs-s">'+esc(d.s)+'</span></span></a></li>'}).join("")+'</ul>'+seeAll(scentHits,raw.trim());
  }
  /* thin "See all" banner under the results: opens the shop showing just these fragrances */
  function seeAll(list,label){if(list.length<2)return "";return '<a class="vvs-all" href="'+href("index.html").replace(/\/index\.html$/,"/")+'?q='+encodeURIComponent(label)+'#shop" data-u="'+esc(JSON.stringify(list.map(function(d){return d.u})))+'">See all '+list.length+' in the shop <span aria-hidden="true">→</span></a>'}
  function sOpen(){slast=document.activeElement;clearTimeout(st);ov.hidden=false;lock("vvs-lock",true);
    requestAnimationFrame(function(){requestAnimationFrame(function(){ov.classList.add("on");try{inp.focus({preventScroll:true})}catch(e){inp.focus()}})});load().then(function(){if(inp.value)render(inp.value)})}
  function sClose(){ov.classList.remove("on");lock("vvs-lock",false);st=setTimeout(function(){ov.hidden=true},220);if(slast&&slast.focus){try{slast.focus({preventScroll:true})}catch(e){slast.focus()}}}
  sbtn.addEventListener("click",sOpen);sx.addEventListener("click",sClose);
  ov.addEventListener("click",function(e){if(e.target===ov)sClose()});
  body.addEventListener("click",function(e){var c=e.target.closest(".vvs-chips button");if(c){inp.value=c.textContent;load().then(function(){render(inp.value)});inp.focus()}});
  inp.addEventListener("input",function(){load().then(function(){render(inp.value)})});
  body.addEventListener("click",function(e){var a=e.target.closest(".vvs-all");if(!a)return;try{sessionStorage.setItem("vvSearch",JSON.stringify({q:new URL(a.href).searchParams.get("q"),u:JSON.parse(a.getAttribute("data-u"))}))}catch(x){}
    /* already on the shop page: hand the list over without a reload */
    if(window.VVShowSearch&&window.VVShowSearch()){e.preventDefault();sClose()}});
  /* phone: scrolling or touching the results puts the keyboard away so the whole list is visible */
  function kbAway(e){if(document.activeElement===inp&&!e.target.closest(".vvs-bar"))inp.blur()}
  body.addEventListener("touchmove",kbAway,{passive:true});body.addEventListener("touchstart",kbAway,{passive:true});
  body.addEventListener("scroll",function(){if(document.activeElement===inp)inp.blur()},{passive:true,capture:true});
  inp.addEventListener("keydown",function(e){var items=body.querySelectorAll(".vvs-res li");
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(!items.length)return;e.preventDefault();sel=(sel+(e.key==="ArrowDown"?1:-1)+items.length)%items.length;
      items.forEach(function(li,i){li.classList.toggle("sel",i===sel)});items[sel].scrollIntoView({block:"nearest"})}
    else if(e.key==="Enter"){var all=body.querySelector(".vvs-all");if(sel<0&&all){all.click();return}var li=items[sel>=0?sel:0];if(li)location.href=li.querySelector("a").href}
    else if(e.key==="Escape"){sClose()}});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!ov.hidden)sClose();if(e.key==="/"&&!/input|textarea|select/i.test(document.activeElement.tagName)&&ov.hidden){e.preventDefault();sOpen()}});
})();

/* full-size product photo viewer: the "Full size" button on a product photo opens the original-resolution image; tap it to see it at 100%, tap outside or the close button to close */
(function(){["pointerdown","mousedown","touchstart"].forEach(function(t){document.addEventListener(t,function(e){if(e.target.closest&&e.target.closest(".pp-zoom"))e.stopPropagation()},{capture:true,passive:true})});document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".pp-zoom");if(!b)return;e.preventDefault();e.stopPropagation();var o=document.createElement("div");o.className="vv-lb";o.setAttribute("role","dialog");o.setAttribute("aria-label","Full-size photo");o.innerHTML='<button type="button" class="x" aria-label="Close">\u00d7</button><img alt=""><div class="hint">Tap the photo to zoom to 100%</div>';var im=o.querySelector("img");im.src=b.getAttribute("data-full");document.body.appendChild(o);var ov=document.documentElement.style.overflow;document.documentElement.style.overflow="hidden";function close(){o.remove();document.documentElement.style.overflow=ov;document.removeEventListener("keydown",k)}function k(ev){if(ev.key==="Escape")close()}document.addEventListener("keydown",k);o.addEventListener("click",function(ev){if(ev.target===im){var z=o.classList.toggle("z");if(z){o.scrollLeft=(im.naturalWidth-innerWidth)/2;o.scrollTop=(im.naturalHeight-innerHeight)/2}return}close()});o.querySelector(".x").focus()},true)})();
