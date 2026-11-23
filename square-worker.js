const ALLOWED_ORIGINS = new Set([
  'https://eastvillagebuyers.com',
  'https://www.eastvillagebuyers.com',
  'http://localhost:8123',
  'http://127.0.0.1:8123'
]);

const SQUARE_VERSION = '2024-10-17';

const TAX_PERCENTAGE = '8.875';

// Promo codes are the Worker secret PROMO_CODES, not this file, because this
// file is public (the site and its GitHub repo). JSON, amounts in cents:
//   {"CODE":{"type":"percent","value":10},
//    "CODE2":{"type":"fixed","value":2500,"minSubtotal":25000},
//    "CODE3":{"type":"shipping"}}
// An optional "label" replaces the wording checkout shows. Change them in
// the dashboard: evb-square -> Settings -> Variables and Secrets.
//
// Codes the site itself hands to every visitor have nothing to hide, so they
// live here instead: SPIN120 and GIFT5 are the prizes of the welcome game
// (evb-spin.js). A code of the same name in PROMO_CODES wins over these.
// member: the code belongs to the account that won it, for GAME_CODE_DAYS
// from the win, and works once (see memberCodeCheck).
const PUBLIC_PROMO_CODES = {
  SPIN120: { type: 'shipping', minSubtotal: 12000, label: 'Free shipping on your first order over $120' },
  GIFT5: { type: 'fixed', value: 500, label: '$5 off your order', member: true }
};

function promoCodes(env) {
  let secret = {};
  try {
    const codes = JSON.parse(env.PROMO_CODES || '{}');
    if (codes && typeof codes === 'object') secret = codes;
  } catch (e) {
    console.error('[evb-square] PROMO_CODES is not valid JSON');
  }
  const codes = Object.assign({}, PUBLIC_PROMO_CODES, secret);
  // A member code stays a member code even if PROMO_CODES lists it too: GIFT5
  // must never work for someone who didn't win it (the owner, 2026-11-23).
  Object.keys(PUBLIC_PROMO_CODES).forEach(function (c) {
    if (PUBLIC_PROMO_CODES[c].member && codes[c] && typeof codes[c] === 'object') {
      codes[c] = Object.assign({}, codes[c], { member: true });
    }
  });
  return codes;
}

function promoRule(env, code) {
  const codes = promoCodes(env);
  return code && Object.prototype.hasOwnProperty.call(codes, code) ? codes[code] : null;
}

const SHIPPING_RATES = {
  pickup:   { label: 'In-store pickup',   amount: 0 },
  standard: { label: 'Standard shipping', amount: 1500 },
  express:  { label: 'Express shipping',  amount: 3500 }
};

const FREE_SHIPPING_THRESHOLD = 50000;

// The most a free-shipping offer (the threshold, a free-shipping promo code,
// the welcome offer, a Rewards prize) takes off standard shipping. The usual $15 is still
// free; an item the panel gave dearer shipping pays the rest (the owner's
// call, 2026-10-29). store-config.js shippingOfferCap is the browser's copy.
const SHIPPING_OFFER_CAP = 2000;

// How an item can reach the buyer and what its shipping costs, from the
// panel (migration 0083): the Square item's `shipping` attribute, "both" |
// "ship" | "pickup", then ":free" or ":<cents>" for its own standard
// shipping. Nothing means pickup or shipping at the usual rate. Read the
// same way in store-catalog.js.
function itemShipping(item) {
  const values = (item && item.custom_attribute_values) || {};
  const key = Object.keys(values).find(k => {
    const v = values[k] || {};
    return v.name === 'shipping' || k === 'evb_shipping' || k.endsWith(':evb_shipping');
  });
  const m = /^(both|ship|pickup)(?::(free|\d{1,6}))?$/.exec(String((key && values[key].string_value) || '').trim());
  if (!m) return { delivery: 'both', cents: null };
  return { delivery: m[1], cents: m[1] === 'pickup' || !m[2] ? null : m[2] === 'free' ? 0 : Number(m[2]) };
}

// Supabase, for checking who is ordering (panel migration 0075). Public
// values, the same as the website's account/account-config.js: the anon key
// can only call the member_* functions, as the member whose session it is.
const SUPABASE_URL_DEFAULT = 'https://bkiqjirxxodekhnzzlfw.supabase.co';
const SUPABASE_ANON_KEY_DEFAULT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraXFqaXJ4eG9kZWtobnp6bGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Mjc0NzMsImV4cCI6MjEwMDIwMzQ3M30.XdjdkD7pkSR68cwKP8CGDoczKT7hM3MkAzJLMdrNmT0';

function shout(message, status) {
  return Object.assign(new Error(message), { status, safe: true });
}

// Only members can order, and a shipped order goes only to the address on
// their ID. Asked of Supabase with the member's own session
// (member_checkout_check), which compares the address — so a hand-edited
// request can't ship anywhere else. Returns the member.
async function checkMember(request, env, payload) {
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) {
    throw shout('Sign in to check out. Online orders are for East Village Buyers members.', 401);
  }
  const f = (payload.order && payload.order.fulfillment) || {};
  const a = f.type === 'PICKUP' ? null : (f.address || {});
  const base = (env.SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/+$/, '');
  const res = await fetch(base + '/rest/v1/rpc/member_checkout_check', {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_DEFAULT,
      Authorization: auth,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(a ? {
      p_line1: String(a.line1 || ''), p_line2: String(a.line2 || ''), p_city: String(a.city || ''),
      p_state: String(a.region || ''), p_postal: String(a.postal || '')
    } : {})
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const m = (j && j.message) || '';
    if (res.status === 401 || res.status === 403 || /sign in|JWT|Confirm your email/i.test(m)) {
      throw shout('Your sign-in expired. Sign in again to check out — your bag is saved.', 401);
    }
    if (/account page first/i.test(m)) throw shout('Finish setting up your account before you check out.', 403);
    console.error('[evb-square] member check failed', res.status, (j && j.code) || '', m);
    throw shout('We couldn\u2019t check your account just now. Nothing was charged — try again, or call 917-608-8939.', 503);
  }
  if (!j || !j.email) throw shout('Sign in to check out.', 401);
  if (!j.onboarded) throw shout('Finish setting up your account before you check out.', 403);
  if (a) {
    if (!j.canShip) {
      throw shout(j.reason === 'id_rejected'
        ? 'We couldn\u2019t accept the ID on your account, so this order can only be picked up. Nothing was charged.'
        : 'We need to read the address on your ID before we can ship. Pick up in the shop, or call 917-608-8939. Nothing was charged.', 409);
    }
    if (j.matches !== true) {
      throw shout('That address doesn\u2019t match the address on your ID. We ship only to the address on your ID — to ship somewhere else, call or text us at 917-608-8939. Nothing was charged.', 409);
    }
  }
  return j;
}

