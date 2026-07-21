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
