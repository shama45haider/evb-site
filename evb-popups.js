/*
 * Pop-up messages, managed in the workplace panel (Website → Pop-ups).
 *
 * Since 2026-11-23 (panel 0103) this draws every pop-up card on the site.
 * The home page's What's New card (#wnWrap in index.html) and the three from
 * evb-blog-popup.js ("We're Always Buying" on blog posts and on the sneaker
 * pages, "Sell Your Streetwear and Sneakers" in the store) used to be written
 * into the site; they are panel pop-ups now, so the owner edits them there.
 *
 * Asks the panel which pop-ups are live for the website (?v=2: the ones that
 * came from the site's own code too), and of those meant for this page that
 * this visitor isn't done with (their "How often" setting):
 * - the first that opens with the page opens its set seconds after the page;
 * - one that opens after browsing adds up the visitor's active time on its
 *   pages through the visit (sessionStorage), and opens at its set minutes.
 * Each waits while another dialog is up (closure notice, the welcome game,
 * another of these) and, if set to, for an unanswered cookie notice (10 s at
 * most), and loads its picture first so it never opens on an empty frame.
 *
 * <html data-evb-popup-wait> is on from the start until the page's opening
 * pop-up has been closed, or there is none; data-evb-popup-closed says one
 * was shown and closed. The welcome game (evb-spin.js) reads them on the home
 * page, to come 13 seconds after What's New closes, as it did before.
 *
 * Page matching and "how often" mirror the panel's src/lib/popups/popups.ts;
 * change both together. The look is previewed in the panel by
 * components/popups/site-popup.tsx; restyle both together. Everything shown
 * is set as text, never HTML.
 */
