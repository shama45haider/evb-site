/* EVB Panel — Inventory
   Barcode intake, seller ID capture, and stock tracking for the shop.

   How it works:
   - Every item gets an EVB-XXXXXX SKU rendered as a Code 128 barcode you can
     print on a label and stick to the item. Scanning it later (USB scanner
     types into the scan box, or the camera) pulls the item straight up.
   - US/Canada driver's licenses carry a PDF417 barcode on the back with the
     holder's data in AAMVA format. Scanning it (camera or a dropped photo)
     parses that barcode and autofills the seller profile — no OCR guessing.
   - Everything is stored in IndexedDB ON THIS DEVICE ONLY. Seller PII and
     photos are never uploaded anywhere and never touch the GitHub repo.
     Backup/Restore moves the data between computers as a JSON file. */

(function () {
  const DB_NAME = 'evb_inventory';
  const state = {
    items: [],
    sellers: [],
    currentSku: null,      // editing an existing item when set
    currentSellerId: null, // selected existing seller
    photos: [],            // item photo dataURLs
    idPhoto: null,         // seller ID photo dataURL
    camReader: null,
    camMode: null,
  };

  const fmt$ = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const esch = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------------- IndexedDB ---------------- */
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'sku' });
        if (!db.objectStoreNames.contains('sellers')) db.createObjectStore('sellers', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbOp(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      const out = fn(os);
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }
  const dbPut = (store, val) => dbOp(store, 'readwrite', (os) => os.put(val));
  const dbDel = (store, key) => dbOp(store, 'readwrite', (os) => os.delete(key));
  async function dbAll(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function reload() {
    [state.items, state.sellers] = await Promise.all([dbAll('items'), dbAll('sellers')]);
    state.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderStats(); renderTable(); renderSellers();
  }

  /* ---------------- SKU + barcode + labels ---------------- */
  function nextSku() {
    let seq = parseInt(localStorage.getItem('evb_inv_seq') || '0', 10);
    // never collide with an existing item (e.g. after a restore)
    let sku;
    do { seq += 1; sku = 'EVB-' + String(seq).padStart(6, '0'); }
    while (state.items.some((i) => i.sku === sku));
    localStorage.setItem('evb_inv_seq', String(seq));
    return sku;
  }

  function renderBarcode(sku) {
    $('#invSkuLabel').textContent = sku || 'EVB-—';
    try {
      JsBarcode('#invBarcode', sku || 'EVB-000000', { format: 'CODE128', width: 1.6, height: 44, fontSize: 12, margin: 4 });
    } catch { /* lib not loaded yet */ }
  }

  function printLabels(sku, name, copies) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const tmp = document.createElementNS(svgNS, 'svg');
    JsBarcode(tmp, sku, { format: 'CODE128', width: 2, height: 52, fontSize: 14, margin: 0 });
    const svg = new XMLSerializer().serializeToString(tmp);
    const one = `<div class="label"><div class="shop">EAST VILLAGE BUYERS</div>${svg}<div class="nm">${esch((name || '').slice(0, 34))}</div></div>`;
    const w = window.open('', '_blank', 'width=460,height=340');
    w.document.write(`<!DOCTYPE html><html><head><title>Labels — ${esch(sku)}</title><style>
      body{margin:0;font-family:Arial,sans-serif}
      .label{width:2.25in;height:1.25in;padding:.08in;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;page-break-after:always;border:1px dashed #ccc}
      .label svg{max-width:100%;height:auto}
      .shop{font-size:8px;font-weight:bold;letter-spacing:1px}
      .nm{font-size:8px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      @media print{.label{border:none}}
    </style></head><body>${one.repeat(Math.max(1, Math.min(12, copies || 1)))}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  /* ---------------- AAMVA driver's license parser ---------------- */
  const AAMVA_FIELDS = {
    DAQ: 'idNumber', DCS: 'last', DAC: 'first', DAD: 'middle',
    DBB: 'dob', DBA: 'idExp', DAG: 'addr', DAI: 'city', DAJ: 'state',
    DAK: 'zip', DBC: 'sex', DAA: 'fullName', DAB: 'last',
  };

  function aamvaDate(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length !== 8) return '';
    const asUS = `${d.slice(4, 8)}-${d.slice(0, 2)}-${d.slice(2, 4)}`;   // MMDDYYYY (US)
    const asISO = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;  // YYYYMMDD (Canada)
    return parseInt(d.slice(0, 2), 10) <= 12 ? asUS : asISO;
  }

  function parseAamva(raw) {
    if (!raw || raw.indexOf('ANSI') === -1 && raw.indexOf('AAMVA') === -1 && raw.indexOf('DAQ') === -1) return null;
    let text = raw.replace(/\r/g, '\n');
    // Data may start glued to the "DL"/"ID" subfile marker: force a break before DAQ.
    const daq = text.indexOf('DAQ');
    if (daq > 0) text = text.slice(0, daq) + '\n' + text.slice(daq);
    const out = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z]{3})(.*)$/);
      if (!m || !(m[1] in AAMVA_FIELDS)) continue;
      out[AAMVA_FIELDS[m[1]]] = m[2].trim();
    }
    if (out.fullName && !out.last) { // pre-2000 format: "LAST,FIRST,MIDDLE"
      const parts = out.fullName.split(',');
      out.last = parts[0] || ''; out.first = parts[1] || ''; out.middle = parts[2] || '';
    }
    if (!out.idNumber && !out.last) return null;
    if (out.zip) { const z = out.zip.replace(/\D/g, ''); out.zip = z.length > 5 && z.slice(5) !== '0000' ? `${z.slice(0, 5)}-${z.slice(5, 9)}` : z.slice(0, 5); }
    out.dob = aamvaDate(out.dob);
    out.idExp = aamvaDate(out.idExp);
    return out;
  }

  function fillSellerForm(p) {
    if (p.first) $('#selFirst').value = p.first;
    if (p.last) $('#selLast').value = p.last;
    if (p.dob) $('#selDob').value = p.dob;
    if (p.idNumber) $('#selIdNum').value = p.idNumber;
    if (p.idExp) $('#selIdExp').value = p.idExp;
    if (p.addr) $('#selAddr').value = p.addr;
    if (p.city) $('#selCity').value = p.city;
    if (p.state) $('#selState').value = p.state;
    if (p.zip) $('#selZip').value = p.zip;
  }

  function applyIdScan(parsed) {
    // Returning seller? Match on ID number first.
    const existing = state.sellers.find((s) => s.idNumber && parsed.idNumber && s.idNumber === parsed.idNumber);
    if (existing) { selectSeller(existing.id); return; }
    state.currentSellerId = null;
    renderSellerCard();
    fillSellerForm(parsed);
    setStatus($('#invStatus'), 'ok', `ID scanned — ${parsed.first || ''} ${parsed.last || ''} autofilled as a new seller.`);
  }

  /* ---------------- Camera scanning (ZXing) ---------------- */
  async function openCamera(mode) {
    if (!window.ZXing) { setStatus($('#invStatus'), 'err', 'Scanner library still loading — try again in a second.'); return; }
    state.camMode = mode;
    $('#invCamTitle').textContent = mode === 'id' ? 'Scan the back of the ID' : 'Scan item barcode';
    $('#invCamHint').textContent = mode === 'id'
      ? 'Point the camera at the PDF417 barcode on the back of the license.'
      : 'Point the camera at the label barcode.';
    $('#invCamWrap').classList.remove('hidden');
    const reader = mode === 'id' ? new ZXing.BrowserPDF417Reader() : new ZXing.BrowserMultiFormatReader();
    state.camReader = reader;
    try {
      await reader.decodeFromVideoDevice(null, $('#invCamVideo'), (result) => {
        if (!result) return;
        closeCamera();
        if (mode === 'id') {
          const parsed = parseAamva(result.getText());
          if (parsed) applyIdScan(parsed);
          else setStatus($('#invStatus'), 'err', 'Barcode read, but it isn\'t a driver\'s license format.');
        } else {
          handleScan(result.getText());
        }
      });
    } catch (e) {
      closeCamera();
      setStatus($('#invStatus'), 'err', `Camera unavailable: ${e.message || e}`);
    }
  }
  function closeCamera() {
    if (state.camReader) { try { state.camReader.reset(); } catch {} state.camReader = null; }
    $('#invCamWrap').classList.add('hidden');
  }

  /* ---------------- Photos ---------------- */
  function compressImage(file, maxPx = 1000, q = 0.8) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', q));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderItemThumbs() {
    $('#invPhotoThumbs').innerHTML = state.photos.map((p, i) =>
      `<div class="thumb"><img src="${p}" alt=""><button class="thumb-x" data-i="${i}">&times;</button></div>`).join('');
    $$('#invPhotoThumbs .thumb-x').forEach((b) => b.addEventListener('click', () => { state.photos.splice(+b.dataset.i, 1); renderItemThumbs(); }));
  }
  function renderIdThumb() {
    $('#invIdThumb').innerHTML = state.idPhoto
      ? `<div class="thumb"><img src="${state.idPhoto}" alt=""><button class="thumb-x">&times;</button></div>` : '';
    const x = $('#invIdThumb .thumb-x');
    if (x) x.addEventListener('click', () => { state.idPhoto = null; renderIdThumb(); });
  }

  /* Dropped ID photo: keep it AND try to decode its PDF417 to autofill. */
  async function handleIdPhoto(file) {
    state.idPhoto = await compressImage(file, 1200, 0.82);
    renderIdThumb();
    if (!window.ZXing) return;
    try {
      const result = await new ZXing.BrowserPDF417Reader().decodeFromImageUrl(state.idPhoto);
      const parsed = parseAamva(result.getText());
      if (parsed) applyIdScan(parsed);
    } catch {
      setStatus($('#invStatus'), 'pending', 'ID photo attached. Couldn\'t read a barcode in it — if that\'s the front of the ID, fill the fields manually or scan the back.');
    }
  }

  /* ---------------- Sellers ---------------- */
  function sellerName(s) { return `${s.first || ''} ${s.last || ''}`.trim() || '(unnamed)'; }

  function selectSeller(id) {
    state.currentSellerId = id;
    const s = state.sellers.find((x) => x.id === id);
    if (s) fillSellerForm(s);
    renderSellerCard();
    $('#invSellerMatches').innerHTML = '';
    $('#invSellerSearch').value = '';
  }

  function renderSellerCard() {
    const card = $('#invSellerCard');
    if (!state.currentSellerId) { card.classList.add('hidden'); return; }
    const s = state.sellers.find((x) => x.id === state.currentSellerId);
    if (!s) { card.classList.add('hidden'); return; }
    const n = state.items.filter((i) => i.sellerId === s.id).length;
    card.classList.remove('hidden');
    card.innerHTML = `<span class="inv-seller-badge">RETURNING SELLER</span> <strong>${esch(sellerName(s))}</strong> — ${n} previous purchase${n === 1 ? '' : 's'} on file. Saving this intake adds to their log. <button class="inv-unlink" id="invUnlinkSeller">use someone else</button>`;
    $('#invUnlinkSeller').addEventListener('click', () => { state.currentSellerId = null; clearSellerForm(); renderSellerCard(); });
  }

  function clearSellerForm() {
    ['selFirst', 'selLast', 'selDob', 'selIdNum', 'selIdExp', 'selAddr', 'selCity', 'selState', 'selZip', 'selPhone'].forEach((id) => { $('#' + id).value = ''; });
    state.idPhoto = null; renderIdThumb();
  }

  function renderSellers() {
    const q = ($('#invSellerListSearch').value || '').toLowerCase();
    const list = state.sellers.filter((s) =>
      !q || sellerName(s).toLowerCase().includes(q) || (s.idNumber || '').toLowerCase().includes(q) || (s.phone || '').includes(q));
    $('#invSellerEmpty').style.display = state.sellers.length ? 'none' : '';
    $('#invSellerList').innerHTML = list.map((s) => {
      const txns = state.items.filter((i) => i.sellerId === s.id);
      const total = txns.reduce((n, i) => n + (+i.buyPrice || 0), 0);
      return `<div class="card inv-seller-tile">
        <div class="inv-seller-tile-head">
          ${s.idPhoto ? `<img src="${s.idPhoto}" class="inv-seller-avatar" alt="">` : '<div class="inv-seller-avatar inv-seller-avatar-empty">&#129489;</div>'}
          <div><strong>${esch(sellerName(s))}</strong>
            <div class="inv-seller-meta">${esch(s.idNumber || 'no ID on file')}${s.dob ? ' · DOB ' + esch(s.dob) : ''}</div>
            <div class="inv-seller-meta">${esch([s.addr, s.city, s.state].filter(Boolean).join(', '))}</div>
          </div>
        </div>
        <div class="inv-seller-txns">
          <div class="inv-seller-total">${txns.length} purchase${txns.length === 1 ? '' : 's'} · ${fmt$(total)} paid out</div>
          ${txns.slice(0, 5).map((i) => `<div class="inv-seller-txn"><span>${esch(i.sku)}</span> ${esch(i.name)} — ${fmt$(i.buyPrice)} <em>${new Date(i.createdAt).toLocaleDateString()}</em></div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  /* ---------------- Intake form ---------------- */
  function clearForm() {
    state.currentSku = null; state.photos = []; state.currentSellerId = null;
    ['invName', 'invBrand', 'invBuyPrice', 'invEstResale', 'invNotes'].forEach((id) => { $('#' + id).value = ''; });
    $('#invCategory').value = 'Jewelry'; $('#invCondition').value = 'Excellent';
    $('#invDate').value = new Date().toISOString().slice(0, 10);
    $('#invFormMode').textContent = 'new';
    clearSellerForm(); renderSellerCard(); renderItemThumbs();
    renderBarcode(nextSkuPreview());
  }

  let previewSku = null;
  function nextSkuPreview() {
    // show the SKU the item WILL get, without burning the counter until save
    if (!previewSku) {
      const seq = parseInt(localStorage.getItem('evb_inv_seq') || '0', 10) + 1;
      previewSku = 'EVB-' + String(seq).padStart(6, '0');
    }
    return previewSku;
  }

  function loadItem(item) {
    state.currentSku = item.sku;
    state.photos = (item.photos || []).slice();
    $('#invFormMode').textContent = 'editing';
    $('#invName').value = item.name || '';
    $('#invCategory').value = item.category || 'Other';
    $('#invBrand').value = item.brand || '';
    $('#invCondition').value = item.condition || 'Good';
    $('#invBuyPrice').value = item.buyPrice ?? '';
    $('#invEstResale').value = item.estResale ?? '';
    $('#invDate').value = item.date || new Date(item.createdAt).toISOString().slice(0, 10);
    $('#invNotes').value = item.notes || '';
    renderBarcode(item.sku); renderItemThumbs();
    if (item.sellerId) selectSeller(item.sellerId); else { clearSellerForm(); state.currentSellerId = null; renderSellerCard(); }
    switchInvTab('intake');
  }

  function handleScan(code) {
    const sku = code.trim().toUpperCase();
    const item = state.items.find((i) => i.sku === sku);
    if (item) {
      loadItem(item);
      setStatus($('#invStatus'), 'ok', `Found ${sku} — "${item.name}" loaded for editing.`);
    } else if (/^EVB-\d+$/.test(sku)) {
      setStatus($('#invStatus'), 'err', `${sku} isn't in the system yet.`);
    } else if (sku) {
      // Foreign barcode (UPC on a box etc.) — start a new item that reuses it as the SKU.
      clearForm();
      state.currentSku = sku;
      renderBarcode(sku);
      $('#invFormMode').textContent = 'new (scanned code)';
      setStatus($('#invStatus'), 'ok', `New item started from scanned code ${sku}.`);
    }
  }

  async function saveIntake() {
    const st = $('#invStatus');
    const name = $('#invName').value.trim();
    const buyPrice = parseFloat($('#invBuyPrice').value);
    if (!name) { setStatus(st, 'err', 'Item name is required.'); return; }
    if (isNaN(buyPrice)) { setStatus(st, 'err', 'Enter what you paid for the item.'); return; }

    // Seller: reuse selected, or create if any identity field is filled.
    let sellerId = state.currentSellerId;
    const sf = { first: $('#selFirst').value.trim(), last: $('#selLast').value.trim(), dob: $('#selDob').value, idNumber: $('#selIdNum').value.trim(), idExp: $('#selIdExp').value, addr: $('#selAddr').value.trim(), city: $('#selCity').value.trim(), state: $('#selState').value.trim().toUpperCase(), zip: $('#selZip').value.trim(), phone: $('#selPhone').value.trim() };
    const hasSellerData = sf.first || sf.last || sf.idNumber;
    if (sellerId) {
      const s = state.sellers.find((x) => x.id === sellerId);
      Object.assign(s, sf, state.idPhoto ? { idPhoto: state.idPhoto } : {});
      await dbPut('sellers', s);
    } else if (hasSellerData) {
      const dupe = sf.idNumber && state.sellers.find((s) => s.idNumber === sf.idNumber);
      if (dupe) { sellerId = dupe.id; Object.assign(dupe, sf); await dbPut('sellers', dupe); }
      else {
        sellerId = 'S' + Date.now().toString(36).toUpperCase();
        await dbPut('sellers', { id: sellerId, ...sf, idPhoto: state.idPhoto || null, createdAt: Date.now() });
      }
    }

    let sku = state.currentSku;
    const isNew = !sku || !state.items.some((i) => i.sku === sku);
    if (!sku) { sku = nextSku(); previewSku = null; }
    else if (isNew && /^EVB-\d+$/.test(sku) && sku === previewSku) { nextSku(); previewSku = null; }

    const prev = state.items.find((i) => i.sku === sku) || {};
    const item = {
      ...prev, sku, name,
      category: $('#invCategory').value, brand: $('#invBrand').value.trim(),
      condition: $('#invCondition').value,
      buyPrice, estResale: parseFloat($('#invEstResale').value) || null,
      date: $('#invDate').value, notes: $('#invNotes').value.trim(),
      photos: state.photos, sellerId: sellerId || prev.sellerId || null,
      status: prev.status || 'in_stock',
      createdAt: prev.createdAt || Date.now(), updatedAt: Date.now(),
    };
    await dbPut('items', item);
    await reload();
    logActivity(`Inventory: ${isNew ? 'added' : 'updated'} ${sku} — ${name} (${fmt$(buyPrice)})`);
    setStatus(st, 'ok', `${isNew ? 'Saved' : 'Updated'} ${sku}. Print the label and stick it on the item.`);
    if (isNew) { renderBarcode(sku); state.currentSku = sku; $('#invFormMode').textContent = 'saved'; }
  }

  /* ---------------- Inventory table + drawer ---------------- */
  function renderStats() {
    const stock = state.items.filter((i) => i.status === 'in_stock');
    const sold = state.items.filter((i) => i.status === 'sold');
    $('#invStatStock').textContent = stock.length;
    $('#invStatStockSub').textContent = fmt$(stock.reduce((n, i) => n + (+i.buyPrice || 0), 0)) + ' invested';
    $('#invStatSold').textContent = sold.length;
    $('#invStatSoldSub').textContent = fmt$(sold.reduce((n, i) => n + (+i.soldPrice || 0), 0)) + ' in sales';
    const profit = sold.reduce((n, i) => n + ((+i.soldPrice || 0) - (+i.buyPrice || 0)), 0);
    const pEl = $('#invStatProfit');
    pEl.textContent = fmt$(profit);
    pEl.className = 'stat-value ' + (profit > 0 ? 'good' : profit < 0 ? 'bad' : '');
    $('#invStatSellers').textContent = state.sellers.length;
  }

  function renderTable() {
    const q = ($('#invSearch').value || '').toLowerCase();
    const fs = $('#invFilterStatus').value, fc = $('#invFilterCat').value;
    const rows = state.items.filter((i) => {
      const seller = state.sellers.find((s) => s.id === i.sellerId);
      const hay = `${i.sku} ${i.name} ${i.brand} ${seller ? sellerName(seller) : ''}`.toLowerCase();
      return (!q || hay.includes(q)) && (!fs || i.status === fs) && (!fc || i.category === fc);
    });
    $('#invTableEmpty').style.display = rows.length ? 'none' : '';
    $('#invTableBody').innerHTML = rows.map((i) => {
      const seller = state.sellers.find((s) => s.id === i.sellerId);
      return `<tr data-sku="${esch(i.sku)}">
        <td class="inv-td-sku" data-label="SKU">${esch(i.sku)}</td>
        <td data-label="Item">${i.photos && i.photos[0] ? `<img src="${i.photos[0]}" class="inv-td-thumb" alt="">` : ''}${esch(i.name)}</td>
        <td data-label="Category">${esch(i.category || '')}</td>
        <td data-label="Bought">${i.date ? esch(i.date) : new Date(i.createdAt).toLocaleDateString()}</td>
        <td data-label="Paid">${fmt$(i.buyPrice)}</td>
        <td data-label="Status"><span class="inv-chip ${i.status === 'sold' ? 'inv-chip-sold' : 'inv-chip-stock'}">${i.status === 'sold' ? 'Sold ' + fmt$(i.soldPrice) : 'In stock'}</span></td>
        <td data-label="Seller">${seller ? esch(sellerName(seller)) : '—'}</td>
        <td data-label=""><button class="inv-row-open">Open</button></td>
      </tr>`;
    }).join('');
    $$('#invTableBody tr').forEach((tr) => tr.addEventListener('click', () => openDrawer(tr.dataset.sku)));
  }

  function openDrawer(sku) {
    const i = state.items.find((x) => x.sku === sku);
    if (!i) return;
    const seller = state.sellers.find((s) => s.id === i.sellerId);
    const profit = i.status === 'sold' ? (+i.soldPrice || 0) - (+i.buyPrice || 0) : null;
    $('#invDrawer').innerHTML = `
      <div class="inv-drawer-head">
        <div><div class="inv-td-sku">${esch(i.sku)}</div><h3>${esch(i.name)}</h3></div>
        <button class="inv-cam-x" id="invDrawerClose">&times;</button>
      </div>
      ${i.photos && i.photos.length ? `<div class="inv-drawer-photos">${i.photos.map((p) => `<img src="${p}" alt="">`).join('')}</div>` : ''}
      <div class="inv-drawer-grid">
        <div><label>Category</label>${esch(i.category || '—')}</div>
        <div><label>Brand</label>${esch(i.brand || '—')}</div>
        <div><label>Condition</label>${esch(i.condition || '—')}</div>
        <div><label>Bought</label>${esch(i.date || new Date(i.createdAt).toLocaleDateString())}</div>
        <div><label>Paid</label>${fmt$(i.buyPrice)}</div>
        <div><label>Est. resale</label>${i.estResale ? fmt$(i.estResale) : '—'}</div>
        ${i.status === 'sold' ? `<div><label>Sold for</label>${fmt$(i.soldPrice)}</div><div><label>Profit</label><span class="${profit >= 0 ? 'inv-good' : 'inv-bad'}">${fmt$(profit)}</span></div>` : ''}
        <div style="grid-column:1/-1"><label>Seller</label>${seller ? `${esch(sellerName(seller))} · ${esch(seller.idNumber || 'no ID')}` : 'Not recorded'}</div>
        ${i.notes ? `<div style="grid-column:1/-1"><label>Notes</label>${esch(i.notes)}</div>` : ''}
      </div>
      <div class="inv-drawer-actions">
        ${i.status === 'in_stock' ? `<div class="inv-sell-row"><input type="number" id="invSellPrice" placeholder="Sale price" min="0" step="0.01" value="${i.estResale || ''}"><button class="btn btn-solid btn-green btn-sm" id="invMarkSold">Mark Sold</button></div>` : `<button class="btn btn-ghost btn-sm" id="invMarkUnsold">Return to Stock</button>`}
        <button class="btn btn-ghost btn-sm" id="invDrawerEdit">Edit</button>
        <button class="btn btn-ghost btn-sm" id="invDrawerPrint">Print Label</button>
        <button class="btn btn-ghost btn-sm inv-danger" id="invDrawerDelete">Delete</button>
      </div>`;
    $('#invDrawerWrap').classList.remove('hidden');
    $('#invDrawerClose').addEventListener('click', closeDrawer);
    $('#invDrawerEdit').addEventListener('click', () => { closeDrawer(); loadItem(i); });
    $('#invDrawerPrint').addEventListener('click', () => printLabels(i.sku, i.name, 1));
    $('#invDrawerDelete').addEventListener('click', async () => {
      if (!confirm(`Delete ${i.sku} — "${i.name}"? This can't be undone.`)) return;
      await dbDel('items', i.sku); await reload(); closeDrawer();
      logActivity(`Inventory: deleted ${i.sku} — ${i.name}`);
    });
    const sold = $('#invMarkSold');
    if (sold) sold.addEventListener('click', async () => {
      const p = parseFloat($('#invSellPrice').value);
      if (isNaN(p)) return;
      i.status = 'sold'; i.soldPrice = p; i.soldAt = Date.now();
      await dbPut('items', i); await reload(); openDrawer(sku);
      logActivity(`Inventory: sold ${i.sku} — ${i.name} for ${fmt$(p)}`);
    });
    const unsold = $('#invMarkUnsold');
    if (unsold) unsold.addEventListener('click', async () => {
      i.status = 'in_stock'; i.soldPrice = null; i.soldAt = null;
      await dbPut('items', i); await reload(); openDrawer(sku);
    });
  }
  function closeDrawer() { $('#invDrawerWrap').classList.add('hidden'); }

  /* ---------------- Export / backup ---------------- */
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    const head = 'SKU,Name,Category,Brand,Condition,Date bought,Paid,Est resale,Status,Sold for,Profit,Seller,Seller ID,Notes';
    const rows = state.items.map((i) => {
      const s = state.sellers.find((x) => x.id === i.sellerId);
      const cells = [i.sku, i.name, i.category, i.brand, i.condition, i.date || '', i.buyPrice, i.estResale || '', i.status, i.soldPrice || '', i.status === 'sold' ? ((+i.soldPrice || 0) - (+i.buyPrice || 0)) : '', s ? sellerName(s) : '', s ? s.idNumber || '' : '', i.notes || ''];
      return cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',');
    });
    download(`evb-inventory-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows].join('\n'), 'text/csv');
  }

  async function backup() {
    download(`evb-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ v: 1, items: state.items, sellers: state.sellers, seq: localStorage.getItem('evb_inv_seq') || '0' }),
      'application/json');
  }

  async function restore(file) {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.sellers)) throw new Error('Not a valid EVB backup file');
    for (const s of data.sellers) await dbPut('sellers', s);
    for (const i of data.items) await dbPut('items', i);
    const seq = parseInt(data.seq || '0', 10);
    if (seq > parseInt(localStorage.getItem('evb_inv_seq') || '0', 10)) localStorage.setItem('evb_inv_seq', String(seq));
    await reload();
    logActivity(`Inventory: restored backup (${data.items.length} items, ${data.sellers.length} sellers)`);
  }

  /* ---------------- Sub-tabs + wiring ---------------- */
  function switchInvTab(name) {
    $$('.inv-subtab').forEach((b) => b.classList.toggle('is-active', b.dataset.invtab === name));
    $$('.inv-pane').forEach((p) => p.classList.toggle('is-active', p.id === `invpane-${name}`));
    if (name === 'intake') setTimeout(() => $('#invScanBox').focus(), 50);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#invDate').value = new Date().toISOString().slice(0, 10);
    reload().then(() => { renderBarcode(nextSkuPreview()); });

    $$('.inv-subtab').forEach((b) => b.addEventListener('click', () => switchInvTab(b.dataset.invtab)));

    // Scan box: USB scanners type + press Enter
    $('#invScanBox').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleScan(e.target.value); e.target.value = ''; }
    });
    $('#invCamScan').addEventListener('click', () => openCamera('sku'));
    $('#invScanId').addEventListener('click', () => openCamera('id'));
    $('#invCamClose').addEventListener('click', closeCamera);
    $('#invNewItem').addEventListener('click', () => { clearForm(); $('#invScanBox').focus(); });
    $('#invPrintLabel').addEventListener('click', () => {
      printLabels(state.currentSku || nextSkuPreview(), $('#invName').value, parseInt($('#invLabelCopies').value, 10));
    });

    // Item photos
    const pd = $('#invPhotoDrop');
    pd.addEventListener('click', () => $('#invPhotoFiles').click());
    $('#invPhotoFiles').addEventListener('change', async (e) => {
      for (const f of e.target.files) if (f.type.startsWith('image/')) state.photos.push(await compressImage(f));
      renderItemThumbs(); e.target.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) => pd.addEventListener(ev, (e) => { e.preventDefault(); pd.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => pd.addEventListener(ev, (e) => { e.preventDefault(); pd.classList.remove('drag'); }));
    pd.addEventListener('drop', async (e) => {
      for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) state.photos.push(await compressImage(f));
      renderItemThumbs();
    });

    // ID photo
    const idd = $('#invIdDrop');
    idd.addEventListener('click', () => $('#invIdFile').click());
    $('#invIdFile').addEventListener('change', (e) => { if (e.target.files[0]) handleIdPhoto(e.target.files[0]); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => idd.addEventListener(ev, (e) => { e.preventDefault(); idd.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => idd.addEventListener(ev, (e) => { e.preventDefault(); idd.classList.remove('drag'); }));
    idd.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) handleIdPhoto(e.dataTransfer.files[0]); });

    // Seller search
    $('#invSellerSearch').addEventListener('input', () => {
      const q = $('#invSellerSearch').value.trim().toLowerCase();
      const box = $('#invSellerMatches');
      if (!q) { box.innerHTML = ''; return; }
      const hits = state.sellers.filter((s) => sellerName(s).toLowerCase().includes(q) || (s.idNumber || '').toLowerCase().includes(q)).slice(0, 6);
      box.innerHTML = hits.map((s) => `<button class="inv-seller-hit" data-id="${s.id}"><strong>${esch(sellerName(s))}</strong> · ${esch(s.idNumber || 'no ID')} · ${state.items.filter((i) => i.sellerId === s.id).length} purchases</button>`).join('') || '<div class="inv-seller-nohit">No matches — fill the fields to create a new seller.</div>';
      $$('.inv-seller-hit').forEach((b) => b.addEventListener('click', () => selectSeller(b.dataset.id)));
    });

    $('#invSave').addEventListener('click', saveIntake);
    $('#invClear').addEventListener('click', clearForm);

    // List filters
    ['invSearch', 'invFilterStatus', 'invFilterCat'].forEach((id) => $('#' + id).addEventListener('input', renderTable));
    $('#invSellerListSearch').addEventListener('input', renderSellers);
    $('#invDrawerWrap').addEventListener('click', (e) => { if (e.target === $('#invDrawerWrap')) closeDrawer(); });

    // Export / backup / restore
    $('#invExportCsv').addEventListener('click', exportCsv);
    $('#invBackup').addEventListener('click', backup);
    $('#invRestore').addEventListener('click', () => $('#invRestoreFile').click());
    $('#invRestoreFile').addEventListener('change', async (e) => {
      if (!e.target.files[0]) return;
      try { await restore(e.target.files[0]); alert('Backup restored.'); }
      catch (err) { alert('Restore failed: ' + err.message); }
      e.target.value = '';
    });
  });

  document.addEventListener('evb:tab-shown', (e) => {
    if (e.detail === 'inventory') setTimeout(() => $('#invScanBox').focus(), 50);
  });
})();
