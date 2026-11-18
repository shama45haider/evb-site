/*
 * The welcome game: a mystery-box dialog shown once, on a visitor's first
 * page of the site. (The file keeps its first name, evb-spin.js, because
 * every page already loads it under that name.)
 *
 * Three gift boxes shuffle; the visitor picks one. It holds one of WINNABLE,
 * at even odds (free shipping on a first order over $120, or $5 off), and
 * the other two then open to show what they "missed".
 *
 * The prize is locked until the visitor has an account: a signed-out winner
 * is sent to /account/ to make one (evb_game_v1 = 'locked:CODE'), and the
 * first page they see signed in, or their account page once it is past the
 * sign-up steps, opens the box again with the code showing. Signed in means
 * supabase-js has a session under 'evb-account' (account.js), the same test
 * site-nav.js uses. Unlocking saves the code into the store's checkout draft
 * (evb_checkout_v1, the same one store-core.js keeps), so the bag and
 * checkout fill it in by themselves. The codes themselves are on the
 * checkout Worker (square-worker.js, PUBLIC_PROMO_CODES); change the two
 * together.
 *
 * While it is up (or about to be), <html data-evb-spin> tells the other
 * pop-ups (evb-popups.js, evb-blog-popup.js) to wait.
 */
(function () {
  'use strict';

  var w = window;
  var d = document;
  var KEY = 'evb_game_v1';
  var DRAFT_KEY = 'evb_checkout_v1';
  var SESSION_KEY = 'evb-account';
  var DELAY_MS = 700;
  var PATH = location.pathname;
  var ON_ACCOUNT = /^\/account\b/.test(PATH);

  // Never in the middle of paying, or on the 404 page.
  if (/^\/store\/(checkout|order)\b/.test(PATH)) return;
  if (d.querySelector('.p404-ad')) return;

  function get(k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function signedIn() { return !!get(SESSION_KEY); }

  // What the picked box can hold. Each code must exist on the Worker.
  var WINNABLE = [
    { code: 'SPIN120', card: { big: 'Free', small: 'shipping' }, title: 'You won free shipping',
      text: 'Free shipping on your first order over $120.' },
    { code: 'GIFT5', card: { big: '$5', small: 'off' }, title: 'You won $5 off',
      text: '$5 off your order, any amount.' }
  ];
  // What the other two boxes "had": one big prize, one smaller one.
  var BIG = [{ big: '$100', small: 'off' }, { big: '$50', small: 'off' }, { big: '20%', small: 'off' }];
  var SMALL = [{ big: '15%', small: 'off' }, { big: '2×', small: 'points' }, { big: '$25', small: 'off' }, { big: '10%', small: 'off' }];
  function any(list) { return list[Math.floor(Math.random() * list.length)]; }
  var prize = null; // the one they won

  // 'game': the first visit. 'unlock': a locked prize, now signed in.
  // Once per visitor; without storage we can't remember, so we don't show it.
  var saved;
  try { saved = w.localStorage.getItem(KEY); } catch (e) { return; }
  var mode = 'game';
  var lockedCode = /^locked:([A-Z0-9]{2,20})$/.exec(saved || '');
  if (lockedCode) {
    prize = WINNABLE.filter(function (p) { return p.code === lockedCode[1]; })[0];
    if (!prize) return;
    // The account page waits for the sign-up steps (below, in start()).
    if (!ON_ACCOUNT && !signedIn()) return;
    mode = 'unlock';
  } else if (saved || ON_ACCOUNT) {
    return;
  }

  var motion = !!(Element.prototype.animate) &&
    !(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Hold the other pop-ups, before they start counting down.
  function holdOthers() {
    d.documentElement.setAttribute('data-evb-spin', '');
    // The home page's "What's New" card opens on its own timer; keep it shut
    // for this page view (the !important beats its inline display).
    var hold = d.createElement('style');
    hold.textContent = '#wnWrap{display:none!important}';
    d.head.appendChild(hold);
  }
  if (!ON_ACCOUNT) holdOthers();

  var CSS =
    '.evbmb{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;visibility:hidden;pointer-events:none}' +
    '.evbmb.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbmb-lock{overflow:hidden}' +
    '.evbmb-scrim{position:absolute;inset:0;background:rgba(20,16,12,.58);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .3s ease}' +
    '.evbmb.is-open .evbmb-scrim{opacity:1}' +
    '.evbmb-card{position:relative;width:100%;max-width:500px;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;padding:8px;background:#fff;border-radius:28px;' +
      'opacity:0;transform:translateY(24px) scale(.97);transition:opacity .45s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1)}' +
    '.evbmb.is-open .evbmb-card{opacity:1;transform:none}' +
    '.evbmb-x{position:absolute;top:14px;right:14px;z-index:8;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:rgba(255,255,255,.8);color:#52443c;cursor:pointer;transition:background .2s,opacity .2s}' +
    '.evbmb-x:hover{background:#fff}' +
    '.evbmb-x[disabled]{opacity:0;pointer-events:none}' +
    '.evbmb-x svg{width:22px;height:22px}' +

    // The stage and the boxes. Sizes are in em off the row's font size, so
    // the whole set scales with the screen.
    '.evbmb-stage{position:relative;overflow:hidden;padding:10px 8px 6px;background:#fff1e6;border-radius:20px}' +
    '.evbmb-row{position:relative;height:13.6em;font-size:clamp(10px,3.3vw,16px)}' +
    '.evbmb-box{position:absolute;left:50%;bottom:.7em;z-index:2;width:8em;height:9.5em;margin-left:-4em;padding:0;border:0;border-radius:14px;background:none;font:inherit;cursor:default;-webkit-tap-highlight-color:transparent}' +
    '.evbmb-row.is-pickable .evbmb-box{cursor:pointer}' +
    '.evbmb-box:focus-visible{outline:3px solid #f97316;outline-offset:6px}' +
    '.evbmb-bob,.evbmb-inner{position:absolute;inset:0;display:block}' +
    '.evbmb-row.is-idle .evbmb-bob,.evbmb-row.is-pickable .evbmb-bob{animation:evbmbBob 2.8s ease-in-out infinite}' +
    '.evbmb-box.b2 .evbmb-bob{animation-delay:-.95s}' +
    '.evbmb-box.b3 .evbmb-bob{animation-delay:-1.9s}' +
    '@keyframes evbmbBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.32em)}}' +
    '.evbmb-inner{transform-origin:50% 100%;transition:transform .25s cubic-bezier(.2,.8,.2,1)}' +
    '.evbmb-row.is-pickable .evbmb-box:hover .evbmb-inner,.evbmb-row.is-pickable .evbmb-box:focus-visible .evbmb-inner{transform:translateY(-.55em)}' +
    '.evbmb-row.is-pickable .evbmb-box:hover .evbmb-lid,.evbmb-row.is-pickable .evbmb-box:focus-visible .evbmb-lid{transform:translateY(-.3em) rotate(-4deg)}' +
    '.evbmb-shadow{position:absolute;left:10%;right:10%;bottom:-.45em;height:.9em;border-radius:50%;background:rgba(31,27,22,.14)}' +
    '.evbmb-body{position:absolute;left:.5em;bottom:0;z-index:2;display:block;width:7em;height:6em}' +
    '.evbmb-lid{position:absolute;left:0;top:0;z-index:3;display:block;width:8em;height:3.75em;transform-origin:50% 100%;transition:transform .25s cubic-bezier(.2,.8,.2,1)}' +
    '.evbmb-prize{position:absolute;left:1em;top:4em;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:6em;height:4.4em;background:#fff;border:2px solid #f97316;border-radius:.75em;' +
      'font-family:"Montserrat",system-ui,sans-serif;color:#c2410c;opacity:0}' +
    '.evbmb-prize b{font-size:1.45em;font-weight:800;line-height:1.05;letter-spacing:-.02em}' +
    '.evbmb-prize small{margin-top:.15em;font-size:.72em;font-weight:700;line-height:1.2}' +
    '.evbmb-prize.is-missed{border-color:#e8d8cb;color:#a08f82}' +
    '.evbmb-rays{position:absolute;z-index:0;width:13em;height:13em;margin:-6.5em 0 0 -6.5em;opacity:0;pointer-events:none}' +
    '.evbmb-rays svg{display:block;width:100%;height:100%;animation:evbmbTurn 16s linear infinite}' +
    '@keyframes evbmbTurn{to{transform:rotate(360deg)}}' +
    '.evbmb-spark{position:absolute;z-index:6;width:.95em;height:.95em;margin:-.475em 0 0 -.475em;pointer-events:none}' +

    // The words under the stage.
    '.evbmb-main{position:relative;padding:22px 24px 22px}' +
    '.evbmb-pane{display:flex;flex-direction:column;align-items:center;text-align:center}' +
    '.evbmb-pane[hidden]{display:none}' +
    '.evbmb-pane.is-in{animation:evbmbIn .45s cubic-bezier(.22,1,.36,1)}' +
    '@keyframes evbmbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.evbmb-brand{display:flex;align-items:center;gap:8px;margin:0 0 12px;font:600 13px/1.3 "Inter","Poppins",system-ui,sans-serif;color:#9a3412}' +
    '.evbmb-brand img{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#fff}' +
    '.evbmb-title{margin:0 0 8px;font:800 26px/1.15 "Montserrat",system-ui,sans-serif;letter-spacing:-.02em;color:#1f1b16}' +
    '.evbmb-title:focus{outline:none}' +
    '.evbmb-text{max-width:340px;margin:0 0 20px;font:400 15px/1.55 "Inter","Poppins",system-ui,sans-serif;color:#52443c}' +
    '.evbmb-pane.is-pick .evbmb-text{margin-bottom:4px}' +
    '.evbmb-btns{display:flex;flex-direction:column;align-items:stretch;gap:4px;width:100%;max-width:320px}' +
    '.evbmb-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 28px;border:0;border-radius:999px;background:#f97316;color:#fff;font:700 15px/1 "Montserrat",system-ui,sans-serif;text-decoration:none;cursor:pointer;transition:background .2s,transform .15s}' +
    '.evbmb-btn:hover{background:#ea580c;color:#fff}' +
    '.evbmb-btn:active{transform:scale(.97)}' +
    '.evbmb-btn[disabled]{background:#f3d9c6;color:#9a7b66;cursor:default;transform:none}' +
    '.evbmb-btn svg{width:18px;height:18px}' +
    '.evbmb-text-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:0;border-radius:999px;background:transparent;color:#9a3412;font:600 14px/1 "Inter",system-ui,sans-serif;text-decoration:none;cursor:pointer;transition:background .2s}' +
    '.evbmb-text-btn:hover{color:#9a3412}' +
    '.evbmb-text-btn:hover{background:#fff1e6}' +
    '.evbmb-code{display:flex;align-items:center;gap:12px;width:100%;margin:0 0 10px;padding:12px 8px 12px 18px;background:#fff1e6;border-radius:16px;text-align:left}' +
    '.evbmb-code-txt{flex:1;min-width:0}' +
    '.evbmb-code-lbl{display:block;margin-bottom:2px;font:500 12px/1.3 "Inter",system-ui,sans-serif;color:#7a5a45}' +
    '.evbmb-code-val{display:block;font:800 20px/1.2 "Montserrat",system-ui,sans-serif;letter-spacing:.08em;color:#1f1b16}' +
    '.evbmb-copy{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border:0;border-radius:999px;background:#fff;color:#9a3412;font:600 13px/1 "Inter",system-ui,sans-serif;cursor:pointer;transition:background .2s}' +
    '.evbmb-copy:hover{background:#ffe4cc}' +
    '.evbmb-copy svg{width:18px;height:18px}' +
    '.evbmb-code.is-locked .evbmb-code-val{letter-spacing:.24em;color:#c4ab97}' +
    '.evbmb-lockchip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;background:#fff;color:#9a3412;font:600 13px/1 "Inter",system-ui,sans-serif;white-space:nowrap}' +
    '.evbmb-lockchip svg{width:16px;height:16px}' +
    '.evbmb-lockchip[hidden],.evbmb-copy[hidden],.evbmb-btn[hidden],.evbmb-text-btn[hidden]{display:none}' +
    '.evbmb-note{margin:0 0 18px;font:400 13px/1.5 "Inter",system-ui,sans-serif;color:#7a5a45}' +
    '.evbmb-x:focus-visible,.evbmb-btn:focus-visible,.evbmb-text-btn:focus-visible,.evbmb-copy:focus-visible{outline:3px solid #f97316;outline-offset:2px}' +
    '.evbmb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '@media (max-width:520px){' +
      '.evbmb{padding:12px}' +
      '.evbmb-card{border-radius:24px}' +
      '.evbmb-x{top:12px;right:12px}' +
      '.evbmb-main{padding:18px 12px 14px}' +
      '.evbmb-title{font-size:23px}' +
      '.evbmb-text{font-size:14px;margin-bottom:16px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbmb-card,.evbmb-scrim,.evbmb-inner,.evbmb-lid{transition:none}.evbmb-pane.is-in,.evbmb-bob,.evbmb-rays svg{animation:none!important}}';

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  // A black gift box with a gold ribbon: the body, and the lid with its bow.
  var GOLD = '#e9a23b';
  var BODY_SVG =
    '<svg class="evbmb-body" viewBox="0 0 112 96" aria-hidden="true" focusable="false">' +
      '<rect width="112" height="96" rx="9" fill="#1f1b16"/>' +
      '<rect x="8" y="12" width="4" height="74" rx="2" fill="#2f2822"/>' +
      '<rect x="48" width="16" height="96" fill="' + GOLD + '"/>' +
      '<rect x="51" width="3" height="96" fill="#f6c46a"/>' +
      '<circle cx="56" cy="52" r="16" fill="#f97316"/>' +
      '<text x="56" y="59.5" text-anchor="middle" font-family="Montserrat,system-ui,sans-serif" font-weight="800" font-size="20" fill="#fff">?</text>' +
    '</svg>';
  var LID_SVG =
    '<svg class="evbmb-lid" viewBox="0 0 128 60" aria-hidden="true" focusable="false">' +
      '<path d="M64 28C52 6 26 8 34 24C38 32 54 32 64 28Z" fill="' + GOLD + '"/>' +
      '<path d="M64 28C76 6 102 8 94 24C90 32 74 32 64 28Z" fill="' + GOLD + '"/>' +
      '<path d="M60 26C52 15 41 15 43 22C45 27 54 28 60 26Z" fill="#b8741a"/>' +
      '<path d="M68 26C76 15 87 15 85 22C83 27 74 28 68 26Z" fill="#b8741a"/>' +
      '<rect y="30" width="128" height="28" rx="7" fill="#2a231d"/>' +
      '<rect y="51" width="128" height="7" rx="3.5" fill="#15110d"/>' +
      '<rect x="56" y="30" width="16" height="28" fill="' + GOLD + '"/>' +
      '<rect x="59" y="30" width="3" height="28" fill="#f6c46a"/>' +
      '<rect x="56" y="21" width="16" height="13" rx="5" fill="#f6c46a"/>' +
    '</svg>';
  var RAYS_SVG = (function () {
    var s = '<svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false"><circle r="44" fill="#fff7ef"/>';
    for (var i = 0; i < 16; i += 2) {
      var a0 = i * Math.PI / 8, a1 = (i + 1) * Math.PI / 8;
      s += '<path d="M0 0L' + (100 * Math.sin(a0)).toFixed(1) + ' ' + (-100 * Math.cos(a0)).toFixed(1) +
        'L' + (100 * Math.sin(a1)).toFixed(1) + ' ' + (-100 * Math.cos(a1)).toFixed(1) + 'Z" fill="#ffd9b3"/>';
    }
    return s + '</svg>';
  })();
  var SPARK = 'M12 0L14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4Z';
  var SPARK_COLORS = ['#e9a23b', '#f97316', '#7c2d12', '#f6c46a'];

  function el(tag, cls, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function remember(v) { try { w.localStorage.setItem(KEY, v); } catch (e) {} }

  // Into the checkout draft, unless the visitor already has a code there.
  function saveCode(code) {
    try {
      var draft = JSON.parse(w.localStorage.getItem(DRAFT_KEY) || '{}') || {};
      if (draft.promoCode) return;
      draft.promoCode = code;
      w.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {}
  }

  function push(name, withPrize, extra) {
    var o = { event: name, popup_id: 'welcome_game', page_path: PATH };
    if (withPrize && prize) o.prize_code = prize.code;
    for (var k in extra) o[k] = extra[k];
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push(o);
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // An animation that always settles: a hidden tab can pause it, so a timer
  // moves the game on regardless (the end state is set in styles anyway).
  function play(node, frames, opts) {
    if (!motion) return Promise.resolve();
    var anim = node.animate(frames, opts);
    return Promise.race([
      anim.finished.catch(function () {}),
      wait((opts.duration || 0) + (opts.delay || 0) + 400).then(function () {
        try { anim.finish(); } catch (e) {}
      })
    ]);
  }

  var root, card, row, xBtn, live, lastFocus;
  var paneIntro, panePick, paneWon, shuffleBtn, pickTitle, wonTitle, wonText, codeVal;
  var codeBox, copyBtn, lockChip, wonNote, shopBtn, joinBtn, haveBtn, doneBtn;
  var boxes = [];
  var state = 'ready'; // ready | shuffling | pick | opening | won

  function buildBox(i) {
    var btn = el('button', 'evbmb-box b' + (i + 1));
    btn.type = 'button';
    btn.setAttribute('aria-disabled', 'true');
    var bob = el('span', 'evbmb-bob');
    var inner = el('span', 'evbmb-inner');
    inner.appendChild(el('span', 'evbmb-shadow'));
    var prize = el('span', 'evbmb-prize');
    prize.setAttribute('aria-hidden', 'true');
    inner.appendChild(prize);
    inner.insertAdjacentHTML('beforeend', BODY_SVG + LID_SVG);
    bob.appendChild(inner);
    btn.appendChild(bob);
    var box = { el: btn, inner: inner, prize: prize, lid: inner.querySelector('.evbmb-lid'), slot: i };
    btn.addEventListener('click', function () { pick(box); });
    return box;
  }

  // Where the slots are: the boxes sit centred, a gap apart, as wide as fits.
  function gap() {
    var bw = boxes[0].el.offsetWidth;
    return Math.min(bw * 1.18, (row.clientWidth - bw) / 2 - 4);
  }
  function at(x) { return 'translate(' + x.toFixed(1) + 'px,0) scale(1)'; }
  function place() {
    var g = gap();
    boxes.forEach(function (b) { b.el.style.transform = at((b.slot - 1) * g); });
  }
  function inSlot(s) { return boxes.filter(function (b) { return b.slot === s; })[0]; }

  function build() {
    var style = el('style');
    style.textContent = CSS;
    d.head.appendChild(style);

    root = el('div', 'evbmb');
    root.id = 'evbSpin';
    var scrim = el('div', 'evbmb-scrim');
    scrim.setAttribute('data-close', '');

    card = el('div', 'evbmb-card');
    card.tabIndex = -1;
    card.style.outline = 'none';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'evbmbTitle');

    xBtn = el('button', 'evbmb-x');
    xBtn.type = 'button';
    xBtn.setAttribute('data-close', '');
    xBtn.setAttribute('aria-label', 'Close');
    xBtn.innerHTML = ICON_X;
    card.appendChild(xBtn);

    var stage = el('div', 'evbmb-stage');
    row = el('div', 'evbmb-row' + (mode === 'game' ? ' is-idle' : ''));
    // Unlocking shows just the one box, in the middle.
    for (var i = mode === 'game' ? 0 : 1; i < (mode === 'game' ? 3 : 2); i++) {
      var b = buildBox(i);
      boxes.push(b);
      row.appendChild(b.el);
    }
    stage.appendChild(row);
    card.appendChild(stage);

    var main = el('div', 'evbmb-main');

    // 1. Before the shuffle.
    paneIntro = el('div', 'evbmb-pane');
    var brand = el('p', 'evbmb-brand');
    var mark = el('img');
    mark.src = '/evblogo.webp';
    mark.alt = '';
    brand.appendChild(mark);
    brand.appendChild(el('span', '', 'A welcome gift from East Village Buyers'));
    paneIntro.appendChild(brand);
    var title = el('h2', 'evbmb-title', 'Pick a mystery box');
    title.id = 'evbmbTitle';
    paneIntro.appendChild(title);
    paneIntro.appendChild(el('p', 'evbmb-text', 'Every box hides a welcome gift. Shuffle them up, then choose one.'));
    var btns = el('div', 'evbmb-btns');
    shuffleBtn = el('button', 'evbmb-btn', 'Shuffle the boxes');
    shuffleBtn.type = 'button';
    shuffleBtn.addEventListener('click', shuffle);
    btns.appendChild(shuffleBtn);
    var no = el('button', 'evbmb-text-btn', 'No thanks');
    no.type = 'button';
    no.setAttribute('data-close', '');
    btns.appendChild(no);
    paneIntro.appendChild(btns);
    main.appendChild(paneIntro);

    // 2. Pick one.
    panePick = el('div', 'evbmb-pane is-pick');
    panePick.hidden = true;
    pickTitle = el('h2', 'evbmb-title', 'Now pick a box');
    pickTitle.id = 'evbmbPickTitle';
    pickTitle.tabIndex = -1;
    panePick.appendChild(pickTitle);
    panePick.appendChild(el('p', 'evbmb-text', 'Tap the one you want to open.'));
    main.appendChild(panePick);

    // 3. The prize (its words are filled in when it is won).
    paneWon = el('div', 'evbmb-pane');
    paneWon.hidden = true;
    wonTitle = el('h2', 'evbmb-title');
    wonTitle.id = 'evbmbWonTitle';
    wonTitle.tabIndex = -1;
    paneWon.appendChild(wonTitle);
    wonText = el('p', 'evbmb-text');
    paneWon.appendChild(wonText);
    codeBox = el('div', 'evbmb-code');
    var codeTxt = el('div', 'evbmb-code-txt');
    codeTxt.appendChild(el('span', 'evbmb-code-lbl', 'Your code'));
    codeVal = el('span', 'evbmb-code-val');
    codeTxt.appendChild(codeVal);
    codeBox.appendChild(codeTxt);
    copyBtn = el('button', 'evbmb-copy');
    copyBtn.type = 'button';
    copyBtn.innerHTML = ICON_COPY + '<span>Copy</span>';
    copyBtn.addEventListener('click', function () { copyCode(copyBtn); });
    codeBox.appendChild(copyBtn);
    lockChip = el('span', 'evbmb-lockchip');
    lockChip.innerHTML = ICON_LOCK + '<span>Locked</span>';
    codeBox.appendChild(lockChip);
    paneWon.appendChild(codeBox);
    wonNote = el('p', 'evbmb-note');
    paneWon.appendChild(wonNote);
    var wonBtns = el('div', 'evbmb-btns');
    // Locked: make an account (or sign in) to see the code.
    joinBtn = el('a', 'evbmb-btn');
    joinBtn.href = '/account/';
    joinBtn.innerHTML = '<span>Create my free account</span>' + ICON_ARROW;
    joinBtn.addEventListener('click', function () { push('game_join_click', true); });
    wonBtns.appendChild(joinBtn);
    haveBtn = el('a', 'evbmb-text-btn', 'I already have an account');
    haveBtn.href = '/account/';
    haveBtn.addEventListener('click', function () { push('game_signin_click', true); });
    wonBtns.appendChild(haveBtn);
    // Unlocked.
    var onStore = /^\/store(\/|$)/.test(PATH);
    shopBtn = el('a', 'evbmb-btn');
    shopBtn.href = '/store/';
    shopBtn.innerHTML = '<span></span>' + ICON_ARROW;
    shopBtn.firstChild.textContent = onStore ? 'Keep shopping' : 'Shop the store';
    shopBtn.addEventListener('click', function (e) {
      push('game_shop_click', true);
      if (onStore) { e.preventDefault(); close(); }
    });
    wonBtns.appendChild(shopBtn);
    doneBtn = el('button', 'evbmb-text-btn', 'Close');
    doneBtn.type = 'button';
    doneBtn.setAttribute('data-close', '');
    wonBtns.appendChild(doneBtn);
    paneWon.appendChild(wonBtns);
    main.appendChild(paneWon);

    live = el('p', 'evbmb-sr');
    live.setAttribute('aria-live', 'polite');
    main.appendChild(live);

    card.appendChild(main);
    root.appendChild(scrim);
    root.appendChild(card);
    d.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') trapTab(e);
    });
    w.addEventListener('resize', onResize);
  }

  function onResize() {
    if (root && state !== 'shuffling') place();
  }

  function showPane(pane, labelId) {
    [paneIntro, panePick, paneWon].forEach(function (p) { p.hidden = p !== pane; });
    pane.classList.remove('is-in');
    void pane.offsetWidth;
    pane.classList.add('is-in');
    card.setAttribute('aria-labelledby', labelId);
  }

  function trapTab(e) {
    var f = [].filter.call(root.querySelectorAll('button, a[href]'), function (b) {
      return !b.disabled && b.getClientRects().length;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // Two boxes trade places, one arcing over the other.
  function swap(a, b, dur) {
    var g = gap();
    var xa = (a.slot - 1) * g, xb = (b.slot - 1) * g, mid = (xa + xb) / 2;
    var far = Math.abs(a.slot - b.slot) > 1;
    a.el.style.zIndex = 4;
    b.el.style.zIndex = 2;
    var t = a.slot; a.slot = b.slot; b.slot = t;
    a.el.style.transform = at(xb);
    b.el.style.transform = at(xa);
    var opts = { duration: dur, easing: 'cubic-bezier(.45,.05,.35,1)' };
    return Promise.all([
      play(a.el, [{ transform: at(xa) }, { transform: 'translate(' + mid.toFixed(1) + 'px,' + (far ? -2.4 : -1.7) + 'em) scale(1.07)' }, { transform: at(xb) }], opts),
      play(b.el, [{ transform: at(xb) }, { transform: 'translate(' + mid.toFixed(1) + 'px,.5em) scale(.93)' }, { transform: at(xa) }], opts)
    ]);
  }

  function shuffle() {
    if (state !== 'ready') return;
    state = 'shuffling';
    remember('played');
    push('game_start');
    card.focus({ preventScroll: true });
    shuffleBtn.disabled = true;
    shuffleBtn.textContent = 'Shuffling…';
    xBtn.disabled = true;
    row.classList.remove('is-idle');

    var pairs = [[0, 1], [1, 2], [0, 2]];
    var speeds = motion ? [460, 400, 350, 310, 280, 260, 250, 240] : [0, 0, 0];
    var last = -1;
    var chain = play(row, [{ transform: 'none' }, { transform: 'translateY(-.25em)' }, { transform: 'none' }], { duration: 260 });
    speeds.forEach(function (ms) {
      chain = chain.then(function () {
        var k;
        do { k = Math.floor(Math.random() * 3); } while (k === last);
        last = k;
        return swap(inSlot(pairs[k][0]), inSlot(pairs[k][1]), ms);
      });
    });
    chain.then(function () {
      // Tab order follows what the eye sees.
      [0, 1, 2].forEach(function (s, n) {
        var b = inSlot(s);
        b.el.style.zIndex = '';
        b.el.setAttribute('aria-label', 'Box ' + (n + 1));
        b.el.removeAttribute('aria-disabled');
        row.appendChild(b.el);
      });
      state = 'pick';
      row.classList.add('is-pickable');
      xBtn.disabled = false;
      showPane(panePick, 'evbmbPickTitle');
      live.textContent = 'The boxes are shuffled. Pick one of the three boxes.';
      inSlot(0).el.focus({ preventScroll: true });
    });
  }

  function fill(box, prize, missed) {
    box.prize.innerHTML = '';
    box.prize.appendChild(el('b', '', prize.big));
    box.prize.appendChild(el('small', '', prize.small));
    if (missed) box.prize.classList.add('is-missed');
  }

  // The lid comes off and the prize rises out of the box.
  function openBox(box, winner) {
    var dir = winner ? 1 : -1;
    var lid = play(box.lid, [
      { transform: 'none', opacity: 1 },
      { transform: 'translate(' + (1.6 * dir) + 'em,-3.4em) rotate(' + (24 * dir) + 'deg)', opacity: 0 }
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
    if (!motion) box.lid.style.opacity = '0';
    box.prize.style.opacity = '1';
    box.prize.style.transform = 'translateY(-4.3em)' + (winner ? '' : ' scale(.9)');
    var rise = play(box.prize, [
      { opacity: 0, transform: 'translateY(0) scale(.7)' },
      { opacity: 1, transform: 'translateY(-4.7em) scale(' + (winner ? 1.08 : .95) + ')', offset: .7 },
      { opacity: 1, transform: box.prize.style.transform }
    ], { duration: winner ? 720 : 560, delay: 120, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    return Promise.all([lid, rise]);
  }

  function celebrate(box) {
    var rowBox = row.getBoundingClientRect();
    var r = box.el.getBoundingClientRect();
    var em = parseFloat(getComputedStyle(row).fontSize) || 16;
    var x = r.left - rowBox.left + r.width / 2;
    var y = r.top - rowBox.top + 3.2 * em;

    var rays = el('span', 'evbmb-rays');
    rays.innerHTML = RAYS_SVG;
    rays.style.left = x + 'px';
    rays.style.top = y + 'px';
    row.insertBefore(rays, row.firstChild);
    rays.style.opacity = '1';
    play(rays, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });

    if (!motion) return;
    for (var i = 0; i < 16; i++) {
      var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('class', 'evbmb-spark');
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<path d="' + SPARK + '" fill="' + SPARK_COLORS[i % SPARK_COLORS.length] + '"/>';
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      row.appendChild(s);
      var a = -Math.PI * (0.04 + 0.92 * Math.random());
      var dist = (3.2 + Math.random() * 3.4) * em;
      var size = 0.6 + Math.random() * 0.8;
      (function (node) {
        node.animate([
          { transform: 'translate(0,0) scale(.3) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + (Math.cos(a) * dist).toFixed(1) + 'px,' + (Math.sin(a) * dist).toFixed(1) + 'px) scale(' + size.toFixed(2) + ') rotate(180deg)', opacity: 0 }
        ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' })
          .finished.then(function () { node.remove(); }, function () {});
      })(s);
    }
  }

  function pick(box) {
    if (state !== 'pick') return;
    state = 'opening';
    push('game_pick');
    card.focus({ preventScroll: true });
    row.classList.remove('is-pickable');
    xBtn.disabled = true;
    boxes.forEach(function (b) { b.el.setAttribute('aria-disabled', 'true'); });

    prize = any(WINNABLE);
    var others = boxes.filter(function (b) { return b !== box; });
    var decoys = [any(BIG), any(SMALL)];
    if (Math.random() < 0.5) decoys.reverse();
    fill(box, prize.card, false);
    fill(others[0], decoys[0], true);
    fill(others[1], decoys[1], true);
    box.el.style.zIndex = 4;

    play(box.inner, [
      { transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' },
      { transform: 'rotate(-5deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' }
    ], { duration: 560, easing: 'ease-in-out' })
      .then(function () {
        celebrate(box);
        return openBox(box, true);
      })
      .then(function () { return wait(motion ? 350 : 0); })
      .then(function () {
        return Promise.all(others.map(function (b, n) {
          return wait(n * 160).then(function () { return openBox(b, false); });
        }));
      })
      .then(function () { return wait(motion ? 450 : 0); })
      .then(won);
  }

  // Signed out, the prize waits for an account; signed in, it's theirs now.
  function won() {
    state = 'won';
    var locked = !signedIn();
    if (locked) remember('locked:' + prize.code);
    else { remember('won:' + prize.code); saveCode(prize.code); }
    push('game_win', true, { locked: locked });
    showPrize(locked, prize.title);
  }

  // Back signed in, with a locked prize: the box opens again, code showing.
  function unlock() {
    state = 'won';
    remember('won:' + prize.code);
    saveCode(prize.code);
    push('game_unlock', true);
    var box = boxes[0];
    fill(box, prize.card, false);
    showPrize(false, 'Your prize is unlocked');
    wait(motion ? 380 : 0).then(function () {
      if (!root) return;
      celebrate(box);
      openBox(box, true);
    });
  }

  function showPrize(locked, title) {
    wonTitle.textContent = title;
    wonText.textContent = prize.text;
    codeBox.classList.toggle('is-locked', locked);
    codeVal.textContent = locked ? '••••••' : prize.code;
    if (locked) codeVal.setAttribute('aria-hidden', 'true');
    else codeVal.removeAttribute('aria-hidden');
    copyBtn.hidden = locked;
    lockChip.hidden = !locked;
    wonNote.textContent = locked
      ? 'Create a free account to unlock your code. Members earn points on every purchase, too.'
      : 'It’s saved to your bag and applies at checkout.';
    joinBtn.hidden = haveBtn.hidden = !locked;
    shopBtn.hidden = doneBtn.hidden = locked;
    xBtn.disabled = false;
    showPane(paneWon, 'evbmbWonTitle');
    live.textContent = title + '. ' + prize.text + (locked
      ? ' Create a free account to unlock your code.'
      : ' Code ' + prize.code + ' is saved to your bag.');
    wonTitle.focus({ preventScroll: true });
  }

  function copyCode(btn) {
    function ok() {
      btn.innerHTML = ICON_CHECK + '<span>Copied</span>';
      setTimeout(function () { btn.innerHTML = ICON_COPY + '<span>Copy</span>'; }, 2000);
    }
    var code = prize.code;
    function fallback() {
      var ta = el('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      root.appendChild(ta);
      ta.select();
      try { if (d.execCommand('copy')) ok(); } catch (e) {}
      root.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(ok, fallback);
    } else fallback();
  }

  function open() {
    build();
    place();
    lastFocus = d.activeElement;
    w.requestAnimationFrame(function () {
      place();
      root.classList.add('is-open');
      d.documentElement.classList.add('evbmb-lock');
      if (mode === 'unlock') return unlock();
      setTimeout(function () { shuffleBtn.focus({ preventScroll: true }); }, 250);
    });
    if (mode === 'game') push('game_view');
  }

  function close() {
    if (!root || state === 'shuffling' || state === 'opening') return;
    if (state === 'ready' || state === 'pick') { remember('closed'); push('game_close'); }
    root.classList.remove('is-open');
    d.documentElement.classList.remove('evbmb-lock');
    w.removeEventListener('resize', onResize);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      d.documentElement.removeAttribute('data-evb-spin');
    }, 450);
  }

  // The account page is ready for it once the member is signed in and past
  // the sign-up steps (account.js: the dashboard's points, no .acct-ob).
  function accountReady() {
    return signedIn() && d.querySelector('.acct-points') && !d.querySelector('.acct-ob');
  }

  function start() {
    // Wait out the shop's closure notice (site-nav.js) if it is up.
    (function fire() {
      if (d.getElementById('evbClosure')) return setTimeout(fire, 1000);
      if (ON_ACCOUNT && !accountReady()) return setTimeout(fire, 1000);
      if (ON_ACCOUNT) holdOthers();
      open();
    })();
  }

  function later() { setTimeout(start, DELAY_MS); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', later);
  else later();
})();
