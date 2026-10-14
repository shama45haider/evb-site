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

  var CSS =
    '.evbp{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;visibility:hidden;pointer-events:none}' +
    '.evbp.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbp-lock{overflow:hidden}' +
    '.evbp-backdrop{position:absolute;inset:0;background:rgba(12,11,10,.62);opacity:0;transition:opacity .25s ease}' +
    '.evbp.is-open .evbp-backdrop{opacity:1}' +
    '.evbp-card{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 40px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45),0 0 0 4px #f97316;opacity:0;transform:translateY(18px) scale(.94);transition:opacity .3s ease,transform .4s cubic-bezier(.2,1.3,.4,1)}' +
    '.evbp.is-open .evbp-card{opacity:1;transform:none}' +
    '@media (prefers-reduced-motion:reduce){.evbp-card,.evbp-backdrop{transition:none}}' +
    '.evbp-x{position:absolute;top:8px;right:10px;z-index:2;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#3a3632;font-size:24px;line-height:1;cursor:pointer}' +
    '.evbp-x:hover{background:#f3efe9;color:#0c0b0a}' +
    '.evbp-img{display:block;width:100%;max-height:260px;object-fit:cover;background:#0c0b0a}' +
    '.evbp-body{padding:28px 26px 24px;font-family:"Inter",sans-serif}' +
    '.evbp-title{margin:0 34px 10px 0;font-family:"Montserrat",sans-serif;font-size:clamp(22px,4vw,28px);font-weight:900;line-height:1.08;letter-spacing:-.03em;text-transform:uppercase;color:#0c0b0a}' +
    '.evbp-text{margin:0;font-size:15px;line-height:1.6;color:#5a5550;white-space:pre-line}' +
    '.evbp-btn{display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:center;margin-top:18px;padding:14px 20px;border:0;border-radius:10px;background:#e8690a;color:#fff;font:800 12px "Montserrat",sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 0 #b84f06;cursor:pointer;transition:transform .15s,box-shadow .15s}' +
    '.evbp-btn:hover{transform:translateY(-2px);box-shadow:0 6px 0 #b84f06;color:#fff}' +
    '.evbp-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #b84f06}';

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
      var img = el('img', 'evbp-img');
      img.src = p.image;
      img.alt = '';
      img.decoding = 'async';
      card.appendChild(img);
    }

    var body = el('div', 'evbp-body');
    var title = el('h2', 'evbp-title', p.title);
    title.id = 'evbpTitle';
    body.appendChild(title);
    if (p.body) body.appendChild(el('p', 'evbp-text', p.body));

    var href = safeLink(p.buttonUrl);
    if (p.buttonLabel && href) {
      var btn = el('a', 'evbp-btn', p.buttonLabel);
      btn.href = href;
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
