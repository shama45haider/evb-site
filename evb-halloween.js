/* East Village Buyers — Halloween touches (October only)
   ---------------------------------------------------------------------------
   Loaded by site-nav.js until Nov 1, then never fetched again, so nothing has
   to be undone by hand. Purely decorative: faint corner cobwebs, one small
   spider, and two little pumpkins in the existing top bar and footer. Every
   piece is aria-hidden and pointer-events:none, and nothing on the page is
   moved, recoloured or covered beyond a faint corner line.

   Delete this file and its loader in site-nav.js to remove it early.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  if (document.getElementById('evbh-style')) return;

  /* ---- SVG pieces ------------------------------------------------------ */

  /** A quarter cobweb anchored in the top-right corner of a 100x100 box:
      spokes fanning down-left, joined by threads that sag toward the corner. */
  function cobweb() {
    var spokes = [0, 22.5, 45, 67.5, 90];
    var rings = [20, 37, 54, 71, 88];
    var rad = Math.PI / 180;
    var pt = function (r, a) {
      // a=0 runs along the top edge (left), a=90 straight down the side.
      return [100 - r * Math.cos(a * rad), r * Math.sin(a * rad)];
    };
    var d = '';
    spokes.forEach(function (a) {
      var p = pt(98, a);
      d += 'M100 0L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    });
    rings.forEach(function (r) {
      for (var i = 0; i < spokes.length - 1; i++) {
        var a0 = spokes[i], a1 = spokes[i + 1];
        var p0 = pt(r, a0), p1 = pt(r, a1), c = pt(r * 0.86, (a0 + a1) / 2);
        d += (i === 0 ? 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) : '') +
          'Q' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
      }
    });
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="0.7" stroke-linecap="round"/></svg>';
  }

  function pumpkin(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 32 30" aria-hidden="true" focusable="false">' +
      '<path d="M16.5 7.5c0-2.6 1-4.6 2.9-5.6" fill="none" stroke="var(--evbh-stem)" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M18.6 4.2c2.4-1.6 5.2-1.2 6.4.4-2 .9-4.3 1-6.4-.4z" fill="var(--evbh-leaf)"/>' +
      '<ellipse cx="10" cy="18" rx="8" ry="10" fill="var(--evbh-body)"/>' +
      '<ellipse cx="22" cy="18" rx="8" ry="10" fill="var(--evbh-body)"/>' +
      '<ellipse cx="16" cy="18" rx="7.5" ry="11" fill="var(--evbh-body)"/>' +
      '<path d="M12.4 9.4c-2.6 5-2.6 12.2 0 17.2M19.6 9.4c2.6 5 2.6 12.2 0 17.2" fill="none" stroke="var(--evbh-rib)" stroke-width="1.1" stroke-linecap="round"/>' +
      '</svg>';
  }

  var SPIDER =
    '<svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="#3a322b" stroke-width="1.1" stroke-linecap="round">' +
        '<path d="M9 10 4 6 1 8M9 12 3 11 1 14M9 13 4 16 2 20M10 14 7 19 6 22"/>' +
        '<path d="M15 10 20 6 23 8M15 12 21 11 23 14M15 13 20 16 22 20M14 14 17 19 18 22"/>' +
      '</g>' +
      '<ellipse cx="12" cy="13" rx="3.6" ry="4.4" fill="#3a322b"/>' +
      '<circle cx="12" cy="8.2" r="2.4" fill="#3a322b"/>' +
    '</svg>';

  /* ---- Styles ---------------------------------------------------------- */

  var css =
    '.evbh{position:absolute;pointer-events:none;color:#8a7f74;}' +
    '.evbh svg{display:block;width:100%;height:100%;}' +

    /* Corner webs under the header: they scroll away with the page and sit
       below the sticky nav (z 50), so they never cover it. */
    '.evbh-web-tr{top:0;right:0;width:118px;height:118px;opacity:.32;z-index:40;}' +
    '.evbh-web-tl{top:0;left:0;width:84px;height:84px;opacity:.24;z-index:40;transform:scaleX(-1);}' +

    /* The spider hangs from the top-right web on a thread and sways a little. */
    '.evbh-spider{top:0;right:46px;width:16px;z-index:40;transform-origin:50% 0;}' +
    '.evbh-spider i{display:block;width:1px;height:58px;margin:0 auto;background:linear-gradient(#8a7f74,rgba(138,127,116,.35));}' +
    '.evbh-spider svg{width:16px;height:15px;margin-top:-1px;opacity:.85;}' +
    '@media (prefers-reduced-motion:no-preference){' +
      '.evbh-spider{animation:evbhSway 7s ease-in-out infinite;}' +
      '@keyframes evbhSway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg) translateY(4px)}}' +
    '}' +

    /* Footer corners, behind the footer content (which sits at z 2). */
    '.evb-footer .evbh-foot-tl{top:0;left:0;width:96px;height:96px;opacity:.2;z-index:1;transform:scaleX(-1);}' +
    '.evb-footer .evbh-foot-br{bottom:0;right:0;width:110px;height:110px;opacity:.2;z-index:1;transform:rotate(180deg);}' +

    /* Pumpkins: a white one in the orange top bar, an orange one by the ©. */
    '.evbh-pk{display:inline-block;flex-shrink:0;vertical-align:-3px;}' +
    '.evbh-pk-top{width:18px;height:17px;margin-right:4px;--evbh-body:#fff;--evbh-rib:#f3b07a;--evbh-stem:#fff;--evbh-leaf:#ffe2c9;}' +
    '.evbh-pk-foot{width:15px;height:14px;margin-right:6px;--evbh-body:#e8690a;--evbh-rib:#b84f06;--evbh-stem:#6b4f2a;--evbh-leaf:#7a8b4a;}' +
    '.evb-footer-copy{display:inline-flex;align-items:center;}' +

    '@media (max-width:640px){' +
      '.evbh-web-tl,.evbh-spider,.evbh-pk-top{display:none;}' +
      '.evbh-web-tr{width:76px;height:76px;}' +
      '.evb-footer .evbh-foot-tl,.evb-footer .evbh-foot-br{width:70px;height:70px;}' +
    '}' +
    '@media print{.evbh,.evbh-pk{display:none!important;}}';

  /* ---- Placement ------------------------------------------------------- */

  function el(cls, html) {
    var d = document.createElement('div');
    d.className = 'evbh ' + cls;
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = html;
    return d;
  }

  function build() {
    var style = document.createElement('style');
    style.id = 'evbh-style';
    style.textContent = css;
    document.head.appendChild(style);

    var web = cobweb();

    // Top corners: just below the header, positioned in page coordinates so
    // they scroll away naturally instead of following the visitor.
    // Measured from the top bar, not the nav: the nav is sticky, so its
    // on-screen position follows the scroll and would drag the webs with it.
    var bar0 = document.querySelector('.site-topbar');
    var nav = document.querySelector('.site-nav');
    var top = document.createElement('div');
    top.setAttribute('aria-hidden', 'true');
    var place = function () {
      var y = (bar0 ? bar0.getBoundingClientRect().bottom + window.scrollY : 0) + (nav ? nav.offsetHeight : 0);
      y = Math.round(y);
      top.style.cssText = 'position:absolute;left:0;right:0;top:' + y + 'px;height:0;pointer-events:none;';
    };
    top.appendChild(el('evbh-web-tr', web));
    top.appendChild(el('evbh-web-tl', web));
    top.appendChild(el('evbh-spider', '<i></i>' + SPIDER));
    document.body.appendChild(top);
    place();
    window.addEventListener('resize', place, { passive: true });
    window.addEventListener('load', place);

    // Footer corners.
    var foot = document.querySelector('.evb-footer');
    if (foot) {
      foot.appendChild(el('evbh-foot-tl', web));
      foot.appendChild(el('evbh-foot-br', web));
    }

    // Pumpkins in what is already there.
    var bar = document.querySelector('.site-topbar-inner');
    if (bar) bar.insertAdjacentHTML('afterbegin', pumpkin('evbh-pk evbh-pk-top'));
    var copy = document.querySelector('.evb-footer-copy');
    if (copy) copy.insertAdjacentHTML('afterbegin', pumpkin('evbh-pk evbh-pk-foot'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
