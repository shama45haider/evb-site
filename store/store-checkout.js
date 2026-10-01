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
    // gen: which card form is current — every redraw of the payment step
    // mounts a new one, and callbacks from an older one must not touch the
    // page. token: the card, tokenized on the way out of the payment step
    // ({ sourceId, brand, last4 }); single-use, so cleared after any attempt.
    square: { payments: null, card: null, ready: false, error: '', gen: 0, token: null },
    // 'card', or one of WALLETS' ids. The other ways to pay only show once
    // the Worker has quoted Square's exact total (POST /quote) — Afterpay and
    // Cash App Pay approve one exact amount, so an estimate won't do.
    payMethod: 'card',
    quote: { key: null, data: null, promise: null },
    // gen/detectGen: which wallet button / method list is current, as for
    // the card. available: what this browser + account can use, per quote.
    wallet: { gen: 0, detectGen: 0, obj: null, available: null, availableKey: null, resume: null },
    // Free standard shipping from the email-signup popup, for this email.
    welcomeShip: false,
    welcomeFor: null
  };

  /** Ask once per distinct email whether the signup perk applies. */
  function checkWelcome() {
    var email = state.data.email.trim().toLowerCase();
    if (!email || email === state.welcomeFor) return;
    state.welcomeFor = email;
    S.welcome.check(email).then(function (ok) {
      if (state.welcomeFor !== email || ok === state.welcomeShip) return;
      state.welcomeShip = ok;
      render();
    });
  }

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

  /** One Square.payments() for the page — the card and every wallet share it. */
  function squarePayments() {
    return loadSquareSdk().then(function (Square) {
      if (!state.square.payments) {
        state.square.payments = Square.payments(CFG.squareApplicationId, CFG.squareLocationId);
      }
      return state.square.payments;
    });
  }

  /**
   * Mount Square's card form into #sqCard. render() rebuilds the page with
   * innerHTML, which throws away the previous form's iframe, so this runs on
   * every render of the payment step. A form that was still starting up when
   * that happened fails later with "unable to be initialized in time" — the
   * generation check keeps that stale failure (or a stale success) from
   * landing on the form that is actually on the page.
   */
  function mountSquareCard() {
    var target = document.getElementById('sqCard');
    if (!target) return;

    var gen = ++state.square.gen;
    var old = state.square.card;
    state.square.card = null;
    state.square.ready = false;
    state.square.token = null;
    if (old) old.destroy().catch(function () {});

    squarePayments()
      .then(function (payments) {
        if (gen !== state.square.gen) return null;
        return payments.card({
          style: {
            // The card fields live in Square's iframe, which only takes fonts
            // it knows: Montserrat (and system-ui) fail attach() with an
            // InvalidStylesError, and the whole payment form never loads.
            input: { fontSize: '15px', fontFamily: 'helvetica neue, sans-serif', color: '#1c1917' },
            '.input-container': { borderColor: '#e7e1d8', borderRadius: '10px' },
            '.input-container.is-focus': { borderColor: '#f97316' },
            '.input-container.is-error': { borderColor: '#b91c1c' },
            '.message-text.is-error': { color: '#b91c1c' }
          }
        });
      })
      .then(function (card) {
        if (!card) return;
        if (gen !== state.square.gen) { card.destroy().catch(function () {}); return; }
        state.square.card = card;
        return card.attach('#sqCard').then(function () {
          if (gen !== state.square.gen) return;
          state.square.ready = true;
          state.square.error = '';
          var n = document.getElementById('cardLoading');
          if (n) n.remove();
        });
      })
      .catch(function (err) {
        if (gen !== state.square.gen) return;   // a newer form replaced this one
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

  /**
   * Turn the card fields into a single-use token. This has to happen on the
   * payment step: Square's fields live in #sqCard, and moving on to review
   * redraws the page without them.
   */
  function tokenizeCard() {
    if (!state.square.card || !state.square.ready) {
      return Promise.reject(new Error(state.square.error || 'Payment form is still loading'));
    }
    return state.square.card.tokenize().then(function (result) {
      if (result.status !== 'OK') {
        var msg = (result.errors && result.errors[0] && result.errors[0].message) || 'Check your card details';
        throw new Error(msg);
      }
      var card = (result.details && result.details.card) || {};
      return { sourceId: result.token, brand: card.brand || null, last4: card.last4 || null };
    });
  }

  function brandLabel(brand) {
    return String(brand || 'Card').toLowerCase().split('_')
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  /** Run buyer verification (3DS / SCA) on the card tokenized at the payment step. */
  function squareTokenize(totals) {
    var d = state.data;
    var tok = state.square.token;
    if (!tok) return Promise.reject(new Error('Enter your card again'));
    return Promise.resolve().then(function () {
      var payload = { sourceId: tok.sourceId, verificationToken: null, brand: tok.brand, last4: tok.last4, via: tok.via || null };
      // Wallets verify the buyer as part of tokenizing; Cash App Pay and
      // Afterpay have no card to verify.
      if (tok.via) return payload;

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

      return state.square.payments.verifyBuyer(tok.sourceId, details)
        .then(function (v) { payload.verificationToken = v && v.token; return payload; })
        .catch(function () { return payload; });
    });
  }

  /* ===================================================================== */
  /* Other ways to pay: Apple Pay, Google Pay, Cash App Pay, Afterpay      */
  /* ===================================================================== */
  /*
   * The buyer picks a method on the payment step; the method's own button
   * then stands in for "Place order" on the review step, once "all sales
   * final" is ticked, and paying with it places the order. Every method's
   * token goes to the same Worker POST /orders as a card's.
   *
   * All four are priced from the Worker's POST /quote — Square's own total
   * for the bag — never the page's estimate: Afterpay charges must equal what
   * Afterpay approved, and Cash App Pay can't change its amount once shown.
   * A Worker without /quote (404) means card only.
   *
   * Cash App Pay on a phone leaves for Cash App and comes back to
   * ?cashapp=1; the pending payment is kept in sessionStorage so the reloaded
   * checkout can reopen the review step and take the token (see boot()).
   */

  var WALLETS = [
    { id: 'applepay', label: 'Apple Pay', sub: 'Face ID or Touch ID', logos: ['applepay'] },
    { id: 'googlepay', label: 'Google Pay', sub: 'Pay with a card saved to Google', logos: ['googlepay'] },
    { id: 'cashapp', label: 'Cash App Pay', sub: 'Approve it in Cash App', logos: ['cashapp'] },
    { id: 'afterpay', label: 'Afterpay', sub: '4 interest-free payments', logos: ['afterpay'] }
  ];
  var CARD_LOGOS = ['visa', 'mastercard', 'amex', 'discover'];

  /*
   * Payment-method marks for the "How would you like to pay?" list: paths from
   * Simple Icons 16.33.0 (CC0) in each brand's own colours; Mastercard drawn
   * as its two circles. Inline, so the list needs no extra requests.
   */
  var PAY_BADGES = {
    "visa": "<svg viewBox=\"0 0 38 24\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\".5\" y=\".5\" width=\"37\" height=\"23\" rx=\"4\" fill=\"#fff\" stroke=\"#d9d4cc\"/><path transform=\"translate(4 -3) scale(1.25)\" fill=\"#1A1F71\" d=\"M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z\"/></svg>",
    "mastercard": "<svg viewBox=\"0 0 38 24\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\".5\" y=\".5\" width=\"37\" height=\"23\" rx=\"4\" fill=\"#fff\" stroke=\"#d9d4cc\"/><circle cx=\"15.5\" cy=\"12\" r=\"6.5\" fill=\"#EB001B\"/><circle cx=\"22.5\" cy=\"12\" r=\"6.5\" fill=\"#F79E1B\"/><path fill=\"#FF5F00\" d=\"M19 6.53a6.5 6.5 0 0 1 0 10.94 6.5 6.5 0 0 1 0-10.94z\"/></svg>",
    "amex": "<svg viewBox=\"0 0 38 24\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\".5\" y=\".5\" width=\"37\" height=\"23\" rx=\"4\" fill=\"#2E77BC\" stroke=\"#2E77BC\"/><path transform=\"translate(9 2) scale(0.8333333333333334)\" fill=\"#fff\" d=\"M16.015 14.378c0-.32-.135-.496-.344-.622-.21-.12-.464-.135-.81-.135h-1.543v2.82h.675v-1.027h.72c.24 0 .39.024.478.125.12.13.104.38.104.55v.35h.66v-.555c-.002-.25-.017-.376-.108-.516-.06-.08-.18-.18-.33-.234l.02-.008c.18-.072.48-.297.48-.747zm-.87.407l-.028-.002c-.09.053-.195.058-.33.058h-.81v-.63h.824c.12 0 .24 0 .33.05.098.048.156.147.15.255 0 .12-.045.215-.134.27zM20.297 15.837H19v.6h1.304c.676 0 1.05-.278 1.05-.884 0-.28-.066-.448-.187-.582-.153-.133-.392-.193-.73-.207l-.376-.015c-.104 0-.18 0-.255-.03-.09-.03-.15-.105-.15-.21 0-.09.017-.166.09-.21.083-.046.177-.066.272-.06h1.23v-.602h-1.35c-.704 0-.958.437-.958.84 0 .9.776.855 1.407.87.104 0 .18.015.225.06.046.03.082.106.082.18 0 .077-.035.15-.08.18-.06.053-.15.07-.277.07zM0 0v10.096L.81 8.22h1.75l.225.464V8.22h2.043l.45 1.02.437-1.013h6.502c.295 0 .56.057.756.236v-.23h1.787v.23c.307-.17.686-.23 1.12-.23h2.606l.24.466v-.466h1.918l.254.465v-.466h1.858v3.948H20.87l-.36-.6v.585h-2.353l-.256-.63h-.583l-.27.614h-1.213c-.48 0-.84-.104-1.08-.24v.24h-2.89v-.884c0-.12-.03-.12-.105-.135h-.105v1.036H6.067v-.48l-.21.48H4.69l-.202-.48v.465H2.235l-.256-.624H1.4l-.256.624H0V24h23.786v-7.108c-.27.135-.613.18-.973.18H21.09v-.255c-.21.165-.57.255-.914.255H14.71v-.9c0-.12-.018-.12-.12-.12h-.075v1.022h-1.8v-1.066c-.298.136-.643.15-.928.136h-.214v.915h-2.18l-.54-.617-.57.6H4.742v-3.93h3.61l.518.602.554-.6h2.412c.28 0 .74.03.942.225v-.24h2.177c.202 0 .644.045.903.225v-.24h3.265v.24c.163-.164.508-.24.803-.24h1.89v.24c.194-.15.464-.24.84-.24h1.176V0H0zM21.156 14.955c.004.005.006.012.01.016.01.01.024.01.032.02l-.042-.035zM23.828 13.082h.065v.555h-.065zM23.865 15.03v-.005c-.03-.025-.046-.048-.075-.07-.15-.153-.39-.215-.764-.225l-.36-.012c-.12 0-.194-.007-.27-.03-.09-.03-.15-.105-.15-.21 0-.09.03-.16.09-.204.076-.045.15-.05.27-.05h1.223v-.588h-1.283c-.69 0-.96.437-.96.84 0 .9.78.855 1.41.87.104 0 .18.015.224.06.046.03.076.106.076.18 0 .07-.034.138-.09.18-.045.056-.136.07-.27.07h-1.288v.605h1.287c.42 0 .734-.118.9-.36h.03c.09-.134.135-.3.135-.523 0-.24-.045-.39-.135-.526zM18.597 14.208v-.583h-2.235V16.458h2.235v-.585h-1.57v-.57h1.533v-.584h-1.532v-.51M13.51 8.787h.685V11.6h-.684zM13.126 9.543l-.007.006c0-.314-.13-.5-.34-.624-.217-.125-.47-.135-.81-.135H10.43v2.82h.674v-1.034h.72c.24 0 .39.03.487.12.122.136.107.378.107.548v.354h.677v-.553c0-.25-.016-.375-.11-.516-.09-.107-.202-.19-.33-.237.172-.07.472-.3.472-.75zm-.855.396h-.015c-.09.054-.195.056-.33.056H11.1v-.623h.825c.12 0 .24.004.33.05.09.04.15.128.15.25s-.047.22-.134.266zM15.92 9.373h.632v-.6h-.644c-.464 0-.804.105-1.02.33-.286.3-.362.69-.362 1.11 0 .512.123.833.36 1.074.232.238.645.31.97.31h.78l.255-.627h1.39l.262.627h1.36v-2.11l1.272 2.11h.95l.002.002V8.786h-.684v1.963l-1.18-1.96h-1.02V11.4L18.11 8.744h-1.004l-.943 2.22h-.3c-.177 0-.362-.03-.468-.134-.125-.15-.186-.36-.186-.662 0-.285.08-.51.194-.63.133-.135.272-.165.516-.165zm1.668-.108l.464 1.118v.002h-.93l.466-1.12zM2.38 10.97l.254.628H4V9.393l.972 2.205h.584l.973-2.202.015 2.202h.69v-2.81H6.118l-.807 1.904-.876-1.905H3.343v2.663L2.205 8.787h-.997L.01 11.597h.72l.26-.626h1.39zm-.688-1.705l.46 1.118-.003.002h-.915l.457-1.12zM11.856 13.62H9.714l-.85.923-.825-.922H5.346v2.82H8l.855-.932.824.93h1.302v-.94h.838c.6 0 1.17-.164 1.17-.945l-.006-.003c0-.78-.598-.93-1.128-.93zM7.67 15.853l-.014-.002H6.02v-.557h1.47v-.574H6.02v-.51H7.7l.733.82-.764.824zm2.642.33l-1.03-1.147 1.03-1.108v2.253zm1.553-1.258h-.885v-.717h.885c.24 0 .42.098.42.344 0 .243-.15.372-.42.372zM9.967 9.373v-.586H7.73V11.6h2.237v-.58H8.4v-.564h1.527V9.88H8.4v-.507\"/></svg>",
    "discover": "<svg viewBox=\"0 0 38 24\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\".5\" y=\".5\" width=\"37\" height=\"23\" rx=\"4\" fill=\"#fff\" stroke=\"#d9d4cc\"/><path transform=\"translate(3 -4) scale(1.3333333333333333)\" fill=\"#231F20\" d=\"M14.58 12a2.023 2.023 0 1 1-2.025-2.023h.002c1.118 0 2.023.906 2.023 2.023zm-5.2-2.001c-1.124 0-2.025.884-2.025 1.99 0 1.118.878 1.984 2.007 1.984.319 0 .593-.063.93-.221v-.873c-.296.297-.559.416-.895.416-.747 0-1.277-.542-1.277-1.312 0-.73.547-1.306 1.243-1.306.354 0 .622.126.93.428v-.873a1.898 1.898 0 0 0-.913-.233zm-3.352 1.545c-.445-.165-.576-.273-.576-.479 0-.239.233-.422.553-.422.222 0 .405.091.598.308l.388-.508a1.665 1.665 0 0 0-1.117-.422c-.673 0-1.186.467-1.186 1.089 0 .524.239.792.936 1.043.291.103.438.171.513.217a.456.456 0 0 1 .222.394c0 .308-.245.536-.576.536-.354 0-.639-.177-.809-.507l-.479.461c.342.502.752.724 1.317.724.771 0 1.311-.513 1.311-1.249-.002-.603-.252-.876-1.095-1.185zM24 10.3a.29.29 0 0 1-.288.291.29.29 0 0 1-.291-.291v-.003A.29.29 0 1 1 24 10.3zm-.059.001a.235.235 0 0 0-.231-.239.234.234 0 0 0-.232.239c0 .132.104.239.232.239a.235.235 0 0 0 .231-.239zM3.472 13.887h.742v-3.803h-.742v3.803zm12.702-1.248l-1.014-2.554h-.81l1.614 3.9h.399l1.643-3.9h-.804l-1.028 2.554zm2.166 1.248h2.104v-.644h-1.362v-1.027h1.312v-.644h-1.312v-.844h1.362v-.644H18.34v3.803zm5.409-3.557l.11.138h-.097l-.094-.13v.13h-.08v-.334h.107c.081 0 .126.036.126.103.001.046-.025.08-.072.093zm-.006-.092c0-.029-.021-.043-.06-.043h-.014v.087h.014c.039 0 .06-.014.06-.044zm-1.228 2.047l1.197 1.602H22.8l-1.027-1.528h-.097v1.528h-.741v-3.803h1.1c.855 0 1.346.411 1.346 1.123 0 .583-.308.965-.866 1.078zm.103-1.038c0-.37-.251-.563-.713-.563h-.228v1.152h.217c.473-.001.724-.207.724-.589zm-19.487.742a1.91 1.91 0 0 1-.69 1.46c-.365.303-.781.439-1.357.439H.001v-3.803H1.09c1.202 0 2.041.781 2.041 1.904zm-.764-.006c0-.364-.154-.718-.411-.947-.245-.222-.536-.308-1.015-.308H.742v2.515h.199c.479 0 .782-.092 1.015-.302.256-.228.411-.593.411-.958z\"/></svg>",
    "applepay": "<svg viewBox=\"0 4.3 24 15.4\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#000\" d=\"M2.15 4.318a42.16 42.16 0 0 0-.454.003c-.15.005-.303.013-.452.04a1.44 1.44 0 0 0-1.06.772c-.07.138-.114.278-.14.43-.028.148-.037.3-.04.45A10.2 10.2 0 0 0 0 6.222v11.557c0 .07.002.138.003.207.004.15.013.303.04.452.027.15.072.291.142.429a1.436 1.436 0 0 0 .63.63c.138.07.278.115.43.142.148.027.3.036.45.04l.208.003h20.194l.207-.003c.15-.004.303-.013.452-.04.15-.027.291-.071.428-.141a1.432 1.432 0 0 0 .631-.631c.07-.138.115-.278.141-.43.027-.148.036-.3.04-.45.002-.07.003-.138.003-.208l.001-.246V6.221c0-.07-.002-.138-.004-.207a2.995 2.995 0 0 0-.04-.452 1.446 1.446 0 0 0-1.2-1.201 3.022 3.022 0 0 0-.452-.04 10.448 10.448 0 0 0-.453-.003zm0 .512h19.942c.066 0 .131.002.197.003.115.004.25.01.375.032.109.02.2.05.287.094a.927.927 0 0 1 .407.407.997.997 0 0 1 .094.288c.022.123.028.258.031.374.002.065.003.13.003.197v11.552c0 .065 0 .13-.003.196-.003.115-.009.25-.032.375a.927.927 0 0 1-.5.693 1.002 1.002 0 0 1-.286.094 2.598 2.598 0 0 1-.373.032l-.2.003H1.906c-.066 0-.133-.002-.196-.003a2.61 2.61 0 0 1-.375-.032c-.109-.02-.2-.05-.288-.094a.918.918 0 0 1-.406-.407 1.006 1.006 0 0 1-.094-.288 2.531 2.531 0 0 1-.032-.373 9.588 9.588 0 0 1-.002-.197V6.224c0-.065 0-.131.002-.197.004-.114.01-.248.032-.375.02-.108.05-.199.094-.287a.925.925 0 0 1 .407-.406 1.03 1.03 0 0 1 .287-.094c.125-.022.26-.029.375-.032.065-.002.131-.002.196-.003zm4.71 3.7c-.3.016-.668.199-.88.456-.191.22-.36.58-.316.918.338.03.675-.169.888-.418.205-.258.345-.603.308-.955zm2.207.42v5.493h.852v-1.877h1.18c1.078 0 1.835-.739 1.835-1.812 0-1.07-.742-1.805-1.808-1.805zm.852.719h.982c.739 0 1.161.396 1.161 1.089 0 .692-.422 1.092-1.164 1.092h-.979zm-3.154.3c-.45.01-.83.28-1.05.28-.235 0-.593-.264-.981-.257a1.446 1.446 0 0 0-1.23.747c-.527.908-.139 2.255.374 2.995.249.366.549.769.944.754.373-.014.52-.242.973-.242.454 0 .586.242.98.235.41-.007.667-.366.915-.733.286-.417.403-.82.41-.841-.007-.008-.79-.308-.797-1.209-.008-.754.615-1.113.644-1.135-.352-.52-.9-.578-1.09-.593a1.123 1.123 0 0 0-.092-.002zm8.204.397c-.99 0-1.606.533-1.652 1.256h.777c.072-.358.369-.586.845-.586.502 0 .803.266.803.711v.309l-1.097.064c-.951.054-1.488.484-1.488 1.184 0 .72.548 1.207 1.332 1.207.526 0 1.032-.281 1.264-.727h.019v.659h.788v-2.76c0-.803-.62-1.317-1.591-1.317zm1.94.072l1.446 4.009c0 .003-.073.24-.073.247-.125.41-.33.571-.711.571-.069 0-.206 0-.267-.015v.666c.06.011.267.019.335.019.83 0 1.226-.312 1.568-1.283l1.5-4.214h-.868l-1.012 3.259h-.015l-1.013-3.26zm-1.167 2.189v.316c0 .521-.45.917-1.024.917-.442 0-.731-.228-.731-.579 0-.342.278-.56.769-.593z\"/></svg>",
    "googlepay": "<svg viewBox=\"0 0 38 24\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\".5\" y=\".5\" width=\"37\" height=\"23\" rx=\"4\" fill=\"#fff\" stroke=\"#d9d4cc\"/><path transform=\"translate(5 -2) scale(1.1666666666666667)\" fill=\"#3C4043\" d=\"M3.963 7.235A3.963 3.963 0 00.422 9.419a3.963 3.963 0 000 3.559 3.963 3.963 0 003.541 2.184c1.07 0 1.97-.352 2.627-.957.748-.69 1.18-1.71 1.18-2.916a4.722 4.722 0 00-.07-.806H3.964v1.526h2.14a1.835 1.835 0 01-.79 1.205c-.356.241-.814.379-1.35.379-1.034 0-1.911-.697-2.225-1.636a2.375 2.375 0 010-1.517c.314-.94 1.191-1.636 2.225-1.636a2.152 2.152 0 011.52.594l1.132-1.13a3.808 3.808 0 00-2.652-1.033zm6.501.55v6.9h.886V11.89h1.465c.603 0 1.11-.196 1.522-.588a1.911 1.911 0 00.635-1.464 1.92 1.92 0 00-.635-1.456 2.125 2.125 0 00-1.522-.598zm2.427.85a1.156 1.156 0 01.823.365 1.176 1.176 0 010 1.686 1.171 1.171 0 01-.877.357H11.35V8.635h1.487a1.156 1.156 0 01.054 0zm4.124 1.175c-.842 0-1.477.308-1.907.925l.781.491c.288-.417.68-.626 1.175-.626a1.255 1.255 0 01.856.323 1.009 1.009 0 01.366.785v.202c-.34-.193-.774-.289-1.3-.289-.617 0-1.11.145-1.479.434-.37.288-.554.677-.554 1.165a1.476 1.476 0 00.525 1.156c.35.308.785.463 1.305.463.61 0 1.098-.27 1.465-.81h.038v.655h.848v-2.909c0-.61-.19-1.09-.568-1.44-.38-.35-.896-.525-1.551-.525zm2.263.154l1.946 4.422-1.098 2.38h.915L24 9.963h-.965l-1.368 3.391h-.02l-1.406-3.39zm-2.146 2.368c.494 0 .88.11 1.156.33 0 .372-.147.696-.44.973a1.413 1.413 0 01-.997.414 1.081 1.081 0 01-.69-.232.708.708 0 01-.293-.578c0-.257.12-.47.363-.647.24-.173.54-.26.9-.26Z\"/></svg>",
    "cashapp": "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#00C244\" d=\"M23.59 3.475a5.1 5.1 0 00-3.05-3.05c-1.31-.42-2.5-.42-4.92-.42H8.36c-2.4 0-3.61 0-4.9.4a5.1 5.1 0 00-3.05 3.06C0 4.765 0 5.965 0 8.365v7.27c0 2.41 0 3.6.4 4.9a5.1 5.1 0 003.05 3.05c1.3.41 2.5.41 4.9.41h7.28c2.41 0 3.61 0 4.9-.4a5.1 5.1 0 003.06-3.06c.41-1.3.41-2.5.41-4.9v-7.25c0-2.41 0-3.61-.41-4.91zm-6.17 4.63l-.93.93a.5.5 0 01-.67.01 5 5 0 00-3.22-1.18c-.97 0-1.94.32-1.94 1.21 0 .9 1.04 1.2 2.24 1.65 2.1.7 3.84 1.58 3.84 3.64 0 2.24-1.74 3.78-4.58 3.95l-.26 1.2a.49.49 0 01-.48.39H9.63l-.09-.01a.5.5 0 01-.38-.59l.28-1.27a6.54 6.54 0 01-2.88-1.57v-.01a.48.48 0 010-.68l1-.97a.49.49 0 01.67 0c.91.86 2.13 1.34 3.39 1.32 1.3 0 2.17-.55 2.17-1.42 0-.87-.88-1.1-2.54-1.72-1.76-.63-3.43-1.52-3.43-3.6 0-2.42 2.01-3.6 4.39-3.71l.25-1.23a.48.48 0 01.48-.38h1.78l.1.01c.26.06.43.31.37.57l-.27 1.37c.9.3 1.75.77 2.48 1.39l.02.02c.19.2.19.5 0 .68z\"/></svg>",
    "afterpay": "<svg viewBox=\"0 0 38 24\" width=\"38\" height=\"24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\".5\" y=\".5\" width=\"37\" height=\"23\" rx=\"4\" fill=\"#B2FCE4\" stroke=\"#B2FCE4\"/><path transform=\"translate(10 3) scale(0.75)\" fill=\"#000\" d=\"M12 0C5.373 0 0 5.373 0 12c0 6.628 5.373 12 12 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12Zm1.236 4.924a2.21 2.21 0 0 1 1.15.299l4.457 2.557c1.495.857 1.495 3.013 0 3.87l-4.457 2.558c-1.488.854-3.342-.22-3.342-1.935v-.34a.441.441 0 0 0-.66-.383L6.287 13.9a.441.441 0 0 0 0 .765l4.096 2.35a.44.44 0 0 0 .661-.382v-.685c0-.333.36-.542.649-.376l1.041.597a.441.441 0 0 1 .222.383v.29c0 1.715-1.854 2.789-3.342 1.935L5.157 16.22c-1.495-.857-1.495-3.013 0-3.87l4.457-2.558c1.488-.854 3.342.22 3.342 1.935v.34c0 .34.366.551.66.383l4.097-2.35a.441.441 0 0 0 0-.765l-4.096-2.351a.441.441 0 0 0-.661.382v.685c0 .333-.36.541-.649.375l-1.041-.597a.442.442 0 0 1-.222-.383v-.29c0-1.285 1.043-2.21 2.192-2.233z\"/></svg>"
  };

  /** The list's styles, added once — kept here so only this file changes. */
  var PAY_CSS = ".evb-pay-heading{margin:0 0 10px;font-size:13px;font-weight:700;color:#1c1917;letter-spacing:0}.evb-pay-list{border:1px solid #e7e1d8;border-radius:12px;overflow:hidden;background:#fff}.evb-pay{position:relative;display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;transition:background .15s}.evb-pay+.evb-pay{border-top:1px solid #eee8df}.evb-pay:hover{background:#fcfaf7}.evb-pay.is-on{background:#fff7ed;box-shadow:inset 0 0 0 1.5px #f97316;border-radius:0}.evb-pay input{position:absolute;opacity:0;pointer-events:none}.evb-pay-dot{box-sizing:border-box;flex:0 0 18px;width:18px;height:18px;border-radius:50%;border:1.5px solid #c9c2b8;background:#fff;transition:border-color .15s,background .15s}.evb-pay.is-on .evb-pay-dot{border-color:#f97316;background:#f97316;box-shadow:inset 0 0 0 3.5px #fff}.evb-pay input:focus-visible+.evb-pay-dot{outline:2px solid #f97316;outline-offset:2px}.evb-pay-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.evb-pay-name{font-size:14px;font-weight:700;color:#1c1917;line-height:1.3}.evb-pay-sub{font-size:12px;font-weight:500;color:#78716c;line-height:1.4}.evb-pay-logos{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;flex:0 1 auto;max-width:58%}.evb-pay-logos svg{display:block;flex:0 0 auto}@media (max-width:420px){.evb-pay{gap:12px;padding:13px 14px}.evb-pay-logos svg{width:32px;height:20px}.evb-pay-logos svg[viewBox=\"0 0 24 24\"]{width:20px}}";

  function ensurePayStyles() {
    if (document.getElementById('evbPayStyles')) return;
    var s = document.createElement('style');
    s.id = 'evbPayStyles';
    s.textContent = PAY_CSS;
    document.head.appendChild(s);
  }

  function payChoice(id, label, sub, logos) {
    var on = state.payMethod === id;
    return '<label class="evb-pay' + (on ? ' is-on' : '') + '">' +
      '<input type="radio" name="payMethod" value="' + S.attr(id) + '"' + (on ? ' checked' : '') + '>' +
      '<span class="evb-pay-dot" aria-hidden="true"></span>' +
      '<span class="evb-pay-text"><span class="evb-pay-name">' + S.esc(label) + '</span>' +
        '<span class="evb-pay-sub">' + S.esc(sub) + '</span></span>' +
      '<span class="evb-pay-logos">' + logos.map(function (k) { return PAY_BADGES[k] || ''; }).join('') + '</span>' +
    '</label>';
  }
  var AFTERPAY_MIN = 100, AFTERPAY_MAX = 200000;   // US limits, in cents
  var CASHAPP_KEY = 'evb_cashapp_pending';
  var CASHAPP_TTL = 20 * 60 * 1000;

  function walletLabel(id) {
    var w = WALLETS.filter(function (x) { return x.id === id; })[0];
    return w ? w.label : 'Card';
  }

  function noop() {}

  function currentTotals() {
    var d = state.data;
    return S.totals({ shippingId: d.shippingId, promoCode: d.promoCode, welcomeShip: state.welcomeShip });
  }

  /** Everything that changes what Square would charge. */
  function quoteKey() {
    var d = state.data;
    return JSON.stringify([
      S.cart.lines.map(function (l) { return [l.squareVariationId || l.variantId, l.qty]; }),
      d.shippingId, d.promoCode, d.email.trim().toLowerCase(), state.welcomeShip
    ]);
  }

  /**
   * Square's exact total for the bag as it stands, from the Worker. Resolves
   * null when there isn't one to be had — then only card is offered.
   */
  function ensureQuote() {
    var q = state.quote, key = quoteKey();
    if (q.key === key && q.promise) return q.promise;
    var base = (CFG.apiBase || '').replace(/\/$/, '');
    q.key = key;
    q.data = null;
    q.promise = fetch(base + '/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ order: buildOrder(currentTotals(), {}) })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        // 404 = a Worker from before /quote. Not remembered: it may be
        // redeployed while this page is open, so the next step asks again.
        if (!r.ok || typeof json.total !== 'number') throw new Error('HTTP ' + r.status + (json.error ? ' ' + json.error : ''));
        if (q.key === key) q.data = json;
        return json;
      });
    }).catch(function (err) {
      console.info('[checkout] no quote from the Worker, so card only: ' + (err && err.message));
      if (q.key === key) q.promise = null;   // try again next time
      return null;
    });
    return q.promise;
  }

  function money(cents) { return (cents / 100).toFixed(2); }

  function paymentRequestFor(payments, method, q) {
    var d = state.data;
    var pickup = d.shippingId === 'pickup';
    var opts = {
      countryCode: 'US',
      currencyCode: CFG.currency || 'USD',
      total: { amount: money(q.total), label: (CFG.business && CFG.business.name) || 'East Village Buyers' }
    };
    var contact = {
      givenName: d.firstName.trim(), familyName: d.lastName.trim(),
      email: d.email.trim(), phone: d.phone.trim(), countryCode: 'US'
    };
    if (method === 'afterpay') {
      // Afterpay needs to know where it's going. The checkout already has the
      // address (or it's pickup), so the one option offered is the one chosen,
      // at Square's figures.
      opts.requestShippingContact = !pickup;
      if (pickup) {
        opts.pickupContact = Object.assign({}, contact, {
          addressLines: ['39 Avenue A'], city: 'New York', state: 'NY', postalCode: '10009'
        });
      } else {
        opts.shippingContact = Object.assign({}, contact, {
          addressLines: [d.address1, d.address2].filter(Boolean),
          city: d.city, state: d.region, postalCode: d.postal
        });
      }
    }
    var req = payments.paymentRequest(opts);
    if (method === 'afterpay') {
      var rate = currentTotals().shippingRate || {};
      req.addEventListener('afterpay_shippingaddresschanged', function () {
        return {
          shippingOptions: [{
            id: d.shippingId,
            label: rate.label || 'Shipping',
            amount: money(q.shipping),
            total: { amount: money(q.total), label: 'Total' },
            taxLineItems: [{ amount: money(q.tax), label: 'Sales tax' }]
          }]
        };
      });
      req.addEventListener('afterpay_shippingoptionchanged', noop);
    }
    return req;
  }

  function cashAppRedirect() {
    return location.origin + location.pathname + '?cashapp=1';
  }

  /** Build one method's Square object. Rejects when it can't be used here. */
  function createWallet(payments, method, q, referenceId) {
    return Promise.resolve().then(function () {
      if (method === 'applepay') {
        // Off until eastvillagebuyers.com is registered for Apple Pay in the
        // Square Developer Console (and its verification file is hosted at
        // /.well-known/apple-developer-merchantid-domain-association) — set
        // `applePay: true` in store-config.js then. Before that, Safari would
        // show the button and the payment would fail.
        if (CFG.applePay !== true) throw new Error('Apple Pay isn’t set up yet');
        if (!window.ApplePaySession) throw new Error('Apple Pay needs Safari on an Apple device');
        return payments.applePay(paymentRequestFor(payments, method, q));
      }
      if (method === 'googlepay') return payments.googlePay(paymentRequestFor(payments, method, q));
      if (method === 'cashapp') {
        return payments.cashAppPay(paymentRequestFor(payments, method, q), {
          redirectURL: cashAppRedirect(),
          referenceId: referenceId || ('evb-' + Date.now().toString(36))
        });
      }
      if (method === 'afterpay') {
        if (q.total < AFTERPAY_MIN || q.total > AFTERPAY_MAX) throw new Error('Afterpay is for orders from $1 to $2,000');
        return payments.afterpayClearpay(paymentRequestFor(payments, method, q));
      }
      throw new Error('Unknown payment method');
    });
  }

  /**
   * Square sometimes answers "Temporarily unable to register the payment
   * method" (seen live on Cash App Pay, fine a moment later). Worth one more
   * try before a way to pay is hidden from the buyer.
   */
  function createWalletRetrying(payments, method, q, referenceId) {
    return createWallet(payments, method, q, referenceId).catch(function (err) {
      if (!/temporarily/i.test((err && err.message) || '')) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, 1500); }).then(function () {
        return createWallet(payments, method, q, referenceId);
      });
    });
  }

  function destroyWallet(obj) {
    if (obj && typeof obj.destroy === 'function') {
      try { Promise.resolve(obj.destroy()).catch(noop); } catch (e) { /* already gone */ }
    }
  }

  /**
   * Which ways to pay this buyer can use: each is tried against the real
   * SDK, whose constructors throw when the device, the shop's Square account
   * or the amount rules it out. Cached per quote.
   */
  function detectWallets(q) {
    if (state.wallet.available && state.wallet.availableKey === state.quote.key) {
      return Promise.resolve(state.wallet.available);
    }
    return squarePayments().then(function (payments) {
      return Promise.all(WALLETS.map(function (w) {
        return createWalletRetrying(payments, w.id, q).then(function (obj) {
          destroyWallet(obj);
          return true;
        }, function (err) {
          // Square's reason, for whoever is diagnosing a missing method.
          console.info('[checkout] ' + w.label + ' not offered: ' +
            (err ? (err.name ? err.name + ': ' : '') + err.message : 'unavailable'));
          return false;
        });
      }));
    }).then(function (flags) {
      var available = {};
      WALLETS.forEach(function (w, i) { available[w.id] = flags[i]; });
      state.wallet.available = available;
      state.wallet.availableKey = state.quote.key;
      return available;
    });
  }

  /** Fill in the "How would you like to pay?" choices on the payment step. */
  function setupPayMethods() {
    var gen = ++state.wallet.detectGen;
    ensureQuote()
      .then(function (q) { return q ? detectWallets(q) : {}; })
      .catch(function () { return {}; })
      .then(function (available) {
        if (gen !== state.wallet.detectGen || state.step !== 'payment') return;
        var ids = WALLETS.filter(function (w) { return available[w.id]; });
        if (state.payMethod !== 'card' && !available[state.payMethod]) setPayMethod('card');
        var box = document.getElementById('payMethods');
        if (!box || !ids.length) return;
        ensurePayStyles();
        box.innerHTML = '<p class="evb-pay-heading">How would you like to pay?</p>' +
          '<div class="evb-pay-list" role="radiogroup" aria-label="Payment method">' +
            payChoice('card', 'Card', 'Credit or debit card', CARD_LOGOS) +
            ids.map(function (w) { return payChoice(w.id, w.label, w.sub, w.logos); }).join('') +
          '</div>';
        box.style.display = '';
        box.querySelectorAll('input[name="payMethod"]').forEach(function (input) {
          input.addEventListener('change', function () { if (input.checked) setPayMethod(input.value); });
        });
      });
  }

  /** Switch method in place — a redraw would wipe a half-typed card. */
  function setPayMethod(id) {
    state.payMethod = id;
    var cardArea = document.getElementById('cardArea');
    var note = document.getElementById('walletNote');
    if (cardArea) cardArea.style.display = id === 'card' ? '' : 'none';
    if (note) {
      note.style.display = id === 'card' ? 'none' : '';
      var span = note.querySelector('span');
      if (span) span.textContent = id === 'card' ? '' : 'You’ll confirm with ' + walletLabel(id) + ' on the next step.';
    }
    document.querySelectorAll('#payMethods .evb-pay').forEach(function (label) {
      var input = label.querySelector('input');
      label.classList.toggle('is-on', !!input && input.value === id);
      if (input) input.checked = input.value === id;
    });
    showCardError('');
  }

  function termsOk() {
    if (state.data.terms) return true;
    var p = document.getElementById('termsError');
    if (p) { p.textContent = 'Please accept the terms to place your order'; p.hidden = false; }
    return false;
  }

  function showWalletError(message) {
    var p = document.getElementById('walletError');
    if (!p) return;
    p.textContent = message || '';
    p.hidden = !message;
  }

  function savePendingCashApp(referenceId, total) {
    try {
      sessionStorage.setItem(CASHAPP_KEY, JSON.stringify({ ref: referenceId, total: total, key: quoteKey(), at: Date.now() }));
    } catch (e) { /* private mode — the desktop QR flow still works */ }
  }

  function readPendingCashApp() {
    try {
      var p = JSON.parse(sessionStorage.getItem(CASHAPP_KEY) || 'null');
      return p && Date.now() - p.at < CASHAPP_TTL ? p : null;
    } catch (e) { return null; }
  }

  function clearPendingCashApp() {
    try { sessionStorage.removeItem(CASHAPP_KEY); } catch (e) { /* nothing to clear */ }
  }

  /** A wallet handed back a result: pay with it, or say why not. */
  function payWithWallet(method, result) {
    if (method === 'cashapp') clearPendingCashApp();
    if (!result || result.status !== 'OK') {
      var status = result && result.status;
      if (status === 'Cancel' || status === 'Abort') return;   // the buyer closed it
      showWalletError((result && result.errors && result.errors[0] && result.errors[0].message) ||
        walletLabel(method) + ' didn’t go through. Try again, or go back and pay by card.');
      return;
    }
    var card = (result.details && result.details.card) || {};
    state.square.token = { sourceId: result.token, brand: card.brand || null, last4: card.last4 || null, via: walletLabel(method) };
    submit();
  }

  /** Put the chosen method's button where "Place order" would be. */
  function mountWallet() {
    var host = document.getElementById('walletBtn');
    if (!host) return;
    var method = state.payMethod;
    var gen = ++state.wallet.gen;
    destroyWallet(state.wallet.obj);
    state.wallet.obj = null;
    var resume = method === 'cashapp' ? state.wallet.resume : null;
    state.wallet.resume = null;

    ensureQuote().then(function (q) {
      if (gen !== state.wallet.gen) return;
      if (!q) throw new Error('We couldn’t get the final total from Square');
      if (resume && resume.total !== q.total) {
        clearPendingCashApp();
        throw new Error('The total changed while you were in Cash App, so nothing was charged. Check it and try again');
      }
      var total = document.getElementById('walletTotal');
      if (total) total.textContent = 'Total charged: ' + S.money(q.total);
      return squarePayments().then(function (payments) {
        if (gen !== state.wallet.gen) return;
        var ref = resume ? resume.ref : 'evb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        return createWalletRetrying(payments, method, q, ref).then(function (obj) {
          if (gen !== state.wallet.gen) { destroyWallet(obj); return; }
          state.wallet.obj = obj;
          return attachWallet(method, obj, q, ref);
        });
      });
    }).catch(function (err) {
      if (gen !== state.wallet.gen) return;
      showWalletError((err && err.message ? err.message : walletLabel(method) + ' isn’t available') +
        '. Go back to Payment to choose another way to pay.');
    });
  }

  function attachWallet(method, obj, q, ref) {
    var host = document.getElementById('walletBtn');
    var fail = function (err) { showWalletError((err && err.message) || walletLabel(method) + ' didn’t go through.'); };

    if (method === 'applepay') {
      host.innerHTML = '<button type="button" id="applePayBtn" aria-label="Pay with Apple Pay" style="' +
        '-webkit-appearance:-apple-pay-button;-apple-pay-button-type:buy;-apple-pay-button-style:black;' +
        'display:block;width:100%;height:48px;border:0;border-radius:10px;cursor:pointer"></button>';
      document.getElementById('applePayBtn').addEventListener('click', function () {
        // Apple requires the sheet to open straight from the click — nothing
        // asynchronous before tokenize().
        if (!termsOk()) return;
        showWalletError('');
        obj.tokenize().then(function (r) { payWithWallet(method, r); }, fail);
      });
      return;
    }

    if (method === 'cashapp') {
      // The token arrives as an event — right away after a phone comes back
      // from Cash App, so the listener goes on before anything else.
      obj.addEventListener('ontokenization', function (event) {
        var detail = event.detail || {};
        if (detail.error) { clearPendingCashApp(); fail(detail.error); return; }
        payWithWallet(method, detail.tokenResult);
      });
      return obj.attach('#walletBtn', { shape: 'semiround', size: 'medium', theme: 'dark', width: 'full' }, function () {
        if (!termsOk()) return Promise.resolve(false);
        showWalletError('');
        savePendingCashApp(ref, q.total);
        return Promise.resolve(true);
      });
    }

    var opts = method === 'googlepay'
      ? { buttonColor: 'black', buttonSizeMode: 'fill', buttonType: 'long' }
      : { buttonColor: 'black', buttonType: 'place_order_with_afterpay' };
    return obj.attach('#walletBtn', opts).then(function () {
      host.addEventListener('click', function () {
        if (state.submitting || !termsOk()) return;
        showWalletError('');
        obj.tokenize().then(function (r) { payWithWallet(method, r); }, fail);
      });
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
            // The Worker prices shipping from this id; without it every
            // shipment was charged as standard, express included.
            shippingId: d.shippingId,
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
        welcomeShipping: totals.welcomeShip,
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
    if (S.isLive() && !state.square.token) {
      // Reached review without passing through payment (e.g. the stepper),
      // or the last token was spent on a failed attempt.
      state.step = 'payment';
      state.errors = { card: 'Enter your card to place the order' };
      render();
      return;
    }

    state.submitting = true;
    render();

    var totals = S.totals({ shippingId: state.data.shippingId, promoCode: state.data.promoCode, welcomeShip: state.welcomeShip });
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
          method: payment.via || (S.isLive() ? 'Square' : 'Demo')
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
        var message = err.message || 'Something went wrong taking payment.';
        // The welcome perk may have been spent elsewhere; ask the server again.
        if (state.welcomeShip) { state.welcomeShip = false; state.welcomeFor = null; }
        if (S.isLive() && state.payMethod !== 'card') {
          // Tokens work once; a wallet's button makes a fresh one, so stay on
          // review and let the buyer press it again.
          state.square.token = null;
          state.errors = { wallet: message };
        } else if (S.isLive()) {
          // A Square card token works once — back to payment for a fresh one.
          state.square.token = null;
          state.step = 'payment';
          state.errors = { card: message };
        } else {
          state.errors.submit = message;
        }
        render();
        S.toast(message, 'error');
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
    var promoFree = /^FREESHIP$/i.test(d.promoCode || '') || state.welcomeShip;
    var threshold = CFG.freeShippingThreshold || 0;

    var options = rates.map(function (r) {
      var free = r.id === 'standard' && ((threshold > 0 && sub >= threshold) || promoFree);
      var amount = (r.amount === 0 || free) ? 'Free' : S.money(r.amount);
      return '<label class="evb-radio' + (d.shippingId === r.id ? ' is-active' : '') + '">' +
        '<input type="radio" name="shippingId" value="' + S.attr(r.id) + '"' + (d.shippingId === r.id ? ' checked' : '') + '>' +
        '<span class="evb-radio-main">' +
          '<span class="evb-radio-title" style="display:block">' + S.esc(r.label) + '</span>' +
          '<span class="evb-radio-sub" style="display:block">' + S.esc(r.detail) + ' · ' + S.esc(r.days) + '</span>' +
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

    var wallet = state.payMethod !== 'card';
    var cardUi = live
      // Filled in by setupPayMethods() once Square says which methods work
      // here; stays empty (card only) otherwise.
      ? '<div id="payMethods" style="display:none;margin-bottom:16px"></div>' +
        // Hidden, not removed, when another method is picked, so the card
        // form (and anything typed into it) survives switching back.
        '<div id="cardArea"' + (wallet ? ' style="display:none"' : '') + '>' +
          '<div id="cardLoading" class="evb-notice evb-notice--info">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
            '<span>Loading the secure card form…</span>' +
          '</div>' +
          '<div id="sqCard"></div>' +
          // Always present, so a card error can be shown without a redraw
          // (a redraw would wipe what the buyer typed into Square's fields).
          '<p class="evb-error" id="cardError"' + (e.card ? '' : ' hidden') + '>' + S.esc(e.card || '') + '</p>' +
        '</div>' +
        '<div id="walletNote" class="evb-notice evb-notice--info"' + (wallet ? '' : ' style="display:none"') + '>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8v.01"/></svg>' +
          '<span>' + (wallet ? 'You’ll confirm with ' + S.esc(walletLabel(state.payMethod)) + ' on the next step.' : '') + '</span>' +
        '</div>'

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
          ? 'Payment details go straight to Square and never touch our servers.'
          : 'The live store will process cards through Square. Card details never touch our servers.') +
      '</div>' +
    '</div>';
  }

  function reviewStep() {
    var d = state.data;
    var t = S.totals({ shippingId: d.shippingId, promoCode: d.promoCode, welcomeShip: state.welcomeShip });
    var pickup = d.shippingId === 'pickup';
    var e = state.errors;

    var address = pickup
      ? 'In-store pickup<br>' + S.esc(CFG.business.address)
      : S.esc(d.firstName + ' ' + d.lastName) + '<br>' +
        S.esc(d.address1) + (d.address2 ? '<br>' + S.esc(d.address2) : '') + '<br>' +
        S.esc(d.city) + ', ' + S.esc(d.region) + ' ' + S.esc(d.postal);

    var tok = state.square.token;
    var wallet = S.isLive() && state.payMethod !== 'card';
    var cardLine = wallet
      ? walletLabel(state.payMethod)
      : S.isLive()
        ? (tok && tok.last4 ? brandLabel(tok.brand) + ' ending ' + tok.last4 : 'Card entered securely through Square')
        : cardBrand(d.cardNumber) + ' ending ' + digits(d.cardNumber).slice(-4);

    // A wallet's own button stands in for "Place order"; walletTotal shows
    // Square's quoted total once mountWallet() has it.
    var action = wallet && !state.submitting
      ? '<div id="walletArea" style="margin-top:18px">' +
          '<p class="evb-review-value" id="walletTotal" style="margin:0 0 10px;font-weight:800">Getting your total from Square…</p>' +
          '<div id="walletBtn" style="min-height:48px"></div>' +
          '<p class="evb-error" id="walletError"' + (e.wallet ? '' : ' hidden') + '>' + S.esc(e.wallet || '') + '</p>' +
        '</div>'
      : '<button type="button" class="evb-btn evb-btn--primary evb-btn--block" id="placeOrder" style="margin-top:18px"' +
          (state.submitting ? ' disabled' : '') + '>' +
          (state.submitting ? 'Processing…' : 'Place order · ' + S.money(t.total)) +
        '</button>';

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
          '<p class="evb-review-label">All sales final</p>' +
          '<p class="evb-review-value" style="color:var(--evb-ink-2)">' + S.esc(CFG.returnsPolicy) + '</p>' +
        '</div>' +

        '<label class="evb-check" style="margin-top:18px">' +
          '<input type="checkbox" name="terms"' + (d.terms ? ' checked' : '') + '>' +
          '<span>I understand all sales are final, and I confirm the details above are correct.</span>' +
        '</label>' +
        // Always present so a wallet button can flag it without a redraw.
        '<p class="evb-error" id="termsError"' + (e.terms ? '' : ' hidden') + '>' + S.esc(e.terms || '') + '</p>' +

        action +
      '</div>';
  }

  function summary() {
    var d = state.data;
    var t = S.totals({ shippingId: d.shippingId, promoCode: d.promoCode, welcomeShip: state.welcomeShip });
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
      (t.welcomeShip ? '<p class="evb-promo-msg is-ok">Welcome offer: free shipping on your first order.</p>' : '') +
      '<div class="evb-sumrow"><span>Sales tax</span><strong>' + S.money(t.tax) + '</strong></div>' +
      '<div class="evb-sumrow evb-sumrow--total"><span>Total</span><strong>' + S.money(t.total) + '</strong></div>' +
    '</div>';
  }

  function render() {
    // Past the contact step the email is validated, so ask about the perk.
    if (state.step !== 'contact') checkWelcome();
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
    if (state.step === 'payment' && S.isLive()) { mountSquareCard(); setupPayMethods(); }
    if (state.step === 'review' && S.isLive() && state.payMethod !== 'card' && !state.submitting) {
      mountWallet();
    } else if (state.wallet.obj) {
      // Its button just left the page; stop anything still listening.
      state.wallet.gen++;
      destroyWallet(state.wallet.obj);
      state.wallet.obj = null;
    }
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

  function advance() {
    persistDraft();
    var i = STEPS.indexOf(state.step);
    state.step = STEPS[i + 1];
    state.reached[state.step] = true;
    state.errors = {};
    render();
    document.getElementById('checkoutSteps').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showCardError(message) {
    var p = document.getElementById('cardError');
    if (!p) return;
    p.textContent = message || '';
    p.hidden = !message;
  }

  function wire() {
    var host = els.host;

    host.querySelectorAll('input[name], textarea[name]').forEach(function (input) {
      var name = input.getAttribute('name');

      if (input.type === 'checkbox') {
        input.addEventListener('change', function () {
          state.data[name] = input.checked;
          if (state.errors[name]) { delete state.errors[name]; render(); return; }
          // A wallet button flags the terms in place (no redraw, which would
          // rebuild the button); clear that the same way.
          var flag = document.getElementById(name + 'Error');
          if (flag && input.checked) flag.hidden = true;
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
      if (state.step === 'payment' && S.isLive() && state.payMethod !== 'card') {
        // A wallet is confirmed with its own button on the review step.
        state.square.token = null;
        advance();
        return;
      }
      if (state.step === 'payment' && S.isLive()) {
        // Tokenize now, while Square's fields are still on the page. On a
        // bad card, show the error in place — render() would wipe the card.
        var label = next.textContent;
        next.disabled = true;
        next.textContent = 'Checking card…';
        tokenizeCard().then(function (tok) {
          state.square.token = tok;
          advance();
        }).catch(function (err) {
          next.disabled = false;
          next.textContent = label;
          showCardError(err.message || 'Check your card details');
        });
        return;
      }
      if (!validate(state.step)) {
        render();
        var bad = els.host.querySelector('.is-invalid');
        if (bad) bad.focus();
        return;
      }
      advance();
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

    wirePromo();
  }

  function wirePromo() {
    var promoBtn = els.host.querySelector('#promoBtn');
    var promoInput = els.host.querySelector('#promoInput');
    if (!promoBtn) return;
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
      refresh();
    };
    promoBtn.addEventListener('click', applyPromo);
    promoInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyPromo(); }
    });
  }

  /**
   * Redraw after the bag or the promo code changes. On the live payment step
   * only the order summary is redrawn — render() would throw away Square's
   * card fields and whatever the buyer has typed into them.
   */
  function refresh() {
    if (S.cart.lines.length && state.step === 'payment' && S.isLive()) {
      var box = els.host.querySelector('.evb-summary');
      if (box) { box.innerHTML = summary(); wirePromo(); return; }
    }
    render();
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

  /**
   * Back from Cash App on a phone (?cashapp=1): reopen the review step on the
   * pending payment, so mountWallet() re-creates Cash App Pay with the same
   * reference and its token event lands. The rest of the checkout comes back
   * from the saved draft; terms were ticked before Cash App opened.
   */
  function resumeCashApp() {
    if (!/[?&]cashapp=1\b/.test(location.search)) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* keep the query */ }
    var pending = S.isLive() && S.cart.lines.length ? readPendingCashApp() : null;
    if (!pending) return;
    state.step = 'review';
    STEPS.forEach(function (s) { state.reached[s] = true; });
    state.payMethod = 'cashapp';
    state.data.terms = true;
    state.wallet.resume = pending;
  }

  function boot() {
    els.host = document.getElementById('checkoutHost');

    S.mountCartUI('/');

    var ready = false;
    C.load().then(function () {
      var changes = S.cart.reconcile();
      restoreDraft();
      resumeCashApp();
      render();
      ready = true;
      if (changes.length) {
        S.toast('Your bag changed — please review it before paying', 'error');
      }
    });

    // The slide-out bag works on this page too, so a change made there (or
    // in another tab) has to reach the order summary and totals — before,
    // only other tabs' changes did, and a removed item stayed on screen.
    // Not while submitting: a paid order clears the bag on its way out.
    function onCartChange() {
      if (ready && !state.submitting) refresh();
    }
    window.addEventListener('evb:cart-change', onCartChange);
    window.addEventListener('evb:cart-external', onCartChange);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
