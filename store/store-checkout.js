/**
 * East Village Buyers — Checkout
 * ---------------------------------------------------------------------------
 * Drives the four-step checkout and submits the order.
 *
 * TWO PAYMENT PATHS, one UI:
 *
 *  LIVE (EVB_STORE_CONFIG.apiBase + squareApplicationId + squareLocationId set)
 *    Loads the Square Web Payments SDK, which renders the card fields inside
 *    Square's own iframe. The PAN never touches this page or our DOM — the SDK
 *    hands back a single-use token. That token plus the buyer verification
 *    token (3DS/SCA) is POSTed to the Worker, which creates the Square Order
 *    and Payment server-side with the secret access token.
 *
 *  DEMO (nothing configured yet — the state this ships in)
 *    Renders a local card form so the whole flow can be exercised end to end.
 *    It is clearly labelled as demo, and it deliberately does NOT transmit or
 *    persist a card number: only the brand and last four are kept, for the
 *    receipt. Do not put a real card into demo mode.
 *
 * The server recomputes every total. The client figures are an estimate shown
 * to the buyer; if the two disagree, the server's numbers win.
 */
(function () {
  'use strict';

  var S = window.EVB_STORE, C = window.EVB_CATALOG, CFG = window.EVB_STORE_CONFIG || {};

  var STEPS = ['contact', 'delivery', 'payment', 'review'];
  var STEP_LABELS = { contact: 'Contact', delivery: 'Delivery', payment: 'Payment', review: 'Review' };

  var state = {
    step: 'contact',
    reached: { contact: true },
    submitting: false,
    data: {
      firstName: '', lastName: '', email: '', phone: '',
      shippingId: 'pickup',
      address1: '', address2: '', city: '', region: 'NY', postal: '', country: 'US',
      note: '',
      promoCode: '',
      cardName: '', cardNumber: '', cardExp: '', cardCvc: '',
      terms: false, marketing: false
    },
    errors: {},
    square: { payments: null, card: null, ready: false, error: '' }
  };

  var els = {};

  /* ===================================================================== */
  /* Validation                                                            */
  /* ===================================================================== */

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  function digits(v) { return String(v || '').replace(/\D/g, ''); }

  // Luhn — catches transposed digits, which a length check alone will not.
  function luhn(num) {
    var s = digits(num);
    if (s.length < 13 || s.length > 19) return false;
    var sum = 0, alt = false;
    for (var i = s.length - 1; i >= 0; i--) {
      var d = parseInt(s.charAt(i), 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function cardBrand(num) {
    var s = digits(num);
    if (/^4/.test(s)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(s)) return 'Mastercard';
    if (/^3[47]/.test(s)) return 'Amex';
    if (/^6(?:011|5)/.test(s)) return 'Discover';
    if (/^3(?:0[0-5]|[68])/.test(s)) return 'Diners';
    if (/^35/.test(s)) return 'JCB';
    return 'Card';
  }

  function expiryValid(v) {
    var m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(v || '').trim());
    if (!m) return false;
    var mm = parseInt(m[1], 10), yy = parseInt(m[2], 10);
    if (mm < 1 || mm > 12) return false;
    var now = new Date();
    var curYY = now.getFullYear() % 100;
    var curMM = now.getMonth() + 1;
    // A two-digit year is assumed to be in this century.
    if (yy < curYY) return false;
    if (yy === curYY && mm < curMM) return false;
    return true;
  }

  function validate(step) {
    var d = state.data, e = {};

    if (step === 'contact') {
      if (!d.firstName.trim()) e.firstName = 'Required';
      if (!d.lastName.trim()) e.lastName = 'Required';
      if (!d.email.trim()) e.email = 'Required';
      else if (!RE_EMAIL.test(d.email.trim())) e.email = 'Enter a valid email address';
      if (!d.phone.trim()) e.phone = 'Required';
      else if (digits(d.phone).length < 10) e.phone = 'Enter a 10-digit phone number';
    }

    if (step === 'delivery' && d.shippingId !== 'pickup') {
      if (!d.address1.trim()) e.address1 = 'Required';
      if (!d.city.trim()) e.city = 'Required';
      if (!d.region.trim()) e.region = 'Required';
      if (!d.postal.trim()) e.postal = 'Required';
      else if (!/^\d{5}(-\d{4})?$/.test(d.postal.trim())) e.postal = 'Enter a valid ZIP code';
    }

    if (step === 'payment') {
      if (S.isLive()) {
        // Square's iframe owns field-level validation; we only need it mounted.
        if (!state.square.ready) e.card = state.square.error || 'Payment form is still loading';
      } else {
        if (!d.cardName.trim()) e.cardName = 'Required';
        if (!d.cardNumber.trim()) e.cardNumber = 'Required';
        else if (!luhn(d.cardNumber)) e.cardNumber = 'That card number is not valid';
        if (!d.cardExp.trim()) e.cardExp = 'Required';
        else if (!expiryValid(d.cardExp)) e.cardExp = 'Enter a valid future date (MM/YY)';
        if (!d.cardCvc.trim()) e.cardCvc = 'Required';
        else if (!/^\d{3,4}$/.test(digits(d.cardCvc))) e.cardCvc = '3 or 4 digits';
      }
    }

    if (step === 'review') {
      if (!d.terms) e.terms = 'Please accept the terms to place your order';
    }

    state.errors = e;
    return Object.keys(e).length === 0;
  }

  /* ===================================================================== */
  /* Square Web Payments SDK                                               */
  /* ===================================================================== */

  function loadSquareSdk() {
    if (window.Square) return Promise.resolve(window.Square);
    var url = CFG.squareEnvironment === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js';

    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { window.Square ? resolve(window.Square) : reject(new Error('Square SDK did not initialise')); };
      s.onerror = function () { reject(new Error('Could not load the Square payment SDK')); };
      document.head.appendChild(s);
    });
  }

  function mountSquareCard() {
    var target = document.getElementById('sqCard');
    if (!target) return;

    loadSquareSdk()
      .then(function (Square) {
        state.square.payments = Square.payments(CFG.squareApplicationId, CFG.squareLocationId);
        return state.square.payments.card({
          style: {
            input: { fontSize: '15px', fontFamily: 'Montserrat, sans-serif', color: '#1c1917' },
            '.input-container': { borderColor: '#e7e1d8', borderRadius: '10px' },
            '.input-container.is-focus': { borderColor: '#f97316' },
            '.input-container.is-error': { borderColor: '#b91c1c' },
            '.message-text.is-error': { color: '#b91c1c' }
          }
        });
      })
      .then(function (card) {
        state.square.card = card;
        return card.attach('#sqCard');
      })
      .then(function () {
        state.square.ready = true;
        state.square.error = '';
        var n = document.getElementById('cardLoading');
        if (n) n.remove();
      })
      .catch(function (err) {
        state.square.ready = false;
        state.square.error = err.message || 'Payment form failed to load';
        var n = document.getElementById('cardLoading');
        if (n) {
          n.className = 'evb-notice evb-notice--error';
          n.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/></svg>' +
            '<span>' + S.esc(state.square.error) + '. Call 917-608-8939 and we will take the order over the phone.</span>';
        }
      });
  }

  /** Tokenize the card and run buyer verification (3DS / SCA). */
  function squareTokenize(totals) {
    var d = state.data;
    return state.square.card.tokenize().then(function (result) {
      if (result.status !== 'OK') {
        var msg = (result.errors && result.errors[0] && result.errors[0].message) || 'Card was declined';
        throw new Error(msg);
      }
      var payload = { sourceId: result.token, verificationToken: null };

      // verifyBuyer is required for SCA in supported regions and strengthens
      // the risk signal everywhere else. A failure here should not block the
      // payment attempt — Square will decide.
      var details = {
        amount: (totals.total / 100).toFixed(2),
        currencyCode: CFG.currency || 'USD',
        intent: 'CHARGE',
        billingContact: {
          givenName: d.firstName, familyName: d.lastName,
          email: d.email, phone: d.phone,
          addressLines: [d.address1, d.address2].filter(Boolean),
          city: d.city, state: d.region, postalCode: d.postal, countryCode: d.country
        }
      };

      return state.square.payments.verifyBuyer(result.token, details)
        .then(function (v) { payload.verificationToken = v && v.token; return payload; })
        .catch(function () { return payload; });
    });
  }

  /* ===================================================================== */
  /* Order submission                                                      */
  /* ===================================================================== */

  function buildOrder(totals, payment) {
    var d = state.data;
    var pickup = d.shippingId === 'pickup';

    return {
      id: S.newOrderId(),
      createdAt: new Date().toISOString(),
      status: 'PAID',
      currency: CFG.currency || 'USD',
      locationId: CFG.squareLocationId || null,

      customer: {
        firstName: d.firstName.trim(),
        lastName: d.lastName.trim(),
        email: d.email.trim(),
        phone: d.phone.trim()
      },

      fulfillment: pickup
        ? {
            type: 'PICKUP',
            method: 'In-store pickup',
            location: CFG.business.address,
            hours: CFG.business.hours,
            note: d.note.trim()
          }
        : {
            type: 'SHIPMENT',
            method: totals.shippingRate.label,
            eta: totals.shippingRate.days,
            address: {
              name: d.firstName.trim() + ' ' + d.lastName.trim(),
              line1: d.address1.trim(),
              line2: d.address2.trim(),
              city: d.city.trim(),
              region: d.region.trim(),
              postal: d.postal.trim(),
              country: d.country
            },
            note: d.note.trim()
          },

      lineItems: S.cart.lines.map(function (l) {
        return {
          productId: l.productId,
          variationId: l.squareVariationId || l.variantId,
          name: l.title,
          variant: l.variantLabel,
          image: l.image,
          slug: l.slug,
          quantity: l.qty,
          unitPrice: l.price,
          total: l.price * l.qty
        };
      }),

      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        promoCode: totals.promoCode,
        shipping: totals.shipping,
        tax: totals.tax,
        total: totals.total
      },

      payment: payment,
      marketingOptIn: !!d.marketing
    };
  }

  function submit() {
    if (state.submitting) return;
    if (!validate('review')) { render(); return; }

    state.submitting = true;
    render();

    var totals = S.totals({ shippingId: state.data.shippingId, promoCode: state.data.promoCode });
    var base = (CFG.apiBase || '').replace(/\/$/, '');
    var idem = S.idempotencyKey();

    var tokenStep = S.isLive()
      ? squareTokenize(totals)
      : Promise.resolve({
          // Demo mode: the card number is used only to derive these two
          // display fields, then dropped. It is never stored or sent.
          sourceId: null,
          brand: cardBrand(state.data.cardNumber),
          last4: digits(state.data.cardNumber).slice(-4)
        });

    tokenStep
      .then(function (payment) {
        var order = buildOrder(totals, {
          brand: payment.brand || null,
          last4: payment.last4 || null,
          method: S.isLive() ? 'Square' : 'Demo'
        });

        if (!base) {
          // No backend configured — complete locally so the flow is testable.
          order.payment.brand = order.payment.brand || 'Card';
          order.payment.status = 'DEMO';
          order.demo = true;
          return order;
        }

        return fetch(base + '/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: idem,
            sourceId: payment.sourceId,
            verificationToken: payment.verificationToken || null,
            order: order
          })
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (json) {
            if (!r.ok) throw new Error(json.error || ('Payment failed (' + r.status + ')'));
            // The server is authoritative — take its order back verbatim.
            return json.order || json;
          });
        });
      })
      .then(function (order) {
        S.orders.save(order);
        S.cart.clear();
        S.draft.clear();
        location.href = '/store/order/?id=' + encodeURIComponent(order.id);
      })
      .catch(function (err) {
        state.submitting = false;
        state.errors.submit = err.message || 'Something went wrong taking payment.';
        render();
        S.toast(state.errors.submit, 'error');
        var host = document.getElementById('checkoutSteps');
        if (host) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
  }

  /* ===================================================================== */
  /* Rendering                                                             */
  /* ===================================================================== */

  function field(name, label, opts) {
    opts = opts || {};
    var v = state.data[name];
    var err = state.errors[name];
    return '<div class="evb-input-group' + (opts.full ? ' evb-full' : '') + '">' +
      '<label class="evb-label" for="f_' + name + '">' + label + (opts.required ? ' <span class="req">*</span>' : '') + '</label>' +
      '<input class="evb-input' + (err ? ' is-invalid' : '') + '" id="f_' + name + '" name="' + name + '"' +
        ' type="' + (opts.type || 'text') + '"' +
        ' value="' + S.attr(v) + '"' +
        (opts.placeholder ? ' placeholder="' + S.attr(opts.placeholder) + '"' : '') +
        (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') +
        (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
        (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : '') +
        (err ? ' aria-invalid="true"' : '') + '>' +
      '<p class="evb-error">' + (err ? S.esc(err) : '') + '</p>' +
    '</div>';
  }

  function stepper() {
    return '<div class="evb-steps">' + STEPS.map(function (s, i) {
      var cls = s === state.step ? 'is-active' : (STEPS.indexOf(state.step) > i ? 'is-done' : '');
      return (i ? '<span class="evb-step-sep"></span>' : '') +
        '<span class="evb-step ' + cls + '"><span class="evb-step-num">' +
          (STEPS.indexOf(state.step) > i ? '&#10003;' : (i + 1)) +
        '</span><span class="evb-step-label">' + STEP_LABELS[s] + '</span></span>';
    }).join('') + '</div>';
  }

  function contactStep() {
    return '<div class="evb-panel">' +
      '<p class="evb-panel-title">Contact details</p>' +
      '<div class="evb-form-grid">' +
        field('firstName', 'First name', { required: true, autocomplete: 'given-name' }) +
        field('lastName', 'Last name', { required: true, autocomplete: 'family-name' }) +
        field('email', 'Email', { required: true, type: 'email', autocomplete: 'email', placeholder: 'you@example.com', full: true }) +
        field('phone', 'Mobile number', { required: true, type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '917-608-8939', full: true }) +
      '</div>' +
      '<p class="evb-sumrow-note" style="margin-top:6px">Your receipt goes to this email. We text this number only if there is a question about your order.</p>' +
      '<label class="evb-check" style="margin-top:14px">' +
        '<input type="checkbox" name="marketing"' + (state.data.marketing ? ' checked' : '') + '>' +
        '<span>Text me when something in my size or a piece I collect comes across the counter. No more than a few times a month.</span>' +
      '</label>' +
    '</div>';
  }

  function deliveryStep() {
    var d = state.data;
    var rates = CFG.shippingRates || [];
    var sub = S.cart.subtotal();
    var promoFree = /^FREESHIP$/i.test(d.promoCode || '');
    var threshold = CFG.freeShippingThreshold || 0;

    var options = rates.map(function (r) {
      var free = r.id === 'standard' && ((threshold > 0 && sub >= threshold) || promoFree);
      var amount = (r.amount === 0 || free) ? 'Free' : S.money(r.amount);
      return '<label class="evb-radio' + (d.shippingId === r.id ? ' is-active' : '') + '">' +
        '<input type="radio" name="shippingId" value="' + S.attr(r.id) + '"' + (d.shippingId === r.id ? ' checked' : '') + '>' +
        '<span class="evb-radio-main">' +
          '<span class="evb-radio-title">' + S.esc(r.label) + '</span>' +
          '<span class="evb-radio-sub">' + S.esc(r.detail) + ' · ' + S.esc(r.days) + '</span>' +
        '</span>' +
        '<span class="evb-radio-price">' + amount + '</span>' +
      '</label>';
    }).join('');

    var addressBlock = d.shippingId === 'pickup'
      ? '<div class="evb-notice evb-notice--info" style="margin:0">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>' +
          '<span><strong>Pick up at 39 Avenue A, New York, NY 10009.</strong><br>' +
          S.esc(CFG.business.hours) + '<br>Bring photo ID matching the name on the order. We will email you when it is ready.</span>' +
        '</div>'
      : '<div class="evb-form-grid">' +
          field('address1', 'Street address', { required: true, autocomplete: 'address-line1', full: true }) +
          field('address2', 'Apartment, suite, floor', { autocomplete: 'address-line2', full: true }) +
          field('city', 'City', { required: true, autocomplete: 'address-level2' }) +
          field('region', 'State', { required: true, autocomplete: 'address-level1', maxlength: 2, placeholder: 'NY' }) +
          field('postal', 'ZIP code', { required: true, autocomplete: 'postal-code', inputmode: 'numeric', placeholder: '10009' }) +
        '</div>';

    return '<div class="evb-panel">' +
        '<p class="evb-panel-title">How would you like it?</p>' +
        '<div class="evb-radio-list">' + options + '</div>' +
      '</div>' +
      '<div class="evb-panel">' +
        '<p class="evb-panel-title">' + (d.shippingId === 'pickup' ? 'Pickup location' : 'Shipping address') + '</p>' +
        addressBlock +
        '<div class="evb-input-group" style="margin-top:18px">' +
          '<label class="evb-label" for="f_note">Order note</label>' +
          '<textarea class="evb-textarea" id="f_note" name="note" placeholder="Anything we should know — a pickup time, a gift note, sizing questions.">' + S.esc(d.note) + '</textarea>' +
        '</div>' +
      '</div>';
  }

  function paymentStep() {
    var live = S.isLive();
    var e = state.errors;

    var cardUi = live
      ? '<div id="cardLoading" class="evb-notice evb-notice--info">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
          '<span>Loading the secure card form…</span>' +
        '</div>' +
        '<div id="sqCard"></div>' +
        (e.card ? '<p class="evb-error">' + S.esc(e.card) + '</p>' : '')

      : '<div class="evb-demo-flag">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8v.01"/></svg>' +
          '<span><strong>Demo mode — do not enter a real card.</strong> Square is not connected yet, so no payment is taken and nothing is sent anywhere. ' +
          'Use <code>4111 1111 1111 1111</code> with any future expiry and any CVC to walk the flow. Only the brand and last four are kept, for the receipt.</span>' +
        '</div>' +
        '<div class="evb-form-grid">' +
          field('cardName', 'Name on card', { required: true, autocomplete: 'cc-name', full: true }) +
          field('cardNumber', 'Card number', { required: true, inputmode: 'numeric', autocomplete: 'off', placeholder: '4111 1111 1111 1111', maxlength: 23, full: true }) +
          field('cardExp', 'Expiry', { required: true, inputmode: 'numeric', autocomplete: 'off', placeholder: 'MM/YY', maxlength: 5 }) +
          field('cardCvc', 'CVC', { required: true, inputmode: 'numeric', autocomplete: 'off', placeholder: '123', maxlength: 4 }) +
        '</div>';

    return '<div class="evb-panel">' +
      '<p class="evb-panel-title">Payment</p>' +
      cardUi +
      '<div class="evb-securebar">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        (live
          ? 'Card details are entered directly into Square and never touch our servers.'
          : 'The live store will process cards through Square. Card details never touch our servers.') +
      '</div>' +
    '</div>';
  }

  function reviewStep() {
    var d = state.data;
    var t = S.totals({ shippingId: d.shippingId, promoCode: d.promoCode });
    var pickup = d.shippingId === 'pickup';
    var e = state.errors;

    var address = pickup
      ? 'In-store pickup<br>' + S.esc(CFG.business.address)
      : S.esc(d.firstName + ' ' + d.lastName) + '<br>' +
        S.esc(d.address1) + (d.address2 ? '<br>' + S.esc(d.address2) : '') + '<br>' +
        S.esc(d.city) + ', ' + S.esc(d.region) + ' ' + S.esc(d.postal);

    var cardLine = S.isLive()
      ? 'Card entered securely through Square'
      : cardBrand(d.cardNumber) + ' ending ' + digits(d.cardNumber).slice(-4);

    return '<div class="evb-panel">' +
        '<p class="evb-panel-title">Review your order</p>' +

        (e.submit ? '<div class="evb-notice evb-notice--error">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/></svg>' +
          '<span>' + S.esc(e.submit) + '</span></div>' : '') +

        '<div class="evb-review-block">' +
          '<div class="evb-review-head"><p class="evb-review-label">Contact</p>' +
            '<button type="button" class="evb-review-edit" data-goto="contact">Edit</button></div>' +
          '<p class="evb-review-value">' + S.esc(d.firstName + ' ' + d.lastName) + '<br>' + S.esc(d.email) + '<br>' + S.esc(d.phone) + '</p>' +
        '</div>' +

        '<div class="evb-review-block">' +
          '<div class="evb-review-head"><p class="evb-review-label">' + (pickup ? 'Pickup' : 'Ship to') + '</p>' +
            '<button type="button" class="evb-review-edit" data-goto="delivery">Edit</button></div>' +
          '<p class="evb-review-value">' + address + '</p>' +
          '<p class="evb-review-value" style="color:var(--evb-muted);margin-top:6px">' +
            S.esc(t.shippingRate.label) + ' · ' + S.esc(t.shippingRate.days) + '</p>' +
          (d.note ? '<p class="evb-review-value" style="color:var(--evb-muted);margin-top:6px">Note: ' + S.esc(d.note) + '</p>' : '') +
        '</div>' +

        '<div class="evb-review-block">' +
          '<div class="evb-review-head"><p class="evb-review-label">Payment</p>' +
            '<button type="button" class="evb-review-edit" data-goto="payment">Edit</button></div>' +
          '<p class="evb-review-value">' + S.esc(cardLine) + '</p>' +
        '</div>' +

        '<div class="evb-review-block">' +
          '<p class="evb-review-label">Returns</p>' +
          '<p class="evb-review-value" style="color:var(--evb-ink-2)">' + S.esc(CFG.returnsPolicy) + '</p>' +
        '</div>' +

        '<label class="evb-check" style="margin-top:18px">' +
          '<input type="checkbox" name="terms"' + (d.terms ? ' checked' : '') + '>' +
          '<span>I have read and accept the return policy, and I confirm the details above are correct.</span>' +
        '</label>' +
        (e.terms ? '<p class="evb-error">' + S.esc(e.terms) + '</p>' : '') +

        '<button type="button" class="evb-btn evb-btn--primary evb-btn--block" id="placeOrder" style="margin-top:18px"' +
          (state.submitting ? ' disabled' : '') + '>' +
          (state.submitting ? 'Processing…' : 'Place order · ' + S.money(t.total)) +
        '</button>' +
      '</div>';
  }

  function summary() {
    var d = state.data;
    var t = S.totals({ shippingId: d.shippingId, promoCode: d.promoCode });
    var lines = S.cart.lines;

    return '<div class="evb-panel">' +
      '<p class="evb-panel-title">' + lines.length + (lines.length === 1 ? ' item' : ' items') + '</p>' +
      lines.map(function (l) {
        return '<div class="evb-summary-mini">' +
          '<div class="evb-summary-mini-thumb"><img src="' + S.attr(l.image) + '" alt="" loading="lazy" decoding="async">' +
            '<span class="evb-summary-mini-qty">' + l.qty + '</span></div>' +
          '<div style="min-width:0">' +
            '<p class="evb-summary-mini-name">' + S.esc(l.title) + '</p>' +
            (l.variantLabel ? '<p class="evb-summary-mini-var">' + S.esc(l.variantLabel) + '</p>' : '') +
          '</div>' +
          '<span class="evb-summary-mini-price">' + S.money(l.price * l.qty) + '</span>' +
        '</div>';
      }).join('') +

      '<div style="height:18px"></div>' +

      '<div class="evb-promo">' +
        '<input type="text" id="promoInput" placeholder="Promo code" value="' + S.attr(d.promoCode) + '" aria-label="Promo code" autocomplete="off">' +
        '<button type="button" class="evb-btn evb-btn--ghost evb-btn--sm" id="promoBtn">Apply</button>' +
      '</div>' +
      (state.promoMsg ? '<p class="evb-promo-msg ' + (state.promoMsg.ok ? 'is-ok' : 'is-err') + '">' + S.esc(state.promoMsg.text) + '</p>' : '') +

      '<div class="evb-sumrow"><span>Subtotal</span><strong>' + S.money(t.subtotal) + '</strong></div>' +
      (t.discount ? '<div class="evb-sumrow evb-sumrow--discount"><span>Discount (' + S.esc(t.promoCode) + ')</span><strong>&minus;' + S.money(t.discount) + '</strong></div>' : '') +
      '<div class="evb-sumrow"><span>' + S.esc(t.shippingRate.label) + '</span><strong>' + (t.shipping === 0 ? 'Free' : S.money(t.shipping)) + '</strong></div>' +
      '<div class="evb-sumrow"><span>Sales tax</span><strong>' + S.money(t.tax) + '</strong></div>' +
      '<div class="evb-sumrow evb-sumrow--total"><span>Total</span><strong>' + S.money(t.total) + '</strong></div>' +
    '</div>';
  }

  function render() {
    if (!S.cart.lines.length && !state.submitting) {
      els.host.innerHTML = '<div class="evb-empty" style="margin-bottom:70px">' +
        '<p class="evb-empty-title">There is nothing to check out</p>' +
        '<p class="evb-empty-sub">Your bag is empty. Everything on the floor is authenticated in-house before it goes up.</p>' +
        '<a class="evb-btn evb-btn--primary" href="/store/">Shop the store</a>' +
      '</div>';
      return;
    }

    var body = state.step === 'contact' ? contactStep()
      : state.step === 'delivery' ? deliveryStep()
      : state.step === 'payment' ? paymentStep()
      : reviewStep();

    var idx = STEPS.indexOf(state.step);
    var nav = state.step === 'review' ? '' :
      '<div class="evb-checkout-nav">' +
        (idx > 0
          ? '<button type="button" class="evb-btn evb-btn--ghost" data-back>Back</button>'
          : '<a class="evb-btn evb-btn--ghost" href="/store/cart/">Back to bag</a>') +
        '<button type="button" class="evb-btn evb-btn--primary" data-next>Continue to ' + STEP_LABELS[STEPS[idx + 1]].toLowerCase() + '</button>' +
      '</div>';

    var reviewBack = state.step === 'review'
      ? '<div class="evb-checkout-nav"><button type="button" class="evb-btn evb-btn--ghost" data-back' +
        (state.submitting ? ' disabled' : '') + '>Back to payment</button></div>'
      : '';

    els.host.innerHTML =
      '<div class="evb-split">' +
        '<div id="checkoutSteps">' + stepper() + body + nav + reviewBack + '</div>' +
        '<div class="evb-summary">' + summary() + '</div>' +
      '</div>';

    wire();
    if (state.step === 'payment' && S.isLive()) mountSquareCard();
  }

  /* ===================================================================== */
  /* Wiring                                                                */
  /* ===================================================================== */

  function formatCardNumber(v) {
    var s = digits(v).slice(0, 19);
    var groups = /^3[47]/.test(s)
      ? [s.slice(0, 4), s.slice(4, 10), s.slice(10, 15)]   // Amex 4-6-5
      : s.match(/.{1,4}/g) || [];
    return groups.filter(Boolean).join(' ');
  }

  function formatExpiry(v) {
    var s = digits(v).slice(0, 4);
    if (s.length <= 2) return s;
    return s.slice(0, 2) + '/' + s.slice(2);
  }

  function wire() {
    var host = els.host;

    host.querySelectorAll('input[name], textarea[name]').forEach(function (input) {
      var name = input.getAttribute('name');

      if (input.type === 'checkbox') {
        input.addEventListener('change', function () {
          state.data[name] = input.checked;
          if (state.errors[name]) { delete state.errors[name]; render(); }
        });
        return;
      }

      if (input.type === 'radio') {
        input.addEventListener('change', function () {
          if (!input.checked) return;
          state.data[name] = input.value;
          S.draft.set({ shippingId: input.value });
          render();
        });
        return;
      }

      // Keep state in sync as they type so a re-render never loses input.
      input.addEventListener('input', function () {
        var v = input.value;
        if (name === 'cardNumber') { v = formatCardNumber(v); input.value = v; }
        else if (name === 'cardExp') { v = formatExpiry(v); input.value = v; }
        else if (name === 'region') { v = v.toUpperCase().slice(0, 2); input.value = v; }
        state.data[name] = v;
      });

      // Validate on blur, but only surface an error for the field they left.
      input.addEventListener('blur', function () {
        if (!state.errors[name]) return;
        var had = state.errors;
        validate(state.step);
        var still = state.errors[name];
        state.errors = had;
        if (!still) { delete state.errors[name]; render(); }
      });
    });

    var next = host.querySelector('[data-next]');
    if (next) next.addEventListener('click', function () {
      if (!validate(state.step)) {
        render();
        var bad = els.host.querySelector('.is-invalid');
        if (bad) bad.focus();
        return;
      }
      persistDraft();
      var i = STEPS.indexOf(state.step);
      state.step = STEPS[i + 1];
      state.reached[state.step] = true;
      state.errors = {};
      render();
      document.getElementById('checkoutSteps').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    var back = host.querySelector('[data-back]');
    if (back) back.addEventListener('click', function () {
      var i = STEPS.indexOf(state.step);
      if (i > 0) { state.step = STEPS[i - 1]; state.errors = {}; render(); }
    });

    host.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.step = b.getAttribute('data-goto');
        state.errors = {};
        render();
      });
    });

    var place = host.querySelector('#placeOrder');
    if (place) place.addEventListener('click', submit);

    var promoBtn = host.querySelector('#promoBtn');
    var promoInput = host.querySelector('#promoInput');
    if (promoBtn) {
      var applyPromo = function () {
        var code = promoInput.value.trim().toUpperCase();
        if (!code) {
          state.data.promoCode = ''; state.promoMsg = null;
        } else {
          var v = S.promo.validate(code);
          state.data.promoCode = v.ok ? v.code : '';
          state.promoMsg = { ok: v.ok, text: v.message };
        }
        S.draft.set({ promoCode: state.data.promoCode });
        render();
      };
      promoBtn.addEventListener('click', applyPromo);
      promoInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyPromo(); }
      });
    }
  }

  /* Card details are deliberately excluded from the draft. */
  function persistDraft() {
    var d = state.data;
    S.draft.set({
      firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone,
      shippingId: d.shippingId, address1: d.address1, address2: d.address2,
      city: d.city, region: d.region, postal: d.postal, note: d.note,
      promoCode: d.promoCode, marketing: d.marketing
    });
  }

  function restoreDraft() {
    var saved = S.draft.get();
    Object.keys(saved).forEach(function (k) {
      if (k in state.data && !/^card/.test(k)) state.data[k] = saved[k];
    });
  }

  /* ===================================================================== */

  function boot() {
    els.host = document.getElementById('checkoutHost');

    S.mountCartUI('/');

    C.load().then(function () {
      var changes = S.cart.reconcile();
      restoreDraft();
      render();
      if (changes.length) {
        S.toast('Your bag changed — please review it before paying', 'error');
      }
    });

    window.addEventListener('evb:cart-external', render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
