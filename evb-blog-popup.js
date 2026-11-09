/*
 * "We're always buying" pop-up for blog posts (/blog/<post>/).
 *
 * Opens a couple of seconds after someone lands on a post: the storefront
 * photo, a short line on what we buy, and a button to call for a free
 * appraisal. Shown once per visit (browser tab session), never on the blog
 * index, and it waits while another dialog is up (cookie notice, closure
 * notice, a workplace-panel pop-up from evb-popups.js).
 *
 * Material 3 look in EVB orange: a white 28px dialog on desktop, a bottom
 * sheet on phones, pill buttons, sentence-case text, no gradients.
 */
(function () {
  'use strict';

  var w = window;
  // Posts only: /blog/<slug>/ (or /blog/<slug>/index.html), not /blog/ itself.
  if (!/^\/blog\/[^/]+(\/(index\.html)?)?$/.test(location.pathname)) return;

  var KEY = 'evb_blog_pop';
  var DELAY_MS = 1800;
  // Wait this long for the visitor to answer the cookie notice, then open on
  // top of it anyway (it stays where it is behind the dialog).
  var COOKIE_WAIT_MS = 10000;
  var PHONE = '917-608-8939';
  var TEL = 'tel:9176088939';
  var PHOTO = '/east-village-buyers-storefront-39-avenue-a.webp';
  var ID = 'blog-always-buying';

  function seen() { try { return !!w.sessionStorage.getItem(KEY); } catch (e) { return false; } }
  function markSeen() { try { w.sessionStorage.setItem(KEY, '1'); } catch (e) {} }
  if (seen()) return;

  function push(name) {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: name, popup_id: ID, popup_title: "We're always buying", page_path: location.pathname });
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
    '.evbbp{--bp-pri:#f97316;--bp-pri-ink:#c2410c;--bp-pri-c:#ffdcc6;--bp-on-pri-c:#7a3000;--bp-on:#1c1b1a;--bp-dim:#5f5a54;--bp-s1:#f4f0eb;' +
      'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:24px;visibility:hidden;pointer-events:none}' +
    '.evbbp.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbbp-lock{overflow:hidden}' +
    '.evbbp-scrim{position:absolute;inset:0;background:rgba(28,27,26,.5);opacity:0;transition:opacity .3s ease}' +
    '.evbbp.is-open .evbbp-scrim{opacity:1}' +
    '.evbbp-card{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 48px);overflow-y:auto;background:#fff;border-radius:28px;padding:8px;' +
      'box-shadow:0 8px 32px rgba(28,27,26,.18);opacity:0;transform:scale(.94);transform-origin:50% 60%;' +
      'transition:opacity .25s ease,transform .45s cubic-bezier(.05,.7,.1,1)}' +
    '.evbbp.is-open .evbbp-card{opacity:1;transform:none}' +
    '.evbbp-media{position:relative;margin:0;border-radius:20px;overflow:hidden;background:var(--bp-s1);aspect-ratio:16/10}' +
    '.evbbp-img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 45%}' +
    '.evbbp-chip{position:absolute;left:12px;bottom:12px;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px 0 8px;border-radius:8px;' +
      'background:rgba(255,255,255,.94);color:var(--bp-on);font:600 12px/1 "Inter","Montserrat",sans-serif}' +
    '.evbbp-chip svg{width:18px;height:18px;color:var(--bp-pri-ink);flex:none}' +
    '.evbbp-x{position:absolute;top:12px;right:12px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;' +
      'background:rgba(255,255,255,.94);color:var(--bp-on);cursor:pointer;padding:0;transition:background .2s}' +
    '.evbbp-x:hover{background:#fff}' +
    '.evbbp-x svg{width:20px;height:20px}' +
    '.evbbp-body{padding:20px 16px 8px}' +
    '.evbbp-title{margin:0 0 8px;font:700 24px/1.25 "Montserrat",sans-serif;letter-spacing:-.01em;color:var(--bp-on)}' +
    '.evbbp-text{margin:0 0 20px;font:400 15px/1.55 "Inter","Montserrat",sans-serif;color:var(--bp-dim)}' +
    '.evbbp-text strong{font-weight:600;color:var(--bp-on);white-space:nowrap}' +
    '.evbbp-acts{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}' +
    '.evbbp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 24px;border:0;border-radius:999px;' +
      'font:600 15px/1 "Inter","Montserrat",sans-serif;text-decoration:none;cursor:pointer;transition:background .2s,box-shadow .2s}' +
    '.evbbp-btn svg{width:20px;height:20px;flex:none}' +
    '.evbbp-call{background:var(--bp-pri);color:#fff}' +
    '.evbbp-call:hover{background:var(--bp-pri-ink);color:#fff;box-shadow:0 1px 3px rgba(28,27,26,.25)}' +
    '.evbbp-later{background:transparent;color:var(--bp-pri-ink);padding:0 16px}' +
    '.evbbp-later:hover{background:rgba(249,115,22,.08)}' +
    '.evbbp-x:focus-visible,.evbbp-btn:focus-visible{outline:3px solid var(--bp-pri);outline-offset:2px}' +
    '@media (max-width:600px){' +
      '.evbbp{align-items:flex-end;padding:0}' +
      '.evbbp-card{max-width:none;max-height:92vh;border-radius:28px 28px 0 0;padding:8px 8px calc(12px + env(safe-area-inset-bottom));transform:translateY(100%);' +
        'transition:opacity .2s ease,transform .45s cubic-bezier(.05,.7,.1,1)}' +
      '.evbbp-media{aspect-ratio:16/9}' +
      '.evbbp-body{padding:18px 12px 4px}' +
      '.evbbp-title{font-size:22px}' +
      '.evbbp-acts{flex-direction:column-reverse;align-items:stretch}' +
      '.evbbp-btn{width:100%}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbbp-card,.evbbp-scrim{transition:opacity .2s ease}.evbbp-card{transform:none}}';

  // Material Symbols Rounded paths (call, location_on, close), inlined so the
  // icon font isn't loaded on every post.
  var ICON_CALL = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M798-120q-125 0-247-54.5T329-329Q229-429 174.5-551T120-798q0-18 12-30t30-12h162q14 0 25 9.5t13 22.5l26 140q2 16-1 27t-11 19l-97 98q20 37 47.5 71.5T387-386q31 31 65 57.5t72 48.5l94-94q9-9 23.5-13.5T670-390l138 28q14 4 23 14.5t9 23.5v162q0 18-12 30t-30 12Z"/></svg>';
  var ICON_PIN = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480Zm0 400Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Z"/></svg>';
  var ICON_X = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"/></svg>';

  var root, card, lastFocus;

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
        '<figure class="evbbp-media">' +
          '<img class="evbbp-img" src="' + PHOTO + '" width="960" height="675" alt="East Village Buyers storefront at 39 Avenue A, New York" decoding="async">' +
          '<span class="evbbp-chip">' + ICON_PIN + '39 Avenue A, East Village</span>' +
          '<button type="button" class="evbbp-x" data-close aria-label="Close">' + ICON_X + '</button>' +
        '</figure>' +
        '<div class="evbbp-body">' +
          '<h2 class="evbbp-title" id="evbbpTitle">We’re always buying</h2>' +
          '<p class="evbbp-text" id="evbbpText">Gold, diamonds, watches, sneakers, designer bags, streetwear and electronics, every day at our East Village store. ' +
            'Call <strong>' + PHONE + '</strong> for a free appraisal, no obligation.</p>' +
          '<div class="evbbp-acts">' +
            '<button type="button" class="evbbp-btn evbbp-later" data-close>Not now</button>' +
            '<a class="evbbp-btn evbbp-call" href="' + TEL + '">' + ICON_CALL + 'Call for an appraisal</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    card = root.querySelector('.evbbp-card');

    root.addEventListener('click', function (e) {
      if (e.target.closest('.evbbp-call')) { push('popup_click'); close(); return; }
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
      var call = root.querySelector('.evbbp-call');
      if (call) call.focus({ preventScroll: true });
    }, 200);
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
