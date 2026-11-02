#!/usr/bin/env python3
"""Build the Google Merchant Center feeds from the live Square catalog.

Two feeds, which Merchant Center fetches once a day, and a sitemap:

  store/google-products.xml         every piece in stock, linked to its page
                                    on the site (free listings in Google
                                    Search, Shopping and Images)
  store/google-local-inventory.xml  the same pieces as stock at 39 Avenue A
                                    (free local listings: "In stock" on the
                                    Maps listing and in "near me" searches)
  store/sitemap-products.xml        every in-stock piece's page, so Google
                                    Search crawls them (listed in robots.txt)

The catalog comes from the evb-square Worker's /catalog, the same call the
storefront makes, so prices (this week's deals included), stock and the
panel's custom attributes match what the site shows. Sold pieces drop out.
If the Worker can't be reached nothing is written, so the last good feed
stays up.

A GitHub Action (.github/workflows/update-store-feed.yml) runs this every
few hours and commits the feeds when they change.

Usage: python scripts/build_google_feed.py [--check]
  --check  exit 1 if either feed is out of date, without writing.
"""
import html
import json
import os
import re
import sys
import urllib.request
from urllib.parse import quote

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://eastvillagebuyers.com"
CATALOG_URL = "https://evb-square.shama45haider.workers.dev/catalog"
PRODUCTS_FEED = os.path.join(REPO_ROOT, "store", "google-products.xml")
LOCAL_FEED = os.path.join(REPO_ROOT, "store", "google-local-inventory.xml")
PRODUCTS_SITEMAP = os.path.join(REPO_ROOT, "store", "sitemap-products.xml")
STORE_CONFIG = os.path.join(REPO_ROOT, "store", "store-config.js")

# Must match the store code on the Google Business Profile, which is how
# Merchant Center knows the local stock is at 39 Avenue A.
STORE_CODE = "EVB-AVE-A"

# The storefront's departments (CATEGORIES in store/store-catalog.js): the
# label shoppers see, Google's product category, and whether Google treats it
# as clothing (which wants a size and an age group).
CATEGORIES = {
    "sneakers":     ("Sneakers", "Apparel & Accessories > Shoes", True),
    "watches":      ("Watches", "Apparel & Accessories > Jewelry > Watches", False),
    "jewelry":      ("Jewelry", "Apparel & Accessories > Jewelry", False),
    "gold":         ("Gold & Bullion", "Arts & Entertainment > Hobbies & Creative Arts > Collectibles", False),
    "streetwear":   ("Streetwear", "Apparel & Accessories > Clothing", True),
    "designer":     ("Designer", "Apparel & Accessories > Handbags, Wallets & Cases", False),
    "electronics":  ("Electronics", "Electronics", False),
    "collectibles": ("Collectibles", "Arts & Entertainment > Hobbies & Creative Arts > Collectibles", False),
}


def shipping_config():
    """Standard rate, free-shipping threshold and offer cap from store-config.js."""
    with open(STORE_CONFIG, encoding="utf-8") as f:
        js = f.read()
    standard = re.search(r"id:\s*'standard'[^}]*amount:\s*(\d+)", js)
    threshold = re.search(r"freeShippingThreshold:\s*(\d+)", js)
    cap = re.search(r"shippingOfferCap:\s*(\d+)", js)
    if not (standard and threshold and cap):
        sys.exit("store-config.js: couldn't find the shipping settings")
    return int(standard.group(1)), int(threshold.group(1)), int(cap.group(1))


