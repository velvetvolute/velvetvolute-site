/* Ask the Scent Sherpa: free-text questions answered by AI (netlify/functions/sherpa-ask.mjs) with three picks from the
   shelf, each scored out of 10 and coloured by how sure it is (green 8+, yellow 6 to 7.9, red under 6). Loaded by nav.js
   the first time the panel opens. The chat survives page changes for the visit (sessionStorage). */
(function(){
  if(window.VVAskPanel)return;
  var ROOT=window.VVAskRoot||"/";
  function href(u){return /^(https?:)?\//.test(u)?u:ROOT+u}
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function sget(k){try{return JSON.parse(sessionStorage.getItem(k)||"null")}catch(e){return null}}
  function sset(k,v){try{sessionStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  var KEY="vvAskThread",turns=sget(KEY)||[],busy=false,last=null;
  var EXAMPLES=["Something like Baccarat Rouge 540, but a bit cheaper","A fresh scent for the office that won't bother anyone","A gift for my girlfriend. She loves vanilla","Smells like a campfire on a cold night","I wear Sauvage and want something more unique","Like Lost Cherry, but less sweet"];
  var LABEL={green:"Great match",yellow:"Close match",red:"A stretch"};
  var WAIT=["Reading what you’re after…","Smelling my way across the shelf…","Weighing the closest contenders…","Picking my top three…"];
  var SPARK='<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>';

  var ov=document.createElement("div");ov.className="vva";ov.hidden=true;
  ov.innerHTML='<div class="vva-box" role="dialog" aria-modal="true" aria-labelledby="vva-h">'
   +'<div class="vva-top"><span class="vva-ic">'+SPARK+'</span><h2 id="vva-h">Ask the Scent Sherpa</h2><button type="button" class="vva-new" hidden>Start over</button><button type="button" class="vva-x" aria-label="Close">&times;</button></div>'
   +'<div class="vva-scroll"><div class="vva-intro"><p class="vva-lede">Tell me anything: a perfume you love, a memory, a mood, who it’s for. I’ll pick three from our shelf and tell you how sure I am about each one.</p>'
   +'<div class="vva-ex">'+EXAMPLES.map(function(x){return '<button type="button">'+esc(x)+'</button>'}).join("")+'</div></div>'
   +'<div class="vva-thread" aria-live="polite"></div></div>'
   +'<form class="vva-form"><label class="vva-sr" for="vva-in">Ask the Scent Sherpa</label><textarea id="vva-in" rows="1" maxlength="500" placeholder="Describe what you’re after…"></textarea>'
   +'<button type="submit" class="vva-go" aria-label="Ask">'+SPARK+'<span>Ask</span></button></form>'
   +'<p class="vva-fine">AI picks from our shelf only. Scores show how closely each one matches what you asked. <a href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz" class="vva-quiz">Prefer the quiz?</a></p>'
   +'</div>';
  document.body.appendChild(ov);
  var box=ov.querySelector(".vva-box"),scroller=ov.querySelector(".vva-scroll"),thread=ov.querySelector(".vva-thread"),intro=ov.querySelector(".vva-intro"),
      form=ov.querySelector(".vva-form"),inp=ov.querySelector("#vva-in"),go=ov.querySelector(".vva-go"),again=ov.querySelector(".vva-new");

  function fit(){inp.style.height="auto";inp.style.height=Math.min(inp.scrollHeight,120)+"px"}
  function img640(u){return String(u||"").replace(".w1080.",".w640.")}
  function scoreTxt(s){return (Math.round(s*10)/10).toFixed(1)}

  function pickHTML(p,i){
    return '<li class="vva-pick c-'+p.color+'"><a class="vva-ph" href="'+esc(href(p.url))+'"><img src="'+esc(href(img640(p.img)))+'" alt="'+esc(p.brand+" "+p.name)+'" loading="lazy"></a>'
     +'<div class="vva-pb"><div class="vva-ph2"><span class="vva-rank">'+(i+1)+'</span><span class="vva-sc" title="How closely it matches what you asked"><b>'+scoreTxt(p.score)+'</b><small>/10</small></span><span class="vva-lb">'+LABEL[p.color]+'</span></div>'
     +'<p class="vva-br">'+esc(p.brand)+'</p><h3 class="vva-nm"><a href="'+esc(href(p.url))+'">'+esc(p.name)+'</a>'+(p.c?'<span class="vva-conc">'+esc(p.c)+'</span>':'')+'</h3>'
     +'<p class="vva-why">'+esc(p.why)+'</p><a class="vva-see" href="'+esc(href(p.url))+'">See it · from $'+esc(p.from)+' <span aria-hidden="true">→</span></a></div></li>'}

  function answerHTML(a,idx){
    var h='<div class="vva-ans t-'+esc(a.tier||"none")+'">';
    if(a.error)return h+'<p class="vva-err">'+esc(a.error)+' <a href="'+href("index.html").replace(/\/index\.html$/,"/")+'#quiz" class="vva-quiz">Try the quiz</a></p></div>';
    h+='<div class="vva-head">'+(a.tier&&a.tier!=="none"?'<span class="vva-dot" aria-hidden="true"></span>':'')+'<p>'+esc(a.headline)+'</p></div>';
    if(a.understood&&a.mode==="picks")h+='<p class="vva-heard"><b>What I heard:</b> '+esc(a.understood)+'</p>';
    if(a.picks&&a.picks.length)h+='<ol class="vva-picks">'+a.picks.map(pickHTML).join("")+'</ol>';
    if(a.questions&&a.questions.length){var live=idx===turns.length-1;
      h+='<div class="vva-qs'+(live?"":" done")+'">'+a.questions.map(function(q,qi){return '<div class="vva-q" data-q="'+qi+'"><p>'+esc(q.q)+'</p><div class="vva-opts">'+(q.options||[]).map(function(o){return '<button type="button"'+(live?"":" disabled")+'>'+esc(o)+'</button>'}).join("")+'</div></div>'}).join("")
       +(live?'<button type="button" class="vva-send" disabled>Send my answers</button><p class="vva-or">Or answer in your own words below.</p>':'')+'</div>'}
    if(a.mode==="picks"&&idx===turns.length-1)h+='<p class="vva-more">Not quite right? Tell me what to change, like “less sweet” or “cheaper”, and I’ll try again.</p>';
    return h+'</div>'}

  function draw(){
    intro.hidden=turns.length>0;again.hidden=!turns.length;
    thread.innerHTML=turns.map(function(t,i){return t.role==="user"?'<p class="vva-me">'+esc(t.text)+'</p>':answerHTML(t.ans,i)}).join("")
      +(busy?'<div class="vva-wait"><span class="vva-dots"><i></i><i></i><i></i></span><span class="vva-wt">'+WAIT[0]+'</span></div>':"")}
  function toEnd(){requestAnimationFrame(function(){var last=thread.lastElementChild;if(!last)return;
    if(last.classList.contains("vva-ans")){var prev=last.previousElementSibling;scroller.scrollTop=(prev||last).offsetTop-12}else scroller.scrollTop=scroller.scrollHeight})}

  var waitT;
  function ask(text){
    text=String(text||"").trim();if(!text||busy)return;
    turns.push({role:"user",text:text});busy=true;inp.value="";fit();go.disabled=true;draw();toEnd();
    var wi=0;clearInterval(waitT);waitT=setInterval(function(){var w=ov.querySelector(".vva-wt");if(!w){clearInterval(waitT);return}wi=(wi+1)%WAIT.length;w.textContent=WAIT[wi]},2200);
    var history=turns.slice(0,-1).slice(-6).map(function(t){return t.role==="user"?{role:"user",content:t.text}:{role:"assistant",content:(t.ans&&t.ans.memory)||""}});
    var done=function(a){clearInterval(waitT);busy=false;go.disabled=false;turns.push({role:"sherpa",ans:a});turns=turns.slice(-12);sset(KEY,turns);draw();toEnd();
      try{if(window.gtag)gtag("event","sherpa_ask",{tier:a.tier||"none",mode:a.mode||"error"})}catch(e){}};
    if(window.VV_ASK_DEMO){setTimeout(function(){done(window.VV_ASK_DEMO(text,history))},1600);return}
    fetch("/.netlify/functions/sherpa-ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({q:text,history:history})})
      .then(function(r){return r.json().catch(function(){return{error:"Something went wrong. Please try again."}})})
      .then(function(j){done(j&&!j.error&&j.headline!==undefined?j:{error:(j&&j.error)||"Something went wrong. Please try again."})})
      .catch(function(){done({error:"I couldn’t connect just now. Check your connection and try again."})})}

  form.addEventListener("submit",function(e){e.preventDefault();ask(inp.value)});
  inp.addEventListener("input",fit);
  inp.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask(inp.value)}});
  ov.querySelector(".vva-ex").addEventListener("click",function(e){var b=e.target.closest("button");if(b)ask(b.textContent)});
  thread.addEventListener("click",function(e){var o=e.target.closest(".vva-opts button");
    if(o&&!o.disabled){var row=o.parentNode;[].forEach.call(row.children,function(x){x.classList.toggle("on",x===o&&!o.classList.contains("on"))});
      var qs=o.closest(".vva-qs"),send=qs.querySelector(".vva-send");send.disabled=!qs.querySelector(".vva-opts .on");
      if(qs.querySelectorAll(".vva-q").length===1)send.click();return}
    var s=e.target.closest(".vva-send");if(s&&!s.disabled){var parts=[];[].forEach.call(s.closest(".vva-qs").querySelectorAll(".vva-q"),function(q){var on=q.querySelector(".on");if(on)parts.push(q.querySelector("p").textContent+" "+on.textContent)});ask(parts.join(" "))}});
  again.addEventListener("click",function(){turns=[];sset(KEY,turns);draw();inp.focus()});
  ov.addEventListener("click",function(e){if(e.target===ov)close();if(e.target.closest(".vva-quiz")){close();if(window.VVSherpa&&window.VVSherpa.open){e.preventDefault();window.VVSherpa.open()}}});
  ov.querySelector(".vva-x").addEventListener("click",close);
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!ov.hidden)close()});
  box.addEventListener("keydown",function(e){if(e.key!=="Tab")return;var f=box.querySelectorAll("button:not([disabled]):not([hidden]),a[href],textarea"),a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});

  var t;
  function open(q){last=document.activeElement;clearTimeout(t);ov.hidden=false;document.body.classList.add("vva-lock");draw();
    requestAnimationFrame(function(){requestAnimationFrame(function(){ov.classList.add("on");if(turns.length)toEnd();try{inp.focus({preventScroll:true})}catch(e){}})});
    if(q)ask(q)}
  function close(){ov.classList.remove("on");document.body.classList.remove("vva-lock");t=setTimeout(function(){ov.hidden=true},220);if(last&&last.focus){try{last.focus({preventScroll:true})}catch(e){}}}
  window.VVAskPanel={open:open,close:close};
})();
