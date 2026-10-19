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

  // The same look as the home page's "What's New" pop-up (#wnWrap in
  // index.html): a white card, the picture on the left with an orange badge
  // (on top on a phone), a small orange tag, the title, an orange pill
  // button, and the shop's address under a thin line. Keep the two alike.
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
    '.evbp-x{position:absolute;top:10px;right:12px;z-index:10;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#333;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:transform .2s}' +
    '.evbp-x:hover{transform:scale(1.1)}' +
    '.evbp-media{position:relative;flex:0 0 44%;min-height:260px;overflow:hidden;background:#f3efe9}' +
    '.evbp-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}' +
    '.evbp-badge{position:absolute;top:14px;left:14px;z-index:2;padding:5px 10px;border-radius:6px;background:#f97316;color:#fff;font:800 10px/1.2 "Montserrat",sans-serif;letter-spacing:.1em}' +
    '.evbp-body{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;overflow-x:hidden;overflow-y:auto;padding:28px 24px}' +
    '.evbp-mark{position:absolute;bottom:-10px;right:-10px;width:120px;opacity:.06;pointer-events:none}' +
    '.evbp-tag{margin:0 0 8px;font:800 10px/1.3 "Montserrat",sans-serif;letter-spacing:.15em;color:#f97316;text-transform:uppercase}' +
    '.evbp-title{margin:0 0 8px;padding-right:22px;font:900 20px/1.2 "Montserrat",sans-serif;letter-spacing:-.01em;color:#111}' +
    '.evbp-text{margin:0 0 16px;font:400 13px/1.6 "Poppins","Inter",sans-serif;color:#666;white-space:pre-line}' +
    '.evbp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}' +
    '.evbp-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:50px;background:#f97316;color:#fff;font:700 12px "Montserrat",sans-serif;letter-spacing:.02em;text-decoration:none;' +
      'box-shadow:0 4px 14px rgba(249,115,22,.3);animation:evbpPulse 2s ease-in-out infinite;transition:background .2s,transform .2s}' +
    '.evbp-btn:hover{background:#ea580c;color:#fff;animation:none;transform:translateY(-1px)}' +
    '.evbp-btn svg{width:15px;height:15px;flex-shrink:0}' +
    '.evbp-addr{margin:0;padding-top:12px;border-top:1px solid #f0f0f0;font:500 12px "Poppins","Inter",sans-serif;color:#888}' +
    '@keyframes evbpPulse{0%,100%{box-shadow:0 4px 14px rgba(249,115,22,.3)}50%{box-shadow:0 4px 24px rgba(249,115,22,.6),0 0 0 6px rgba(249,115,22,.12)}}' +
    '.evbp-x:focus-visible,.evbp-btn:focus-visible{outline:3px solid #f97316;outline-offset:3px}' +
    '@media (max-width:520px){' +
      '.evbp-card{max-width:360px;flex-direction:column}' +
      '.evbp-media{flex:none;height:min(250px,70vw);min-height:0}' +
      '.evbp-body{padding:20px 18px}' +
      '.evbp-title{font-size:17px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbp-card,.evbp-backdrop{transition:none}.evbp-btn{animation:none}}';

  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

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
      media.appendChild(el('div', 'evbp-badge', "WHAT'S NEW"));
      card.appendChild(media);
    }

    var body = el('div', 'evbp-body');
    body.appendChild(el('p', 'evbp-tag', 'East Village Buyers'));

    var title = el('h2', 'evbp-title', p.title);
    title.id = 'evbpTitle';
    body.appendChild(title);
    if (p.body) body.appendChild(el('p', 'evbp-text', p.body));

    var href = safeLink(p.buttonUrl);
    if (p.buttonLabel && href) {
      var btns = el('div', 'evbp-btns');
      var btn = el('a', 'evbp-btn');
      btn.href = href;
      // Icons are fixed markup; the label is set as text.
      if (/^tel:/i.test(href)) btn.innerHTML = ICON_PHONE;
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
      btns.appendChild(btn);
      body.appendChild(btns);
    }

    body.appendChild(el('p', 'evbp-addr', '39 Avenue A, East Village, NYC'));

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
