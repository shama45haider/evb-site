/*
 * Pop-up messages, managed in the workplace panel (Website → Pop-ups).
 *
 * Asks the panel which pop-ups are live for the website, picks the first one
 * meant for this page that this visitor hasn't already closed (by its "How
 * often" setting), and shows it once any other dialog (cookie notice, the
 * store's email pop-up) is out of the way.
 *
 * Page matching and "how often" mirror the panel's src/lib/popups/popups.ts;
 * change both together. Everything shown is set as text, never HTML.
 */
(function () {
  'use strict';

  var w = window;
  var ENDPOINT = w.EVB_POPUPS_ENDPOINT || 'https://panel.eastvillagebuyers.com/api/site-popups';
  if (!w.EVB_POPUPS_ENDPOINT && !/(^|\.)eastvillagebuyers\.com$/.test(location.hostname)) return;

  var PATH = location.pathname;
  // Never in the middle of paying.
  if (/^\/store\/(checkout|order)\b/.test(PATH)) return;
  if (document.querySelector('.p404-ad')) return;

  var DELAY_MS = 1200;
  var KEY = 'evb_popup_';

  function get(store, k) { try { return w[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { w[store].setItem(k, v); } catch (e) {} }

  function normalize(path) {
    var bare = String(path).split(/[?#]/)[0] || '/';
    return bare.length > 1 ? bare.replace(/\/+$/, '') : '/';
  }

  // Empty = every page; "x*" = every page starting with x; else that one page.
  function matchesPage(patterns, path) {
    if (!patterns || !patterns.length) return true;
    var here = normalize(path);
    var hereSlash = here === '/' ? '/' : here + '/';
    for (var i = 0; i < patterns.length; i++) {
      var p = String(patterns[i]);
      if (p.charAt(p.length - 1) === '*') {
        if (hereSlash.indexOf(p.slice(0, -1)) === 0) return true;
      } else if (normalize(p) === here) {
        return true;
      }
    }
    return false;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // Closed before? "revision|day" in localStorage; "every visit" uses the tab session.
  function due(p) {
    if (p.frequency === 'every_visit') return Number(get('sessionStorage', KEY + p.id)) < p.revision;
    var seen = (get('localStorage', KEY + p.id) || '').split('|');
    if (Number(seen[0]) < p.revision) return true;
    if (p.frequency === 'daily') return seen[1] !== today();
    return false;
  }

  function remember(p) {
    if (p.frequency === 'every_visit') set('sessionStorage', KEY + p.id, String(p.revision));
    else set('localStorage', KEY + p.id, p.revision + '|' + today());
  }

  function safeLink(url) {
    url = String(url || '');
    return /^(\/(?!\/)|https?:\/\/|tel:|mailto:)/i.test(url) ? url : null;
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
      !!document.querySelector('.evbs.is-open');
  }

  function push(name, p) {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: name, popup_id: p.id, popup_title: p.title, page_path: PATH });
  }

  // A dark card: the picture on the left (on top on a phone), the message on
  // the right, the title's last word in orange, one big button, "Not now",
  // and the shop's address underneath.
  var CSS =
    '.evbp{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;visibility:hidden;pointer-events:none}' +
    '.evbp.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbp-lock{overflow:hidden}' +
    '.evbp-backdrop{position:absolute;inset:0;background:rgba(8,7,6,.74);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .3s ease}' +
    '.evbp.is-open .evbp-backdrop{opacity:1}' +
    '.evbp-card{position:relative;display:flex;flex-direction:column;width:100%;max-width:440px;max-height:calc(100vh - 40px);overflow:hidden;background:#100f0e;color:#fff;border-radius:22px;' +
      'box-shadow:0 40px 110px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08),0 0 70px rgba(249,115,22,.22);' +
      'opacity:0;transform:translateY(26px) scale(.95);transition:opacity .35s ease,transform .5s cubic-bezier(.2,1.25,.35,1)}' +
    '.evbp.is-open .evbp-card{opacity:1;transform:none}' +
    '.evbp-media{position:relative;flex-shrink:0;height:min(36vh,calc(100vw - 40px));background:#0c0b0a;overflow:hidden}' +
    '.evbp-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;transform:scale(1.04);transition:transform 6s ease-out}' +
    '.evbp.is-open .evbp-img{transform:scale(1)}' +
    '.evbp-media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(16,15,14,0) 62%,#100f0e 100%);pointer-events:none}' +
    '.evbp-body{position:relative;display:flex;flex-direction:column;min-height:0;overflow:auto;padding:24px 24px 18px;font-family:"Inter",sans-serif}' +
    '.evbp-eyebrow{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;margin:0 0 14px;padding:6px 12px 6px 10px;border:1px solid rgba(249,115,22,.4);border-radius:999px;background:rgba(249,115,22,.12);' +
      'color:#fb923c;font:800 10px/1 "Montserrat",sans-serif;letter-spacing:.18em;text-transform:uppercase}' +
    '.evbp-eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:#f97316;animation:evbpPulse 2s infinite}' +
    '@keyframes evbpPulse{0%{box-shadow:0 0 0 0 rgba(249,115,22,.7)}70%{box-shadow:0 0 0 8px rgba(249,115,22,0)}100%{box-shadow:0 0 0 0 rgba(249,115,22,0)}}' +
    '.evbp-title{margin:0 0 12px;font-family:"Montserrat",sans-serif;font-size:clamp(26px,7.4vw,34px);font-weight:900;line-height:1;letter-spacing:-.035em;text-transform:uppercase;color:#fff}' +
    '.evbp-title em{font-style:normal;color:#f97316;background:linear-gradient(90deg,#fb923c,#f97316 55%,#fbbf24);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}' +
    '.evbp-text{margin:0;font-size:15px;line-height:1.62;color:#c4bdb5;white-space:pre-line}' +
    '.evbp-btn{position:relative;display:flex;gap:10px;width:100%;box-sizing:border-box;align-items:center;justify-content:center;margin-top:22px;padding:16px 20px;overflow:hidden;border:0;border-radius:12px;' +
      'background:linear-gradient(135deg,#fb923c,#f97316 45%,#ea580c);color:#fff;font:800 13px "Montserrat",sans-serif;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;' +
      'box-shadow:0 12px 30px rgba(249,115,22,.38),inset 0 1px 0 rgba(255,255,255,.3);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}' +
    '.evbp-btn:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(249,115,22,.5),inset 0 1px 0 rgba(255,255,255,.3);color:#fff}' +
    '.evbp-btn:active{transform:translateY(1px)}' +
    '.evbp-btn svg{width:18px;height:18px;flex-shrink:0}' +
    '.evbp-btn:after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-20deg);animation:evbpShine 3.8s ease-in-out 1.2s infinite}' +
    '@keyframes evbpShine{0%{left:-60%}35%,100%{left:130%}}' +
    '.evbp-later{align-self:center;margin-top:10px;padding:6px 10px;border:0;background:none;color:#8f877e;font:600 12.5px "Inter",sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    '.evbp-later:hover{color:#fff}' +
    '.evbp-foot{display:flex;align-items:center;gap:7px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);color:#8f877e;font:600 11.5px "Inter",sans-serif;letter-spacing:.01em}' +
    '.evbp-foot svg{width:14px;height:14px;flex-shrink:0;color:#f97316}' +
    '.evbp-x{position:absolute;top:12px;right:12px;z-index:3;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.18);border-radius:50%;' +
      'background:rgba(16,15,14,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font-size:22px;line-height:1;cursor:pointer;transition:background .15s,transform .15s}' +
    '.evbp-x:hover{background:#f97316;transform:rotate(90deg)}' +
    '.evbp-x:focus-visible,.evbp-btn:focus-visible,.evbp-later:focus-visible{outline:3px solid #fbbf24;outline-offset:3px}' +
    // Side by side on a computer: a square picture beside the message.
    '@media (min-width:760px){' +
      '.evbp-card.has-img{flex-direction:row;max-width:860px}' +
      '.evbp-card.has-img .evbp-media{width:430px;height:auto;min-height:430px}' +
      '.evbp-card.has-img .evbp-media:after{background:linear-gradient(90deg,rgba(16,15,14,0) 70%,#100f0e 100%)}' +
      '.evbp-card.has-img .evbp-body{flex:1;justify-content:center;padding:38px 36px 26px}' +
      '.evbp-card:not(.has-img){max-width:480px}' +
      '.evbp-body{padding:38px 34px 24px}' +
      '.evbp-title{font-size:clamp(30px,3.4vw,40px)}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbp-card,.evbp-backdrop,.evbp-img{transition:none}.evbp-btn:after,.evbp-eyebrow:before{animation:none}}';

  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  var ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>';

  var root, lastFocus, current;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function build(p) {
    var style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root = el('div', 'evbp');
    var backdrop = el('div', 'evbp-backdrop');
    backdrop.setAttribute('data-close', '');
    var card = el('div', 'evbp-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'evbpTitle');

    var x = el('button', 'evbp-x');
    x.type = 'button';
    x.setAttribute('data-close', '');
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '&times;';
    card.appendChild(x);

    if (p.image) {
      card.className += ' has-img';
      var media = el('div', 'evbp-media');
      var img = el('img', 'evbp-img');
      img.src = p.image;
      img.alt = '';
      img.decoding = 'async';
      media.appendChild(img);
      card.appendChild(media);
    }

    var body = el('div', 'evbp-body');
    body.appendChild(el('p', 'evbp-eyebrow', 'East Village Buyers'));

    // The title's last word in orange ("We Buy Top DESIGNER"). Text nodes
    // only, never HTML.
    var title = el('h2', 'evbp-title');
    title.id = 'evbpTitle';
    var words = String(p.title).trim().split(/\s+/);
    if (words.length > 1) {
      var last = words.pop();
      title.appendChild(document.createTextNode(words.join(' ') + ' '));
      title.appendChild(el('em', '', last));
    } else {
      title.textContent = p.title;
    }
    body.appendChild(title);
    if (p.body) body.appendChild(el('p', 'evbp-text', p.body));

    var href = safeLink(p.buttonUrl);
    if (p.buttonLabel && href) {
      var btn = el('a', 'evbp-btn');
      btn.href = href;
      // Icons are fixed markup; the label is set as text.
      btn.innerHTML = /^tel:/i.test(href) ? ICON_PHONE : '';
      btn.appendChild(el('span', '', p.buttonLabel));
      if (!/^tel:/i.test(href)) btn.insertAdjacentHTML('beforeend', ICON_ARROW);
      if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0) {
        btn.target = '_blank';
        btn.rel = 'noopener';
      }
      btn.addEventListener('click', function () {
        push('popup_click', p);
        close();
      });
      body.appendChild(btn);
    }

    var later = el('button', 'evbp-later', 'Not now');
    later.type = 'button';
    later.setAttribute('data-close', '');
    body.appendChild(later);

    var foot = el('p', 'evbp-foot');
    foot.innerHTML = ICON_PIN;
    foot.appendChild(el('span', '', '39 Avenue A · East Village, NYC'));
    body.appendChild(foot);

    card.appendChild(body);

    root.appendChild(backdrop);
    root.appendChild(card);
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') trapTab(e);
    });
  }

  function trapTab(e) {
    var f = root.querySelectorAll('button, a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(p) {
    current = p;
    build(p);
    lastFocus = document.activeElement;
    requestAnimationFrame(function () {
      root.classList.add('is-open');
      document.documentElement.classList.add('evbp-lock');
      setTimeout(function () {
        var x = root.querySelector('.evbp-x');
        if (x) x.focus({ preventScroll: true });
      }, 250);
    });
    push('popup_view', p);
  }

  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    document.documentElement.classList.remove('evbp-lock');
    remember(current);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function pick(list) {
    var now = Date.now();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || !p.title) continue;
      if (p.endsAt && Date.parse(p.endsAt) <= now) continue;
      if (!matchesPage(p.pages, PATH)) continue;
      if (!due(p)) continue;
      return p;
    }
    return null;
  }

  function start() {
    if (!w.fetch) return;
    w.fetch(ENDPOINT, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : { popups: [] }; })
      .then(function (data) {
        var p = pick((data && data.popups) || []);
        if (!p) return;
        var fired = false;
        (function fire() {
          if (fired) return;
          if (otherDialogOpen()) return setTimeout(fire, 2000);
          fired = true;
          open(p);
        })();
      })
      .catch(function () {});
  }

  function later() { setTimeout(start, DELAY_MS); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later);
  else later();
})();
