# Connecting the store to Square

The storefront is finished and running. It is in **demo mode** right now: the
catalog comes from `store-catalog.js`, and checkout completes locally without
taking a payment. Everything below switches it to live Square without touching
any of the UI.

Work through this in **sandbox** first. Sandbox and production have separate
tokens, locations and catalogs — nothing carries over between them.

---

## What is where

| File | Role |
|---|---|
| `/store/store-config.js` | The only file you edit to go live. Public values only. |
| `/store/store-catalog.js` | Product data + the Square → storefront mapper. |
| `/store/store-core.js` | Cart, totals, receipts, mini cart. |
| `/store/store-checkout.js` | Checkout flow, Square Web Payments SDK, order submit. |
| `/square-worker.js` | The backend. Deploy this to Cloudflare Workers. |

**The Square access token never goes in any file under `/store/`.** Those ship
to the browser and are readable with view-source. The token lives only as an
encrypted secret on the Worker.

---

## Step 1 — Square Developer account

1. Go to <https://developer.squareup.com/apps> and create an application.
2. Open the app → **Credentials**. Toggle to **Sandbox** and copy:
   - **Application ID** — starts with `sandbox-sq0idb-`
   - **Access token** — starts with `EAAA`
3. Open **Locations** and copy the **Location ID** (looks like `L8XY2Z9ABCDEF`).

---

## Step 2 — Deploy the Worker

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `evb-square`, deploy the default hello-world.
3. **Edit code** → delete everything → paste the whole of `/square-worker.js` → **Deploy**.
4. **Settings → Variables and Secrets** → add these three:

   | Name | Type | Value |
   |---|---|---|
   | `SQUARE_ACCESS_TOKEN` | Secret | the access token from Step 1 |
   | `SQUARE_LOCATION_ID` | Text | the location ID from Step 1 |
   | `SQUARE_ENVIRONMENT` | Text | `sandbox` (later `production`) |

5. Recommended, not required:
   - **Bindings → KV Namespace**, variable name `ORDERS`.
     Stores receipts so `/store/order/?id=…` works on any device. Without it
     the confirmation page falls back to the copy in the buyer's own browser,
     which is fine but device-specific.
   - **Bindings → Rate Limiting**, variable name `RATE_LIMITER`, e.g. 30
     requests per 60 seconds. If the binding is missing the check is skipped —
     it fails open, so deploying without it is safe.

6. Copy the Worker URL, e.g. `https://evb-square.yourname.workers.dev`.

Check it works — this should return JSON and needs no auth:

```bash
curl https://evb-square.yourname.workers.dev/health
```

Expect `{"ok":true,"environment":"sandbox","configured":true,"ordersKv":true}`.
If `configured` is `false`, the variables in step 4 did not save.

---

## Step 3 — Point the storefront at it

Edit `/store/store-config.js` and fill in the four values at the top:

```js
apiBase: 'https://evb-square.yourname.workers.dev',   // no trailing slash
squareApplicationId: 'sandbox-sq0idb-XXXXXXXXXXXX',
squareLocationId: 'L8XY2Z9ABCDEF',
squareEnvironment: 'sandbox',
```

The moment `apiBase` is set, the storefront loads its catalog from Square and
the checkout swaps the demo card form for Square's real hosted card fields.
Nothing else changes.

---

## Step 4 — Load the catalog into Square

The storefront reads whatever is in your Square catalog. For each product,
in Square Dashboard → **Items**:

- **Name**, **Description**, **Price**, **Image** — used directly.
- **Variations** become the size / storage / length selector. Name them the way
  you want them displayed (`US 10`, `256 GB`, `22 in`).
- **Track inventory** — turn this on. Almost everything in this shop is
  one-of-one, and this is what makes an item show as *Last one* and then
  disappear when it sells.
- **Sellable / taxable** — leave taxable ON for everything except bullion.
  Gold and silver bullion must have **taxable OFF**; the storefront and the
  Worker both read this flag, and the tax is calculated from it.

### Optional custom attributes

Square has no native field for the extra things this storefront shows. Add
these as **custom attributes** on an item and they will be picked up
(see `fromSquare()` in `store-catalog.js`):

