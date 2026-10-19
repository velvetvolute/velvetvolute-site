/* Spotlight / zodiac pricing on scent tiles (house, collection and "you may also like" rails).
   Same files and rules as the homepage, scent pages and checkout: spotlight.json (from/until) and zodiac.json
   (month/day, Toronto time); never stacks, the bigger discount wins; sale prices round down to whole dollars. */
(function(){
  var tiles=document.querySelectorAll(".stile[data-sq]");if(!tiles.length||!window.fetch)return;
  var get=function(u){return fetch(u,{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})};
  Promise.all([get("/spotlight.json"),get("/zodiac.json")]).then(function(a){
    var sp=a[0],zd=a[1],now=Date.now(),T=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Toronto"})),md=(T.getMonth()+1)*100+T.getDate();
    var spOn=sp&&Array.isArray(sp.picks)&&!(now>Date.parse(sp.until+"T23:59:59-05:00"))&&!(sp.from&&now<Date.parse(sp.from+"T00:00:00-04:00"));
    var spIds=spOn?sp.picks.map(function(x){return String(x.sq)}):[],spP=spOn?(Number(sp.pct)||15):0;
    var z=zd&&Array.isArray(zd.signs)?zd.signs.find(function(x){var f=x.from[0]*100+x.from[1],t=x.to[0]*100+x.to[1];return f<=t?md>=f&&md<=t:md>=f||md<=t}):null,zP=z?Number(zd.pct)||0:0;
    [].forEach.call(tiles,function(el){
      var sq=el.getAttribute("data-sq"),low=Number(el.getAttribute("data-low")),s=spIds.indexOf(sq)>=0?spP:0,zz=z&&z.sq===sq?zP:0,off,tag;
      if(s&&s>=zz){off=s;tag='<span class="tdeal spot"><span class="rib-vv">VV</span> Spotlight · '+s+'% off</span>'}
      else if(zz){off=zz;tag='<span class="tdeal zod">'+z.glyph+'︎ '+z.sign+' pick · '+zz+'% off</span>'}
      if(!off||!low)return;
      var pr=el.querySelector(".pr"),now2=Math.floor(low*(100-off)/100);if(pr)pr.innerHTML='From <s>$'+low+'</s> $'+now2;
      var t=el.querySelector(".t");if(t)t.insertAdjacentHTML("afterbegin",tag);
    });
  });
})();
