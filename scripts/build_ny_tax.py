"""Build the New York sales tax table the checkout uses.

Writes one block of JavaScript into two places, so the Worker that charges
and the page that shows the total can't drift apart:

  store/ny-tax.js     window.EVB_NY_TAX, for the bag and checkout pages
  square-worker.js    const NY_TAX, between the // <ny-tax> markers

Rates are NY Publication 718 (combined state and local rates) and 718-C
(clothing and footwear under $110), both effective March 1, 2025. When the
state changes a rate, change it in RATES below and run this again:

  python scripts/build_ny_tax.py

ZIP codes map to counties through scripts/ny_zip_county.csv (Census 2020
ZIP areas; a ZIP that crosses a county line goes to the county holding most
of its land). To rebuild that file from the Census relationship file
(tab20_zcta520_county20_natl.txt):

  python scripts/build_ny_tax.py --census path/to/tab20_zcta520_county20_natl.txt
"""
import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP_CSV = os.path.join(ROOT, 'scripts', 'ny_zip_county.csv')
SITE_JS = os.path.join(ROOT, 'store', 'ny-tax.js')
WORKER_JS = os.path.join(ROOT, 'square-worker.js')

# County: (combined rate %, rate % on clothing and footwear under $110).
# 718-C Part 1 places charge nothing on that clothing; Part 2 places charge
# their local rate without the state's 4%.
RATES = {
    'Albany': (8, 4), 'Allegany': (8.5, 4.5), 'Broome': (8, 4),
    'Cattaraugus': (8, 4), 'Cayuga': (8, 4), 'Chautauqua': (8, 0),
    'Chemung': (8, 4), 'Chenango': (8, 0), 'Clinton': (8, 4),
    'Columbia': (8, 0), 'Cortland': (8, 4), 'Delaware': (8, 0),
    'Dutchess': (8.125, 0), 'Erie': (8.75, 4.75), 'Essex': (8, 4),
    'Franklin': (8, 4), 'Fulton': (8, 4), 'Genesee': (8, 4),
    'Greene': (8, 0), 'Hamilton': (8, 0), 'Herkimer': (8.25, 4.25),
    'Jefferson': (8, 4), 'Lewis': (8, 4), 'Livingston': (8, 4),
    'Madison': (8, 4), 'Monroe': (8, 0), 'Montgomery': (8, 4),
    'Nassau': (8.625, 4.625), 'Niagara': (8, 4), 'Oneida': (8.75, 4.75),
    'Onondaga': (8, 4), 'Ontario': (7.5, 3.5), 'Orange': (8.125, 4.125),
    'Orleans': (8, 4), 'Oswego': (8, 4), 'Otsego': (8, 4),
    'Putnam': (8.375, 0), 'Rensselaer': (8, 4), 'Rockland': (8.375, 4.375),
    'St. Lawrence': (8, 4), 'Saratoga': (7, 3), 'Schenectady': (8, 4),
    'Schoharie': (8, 4), 'Schuyler': (8, 4), 'Seneca': (8, 4),
    'Steuben': (8, 4), 'Suffolk': (8.75, 4.75), 'Sullivan': (8, 4),
    'Tioga': (8, 0), 'Tompkins': (8, 4), 'Ulster': (8, 4),
    'Warren': (7, 3), 'Washington': (7, 3), 'Wayne': (8, 4),
    'Westchester': (8.375, 4.375), 'Wyoming': (8, 4), 'Yates': (8, 4),
}
NYC = ('New York City', 8.875, 0)
NYC_FIPS = {'36005', '36047', '36061', '36081', '36085'}

# Cities with a rate of their own, matched on the address's city.
CITIES = {
    'yonkers': ('Westchester', 'Yonkers', 8.875, 4.875),
    'norwich': ('Chenango', 'City of Norwich', 8, 1.5),
}

# ZIPs with no Census ZIP area of their own.
EXTRA_ZIPS = {'00501': 'Suffolk', '00544': 'Suffolk'}

# Clothing and footwear: the store's categories that hold only that.
CLOTHING_CATEGORIES = ['streetwear', 'sneakers']
CLOTHING_LIMIT_CENTS = 11000


def read_census(path):
    best = {}
    with open(path, encoding='utf-8-sig') as f:
        rows = csv.reader(f, delimiter='|')
        head = next(rows)
        zi = head.index('GEOID_ZCTA5_20')
        ci = head.index('GEOID_COUNTY_20')
        ni = head.index('NAMELSAD_COUNTY_20')
        ai = head.index('AREALAND_PART')
        for r in rows:
            if len(r) <= ai or not r[zi] or not r[ci].startswith('36'):
                continue
            land = int(r[ai] or 0)
            if r[zi] not in best or land > best[r[zi]][0]:
                best[r[zi]] = (land, r[ci], r[ni])
    with open(ZIP_CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['zip', 'county_fips', 'county'])
        for z in sorted(best):
            w.writerow([z, best[z][1], best[z][2]])
    print('wrote', ZIP_CSV, len(best), 'ZIPs')


def area_of(fips, county):
    if fips in NYC_FIPS:
        return NYC[0]
    name = re.sub(r' County$', '', county)
    if name not in RATES:
        raise SystemExit('No rate for ' + county + ' (' + fips + ')')
    return name + ' County'


