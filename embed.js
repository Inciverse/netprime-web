// Vercel serverless function: proxies vidsrc.sbs embed pages so they can be
// embedded in our app's iframe. It strips the inline frame-bust script that
// hides the player when inside an iframe, and removes known ad/sponsor scripts.
// Usage: /api/embed?u=<url-encoded https://vidsrc.sbs/embed/...>
module.exports = async (req, res) => {
  const u = req.query.u;
  if (!u || !/^https:\/\/vidsrc\.sbs\//.test(u)) {
    res.status(400).send('Invalid target');
    return;
  }
  try {
    const r = await fetch(u, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': 'text/html,*/*',
        'Referer': 'https://vidsrc.sbs/'
      },
      redirect: 'follow'
    });
    let html = await r.text();

    // 1) Remove the frame-bust / sandbox check that hides the player in iframes.
    html = html.replace(/\(function vzJsSandboxCheck\(\)[\s\S]*?\}\)\(\);/g, '');

    // 2) Strip known ad / sponsor / popup external script tags.
    const adRe = /popads|popunder|llvpn|adsby|exo|clickadu|juicy|mgid|taboola|outbrain|doubleclick|googlesyndication|googleadservices|popcash|adx|onclk|antiadblock|tracker|promo|banner|native|adservice|adnxs|pubmatic|rubicon|indexexchange|criteo|smartadserver|bidvertiser|admitad|propeller|revcontent|content\.ad|zucks|yllix|coinhive|miner|popnow|adsterra|stickyad|pushcrew|onesignal|monetag|TrafficJunky|exosrv|juicytraffic|spinad/i;
    html = html.replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*>\s*<\/script>/gi, (m) => adRe.test(m) ? '' : m);
    // 2b) Strip inline ad scripts (popup / redirect injection attempts).
    html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => {
      if (adRe.test(m) || /window\.open\(|window\.location|document\.write|top\.location|parent\.location/i.test(body)) return '';
      return m;
    });

    // 3) Force the real player visible and hide warning/ad overlays. Resolve
    //    relative asset URLs back to vidsrc.sbs so the page works under our origin.
    //    Also rewrite any (runtime-set) vidsrc.sbs iframe src through this proxy so
    //    the nested player is also stripped of its frame-bust / ad scripts.
    const inject = '<base href="https://vidsrc.sbs/"><style>' +
      '#vzDomainWarn,.vz-domain-warn,[id*="warn"],[class*="ads"],[id*="ads"],[class*="popup"],[class*="popunder"],[id*="popunder"],[class*="banner"]{display:none!important;}' +
      '#embedPlayer,.embed-wrap,iframe{display:block!important;}' +
      '</style>' +
      "<script>(function(){function rw(el){try{var s=el.getAttribute('src');if(s&&s.indexOf('https://vidsrc.sbs/')===0){el.setAttribute('src','/api/embed?u='+encodeURIComponent(s));}}catch(e){}}var o=new MutationObserver(function(m){m.forEach(function(x){var n=x.target;if(n&&n.nodeName==='IFRAME')rw(n);});});o.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});document.querySelectorAll('iframe[src^=\"https://vidsrc.sbs/\"]').forEach(rw);})();<\/script>";
    html = html.replace(/<head[^>]*>/i, (m) => m + inject);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
