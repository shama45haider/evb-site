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
