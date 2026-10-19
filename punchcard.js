/* The Real Ones punch card, drawn as a camel card with merlot "velvet drops".
   window.vvCard(drops, pending) returns SVG markup: six punches of two drops each, then lucky #7.
   drops = drops in the current card (0–12); pending = a free 5 ml waiting to be claimed (card shown full).
   The same drawing is rendered to PNGs (img/punch/card-N.png) for the emails, by tools/punch-card-images.py. */
(function(){
  var M="#4a0e1e",CAMEL="#b28a5b",CAMEL2="#9c7449",INK="#2c0610";
  var DROP="M0-9C0-9-6.2-1.6-6.2 2.2A6.2 6.2 0 0 0 6.2 2.2C6.2-1.6 0-9 0-9Z";
  function drop(x,y,on){return '<path transform="translate('+x+' '+y+')" d="'+DROP+'" fill="'+(on?M:"none")+'" stroke="'+M+'" stroke-width="1.4"'+(on?'':' stroke-opacity=".55"')+'/>'}
  window.vvCard=function(drops,pending){
    drops=pending?12:Math.max(0,Math.min(12,drops|0));
    var W=360,H=150,s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+(pending?"Card full: lucky #7 is ready":(drops/2)+" of 6 punches")+'">'
     +'<defs><linearGradient id="vvc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+CAMEL+'"/><stop offset="1" stop-color="'+CAMEL2+'"/></linearGradient></defs>'
     +'<rect x="1" y="1" width="'+(W-2)+'" height="'+(H-2)+'" rx="14" fill="url(#vvc)" stroke="'+M+'" stroke-opacity=".35"/>'
     +'<text x="20" y="32" font-family="Cormorant Garamond,Georgia,serif" font-style="italic" font-size="19" fill="'+INK+'">The Real Ones</text>'
     +'<text x="'+(W-20)+'" y="31" text-anchor="end" font-family="Jost,system-ui,sans-serif" font-size="10" letter-spacing="1.6" fill="'+INK+'" fill-opacity=".75">'+(pending?"LUCKY #7 IS READY":(drops+" OF 12 VELVET DROPS"))+'</text>';
    for(var i=0;i<6;i++){
      var cx=34+i*44,cy=86,full=drops>=(i+1)*2;
      s+='<circle cx="'+cx+'" cy="'+cy+'" r="19" fill="'+(full?"rgba(74,14,30,.10)":"none")+'" stroke="'+M+'" stroke-width="1.2" stroke-opacity="'+(full?".9":".45")+'"/>'
        +drop(cx-7,cy+2,drops>=i*2+1)+drop(cx+7,cy+2,drops>=i*2+2)
        +'<text x="'+cx+'" y="'+(cy+34)+'" text-anchor="middle" font-family="Jost,system-ui,sans-serif" font-weight="500" font-size="12" fill="'+INK+'" fill-opacity=".85">'+(i+1)+'</text>';
    }
    var sx=W-38;
    s+='<circle cx="'+sx+'" cy="86" r="23" fill="'+(pending?M:"none")+'" stroke="'+M+'" stroke-width="1.4" stroke-dasharray="'+(pending?"0":"3 3")+'"/>'
     +'<text x="'+sx+'" y="94" text-anchor="middle" font-family="Jost,system-ui,sans-serif" font-weight="500" font-size="22" fill="'+(pending?"#e8d3b4":M)+'">7</text>'
     +'<text x="'+sx+'" y="'+(86+38)+'" text-anchor="middle" font-family="Jost,system-ui,sans-serif" font-size="8.5" letter-spacing="1.2" fill="'+INK+'" fill-opacity=".75">FREE 5 ML</text>'
     +'</svg>';
    return s;
  };
})();
