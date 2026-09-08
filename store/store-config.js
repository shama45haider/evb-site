/**
 * East Village Buyers — Store configuration
 * ---------------------------------------------------------------------------
 * Single place to wire the storefront to Square. Nothing secret lives here:
 * this file ships to every browser, so it only ever holds PUBLIC values
 * (application id, location id, the Worker URL). The Square ACCESS TOKEN is a
 * server secret and belongs in the Cloudflare Worker (see /square-worker.js).
 *
 * Until `apiBase` is filled in, the store runs in DEMO mode: the catalog comes
 * from store-catalog.js, and checkout completes locally without ever taking or
 * transmitting a real card number. Fill in the three values below and the exact
 * same UI switches over to live Square. See /store/SQUARE-SETUP.md.
 */
window.EVB_STORE_CONFIG = {

  /* ---- Square (fill these in when you are ready to go live) ---- */

  // Your Cloudflare Worker's URL, no trailing slash.
  // e.g. 'https://evb-square.yourname.workers.dev'
  apiBase: '',

  // Square Developer Dashboard -> your app -> Credentials -> Application ID.
  // Sandbox ids start with 'sandbox-sq0idb-', production with 'sq0idp-'.
  squareApplicationId: 'sandbox-sq0idb-RWPUiYyjE6bacqy8RGUqxw',

  // Square Dashboard -> Locations. Looks like 'L8XY2Z9ABCDEF'.
  squareLocationId: 'LTY6P3DH2D9J3',

  // 'sandbox' while testing, 'production' when live. Controls which Square
  // Web Payments SDK bundle gets loaded.
  squareEnvironment: 'sandbox',

  /* ---- Store behaviour ---- */

  currency: 'USD',
  currencySymbol: '$',

  // NYC combined sales tax. Applied to taxable items only (see catalog).
  // When Square is connected the Worker's order total wins over this estimate.
  taxRate: 0.08875,

  // Free shipping at or above this subtotal (in cents). 0 disables.
  freeShippingThreshold: 50000,

  shippingRates: [
    { id: 'pickup',   label: 'In-store pickup',  detail: '39 Avenue A — ready same day during store hours', amount: 0,    days: 'Today' },
    { id: 'standard', label: 'Standard shipping', detail: 'Insured, signature on delivery',                  amount: 1500, days: '3–5 business days' },
    { id: 'express',  label: 'Express shipping',  detail: 'Insured, signature on delivery',                  amount: 3500, days: '1–2 business days' }
  ],

  // Promo codes. `type` is 'percent' (0–100) or 'fixed' (cents).
  // With Square connected these are validated server-side instead.
  promoCodes: {
    'EVB10':     { type: 'percent', value: 10, label: '10% off your order' },
    'WALKIN25':  { type: 'fixed',   value: 2500, label: '$25 off orders over $250', minSubtotal: 25000 },
    'FREESHIP':  { type: 'shipping', value: 0, label: 'Free standard shipping' }
  },

  /* ---- Business details (used on receipts) ---- */

  business: {
    name: 'East Village Buyers',
    legal: 'Vintage USA Inc · DBA East Village Buyers · DCA Lic. #2070477',
    address: '39 Avenue A, New York, NY 10009',
    phone: '917-608-8939',
    phoneHref: 'tel:9176088939',
    email: 'info@eastvillagebuyers.com',
    hours: 'Sun 12:30–6 PM · Mon–Thu 12:30–6:30 PM · Fri 12:30–6 PM · Sat Closed'
  },

  /* ---- Policy copy shown at checkout ---- */

  returnsPolicy: 'All items are authenticated in-house. Returns accepted within 14 days in original condition — final sale on gold and bullion priced to the live spot market.'
};
