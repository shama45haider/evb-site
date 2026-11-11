"""Write a page for every piece in the store: /store/item/<slug>/index.html.

The store's product page (/store/product/?p=<slug>) is one shell that fills
itself in from Square in the browser, so Google sees an empty page until it
runs the script. Each piece's own page is that same shell with the piece
already filled in: its title, description, price, photos and Product markup
are in the HTML. The page script then loads the live catalog and redraws it
with current stock and price, exactly as on /store/product/.

build_google_feed.py calls write_pages() on every run (every three hours from
the GitHub Action). Pieces that leave the catalog keep their page, marked
noindex with no canonical, so old links still land on the store's "no longer
listed" screen while Google drops them. A piece that comes back gets its full
page again.
"""
import html
import json
import os
import re
from urllib.parse import quote

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://eastvillagebuyers.com"
ITEM_DIR = os.path.join(REPO_ROOT, "store", "item")
TEMPLATE = os.path.join(REPO_ROOT, "store", "product", "index.html")
STORE_CONFIG = os.path.join(REPO_ROOT, "store", "store-config.js")

NOINDEX = '<meta name="robots" content="noindex, follow">'


def item_url(slug):
    return f"{SITE}/store/item/{quote(slug)}/"


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def money(cents):
    return "$" + f"{(cents or 0) / 100:,.2f}"


def slugify(text):
    """store-catalog.js: (slug || name || id).toLowerCase(), runs of anything
    but a-z0-9 become "-", trimmed."""
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


def parse_shipping(value):
    m = re.match(r"^(both|ship|pickup)(?::(free|\d{1,6}))?$", str(value or "").strip())
    if not m:
        return {"delivery": "both", "cents": None}
    if m.group(1) == "pickup" or not m.group(2):
        return {"delivery": m.group(1), "cents": None}
    return {"delivery": m.group(1), "cents": 0 if m.group(2) == "free" else int(m.group(2))}


def standard_days():
    with open(STORE_CONFIG, encoding="utf-8") as f:
        js = f.read()
    m = re.search(r"id:\s*'standard'[^}]*days:\s*'([^']*)'", js)
    d = re.search(r"(\d+)\D+(\d+)", m.group(1) if m else "")
    return (int(d.group(1)), int(d.group(2))) if d else (3, 5)


def pieces(objects, categories):
    """In-stock pieces with photos, in the shape store-catalog.js gives the
    product page (fromSquare + normalize + inStock)."""
    images = {o["id"]: o["image_data"]["url"] for o in objects
              if o.get("type") == "IMAGE" and (o.get("image_data") or {}).get("url")}
    out = []
    for o in objects:
        if o.get("type") != "ITEM" or o.get("is_deleted"):
            continue
        d = o.get("item_data") or {}
        imgs = [images[i] for i in d.get("image_ids") or [] if i in images]
        if not imgs:
            continue  # the feed skips these too; ?p= still shows them
        custom = {}
        for k, v in (o.get("custom_attribute_values") or {}).items():
            custom[v.get("name") or k] = v.get("string_value") or v.get("number_value") or v.get("boolean_value")

        variants = []
        for v in d.get("variations") or []:
            vd = v.get("item_variation_data") or {}
            amount = (vd.get("price_money") or {}).get("amount")
            stock = v.get("stock") if isinstance(v.get("stock"), (int, float)) else 1
            variants.append({"id": v["id"], "label": vd.get("name") or "Default",
                             "price": amount if isinstance(amount, int) else None, "stock": int(stock)})
        if not variants or sum(v["stock"] for v in variants) <= 0:
            continue

        deal = o.get("evb_deal") if (o.get("evb_deal") or {}).get("pct") else None
        list_price = variants[0]["price"] or 0
        if deal:
            for v in variants:
                if v["price"] is not None:
                    v["price"] = (v["price"] * (100 - deal["pct"]) + 50) // 100
        base = variants[0]["price"] or 0
        for v in variants:
            if v["price"] is None:
                v["price"] = base

        title = d.get("name") or "Untitled"
        cat = (custom.get("category") or "uncategorized").lower()
        compare = list_price if deal else (int(float(custom["compare_at"])) if custom.get("compare_at") else None)
        out.append({
            "id": o["id"],
            "slug": slugify(custom.get("slug") or d.get("name") or o["id"]),
            "title": title,
            "brand": custom.get("brand") or "",
            "category": cat,
            "category_label": categories.get(cat, (cat.title(),))[0],
            "condition": custom.get("condition") or "",
            "price": base,
            "compare": compare,
            "deal": deal,
            "images": imgs,
            "blurb": custom.get("blurb") or "",
            "description": d.get("description_plaintext") or d.get("description") or "",
            "details": [x for x in str(custom.get("details") or "").split("|") if x.strip()] if custom.get("details") else [],
            "variant_label": (custom.get("variant_label") or "Option") if len(variants) > 1 else None,
            "variants": variants,
            "taxable": d.get("is_taxable") is not False,
            "shipping": parse_shipping(custom.get("shipping")),
        })
    return out


