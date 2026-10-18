/* Velvet Volute analytics: Google Analytics 4 + Meta Pixel, loaded once on every page.
   Pages call window.vvTrack(name, data) for shop events; this file maps each one to the right GA4 and Meta event
   so the rest of the site never talks to gtag/fbq directly. Only runs on the live domain, so deploy previews,
   localhost and Netlify's *.netlify.app URLs never pollute the numbers. */
(function(){
  var GA="G-LVHHMWYYHY",PX="1613998449961765",LIVE=/(^|\.)velvetvolute\.(ca|com)$/i.test(location.hostname);
  var q=[];
  /* Dedupe the purchase event per order in this browser (the thank-you page can be reloaded). */
  function once(key){try{if(localStorage.getItem(key))return false;localStorage.setItem(key,"1")}catch(e){}return true}
  function ga(){if(window.gtag)gtag.apply(null,arguments)}
  function fb(){if(window.fbq)fbq.apply(null,arguments)}
  function items(list){return (list||[]).map(function(i){return {item_name:i.name,item_brand:i.brand||"",item_variant:i.variant||"",price:i.price,quantity:i.qty||1}})}
  function send(name,d){
    d=d||{};
    if(name==="add_to_cart"){
      ga("event","add_to_cart",{currency:"CAD",value:d.value,items:items(d.items)});
      fb("track","AddToCart",{content_name:d.items&&d.items[0]?d.items[0].name:"",content_type:"product",value:d.value,currency:"CAD"});
    }else if(name==="begin_checkout"){
      ga("event","begin_checkout",{currency:"CAD",value:d.value,coupon:d.coupon||undefined,items:items(d.items)});
      fb("track","InitiateCheckout",{value:d.value,currency:"CAD",num_items:(d.items||[]).reduce(function(a,i){return a+(i.qty||1)},0)});
    }else if(name==="purchase"){
      if(!d.id||!once("vv-tracked-"+d.id))return;
      ga("event","purchase",{transaction_id:d.id,value:d.value,tax:d.tax||0,shipping:d.shipping||0,currency:"CAD",coupon:d.coupon||undefined,payment_type:d.method||"",items:items(d.items)});
      /* eventID = order number, so a server-side (Conversions API) copy of the same order dedupes against this one */
      fb("track","Purchase",{value:d.value,currency:"CAD",num_items:(d.items||[]).reduce(function(a,i){return a+(i.qty||1)},0),content_type:"product"},{eventID:d.id});
    }else if(name==="sign_up"){
      ga("event","sign_up",{method:d.method||"email"});
      fb("track","Lead",{content_name:d.method||"email"});
    }else if(name==="sherpa_result"){
      ga("event","sherpa_result",{top_pick:d.pick||""});
      fb("trackCustom","SherpaResult",{top_pick:d.pick||""});
    }else{
      ga("event",name,d);
      fb("trackCustom",name,d);
    }
  }
  window.vvTrack=function(name,d){if(!LIVE){try{console.debug("[vv] track",name,d||{})}catch(e){}return}q.push([name,d])};
  if(!LIVE)return;

  /* ---- Google Analytics 4 ---- */
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){dataLayer.push(arguments)};
  gtag("js",new Date());
  gtag("config",GA,{send_page_view:true});
  var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+GA;document.head.appendChild(s);

  /* ---- Meta Pixel (standard loader, unchanged apart from formatting) ---- */
  !function(f,b,e,v,n,t,x){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;x=b.getElementsByTagName(e)[0];x.parentNode.insertBefore(t,x)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
  fbq("init",PX);
  fbq("track","PageView");

  /* flush anything queued before the loaders were defined, then send live */
  q.forEach(function(e){send(e[0],e[1])});
  window.vvTrack=send;
})();
