/* Shared header behaviour: the mobile side menu (built from the links already in the page header, so the menu
   order lives in one place per page) and the search overlay (reads /search.json, written by build.mjs). */
(function(){
  var ROOT=(document.currentScript&&document.currentScript.src)?document.currentScript.src.replace(/nav\.js(\?.*)?$/,""):"/";
  function href(u){return u.charAt(0)==="/"?u:ROOT+u}
  function lock(c,on){document.body.classList.toggle(c,on)}
  /* iOS sometimes opens a page tapped from the side menu scrolled to the bottom: a plain navigation (not back/forward, no #anchor) starts at the top */
  addEventListener("pageshow",function(e){try{var nt=performance.getEntriesByType("navigation")[0];
    if(!e.persisted&&!location.hash&&(!nt||nt.type==="navigate")&&scrollY>0)scrollTo(0,0)}catch(x){}});

  /* ---------- side menu ---------- */
  var btn=document.getElementById("menu-open"),src=document.querySelector("header .nav nav");
  if(btn&&src){
    var wrap=document.createElement("div");wrap.className="mnav";wrap.id="mnav";wrap.hidden=true;
    wrap.innerHTML='<div class="mnav-back"></div><aside class="mnav-panel" role="dialog" aria-modal="true" aria-label="Menu">'
     +'<div class="mnav-head"><span class="mono" aria-hidden="true">VV</span><button type="button" class="mnav-x" aria-label="Close menu">&times;</button></div>'
     +'<nav class="mnav-links"></nav>'
     +'<div class="mnav-foot"><a class="mnav-fb" href="https://www.facebook.com/profile.php?id=61595247606137" target="_blank" rel="noopener" aria-label="Velvet Volute on Facebook"><span class="mnav-fb-t">Follow us<small>Facebook: 10% off your first order</small></span><span class="mnav-fb-i"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg></span><span class="mnav-fb-i mnav-ig" data-href="https://www.instagram.com/velvetvolute.ca/" role="link" tabindex="0" aria-label="Velvet Volute on Instagram"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg></span></a><a class="mnav-cta" href="'+href("index.html").replace(/\/index\.html$/,"/")+'#shop">Shop the collection</a><a class="mnav-cta ghost" href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz">Ask the Scent Sherpa</a><a class="mnav-mail" href="/rewards">The Real Ones stamp card: lucky #7 is on us</a><a class="mnav-mail" href="mailto:velvetvolute@gmail.com">velvetvolute@gmail.com</a></div>'
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
  var CHIPS=["Nishane","Tom Ford","Citrus","Fresh","Sweet","Amber","Leather","Spicy","Vanilla","Oud","Tea","Coffee","Unisex","Evenings"];
  var ov=document.createElement("div");ov.className="vvs";ov.id="vvs";ov.hidden=true;
  ov.innerHTML='<div class="vvs-box" role="dialog" aria-modal="true" aria-label="Search">'
   +'<div class="vvs-bar"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>'
   +'<input class="vvs-in" id="vvs-in" type="search" placeholder="Search scents, notes, houses…" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Search">'
   +'<button type="button" class="vvs-x" aria-label="Close search">&times;</button></div>'
   +'<div id="vvs-body"><p class="vvs-hint">Try a fragrance, a house, a note or a mood</p><div class="vvs-chips">'+CHIPS.map(function(c){return '<button type="button">'+c+'</button>'}).join("")+'</div></div></div>';
  document.body.insertBefore(ov,document.body.firstChild);
  var inp=ov.querySelector("#vvs-in"),body=ov.querySelector("#vvs-body"),sx=ov.querySelector(".vvs-x"),DATA=null,slast=null,st,sel=-1;
  var home=ov.querySelector("#vvs-body").innerHTML;
  function norm(s){return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}
  function load(){if(DATA)return Promise.resolve(DATA);return fetch(ROOT+"search.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){DATA=j.map(function(d){d._n=norm(d.b+" "+d.n);d._k=norm(d.k||"");return d});return DATA})}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function render(q){
    q=norm(q.trim());sel=-1;
    if(!q){body.innerHTML=home;return}
    var words=q.split(/\s+/).filter(Boolean);
    var hits=DATA.map(function(d){var s=0;
      words.forEach(function(w){if(d._n.indexOf(w)===0||d._n.indexOf(" "+w)>=0)s+=6;else if(d._n.indexOf(w)>=0)s+=4;else if(d._k.indexOf(w)>=0)s+=2;else s-=10});
      if(d.t==="scent")s+=1;return{d:d,s:s}}).filter(function(h){return h.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,12);
    if(!hits.length){body.innerHTML='<p class="vvs-none">Nothing matches “'+esc(q)+'”. Try a note (vanilla, oud, tea), a house, or <a href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz">ask the Scent Sherpa</a>.</p>';return}
    body.innerHTML='<ul class="vvs-res">'+hits.map(function(h){var d=h.d;
      var th=d.i?'<img class="vvs-th" src="'+href(d.i)+'" alt="" loading="lazy">':'<span class="vvs-th ico">'+(d.t==="house"?"H":d.t==="collection"?"C":"VV")+'</span>';
      return '<li><a href="'+href(d.u)+'">'+th+'<span class="vvs-t"><span class="vvs-b">'+esc(d.b)+'</span><span class="vvs-n">'+esc(d.n)+'</span><span class="vvs-s">'+esc(d.s)+'</span></span></a></li>'}).join("")+'</ul>';
  }
  function sOpen(){slast=document.activeElement;clearTimeout(st);ov.hidden=false;lock("vvs-lock",true);
    requestAnimationFrame(function(){requestAnimationFrame(function(){ov.classList.add("on");try{inp.focus({preventScroll:true})}catch(e){inp.focus()}})});load().then(function(){if(inp.value)render(inp.value)})}
  function sClose(){ov.classList.remove("on");lock("vvs-lock",false);st=setTimeout(function(){ov.hidden=true},220);if(slast&&slast.focus){try{slast.focus({preventScroll:true})}catch(e){slast.focus()}}}
  sbtn.addEventListener("click",sOpen);sx.addEventListener("click",sClose);
  ov.addEventListener("click",function(e){if(e.target===ov)sClose()});
  body.addEventListener("click",function(e){var c=e.target.closest(".vvs-chips button");if(c){inp.value=c.textContent;load().then(function(){render(inp.value)});inp.focus()}});
  inp.addEventListener("input",function(){load().then(function(){render(inp.value)})});
  /* phone: scrolling or touching the results puts the keyboard away so the whole list is visible */
  function kbAway(e){if(document.activeElement===inp&&!e.target.closest(".vvs-bar"))inp.blur()}
  body.addEventListener("touchmove",kbAway,{passive:true});body.addEventListener("touchstart",kbAway,{passive:true});
  body.addEventListener("scroll",function(){if(document.activeElement===inp)inp.blur()},{passive:true,capture:true});
  inp.addEventListener("keydown",function(e){var items=body.querySelectorAll(".vvs-res li");
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(!items.length)return;e.preventDefault();sel=(sel+(e.key==="ArrowDown"?1:-1)+items.length)%items.length;
      items.forEach(function(li,i){li.classList.toggle("sel",i===sel)});items[sel].scrollIntoView({block:"nearest"})}
    else if(e.key==="Enter"){var li=items[sel>=0?sel:0];if(li)location.href=li.querySelector("a").href}
    else if(e.key==="Escape"){sClose()}});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!ov.hidden)sClose();if(e.key==="/"&&!/input|textarea|select/i.test(document.activeElement.tagName)&&ov.hidden){e.preventDefault();sOpen()}});
})();

