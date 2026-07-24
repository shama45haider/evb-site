/* East Village Buyers — Manage Blogs Admin
   A small static admin app that talks directly to the GitHub REST API
   from the browser using a personal access token. No server, no build step.
*/

const REPO_OWNER = 'shama45haider';
const REPO_NAME = 'evb-site';
const BRANCH = 'master';
const TOKEN_KEY = 'evb_admin_gh_token';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function gh(path, options = {}) {
  const token = getToken();
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function getFile(path) {
  try {
    const data = await gh(`contents/${path}?ref=${BRANCH}`);
    return { content: b64DecodeUnicode(data.content), sha: data.sha };
  } catch (e) {
    if (String(e.message).includes('404')) return null;
    throw e;
  }
}

async function putFile(path, content, message, sha) {
  return gh(`contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: b64EncodeUnicode(content),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

async function listBlogPosts() {
  const items = await gh(`contents/blog?ref=${BRANCH}`);
  return items
    .filter((i) => i.type === 'dir')
    .map((i) => i.name)
    .sort();
}

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---- Post template ---- */
function buildPostHtml(f) {
  const faqSchema = f.faqs.length
    ? `\n  <script type="application/ld+json">\n  {\n    "@context": "https://schema.org",\n    "@type": "FAQPage",\n    "mainEntity": [\n${f.faqs
        .map(
          (q) => `      {\n        "@type": "Question",\n        "name": ${JSON.stringify(q.q)},\n        "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(q.a)} }\n      }`
        )
        .join(',\n')}\n    ]\n  }\n  </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '869234452921811');
fbq('track', 'PageView');
</script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MGZ7DGKM');</script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(f.title)} | EVB</title>
  <meta name="description" content="${esc(f.description)}">
  <meta name="keywords" content="${esc(f.keywords)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://eastvillagebuyers.com/blog/${f.slug}/">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(f.title)}">
  <meta property="og:description" content="${esc(f.description)}">
  <meta property="og:url" content="https://eastvillagebuyers.com/blog/${f.slug}/">
  <meta property="og:image" content="https://eastvillagebuyers.com/${esc(f.heroImage)}">
  <meta property="og:site_name" content="East Village Buyers">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(f.title)}">
  <meta name="twitter:description" content="${esc(f.description)}">
  <meta name="twitter:image" content="https://eastvillagebuyers.com/${esc(f.heroImage)}">