def first_variant(p):
    return next((v for v in p["variants"] if v["stock"] > 0), p["variants"][0])


def detail(details, name):
    prefix = name.lower() + ":"
    return next((x.strip()[len(prefix):].strip() for x in details if x.strip().lower().startswith(prefix)), "")


GENDER = {"men's": "male", "women's": "female", "unisex": "unisex"}


def product_ld(p, shipping):
    """The markup injectSeo() in store/product/index.html builds, so the page
    and the live redraw agree."""
    standard, threshold, cap = shipping
    v = first_variant(p)
    price = v["price"]
    details = [x.strip() for x in p["details"]]
    cond = p["condition"]
    is_new = not re.search(r"pre-?owned|used|worn", cond, re.I) and re.search(r"\bnew\b|deadstock|sealed", cond, re.I)
    offer = {
        "@type": "Offer",
        "url": item_url(p["slug"]),
        "priceCurrency": "USD",
        "price": f"{price / 100:.2f}",
        "availability": "https://schema.org/InStock",
        "seller": {"@type": "Store", "name": "East Village Buyers"},
        "hasMerchantReturnPolicy": {
            "@type": "MerchantReturnPolicy",
            "applicableCountry": "US",
            "returnPolicyCategory": "https://schema.org/MerchantReturnNotPermitted",
            "merchantReturnLink": f"{SITE}/return-policy/",
        },
    }
    if p["deal"] and p["deal"].get("ends"):
        offer["priceValidUntil"] = str(p["deal"]["ends"])[:10]
    if p["shipping"]["delivery"] != "pickup":
        cost = p["shipping"]["cents"] if p["shipping"]["cents"] is not None else standard
        if threshold and price >= threshold:
            cost = max(0, cost - cap)
        lo, hi = standard_days()
        offer["shippingDetails"] = {
            "@type": "OfferShippingDetails",
            "shippingRate": {"@type": "MonetaryAmount", "value": f"{cost / 100:.2f}", "currency": "USD"},
            "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "US"},
            "deliveryTime": {
                "@type": "ShippingDeliveryTime",
                "handlingTime": {"@type": "QuantitativeValue", "minValue": 0, "maxValue": 1, "unitCode": "DAY"},
                "transitTime": {"@type": "QuantitativeValue", "minValue": lo, "maxValue": hi, "unitCode": "DAY"},
            },
        }
    ref = next((x[4:].strip() for x in details if re.match(r"^ref\s", x, re.I)), "")
    ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p["title"],
        "description": p["description"],
        "image": [i if re.match(r"^https?:", i) else SITE + i for i in p["images"]],
        "sku": ref or p["id"],
        "itemCondition": "https://schema.org/NewCondition" if is_new else "https://schema.org/UsedCondition",
        "offers": offer,
    }
    if p["brand"]:
        ld["brand"] = {"@type": "Brand", "name": p["brand"]}
    if detail(details, "color"):
        ld["color"] = detail(details, "color")
    multi = len(p["variants"]) > 1
    size = v["label"] if multi else detail(details, "size") or ("" if re.match(r"^(default|regular)?$", v["label"], re.I) else v["label"])
    if size:
        ld["size"] = size
    gender = next((GENDER[x.lower().replace("’", "'")] for x in details if x.lower().replace("’", "'") in GENDER), None)
    if gender:
        ld["audience"] = {"@type": "PeopleAudience", "suggestedGender": gender}
    # "</" can't appear inside a <script> block
    return json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")


def acc_item(title, body, is_open=False):
    return (f'<div class="evb-acc-item{" is-open" if is_open else ""}">'
            f'<button type="button" class="evb-acc-btn">{title}'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
            f'</button><div class="evb-acc-panel">{body}</div></div>')


