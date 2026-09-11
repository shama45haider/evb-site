function toggleEvbNav() {
  var ham = document.getElementById('evbHam');
  var overlay = document.getElementById('evbOverlay');
  var drawer = document.getElementById('evbDrawer');
  if (!drawer) return;
  var open = drawer.classList.contains('open');
  if (ham) {
    ham.classList.toggle('open', !open);
    ham.setAttribute('aria-expanded', String(!open));
  }
  if (overlay) overlay.classList.toggle('open', !open);
  drawer.classList.toggle('open', !open);
  document.body.style.overflow = open ? '' : 'hidden';
}

function toggleMobNav() { toggleEvbNav(); }
function toggleNav() { toggleEvbNav(); }

(function () {
  function setupNavDropdown() {
    var drops = document.querySelectorAll('.site-nav-drop');
    if (!drops.length) return;
    drops.forEach(function (drop) {
      var btn = drop.querySelector('.site-nav-link--drop');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var isOpen = drop.classList.contains('site-nav-drop--open');
        drops.forEach(function (d) {
          d.classList.remove('site-nav-drop--open');
          var b = d.querySelector('.site-nav-link--drop');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          drop.classList.add('site-nav-drop--open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
    document.addEventListener('click', function (e) {
      drops.forEach(function (d) {
        if (!d.contains(e.target)) {
          d.classList.remove('site-nav-drop--open');
          var b = d.querySelector('.site-nav-link--drop');
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        drops.forEach(function (d) {
          d.classList.remove('site-nav-drop--open');
          var b = d.querySelector('.site-nav-link--drop');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  function getDirectionsUrl() {
    var ua = navigator.userAgent || navigator.vendor || window.opera || '';
    var query = '39+Avenue+A,+New+York,+NY+10009';
    if (/android/i.test(ua)) {
      return 'geo:40.7235953,-73.9855773?q=' + query;
    }
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      return 'https://maps.apple.com/?daddr=' + query;
    }
    return 'https://www.google.com/maps/dir/?api=1&destination=' + query;
  }

  function buildMobileCta() {
    if (document.querySelector('.evb-mobile-cta')) return;
    var bar = document.createElement('div');
    bar.className = 'evb-mobile-cta';
    bar.innerHTML =
      '<a href="sms:9176088939" class="evb-mobile-cta-btn evb-mobile-cta-btn--primary">Text Photos</a>' +
      '<a href="' + getDirectionsUrl() + '" target="_blank" rel="noopener" class="evb-mobile-cta-btn evb-mobile-cta-btn--directions" aria-label="Get directions to 39 Avenue A" title="Get Directions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg></a>' +
      '<a href="tel:9176088939" class="evb-mobile-cta-btn evb-mobile-cta-btn--secondary">Call Now</a>';
    document.body.appendChild(bar);
    document.body.classList.add('evb-has-mobile-cta');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildMobileCta);
    document.addEventListener('DOMContentLoaded', setupNavDropdown);
  } else {
    buildMobileCta();
    setupNavDropdown();
  }
})();

/* ---------------------------------------------------------------------------
   Consent Mode v2 — update on banner choice
   Defaults are set inline in <head> (see EVB-CONSENT-V2) because they must
   run before GTM. This half only handles the user's click.

   Uses delegated capture-phase listeners rather than wrapping window.evbCk,
   because that function is assigned AFTER an early return that fires on any
   repeat visit -- so on returning visitors it does not exist to wrap.

   Two banner markups exist. The older one (11 pages) writes the same value
   for both buttons, so accept and reject are indistinguishable in storage.
   Keying off which button was clicked resolves that without touching markup.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'evb_consent_v1';

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function setConsent(granted) {
    try { localStorage.setItem(KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    var s = granted ? 'granted' : 'denied';
    gtag('consent', 'update', {
      ad_storage: s,
      ad_user_data: s,
      ad_personalization: s,
      analytics_storage: s
    });
    gtag('set', 'ads_data_redaction', !granted);
    if (window.fbq) {
      try { window.fbq('consent', granted ? 'grant' : 'revoke'); } catch (e) {}
    }
    window.evbConsentGranted = granted;
  }

  // Capture phase: the banner's own inline handlers hide/remove the node.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#evbCkYes, .evb-ck-accept')) { setConsent(true); return; }
    if (t.closest('#evbCkNo, .evb-ck-ess, .evb-ck-x')) { setConsent(false); }
  }, true);
})();

/* ---------------------------------------------------------------------------
   GA4 conversion events -> dataLayer

   Every conversion on this site is an outbound protocol click (tel:, sms:,
   maps). There are no forms, so there is no thank-you page to measure and
   everything has to be click-based.

   All listeners are delegated on document: 162 of the CTAs carry no class at
   all, and the chat assistant injects ~26 more tel:/sms: links at runtime.
   Nothing here calls preventDefault or does async work before navigation,
   so tel:/sms: handoff to the OS is unaffected.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var PATH = location.pathname;
  var PAGE_TYPE = (function () {
    if (PATH === '/' || /^\/index\.html?$/.test(PATH)) return 'home';
    if (/^\/(we-buy-|sell-)/.test(PATH)) return 'money_page';
    if (/^\/blog\//.test(PATH)) return 'blog';
    return 'other';
  })();

  function push(name, params) {
    var o = { event: name, page_path: PATH, page_type: PAGE_TYPE };
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k)) o[k] = params[k];
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(o);
  }

  // Anchors wrap nested block-level spans with no whitespace between them,
  // so textContent yields "Send a TextGet a Quote Fast". innerText respects
  // those boundaries and inserts breaks; textContent is the fallback.
  function textOf(el) {
    var t = el.getAttribute('aria-label');
    if (!t) t = ('innerText' in el ? el.innerText : el.textContent) || '';
    t = t.replace(/\s+/g, ' ').trim();
    return t.length > 100 ? t.slice(0, 100) : t;
  }

  /* -- where on the page the CTA lives ------------------------------------ */
  var POS = [
    ['.evb-mobile-cta-btn', 'sticky'],
    ['.site-topbar-item', 'topbar'],
    ['.site-btn-call, .site-btn-sms', 'header'],
    ['.site-mob-btn', 'mobile_drawer'],
    ['.evb-footer-contact-item', 'footer'],
    ['.sidebar-cta-btn', 'sidebar'],
    ['.blog-article-cta-btn', 'blog_cta'],
    ['.wb-cta, .hero-btn-call, .hero-btn-text, .sell-btn-primary, .sell-btn-secondary', 'hero'],
    ['.evb-cta-solid, .evb-cta-ghost', 'cta_band'],
    ['.evb-faq-cta-call, .evb-faq-cta-sms', 'faq'],
    ['.nk-btn', 'promo']
  ];

  function ctaPosition(a) {
    for (var i = 0; i < POS.length; i++) {
      try { if (a.matches(POS[i][0])) return POS[i][1]; } catch (e) {}
    }
    // container fallbacks for the unclassed links (footer list, FAQ prose)
    if (a.closest('.evb-mobile-cta')) return 'sticky';
    if (a.closest('.site-mob-drawer')) return 'mobile_drawer';
    if (a.closest('.evb-asst-root')) return 'chat';
    if (a.closest('.site-topbar')) return 'topbar';
    if (a.closest('.site-nav, header')) return 'header';
    if (a.closest('.evb-footer')) return 'footer';
    if (a.closest('.evb-cta-band')) return 'cta_band';
    if (a.closest('#faq, .sw-faq, .evb-faq-section')) return 'faq';
    if (a.closest('aside, .blog-sidebar')) return 'sidebar';
    if (a.closest('.wb-block, .hero-section')) return 'hero';
    return 'inline';
  }

  /* -- link classification ------------------------------------------------- */
  // Five directions formats: two runtime-only ones (geo:, maps.apple.com) are
  // emitted by getDirectionsUrl() above based on user agent.
  var RE_DIRECTIONS = /^(geo:|https?:\/\/(maps\.app\.goo\.gl|maps\.google\.|www\.google\.[a-z.]+\/maps|maps\.apple\.com))/i;
  var RE_REVIEWS = /google\.[a-z.]+\/search\?q=[^"]*review/i;
  var NETWORKS = [
    [/instagram\.com/i, 'instagram'],
    [/tiktok\.com/i, 'tiktok'],
    [/(youtube\.com|youtu\.be)/i, 'youtube']
  ];

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href]');
    if (!a) return;

    var href = a.getAttribute('href') || '';
    var base = {
      cta_position: ctaPosition(a),
      link_text: textOf(a),
      link_url: href
    };

    if (/^tel:/i.test(href)) { push('evb_call_click', base); return; }
    if (/^sms:/i.test(href)) { push('evb_text_click', base); return; }
    if (RE_DIRECTIONS.test(href)) { push('evb_directions_click', base); return; }

    if (RE_REVIEWS.test(href)) {
      base.outbound_network = 'google_reviews';
      push('evb_outbound_click', base);
      return;
    }
    for (var i = 0; i < NETWORKS.length; i++) {
      if (NETWORKS[i][0].test(href)) {
        base.outbound_network = NETWORKS[i][1];
        push('evb_outbound_click', base);
        return;
      }
    }
  }, false);

  /* -- chat assistant ------------------------------------------------------ */
  // The launcher click is drag-suppressed inside evb-assistant.js, so a click
  // listener would over-count drags. Watch the open class instead.
  var chatMsgIndex = 0;

  function watchChat(root) {
    var wasOpen = root.classList.contains('evb-asst-root--open');
    new MutationObserver(function () {
      var isOpen = root.classList.contains('evb-asst-root--open');
      if (isOpen && !wasOpen) push('evb_chat_open', {});
      wasOpen = isOpen;
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  (function findChat() {
    var r = document.querySelector('.evb-asst-root');
    if (r) { watchChat(r); return; }
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function () {
      var el = document.querySelector('.evb-asst-root');
      if (el) { mo.disconnect(); watchChat(el); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  })();

  function chatSent(inputEl, source) {
    var v = ((inputEl && inputEl.value) || '').trim();
    if (!v) return;
    chatMsgIndex++;
    var p = { message_length: v.length, message_index: chatMsgIndex };
    if (source) p.message_source = source;
    push('evb_chat_message_sent', p);
  }

  // Capture phase: submitQuery() clears the input before a bubbling listener
  // would see it, and the Enter path never fires a submit event at all.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.classList || !f.classList.contains('evb-asst-foot')) return;
    chatSent(f.querySelector('.evb-asst-input'));
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('evb-asst-input')) return;
    chatSent(t);
  }, true);

  // Suggestion chips bypass the input entirely.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var chip = t.closest('.evb-asst-chips button');
    if (!chip) return;
    chatMsgIndex++;
    push('evb_chat_message_sent', {
      message_length: (chip.textContent || '').trim().length,
      message_index: chatMsgIndex,
      message_source: 'chip'
    });
  }, false);

  /* -- scroll depth, money pages only -------------------------------------- */
  if (PAGE_TYPE === 'money_page') {
    var marks = [25, 50, 75, 100];
    var hit = {};
    var ticking = false;

    function check() {
      ticking = false;
      var de = document.documentElement;
      var h = Math.max(de.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      if (h <= 0) return;
      var pct = ((window.pageYOffset || de.scrollTop) / h) * 100;
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        if (!hit[m] && pct >= m - 0.5) {
          hit[m] = true;
          push('evb_scroll_depth', { percent_scrolled: m });
        }
      }
      if (hit[100]) window.removeEventListener('scroll', onScroll);
    }

    // Throttled with setTimeout rather than requestAnimationFrame: this is a
    // coarse four-bucket measurement, not a per-frame animation, and rAF is
    // suspended entirely while a tab is hidden.
    function onScroll() {
      if (ticking) return;
      ticking = true;
      setTimeout(check, 120);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();


/* ---------------------------------------------------------------------------
   One-off closure notice
   Site-wide popup announcing a day the shop is closed outside its normal
   weekly hours. Everything about it lives in CLOSURE below: change the date
   and copy there, and it switches itself off after `showUntil`, so nothing
   needs removing afterwards.

   Also publishes window.EVB_CLOSED_DATES, which the live Open/Closed badge on
   /store/ reads so it never says "Open now" on a day the shop is shut.
   This script must load before that badge's script (it does on every page).
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var CLOSURE = {
    date: '2026-09-13',                         // YYYY-MM-DD, New York time
    title: 'Closed Sunday, September 13',
    body: 'The shop at 39 Avenue A will be closed all day Sunday. We are closed Saturdays as usual, so we reopen Monday, September 14 at 12:30 PM.',
    // Monday 14 Sep 00:00 in New York. September is EDT, UTC-4.
    showUntil: Date.UTC(2026, 8, 14, 4, 0, 0)
  };

  window.EVB_CLOSED_DATES = (window.EVB_CLOSED_DATES || []).concat(CLOSURE.date);

  if (Date.now() >= CLOSURE.showUntil) return;

  var KEY = 'evb_closure_seen_' + CLOSURE.date;
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  function build() {
    if (document.getElementById('evbClosure')) return;

    // While this is up, hold back the homepage "What's New" popup so a
    // visitor never gets two modals stacked on top of each other. An
    // !important rule beats the inline display that popup sets on a timer.
    var hold = document.createElement('style');
    hold.id = 'evbClosureHold';
    hold.textContent = '#wnWrap{display:none!important}';
    document.head.appendChild(hold);

    var css = document.createElement('style');
    css.textContent =
      '#evbClosure{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:18px;' +
        'background:rgba(0,0,0,.55);font-family:"Montserrat",system-ui,sans-serif;opacity:0;transition:opacity .25s ease}' +
      '#evbClosure.is-in{opacity:1}' +
      '.evb-cl-card{position:relative;width:100%;max-width:420px;background:#fff;border-radius:14px;overflow:hidden;' +
        'box-shadow:0 24px 60px rgba(0,0,0,.35);transform:translateY(12px) scale(.98);transition:transform .3s cubic-bezier(.22,1,.36,1)}' +
      '#evbClosure.is-in .evb-cl-card{transform:none}' +
      '.evb-cl-bar{height:5px;background:linear-gradient(90deg,#f97316,#ea580c)}' +
      '.evb-cl-body{padding:24px 24px 22px}' +
      '.evb-cl-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:8px;border:1px solid rgba(0,0,0,.1);' +
        'background:#fff;color:#555;font-size:20px;line-height:1;cursor:pointer;display:grid;place-items:center}' +
      '.evb-cl-x:hover{border-color:#f97316;color:#f97316}' +
      '.evb-cl-icon{width:46px;height:46px;border-radius:12px;background:rgba(249,115,22,.1);color:#f97316;' +
        'display:grid;place-items:center;margin-bottom:14px}' +
      '.evb-cl-icon svg{width:24px;height:24px}' +
      '.evb-cl-eyebrow{font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#f97316;margin:0 0 6px}' +
      '.evb-cl-title{font-size:22px;font-weight:900;line-height:1.15;letter-spacing:-.02em;text-transform:uppercase;color:#111;margin:0 0 10px;padding-right:30px}' +
      '.evb-cl-text{font-size:14px;line-height:1.65;color:#555;margin:0 0 20px;font-weight:500}' +
      '.evb-cl-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;border:none;border-radius:10px;cursor:pointer;' +
        'font-family:inherit;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;' +
        'background:linear-gradient(135deg,#f97316,#ea580c);box-shadow:0 4px 0 #c2410c,0 8px 20px rgba(249,115,22,.3);' +
        'transition:transform .2s ease,box-shadow .2s ease}' +
      '.evb-cl-btn:hover{transform:translateY(-2px);box-shadow:0 6px 0 #c2410c,0 12px 26px rgba(249,115,22,.38)}' +
      '.evb-cl-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #c2410c}' +
      '.evb-cl-note{font-size:12px;color:#777;margin:14px 0 0;text-align:center;font-weight:500}' +
      '.evb-cl-note a{color:#ea580c;font-weight:700;text-decoration:none}' +
      '@media (prefers-reduced-motion:reduce){#evbClosure,.evb-cl-card{transition:none}}';
    document.head.appendChild(css);

    var wrap = document.createElement('div');
    wrap.id = 'evbClosure';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'evbClosureTitle');
    wrap.setAttribute('aria-describedby', 'evbClosureText');
    wrap.innerHTML =
      '<div class="evb-cl-card">' +
        '<div class="evb-cl-bar" aria-hidden="true"></div>' +
        '<button type="button" class="evb-cl-x" aria-label="Close notice">&times;</button>' +
        '<div class="evb-cl-body">' +
          '<div class="evb-cl-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9.5 14.5l5 5M14.5 14.5l-5 5"/></svg></div>' +
          '<p class="evb-cl-eyebrow">Store hours update</p>' +
          '<h2 class="evb-cl-title" id="evbClosureTitle"></h2>' +
          '<p class="evb-cl-text" id="evbClosureText"></p>' +
          '<button type="button" class="evb-cl-btn">Got it</button>' +
          '<p class="evb-cl-note">Questions? Text <a href="sms:9176088939">917-608-8939</a></p>' +
        '</div>' +
      '</div>';
    // Copy goes in as text, never as markup.
    wrap.querySelector('#evbClosureTitle').textContent = CLOSURE.title;
    wrap.querySelector('#evbClosureText').textContent = CLOSURE.body;
    document.body.appendChild(wrap);

    var lastFocus = document.activeElement;
    var ok = wrap.querySelector('.evb-cl-btn');

    function close() {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      wrap.classList.remove('is-in');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      // Keep Tab inside the dialog while it is open.
      if (e.key === 'Tab') {
        var f = wrap.querySelectorAll('button, a[href]');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    ok.addEventListener('click', close);
    wrap.querySelector('.evb-cl-x').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);

    // Next frame so the fade-in transition actually runs.
    setTimeout(function () { wrap.classList.add('is-in'); ok.focus(); }, 30);
  }

  function start() { setTimeout(build, 400); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
