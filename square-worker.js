const ALLOWED_ORIGINS = new Set([
  'https://eastvillagebuyers.com',
  'https://www.eastvillagebuyers.com',
  'http://localhost:8123',
  'http://127.0.0.1:8123'
]);

const SQUARE_VERSION = '2024-10-17';

const TAX_PERCENTAGE = '8.875';

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

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  try { data = text ? JSON.parse(text) : {}; } catch (e) { }

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

function isPanelListing(o) {
  const values = o.custom_attribute_values || {};
  return Object.keys(values).some(k => {
    const v = values[k] || {};
    const named = v.name === 'evb_listing' || k === 'evb_listing' || k.endsWith(':evb_listing');
    return named && Boolean(v.string_value);
  });
}

async function handleCatalog(env, origin) {
  let all = [];
  let cursor = '';
  for (let page = 0; page < 50; page++) {
    const cat = await square(
      env,
      '/v2/catalog/list?types=ITEM,IMAGE' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
      'GET'
    );
    all = all.concat(cat.objects || []);
    cursor = cat.cursor || '';
    if (!cursor) break;
  }

  const panelOnly = (env.CATALOG_SOURCE || 'panel') !== 'all';
  const items = all.filter(o => o.type === 'ITEM' && !o.is_deleted && (!panelOnly || isPanelListing(o)));
  const usedImages = new Set();
  items.forEach(o => ((o.item_data && o.item_data.image_ids) || []).forEach(id => usedImages.add(id)));
  const objects = items.concat(all.filter(o => o.type === 'IMAGE' && usedImages.has(o.id)));

  const variationIds = [];
  objects.forEach(o => {
    if (o.type === 'ITEM' && o.item_data && o.item_data.variations) {
      o.item_data.variations.forEach(v => variationIds.push(v.id));
    }
  });

  const counts = {};
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
    'Cache-Control': 'public, max-age=60'
  });
}

async function buildSquareOrder(env, payload) {
  const incoming = (payload.order && payload.order.lineItems) || [];
  if (!incoming.length) throw Object.assign(new Error('Your bag is empty.'), { status: 400 });

  const ids = incoming.map(l => l.variationId).filter(Boolean);
  if (ids.length !== incoming.length) {
    throw Object.assign(new Error('One of the items is missing a variation id.'), { status: 400 });
  }

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
    if (taxable) li.applied_taxes = [{ tax_uid: 'sales-tax' }];
    lineItems.push(li);
  });

  const discounts = [];
  const code = String((payload.order.totals && payload.order.totals.promoCode) || '').toUpperCase();
  const promo = PROMO_CODES[code];
  let freeShipping = false;

  if (promo) {
    if (promo.minSubtotal && subtotal < promo.minSubtotal) {
    } else if (promo.type === 'percent') {
      discounts.push({ uid: 'promo', name: code, percentage: String(promo.value), scope: 'ORDER' });
    } else if (promo.type === 'fixed') {
      discounts.push({ uid: 'promo', name: code, amount_money: money(Math.min(promo.value, subtotal)), scope: 'ORDER' });
    } else if (promo.type === 'shipping') {
      freeShipping = true;
    }
  }

  const shippingId = (payload.order.fulfillment && payload.order.fulfillment.shippingId) ||
    (payload.order.fulfillment && payload.order.fulfillment.type === 'PICKUP' ? 'pickup' : 'standard');
  const rate = SHIPPING_RATES[shippingId] || SHIPPING_RATES.pickup;

  let shippingAmount = rate.amount;
  if (shippingId === 'standard' && (freeShipping || subtotal >= FREE_SHIPPING_THRESHOLD)) shippingAmount = 0;

  const buyerEmail = normEmail(payload.order.customer && payload.order.customer.email);
  let welcomeEmail = null;
  if (shippingId === 'standard' && shippingAmount > 0 && env.SUBSCRIBERS && buyerEmail) {
    const sub = await getSubscriber(env, buyerEmail);
    if (sub && !sub.r) { shippingAmount = 0; welcomeEmail = buyerEmail; }
  }
  const claimed = !!(payload.order.totals && payload.order.totals.welcomeShipping);
  if (claimed && shippingId === 'standard' && shippingAmount > 0) {
    throw Object.assign(new Error('The free-shipping welcome offer has already been used for this email. Go back to Delivery to see the updated total.'), { status: 409 });
  }

  const serviceCharges = shippingAmount > 0 ? [{
    uid: 'shipping',
    name: rate.label,
    amount_money: money(shippingAmount),
    calculation_phase: 'SUBTOTAL_PHASE',
    taxable: false
  }] : [];

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

  return { welcomeEmail, order: {
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
  } };
}