// A member_* function in Supabase, called as the member (their own session).
// Resolves { ok, data, message }; never throws, so a caller decides.
async function memberRpc(env, auth, fn, body) {
  const base = (env.SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/+$/, '');
  try {
    const res = await fetch(base + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_DEFAULT,
        Authorization: auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    const j = await res.json().catch(() => null);
    return { ok: res.ok, data: j, message: (!res.ok && j && j.message) || '' };
  } catch (e) {
    return { ok: false, data: null, message: e.message };
  }
}

// The points prize this cart gets (panel 0079): the one worth the most here.
// Free shipping only takes off standard shipping. A lookup that fails means
// no prize, never a failed checkout.
async function checkoutPrize(env, auth, itemsCents, shippingCents) {
  if (!auth) return null;
  const r = await memberRpc(env, auth, 'member_checkout_prize', {
    p_items_cents: Math.max(Math.round(itemsCents), 0),
    p_shipping_cents: Math.max(Math.round(shippingCents), 0)
  });
  if (!r.ok) {
    console.error('[evb-square] prize lookup failed', r.message);
    return null;
  }
  const p = r.data && r.data.prize;
  return p && p.code ? {
    code: String(p.code), label: String(p.label || ''), kind: p.kind === 'shipping' ? 'shipping' : 'off',
    points: Number(p.points) || 0, creditCents: Number(p.creditCents) || 0
  } : null;
}

// What a prize is called on the Square order and the receipt.
function prizeName(prize) {
  return prize.kind === 'shipping' ? 'EVB Rewards · Free shipping' : 'EVB Rewards · ' + prize.label.replace(/ an order$/, '');
}

// Lets go of a hold (or, if Square charged anyway, refunds it) when the
// order can't stand — the points it was priced with are gone.
async function undoPayment(env, p, idem) {
  try {
    if (p.status === 'APPROVED') {
      await square(env, '/v2/payments/' + encodeURIComponent(p.id) + '/cancel', 'POST', {});
    } else if (p.status === 'COMPLETED') {
      await square(env, '/v2/refunds', 'POST', {
        idempotency_key: idem + '-undo',
        payment_id: p.id,
        amount_money: p.amount_money,
        reason: 'Points prize could not be applied'
      });
    }
  } catch (e) {
    console.error('[evb-square] could not undo payment', p.id, e.message);
  }
}

// The order is the member's: their account email gets the receipt, and it is
// what their points are matched on (0069).
function asMember(payload, member) {
  payload.order.customer = Object.assign({}, payload.order.customer, { email: member.email });
  return payload;
}

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

// This week's deals: a few listings at 5–8% off, Monday through Sunday in
// New York. Picked the first time the catalog is asked for in a week and
// kept in KV, so the price the site shows is the price checkout charges.
// One that sells is replaced by the next pick; the rest keep their price
// all week.
const DEAL_COUNT = 4;
const DEAL_MIN_PRICE = 2000;

function dealWeek(now) {
  const ny = new Date((now || new Date()).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const mon = new Date(ny.getFullYear(), ny.getMonth(), ny.getDate() - (ny.getDay() + 6) % 7);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { key: 'deals:' + ymd(mon), ends: ymd(sun) };
}

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The same rounding as the site's store-catalog.js.
function dealPrice(unit, pct) {
  return Math.round(unit * (100 - pct) / 100);
}

// { itemId: percent } for this week. Kept in the SUBSCRIBERS namespace under
// "deals:", apart from the "sub:" keys.
async function readDeals(env, week) {
  if (!env.SUBSCRIBERS) return {};
  return (await env.SUBSCRIBERS.get(week.key, 'json').catch(() => null)) || {};
}

async function pickDeals(env, week, items) {
  const deals = await readDeals(env, week);
  if (!env.SUBSCRIBERS) return deals;
  const vars = o => (o.item_data && o.item_data.variations) || [];
  const price = o => { const v = vars(o)[0]; return (v && v.item_variation_data.price_money && v.item_variation_data.price_money.amount) || 0; };
  const open = items.filter(o => price(o) >= DEAL_MIN_PRICE && vars(o).some(v => v.stock > 0));
  let have = open.filter(o => deals[o.id]).length;
  const fresh = open.filter(o => !deals[o.id])
    .sort((a, b) => hash32(week.key + a.id) - hash32(week.key + b.id));
  let added = false;
  for (const o of fresh) {
    if (have >= DEAL_COUNT) break;
    deals[o.id] = 5 + hash32(o.id + week.key) % 4;
    have++;
    added = true;
  }
  if (added) await env.SUBSCRIBERS.put(week.key, JSON.stringify(deals), { expirationTtl: 60 * 60 * 24 * 14 });
  return deals;
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

  const week = dealWeek();
  const deals = await pickDeals(env, week, items).catch(() => ({}));
  items.forEach(o => { if (deals[o.id]) o.evb_deal = { pct: deals[o.id], ends: week.ends }; });

  return json({ objects }, 200, origin, {
    'Cache-Control': 'public, max-age=60'
  });
}

async function checkStock(env, incoming, variations, items) {
  const tracked = incoming.filter(l => {
    const v = variations[l.variationId];
    return v && v.item_variation_data && v.item_variation_data.track_inventory;
  });
  if (!tracked.length) return;

  const inv = await square(env, '/v2/inventory/counts/batch-retrieve', 'POST', {
    catalog_object_ids: tracked.map(l => l.variationId),
    location_ids: [env.SQUARE_LOCATION_ID],
    states: ['IN_STOCK']
  });
  const counts = {};
  (inv.counts || []).forEach(c => {
    counts[c.catalog_object_id] = (counts[c.catalog_object_id] || 0) + Number(c.quantity || 0);
  });

  tracked.forEach(l => {
    const qty = Math.max(1, parseInt(l.quantity, 10) || 1);
    if ((counts[l.variationId] || 0) >= qty) return;
    const parent = items[variations[l.variationId].item_variation_data.item_id];
    const name = (parent && parent.item_data && parent.item_data.name) || 'An item in your bag';
    throw Object.assign(new Error(name + ' just sold. Remove it from your bag to check out. Nothing was charged.'), { status: 409 });
  });
}

async function buildSquareOrder(env, payload, auth) {
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

  await checkStock(env, incoming, variations, items);

  const lineItems = [];
  const discounts = [];
  const deals = await readDeals(env, dealWeek());
  let subtotal = 0;
  let taxableSubtotal = 0;
  // Standard shipping goes in one box, priced at its dearest item; an item
  // with no price of its own is the usual rate.
  let standardShipping = 0;
  const pickupOnly = [];
  const shipOnly = [];

  incoming.forEach((l, i) => {
    const v = variations[l.variationId];
    if (!v) throw Object.assign(new Error('An item in your bag is no longer available.'), { status: 409 });

    const vd = v.item_variation_data || {};
    const parent = items[vd.item_id];
    const taxable = !parent || parent.item_data.is_taxable !== false;
    const qty = Math.max(1, parseInt(l.quantity, 10) || 1);
    const unit = (vd.price_money && vd.price_money.amount) || 0;

    const li = {
      uid: 'line-' + i,
      catalog_object_id: l.variationId,
      quantity: String(qty)
    };
    if (taxable) li.applied_taxes = [{ tax_uid: 'sales-tax' }];

    // This week's deal comes off the line, before any promo code or prize.
    const pct = parent && deals[parent.id];
    const off = pct ? (unit - dealPrice(unit, pct)) * qty : 0;
    if (off > 0) {
      discounts.push({ uid: 'deal-' + i, name: 'This week’s deal (' + pct + '% off)', amount_money: money(off), scope: 'LINE_ITEM' });
      li.applied_discounts = [{ discount_uid: 'deal-' + i }];
    }

    subtotal += unit * qty - off;
    if (taxable) taxableSubtotal += unit * qty - off;

    const ship = itemShipping(parent);
    const name = (parent && parent.item_data && parent.item_data.name) || 'An item in your bag';
    if (ship.delivery === 'pickup') pickupOnly.push(name);
    if (ship.delivery === 'ship') shipOnly.push(name);
    standardShipping = Math.max(standardShipping, ship.cents != null ? ship.cents : SHIPPING_RATES.standard.amount);

    lineItems.push(li);
  });

  const code = String((payload.order.totals && payload.order.totals.promoCode) || '').toUpperCase();
  const promo = promoRule(env, code);
  let freeShipping = false;
  let promoOff = 0;

  // A game prize code works only for the member who won it (asMember put
  // their address on the order), within its days, once.
  if (promo && promo.member) {
    await memberCodeCheck(env, normEmail(payload.order.customer && payload.order.customer.email), code);
  }

  let memberCode = '';
  if (promo) {
    if (promo.minSubtotal && subtotal < promo.minSubtotal) {
    } else if (promo.type === 'percent') {
      promoOff = Math.round(subtotal * promo.value / 100);
      discounts.push({ uid: 'promo', name: code, percentage: String(promo.value), scope: 'ORDER' });
    } else if (promo.type === 'fixed') {
      promoOff = Math.min(promo.value, subtotal);
      discounts.push({ uid: 'promo', name: code, amount_money: money(promoOff), scope: 'ORDER' });
    } else if (promo.type === 'shipping') {
      freeShipping = true;
    }
    if (promo.member && (promoOff > 0 || freeShipping)) memberCode = code;
  }

  const shippingId = (payload.order.fulfillment && payload.order.fulfillment.shippingId) ||
    (payload.order.fulfillment && payload.order.fulfillment.type === 'PICKUP' ? 'pickup' : 'standard');
  const rate = SHIPPING_RATES[shippingId] || SHIPPING_RATES.pickup;
  const pickup = rate === SHIPPING_RATES.pickup;

  // Pickup-only and ship-only items (panel 0083). The checkout page stops
  // these first; this is what holds.
  if (pickup && shipOnly.length) {
    throw Object.assign(new Error(shipOnly[0] + ' ships only, so it can\u2019t be picked up. Go back to Delivery and choose shipping. Nothing was charged.'), { status: 409 });
  }
  if (!pickup && pickupOnly.length) {
    throw Object.assign(new Error(pickupOnly[0] + ' is pickup only. Go back to Delivery and choose pickup. Nothing was charged.'), { status: 409 });
  }

  let shippingAmount = pickup ? 0
    : shippingId === 'standard' ? standardShipping
    : standardShipping + Math.max(rate.amount - SHIPPING_RATES.standard.amount, 0);
  let shippingOff = 0;
  if (shippingId === 'standard' && (freeShipping || subtotal >= FREE_SHIPPING_THRESHOLD)) {
    shippingOff = Math.min(shippingAmount, SHIPPING_OFFER_CAP);
  }

  const buyerEmail = normEmail(payload.order.customer && payload.order.customer.email);
  let welcomeEmail = null;
  if (shippingId === 'standard' && shippingAmount > 0 && !shippingOff && env.SUBSCRIBERS && buyerEmail) {
    const sub = await getSubscriber(env, buyerEmail);
    if (sub && !sub.r) { shippingOff = Math.min(shippingAmount, SHIPPING_OFFER_CAP); welcomeEmail = buyerEmail; }
  }
  shippingAmount -= shippingOff;
  const claimed = !!(payload.order.totals && payload.order.totals.welcomeShipping);
  if (claimed && shippingId === 'standard' && !welcomeEmail) {
    throw Object.assign(new Error('The free-shipping welcome offer has already been used for this email. Go back to Delivery to see the updated total.'), { status: 409 });
  }

  // The member's points prize comes off by itself (panel 0079), unless they
  // chose to save their points (usePrize false). A checkout page from before
  // prizes sends no usePrize and gets none, so its total still matches.
  // Priced on the goods after any promo code, and on standard shipping still
  // being charged, up to what a free-shipping offer may take off — none if
  // one already has.
  const prizeCart = {
    itemsCents: Math.max(subtotal - promoOff, 0),
    shippingCents: shippingId === 'standard' && !shippingOff ? Math.min(shippingAmount, SHIPPING_OFFER_CAP) : 0
  };
  const prize = await checkoutPrize(env, auth, prizeCart.itemsCents, prizeCart.shippingCents);
  const prizeApplied = !!prize && !!(payload.order.totals && payload.order.totals.usePrize === true);
  if (prizeApplied) {
    if (prize.kind === 'shipping') shippingAmount = Math.max(0, shippingAmount - prize.creditCents);
    else discounts.push({ uid: 'evb-prize', name: prizeName(prize), amount_money: money(prize.creditCents), scope: 'ORDER' });
  }

  // NY taxes shipping on taxable goods (TB-ST-838). With both kinds in the
  // bag, the shipping is split by value and each part stated on its own:
  // the taxable goods' share is taxed, the rest isn't.
  const taxedShipping = subtotal > 0 ? Math.round(shippingAmount * taxableSubtotal / subtotal) : 0;
  const serviceCharges = [];
  if (taxedShipping > 0) {
    serviceCharges.push({
      uid: 'shipping',
      name: rate.label,
      amount_money: money(taxedShipping),
      calculation_phase: 'SUBTOTAL_PHASE',
      taxable: true,
      applied_taxes: [{ tax_uid: 'sales-tax' }]
    });
  }
  if (shippingAmount - taxedShipping > 0) {
    serviceCharges.push({
      uid: 'shipping-exempt',
      name: taxedShipping > 0 ? rate.label + ' (tax-free items)' : rate.label,
      amount_money: money(shippingAmount - taxedShipping),
      calculation_phase: 'SUBTOTAL_PHASE',
      taxable: false
    });
  }

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

  return { welcomeEmail, prize, prizeApplied, prizeCart, memberCode, order: {
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

// Checkout asks about the one code a buyer typed, so the list never has to
// reach the browser. PROMO_LIMITER (10 a minute per visitor) stops anyone
// using this to guess codes; without the binding it isn't limited.
async function handlePromo(request, env, origin) {
  if (env.PROMO_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') || 'anon';
    try {
      const { success } = await env.PROMO_LIMITER.limit({ key });
      if (!success) return json({ error: 'Too many tries. Wait a minute and try again.' }, 429, origin);
    } catch (e) { }
  }
  const body = await request.json().catch(() => ({}));
  const code = String((body && body.code) || '').trim().toUpperCase().slice(0, 40);
  const rule = promoRule(env, code);
  if (!rule) return json({ error: 'That code is not valid.' }, 404, origin);
  // A game prize: only for the signed-in member who won it (the bag and
  // checkout send their session).
  if (rule.member) {
    await memberCodeCheck(env, await sessionEmail(env, request.headers.get('Authorization')), code);
  }

  const dollars = c => '$' + (c % 100 ? (c / 100).toFixed(2) : c / 100);
  const label = rule.label ||
    (rule.type === 'percent' ? rule.value + '% off your order'
      : rule.type === 'fixed' ? dollars(rule.value) + ' off ' + (rule.minSubtotal ? 'orders over ' + dollars(rule.minSubtotal) : 'your order')
      : 'Free standard shipping, up to ' + dollars(SHIPPING_OFFER_CAP));
  return json({
    code,
    rule: { type: rule.type, value: rule.value || 0, minSubtotal: rule.minSubtotal || 0, label }
  }, 200, origin);
}

async function handleQuote(request, env, origin) {
  const payload = await request.json();
  if (!payload || !payload.order) return json({ error: 'Malformed request.' }, 400, origin);

  asMember(payload, await checkMember(request, env, payload));
  const built = await buildSquareOrder(env, payload, request.headers.get('Authorization'));
  const calc = await square(env, '/v2/orders/calculate', 'POST', { order: built.order });
  const o = calc.order || {};
  const amount = m => (m && m.amount) || 0;

  return json({
    total: amount(o.total_money),
    subtotal: (o.line_items || []).reduce((n, li) => n + amount(li.gross_sales_money), 0),
    discount: amount(o.total_discount_money),
    shipping: amount(o.total_service_charge_money),
    tax: amount(o.total_tax_money),
    welcomeShipping: !!built.welcomeEmail,
    // Sent even when they chose to save their points, so checkout can offer it.
    prize: built.prize ? Object.assign({ name: prizeName(built.prize) }, built.prize) : null,
    prizeApplied: built.prizeApplied
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

  asMember(payload, await checkMember(request, env, payload));
  const auth = request.headers.get('Authorization');
  const built = await buildSquareOrder(env, payload, auth);

  // The total they agreed to had a prize on it, or didn't. If their points
  // changed since (spent on another order, or lapsed), show the new total
  // before anything is held.
  const sawPrize = String((payload.order.totals && payload.order.totals.prizeCode) || '');
  const nowPrize = built.prizeApplied ? built.prize.code : '';
  if (sawPrize !== nowPrize) {
    throw shout('Your points changed since you started checking out, so your total did too. Check the new total and place your order again. Nothing was charged.', 409);
  }

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

  // A HOLD, not a charge (panel migration 0076). Every piece is one of a
  // kind and can sell in the shop or on eBay first, so the shop checks the
  // shelf and accepts the order in the panel — which charges the card — or
  // declines it and the hold is released. Square lets an unanswered hold go
  // after 7 days (the default for an online payment).
  const paid = await square(env, '/v2/payments', 'POST', {
    idempotency_key: payload.idempotencyKey,
    source_id: payload.sourceId,
    verification_token: payload.verificationToken || undefined,
    amount_money: sqOrder.total_money,
    order_id: sqOrder.id,
    location_id: env.SQUARE_LOCATION_ID,
    autocomplete: false,
    buyer_email_address: (payload.order.customer && payload.order.customer.email) || undefined,
    note: 'eastvillagebuyers.com ' + payload.order.id,
    reference_id: String(payload.order.id).slice(0, 40)
  });

  const p = paid.payment || {};
  const card = (p.card_details && p.card_details.card) || {};
  const claimed = payload.order.payment && payload.order.payment.method;
  const via = ['Apple Pay', 'Google Pay', 'Cash App Pay', 'Afterpay'].indexOf(claimed) !== -1 ? claimed : 'Square';
  // APPROVED: the hold went through. COMPLETED only if Square charged anyway.
  const placed = p.status === 'APPROVED' || p.status === 'COMPLETED';

  // Spend the points now the card is held. If they can't be (used on another
  // order a moment ago), the order can't stand at this price: let go of the
  // hold and say so. Nothing is stored, so trying again starts fresh.
  if (placed && built.prizeApplied) {
    const claim = await memberRpc(env, auth, 'member_claim_checkout_prize', {
      p_prize: built.prize.code,
      p_square_order: sqOrder.id,
      p_reference: String(payload.order.id || '').slice(0, 40),
      p_items_cents: built.prizeCart.itemsCents,
      p_shipping_cents: built.prizeCart.shippingCents
    });
    if (!claim.ok) {
      console.error('[evb-square] prize claim failed', sqOrder.id, claim.message);
      await undoPayment(env, p, payload.idempotencyKey);
      throw shout('Your points changed while you were checking out, so we couldn’t take your prize off. Nothing was charged — go back and place your order again to see the new total.', 409);
    }
  }

  // A game prize code is spent with the order that used it (given back if
  // the shop declines the order: handleOrderStatus).
  if (placed && built.memberCode) {
    await markGameCode(env, normEmail(payload.order.customer && payload.order.customer.email), payload.order.id, true)
      .catch(err => console.error('[evb-square] could not mark the game code used', payload.order.id, err.message));
  }

  if (built.welcomeEmail && placed) {
    const sub = await getSubscriber(env, built.welcomeEmail);
    if (sub) {
      await env.SUBSCRIBERS.put('sub:' + built.welcomeEmail, '1', { metadata: Object.assign({}, sub, { r: Date.now() }) });
    }
  }

  const receipt = Object.assign({}, payload.order, {
    status: p.status === 'COMPLETED' ? 'PAID' : p.status === 'APPROVED' ? 'ON_HOLD' : (p.status || 'PENDING'),
    squareOrderId: sqOrder.id,
    squarePaymentId: p.id,
    receiptUrl: p.receipt_url || null,
    holdUntil: p.status === 'APPROVED' ? (p.delayed_until || null) : null,
    // The points prize that came off (panel 0079), for the receipt page.
    prize: placed && built.prizeApplied ? {
      code: built.prize.code, name: prizeName(built.prize), kind: built.prize.kind,
      points: built.prize.points, creditCents: built.prize.creditCents
    } : null,
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

  // Confirmation email with the order-status link. Never allowed to fail the
  // order: the card has already been charged by this point.
  if (p.status === 'COMPLETED') {
    const mail = sendOrderEmail(env, receipt)
      .then(result => markEmailed(env, receipt, result))
      .catch(err => console.error('[evb-square] confirmation email', receipt.id, err.message));
    if (ctx && typeof ctx.waitUntil === 'function') {
      // Tell the page what to claim without making the buyer wait on Resend.
      receipt.emailStatus = env.RESEND_API_KEY ? 'queued' : 'not-configured';
      ctx.waitUntil(mail);
    } else {
      await mail;
    }
  }

  // The panel copies the order in (and emails the customer) — a held one too,
  // so it's waiting in Orders for someone to accept.
  if (placed && env.PANEL_API_KEY) {
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

/* ===========================================================================
   Order confirmation email
   ---------------------------------------------------------------------------
   Sends the buyer a confirmation carrying the link to their order status page,
   the same page the receipt screen shows. Sent through Resend.

   Setup (one time):
     1. resend.com -> add and verify the domain eastvillagebuyers.com
     2. Worker -> Settings -> Variables and Secrets:
          RESEND_API_KEY   type Secret   (starts re_...)
          ORDER_FROM       type Text     optional, defaults below
          ORDER_BCC        type Text     optional, a copy to the shop

   Until RESEND_API_KEY is set, nothing is sent and orders still complete
   normally. Sending never blocks or fails a paid order: the money has already
   moved, so a mail outage must not turn a successful payment into an error.
=========================================================================== */

const MAIL_FROM_DEFAULT = 'East Village Buyers <orders@eastvillagebuyers.com>';
const SITE_URL = 'https://eastvillagebuyers.com';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtMoney(cents) {
  const n = Math.abs(Math.round(Number(cents) || 0)) / 100;
  return (Number(cents) < 0 ? '-' : '') + '$' +
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function orderUrl(order) {
  return SITE_URL + '/store/order/?id=' + encodeURIComponent(order.id);
}

/** Plain-text part, so the mail is readable anywhere and scores better on spam. */
function orderEmailText(order) {
  const t = order.totals || {};
  const pickup = order.fulfillment && order.fulfillment.type === 'PICKUP';
  const lines = (order.lineItems || []).map(
    l => '  - ' + l.name + (l.variant ? ' (' + l.variant + ')' : '') +
         '  x' + l.quantity + '  ' + fmtMoney(l.total));

  return [
    'Thanks ' + ((order.customer && order.customer.firstName) || '') + ' - we have your order.',
    '',
    'Order ' + order.id,
    'Track it here: ' + orderUrl(order),
    '',
    'Items:',
    lines.join('\n'),
    '',
    'Subtotal  ' + fmtMoney(t.subtotal),
    (t.discount ? 'Discount  -' + fmtMoney(t.discount) : null),
    (pickup ? 'Pickup    Free' : 'Shipping  ' + (t.shipping ? fmtMoney(t.shipping) : 'Free')),
    'Tax       ' + fmtMoney(t.tax),
    'Total     ' + fmtMoney(t.total),
    '',
    pickup
      ? 'Collect at 39 Avenue A, New York, NY 10009. We will email you when it is ready. Bring photo ID matching the name on the order.'
      : 'We will send tracking as soon as it ships. Shipments are insured and need a signature.',
    '',
    'Questions? Call or text 917-608-8939.',
    'East Village Buyers - 39 Avenue A, New York, NY 10009'
  ].filter(Boolean).join('\n');
}

function orderEmailHtml(order) {
  const t = order.totals || {};
  const pickup = order.fulfillment && order.fulfillment.type === 'PICKUP';
  const url = orderUrl(order);

  const rows = (order.lineItems || []).map(l => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;font:14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
        ${esc(l.name)}${l.variant ? `<span style="color:#777"> &middot; ${esc(l.variant)}</span>` : ''}
        <span style="color:#777"> &times;${esc(l.quantity)}</span>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font:600 14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;white-space:nowrap">
        ${fmtMoney(l.total)}
      </td>
    </tr>`).join('');

  const totalRow = (label, value, strong) => `
    <tr>
      <td style="padding:4px 0;font:${strong ? '800 15px' : '14px'} -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${strong ? '#111' : '#555'}">${esc(label)}</td>
      <td align="right" style="padding:4px 0;font:${strong ? '800 15px' : '14px'} -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;white-space:nowrap">${esc(value)}</td>
    </tr>`;

  const addr = (!pickup && order.fulfillment && order.fulfillment.address) || null;

  return `<!doctype html><html><body style="margin:0;background:#f8f5f0;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e1d8;border-radius:12px;overflow:hidden">
    <tr><td style="height:5px;background:#f97316"></td></tr>
    <tr><td style="padding:26px 26px 0">
      <p style="margin:0 0 6px;font:800 10px -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#f97316">Order confirmed</p>
      <h1 style="margin:0 0 10px;font:900 22px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;letter-spacing:-.02em">Thanks${order.customer && order.customer.firstName ? ', ' + esc(order.customer.firstName) : ''}.</h1>
      <p style="margin:0 0 20px;font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#555">
        We have your order. Use the link below any time to check its status.
      </p>
      <p style="margin:0 0 22px">
        <a href="${esc(url)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font:800 12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:14px 24px;border-radius:9px">Track your order</a>
      </p>
      <p style="margin:0 0 22px;font:13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#777">
        Order <strong style="color:#111">${esc(order.id)}</strong><br>
        <a href="${esc(url)}" style="color:#ea580c;word-break:break-all">${esc(url)}</a>
      </p>
    </td></tr>
    <tr><td style="padding:0 26px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">
        ${totalRow('Subtotal', fmtMoney(t.subtotal))}
        ${t.discount ? totalRow('Discount' + (t.promoCode ? ' (' + t.promoCode + ')' : ''), '-' + fmtMoney(t.discount)) : ''}
        ${totalRow(pickup ? 'In-store pickup' : 'Shipping', t.shipping ? fmtMoney(t.shipping) : 'Free')}
        ${totalRow('Sales tax', fmtMoney(t.tax))}
        ${totalRow('Total paid', fmtMoney(t.total), true)}
      </table>
    </td></tr>
    <tr><td style="padding:22px 26px 26px">
      <div style="background:#f8f5f0;border-radius:9px;padding:16px">
        <p style="margin:0 0 6px;font:800 10px -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#777">${pickup ? 'Collection' : 'Shipping to'}</p>
        <p style="margin:0;font:14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
          ${pickup
            ? '39 Avenue A, New York, NY 10009<br><span style="color:#555">We will email you when it is ready. Bring photo ID matching the name on the order.</span>'
            : (addr ? [addr.name, addr.line1, addr.line2, (addr.city || '') + ', ' + (addr.region || '') + ' ' + (addr.postal || '')]
                        .filter(Boolean).map(esc).join('<br>') +
                      '<br><span style="color:#555">Tracking follows as soon as it ships. Insured, signature on delivery.</span>'
                    : '<span style="color:#555">Tracking follows as soon as it ships.</span>')}
        </p>
      </div>
      <p style="margin:18px 0 0;font:13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#777">
        Questions? Call or text <a href="tel:9176088939" style="color:#ea580c;text-decoration:none">917-608-8939</a>.<br>
        East Village Buyers &middot; 39 Avenue A, New York, NY 10009
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Send the confirmation. Resolves to a short status string rather than
 * throwing, because every caller is on a path where the payment already
 * succeeded and must not be rolled back by a mail problem.
 */
async function sendOrderEmail(env, order) {
  const to = order.customer && order.customer.email;
  if (!to) return 'no-address';
  if (!env.RESEND_API_KEY) return 'not-configured';

  const body = {
    from: env.ORDER_FROM || MAIL_FROM_DEFAULT,
    to: [to],
    subject: 'Order ' + order.id + ' confirmed - East Village Buyers',
    html: orderEmailHtml(order),
    text: orderEmailText(order),
    reply_to: 'help@eastvillagebuyers.com'
  };
  if (env.ORDER_BCC) body.bcc = [env.ORDER_BCC];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[evb-square] order email failed', order.id, res.status, detail.slice(0, 300));
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[evb-square] order email error', order.id, err.message);
    return 'failed';
  }
}

/**
 * Record on the stored order whether the mail went out, so the receipt page
 * only claims an email is coming when one actually is, and so a later resend
 * can tell which orders were missed.
 */
async function markEmailed(env, order, result) {
  order.emailStatus = result;
  order.emailedAt = result === 'sent' ? new Date().toISOString() : null;
  if (env.ORDERS) {
    try {
      await env.ORDERS.put('order:' + order.id, JSON.stringify(order),
        { expirationTtl: 60 * 60 * 24 * 365 });
    } catch (err) {
      console.error('[evb-square] could not record email status', order.id, err.message);
    }
  }
  return order;
}

/* ===========================================================================
   Welcome game prizes
   ---------------------------------------------------------------------------
   POST /game-draw: the Worker, not the browser, picks what the box holds
   (GAME_PRIZES, even odds) and answers { prize, ticket }, the ticket signed
   (HMAC, gameTicketKey) so nobody can make one up. One visitor network gets
   the same prize all day (gamedraw:<ip>, a day), so replaying the game in a
   private window doesn't reroll it.

   POST /game-email {ticket} (or {code} for a prize that needs no ticket),
   with the member's Supabase session as a Bearer token. evb-spin.js calls it
   once a prize is theirs (they won it signed in, or made an account to
   unlock it). The address comes from Supabase, never from the request, so
   nobody can use this to mail a stranger. GIFT5 (ticket: true) is recorded
   only from a ticket, and a ticket goes on one account only
   (gameticket:<nonce>), so typing GIFT5 or sharing a ticket gets nobody $5
   (the owner, 2026-11-23).

   It records the prize (SUBSCRIBERS: gameprize:<email>, metadata
   { e, c: prize, t: won at, u: used at, o: order, r: reminders sent }); the
   first prize an account wins is the one it keeps. Then it emails a code
   prize, once per account (game:<email>). Points prizes (PTS120, PTS150) go
   on the member's balance in Supabase (panel 0101) and get no email here.

   GIFT5 lasts GAME_CODE_DAYS from the win and works once, on that account
   (the owner, 2026-11-23); scheduled() emails a reminder GAME_REMIND_DAYS
   before it runs out. Mail goes through Resend with the same RESEND_API_KEY
   as order confirmations; without it nothing is sent and nothing is marked
   sent, so it all starts once the key is set. GAME_FROM (Text, optional)
   replaces the sender below.
=========================================================================== */

const GAME_FROM_DEFAULT = 'East Village Buyers <rewards@eastvillagebuyers.com>';
const GAME_PRIZES = {
  SPIN120: { name: 'free shipping', headline: 'Free shipping is yours', detail: 'Free standard shipping on your first order over $120.' },
  GIFT5: { name: '$5 off', headline: '$5 off is yours', detail: '$5 off your order, any amount.', expires: true, ticket: true },
  PTS120: { name: '120 points', points: 120 },
  PTS150: { name: '150 points', points: 150 }
};
const GAME_CODE_DAYS = 30;
const GAME_REMIND_DAYS = [14, 7, 2];
const GAME_REMIND_PER_RUN = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
// A locked prize can wait this long for its winner to make an account.
const GAME_TICKET_DAYS = 60;

function gameExpiry(meta) { return (Number(meta.t) || 0) + GAME_CODE_DAYS * DAY_MS; }

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// The ticket signing key: GAME_SECRET if set, else one made from the panel
// key (already a secret here), so it needs no new setting. null: no draws.
async function gameTicketKey(env) {
  const raw = env.GAME_SECRET || (env.PANEL_API_KEY && env.PANEL_API_KEY.length >= 32 ? 'evb-game-ticket:' + env.PANEL_API_KEY : '');
  if (!raw) return null;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signTicket(key, data) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(data)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return body + '.' + b64url(sig);
}

// { p: prize, t: drawn at, n: nonce } from a ticket this Worker signed and
// that is still in date; null for anything else.
async function readTicket(env, ticket) {
  const m = /^([A-Za-z0-9_-]{10,400})\.([A-Za-z0-9_-]{20,100})$/.exec(String(ticket || ''));
  if (!m) return null;
  const key = await gameTicketKey(env);
  if (!key) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', key, unb64url(m[2]), new TextEncoder().encode(m[1]));
  } catch (e) { return null; }
  if (!ok) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(unb64url(m[1]))); } catch (e) { return null; }
  if (!data || !GAME_PRIZES[data.p] || typeof data.n !== 'string') return null;
  if (!(Date.now() - Number(data.t) < GAME_TICKET_DAYS * DAY_MS)) return null;
  return data;
}

async function handleGameDraw(request, env, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  if (env.PROMO_LIMITER) {
    try {
      const { success } = await env.PROMO_LIMITER.limit({ key: 'draw:' + ip });
      if (!success) return json({ error: 'Too many tries. Wait a minute and try again.' }, 429, origin);
    } catch (e) { }
  }
  const key = await gameTicketKey(env);
  if (!key) return json({ error: 'The game isn’t set up.' }, 503, origin);

  const ids = Object.keys(GAME_PRIZES);
  let prize = null;
  const dayKey = 'gamedraw:' + ip;
  if (env.SUBSCRIBERS) prize = await env.SUBSCRIBERS.get(dayKey).catch(() => null);
  if (!GAME_PRIZES[prize]) {
    // Four prizes divide 2^32 evenly, so the odds are exactly even.
    prize = ids[crypto.getRandomValues(new Uint32Array(1))[0] % ids.length];
    if (env.SUBSCRIBERS) await env.SUBSCRIBERS.put(dayKey, prize, { expirationTtl: 86400 }).catch(() => {});
  }
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const ticket = await signTicket(key, { p: prize, t: Date.now(), n: nonce });
  return json({ prize, ticket }, 200, origin);
}
function nyDay(ms) {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' });
}

async function readGamePrize(env, email) {
  if (!env.SUBSCRIBERS || !email) return null;
  const got = await env.SUBSCRIBERS.getWithMetadata('gameprize:' + email);
  return got && got.value !== null ? (got.metadata || {}) : null;
}

function writeGamePrize(env, email, meta) {
  return env.SUBSCRIBERS.put('gameprize:' + email, '1', { metadata: meta });
}

// The email address of the session in a Bearer header, from Supabase itself;
// null when there is no session.
async function sessionEmail(env, auth) {
  if (!/^Bearer\s+\S{20,}$/.test(auth || '')) return null;
  const base = (env.SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/+$/, '');
  const res = await fetch(base + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_DEFAULT, Authorization: auth }
  });
  if (res.status === 401 || res.status === 403) throw shout('Your sign-in expired. Sign in again to use this code.', 401);
  if (!res.ok) {
    console.error('[evb-square] session lookup failed', res.status);
    throw shout('We couldn’t check your account just now. Try again in a minute.', 503);
  }
  const user = await res.json().catch(() => null);
  const email = normEmail(user && user.email);
  return RE_EMAIL.test(email) ? email : null;
}

// Whether this member may use a game prize code now; throws what checkout
// shows when not. Only an account the game recorded as winning it may.
async function memberCodeCheck(env, email, code) {
  const prize = GAME_PRIZES[code] || { name: code };
  if (!email) throw shout('Sign in to use ' + code + '. It works only on the account that won it.', 401);
  if (!env.SUBSCRIBERS) throw shout('We couldn’t check this code just now. Try again in a minute.', 503);
  const meta = await readGamePrize(env, email);
  if (!meta) throw shout(code + ' is a mystery box prize, and it works only on the account that won it.', 409);
  if (meta.c !== code) throw shout(code + ' isn’t the mystery box prize on your account.', 409);
  if (meta.u) throw shout('You already used your ' + prize.name + ' code on an earlier order.', 409);
  if (Date.now() > gameExpiry(meta)) {
    throw shout('Your ' + prize.name + ' code ran out on ' + nyDay(gameExpiry(meta)) + '. Remove it to keep checking out.', 409);
  }
  return meta;
}

// Spends (used true) or gives back the member's game code for an order.
async function markGameCode(env, email, orderId, used) {
  const meta = await readGamePrize(env, email);
  if (!meta) return;
  if (used) await writeGamePrize(env, email, Object.assign({}, meta, { u: Date.now(), o: String(orderId || '').slice(0, 40) }));
  else if (meta.u && meta.o === String(orderId || '').slice(0, 40)) {
    const back = Object.assign({}, meta);
    delete back.u;
    delete back.o;
    await writeGamePrize(env, email, back);
  }
}

function gameEmailText(code, m) {
  return [
    m.headline + '.',
    '',
    m.detail,
    '',
    'Your code: ' + code,
    '',
    m.note,
    'Shop the store: ' + SITE_URL + '/store/',
    '',
    'Questions? Call or text 917-608-8939.',
    'East Village Buyers - 39 Avenue A, New York, NY 10009'
  ].join('\n');
}

function gameEmailHtml(code, m) {
  const font = '-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  return `<!doctype html><html><body style="margin:0;background:#f8f5f0;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e1d8;border-radius:12px;overflow:hidden">
    <tr><td style="height:5px;background:#f97316"></td></tr>
    <tr><td style="padding:26px 26px 8px">
      <p style="margin:0 0 6px;font:800 10px ${font};letter-spacing:.18em;text-transform:uppercase;color:#f97316">${esc(m.kicker)}</p>
      <h1 style="margin:0 0 10px;font:900 24px ${font};color:#111;letter-spacing:-.02em">${esc(m.headline)}</h1>
      <p style="margin:0 0 20px;font:15px/1.6 ${font};color:#555">${esc(m.detail)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff1e6;border-radius:12px">
        <tr><td style="padding:16px 20px">
          <p style="margin:0 0 4px;font:600 12px ${font};color:#7a5a45">Your code</p>
          <p style="margin:0;font:900 26px ${font};letter-spacing:.1em;color:#1f1b16">${esc(code)}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 22px;font:14px/1.6 ${font};color:#555">${esc(m.note)}</p>
      <p style="margin:0 0 24px">
        <a href="${SITE_URL}/store/" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font:800 12px ${font};letter-spacing:.06em;text-transform:uppercase;padding:14px 24px;border-radius:999px">Shop the store</a>
      </p>
    </td></tr>
    <tr><td style="padding:0 26px 26px">
      <p style="margin:0;font:13px/1.6 ${font};color:#777">
        Questions? Call or text <a href="tel:9176088939" style="color:#ea580c;text-decoration:none">917-608-8939</a>.<br>
        East Village Buyers &middot; 39 Avenue A, New York, NY 10009
      </p>
    </td></tr>
  </table>
</body></html>`;
}

// Resolves true once Resend has taken it.
async function sendGameMail(env, email, subject, code, m) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.GAME_FROM || GAME_FROM_DEFAULT,
        to: [email],
        subject,
        html: gameEmailHtml(code, m),
        text: gameEmailText(code, m),
        reply_to: 'help@eastvillagebuyers.com'
      })
    });
    if (sent.ok) return true;
    console.error('[evb-square] game email failed', sent.status, (await sent.text().catch(() => '')).slice(0, 300));
  } catch (err) {
    console.error('[evb-square] game email error', err.message);
  }
  return false;
}

async function handleGameEmail(request, env, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);
  if (env.PROMO_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    try {
      const { success } = await env.PROMO_LIMITER.limit({ key: 'mail:' + ip });
      if (!success) return json({ error: 'Too many tries. Wait a minute and try again.' }, 429, origin);
    } catch (e) { }
  }
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S{20,}$/.test(auth)) return json({ error: 'Sign in first.' }, 401, origin);

  const body = await request.json().catch(() => ({})) || {};
  let code = String(body.code || '').trim().toUpperCase().slice(0, 40);
  let ticket = null;
  if (body.ticket) {
    ticket = await readTicket(env, body.ticket);
    if (!ticket) return json({ error: 'That prize ticket isn’t valid.' }, 400, origin);
    code = ticket.p;
  }
  const prize = GAME_PRIZES[code];
  if (!prize) return json({ error: 'That is not a game prize.' }, 400, origin);
  if (prize.ticket && !ticket) return json({ error: code + ' can only be won in the game.' }, 400, origin);

  let email;
  try {
    email = await sessionEmail(env, auth);
  } catch (err) {
    return json({ error: err.message }, err.status || 502, origin);
  }
  if (!email) return json({ error: 'This account has no email address.' }, 400, origin);

  // A ticket goes on the first account that brings it, and no other.
  if (ticket && env.SUBSCRIBERS) {
    const tkey = 'gameticket:' + ticket.n;
    const owner = await env.SUBSCRIBERS.get(tkey);
    if (owner && owner !== email) return json({ error: 'This prize was already collected on another account.' }, 409, origin);
    if (!owner) await env.SUBSCRIBERS.put(tkey, email, { expirationTtl: (GAME_TICKET_DAYS + 1) * 86400 });
  }

  // The first prize an account wins is the one it keeps.
  let meta = await readGamePrize(env, email).catch(() => null);
  if (!meta && env.SUBSCRIBERS) {
    meta = { e: email, c: code, t: Date.now() };
    await writeGamePrize(env, email, meta).catch(() => {});
  }
  const kept = meta && GAME_PRIZES[meta.c] ? meta.c : code;
  const expiresAt = GAME_PRIZES[kept].expires && meta ? gameExpiry(meta) : null;
  const out = { ok: true, recorded: !!meta, code: kept, expiresAt };
  if (GAME_PRIZES[kept].points) return json(out, 200, origin);

  // One prize email per account.
  const key = 'game:' + email;
  if (env.SUBSCRIBERS) {
    const had = await env.SUBSCRIBERS.getWithMetadata(key).catch(() => null);
    if (had && had.metadata && had.metadata.s === 'sent') return json(Object.assign(out, { already: true }), 200, origin);
  }
  if (!env.RESEND_API_KEY) return json(Object.assign(out, { sent: false, status: 'not-configured' }), 200, origin);

  const p = GAME_PRIZES[kept];
  const sent = await sendGameMail(env, email, 'Your East Village Buyers code: ' + kept, kept, {
    kicker: 'Your welcome gift',
    headline: p.headline,
    detail: p.detail + (expiresAt ? ' Use it by ' + nyDay(expiresAt) + '.' : ''),
    note: 'It’s already in your bag on the device you played on. On any other device, enter it at checkout while signed in.'
  });
  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(key, '1', { metadata: { e: email, c: kept, t: Date.now(), s: sent ? 'sent' : 'failed' } }).catch(() => {});
  }
  if (!sent) return json({ error: 'We could not send the email just now.', status: 'failed' }, 502, origin);
  return json(Object.assign(out, { sent: true }), 200, origin);
}

// Daily (the cron trigger): a reminder to each member whose GIFT5 is still
// unused, when GAME_REMIND_DAYS or fewer days are left. Each step is sent
// once; one that was missed is folded into the next.
async function sendGameReminders(env) {
  if (!env.RESEND_API_KEY || !env.SUBSCRIBERS) return 0;
  let cursor;
  let sent = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: 'gameprize:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      const prize = GAME_PRIZES[m.c];
      if (!prize || !prize.expires || m.u || !m.t) continue;
      const end = gameExpiry(m);
      const left = Math.ceil((end - Date.now()) / DAY_MS);
      if (left <= 0) continue;
      const done = String(m.r || '').split(',').filter(Boolean);
      const due = GAME_REMIND_DAYS.filter(d => left <= d && done.indexOf(String(d)) === -1);
      if (!due.length) continue;
      if (sent >= GAME_REMIND_PER_RUN) return sent;

      const email = m.e || k.name.slice('gameprize:'.length);
      const last = left <= 2;
      const ok = await sendGameMail(env, email,
        last ? 'Last chance: your $5 off ends ' + nyDay(end) : 'Your $5 off ends in ' + left + ' days', m.c, {
          kicker: 'Your mystery box prize',
          headline: last ? 'Last chance for your $5 off' : 'Your $5 off ends in ' + left + ' days',
          detail: 'Use code ' + m.c + ' by ' + nyDay(end) + ' for $5 off any order in the store.',
          note: 'It works on your account only, once. Enter it at checkout while signed in.'
        });
      sent++;
      if (ok) {
        await writeGamePrize(env, email, Object.assign({}, m, { r: done.concat(due.map(String)).join(',') }))
          .catch(err => console.error('[evb-square] reminder mark failed', err.message));
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return sent;
}

/**
 * POST /orders/:id/resend  — re-send the confirmation for an order that
 * already exists. Authenticated with the panel key, so it cannot be used to
 * mail someone repeatedly from the open internet. Used to reach the customers
 * who ordered before confirmation emails existed.
 */
async function handleResendOrderEmail(request, env, id, origin) {
  const auth = request.headers.get('Authorization') || '';
  if (!env.PANEL_API_KEY || auth !== 'Bearer ' + env.PANEL_API_KEY) {
    return json({ error: 'Not authorized.' }, 401, origin);
  }
  if (!env.ORDERS) return json({ error: 'Order lookup is not configured.' }, 404, origin);

  const raw = await env.ORDERS.get('order:' + id);
  if (!raw) return json({ error: 'Order not found.' }, 404, origin);

  const order = JSON.parse(raw);
  const result = await sendOrderEmail(env, order);
  await markEmailed(env, order, result);
  return json({
    id: order.id,
    to: order.customer && order.customer.email,
    emailStatus: result,
    trackUrl: orderUrl(order)
  }, result === 'sent' ? 200 : 502, origin);
}

/**
 * POST /orders/:id/status — the panel accepted or declined a held order
 * (0076), so the receipt saved here at checkout stops saying "on hold".
 * Authenticated with the panel key, like /resend.
 */
async function handleOrderStatus(request, env, id, origin) {
  if (!(await isAdmin(request, env))) return json({ error: 'Not authorized.' }, 401, origin);
  if (!env.ORDERS) return json({ error: 'Order lookup is not configured.' }, 404, origin);
  const body = await request.json().catch(() => ({}));
  if (body.status !== 'PAID' && body.status !== 'CANCELLED') return json({ error: 'Unknown status.' }, 400, origin);

  const raw = await env.ORDERS.get('order:' + id);
  if (!raw) return json({ error: 'Order not found.' }, 404, origin);
  const order = JSON.parse(raw);
  order.status = body.status;
  order.holdUntil = null;
  if (order.payment) order.payment.status = body.status === 'PAID' ? 'COMPLETED' : 'CANCELED';
  await env.ORDERS.put('order:' + id, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 365 });
  // A declined order gives its game prize code back.
  const used = promoRule(env, String((order.totals && order.totals.promoCode) || '').toUpperCase());
  if (body.status === 'CANCELLED' && used && used.member) {
    await markGameCode(env, normEmail(order.customer && order.customer.email), order.id, false)
      .catch(err => console.error('[evb-square] could not give the game code back', order.id, err.message));
  }
  return json({ id: order.id, status: order.status }, 200, origin);
}

export default {
  // The daily cron trigger: mystery box reminders.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendGameReminders(env)
      .then(n => { if (n) console.log('[evb-square] game reminders sent', n); })
      .catch(err => console.error('[evb-square] game reminders', err.message)));
  },

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
        ordersKv: !!env.ORDERS,
        email: !!env.RESEND_API_KEY
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

    if (path === '/game-draw') {
      if (request.method !== 'POST') return json({ error: 'Not found.' }, 404, origin);
      try {
        return await handleGameDraw(request, env, origin);
      } catch (err) {
        console.error('[evb-square] game draw', err.message);
        return json({ error: 'Something went wrong. Please try again.' }, 500, origin);
      }
    }

    if (path === '/game-email') {
      if (request.method !== 'POST') return json({ error: 'Not found.' }, 404, origin);
      try {
        return await handleGameEmail(request, env, origin);
      } catch (err) {
        console.error('[evb-square] game email', err.message);
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
      if (request.method === 'POST' && path === '/promo') {
        return await handlePromo(request, env, origin);
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
      const st = /^\/orders\/([A-Za-z0-9._-]{1,64})\/status$/.exec(path);
      if (request.method === 'POST' && st) {
        return await handleOrderStatus(request, env, st[1], origin);
      }
      const rs = /^\/orders\/([A-Za-z0-9._-]{1,64})\/resend$/.exec(path);
      if (request.method === 'POST' && rs) {
        return await handleResendOrderEmail(request, env, rs[1], origin);
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
      const safe = err.safe || declineCodes.indexOf(err.squareCode) !== -1 || status === 400 || status === 409;

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
