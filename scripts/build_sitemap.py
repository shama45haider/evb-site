#!/usr/bin/env python3
"""Rebuild sitemap.xml from the pages in the repo.

Lists every page Google may index: an index.html that is not a meta-refresh
redirect, has no static noindex and whose canonical points at itself. Old
WordPress redirects, cart/checkout and the like drop out on their own.

<lastmod> is the date of the last commit that changed what the page says (its
title, description, H1 or main content), read from git history. Commits that
only touched the nav, footer, scripts or styles don't count, so a site-wide
nav change doesn't mark every page as new. Uncommitted content changes count
as today.

Each URL also lists the images in its content (and its share image) so they
can show up in Google Images.

Existing entries keep their place, changefreq and priority, so the panel's
insert/remove of blog posts keeps working. Store products are left out: they
load from Square in the browser and sell one at a time.

Usage: python scripts/build_sitemap.py [--check]
  --check  print what would change and exit 1 if the sitemap is out of date.
"""
import datetime
import hashlib
import html
import os
import re
import subprocess
import sys
from urllib.parse import quote, urljoin, urlparse

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://eastvillagebuyers.com"
SITEMAP = os.path.join(REPO_ROOT, "sitemap.xml")

SKIP_DIRS = {".git", ".claude", ".github", ".well-known", "node_modules", "scripts", "shopify-theme"}

# Indexable on paper but not real pages: the product page is an empty shell
# until ?id= picks a product, and turns itself noindex when there isn't one.
SKIP_URLS = {"/store/product/"}

# Pages on other hosts that belong in the sitemap: (url, changefreq,
# priority). Google only takes these when the host is verified with this
# site in Search Console (a Domain property for eastvillagebuyers.com covers
# its subdomains). No <lastmod>: the repo can't see when they change.
OUTSIDE_URLS = [
    # The jewelry catalog on Gembox, linked from the home page (2026-11-02).
    ("https://shop.eastvillagebuyers.com/catalog/ThZ7AuRQai", "weekly", "0.8"),
]

# Defaults for pages the sitemap doesn't list yet.
DEFAULT_BLOG = ("monthly", "0.7")
DEFAULT_PAGE = ("monthly", "0.8")

# Site chrome images that aren't page content.
SKIP_IMAGES = re.compile(r"(evblogo|evbbanner|favicon|apple-touch-icon|android-chrome)", re.I)


def page_url(rel_path):
    rel = rel_path.replace(os.sep, "/")
    return "/" + rel[: -len("index.html")]


def first(pattern, text):
    m = re.search(pattern, text, re.I | re.S)
    return m.group(1) if m else None


def is_indexable(text, url):
    if re.search(r'<meta[^>]+http-equiv=["\']refresh', text, re.I):
        return False
    robots = first(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\']([^"\']*)', text)
    if robots and "noindex" in robots.lower():
        return False
    canonical = first(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', text)
    return canonical is None or canonical.replace(SITE, "") == url


def content_region(text):
    """The page's own content: the article if there is one, else main, else body."""
    return (first(r"<article[^>]*>(.*)</article>", text)
            or first(r"<main[^>]*>(.*)</main>", text)
            or first(r"<body[^>]*>(.*)</body>", text)
            or text)


def fingerprint(text):
    """What the page says, ignoring nav, footer, scripts and styles."""
    region = content_region(text)
    region = re.sub(r"(?is)<(script|style|noscript|svg|nav|header|footer)[^>]*>.*?</\1>", " ", region)
    words = re.sub(r"\s+", " ", re.sub(r"(?s)<[^>]+>", " ", region)).strip()
    parts = [
        first(r"<title[^>]*>(.*?)</title>", text) or "",
        first(r'<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']*)', text) or "",
        first(r"<h1[^>]*>(.*?)</h1>", text) or "",
        words,
    ]
    return hashlib.sha1("\x00".join(parts).encode("utf-8")).hexdigest()


def git(*args, stdin=None):
    return subprocess.run(["git", *args], cwd=REPO_ROOT, input=stdin,
                          capture_output=True, check=True).stdout


def blob_texts(blob_ids):
    """Read many blobs in one git process."""
    out = {}
    ids = sorted(set(blob_ids))
    if not ids:
        return out
    raw = git("cat-file", "--batch", stdin=("\n".join(ids) + "\n").encode())
    pos = 0
    for _ in ids:
        header_end = raw.index(b"\n", pos)
        sha, _kind, size = raw[pos:header_end].decode().split()
        start = header_end + 1
        out[sha] = raw[start:start + int(size)].decode("utf-8", "ignore")
        pos = start + int(size) + 1
    return out


