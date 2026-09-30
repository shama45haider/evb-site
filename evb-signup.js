/* East Village Buyers — email-signup popup
   ---------------------------------------------------------------------------
   "Enter your email, get free shipping on your first order." Loaded on every
   page by site-nav.js.

   Emails go to the store Worker (POST /subscribe, see /square-worker.js),
   which keeps the list the Manage Blogs admin panel shows and applies the
   free shipping at checkout. The Worker URL is `apiBase` in
   /store/store-config.js — until that is filled in there is nowhere to keep
   an email, so the popup stays hidden. Add ?signup-preview to any URL to see
   it anyway (nothing is sent in preview).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var STATE_KEY = 'evb_signup_state';   // 'joined' | 'dismissed:<ms>'
  var EMAIL_KEY = 'evb_signup_email';   // read by the checkout in demo mode
  var SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
  var DELAY_MS = 12000;

  var PATH = location.pathname;
  var PREVIEW = /[?&]signup-preview\b/.test(location.search);

  // Never interrupt a checkout, a receipt, or the 404 page's own popup.
  if (/^\/store\/(checkout|order)\b/.test(PATH)) return;
  if (document.querySelector('.p404-ad')) return;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  if (!PREVIEW) {
    var st = get(STATE_KEY) || '';
    if (st === 'joined') return;
    var m = /^dismissed:(\d+)$/.exec(st);
    if (m && Date.now() - Number(m[1]) < SNOOZE_MS) return;
  }

  function apiBase() {
    var c = window.EVB_STORE_CONFIG;
    return c && c.apiBase ? String(c.apiBase).replace(/\/$/, '') : '';
  }

  /* store-config.js is only on store pages; elsewhere, fetch it for apiBase. */
  function loadConfig(cb) {
    if (window.EVB_STORE_CONFIG) return cb();
    var s = document.createElement('script');
    s.src = '/store/store-config.js?v=1.9.0';
    s.onload = s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }

  /* offsetParent is always null for position:fixed, so check the box itself. */
  function shown(el) {
    if (!el || !el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  /** Another dialog (cookie banner, closure notice, homepage What's New) is on screen. */
  function otherDialogOpen() {
    // The cookie banner is judged by what is on screen, not evb_consent_v1:
    // older banner markup decides visibility from its own key.
    return !!document.getElementById('evbClosure') ||
      shown(document.getElementById('wnWrap')) ||
      shown(document.getElementById('evbCk'));
  }

  function push(name, extra) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: name, page_path: PATH };
    for (var k in extra) o[k] = extra[k];
    window.dataLayer.push(o);
  }

  var root, lastFocus;

  function build() {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/evb-signup.css?v=2';
    document.head.appendChild(css);

    root = document.createElement('div');
    root.className = 'evbs';
    root.innerHTML =
      '<div class="evbs-backdrop" data-close></div>' +
      '<div class="evbs-card" role="dialog" aria-modal="true" aria-labelledby="evbsTitle" aria-describedby="evbsSub">' +
        '<button type="button" class="evbs-x" data-close aria-label="Close">&times;</button>' +
        '<div class="evbs-media" aria-hidden="true">' +
          '<img src="/evbstorefront.webp" alt="" decoding="async">' +
          '<span class="evbs-stamp"><b>Free</b>Shipping</span>' +
        '</div>' +
        '<div class="evbs-body">' +
          '<div class="evbs-form-view">' +
            '<p class="evbs-kicker">Welcome offer</p>' +
            '<h2 class="evbs-title" id="evbsTitle">Free shipping on your <em>first order</em></h2>' +
            '<p class="evbs-sub" id="evbsSub">Enter your email and we\'ll attach free standard shipping to it. Just check out with the same email.</p>' +
            '<form class="evbs-form" novalidate>' +
              '<label class="evbs-label" for="evbsEmail">Email address</label>' +
              '<input class="evbs-input" id="evbsEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>' +
              '<input class="evbs-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
              '<p class="evbs-err" role="alert"></p>' +
              '<button type="submit" class="evbs-btn">Unlock free shipping</button>' +
            '</form>' +
            '<button type="button" class="evbs-skip" data-close>No thanks</button>' +
            '<p class="evbs-fine">Applies to standard shipping on your first online order. We only email about the store and offers.</p>' +
          '</div>' +
          '<div class="evbs-done-view" hidden>' +
            '<p class="evbs-kicker">You\'re in</p>' +
            '<h2 class="evbs-title">Free shipping is <em>saved</em></h2>' +
            '<p class="evbs-sub">It\'s linked to <strong class="evbs-done-email"></strong>. Use that email at checkout and standard shipping is on us.</p>' +
            '<button type="button" class="evbs-btn" data-close>Keep browsing</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close(true);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close(true);
      if (e.key === 'Tab') trapTab(e);
    });
    root.querySelector('.evbs-form').addEventListener('submit', submit);
  }

  function trapTab(e) {
    var f = Array.prototype.filter.call(
      root.querySelectorAll('button, a[href], input:not(.evbs-hp)'),
      function (el) { return el.offsetParent !== null; }
    );
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (!root) build();
    lastFocus = document.activeElement;
    // Next frame so the entrance transition runs.
    requestAnimationFrame(function () {
      root.classList.add('is-open');
      document.documentElement.classList.add('evbs-lock');
      var input = root.querySelector('#evbsEmail');
      setTimeout(function () { input.focus({ preventScroll: true }); }, 250);
    });
    push('signup_popup_view');
  }

  function close(dismissed) {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    document.documentElement.classList.remove('evbs-lock');
    if (dismissed && !PREVIEW && get(STATE_KEY) !== 'joined') set(STATE_KEY, 'dismissed:' + Date.now());
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function submit(e) {
    e.preventDefault();
    var form = e.target;
    var input = form.email;
    var err = root.querySelector('.evbs-err');
    var btn = form.querySelector('.evbs-btn');
    var email = input.value.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      err.textContent = 'Enter a valid email address.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    err.textContent = '';
    input.removeAttribute('aria-invalid');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    var send = PREVIEW && !apiBase()
      ? Promise.resolve({ ok: true })
      : fetch(apiBase() + '/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, page: PATH, website: form.website.value })
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
            return d;
          });
        });

    send.then(function () {
      if (!PREVIEW) set(STATE_KEY, 'joined');
      set(EMAIL_KEY, email);
      root.querySelector('.evbs-done-email').textContent = email;
      root.querySelector('.evbs-form-view').hidden = true;
      root.querySelector('.evbs-done-view').hidden = false;
      root.querySelector('.evbs-done-view .evbs-btn').focus({ preventScroll: true });
      push('email_signup', { signup_source: 'popup' });
    }).catch(function (x) {
      err.textContent = x.message || 'Something went wrong. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Unlock free shipping';
    });
  }

  function schedule() {
    var fired = false;
    function fire() {
      if (fired) return;
      // Wait for other dialogs to be answered rather than stacking on them.
      if (otherDialogOpen()) return setTimeout(fire, 2000);
      fired = true;
      window.removeEventListener('scroll', onScroll);
      open();
    }
    function onScroll() {
      var h = document.documentElement;
      if ((h.scrollTop + h.clientHeight) / h.scrollHeight > 0.5) fire();
    }
    setTimeout(fire, PREVIEW ? 600 : DELAY_MS);
    if (!PREVIEW) setTimeout(function () { window.addEventListener('scroll', onScroll, { passive: true }); }, 4000);
  }

  function start() {
    loadConfig(function () {
      if (!apiBase() && !PREVIEW) return;
      schedule();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
