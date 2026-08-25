#!/usr/bin/env python3
"""Refresh the Google review count/rating shown on the site.

Fetches the live rating and review count for East Village Buyers from the
Google Places API (New) and rewrites every hardcoded occurrence in the HTML
files listed in FILES. Run with --set COUNT RATING to skip the API and write
explicit values (used for local/manual updates).

Requires the GOOGLE_PLACES_API_KEY environment variable unless --set is used.
"""
import json
import os
import re
import sys
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files that display the Google review count/rating.
FILES = [
    "index.html",
    os.path.join("reviews", "index.html"),
    os.path.join("we-buy-sneakers-nyc", "index.html"),
]

SEARCH_QUERY = "East Village Buyers, 39 Avenue A, New York, NY 10009"
EXPECTED_NAME = "east village buyers"

# A 3-4 digit number directly before "reviews" / "Google reviews" / "Reviews on Google".
COUNT_PATTERNS = [
    r"\d{3,4}(?=\s+(?:Google\s+)?[Rr]eviews\b)",
    r"(?<=[Ff]rom )\d{3,4}(?=\s+Customers\b)",
]

# Ratings in prose ("4.9 stars", "4.9/5", "4.9 out of 5") and in the score badges.
RATING_PROSE_PATTERNS = [
    r"\d\.\d(?=\s*/5\b)",
    r"\d\.\d(?=\s+[Ss]tars\b)",
    r"\d\.\d(?=\s+out of 5\b)",
]
RATING_BADGE_PATTERNS = [
    r'(class="gts-score">)\d\.\d(?=<)',
    r'(class="rv-score-num">)\d\.\d(?=<)',
]


def fetch_from_places_api(api_key):
    req = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps({"textQuery": SEARCH_QUERY}).encode(),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    places = data.get("places", [])
    if not places:
        sys.exit("Places API returned no results for query: " + SEARCH_QUERY)
    place = places[0]
    name = place.get("displayName", {}).get("text", "")
    if EXPECTED_NAME not in name.lower():
        sys.exit(f"Top search result is '{name}', not East Village Buyers — aborting without changes.")
    count = place.get("userRatingCount")
    rating = place.get("rating")
    print(f"Matched place: {name} ({place.get('id')}) — rating {rating}, {count} reviews")
    return count, rating


def apply(html, count, rating):
    for pat in COUNT_PATTERNS:
        html = re.sub(pat, str(count), html)
    for pat in RATING_PROSE_PATTERNS:
        html = re.sub(pat, rating, html)
    for pat in RATING_BADGE_PATTERNS:
        html = re.sub(pat, lambda m: m.group(1) + rating, html)
    return html


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--set":
        count, rating = int(sys.argv[2]), float(sys.argv[3])
    else:
        api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")
        if not api_key:
            sys.exit("GOOGLE_PLACES_API_KEY is not set (or pass --set COUNT RATING).")
        count, rating = fetch_from_places_api(api_key)

    # Sanity guard: refuse implausible values rather than write garbage to the site.
    if not count or count < 100 or not rating or not (3.5 <= float(rating) <= 5.0):
        sys.exit(f"Implausible values (count={count}, rating={rating}) — aborting without changes.")
    rating = f"{float(rating):.1f}"

    changed = 0
    for rel in FILES:
        path = os.path.join(REPO_ROOT, rel)
        with open(path, encoding="utf-8") as f:
            before = f.read()
        after = apply(before, count, rating)
        if after != before:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(after)
            changed += 1
            print(f"updated {rel}")
    print(f"{changed} file(s) updated -> {count} reviews, {rating} stars")


if __name__ == "__main__":
    main()
