/* EVB Rewards — the /account/ page.
 *
 * Sign-in is an emailed 6-digit code (Supabase Auth email OTP): no password
 * to make up or forget, and the same two steps whether the account is new or
 * not. Everything about the member comes from one call, member_me() (panel
 * migration 0069), which only ever answers about the signed-in member.
 *
 * ?preview, ?preview=signin|code|welcome|empty renders sample data without
 * touching Supabase — for checking the design before accounts go live.
 */
(function () {
  'use strict';

  var host = document.getElementById('acctHost');
  if (!host) return;

  var PENDING_KEY = 'evb_acct_pending';
  // Where the email's sign-in link comes back to, if the template sends a
  // link instead of (or as well as) the code. Supabase only honours it when
  // it's listed under Authentication → URL Configuration → Redirect URLs.
  var ACCOUNT_URL = location.origin + '/account/';
  var HANDOFF_KEY = 'evb_acct_email';
  var RESEND_SECONDS = 60;

  var cfg = window.EVB_ACCOUNT_CONFIG || {};
  // Points buy free shipping (panel migration 0074). member_me sends the
  // real numbers in rules; these are for the signed-out pages and previews.
  var FREE_SHIP = 250, FREE_EXPRESS = 600;
  var store = window.EVB_STORE_CONFIG || {};
  var biz = store.business || { phone: '917-608-8939', phoneHref: 'tel:9176088939', email: 'info@eastvillagebuyers.com' };
  var sb = null;
  var resendTimer = null;

  /* ------------------------------------------------------------ helpers */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) {
    var n = Number(cents) || 0;
    return '$' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function num(n) { return (Number(n) || 0).toLocaleString('en-US'); }
  function date(v) {
    var d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  function ss(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function push(name, extra) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: name, page_path: location.pathname };
    for (var k in extra) o[k] = extra[k];
    window.dataLayer.push(o);
  }
  function validEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v); }

  var ICON = {
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9h18"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/></svg>',
    idcard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4"/><path d="M14 10h5M14 13h4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
  };

  function spinner(label) { return '<span class="acct-spin" aria-hidden="true"></span>' + esc(label); }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.innerHTML = spinner(label); }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || label; }
  }

  function render(html) {
    host.innerHTML = html;
    var first = host.querySelector('[autofocus]');
    if (first && window.matchMedia('(min-width: 700px)').matches) first.focus();
  }

  /* Supabase's messages are written for developers; these are for customers. */
  function friendly(err) {
    var m = String((err && (err.message || err.error_description)) || err || '');
    if (/signups? not allowed|signup.*disabled/i.test(m)) return 'There’s no account for that email yet. EVB Rewards opens to everyone very soon!';
    if (/rate limit|only request this after|too many/i.test(m)) {
      var s = /after (\d+) seconds?/.exec(m);
      return s ? 'Please wait ' + s[1] + ' seconds, then try again.' : 'Too many tries. Please wait a minute and try again.';
    }
    if (/expired|invalid|otp/i.test(m)) return 'That code didn’t work. Check the newest email from us, or send a new code.';
    if (/fetch|network|load failed/i.test(m)) return 'We couldn’t reach our server. Check your connection and try again.';
    if (/Enter your name|phone number|can.t be changed/i.test(m)) return m;
    return 'Something went wrong. Please try again, or call us at ' + biz.phone + '.';
  }

  /* ------------------------------------------------------------ signed out */

  // The intro plays its entrance once; the code, welcome and on-the-list
  // steps redraw it, and replaying it every step would be noise.
  var introPlayed = false;

  function heroIntro() {
    var play = !introPlayed;
    introPlayed = true;
    return '' +
      '<div class="acct-intro' + (play ? ' acct-intro--play' : '') + '">' +
        '<span class="acct-deco" aria-hidden="true">' +
          '<span class="acct-orb acct-orb--a"></span>' +
          '<span class="acct-orb acct-orb--b"></span>' +
          '<span class="acct-spark acct-spark--a">' + ICON.sparkle + '</span>' +
          '<span class="acct-spark acct-spark--b">' + ICON.sparkle + '</span>' +
        '</span>' +
        '<h1 class="acct-title"><span class="acct-word" style="--i:1">Shop with us.</span> ' +
          '<em class="acct-word" style="--i:2">Get rewarded.' +
            '<svg class="acct-squiggle" viewBox="0 0 220 16" preserveAspectRatio="none" aria-hidden="true"><path d="M3 11 C 45 3, 85 15, 125 8 S 190 3, 217 9"/></svg>' +
          '</em></h1>' +
        '<p class="acct-lede" style="--i:3">Earn <strong>1 point for every $1</strong> you spend — online or in the shop on Avenue A. Every <strong>' + FREE_SHIP + ' points ships an order free.</strong></p>' +
        '<ul class="acct-perks">' +
          perk(ICON.star, 'Points on every purchase', 'Online orders and counter sales, added to your account by themselves.', 4) +
          perk(ICON.truck, 'Free shipping at ' + FREE_SHIP + ' points', FREE_SHIP + ' points ships an online order free; ' + FREE_EXPRESS + ' ships it express.', 5) +
          perk(ICON.idcard, 'No ID needed to sell', 'Your ID is on file with your account, so you don’t have to bring it when you sell to us.', 6) +
          perk(ICON.key, 'No password to remember', 'We email you a code each time you sign in.', 7) +
        '</ul>' +
      '</div>';
  }
  function perk(icon, title, text, i) {
    return '<li class="acct-perk" style="--i:' + i + '"><span class="acct-perk-icon">' + icon + '</span><div><b>' + title + '</b><span>' + text + '</span></div></li>';
  }

  function renderEmail(prefill, error) {
    stopResendTimer();
    render(
      '<div class="acct-hero">' + heroIntro() +
        '<div class="acct-card-stage">' +
          '<span class="acct-float acct-float--pts" aria-hidden="true">' + ICON.star + '+450 pts</span>' +
          '<span class="acct-float acct-float--off" aria-hidden="true">' + ICON.truck + 'Free shipping</span>' +
          '<div class="acct-card acct-fade" style="animation-delay:.08s">' +
            '<h2 class="acct-card-title">Sign in or create your account</h2>' +
            '<p class="acct-card-sub">Enter your email and we’ll send you a sign-in code. New here? That’s all it takes to make your free account.</p>' +
            '<form id="acctEmailForm" novalidate>' +
              '<label class="acct-label" for="acctEmail">Email address</label>' +
              '<input class="acct-input" id="acctEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required autofocus value="' + esc(prefill || '') + '">' +
              '<p class="acct-error" id="acctErr" role="alert">' + esc(error || '') + '</p>' +
              '<button class="evb-btn evb-btn--primary acct-btn acct-btn--go" type="submit">Email me a code</button>' +
            '</form>' +
            '<p class="acct-fine">Use the email you shop with — orders from the last 30 days count too. By joining you agree to our <a href="/cookie-policy/">privacy &amp; cookie policy</a>.</p>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    var form = document.getElementById('acctEmailForm');
    var input = document.getElementById('acctEmail');
    var err = document.getElementById('acctErr');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = input.value.trim().toLowerCase();
      if (!validEmail(email)) {
        input.setAttribute('aria-invalid', 'true');
        err.textContent = 'Enter a full email address, like you@example.com.';
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      err.textContent = '';
      sendCode(email, form.querySelector('button'), err);
    });
  }

  // Anyone can make an account; what it unlocks is decided by member_me
  // (panel 0072). If Supabase's sign-up switch is still off, a new email is
  // saved as a request for Members → Requests (0071) instead of an error.
  function closed() { return window.EVB_REWARDS_OPEN === false; }

  function sendCode(email, btn, errEl) {
    if (!sb) return renderCode(email);
    setBusy(btn, true, 'Sending…');
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: ACCOUNT_URL } }).then(function (res) {
      if (res.error && /signups? not allowed|signup.*disabled/i.test(res.error.message || '')) {
        return requestAccess(email, btn, errEl);
      }
      setBusy(btn, false, 'Email me a code');
      if (res.error) { if (errEl) errEl.textContent = friendly(res.error); return; }
      ss(PENDING_KEY, JSON.stringify({ email: email, sentAt: Date.now() }));
      push('account_code_sent', {});
      renderCode(email);
    }, function (e) {
      setBusy(btn, false, 'Email me a code');
      if (errEl) errEl.textContent = friendly(e);
    });
  }

  function requestAccess(email, btn, errEl) {
    sb.rpc('request_member_access', { p_email: email, p_page: location.pathname }).then(function (res) {
      setBusy(btn, false, 'Email me a code');
      if (res.error) {
        if (errEl) errEl.textContent = /full email/i.test(res.error.message || '') ? res.error.message : friendly(res.error);
        return;
      }
      push('account_access_requested', {});
      renderRequested(email);
    }, function (e) {
      setBusy(btn, false, 'Email me a code');
      if (errEl) errEl.textContent = friendly(e);
    });
  }

  function renderRequested(email) {
    stopResendTimer();
    render(
      '<div class="acct-hero">' + heroIntro() +
        '<div class="acct-card acct-fade">' +
          '<div class="acct-welcome-badge">' + ICON.clock + '</div>' +
          '<h2 class="acct-card-title">You’re on the list</h2>' +
          '<p class="acct-card-sub">We’ve saved <b>' + esc(email) + '</b>. EVB Rewards is opening to a few customers at a time — we’ll email you as soon as your account is ready.</p>' +
          '<a class="evb-btn evb-btn--primary acct-btn" href="/store/">Browse the store</a>' +
          '<div class="acct-links"><button type="button" class="acct-link" id="acctBack">Use a different email</button></div>' +
        '</div>' +
      '</div>'
    );
    document.getElementById('acctBack').addEventListener('click', function () { renderEmail(''); });
  }

  function renderCode(email, error) {
    var boxes = '';
    for (var i = 0; i < 6; i++) boxes += '<span class="acct-code-box" aria-hidden="true"></span>';
    render(
      '<div class="acct-hero">' + heroIntro() +
        '<div class="acct-card acct-fade">' +
          '<h2 class="acct-card-title">Check your email</h2>' +
          '<p class="acct-card-sub">We sent a sign-in code to <b>' + esc(email) + '</b>. Type it below, or tap the link in the email. It can take a minute — check spam too.</p>' +
          '<form id="acctCodeForm" novalidate>' +
            '<label class="acct-label" for="acctCode">Your code</label>' +
            '<div class="acct-code" id="acctCodeWrap">' + boxes +
              '<input class="acct-code-input" id="acctCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" aria-describedby="acctErr" autofocus>' +
            '</div>' +
            '<p class="acct-error" id="acctErr" role="alert">' + esc(error || '') + '</p>' +
            '<button class="evb-btn evb-btn--primary acct-btn acct-btn--go" type="submit">Sign in</button>' +
          '</form>' +
          '<div class="acct-links">' +
            '<button type="button" class="acct-link" id="acctBack">Use a different email</button>' +
            '<button type="button" class="acct-link" id="acctResend" disabled>Send a new code</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    var input = document.getElementById('acctCode');
    var wrap = document.getElementById('acctCodeWrap');
    var form = document.getElementById('acctCodeForm');
    var err = document.getElementById('acctErr');
    var cells = wrap.querySelectorAll('.acct-code-box');

    function paint() {
      var v = input.value;
      var focused = document.activeElement === input;
      for (var i = 0; i < 6; i++) {
        cells[i].textContent = v[i] || '';
        cells[i].classList.toggle('is-filled', !!v[i]);
        cells[i].classList.toggle('is-active', focused && i === Math.min(v.length, 5));
      }
    }
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      wrap.classList.remove('is-bad');
      err.textContent = '';
      paint();
      if (input.value.length === 6) verify();
    });
    input.addEventListener('focus', paint);
    input.addEventListener('blur', paint);
    wrap.addEventListener('click', function () { input.focus(); });
    paint();

    function verify() {
      var code = input.value;
      if (code.length !== 6) { err.textContent = 'Enter all 6 digits of the code.'; input.focus(); return; }
      if (!sb) return previewAfterCode();
      var btn = form.querySelector('button');
      setBusy(btn, true, 'Signing in…');
      input.disabled = true;
      sb.auth.verifyOtp({ email: email, token: code, type: 'email' }).then(function (res) {
        if (res.error) {
          setBusy(btn, false, 'Sign in');
          input.disabled = false;
          input.value = '';
          paint();
          wrap.classList.add('is-bad');
          err.textContent = friendly(res.error);
          input.focus();
          return;
        }
        ss(PENDING_KEY, null);
        push('account_signed_in', {});
        loadMe();
      }, function (e) {
        setBusy(btn, false, 'Sign in');
        input.disabled = false;
        err.textContent = friendly(e);
      });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); verify(); });

    document.getElementById('acctBack').addEventListener('click', function () {
      ss(PENDING_KEY, null);
      renderEmail(email);
    });
    var resend = document.getElementById('acctResend');
    resend.addEventListener('click', function () {
      if (!sb) return startResendTimer(resend, RESEND_SECONDS);
      resend.disabled = true;
      sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: ACCOUNT_URL } }).then(function (res) {
        if (res.error) { err.textContent = friendly(res.error); resend.disabled = false; return; }
        ss(PENDING_KEY, JSON.stringify({ email: email, sentAt: Date.now() }));
        err.textContent = '';
        input.value = '';
        paint();
        startResendTimer(resend, RESEND_SECONDS);
        input.focus();
      }, function (e) { err.textContent = friendly(e); resend.disabled = false; });
    });

    var pending = parsePending();
    var elapsed = pending && pending.email === email ? Math.floor((Date.now() - pending.sentAt) / 1000) : 0;
    startResendTimer(resend, Math.max(RESEND_SECONDS - elapsed, 0));
  }

  function startResendTimer(btn, seconds) {
    stopResendTimer();
    var left = seconds;
    function tick() {
      if (!document.body.contains(btn)) return stopResendTimer();
      if (left <= 0) { btn.disabled = false; btn.textContent = 'Send a new code'; return stopResendTimer(); }
      btn.disabled = true;
      btn.textContent = 'New code in 0:' + (left < 10 ? '0' : '') + left;
      left--;
    }
    tick();
    if (left >= 0) resendTimer = setInterval(tick, 1000);
  }
  function stopResendTimer() { if (resendTimer) { clearInterval(resendTimer); resendTimer = null; } }

  function parsePending() {
    try {
      var p = JSON.parse(ss(PENDING_KEY) || 'null');
      // A code is good for an hour; past that, start over.
      return p && p.email && Date.now() - p.sentAt < 55 * 60 * 1000 ? p : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ profile form */

  function bindProfileForm(formId, label, after) {
    var form = document.getElementById(formId);
    var err = form.querySelector('.acct-error');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('acctName').value.trim();
      var phone = document.getElementById('acctPhone').value.trim();
      var optIn = document.getElementById('acctOptIn').checked;
      if (!name) { err.textContent = 'Enter your name.'; document.getElementById('acctName').focus(); return; }
      if (phone && !/^[0-9 ()+.-]{7,32}$/.test(phone)) { err.textContent = 'That phone number doesn’t look right.'; document.getElementById('acctPhone').focus(); return; }
      if (!sb) return previewAfterProfile(name);
      var btn = form.querySelector('button[type="submit"]');
      setBusy(btn, true, 'Saving…');
      sb.rpc('member_update_profile', { p_full_name: name, p_phone: phone || null, p_marketing_opt_in: optIn }).then(function (res) {
        if (res.error) { setBusy(btn, false, label); err.textContent = friendly(res.error); return; }
        if (after) after();
        loadMe();
      }, function (e2) { setBusy(btn, false, label); err.textContent = friendly(e2); });
    });
  }

  /* ------------------------------------------------------------ dashboard */

  // Everything the member has done with the shop (member_history, panel
  // migration 0070): what they bought, sold to us, traded, and every online
  // order with where it is. One column, quiet surfaces, motion only where it
  // explains something — numbers counting up, a row opening.

  var ONLINE_STATUS = {
    awaiting_details: 'Confirming', details_received: 'Order placed', preparing: 'Preparing',
    ready_for_pickup: 'Ready for pickup', picked_up: 'Picked up', shipped: 'Shipped',
    delivered: 'Delivered', cancelled: 'Cancelled'
  };
  var CARRIER = { usps: 'USPS', ups: 'UPS', fedex: 'FedEx', dhl: 'DHL' };
  var FILTERS = [['all', 'All'], ['bought', 'Bought'], ['sold', 'Sold to us'], ['online', 'Online']];
  var PAGE = 8;

  var KIND = {
    online: { label: 'Online order', icon: function () { return ICON.bag; } },
    store:  { label: 'Bought in the shop', icon: function () { return ICON.store; } },
    sold:   { label: 'Sold to us', icon: function () { return ICON.cash; } },
    trade:  { label: 'Trade', icon: function () { return ICON.swap; } }
  };

  // A photo for every row: the item's own Square photo when it has one,
  // otherwise the store department photo for what it is (the same photos
  // as /store/'s department tiles), otherwise the plain icon.
  var DEPT_IMG = {
    sneakers:    ['/air-jordan-1-high-chicago.webp', true],
    watch:       ['/watch-tag-heuer-formula-1-green-dial.webp', true],
    jewelry:     ['/diamond-tennis-bracelet.webp', true],
    gold:        ['/goldcoincanada.webp', false],
    silver:      ['/davidyurmansterlingsilver.webp', true],
    handbag:     ['/lvhandbag.webp', false],
    sunglasses:  ['/dior-sunglasses.webp', true],
    streetwear:  ['/streetwear-main.webp', true],
    electronics: ['/ps5.webp', false],
    collectible: ['/pokemon-booster-box.webp', false]
  };
  var CATEGORY_ALIAS = { jacket: 'streetwear', beanie: 'streetwear', glasses: 'sunglasses', belt: 'handbag' };
  var GUESS = [
    ['sneakers', /jordan|dunk|yeezy|nike|sneaker|air force|new balance|travis|asics|kobe/i],
    ['watch', /rolex|omega|watch|datejust|submariner|cartier|audemars|patek|heuer|seiko|breitling/i],
    ['electronics', /iphone|ipad|macbook|ps5|playstation|xbox|nintendo|switch|airpods|camera|console/i],
    ['collectible', /pok[e\u00e9]mon|card|plush|figure|funko|bearbrick|hot wheels|lego|milo|booster/i],
    ['sunglasses', /sunglass|glasses|eyewear/i],
    ['gold', /\bcoins?\b|bullion|\bbar\b|krugerrand|eagle|maple leaf/i],
    ['silver', /silver|sterling/i],
    ['jewelry', /chain|ring\b|bracelet|necklace|earring|pendant|cuban|rope|diamond|tennis/i],
    ['handbag', /\bbag\b|purse|louis vuitton|\blv\b|chanel|herm[e\u00e8]s|tote|wallet|neverfull/i],
    ['streetwear', /tee\b|t-shirt|hoodie|shirt|jacket|supreme|chrome hearts|hellstar|bape|denim|jeans|pants|beanie/i]
  ];

  function deptOf(item) {
    var c = item && item.category ? CATEGORY_ALIAS[item.category] || item.category : '';
    if (DEPT_IMG[c]) return c;
    for (var i = 0; i < GUESS.length; i++) if (GUESS[i][1].test(item && item.name || '')) return GUESS[i][0];
    return '';
  }

  // <img> for one item, or '' when there is nothing to show.
  function itemImg(item) {
    if (item && item.imageUrl && /^https:\/\//.test(item.imageUrl)) {
      return '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'is-blank\');this.remove()">';
    }
    var d = DEPT_IMG[deptOf(item)];
    return d ? '<img src="' + d[0] + '" alt="" loading="lazy"' + (d[1] ? '' : ' class="is-cutout"') + '>' : '';
  }

  function rowThumb(e) {
    var items = (e.items || []).filter(function (i) { return e.kind !== 'trade' || i.side !== 'in'; });
    var img = itemImg(items[0] || (e.items || [])[0]);
    return '<span class="acct-thumb' + (img ? '' : ' is-blank') + '">' +
      (img || KIND[e.kind].icon()) +
      '<span class="acct-thumb-badge" aria-hidden="true">' + KIND[e.kind].icon() + '</span>' +
    '</span>';
  }

  function inFilter(e, f) {
    if (f === 'all') return true;
    if (f === 'online') return e.kind === 'online';
    if (f === 'sold') return e.kind === 'sold' || e.kind === 'trade';
    return e.kind === 'store' || e.kind === 'online' || e.kind === 'trade';
  }

  function isOpenOrder(e) {
    return e.kind === 'online' && ['awaiting_details', 'details_received', 'preparing', 'shipped', 'ready_for_pickup'].indexOf(e.status) >= 0;
  }
  function activeBuyback(e) {
    var b = e.buyback;
    return b && (b.status === 'offered' || b.status === 'awaiting_payment') && b.expiresAt && new Date(b.expiresAt) > new Date();
  }

  function totals(history) {
    var t = { bought: 0, sold: 0, orders: 0 };
    history.forEach(function (e) {
      if (e.kind === 'online' && e.status !== 'cancelled') { t.bought += Math.max((e.totalCents || 0) - (e.refundedCents || 0), 0); t.orders++; }
      if (e.kind === 'store') t.bought += e.totalCents || 0;
      if (e.kind === 'sold') t.sold += e.totalCents || 0;
      if (e.kind === 'trade') {
        t.sold += e.tradeInCents || 0;
        if (e.tradeCashDirection === 'customer_pays') t.bought += e.totalCents || 0;
      }
    });
    return t;
  }

  function renderDash(me, opts) {
    opts = opts || {};
    var rules = me.rules || { pointsPerDollar: 1 };
    var ship = rules.freeShippingPoints || FREE_SHIP;
    var express = rules.freeExpressPoints || FREE_EXPRESS;
    var bal = Math.max(Number(me.balance) || 0, 0);
    // The ring fills toward free shipping, then on toward free express.
    var goal = bal < ship ? ship : express;
    var into = Math.min(bal, goal);
    var pct = Math.round((into / goal) * 100);
    var ready = bal >= express ? 'Free express shipping ready' : bal >= ship ? 'Free shipping ready' : '';
    var pointsLine = bal < ship
      ? '<b>' + num(ship - bal) + ' points</b> to free shipping'
      : bal < express
        ? 'Text us when you order online and we\u2019ll ship it free. <b>' + num(express - bal) + ' more</b> for free express.'
        : 'Text us when you order online and we\u2019ll ship it express, free.';
    var history = me.history || [];
    var sum = totals(history);

    var live = history.filter(isOpenOrder).map(liveOrder)
      .concat(history.filter(activeBuyback).map(liveBuyback));

    render(
      '<div class="acct-dash">' +
        (opts.preview ? '<span class="acct-preview-tag acct-rise">Preview · sample data</span>' : '') +

        '<header class="acct-dash-head acct-rise">' +
          '<div>' +
            '<p class="acct-dash-kicker">EVB Rewards · Member ' + esc(me.memberNumber) + '</p>' +
            '<h1 class="acct-hi"><span class="acct-hi-avatar" data-avatar aria-hidden="true">' + esc((firstName(me.fullName) || '?').charAt(0)) + '</span>' +
              '<span>Hi, <em class="acct-hi-name">' + esc(firstName(me.fullName) || 'there') +
                '<svg class="acct-squiggle" viewBox="0 0 220 16" preserveAspectRatio="none" aria-hidden="true"><path d="M3 11 C 45 3, 85 15, 125 8 S 190 3, 217 9"/></svg>' +
              '</em></span></h1>' +
          '</div>' +
          '<button type="button" class="acct-textbtn" id="acctSignOut">Sign out</button>' +
        '</header>' +

        '<section class="acct-points acct-rise" style="--d:60ms" aria-label="Your points">' +
          '<span class="acct-points-deco" aria-hidden="true">' +
            '<span class="acct-pd acct-pd--a"></span><span class="acct-pd acct-pd--b"></span>' +
            '<span class="acct-pd-spark">' + ICON.sparkle + '</span>' +
          '</span>' +
          '<div class="acct-points-main">' +
            '<span class="acct-points-label">' + ICON.star + 'Your points</span>' +
            '<p class="acct-points-num" data-count="' + bal + '">' + num(bal) + '</p>' +
            (ready ? '<span class="acct-points-ready">' + ICON.truck + ready + '</span>' : '') +
            '<p class="acct-points-sub">' + pointsLine + '</p>' +
          '</div>' +
          '<div class="acct-ring" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + into + '" aria-label="Points toward ' + (goal === ship ? 'free shipping' : 'free express shipping') + '">' +
            '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="acct-ring-track" cx="60" cy="60" r="52"/><circle class="acct-ring-fill" cx="60" cy="60" r="52" pathLength="100" data-pct="' + pct + '"/></svg>' +
            '<span class="acct-ring-text"><i aria-hidden="true">' + ICON.truck + '</i><b>' + (goal === ship ? 'Free' : 'Express') + '</b><small>' + num(into) + ' / ' + num(goal) + '</small></span>' +
          '</div>' +
        '</section>' +

        '<a class="acct-visit acct-rise" style="--d:100ms" href="https://maps.google.com/?q=39+Avenue+A+New+York+NY+10009" target="_blank" rel="noopener">' +
          '<img class="acct-visit-img" src="/east-village-buyers-storefront-39-avenue-a.webp" alt="The East Village Buyers storefront at 39 Avenue A" loading="lazy" width="960" height="675">' +
          '<span class="acct-visit-text">' +
            '<b>Earn in the shop too</b>' +
            '<span>Give us your name or member number <strong>' + esc(me.memberNumber) + '</strong> at the counter.</span>' +
            '<span class="acct-visit-addr">' + ICON.pin + '39 Avenue A, East Village</span>' +
          '</span>' +
          '<span class="acct-visit-go" aria-hidden="true">' + ICON.arrow + '</span>' +
        '</a>' +

        (live.length ? '<section class="acct-live acct-rise" style="--d:140ms" aria-label="Happening now">' +
          '<p class="acct-live-head" aria-hidden="true"><span class="acct-live-pulse"></span>Happening now</p>' + live.join('') + '</section>' : '') +

        '<section class="acct-stats acct-rise" style="--d:180ms">' +
          stat(ICON.bag, 'Bought from us', sum.bought, true) +
          stat(ICON.cash, 'Sold to us', sum.sold, true) +
          stat(ICON.truck, 'Online orders', sum.orders, false) +
        '</section>' +

        '<section class="acct-section acct-rise" style="--d:220ms">' +
          '<div class="acct-section-head">' +
            '<h2 class="acct-section-title"><i aria-hidden="true">' + ICON.clock + '</i>History</h2>' +
            '<div class="acct-seg" role="tablist" aria-label="Filter history">' +
              '<span class="acct-seg-pill" aria-hidden="true"></span>' +
              FILTERS.map(function (f, i) {
                return '<button type="button" role="tab" class="acct-seg-btn" data-filter="' + f[0] + '" aria-selected="' + (i === 0) + '">' + f[1] + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div id="acctHistory"></div>' +
        '</section>' +

        '<section class="acct-section acct-rise" style="--d:260ms">' +
          '<h2 class="acct-section-title"><i aria-hidden="true">' + ICON.sparkle + '</i>How it works</h2>' +
          '<ol class="acct-steps">' +
            '<li><span class="acct-step-icon">' + ICON.bag + '<em aria-hidden="true">1</em></span><b>Earn</b><span>' + rules.pointsPerDollar + ' point for every $1 you spend with us, online or in the shop.</span></li>' +
            '<li><span class="acct-step-icon">' + ICON.truck + '<em aria-hidden="true">2</em></span><b>Ship free</b><span>' + num(ship) + ' points is free shipping on an online order; ' + num(express) + ' is free express.</span></li>' +
            '<li><span class="acct-step-icon">' + ICON.gift + '<em aria-hidden="true">3</em></span><b>Use</b><span>Text or call us when you order online and we\u2019ll take the shipping off.</span></li>' +
          '</ol>' +
        '</section>' +

        '<section class="acct-section acct-rise" style="--d:300ms" id="acctDetails">' + detailsView(me) + '</section>' +

        '<p class="acct-foot-note">Want to close your account? Email <a href="mailto:' + esc(biz.email) + '">' + esc(biz.email) + '</a>.</p>' +
      '</div>'
    );

    revealOnScroll(host, function (el) { countUp(el.querySelectorAll('[data-count]')); });
    countUp(host.querySelectorAll('.acct-rise:not(.is-waiting) [data-count]'));
    var ring = host.querySelector('.acct-ring-fill');
    if (ring) setTimeout(function () { ring.style.strokeDashoffset = String(100 - Number(ring.dataset.pct)); }, 250);

    bindHistory(history, me);
    fillAvatar(me);
    document.getElementById('acctSignOut').addEventListener('click', function () {
      if (!sb) return renderEmail();
      sb.auth.signOut().then(function () { forgetMember(); renderEmail(); }, function () { forgetMember(); renderEmail(); });
    });
    bindDetails(me);
  }

  function stat(icon, label, value, isMoney) {
    return '<div class="acct-stat"><i aria-hidden="true">' + icon + '</i><span>' + label + '</span>' +
      '<b data-count="' + value + '"' + (isMoney ? ' data-money' : '') + '>' + (isMoney ? money(value) : num(value)) + '</b></div>';
  }

  /* "Happening now": orders on their way and buy-backs still open. */
  function liveOrder(e) {
    var pickup = e.fulfillment === 'pickup';
    var text = e.status === 'shipped' ? 'On its way' + (e.tracking && e.tracking.carrier && CARRIER[e.tracking.carrier] ? ' with ' + CARRIER[e.tracking.carrier] : '')
      : e.status === 'ready_for_pickup' ? 'Ready for pickup at 39 Avenue A'
      : pickup ? 'Getting it ready for pickup' : 'Getting it ready to ship';
    var action = e.tracking && e.tracking.url
      ? '<a class="acct-live-btn" href="' + esc(e.tracking.url) + '" target="_blank" rel="noopener">Track</a>' : '';
    return '<div class="acct-live-row">' +
      '<span class="acct-live-icon' + (e.status === 'shipped' || e.status === 'ready_for_pickup' ? ' is-go' : '') + '" aria-hidden="true">' +
        (e.status === 'shipped' ? ICON.truck : e.status === 'ready_for_pickup' ? ICON.store : ICON.box) + '</span>' +
      '<div class="acct-live-main"><b>' + esc(text) + '</b><span>' + esc(itemsTitle(e)) + ' · ' + esc(e.reference) + '</span></div>' +
      action +
    '</div>';
  }
  function liveBuyback(e) {
    return '<div class="acct-live-row">' +
      '<span class="acct-live-icon is-hold" aria-hidden="true">' + ICON.clock + '</span>' +
      '<div class="acct-live-main"><b>Buy it back for ' + money(e.buyback.priceCents) + '</b><span>' + esc(itemsTitle(e)) + ' · until ' + esc(date(e.buyback.expiresAt)) + '</span></div>' +
      '<a class="acct-live-btn" href="' + esc(biz.phoneHref) + '">Call</a>' +
    '</div>';
  }

  function itemsTitle(e) {
    var items = (e.items || []).filter(function (i) { return e.kind !== 'trade' || i.side === 'out'; });
    if (!items.length) items = e.items || [];
    if (!items.length) return KIND[e.kind].label;
    return items[0].name + (items.length > 1 ? ' + ' + (items.length - 1) + ' more' : '');
  }

  /* ------------------------------------------------------------ history */

  function bindHistory(history, me) {
    var box = document.getElementById('acctHistory');
    var seg = host.querySelector('.acct-seg');
    var pill = seg.querySelector('.acct-seg-pill');
    var filter = 'all';
    var shown = PAGE;

    function movePill() {
      var on = seg.querySelector('[aria-selected="true"]');
      pill.style.width = on.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    }

    function draw() {
      var list = history.filter(function (e) { return inFilter(e, filter); });
      if (!list.length) {
        box.innerHTML = history.length
          ? '<p class="acct-none">Nothing here yet.</p>'
          : '<div class="acct-empty"><p>Everything you buy from us, sell to us or order online shows up here. Use <b>' + esc(me.email) + '</b> online, and give your name or member number in the shop.</p><a class="evb-btn evb-btn--primary" href="/store/">Shop the store</a></div>';
        return;
      }
      box.innerHTML = '<ul class="acct-list">' + list.slice(0, shown).map(row).join('') + '</ul>' +
        (list.length > shown ? '<button type="button" class="acct-more" id="acctMore">Show more</button>' : '');
      var more = document.getElementById('acctMore');
      if (more) more.addEventListener('click', function () { shown += PAGE; draw(); });
    }

    seg.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-filter]');
      if (!b || b.getAttribute('aria-selected') === 'true') return;
      seg.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      filter = b.dataset.filter;
      shown = PAGE;
      movePill();
      draw();
    });

    box.addEventListener('click', function (ev) {
      var head = ev.target.closest('.acct-row-head');
      if (!head) return;
      var li = head.parentNode;
      var open = li.classList.toggle('is-open');
      head.setAttribute('aria-expanded', String(open));
    });

    draw();
    requestAnimationFrame(movePill);
    window.addEventListener('resize', movePill);
  }

  function row(e, i) {
    var k = KIND[e.kind];
    var cancelled = e.kind === 'online' && e.status === 'cancelled';
    var amount, note;
    if (e.kind === 'sold') { amount = money(e.totalCents); note = 'Paid to you'; }
    else if (e.kind === 'trade') {
      amount = e.tradeCashDirection === 'even' ? 'Even' : money(e.totalCents);
      note = e.tradeCashDirection === 'we_pay' ? 'Paid to you' : e.tradeCashDirection === 'customer_pays' ? 'You paid' : 'Straight swap';
    } else { amount = money(e.totalCents); note = ''; }
    if (e.points > 0) note = '+' + num(e.points) + ' pts';

    var chip = e.kind === 'online'
      ? '<span class="acct-chip acct-chip--' + esc(e.status) + '">' + esc(ONLINE_STATUS[e.status] || e.status) + '</span>' : '';
    if (activeBuyback(e)) chip = '<span class="acct-chip acct-chip--hold">Buy-back open</span>';

    return '<li class="acct-row' + (cancelled ? ' is-muted' : '') + '" style="--d:' + Math.min(i * 40, 320) + 'ms">' +
      '<button type="button" class="acct-row-head" aria-expanded="false">' +
        rowThumb(e) +
        '<span class="acct-row-main">' +
          '<b>' + esc(itemsTitle(e)) + '</b>' +
          '<span>' + esc(date(e.occurredAt)) + ' · ' + esc(k.label) + chip + '</span>' +
        '</span>' +
        '<span class="acct-row-amt"><b' + (cancelled ? ' class="is-struck"' : '') + '>' + esc(amount) + '</b>' +
          (note ? '<span' + (e.points > 0 ? ' class="is-pts"' : '') + '>' + esc(note) + '</span>' : '') + '</span>' +
        '<span class="acct-row-chev" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="acct-row-body"><div class="acct-row-inner">' + detail(e) + '</div></div>' +
    '</li>';
  }

  function detail(e) {
    var out = '';

    if (e.kind === 'online') out += stepper(e);

    if (e.kind === 'trade') {
      var tin = e.items.filter(function (i) { return i.side === 'in'; });
      var tout = e.items.filter(function (i) { return i.side !== 'in'; });
      if (tin.length) out += '<p class="acct-d-label">You traded in</p>' + lines(tin);
      if (tout.length) out += '<p class="acct-d-label">You got</p>' + lines(tout);
    } else if (e.items && e.items.length) {
      out += '<p class="acct-d-label">' + (e.kind === 'sold' ? 'What you sold us' : 'What you bought') + '</p>' + lines(e.items);
    }

    var sums = [];
    if (e.kind === 'online') {
      sums.push(['Items', money(e.subtotalCents)]);
      if (e.discountCents) sums.push(['Discount', '−' + money(e.discountCents)]);
      sums.push([e.fulfillment === 'pickup' ? 'Pickup' : (e.shipService || 'Shipping'), e.shippingCents ? money(e.shippingCents) : 'Free']);
      sums.push(['Tax', money(e.taxCents)]);
      sums.push(['Total', money(e.totalCents), true]);
      if (e.refundedCents) sums.push(['Refunded', '−' + money(e.refundedCents)]);
    } else if (e.kind === 'store') {
      sums.push(['Subtotal', money(e.subtotalCents)]);
      if (e.taxCents) sums.push(['Tax', money(e.taxCents)]);
      sums.push(['Total', money(e.totalCents), true]);
    } else if (e.kind === 'sold') {
      sums.push(['We paid you', money(e.totalCents), true]);
    } else if (e.kind === 'trade') {
      sums.push(['Trade-in value', money(e.tradeInCents)]);
      sums.push([e.tradeCashDirection === 'we_pay' ? 'We paid you' : e.tradeCashDirection === 'customer_pays' ? 'You paid' : 'Difference',
        e.tradeCashDirection === 'even' ? 'Even' : money(e.totalCents), true]);
    }
    out += '<dl class="acct-sums">' + sums.map(function (s) {
      return '<div' + (s[2] ? ' class="is-total"' : '') + '><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>';
    }).join('') + '</dl>';

    if (e.buyback) {
      var b = e.buyback;
      var open = activeBuyback(e);
      out += '<p class="acct-d-note">' + (open
        ? 'You can buy this back for <b>' + money(b.priceCents) + '</b> until ' + esc(date(b.expiresAt)) + '. Call <a href="' + esc(biz.phoneHref) + '">' + esc(biz.phone) + '</a> or come in.'
        : b.status === 'completed' ? 'You bought this back.'
        : 'The buy-back offer on this ended ' + esc(date(b.expiresAt)) + '.') + '</p>';
    }

    var meta = [esc(e.reference)];
    if (e.points > 0) meta.push('Earned ' + num(e.points) + ' points');
    out += '<p class="acct-d-meta">' + meta.join(' · ') + '</p>';
    return out;
  }

  function lines(items) {
    return '<ul class="acct-lines">' + items.map(function (i) {
      var img = itemImg(i);
      return '<li><span class="acct-line-thumb' + (img ? '' : ' is-blank') + '">' + (img || ICON.box) + '</span>' +
        '<span class="acct-line-name">' + esc(i.name) + (i.quantity > 1 ? ' <small>×' + i.quantity + '</small>' : '') + '</span>' +
        '<span class="acct-line-amt">' + money(i.amountCents) + '</span></li>';
    }).join('') + '</ul>';
  }

  function stepper(e) {
    if (e.status === 'cancelled') return '<p class="acct-d-note">This order was cancelled.' + (e.refundedCents ? ' ' + money(e.refundedCents) + ' went back to your card.' : '') + '</p>';
    var pickup = e.fulfillment === 'pickup';
    var steps = pickup ? ['Ordered', 'Preparing', 'Ready', 'Picked up'] : ['Ordered', 'Preparing', 'Shipped', 'Delivered'];
    var at = {
      awaiting_details: 0, details_received: 0, preparing: 1,
      ready_for_pickup: 2, shipped: 2, picked_up: 3, delivered: 3
    }[e.status] || 0;
    var dates = [date(e.occurredAt), '', e.shippedAt ? date(e.shippedAt) : '', e.deliveredAt ? date(e.deliveredAt) : ''];
    var html = '<ol class="acct-steps-track" style="--at:' + at + '">' + steps.map(function (s, i) {
      return '<li class="' + (i <= at ? 'is-done' : '') + (i === at ? ' is-now' : '') + '"><span></span><b>' + s + '</b>' + (dates[i] && i <= at ? '<small>' + esc(dates[i]) + '</small>' : '') + '</li>';
    }).join('') + '</ol>';
    if (e.tracking && (e.tracking.number || e.tracking.url)) {
      html += '<div class="acct-track">' +
        '<span>' + esc(CARRIER[e.tracking.carrier] || 'Tracking') + (e.tracking.number ? ' · <code>' + esc(e.tracking.number) + '</code>' : '') + '</span>' +
        (e.tracking.url ? '<a href="' + esc(e.tracking.url) + '" target="_blank" rel="noopener">Track package</a>' : '') +
      '</div>';
    }
    return html;
  }

  /* Sections below the fold wait to rise in until they scroll into view,
     rather than playing on load where nobody sees them. onShow runs as each
     one appears (its numbers count up then). Nothing waits under reduced
     motion or without IntersectionObserver. */
  function revealOnScroll(root, onShow) {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        en.target.classList.remove('is-waiting');
        onShow(en.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    Array.prototype.forEach.call(root.querySelectorAll('.acct-rise'), function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.style.setProperty('--d', '0ms');
      el.classList.add('is-waiting');
      io.observe(el);
    });
  }

  /* Numbers ease up from zero the first time they show. */
  function countUp(els) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    Array.prototype.forEach.call(els, function (el) {
      var target = Number(el.dataset.count) || 0;
      var isMoney = el.hasAttribute('data-money');
      if (reduce || target === 0) return;
      var start = null, dur = 1100;
      function frame(t) {
        if (start === null) start = t;
        var p = Math.min((t - start) / dur, 1);
        var v = Math.round(target * (1 - Math.pow(1 - p, 3)));
        el.textContent = isMoney ? money(v) : num(v);
        if (p < 1) requestAnimationFrame(frame);
      }
      el.textContent = isMoney ? money(0) : '0';
      setTimeout(function () { requestAnimationFrame(frame); }, 200);
    });
  }

  function idLabel(status) {
    return status === 'verified' ? 'Verified' : status === 'submitted' ? 'Sent — we’re checking it'
      : status === 'rejected' ? 'Needs a new photo' : 'Not sent';
  }

  // A rejected ID gets a box at the top with a way to send a new one.
  function idNotice(me) {
    if (me.idStatus !== 'rejected') return '';
    return '<section class="acct-idnotice acct-rise">' +
      '<span class="acct-idnotice-icon" aria-hidden="true">' + ICON.idcard + '</span>' +
      '<div><b>We couldn\u2019t accept your ID</b><span>' + esc(me.idNote ? me.idNote + '. ' : '') + 'Please send a new photo so we can turn on your Rewards.</span></div>' +
      '<button type="button" class="acct-small-btn" data-resend-id>Send a new photo</button>' +
    '</section>';
  }

  function detailsView(me) {
    function dt(icon, label) { return '<dt><i aria-hidden="true">' + icon + '</i>' + label + '</dt>'; }
    return '<h2 class="acct-section-title"><span><i aria-hidden="true">' + ICON.user + '</i>Your details</span> <button type="button" class="acct-textbtn" id="acctEdit">Edit</button></h2>' +
      '<dl class="acct-dl">' +
        '<div>' + dt(ICON.user, 'Name') + '<dd>' + esc(me.fullName || '\u2014') + '</dd></div>' +
        '<div>' + dt(ICON.mail, 'Email') + '<dd>' + esc(me.email) + '</dd></div>' +
        '<div>' + dt(ICON.phone, 'Phone') + '<dd>' + esc(me.phone || '\u2014') + '</dd></div>' +
        '<div>' + dt(ICON.bell, 'New-arrival emails') + '<dd>' + (me.marketingOptIn ? 'On' : 'Off') + '</dd></div>' +
        (me.dateOfBirth ? '<div>' + dt(ICON.calendar, 'Date of birth') + '<dd>' + esc(date(me.dateOfBirth + 'T12:00:00')) + '</dd></div>' : '') +
        '<div>' + dt(ICON.shield, 'Photo ID') + '<dd>' + esc(idLabel(me.idStatus)) + '</dd></div>' +
        '<div>' + dt(ICON.calendar, 'Member since') + '<dd>' + esc(date(me.joinedAt)) + '</dd></div>' +
      '</dl>';
  }

  function bindDetails(me) {
    var box = document.getElementById('acctDetails');
    document.getElementById('acctEdit').addEventListener('click', function () {
      box.innerHTML =
        '<h2 class="acct-section-title">Edit your details</h2>' +
        '<form id="acctEditForm" novalidate>' +
          '<div class="acct-field"><label class="acct-label" for="acctName">Name</label>' +
            '<input class="acct-input" id="acctName" autocomplete="name" maxlength="120" value="' + esc(me.fullName || '') + '"' +
              (me.idStatus === 'verified' ? ' readonly aria-describedby="acctNameLock"' : '') + '>' +
            (me.idStatus === 'verified' ? '<p class="acct-field-note" id="acctNameLock">Matches your verified ID. Call us to change it.</p>' : '') +
          '</div>' +
          '<div class="acct-field"><label class="acct-label" for="acctPhone">Phone <small>(optional)</small></label>' +
            '<input class="acct-input" id="acctPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="32" value="' + esc(me.phone || '') + '"></div>' +
          '<label class="acct-check"><input type="checkbox" id="acctOptIn"' + (me.marketingOptIn ? ' checked' : '') + '> Email me first looks at new arrivals and members-only deals.</label>' +
          '<p class="acct-error" role="alert"></p>' +
          '<button class="evb-btn evb-btn--primary acct-btn" type="submit">Save</button>' +
          '<div class="acct-links"><button type="button" class="acct-link" id="acctCancel">Cancel</button></div>' +
        '</form>';
      document.getElementById('acctName').focus();
      document.getElementById('acctCancel').addEventListener('click', function () {
        box.innerHTML = detailsView(me);
        bindDetails(me);
      });
      bindProfileForm('acctEditForm', 'Save');
    });
  }

  /* ------------------------------------------------------------ sign-up steps */

  // After the emailed code, a new member goes through: profile photo
  // (optional), name, date of birth, a photo of their ID, done. Each step
  // saves on its own (panel migration 0073), so leaving halfway resumes at
  // the first step still missing. On phones it's full screen.
  //
  // Photos are shrunk and re-encoded as JPEG in the browser before upload:
  // smaller files, and the phone's location data doesn't go with them.

  var OB_STEPS = ['photo', 'name', 'birth', 'id', 'done'];
  var OB_SKIP_PHOTO = 'evb_ob_skip_photo';

  function obFirstStep(me) {
    if (!me.avatarPath && !ss(OB_SKIP_PHOTO) && !me.fullName) return 'photo';
    if (!me.fullName) return 'name';
    if (!me.dateOfBirth) return 'birth';
    if (!me.idStatus || me.idStatus === 'none') return 'id';
    return 'done';
  }

  function ageFrom(iso) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return null;
    var now = new Date();
    var a = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
    return a;
  }

  function isoDaysAgo(years) {
    var d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
  }

  // A photo from the camera or library → a JPEG no bigger than maxSide.
  function prepareImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || 'image/')) return reject(new Error('That file isn’t a photo.'));
      if (file.size > 30 * 1024 * 1024) return reject(new Error('That photo is too big. Try another.'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('Couldn’t read that photo. Try another.'));
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Couldn’t read that photo. Try another.')); };
      img.src = url;
    });
  }

  function randomName() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // Upload to '<user id>/<random>.jpg' in a private bucket; resolves the path.
  function uploadPhoto(bucket, blob) {
    return sb.auth.getSession().then(function (res) {
      var user = res.data && res.data.session && res.data.session.user;
      if (!user) throw new Error('Your sign-in expired. Please sign in again.');
      var path = user.id + '/' + randomName() + '.jpg';
      return sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false }).then(function (r) {
        if (r.error) throw r.error;
        return path;
      });
    });
  }

  function rpc(name, args) {
    return sb.rpc(name, args).then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  function startOnboarding(me, opts) {
    opts = opts || {};
    var state = { me: me, step: opts.step || obFirstStep(me), dir: 'next', only: !!opts.only, optIn: !!me.marketingOptIn };
    document.documentElement.classList.add('acct-ob-open');
    obRender(state);
  }

  function endOnboarding() {
    document.documentElement.classList.remove('acct-ob-open');
  }

  function obRender(state) {
    var step = state.step;
    var steps = OB_STEPS.slice(0, 4);
    var at = steps.indexOf(step);
    var me = state.me;
    var body = '';

    if (step === 'photo') {
      body =
        '<p class="acct-ob-eyebrow">Your profile</p>' +
        '<h1 class="acct-ob-title">Add a profile photo</h1>' +
        '<p class="acct-ob-sub">So we know it’s you when you come in. You can skip this.</p>' +
        '<div class="acct-ob-avatar" id="obAvatar">' + ICON.user + '</div>' +
        '<div class="acct-ob-pickers">' +
          '<label class="acct-ob-pick">' + ICON.camera + '<span>Take a selfie</span><input type="file" accept="image/*" capture="user" data-pick></label>' +
          '<label class="acct-ob-pick">' + ICON.image + '<span>Choose a photo</span><input type="file" accept="image/*" data-pick></label>' +
        '</div>';
    } else if (step === 'name') {
      body =
        '<p class="acct-ob-eyebrow">About you</p>' +
        '<h1 class="acct-ob-title">What’s your name?</h1>' +
        '<p class="acct-ob-sub">The name on your ID, so we can match it at the counter.</p>' +
        '<label class="acct-label" for="obName">Full name</label>' +
        '<input class="acct-input acct-ob-input" id="obName" autocomplete="name" autocapitalize="words" maxlength="120" placeholder="First and last name" value="' + esc(me.fullName || '') + '">';
    } else if (step === 'birth') {
      body =
        '<p class="acct-ob-eyebrow">About you</p>' +
        '<h1 class="acct-ob-title">When’s your birthday?</h1>' +
        '<p class="acct-ob-sub">We use it to match your ID.</p>' +
        '<label class="acct-label" for="obBirth">Date of birth</label>' +
        '<input class="acct-input acct-ob-input" id="obBirth" type="date" autocomplete="bday" min="' + isoDaysAgo(120) + '" max="' + isoDaysAgo(13) + '" value="' + esc(me.dateOfBirth || '') + '">' +
        '<p class="acct-ob-age" id="obAge" aria-live="polite"></p>';
    } else if (step === 'id') {
      body =
        '<p class="acct-ob-eyebrow">Verify it’s you</p>' +
        '<h1 class="acct-ob-title">Take a photo of your ID</h1>' +
        '<p class="acct-ob-sub">Driver\u2019s license, state ID or passport. Once it\u2019s on file, you won\u2019t need to bring it when you sell to us.</p>' +
        '<div class="acct-ob-match">' +
          '<span>The name on your ID has to match</span>' +
          '<b>' + esc(me.fullName || '') + '</b>' +
          '<button type="button" class="acct-link" id="obFixName">Not the name on your ID? Change it</button>' +
        '</div>' +
        '<div class="acct-ob-idframe" id="obIdFrame">' +
          '<span class="acct-ob-corner acct-ob-corner--tl"></span><span class="acct-ob-corner acct-ob-corner--tr"></span>' +
          '<span class="acct-ob-corner acct-ob-corner--bl"></span><span class="acct-ob-corner acct-ob-corner--br"></span>' +
          '<span class="acct-ob-idhint">' + ICON.idcard + '<b>Fit the whole ID in the frame</b></span>' +
        '</div>' +
        '<ul class="acct-ob-tips"><li>All four corners showing</li><li>No glare, nothing covering it</li><li>Name and photo easy to read</li></ul>' +
        '<div class="acct-ob-pickers">' +
          '<label class="acct-ob-pick acct-ob-pick--main">' + ICON.camera + '<span>Take a photo</span><input type="file" accept="image/*" capture="environment" data-pick></label>' +
          '<label class="acct-ob-pick">' + ICON.image + '<span>Upload a photo</span><input type="file" accept="image/*" data-pick></label>' +
        '</div>' +
        '<p class="acct-ob-private">' + ICON.key + 'Kept private. Only East Village Buyers managers can see it, and it’s only used to confirm who you are.</p>';
    } else {
      body =
        '<div class="acct-ob-done">' +
          '<span class="acct-ob-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></span>' +
          '<h1 class="acct-ob-title">You’re all set' + (me.fullName ? ', ' + esc(firstName(me.fullName)) : '') + '</h1>' +
          '<p class="acct-ob-sub">We’ll check your ID and let you know when your Rewards are on.</p>' +
          '<label class="acct-check"><input type="checkbox" id="obOptIn"' + (state.optIn ? ' checked' : '') + '> Email me first looks at new arrivals and members-only deals.</label>' +
        '</div>';
    }

    var primary = step === 'photo' ? 'Continue' : step === 'id' ? 'Send my ID' : step === 'done' ? 'Go to my account' : 'Continue';
    var canBack = !state.only && at > 0 && step !== 'done';

    render(
      '<div class="acct-ob" role="dialog" aria-modal="true" aria-label="Set up your account">' +
        '<div class="acct-ob-top">' +
          (canBack ? '<button type="button" class="acct-ob-back" id="obBack" aria-label="Back">' + ICON.back + '</button>'
            : state.only ? '<button type="button" class="acct-ob-back" id="obClose" aria-label="Close">' + ICON.close + '</button>'
            : '<span class="acct-ob-back-space"></span>') +
          (step !== 'done' && !state.only
            ? '<div class="acct-ob-progress" aria-label="Step ' + (at + 1) + ' of 4">' + steps.map(function (s, i) {
                return '<span class="' + (i < at ? 'is-done' : i === at ? 'is-now' : '') + '"></span>';
              }).join('') + '</div><span class="acct-ob-count">' + (at + 1) + '/4</span>'
            : '<span></span><span></span>') +
        '</div>' +
        '<form class="acct-ob-body acct-ob-in-' + state.dir + '" id="obForm" novalidate>' +
          body +
          '<p class="acct-error" id="obErr" role="alert"></p>' +
          '<div class="acct-ob-actions">' +
            '<button class="evb-btn evb-btn--primary acct-btn acct-btn--go" type="submit" id="obNext">' + primary + '</button>' +
            (step === 'photo' ? '<button type="button" class="acct-link acct-ob-skip" id="obSkip">Skip for now</button>' : '') +
          '</div>' +
        '</form>' +
      '</div>'
    );

    var form = document.getElementById('obForm');
    var err = document.getElementById('obErr');
    var next = document.getElementById('obNext');
    var picked = null;

    function go(step, dir) { state.step = step; state.dir = dir || 'next'; obRender(state); }
    function after() {
      if (state.only) { endOnboarding(); return loadMe(); }
      go(OB_STEPS[OB_STEPS.indexOf(state.step) + 1]);
    }
    function fail(e) {
      setBusy(next, false, primary);
      err.textContent = /Enter your|real date|didn.t upload|ID\.|too big|isn.t a photo|read that photo|expired|can.t be changed/i.test((e && e.message) || '')
        ? e.message : friendly(e);
    }

    var back = document.getElementById('obBack');
    if (back) back.addEventListener('click', function () { go(OB_STEPS[at - 1], 'back'); });
    var close = document.getElementById('obClose');
    if (close) close.addEventListener('click', function () {
      endOnboarding();
      if (!sb) return renderLocked(me, { preview: true });
      loadMe();
    });

    // Photo pickers: preview straight away, upload on Continue.
    Array.prototype.forEach.call(form.querySelectorAll('[data-pick]'), function (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        err.textContent = '';
        var max = step === 'photo' ? 640 : 2000;
        prepareImage(file, max, step === 'photo' ? 0.85 : 0.9).then(function (blob) {
          picked = blob;
          var url = URL.createObjectURL(blob);
          if (step === 'photo') {
            var box = document.getElementById('obAvatar');
            box.innerHTML = '<img src="' + url + '" alt="Your profile photo">';
            box.classList.add('is-set');
          } else {
            var frame = document.getElementById('obIdFrame');
            frame.classList.add('is-set');
            frame.querySelector('.acct-ob-idhint').outerHTML = '<img class="acct-ob-idimg" src="' + url + '" alt="Your ID">';
            form.querySelector('.acct-ob-pick--main span').textContent = 'Retake';
          }
        }, function (e) { err.textContent = e.message; });
      });
    });

    if (step === 'birth') {
      var birth = document.getElementById('obBirth');
      var ageOut = document.getElementById('obAge');
      var showAge = function () {
        var a = birth.value ? ageFrom(birth.value) : null;
        ageOut.textContent = a !== null && a >= 0 && a < 130 ? 'You’re ' + a + '.' : '';
      };
      birth.addEventListener('input', showAge);
      showAge();
    }

    // From the ID step: fix the name, then come back through the steps.
    var fixName = document.getElementById('obFixName');
    if (fixName) fixName.addEventListener('click', function () { state.only = false; go('name', 'back'); });

    var skip = document.getElementById('obSkip');
    if (skip) skip.addEventListener('click', function () { ss(OB_SKIP_PHOTO, '1'); go('name'); });

    var focusEl = form.querySelector('.acct-ob-input');
    if (focusEl && window.matchMedia('(min-width: 700px)').matches) focusEl.focus();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';

      if (step === 'photo') {
        if (!picked) { if (me.avatarPath) return after(); err.textContent = 'Take or choose a photo, or skip for now.'; return; }
        if (!sb) return after();
        setBusy(next, true, 'Uploading…');
        return uploadPhoto('member-avatars', picked)
          .then(function (path) { return rpc('member_set_avatar', { p_path: path }).then(function () { me.avatarPath = path; }); })
          .then(after, fail);
      }
      if (step === 'name') {
        var name = document.getElementById('obName').value.trim();
        if (!/\S+\s+\S+/.test(name)) { err.textContent = 'Enter your first and last name.'; return; }
        if (!sb) { me.fullName = name; return after(); }
        setBusy(next, true, 'Saving…');
        return rpc('member_set_name', { p_full_name: name }).catch(function (e) {
          // Before panel migration 0073 there's no member_set_name: save the
          // name the older way, keeping their phone and email choice.
          if (!/Could not find the function|does not exist/i.test((e && e.message) || '')) throw e;
          return rpc('member_update_profile', { p_full_name: name, p_phone: me.phone || null, p_marketing_opt_in: !!me.marketingOptIn });
        }).then(function () { me.fullName = name; after(); }, fail);
      }
      if (step === 'birth') {
        var v = document.getElementById('obBirth').value;
        var a = v ? ageFrom(v) : null;
        if (a === null || a < 13 || a > 120) { err.textContent = 'Enter your real date of birth.'; return; }
        if (!sb) { me.dateOfBirth = v; return after(); }
        setBusy(next, true, 'Saving…');
        return rpc('member_set_birth_date', { p_date_of_birth: v }).then(function () { me.dateOfBirth = v; after(); }, fail);
      }
      if (step === 'id') {
        if (!picked) { err.textContent = 'Take or upload a photo of your ID first.'; return; }
        if (!sb) { me.idStatus = 'submitted'; return after(); }
        setBusy(next, true, 'Sending…');
        return uploadPhoto('member-ids', picked)
          .then(function (path) { return rpc('member_submit_id', { p_path: path }); })
          .then(function () { me.idStatus = 'submitted'; push('account_id_sent', {}); after(); }, fail);
      }
      // done
      var optIn = document.getElementById('obOptIn').checked;
      if (!sb) { endOnboarding(); me.onboarded = true; return closed() ? renderLocked(me, { preview: true }) : renderDash(me, { preview: true }); }
      setBusy(next, true, 'One moment…');
      rpc('member_finish_onboarding', { p_marketing_opt_in: optIn }).then(function () {
        ss(OB_SKIP_PHOTO, null);
        push('account_onboarded', {});
        endOnboarding();
        loadMe();
      }, fail);
    });
  }

  // The member's photo in the dashboard header, through a short-lived link
  // (the bucket is private).
  function fillAvatar(me) {
    var box = host.querySelector('[data-avatar]');
    if (!box || !me.avatarPath || !sb) return;
    sb.storage.from('member-avatars').createSignedUrl(me.avatarPath, 3600).then(function (r) {
      if (r.data && r.data.signedUrl) box.innerHTML = '<img src="' + esc(r.data.signedUrl) + '" alt="">';
    });
  }

  /* ------------------------------------------------------------ locked */

  // An account made before EVB Rewards opens to them (panel migration 0072):
  // member_me sends back only their profile, so this is all there is to show
  // — who they are, that they're in, what's coming, and their details.
  function renderLocked(me, opts) {
    opts = opts || {};
    render(
      '<div class="acct-dash">' +
        (opts.preview ? '<span class="acct-preview-tag acct-rise">Preview · sample data</span>' : '') +

        '<header class="acct-dash-head acct-rise">' +
          '<div>' +
            '<p class="acct-dash-kicker">EVB Rewards · Member ' + esc(me.memberNumber) + '</p>' +
            '<h1 class="acct-hi"><span class="acct-hi-avatar" data-avatar aria-hidden="true">' + esc((firstName(me.fullName) || '?').charAt(0)) + '</span>' +
              '<span>Hi, <em class="acct-hi-name">' + esc(firstName(me.fullName) || 'there') +
                '<svg class="acct-squiggle" viewBox="0 0 220 16" preserveAspectRatio="none" aria-hidden="true"><path d="M3 11 C 45 3, 85 15, 125 8 S 190 3, 217 9"/></svg>' +
              '</em></span></h1>' +
          '</div>' +
          '<button type="button" class="acct-textbtn" id="acctSignOut">Sign out</button>' +
        '</header>' +

        idNotice(me) +
        '<section class="acct-locked acct-rise" style="--d:60ms">' +
          '<span class="acct-locked-icon" aria-hidden="true">' + ICON.clock + '</span>' +
          '<div>' +
            '<h2 class="acct-locked-title">You’re in. Rewards opens soon.</h2>' +
            '<p class="acct-locked-text">Your account is all set. Points, your full history with us and your rewards switch on soon — we’ll email <b>' + esc(me.email) + '</b> the moment they do.</p>' +
          '</div>' +
        '</section>' +

        '<section class="acct-section acct-rise" style="--d:120ms">' +
          '<h2 class="acct-section-title"><i aria-hidden="true">' + ICON.sparkle + '</i>What’s coming</h2>' +
          '<ol class="acct-steps">' +
            '<li><span class="acct-step-icon">' + ICON.star + '</span><b>Points</b><span>1 point for every $1 you spend with us, online or in the shop.</span></li>' +
            '<li><span class="acct-step-icon">' + ICON.truck + '</span><b>Free shipping</b><span>' + FREE_SHIP + ' points ships an online order free.</span></li>' +
            '<li><span class="acct-step-icon">' + ICON.clock + '</span><b>Your history</b><span>Everything you’ve bought, sold us and ordered online, in one place.</span></li>' +
          '</ol>' +
        '</section>' +

        '<section class="acct-section acct-rise" style="--d:180ms" id="acctDetails">' + detailsView(me) + '</section>' +

        '<p class="acct-foot-note">Questions? Call <a href="' + esc(biz.phoneHref) + '">' + esc(biz.phone) + '</a> or email <a href="mailto:' + esc(biz.email) + '">' + esc(biz.email) + '</a>.</p>' +
      '</div>'
    );

    document.getElementById('acctSignOut').addEventListener('click', function () {
      if (!sb) return renderEmail();
      sb.auth.signOut().then(function () { forgetMember(); renderEmail(); }, function () { forgetMember(); renderEmail(); });
    });
    bindIdNotice(me);
    fillAvatar(me);
    bindDetails(me);
  }

  function bindIdNotice(me) {
    var b = host.querySelector('[data-resend-id]');
    if (b) b.addEventListener('click', function () { startOnboarding(me, { step: 'id', only: true }); });
  }

  /* ------------------------------------------------------------ data */

  function renderLoading() {
    render('<div class="evb-skel acct-skel" aria-label="Loading your account"></div>');
  }

  function renderProblem(text) {
    render(
      '<div class="acct-hero" style="grid-template-columns:1fr;max-width:520px">' +
        '<div class="acct-card acct-fade">' +
          '<h2 class="acct-card-title">We couldn’t load your account</h2>' +
          '<p class="acct-card-sub">' + esc(text) + '</p>' +
          '<button class="evb-btn evb-btn--primary acct-btn" id="acctRetry" type="button">Try again</button>' +
          '<div class="acct-links"><button type="button" class="acct-link" id="acctOut">Sign out</button></div>' +
        '</div>' +
      '</div>'
    );
    document.getElementById('acctRetry').addEventListener('click', function () { if (sb) loadMe(); else location.reload(); });
    document.getElementById('acctOut').addEventListener('click', function () {
      if (!sb) return location.reload();
      sb.auth.signOut().then(function () { forgetMember(); renderEmail(); }, function () { forgetMember(); renderEmail(); });
    });
  }

  // The store bar's Sign in shows the member's initial (site-nav.js).
  function rememberMember(me) {
    var name = String((me && (me.fullName || me.email)) || '').trim();
    try { localStorage.setItem('evb_member_initial', name ? name.charAt(0).toUpperCase() : ''); } catch (e) {}
    if (window.evbRefreshAccountButton) window.evbRefreshAccountButton();
  }
  function forgetMember() {
    try { localStorage.removeItem('evb_member_initial'); } catch (e) {}
    if (window.evbRefreshAccountButton) window.evbRefreshAccountButton();
  }

  function loadMe() {
    renderLoading();
    sb.rpc('member_me').then(function (res) {
      if (res.error) {
        var m = res.error.message || '';
        if (/JWT|not signed in|Confirm your email/i.test(m) || res.error.code === '28000' || res.status === 401) {
          sb.auth.signOut().then(function () { forgetMember(); renderEmail(); }, function () { forgetMember(); renderEmail(); });
          return;
        }
        if (/Could not find the function|does not exist/i.test(m)) {
          return renderProblem('Accounts are still being set up. Please check back soon.');
        }
        return renderProblem(friendly(res.error));
      }
      var me = res.data;
      rememberMember(me);
      // onboarded is false only once panel migration 0073 is live; before that
      // it's missing and the sign-up steps have nothing to save to.
      if (me.onboarded === false) startOnboarding(me);
      else if (!me.fullName) startOnboarding(me, { step: 'name', only: true });
      else if (me.locked) renderLocked(me);
      else renderDash(me);
    }, function (e) { renderProblem(friendly(e)); });
  }

  /* ------------------------------------------------------------ preview */

  function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }

  var SAMPLE = {
    memberNumber: 'M1024', email: 'pat@example.com', fullName: 'Pat Rivera', phone: '917-555-0100',
    marketingOptIn: true, joinedAt: '2026-06-02T15:00:00Z',
    dateOfBirth: '1994-05-17', idStatus: 'submitted', onboarded: true, avatarPath: null,
    balance: 410, lifetimePoints: 1765, lifetimeSpendCents: 176580, purchaseCount: 4,
    rules: { pointsPerDollar: 1, rewardPoints: 250, rewardCents: 1500, lookbackDays: 30, freeShippingPoints: 250, freeExpressPoints: 600 },
    purchases: [], activity: [],
    history: [
      { kind: 'online', reference: 'EVB-261019-7QX2', occurredAt: daysAgo(3), status: 'shipped', fulfillment: 'ship', shipService: 'Express shipping',
        items: [{ name: 'Air Jordan 1 High “Chicago”', quantity: 1, amountCents: 45000, imageUrl: '' }],
        subtotalCents: 45000, shippingCents: 3500, taxCents: 3994, discountCents: 0, refundedCents: 0, totalCents: 52494,
        tracking: { carrier: 'ups', number: '1Z999AA10123456784', url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784' },
        shippedAt: daysAgo(1), deliveredAt: null, points: 450 },
      { kind: 'sold', reference: '#T4930', occurredAt: daysAgo(9),
        items: [{ name: 'Rolex Datejust 36', quantity: 1, amountCents: 520000, category: 'watch', side: 'in' }],
        subtotalCents: 0, taxCents: 0, totalCents: 520000,
        buyback: { priceCents: 580000, expiresAt: daysAgo(-6), status: 'offered' }, points: 0 },
      { kind: 'store', reference: '#T4911', occurredAt: daysAgo(24),
        items: [{ name: '14k Cuban link chain, 22 in', quantity: 1, amountCents: 98000, side: 'out' }],
        subtotalCents: 98000, taxCents: 8698, totalCents: 106698, points: 980 },
      { kind: 'trade', reference: '#T4875', occurredAt: daysAgo(41),
        items: [
          { name: 'Supreme box logo hoodie', quantity: 1, amountCents: 30000, side: 'in' },
          { name: 'Chrome Hearts cross tee', quantity: 1, amountCents: 45000, side: 'out' }
        ],
        tradeInCents: 30000, tradeCashDirection: 'customer_pays', subtotalCents: 15000, taxCents: 0, totalCents: 15000, points: 150 },
      { kind: 'online', reference: 'EVB-260819-K2MB', occurredAt: daysAgo(63), status: 'delivered', fulfillment: 'ship', shipService: 'Standard shipping',
        items: [{ name: 'Bape Milo plush', quantity: 1, amountCents: 8500 }, { name: 'Sterling silver ring', quantity: 1, amountCents: 10000 }],
        subtotalCents: 18500, shippingCents: 1500, taxCents: 1642, discountCents: 1850, refundedCents: 0, totalCents: 19792,
        tracking: { carrier: 'usps', number: '9400111899223344556677', url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223344556677' },
        shippedAt: daysAgo(61), deliveredAt: daysAgo(58), points: 0 },
      { kind: 'sold', reference: '#T4790', occurredAt: daysAgo(140),
        items: [{ name: 'Gold rope chain, 14k, 18.2 g', quantity: 1, amountCents: 61000 }, { name: 'Broken 10k ring', quantity: 2, amountCents: 18000 }],
        subtotalCents: 0, taxCents: 0, totalCents: 79000, points: 0 }
    ]
  };

  function previewAfterCode() {
    var me = JSON.parse(JSON.stringify(SAMPLE));
    me.fullName = ''; me.avatarPath = null; me.dateOfBirth = null; me.idStatus = 'none'; me.onboarded = false;
    startOnboarding(me);
  }
  function previewAfterProfile(name) {
    var me = JSON.parse(JSON.stringify(SAMPLE));
    if (closed()) { me.fullName = name; return renderLocked(me, { preview: true }); }
    me.fullName = name; me.balance = 0; me.history = [];
    renderDash(me, { preview: true });
  }

  function startPreview(mode) {
    if (mode === 'code') return renderCode('pat@example.com');
    if (mode === 'welcome') return previewAfterCode();
    if (mode === 'empty') return previewAfterProfile('Pat Rivera');
    if (mode === 'signin') return renderEmail();
    if (mode === 'requested') return renderRequested('pat@example.com');
    if (mode === 'locked') return renderLocked(SAMPLE, { preview: true });
    if (mode === 'signup') return previewAfterCode();
    if (mode === 'rejected') { var r = JSON.parse(JSON.stringify(SAMPLE)); r.idStatus = 'rejected'; r.idNote = 'The name doesn’t match your account'; return renderLocked(r, { preview: true }); }
    renderDash(SAMPLE, { preview: true });
  }

  /* ------------------------------------------------------------ start */

  var preview = /[?&]preview(=([a-z]+))?/.exec(location.search);
  if (preview) return startPreview(preview[2] || 'dash');

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    return renderProblem('Accounts are temporarily unavailable. Please try again in a few minutes.');
  }

  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'evb-account' }
  });

  // A sign-in link that failed comes back as #error=…&error_description=…
  var linkError = /[#&]error_description=([^&]+)/.exec(location.hash);
  if (linkError) history.replaceState(null, '', location.pathname + location.search);

  sb.auth.getSession().then(function (res) {
    if (res.data && res.data.session) {
      ss(PENDING_KEY, null);
      if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      return loadMe();
    }
    if (linkError) {
      ss(PENDING_KEY, null);
      return renderEmail('', 'That sign-in link has expired or was already used. Enter your email for a new code.');
    }
    var pending = parsePending();
    if (pending) return renderCode(pending.email);
    var handoff = ss(HANDOFF_KEY);
    ss(HANDOFF_KEY, null);
    renderEmail(handoff && validEmail(handoff) ? handoff : '');
  }, function () { renderEmail(); });
})();
