/**
 * Общая аналитика для страниц блога (Яндекс.Метрика + Meta Pixel).
 * На главных (index.html, uz/index.html) не используется — там сниппеты
 * инлайновые, чтобы не добавлять внешний запрос в критический путь загрузки.
 */
(function () {
  var YM_COUNTER_ID = 111268041; // Яндекс.Метрика — zerotaxiplus.uz
  var FB_PIXEL_ID = '662407543088182'; // Meta Pixel — zerotaxiplus.uz
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' || h === '') return;

  (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
  })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=' + YM_COUNTER_ID, 'ym');
  ym(YM_COUNTER_ID, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});

  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', FB_PIXEL_ID);
  fbq('track', 'PageView');
})();