def fetch_catalog():
    req = urllib.request.Request(CATALOG_URL, headers={
        "Accept": "application/json",
        "User-Agent": "evb-google-feed (+https://eastvillagebuyers.com)",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("objects") or []


def parse_shipping(value):
    """The panel's `shipping` attribute, read the way store-catalog.js does."""
    m = re.match(r"^(both|ship|pickup)(?::(free|\d{1,6}))?$", str(value or "").strip())
    if not m:
        return "both", None
    if m.group(1) == "pickup" or not m.group(2):
        return m.group(1), None
    return m.group(1), 0 if m.group(2) == "free" else int(m.group(2))


def condition(text):
    t = (text or "").lower()
    if re.search(r"pre-?owned|used|worn", t):
        return "used"
    if re.search(r"\bnew\b|deadstock|sealed", t):
        return "new"
    return "used"


def money(cents):
    return f"{cents / 100:.2f} USD"


def deal_price(cents, pct):
    # Math.round, as store-catalog.js and the Worker round it.
    return (cents * (100 - pct) + 50) // 100


def products(objects):
    """One entry per in-stock variation, in the shape the feeds need."""
    images = {o["id"]: o["image_data"]["url"] for o in objects
              if o.get("type") == "IMAGE" and (o.get("image_data") or {}).get("url")}
    out = []
    for o in objects:
        if o.get("type") != "ITEM" or o.get("is_deleted"):
            continue
        d = o.get("item_data") or {}
        custom = {}
        for k, v in (o.get("custom_attribute_values") or {}).items():
            custom[v.get("name") or k] = v.get("string_value") or v.get("number_value") or v.get("boolean_value")
        imgs = [images[i] for i in d.get("image_ids") or [] if i in images]
        if not imgs:
            continue

        title = re.sub(r"\s+", " ", d.get("name") or "").strip()
        slug = re.sub(r"[^a-z0-9]+", "-", (custom.get("slug") or title or o["id"]).lower()).strip("-")
        cat = (custom.get("category") or "").lower()
        label, google_cat, apparel = CATEGORIES.get(cat, ("", "", False))
        details = [x.strip() for x in str(custom.get("details") or "").split("|") if x.strip()]
        size_detail = next((x.split(":", 1)[1].strip() for x in details if x.lower().startswith("size:")), "")
        about = " ".join(p.rstrip(".") + "." for p in
                         [d.get("description_plaintext") or d.get("description") or custom.get("blurb") or title]
                         + [x for x in details if not x.lower().startswith("ref ")])
        about += " Checked in-house at East Village Buyers, 39 Avenue A, New York. Pick up the same day or have it shipped insured."
        delivery, ship_cents = parse_shipping(custom.get("shipping"))
        pct = (o.get("evb_deal") or {}).get("pct")

        variations = d.get("variations") or []
        for v in variations:
            vd = v.get("item_variation_data") or {}
            stock = v.get("stock") if isinstance(v.get("stock"), (int, float)) else 1
            price = (vd.get("price_money") or {}).get("amount")
            if stock <= 0 or not price:
                continue
            name = (vd.get("name") or "").strip()
            multi = len(variations) > 1
            size = name if multi else size_detail or ("" if name.lower() in ("", "default", "regular") else name)
            link = f"{SITE}/store/product/?p={quote(slug)}" + (f"&v={quote(v['id'])}" if multi else "")
            out.append({
                "id": vd.get("sku") or v["id"],
                "group": o["id"] if multi else None,
                "title": (f"{title} / {name}" if multi else title)[:150],
                "description": about[:5000],
                "link": link,
                "images": imgs[:11],
                "price": price,
                "sale": deal_price(price, pct) if pct else None,
                "stock": int(stock),
                "condition": condition(custom.get("condition")),
                "brand": (custom.get("brand") or "").strip(),
                "product_type": label,
                "google_category": google_cat,
                "apparel": apparel,
                "size": size,
                "delivery": delivery,
                "ship_cents": ship_cents,
            })
    return sorted(out, key=lambda p: p["id"])


def tag(name, value):
    return f"<g:{name}>{html.escape(str(value), quote=False)}</g:{name}>"


def products_xml(items, shipping):
    standard, threshold, cap = shipping
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
           "<channel>",
           "<title>East Village Buyers</title>",
           f"<link>{SITE}/store/</link>",
           "<description>Authenticated streetwear, sneakers, watches, jewelry and electronics at 39 Avenue A, New York.</description>"]
    for p in items:
        out.append("<item>")
        out.append(tag("id", p["id"]))
        if p["group"]:
            out.append(tag("item_group_id", p["group"]))
        out.append(tag("title", p["title"]))
        out.append(tag("description", p["description"]))
        out.append(tag("link", p["link"]))
        out.append(tag("image_link", p["images"][0]))
        for img in p["images"][1:]:
            out.append(tag("additional_image_link", img))
        out.append(tag("availability", "in_stock"))
        out.append(tag("price", money(p["price"])))
        if p["sale"] is not None:
            out.append(tag("sale_price", money(p["sale"])))
        out.append(tag("condition", p["condition"]))
        if p["brand"]:
            out.append(tag("brand", p["brand"]))
        out.append(tag("identifier_exists", "no"))
        if p["product_type"]:
            out.append(tag("product_type", p["product_type"]))
        if p["google_category"]:
            out.append(tag("google_product_category", p["google_category"]))
        if p["apparel"]:
            out.append(tag("age_group", "adult"))
            if p["size"]:
                out.append(tag("size", p["size"]))
        if p["delivery"] == "pickup":
            # Pickup only: list it as in-store stock, not as something to order online.
            out.append(tag("excluded_destination", "Free_listings"))
        else:
            cost = standard if p["ship_cents"] is None else p["ship_cents"]
            if (p["sale"] or p["price"]) >= threshold:
                cost = max(0, cost - cap)
            out.append(f"<g:shipping>{tag('country', 'US')}{tag('service', 'Standard')}{tag('price', money(cost))}</g:shipping>")
        if p["delivery"] != "ship":
            out.append(tag("pickup_method", "buy"))
            out.append(tag("pickup_sla", "same day"))
        out.append("</item>")
    out += ["</channel>", "</rss>"]
    return "\n".join(out) + "\n"


def local_xml(items):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
           "<channel>",
           "<title>East Village Buyers, 39 Avenue A</title>",
           f"<link>{SITE}/store/</link>",
           "<description>In-store stock at 39 Avenue A, New York, NY 10009.</description>"]
    for p in items:
        if p["delivery"] == "ship":
            continue  # ships only, so it isn't on the shelf
        out.append("<item>")
        out.append(tag("store_code", STORE_CODE))
        out.append(tag("id", p["id"]))
        out.append(tag("availability", "in_stock"))
        out.append(tag("quantity", p["stock"]))
        out.append(tag("price", money(p["price"])))
        if p["sale"] is not None:
            out.append(tag("sale_price", money(p["sale"])))
        out.append(tag("pickup_method", "buy"))
        out.append(tag("pickup_sla", "same day"))
        out.append("</item>")
    out += ["</channel>", "</rss>"]
    return "\n".join(out) + "\n"


