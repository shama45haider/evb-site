/**
 * East Village Buyers — Square store backend (Cloudflare Worker)
 * ===========================================================================
 *
 * Why this exists: eastvillagebuyers.com is a static site on GitHub Pages with
 * no server. The Square ACCESS TOKEN can never ship to the browser — anything
 * in /store/*.js is readable via view-source, and that token can move money.
 * This Worker holds the token as an encrypted secret and is the only thing
 * that ever talks to Square.
 *
 * It is also the only place that decides what an order costs. The browser's
 * totals are an estimate shown to the buyer; every price here is re-read from
 * the Square catalog, so a tampered request cannot change what gets charged.
 *
 * ── ROUTES ─────────────────────────────────────────────────────────────────
 *   GET  /health          quick sanity check, no Square call
 *   GET  /catalog         items + variations + images + inventory counts
 *   POST /orders          create the Square Order, take payment, return receipt
 *   GET  /orders/:id      fetch a stored receipt (needs the ORDERS KV binding)
 *
 * ── DEPLOY (Cloudflare dashboard, no CLI needed) ───────────────────────────
 *  1. dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker.
 *  2. Name it "evb-square", deploy the hello-world, then Edit Code and paste
 *     this whole file over it. Deploy.
 *  3. Settings -> Variables and Secrets, add:
 *       SQUARE_ACCESS_TOKEN   type Secret    (Square Dashboard -> Credentials)
 *       SQUARE_LOCATION_ID    type Text      (Square Dashboard -> Locations)
 *       SQUARE_ENVIRONMENT    type Text      "sandbox" or "production"
 *  4. Optional but recommended:
 *       Bindings -> KV Namespace -> variable name ORDERS
 *         Without it, everything still works except GET /orders/:id — the
 *         confirmation page then falls back to the copy in the buyer's browser.
 *       Bindings -> Rate Limiting -> variable name RATE_LIMITER
 *         e.g. 30 requests / 60s. Absent, the check is skipped (fails open).
 *  5. Copy the Worker URL and put it in /store/store-config.js as `apiBase`,
 *     along with your Application ID and Location ID.
 *
 * IMPORTANT: use SANDBOX credentials until you have placed a full test order.
 * Sandbox and production have separate tokens, locations and catalogs.
 * ===========================================================================
 */

const ALLOWED_ORIGINS = new Set([
  'https://eastvillagebuyers.com',
  'https://www.eastvillagebuyers.com',
  // Local development. Harmless in production: an attacker cannot make a
  // victim's browser originate from localhost.
  'http://localhost:8123',
  'http://127.0.0.1:8123'
]);

const SQUARE_VERSION = '2024-10-17';

/* NYC combined state + city sales tax. Bullion is exempt; taxability comes
   from each item's `is_taxable` flag in the Square catalog. */
const TAX_PERCENTAGE = '8.875';

/* Server-side promo codes. The browser copy in store-config.js is only for
   showing the buyer a preview — these are the ones that actually apply. */
const PROMO_CODES = {
  EVB10:    { type: 'percent',  value: 10 },
  WALKIN25: { type: 'fixed',    value: 2500, minSubtotal: 25000 },
  FREESHIP: { type: 'shipping' }
};

const SHIPPING_RATES = {
  pickup:   { label: 'In-store pickup',   amount: 0 },
  standard: { label: 'Standard shipping', amount: 1500 },
  express:  { label: 'Express shipping',  amount: 3500 }
};

const FREE_SHIPPING_THRESHOLD = 50000;

/* ========================================================================= */
/* Helpers                                                                    */
/* ========================================================================= */

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, origin, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8' },
      corsHeaders(origin),
      extra || {}
    )
  });
}

