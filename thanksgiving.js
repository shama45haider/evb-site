(function () {
  var ORANGE = '#f97316';
  var turkeySVG =
    '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<g transform="translate(32 34)">' +
        '<ellipse rx="7" ry="20" fill="#7c2d12" transform="rotate(-60)"/>' +
        '<ellipse rx="7" ry="20" fill="#c2410c" transform="rotate(-30)"/>' +
        '<ellipse rx="7" ry="20" fill="#f59e0b" transform="rotate(0)"/>' +
        '<ellipse rx="7" ry="20" fill="#c2410c" transform="rotate(30)"/>' +
        '<ellipse rx="7" ry="20" fill="#7c2d12" transform="rotate(60)"/>' +
        '<ellipse rx="6" ry="17" fill="' + ORANGE + '" transform="rotate(-45)"/>' +
        '<ellipse rx="6" ry="17" fill="' + ORANGE + '" transform="rotate(45)"/>' +
      '</g>' +
      '<circle cx="32" cy="40" r="13" fill="#78350f"/>' +
      '<circle cx="32" cy="27" r="7" fill="#92400e"/>' +
      '<circle cx="29.5" cy="26" r="1.4" fill="#fff"/><circle cx="34.5" cy="26" r="1.4" fill="#fff"/>' +
      '<circle cx="29.5" cy="26" r=".7" fill="#111"/><circle cx="34.5" cy="26" r=".7" fill="#111"/>' +
      '<path d="M30 29h4l-2 3z" fill="#fbbf24"/>' +
      '<path d="M33 30c2 1 2 4 0 5-1-1-1-3 0-5z" fill="#dc2626"/>' +
      '<path d="M27 52v5M37 52v5" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';
  var leafPath = 'M12 1l2 4 4-1-1 4 4 2-3 2 2 3-4 0-1 4-3-3-3 3-1-4-4 0 2-3-3-2 4-2-1-4 4 1z';

  var css = `
.site-nav-logo.tg-logo{position:relative;display:inline-block;overflow:visible}
.tg-logo .tg-logo-leaves{position:absolute;left:-18px;top:-16px;width:46px;height:40px;pointer-events:none}
.tg-logo .tg-logo-turkey{position:absolute;right:-46px;top:50%;margin-top:-24px;width:44px;height:44px;pointer-events:none;animation:tg-strut 3s ease-in-out infinite;transform-origin:50% 90%}
.tg-leaves{position:fixed;inset:0;pointer-events:none;z-index:40;overflow:hidden}
.tg-leaf{position:absolute;top:-30px;width:18px;height:18px;animation:tg-fall linear infinite}
.tg-section{background:#f8f5f0;font-family:Montserrat,sans-serif;padding:56px 16px;border-top:1px solid #eadfce}
.tg-card{max-width:880px;margin:0 auto;background:#fff;border-radius:24px;box-shadow:0 10px 30px rgba(17,17,17,.06);display:flex;align-items:center;gap:28px;padding:32px 36px;position:relative;overflow:hidden}
.tg-card::after{content:"";position:absolute;right:-60px;top:-60px;width:200px;height:200px;border-radius:50%;background:rgba(249,115,22,.08)}
.tg-card .tg-big{width:110px;height:110px;flex:none}
.tg-card .tg-eyebrow{color:${ORANGE};font-weight:800;font-size:12px;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 6px}
.tg-card h2{font-weight:900;text-transform:uppercase;letter-spacing:-.5px;font-size:30px;line-height:1.05;color:#111;margin:0 0 10px}
.tg-card p{color:#4b5563;font-size:15px;line-height:1.55;margin:0 0 18px}
.tg-card .tg-btns{display:flex;gap:10px;flex-wrap:wrap}
.tg-card .tg-btn{display:inline-block;border-radius:50px;padding:12px 22px;font-weight:700;font-size:13px;text-decoration:none;text-transform:uppercase;letter-spacing:.3px}
.tg-card .tg-btn.primary{background:${ORANGE};color:#fff}
.tg-card .tg-btn.primary:hover{background:#ea580c}
.tg-card .tg-btn.ghost{background:#fff;color:#111;border:2px solid #111}
.evb-asst-root .evb-asst-toggle{background:linear-gradient(135deg,#f97316 0%,#ea580c 55%,#9a3412 100%) !important}
.evb-asst-root .evb-asst-toggle-wrap{position:relative}
.evb-asst-root .tg-asst-leaf{position:absolute;left:-8px;top:-12px;width:30px;height:26px;pointer-events:none;z-index:2;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}
.evb-asst-root--open .tg-asst-leaf{display:none}
.evb-asst-root .tg-asst-turkey{display:block;width:100%;height:100%}
.evb-asst-root .tg-asst-turkey svg{width:100%;height:100%;display:block}
.evb-asst-root .evb-asst-toggle-icon .tg-asst-turkey{animation:tg-strut 3s ease-in-out infinite;transform-origin:50% 90%}
.evb-asst-root .evb-asst-head{background:linear-gradient(180deg,#fff7ed,#fff) !important;border-bottom:2px solid #fed7aa}
.evb-asst-root .evb-asst-head-logo-icon{background:#fff !important;border:2px solid #fdba74;padding:2px}
.evb-asst-root .evb-asst-restore .tg-asst-turkey{padding:2px}
@keyframes tg-fall{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(110vh) rotate(420deg)}}
@keyframes tg-strut{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
.tg-big{animation:tg-strut 3s ease-in-out infinite;transform-origin:50% 90%}
@media (max-width:640px){.tg-logo .tg-logo-turkey{width:34px;height:34px;right:-36px;margin-top:-18px}.tg-logo .tg-logo-leaves{width:36px;height:32px;left:-12px;top:-12px}.tg-card{flex-direction:column;text-align:center;padding:28px 20px}.tg-card h2{font-size:24px}.tg-card .tg-btns{justify-content:center}.tg-card .tg-big{width:88px;height:88px}}
@media (prefers-reduced-motion:reduce){.tg-leaves{display:none}.tg-big,.tg-logo .tg-logo-turkey{animation:none}}
`;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  document.querySelectorAll('.site-nav-logo').forEach(function (logo) {
    logo.classList.add('tg-logo');
    var cluster = document.createElement('span');
    cluster.setAttribute('aria-hidden', 'true');
    cluster.innerHTML =
      '<svg class="tg-logo-leaves" viewBox="0 0 34 30">' +
        '<path transform="translate(10 6) rotate(25 12 12) scale(.9)" d="' + leafPath + '" fill="#b45309"/>' +
        '<path transform="translate(0 2) rotate(-20 12 12) scale(.85)" d="' + leafPath + '" fill="#f59e0b"/>' +
        '<path transform="translate(4 8) rotate(5 12 12) scale(.8)" d="' + leafPath + '" fill="' + ORANGE + '"/>' +
      '</svg>' +
      '<span class="tg-logo-turkey">' + turkeySVG + '</span>';
    while (cluster.firstChild) logo.appendChild(cluster.firstChild);
  });

  function themeAssistant(root) {
    if (root.dataset.tgThemed) return;
    root.dataset.tgThemed = '1';
    var turkeyIcon = '<span class="tg-asst-turkey">' + turkeySVG + '</span>';
    root.querySelectorAll('.evb-asst-toggle-icon, .evb-asst-head-logo-icon, .evb-asst-restore .evb-asst-icon-svg-wrap').forEach(function (el) {
      el.innerHTML = turkeyIcon;
    });
    var small = root.querySelector('.evb-asst-toggle-label small');
    if (small) small.textContent = 'Happy Thanksgiving';
    var wrap = root.querySelector('.evb-asst-toggle-wrap');
    if (wrap) {
      var leafSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      leafSvg.setAttribute('viewBox', '0 0 34 30');
      leafSvg.setAttribute('class', 'tg-asst-leaf');
      leafSvg.setAttribute('aria-hidden', 'true');
      leafSvg.innerHTML =
        '<path transform="translate(10 6) rotate(25 12 12) scale(.9)" d="' + leafPath + '" fill="#b45309"/>' +
        '<path transform="translate(0 2) rotate(-20 12 12) scale(.85)" d="' + leafPath + '" fill="#f59e0b"/>';
      wrap.appendChild(leafSvg);
    }
  }
  var existing = document.querySelector('.evb-asst-root');
  if (existing) themeAssistant(existing);
  else {
    var obs = new MutationObserver(function () {
      var r = document.querySelector('.evb-asst-root');
      if (r) { obs.disconnect(); themeAssistant(r); }
    });
    obs.observe(document.body, { childList: true });
    setTimeout(function () { obs.disconnect(); }, 15000);
  }

  var leaves = document.createElement('div');
  leaves.className = 'tg-leaves';
  leaves.setAttribute('aria-hidden', 'true');
  var colors = [ORANGE, '#ea580c', '#b45309', '#f59e0b'];
  var count = window.innerWidth < 640 ? 5 : 10;
  for (var i = 0; i < count; i++) {
    var size = 12 + Math.random() * 12;
    var leaf = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leaf.setAttribute('viewBox', '0 0 24 24');
    leaf.setAttribute('class', 'tg-leaf');
    leaf.style.left = Math.random() * 100 + 'vw';
    leaf.style.width = leaf.style.height = size + 'px';
    leaf.style.opacity = (0.35 + Math.random() * 0.35).toFixed(2);
    leaf.style.animationDuration = 12 + Math.random() * 10 + 's';
    leaf.style.animationDelay = -Math.random() * 20 + 's';
    leaf.innerHTML = '<path d="' + leafPath + '" fill="' + colors[i % colors.length] + '"/>';
    leaves.appendChild(leaf);
  }
  document.body.appendChild(leaves);

  var section = document.createElement('section');
  section.className = 'tg-section';
  section.innerHTML =
    '<div class="tg-card">' +
      '<div class="tg-big">' + turkeySVG + '</div>' +
      '<div>' +
        '<p class="tg-eyebrow">From our family to yours</p>' +
        '<h2>Happy Thanksgiving</h2>' +
        '<p>We\'re thankful for every customer who walks through our doors on Avenue A. Need extra cash for the holidays? Bring in your gold, diamonds, watches or sneakers and walk out paid today.</p>' +
        '<div class="tg-btns">' +
          '<a class="tg-btn primary" href="sms:+19176088939">Text photos for a quote</a>' +
          '<a class="tg-btn ghost" href="tel:+19176088939">Call now</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  var footer = document.querySelector('footer');
  if (footer) footer.parentNode.insertBefore(section, footer);
  else document.body.appendChild(section);
})();
