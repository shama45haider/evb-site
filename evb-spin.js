/*
 * The welcome game: a mystery-box dialog shown once per visitor. On the home
 * page it comes 13 seconds after the visitor closes the gold What's New card;
 * elsewhere 13 seconds after they first scroll, once no other pop-up is up.
 * (The file keeps
 * its first name, evb-spin.js, because every page already loads it under
 * that name.)
 *
 * Three gift boxes shuffle; the visitor picks one. It holds one of WINNABLE
 * at even odds (the owner's list, 2026-11-23: 120 points, 150 points, free
 * shipping on a first order over $120, or $5 off for 30 days), and the other
 * two then open to show two of the others. The checkout Worker draws it, not
 * this script (POST /game-draw, asked for as the shuffle starts), and signs
 * a ticket for it: GIFT5 goes on an account only with that ticket, so
 * nobody gets $5 off by typing GIFT5 or editing this page (the owner,
 * 2026-11-23). If the Worker can't be reached, the box holds one of the
 * prizes that need no ticket.
 *
 * The prize is locked until the visitor has an account: a signed-out winner
 * is sent to /account/ to make one (evb_game_v1 = 'locked:ID'), and the
 * first page they see signed in, or their account page once it is past the
 * sign-up steps, opens the box again with the prize showing. Signed in means
 * supabase-js has a session under 'evb-account' (account.js), the same test
 * site-nav.js uses.
 *
 * Collecting it: a code goes into the store's checkout draft
 * (evb_checkout_v1, the same one store-core.js keeps), so the bag and
 * checkout fill it in by themselves. Points go on the member's balance
 * through Supabase (member_claim_game_points, panel 0101). Either way the
 * checkout Worker is told (POST /game-email), which records the prize, emails
 * a code, and holds GIFT5 to 30 days on that account with reminder emails.
 * The codes themselves are on the Worker (square-worker.js,
 * PUBLIC_PROMO_CODES and GAME_PRIZES); change them together.
 *
 * While it is up (or, for an unlock, about to be), <html data-evb-spin>
 * tells the other pop-ups (evb-popups.js, evb-blog-popup.js) to wait.
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
  function session() {
    try {
      var s = JSON.parse(get(SESSION_KEY) || 'null');
      if (!s || !s.access_token) return null;
      if (s.expires_at && s.expires_at * 1000 < Date.now() + 60000) return null;
      return s;
    } catch (e) { return null; }
  }

  // What the picked box can hold, at even odds. A code must exist on the
  // Worker; points are added by panel 0101 (120 or 150 only). ticket: only
  // from the Worker's draw.
  var WINNABLE = [
    { id: 'PTS120', points: 120, name: '120 points', card: { big: '120', small: 'points' },
      text: '120 bonus points for your rewards balance.' },
    { id: 'PTS150', points: 150, name: '150 points', card: { big: '150', small: 'points' },
      text: '150 bonus points for your rewards balance.' },
    { id: 'SPIN120', code: 'SPIN120', name: 'free shipping', card: { big: 'Free', small: 'shipping' },
      text: 'Free shipping on your first order over $120.' },
    { id: 'GIFT5', code: 'GIFT5', days: 30, ticket: true, name: '$5 off', card: { big: '$5', small: 'off' },
      text: '$5 off any order. It’s good for 30 days, and we’ll email you before it runs out.' }
  ];
  function byId(id) { return WINNABLE.filter(function (p) { return p.id === id; })[0] || null; }
  function any(list) { return list[Math.floor(Math.random() * list.length)]; }
  var prize = null; // the one they won

  // The Worker records the prize and emails a code (MAIL_KEY holds the prize
  // until it has answered); points go on the balance through Supabase
  // (POINTS_KEY holds them until they have). With no fresh session on this
  // page (only account.js and checkout refresh it), a later page tries again.
  var MAIL_KEY = 'evb_game_mail';
  var POINTS_KEY = 'evb_game_points';
  var API = 'https://evb-square.shama45haider.workers.dev';
  // Public values, the same as account/account-config.js.
  var SB_URL = 'https://bkiqjirxxodekhnzzlfw.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraXFqaXJ4eG9kZWtobnp6bGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Mjc0NzMsImV4cCI6MjEwMDIwMzQ3M30.XdjdkD7pkSR68cwKP8CGDoczKT7hM3MkAzJLMdrNmT0';

  function waiting(k) { try { return !!w.sessionStorage.getItem(k + '_wait'); } catch (e) { return false; } }
  function wait4visit(k) { try { w.sessionStorage.setItem(k + '_wait', '1'); } catch (e) {} }
  function drop(k) { try { w.localStorage.removeItem(k); } catch (e) {} }

  // The Worker's draw: { prize, ticket }, or null when it can't be reached.
  // TICKET_KEY keeps the ticket until the Worker has recorded the prize.
  var TICKET_KEY = 'evb_game_ticket';
  function draw() {
    if (!w.fetch) return Promise.resolve(null);
    // text/plain, so the browser sends it without a CORS preflight.
    return w.fetch(API + '/game-draw', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && byId(j.prize) && j.ticket ? j : null; }, function () { return null; });
  }

  function tellWorker(id, onDone) {
    var s = session();
    if (!s || !w.fetch || waiting(MAIL_KEY)) return;
    var ticket = get(TICKET_KEY);
    w.fetch(API + '/game-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify(ticket ? { code: id, ticket: ticket } : { code: id })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        // Recorded, or never will be (no such prize, a bad ticket, a ticket
        // already on another account): either way, stop asking.
        if (r.ok || r.status === 400 || r.status === 409) { drop(MAIL_KEY); drop(TICKET_KEY); }
        else if (r.status !== 401) wait4visit(MAIL_KEY);
        if (r.ok && onDone) onDone(j, s.user && s.user.email);
      });
    }, function () {});
  }

  function addPoints(id, onDone) {
    var p = byId(id);
    var s = session();
    if (!p || !p.points) { drop(POINTS_KEY); return; }
    if (!s || !w.fetch || waiting(POINTS_KEY)) return;
    w.fetch(SB_URL + '/rest/v1/rpc/member_claim_game_points', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_points: p.points })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        var done = r.ok && j && (j.status === 'added' || j.status === 'already');
        if (done) drop(POINTS_KEY);
        else if (r.status !== 401) wait4visit(POINTS_KEY);
        if (onDone) onDone(done ? j : null);
      });
    }, function () { if (onDone) onDone(null); });
  }

  var pendingMail = get(MAIL_KEY);
  if (pendingMail) tellWorker(pendingMail);
  var pendingPoints = get(POINTS_KEY);
  if (pendingPoints) addPoints(pendingPoints);

  // 'game': the first visit. 'unlock': a locked prize, now signed in.
  // Once per visitor; without storage we can't remember, so we don't show it.
  var saved;
  try { saved = w.localStorage.getItem(KEY); } catch (e) { return; }
  var mode = 'game';
  var lockedId = /^locked:([A-Z0-9]{2,20})$/.exec(saved || '');
  if (lockedId) {
    prize = byId(lockedId[1]);
    if (!prize) return;
    // The account page waits for the sign-up steps (below, in start()).
    if (!ON_ACCOUNT && !signedIn()) return;
    mode = 'unlock';
  } else if (saved || ON_ACCOUNT) {
    return;
  }

  // While the site's Thanksgiving theme is on (thanksgiving.js on the page),
  // the stage is autumn: linen, maple leaves drifting down, a wooden table,
  // the site's turkey by the tag, and leaves instead of confetti for a win.
  // Take thanksgiving.js off the pages and it is the orange stage again.
  var TG = !!d.querySelector('script[src*="thanksgiving.js"]');
  // The maple leaf and colours thanksgiving.js uses.
  var LEAF = 'M12 1l2 4 4-1-1 4 4 2-3 2 2 3-4 0-1 4-3-3-3 3-1-4-4 0 2-3-3-2 4-2-1-4 4 1z';
  var LEAF_COLORS = ['#f97316', '#b45309', '#f59e0b', '#ea580c', '#7c2d12'];

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
  // The game waits its turn (startGame), so a first visit sees the usual
  // pop-ups first; an unlock opens straight away and holds them back.
  if (mode === 'unlock' && !ON_ACCOUNT) holdOthers();

  var HEAD = '"Montserrat",system-ui,sans-serif';
  var BODY = '"Inter","Poppins",system-ui,sans-serif';
  var CSS =
    '.evbmb{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;visibility:hidden;pointer-events:none}' +
    '.evbmb.is-open{visibility:visible;pointer-events:auto}' +
    'html.evbmb-lock{overflow:hidden}' +
    '.evbmb-scrim{position:absolute;inset:0;background:rgba(24,12,6,.5);opacity:0;transition:opacity .3s ease}' +
    '.evbmb.is-open .evbmb-scrim{opacity:1}' +
    '.evbmb-card{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;overflow-x:hidden;background:#fff;border-radius:28px;' +
      'box-shadow:0 20px 48px rgba(40,12,0,.22);opacity:0;transform:translateY(24px) scale(.97);transition:opacity .45s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1)}' +
    '.evbmb.is-open .evbmb-card{opacity:1;transform:none}' +
    '.evbmb-x{position:absolute;top:12px;right:12px;z-index:8;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:rgba(255,255,255,.92);color:#7a3410;cursor:pointer;box-shadow:0 2px 8px rgba(120,40,0,.2);transition:background .2s,opacity .2s}' +
    '.evbmb-x:hover{background:#fff}' +
    '.evbmb-x[disabled]{opacity:0;pointer-events:none}' +
    '.evbmb-x svg{width:20px;height:20px}' +

    // The stage: faint rays, a podium and the boxes. Box sizes are
    // in em off the row's font size, so the whole set scales with the screen.
    '.evbmb-stage{position:relative;overflow:hidden;padding:52px 8px 20px;background:radial-gradient(125% 95% at 50% 85%,#ffe6ad 0%,#ffc46b 38%,#ff9f4a 72%,#f8812f 100%)}' +
    '.evbmb-burst{position:absolute;left:50%;top:66%;width:780px;height:780px;margin:-390px 0 0 -390px;border-radius:50%;pointer-events:none;' +
      'background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.13) 0deg 8deg,rgba(255,255,255,0) 8deg 22.5deg);' +
      '-webkit-mask-image:radial-gradient(circle,#000 0,#000 16%,transparent 60%);mask-image:radial-gradient(circle,#000 0,#000 16%,transparent 60%)}' +
    '.evbmb-tag{position:absolute;top:16px;left:18px;z-index:5;display:flex;align-items:center;gap:9px;margin:0;font:800 13px/1 ' + HEAD + ';color:#fff;text-shadow:0 1px 2px rgba(140,40,0,.25)}' +
    '.evbmb-tag img{width:26px;height:26px;border-radius:50%;object-fit:cover;background:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.9)}' +
    '.evbmb-row{position:relative;z-index:2;height:13.6em;font-size:clamp(10px,min(3.2vw,2.3vh),15px)}' +
    '.evbmb-podium{position:absolute;left:4%;right:4%;bottom:-.2em;z-index:0;height:2.8em;border-radius:50%;' +
      'background:radial-gradient(ellipse at 50% 30%,#fff4d6 0%,#ffd98a 34%,#ffae55 72%,#f28a36 100%);box-shadow:0 .22em 0 #de7426,0 .6em 1.2em rgba(130,36,0,.18)}' +
    // Thanksgiving (TG, above).
    '.is-tg .evbmb-stage{background:radial-gradient(120% 70% at 50% 92%,#f8d9ad 0%,rgba(248,217,173,0) 62%),linear-gradient(180deg,#fdf8f0 0%,#f8ecd9 58%,#f1dcbd 100%)}' +
    '.is-tg .evbmb-burst{background:repeating-conic-gradient(from 0deg,rgba(217,119,6,.07) 0deg 8deg,rgba(217,119,6,0) 8deg 22.5deg)}' +
    '.is-tg .evbmb-tag{color:#5b2a12;text-shadow:none}' +
    '.is-tg .evbmb-tag img{box-shadow:0 0 0 2px #fff,0 1px 4px rgba(91,42,18,.25)}' +
    '.evbmb-turkey{flex:none;width:30px;height:30px;margin:-6px 0 0 -4px;transform-origin:50% 90%;animation:evbmbStrut 3s ease-in-out infinite}' +
    '@keyframes evbmbStrut{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}' +
    '.is-tg .evbmb-podium{background:repeating-linear-gradient(90deg,rgba(80,36,8,0) 0 2.2em,rgba(80,36,8,.15) 2.2em 2.3em),radial-gradient(ellipse at 50% 30%,#dcaa7c 0%,#bd7d47 48%,#965a2c 100%);box-shadow:0 .24em 0 #6e3d1b,0 .6em 1.2em rgba(70,30,5,.2)}' +
    '.is-tg .evbmb-shadow{background:rgba(70,30,5,.22)}' +
    '.is-tg .evbmb-box:focus-visible{outline-color:#b45309}' +
    '.evbmb-leaves{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none}' +
    '.evbmb-leaf{position:absolute;top:-28px;display:block;animation:evbmbFall linear infinite}' +
    '@keyframes evbmbFall{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(18px,170px) rotate(190deg)}100%{transform:translate(-8px,340px) rotate(380deg)}}' +
    '.evbmb-box{position:absolute;left:50%;bottom:.7em;z-index:2;width:8em;height:9.5em;margin-left:-4em;padding:0;border:0;border-radius:14px;background:none;font:inherit;cursor:default;-webkit-tap-highlight-color:transparent}' +
    '.evbmb-row.is-pickable .evbmb-box{cursor:pointer}' +
    '.evbmb-box:focus-visible{outline:3px solid #fff;outline-offset:6px}' +
    '.evbmb-bob,.evbmb-inner{position:absolute;inset:0;display:block}' +
    '.evbmb-row.is-idle .evbmb-bob,.evbmb-row.is-pickable .evbmb-bob{animation:evbmbBob 3.4s ease-in-out infinite}' +
    '.evbmb-box.b2 .evbmb-bob{animation-delay:-1.1s}' +
    '.evbmb-box.b3 .evbmb-bob{animation-delay:-2.2s}' +
    '@keyframes evbmbBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.22em)}}' +
    '.evbmb-inner{transform-origin:50% 100%;transition:transform .25s cubic-bezier(.2,.8,.2,1)}' +
    '.evbmb-row.is-pickable .evbmb-box:hover .evbmb-inner,.evbmb-row.is-pickable .evbmb-box:focus-visible .evbmb-inner{transform:translateY(-.4em) scale(1.03)}' +
    '.evbmb-row.is-pickable .evbmb-box:hover .evbmb-lid,.evbmb-row.is-pickable .evbmb-box:focus-visible .evbmb-lid{transform:translateY(-.35em) rotate(-5deg)}' +
    '.evbmb-shadow{position:absolute;left:12%;right:12%;bottom:-.4em;height:.9em;border-radius:50%;background:rgba(140,40,0,.2)}' +
    '.evbmb-body{position:absolute;left:.5em;bottom:0;z-index:2;display:block;width:7em;height:6em}' +
    '.evbmb-lid{position:absolute;left:0;top:0;z-index:3;display:block;width:8em;height:3.75em;transform-origin:50% 100%;transition:transform .25s cubic-bezier(.2,.8,.2,1)}' +
    '.evbmb-prize{position:absolute;left:1em;top:4em;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:6em;height:4.4em;background:#fff;border:2px solid #ffd34d;border-radius:.8em;' +
      'box-shadow:0 .3em .8em rgba(150,30,0,.18);font-family:' + HEAD + ';color:#e5172f;opacity:0}' +
    '.evbmb-prize b{font-size:1.5em;font-weight:800;line-height:1;letter-spacing:-.03em}' +
    '.evbmb-prize small{margin-top:.25em;font-size:.66em;font-weight:800;line-height:1.1;letter-spacing:.05em;text-transform:uppercase}' +
    '.evbmb-prize.is-missed{background:#f6f2ee;border-color:#eadfd5;color:#a3958a;box-shadow:none}' +
    '.evbmb-rays{position:absolute;z-index:0;width:14em;height:14em;margin:-7em 0 0 -7em;opacity:0;pointer-events:none}' +
    '.evbmb-rays svg{display:block;width:100%;height:100%}' +
    '.evbmb-spark{position:absolute;z-index:6;width:.95em;height:.95em;margin:-.475em 0 0 -.475em;pointer-events:none}' +
    '.evbmb-confetti{position:absolute;inset:0;z-index:7;overflow:hidden;pointer-events:none}' +
    '.evbmb-confetti i,.evbmb-confetti svg{position:absolute;top:-16px;display:block}' +
    '.evbmb-confetti i{border-radius:2px}' +

    // The words under the stage.
    '.evbmb-main{position:relative;padding:20px 22px 18px}' +
    '.evbmb-pane{display:flex;flex-direction:column;align-items:center;text-align:center}' +
    '.evbmb-pane[hidden]{display:none}' +
    '.evbmb-pane.is-in{animation:evbmbIn .45s cubic-bezier(.22,1,.36,1)}' +
    '@keyframes evbmbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.evbmb-title{margin:0 0 6px;font:800 24px/1.15 ' + HEAD + ';letter-spacing:-.025em;color:#17110c}' +
    '.evbmb-title span{color:#f2460d}' +
    '.evbmb-title:focus{outline:none}' +
    '.evbmb-text{max-width:350px;margin:0 0 16px;font:500 14.5px/1.5 ' + BODY + ';color:#5d4d43}' +
    '.evbmb-pane.is-pick .evbmb-text{margin-bottom:4px}' +
    '.evbmb-odds{width:100%;margin:0 0 18px}' +
    '.evbmb-odds-lbl{margin:0 0 9px;font:800 11px/1 ' + HEAD + ';letter-spacing:.09em;text-transform:uppercase;color:#b4532a}' +
    '.evbmb-coupons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
    '.evbmb-coupon{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60px;padding:8px 4px;background:#fff1e8;border-radius:11px;color:#ea3a0c}' +
    '.evbmb-coupon::before,.evbmb-coupon::after{content:"";position:absolute;top:50%;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:#fff}' +
    '.evbmb-coupon::before{left:-5px}' +
    '.evbmb-coupon::after{right:-5px}' +
    '.evbmb-coupon b{font:800 19px/1 ' + HEAD + ';letter-spacing:-.03em}' +
    '.evbmb-coupon span{margin-top:5px;font:800 9.5px/1 ' + HEAD + ';letter-spacing:.06em;text-transform:uppercase}' +
    '.evbmb-fine{margin:10px 0 0;font:500 11.5px/1.45 ' + BODY + ';color:#9b8579}' +
    '.evbmb-btns{display:flex;flex-direction:column;align-items:stretch;gap:6px;width:100%;max-width:340px}' +
    '.evbmb-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px;padding:0 28px;border:0;border-radius:999px;' +
      'background:#f25a0c;box-shadow:0 6px 16px rgba(242,90,12,.24);' +
      'color:#fff;font:800 16px/1 ' + HEAD + ';text-decoration:none;cursor:pointer;transition:transform .12s,box-shadow .2s,background .2s}' +
    '.evbmb-btn:hover{background:#e14f07;color:#fff}' +
    '.evbmb-btn:active{transform:translateY(1px);box-shadow:0 3px 8px rgba(242,90,12,.22)}' +
    '.evbmb-btn[disabled]{background:#ffcfae;box-shadow:none;cursor:default;transform:none}' +
    '.evbmb-btn svg{width:18px;height:18px}' +
    '.evbmb-text-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border:0;border-radius:999px;background:transparent;color:#9b8579;font:600 13.5px/1 ' + BODY + ';text-decoration:none;cursor:pointer;transition:background .2s,color .2s}' +
    '.evbmb-text-btn:hover{background:#fff1e8;color:#8a3a12}' +

    // The prize ticket.
    '.evbmb-code{position:relative;display:flex;align-items:stretch;width:100%;margin:2px 0 12px;background:#fff1e8;border-radius:16px;text-align:left}' +
    '.evbmb-code::before,.evbmb-code::after{content:"";position:absolute;left:91px;z-index:2;width:16px;height:16px;border-radius:50%;background:#fff}' +
    '.evbmb-code::before{top:-8px}' +
    '.evbmb-code::after{bottom:-8px}' +
    '.evbmb-stub{flex:none;width:99px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 6px;border-radius:16px 0 0 16px;border-right:2px dashed rgba(255,255,255,.75);' +
      'background:linear-gradient(160deg,#ff9a3c 0%,#f25a0c 100%);color:#fff;text-align:center}' +
    '.evbmb-stub b{font:800 26px/1 ' + HEAD + ';letter-spacing:-.03em}' +
    '.evbmb-stub small{margin-top:5px;font:800 10px/1 ' + HEAD + ';letter-spacing:.08em;text-transform:uppercase}' +
    '.evbmb-code-txt{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:12px 6px 12px 18px}' +
    '.evbmb-code-lbl{display:block;margin-bottom:2px;font:600 11.5px/1.3 ' + BODY + ';color:#9a5a3c}' +
    '.evbmb-code-val{display:block;font:800 20px/1.2 ' + HEAD + ';letter-spacing:.05em;color:#17110c;overflow-wrap:anywhere}' +
    '.evbmb-code-sub{display:block;margin-top:3px;font:700 11.5px/1.3 ' + BODY + ';color:#e2380d}' +
    '.evbmb-code-sub:empty{display:none}' +
    '.evbmb-code.is-locked .evbmb-code-val{letter-spacing:.2em;color:#d9b9a3}' +
    '.evbmb-copy,.evbmb-chip{align-self:center;flex:none;display:inline-flex;align-items:center;gap:6px;min-height:38px;margin-right:10px;padding:0 14px;border:0;border-radius:999px;font:800 12.5px/1 ' + HEAD + ';white-space:nowrap}' +
    '.evbmb-copy{background:#f25a0c;color:#fff;cursor:pointer;transition:background .2s}' +
    '.evbmb-copy:hover{background:#e14f07}' +
    '.evbmb-chip{background:#fff;color:#b4400f}' +
    '.evbmb-chip.is-ok{background:#e6f6ec;color:#12723a}' +
    '.evbmb-copy svg,.evbmb-chip svg{width:16px;height:16px}' +
    '.evbmb-chip[hidden],.evbmb-copy[hidden],.evbmb-btn[hidden],.evbmb-text-btn[hidden]{display:none}' +
    '.evbmb-note{max-width:360px;margin:0 0 16px;font:500 13px/1.5 ' + BODY + ';color:#7a6357}' +
    '.evbmb-x:focus-visible,.evbmb-btn:focus-visible,.evbmb-text-btn:focus-visible,.evbmb-copy:focus-visible{outline:3px solid #f97316;outline-offset:2px}' +
    '.evbmb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +

    // Phones: a sheet from the bottom of the screen.
    '@media (max-width:520px){' +
      '.evbmb{align-items:flex-end;padding:0}' +
      '.evbmb-card{max-width:none;max-height:94vh;max-height:94dvh;border-radius:26px 26px 0 0;padding-bottom:env(safe-area-inset-bottom);transform:translateY(100%)}' +
      '.evbmb-stage{padding-top:50px}' +
      '.evbmb-main{padding:16px 16px 12px}' +
      '.evbmb-title{font-size:22px}' +
      '.evbmb-text{font-size:14px;margin-bottom:14px}' +
      '.evbmb-odds{margin-bottom:14px}' +
      '.evbmb-coupons{gap:7px}' +
      '.evbmb-coupon{min-height:54px}' +
      '.evbmb-coupon b{font-size:17px}' +
      '.evbmb-coupon span{font-size:8.5px}' +
      '.evbmb-btn{min-height:52px;font-size:16px}' +
      '.evbmb-stub{width:88px}' +
      '.evbmb-code::before,.evbmb-code::after{left:80px}' +
      '.evbmb-stub b{font-size:23px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.evbmb-card,.evbmb-scrim,.evbmb-inner,.evbmb-lid{transition:none}' +
      '.evbmb-pane.is-in,.evbmb-bob,.evbmb-turkey{animation:none!important}' +
      '.evbmb-leaf{animation:none!important;top:var(--rest)!important}}';

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  // A glossy red gift box with a gold ribbon: the body, and the lid with its
  // bow. The gradients are defined once (DEFS_SVG) and shared by every box.
  var DEFS_SVG =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="evbmbRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5252"/><stop offset="1" stop-color="#d40c27"/></linearGradient>' +
      '<linearGradient id="evbmbRedLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#e3142f"/></linearGradient>' +
      '<linearGradient id="evbmbGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffc42e"/><stop offset=".45" stop-color="#fff0a3"/><stop offset="1" stop-color="#f5a300"/></linearGradient>' +
    '</defs></svg>';
  var BODY_SVG =
    '<svg class="evbmb-body" viewBox="0 0 112 96" aria-hidden="true" focusable="false">' +
      '<rect width="112" height="96" rx="9" fill="url(#evbmbRed)"/>' +
      '<path d="M78 0h25a9 9 0 0 1 9 9v78a9 9 0 0 1-9 9H78Z" fill="#000" fill-opacity=".1"/>' +
      '<rect x="9" y="10" width="5" height="76" rx="2.5" fill="#fff" fill-opacity=".3"/>' +
      '<rect x="48" width="16" height="96" fill="url(#evbmbGold)"/>' +
      '<circle cx="56" cy="54" r="17" fill="#fff"/>' +
      '<circle cx="56" cy="54" r="17" fill="none" stroke="#ffcf3f" stroke-width="3"/>' +
      '<text x="56" y="62" text-anchor="middle" font-family="Montserrat,system-ui,sans-serif" font-weight="900" font-size="22" fill="#e0102a">?</text>' +
    '</svg>';
  var LID_SVG =
    '<svg class="evbmb-lid" viewBox="0 0 128 60" aria-hidden="true" focusable="false">' +
      '<path d="M64 28C52 6 26 8 34 24C38 32 54 32 64 28Z" fill="url(#evbmbGold)"/>' +
      '<path d="M64 28C76 6 102 8 94 24C90 32 74 32 64 28Z" fill="url(#evbmbGold)"/>' +
      '<path d="M60 26C52 15 41 15 43 22C45 27 54 28 60 26Z" fill="#e08600"/>' +
      '<path d="M68 26C76 15 87 15 85 22C83 27 74 28 68 26Z" fill="#e08600"/>' +
      '<rect y="30" width="128" height="28" rx="7" fill="url(#evbmbRedLid)"/>' +
      '<rect x="7" y="33" width="114" height="4" rx="2" fill="#fff" fill-opacity=".32"/>' +
      '<rect y="51" width="128" height="7" rx="3.5" fill="#a30b1f"/>' +
      '<rect x="56" y="30" width="16" height="28" fill="url(#evbmbGold)"/>' +
      '<rect x="56" y="21" width="16" height="13" rx="5" fill="#ffd84d"/>' +
    '</svg>';
  // White rays on the orange stage; amber ones on the Thanksgiving linen.
  var RAYS_SVG = (function (c) {
    var s = '<svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false"><circle r="40" fill="' + c + '" fill-opacity=".4"/>';
    for (var i = 0; i < 16; i += 2) {
      var a0 = i * Math.PI / 8, a1 = (i + 1) * Math.PI / 8;
      s += '<path d="M0 0L' + (100 * Math.sin(a0)).toFixed(1) + ' ' + (-100 * Math.cos(a0)).toFixed(1) +
        'L' + (100 * Math.sin(a1)).toFixed(1) + ' ' + (-100 * Math.cos(a1)).toFixed(1) + 'Z" fill="' + c + '" fill-opacity=".28"/>';
    }
    return s + '</svg>';
  })(TG ? '#f59e0b' : '#fff');
  var SPARK = 'M12 0L14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4Z';
  var SPARK_COLORS = TG ? ['#f59e0b', '#ea580c', '#fcd34d'] : ['#ffffff', '#ffe08a', '#ffb347'];
  // thanksgiving.js's turkey, a little smaller, strutting by the tag.
  var TURKEY_SVG =
    '<svg class="evbmb-turkey" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<g transform="translate(32 34)">' +
        '<ellipse rx="7" ry="20" fill="#7c2d12" transform="rotate(-60)"/>' +
        '<ellipse rx="7" ry="20" fill="#c2410c" transform="rotate(-30)"/>' +
        '<ellipse rx="7" ry="20" fill="#f59e0b" transform="rotate(0)"/>' +
        '<ellipse rx="7" ry="20" fill="#c2410c" transform="rotate(30)"/>' +
        '<ellipse rx="7" ry="20" fill="#7c2d12" transform="rotate(60)"/>' +
        '<ellipse rx="6" ry="17" fill="#f97316" transform="rotate(-45)"/>' +
        '<ellipse rx="6" ry="17" fill="#f97316" transform="rotate(45)"/>' +
      '</g>' +
      '<circle cx="32" cy="40" r="13" fill="#78350f"/>' +
      '<circle cx="32" cy="27" r="7" fill="#92400e"/>' +
      '<circle cx="29.5" cy="26" r="1.4" fill="#fff"/><circle cx="34.5" cy="26" r="1.4" fill="#fff"/>' +
      '<circle cx="29.5" cy="26" r=".7" fill="#111"/><circle cx="34.5" cy="26" r=".7" fill="#111"/>' +
      '<path d="M30 29h4l-2 3z" fill="#fbbf24"/>' +
      '<path d="M33 30c2 1 2 4 0 5-1-1-1-3 0-5z" fill="#dc2626"/>' +
      '<path d="M27 52v5M37 52v5" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  // Leaves drifting down behind the boxes, each in its own lane so they never
  // bunch up, and already mid-fall when the dialog opens.
  function fallingLeaves() {
    var layer = el('span', 'evbmb-leaves');
    layer.setAttribute('aria-hidden', 'true');
    var n = 9;
    for (var i = 0; i < n; i++) {
      var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('class', 'evbmb-leaf');
      var size = 13 + Math.random() * 9, dur = 9 + Math.random() * 6;
      s.style.width = s.style.height = size.toFixed(0) + 'px';
      s.style.left = ((i + .15 + Math.random() * .6) / n * 100).toFixed(1) + '%';
      s.style.opacity = (.7 + Math.random() * .3).toFixed(2);
      s.style.animationDuration = dur.toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * dur).toFixed(1) + 's';
      // Where it rests when motion is reduced.
      s.style.setProperty('--rest', (10 + Math.random() * 62).toFixed(0) + '%');
      s.innerHTML = '<path d="' + LEAF + '" fill="' + LEAF_COLORS[i % LEAF_COLORS.length] + '"/>';
      layer.appendChild(s);
    }
    return layer;
  }
  var CONFETTI_COLORS = ['#ff5a3d', '#ffb21a', '#ffd76a', '#ffffff', '#ff8a2a'];

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
    if (withPrize && prize) o.prize_code = prize.id;
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
  var paneIntro, panePick, paneWon, shuffleBtn, pickTitle, wonTitle, wonText;
  var codeBox, stubBig, stubSmall, codeLbl, codeVal, codeSub, copyBtn, lockChip, okChip, wonNote;
  var shopBtn, joinBtn, haveBtn, doneBtn;
  var boxes = [];
  var state = 'ready'; // ready | shuffling | pick | opening | won
  var drawing = null; // the Worker's draw, under way

  function buildBox(i) {
    var btn = el('button', 'evbmb-box b' + (i + 1));
    btn.type = 'button';
    btn.setAttribute('aria-disabled', 'true');
    var bob = el('span', 'evbmb-bob');
    var inner = el('span', 'evbmb-inner');
    inner.appendChild(el('span', 'evbmb-shadow'));
    var slot = el('span', 'evbmb-prize');
    slot.setAttribute('aria-hidden', 'true');
    inner.appendChild(slot);
    inner.insertAdjacentHTML('beforeend', BODY_SVG);
    inner.insertAdjacentHTML('beforeend', LID_SVG);
    bob.appendChild(inner);
    btn.appendChild(bob);
    var box = { el: btn, inner: inner, prize: slot, lid: inner.querySelector('.evbmb-lid'), slot: i };
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

  // A title with its last words in the accent colour.
  function setTitle(node, lead, accent) {
    node.textContent = lead;
    if (accent) node.appendChild(el('span', '', accent));
  }

  function build() {
    var style = el('style');
    style.textContent = CSS;
    d.head.appendChild(style);

    root = el('div', 'evbmb' + (TG ? ' is-tg' : ''));
    root.id = 'evbSpin';
    root.insertAdjacentHTML('afterbegin', DEFS_SVG);
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
    stage.appendChild(el('span', 'evbmb-burst'));
    if (TG) stage.appendChild(fallingLeaves());
    var tag = el('p', 'evbmb-tag');
    var mark = el('img');
    mark.src = '/evblogo.webp';
    mark.alt = '';
    tag.appendChild(mark);
    // Just the logo (and the turkey at Thanksgiving): the owner took the
    // "Thanksgiving gift · 1 free pick" words off, 2026-11-23.
    if (TG) tag.insertAdjacentHTML('beforeend', TURKEY_SVG);
    stage.appendChild(tag);
    row = el('div', 'evbmb-row' + (mode === 'game' ? ' is-idle' : ''));
    row.appendChild(el('span', 'evbmb-podium'));
    // Unlocking shows just the one box, in the middle.
    for (var i = mode === 'game' ? 0 : 1; i < (mode === 'game' ? 3 : 2); i++) {
      var b = buildBox(i);
      boxes.push(b);
      row.appendChild(b.el);
    }
    stage.appendChild(row);
    card.appendChild(stage);

    var main = el('div', 'evbmb-main');

    // 1. Before the shuffle: what's in the boxes.
    paneIntro = el('div', 'evbmb-pane');
    var title = el('h2', 'evbmb-title');
    setTitle(title, 'Pick a ', 'mystery box');
    title.id = 'evbmbTitle';
    paneIntro.appendChild(title);
    paneIntro.appendChild(el('p', 'evbmb-text', 'Shuffle the boxes, then pick one. Whichever you choose, you win.'));
    var odds = el('div', 'evbmb-odds');
    odds.appendChild(el('p', 'evbmb-odds-lbl', 'Your box holds one of these'));
    var list = el('div', 'evbmb-coupons');
    WINNABLE.forEach(function (p) {
      var c = el('div', 'evbmb-coupon');
      c.appendChild(el('b', '', p.card.big));
      c.appendChild(el('span', '', p.card.small));
      list.appendChild(c);
    });
    odds.appendChild(list);
    odds.appendChild(el('p', 'evbmb-fine', 'Points go on your rewards balance. Free shipping is for a first order over $120. $5 off is good for 30 days.'));
    paneIntro.appendChild(odds);
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
    pickTitle = el('h2', 'evbmb-title');
    setTitle(pickTitle, 'Now ', 'pick a box');
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
    var stub = el('div', 'evbmb-stub');
    stub.setAttribute('aria-hidden', 'true');
    stubBig = el('b');
    stubSmall = el('small');
    stub.appendChild(stubBig);
    stub.appendChild(stubSmall);
    codeBox.appendChild(stub);
    var codeTxt = el('div', 'evbmb-code-txt');
    codeLbl = el('span', 'evbmb-code-lbl');
    codeTxt.appendChild(codeLbl);
    codeVal = el('span', 'evbmb-code-val');
    codeTxt.appendChild(codeVal);
    codeSub = el('span', 'evbmb-code-sub');
    codeTxt.appendChild(codeSub);
    codeBox.appendChild(codeTxt);
    copyBtn = el('button', 'evbmb-copy');
    copyBtn.type = 'button';
    copyBtn.innerHTML = ICON_COPY + '<span>Copy</span>';
    copyBtn.addEventListener('click', function () { copyCode(copyBtn); });
    codeBox.appendChild(copyBtn);
    lockChip = el('span', 'evbmb-chip');
    lockChip.innerHTML = ICON_LOCK + '<span>Locked</span>';
    codeBox.appendChild(lockChip);
    okChip = el('span', 'evbmb-chip is-ok');
    okChip.innerHTML = ICON_CHECK + '<span>Added</span>';
    codeBox.appendChild(okChip);
    paneWon.appendChild(codeBox);
    wonNote = el('p', 'evbmb-note');
    paneWon.appendChild(wonNote);
    var wonBtns = el('div', 'evbmb-btns');
    // Locked: make an account (or sign in) to collect it.
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
      play(a.el, [{ transform: at(xa) }, { transform: 'translate(' + mid.toFixed(1) + 'px,' + (far ? -1.8 : -1.25) + 'em) scale(1.04)' }, { transform: at(xb) }], opts),
      play(b.el, [{ transform: at(xb) }, { transform: 'translate(' + mid.toFixed(1) + 'px,.35em) scale(.96)' }, { transform: at(xa) }], opts)
    ]);
  }

  function shuffle() {
    if (state !== 'ready') return;
    state = 'shuffling';
    remember('played');
    drawing = draw();
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

  function fill(box, p, missed) {
    box.prize.innerHTML = '';
    box.prize.appendChild(el('b', '', p.card.big));
    box.prize.appendChild(el('small', '', p.card.small));
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
      { opacity: 1, transform: 'translateY(-4.7em) scale(' + (winner ? 1.05 : .95) + ')', offset: .7 },
      { opacity: 1, transform: box.prize.style.transform }
    ], { duration: winner ? 720 : 560, delay: 120, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    return Promise.all([lid, rise]);
  }

  // Confetti over the whole card (leaves at Thanksgiving).
  function confetti() {
    if (!motion) return;
    var layer = el('div', 'evbmb-confetti');
    layer.setAttribute('aria-hidden', 'true');
    card.appendChild(layer);
    var h = Math.max(card.scrollHeight, card.clientHeight) + 40;
    var longest = 0;
    for (var i = 0; i < 22; i++) {
      var p;
      if (TG) {
        p = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
        p.setAttribute('viewBox', '0 0 24 24');
        p.innerHTML = '<path d="' + LEAF + '" fill="' + LEAF_COLORS[i % LEAF_COLORS.length] + '"/>';
        p.style.width = p.style.height = (12 + Math.random() * 9).toFixed(1) + 'px';
      } else {
        p = el('i');
        var wide = 6 + Math.random() * 5;
        p.style.width = wide.toFixed(1) + 'px';
        p.style.height = (Math.random() < .3 ? wide : wide * 1.7).toFixed(1) + 'px';
        if (Math.random() < .25) p.style.borderRadius = '50%';
        p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      }
      p.style.left = (Math.random() * 100).toFixed(1) + '%';
      layer.appendChild(p);
      var dur = 1500 + Math.random() * 1300, delay = Math.random() * 350;
      longest = Math.max(longest, dur + delay);
      var sway = (Math.random() * 80 - 40).toFixed(0);
      p.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + sway + 'px,' + (h * .6).toFixed(0) + 'px) rotate(' + (Math.random() * 540).toFixed(0) + 'deg)', opacity: 1, offset: .7 },
        { transform: 'translate(' + (-sway / 2).toFixed(0) + 'px,' + h.toFixed(0) + 'px) rotate(' + (Math.random() * 900).toFixed(0) + 'deg)', opacity: 0 }
      ], { duration: dur, delay: delay, easing: 'cubic-bezier(.25,.6,.45,1)', fill: 'both' });
    }
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, longest + 200);
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
    confetti();
    for (var i = 0; i < 10; i++) {
      var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('class', 'evbmb-spark');
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<path d="' + SPARK + '" fill="' + SPARK_COLORS[i % SPARK_COLORS.length] + '"/>';
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      row.appendChild(s);
      var a = -Math.PI * (0.04 + 0.92 * Math.random());
      var dist = (2.8 + Math.random() * 2.6) * em;
      var size = 0.6 + Math.random() * 0.9;
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

    var others = boxes.filter(function (b) { return b !== box; });
    box.el.style.zIndex = 4;

    var shake = play(box.inner, [
      { transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' },
      { transform: 'rotate(-2.5deg)' }, { transform: 'rotate(1.5deg)' }, { transform: 'rotate(0)' }
    ], { duration: 560, easing: 'ease-in-out' });
    // The Worker's draw, asked for when the shuffle began.
    var drawn = Promise.race([drawing || Promise.resolve(null), wait(6000).then(function () { return null; })]);

    Promise.all([shake, drawn])
      .then(function (res) {
        var got = res[1];
        prize = got ? byId(got.prize) : any(WINNABLE.filter(function (p) { return !p.ticket; }));
        try {
          if (got) w.localStorage.setItem(TICKET_KEY, got.ticket);
          else w.localStorage.removeItem(TICKET_KEY);
        } catch (e) {}
        // The other two boxes show two of the other prizes.
        var rest = WINNABLE.filter(function (p) { return p !== prize; });
        var first = any(rest);
        var decoys = [first, any(rest.filter(function (p) { return p !== first; }))];
        fill(box, prize, false);
        fill(others[0], decoys[0], true);
        fill(others[1], decoys[1], true);
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
    if (locked) remember('locked:' + prize.id);
    else remember('won:' + prize.id);
    push('game_win', true, { locked: locked });
    showPrize(locked, 'You won ', prize.name);
    if (!locked) collect();
  }

  // Back signed in, with a locked prize: the box opens again, prize showing.
  function unlock() {
    state = 'won';
    remember('won:' + prize.id);
    push('game_unlock', true);
    var box = boxes[0];
    fill(box, prize, false);
    showPrize(false, 'Your prize is ', 'unlocked');
    collect();
    wait(motion ? 380 : 0).then(function () {
      if (!root) return;
      celebrate(box);
      openBox(box, true);
    });
  }

  // Makes the prize theirs: a code into the bag, points onto the balance,
  // and the Worker told (it records the prize and emails a code).
  function collect() {
    if (prize.code) saveCode(prize.code);
    if (prize.points) {
      try { w.localStorage.setItem(POINTS_KEY, prize.id); } catch (e) {}
      addPoints(prize.id, function (j) {
        if (!root || state !== 'won') return;
        if (j) {
          okChip.hidden = false;
          wonNote.textContent = j.status === 'already'
            ? 'You already had your game points, so your balance stays as it is.'
            : 'They’re on your rewards balance now. Spend points for money off on your account page.';
        } else {
          wonNote.textContent = 'We’ll add them to your balance as soon as Rewards is open on your account.';
        }
      });
    }
    try { w.localStorage.setItem(MAIL_KEY, prize.id); } catch (e) {}
    tellWorker(prize.id, function (j, email) {
      if (!root || state !== 'won' || !prize.code) return;
      if (prize.days && j && j.expiresAt) codeSub.textContent = 'Use it by ' + dayName(j.expiresAt);
      if (j && j.sent) wonNote.textContent = 'It’s saved to your bag, and we emailed it to ' + (email || 'you') + '.';
    });
  }

  function dayName(ms) {
    try { return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
    catch (e) { return 'the date in your email'; }
  }

  function showPrize(locked, lead, accent) {
    setTitle(wonTitle, lead, accent);
    wonText.textContent = prize.text;
    stubBig.textContent = prize.card.big;
    stubSmall.textContent = prize.card.small;
    codeBox.classList.toggle('is-locked', locked);
    var points = !!prize.points;
    codeLbl.textContent = points ? 'Rewards points' : 'Your code';
    codeVal.textContent = locked ? (points ? '+•••' : '••••••') : (points ? '+' + prize.points : prize.code);
    if (locked) codeVal.setAttribute('aria-hidden', 'true');
    else codeVal.removeAttribute('aria-hidden');
    codeSub.textContent = prize.days ? (locked ? 'Good for 30 days once unlocked' : 'Good for 30 days') : '';
    copyBtn.hidden = locked || points;
    lockChip.hidden = !locked;
    okChip.hidden = true;
    wonNote.textContent = locked
      ? (points
        ? 'Create a free account to collect your points. Members earn points on every purchase, too.'
        : 'Create a free account to unlock your code, and we’ll email it to you. Members earn points on every purchase, too.')
      : (points ? 'Adding them to your rewards balance…' : 'It’s saved to your bag and applies at checkout.');
    joinBtn.hidden = haveBtn.hidden = !locked;
    shopBtn.hidden = doneBtn.hidden = locked;
    xBtn.disabled = false;
    showPane(paneWon, 'evbmbWonTitle');
    live.textContent = lead + (accent || '') + '. ' + prize.text + (locked
      ? ' Create a free account to collect it.'
      : points ? ' The points are going on your rewards balance.' : ' Code ' + prize.code + ' is saved to your bag.');
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

  // Another pop-up that's up: the shop's closure notice (site-nav.js) or a
  // panel pop-up (evb-popups.js, which since 2026-11-23 also draws What's
  // New and the "always buying" ones; #wnWrap and .evbbp are their old,
  // built-in forms, still on a page cached from before).
  function otherDialogUp() {
    var wn = d.getElementById('wnWrap');
    return !!d.getElementById('evbClosure') ||
      !!d.querySelector('.evbp.is-open, .evbbp.is-open') ||
      !!(wn && w.getComputedStyle(wn).display !== 'none');
  }

  function start() {
    (function fire() {
      if (otherDialogUp()) return setTimeout(fire, 1000);
      if (ON_ACCOUNT && !accountReady()) return setTimeout(fire, 1000);
      if (mode === 'game' || ON_ACCOUNT) holdOthers();
      open();
    })();
  }

  // The game comes GAME_AFTER_MS after the visitor first scrolls, counted
  // across the pages of one visit (sessionStorage), once nothing else is up.
  var GAME_AFTER_MS = 13000;
  var SCROLL_KEY = 'evb_game_scroll';
  // On the home page the gold What's New card comes first: a panel pop-up
  // since 2026-11-23, drawn by evb-popups.js, which keeps <html
  // data-evb-popup-wait> on until it has been closed (data-evb-popup-closed)
  // or there is none to show this visit. The game then follows GAME_AFTER_MS
  // after the visitor closes that card; with no card, it goes by the scroll.
  var HOME = PATH === '/' || PATH === '/index.html';
  function goldCardPending() {
    return HOME && d.documentElement.hasAttribute('data-evb-popup-wait');
  }
  function startGame() {
    if (goldCardPending()) {
      (function waitForGold() {
        if (goldCardPending()) return setTimeout(waitForGold, 500);
        if (d.documentElement.hasAttribute('data-evb-popup-closed')) setTimeout(start, GAME_AFTER_MS);
        else afterScroll();
      })();
      return;
    }
    afterScroll();
  }
  function afterScroll() {
    var began = 0;
    try { began = Number(w.sessionStorage.getItem(SCROLL_KEY)) || 0; } catch (e) {}
    function arm(since) {
      setTimeout(start, Math.max(GAME_AFTER_MS - (Date.now() - since), DELAY_MS));
    }
    if (began) return arm(began);
    w.addEventListener('scroll', function first() {
      w.removeEventListener('scroll', first);
      var now = Date.now();
      try { w.sessionStorage.setItem(SCROLL_KEY, String(now)); } catch (e) {}
      arm(now);
    }, { passive: true });
  }

  function later() {
    if (mode === 'game') startGame();
    else setTimeout(start, DELAY_MS);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', later);
  else later();
})();
