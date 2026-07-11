/* EVB Panel — Site Scanner
   Real crawl, no server: fetches sitemap.xml from the live site (GitHub Pages
   sends CORS headers), loads every page, parses it, and runs 11 checks.
   Results include a plain-English fix for every issue found. */

(function () {
  let running = false;

  const CHECKS = [
    { id: 'http404', label: '404 / unreachable pages' },
    { id: 'titleMissing', label: 'Missing titles' },
    { id: 'titleDupe', label: 'Duplicate titles' },
    { id: 'brokenLinks', label: 'Broken links' },
    { id: 'largeImages', label: 'Large images (over 350 KB)' },
    { id: 'missingAlt', label: 'Missing alt tags' },
    { id: 'slowPages', label: 'Slow pages (over 1.5s to load HTML)' },
    { id: 'schemaErrors', label: 'Schema (structured data) errors' },
    { id: 'canonicalErrors', label: 'Canonical errors' },
    { id: 'noindex', label: 'Noindex pages in sitemap' },
    { id: 'internalLinking', label: 'Weak internal linking' },
  ];

  const norm = (u) => {
    try {
      const url = new URL(u, EVB.SITE);
      url.hash = '';
      return url.href;
    } catch { return null; }
  };

  function progress(pct, text) {
    $('#scanBar').style.width = `${pct}%`;
    $('#scanProgressText').textContent = text;
  }

  async function fetchPage(url) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);
      const html = res.ok ? await res.text() : '';
      return { url, status: res.status, ms, html };
    } catch (e) {
      return { url, status: 0, ms: Math.round(performance.now() - t0), html: '', netError: String(e.message || e) };
    }
  }

  async function pool(items, worker, concurrency, onEach) {
    const results = [];
    let i = 0, done = 0;
    async function run() {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await worker(items[idx]);
        done++;
        onEach && onEach(done, items.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
    return results;
  }

  async function runScan() {
    if (running) return;
    running = true;
    $('#scanRun').disabled = true;
    $('#scanProgress').classList.remove('hidden');
    $('#scanSummary').classList.add('hidden');
    $('#scanResults').innerHTML = '';
    const issues = Object.fromEntries(CHECKS.map((c) => [c.id, []]));

    try {
      /* 1. Sitemap */
      progress(2, 'Fetching sitemap.xml…');
      const smRes = await fetch(`${EVB.SITE}/sitemap.xml`, { cache: 'no-store' });
      if (!smRes.ok) throw new Error(`sitemap.xml returned ${smRes.status}`);
      const smText = await smRes.text();
      const pageUrls = Array.from(smText.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)).map((m) => m[1].trim());
      if (!pageUrls.length) throw new Error('No URLs found in sitemap.xml');

      /* 2. Crawl pages */
      const pages = await pool(pageUrls, fetchPage, 5, (done, total) => {
        progress(2 + (done / total) * 55, `Crawling pages… ${done}/${total}`);
      });

      /* 3. Per-page checks */
      progress(60, 'Analyzing pages…');
      const parser = new DOMParser();
      const titleMap = new Map();
      const imageUrls = new Set();
      const internalLinks = new Set();

      for (const p of pages) {
        const path = p.url.replace(EVB.SITE, '') || '/';
        if (p.status !== 200) {
          issues.http404.push({ where: path, detail: p.netError ? `Network error: ${p.netError}` : `HTTP ${p.status}`, fix: 'Restore this page, or remove it from sitemap.xml and 301-redirect the old URL.' });
          continue;
        }
        if (p.ms > 1500) {
          issues.slowPages.push({ where: path, detail: `${p.ms} ms to load the HTML`, fix: 'Trim inline CSS/JS in the page head and cut render-blocking third-party scripts.' });
        }
        const doc = parser.parseFromString(p.html, 'text/html');

        // Titles
        const title = (doc.querySelector('title')?.textContent || '').trim();
        if (!title) {
          issues.titleMissing.push({ where: path, detail: 'No <title> tag', fix: 'Add a unique, descriptive <title> (50–60 characters) to this page.' });
        } else {
          if (!titleMap.has(title)) titleMap.set(title, []);
          titleMap.get(title).push(path);
        }

        // Alt tags (skip invisible tracking pixels — 1x1 or display:none)
        const noAlt = Array.from(doc.querySelectorAll('img')).filter((img) => {
          if (img.hasAttribute('alt')) return false;
          if (img.getAttribute('width') === '1' || img.getAttribute('height') === '1') return false;
          if (/display\s*:\s*none/i.test(img.getAttribute('style') || '')) return false;
          return true;
        });
        if (noAlt.length) {
          issues.missingAlt.push({ where: path, detail: `${noAlt.length} image(s) with no alt attribute — first: ${noAlt[0].getAttribute('src') || '?'}`, fix: 'Add descriptive alt text to every image (or alt="" if purely decorative).' });
        }

        // Schema
        doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
          try { JSON.parse(s.textContent); } catch (e) {
            issues.schemaErrors.push({ where: path, detail: `Invalid JSON-LD: ${String(e.message).slice(0, 80)}`, fix: 'Fix the JSON syntax in this structured-data block (validate at validator.schema.org).' });
          }
        });

        // Canonical
        const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        if (!canon) {
          issues.canonicalErrors.push({ where: path, detail: 'No canonical tag', fix: `Add <link rel="canonical" href="${p.url}"> to the page head.` });
        } else if (norm(canon) !== norm(p.url)) {
          issues.canonicalErrors.push({ where: path, detail: `Canonical points elsewhere: ${canon}`, fix: 'Point the canonical at this page\'s own URL unless the mismatch is intentional.' });
        }

        // Noindex
        const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
        if (/noindex/i.test(robots)) {
          issues.noindex.push({ where: path, detail: `robots meta is "${robots}"`, fix: 'This page is in sitemap.xml but blocked from Google — remove it from the sitemap or drop the noindex.' });
        }

        // Collect links + images for the later passes
        let internalCount = 0;
        doc.querySelectorAll('a[href]').forEach((a) => {
          const href = a.getAttribute('href');
          if (!href || /^(tel:|sms:|mailto:|javascript:|#)/i.test(href)) return;
          const abs = norm(new URL(href, p.url).href);
          if (abs && abs.startsWith(EVB.SITE)) {
            internalCount++;
            internalLinks.add(JSON.stringify({ link: abs, from: path }));
          }
        });
        if (internalCount < 3) {
          issues.internalLinking.push({ where: path, detail: `Only ${internalCount} internal link(s) on the page`, fix: 'Link this page to (and from) related pages — category pages and relevant blog posts.' });
        }
        doc.querySelectorAll('img[src]').forEach((img) => {
          const src = img.getAttribute('src');
          if (!src || src.startsWith('data:')) return;
          const abs = norm(new URL(src, p.url).href);
          if (abs && abs.startsWith(EVB.SITE)) imageUrls.add(abs);
        });
      }

      // Duplicate titles
      for (const [title, paths] of titleMap) {
        if (paths.length > 1) {
          issues.titleDupe.push({ where: paths.join('  +  '), detail: `Same title on ${paths.length} pages: "${title}"`, fix: 'Give each page its own unique title so they don\'t compete in search results.' });
        }
      }

      /* 4. Broken internal links */
      const pageSet = new Set(pages.map((p) => norm(p.url)));
      const linkChecks = new Map(); // url -> [from...]
      for (const raw of internalLinks) {
        const { link, from } = JSON.parse(raw);
        if (pageSet.has(link) || pageSet.has(link.replace(/\/$/, '') + '/')) continue; // already crawled OK
        if (!linkChecks.has(link)) linkChecks.set(link, []);
        linkChecks.get(link).push(from);
      }
      const linkUrls = Array.from(linkChecks.keys()).slice(0, 80);
      let li = 0;
      await pool(linkUrls, async (url) => {
        const res = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'force-cache' }).catch(() => null);
        li++;
        progress(60 + (li / Math.max(linkUrls.length, 1)) * 20, `Checking links… ${li}/${linkUrls.length}`);
        if (!res || res.status === 404) {
          issues.brokenLinks.push({ where: url.replace(EVB.SITE, ''), detail: `Linked from: ${[...new Set(linkChecks.get(url))].slice(0, 3).join(', ')}`, fix: 'Update or remove this link — the target doesn\'t exist.' });
        }
      }, 5);

      /* 5. Large images */
      const imgUrls = Array.from(imageUrls).slice(0, 150);
      let ii = 0;
      await pool(imgUrls, async (url) => {
        const res = await fetch(url, { method: 'HEAD', cache: 'force-cache' }).catch(() => null);
        ii++;
        progress(80 + (ii / Math.max(imgUrls.length, 1)) * 18, `Weighing images… ${ii}/${imgUrls.length}`);
        const len = res && res.ok ? parseInt(res.headers.get('content-length') || '0', 10) : 0;
        if (len > 350 * 1024) {
          issues.largeImages.push({ where: url.replace(EVB.SITE, ''), detail: `${(len / 1024 / 1024).toFixed(2)} MB`, fix: 'Convert to WebP and resize to its display size — aim for under 200 KB.' });
        }
      }, 5);

      /* 6. Render */
      progress(100, 'Done.');
      const totalIssues = Object.values(issues).reduce((n, arr) => n + arr.length, 0);
      const summary = {
        at: Date.now(),
        pagesScanned: pages.length,
        linksChecked: linkUrls.length,
        imagesChecked: imgUrls.length,
        totalIssues,
        counts: Object.fromEntries(CHECKS.map((c) => [c.id, issues[c.id].length])),
      };
      localStorage.setItem(EVB.KEYS.lastScan, JSON.stringify(summary));
      logActivity(`Site scan finished — ${totalIssues} issue(s) across ${pages.length} pages`);
      renderResults(summary, issues);
    } catch (e) {
      $('#scanResults').innerHTML = `<div class="card"><h3 class="card-title">Scan failed</h3><p class="card-desc">${e.message}. If this is a CORS error, run the scan from the deployed panel at panel.eastvillagebuyers.com — browsers only allow the crawl from there or with GitHub Pages CORS headers intact.</p></div>`;
    } finally {
      running = false;
      $('#scanRun').disabled = false;
      setTimeout(() => $('#scanProgress').classList.add('hidden'), 800);
      renderLastRun();
    }
  }

  function renderResults(summary, issues) {
    const sum = $('#scanSummary');
    sum.classList.remove('hidden');
    sum.innerHTML = `
      <div class="scan-sum-card"><div class="n">${summary.pagesScanned}</div><div class="l">Pages crawled</div></div>
      <div class="scan-sum-card"><div class="n">${summary.linksChecked}</div><div class="l">Links checked</div></div>
      <div class="scan-sum-card"><div class="n">${summary.imagesChecked}</div><div class="l">Images weighed</div></div>
      <div class="scan-sum-card ${summary.totalIssues ? 'bad' : 'good'}"><div class="n">${summary.totalIssues}</div><div class="l">Issues to fix</div></div>`;

    $('#scanResults').innerHTML = CHECKS.map((c) => {
      const list = issues[c.id];
      const state = list.length === 0 ? 'pass' : (c.id === 'slowPages' || c.id === 'internalLinking' || c.id === 'largeImages') ? 'warn' : 'fail';
      const body = list.length === 0
        ? '<div class="scan-pass-note">All clear — nothing to fix.</div>'
        : list.slice(0, 30).map((i) => `<div class="scan-issue"><div class="where">${i.where}</div><div>${i.detail}</div><div class="fix">${i.fix}</div></div>`).join('') +
          (list.length > 30 ? `<div class="scan-pass-note" style="color:var(--muted)">…and ${list.length - 30} more.</div>` : '');
      return `<div class="scan-check ${state}">
        <div class="scan-check-head" data-toggle>
          <span class="scan-check-ico">${state === 'pass' ? '✓' : '!'}</span>
          ${c.label}
          <span class="scan-check-count">${list.length === 0 ? 'Pass' : `${list.length} issue${list.length > 1 ? 's' : ''}`}</span>
        </div>
        <div class="scan-check-body">${body}</div>
      </div>`;
    }).join('');

    $$('#scanResults [data-toggle]').forEach((h) => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    renderOverview();
  }

  function renderLastRun() {
    const scan = JSON.parse(localStorage.getItem(EVB.KEYS.lastScan) || 'null');
    $('#scanLastRun').textContent = scan
      ? `Last scan: ${new Date(scan.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — ${scan.totalIssues} issue(s)`
      : 'Last scan: never';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#scanRun').addEventListener('click', runScan);
    const daily = $('#scanDaily');
    daily.checked = localStorage.getItem(EVB.KEYS.dailyScan) !== '0';
    daily.addEventListener('change', () => localStorage.setItem(EVB.KEYS.dailyScan, daily.checked ? '1' : '0'));
    renderLastRun();
  });

  // Daily auto-scan: when the panel opens and the last scan is stale (>24h).
  document.addEventListener('evb:app-shown', () => {
    renderLastRun();
    if (localStorage.getItem(EVB.KEYS.dailyScan) === '0') return;
    const scan = JSON.parse(localStorage.getItem(EVB.KEYS.lastScan) || 'null');
    if (!scan || Date.now() - scan.at > 24 * 3600 * 1000) {
      setTimeout(runScan, 1200);
    }
  });
})();