(function () {
  'use strict';

  var w = window;
  var d = document;
  var BASE = w.EVB_POPUPS_ENDPOINT || 'https://panel.eastvillagebuyers.com/api/site-popups';
  if (!w.EVB_POPUPS_ENDPOINT && !/(^|\.)eastvillagebuyers\.com$/.test(location.hostname)) return;
  var ENDPOINT = BASE + (BASE.indexOf('?') < 0 ? '?' : '&') + 'v=2';

  var PATH = location.pathname;
  // Never in the middle of paying, or on the 404 page.
  if (/^\/store\/(checkout|order)\b/.test(PATH)) return;
  if (d.querySelector('.p404-ad')) return;

  var KEY = 'evb_popup_';
  var TIME_KEY = 'evb_popup_t_';
  var MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  // Wait this long for the visitor to answer the cookie notice, then open on
  // top of it anyway (it stays where it is behind the dialog).
  var COOKIE_WAIT_MS = 10000;
  var IMAGE_WAIT_MS = 4000;
  // Browsing counts while there's been a scroll, tap or key this recently.
  var IDLE_MS = 2 * 60 * 1000;
  var TICK_MS = 5000;

  var html = d.documentElement;
  html.setAttribute('data-evb-popup-wait', '');
  function doneWaiting(shown) {
    html.removeAttribute('data-evb-popup-wait');
    if (shown) html.setAttribute('data-evb-popup-closed', '');
  }

  function get(store, k) { try { return w[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { w[store].setItem(k, v); return true; } catch (e) { return false; } }

  // "/store", "/store/" and "/store/index.html" are the same page.
  function normalize(path) {
    var bare = (String(path).split(/[?#]/)[0] || '/').replace(/\/index\.html$/i, '/');
    return bare.length > 1 ? (bare.replace(/\/+$/, '') || '/') : '/';
  }

  // A page pattern as a regular expression: * is "anything here".
  function patternSource(pattern) {
    return '^' + pattern.split('*').map(function (part) {
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }).join('.*');
  }

  // Empty = every page; a * stands for anything ("/blog/*", "/sell-*-sneakers-nyc/");
  // else that one page. A pattern ending in * is compared with a trailing
  // slash on both sides, so "/blog/*" takes "/blog" but not "/blogger".
  function matchesPage(patterns, path) {
    if (!patterns || !patterns.length) return true;
    var here = normalize(path);
    var hereSlash = here === '/' ? '/' : here + '/';
    for (var i = 0; i < patterns.length; i++) {
      var p = String(patterns[i]);
      if (p.charAt(p.length - 1) === '*') {
        if (new RegExp(patternSource(p)).test(hereSlash)) return true;
      } else {
        var page = normalize(p);
        if (page.indexOf('*') >= 0 ? new RegExp(patternSource(page) + '$').test(here) : page === here) return true;
      }
    }
    return false;
  }

  function showsHere(p) {
    return matchesPage(p.pages, PATH) && !(p.skipPages && p.skipPages.length && matchesPage(p.skipPages, PATH));
  }

  function today() {
    var t = new Date();
    return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
  }

  // Seen before? "revision|day|time" in localStorage; "every visit" uses the
  // tab session. Kept when it opens, so leaving the page without closing it
  // counts as seen.
  function due(p) {
    if (p.frequency === 'every_visit') return Number(get('sessionStorage', KEY + p.id)) < p.revision;
    var seen = (get('localStorage', KEY + p.id) || '').split('|');
    if (Number(seen[0]) < p.revision) return true;
    if (p.frequency === 'daily') return seen[1] !== today();
    if (p.frequency === 'monthly') return !(Date.now() - Number(seen[2]) < MONTH_MS);
    return false;
  }

  function remember(p) {
    if (p.frequency === 'every_visit') set('sessionStorage', KEY + p.id, String(p.revision));
    else set('localStorage', KEY + p.id, p.revision + '|' + today() + '|' + Date.now());
  }

  function safeLink(url) {
    url = String(url || '');
    return /^(\/(?!\/)|https?:\/\/|tel:|sms:|mailto:)/i.test(url) ? url : null;
  }

  // A pop-up that is still built into this page, or into a cached copy of
  // evb-blog-popup.js from before 2026-11-23, is left to it, never shown twice.
  function builtInHere(p) {
    if (p.key === 'home-whats-new') return !!d.getElementById('wnWrap');
    if (p.key === 'blog-always-buying' || p.key === 'sneakers-always-buying' || p.key === 'store-sell-streetwear') {
      return !!d.querySelector('script[src*="evb-blog-popup.js"]') && !w.EVB_BLOG_POPUP_RETIRED;
    }
    return false;
  }

  function shown(el) {
    if (!el || !el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  // Dialogs to wait out: the closure notice (site-nav.js), the welcome game
  // (evb-spin.js), another of these, and the old built-in ones while a
  // cached page still has them.
  function otherDialogOpen() {
    return !!d.getElementById('evbClosure') ||
      html.hasAttribute('data-evb-spin') ||
      !!d.querySelector('.evbp.is-open, .evbbp.is-open') ||
      shown(d.getElementById('wnWrap'));
  }

  // The cookie notice (#evbCk) slides in ~1.4s after load unless it was
  // answered before (an evb_ck* key in localStorage), so count it as up from
  // page load until it's answered.
  function cookieNoticeUp() {
    var el = d.getElementById('evbCk');
    if (!el) return false;
    if (el.classList.contains('evb-show') || shown(el)) return true;
    try {
      for (var i = 0; i < w.localStorage.length; i++) {
        if (/^evb_ck/.test(w.localStorage.key(i))) return false;
      }
    } catch (e) { return false; }
    return true;
  }

  function push(name, p, button) {
    w.dataLayer = w.dataLayer || [];
    // The site's own pop-ups keep the names their events had before.
    var ev = { event: name, popup_id: p.key || p.id, popup_title: p.title, page_path: PATH };
    if (button) ev.popup_button = button;
    w.dataLayer.push(ev);
  }

  // The same look as the home page's "What's New" pop-up had (the owner's
  // rule, 2026-10-19): a white card, the picture on the left with an orange
  // badge (on top on a phone), a small orange tag, the title, an orange pill
  // button and an outlined second one, and the shop's address under a thin line.
  var CSS =
    '.evbp{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;visibility:hidden;pointer-events:none}' +
    '.evbp.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbp-lock{overflow:hidden}' +
    '.evbp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);opacity:0;transition:opacity .3s ease}' +
    '.evbp.is-open .evbp-backdrop{opacity:1}' +
    '.evbp-card{position:relative;display:flex;width:100%;max-width:580px;max-height:calc(100vh - 32px);overflow:hidden;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);' +
      'opacity:0;transform:translateY(30px) scale(.97);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}' +
    '.evbp.is-open .evbp-card{opacity:1;transform:none}' +
    '.evbp-card:not(.has-img){max-width:420px}' +
    '.evbp-x{position:absolute;top:10px;right:12px;z-index:10;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#333;font-size:18px;line-height:1;cursor:pointer;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:transform .2s}' +
    '.evbp-x:hover{transform:scale(1.1)}' +
    '.evbp-media{position:relative;flex:0 0 44%;min-height:260px;margin:0;overflow:hidden;background:#f3efe9}' +
    '.evbp-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}' +
    '.evbp-badge{position:absolute;top:14px;left:14px;z-index:2;padding:5px 10px;border-radius:6px;background:#f97316;color:#fff;font:800 10px/1.2 "Montserrat",sans-serif;letter-spacing:.1em}' +
    '.evbp-body{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;overflow-x:hidden;overflow-y:auto;padding:28px 24px}' +
    '.evbp-mark{position:absolute;bottom:-10px;right:-10px;width:120px;opacity:.06;pointer-events:none}' +
    '.evbp-tag{margin:0 0 8px;font:800 10px/1.3 "Montserrat",sans-serif;letter-spacing:.15em;color:#f97316;text-transform:uppercase}' +
    '.evbp-title{margin:0 0 8px;padding-right:22px;font:900 20px/1.2 "Montserrat",sans-serif;letter-spacing:-.01em;color:#111}' +
    '.evbp-text{margin:0 0 16px;font:400 13px/1.6 "Poppins","Inter",sans-serif;color:#666;white-space:pre-line}' +
    '.evbp-text strong{font-weight:600;color:#333;white-space:nowrap}' +
    '.evbp-btns{position:relative;display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}' +
    '.evbp-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:50px;background:#f97316;color:#fff;font:700 12px "Montserrat",sans-serif;letter-spacing:.02em;text-decoration:none;' +
      'box-shadow:0 4px 14px rgba(249,115,22,.3);animation:evbpPulse 2s ease-in-out infinite;transition:background .2s,border-color .2s,color .2s,transform .2s}' +
    '.evbp-btn:hover{background:#ea580c;color:#fff;animation:none;transform:translateY(-1px)}' +
    '.evbp-btn svg{width:15px;height:15px;flex-shrink:0}' +
    '.evbp-btn2{background:transparent;color:#333;border:1.5px solid #ddd;padding:8.5px 18.5px;box-shadow:none;animation:none}' +
    '.evbp-btn2:hover{background:transparent;border-color:#f97316;color:#f97316;transform:none}' +
    '.evbp-addr{position:relative;margin:0;padding-top:12px;border-top:1px solid #f0f0f0;font:500 12px "Poppins","Inter",sans-serif;color:#888}' +
    '@keyframes evbpPulse{0%,100%{box-shadow:0 4px 14px rgba(249,115,22,.3)}50%{box-shadow:0 4px 24px rgba(249,115,22,.6),0 0 0 6px rgba(249,115,22,.12)}}' +
    '.evbp-x:focus-visible,.evbp-btn:focus-visible{outline:3px solid #f97316;outline-offset:3px}' +
    '@media (max-width:520px){' +
      '.evbp-card{max-width:360px;flex-direction:column}' +
      '.evbp-media{flex:none;height:200px;min-height:0}' +
      '.evbp-body{padding:20px 18px}' +
      '.evbp-title{font-size:17px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbp-card,.evbp-backdrop{transition:none}.evbp-btn{animation:none}}';

  // The same stroke icons the nav buttons use.
  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>';
  var ICON_TEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  var styled = false;
  var lastId = 0;

  function el(tag, cls, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // The message as text, with phone numbers (917-608-8939) in bold.
  function fillText(node, text) {
    var parts = String(text).split(/(\b\d{3}-\d{3}-\d{4}\b)/);
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      node.appendChild(i % 2 ? el('strong', '', parts[i]) : d.createTextNode(parts[i]));
    }
  }

  // For the click event: "call", "text", or the button's words as a slug.
  function buttonName(href, label) {
    if (/^tel:/i.test(href)) return 'call';
    if (/^sms:/i.test(href)) return 'text';
    return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // A button: the first is orange, the second outlined. A phone link gets the
  // phone icon, a text link the speech bubble, the orange one's other links
  // an arrow after the words. Icons are fixed markup; the words are text.
  function button(label, url, second, onClick) {
    var href = safeLink(url);
    if (!label || !href) return null;
    var a = el('a', 'evbp-btn' + (second ? ' evbp-btn2' : ''));
    a.href = href;
    if (/^tel:/i.test(href)) a.innerHTML = ICON_PHONE;
    else if (/^sms:/i.test(href)) a.innerHTML = ICON_TEXT;
    a.appendChild(el('span', '', label));
    if (!second && !/^(tel|sms):/i.test(href)) a.insertAdjacentHTML('beforeend', ICON_ARROW);
    if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.addEventListener('click', function () { onClick(buttonName(href, label)); });
    return a;
  }

  function build(p, close) {
    if (!styled) {
      var style = el('style');
      style.textContent = CSS;
      d.head.appendChild(style);
      styled = true;
    }
    var titleId = 'evbpTitle' + (++lastId);

    var root = el('div', 'evbp');
    var backdrop = el('div', 'evbp-backdrop');
    backdrop.setAttribute('data-close', '');
    var card = el('div', 'evbp-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleId);

    var x = el('button', 'evbp-x');
    x.type = 'button';
    x.setAttribute('data-close', '');
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '&#10005;';
    card.appendChild(x);

    // The faint logo in the corner, on the card so the card's edge clips it.
    var mark = el('img', 'evbp-mark');
    mark.src = '/evblogo.webp';
    mark.alt = '';
    mark.setAttribute('aria-hidden', 'true');
    card.appendChild(mark);

    if (p.image) {
      card.className += ' has-img';
      var media = el('div', 'evbp-media');
      var img = el('img', 'evbp-img');
      img.src = p.image;
      img.alt = '';
      img.decoding = 'async';
      media.appendChild(img);
      // Blank = none; missing (a feed from before 0103) = the usual one.
      var badge = p.badge == null ? "WHAT'S NEW" : p.badge;
      if (badge) media.appendChild(el('div', 'evbp-badge', badge));
      card.appendChild(media);
    }

    var body = el('div', 'evbp-body');
    var tag = p.tag == null ? 'East Village Buyers' : p.tag;
    if (tag) body.appendChild(el('p', 'evbp-tag', tag));
    var title = el('h2', 'evbp-title', p.title);
    title.id = titleId;
    body.appendChild(title);
    if (p.body) {
      var text = el('p', 'evbp-text');
      fillText(text, p.body);
      body.appendChild(text);
    }

    function clicked(name) {
      push('popup_click', p, name);
      close();
    }
    var first = button(p.buttonLabel, p.buttonUrl, false, clicked);
    var second = first && button(p.button2Label, p.button2Url, true, clicked);
    if (first) {
      var btns = el('div', 'evbp-btns');
      btns.appendChild(first);
      if (second) btns.appendChild(second);
      body.appendChild(btns);
    }

    body.appendChild(el('p', 'evbp-addr', '39 Avenue A, East Village, NYC'));
    card.appendChild(body);

    root.appendChild(backdrop);
    root.appendChild(card);
    d.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        var f = root.querySelectorAll('button, a[href]');
        var firstF = f[0], lastF = f[f.length - 1];
        if (e.shiftKey && d.activeElement === firstF) { e.preventDefault(); lastF.focus(); }
        else if (!e.shiftKey && d.activeElement === lastF) { e.preventDefault(); firstF.focus(); }
      }
    });
    return root;
  }

  function open(p, onClosed) {
    var root;
    var lastFocus = d.activeElement;
    function close() {
      if (!root.classList.contains('is-open')) return;
      root.classList.remove('is-open');
      if (!d.querySelector('.evbp.is-open')) html.classList.remove('evbp-lock');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      if (onClosed) onClosed();
    }
    root = build(p, close);
    remember(p);
    // Read layout once so the closed state is applied and the card animates in.
    void root.offsetWidth;
    root.classList.add('is-open');
    html.classList.add('evbp-lock');
    setTimeout(function () {
      var x = root.querySelector('.evbp-x');
      if (x) x.focus({ preventScroll: true });
    }, 250);
    push('popup_view', p);
  }

  // Load the picture first (a few seconds at most), then wait until nothing
  // else is in the way, then open.
  function openWhenClear(p, onClosed) {
    function clear() {
      var since = Date.now();
      (function check() {
        if (otherDialogOpen()) return setTimeout(check, 1000);
        if (p.waitForCookies !== false && cookieNoticeUp() && Date.now() - since < COOKIE_WAIT_MS) return setTimeout(check, 1000);
        open(p, onClosed);
      })();
    }
    if (!p.image) return clear();
    var ready = false;
    function go() { if (!ready) { ready = true; clear(); } }
    var img = new Image();
    img.onload = img.onerror = go;
    setTimeout(go, IMAGE_WAIT_MS);
    img.src = p.image;
  }

  // "After browsing a while": add up this visit's active time on the pop-up's
  // pages, and open once it reaches openAfter seconds.
  function browsingClock(p) {
    var k = TIME_KEY + p.id;
    var need = (Number(p.openAfter) || 0) * 1000;
    var lastActive = 0;
    var timer = null;
    function spent() { return Number(get('sessionStorage', k)) || 0; }
    function active() { lastActive = Date.now(); }
    function ready() {
      clearInterval(timer);
      openWhenClear(p);
    }
    if (spent() >= need) return ready();
    ['scroll', 'pointerdown', 'keydown'].forEach(function (t) {
      w.addEventListener(t, active, { passive: true });
    });
    // The clock starts with the first scroll, tap or key, or carries on from
    // earlier pages of this visit.
    if (spent() > 0) active();
    timer = setInterval(function () {
      if (d.visibilityState !== 'visible' || !lastActive || Date.now() - lastActive > IDLE_MS) return;
      var total = spent() + TICK_MS;
      if (!set('sessionStorage', k, String(total))) { clearInterval(timer); return; }
      if (total >= need) ready();
    }, TICK_MS);
  }

  function start(list, startedAt) {
    var now = Date.now();
    var onLoad = null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || !p.title) continue;
      if (p.endsAt && Date.parse(p.endsAt) <= now) continue;
      if (!showsHere(p) || builtInHere(p) || !due(p)) continue;
      if (p.openOn === 'browsing') browsingClock(p);
      else if (!onLoad) onLoad = p;
    }
    if (!onLoad) return doneWaiting(false);
    var after = Number(onLoad.openAfter);
    var wait = (isFinite(after) && after >= 0 ? after : 1.2) * 1000;
    setTimeout(function () {
      openWhenClear(onLoad, function () { doneWaiting(true); });
    }, Math.max(0, startedAt + wait - Date.now()));
  }

  function later() {
    var startedAt = Date.now();
    if (!w.fetch) return doneWaiting(false);
    // A feed that never answers mustn't hold the welcome game back for good.
    var cap = setTimeout(function () { doneWaiting(false); }, 15000);
    w.fetch(ENDPOINT, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : { popups: [] }; })
      .then(function (data) {
        clearTimeout(cap);
        start((data && data.popups) || [], startedAt);
      })
      .catch(function () {
        clearTimeout(cap);
        doneWaiting(false);
      });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', later);
  else later();
})();