def build():
    areas = [NYC] + [(c + ' County',) + RATES[c] for c in sorted(RATES)]
    index = {a[0]: i for i, a in enumerate(areas)}

    zips = {}
    with open(ZIP_CSV, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            zips[r['zip']] = index[area_of(r['county_fips'], r['county'])]
    for z, c in EXTRA_ZIPS.items():
        zips.setdefault(z, index[c + ' County'])
    counties = {areas[i][0] for i in zips.values()}
    missing = [a[0] for a in areas if a[0] not in counties]
    if missing:
        raise SystemExit('No ZIPs for ' + ', '.join(missing))

    # Runs of ZIPs in the same place: [first ZIP, place, first ZIP, place, ...].
    # A ZIP with no area of its own (a PO box, a new ZIP) takes the run below it.
    runs = []
    for z in sorted(zips, key=int):
        if not runs or runs[-1] != zips[z]:
            runs += [int(z), zips[z]]

    cities = {k: [index[c + ' County'], name, rate, cl] for k, (c, name, rate, cl) in CITIES.items()}

    def num(x):
        return ('%g' % x)

    area_js = ',\n    '.join('[%s, %s, %s]' % (js_str(a[0]), num(a[1]), num(a[2])) for a in areas)
    city_js = ', '.join('%s: [%d, %s, %s, %s]' % (k, v[0], js_str(v[1]), num(v[2]), num(v[3])) for k, v in sorted(cities.items()))
    run_lines = []
    for i in range(0, len(runs), 20):
        run_lines.append(','.join(str(n) for n in runs[i:i + 20]))
    runs_js = ',\n    '.join(run_lines)

    body = BODY.replace('@AREAS@', area_js).replace('@CITIES@', city_js).replace('@RUNS@', runs_js) \
        .replace('@CATS@', ', '.join(js_str(c) for c in CLOTHING_CATEGORIES)) \
        .replace('@LIMIT@', str(CLOTHING_LIMIT_CENTS))
    return body, len(runs) // 2, len(zips)


def js_str(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


HEADER = ('// New York sales tax by delivery address. Built by scripts/build_ny_tax.py\n'
          '// from NY Publications 718 and 718-C (rates effective March 1, 2025) and\n'
          '// Census 2020 ZIP areas. Change the rates there, not here.\n')

BODY = r'''(function () {
  // [place, rate %, rate % on clothing and footwear under $110]
  var AREAS = [
    @AREAS@
  ];
  // Cities with their own rate: [county's place, name, rate %, clothing rate %].
  var CITIES = { @CITIES@ };
  // [first ZIP, place, first ZIP, place, ...], lowest ZIP first.
  var RUNS = [
    @RUNS@
  ];
  var NYC = 0;
  var CLOTHING = [@CATS@];
  var CLOTHING_LIMIT = @LIMIT@;
  var OUTSIDE = { name: 'Outside New York', rate: 0, clothing: 0, ny: false };

  function place(i) {
    return { name: AREAS[i][0], rate: AREAS[i][1], clothing: AREAS[i][2], ny: true };
  }

  function placeOfZip(zip) {
    var z = parseInt(zip, 10);
    if (!(z >= RUNS[0])) return -1;
    var lo = 0, hi = RUNS.length / 2 - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (RUNS[mid * 2] <= z) lo = mid; else hi = mid - 1;
    }
    return RUNS[lo * 2 + 1];
  }

  // a: { pickup, country, region, postal, city }. Pickup at the shop is New
  // York City. Orders shipped out of state have no New York tax. A New York
  // ZIP counts as New York whatever state was typed.
  function forAddress(a) {
    a = a || {};
    if (a.pickup) return place(NYC);
    var country = String(a.country || 'US').trim().toUpperCase();
    var region = String(a.region || '').trim().toUpperCase();
    var zip = (String(a.postal || '').match(/\d{5}/) || [''])[0];
    var nyZip = /^1[0-4]\d{3}$/.test(zip) || zip === '00501' || zip === '00544' || zip === '06390';
    if (country !== 'US' && country !== 'USA') return OUTSIDE;
    if (region !== 'NY' && region !== 'NEW YORK' && !nyZip) return OUTSIDE;
    var i = nyZip ? placeOfZip(zip) : -1;
    if (i < 0) i = NYC;
    var city = CITIES[String(a.city || '').trim().toLowerCase().replace(/^city of /, '')];
    if (city && city[0] === i) return { name: city[1], rate: city[2], clothing: city[3], ny: true };
    return place(i);
  }

  // Clothing and footwear under $110 an item, after the store's own
  // discounts, has its own lower rate (none in New York City).
  function isClothing(category, unitCents) {
    return CLOTHING.indexOf(String(category || '').toLowerCase()) !== -1 && unitCents < CLOTHING_LIMIT;
  }

  return { forAddress: forAddress, isClothing: isClothing, pickup: place(NYC), outside: OUTSIDE, clothingLimit: CLOTHING_LIMIT };
})()'''


def main():
    if len(sys.argv) > 2 and sys.argv[1] == '--census':
        read_census(sys.argv[2])
    body, nruns, nzips = build()

    with open(SITE_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(HEADER + 'window.EVB_NY_TAX = ' + body + ';\n')

    src = open(WORKER_JS, encoding='utf-8').read()
    block = '// <ny-tax>\n' + HEADER + 'const NY_TAX = ' + body + ';\n// </ny-tax>'
    new, n = re.subn(r'// <ny-tax>\n.*?// </ny-tax>', lambda m: block, src, flags=re.S)
    if n != 1:
        raise SystemExit('square-worker.js needs one // <ny-tax> ... // </ny-tax> block')
    with open(WORKER_JS, 'w', encoding='utf-8', newline='') as f:
        f.write(new)
    print('%d ZIPs in %d runs; wrote %s and %s' % (nzips, nruns, SITE_JS, WORKER_JS))


if __name__ == '__main__':
    main()
