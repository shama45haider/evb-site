/**
 * East Village Buyers — Catalog data layer
 * ---------------------------------------------------------------------------
 * Exposes window.EVB_CATALOG. Every store page calls EVB_CATALOG.load() and
 * awaits it; the promise resolves once products are available.
 *
 * Two sources, one shape:
 *   1. Square — when EVB_STORE_CONFIG.apiBase is set, GET {apiBase}/catalog
 *               returns Square CatalogObjects, which fromSquare() maps into the
 *               internal product shape below.
 *   2. Seed   — the inventory in this file. Used when Square is not configured,
 *               and as a fallback when the API call fails, so the storefront
 *               never renders empty.
 *
 * Internal product shape. Prices are ALWAYS integer cents, never floats:
 *   { id, slug, title, brand, category, condition, price, compareAt, images[],
 *     blurb, description, details[], variantLabel, variants[], taxable,
 *     featured, tags[], sku, squareItemId }
 * A variant is { id, label, price, stock, squareVariationId }. A null variant
 * price means "inherit the product price".
 */
(function () {
  'use strict';

  var CATEGORIES = [
    { id: 'sneakers',     label: 'Sneakers',       blurb: 'Deadstock and lightly worn pairs, legit-checked in house.' },
    { id: 'watches',      label: 'Watches',        blurb: 'Swiss and Japanese references, movements tested and running.' },
    { id: 'jewelry',      label: 'Jewelry',        blurb: 'Solid gold, sterling silver and signed designer pieces.' },
    { id: 'gold',         label: 'Gold & Bullion', blurb: 'Coins and bars priced against the live spot market.' },
    { id: 'streetwear',   label: 'Streetwear',     blurb: 'Chrome Hearts, Hellstar, MATTYBOY and NYC labels.' },
    { id: 'designer',     label: 'Designer',       blurb: 'Handbags, small leather goods and accessories.' },
    { id: 'electronics',  label: 'Electronics',    blurb: 'Apple, Sony and console hardware, wiped and tested.' },
    { id: 'collectibles', label: 'Collectibles',   blurb: 'Sealed TCG, vinyl figures and diecast.' }
  ];

  /* --- variant builders -------------------------------------------------- */

  // sizes([['9', 1], ['9.5', 2]]) -> [{ id:'us9', label:'US 9', stock:1 }, ...]
  function sizes(spec) {
    return spec.map(function (s) {
      return {
        id: String(s[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: /^\d/.test(String(s[0])) ? 'US ' + s[0] : String(s[0]),
        price: null, stock: s[1], squareVariationId: null
      };
    });
  }
  // apparel([['M', 2], ['L', 1]])
  function apparel(spec) {
    return spec.map(function (s) {
      return {
        id: String(s[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: String(s[0]), price: null, stock: s[1], squareVariationId: null
      };
    });
  }
  // Single-variant products: one-of-a-kind resale goods.
  function one(stock) {
    return [{ id: 'default', label: 'Default', price: null, stock: stock, squareVariationId: null }];
  }

  var PRODUCTS = [

    /* ============================== SNEAKERS ============================== */
    {
      id: 'evb-sn-001', slug: 'air-jordan-1-retro-high-og-obsidian',
      title: 'Air Jordan 1 Retro High OG "Obsidian"', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Excellent', price: 32000, compareAt: 38000,
      images: ['/jordan-1-high-obsidian-unc.webp'],
      blurb: 'The UNC-adjacent navy 1. Clean uppers, crisp swoosh.',
      description: 'A pair that has aged into a staple. Light creasing across the toe box, no separation at the midsole, and the sail panels have stayed bright. Legit-checked on the counter at 39 Avenue A before it went up.',
      details: ['Colorway: Sail / Obsidian / University Blue', 'Original box included', 'Original insoles and laces', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9', 1], ['9.5', 1], ['10', 2], ['11', 1]]),
      taxable: true, featured: true, tags: ['jordan', 'og', 'navy'], sku: 'SN-AJ1-OBS', squareItemId: null
    },
    {
      id: 'evb-sn-002', slug: 'air-jordan-1-low-fragment-travis-scott',
      title: 'Air Jordan 1 Low OG SP Fragment x Travis Scott', brand: 'Jordan', category: 'sneakers',
      condition: 'Deadstock', price: 148000, compareAt: null,
      images: ['/air-jordan-1-low-fragment-travis-scott.webp', '/travispink2.webp'],
      blurb: 'Triple-collab grail. Unworn, all original accessories.',
      description: 'The Fragment Design and Travis Scott collaboration on the Jordan 1 Low, deadstock. Verified against production markers and the stitching on the reversed swoosh.',
      details: ['Deadstock, never worn', 'Original box, extra laces, hangtag', 'Reversed swoosh with Fragment lightning branding', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['8.5', 1], ['9', 1], ['10.5', 1]]),
      taxable: true, featured: true, tags: ['grail', 'travis scott', 'fragment'], sku: 'SN-AJ1L-FRG', squareItemId: null
    },
    {
      id: 'evb-sn-003', slug: 'air-jordan-11-retro-gamma-blue',
      title: 'Air Jordan 11 Retro "Gamma Blue"', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Very Good', price: 24000, compareAt: 29500,
      images: ['/jordan-11-gamma-blue.webp'],
      blurb: 'Patent leather still glossy, icy outsole barely yellowed.',
      description: 'Gamma Blue 11s with the patent leather intact and no cracking at the flex point. Outsole shows light wear with minimal yellowing for the age.',
      details: ['Original box included', 'Patent leather uncracked', 'Light outsole wear', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9.5', 1], ['10', 1], ['12', 1]]),
      taxable: true, featured: false, tags: ['jordan', 'patent'], sku: 'SN-AJ11-GAM', squareItemId: null
    },
    {
      id: 'evb-sn-004', slug: 'air-jordan-3-retro-levis-denim',
      title: 'Air Jordan 3 Retro x Levis Denim', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Excellent', price: 41000, compareAt: null,
      images: ['/jordan-3-levis-denim.webp'],
      blurb: 'Raw denim upper with the red tab. Ages better worn than boxed.',
      description: 'The denim 3 with the signature red tab at the heel. The denim has taken on a light fade at the flex points, which is exactly what this pair is supposed to do.',
      details: ['Original co-branded box', 'Red tab intact', 'Denim fading at flex points', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9', 1], ['10', 1], ['11', 1]]),
      taxable: true, featured: false, tags: ['jordan', 'collab', 'denim'], sku: 'SN-AJ3-LEV', squareItemId: null
    },
    {
      id: 'evb-sn-005', slug: 'air-jordan-4-retro-red-cement',
      title: 'Air Jordan 4 Retro "Red Cement"', brand: 'Jordan', category: 'sneakers',
      condition: 'Deadstock', price: 33500, compareAt: 39000,
      images: ['/jordan-4-cherry-sail-red.webp'],
      blurb: 'Sail base with red cement speckle. Unworn.',
      description: 'Deadstock Red Cement 4s. Sail base with the cement speckle carried over from the 3. Box has minor shelf wear, the shoes are untouched.',
      details: ['Deadstock, never worn', 'Original box (light shelf wear)', 'All original accessories', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['8', 1], ['9.5', 2], ['11', 1], ['12', 1]]),
      taxable: true, featured: true, tags: ['jordan', 'deadstock'], sku: 'SN-AJ4-CHY', squareItemId: null
    },
    {
      id: 'evb-sn-006', slug: 'air-jordan-5-retro-racer-blue',
      title: 'Air Jordan 5 Retro "Racer Blue"', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Very Good', price: 18500, compareAt: 22000,
      images: ['/jordan-5-racer-blue.webp'],
      blurb: 'Reflective tongue still bright, netting clean.',
      description: 'Racer Blue 5s with the 3M tongue reflecting properly and no netting damage. Midsole shows light wear at the heel strike.',
      details: ['Original box included', '3M tongue fully reflective', 'Netting undamaged', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9', 1], ['10.5', 1], ['13', 1]]),
      taxable: true, featured: false, tags: ['jordan'], sku: 'SN-AJ5-RCR', squareItemId: null
    },
    {
      id: 'evb-sn-007', slug: 'air-jordan-5-low-clot-jade',
      title: 'Air Jordan 5 Low x CLOT "Jade"', brand: 'Jordan', category: 'sneakers',
      condition: 'Deadstock', price: 52000, compareAt: null,
      images: ['/jordan-5-low-clot-jade.webp'],
      blurb: 'Translucent jade sole, silk upper. Rare unworn.',
      description: 'The CLOT Jade 5 Low in its original packaging. Silk upper unmarked, translucent jade outsole with no yellowing — one of the harder CLOT collaborations to source deadstock.',
      details: ['Deadstock, never worn', 'Original box and accessories', 'Translucent jade outsole, no yellowing', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9', 1], ['10', 1]]),
      taxable: true, featured: true, tags: ['grail', 'clot', 'collab'], sku: 'SN-AJ5L-CLT', squareItemId: null
    },
    {
      id: 'evb-sn-008', slug: 'air-jordan-6-retro-infrared',
      title: 'Air Jordan 6 Retro "Infrared"', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Good', price: 16500, compareAt: 21000,
      images: ['/jordan-6-infrared-black-red.webp'],
      blurb: 'The championship 6. Honest wear, plenty of life left.',
      description: 'Black and Infrared 6s worn a handful of times. Some creasing across the toe and light sole wear. The nubuck is clean with no bald spots.',
      details: ['Original box included', 'Light creasing, no separation', 'Infrared accents unfaded', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['10', 1], ['11', 1]]),
      taxable: true, featured: false, tags: ['jordan', 'og'], sku: 'SN-AJ6-INF', squareItemId: null
    },
    {
      id: 'evb-sn-009', slug: 'air-jordan-3-retro-wizards',
      title: 'Air Jordan 3 Retro "Wizards"', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Excellent', price: 21000, compareAt: null,
      images: ['/jordan-3-wizards-black-blue.webp'],
      blurb: 'The Washington-era colorway. Elephant print sharp.',
      description: 'Wizards 3s in excellent shape. The elephant print has not rubbed and the midsole is free of yellowing. A quieter 3 that goes with everything.',
      details: ['Original box included', 'Elephant print sharp', 'No midsole yellowing', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9.5', 1], ['11', 1]]),
      taxable: true, featured: false, tags: ['jordan'], sku: 'SN-AJ3-WIZ', squareItemId: null
    },
    {
      id: 'evb-sn-010', slug: 'nike-kobe-6-protro-reverse-grinch',
      title: 'Nike Kobe 6 Protro "Reverse Grinch"', brand: 'Nike', category: 'sneakers',
      condition: 'Deadstock', price: 39000, compareAt: 45000,
      images: ['/kobe-6-reverse-grinch.webp'],
      blurb: 'Full-length scale pattern in the reverse colorway. Unworn.',
      description: 'Reverse Grinch 6s, deadstock. Protro tooling with the textured snakeskin upper. Kobe demand has not cooled and this colorway is a big part of why.',
      details: ['Deadstock, never worn', 'Original box and accessories', 'Protro cushioning update', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9', 1], ['10', 1], ['11.5', 1]]),
      taxable: true, featured: true, tags: ['kobe', 'deadstock'], sku: 'SN-KB6-RGR', squareItemId: null
    },
    {
      id: 'evb-sn-011', slug: 'air-jordan-12-retro-taxi',
      title: 'Air Jordan 12 Retro "Taxi"', brand: 'Jordan', category: 'sneakers',
      condition: 'Pre-owned — Very Good', price: 17500, compareAt: null,
      images: ['/jordan-12-taxi.webp'],
      blurb: 'White and black with gold eyelets. Timeless 12.',
      description: 'Taxi 12s with the mudguard clean and the gold eyelets unpitted. Light heel wear. One of the most wearable 12 colorways ever made.',
      details: ['Original box included', 'Gold eyelets unpitted', 'Light heel wear', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['10', 1], ['12', 1]]),
      taxable: true, featured: false, tags: ['jordan'], sku: 'SN-AJ12-TAX', squareItemId: null
    },
    {
      id: 'evb-sn-012', slug: 'gucci-rhyton-leather-sneaker',
      title: 'Gucci Rhyton Leather Sneaker', brand: 'Gucci', category: 'sneakers',
      condition: 'Pre-owned — Excellent', price: 48000, compareAt: 89000,
      images: ['/gucci-rhyton-sneaker-cream.webp'],
      blurb: 'Chunky ivory leather with the vintage logo print.',
      description: 'The Rhyton in ivory leather with the distressed logo print across the toe. Soles show minimal wear. Dust bags included.',
      details: ['Includes dust bags', 'Italian leather upper', 'Minimal sole wear', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['EU 41', 1], ['EU 43', 1]]),
      taxable: true, featured: false, tags: ['designer', 'gucci'], sku: 'SN-GUC-RHY', squareItemId: null
    },
    {
      id: 'evb-sn-013', slug: 'dior-b30-sneaker-sage',
      title: 'Dior B30 Sneaker — Sage', brand: 'Dior', category: 'sneakers',
      condition: 'Pre-owned — Excellent', price: 62000, compareAt: 115000,
      images: ['/dior-b30-sneaker-sage.webp'],
      blurb: 'Technical mesh runner in sage. Under half of retail.',
      description: 'The B30 runner in sage technical mesh with the CD initials at the heel. Worn a few times indoors. Box and dust bags included.',
      details: ['Box and dust bags included', 'Technical mesh and suede', 'CD heel branding', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['EU 42', 1], ['EU 44', 1]]),
      taxable: true, featured: true, tags: ['designer', 'dior'], sku: 'SN-DIO-B30', squareItemId: null
    },
    {
      id: 'evb-sn-014', slug: 'louis-vuitton-lv-trainer-sneaker',
      title: 'Louis Vuitton LV Trainer Sneaker', brand: 'Louis Vuitton', category: 'sneakers',
      condition: 'Pre-owned — Very Good', price: 78000, compareAt: 132000,
      images: ['/louis-vuitton-trainer-sneaker.webp', '/louis-vuitton-trainer-sneakers-nyc.webp'],
      blurb: 'Basketball silhouette in monogram-embossed calfskin.',
      description: 'LV Trainer with embossed monogram calfskin and a Damier rubber outsole. Light creasing at the toe. Original box, dust bags and tags.',
      details: ['Original box, dust bags and tags', 'Monogram-embossed calfskin', 'Damier rubber outsole', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['EU 42', 1], ['EU 43', 1]]),
      taxable: true, featured: false, tags: ['designer', 'louis vuitton'], sku: 'SN-LV-TRN', squareItemId: null
    },
    {
      id: 'evb-sn-015', slug: 'christian-louboutin-louis-junior-sneaker',
      title: 'Christian Louboutin Louis Junior Sneaker', brand: 'Christian Louboutin', category: 'sneakers',
      condition: 'Pre-owned — Excellent', price: 42000, compareAt: 79500,
      images: ['/christian-louboutin-sneaker-red-sole.webp'],
      blurb: 'Signature red sole, spiked toe cap. Barely worn.',
      description: 'Louis Junior low-top with the spiked toe cap and the signature red sole. The sole shows very light scuffing. Dust bags included.',
      details: ['Dust bags included', 'Signature red sole', 'All toe spikes present', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['EU 41', 1], ['EU 42', 1]]),
      taxable: true, featured: false, tags: ['designer'], sku: 'SN-CL-LJR', squareItemId: null
    },
    {
      id: 'evb-sn-016', slug: 'hellstar-adidas-collaboration-sneaker',
      title: 'Hellstar x adidas Collaboration Sneaker', brand: 'Hellstar', category: 'sneakers',
      condition: 'Deadstock', price: 29000, compareAt: null,
      images: ['/hellstar-adidas-collab-sneakers.webp'],
      blurb: 'The collab that sold out in minutes. Unworn pair.',
      description: 'Deadstock Hellstar collaboration pair with all original packaging. Hellstar demand in NYC has stayed high and this release is a large part of the reason.',
      details: ['Deadstock, never worn', 'Original box and accessories', 'Hellstar co-branding throughout', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['9', 1], ['10', 1], ['11', 1]]),
      taxable: true, featured: false, tags: ['hellstar', 'collab', 'deadstock'], sku: 'SN-HS-ADI', squareItemId: null
    },

    /* =============================== WATCHES ============================== */
    {
      id: 'evb-wa-001', slug: 'audemars-piguet-royal-oak-offshore',
      title: 'Audemars Piguet Royal Oak Offshore', brand: 'Audemars Piguet', category: 'watches',
      condition: 'Pre-owned — Excellent', price: 2895000, compareAt: null,
      images: ['/watch-audemars-piguet-royal-oak-offshore-box.webp', '/watch-audemars-piguet-royal-oak-offshore-caseback.webp'],
      blurb: 'Full set with box and papers. Movement running to spec.',
      description: 'Royal Oak Offshore chronograph with the tapisserie dial and octagonal bezel. Timed on our machine and running within tolerance. Box, papers and links present.',
      details: ['Box and papers included', 'Automatic chronograph movement', 'Timed and running within tolerance', 'All original links present', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['grail', 'swiss', 'full set'], sku: 'WA-AP-ROO', squareItemId: null
    },
    {
      id: 'evb-wa-002', slug: 'omega-seamaster-diver-300m',
      title: 'Omega Seamaster Diver 300M', brand: 'Omega', category: 'watches',
      condition: 'Pre-owned — Excellent', price: 419000, compareAt: 545000,
      images: ['/watch-omega-seamaster-diver-300m-wrist.webp', '/watch-omega-seamaster-diver-300m-box-set.webp'],
      blurb: 'Wave dial, ceramic bezel, co-axial movement. Full set.',
      description: 'The Seamaster Diver 300M with the laser-engraved wave dial and ceramic bezel. Co-axial Master Chronometer movement, pressure tested. Complete with box and card.',
      details: ['Box and warranty card included', 'Co-Axial Master Chronometer movement', 'Pressure tested to depth rating', 'Ceramic bezel, no chips', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['swiss', 'diver', 'full set'], sku: 'WA-OM-SM300', squareItemId: null
    },
    {
      id: 'evb-wa-003', slug: 'grand-seiko-gmt',
      title: 'Grand Seiko GMT', brand: 'Grand Seiko', category: 'watches',
      condition: 'Pre-owned — Excellent', price: 385000, compareAt: 470000,
      images: ['/watch-grand-seiko-gmt-wrist.webp', '/watch-grand-seiko-gmt-caseback.webp'],
      blurb: 'Zaratsu-polished case, textured dial, GMT complication.',
      description: 'Grand Seiko GMT with the distortion-free Zaratsu polishing and a textured dial that changes with the light. Movement serviced and keeping excellent time.',
      details: ['Box and papers included', 'GMT complication', 'Zaratsu-polished case', 'Serviced, keeping excellent time', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['japanese', 'gmt'], sku: 'WA-GS-GMT', squareItemId: null
    },
    {
      id: 'evb-wa-004', slug: 'tag-heuer-formula-1-green-dial',
      title: 'TAG Heuer Formula 1 — Green Dial', brand: 'TAG Heuer', category: 'watches',
      condition: 'Pre-owned — Very Good', price: 89000, compareAt: 125000,
      images: ['/watch-tag-heuer-formula-1-green-dial.webp'],
      blurb: 'Sunburst green dial on steel. Great first Swiss watch.',
      description: 'Formula 1 with a sunburst green dial and steel bracelet. Light bracelet stretch, crystal unscratched, quartz movement running accurately.',
      details: ['Steel bracelet with light stretch', 'Sapphire crystal, unscratched', 'Quartz movement, fresh battery', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['swiss', 'entry'], sku: 'WA-TAG-F1G', squareItemId: null
    },
    {
      id: 'evb-wa-005', slug: 'tiffany-co-blue-dial-watch',
      title: 'Tiffany & Co. Blue Dial Watch', brand: 'Tiffany & Co.', category: 'watches',
      condition: 'Pre-owned — Excellent', price: 245000, compareAt: 320000,
      images: ['/watch-tiffany-co-blue-dial-wrist.webp', '/watch-tiffany-co-tank-stainless.webp'],
      blurb: 'Signed dial in the house blue. Understated and rare.',
      description: 'A Tiffany-signed dial in the house blue, cased in stainless steel. Signed dials carry a premium and this one is unrestored and unfaded.',
      details: ['Tiffany-signed dial, unrestored', 'Stainless steel case', 'Movement serviced', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['signed dial'], sku: 'WA-TIF-BLU', squareItemId: null
    },
    {
      id: 'evb-wa-006', slug: 'bulova-gold-tone-dress-watch',
      title: 'Bulova Gold-Tone Dress Watch', brand: 'Bulova', category: 'watches',
      condition: 'Pre-owned — Very Good', price: 32000, compareAt: 48000,
      images: ['/watch-bulova-gold-box.webp'],
      blurb: 'Slim gold-tone dress piece with the original box.',
      description: 'A slim gold-tone Bulova that wears well under a cuff. Plating is intact with no brassing at the lugs. Original box included.',
      details: ['Original box included', 'Plating intact, no brassing', 'Fresh battery', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['dress'], sku: 'WA-BUL-GLD', squareItemId: null
    },
    {
      id: 'evb-wa-007', slug: 'patek-philippe-ladies-watch',
      title: 'Patek Philippe Ladies Watch', brand: 'Patek Philippe', category: 'watches',
      condition: 'Pre-owned — Excellent', price: 1450000, compareAt: null,
      images: ['/watch-patek-philippe-ladies-certificate.webp'],
      blurb: 'With Certificate of Origin. Serviced and running.',
      description: 'A ladies Patek Philippe accompanied by its Certificate of Origin — the document that matters most on resale. Recently serviced and running to specification.',
      details: ['Certificate of Origin included', 'Recently serviced', 'Case unpolished', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['grail', 'swiss', 'papers'], sku: 'WA-PP-LDY', squareItemId: null
    },

    /* =============================== JEWELRY ============================== */
    {
      id: 'evb-jw-001', slug: '14k-gold-miami-cuban-link-chain',
      title: '14K Solid Gold Miami Cuban Link Chain', brand: 'Italian Gold', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 289000, compareAt: 385000,
      images: ['/2-7-mm-solid-gold-italy-miami-cuban-chain-yellow-14k-18k-made-in-italy-yellow-model-shot.webp', '/14kgoldnecklace.webp'],
      blurb: 'Solid, not hollow. Stamped and acid-tested on site.',
      description: 'A solid 14K Miami Cuban made in Italy. Every link is solid — we cut-tested and acid-tested it at the counter. Box clasp with a double safety latch.',
      details: ['14K solid gold, stamped and acid-tested', 'Made in Italy', 'Box clasp with double safety latch', 'Weight and length confirmed at pickup'],
      variantLabel: 'Length', variants: sizes([['20 in', 1], ['22 in', 1], ['24 in', 1]]),
      taxable: true, featured: true, tags: ['gold', 'cuban', 'solid'], sku: 'JW-14K-CUB', squareItemId: null
    },
    {
      id: 'evb-jw-002', slug: 'cartier-love-style-gold-bracelet',
      title: 'Cartier Bracelet — Yellow Gold', brand: 'Cartier', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 645000, compareAt: 795000,
      images: ['/cartierbracelet2.webp'],
      blurb: 'Signed, hallmarked and serial-checked.',
      description: 'A signed Cartier bracelet in yellow gold. Hallmarks and serial verified against Cartier reference data. Light surface marks consistent with wear.',
      details: ['Signed and hallmarked', 'Serial verified', 'Screwdriver included where applicable', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['16', 1], ['17', 1]]),
      taxable: true, featured: true, tags: ['designer', 'gold', 'cartier'], sku: 'JW-CAR-BRC', squareItemId: null
    },
    {
      id: 'evb-jw-003', slug: 'tiffany-co-sterling-necklace',
      title: 'Tiffany & Co. Sterling Silver Necklace', brand: 'Tiffany & Co.', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 24500, compareAt: 39500,
      images: ['/tiffanynecklace.webp'],
      blurb: 'Signed sterling, professionally polished.',
      description: 'A signed Tiffany & Co. sterling silver necklace, professionally polished and ready to wear. Hallmarks crisp and unworn.',
      details: ['Signed Tiffany & Co. hallmarks', 'Sterling silver, professionally polished', 'Clasp tested', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['silver', 'designer', 'tiffany'], sku: 'JW-TIF-NCK', squareItemId: null
    },
    {
      id: 'evb-jw-004', slug: 'tiffany-co-sterling-ring',
      title: 'Tiffany & Co. Sterling Silver Ring', brand: 'Tiffany & Co.', category: 'jewelry',
      condition: 'Pre-owned — Very Good', price: 14500, compareAt: 25000,
      images: ['/tiffanyring.webp'],
      blurb: 'Signed band with clean hallmarks.',
      description: 'A signed sterling ring with legible hallmarks inside the band. Light surface wear polished out. Sizing available on request.',
      details: ['Signed hallmarks, legible', 'Sterling silver', 'Free sizing on request', 'Authenticated in-house'],
      variantLabel: 'Ring size', variants: sizes([['6', 1], ['7', 1], ['8', 1]]),
      taxable: true, featured: false, tags: ['silver', 'designer', 'tiffany'], sku: 'JW-TIF-RNG', squareItemId: null
    },
    {
      id: 'evb-jw-005', slug: 'david-yurman-sterling-cable-bracelet',
      title: 'David Yurman Sterling Cable Bracelet', brand: 'David Yurman', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 39500, compareAt: 65000,
      images: ['/davidyurmansterlingsilver.webp'],
      blurb: 'The cable motif, signed. Holds value better than most silver.',
      description: 'The signature cable bracelet in sterling silver. Signed on the inner face. Cable twist is tight with no flattening.',
      details: ['Signed on inner face', 'Sterling silver with cable motif', 'No flattening in the cable twist', 'Authenticated in-house'],
      variantLabel: 'Size', variants: sizes([['Medium', 1], ['Large', 1]]),
      taxable: true, featured: false, tags: ['silver', 'designer'], sku: 'JW-DY-CBL', squareItemId: null
    },
    {
      id: 'evb-jw-006', slug: 'sterling-silver-cuban-link-chain',
      title: 'Sterling Silver Cuban Link Chain', brand: 'East Village Buyers', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 32000, compareAt: 45000,
      images: ['/silvercuban.webp', '/silvercubanlink.webp'],
      blurb: 'Heavy sterling Cuban with a solid box clasp.',
      description: 'A heavy solid sterling Cuban link. Stamped 925 and acid-tested. Box clasp engages firmly with a safety latch.',
      details: ['Stamped 925, acid-tested', 'Solid links, not hollow', 'Box clasp with safety latch', 'Weight confirmed at pickup'],
      variantLabel: 'Length', variants: sizes([['20 in', 1], ['24 in', 1]]),
      taxable: true, featured: false, tags: ['silver', 'cuban'], sku: 'JW-SS-CUB', squareItemId: null
    },
    {
      id: 'evb-jw-007', slug: 'lab-grown-diamond-solitaire-pendant',
      title: 'Lab-Grown Diamond Solitaire Pendant', brand: 'East Village Buyers', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 118000, compareAt: 165000,
      images: ['/labgrowndiamond.webp'],
      blurb: 'Certified lab-grown stone in a 14K setting.',
      description: 'A certified lab-grown solitaire set in 14K. The certificate accompanies the piece. Prongs inspected and tightened before listing.',
      details: ['Certificate included', '14K setting', 'Prongs inspected and tightened', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['diamond', 'certified'], sku: 'JW-LG-PND', squareItemId: null
    },
    {
      id: 'evb-jw-008', slug: 'chrome-hearts-cross-ring',
      title: 'Chrome Hearts Cross Ring', brand: 'Chrome Hearts', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 98000, compareAt: 135000,
      images: ['/chrome-hearts-cross-ring.webp'],
      blurb: 'Sterling cross band, correct stamps and weight.',
      description: 'A Chrome Hearts sterling cross ring checked against the correct stamps, font and weight. Patina in the recesses is original and intentional.',
      details: ['Correct Chrome Hearts stamps and font', 'Sterling silver, weight verified', 'Original patina retained', 'Authenticated in-house'],
      variantLabel: 'Ring size', variants: sizes([['9', 1], ['10', 1], ['11', 1]]),
      taxable: true, featured: true, tags: ['chrome hearts', 'silver'], sku: 'JW-CH-RNG', squareItemId: null
    },
    {
      id: 'evb-jw-009', slug: 'chrome-hearts-dagger-pendant',
      title: 'Chrome Hearts Dagger Pendant', brand: 'Chrome Hearts', category: 'jewelry',
      condition: 'Pre-owned — Excellent', price: 125000, compareAt: null,
      images: ['/chrome-hearts-dagger-pendant.webp', '/chrome-hearts-heart-cross-pendant.webp'],
      blurb: 'One of the most counterfeited pieces they make. This one is right.',
      description: 'A Chrome Hearts dagger pendant verified on stamp placement, casting quality and weight — the three places fakes fall apart. Chain sold separately.',
      details: ['Stamp placement and casting verified', 'Sterling silver, weight confirmed', 'Chain sold separately', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['chrome hearts', 'silver'], sku: 'JW-CH-DAG', squareItemId: null
    },

    /* ============================ GOLD & BULLION ========================== */
    {
      id: 'evb-gd-001', slug: 'canadian-gold-maple-leaf-1oz',
      title: 'Canadian Gold Maple Leaf — 1 oz', brand: 'Royal Canadian Mint', category: 'gold',
      condition: 'Bullion', price: 268500, compareAt: null,
      images: ['/goldcoincanada.webp'],
      blurb: '.9999 fine. Priced against live spot at pickup.',
      description: 'A 1 oz Gold Maple Leaf, .9999 fine, in a protective flip. Bullion is priced against the live spot market — the listed price is confirmed at the time your order is accepted.',
      details: ['1 troy oz, .9999 fine gold', 'Priced to live spot market', 'Protective flip included', 'XRF-tested on site'],
      variantLabel: null, variants: one(4),
      taxable: false, featured: true, tags: ['bullion', 'coin', 'spot'], sku: 'GD-CA-MPL', squareItemId: null
    },
    {
      id: 'evb-gd-002', slug: 'indian-head-gold-eagle',
      title: 'Indian Head Gold Eagle', brand: 'US Mint', category: 'gold',
      condition: 'Numismatic', price: 142000, compareAt: null,
      images: ['/indianheadgold.webp'],
      blurb: 'Pre-1933 US gold with collector value above melt.',
      description: 'An Indian Head Gold Eagle carrying numismatic value above its melt weight. Graded by eye at the counter — condition and date drive the premium here.',
      details: ['Pre-1933 US gold', 'Numismatic premium above melt', 'XRF-tested on site', 'Protective holder included'],
      variantLabel: null, variants: one(2),
      taxable: false, featured: false, tags: ['bullion', 'coin', 'numismatic'], sku: 'GD-US-IHE', squareItemId: null
    },
    {
      id: 'evb-gd-003', slug: 'gold-bar-2-5-gram',
      title: 'Gold Bar — 2.5 Gram', brand: 'Assayed', category: 'gold',
      condition: 'Bullion', price: 34500, compareAt: null,
      images: ['/goldbar2.5.webp'],
      blurb: 'Sealed in its assay card. Entry-level bullion.',
      description: 'A 2.5 gram gold bar sealed in its original assay card with matching serial. The most accessible way into physical gold.',
      details: ['2.5 g fine gold', 'Sealed assay card with matching serial', 'Priced to live spot market', 'XRF-tested through the card'],
      variantLabel: null, variants: one(6),
      taxable: false, featured: false, tags: ['bullion', 'bar', 'spot'], sku: 'GD-BAR-25', squareItemId: null
    },
    {
      id: 'evb-gd-004', slug: 'silver-bullion-bar-10oz',
      title: 'Silver Bullion Bar — 10 oz', brand: 'Assayed', category: 'gold',
      condition: 'Bullion', price: 42500, compareAt: null,
      images: ['/silverbar.webp'],
      blurb: '.999 fine silver. Stackable and liquid.',
      description: 'A 10 oz .999 fine silver bar with a clean face and no milk spotting. Priced against live spot at the time your order is accepted.',
      details: ['10 troy oz, .999 fine silver', 'No milk spotting', 'Priced to live spot market', 'XRF-tested on site'],
      variantLabel: null, variants: one(8),
      taxable: false, featured: false, tags: ['bullion', 'silver', 'spot'], sku: 'GD-AG-10OZ', squareItemId: null
    },
    {
      id: 'evb-gd-005', slug: 'gold-coin-pendant-bezel-set',
      title: 'Gold Coin Pendant — Bezel Set', brand: 'East Village Buyers', category: 'gold',
      condition: 'Pre-owned — Excellent', price: 189000, compareAt: 235000,
      images: ['/goldpendantcoin.webp', '/coinimage1.webp'],
      blurb: 'Coin in a screw-top 14K bezel. Wearable bullion.',
      description: 'A gold coin set into a screw-top 14K bezel, so the coin can be removed without damage. Bezel and coin were weighed separately and both are priced in.',
      details: ['Screw-top 14K bezel, coin removable', 'Coin and bezel weighed separately', 'XRF-tested on site', 'Chain sold separately'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['gold', 'coin', 'pendant'], sku: 'GD-PND-BZL', squareItemId: null
    },

    /* ============================= STREETWEAR ============================= */
    {
      id: 'evb-st-001', slug: 'hellstar-graphic-hoodie',
      title: 'Hellstar Studios Graphic Hoodie', brand: 'Hellstar', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 28500, compareAt: 38000,
      images: ['/hellstar-lookbook-graphic-hoodie.webp'],
      blurb: 'Heavyweight fleece, graphic uncracked.',
      description: 'A Hellstar Studios hoodie in heavyweight fleece. The print has no cracking or lift, and the interior fleece has not pilled. Verified against the correct neck tag and stitch density.',
      details: ['Correct neck tag and stitch density', 'Print uncracked, no lift', 'Heavyweight fleece, no pilling', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['M', 1], ['L', 2], ['XL', 1]]),
      taxable: true, featured: true, tags: ['hellstar', 'hoodie'], sku: 'ST-HS-HOOD', squareItemId: null
    },
    {
      id: 'evb-st-002', slug: 'hellstar-graphic-tee',
      title: 'Hellstar Studios Graphic Tee', brand: 'Hellstar', category: 'streetwear',
      condition: 'Pre-owned — Very Good', price: 14500, compareAt: 21000,
      images: ['/hellstar-graffiti-wall-tees.webp'],
      blurb: 'Boxy fit, correct wash, print intact.',
      description: 'A Hellstar graphic tee with the boxy cut and heavy cotton body. Print is intact with a light vintage wash from wear.',
      details: ['Heavy cotton, boxy fit', 'Print intact', 'Correct neck tag', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['M', 1], ['L', 1], ['XL', 1]]),
      taxable: true, featured: false, tags: ['hellstar', 'tee'], sku: 'ST-HS-TEE', squareItemId: null
    },
    {
      id: 'evb-st-003', slug: 'hellstar-avirex-collab-jacket',
      title: 'Hellstar x Avirex Leather Jacket', brand: 'Hellstar', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 78000, compareAt: 98000,
      images: ['/hellstar-avirex-collab-jackets-group.webp'],
      blurb: 'The heavyweight collab piece. Leather supple, no cracking.',
      description: 'The Hellstar and Avirex collaboration jacket in heavy leather with full patchwork. Leather is supple with no cracking at the elbows and all hardware moves freely.',
      details: ['Full patchwork intact', 'Leather supple, no cracking', 'All hardware functional', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['L', 1], ['XL', 1]]),
      taxable: true, featured: true, tags: ['hellstar', 'collab', 'outerwear'], sku: 'ST-HS-AVX', squareItemId: null
    },
    {
      id: 'evb-st-004', slug: 'mattyboy-sex-records-hoodie',
      title: 'MATTYBOY Sex Records Hoodie', brand: 'MATTYBOY', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 22000, compareAt: 29000,
      images: ['/mattyboy-sex-records-hoodie.webp'],
      blurb: 'Downtown NYC label. Print sharp, fleece heavy.',
      description: 'A MATTYBOY Sex Records hoodie — a genuinely local piece, made a few blocks from the shop. Print is sharp and the fleece has held its loft.',
      details: ['NYC label, locally produced', 'Print sharp, no cracking', 'Heavyweight fleece', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['M', 1], ['L', 1], ['XL', 1]]),
      taxable: true, featured: false, tags: ['mattyboy', 'nyc', 'hoodie'], sku: 'ST-MB-SEX', squareItemId: null
    },
    {
      id: 'evb-st-005', slug: 'mattyboy-camo-caution-tshirt',
      title: 'MATTYBOY Camo Caution T-Shirt', brand: 'MATTYBOY', category: 'streetwear',
      condition: 'Pre-owned — Very Good', price: 11500, compareAt: 16000,
      images: ['/mattyboy-camo-caution-tshirt.webp', '/mattyboy-graphic-tee-outfit.webp'],
      blurb: 'Camo body with the caution graphic.',
      description: 'MATTYBOY caution tee on a camo body. Light wash fade, graphic fully intact.',
      details: ['Camo body, cotton', 'Graphic fully intact', 'Light wash fade', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['M', 1], ['L', 1]]),
      taxable: true, featured: false, tags: ['mattyboy', 'nyc', 'tee'], sku: 'ST-MB-CAM', squareItemId: null
    },
    {
      id: 'evb-st-006', slug: 'eric-emanuel-mesh-shorts',
      title: 'Eric Emanuel Mesh Shorts', brand: 'Eric Emanuel', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 9500, compareAt: 14000,
      images: ['/eric-emanuel-shorts-vegas.webp', '/knicks-ee-shorts.webp'],
      blurb: 'The EE shorts. Correct mesh weight and embroidery.',
      description: 'Eric Emanuel mesh shorts with the correct mesh weight and embroidery density — the two tells that separate real from fake. Drawcord and tips original.',
      details: ['Correct mesh weight and embroidery', 'Original drawcord and tips', 'No pilling or pulls', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['S', 1], ['M', 2], ['L', 1], ['XL', 1]]),
      taxable: true, featured: false, tags: ['eric emanuel', 'shorts'], sku: 'ST-EE-SHR', squareItemId: null
    },
    {
      id: 'evb-st-007', slug: 'chrome-hearts-trucker-hat',
      title: 'Chrome Hearts Trucker Hat', brand: 'Chrome Hearts', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 68000, compareAt: 85000,
      images: ['/chrome-hearts-trucker-hat-green.webp'],
      blurb: 'Correct patch stitching and mesh. Brim unbent.',
      description: 'A Chrome Hearts trucker verified on patch stitching, mesh gauge and interior tagging. Brim is unbent and the snap array is complete.',
      details: ['Patch stitching and mesh verified', 'Brim unbent, snaps complete', 'Interior tagging correct', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['chrome hearts', 'hat'], sku: 'ST-CH-HAT', squareItemId: null
    },
    {
      id: 'evb-st-008', slug: 'vale-forever-tracksuit-set',
      title: 'Vale Forever Tracksuit Set', brand: 'Vale Forever', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 18500, compareAt: 26000,
      images: ['/vale-forever-tracksuit-set-nyc.webp', '/vale-forever-warehouse-hoodies.webp'],
      blurb: 'Matching two-piece from the NYC label.',
      description: 'A full Vale Forever tracksuit, top and bottom, sold as a set. Fleece is heavy with no pilling and all embroidery is clean.',
      details: ['Sold as a matching two-piece set', 'Heavy fleece, no pilling', 'Embroidery clean', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['M', 1], ['L', 1], ['XL', 1]]),
      taxable: true, featured: false, tags: ['vale forever', 'nyc', 'set'], sku: 'ST-VF-TRK', squareItemId: null
    },
    {
      id: 'evb-st-009', slug: 'sb-studios-graphic-tee-set',
      title: 'SB Studios Graphic Tee Set', brand: 'SB Studios', category: 'streetwear',
      condition: 'Pre-owned — Excellent', price: 13500, compareAt: 19000,
      images: ['/sb-studios-graphic-tee-set-nyc.webp', '/sb-studios-crop-top-shorts-set-nyc.webp'],
      blurb: 'The NYC label that broke out on Instagram.',
      description: 'SB Studios graphic set. Prints are crisp with no lift at the edges and the cotton has kept its hand feel.',
      details: ['Prints crisp, no edge lift', 'Cotton body', 'Correct interior tagging', 'Authenticated in-house'],
      variantLabel: 'Size', variants: apparel([['S', 1], ['M', 1], ['L', 1]]),
      taxable: true, featured: false, tags: ['sb studios', 'nyc'], sku: 'ST-SB-TEE', squareItemId: null
    },
    {
      id: 'evb-st-010', slug: 'forever-situated-fs-hoodie',
      title: 'Forever Situated FS Hoodie', brand: 'Forever Situated', category: 'streetwear',
      condition: 'Deadstock', price: 16500, compareAt: null,
      images: ['/forever-situated-fs-hoodie-red-navy-nyc.jpg', '/forever-situated-fs-tracksuit-set-nyc.jpg'],
      blurb: 'Red and navy FS hoodie, unworn with tags.',
      description: 'A Forever Situated FS hoodie in red and navy, deadstock with tags attached. Small NYC label with limited production runs.',
      details: ['Deadstock with tags attached', 'Heavyweight fleece', 'Limited production run', 'Sourced direct'],
      variantLabel: 'Size', variants: apparel([['M', 1], ['L', 2], ['XL', 1]]),
      taxable: true, featured: false, tags: ['forever situated', 'nyc', 'deadstock'], sku: 'ST-FS-HOOD', squareItemId: null
    },

    /* ============================== DESIGNER ============================== */
    {
      id: 'evb-dg-001', slug: 'louis-vuitton-monogram-speedy-bag',
      title: 'Louis Vuitton Monogram Speedy', brand: 'Louis Vuitton', category: 'designer',
      condition: 'Pre-owned — Excellent', price: 138000, compareAt: 189000,
      images: ['/louis-vuitton-green-monogram-speedy-bag.webp', '/lvhandbag.webp'],
      blurb: 'Date code verified, vachetta evenly patinated.',
      description: 'A Speedy with a verified date code and evenly patinated vachetta — uneven patina is a common tell on rebuilt bags. Interior clean, zipper runs smoothly.',
      details: ['Date code verified', 'Vachetta evenly patinated', 'Interior clean, zipper smooth', 'Dust bag included', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['louis vuitton', 'handbag'], sku: 'DG-LV-SPD', squareItemId: null
    },
    {
      id: 'evb-dg-002', slug: 'chrome-hearts-leather-wallet',
      title: 'Chrome Hearts Cross Patch Wallet', brand: 'Chrome Hearts', category: 'designer',
      condition: 'Pre-owned — Very Good', price: 89000, compareAt: 115000,
      images: ['/chrome-hearts-cross-patch-wallet.webp', '/chrome-hearts-box-bag-bracelet.webp'],
      blurb: 'Cross patch leather wallet with sterling hardware.',
      description: 'A Chrome Hearts wallet with the cross patch and sterling hardware. Leather has softened with use, stitching is tight throughout, and the hardware carries correct stamps.',
      details: ['Sterling hardware with correct stamps', 'Stitching tight throughout', 'Leather softened with use', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['chrome hearts', 'leather'], sku: 'DG-CH-WAL', squareItemId: null
    },
    {
      id: 'evb-dg-003', slug: 'chrome-hearts-dog-tag-set',
      title: 'Chrome Hearts Dog Tag Necklace & Bracelet Set', brand: 'Chrome Hearts', category: 'designer',
      condition: 'Pre-owned — Excellent', price: 156000, compareAt: null,
      images: ['/chrome-hearts-dog-tag-necklace-bracelet.webp'],
      blurb: 'Matching set, sold together. Weight verified.',
      description: 'A matching Chrome Hearts dog tag necklace and bracelet sold as one set. Both pieces weighed and stamp-checked. Buying the set together beats sourcing them separately.',
      details: ['Necklace and bracelet sold as a set', 'Both pieces weighed and stamp-checked', 'Sterling silver', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['chrome hearts', 'silver', 'set'], sku: 'DG-CH-DTS', squareItemId: null
    },

    /* ============================= ELECTRONICS ============================ */
    {
      id: 'evb-el-001', slug: 'apple-macbook-pro',
      title: 'Apple MacBook Pro', brand: 'Apple', category: 'electronics',
      condition: 'Pre-owned — Excellent', price: 119000, compareAt: 159900,
      images: ['/macbook.webp'],
      blurb: 'Wiped, battery health checked, Activation Lock cleared.',
      description: 'A MacBook Pro erased to factory settings with Activation Lock removed and iCloud signed out — we verify this before any Apple device is listed. Battery cycle count and health were checked.',
      details: ['Erased to factory settings', 'Activation Lock removed, iCloud signed out', 'Battery health verified', 'Charger included'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['apple', 'laptop'], sku: 'EL-AP-MBP', squareItemId: null
    },
    {
      id: 'evb-el-002', slug: 'apple-iphone-17-pro',
      title: 'Apple iPhone 17 Pro', brand: 'Apple', category: 'electronics',
      condition: 'Pre-owned — Excellent', price: 89500, compareAt: 109900,
      images: ['/Apple-iPhone-17-Pro-4x3-1_4x3.webp'],
      blurb: 'Unlocked, clean IMEI, Activation Lock cleared.',
      description: 'An unlocked iPhone 17 Pro with a clean IMEI checked against the carrier blacklist. Erased, Activation Lock removed, battery health verified.',
      details: ['Carrier unlocked, clean IMEI', 'Blacklist checked', 'Activation Lock removed', 'Battery health verified'],
      variantLabel: 'Storage', variants: [
        { id: '256gb', label: '256 GB', price: 89500, stock: 1, squareVariationId: null },
        { id: '512gb', label: '512 GB', price: 99500, stock: 1, squareVariationId: null }
      ],
      taxable: true, featured: true, tags: ['apple', 'phone'], sku: 'EL-AP-I17P', squareItemId: null
    },
    {
      id: 'evb-el-003', slug: 'apple-ipad',
      title: 'Apple iPad', brand: 'Apple', category: 'electronics',
      condition: 'Pre-owned — Very Good', price: 32500, compareAt: 44900,
      images: ['/ipad.webp'],
      blurb: 'Screen unscratched, wiped and ready to set up.',
      description: 'An iPad erased to factory settings with Activation Lock removed. Screen is free of scratches, housing shows light handling marks. Charger included.',
      details: ['Erased to factory settings', 'Activation Lock removed', 'Screen unscratched', 'Charger included'],
      variantLabel: null, variants: one(2),
      taxable: true, featured: false, tags: ['apple', 'tablet'], sku: 'EL-AP-IPD', squareItemId: null
    },
    {
      id: 'evb-el-004', slug: 'apple-airpods-max',
      title: 'Apple AirPods Max', brand: 'Apple', category: 'electronics',
      condition: 'Pre-owned — Excellent', price: 34500, compareAt: 54900,
      images: ['/airpodmax.webp'],
      blurb: 'Cushions clean, ANC tested, unpaired.',
      description: 'AirPods Max with clean ear cushions and functioning active noise cancellation, tested before listing. Unpaired from the previous owner. Smart Case included.',
      details: ['ANC tested and functioning', 'Ear cushions clean', 'Unpaired from previous account', 'Smart Case included'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['apple', 'audio'], sku: 'EL-AP-APM', squareItemId: null
    },
    {
      id: 'evb-el-005', slug: 'sony-playstation-5',
      title: 'Sony PlayStation 5 Console', brand: 'Sony', category: 'electronics',
      condition: 'Pre-owned — Excellent', price: 39500, compareAt: 49999,
      images: ['/ps5.webp'],
      blurb: 'Factory reset, disc drive and controller tested.',
      description: 'A PlayStation 5 factory reset with the account deactivated. Disc drive, HDMI output and the included DualSense controller were all tested.',
      details: ['Factory reset, account deactivated', 'Disc drive tested', 'DualSense controller included and tested', 'All cables included'],
      variantLabel: null, variants: one(2),
      taxable: true, featured: false, tags: ['console', 'gaming'], sku: 'EL-SN-PS5', squareItemId: null
    },
    {
      id: 'evb-el-006', slug: 'meta-quest-3',
      title: 'Meta Quest 3 Headset', brand: 'Meta', category: 'electronics',
      condition: 'Pre-owned — Very Good', price: 32000, compareAt: 49900,
      images: ['/metaquest3.webp'],
      blurb: 'Lenses unscratched, controllers tracking correctly.',
      description: 'A Meta Quest 3 factory reset and unlinked from the previous account. Lenses are unscratched — the most common problem with used headsets — and both controllers track correctly.',
      details: ['Factory reset and account unlinked', 'Lenses unscratched', 'Both controllers tracking correctly', 'Charger included'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['vr', 'gaming'], sku: 'EL-MT-QS3', squareItemId: null
    },
    {
      id: 'evb-el-007', slug: 'sony-mirrorless-camera-body',
      title: 'Sony Mirrorless Camera Body', brand: 'Sony', category: 'electronics',
      condition: 'Pre-owned — Excellent', price: 118000, compareAt: 159900,
      images: ['/sonycamera.png'],
      blurb: 'Low shutter count, sensor clean, body unmarked.',
      description: 'A Sony mirrorless body with a low shutter actuation count and a clean sensor, both checked before listing. Body and one battery included.',
      details: ['Low shutter actuation count', 'Sensor inspected and clean', 'Battery and charger included', 'Body only, no lens'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['camera', 'sony'], sku: 'EL-SN-CAM', squareItemId: null
    },
    {
      id: 'evb-el-008', slug: 'canon-g7x-camera',
      title: 'Canon PowerShot G7 X', brand: 'Canon', category: 'electronics',
      condition: 'Pre-owned — Very Good', price: 48500, compareAt: 74900,
      images: ['/canon-g7x-camera.webp'],
      blurb: 'The vlogging compact that never went out of demand.',
      description: 'A Canon G7 X in working order with a clean lens and functioning flip screen. Demand for this compact has stayed high years after release.',
      details: ['Lens clean, no fungus', 'Flip screen functioning', 'Battery and charger included', 'Tested before listing'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['camera', 'canon'], sku: 'EL-CN-G7X', squareItemId: null
    },

    /* ============================ COLLECTIBLES ============================ */
    {
      id: 'evb-cl-001', slug: 'pokemon-booster-box-sealed',
      title: 'Pokémon Booster Box — Sealed', brand: 'Pokémon', category: 'collectibles',
      condition: 'Sealed', price: 68000, compareAt: 85000,
      images: ['/pokemon-booster-box.webp', '/pokemoncards.webp'],
      blurb: 'Factory sealed, shrink intact, weight verified.',
      description: 'A factory-sealed booster box with the original shrink and no reseal seams. Weight was checked against factory spec — the fastest way to catch a resealed box.',
      details: ['Factory sealed, original shrink', 'No reseal seams', 'Weight verified against factory spec', 'Stored away from light and heat'],
      variantLabel: null, variants: one(2),
      taxable: true, featured: true, tags: ['pokemon', 'sealed', 'tcg'], sku: 'CL-PK-BOX', squareItemId: null
    },
    {
      id: 'evb-cl-002', slug: 'pokemon-elite-trainer-box',
      title: 'Pokémon Elite Trainer Box — Sealed', brand: 'Pokémon', category: 'collectibles',
      condition: 'Sealed', price: 12500, compareAt: 17500,
      images: ['/pokemon-etb-box.webp'],
      blurb: 'Sealed ETB with intact factory seams.',
      description: 'A sealed Elite Trainer Box with intact factory seams and sharp corners. Stored away from light and heat.',
      details: ['Factory sealed, seams intact', 'Corners sharp', 'Stored away from light and heat', 'Verified before listing'],
      variantLabel: null, variants: one(4),
      taxable: true, featured: false, tags: ['pokemon', 'sealed', 'tcg'], sku: 'CL-PK-ETB', squareItemId: null
    },
    {
      id: 'evb-cl-003', slug: 'kaws-the-promise-figure',
      title: 'KAWS "The Promise" Vinyl Figure', brand: 'KAWS', category: 'collectibles',
      condition: 'Pre-owned — Excellent', price: 89000, compareAt: 115000,
      images: ['/kaws-the-promise.webp'],
      blurb: 'With original box. No sun fade, no shelf marks.',
      description: 'The Promise vinyl figure with its original box. No sun fade on the vinyl and no shelf marks on the base — both of which kill value on KAWS pieces.',
      details: ['Original box included', 'No sun fade on vinyl', 'Base free of shelf marks', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: true, tags: ['kaws', 'vinyl', 'art'], sku: 'CL-KW-PRM', squareItemId: null
    },
    {
      id: 'evb-cl-004', slug: 'bape-milo-plush',
      title: 'BAPE Baby Milo Plush', brand: 'BAPE', category: 'collectibles',
      condition: 'Pre-owned — Excellent', price: 18500, compareAt: 26000,
      images: ['/bape-milo-plush.webp'],
      blurb: 'Tags attached, no fading, stitching tight.',
      description: 'A Baby Milo plush with tags still attached and no fading to the fabric. Stitching is tight throughout with no loose seams.',
      details: ['Tags attached', 'No fabric fading', 'Stitching tight, no loose seams', 'Authenticated in-house'],
      variantLabel: null, variants: one(1),
      taxable: true, featured: false, tags: ['bape', 'plush'], sku: 'CL-BP-MLO', squareItemId: null
    },
    {
      id: 'evb-cl-005', slug: 'funko-pop-jordan-figure',
      title: 'Funko Pop — Jordan Figure', brand: 'Funko', category: 'collectibles',
      condition: 'Sealed', price: 6500, compareAt: 9500,
      images: ['/funko-pop-jordan.webp'],
      blurb: 'Box sharp, window clear, never opened.',
      description: 'A sealed Funko Pop with sharp box corners and a clear, uncrushed window. Stored in a protector.',
      details: ['Never opened', 'Box corners sharp', 'Window clear, uncrushed', 'Stored in a protector'],
      variantLabel: null, variants: one(3),
      taxable: true, featured: false, tags: ['funko', 'sealed'], sku: 'CL-FN-JRD', squareItemId: null
    },
    {
      id: 'evb-cl-006', slug: 'vintage-hot-wheels-diecast',
      title: 'Vintage Hot Wheels Diecast', brand: 'Hot Wheels', category: 'collectibles',
      condition: 'Pre-owned — Very Good', price: 8500, compareAt: 14000,
      images: ['/hotwheel.webp'],
      blurb: 'Redline-era casting. Paint strong, wheels free.',
      description: 'A vintage Hot Wheels casting with strong original paint and free-rolling wheels. Base is legible and unrestored.',
      details: ['Original paint, unrestored', 'Wheels roll freely', 'Base legible', 'Verified before listing'],
      variantLabel: null, variants: one(2),
      taxable: true, featured: false, tags: ['hot wheels', 'diecast', 'vintage'], sku: 'CL-HW-VTG', squareItemId: null
    }
  ];

  /* ======================================================================= */
  /* Square adapter                                                          */
  /* ======================================================================= */

  /**
   * Map the Worker's /catalog response into the internal shape.
   * The Worker is expected to return { objects: [...] } straight from Square's
   * ListCatalog / SearchCatalogObjects, with related IMAGE objects included.
   */
  function fromSquare(payload) {
    var objects = (payload && payload.objects) || [];
    var images = {};

    objects.forEach(function (o) {
      if (o.type === 'IMAGE' && o.image_data && o.image_data.url) images[o.id] = o.image_data.url;
    });

    return objects.filter(function (o) { return o.type === 'ITEM'; }).map(function (o) {
      var d = o.item_data || {};
      var vars = (d.variations || []).map(function (v) {
        var vd = v.item_variation_data || {};
        var money = vd.price_money || {};
        return {
          id: v.id,
          label: vd.name || 'Default',
          price: typeof money.amount === 'number' ? money.amount : null,
          // Square returns inventory separately; the Worker folds it in as
          // `stock` on the variation. Absent means "in stock, unknown count".
          stock: typeof v.stock === 'number' ? v.stock : 1,
          squareVariationId: v.id
        };
      });

      var imgs = (d.image_ids || []).map(function (id) { return images[id]; })
        .filter(Boolean);

      // Custom attributes let Square carry the fields Square has no column for.
      var custom = {};
      Object.keys(o.custom_attribute_values || {}).forEach(function (k) {
        var cav = o.custom_attribute_values[k];
        custom[cav.name || k] = cav.string_value || cav.number_value || cav.boolean_value;
      });

      var basePrice = vars.length && vars[0].price != null ? vars[0].price : 0;

      return {
        id: o.id,
        slug: (custom.slug || d.name || o.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title: d.name || 'Untitled',
        brand: custom.brand || '',
        category: (custom.category || (d.category_id ? 'uncategorized' : 'uncategorized')).toLowerCase(),
        condition: custom.condition || '',
        price: basePrice,
        compareAt: custom.compare_at ? Number(custom.compare_at) : null,
        images: imgs.length ? imgs : ['/evblogo.webp'],
        blurb: custom.blurb || '',
        description: d.description || '',
        details: custom.details ? String(custom.details).split('|') : [],
        variantLabel: vars.length > 1 ? (custom.variant_label || 'Option') : null,
        variants: vars.length ? vars : one(1),
        taxable: d.is_taxable !== false,
        featured: custom.featured === true || custom.featured === 'true',
        tags: custom.tags ? String(custom.tags).split(',').map(function (t) { return t.trim(); }) : [],
        sku: (vars[0] && vars[0].sku) || '',
        squareItemId: o.id
      };
    });
  }

  /* ======================================================================= */
  /* Public API                                                              */
  /* ======================================================================= */

  var state = { products: PRODUCTS, source: 'seed', loaded: null };

  function normalize(p) {
    // Fill derived fields once so the rest of the app never recomputes them.
    p.variants = (p.variants && p.variants.length) ? p.variants : one(1);
    p.variants.forEach(function (v) { if (v.price == null) v.price = p.price; });
    p.stock = p.variants.reduce(function (n, v) { return n + (v.stock || 0); }, 0);
    p.minPrice = p.variants.reduce(function (m, v) { return Math.min(m, v.price); }, Infinity);
    p.maxPrice = p.variants.reduce(function (m, v) { return Math.max(m, v.price); }, 0);
    p.images = (p.images && p.images.length) ? p.images : ['/evblogo.webp'];
    p.tags = p.tags || [];
    p.details = p.details || [];
    return p;
  }

  var API = {
    categories: CATEGORIES,

    get source() { return state.source; },
    get products() { return state.products; },

    /**
     * Resolve the catalog. Safe to call repeatedly — the work happens once.
     * Never rejects: a Square failure falls back to the seed catalog so the
     * storefront still renders.
     */
    load: function () {
      if (state.loaded) return state.loaded;

      var cfg = window.EVB_STORE_CONFIG || {};
      var base = (cfg.apiBase || '').replace(/\/$/, '');

      if (!base) {
        state.products = PRODUCTS.map(normalize);
        state.source = 'seed';
        state.loaded = Promise.resolve(state.products);
        return state.loaded;
      }

      state.loaded = fetch(base + '/catalog', { headers: { 'Accept': 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('Catalog HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          var mapped = fromSquare(json).map(normalize);
          if (!mapped.length) throw new Error('Catalog returned no items');
          state.products = mapped;
          state.source = 'square';
          return mapped;
        })
        .catch(function (err) {
          if (window.console) console.warn('[EVB Store] Square catalog unavailable, using local catalog.', err);
          state.products = PRODUCTS.map(normalize);
          state.source = 'seed';
          return state.products;
        });

      return state.loaded;
    },

    byId: function (id) {
      return state.products.filter(function (p) { return p.id === id; })[0] || null;
    },

    bySlug: function (slug) {
      return state.products.filter(function (p) { return p.slug === slug; })[0] || null;
    },

    // Accepts either an id or a slug — product URLs use the slug.
    find: function (key) {
      return API.bySlug(key) || API.byId(key);
    },

    byCategory: function (cat) {
      if (!cat || cat === 'all') return state.products.slice();
      return state.products.filter(function (p) { return p.category === cat; });
    },

    categoryLabel: function (id) {
      var c = CATEGORIES.filter(function (c) { return c.id === id; })[0];
      return c ? c.label : id;
    },

    brands: function () {
      var seen = {};
      state.products.forEach(function (p) { if (p.brand) seen[p.brand] = 1; });
      return Object.keys(seen).sort();
    },

    search: function (q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return state.products.slice();
      var terms = q.split(/\s+/);
      return state.products.filter(function (p) {
        var hay = [p.title, p.brand, p.category, p.condition, p.blurb, (p.tags || []).join(' ')]
          .join(' ').toLowerCase();
        return terms.every(function (t) { return hay.indexOf(t) !== -1; });
      });
    },

    // Same category first, then anything sharing a tag. Never includes self.
    related: function (product, limit) {
      limit = limit || 4;
      if (!product) return [];
      var pool = state.products.filter(function (p) { return p.id !== product.id && p.stock > 0; });
      var scored = pool.map(function (p) {
        var score = 0;
        if (p.category === product.category) score += 10;
        if (p.brand && p.brand === product.brand) score += 6;
        score += (p.tags || []).filter(function (t) { return (product.tags || []).indexOf(t) !== -1; }).length * 3;
        return { p: p, score: score };
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      return scored.slice(0, limit).map(function (s) { return s.p; });
    },

    variant: function (product, variantId) {
      if (!product) return null;
      return product.variants.filter(function (v) { return v.id === variantId; })[0] || product.variants[0];
    }
  };

  window.EVB_CATALOG = API;
})();
