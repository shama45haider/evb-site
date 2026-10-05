window.EVB_STORE_CONFIG = {

  apiBase: 'https://evb-square.shama45haider.workers.dev',

  squareApplicationId: 'sq0idp-MYZIn2r7DbdERwNYLlHO0w',

  squareLocationId: 'LTY6P3DH2D9J3',

  squareEnvironment: 'production',

  applePay: true,

  currency: 'USD',
  currencySymbol: '$',

  taxRate: 0.08875,

  freeShippingThreshold: 50000,

  shippingRates: [
    { id: 'pickup',   label: 'In-store pickup',  detail: '39 Avenue A — ready same day during store hours', amount: 0,    days: 'Today' },
    { id: 'standard', label: 'Standard shipping', detail: 'Insured, signature on delivery',                  amount: 1500, days: '3–5 business days' },
    { id: 'express',  label: 'Express shipping',  detail: 'Insured, signature on delivery',                  amount: 3500, days: '1–2 business days' }
  ],

  promoCodes: {
    'EVB10':     { type: 'percent', value: 10, label: '10% off your order' },
    'WALKIN25':  { type: 'fixed',   value: 2500, label: '$25 off orders over $250', minSubtotal: 25000 },
    'FREESHIP':  { type: 'shipping', value: 0, label: 'Free standard shipping' }
  },

  business: {
    name: 'East Village Buyers',
    legal: 'Vintage USA Inc · DBA East Village Buyers · DCA Lic. #2070477',
    address: '39 Avenue A, New York, NY 10009',
    phone: '917-608-8939',
    phoneHref: 'tel:9176088939',
    email: 'info@eastvillagebuyers.com',
    hours: 'Sun 12:30–6 PM · Mon–Thu 12:30–6:30 PM · Fri 12:30–4 PM · Sat Closed'
  },

  returnsPolicy: 'All sales are final. We do not accept returns or exchanges. If an item arrives damaged or is not what you ordered, contact us within 48 hours of delivery.'
};
