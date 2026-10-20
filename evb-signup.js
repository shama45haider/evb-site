(function () {
  'use strict';

  var STATE_KEY = 'evb_signup_state';
  var EMAIL_KEY = 'evb_signup_email';
  var SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
  var DELAY_MS = 20000;
  var SCROLL_SHARE = 0.35;

  var PATH = location.pathname;
  var PREVIEW = /[?&]signup-preview\b/.test(location.search);

  if (!PREVIEW && !/^\/store(\/|$)/.test(PATH)) return;
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

  function loadConfig(cb) {
    if (window.EVB_STORE_CONFIG) return cb();
    var s = document.createElement('script');
    s.src = '/store/store-config.js?v=1.9.3';
    s.onload = s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }

  function shown(el) {
    if (!el || !el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function otherDialogOpen() {
    return !!document.getElementById('evbClosure') ||
      shown(document.getElementById('wnWrap')) ||
      shown(document.getElementById('evbCk')) ||
      !!document.querySelector('.evbp.is-open');
  }

  function push(name, extra) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: name, page_path: PATH };
    for (var k in extra) o[k] = extra[k];
    window.dataLayer.push(o);
  }

  var root;

  function build() {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/evb-signup.css?v=3';
    document.head.appendChild(css);

    root = document.createElement('section');
    root.className = 'evbs';
    root.setAttribute('aria-label', 'Free shipping offer');
    root.innerHTML =
      '<button type="button" class="evbs-x" data-close aria-label="Close">&times;</button>' +
      '<div class="evbs-body">' +
        '<div class="evbs-form-view">' +
          '<p class="evbs-kicker">Welcome offer</p>' +
          '<p class="evbs-title">Free shipping on your <em>first order</em></p>' +
          '<button type="button" class="evbs-btn evbs-get" aria-expanded="false">Get it</button>' +
          '<p class="evbs-sub">Enter your email and we\'ll attach free standard shipping to it. Just check out with the same email.</p>' +
          '<form class="evbs-form" novalidate>' +
            '<label class="evbs-label" for="evbsEmail">Email address</label>' +
            '<div class="evbs-row">' +
              '<input class="evbs-input" id="evbsEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>' +
              '<button type="submit" class="evbs-btn">Unlock</button>' +
            '</div>' +
            '<input class="evbs-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<p class="evbs-err" role="alert"></p>' +
          '</form>' +
          '<p class="evbs-fine">Applies to standard shipping on your first online order. We only email about the store and offers.</p>' +
        '</div>' +
        '<div class="evbs-done-view" hidden>' +
          '<p class="evbs-kicker">You\'re in</p>' +
          '<p class="evbs-title">Free shipping is <em>saved</em></p>' +
          '<p class="evbs-sub">It\'s linked to <strong class="evbs-done-email"></strong>. Use that email at checkout and standard shipping is on us.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close(true);
      if (e.target.closest('.evbs-get')) expand();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close(true);
    });
    root.querySelector('.evbs-form').addEventListener('submit', submit);
  }

  function expand() {
    root.classList.add('is-expanded');
    root.querySelector('.evbs-get').setAttribute('aria-expanded', 'true');
    root.querySelector('#evbsEmail').focus({ preventScroll: true });
  }

  function open() {
    if (!root) build();
    requestAnimationFrame(function () { root.classList.add('is-open'); });
    push('signup_popup_view');
  }

  function close(dismissed) {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    if (dismissed && !PREVIEW && get(STATE_KEY) !== 'joined') set(STATE_KEY, 'dismissed:' + Date.now());
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
      push('email_signup', { signup_source: 'popup' });
      setTimeout(function () { close(false); }, 8000);
    }).catch(function (x) {
      err.textContent = x.message || 'Something went wrong. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Unlock';
    });
  }

  function schedule() {
    var fired = false;
    function fire() {
      if (fired) return;
      if (otherDialogOpen()) return setTimeout(fire, 2000);
      fired = true;
      window.removeEventListener('scroll', onScroll);
      open();
    }
    function onScroll() {
      var doc = document.documentElement;
      var room = doc.scrollHeight - window.innerHeight;
      if (room > 0 && window.scrollY / room >= SCROLL_SHARE) fire();
    }
    if (PREVIEW) return setTimeout(fire, 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(fire, DELAY_MS);
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