async function handleQuote(request, env, origin) {
  const payload = await request.json();
  if (!payload || !payload.order) return json({ error: 'Malformed request.' }, 400, origin);

  const built = await buildSquareOrder(env, payload);
  const calc = await square(env, '/v2/orders/calculate', 'POST', { order: built.order });
  const o = calc.order || {};
  const amount = m => (m && m.amount) || 0;

  return json({
    total: amount(o.total_money),
    subtotal: (o.line_items || []).reduce((n, li) => n + amount(li.gross_sales_money), 0),
    discount: amount(o.total_discount_money),
    shipping: amount(o.total_service_charge_money),
    tax: amount(o.total_tax_money),
    welcomeShipping: !!built.welcomeEmail
  }, 200, origin);
}

async function handleCreateOrder(request, env, origin, ctx) {
  const payload = await request.json();

  if (!payload || !payload.order || !payload.idempotencyKey) {
    return json({ error: 'Malformed request.' }, 400, origin);
  }

  if (env.ORDERS) {
    const seen = await env.ORDERS.get('idem:' + payload.idempotencyKey);
    if (seen) return json({ order: JSON.parse(seen) }, 200, origin);
  }

  const built = await buildSquareOrder(env, payload);

  const created = await square(env, '/v2/orders', 'POST', {
    idempotency_key: payload.idempotencyKey + '-order',
    order: built.order
  });

  const sqOrder = created.order;
  const total = (sqOrder.total_money && sqOrder.total_money.amount) || 0;

  if (total <= 0) {
    return json({ error: 'That order totals zero — nothing to charge.' }, 400, origin);
  }
  if (!payload.sourceId) {
    return json({ error: 'Missing payment token.' }, 400, origin);
  }

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
  const claimed = payload.order.payment && payload.order.payment.method;
  const via = ['Apple Pay', 'Google Pay', 'Cash App Pay', 'Afterpay'].indexOf(claimed) !== -1 ? claimed : 'Square';

  if (built.welcomeEmail && p.status === 'COMPLETED') {
    const sub = await getSubscriber(env, built.welcomeEmail);
    if (sub) {
      await env.SUBSCRIBERS.put('sub:' + built.welcomeEmail, '1', { metadata: Object.assign({}, sub, { r: Date.now() }) });
    }
  }

  const receipt = Object.assign({}, payload.order, {
    status: p.status === 'COMPLETED' ? 'PAID' : (p.status || 'PENDING'),
    squareOrderId: sqOrder.id,
    squarePaymentId: p.id,
    receiptUrl: p.receipt_url || null,
    demo: false,
    payment: {
      brand: card.card_brand || (via === 'Square' ? 'Card' : via),
      last4: card.last_4 || null,
      method: via,
      status: p.status || null
    },
    totals: {
      subtotal: (sqOrder.line_items || []).reduce(
        (n, li) => n + ((li.gross_sales_money && li.gross_sales_money.amount) || 0), 0),
      discount: (sqOrder.total_discount_money && sqOrder.total_discount_money.amount) || 0,
      promoCode: (payload.order.totals && payload.order.totals.promoCode) || '',
      shipping: (sqOrder.total_service_charge_money && sqOrder.total_service_charge_money.amount) || 0,
      tax: (sqOrder.total_tax_money && sqOrder.total_tax_money.amount) || 0,
      total: total
    },
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
    const ttl = { expirationTtl: 60 * 60 * 24 * 365 };
    await env.ORDERS.put('order:' + receipt.id, JSON.stringify(receipt), ttl);
    await env.ORDERS.put('idem:' + payload.idempotencyKey, JSON.stringify(receipt), ttl);
  }

  if (p.status === 'COMPLETED' && env.PANEL_API_KEY) {
    const panel = (env.PANEL_URL || 'https://panel.eastvillagebuyers.com').replace(/\/+$/, '');
    const ping = fetch(panel + '/api/cron/square-sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.PANEL_API_KEY }
    }).catch(err => console.error('[evb-square] panel sync ping failed', err.message));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(ping);
  }

  return json({ order: receipt }, 200, origin);
}

