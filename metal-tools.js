/* Calculators on the metal price pages: /silver-price-per-gram/,
   /platinum-price-per-gram/, /silver-coin-melt-calculator/ and
   /scrap-gold-calculator/. Each widget is marked with data-tool. Spot prices
   come from the same public feed /gold-price-per-gram/ uses; if it can't be
   reached the default in the spot field stays and the visitor can edit it. */
(function () {
  'use strict';
  var GPT = 31.1035;          // grams per troy ounce
  var DWT = 1.55517;          // grams per pennyweight
  var RANGE = { XAU: [500, 20000], XAG: [5, 1000], XPT: [100, 10000] };
  var spots = {};

  function usd(n, digits) {
    var d = digits == null ? 2 : digits;
    return (isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function num(el) { var v = parseFloat(el && el.value); return isFinite(v) && v > 0 ? v : 0; }
  function round(n, d) { var p = Math.pow(10, d); return Math.round(n * p) / p; }
  function grams(w, unit) { return unit === 'dwt' ? w * DWT : unit === 'ozt' ? w * GPT : w; }

  function spot(symbol) {
    if (!spots[symbol]) {
      spots[symbol] = fetch('https://api.gold-api.com/price/' + symbol)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var p = d && (d.price || d.Price);
          var lim = RANGE[symbol];
          return p && p > lim[0] && p < lim[1] ? p : null;
        })
        .catch(function () { return null; });
    }
    return spots[symbol];
  }

  // Fill the spot field from the live feed and mark the badge.
  function wireSpot(root, symbol, onChange) {
    var input = root.querySelector('[data-spot]');
    var badge = root.querySelector('[data-live]');
    input.addEventListener('input', onChange);
    spot(symbol).then(function (p) {
      if (!p) { if (badge) badge.textContent = 'Live price unavailable, edit the spot price to match today’s'; return; }
      input.value = round(p, 2);
      if (badge) {
        badge.classList.add('is-live');
        badge.textContent = 'Live spot loaded ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ', edit it to test another number';
      }
      onChange();
    });
    return input;
  }

  // One metal, one purity, one weight: silver and platinum price pages.
  function meltTool(root) {
    var symbol = root.getAttribute('data-metal');
    var metal = root.getAttribute('data-metal-name') || 'metal';
    var purity = root.querySelector('[data-purity]');
    var weight = root.querySelector('[data-weight]');
    var unit = root.querySelector('[data-unit]');
    var out = root.querySelector('[data-result]');
    var sub = root.querySelector('[data-result-sub]');
    var cells = document.querySelectorAll('[data-rate="' + symbol + '"]');
    var note = document.querySelector('[data-rate-note="' + symbol + '"]');
    var input;
    function calc() {
      var sp = num(input);
      var perGramPure = sp / GPT;
      var p = parseFloat(purity.value);
      var g = grams(num(weight), unit.value);
      out.textContent = usd(perGramPure * p * g);
      sub.textContent = round(g, 2) + ' g at ' + (p * 100).toFixed(1).replace(/\.0$/, '') + '% ≈ ' + round(g * p, 2) + ' g of pure ' + metal + ' at ' + usd(sp) + ' per troy ounce';
      cells.forEach(function (cell) {
        var pp = parseFloat(cell.getAttribute('data-p'));
        var per = cell.getAttribute('data-per');
        cell.textContent = usd(perGramPure * pp * (per === 'ozt' ? GPT : 1));
      });
      if (note) note.textContent = 'Figures at ' + usd(sp) + ' per troy ounce spot. They update with the calculator.';
    }
    [purity, weight, unit].forEach(function (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); });
    input = wireSpot(root, symbol, calc);
    calc();
  }

  // Several pieces of different karats: scrap gold calculator.
  function scrapTool(root) {
    var list = root.querySelector('[data-rows]');
    var tpl = root.querySelector('template');
    var add = root.querySelector('[data-add]');
    var out = root.querySelector('[data-result]');
    var sub = root.querySelector('[data-result-sub]');
    var breakdown = root.querySelector('[data-breakdown]');
    var input;
    var n = 0;
    function addRow(karat, weight) {
      n++;
      var frag = tpl.content.cloneNode(true);
      var row = frag.querySelector('[data-row]');
      row.querySelectorAll('[data-label]').forEach(function (l) { l.textContent = l.textContent.replace('#', n); });
      row.querySelectorAll('[id]').forEach(function (el) {
        var id = el.id + '-' + n;
        var lab = row.querySelector('label[for="' + el.id + '"]');
        if (lab) lab.setAttribute('for', id);
        el.id = id;
      });
      if (karat) row.querySelector('[data-karat]').value = karat;
      if (weight) row.querySelector('[data-weight]').value = weight;
      row.querySelectorAll('input, select').forEach(function (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); });
      row.querySelector('[data-remove]').addEventListener('click', function () {
        if (list.children.length > 1) { row.remove(); calc(); }
      });
      list.appendChild(frag);
    }
    function calc() {
      var perGramPure = num(input) / GPT;
      var pure = 0, total = 0, byKarat = {};
      list.querySelectorAll('[data-row]').forEach(function (row) {
        var k = row.querySelector('[data-karat]');
        var g = grams(num(row.querySelector('[data-weight]')), row.querySelector('[data-unit]').value);
        var p = parseFloat(k.value);
        var label = k.options[k.selectedIndex].getAttribute('data-k');
        pure += g * p;
        total += g;
        byKarat[label] = (byKarat[label] || 0) + g;
      });
      out.textContent = usd(pure * perGramPure);
      sub.textContent = round(total, 2) + ' g of gold jewelry ≈ ' + round(pure, 2) + ' g of pure gold at ' + usd(num(input)) + ' per troy ounce';
      breakdown.textContent = Object.keys(byKarat).filter(function (k) { return byKarat[k] > 0; })
        .map(function (k) { return k + ': ' + round(byKarat[k], 2) + ' g'; }).join(' · ');
    }
    add.addEventListener('click', function () { addRow(); calc(); list.lastElementChild.querySelector('[data-weight]').focus(); });
    addRow('0.583', '12');
    addRow('0.750', '4');
    addRow('0.417', '2.5');
    input = wireSpot(root, 'XAU', calc);
    calc();
  }

  // Face value and coin counts: silver coin melt calculator.
  function coinTool(root) {
    var fields = root.querySelectorAll('[data-ozt]');
    var out = root.querySelector('[data-result]');
    var sub = root.querySelector('[data-result-sub]');
    var input;
    function calc() {
      var ozt = 0;
      fields.forEach(function (f) { ozt += num(f) * parseFloat(f.getAttribute('data-ozt')); });
      out.textContent = usd(ozt * num(input));
      sub.textContent = round(ozt, 3) + ' troy oz of silver at ' + usd(num(input)) + ' per troy ounce';
    }
    fields.forEach(function (f) { f.addEventListener('input', calc); });
    input = wireSpot(root, 'XAG', calc);
    calc();
  }

  function init() {
    document.querySelectorAll('[data-tool="melt"]').forEach(meltTool);
    document.querySelectorAll('[data-tool="scrap"]').forEach(scrapTool);
    document.querySelectorAll('[data-tool="coins"]').forEach(coinTool);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
