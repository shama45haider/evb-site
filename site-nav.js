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

  function buildMobileCta() {
    if (document.querySelector('.evb-mobile-cta')) return;
    var bar = document.createElement('div');
    bar.className = 'evb-mobile-cta';
    bar.innerHTML =
      '<a href="sms:9176088939" class="evb-mobile-cta-btn evb-mobile-cta-btn--primary">Text Photos</a>' +
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