def pdp_html(p):
    """What render() in store/product/index.html draws for the first in-stock
    option, so the live redraw doesn't shift the page."""
    v = first_variant(p)
    price = v["price"]
    save = round((1 - price / p["compare"]) * 100) if p["compare"] and p["compare"] > price else 0
    badges = ""
    if save >= 5:
        badges += f'<span class="evb-badge evb-badge--save">{save}% off</span>'
    if p["condition"] in ("Deadstock", "Sealed"):
        badges += f'<span class="evb-badge evb-badge--ds">{esc(p["condition"])}</span>'
    thumbs = ""
    if len(p["images"]) > 1:
        thumbs = '<div class="evb-gallery-thumbs">' + "".join(
            f'<button type="button" class="evb-thumb{" is-active" if i == 0 else ""}" data-img="{i}" aria-label="View image {i + 1}">'
            f'<img src="{esc(src)}" alt="" loading="lazy" decoding="async"></button>' for i, src in enumerate(p["images"])) + "</div>"
    n = v["stock"]
    pill = ('<span class="evb-pill evb-pill--low">Last one</span>' if n == 1 else
            f'<span class="evb-pill evb-pill--low">Only {n} left</span>' if n <= 3 else
            '<span class="evb-pill evb-pill--stock">In stock</span>')
    variant_block = ""
    if p["variant_label"]:
        variant_block = ('<div class="evb-field"><div class="evb-field-label"><span>' + esc(p["variant_label"]) + "</span>"
                         + ('<span class="hint">Sold-out options are struck through</span>' if len(p["variants"]) > 1 else "")
                         + '</div><div class="evb-variants">' + "".join(
                             f'<button type="button" class="evb-variant{" is-active" if o["id"] == v["id"] else ""}"'
                             f'{"" if o["stock"] else " disabled"} data-variant="{esc(o["id"])}">{esc(o["label"])}</button>'
                             for o in p["variants"]) + "</div></div>")
    tax = ("Sales tax calculated at checkout. Free in-store pickup at 39 Avenue A." if p["taxable"]
           else "Investment bullion — no sales tax. Priced against live spot at the time your order is accepted.")
    acc = acc_item("Description", f'<p>{esc(p["description"])}</p>', True)
    if p["details"]:
        acc += acc_item("Details &amp; condition", "<ul>" + "".join(f"<li>{esc(d)}</li>" for d in p["details"]) + "</ul>")
    acc += acc_item("Shipping &amp; pickup", "<p>Free pickup at 39 Avenue A, New York, NY 10009 — usually ready the same day during store hours. Shipping is insured and requires a signature on delivery: standard is 3–5 business days, express 1–2.</p>")
    acc += acc_item("Questions about this piece",
                    "<p>Text 917-608-8939 and ask. If you want more photos, measurements, a weight, or the movement timing on a watch, we will send them before you buy.</p>"
                    f'<p style="margin-top:12px"><a href="sms:9176088939" style="color:var(--evb-orange);font-weight:800">Text us about {esc(p["title"])}</a></p>')
    shield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>'
    house = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>'
    return (
        '<div class="evb-pdp"><div><div class="evb-gallery-main">'
        + (f'<div class="evb-gallery-badges">{badges}</div>' if badges else "")
        + f'<img id="galleryMain" src="{esc(p["images"][0])}" alt="{esc(p["title"])}" fetchpriority="high" decoding="async"></div>{thumbs}</div>'
        + "<div>"
        + (f'<p class="evb-pdp-brand">{esc(p["brand"])}</p>' if p["brand"] else "")
        + f'<h1 class="evb-pdp-title">{esc(p["title"])}</h1>'
        + f'<div class="evb-pdp-meta">{pill}' + (f'<span class="evb-pill">{esc(p["condition"])}</span>' if p["condition"] else "") + "</div>"
        + f'<div class="evb-pdp-price-row"><span class="evb-pdp-price">{money(price)}</span>'
        + (f'<span class="evb-pdp-compare">{money(p["compare"])}</span>' if p["compare"] and p["compare"] > price else "")
        + (f'<span class="evb-pdp-save">Save {money(p["compare"] - price)}</span>' if save >= 5 else "")
        + f'</div><p class="evb-pdp-tax">{tax}</p>'
        + variant_block
        + '<div class="evb-field"><div class="evb-field-label"><span>Quantity</span>'
        + (f'<span class="hint">{n} available</span>' if n <= 5 else "")
        + '</div><div class="evb-qty"><button type="button" class="evb-qty-btn" id="qtyDown" aria-label="Decrease quantity" disabled>&minus;</button>'
        + '<span class="evb-qty-val" id="qtyVal">1</span>'
        + f'<button type="button" class="evb-qty-btn" id="qtyUp" aria-label="Increase quantity"{" disabled" if n <= 1 else ""}>+</button></div></div>'
        + '<div class="evb-pdp-actions"><button type="button" class="evb-btn evb-btn--primary" id="addBtn">Add to bag</button>'
        + '<button type="button" class="evb-btn evb-btn--ghost" id="buyBtn">Buy it now</button></div>'
        + '<div class="evb-assure">'
        + f'<div class="evb-assure-item">{shield}<div><p class="evb-assure-title">Authenticated in-house</p><p class="evb-assure-sub">Verified at 39 Avenue A before it was listed. We buy for cash, so being right is the business.</p></div></div>'
        + f'<div class="evb-assure-item">{house}<div><p class="evb-assure-title">Free same-day pickup</p><p class="evb-assure-sub">Collect at the counter during store hours, or have it shipped insured with signature on delivery.</p></div></div>'
        + "</div>"
        + f'<div class="evb-acc">{acc}</div>'
        + "</div></div>")