<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(f.title)},
    "description": ${JSON.stringify(f.description)},
    "image": "https://eastvillagebuyers.com/${f.heroImage}",
    "datePublished": "${f.date}",
    "dateModified": "${f.date}",
    "author": { "@type": "Organization", "name": "East Village Buyers" },
    "publisher": {
      "@type": "Organization",
      "name": "East Village Buyers",
      "logo": { "@type": "ImageObject", "url": "https://eastvillagebuyers.com/evblogo.webp" }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "https://eastvillagebuyers.com/blog/${f.slug}/" }
  }
  </script>${faqSchema}

  <link rel="icon" type="image/x-icon" href="../../favicon.ico">
  <meta name="theme-color" content="#f97316">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Fjalla+One&family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Montserrat', sans-serif; background: #f8f5f0; color: #1a1814; -webkit-font-smoothing: antialiased; overflow-x: hidden; max-width: 100%; }
    img, svg, video { max-width: 100%; }
    .blog-main { max-width: 1100px; margin: 0 auto; padding: 48px 24px 80px; display: grid; grid-template-columns: 1fr 300px; gap: 48px; align-items: start; }
    @media (max-width: 900px) { .blog-main { grid-template-columns: 1fr; gap: 40px; } }
    .blog-article { background: #fff; border-radius: 18px; border: 1px solid #e8e4de; box-shadow: 0 6px 28px rgba(0,0,0,0.07); overflow: hidden; }
    .blog-article-header { padding: 32px 36px 24px; border-bottom: 1px solid #f0ece6; }
    .blog-article-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .blog-article-cat { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #e8690a; }
    .blog-article-date { font-size: 12px; color: #9a9490; font-family: 'Inter', sans-serif; }
    .blog-article-title { font-family: 'Montserrat', sans-serif; font-size: clamp(1.4rem, 3.2vw, 2rem); font-weight: 900; color: #0c0b0a; letter-spacing: -0.02em; line-height: 1.2; text-transform: uppercase; margin: 0; }
    .blog-article-hero { width: 100%; height: 360px; object-fit: cover; display: block; background: #ece8e2; }
    @media (max-width: 640px) { .blog-article-hero { height: 220px; } }
    .blog-article-body { padding: 36px; font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.75; color: #3a3530; }
    .blog-article-body h2 { font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 800; color: #0c0b0a; margin: 40px 0 16px; letter-spacing: -0.01em; text-transform: uppercase; }
    .blog-article-body h2:first-child { margin-top: 0; }
    .blog-article-body h3 { font-family: 'Montserrat', sans-serif; font-size: 17px; font-weight: 700; color: #1a1814; margin: 32px 0 12px; }
    .blog-article-body p { margin-bottom: 20px; }
    .blog-article-body ul { margin: 0 0 24px; padding-left: 20px; }
    .blog-article-body li { margin-bottom: 10px; }
    .blog-article-body li::marker { color: #e8690a; }
    .blog-article-body strong { color: #0c0b0a; font-weight: 700; }
    .blog-article-inline-img { width: 100%; height: 280px; object-fit: cover; border-radius: 14px; margin: 8px 0 28px; display: block; }
    .blog-article-cta { padding: 32px 36px 36px; background: #fff8f3; border-top: 1px solid #f5ddc8; text-align: center; }
    .blog-article-cta h3 { font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 900; color: #0c0b0a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: -0.01em; }
    .blog-article-cta p { font-family: 'Inter', sans-serif; font-size: 14px; color: #5a5550; margin: 0 0 20px; line-height: 1.65; }
    .blog-article-cta-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; background: #e8690a; color: #fff; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 0 #b84f06; }
    .blog-sidebar { display: flex; flex-direction: column; gap: 28px; position: sticky; top: 78px; }
    @media (max-width: 900px) { .blog-sidebar { position: static; } }
    .sidebar-widget { background: #fff; border-radius: 14px; border: 1px solid #e8e4de; overflow: hidden; }
    .sidebar-widget-head { padding: 16px 18px 14px; border-bottom: 2px solid #f0ece6; }
    .sidebar-widget-title { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #e8690a; }
    .sidebar-about-logo { height: 28px; width: auto; display: block; margin-bottom: 12px; opacity: 0.7; }
    .sidebar-about-text { font-size: 13px; color: #6b6560; line-height: 1.65; margin-bottom: 14px; font-family: 'Inter', sans-serif; }
    .sidebar-about-addr { font-size: 12px; color: #9a9490; line-height: 1.6; font-family: 'Inter', sans-serif; }
    .sidebar-cta-widget { background: #fff8f3; border: 1px solid #f5ddc8; }
    .sidebar-cta-body { padding: 16px 18px 20px; }
    .sidebar-cta-text { font-size: 13px; color: #5a5550; line-height: 1.65; margin-bottom: 16px; font-family: 'Inter', sans-serif; }
    .sidebar-cta-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; background: #e8690a; color: #fff; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 0 #b84f06; margin-bottom: 10px; }
    .sidebar-cta-btn-ghost { background: #fff; color: #3a3530; box-shadow: none; border: 1.5px solid #e8e4de; margin-bottom: 0; }
    .cta-btn-copy { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 100%; white-space: normal; }
    .cta-btn-sub { display: block; font-size: 9px; font-weight: 600; letter-spacing: 0.02em; text-transform: none; opacity: 0.7; white-space: nowrap; }
    .blog-breadcrumb-wrap { max-width: 1100px; margin: 0 auto; padding: 16px 24px 0; }
    .blog-breadcrumb { display: flex; align-items: center; gap: 8px; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500; color: #9a9490; }
    .blog-breadcrumb a { color: #9a9490; text-decoration: none; }
    .blog-breadcrumb-sep { color: #ccc; font-size: 10px; }
  </style>
  <link rel="stylesheet" href="../../site-nav.css">
  <link rel="stylesheet" href="../../site-mobile.css">
  <link rel="stylesheet" href="../../site-ticker.css">
  <link rel="stylesheet" href="../../site-footer.css">

  <script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Home", "item": "https://eastvillagebuyers.com/"}, {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://eastvillagebuyers.com/blog/"}, {"@type": "ListItem", "position": 3, "name": ${JSON.stringify(f.title)}, "item": "https://eastvillagebuyers.com/blog/${f.slug}/"}]}
  </script>
</head>
<body>
  <div class="site-topbar"><div class="site-topbar-inner"><a href="https://maps.google.com/?q=39+Avenue+A+New+York+NY+10009" class="site-topbar-item" target="_blank" rel="noopener">39 Avenue A, New York, NY 10009</a></div></div>
  <header class="site-nav" id="evbNav">
    <div class="site-nav-inner">
      <a href="../../" class="site-nav-logo"><img src="../../evbbanner.webp" alt="East Village Buyers"></a>
      <nav class="site-nav-links" aria-label="Main navigation">
        <a href="../../" class="site-nav-link">Home</a>
        <a href="../../about/" class="site-nav-link">About</a>
        <a href="../" class="site-nav-link is-active">Blog</a>
      </nav>
    </div>
  </header>
  <script src="../../site-nav.js"></script>
  <div class="blog-breadcrumb-wrap">
    <nav class="blog-breadcrumb" aria-label="Breadcrumb">
      <a href="../../">Home</a><span class="blog-breadcrumb-sep">/</span><a href="../">Blog</a>
    </nav>
  </div>
  <div class="blog-main">
    <article class="blog-article">
      <header class="blog-article-header">
        <div class="blog-article-meta">
          <span class="blog-article-cat">${esc(f.category)}</span>
          <span class="blog-article-date">${esc(f.dateLabel)}</span>
        </div>
        <h1 class="blog-article-title">${esc(f.title)}</h1>
      </header>
      <img src="../../${esc(f.heroImage)}" alt="${esc(f.heroAlt)}" class="blog-article-hero">
      <div class="blog-article-body">
${f.bodyHtml}
      </div>
      <div class="blog-article-cta">
        <h3>Find Out What It's Worth Today</h3>
        <p>Walk into 39 Avenue A for a transparent, no-pressure cash offer, or text us photos first.</p>
        <a href="sms:9176088939" class="blog-article-cta-btn"><span class="cta-btn-copy"><span class="cta-btn-label">Text Photos for a Quote</span><span class="cta-btn-sub">39 Avenue A, New York, NY 10009</span></span></a>
      </div>
    </article>
    <aside class="blog-sidebar">
      <div class="sidebar-widget sidebar-cta-widget">
        <div class="sidebar-widget-head"><div class="sidebar-widget-title">Get a Same-Day Offer</div></div>
        <div class="sidebar-cta-body">
          <p class="sidebar-cta-text">Walk in with your piece, or text us photos first. We inspect, authenticate, and pay cash the same day at 39 Avenue A.</p>
          <a href="sms:9176088939" class="sidebar-cta-btn"><span class="cta-btn-copy"><span class="cta-btn-label">Text Photos for a Quote</span><span class="cta-btn-sub">39 Avenue A, New York, NY 10009</span></span></a>
          <a href="tel:9176088939" class="sidebar-cta-btn sidebar-cta-btn-ghost"><span class="cta-btn-copy"><span class="cta-btn-label">Call 917-608-8939</span><span class="cta-btn-sub">39 Avenue A, New York, NY 10009</span></span></a>
        </div>
      </div>
      <div class="sidebar-widget">
        <div class="sidebar-widget-head"><div class="sidebar-widget-title">About EVB</div></div>
        <div class="sidebar-widget-body">
          <img src="../../evbbanner.webp" alt="East Village Buyers" class="sidebar-about-logo">
          <p class="sidebar-about-text">East Village Buyers is NYC's neighborhood shop for luxury watches, fine jewelry, streetwear, and electronics.</p>
          <p class="sidebar-about-addr">39 Avenue A &middot; New York, NY 10009<br>Sun 12:30&ndash;6 PM &middot; Mon&ndash;Thu 12:30&ndash;6:30 PM &middot; Fri 12:30&ndash;6 PM</p>
        </div>
      </div>
    </aside>
  </div>
  <footer class="evb-footer">
    <div class="evb-footer-bottom">
      <p class="evb-footer-copy">&copy; 2026 East Village Buyers. All rights reserved.</p>
      <p class="evb-footer-legal">Vintage USA Inc &middot; DBA East Village Buyers &middot; DCA Lic. #2070477</p>
    </div>
  </footer>
  <script src="../../site-ticker.js"></script>
</body>
</html>
`;
}

function buildFaqHtml() {
  const rows = $$('#faqList .faq-item').map((row) => ({
    q: row.querySelector('.faq-q').value.trim(),
    a: row.querySelector('.faq-a').value.trim(),
  })).filter((r) => r.q && r.a);
  return rows;
}

/* ---- Blog index + sitemap patching ---- */
function buildIndexCard(f) {
  return `        <a href="${f.slug}/" class="blog-card" data-cat="jewelry">
          <div class="blog-card-media"><img src="../${esc(f.heroImage)}" alt="${esc(f.heroAlt)}" loading="lazy" decoding="async"></div>
          <div class="blog-card-body">
            <div class="blog-card-meta"><span class="blog-card-cat">${esc(f.category)}</span><span class="blog-card-date">${esc(f.dateLabel)}</span></div>
            <div class="blog-card-title">${esc(f.title)}</div>
            <p class="blog-card-excerpt">${esc(f.excerpt)}</p>
            <span class="blog-card-read">Read more <svg fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
          </div>
        </a>

`;
}

async function updateBlogIndex(f) {
  const file = await getFile('blog/index.html');
  if (!file) throw new Error('Could not read blog/index.html');
  const marker = '<div class="blog-grid" id="blogGrid">';
  const idx = file.content.indexOf(marker);
  if (idx === -1) throw new Error('Could not find blog grid marker in blog/index.html');
  const insertAt = idx + marker.length;
  const newContent = file.content.slice(0, insertAt) + '\n\n' + buildIndexCard(f) + file.content.slice(insertAt);
  await putFile('blog/index.html', newContent, `Add "${f.title}" to blog index`, file.sha);
}

async function updateSitemap(f) {
  const file = await getFile('sitemap.xml');
  if (!file) return; // non-fatal
  const entry = `  <url>\n    <loc>https://eastvillagebuyers.com/blog/${f.slug}/</loc>\n    <lastmod>${f.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  const closeTag = '</urlset>';
  const idx = file.content.lastIndexOf(closeTag);
  if (idx === -1) return;
  const newContent = file.content.slice(0, idx) + entry + file.content.slice(idx);
  await putFile('sitemap.xml', newContent, `Add "${f.title}" to sitemap`, file.sha);
}

/* ---- UI wiring ---- */
function setStatus(el, kind, msg) {
  el.className = `status show ${kind}`;
  el.textContent = msg;
}

function addFaqRow(q = '', a = '') {
  const wrap = document.createElement('div');
  wrap.className = 'faq-item';
  wrap.innerHTML = `
    <button type="button" class="remove-faq">Remove</button>
    <label>Question</label>
    <input type="text" class="faq-q" value="${esc(q)}">
    <label>Answer</label>
    <textarea class="faq-a" rows="2">${esc(a)}</textarea>
  `;
  wrap.querySelector('.remove-faq').addEventListener('click', () => wrap.remove());
  $('#faqList').appendChild(wrap);
}

async function init() {
  const token = getToken();
  if (!token) {
    $('#loginScreen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    return;
  }
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await refreshPostList();
}

async function refreshPostList() {
  const listEl = $('#postList');
  listEl.innerHTML = '<li>Loading…</li>';
  try {
    const posts = await listBlogPosts();
    listEl.innerHTML = posts
      .map(
        (slug) => `<li><div><div class="title">${esc(slug)}</div></div><a class="view" href="https://eastvillagebuyers.com/blog/${esc(slug)}/" target="_blank" rel="noopener">View live &rarr;</a></li>`
      )
      .join('');
  } catch (e) {
    listEl.innerHTML = `<li>Could not load posts: ${esc(e.message)}</li>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('#tokenInput').value.trim();
    if (!t) return;
    setToken(t);
    init();
  });

  $('#logoutBtn').addEventListener('click', () => {
    clearToken();
    init();
  });

  $('#titleInput').addEventListener('input', () => {
    if (!$('#slugInput').dataset.touched) {
      $('#slugInput').value = slugify($('#titleInput').value);
    }
  });
  $('#slugInput').addEventListener('input', () => { $('#slugInput').dataset.touched = '1'; });

  $('#addFaqBtn').addEventListener('click', () => addFaqRow());

  $('#postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = $('#formStatus');
    const submitBtn = $('#submitBtn');
    submitBtn.disabled = true;

    const dateVal = $('#dateInput').value || new Date().toISOString().slice(0, 10);
    const dateLabel = new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const f = {
      title: $('#titleInput').value.trim(),
      slug: slugify($('#slugInput').value || $('#titleInput').value),
      category: $('#categoryInput').value.trim() || 'Jewelry',
      description: $('#descriptionInput').value.trim(),
      keywords: $('#keywordsInput').value.trim(),
      heroImage: $('#heroImageInput').value.trim(),
      heroAlt: $('#heroAltInput').value.trim(),
      excerpt: $('#excerptInput').value.trim(),
      bodyHtml: $('#bodyInput').value.trim(),
      date: dateVal,
      dateLabel,
      faqs: buildFaqHtml(),
    };

    if (!f.title || !f.description || !f.heroImage || !f.bodyHtml) {
      setStatus(statusEl, 'err', 'Please fill in at least Title, Description, Hero Image, and Body.');
      submitBtn.disabled = false;
      return;
    }

    try {
      setStatus(statusEl, 'pending', 'Creating blog post file…');
      const html = buildPostHtml(f);
      const existing = await getFile(`blog/${f.slug}/index.html`);
      await putFile(`blog/${f.slug}/index.html`, html, `Add blog post: ${f.title}`, existing ? existing.sha : undefined);

      setStatus(statusEl, 'pending', 'Adding to blog index…');
      await updateBlogIndex(f);

      setStatus(statusEl, 'pending', 'Adding to sitemap…');
      await updateSitemap(f);

      setStatus(statusEl, 'ok', `Done! Live in a minute or two at eastvillagebuyers.com/blog/${f.slug}/`);
      $('#postForm').reset();
      $('#faqList').innerHTML = '';
      delete $('#slugInput').dataset.touched;
      await refreshPostList();
    } catch (err) {
      setStatus(statusEl, 'err', `Something went wrong: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
});
