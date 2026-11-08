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

  // The most a free-shipping offer (the threshold, a free-shipping promo
  // code, the welcome offer, a Rewards prize) takes off. The usual $15 is still free; an item
  // the panel gave dearer shipping pays the rest. Same as the Worker's.
  shippingOfferCap: 2000,

  shippingRates: [
    { id: 'pickup',   label: 'In-store pickup',  detail: '39 Avenue A — ready same day during store hours', amount: 0,    days: 'Today' },
    { id: 'standard', label: 'Standard shipping', detail: 'Insured, signature on delivery',                  amount: 1500, days: '3–5 business days' },
    { id: 'express',  label: 'Express shipping',  detail: 'Insured, signature on delivery',                  amount: 3500, days: '1–2 business days' }
  ],

  business: {
    name: 'East Village Buyers',
    legal: 'Vintage USA Inc · DBA East Village Buyers · DCA Lic. #2070477',
    address: '39 Avenue A, New York, NY 10009',
    phone: '917-608-8939',
    phoneHref: 'tel:9176088939',
    email: 'help@eastvillagebuyers.com',
    hours: 'Sun 12:30–6 PM · Mon–Thu 12:30–6:30 PM · Fri 12:30–4 PM · Sat Closed'
  },

  // Short version of /return-policy/, shown at checkout and on the receipt.
  returnsPolicy: 'All sales are final, with no returns or refunds. Shipped orders can’t be exchanged, and once an order ships, any return or refund is solely at our discretion. Pickup orders can be exchanged for a different size within 24 hours of pickup. If an item arrives damaged or isn’t what you ordered, contact us within 48 hours of delivery.',
  returnsPolicyUrl: '/return-policy/',

  // Google Customer Reviews: the order page offers the buyer Google's review
  // survey, which builds the seller rating on Google. Set `on: true` only
  // after adding Google customer reviews in Merchant Center (Add-ons) and
  // accepting its terms, and bump this file's ?v= in /store/order/.
  googleCustomerReviews: { on: false, merchantId: 5752752250 }
};