/* full-size product photo viewer: the "Full size" button on a product photo opens the original-resolution image; tap it to see it at 100%, tap outside or the close button to close */
(function(){["pointerdown","mousedown","touchstart"].forEach(function(t){document.addEventListener(t,function(e){if(e.target.closest&&e.target.closest(".pp-zoom"))e.stopPropagation()},{capture:true,passive:true})});document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest(".pp-zoom");if(!b)return;e.preventDefault();e.stopPropagation();var o=document.createElement("div");o.className="vv-lb";o.setAttribute("role","dialog");o.setAttribute("aria-label","Full-size photo");o.innerHTML='<button type="button" class="x" aria-label="Close">\u00d7</button><img alt=""><div class="hint">Tap the photo to zoom to 100%</div>';var im=o.querySelector("img");im.src=b.getAttribute("data-full");document.body.appendChild(o);var ov=document.documentElement.style.overflow;document.documentElement.style.overflow="hidden";function close(){o.remove();document.documentElement.style.overflow=ov;document.removeEventListener("keydown",k)}function k(ev){if(ev.key==="Escape")close()}document.addEventListener("keydown",k);o.addEventListener("click",function(ev){if(ev.target===im){var z=o.classList.toggle("z");if(z){o.scrollLeft=(im.naturalWidth-innerWidth)/2;o.scrollTop=(im.naturalHeight-innerHeight)/2}return}close()});o.querySelector(".x").focus()},true)})();