def crumbs_html(p):
    return ('<a href="/">Home</a><span class="sep">/</span><a href="/store/">Store</a><span class="sep">/</span>'
            f'<a href="/store/?c={quote(p["category"])}">{esc(p["category_label"])}</a>'
            f'<span class="sep">/</span><span class="current">{esc(p["title"])}</span>')


def render_page(template, p, shipping):
    url = item_url(p["slug"])
    # The panel's blurb or description is often a few words ("Brand new with
    # tags"), so the search snippet also says what the piece is and where.
    about = (p["blurb"] or p["description"]).strip()
    if about and not about.endswith((".", "!", "?")):
        about += "."
    desc = f'{about} {p["title"]} at East Village Buyers, 39 Avenue A, New York. Pick up the same day or have it shipped insured.'.strip()[:300]
    title = f'{p["title"]} | East Village Buyers Store'
    nl = "\r\n" if "\r\n" in template else "\n"
    head = nl.join([
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:type" content="product">',
        '<meta property="og:site_name" content="East Village Buyers">',
        f'<meta property="og:title" content="{esc(p["title"])}">',
        f'<meta property="og:description" content="{esc(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{esc(p["images"][0])}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<script type="application/ld+json" id="pdpLd">{product_ld(p, shipping)}</script>',
        f'<script>window.EVB_PDP_SLUG = {json.dumps(p["slug"])};</script>',
    ])
    t = template
    t = t.replace("<title>Product | East Village Buyers Store</title>", f"<title>{esc(title)}</title>", 1)
    t = re.sub(r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{esc(desc)}">', t, count=1)
    t, n1 = re.subn(r"<!-- No canonical here:.*?-->", lambda m: head, t, count=1, flags=re.S)
    t, n2 = re.subn(r'<nav class="evb-crumbs" id="crumbs" aria-label="Breadcrumb"></nav>',
                    lambda m: f'<nav class="evb-crumbs" id="crumbs" aria-label="Breadcrumb">{crumbs_html(p)}</nav>', t, count=1)
    t, n3 = re.subn(r'(<div id="pdpHost">).*?(\r?\n  </div>\r?\n</main>)',
                    lambda m: m.group(1) + pdp_html(p) + m.group(2), t, count=1, flags=re.S)
    if not (n1 and n2 and n3):
        raise SystemExit("store/product/index.html changed shape: item pages can't be built from it")
    return t


def retire(text):
    """A piece that left the catalog: keep the page for old links, but drop
    its canonical and keep it out of Google."""
    if NOINDEX in text:
        return text
    nl = "\r\n" if "\r\n" in text else "\n"
    text = re.sub(r'<link rel="canonical" href="[^"]*">\r?\n', "", text, count=1)
    return text.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">' + nl + NOINDEX, 1)


def write_pages(objects, categories, shipping, check=False):
    """Write or refresh every piece's page. Returns (slugs in stock, paths
    that were out of date)."""
    with open(TEMPLATE, encoding="utf-8", newline="") as f:
        template = f.read()
    items = pieces(objects, categories)
    stale = []
    live = set()
    for p in items:
        live.add(p["slug"])
        path = os.path.join(ITEM_DIR, p["slug"], "index.html")
        new = render_page(template, p, shipping)
        old = open(path, encoding="utf-8", newline="").read() if os.path.exists(path) else None
        if new != old:
            stale.append(path)
            if not check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(new)
    if os.path.isdir(ITEM_DIR):
        for slug in sorted(os.listdir(ITEM_DIR)):
            path = os.path.join(ITEM_DIR, slug, "index.html")
            if slug in live or not os.path.exists(path):
                continue
            old = open(path, encoding="utf-8", newline="").read()
            new = retire(old)
            if new != old:
                stale.append(path)
                if not check:
                    with open(path, "w", encoding="utf-8", newline="") as f:
                        f.write(new)
    return sorted(live), stale
