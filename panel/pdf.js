/* EVB Panel — PDF generation (jsPDF).
   - Seller ID record: auto-downloads on every successful ID scan.
   - Purchase receipt: the paper trail for each buy.
   - Reports tab: date-range transaction report + inventory value report + CSV.
   All PDFs are generated in the browser and saved straight to Downloads —
   nothing is uploaded anywhere. */

(function () {
  const SHOP = {
    name: 'EAST VILLAGE BUYERS',
    addr: '39 Avenue A, New York, NY 10009',
    phone: '917-608-8939',
    site: 'eastvillagebuyers.com',
  };
  const ORANGE = [249, 115, 22];
  const INK = [26, 24, 20];
  const MUTED = [122, 116, 110];

  const fmt$ = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const safe = (s) => String(s || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'record';

  function newDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'pt', format: 'letter' }); // 612 x 792 pt
  }

  /* Orange banner + shop identity at the top of every document. */
  function drawHeader(doc, title) {
    doc.setFillColor(...ORANGE);
    doc.rect(0, 0, 612, 64, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(SHOP.name, 40, 28);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${SHOP.addr}  ·  ${SHOP.phone}  ·  ${SHOP.site}`, 40, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title.toUpperCase(), 572, 36, { align: 'right' });
    doc.setTextColor(...INK);
    return 92; // y position where content starts
  }

  function drawFooter(doc, text) {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(text, 306, 764, { align: 'center', maxWidth: 520 });
    doc.setTextColor(...INK);
  }

  function field(doc, x, y, label, value) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    doc.text(String(value || '—'), x, y + 14);
    return y + 36;
  }

  function sigLine(doc, x, y, label) {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.8);
    doc.line(x, y, x + 200, y);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(label, x, y + 12);
    doc.setTextColor(...INK);
  }

  function barcodePng(text) {
    try {
      const c = document.createElement('canvas');
      JsBarcode(c, text, { format: 'CODE128', width: 2, height: 50, fontSize: 13, margin: 6 });
      return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
    } catch { return null; }
  }

  /* ---------------- Seller ID record ---------------- */
  function sellerIdRecord(p, { idPhoto = null, history = null } = {}) {
    const doc = newDoc();
    let y = drawHeader(doc, 'Seller ID Record');

    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Record generated: ${new Date().toLocaleString()}`, 40, y);
    doc.setTextColor(...INK);
    y += 26;

    const name = `${p.first || ''} ${p.middle || ''} ${p.last || ''}`.replace(/\s+/g, ' ').trim();
    const colL = 40, colR = 220;
    let yL = y, yR = y;
    yL = field(doc, colL, yL, 'Full name', name);
    yL = field(doc, colL, yL, 'Date of birth', p.dob);
    yL = field(doc, colL, yL, 'ID / license number', p.idNumber);
    yL = field(doc, colL, yL, 'ID expires', p.idExp);
    yR = field(doc, colR, yR, 'Street address', p.addr);
    yR = field(doc, colR, yR, 'City / State / ZIP', [p.city, p.state, p.zip].filter(Boolean).join(', '));
    yR = field(doc, colR, yR, 'Phone', p.phone);
    yR = field(doc, colR, yR, 'Sex', p.sex === '1' ? 'M' : p.sex === '2' ? 'F' : p.sex);

    // ID photo on the right, if we have one
    if (idPhoto) {
      try {
        doc.setDrawColor(...MUTED);
        doc.setLineWidth(0.6);
        doc.rect(408, y - 10, 164, 110);
        doc.addImage(idPhoto, 'JPEG', 411, y - 7, 158, 104, undefined, 'FAST');
      } catch { /* bad image data — skip */ }
    }

    y = Math.max(yL, yR) + 6;

    if (history && history.count > 0) {
      doc.setFillColor(255, 243, 230);
      doc.roundedRect(40, y, 532, 34, 6, 6, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ORANGE);
      doc.text(`RETURNING SELLER — ${history.count} previous purchase${history.count === 1 ? '' : 's'} on file, ${fmt$(history.total)} paid out to date.`, 52, y + 21);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      y += 50;
    } else {
      y += 10;
    }

    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text('The seller identified above presented government-issued photo identification at the time of sale and affirmed they are the lawful owner of the item(s) sold, free of any liens or encumbrances.', 40, y, { maxWidth: 532 });
    doc.setTextColor(...INK);
    y += 56;

    sigLine(doc, 40, y + 30, 'Seller signature');
    sigLine(doc, 330, y + 30, `${SHOP.name} representative`);
    sigLine(doc, 40, y + 84, 'Date');

    drawFooter(doc, 'Generated by EVB Panel. This record is stored locally by East Village Buyers for secondhand-dealer record-keeping and is not shared with third parties.');
    doc.save(`ID-Record-${safe(p.last)}-${safe(p.first)}-${stamp()}.pdf`);
  }

  /* ---------------- Purchase receipt ---------------- */
  function purchaseReceipt(item, seller) {
    const doc = newDoc();
    let y = drawHeader(doc, 'Purchase Receipt');

    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Date: ${item.date || new Date(item.createdAt || Date.now()).toLocaleDateString()}    ·    Receipt for SKU ${item.sku}`, 40, y);
    doc.setTextColor(...INK);

    const bc = barcodePng(item.sku);
    if (bc) doc.addImage(bc.url, 'PNG', 572 - bc.w * 0.75, y - 8, bc.w * 0.75, bc.h * 0.75);
    y += 40;

    let yy = y;
    yy = field(doc, 40, yy, 'Item', item.name);
    let y2 = y;
    y2 = field(doc, 320, y2, 'Category', item.category);
    yy = field(doc, 40, yy, 'Brand', item.brand);
    y2 = field(doc, 320, y2, 'Condition', item.condition);
    y = Math.max(yy, y2);
    if (item.notes) {
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
      doc.text('NOTES', 40, y);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
      doc.text(String(item.notes), 40, y + 13, { maxWidth: 532 });
      y += 44;
    }

    // Amount box
    doc.setFillColor(...ORANGE);
    doc.roundedRect(40, y, 532, 46, 8, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AMOUNT PAID TO SELLER', 56, y + 28);
    doc.setFontSize(18);
    doc.text(fmt$(item.buyPrice), 556, y + 30, { align: 'right' });
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    y += 70;

    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
    doc.text('SELLER', 40, y);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
    if (seller) {
      const nm = `${seller.first || ''} ${seller.last || ''}`.trim() || '(unnamed)';
      doc.text(`${nm}   ·   ID: ${seller.idNumber || 'not on file'}`, 40, y + 14);
      doc.text([seller.addr, seller.city, seller.state, seller.zip].filter(Boolean).join(', ') || ' ', 40, y + 30);
      y += 56;
    } else {
      doc.text('Not recorded', 40, y + 14);
      y += 40;
    }

    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text('The seller affirms they are the lawful owner of the item described above and that it is free of liens and encumbrances. All purchases are final upon payment.', 40, y, { maxWidth: 532 });
    doc.setTextColor(...INK);
    y += 50;

    sigLine(doc, 40, y + 30, 'Seller signature');
    sigLine(doc, 330, y + 30, `${SHOP.name} representative`);

    drawFooter(doc, `${SHOP.name} · ${SHOP.addr} · ${SHOP.phone}`);
    doc.save(`Receipt-${safe(item.sku)}-${stamp()}.pdf`);
  }

  /* ---------------- Reports ---------------- */
  function itemDateMs(i) {
    if (i.date) { const t = Date.parse(i.date + 'T12:00:00'); if (!isNaN(t)) return t; }
    return i.createdAt || 0;
  }

  function inRange(i, fromMs, toMs) {
    const t = itemDateMs(i);
    return t >= fromMs && t <= toMs;
  }

  function getRange() {
    const from = document.querySelector('#repFrom').value;
    const to = document.querySelector('#repTo').value;
    const fromMs = from ? Date.parse(from + 'T00:00:00') : 0;
    const toMs = to ? Date.parse(to + 'T23:59:59') : Date.now() + 86400000;
    const label = `${from || 'beginning'} to ${to || 'today'}`;
    return { fromMs, toMs, label };
  }

  function transactionReportPdf() {
    const { items, sellers } = window.EVBInventory.getData();
    const { fromMs, toMs, label } = getRange();
    const rows = items.filter((i) => inRange(i, fromMs, toMs)).sort((a, b) => itemDateMs(a) - itemDateMs(b));

    const doc = newDoc();
    let y = drawHeader(doc, 'Purchase Report');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Range: ${label}   ·   ${rows.length} purchase${rows.length === 1 ? '' : 's'}   ·   generated ${new Date().toLocaleString()}`, 40, y);
    doc.setTextColor(...INK);
    y += 24;

    const cols = [
      { h: 'Date', x: 40, w: 58 },
      { h: 'SKU', x: 100, w: 70 },
      { h: 'Item', x: 172, w: 168 },
      { h: 'Paid', x: 342, w: 52 },
      { h: 'Seller', x: 396, w: 96 },
      { h: 'ID Number', x: 494, w: 78 },
    ];
    const drawTableHead = () => {
      doc.setFillColor(245, 242, 238);
      doc.rect(36, y - 11, 540, 18, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      cols.forEach((c) => doc.text(c.h.toUpperCase(), c.x, y + 1));
      doc.setFont('helvetica', 'normal');
      y += 18;
    };
    drawTableHead();

    let total = 0;
    doc.setFontSize(8.5);
    for (const i of rows) {
      if (y > 730) { doc.addPage(); y = 50; drawTableHead(); doc.setFontSize(8.5); }
      const s = sellers.find((x) => x.id === i.sellerId);
      const nm = s ? window.EVBInventory.sellerName(s) : '—';
      const d = new Date(itemDateMs(i));
      doc.text(`${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`, cols[0].x, y);
      doc.text(String(i.sku), cols[1].x, y);
      doc.text(doc.splitTextToSize(String(i.name || ''), cols[2].w)[0] || '', cols[2].x, y);
      doc.text(fmt$(i.buyPrice), cols[3].x, y);
      doc.text(doc.splitTextToSize(nm, cols[4].w)[0] || '—', cols[4].x, y);
      doc.text(String((s && s.idNumber) || '—').slice(0, 18), cols[5].x, y);
      total += +i.buyPrice || 0;
      y += 15;
    }

    y += 6;
    doc.setDrawColor(...INK); doc.setLineWidth(0.8);
    doc.line(36, y - 10, 576, y - 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`TOTAL PAID OUT: ${fmt$(total)}`, 576, y + 4, { align: 'right' });

    drawFooter(doc, `${SHOP.name} — secondhand dealer purchase records. Seller identity verified by government-issued photo ID at time of purchase.`);
    doc.save(`EVB-Purchase-Report-${stamp()}.pdf`);
    return rows.length;
  }

  function transactionReportCsv() {
    const { items, sellers } = window.EVBInventory.getData();
    const { fromMs, toMs } = getRange();
    const rows = items.filter((i) => inRange(i, fromMs, toMs)).sort((a, b) => itemDateMs(a) - itemDateMs(b));
    const head = 'Date,SKU,Item,Category,Brand,Condition,Paid,Status,Sold for,Seller,Seller ID,Seller address,Notes';
    const lines = rows.map((i) => {
      const s = sellers.find((x) => x.id === i.sellerId);
      const cells = [
        i.date || new Date(i.createdAt).toLocaleDateString(), i.sku, i.name, i.category, i.brand, i.condition,
        i.buyPrice, i.status, i.soldPrice || '',
        s ? window.EVBInventory.sellerName(s) : '', s ? s.idNumber || '' : '',
        s ? [s.addr, s.city, s.state, s.zip].filter(Boolean).join(', ') : '', i.notes || '',
      ];
      return cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',');
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head, ...lines].join('\n')], { type: 'text/csv' }));
    a.download = `EVB-Purchases-${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    return rows.length;
  }

  function inventoryValueReport() {
    const { items } = window.EVBInventory.getData();
    const stock = items.filter((i) => i.status === 'in_stock');
    const byCat = {};
    for (const i of stock) {
      const c = i.category || 'Other';
      byCat[c] = byCat[c] || { n: 0, paid: 0, est: 0 };
      byCat[c].n += 1;
      byCat[c].paid += +i.buyPrice || 0;
      byCat[c].est += +i.estResale || 0;
    }

    const doc = newDoc();
    let y = drawHeader(doc, 'Inventory Value');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${stock.length} item${stock.length === 1 ? '' : 's'} in stock · generated ${new Date().toLocaleString()}`, 40, y);
    doc.setTextColor(...INK);
    y += 26;

    doc.setFillColor(245, 242, 238);
    doc.rect(36, y - 11, 540, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('CATEGORY', 44, y + 1);
    doc.text('ITEMS', 300, y + 1);
    doc.text('INVESTED', 390, y + 1);
    doc.text('EST. RESALE', 490, y + 1);
    doc.setFont('helvetica', 'normal');
    y += 20;

    let tN = 0, tPaid = 0, tEst = 0;
    doc.setFontSize(10);
    for (const [cat, v] of Object.entries(byCat).sort((a, b) => b[1].paid - a[1].paid)) {
      doc.text(cat, 44, y);
      doc.text(String(v.n), 300, y);
      doc.text(fmt$(v.paid), 390, y);
      doc.text(v.est ? fmt$(v.est) : '—', 490, y);
      tN += v.n; tPaid += v.paid; tEst += v.est;
      y += 17;
    }
    y += 4;
    doc.setDrawColor(...INK); doc.setLineWidth(0.8);
    doc.line(36, y - 10, 576, y - 10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 44, y + 4);
    doc.text(String(tN), 300, y + 4);
    doc.text(fmt$(tPaid), 390, y + 4);
    doc.text(tEst ? fmt$(tEst) : '—', 490, y + 4);

    drawFooter(doc, `${SHOP.name} · ${SHOP.addr} · ${SHOP.phone}`);
    doc.save(`EVB-Inventory-Value-${stamp()}.pdf`);
  }

  /* ---------------- Reports tab wiring ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const from = document.querySelector('#repFrom');
    const to = document.querySelector('#repTo');
    if (!from) return;

    const iso = (d) => d.toISOString().slice(0, 10);
    const setThisMonth = () => {
      const now = new Date();
      from.value = iso(new Date(now.getFullYear(), now.getMonth(), 1));
      to.value = iso(now);
    };
    setThisMonth();

    document.querySelector('#repThisMonth').addEventListener('click', setThisMonth);
    document.querySelector('#repLastMonth').addEventListener('click', () => {
      const now = new Date();
      from.value = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to.value = iso(new Date(now.getFullYear(), now.getMonth(), 0));
    });
    document.querySelector('#repAllTime').addEventListener('click', () => { from.value = ''; to.value = ''; });

    const st = document.querySelector('#repStatus');
    document.querySelector('#repTransPdf').addEventListener('click', () => {
      if (!window.EVBInventory) return;
      const n = transactionReportPdf();
      setStatus(st, 'ok', `Purchase report downloaded — ${n} transaction${n === 1 ? '' : 's'} in range.`);
      logActivity('Reports: purchase report PDF downloaded');
    });
    document.querySelector('#repTransCsv').addEventListener('click', () => {
      if (!window.EVBInventory) return;
      const n = transactionReportCsv();
      setStatus(st, 'ok', `CSV downloaded — ${n} transaction${n === 1 ? '' : 's'} in range.`);
    });
    document.querySelector('#repStockPdf').addEventListener('click', () => {
      if (!window.EVBInventory) return;
      inventoryValueReport();
      setStatus(st, 'ok', 'Inventory value report downloaded.');
      logActivity('Reports: inventory value PDF downloaded');
    });
  });

  window.EVBPdf = { sellerIdRecord, purchaseReceipt };
})();
