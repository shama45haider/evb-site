(function () {
  'use strict';

  if (document.getElementById('evbh-style')) return;

  function cobweb() {
    var spokes = [0, 22.5, 45, 67.5, 90];
    var rings = [20, 37, 54, 71, 88];
    var rad = Math.PI / 180;
    var pt = function (r, a) {
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

  function pumpkinArt(face) {
    return '<path d="M16.5 7.5c0-2.6 1-4.6 2.9-5.6" fill="none" stroke="var(--evbh-stem)" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M18.6 4.2c2.4-1.6 5.2-1.2 6.4.4-2 .9-4.3 1-6.4-.4z" fill="var(--evbh-leaf)"/>' +
      '<ellipse cx="10" cy="18" rx="8" ry="10" fill="var(--evbh-body)"/>' +
      '<ellipse cx="22" cy="18" rx="8" ry="10" fill="var(--evbh-body)"/>' +
      '<ellipse cx="16" cy="18" rx="7.5" ry="11" fill="var(--evbh-body)"/>' +
      '<path d="M12.4 9.4c-2.6 5-2.6 12.2 0 17.2M19.6 9.4c2.6 5 2.6 12.2 0 17.2" fill="none" stroke="var(--evbh-rib)" stroke-width="1.1" stroke-linecap="round"/>' +
      (face ?
        '<g fill="var(--evbh-face)">' +
          '<path d="M8.6 17.2 11.4 12.6 13.4 17.2z"/>' +
          '<path d="M18.6 17.2 20.6 12.6 23.4 17.2z"/>' +
          '<path d="M8.4 20.4Q16 24.6 23.6 20.4L22.4 24 20 22.8 18.2 25 16 23.4 13.8 25 12 22.8 9.6 24z"/>' +
        '</g>' : '');
  }

  function pumpkin(cls, face) {
    return '<svg class="' + cls + '" viewBox="0 0 32 30" aria-hidden="true" focusable="false">' + pumpkinArt(face) + '</svg>';
  }

  var BAT_ART =
    '<g class="evbh-wings">' +
      '<path d="M24 9C21 5.5 16 3 9.5 3.5 6 3.8 2.8 5.6.5 8.8c2.7-.6 4.9.2 6.1 2.4 1.4-1.6 4-1.8 5.6.2 1.6-1.6 4.4-1.5 5.8 1 1.6-1 3.8-1.2 6 0z"/>' +
      '<path d="M24 9c3-3.5 8-6 14.5-5.5 3.5.3 6.7 2.1 9 5.3-2.7-.6-4.9.2-6.1 2.4-1.4-1.6-4-1.8-5.6.2-1.6-1.6-4.4-1.5-5.8 1-1.6-1-3.8-1.2-6 0z"/>' +
    '</g>' +
    '<ellipse cx="24" cy="12" rx="2.6" ry="4.4"/>' +
    '<path d="M21.7 7.6 22 3.8l1.5 2.2h1L26 3.8l.3 3.8c0 1.6-1 2.6-2.3 2.6s-2.3-1-2.3-2.6z"/>';

  function bat(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 48 18" aria-hidden="true" focusable="false">' + BAT_ART + '</svg>';
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

  var HAT =
    '<svg viewBox="0 0 40 32" aria-hidden="true" focusable="false">' +
      '<path d="M1.4 27.2c0-2.3 8.3-4.2 18.6-4.2s18.6 1.9 18.6 4.2-8.3 4.2-18.6 4.2S1.4 29.5 1.4 27.2z" fill="#1d1916"/>' +
      '<path d="M10.6 25.6c2.6-5.4 4.6-11.4 6.2-16.8 1-3.4 3-6.4 6.2-7.2 2.2-.5 4.3.1 5.8 1.4-2.3-.2-4 1-4.6 3.2-.9 3.4.3 7.6 1.8 11.6l3.4 7.8c-6.2 1.4-12.6 1.4-18.8 0z" fill="#1d1916"/>' +
      '<path d="M11.3 22.8c5.8 1.3 11.6 1.3 17.4 0l.8 2.2c-6.2 1.4-12.8 1.4-19 0z" fill="#f97316"/>' +
      '<rect x="17.8" y="22.7" width="4.6" height="3.6" rx=".8" fill="none" stroke="#fcd34d" stroke-width="1.1"/>' +
    '</svg>';

  var GHOST =
    '<svg viewBox="0 0 44 40" aria-hidden="true" focusable="false">' +
      '<path d="M6 40V18C6 9.2 13.2 2 22 2s16 7.2 16 16v22z" fill="#fff" stroke="#e7dccd" stroke-width="1.2"/>' +
      '<ellipse cx="16.4" cy="17.5" rx="2.3" ry="3.1" fill="#1d1916"/>' +
      '<ellipse cx="27.6" cy="17.5" rx="2.3" ry="3.1" fill="#1d1916"/>' +
      '<ellipse cx="22" cy="24.2" rx="1.7" ry="2.1" fill="#1d1916"/>' +
      '<circle cx="12.2" cy="22.6" r="2.1" fill="#fdba8c" opacity=".75"/>' +
      '<circle cx="31.8" cy="22.6" r="2.1" fill="#fdba8c" opacity=".75"/>' +
      '<ellipse cx="7.5" cy="30" rx="4" ry="3" fill="#fff" stroke="#e7dccd" stroke-width="1.2"/>' +
      '<ellipse cx="36.5" cy="30" rx="4" ry="3" fill="#fff" stroke="#e7dccd" stroke-width="1.2"/>' +
    '</svg>';

  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tower(x, y) {
    x = Math.round(x);
    return 'M' + (x + 3) + ' ' + y + 'h1.6v-7h-1.6zM' + (x + 13.4) + ' ' + y + 'h1.6v-7h-1.6z' +
      'M' + x + ' ' + (y - 7) + 'v-14h18v14z' +
      'M' + (x - 1.5) + ' ' + (y - 21) + 'L' + (x + 9) + ' ' + (y - 29) + 'L' + (x + 19.5) + ' ' + (y - 21) + 'z';
  }

  function fireEscape(x0, x1, ys) {
    var d = '';
    for (var i = 0; i < ys.length; i++) {
      d += 'M' + x0 + ' ' + ys[i] + 'H' + x1;
      if (i < ys.length - 1) {
        d += 'M' + (i % 2 ? x0 + 4 : x1 - 4) + ' ' + ys[i] + 'L' + (i % 2 ? x1 - 4 : x0 + 4) + ' ' + ys[i + 1];
      }
    }
    return d;
  }

  function skyline() {
    var W = 1440, G = 140, r = rng(1031), x;
    var back = '', towers = '', front = '', dark = '', lit = '', esc = '', doors = '', flk = '';
    for (x = -12; x < W + 12;) {
      var bw = 44 + Math.round(r() * 72), bh = 50 + Math.round(r() * 46);
      back += 'M' + x + ' ' + G + 'V' + (G - bh) + 'h' + bw + 'V' + G + 'z';
      if (bw > 60 && r() < 0.34) towers += tower(x + 8 + r() * (bw - 34), G - bh);
      x += bw;
    }
    for (x = -8; x < W + 12;) {
      var fw = 60 + Math.round(r() * 72), fh = 40 + Math.round(r() * 52), top = G - fh;
      var cols = Math.floor((fw - 10) / 13), rows = Math.floor((fh - 20) / 15);
      var ox = Math.round(x + (fw - (cols * 13 - 7)) / 2), ys = [];
      front += 'M' + x + ' ' + G + 'V' + top + 'h' + fw + 'V' + G + 'z' +
        'M' + (x - 2) + ' ' + (top - 3) + 'h' + (fw + 4) + 'v4h' + (-(fw + 4)) + 'z';
      doors += 'M' + Math.round(x + fw / 2 - 5) + ' ' + G + 'v-13h10v13z';
      for (var row = 0; row < rows; row++) {
        var wy = top + 9 + row * 15;
        ys.push(wy + 10);
        for (var c = 0; c < cols; c++) {
          var wx = ox + c * 13, k = r();
          if (k < 0.05) {
            flk += '<rect class="evbh-flk" x="' + wx + '" y="' + wy + '" width="6" height="8" style="animation-delay:' + (r() * -4).toFixed(2) + 's"/>';
          } else if (k < 0.24) {
            lit += 'M' + wx + ' ' + wy + 'h6v8h-6z';
          } else {
            dark += 'M' + wx + ' ' + wy + 'h6v8h-6z';
          }
        }
      }
      if (cols >= 4 && rows >= 2 && r() < 0.4) {
        var c0 = Math.floor(r() * (cols - 2));
        esc += fireEscape(ox + c0 * 13 - 3, ox + (c0 + 2) * 13 + 9, ys);
      }
      x += fw + (r() < 0.14 ? 6 + Math.round(r() * 12) : 0);
    }

    var pumpkins = '';
    [[116, 26, 1], [144, 16, 0], [402, 22, 1], [684, 28, 1], [714, 17, 0], [1002, 22, 1], [1262, 26, 1], [1290, 16, 0]].forEach(function (p) {
      var h = Math.round(p[1] * 30 / 32);
      pumpkins += '<use href="#' + (p[2] ? 'evbhPkFace' : 'evbhPk') + '" x="' + p[0] + '" y="' + (G - h + 1) + '" width="' + p[1] + '" height="' + h + '"/>';
    });

    var skyBats = '';
    [[828, 28, 0.42], [851, 15, 0.3], [930, 60, 0.36]].forEach(function (b) {
      skyBats += '<g transform="translate(' + b[0] + ' ' + b[1] + ') scale(' + b[2] + ')">' + BAT_ART + '</g>';
    });

    return '<svg class="evbh-sky-art" viewBox="0 0 1440 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<symbol id="evbhPk" viewBox="0 0 32 30">' + pumpkinArt(false) + '</symbol>' +
        '<symbol id="evbhPkFace" viewBox="0 0 32 30">' + pumpkinArt(true) + '</symbol>' +
      '</defs>' +
      '<circle cx="880" cy="44" r="36" fill="#fdebd8" opacity=".6"/>' +
      '<circle cx="880" cy="44" r="20" fill="#fde0bf"/>' +
      '<circle cx="873" cy="38" r="3.5" fill="#f8d3a8"/><circle cx="888" cy="50" r="2.2" fill="#f8d3a8"/><circle cx="885" cy="34" r="1.6" fill="#f8d3a8"/>' +
      '<g fill="#2b2522" opacity=".55">' + skyBats + '</g>' +
      '<path d="' + back + '" fill="#f0e8dc"/>' +
      '<path d="' + towers + '" fill="#e9e0d3"/>' +
      '<path d="' + front + '" fill="#e6dccd"/>' +
      '<path d="' + dark + '" fill="#efe8de"/>' +
      '<path d="' + lit + '" fill="#f9a54a"/>' +
      '<g fill="#f97316">' + flk + '</g>' +
      '<path d="' + esc + '" fill="none" stroke="#d6c9b6" stroke-width="1.2"/>' +
      '<path d="' + doors + '" fill="#dacfbf"/>' +
      '<rect x="0" y="' + G + '" width="1440" height="10" fill="#e9e0d3"/>' +
      '<rect x="0" y="' + G + '" width="1440" height="1.5" fill="#dccfbd"/>' +
      pumpkins +
    '</svg>';
  }

  function svgUrl(svg) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  var BULLET = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30">' +
      pumpkinArt(false)
        .replace(/var\(--evbh-stem\)/g, '#6b4f2a')
        .replace(/var\(--evbh-leaf\)/g, '#7a8b4a')
        .replace(/var\(--evbh-body\)/g, '#e8690a')
        .replace(/var\(--evbh-rib\)/g, '#b84f06') +
    '</svg>'
  );

  var css =
    '.evbh{position:absolute;pointer-events:none;color:#8a7f74;}' +
    '.evbh svg{display:block;width:100%;height:100%;}' +

    '.evbh-web-tr{top:0;right:0;width:118px;height:118px;opacity:.32;z-index:40;}' +
    '.evbh-web-tl{top:0;left:0;width:84px;height:84px;opacity:.24;z-index:40;transform:scaleX(-1);}' +

    '.evbh-spider{top:0;right:46px;width:16px;z-index:40;transform-origin:50% 0;}' +
    '.evbh-spider i{display:block;width:1px;height:58px;margin:0 auto;background:linear-gradient(#8a7f74,rgba(138,127,116,.35));}' +
    '.evbh-spider svg{width:16px;height:15px;margin-top:-1px;opacity:.85;}' +

    '.evbh-web{z-index:1;}' +
    '.evbh-c-tr{top:0;right:0;}' +
    '.evbh-c-tl{top:0;left:0;transform:scaleX(-1);}' +
    '.evbh-c-br{bottom:0;right:0;transform:scaleY(-1);}' +
    '.evbh-c-bl{bottom:0;left:0;transform:scale(-1);}' +

    '.evbh-bats{position:absolute;left:0;right:0;top:0;height:300px;overflow:hidden;pointer-events:none;z-index:39;}' +
    '.evbh-bat{position:absolute;left:0;opacity:0;will-change:transform;animation:evbhFly 26s linear infinite;}' +
    '.evbh-bat-in{display:block;animation:evbhBob 1.1s ease-in-out infinite alternate;}' +
    '.evbh-bat svg{display:block;width:100%;height:auto;fill:#1d1916;filter:drop-shadow(0 0 1px rgba(255,255,255,.75));}' +
    '.evbh-wings{transform-box:view-box;transform-origin:24px 9px;}' +
    '.evbh-bat .evbh-wings{animation:evbhFlap .2s ease-in-out infinite alternate;}' +
    '.evbh-off .evbh-bat,.evbh-off .evbh-bat-in,.evbh-off .evbh-wings{animation-play-state:paused;}' +
    '@keyframes evbhFly{' +
      '0%{transform:translate3d(-70px,40px,0);opacity:0}' +
      '1%{opacity:.82}' +
      '18%{transform:translate3d(50vw,6px,0)}' +
      '36%{transform:translate3d(calc(100vw + 70px),-26px,0);opacity:.82}' +
      '37%,100%{transform:translate3d(calc(100vw + 70px),-26px,0);opacity:0}' +
    '}' +
    '@keyframes evbhBob{to{transform:translateY(10px)}}' +
    '@keyframes evbhFlap{to{transform:scaleY(-.45)}}' +

    '.evbh-tk{display:inline-flex;align-items:center;}' +
    '.evbh-tk-pk{display:block;width:13px;height:12px;--evbh-body:#f97316;--evbh-rib:#c2560a;--evbh-stem:#6b4f2a;--evbh-leaf:#7a8b4a;}' +
    '.evbh-tk-bat{display:block;width:21px;height:8px;fill:#1d1916;opacity:.78;}' +

    '.evbh-hat svg{height:auto;}' +
    '.evbh-hat-logo{left:7%;top:-30%;width:11.5%;z-index:2;transform:rotate(-16deg);transform-origin:50% 100%;}' +
    '.evb-asst-toggle{position:relative;}' +
    '.evbh-hat-asst{left:10px;top:-13px;width:34px;z-index:2;transform:rotate(-14deg);transform-origin:50% 100%;animation:evbhHatIn .6s .35s cubic-bezier(.34,1.56,.64,1) both;}' +
    '@keyframes evbhHatIn{from{opacity:0;transform:translateY(-14px) rotate(-30deg)}to{opacity:1;transform:rotate(-14deg)}}' +

    '.evbh-peek{right:26px;bottom:100%;width:50px;height:35px;overflow:hidden;z-index:2;}' +
    '.evbh-peek-l{right:auto;left:22px;}' +
    '.evbh-peek svg{position:absolute;left:0;top:0;width:50px;height:46px;transform:translateY(36px);animation:evbhPeek 9s ease-in-out 1.5s infinite;}' +
    '@keyframes evbhPeek{0%,8%{transform:translateY(36px)}18%,64%{transform:translateY(0)}68%{transform:translateY(3px)}72%,100%{transform:translateY(36px)}}' +

    '.evbh-drop{position:absolute;top:0;right:24px;width:18px;z-index:3;pointer-events:none;transform:translateY(calc(-100% - 2px));transition:transform .55s cubic-bezier(.34,1.45,.6,1);}' +
    '.evbh-drop i{display:block;width:1.5px;height:var(--evbh-len);margin:0 auto;background:rgba(255,255,255,.95);box-shadow:0 0 1.5px rgba(0,0,0,.45);}' +
    '.evbh-drop svg{display:block;width:18px;height:16.5px;margin-top:-1px;filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1px #fff);}' +
    '@media (hover:hover){' +
      '.evb-cc:hover .evbh-drop,.blog-card:hover .evbh-drop,.brand-tile:hover .evbh-drop{transform:translateY(0);}' +
    '}' +
    '.evb-cc:focus-visible .evbh-drop,.blog-card:focus-within .evbh-drop,.brand-tile:focus-visible .evbh-drop{transform:translateY(0);}' +

    '.evbh-porch{bottom:0;display:flex;align-items:flex-end;gap:2px;z-index:1;--evbh-body:#f97316;--evbh-rib:#c2560a;--evbh-stem:#6b4f2a;--evbh-leaf:#7a8b4a;--evbh-face:#5a2406;}' +
    '.evbh-porch-l{left:4%;}' +
    '.evbh-porch-r{right:4%;}' +
    '.evbh-porch .evbh-pk-lg{width:42px;height:39px;}' +
    '.evbh-porch .evbh-pk-sm{width:25px;height:23px;}' +

    '.hero-left .hero-body li::before{width:12px;height:11px;left:-3px;top:5px;border-radius:0;background:' + BULLET + ' center/contain no-repeat;}' +

    '.evbh-sky{position:relative;pointer-events:none;padding-top:26px;--evbh-body:#f97316;--evbh-rib:#c2560a;--evbh-stem:#6b4f2a;--evbh-leaf:#7a8b4a;--evbh-face:#5a2406;}' +
    '.evbh-sky-label{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 16px 4px;font-family:Montserrat,system-ui,sans-serif;font-size:11px;font-weight:700;line-height:1.2;letter-spacing:.2em;text-transform:uppercase;text-align:center;color:#e8690a;}' +
    '.evbh-sky-label::before,.evbh-sky-label::after{content:"";flex:0 0 28px;height:2px;border-radius:2px;background:#f97316;}' +
    '.evbh-sky-art{display:block;width:100%;height:150px;}' +
    '.evbh-flk{animation:evbhFlk 4s steps(1,end) infinite;}' +
    '@keyframes evbhFlk{0%,100%{opacity:1}38%{opacity:.45}41%{opacity:.95}66%{opacity:.6}70%{opacity:1}}' +

    '.evb-footer .evbh-foot-br{bottom:0;right:0;width:110px;height:110px;opacity:.2;z-index:1;transform:scaleY(-1);}' +

    '.evbh-pk{display:inline-block;flex-shrink:0;vertical-align:-3px;}' +
    '.evbh-pk-top{width:18px;height:17px;margin-right:4px;--evbh-body:#fff;--evbh-rib:#f3b07a;--evbh-stem:#fff;--evbh-leaf:#ffe2c9;}' +
    '.evbh-pk-foot{width:15px;height:14px;margin-right:6px;--evbh-body:#e8690a;--evbh-rib:#b84f06;--evbh-stem:#6b4f2a;--evbh-leaf:#7a8b4a;}' +
    '.evb-footer-copy{display:inline-flex;align-items:center;}' +

    '@media (prefers-reduced-motion:no-preference){' +
      '.evbh-spider{animation:evbhSway 7s ease-in-out infinite;}' +
      '@keyframes evbhSway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg) translateY(4px)}}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.evbh-bats{display:none;}' +
      '.evbh-peek svg{animation:none;transform:translateY(4px);}' +
      '.evbh-drop{transition:none;}' +
      '.evbh-hat-asst{animation:none;}' +
      '.evbh-flk{animation:none;}' +
    '}' +

    '@media (max-width:640px){' +
      '.evbh-web-tl,.evbh-spider,.evbh-pk-top{display:none;}' +
      '.evbh-web-tr{width:76px;height:76px;}' +
      '.evbh-web{max-width:84px;max-height:84px;}' +
      '.evbh-bats{height:220px;}' +
      '.evbh-bat-4,.evbh-bat-5{display:none;}' +
      '.evbh-porch .evbh-pk-sm{display:none;}' +
      '.evbh-porch .evbh-pk-lg{width:30px;height:28px;}' +
      '.evbh-porch-l{left:3%;}' +
      '.evbh-porch-r{right:3%;}' +
      '.evbh-sky{padding-top:20px;}' +
      '.evbh-sky-label{font-size:10px;letter-spacing:.16em;gap:10px;}' +
      '.evbh-sky-label::before,.evbh-sky-label::after{flex-basis:18px;}' +
      '.evbh-sky-art{height:110px;}' +
      '.evb-footer .evbh-foot-br{width:70px;height:70px;}' +
    '}' +
    '@media print{[class*="evbh"]{display:none!important;}}';

  function el(cls, html) {
    var d = document.createElement('div');
    d.className = 'evbh ' + cls;
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = html;
    return d;
  }

  function positioned(host) {
    if (getComputedStyle(host).position !== 'static') return true;
    var kids = host.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      if (getComputedStyle(kids[i]).position === 'absolute') {
        var op = kids[i].offsetParent;
        if (!op || !host.contains(op)) return false;
      }
    }
    host.style.position = 'relative';
    return true;
  }

  function each(sel, fn) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }

  function whenReady(sel, fn) {
    var found = document.querySelector(sel);
    if (found) return fn(found);
    var mo = new MutationObserver(function () {
      var f = document.querySelector(sel);
      if (f) {
        mo.disconnect();
        fn(f);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 15000);
  }

  var WEB = cobweb();

  function addWeb(host, corner, size, opacity) {
    if (!host || !positioned(host)) return;
    var w = el('evbh-web evbh-c-' + corner, WEB);
    w.style.width = size + 'px';
    w.style.height = size + 'px';
    w.style.opacity = opacity;
    host.appendChild(w);
  }

  function addDrop(host, len) {
    if (!host || !positioned(host)) return;
    var s = document.createElement('span');
    s.className = 'evbh-drop';
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--evbh-len', len + 'px');
    s.innerHTML = '<i></i>' + SPIDER;
    host.appendChild(s);
  }

  function addPorch(host) {
    if (!host || !positioned(host)) return;
    host.appendChild(el('evbh-porch evbh-porch-l', pumpkin('evbh-pk evbh-pk-lg', true) + pumpkin('evbh-pk evbh-pk-sm', false)));
    host.appendChild(el('evbh-porch evbh-porch-r', pumpkin('evbh-pk evbh-pk-sm', false) + pumpkin('evbh-pk evbh-pk-lg', true)));
  }

  function addGhost(host, side) {
    if (!host || !positioned(host)) return;
    host.appendChild(el('evbh-peek' + (side ? ' evbh-peek-' + side : ''), GHOST));
  }

  function buildBats() {
    var wrap = document.createElement('div');
    wrap.className = 'evbh-bats';
    wrap.setAttribute('aria-hidden', 'true');
    [[44, 34, 1.2], [96, 24, 1.9], [16, 20, 2.5], [132, 28, 3.3], [66, 18, 4.1]].forEach(function (b, i) {
      var s = document.createElement('span');
      s.className = 'evbh-bat evbh-bat-' + (i + 1);
      s.style.top = b[0] + 'px';
      s.style.width = b[1] + 'px';
      s.style.animationDelay = b[2] + 's';
      s.innerHTML = '<span class="evbh-bat-in" style="animation-delay:-' + (i * 0.37).toFixed(2) + 's">' + bat('') + '</span>';
      wrap.appendChild(s);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        wrap.classList.toggle('evbh-off', !entries[0].isIntersecting);
      }).observe(wrap);
    }
    return wrap;
  }

  function decorateTicker(ticker) {
    each('.evb-ticker-set', function (set) {
      var seps = set.querySelectorAll('.evb-t-sep');
      for (var i = 0; i < seps.length; i++) {
        seps[i].classList.add('evbh-tk');
        seps[i].innerHTML = i % 2 ? bat('evbh-tk-bat') : pumpkin('evbh-pk evbh-tk-pk', false);
      }
    });
  }

  function build() {
    var style = document.createElement('style');
    style.id = 'evbh-style';
    style.textContent = css;
    document.head.appendChild(style);

    var bar0 = document.querySelector('.site-topbar');
    var nav = document.querySelector('.site-nav');
    var top = document.createElement('div');
    top.setAttribute('aria-hidden', 'true');
    var place = function () {
      var y = (bar0 ? bar0.getBoundingClientRect().bottom + window.scrollY : 0) + (nav ? nav.offsetHeight : 0);
      y = Math.round(y);
      top.style.cssText = 'position:absolute;left:0;right:0;top:' + y + 'px;height:0;pointer-events:none;';
    };
    top.appendChild(buildBats());
    top.appendChild(el('evbh-web-tr', WEB));
    top.appendChild(el('evbh-web-tl', WEB));
    top.appendChild(el('evbh-spider', '<i></i>' + SPIDER));
    document.body.appendChild(top);
    place();
    window.addEventListener('resize', place, { passive: true });
    window.addEventListener('load', place);

    var logo = document.querySelector('.site-nav-logo');
    if (logo && positioned(logo)) logo.appendChild(el('evbh-hat evbh-hat-logo', HAT));

    var bar = document.querySelector('.site-topbar-inner');
    if (bar) bar.insertAdjacentHTML('afterbegin', pumpkin('evbh-pk evbh-pk-top', false));

    var foot = document.querySelector('.evb-footer');
    if (foot) {
      var sky = document.createElement('div');
      sky.className = 'evbh-sky';
      sky.setAttribute('aria-hidden', 'true');
      sky.innerHTML = '<div class="evbh-sky-label">Happy Halloween from Avenue A</div>' + skyline();
      var line = foot.querySelector('.evb-footer-topbar');
      foot.insertBefore(sky, line ? line.nextSibling : foot.firstChild);
      foot.appendChild(el('evbh-foot-br', WEB));
    }
    var copy = document.querySelector('.evb-footer-copy');
    if (copy) copy.insertAdjacentHTML('afterbegin', pumpkin('evbh-pk evbh-pk-foot', false));

    addWeb(document.querySelector('#what-we-buy'), 'tl', 130, 0.2);
    addWeb(document.querySelector('#store'), 'tr', 150, 0.22);
    addWeb(document.querySelector('.evb-faq-section'), 'bl', 140, 0.2);
    addWeb(document.querySelector('.wb-block'), 'br', 110, 0.2);
    each('.cp-metal-band', function (band, i) { addWeb(band, i % 2 ? 'tl' : 'tr', 120, 0.2); });
    addWeb(document.querySelector('.blog-article'), 'tr', 110, 0.2);

    each('.evb-cc', function (card) { addDrop(card.querySelector('.evb-cc-img'), 46); });
    each('.blog-card', function (card) { addDrop(card.querySelector('.blog-card-media') || card, 40); });
    each('.brand-tile', function (tile) { addDrop(tile, 24); });

    addPorch(document.querySelector('.evb-cta-band'));
    addPorch(document.querySelector('.blog-article-cta'));

    addGhost(document.querySelector('.evb-faq-sidebar-cta'));
    addGhost(document.querySelector('.blog-sidebar'), 'l');

    whenReady('.evb-ticker', decorateTicker);
    whenReady('.evb-asst-toggle', function (toggle) {
      toggle.appendChild(el('evbh-hat evbh-hat-asst', HAT));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