function squareBase(env) {
  return env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

/** Call the Square API. Throws SquareError with Square's own message on failure. */
async function square(env, path, method, body) {
  const res = await fetch(squareBase(env) + path, {
    method: method || 'GET',
    headers: {
      'Square-Version': SQUARE_VERSION,
      'Authorization': 'Bearer ' + env.SQUARE_ACCESS_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { /* non-JSON error body */ }

  if (!res.ok) {
    const err = (data.errors && data.errors[0]) || {};
    const e = new Error(err.detail || err.code || ('Square API error ' + res.status));
    e.squareCode = err.code;
    e.status = res.status;
    e.category = err.category;
    throw e;
  }
  return data;
}

function money(amount, currency) {
  return { amount: Math.round(amount), currency: currency || 'USD' };
}

/* ========================================================================= */
/* GET /catalog                                                               */
/* ========================================================================= */

async function handleCatalog(env, origin) {
  // ITEM pulls the products, IMAGE resolves image_ids to URLs.
  const cat = await square(
    env,
    '/v2/catalog/list?types=ITEM,IMAGE',
    'GET'
  );

  const objects = cat.objects || [];

  // Fold live inventory onto each variation so the storefront can mark
  // one-of-one pieces as sold the moment they go.
  const variationIds = [];
  objects.forEach(o => {
    if (o.type === 'ITEM' && o.item_data && o.item_data.variations) {
      o.item_data.variations.forEach(v => variationIds.push(v.id));
    }
  });

  const counts = {};
  // Square caps this batch at 1000 ids per call.
  for (let i = 0; i < variationIds.length; i += 500) {
    const slice = variationIds.slice(i, i + 500);
    if (!slice.length) break;
    try {
      const inv = await square(env, '/v2/inventory/counts/batch-retrieve', 'POST', {
        catalog_object_ids: slice,
        location_ids: [env.SQUARE_LOCATION_ID],
        states: ['IN_STOCK']
      });
      (inv.counts || []).forEach(c => {
        counts[c.catalog_object_id] = (counts[c.catalog_object_id] || 0) + Number(c.quantity || 0);
      });
    } catch (e) {
      // Inventory tracking may simply be off for these items. Treat that as
      // "available" rather than failing the whole catalog request.
    }
  }

  objects.forEach(o => {
    if (o.type !== 'ITEM' || !o.item_data || !o.item_data.variations) return;
    o.item_data.variations.forEach(v => {
      const tracked = v.item_variation_data && v.item_variation_data.track_inventory;
      v.stock = tracked ? (counts[v.id] || 0) : (counts[v.id] != null ? counts[v.id] : 1);
    });
  });

  return json({ objects }, 200, origin, {
    // Short edge cache: the catalog changes when something sells, so this
    // trades a little staleness for a much faster storefront.
    'Cache-Control': 'public, max-age=60'
  });
}

/* ========================================================================= */
/* POST /orders                                                               */
/* ========================================================================= */

/**
 * Build the Square Order from the CATALOG, not from the client's prices.
 * The client sends product/variation ids and quantities; everything monetary
 * is resolved server-side.
 */
async function buildSquareOrder(env, payload) {
  const incoming = (payload.order && payload.order.lineItems) || [];
  if (!incoming.length) throw Object.assign(new Error('Your bag is empty.'), { status: 400 });

  const ids = incoming.map(l => l.variationId).filter(Boolean);
  if (ids.length !== incoming.length) {
    throw Object.assign(new Error('One of the items is missing a variation id.'), { status: 400 });
  }

  // Pull the authoritative variation objects, plus their parent items so we
  // can read is_taxable.
  const batch = await square(env, '/v2/catalog/batch-retrieve', 'POST', {
    object_ids: ids,
    include_related_objects: true
  });

  const variations = {};
  (batch.objects || []).forEach(o => { if (o.type === 'ITEM_VARIATION') variations[o.id] = o; });

  const items = {};
  (batch.related_objects || []).forEach(o => { if (o.type === 'ITEM') items[o.id] = o; });

  const lineItems = [];
  let subtotal = 0;

  incoming.forEach((l, i) => {
    const v = variations[l.variationId];
    if (!v) throw Object.assign(new Error('An item in your bag is no longer available.'), { status: 409 });

    const vd = v.item_variation_data || {};
    const parent = items[vd.item_id];
    const taxable = !parent || parent.item_data.is_taxable !== false;
    const qty = Math.max(1, parseInt(l.quantity, 10) || 1);
    const unit = (vd.price_money && vd.price_money.amount) || 0;

    subtotal += unit * qty;

    const li = {
      uid: 'line-' + i,
      catalog_object_id: l.variationId,
      quantity: String(qty)
    };
    // Only taxable lines get the tax applied — bullion is exempt.
    if (taxable) li.applied_taxes = [{ tax_uid: 'sales-tax' }];
    lineItems.push(li);
  });

  /* --- discount --- */
  const discounts = [];
  const code = String((payload.order.totals && payload.order.totals.promoCode) || '').toUpperCase();
  const promo = PROMO_CODES[code];
  let freeShipping = false;

  if (promo) {
    if (promo.minSubtotal && subtotal < promo.minSubtotal) {
      // Silently drop a code that no longer qualifies rather than failing the
      // order — the client will show the recomputed total on the receipt.
    } else if (promo.type === 'percent') {
      discounts.push({ uid: 'promo', name: code, percentage: String(promo.value), scope: 'ORDER' });
    } else if (promo.type === 'fixed') {
      discounts.push({ uid: 'promo', name: code, amount_money: money(Math.min(promo.value, subtotal)), scope: 'ORDER' });
    } else if (promo.type === 'shipping') {
      freeShipping = true;
    }
  }

  /* --- shipping --- */
  const shippingId = (payload.order.fulfillment && payload.order.fulfillment.shippingId) ||
    (payload.order.fulfillment && payload.order.fulfillment.type === 'PICKUP' ? 'pickup' : 'standard');
  const rate = SHIPPING_RATES[shippingId] || SHIPPING_RATES.pickup;

  let shippingAmount = rate.amount;
  if (shippingId === 'standard' && (freeShipping || subtotal >= FREE_SHIPPING_THRESHOLD)) shippingAmount = 0;

  const serviceCharges = shippingAmount > 0 ? [{
    uid: 'shipping',
    name: rate.label,
    amount_money: money(shippingAmount),
    calculation_phase: 'SUBTOTAL_PHASE',
    taxable: false
  }] : [];

  /* --- fulfillment --- */
  const f = payload.order.fulfillment || {};
  const c = payload.order.customer || {};
  const displayName = ((c.firstName || '') + ' ' + (c.lastName || '')).trim();

  const fulfillments = [f.type === 'PICKUP'
    ? {
        type: 'PICKUP',
        state: 'PROPOSED',
        pickup_details: {
          recipient: { display_name: displayName, email_address: c.email, phone_number: c.phone },
          schedule_type: 'ASAP',
          note: f.note || undefined
        }
      }
    : {
        type: 'SHIPMENT',
        state: 'PROPOSED',
        shipment_details: {
          recipient: {
            display_name: displayName,
            email_address: c.email,
            phone_number: c.phone,
            address: {
              address_line_1: f.address && f.address.line1,
              address_line_2: (f.address && f.address.line2) || undefined,
              locality: f.address && f.address.city,
              administrative_district_level_1: f.address && f.address.region,
              postal_code: f.address && f.address.postal,
              country: (f.address && f.address.country) || 'US'
            }
          },
          shipping_type: rate.label,
          note: f.note || undefined
        }
      }];

  return {
    location_id: env.SQUARE_LOCATION_ID,
    reference_id: payload.order.id,
    line_items: lineItems,
    taxes: [{
      uid: 'sales-tax',
      name: 'NY Sales Tax',
      percentage: TAX_PERCENTAGE,
      scope: 'LINE_ITEM',
      type: 'ADDITIVE'
    }],
    discounts: discounts.length ? discounts : undefined,
    service_charges: serviceCharges.length ? serviceCharges : undefined,
    fulfillments,
    metadata: {
      source: 'eastvillagebuyers.com',
      evb_order_id: String(payload.order.id).slice(0, 255)
    }
  };
}

async function handleCreateOrder(request, env, origin) {
  const payload = await request.json();

  if (!payload || !payload.order || !payload.idempotencyKey) {
    return json({ error: 'Malformed request.' }, 400, origin);
  }

  // Replay guard. Square's own idempotency covers the payment; this also stops
  // a duplicate ORDER being created if the browser retries mid-flight.
  if (env.ORDERS) {
    const seen = await env.ORDERS.get('idem:' + payload.idempotencyKey);
    if (seen) return json({ order: JSON.parse(seen) }, 200, origin);
  }

  const orderBody = await buildSquareOrder(env, payload);

  const created = await square(env, '/v2/orders', 'POST', {
    idempotency_key: payload.idempotencyKey + '-order',
    order: orderBody
  });

  const sqOrder = created.order;
  const total = (sqOrder.total_money && sqOrder.total_money.amount) || 0;

  if (total <= 0) {
    return json({ error: 'That order totals zero — nothing to charge.' }, 400, origin);
  }
  if (!payload.sourceId) {
    return json({ error: 'Missing payment token.' }, 400, origin);
  }

  // Charge exactly what Square calculated. Never the client's figure.
  const paid = await square(env, '/v2/payments', 'POST', {
    idempotency_key: payload.idempotencyKey,
    source_id: payload.sourceId,
    verification_token: payload.verificationToken || undefined,
    amount_money: sqOrder.total_money,
    order_id: sqOrder.id,
    location_id: env.SQUARE_LOCATION_ID,
    autocomplete: true,
    buyer_email_address: (payload.order.customer && payload.order.customer.email) || undefined,
    note: 'eastvillagebuyers.com ' + payload.order.id,
    reference_id: String(payload.order.id).slice(0, 40)
  });

  const p = paid.payment || {};
  const card = (p.card_details && p.card_details.card) || {};

  const receipt = Object.assign({}, payload.order, {
    status: p.status === 'COMPLETED' ? 'PAID' : (p.status || 'PENDING'),
    squareOrderId: sqOrder.id,
    squarePaymentId: p.id,
    receiptUrl: p.receipt_url || null,
    demo: false,
    payment: {
      brand: card.card_brand || 'Card',
      last4: card.last_4 || null,
      method: 'Square',
      status: p.status || null
    },
    // Square's numbers are authoritative and replace the client estimate.
    // Subtotal is the sum of each line's gross sales, which is what Square
    // itself shows before discounts, shipping and tax.
    totals: {
      subtotal: (sqOrder.line_items || []).reduce(
        (n, li) => n + ((li.gross_sales_money && li.gross_sales_money.amount) || 0), 0),
      discount: (sqOrder.total_discount_money && sqOrder.total_discount_money.amount) || 0,
      promoCode: (payload.order.totals && payload.order.totals.promoCode) || '',
      shipping: (sqOrder.total_service_charge_money && sqOrder.total_service_charge_money.amount) || 0,
      tax: (sqOrder.total_tax_money && sqOrder.total_tax_money.amount) || 0,
      total: total
    },
    // Re-price the displayed line items from Square too, so the receipt can
    // never show a different unit price than the one that was charged.
    lineItems: (payload.order.lineItems || []).map((l, i) => {
      const sq = (sqOrder.line_items || []).filter(x => x.uid === 'line-' + i)[0];
      if (!sq) return l;
      const qty = parseInt(sq.quantity, 10) || l.quantity;
      return Object.assign({}, l, {
        quantity: qty,
        unitPrice: (sq.base_price_money && sq.base_price_money.amount) || l.unitPrice,
        total: (sq.gross_sales_money && sq.gross_sales_money.amount) || l.total
      });
    })
  });

  if (env.ORDERS) {
    // Receipts expire after a year; the Square dashboard is the permanent record.
    const ttl = { expirationTtl: 60 * 60 * 24 * 365 };
    await env.ORDERS.put('order:' + receipt.id, JSON.stringify(receipt), ttl);
    await env.ORDERS.put('idem:' + payload.idempotencyKey, JSON.stringify(receipt), ttl);
  }

  return json({ order: receipt }, 200, origin);
}

/* ========================================================================= */
/* GET /orders/:id                                                            */
/* ========================================================================= */

async function handleGetOrder(env, id, origin) {
  if (!env.ORDERS) {
    return json({ error: 'Order lookup is not configured.' }, 404, origin);
  }
  const raw = await env.ORDERS.get('order:' + id);
  if (!raw) return json({ error: 'Order not found.' }, 404, origin);
  return json(JSON.parse(raw), 200, origin, { 'Cache-Control': 'private, no-store' });
}

/* ========================================================================= */
/* Router                                                                     */
/* ========================================================================= */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Reject cross-origin calls from anywhere we did not authorise. Requests
    // with no Origin header (curl, server-to-server) are allowed through.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'Origin not allowed.' }, 403, origin);
    }

    if (path === '/health') {
      return json({
        ok: true,
        environment: env.SQUARE_ENVIRONMENT || 'sandbox',
        configured: !!(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID),
        ordersKv: !!env.ORDERS
      }, 200, origin);
    }

    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
      return json({ error: 'Square is not configured on the server.' }, 503, origin);
    }

    // Rate limiting, when the binding is attached. Fails open by design:
    // a missing binding should not take the store down.
    if (env.RATE_LIMITER) {
      const key = request.headers.get('CF-Connecting-IP') || 'anon';
      try {
        const { success } = await env.RATE_LIMITER.limit({ key });
        if (!success) return json({ error: 'Too many requests. Try again in a minute.' }, 429, origin);
      } catch (e) { /* ignore and continue */ }
    }

    try {
      if (request.method === 'GET' && path === '/catalog') {
        return await handleCatalog(env, origin);
      }
      if (request.method === 'POST' && path === '/orders') {
        return await handleCreateOrder(request, env, origin);
      }
      const m = /^\/orders\/([A-Za-z0-9._-]{1,64})$/.exec(path);
      if (request.method === 'GET' && m) {
        return await handleGetOrder(env, m[1], origin);
      }
      return json({ error: 'Not found.' }, 404, origin);

    } catch (err) {
      // Square's card-decline messages are safe and useful to show the buyer.
      // Anything else is logged and replaced with something generic.
      const declineCodes = [
        'CARD_DECLINED', 'CVV_FAILURE', 'ADDRESS_VERIFICATION_FAILURE',
        'INVALID_EXPIRATION', 'GENERIC_DECLINE', 'INSUFFICIENT_FUNDS',
        'CARD_EXPIRED', 'PAN_FAILURE', 'CARD_NOT_SUPPORTED',
        'INVALID_CARD', 'VERIFY_CVV_FAILURE', 'VERIFY_AVS_FAILURE'
      ];
      const status = err.status || 500;
      const safe = declineCodes.indexOf(err.squareCode) !== -1 || status === 400 || status === 409;

      if (!safe) console.error('[evb-square]', err.squareCode || '', err.message);

      return json({
        error: safe
          ? err.message
          : 'We could not complete that payment. Nothing was charged — call 917-608-8939 and we will take the order by phone.',
        code: err.squareCode || undefined
      }, status >= 400 && status < 600 ? status : 500, origin);
    }
  }
};