async function handleGetOrder(env, id, origin) {
  if (!env.ORDERS) {
    return json({ error: 'Order lookup is not configured.' }, 404, origin);
  }
  const raw = await env.ORDERS.get('order:' + id);
  if (!raw) return json({ error: 'Order not found.' }, 404, origin);
  return json(JSON.parse(raw), 200, origin, { 'Cache-Control': 'private, no-store' });
}

const RE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

async function getSubscriber(env, email) {
  const r = await env.SUBSCRIBERS.getWithMetadata('sub:' + email);
  return r && r.metadata ? r.metadata : null;
}

async function handleSubscribe(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  if (body.website) return json({ ok: true }, 200, origin);

  const email = normEmail(body.email);
  if (!RE_EMAIL.test(email)) return json({ error: 'Enter a valid email address.' }, 400, origin);

  const existing = await getSubscriber(env, email);
  if (existing) {
    return json({ ok: true, already: true, perkUsed: !!existing.r }, 200, origin);
  }
  const meta = { e: email, t: Date.now(), p: String(body.page || '').slice(0, 200), r: 0 };
  await env.SUBSCRIBERS.put('sub:' + email, '1', { metadata: meta });
  return json({ ok: true }, 200, origin);
}

async function handleWelcomeCheck(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const sub = await getSubscriber(env, normEmail(body.email));
  return json({ eligible: !!(sub && !sub.r) }, 200, origin, { 'Cache-Control': 'no-store' });
}

async function isAdmin(request, env) {
  const key = env.PANEL_API_KEY || '';
  const auth = request.headers.get('Authorization') || '';
  if (key.length < 32 || !auth.startsWith('Bearer ')) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(auth.slice(7))),
    crypto.subtle.digest('SHA-256', enc.encode(key))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function handleListSubscribers(env, origin) {
  const out = [];
  let cursor;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: 'sub:', cursor });
    page.keys.forEach(k => { if (k.metadata) out.push(k.metadata); });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  out.sort((a, b) => b.t - a.t);
  return json({
    subscribers: out.map(m => ({
      email: m.e,
      signedUpAt: new Date(m.t).toISOString(),
      page: m.p || '',
      perkUsedAt: m.r ? new Date(m.r).toISOString() : null
    }))
  }, 200, origin, { 'Cache-Control': 'private, no-store' });
}

async function handleDeleteSubscriber(env, email, origin) {
  await env.SUBSCRIBERS.delete('sub:' + normEmail(email));
  return json({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

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

    if (env.RATE_LIMITER) {
      const key = request.headers.get('CF-Connecting-IP') || 'anon';
      try {
        const { success } = await env.RATE_LIMITER.limit({ key });
        if (!success) return json({ error: 'Too many requests. Try again in a minute.' }, 429, origin);
      } catch (e) { }
    }

    const subPath = path === '/subscribe' || path === '/welcome-check' || /^\/subscribers(\/|$)/.test(path);
    if (subPath) {
      if (!env.SUBSCRIBERS) {
        return json({ error: 'Email signups are not configured on the server.' }, 503, origin);
      }
      try {
        if (request.method === 'POST' && path === '/subscribe') return await handleSubscribe(request, env, origin);
        if (request.method === 'POST' && path === '/welcome-check') return await handleWelcomeCheck(request, env, origin);

        if (!(await isAdmin(request, env))) return json({ error: 'Not authorised.' }, 401, origin);
        if (request.method === 'GET' && path === '/subscribers') return await handleListSubscribers(env, origin);
        const d = /^\/subscribers\/(.{3,260})$/.exec(path);
        if (request.method === 'DELETE' && d) return await handleDeleteSubscriber(env, decodeURIComponent(d[1]), origin);
        return json({ error: 'Not found.' }, 404, origin);
      } catch (err) {
        console.error('[evb-square] signup', err.message);
        return json({ error: 'Something went wrong. Please try again.' }, 500, origin);
      }
    }

    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
      return json({ error: 'Square is not configured on the server.' }, 503, origin);
    }

    try {
      if (request.method === 'GET' && path === '/catalog') {
        return await handleCatalog(env, origin);
      }
      if (request.method === 'POST' && path === '/quote') {
        return await handleQuote(request, env, origin);
      }
      if (request.method === 'POST' && path === '/orders') {
        return await handleCreateOrder(request, env, origin, ctx);
      }
      const m = /^\/orders\/([A-Za-z0-9._-]{1,64})$/.exec(path);
      if (request.method === 'GET' && m) {
        return await handleGetOrder(env, m[1], origin);
      }
      return json({ error: 'Not found.' }, 404, origin);

    } catch (err) {
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
