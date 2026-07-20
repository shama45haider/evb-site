/* EVB Panel — Gold & Silver melt-value calculator.
   Pure client-side math. Spot prices are typed in once and remembered in
   localStorage; there is no API dependency. 1 troy oz = 31.1035 g = 20 dwt. */

(function () {
  const G_PER_OZT = 31.1035;
  const G_PER_DWT = 1.55517;
  const KEY = 'evb_panel_spot_prices';

  const DEFAULT_SPOT = { gold: 2400, silver: 29, platinum: 980 };

  const $id = (s) => document.getElementById(s);
  const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function loadSpot() {
    try { return { ...DEFAULT_SPOT, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return { ...DEFAULT_SPOT }; }
  }
  function saveSpot(spot) { localStorage.setItem(KEY, JSON.stringify(spot)); }

  function grams(weight, unit) {
    if (unit === 'dwt') return weight * G_PER_DWT;
    if (unit === 'ozt') return weight * G_PER_OZT;
    return weight;
  }

  function recalc() {
    const spot = {
      gold: parseFloat($id('gcSpotGold').value) || 0,
      silver: parseFloat($id('gcSpotSilver').value) || 0,
      platinum: parseFloat($id('gcSpotPlatinum').value) || 0,
    };
    saveSpot(spot);

    const [metal, purityStr] = $id('gcPurity').value.split(':');
    const purity = parseFloat(purityStr);
    const w = parseFloat($id('gcWeight').value) || 0;
    const g = grams(w, $id('gcUnit').value);
    const pureG = g * purity;
    const melt = (pureG / G_PER_OZT) * spot[metal];
    const payout = parseInt($id('gcPayout').value, 10);

    $id('gcPayoutLabel').textContent = payout + '%';
    $id('gcPure').textContent = pureG.toFixed(2) + ' g';
    $id('gcMelt').textContent = money(melt);
    $id('gcOffer').textContent = money(melt * payout / 100);

    renderRef(spot);
  }

  /* Quick-reference table: melt value per gram / per dwt at current spot. */
  function renderRef(spot) {
    const rows = [
      ['10K gold', 'gold', 0.4167],
      ['14K gold', 'gold', 0.5833],
      ['18K gold', 'gold', 0.75],
      ['22K gold', 'gold', 0.9167],
      ['24K gold', 'gold', 0.999],
      ['Sterling .925', 'silver', 0.925],
      ['Fine silver .999', 'silver', 0.999],
      ['Platinum .950', 'platinum', 0.95],
    ];
    $id('gcRefBody').innerHTML = rows.map(([label, metal, purity]) => {
      const perG = (purity / G_PER_OZT) * spot[metal];
      return `<tr><td>${label}</td><td>${money(perG)}</td><td>${money(perG * G_PER_DWT)}</td></tr>`;
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$id('gcPurity')) return;
    const spot = loadSpot();
    $id('gcSpotGold').value = spot.gold;
    $id('gcSpotSilver').value = spot.silver;
    $id('gcSpotPlatinum').value = spot.platinum;

    ['gcPurity', 'gcWeight', 'gcUnit', 'gcPayout', 'gcSpotGold', 'gcSpotSilver', 'gcSpotPlatinum']
      .forEach((id) => $id(id).addEventListener('input', recalc));
    recalc();
  });
})();
