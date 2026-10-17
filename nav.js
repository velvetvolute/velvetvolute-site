/* Mobile side menu: built from the links already in the page header, so the menu order lives in one place per page. */
(function(){
  var btn=document.getElementById("menu-open"),src=document.querySelector("header .nav nav");
  if(!btn||!src)return;
  var wrap=document.createElement("div");wrap.className="mnav";wrap.id="mnav";wrap.hidden=true;
  wrap.innerHTML='<div class="mnav-back"></div><aside class="mnav-panel" role="dialog" aria-modal="true" aria-label="Menu">'
   +'<div class="mnav-head"><span class="mono" aria-hidden="true">VV</span><button type="button" class="mnav-x" aria-label="Close menu">&times;</button></div>'
   +'<nav class="mnav-links"></nav>'
   +'<div class="mnav-foot"><a class="mnav-cta" href="/#shop">Shop the collection</a><a class="mnav-cta ghost" href="/#quiz">Ask the Scent Sherpa</a><a class="mnav-mail" href="mailto:velvetvolute@gmail.com">velvetvolute@gmail.com</a></div>'
   +'</aside>';
  var links=wrap.querySelector(".mnav-links");
  [].forEach.call(src.querySelectorAll("a"),function(a){var c=a.cloneNode(true);links.appendChild(c)});
  document.body.appendChild(wrap);
  var panel=wrap.querySelector(".mnav-panel"),back=wrap.querySelector(".mnav-back"),x=wrap.querySelector(".mnav-x"),last=null,t;
  function open(){last=document.activeElement;clearTimeout(t);wrap.hidden=false;document.body.classList.add("mnav-lock");btn.setAttribute("aria-expanded","true");
    requestAnimationFrame(function(){requestAnimationFrame(function(){wrap.classList.add("on");x.focus()})})}
  function close(){wrap.classList.remove("on");document.body.classList.remove("mnav-lock");btn.setAttribute("aria-expanded","false");
    t=setTimeout(function(){wrap.hidden=true},300);if(last&&last.focus)last.focus()}
  btn.addEventListener("click",open);x.addEventListener("click",close);back.addEventListener("click",close);
  links.addEventListener("click",function(e){var a=e.target.closest("a");if(!a)return;
    /* same-page anchor: close the drawer and let the browser scroll */
    if(a.getAttribute("href").charAt(0)==="#")close()});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!wrap.hidden)close()});
  window.addEventListener("resize",function(){if(innerWidth>1200&&!wrap.hidden)close()});
  /* focus trap */
  panel.addEventListener("keydown",function(e){if(e.key!=="Tab")return;var f=panel.querySelectorAll("a,button");var a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});
})();
