/* East Village Buyers — Shopify theme JS
   Vanilla JS, no build step. Handles: mobile nav, header dropdowns,
   cart drawer with AJAX add/update/remove, quantity steppers,
   product page variant + image swapping. */
(function () {
  var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };

  /* ---------- Mobile nav drawer ---------- */
  /* ---------- Back to top (footer) ---------- */
  function initBackToTop() {
    var btn = $('#BackToTop');
    if (!btn) return;
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function initMobileNav() {
    var btn = $('#MobileMenuBtn'), closeBtn = $('#MobileMenuClose');
    var drawer = $('#MobileDrawer'), overlay = $('#MobileDrawerOverlay');
    if (!btn || !drawer) return;
    function open() { drawer.classList.add('open'); overlay.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; }
    function close() { drawer.classList.remove('open'); overlay.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
    btn.addEventListener('click', open);
    closeBtn && closeBtn.addEventListener('click', close);
    overlay && overlay.addEventListener('click', close);
  }

  /* ---------- Cart drawer ---------- */
  var cartDrawer = null;
  function initCartDrawer() {
    cartDrawer = $('#CartDrawer');
    var openBtn = $('#CartIconBtn');
    if (!cartDrawer) return;
    openBtn && openBtn.addEventListener('click', function () { toggleCartDrawer(true); });
    $$('[data-cart-close]', cartDrawer).forEach(function (el) { el.addEventListener('click', function () { toggleCartDrawer(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleCartDrawer(false); });
  }
  function toggleCartDrawer(show) {
    if (!cartDrawer) return;
    cartDrawer.classList.toggle('open', show);
    cartDrawer.setAttribute('aria-hidden', show ? 'false' : 'true');
    document.body.style.overflow = show ? 'hidden' : '';
  }

  function updateCartCount(count) {
    var el = $('#CartCount');
    if (!el) return;
    el.textContent = count;
    el.toggleAttribute('data-zero', count === 0);
  }

  function refreshCartDrawer() {
    fetch('/?section_id=cart-drawer-section')
      .catch(function () {})
      .then(function () {});
    // Simpler + more reliable: re-render just this section via the Section Rendering API
    fetch(window.location.pathname + '?sections=cart-drawer')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data['cart-drawer']) {
          var wrap = document.createElement('div');
          wrap.innerHTML = data['cart-drawer'];
          var fresh = wrap.querySelector('#CartDrawer');
          if (fresh && cartDrawer) {
            fresh.classList.add('open');
            cartDrawer.replaceWith(fresh);
            cartDrawer = fresh;
            bindQtyControls(cartDrawer);
            $$('[data-cart-close]', cartDrawer).forEach(function (el) { el.addEventListener('click', function () { toggleCartDrawer(false); }); });
          }
        }
      })
      .catch(function () { /* Section Rendering API not set up for this section name — cart still works, drawer just won't live-refresh until next page load */ });
  }

  /* ---------- Add to cart (product form) ---------- */
  function initProductForm() {
    var form = $('#ProductForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#AddToCartBtn');
      var msg = $('#ProductFormMessage');
      btn.disabled = true;
      msg.textContent = 'Adding…';
      msg.className = 'product-form__message';

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: $('#ProductVariantId').value,
          quantity: parseInt(form.querySelector('[name="quantity"]').value, 10) || 1,
        }),
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.description || 'Could not add to cart');
          msg.textContent = 'Added to cart.';
          msg.className = 'product-form__message is-ok';
          return fetch('/cart.js').then(function (r) { return r.json(); });
        })
        .then(function (cart) {
          if (cart) { updateCartCount(cart.item_count); refreshCartDrawer(); toggleCartDrawer(true); }
        })
        .catch(function (err) {
          msg.textContent = err.message;
          msg.className = 'product-form__message is-error';
        })
        .finally(function () { btn.disabled = false; });
    });
  }

  /* ---------- Product variant swatches + image swap ---------- */
  function formatMoney(cents) {
    return (window.Shopify && Shopify.formatMoney) ? Shopify.formatMoney(cents) : '$' + (cents / 100).toFixed(2);
  }

  function initVariantPicker() {
    var jsonEl = $('#ProductJson');
    var swatchGroups = $$('.product-form__swatches');
    if (!swatchGroups.length && !jsonEl) return;

    var variants = [];
    try { variants = jsonEl ? JSON.parse(jsonEl.textContent) : []; } catch (e) { variants = []; }

    // Seed selected options from whichever swatch already has .is-selected server-side.
    var selected = swatchGroups.map(function (group) {
      var active = $('.product-form__swatch.is-selected', group);
      return active ? active.getAttribute('data-option-value') : null;
    });

    function findVariant() {
      return variants.find(function (v) {
        var opts = [v.option1, v.option2, v.option3];
        return selected.every(function (val, i) { return val === null || opts[i] === val; });
      });
    }

    function applyVariant(variant) {
      var idInput = $('#ProductVariantId');
      var addBtn = $('#AddToCartBtn');
      var addLabel = $('#AddToCartLabel');
      var priceWrap = $('.product-detail__body .price');
      var skuEl = $('#ProductSku');

      if (idInput) idInput.value = variant ? variant.id : '';
      if (addBtn) addBtn.disabled = !variant || !variant.available;
      if (addLabel) addLabel.textContent = !variant ? 'Unavailable' : (variant.available ? 'Add to Cart' : 'Sold Out');
      if (skuEl) skuEl.textContent = variant && variant.sku ? 'SKU: ' + variant.sku : '';

      if (priceWrap && variant) {
        var onSale = variant.compare_at_price && variant.compare_at_price > variant.price;
        priceWrap.classList.toggle('price--on-sale', !!onSale);
        priceWrap.innerHTML = onSale
          ? '<span class="price__compare">' + formatMoney(variant.compare_at_price) + '</span><span class="price__sale">' + formatMoney(variant.price) + '</span>'
          : '<span class="price__regular">' + formatMoney(variant.price) + '</span>';
      }

      if (variant && variant.featured_image) {
        var main = $('#ProductMainImage');
        var imgSrc = variant.featured_image.src;
        if (main && imgSrc) {
          main.src = imgSrc.replace(/(\.[a-z]+)(\?.*)?$/i, '_900x900$1$2');
          $$('.product-detail__thumb').forEach(function (t) {
            t.classList.toggle('is-active', t.getAttribute('data-image-url').indexOf(imgSrc.split('/').pop().split('?')[0].split('_')[0]) !== -1);
          });
        }
      }

      // Reflect the chosen combination in the URL without a page reload.
      if (variant && window.history && history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        history.replaceState({}, '', url);
      }
    }

    swatchGroups.forEach(function (group) {
      var optionIndex = parseInt(group.getAttribute('data-option-index'), 10);
      $$('.product-form__swatch', group).forEach(function (btn) {
        btn.addEventListener('click', function () {
          $$('.product-form__swatch', group).forEach(function (b) { b.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
          selected[optionIndex] = btn.getAttribute('data-option-value');
          var label = $('[data-option-selected-label="' + optionIndex + '"]');
          if (label) label.textContent = selected[optionIndex];
          applyVariant(findVariant());
        });
      });
    });

    $$('.product-detail__thumb').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        var url = thumb.getAttribute('data-image-url');
        var main = $('#ProductMainImage');
        if (main && url) main.src = url;
        $$('.product-detail__thumb').forEach(function (t) { t.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      });
    });
  }

  /* ---------- Quantity steppers (product form, cart page, cart drawer) ---------- */
  function bindQtyControls(scope) {
    $$('.qty-stepper', scope).forEach(function (stepper) {
      var input = $('.qty-stepper__input', stepper);
      var minus = $('[data-qty-minus]', stepper);
      var plus = $('[data-qty-plus]', stepper);
      var line = stepper.getAttribute('data-line');
      var isCartLine = line && line !== '0' && (stepper.closest('.cart-drawer__item') || stepper.closest('.cart-page__table'));

      function commit(newQty) {
        input.value = newQty;
        if (isCartLine) updateCartLine(line, newQty);
      }
      minus && minus.addEventListener('click', function () { commit(Math.max(0, (parseInt(input.value, 10) || 1) - 1)); });
      plus && plus.addEventListener('click', function () { commit((parseInt(input.value, 10) || 0) + 1); });
      input && input.addEventListener('change', function () { if (isCartLine) updateCartLine(line, Math.max(0, parseInt(input.value, 10) || 0)); });
    });

    $$('[data-qty-remove]', scope).forEach(function (btn) {
      btn.addEventListener('click', function () { updateCartLine(btn.getAttribute('data-line'), 0); });
    });
  }

  function updateCartLine(line, quantity) {
    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: parseInt(line, 10), quantity: quantity }),
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        updateCartCount(cart.item_count);
        if ($('.cart-page__table')) { window.location.reload(); return; }
        refreshCartDrawer();
      })
      .catch(function () {});
  }

  /* ---------- Predictive search ---------- */
  function initPredictiveSearch() {
    var toggle = $('#SearchToggle');
    var panel = $('#SearchPanel');
    var input = $('#SearchInput');
    var results = $('#SearchResults');
    if (!toggle || !panel) return;

    function open() {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { input.focus(); }, 50);
    }
    function close() {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
    toggle.addEventListener('click', open);
    $$('[data-search-close]', panel).forEach(function (el) { el.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    var timer, controller;
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (!q) { results.innerHTML = ''; return; }
      timer = setTimeout(function () { runSearch(q); }, 280);
    });

    function runSearch(q) {
      results.innerHTML = '<div class="search-panel__loading">Searching…</div>';
      if (controller) controller.abort();
      controller = new AbortController();
      fetch('/search/suggest.json?q=' + encodeURIComponent(q) + '&resources[type]=product&resources[limit]=6&resources[options][unavailable_products]=last', { signal: controller.signal })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var products = (data.resources && data.resources.results && data.resources.results.products) || [];
          if (!products.length) {
            results.innerHTML = '<div class="search-panel__empty">No products found for &ldquo;' + q.replace(/</g, '&lt;') + '&rdquo;.</div>';
            return;
          }
          results.innerHTML = products.map(function (p) {
            var img = p.featured_image ? p.featured_image.url : (p.image || '');
            return '<a href="' + p.url + '" class="search-hit">' +
              (img ? '<img src="' + img + '&width=100" alt="">' : '') +
              '<span><span class="search-hit__title">' + p.title + '</span><br><span class="search-hit__price">' + p.price + '</span></span></a>';
          }).join('') + '<a href="/search?q=' + encodeURIComponent(q) + '" class="search-panel__viewall">View all results for &ldquo;' + q.replace(/</g, '&lt;') + '&rdquo;</a>';
        })
        .catch(function (e) { if (e.name !== 'AbortError') results.innerHTML = '<div class="search-panel__empty">Search is unavailable right now.</div>'; });
    }
  }

  /* ---------- Collection filters ---------- */
  function initCollectionFilters() {
    var panel = $('#CollectionFilters');
    var toggle = $('#FiltersToggle');
    var overlay = $('#FiltersOverlay');
    if (panel && toggle) {
      toggle.addEventListener('click', function () { panel.classList.add('open'); overlay.classList.add('open'); });
      overlay && overlay.addEventListener('click', function () { panel.classList.remove('open'); overlay.classList.remove('open'); });
    }
    var form = $('#FacetForm');
    if (!form) return;
    var timer;
    form.addEventListener('change', function (e) {
      if (e.target.matches('input[type="checkbox"]')) form.requestSubmit ? form.requestSubmit() : form.submit();
    });
    form.addEventListener('input', function (e) {
      if (e.target.matches('input[type="number"]')) {
        clearTimeout(timer);
        timer = setTimeout(function () { form.requestSubmit ? form.requestSubmit() : form.submit(); }, 700);
      }
    });
  }

  /* ---------- Account dropdown ---------- */
  function initAccountMenu() {
    var btn = $('#AccountBtn');
    var menu = $('.site-header__account-menu');
    if (!btn || !menu) return;
    function close() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target) && e.target !== btn) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  /* ---------- Generic horizontal sliders (product slider, collection slider) ---------- */
  function initSliders() {
    $$('[data-slider-track]').forEach(function (track) {
      var section = track.closest('.section') || document;
      var prev = $('[data-slider-prev]', section);
      var next = $('[data-slider-next]', section);
      var step = function () {
        var card = track.firstElementChild;
        return card ? card.getBoundingClientRect().width + 20 : 260;
      };
      prev && prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      next && next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
    });
  }

  /* ---------- Product card image carousel ---------- */
  function initCardCarousels() {
    $$('[data-product-card]').forEach(function (card) {
      var media = $('[data-card-media]', card);
      if (!media) return;
      var imgs = $$('.product-card__img', media);
      var dots = $$('.product-card__dot', media);
      if (imgs.length < 2) return;
      var idx = 0;
      function show(i) {
        idx = (i + imgs.length) % imgs.length;
        imgs.forEach(function (img, j) { img.classList.toggle('is-active', j === idx); });
        dots.forEach(function (d, j) { d.classList.toggle('is-active', j === idx); });
      }
      var prevBtn = $('[data-card-prev]', media);
      var nextBtn = $('[data-card-next]', media);
      prevBtn && prevBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); show(idx - 1); });
      nextBtn && nextBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); show(idx + 1); });
      dots.forEach(function (d, j) { d.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); show(j); }); });
    });
  }

  /* ---------- Product card swatches + quick add ---------- */
  function initCardSwatchesAndQuickAdd() {
    $$('[data-product-card]').forEach(function (card) {
      var variantsScript = $('[data-card-variants]', card);
      var variants = [];
      try { variants = variantsScript ? JSON.parse(variantsScript.textContent) : []; } catch (e) { variants = []; }

      var swatchWrap = $('[data-card-swatches]', card);
      var quickAddBtn = $('[data-quick-add]', card);
      var priceEl = $('.price', card);

      function findVariant(colorValue) {
        return variants.find(function (v) {
          return [v.option1, v.option2, v.option3].indexOf(colorValue) !== -1;
        });
      }

      function renderPrice(variant) {
        if (!priceEl || !variant) return;
        var onSale = variant.compare_at_price && variant.compare_at_price > variant.price;
        priceEl.classList.toggle('price--on-sale', !!onSale);
        priceEl.innerHTML = onSale
          ? '<span class="price__compare">' + formatMoney(variant.compare_at_price) + '</span><span class="price__sale">' + formatMoney(variant.price) + '</span>'
          : '<span class="price__regular">' + formatMoney(variant.price) + '</span>';
      }

      if (swatchWrap) {
        $$('.product-card__swatch', swatchWrap).forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            $$('.product-card__swatch', swatchWrap).forEach(function (b) { b.classList.remove('is-selected'); });
            btn.classList.add('is-selected');
            var variant = findVariant(btn.getAttribute('data-swatch-value'));
            if (variant) {
              renderPrice(variant);
              if (quickAddBtn) {
                quickAddBtn.setAttribute('data-variant-id', variant.id);
                quickAddBtn.disabled = !variant.available;
                $('.qa-label', quickAddBtn).textContent = variant.available ? 'Add' : 'Sold Out';
              }
              if (variant.featured_image) {
                var match = $('.product-card__img[data-card-slide]', card);
                // Prefer swapping to the matching variant image if it's already in the card's carousel.
                var target = Array.prototype.find.call($$('.product-card__img', card), function (img) {
                  return img.src.indexOf(variant.featured_image.src.split('?')[0].split('/').pop()) !== -1;
                });
                if (target) {
                  $$('.product-card__img', card).forEach(function (img) { img.classList.remove('is-active'); });
                  target.classList.add('is-active');
                }
              }
            }
          });
        });
      }

      quickAddBtn && quickAddBtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (quickAddBtn.disabled) return;
        var variantId = quickAddBtn.getAttribute('data-variant-id');
        quickAddBtn.disabled = true;
        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: variantId, quantity: 1 }),
        })
          .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.data.description || 'Could not add to cart');
            quickAddBtn.classList.add('is-added');
            updateCartCount(res.data.item_count || (parseInt($('#CartCount').textContent, 10) || 0) + 1);
            return fetch('/cart.js').then(function (r) { return r.json(); });
          })
          .then(function (cart) {
            if (cart) updateCartCount(cart.item_count);
            refreshCartDrawer();
            setTimeout(function () { quickAddBtn.classList.remove('is-added'); quickAddBtn.disabled = false; }, 1800);
          })
          .catch(function () { quickAddBtn.disabled = false; });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initBackToTop();
    initMobileNav();
    initCartDrawer();
    initProductForm();
    initVariantPicker();
    initAccountMenu();
    initPredictiveSearch();
    initCollectionFilters();
    initSliders();
    initCardCarousels();
    initCardSwatchesAndQuickAdd();
    bindQtyControls(document);
  });
})();
