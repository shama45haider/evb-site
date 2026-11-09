/*
 * "We're always buying" pop-up for blog posts (/blog/<post>/) and the
 * sneaker brand pages (/sell-*-sneakers-nyc/, /sell-birkenstock-nyc/).
 *
 * Opens a couple of seconds after someone lands on the page: the storefront
 * photo, a short line on what we buy, and buttons to call or text for a free
 * appraisal. Shown once per visit (browser tab session), never on the blog
 * index, and it waits while another dialog is up (cookie notice, closure
 * notice, a workplace-panel pop-up from evb-popups.js).
 *
 * Same look as the home page's "What's New" pop-up (#wnWrap in index.html,
 * also copied by evb-popups.js): a white card, the photo on the left with an
 * orange badge (on top on a phone), a small orange tag, the title, an orange
 * pill button, and the shop's address under a thin line. Keep them alike.
 */
(function () {
  'use strict';

  var w = window;
  var PATH = location.pathname;
  // Blog posts: /blog/<slug>/ (or /blog/<slug>/index.html), not /blog/ itself.
  var IS_POST = /^\/blog\/[^/]+(\/(index\.html)?)?$/.test(PATH);
  // Sneaker brand pages.
  var IS_SNEAKERS = /^\/(sell-[a-z0-9-]+-sneakers-nyc|sell-birkenstock-nyc)(\/(index\.html)?)?$/.test(PATH);
  if (!IS_POST && !IS_SNEAKERS) return;

  var KEY = 'evb_blog_pop';
  var DELAY_MS = 1800;
  // Wait this long for the visitor to answer the cookie notice, then open on
  // top of it anyway (it stays where it is behind the dialog).
  var COOKIE_WAIT_MS = 10000;
  var PHONE = '917-608-8939';
  var TEL = 'tel:9176088939';
  var SMS = 'sms:9176088939';
  var PHOTO = '/east-village-buyers-storefront-39-avenue-a.webp';
  var ID = 'blog-always-buying';

  var TEXT = IS_SNEAKERS
    ? 'Sneakers, plus gold, diamonds, watches, designer bags, streetwear and electronics. Text photos or call ' + PHONE + ' for a free quote, no obligation.'
    : 'Gold, diamonds, watches, sneakers, designer bags, streetwear and electronics. Call ' + PHONE + ' for a free appraisal, no obligation.';

  function seen() { try { return !!w.sessionStorage.getItem(KEY); } catch (e) { return false; } }
  function markSeen() { try { w.sessionStorage.setItem(KEY, '1'); } catch (e) {} }
  if (seen()) return;

  function push(name, button) {
    w.dataLayer = w.dataLayer || [];
    var ev = { event: name, popup_id: ID, popup_title: "We're always buying", page_path: PATH };
    if (button) ev.popup_button = button;
    w.dataLayer.push(ev);
  }

  function shown(el) {
    if (!el || !el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  // Dialogs we always wait out: the closure notice and a panel pop-up.
  function otherDialogOpen() {
    return !!document.getElementById('evbClosure') ||
      !!document.querySelector('.evbp.is-open');
  }

  // The cookie notice (#evbCk) slides in ~1.4s after load unless it was
  // answered before (an evb_ck* key in localStorage), so count it as up from
  // page load until it's answered.
  function cookieNoticeUp() {
    var el = document.getElementById('evbCk');
    if (!el) return false;
    if (el.classList.contains('evb-show') || shown(el)) return true;
    try {
      for (var i = 0; i < w.localStorage.length; i++) {
        if (/^evb_ck/.test(w.localStorage.key(i))) return false;
      }
    } catch (e) { return false; }
    return true;
  }

  var CSS =
    '.evbbp{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;visibility:hidden;pointer-events:none}' +
    '.evbbp.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbbp-lock{overflow:hidden}' +
    '.evbbp-scrim{position:absolute;inset:0;background:rgba(0,0,0,.65);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);opacity:0;transition:opacity .3s ease}' +
    '.evbbp.is-open .evbbp-scrim{opacity:1}' +
    '.evbbp-card{position:relative;display:flex;width:100%;max-width:580px;max-height:calc(100vh - 32px);overflow:hidden;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);' +
      'opacity:0;transform:translateY(30px) scale(.97);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}' +
    '.evbbp.is-open .evbbp-card{opacity:1;transform:none}' +
    '.evbbp-x{position:absolute;top:10px;right:12px;z-index:10;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;' +
      'background:rgba(255,255,255,.9);color:#333;font-size:18px;line-height:1;cursor:pointer;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:transform .2s}' +
    '.evbbp-x:hover{transform:scale(1.1)}' +
    '.evbbp-media{position:relative;flex:0 0 44%;min-height:260px;margin:0;overflow:hidden;background:#f3efe9}' +
    '.evbbp-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:50% 45%}' +
    '.evbbp-badge{position:absolute;top:14px;left:14px;z-index:2;padding:5px 10px;border-radius:6px;background:#f97316;color:#fff;font:800 10px/1.2 "Montserrat",sans-serif;letter-spacing:.1em}' +
    '.evbbp-body{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;overflow-x:hidden;overflow-y:auto;padding:28px 24px}' +
    '.evbbp-mark{position:absolute;bottom:-10px;right:-10px;width:120px;opacity:.06;pointer-events:none}' +
    '.evbbp-tag{margin:0 0 8px;font:800 10px/1.3 "Montserrat",sans-serif;letter-spacing:.15em;color:#f97316;text-transform:uppercase}' +
    '.evbbp-title{margin:0 0 8px;padding-right:22px;font:900 20px/1.2 "Montserrat",sans-serif;letter-spacing:-.01em;color:#111}' +
    '.evbbp-text{margin:0 0 16px;font:400 13px/1.6 "Poppins","Inter",sans-serif;color:#666}' +
    '.evbbp-text strong{font-weight:600;color:#333;white-space:nowrap}' +
    '.evbbp-btns{position:relative;display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}' +
    '.evbbp-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:50px;font:700 12px "Montserrat",sans-serif;letter-spacing:.02em;text-decoration:none;transition:background .2s,border-color .2s,color .2s,transform .2s}' +
    '.evbbp-btn svg{width:15px;height:15px;flex-shrink:0}' +
    '.evbbp-call{background:#f97316;color:#fff;box-shadow:0 4px 14px rgba(249,115,22,.3);animation:evbbpPulse 2s ease-in-out infinite}' +
    '.evbbp-call:hover{background:#ea580c;color:#fff;animation:none;transform:translateY(-1px)}' +
    '.evbbp-text-us{background:transparent;color:#333;border:1.5px solid #ddd;padding:8.5px 18.5px}' +
    '.evbbp-text-us:hover{border-color:#f97316;color:#f97316}' +
    '.evbbp-addr{position:relative;margin:0;padding-top:12px;border-top:1px solid #f0f0f0;font:500 12px "Poppins","Inter",sans-serif;color:#888}' +
    '@keyframes evbbpPulse{0%,100%{box-shadow:0 4px 14px rgba(249,115,22,.3)}50%{box-shadow:0 4px 24px rgba(249,115,22,.6),0 0 0 6px rgba(249,115,22,.12)}}' +
    '.evbbp-x:focus-visible,.evbbp-btn:focus-visible{outline:3px solid #f97316;outline-offset:3px}' +
    '@media (max-width:520px){' +
      '.evbbp-card{max-width:360px;flex-direction:column}' +
      '.evbbp-media{flex:none;height:200px;min-height:0}' +
      '.evbbp-body{padding:20px 18px}' +
      '.evbbp-title{font-size:17px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbbp-card,.evbbp-scrim{transition:none}.evbbp-call{animation:none}}';

  // The same stroke icons the home page pop-up and the nav buttons use.
  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>';
  var ICON_TEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var root, lastFocus;

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.className = 'evbbp';
    root.id = 'evbBlogPop';
    root.innerHTML =
      '<div class="evbbp-scrim" data-close></div>' +
      '<div class="evbbp-card" role="dialog" aria-modal="true" aria-labelledby="evbbpTitle" aria-describedby="evbbpText">' +
        '<button type="button" class="evbbp-x" data-close aria-label="Close">&#10005;</button>' +
        // The faint logo in the corner, on the card so the card's edge clips it.
        '<img class="evbbp-mark" src="/evblogo.webp" alt="" aria-hidden="true">' +
        '<figure class="evbbp-media">' +
          '<img class="evbbp-img" src="' + PHOTO + '" width="960" height="675" alt="East Village Buyers storefront at 39 Avenue A, New York" decoding="async">' +
          '<span class="evbbp-badge">SAME-DAY CASH</span>' +
        '</figure>' +
        '<div class="evbbp-body">' +
          '<p class="evbbp-tag">East Village Buyers</p>' +
          '<h2 class="evbbp-title" id="evbbpTitle">We’re Always Buying</h2>' +
          '<p class="evbbp-text" id="evbbpText"></p>' +
          '<div class="evbbp-btns">' +
            (IS_SNEAKERS
              ? '<a class="evbbp-btn evbbp-call" href="' + SMS + '" data-btn="text">' + ICON_TEXT + 'Text Photos for a Quote</a>' +
                '<a class="evbbp-btn evbbp-text-us" href="' + TEL + '" data-btn="call">' + ICON_PHONE + 'Call Us</a>'
              : '<a class="evbbp-btn evbbp-call" href="' + TEL + '" data-btn="call">' + ICON_PHONE + 'Call for an Appraisal</a>' +
                '<a class="evbbp-btn evbbp-text-us" href="' + SMS + '" data-btn="text">' + ICON_TEXT + 'Text Us</a>') +
          '</div>' +
          '<p class="evbbp-addr">39 Avenue A, East Village, NYC</p>' +
        '</div>' +
      '</div>';
    // The phone number in bold, the rest as plain text.
    var text = root.querySelector('#evbbpText');
    var parts = TEXT.split(PHONE);
    text.appendChild(document.createTextNode(parts[0]));
    var strong = document.createElement('strong');
    strong.textContent = PHONE;
    text.appendChild(strong);
    text.appendChild(document.createTextNode(parts[1] || ''));
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.evbbp-btn');
      if (btn) { push('popup_click', btn.getAttribute('data-btn')); close(); return; }
      if (e.target.closest('[data-close]')) close();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') trapTab(e);
    });
  }

  function trapTab(e) {
    var f = root.querySelectorAll('button, a[href]');
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    build();
    markSeen();
    lastFocus = document.activeElement;
    // Read layout once so the closed state is applied and the card animates in.
    void root.offsetWidth;
    root.classList.add('is-open');
    document.documentElement.classList.add('evbbp-lock');
    setTimeout(function () {
      var x = root.querySelector('.evbbp-x');
      if (x) x.focus({ preventScroll: true });
    }, 250);
    push('popup_view');
  }

  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    document.documentElement.classList.remove('evbbp-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function start() {
    // Load the photo first so the dialog never opens on an empty frame;
    // give up waiting after a few seconds and open anyway.
    var img = new Image();
    var ready = false;
    var since = Date.now();
    function go() {
      if (ready) return;
      ready = true;
      (function fire() {
        if (otherDialogOpen()) return setTimeout(fire, 1000);
        if (cookieNoticeUp() && Date.now() - since < COOKIE_WAIT_MS) return setTimeout(fire, 1000);
        open();
      })();
    }
    img.onload = img.onerror = go;
    setTimeout(go, 4000);
    img.src = PHOTO;
  }

  function later() { setTimeout(start, DELAY_MS); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later);
  else later();
})();