def sitemap_xml(items):
    """Each in-stock piece's page, once (sizes share a page), for Google
    Search. robots.txt points to it beside the main sitemap; sold pieces drop
    out on the next run."""
    pages = {}
    for p in items:
        url = p["link"].split("&v=")[0]
        pages.setdefault(url, p["images"][0])
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
           '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for url, img in sorted(pages.items()):
        out.append("  <url>")
        out.append(f"    <loc>{html.escape(url, quote=False)}</loc>")
        out.append("    <changefreq>daily</changefreq>")
        out.append(f"    <image:image><image:loc>{html.escape(img, quote=False)}</image:loc></image:image>")
        out.append("  </url>")
    out.append("</urlset>")
    return "\n".join(out) + "\n"


def main():
    check = "--check" in sys.argv[1:]
    try:
        objects = fetch_catalog()
    except Exception as e:  # keep the last good feed
        sys.exit(f"couldn't load the catalog from {CATALOG_URL}: {e}")

    items = products(objects)
    feeds = {PRODUCTS_FEED: products_xml(items, shipping_config()), LOCAL_FEED: local_xml(items),
             PRODUCTS_SITEMAP: sitemap_xml(items)}
    print(f"{len(items)} pieces in stock")
    for p in items:
        print(f"  {p['id']:<14} {money(p['sale'] or p['price']):>12}  {p['title']}")

    stale = []
    for path, xml in feeds.items():
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if xml != old:
            stale.append(path)
            if not check:
                with open(path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(xml)
    for path in stale:
        print(("out of date " if check else "wrote ") + os.path.relpath(path, REPO_ROOT).replace(os.sep, "/"))
    if check:
        sys.exit(1 if stale else 0)


if __name__ == "__main__":
    main()