def content_dates(paths):
    """Date of the newest commit that changed each page's content."""
    log = git("log", "--format=C %ad", "--date=short", "--raw", "--no-abbrev",
              "--no-renames", "--", *paths).decode("utf-8", "ignore")
    history = {p: [] for p in paths}  # newest first: (date, blob)
    date = None
    for line in log.splitlines():
        if line.startswith("C "):
            date = line[2:].strip()
        elif line.startswith(":"):
            meta, path = line.split("\t", 1)
            path = path.strip().strip('"')
            blob = meta.split()[3]
            if path in history and set(blob) != {"0"}:
                history[path].append((date, blob))
    texts = blob_texts(b for revs in history.values() for _, b in revs)
    today = datetime.date.today().isoformat()
    dates = {}
    for path, revs in history.items():
        with open(os.path.join(REPO_ROOT, path), encoding="utf-8-sig") as f:
            current = fingerprint(f.read())
        if not revs or fingerprint(texts[revs[0][1]]) != current:
            dates[path] = today  # uncommitted content change
            continue
        dates[path] = revs[-1][0]
        for (newer_date, newer), (_, older) in zip(revs, revs[1:]):
            if fingerprint(texts[newer]) != fingerprint(texts[older]):
                dates[path] = newer_date
                break
    return dates


def page_images(text, url):
    found = []
    share = first(r'<meta[^>]+property=["\']og:image["\'][^>]*content=["\']([^"\']+)', text)
    srcs = ([share] if share else []) + re.findall(r'<img[^>]+src=["\']([^"\']+)', content_region(text), re.I)
    for src in srcs:
        absolute = urljoin(SITE + url, html.unescape(src).split("?")[0])
        parsed = urlparse(absolute)
        if parsed.netloc != urlparse(SITE).netloc or SKIP_IMAGES.search(parsed.path):
            continue
        if not re.search(r"\.(jpe?g|png|webp|avif)$", parsed.path, re.I):
            continue
        local = os.path.join(REPO_ROOT, *parsed.path.lstrip("/").split("/"))
        loc = SITE + quote(parsed.path, safe="/%")
        if os.path.exists(local) and loc not in found:
            found.append(loc)
    return found


def existing_entries():
    if not os.path.exists(SITEMAP):
        return []
    with open(SITEMAP, encoding="utf-8") as f:
        xml = f.read()
    entries = []
    for block in re.findall(r"<url>(.*?)</url>", xml, re.S):
        entries.append((
            html.unescape(first(r"<loc>(.*?)</loc>", block)).replace(SITE, ""),
            first(r"<changefreq>(.*?)</changefreq>", block),
            first(r"<priority>(.*?)</priority>", block),
        ))
    return entries


def main():
    check = "--check" in sys.argv[1:]

    pages = {}
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        if "index.html" not in filenames:
            continue
        rel = os.path.relpath(os.path.join(dirpath, "index.html"), REPO_ROOT).replace(os.sep, "/")
        url = page_url(rel)
        with open(os.path.join(REPO_ROOT, rel), encoding="utf-8-sig") as f:
            text = f.read()
        if url not in SKIP_URLS and is_indexable(text, url):
            pages[url] = (rel, text)

    dates = content_dates([rel for rel, _ in pages.values()])

    order, settings = [], {}
    for url, freq, prio in existing_entries():
        if url in pages and url not in settings:
            order.append(url)
            settings[url] = (freq, prio)
    added = sorted(u for u in pages if u not in settings)
    dropped = sorted({u for u, _, _ in existing_entries()} - set(pages) - {u for u, _, _ in OUTSIDE_URLS})
    for url in added:
        order.append(url)
        settings[url] = DEFAULT_BLOG if url.startswith("/blog/") else DEFAULT_PAGE

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
           '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
           ""]
    images_total = 0
    for url in order:
        rel, text = pages[url]
        freq, prio = settings[url]
        out.append("  <url>")
        out.append(f"    <loc>{html.escape(SITE + url, quote=False)}</loc>")
        out.append(f"    <lastmod>{dates[rel]}</lastmod>")
        if freq:
            out.append(f"    <changefreq>{freq}</changefreq>")
        if prio:
            out.append(f"    <priority>{prio}</priority>")
        for img in page_images(text, url):
            out.append(f"    <image:image><image:loc>{html.escape(img, quote=False)}</image:loc></image:image>")
            images_total += 1
        out.append("  </url>")
    for url, freq, prio in OUTSIDE_URLS:
        out.append("  <url>")
        out.append(f"    <loc>{html.escape(url, quote=False)}</loc>")
        out.append(f"    <changefreq>{freq}</changefreq>")
        out.append(f"    <priority>{prio}</priority>")
        out.append("  </url>")
    out.append("</urlset>")
    xml = "\n".join(out) + "\n"

    with open(SITEMAP, encoding="utf-8") as f:
        old = f.read()
    print(f"{len(order)} pages, {images_total} images")
    for url in added:
        print(f"  added   {url}")
    for url in dropped:
        print(f"  dropped {url}")
    if check:
        print("sitemap.xml is up to date" if xml == old else "sitemap.xml is out of date")
        sys.exit(0 if xml == old else 1)
    if xml != old:
        with open(SITEMAP, "w", encoding="utf-8", newline="\n") as f:
            f.write(xml)
        print("wrote sitemap.xml")


if __name__ == "__main__":
    main()