| Attribute name | Example | Shows as |
|---|---|---|
| `category` | `sneakers` | Which department it files under |
| `brand` | `Omega` | The orange brand line on the card |
| `condition` | `Pre-owned — Excellent` | Condition pill |
| `blurb` | short one-liner | Card subtitle |
| `compare_at` | `54500` (cents) | The struck-through "was" price |
| `details` | `Box included\|Serviced\|Authenticated` | Bullet list, `\|`-separated |
| `variant_label` | `Size` | Label above the variation buttons |
| `featured` | `true` | Puts it in the Featured rail |
| `tags` | `grail, swiss` | Improves search and "you might also like" |
| `slug` | `omega-seamaster-diver-300m` | The product URL |

Valid `category` values: `sneakers`, `watches`, `jewelry`, `gold`,
`streetwear`, `designer`, `electronics`, `collectibles`. To change that list,
edit `CATEGORIES` at the top of `store-catalog.js`.

Anything missing just falls back to a sensible default — a product with only a
name, price and image will still list and sell correctly.

---

## Step 5 — Place a sandbox test order

With `squareEnvironment: 'sandbox'`, use Square's test cards:

| Card | Result |
|---|---|
| `4111 1111 1111 1111` | Approved |
| `4000 0000 0000 0002` | Declined — check the error message renders |
| `4310 0000 0000 0055` | Triggers 3DS / SCA challenge |

Any future expiry, any CVV, postal code `10009`.

Confirm all of this before going live:

- [ ] `/store/` lists your real Square products, not the seed catalog
- [ ] A sold-out item shows **Sold** and cannot be added
- [ ] Bullion shows no sales tax; everything else does
- [ ] The declined card shows a readable error and does **not** clear the bag
- [ ] The approved card lands on `/store/order/?id=…` with a correct receipt
- [ ] The order appears in Square Dashboard → **Orders**, with the right
      fulfillment type (pickup vs shipment) and address
- [ ] Inventory in Square went down by one

---

## Step 6 — Go live

1. Square Developer Dashboard → **Credentials** → switch to **Production**.
2. In the Worker: update `SQUARE_ACCESS_TOKEN` (production token),
   `SQUARE_LOCATION_ID` (production location), and set
   `SQUARE_ENVIRONMENT` to `production`. Redeploy.
3. In `/store/store-config.js`: swap `squareApplicationId` for the production
   one (`sq0idp-…`), update `squareLocationId`, and set
   `squareEnvironment: 'production'`.
4. Place one real order with your own card for a cheap item, confirm the
   receipt and the Square dashboard entry, then refund it from Square.

---

## Things worth knowing

**Prices are decided by the server, not the browser.** The Worker re-reads
every price from the Square catalog and lets Square calculate the total, then
charges exactly that. Editing prices in devtools changes what the buyer *sees*,
never what they are *charged*.

**Payments are idempotent.** Every attempt carries an idempotency key, so a
double-click, a refresh mid-payment, or a retry after a dropped connection
cannot charge twice.

**Card details never reach this site.** In live mode Square's SDK renders the
card fields inside its own iframe and hands back a single-use token. In demo
mode the local form keeps only the brand and last four for the receipt and
discards the rest — it is still labelled *do not enter a real card*, because a
demo form has none of the protections a real one does.

**Tax.** `taxRate` in `store-config.js` (8.875%) drives the estimate shown
before checkout. Once Square is connected, Square's own calculation is
authoritative and is what appears on the receipt.

**Promo codes are defined twice on purpose** — in `store-config.js` for the
preview the buyer sees, and in `PROMO_CODES` in `square-worker.js` for the one
that actually applies. Keep them in sync, and remember only the Worker's copy
can grant a real discount.

**Shipping rates** live in `shippingRates` in `store-config.js` and
`SHIPPING_RATES` in `square-worker.js`. Same rule: keep both in sync.

**If Square goes down**, the storefront falls back to the seed catalog rather
than rendering an empty shop, and checkout surfaces the error with the shop
phone number instead of failing silently.
