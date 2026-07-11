(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  var targets = document.querySelectorAll(
    '.jw-c, .gv-step, .sw-faq-card, .blog-card, .sidebar-widget, ' +
    '.blog-article-inline-img, .evb-faq-item, .sell-trust, .evb-cc'
  );
  if (!targets.length) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('evb-reveal-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(function (el) {
    el.classList.add('evb-reveal');
    io.observe(el);
  });
})();
