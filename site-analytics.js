/*
 * EVB site analytics — anonymous visit stats for the panel's Website Analytics
 * page (panel.eastvillagebuyers.com/site-analytics).
 *
 * For each page view it reports: how long the page was in use, how far down
 * the page the visitor got, and which links and buttons they clicked. Sent to
 * the panel's /api/site-events with navigator.sendBeacon.
 *
 * Anonymous: no cookies, no names, no form contents, no phone numbers or email
 * addresses (a tel:/mailto: link reports only "tel:"/"mailto:"). A visit is a
 * random id kept in localStorage that is replaced after 30 idle minutes.
 *
 * Not tracked at all when the visitor chose "Essential only" on the cookie
 * notice, sends Global Privacy Control, is a bot, or the page isn't on
 * eastvillagebuyers.com (local copies and previews stay out of the numbers).
 *
 * Give a button or link a clearer name in the report with data-track="…".
 */
(function () {
  'use strict';

  var w = window;
  var d = document;
  var nav = navigator;
  var ENDPOINT = w.EVB_ANALYTICS_ENDPOINT || 'https://panel.eastvillagebuyers.com/api/site-events';
  var SESSION_KEY = 'evb_sa_visit';
  var VISIT_IDLE_MS = 30 * 60 * 1000;
  /** Time counts while someone did something on the page in the last minute. */
  var PAGE_IDLE_MS = 60 * 1000;
  var HEARTBEAT_MS = 60 * 1000;
  var MAX_CLICKS = 300;

  if (w.__evbAnalytics) return;
  w.__evbAnalytics = true;

  if (!w.EVB_ANALYTICS_ENDPOINT && !/(^|\.)eastvillagebuyers\.com$/.test(location.hostname)) return;
  if (nav.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(nav.userAgent || '')) return;
  if (nav.globalPrivacyControl === true) return;

  /** Checked before every send: "Essential only" can be chosen mid-visit. */
  function declined() {
    try {
      return w.localStorage.getItem('evb_ck6') === 'rejected' ||
        w.localStorage.getItem('evb_consent_v1') === 'denied';
    } catch (e) {
      return false;
    }
  }
  if (declined()) return;

  function uuid() {
    if (w.crypto && typeof w.crypto.randomUUID === 'function') return w.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (w.crypto && w.crypto.getRandomValues) w.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = '';
    for (var j = 0; j < 16; j++) hex += (bytes[j] + 0x100).toString(16).slice(1);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function clean(value, max) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function readVisit() {
    try {
      var visit = JSON.parse(w.localStorage.getItem(SESSION_KEY) || 'null');
      return visit && typeof visit.id === 'string' && typeof visit.t === 'number' ? visit : null;
    } catch (e) {
      return null;
    }
  }

  function writeVisit(id) {
    try {
      w.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, t: Date.now() }));
    } catch (e) {}
  }

  /** The visit this page view belongs to: the open one, or a new one after 30 idle minutes. */
  function startVisit() {
    var visit = readVisit();
    var id = visit && Date.now() - visit.t <= VISIT_IDLE_MS ? visit.id : uuid();
    writeVisit(id);
    return id;
  }

  /**
   * Every report keeps the visit open — unless another tab has since started a
   * new one, which this page mustn't overwrite. The page view keeps the id it
   * started with either way: the panel only accepts updates to a page view
   * from the visit that created it.
   */
  function keepVisitAlive(id) {
    var visit = readVisit();
    if (!visit || visit.id === id) writeVisit(id);
  }

  /** /blog/x/index.html and /blog/x/ are one page. */
  function pagePath(pathname) {
    return clean(pathname.replace(/\/index\.html$/, '/'), 300) || '/';
  }

  function isPostPath(path) {
    return /^\/blog\/[^/]+\/?$/.test(path) || /^\/blog-[^/]+\.html$/.test(path);
  }

  /** utm_source if the link carried one, else the referring site; '' for direct or internal. */
  function source() {
    try {
      var utm = new URLSearchParams(location.search).get('utm_source');
      if (utm) return clean(utm, 120).toLowerCase();
    } catch (e) {}
    try {
      if (d.referrer) {
        var ref = new URL(d.referrer);
        if (ref.host !== location.host) return ref.host.replace(/^www\./, '');
      }
    } catch (e) {}
    return '';
  }

  /**
   * Touch-first screens split by their short side (a phone stays a phone in
   * landscape); a mouse-and-keyboard screen is a computer unless it's narrow.
   * A touchscreen laptop still reports a fine pointer, so it counts as a computer.
   */
  function device() {
    var coarse = !!(w.matchMedia && w.matchMedia('(pointer: coarse)').matches);
    if (coarse) {
      var shortSide = Math.min(w.screen.width || 0, w.screen.height || 0) || w.innerWidth;
      return shortSide < 600 ? 'mobile' : 'tablet';
    }
    return (w.innerWidth || 1024) < 768 ? 'mobile' : 'desktop';
  }

  var ogType = d.querySelector('meta[property="og:type"]');
  var page = {
    pv: uuid(),
    sid: startVisit(),
    path: pagePath(location.pathname),
    title: clean(d.title, 200),
    post: !!(ogType && ogType.getAttribute('content') === 'article'),
    src: source(),
    dev: device()
  };

  // ---- Time in use ----------------------------------------------------------

  var activeMs = 0;
  var lastActivity = Date.now();
  var lastTick = Date.now();

  function activity() {
    lastActivity = Date.now();
  }
  ['scroll', 'pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (type) {
    w.addEventListener(type, activity, { passive: true, capture: true });
  });

  setInterval(function () {
    var now = Date.now();
    // A tab in the background, or one left open while they went elsewhere,
    // doesn't count. The 2-second cap stops a throttled timer adding the
    // whole time it was asleep.
    if (d.visibilityState === 'visible' && now - lastActivity < PAGE_IDLE_MS) {
      activeMs += Math.min(now - lastTick, 2000);
    }
    lastTick = now;
  }, 1000);

  // ---- Scroll depth ---------------------------------------------------------

  var maxScroll = 0;
  var measurePending = false;

  function measure() {
    measurePending = false;
    var root = d.documentElement;
    var height = Math.max(root.scrollHeight, d.body ? d.body.scrollHeight : 0);
    var viewport = w.innerHeight || root.clientHeight;
    var bottom = (w.pageYOffset || root.scrollTop || 0) + viewport;
    var pct = height <= viewport + 1 ? 100 : Math.round((bottom / height) * 100);
    if (pct > maxScroll) maxScroll = Math.min(100, pct);
  }

  w.addEventListener('scroll', function () {
    if (measurePending) return;
    measurePending = true;
    (w.requestAnimationFrame || setTimeout)(measure);
  }, { passive: true });
  w.addEventListener('load', measure);

  // ---- Clicks ---------------------------------------------------------------

  var clicks = [];
  var nextSeq = 0;

  function hrefOf(raw) {
    if (!raw) return '';
    var scheme = /^(tel|mailto|sms):/i.exec(raw);
    if (scheme) return scheme[1].toLowerCase() + ':';
    if (raw.charAt(0) === '#') return clean(raw, 100);
    try {
      var url = new URL(raw, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.host === location.host ? pagePath(url.pathname) : clean(url.host.replace(/^www\./, '') + url.pathname, 300);
    } catch (e) {
      return '';
    }
  }

  function labelOf(el) {
    var named = el.getAttribute('data-track') || el.getAttribute('aria-label');
    if (named) return clean(named, 100);
    if (el.tagName === 'INPUT') return clean(el.value, 100);
    // A card link holds a whole post preview; its heading is its name.
    var heading = el.querySelector && el.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && clean(heading.textContent, 100)) return clean(heading.textContent, 100);
    // textContent, not innerText: the words as written, not as CSS
    // capitalizes them ("Blog", not "BLOG").
    var text = clean(el.textContent, 100);
    if (text) return text;
    var img = el.querySelector && el.querySelector('img[alt]');
    if (img && img.getAttribute('alt')) return clean(img.getAttribute('alt'), 100);
    return clean(el.getAttribute('title'), 100);
  }

  d.addEventListener('click', function (event) {
    if (nextSeq >= MAX_CLICKS || !event.target || !event.target.closest) return;
    var el = event.target.closest(
      'a[href], button, [role="button"], input[type="submit"], input[type="button"], summary, [data-track]'
    );
    if (!el) return;
    var label = labelOf(el);
    if (!label) return;
    // A button inside a card link goes where the card goes.
    var link = el.tagName === 'A' ? el : el.closest('a[href]');
    var href = link ? hrefOf(link.getAttribute('href')) : '';
    var kind = link ? (isPostPath(href) ? 'post' : 'link') : 'button';
    clicks.push({ n: nextSeq++, k: kind, l: label, h: href });
    // Keep each beacon small on a click-happy page.
    if (clicks.length >= 20) send();
  }, true);

  // ---- Sending --------------------------------------------------------------

  var lastSent = '';

  function send() {
    if (declined()) return;
    measure();
    var batch = clicks.splice(0, 40);
    var state = Math.round(activeMs / 1000) + ':' + maxScroll;
    // Nothing new since the last report: skip it.
    if (!batch.length && state === lastSent) return;
    lastSent = state;
    keepVisitAlive(page.sid);

    var body = JSON.stringify({
      v: 1,
      pv: page.pv,
      sid: page.sid,
      path: page.path,
      title: page.title,
      post: page.post,
      src: page.src,
      dev: page.dev,
      ms: Math.round(activeMs),
      sc: maxScroll,
      clicks: batch
    });

    var queued = false;
    try {
      queued = !!(nav.sendBeacon && nav.sendBeacon(ENDPOINT, body));
    } catch (e) {}
    if (!queued && w.fetch) {
      try {
        w.fetch(ENDPOINT, {
          method: 'POST',
          body: body,
          keepalive: true,
          mode: 'no-cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain' }
        });
      } catch (e) {}
    }
  }

  // The first report a few seconds in, so even a quick visit counts; then
  // whenever the page is hidden or left (the reliable moment on phones), and
  // once a minute while it's open in case the leaving report never makes it.
  setTimeout(send, 4000);
  setInterval(function () {
    if (d.visibilityState === 'visible') send();
  }, HEARTBEAT_MS);
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') send();
    else {
      lastTick = Date.now();
      activity();
    }
  });
  w.addEventListener('pagehide', send);
})();
