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
  var HANDOFF_KEY = 'evb_acct_email';
  var RESEND_SECONDS = 60;

  var cfg = window.EVB_ACCOUNT_CONFIG || {};
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
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9h18"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
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
    if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Accounts are opening very soon. Check back shortly!';
    if (/rate limit|only request this after|too many/i.test(m)) {
      var s = /after (\d+) seconds?/.exec(m);
      return s ? 'Please wait ' + s[1] + ' seconds, then try again.' : 'Too many tries. Please wait a minute and try again.';
    }
    if (/expired|invalid|otp/i.test(m)) return 'That code didn’t work. Check the newest email from us, or send a new code.';
    if (/fetch|network|load failed/i.test(m)) return 'We couldn’t reach our server. Check your connection and try again.';
    if (/Enter your name|phone number/i.test(m)) return m;
    return 'Something went wrong. Please try again, or call us at ' + biz.phone + '.';
  }

  /* ------------------------------------------------------------ signed out */

  function heroIntro() {
    return '' +
      '<div class="acct-intro acct-fade">' +
        '<p class="evb-eyebrow">EVB Rewards</p>' +
        '<h1 class="acct-title">Shop with us. <em>Get rewarded.</em></h1>' +
        '<p class="acct-lede">Earn <strong>1 point for every $1</strong> you spend — online or in the shop on Avenue A. Every <strong>500 points is $25 off.</strong></p>' +
        '<ul class="acct-perks">' +
          perk(ICON.star, 'Points on every purchase', 'Online orders and counter sales, added to your account by themselves.') +
          perk(ICON.gift, '$25 off for every 500 points', 'Use them in the shop, or call us to put them toward an online order.') +
          perk(ICON.key, 'No password to remember', 'We email you a 6-digit code each time you sign in.') +
        '</ul>' +
      '</div>';
  }
  function perk(icon, title, text) {
    return '<li class="acct-perk"><span class="acct-perk-icon">' + icon + '</span><div><b>' + title + '</b><span>' + text + '</span></div></li>';
  }

  function renderEmail(prefill, error) {
    stopResendTimer();
    render(
      '<div class="acct-hero">' + heroIntro() +
        '<div class="acct-card acct-fade" style="animation-delay:.08s">' +
          '<h2 class="acct-card-title">Sign in or join free</h2>' +
          '<p class="acct-card-sub">Enter your email. We’ll send you a code — new here? That’s all it takes to make your account.</p>' +
          '<form id="acctEmailForm" novalidate>' +
            '<label class="acct-label" for="acctEmail">Email address</label>' +
            '<input class="acct-input" id="acctEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required autofocus value="' + esc(prefill || '') + '">' +
            '<p class="acct-error" id="acctErr" role="alert">' + esc(error || '') + '</p>' +
            '<button class="evb-btn evb-btn--primary acct-btn" type="submit">Email me a code</button>' +
          '</form>' +
          '<p class="acct-fine">Use the email you shop with — orders from the last 30 days count too. By joining you agree to our <a href="/cookie-policy/">privacy &amp; cookie policy</a>.</p>' +
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

  function sendCode(email, btn, errEl) {
    if (!sb) return renderCode(email);
    setBusy(btn, true, 'Sending…');
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } }).then(function (res) {
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

  function renderCode(email, error) {
    var boxes = '';
    for (var i = 0; i < 6; i++) boxes += '<span class="acct-code-box" aria-hidden="true"></span>';
    render(
      '<div class="acct-hero">' + heroIntro() +
        '<div class="acct-card acct-fade">' +
          '<h2 class="acct-card-title">Check your email</h2>' +
          '<p class="acct-card-sub">We sent a 6-digit code to <b>' + esc(email) + '</b>. It can take a minute — check spam too.</p>' +
          '<form id="acctCodeForm" novalidate>' +
            '<label class="acct-label" for="acctCode">Your code</label>' +
            '<div class="acct-code" id="acctCodeWrap">' + boxes +
              '<input class="acct-code-input" id="acctCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" aria-describedby="acctErr" autofocus>' +
            '</div>' +
            '<p class="acct-error" id="acctErr" role="alert">' + esc(error || '') + '</p>' +
            '<button class="evb-btn evb-btn--primary acct-btn" type="submit">Sign in</button>' +
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
      if (code.length !== 6) { err.textContent = 'Enter all 6 digits.'; input.focus(); return; }
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
      sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } }).then(function (res) {
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

  /* ------------------------------------------------------------ welcome */

  function renderWelcome(me, error) {
    render(
      '<div class="acct-hero">' + heroIntro() +
        '<div class="acct-card acct-fade">' +
          '<div class="acct-welcome-badge">' + ICON.star + '</div>' +
          '<h2 class="acct-card-title">You’re in! One last thing.</h2>' +
          '<p class="acct-card-sub">What should we call you? This is the name we’ll look for at the counter.</p>' +
          '<form id="acctWelcome" novalidate>' +
            '<div class="acct-field">' +
              '<label class="acct-label" for="acctName">Your name</label>' +
              '<input class="acct-input" id="acctName" autocomplete="name" maxlength="120" required autofocus value="' + esc(me.fullName || '') + '">' +
            '</div>' +
            '<div class="acct-field">' +
              '<label class="acct-label" for="acctPhone">Phone <small>(optional)</small></label>' +
              '<input class="acct-input" id="acctPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="32" placeholder="917-555-0100" value="' + esc(me.phone || '') + '">' +
            '</div>' +
            '<label class="acct-check"><input type="checkbox" id="acctOptIn"' + (me.marketingOptIn ? ' checked' : '') + '> Email me first looks at new arrivals and members-only deals.</label>' +
            '<p class="acct-error" id="acctErr" role="alert">' + esc(error || '') + '</p>' +
            '<button class="evb-btn evb-btn--primary acct-btn" type="submit">See my rewards</button>' +
          '</form>' +
        '</div>' +
      '</div>'
    );
    bindProfileForm('acctWelcome', 'See my rewards', function () { push('account_profile_done', {}); });
  }

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

  function renderDash(me, opts) {
    opts = opts || {};
    var rules = me.rules || { pointsPerDollar: 1, rewardPoints: 500, rewardCents: 2500 };
    var bal = Math.max(Number(me.balance) || 0, 0);
    var ready = Math.floor(bal / rules.rewardPoints);
    var into = bal % rules.rewardPoints;
    var toGo = rules.rewardPoints - into;
    var pct = Math.round((into / rules.rewardPoints) * 100);
    var name = me.fullName || me.email;

    var activity = (me.purchases || []).map(function (p) {
      var title = p.label + (p.itemCount > 1 ? ' + ' + (p.itemCount - 1) + ' more' : '');
      return {
        at: p.occurredAt,
        html: item(p.source === 'online' ? ICON.bag : ICON.store, '',
          title,
          (p.source === 'online' ? 'Online order' : 'In the shop') + ' · ' + date(p.occurredAt) + ' · ' + money(p.spendCents),
          p.points)
      };
    }).concat((me.activity || []).map(function (a) {
      return {
        at: a.createdAt,
        html: a.kind === 'redeem'
          ? item(ICON.gift, 'is-gift', 'Used for ' + money(a.creditCents) + ' off', date(a.createdAt), a.points)
          : item(ICON.star, 'is-gift', a.points > 0 ? 'Bonus points' : 'Points adjusted', date(a.createdAt), a.points)
      };
    })).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    render(
      '<div class="acct-dash acct-fade">' +
        (opts.preview ? '<span class="acct-preview-tag">Preview · sample data</span>' : '') +
        '<div class="acct-dash-head">' +
          '<div>' +
            '<h1 class="acct-hi">Hi, ' + esc(firstName(me.fullName) || 'there') + '</h1>' +
            '<p class="acct-hi-sub">' + (ready
              ? 'You have <b>' + money(ready * rules.rewardCents) + '</b> in rewards ready to use.'
              : num(toGo) + ' points to go until your next ' + money(rules.rewardCents) + ' off.') + '</p>' +
          '</div>' +
          '<button type="button" class="acct-small-btn acct-signout" id="acctSignOut">Sign out</button>' +
        '</div>' +

        '<div class="acct-grid">' +
          '<div class="acct-col">' +
            '<div class="acct-mcard" role="group" aria-label="Your member card">' +
              '<div class="acct-mcard-top">' +
                '<div class="acct-mcard-brand">East Village Buyers<b>Rewards Member</b></div>' +
                '<img class="acct-mcard-logo" src="/evblogo.webp" alt="" width="44" height="44">' +
              '</div>' +
              '<div class="acct-mcard-pts"><strong>' + num(bal) + '</strong><span>points</span></div>' +
              '<div class="acct-mcard-foot">' +
                '<div class="acct-mcard-name">' + esc(name) + '</div>' +
                '<div class="acct-mcard-num"><small>MEMBER</small>' + esc(me.memberNumber) + '</div>' +
              '</div>' +
            '</div>' +
            '<p class="acct-mcard-hint">At the counter, give us your name or member number.</p>' +

            '<section class="acct-panel">' +
              '<div class="acct-progress-top"><b>Next reward</b><span>' + num(into) + ' / ' + num(rules.rewardPoints) + '</span></div>' +
              '<div class="acct-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + rules.rewardPoints + '" aria-valuenow="' + into + '" aria-label="Points toward your next reward"><i data-pct="' + pct + '"></i></div>' +
              '<p class="acct-progress-note">' + num(toGo) + ' more points — about ' + money(toGo * 100 / rules.pointsPerDollar) + ' of shopping — and you get ' + money(rules.rewardCents) + ' off.</p>' +
              (ready ? '<div class="acct-ready"><span class="acct-ready-amt">' + money(ready * rules.rewardCents) + '</span><p><b>Ready to use.</b> Ask at the counter, or call <a href="' + esc(biz.phoneHref) + '">' + esc(biz.phone) + '</a> to put it toward an online order.</p></div>' : '') +
            '</section>' +

            '<div class="acct-stats">' +
              '<div class="acct-stat"><b>' + num(me.lifetimePoints) + '</b><span>points earned</span></div>' +
              '<div class="acct-stat"><b>' + num(me.purchaseCount) + '</b><span>' + (me.purchaseCount === 1 ? 'purchase' : 'purchases') + '</span></div>' +
              '<div class="acct-stat"><b>' + esc(new Date(me.joinedAt).getFullYear() || '') + '</b><span>member since</span></div>' +
            '</div>' +
          '</div>' +

          '<div class="acct-col">' +
            '<section class="acct-panel">' +
              '<h2 class="acct-panel-title">Your points</h2>' +
              (activity.length
                ? '<ul class="acct-list">' + activity.map(function (a) { return a.html; }).join('') + '</ul>'
                : '<div class="acct-empty"><p>Nothing here yet. Shop online or in the shop using <b>' + esc(me.email) + '</b> and your points show up here by themselves.</p><a class="evb-btn evb-btn--primary" href="/store/">Shop the store</a></div>') +
            '</section>' +

            '<section class="acct-panel">' +
              '<h2 class="acct-panel-title">How it works</h2>' +
              '<ol class="acct-steps">' +
                '<li><span><b>Shop as you normally do.</b> Online, use this email at checkout. In the shop, give us your name or member number.</span></li>' +
                '<li><span><b>Earn ' + rules.pointsPerDollar + ' point for every $1</b> on what you buy (before tax and shipping).</span></li>' +
                '<li><span><b>Every ' + num(rules.rewardPoints) + ' points = ' + money(rules.rewardCents) + ' off.</b> Use them in the shop, or call us to use them on an online order.</span></li>' +
              '</ol>' +
            '</section>' +

            '<section class="acct-panel" id="acctDetails">' +
              detailsView(me) +
            '</section>' +
          '</div>' +
        '</div>' +
        '<p class="acct-foot-note">Want to close your account? Email <a href="mailto:' + esc(biz.email) + '">' + esc(biz.email) + '</a> and we’ll take care of it.</p>' +
      '</div>'
    );

    // Animate the bar in once it's on screen.
    var bar = host.querySelector('.acct-bar i');
    if (bar) requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = bar.dataset.pct + '%'; }); });

    document.getElementById('acctSignOut').addEventListener('click', function () {
      if (!sb) return renderEmail();
      sb.auth.signOut().then(function () { renderEmail(); }, function () { renderEmail(); });
    });
    bindDetails(me);
  }

  function item(icon, cls, title, sub, points) {
    var p = Number(points) || 0;
    return '<li class="acct-item">' +
      '<span class="acct-item-icon ' + cls + '">' + icon + '</span>' +
      '<div class="acct-item-main"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>' +
      '<span class="acct-item-pts' + (p < 0 ? ' is-neg' : '') + '">' + (p > 0 ? '+' : '') + num(p) + '</span>' +
    '</li>';
  }

  function detailsView(me) {
    return '<h2 class="acct-panel-title">Your details <button type="button" class="acct-small-btn" id="acctEdit">Edit</button></h2>' +
      '<dl class="acct-dl">' +
        '<div><dt>Name</dt><dd>' + esc(me.fullName || '—') + '</dd></div>' +
        '<div><dt>Email</dt><dd>' + esc(me.email) + '</dd></div>' +
        '<div><dt>Phone</dt><dd>' + esc(me.phone || '—') + '</dd></div>' +
        '<div><dt>New-arrival emails</dt><dd>' + (me.marketingOptIn ? 'Yes' : 'No') + '</dd></div>' +
      '</dl>';
  }

  function bindDetails(me) {
    var box = document.getElementById('acctDetails');
    document.getElementById('acctEdit').addEventListener('click', function () {
      box.innerHTML =
        '<h2 class="acct-panel-title">Edit your details</h2>' +
        '<form id="acctEditForm" novalidate>' +
          '<div class="acct-field"><label class="acct-label" for="acctName">Name</label>' +
            '<input class="acct-input" id="acctName" autocomplete="name" maxlength="120" value="' + esc(me.fullName || '') + '"></div>' +
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
      sb.auth.signOut().then(function () { renderEmail(); }, function () { renderEmail(); });
    });
  }

  function loadMe() {
    renderLoading();
    sb.rpc('member_me').then(function (res) {
      if (res.error) {
        var m = res.error.message || '';
        if (/JWT|not signed in|Confirm your email/i.test(m) || res.error.code === '28000' || res.status === 401) {
          sb.auth.signOut().then(function () { renderEmail(); }, function () { renderEmail(); });
          return;
        }
        if (/Could not find the function|does not exist/i.test(m)) {
          return renderProblem('Accounts are still being set up. Please check back soon.');
        }
        return renderProblem(friendly(res.error));
      }
      var me = res.data;
      if (!me.fullName) renderWelcome(me); else renderDash(me);
    }, function (e) { renderProblem(friendly(e)); });
  }

  /* ------------------------------------------------------------ preview */

  var SAMPLE = {
    memberNumber: 'M1024', email: 'pat@example.com', fullName: 'Pat Rivera', phone: '917-555-0100',
    marketingOptIn: true, joinedAt: '2026-06-02T15:00:00Z',
    balance: 1265, lifetimePoints: 1765, lifetimeSpendCents: 176580, purchaseCount: 4,
    rules: { pointsPerDollar: 1, rewardPoints: 500, rewardCents: 2500, lookbackDays: 30 },
    purchases: [
      { source: 'online', reference: 'EVB-261014-7QX2', label: 'Air Jordan 1 High “Chicago”', itemCount: 1, occurredAt: '2026-10-14T19:20:00Z', spendCents: 45000, points: 450 },
      { source: 'store', reference: '#T4911', label: '14k Cuban link chain, 22 in', itemCount: 1, occurredAt: '2026-09-28T17:05:00Z', spendCents: 98000, points: 980 },
      { source: 'online', reference: 'EVB-260819-K2MB', label: 'Chrome Hearts cross tee', itemCount: 2, occurredAt: '2026-08-19T14:40:00Z', spendCents: 23580, points: 235 },
      { source: 'store', reference: '#T4790', label: 'Sterling silver ring', itemCount: 1, occurredAt: '2026-06-02T16:00:00Z', spendCents: 10000, points: 100 }
    ],
    activity: [{ kind: 'redeem', points: -500, creditCents: 2500, createdAt: '2026-10-01T18:00:00Z' }]
  };

  function previewAfterCode() { renderWelcome({ fullName: '', phone: '', marketingOptIn: false }); }
  function previewAfterProfile(name) {
    var me = JSON.parse(JSON.stringify(SAMPLE));
    me.fullName = name; me.balance = 0; me.lifetimePoints = 0; me.purchaseCount = 0; me.purchases = []; me.activity = [];
    renderDash(me, { preview: true });
  }

  function startPreview(mode) {
    if (mode === 'code') return renderCode('pat@example.com');
    if (mode === 'welcome') return previewAfterCode();
    if (mode === 'empty') return previewAfterProfile('Pat Rivera');
    if (mode === 'signin') return renderEmail();
    renderDash(SAMPLE, { preview: true });
  }

  /* ------------------------------------------------------------ start */

  var preview = /[?&]preview(=([a-z]+))?/.exec(location.search);
  if (preview) return startPreview(preview[2] || 'dash');

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    return renderProblem('Accounts are temporarily unavailable. Please try again in a few minutes.');
  }

  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'evb-account' }
  });

  sb.auth.getSession().then(function (res) {
    if (res.data && res.data.session) return loadMe();
    var pending = parsePending();
    if (pending) return renderCode(pending.email);
    var handoff = ss(HANDOFF_KEY);
    ss(HANDOFF_KEY, null);
    renderEmail(handoff && validEmail(handoff) ? handoff : '');
  }, function () { renderEmail(); });
})();
