/**
 * East Village Buyers — Store runtime
 * ---------------------------------------------------------------------------
 * window.EVB_STORE — the shared engine every store page uses:
 *   money()/esc()        formatting helpers
 *   cart                 localStorage-backed line items
 *   totals()             subtotal, discount, shipping, tax, total (integer cents)
 *   promo                promo-code validation
 *   orders               order records for the receipt page
 *   toast()              transient confirmations
 *   mountCartUI()        nav cart button + slide-out mini cart
 *
 * All money is integer cents end to end. Floats are only ever produced at the
 * final formatting step, which is the only place rounding is allowed to happen.
 */
(function () {
  'use strict';

  var CFG = window.EVB_STORE_CONFIG || {};
  var CART_KEY = 'evb_cart_v1';
  var ORDERS_KEY = 'evb_orders_v1';
  var CHECKOUT_KEY = 'evb_checkout_v1';

  /* ===================================================================== */
  /* Formatting                                                            */
  /* ===================================================================== */

  function money(cents) {
    if (typeof cents !== 'number' || !isFinite(cents)) cents = 0;
    var neg = cents < 0;
    var v = Math.abs(Math.round(cents)) / 100;
    var s = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '-' : '') + (CFG.currencySymbol || '$') + s;
  }

  // Every dynamic string goes through this before touching innerHTML.
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function attr(str) { return esc(str); }

  /* ===================================================================== */
  /* Storage helpers — never throw, even in private mode                   */
  /* ===================================================================== */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* ===================================================================== */
  /* Cart                                                                  */
  /* ===================================================================== */

  var lines = read(CART_KEY, []);
  if (!Array.isArray(lines)) lines = [];

  function lineKey(productId, variantId) { return productId + '::' + variantId; }

  function persist() {
    write(CART_KEY, lines);
    window.dispatchEvent(new CustomEvent('evb:cart-change', { detail: { lines: lines } }));
  }

  var cart = {
    get lines() { return lines.slice(); },

    count: function () {
      return lines.reduce(function (n, l) { return n + l.qty; }, 0);
    },

    subtotal: function () {
      return lines.reduce(function (n, l) { return n + l.price * l.qty; }, 0);
    },

    has: function (productId, variantId) {
      return lines.some(function (l) { return l.key === lineKey(productId, variantId); });
    },

    qtyOf: function (productId, variantId) {
      var l = lines.filter(function (l) { return l.key === lineKey(productId, variantId); })[0];
      return l ? l.qty : 0;
    },

    /**
     * Add a product/variant. Quantity is clamped to the variant's stock —
     * most of this inventory is one-of-one, so silently exceeding stock would
     * produce orders that cannot be fulfilled.
     * Returns { ok, line, clamped, reason }.
     */
    add: function (product, variantId, qty) {
      qty = Math.max(1, parseInt(qty, 10) || 1);
      var variant = window.EVB_CATALOG.variant(product, variantId);
      if (!variant) return { ok: false, reason: 'Variant not found' };
      if (!variant.stock) return { ok: false, reason: 'Out of stock' };

      var key = lineKey(product.id, variant.id);
      var existing = lines.filter(function (l) { return l.key === key; })[0];
      var current = existing ? existing.qty : 0;
      var want = current + qty;
      var clamped = false;

      if (want > variant.stock) { want = variant.stock; clamped = true; }
      if (want === current) return { ok: false, clamped: true, reason: 'Only ' + variant.stock + ' available' };

      if (existing) {
        existing.qty = want;
      } else {
        existing = {
          key: key,
          productId: product.id,
          variantId: variant.id,
          slug: product.slug,
          title: product.title,
          brand: product.brand,
          variantLabel: product.variantLabel ? variant.label : '',
          image: product.images[0],
          price: variant.price,
          qty: want,
          taxable: product.taxable !== false,
          maxStock: variant.stock,
          squareVariationId: variant.squareVariationId || null
        };
        lines.push(existing);
      }
      persist();
      return { ok: true, line: existing, clamped: clamped };
    },

    setQty: function (key, qty) {
      qty = parseInt(qty, 10) || 0;
      var l = lines.filter(function (l) { return l.key === key; })[0];
      if (!l) return false;
      if (qty <= 0) return cart.remove(key);
      l.qty = Math.min(qty, l.maxStock || qty);
      persist();
      return true;
    },

    remove: function (key) {
      var before = lines.length;
      lines = lines.filter(function (l) { return l.key !== key; });
      if (lines.length !== before) { persist(); return true; }
      return false;
    },

    clear: function () { lines = []; persist(); },

    /**
     * Re-check every line against the live catalog. Catches prices that moved
     * (gold is spot-priced) and items that sold while the cart sat in storage.
     * Returns a list of human-readable changes for the cart page to surface.
     */
    reconcile: function () {
      var changes = [];
      var kept = [];
      lines.forEach(function (l) {
        var p = window.EVB_CATALOG.byId(l.productId);
        if (!p) { changes.push({ type: 'gone', title: l.title }); return; }
        var v = window.EVB_CATALOG.variant(p, l.variantId);
        if (!v || !v.stock) { changes.push({ type: 'gone', title: l.title }); return; }

        if (v.price !== l.price) {
          changes.push({ type: 'price', title: l.title, from: l.price, to: v.price });
          l.price = v.price;
        }
        if (l.qty > v.stock) {
          changes.push({ type: 'qty', title: l.title, to: v.stock });
          l.qty = v.stock;
        }
        l.maxStock = v.stock;
        l.image = p.images[0];
        l.title = p.title;
        l.slug = p.slug;
        l.taxable = p.taxable !== false;
        kept.push(l);
      });
      if (changes.length) { lines = kept; persist(); }
      return changes;
    }
  };

  /* ===================================================================== */
  /* Promo codes                                                           */
  /* ===================================================================== */

  var promo = {
    /** Returns { ok, code, rule, message }. */
    validate: function (code) {
      var key = String(code || '').trim().toUpperCase();
      if (!key) return { ok: false, message: 'Enter a code.' };

      var rule = (CFG.promoCodes || {})[key];
      if (!rule) return { ok: false, message: 'That code is not valid.' };

      var sub = cart.subtotal();
      if (rule.minSubtotal && sub < rule.minSubtotal) {
        return { ok: false, message: 'Requires a subtotal of ' + money(rule.minSubtotal) + '.' };
      }
      return { ok: true, code: key, rule: rule, message: rule.label };
    }
  };

  /* ===================================================================== */
  /* Totals                                                                */
  /* ===================================================================== */

  /**
   * totals({ shippingId, promoCode }) -> integer cents throughout.
   *
   * Discounts are allocated across taxable and non-taxable subtotals in
   * proportion to each, so tax is charged on the discounted taxable amount
   * rather than the full one. Bullion is flagged non-taxable in the catalog.
   */
  function totals(opts) {
    opts = opts || {};
    var ls = lines;

    var subtotal = 0, taxableSub = 0;
    ls.forEach(function (l) {
      var amt = l.price * l.qty;
      subtotal += amt;
      if (l.taxable) taxableSub += amt;
    });

    /* --- discount --- */
    var discount = 0, freeShip = false, promoLabel = '';
    var v = opts.promoCode ? promo.validate(opts.promoCode) : { ok: false };
    if (v.ok) {
      promoLabel = v.rule.label;
      if (v.rule.type === 'percent') discount = Math.round(subtotal * (v.rule.value / 100));
      else if (v.rule.type === 'fixed') discount = Math.min(v.rule.value, subtotal);
      else if (v.rule.type === 'shipping') freeShip = true;
    }

    /* --- shipping --- */
    var rates = CFG.shippingRates || [];
    var rate = rates.filter(function (r) { return r.id === opts.shippingId; })[0] || rates[0] || { id: 'pickup', amount: 0 };
    var shipping = rate.amount || 0;

    var threshold = CFG.freeShippingThreshold || 0;
    var shippingFree = false;
    if (rate.id === 'standard' && threshold > 0 && (subtotal - discount) >= threshold) {
      shipping = 0; shippingFree = true;
    }
    if (freeShip && rate.id === 'standard') { shipping = 0; shippingFree = true; }

    /* --- tax --- */
    // Allocate the discount proportionally so tax lands on the discounted
    // taxable base. Guard against a zero subtotal.
    var taxableAfterDiscount = taxableSub;
    if (discount > 0 && subtotal > 0) {
      taxableAfterDiscount = Math.max(0, taxableSub - Math.round(discount * (taxableSub / subtotal)));
    }
    var tax = Math.round(taxableAfterDiscount * (CFG.taxRate || 0));

    var total = Math.max(0, subtotal - discount + shipping + tax);

    return {
      subtotal: subtotal,
      taxableSubtotal: taxableSub,
      discount: discount,
      promoLabel: promoLabel,
      promoCode: v.ok ? v.code : '',
      shipping: shipping,
      shippingFree: shippingFree,
      shippingRate: rate,
      tax: tax,
      taxRate: CFG.taxRate || 0,
      total: total,
      count: cart.count()
    };
  }

  /* ===================================================================== */
  /* Orders — receipts                                                     */
  /* ===================================================================== */

  var orders = {
    /** Newest first. */
    all: function () {
      var list = read(ORDERS_KEY, []);
      return Array.isArray(list) ? list : [];
    },

    get: function (id) {
      return orders.all().filter(function (o) { return o.id === id; })[0] || null;
    },

    save: function (order) {
      var list = orders.all();
      var i = -1;
      list.forEach(function (o, idx) { if (o.id === order.id) i = idx; });
      if (i >= 0) list[i] = order; else list.unshift(order);
      // Keep the local receipt history bounded.
      write(ORDERS_KEY, list.slice(0, 25));
      return order;
    },

    /**
     * Fetch a receipt. Prefers the server (source of truth once Square is
     * connected) and falls back to the local record so the confirmation page
     * still works in demo mode or offline.
     */
    fetch: function (id) {
      var base = (CFG.apiBase || '').replace(/\/$/, '');
      var local = orders.get(id);
      if (!base) return Promise.resolve(local);

      return fetch(base + '/orders/' + encodeURIComponent(id), { headers: { 'Accept': 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('Order HTTP ' + r.status);
          return r.json();
        })
        .then(function (o) { return orders.save(o); })
        .catch(function () { return local; });
    }
  };

  /* Human-facing order number: EVB-YYMMDD-XXXX */
  function newOrderId() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    var rand = Math.floor(Math.random() * 36 * 36 * 36 * 36).toString(36).toUpperCase().padStart(4, '0');
    return 'EVB-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + rand;
  }

  /* Idempotency key — Square requires one per payment so a retried request
     never charges twice. */
  function idempotencyKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'evb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  /* ===================================================================== */
  /* Checkout draft — survives a refresh mid-checkout                      */
  /* ===================================================================== */

  var draft = {
    get: function () { return read(CHECKOUT_KEY, {}) || {}; },
    set: function (patch) {
      var d = draft.get();
      Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
      write(CHECKOUT_KEY, d);
      return d;
    },
    clear: function () { try { localStorage.removeItem(CHECKOUT_KEY); } catch (e) {} }
  };

  /* ===================================================================== */
  /* Toast                                                                 */
  /* ===================================================================== */

  var toastTimer = null;
  function toast(message, kind) {
    var el = document.getElementById('evbStoreToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'evbStoreToast';
      el.className = 'evb-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = 'evb-toast' + (kind ? ' evb-toast--' + kind : '');
    el.innerHTML = '<span>' + esc(message) + '</span>';
    // Force a reflow so the class change animates on repeat calls.
    void el.offsetWidth;
    el.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-open'); }, 3200);
  }

  /* ===================================================================== */
  /* Cart UI — nav button + slide-out mini cart                            */
  /* ===================================================================== */

  var BASE = ''; // set by mountCartUI, so /store/ and /store/cart/ both work

  function cartIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
  }

  function renderMiniLines() {
    if (!lines.length) {
      return '<div class="evb-mini-empty">' +
        '<div class="evb-mini-empty-icon">' + cartIcon() + '</div>' +
        '<p class="evb-mini-empty-title">Your bag is empty</p>' +
        '<p class="evb-mini-empty-sub">Everything in the shop is authenticated in-house before it goes up.</p>' +
        '<a class="evb-btn evb-btn--primary" href="' + BASE + 'store/">Start shopping</a>' +
        '</div>';
    }

    var rows = lines.map(function (l) {
      return '<li class="evb-mini-line">' +
        '<a class="evb-mini-thumb" href="' + BASE + 'store/product/?p=' + encodeURIComponent(l.slug) + '">' +
          '<img src="' + attr(l.image) + '" alt="' + attr(l.title) + '" loading="lazy" decoding="async">' +
        '</a>' +
        '<div class="evb-mini-info">' +
          '<a class="evb-mini-title" href="' + BASE + 'store/product/?p=' + encodeURIComponent(l.slug) + '">' + esc(l.title) + '</a>' +
          (l.variantLabel ? '<p class="evb-mini-variant">' + esc(l.variantLabel) + '</p>' : '') +
          '<div class="evb-mini-row">' +
            '<div class="evb-qty evb-qty--sm">' +
              '<button type="button" class="evb-qty-btn" data-cart-dec="' + attr(l.key) + '" aria-label="Decrease quantity">&minus;</button>' +
              '<span class="evb-qty-val">' + l.qty + '</span>' +
              '<button type="button" class="evb-qty-btn" data-cart-inc="' + attr(l.key) + '" aria-label="Increase quantity"' + (l.qty >= l.maxStock ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<span class="evb-mini-price">' + money(l.price * l.qty) + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="evb-mini-x" data-cart-remove="' + attr(l.key) + '" aria-label="Remove ' + attr(l.title) + '">&times;</button>' +
      '</li>';
    }).join('');

    var t = totals({ shippingId: 'pickup' });

    return '<ul class="evb-mini-lines">' + rows + '</ul>' +
      '<div class="evb-mini-foot">' +
        '<div class="evb-mini-subtotal"><span>Subtotal</span><strong>' + money(t.subtotal) + '</strong></div>' +
        '<p class="evb-mini-note">Shipping and tax calculated at checkout.</p>' +
        '<a class="evb-btn evb-btn--primary evb-btn--block" href="' + BASE + 'store/checkout/">Checkout</a>' +
        '<a class="evb-btn evb-btn--ghost evb-btn--block" href="' + BASE + 'store/cart/">View bag</a>' +
      '</div>';
  }

  function syncCartUI() {
    var n = cart.count();
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = n;
      el.classList.toggle('is-empty', n === 0);
    });
    var body = document.getElementById('evbMiniBody');
    if (body) body.innerHTML = renderMiniLines();
    var title = document.getElementById('evbMiniCount');
    if (title) title.textContent = n === 1 ? '1 item' : n + ' items';
  }

  function openMini() {
    var d = document.getElementById('evbMiniCart');
    var o = document.getElementById('evbMiniOverlay');
    if (!d) return;
    d.classList.add('is-open');
    if (o) o.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var close = document.getElementById('evbMiniClose');
    if (close) close.focus();
  }

  function closeMini() {
    var d = document.getElementById('evbMiniCart');
    var o = document.getElementById('evbMiniOverlay');
    if (!d) return;
    d.classList.remove('is-open');
    if (o) o.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /**
   * The site nav is sticky at top:0 and its height varies with the breakpoint.
   * Publish the measured heights as CSS variables so the store bar can stick
   * directly beneath it instead of underneath it, and so the sticky order
   * summary clears both.
   */
  function syncStickyOffsets() {
    var nav = document.querySelector('.site-nav');
    var bar = document.querySelector('.evb-storebar');
    var root = document.documentElement;
    root.style.setProperty('--evb-navh', (nav ? nav.offsetHeight : 0) + 'px');
    root.style.setProperty('--evb-storebar-h', (bar ? bar.offsetHeight : 0) + 'px');
  }

  /**
   * Build the mini cart and wire the nav cart button.
   * `base` is the relative path back to the site root ('' from /store/,
   * '../' from /store/cart/), so this works at any directory depth.
   */
  function mountCartUI(base) {
    BASE = base == null ? '' : base;

    syncStickyOffsets();
    window.addEventListener('resize', syncStickyOffsets);
    window.addEventListener('load', syncStickyOffsets);

    if (!document.getElementById('evbMiniCart')) {
      var wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="evb-mini-overlay" id="evbMiniOverlay"></div>' +
        '<aside class="evb-mini" id="evbMiniCart" aria-hidden="true" aria-label="Shopping bag">' +
          '<header class="evb-mini-head">' +
            '<div><p class="evb-mini-eyebrow">Your bag</p><p class="evb-mini-count" id="evbMiniCount">0 items</p></div>' +
            '<button type="button" class="evb-mini-close" id="evbMiniClose" aria-label="Close bag">&times;</button>' +
          '</header>' +
          '<div class="evb-mini-body" id="evbMiniBody"></div>' +
        '</aside>';
      while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

      document.getElementById('evbMiniOverlay').addEventListener('click', closeMini);
      document.getElementById('evbMiniClose').addEventListener('click', closeMini);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMini();
      });
    }

    // Delegated so it keeps working after the mini cart re-renders.
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cart-open],[data-cart-inc],[data-cart-dec],[data-cart-remove]') : null;
      if (!t) return;

      if (t.hasAttribute('data-cart-open')) { e.preventDefault(); openMini(); return; }

      var key = t.getAttribute('data-cart-inc') || t.getAttribute('data-cart-dec') || t.getAttribute('data-cart-remove');
      var line = lines.filter(function (l) { return l.key === key; })[0];
      if (!line) return;

      if (t.hasAttribute('data-cart-inc')) cart.setQty(key, line.qty + 1);
      else if (t.hasAttribute('data-cart-dec')) cart.setQty(key, line.qty - 1);
      else { cart.remove(key); toast('Removed from bag'); }
    });

    window.addEventListener('evb:cart-change', syncCartUI);

    // Another tab changed the cart — keep this one honest.
    window.addEventListener('storage', function (e) {
      if (e.key !== CART_KEY) return;
      lines = read(CART_KEY, []) || [];
      syncCartUI();
      window.dispatchEvent(new CustomEvent('evb:cart-external'));
    });

    syncCartUI();
  }

  /* ===================================================================== */
  /* Shared markup builders                                                */
  /* ===================================================================== */

  /**
   * Condition collapsed to one short word, used as the price microlabel the
   * way a marketplace labels an ask. "Pre-owned — Excellent" -> "Pre-owned".
   */
  function conditionShort(cond) {
    if (!cond) return 'Price';
    return String(cond).split('—')[0].trim();
  }

  /** Coarse condition bucket, for the storefront filter rail. */
  function conditionGroup(cond) {
    if (/deadstock|sealed/i.test(cond || '')) return 'new';
    if (/bullion|numismatic/i.test(cond || '')) return 'bullion';
    return 'preowned';
  }

  /**
   * Product card used on the storefront, search results and related rails.
   * Deliberately quiet: the photo carries the card, the type stays out of the
   * way, and colour is reserved for a genuine sale or a sold-out state.
   */
  function productCard(p, base) {
    base = base == null ? BASE : base;
    var out = p.stock <= 0;
    var href = base + 'store/product/?p=' + encodeURIComponent(p.slug);
    var save = (p.compareAt && p.compareAt > p.price)
      ? Math.round((1 - p.price / p.compareAt) * 100) : 0;

    // At most one badge. Stacked badges are what made this look busy.
    var badge = '';
    if (out) badge = '<span class="evb-badge evb-badge--out">Sold</span>';
    else if (save >= 5) badge = '<span class="evb-badge evb-badge--save">' + save + '% off</span>';
    else if (p.stock === 1) badge = '<span class="evb-badge evb-badge--last">Last one</span>';

    var price = money(p.price);
    if (p.minPrice !== p.maxPrice) price = money(p.minPrice) + '+';

    var sizes = p.variantLabel && p.variants.length > 1
      ? p.variants.filter(function (v) { return v.stock > 0; }).length + ' ' + p.variantLabel.toLowerCase() + 's'
      : '';

    return '<article class="evb-card' + (out ? ' is-out' : '') + '">' +
      '<a class="evb-card-media" href="' + attr(href) + '">' +
        (badge ? '<div class="evb-card-badges">' + badge + '</div>' : '') +
        '<img src="' + attr(p.images[0]) + '" alt="' + attr(p.title) + '" loading="lazy" decoding="async">' +
      '</a>' +
      '<a class="evb-card-body" href="' + attr(href) + '">' +
        (p.brand ? '<p class="evb-card-brand">' + esc(p.brand) + '</p>' : '') +
        '<h3 class="evb-card-title">' + esc(p.title) + '</h3>' +
        '<div class="evb-card-foot">' +
          '<p class="evb-card-label">' + esc(out ? 'Sold' : conditionShort(p.condition)) + '</p>' +
          '<p class="evb-card-pricerow">' +
            '<span class="evb-card-price">' + price + '</span>' +
            (p.compareAt && p.compareAt > p.price ? '<span class="evb-card-compare">' + money(p.compareAt) + '</span>' : '') +
          '</p>' +
        '</div>' +
        (sizes ? '<p class="evb-card-sizes">' + esc(sizes) + ' available</p>' : '') +
      '</a>' +
    '</article>';
  }

  /* ===================================================================== */

  window.EVB_STORE = {
    config: CFG,
    money: money,
    esc: esc,
    attr: attr,
    cart: cart,
    promo: promo,
    totals: totals,
    orders: orders,
    draft: draft,
    toast: toast,
    mountCartUI: mountCartUI,
    openMiniCart: openMini,
    closeMiniCart: closeMini,
    syncCartUI: syncCartUI,
    productCard: productCard,
    conditionShort: conditionShort,
    conditionGroup: conditionGroup,
    syncStickyOffsets: syncStickyOffsets,
    newOrderId: newOrderId,
    idempotencyKey: idempotencyKey,
    isLive: function () { return !!(CFG.apiBase && CFG.squareApplicationId && CFG.squareLocationId); }
  };
})();
