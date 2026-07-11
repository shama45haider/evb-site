/* EVB Panel — Blog Maker
   Prompt → AI (Groq free tier, or built-in demo writer) → post HTML in the
   site's exact blog layout → published straight to GitHub (post + blog index
   + sitemap). Images are drag-dropped, uploaded to the repo root, and woven
   into the article body. */

(function () {
  const images = []; // { file, dataUrl, name }
  let generated = null; // { fields, html }

  const slugify = (t) => t.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- Images: drag & drop ---------- */
  function renderThumbs() {
    const wrap = $('#bmThumbs');
    wrap.innerHTML = '';
    images.forEach((img, i) => {
      const d = document.createElement('div');
      d.className = 'thumb';
      d.innerHTML = `<img src="${img.dataUrl}" alt="">` +
        (i === 0 ? '<span class="thumb-hero">HERO</span>' : '') +
        `<button class="thumb-x" title="Remove">&times;</button>`;
      d.querySelector('.thumb-x').addEventListener('click', () => { images.splice(i, 1); renderThumbs(); });
      wrap.appendChild(d);
    });
  }

  function addFiles(fileList) {
    Array.from(fileList).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        images.push({ file, dataUrl: reader.result });
        renderThumbs();
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- AI generation ---------- */
  const SYSTEM_PROMPT = `You write blog posts for East Village Buyers, a buy-and-sell shop at 39 Avenue A, New York, NY 10009 (phone 917-608-8939) that buys gold, silver, jewelry, luxury watches, designer bags, streetwear, sneakers, and electronics for same-day cash.
Voice: straightforward, 9th-grade reading level, confident, local, never salesy-cheesy. Weave in SEO keywords naturally.
Return ONLY valid JSON (no markdown fences) with this shape:
{"title": string (60 chars max), "description": string (150 chars max meta description), "keywords": string (8-10 comma-separated), "excerpt": string (short card teaser, 120 chars max), "bodyHtml": string, "faqs": [{"q": string, "a": string} x4]}
bodyHtml rules: open with one <p> intro (no heading first), then 4-6 <h2> sections (title-case, no numbering) each with 1-3 <p>; sprinkle one <h3> subsection and one <ul> with <li><strong>…</strong> — …</li> items somewhere; every paragraph mentions selling to/buying from a real NYC shop where natural; final <h2> section invites the reader to text photos to 917-608-8939 or walk into 39 Avenue A. Do not include images, scripts, or styles.`;

  async function generateWithGroq(prompt, title, category) {
    const key = localStorage.getItem(EVB.KEYS.groqKey);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Topic: ${prompt}\nCategory: ${category}${title ? `\nRequired title: ${title}` : ''}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }

  /* Demo writer — instant, offline, keeps the exact structure so the
     preview/publish pipeline can be exercised without any API key. */
  function generateDemo(prompt, title, category) {
    const t = title || (prompt.charAt(0).toUpperCase() + prompt.slice(1)).replace(/\.$/, '').slice(0, 70);
    const cat = category.toLowerCase();
    return {
      title: t,
      description: `${t} — what it's worth, what buyers look for, and how to get paid same-day cash at East Village Buyers, 39 Avenue A NYC.`,
      keywords: `sell ${cat} NYC, ${cat} buyers NYC, cash for ${cat}, East Village Buyers, sell ${cat} same day, ${cat} resale value NYC`,
      excerpt: `What your ${cat} is really worth right now, and how to turn it into same-day cash in NYC.`,
      bodyHtml: `<p>If you've been wondering about ${esc(prompt)}, you're not alone — it's one of the questions we hear most at the counter. Here's the straightforward version, from a shop that buys and sells ${esc(cat)} every single day at 39 Avenue A.</p>

<h2>What Actually Drives the Value</h2>
<p>Condition, brand, and demand set the price. A piece that's clean, authentic, and in demand right now will always pull a stronger offer than something that's been sitting untouched.</p>
<p>The resale market moves fast. What was quiet a year ago can be the hottest thing in the case today, which is why a fresh, in-person evaluation beats any online estimate.</p>

<h2>What We Check First</h2>
<ul>
<li><strong>Authenticity</strong> — verified in front of you, never sent away.</li>
<li><strong>Condition</strong> — honest wear is fine; we price it fairly.</li>
<li><strong>Market demand</strong> — we track what's actually selling in NYC right now.</li>
<li><strong>Completeness</strong> — boxes, papers, and receipts add real money.</li>
</ul>

<h2>Why Sellers Choose a Walk-In Shop</h2>
<p>No shipping, no waiting on an email offer, no fees taken out at the end. You walk in, we evaluate while you watch, and you leave with cash the same day.</p>
<h3>The 20-Minute Rule</h3>
<p>Most evaluations take under twenty minutes. Bring the item, we'll do the rest.</p>

<h2>Get a Real Number Today</h2>
<p>Text photos to 917-608-8939 for a fast estimate, or walk into East Village Buyers at 39 Avenue A, New York, NY 10009. Transparent evaluation, same-day cash, no pressure either way.</p>`,
      faqs: [
        { q: `Do you buy ${cat} in any condition?`, a: 'Yes — condition affects the offer, but we evaluate everything honestly and explain exactly how we priced it.' },
        { q: 'Do I need an appointment?', a: 'No. Walk-ins are welcome during store hours, Sun–Thu 12:30–6:30 PM and Fri 12:30–6 PM.' },
        { q: 'How fast do I get paid?', a: 'Same day, on the spot, as soon as you accept the offer.' },
        { q: 'Can I get an estimate before coming in?', a: 'Yes — text clear photos to 917-608-8939 and we\'ll give you a fast ballpark first.' },
      ],
    };
  }

  /* ---------- Post template (matches the live blog layout) ---------- */
  function buildPostHtml(f) {
    const faqSchema = f.faqs && f.faqs.length
      ? `\n  <script type="application/ld+json">\n  {\n    "@context": "https://schema.org",\n    "@type": "FAQPage",\n    "mainEntity": [\n${f.faqs.map((q) => `      {\n        "@type": "Question",\n        "name": ${JSON.stringify(q.q)},\n        "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(q.a)} }\n      }`).join(',\n')}\n    ]\n  }\n  <\/script>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<!-- Meta Pixel Code -->
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
<\/script>
<!-- End Meta Pixel Code -->

<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MGZ7DGKM');<\/script>
<!-- End Google Tag Manager -->
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
  <\/script>${faqSchema}

  <link rel="icon" type="image/x-icon" href="../../favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="../../favicon-32x32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="../../apple-touch-icon.png">
  <meta name="theme-color" content="#f97316">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Fjalla+One&family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Montserrat', sans-serif; background: #f8f5f0; color: #1a1814; -webkit-font-smoothing: antialiased; overflow-x: hidden; max-width: 100%; }
    img, svg, video { max-width: 100%; }
    .blog-main { max-width: 1100px; margin: 0 auto; padding: 48px 24px 80px; display: grid; grid-template-columns: 1fr 300px; gap: 48px; align-items: start; }
    @media (max-width: 900px) { .blog-main { grid-template-columns: 1fr; gap: 40px; } }
    .blog-article { background: #fff; border-radius: 18px; border: 1px solid #e8e4de; box-shadow: 0 6px 28px rgba(0,0,0,0.07); overflow: hidden; }
    .blog-article-header { padding: 32px 36px 24px; border-bottom: 1px solid #f0ece6; }
    @media (max-width: 640px) { .blog-article-header { padding: 24px 20px 20px; } }
    .blog-article-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .blog-article-cat { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #e8690a; }
    .blog-article-date { font-size: 12px; color: #9a9490; font-family: 'Inter', sans-serif; }
    .blog-article-title { font-family: 'Montserrat', sans-serif; font-size: clamp(1.4rem, 3.2vw, 2rem); font-weight: 900; color: #0c0b0a; letter-spacing: -0.02em; line-height: 1.2; text-transform: uppercase; margin: 0; }
    .blog-article-hero { width: 100%; height: 360px; object-fit: cover; display: block; background: #ece8e2; }
    @media (max-width: 640px) { .blog-article-hero { height: 220px; } }
    .blog-article-body { padding: 36px; font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.75; color: #3a3530; }
    @media (max-width: 640px) { .blog-article-body { padding: 24px 20px; font-size: 15px; } }
    .blog-article-body h2 { font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 800; color: #0c0b0a; margin: 40px 0 16px; letter-spacing: -0.01em; text-transform: uppercase; }
    .blog-article-body h2:first-child { margin-top: 0; }
    .blog-article-body h3 { font-family: 'Montserrat', sans-serif; font-size: 17px; font-weight: 700; color: #1a1814; margin: 32px 0 12px; }
    .blog-article-body p { margin-bottom: 20px; }
    .blog-article-body ul { margin: 0 0 24px; padding-left: 20px; }
    .blog-article-body li { margin-bottom: 10px; }
    .blog-article-body li::marker { color: #e8690a; }
    .blog-article-body strong { color: #0c0b0a; font-weight: 700; }
    .blog-article-inline-img { width: 100%; height: 280px; object-fit: cover; border-radius: 14px; margin: 8px 0 28px; display: block; }
    @media (max-width: 640px) { .blog-article-inline-img { height: 200px; } }
    .blog-article-cta { padding: 32px 36px 36px; background: #fff8f3; border-top: 1px solid #f5ddc8; text-align: center; }
    @media (max-width: 640px) { .blog-article-cta { padding: 28px 20px; } }
    .blog-article-cta h3 { font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 900; color: #0c0b0a; margin: 0 0 10px; text-transform: uppercase; letter-spacing: -0.01em; }
    .blog-article-cta p { font-family: 'Inter', sans-serif; font-size: 14px; color: #5a5550; margin: 0 0 20px; line-height: 1.65; }
    .blog-article-cta-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; background: #e8690a; color: #fff; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 0 #b84f06; transition: transform 0.15s, box-shadow 0.15s; }
    .blog-article-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 0 #b84f06; }
    .blog-sidebar { display: flex; flex-direction: column; gap: 28px; position: sticky; top: 78px; }
    @media (max-width: 900px) { .blog-sidebar { position: static; } }
    .sidebar-widget { background: #fff; border-radius: 14px; border: 1px solid #e8e4de; overflow: hidden; }
    .sidebar-widget-head { padding: 16px 18px 14px; border-bottom: 2px solid #f0ece6; }
    .sidebar-widget-title { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #e8690a; }
    .sidebar-widget-body { padding: 16px 18px; }
    .sidebar-about-logo { height: 28px; width: auto; display: block; margin-bottom: 12px; opacity: 0.7; }
    .sidebar-about-text { font-size: 13px; color: #6b6560; line-height: 1.65; margin-bottom: 14px; font-family: 'Inter', sans-serif; }
    .sidebar-about-addr { font-size: 12px; color: #9a9490; line-height: 1.6; font-family: 'Inter', sans-serif; }
    .sidebar-cta-widget { background: #fff8f3; border: 1px solid #f5ddc8; }
    .sidebar-cta-widget .sidebar-widget-head { border-bottom-color: #f0ece6; }
    .sidebar-cta-body { padding: 16px 18px 20px; }
    .sidebar-cta-text { font-size: 13px; color: #5a5550; line-height: 1.65; margin-bottom: 16px; font-family: 'Inter', sans-serif; }
    .sidebar-cta-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; background: #e8690a; color: #fff; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 0 #b84f06; transition: transform 0.15s, box-shadow 0.15s; margin-bottom: 10px; }
    .sidebar-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 0 #b84f06; }
    .sidebar-cta-btn-ghost { background: #fff; color: #3a3530; box-shadow: none; border: 1.5px solid #e8e4de; margin-bottom: 0; }
    .sidebar-cta-btn-ghost:hover { border-color: #e8690a; color: #e8690a; box-shadow: none; }
    .cta-btn-copy { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 100%; white-space: normal; }
    .cta-btn-sub { display: block; font-size: 9px; font-weight: 600; letter-spacing: 0.02em; text-transform: none; opacity: 0.7; white-space: nowrap; }
    .blog-breadcrumb-wrap { max-width: 1100px; margin: 0 auto; padding: 16px 24px 0; }
    .blog-breadcrumb { display: flex; align-items: center; gap: 8px; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500; color: #9a9490; flex-wrap: wrap; }
    .blog-breadcrumb a { color: #9a9490; text-decoration: none; transition: color 0.15s; }
    .blog-breadcrumb a:hover { color: #e8690a; }
    .blog-breadcrumb-sep { color: #ccc; font-size: 10px; }
  </style>
  <link rel="stylesheet" href="../../site-nav.css">
  <link rel="stylesheet" href="../../site-mobile.css">
  <link rel="stylesheet" href="../../site-ticker.css">
  <link rel="stylesheet" href="../../site-footer.css">

  <script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Home", "item": "https://eastvillagebuyers.com/"}, {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://eastvillagebuyers.com/blog/"}, {"@type": "ListItem", "position": 3, "name": ${JSON.stringify(f.title)}, "item": "https://eastvillagebuyers.com/blog/${f.slug}/"}]}
  <\/script>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MGZ7DGKM"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->

  <div class="site-topbar"><div class="site-topbar-inner"><a href="https://maps.google.com/?q=39+Avenue+A+New+York+NY+10009" class="site-topbar-item" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>39 Avenue A, New York, NY 10009</a><span class="site-topbar-sep">&middot;</span><span class="site-topbar-item site-topbar-item--hours"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Sun&ndash;Thu 12:30&ndash;6:30 PM &nbsp;&middot;&nbsp; Fri 12:30&ndash;6:00 PM &nbsp;&middot;&nbsp; Sat Closed</span></div></div>
  <header class="site-nav" id="evbNav">
    <div class="site-nav-inner">
      <a href="../../" class="site-nav-logo">
        <img src="../../evbbanner.webp" alt="East Village Buyers" onerror="this.onerror=null;this.src='../../evblogo.webp';">
      </a>
      <nav class="site-nav-links" aria-label="Main navigation">
        <a href="../../" class="site-nav-link">Home</a>
        <a href="../../about/" class="site-nav-link">About</a>
        <a href="../" class="site-nav-link is-active">Blog</a>
        <div class="site-nav-drop">
          <button class="site-nav-link site-nav-link--drop" aria-haspopup="true" aria-expanded="false">What We Buy
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="site-nav-drop-caret"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="site-nav-drop-menu">
            <a href="/we-buy-gold-nyc/" class="site-nav-drop-link">Gold</a>
            <a href="/we-buy-silver/" class="site-nav-drop-link">Silver</a>
            <a href="/we-buy-jewelry-nyc/" class="site-nav-drop-link">Jewelry</a>
            <a href="/we-buy-watches-nyc/" class="site-nav-drop-link">Watches</a>
            <a href="/we-buy-designer-nyc/" class="site-nav-drop-link">Designer Bags</a>
            <a href="/we-buy-streetwear-nyc/" class="site-nav-drop-link">Streetwear</a>
            <a href="/we-buy-sneakers-nyc/" class="site-nav-drop-link">Sneakers</a>
            <a href="/we-buy-electronics-nyc/" class="site-nav-drop-link">Electronics</a>
            <a href="/we-buy-collectibles-nyc/" class="site-nav-drop-link">Collectibles</a>
            <a href="/we-buy-accessories-nyc/" class="site-nav-drop-link">Accessories</a>
          </div>
        </div>
      </nav>
      <div class="site-nav-right">
        <div class="site-nav-phone">
          <span class="site-nav-phone-label">Call or Text</span>
          <span class="site-nav-phone-num">917-608-8939</span>
        </div>
        <a href="sms:9176088939" class="site-btn site-btn-sms">
          <div class="site-btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>
          <div class="site-btn-copy"><span class="site-btn-label">Send a Text</span><span class="site-btn-sub">Get a Quote Fast</span></div>
        </a>
        <a href="tel:9176088939" class="site-btn site-btn-call">
          <div class="site-btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg></div>
          <div class="site-btn-copy"><span class="site-btn-label">Call Us Now</span><span class="site-btn-sub">917-608-8939</span></div>
        </a>
        <button class="site-ham" id="evbHam" onclick="toggleEvbNav()" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
      </div>
    </div>
  </header>
  <div class="site-mob-overlay" id="evbOverlay" onclick="toggleEvbNav()"></div>
  <div class="site-mob-drawer" id="evbDrawer">
    <div class="site-mob-head">
      <img src="../../evbbanner.webp" alt="East Village Buyers" onerror="this.onerror=null;this.src='../../evblogo.webp';">
      <button class="site-mob-x" onclick="toggleEvbNav()" aria-label="Close">&times;</button>
    </div>
    <nav class="site-mob-links" aria-label="Mobile navigation">
      <a href="../../" class="site-mob-link" onclick="toggleEvbNav()">Home</a>
      <a href="../../about/" class="site-mob-link" onclick="toggleEvbNav()">About</a>
      <a href="../" class="site-mob-link" onclick="toggleEvbNav()">Blog</a>
      <details class="site-mob-drop">
        <summary class="site-mob-link site-mob-link--drop">What We Buy</summary>
        <a href="/we-buy-gold-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Gold</a>
        <a href="/we-buy-silver/" class="site-mob-sublink" onclick="toggleEvbNav()">Silver</a>
        <a href="/we-buy-jewelry-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Jewelry</a>
        <a href="/we-buy-watches-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Watches</a>
        <a href="/we-buy-designer-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Designer Bags</a>
        <a href="/we-buy-streetwear-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Streetwear</a>
        <a href="/we-buy-sneakers-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Sneakers</a>
        <a href="/we-buy-electronics-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Electronics</a>
        <a href="/we-buy-collectibles-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Collectibles</a>
        <a href="/we-buy-accessories-nyc/" class="site-mob-sublink" onclick="toggleEvbNav()">Accessories</a>
      </details>
    </nav>
    <div class="site-mob-footer">
      <div class="site-mob-addr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>39 Avenue A, New York, NY 10009</div>
      <a href="tel:9176088939" class="site-mob-btn site-mob-btn-call">
        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
        Call 917-608-8939
      </a>
      <a href="sms:9176088939" class="site-mob-btn site-mob-btn-sms">
        <svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Text for a Quote
      </a>
    </div>
  </div>
  <script src="../../site-nav.js"><\/script>
  <script src="../../site-reveal.js" defer><\/script>
  <div class="blog-breadcrumb-wrap">
    <nav class="blog-breadcrumb" aria-label="Breadcrumb">
      <a href="../../">Home</a>
      <span class="blog-breadcrumb-sep">/</span>
      <a href="../">Blog</a>
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
      <p>Walk into 39 Avenue A for a transparent, no-pressure evaluation and same-day cash, or text us photos first.</p>
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
          <img src="../../evbbanner.webp" alt="East Village Buyers" class="sidebar-about-logo" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='../../evblogo.webp';">
          <p class="sidebar-about-text">East Village Buyers is NYC's neighborhood shop for luxury watches, fine jewelry, streetwear, and electronics. We've been buying and selling on Avenue A since day one.</p>
          <p class="sidebar-about-addr">39 Avenue A &middot; New York, NY 10009<br>Sun&ndash;Thu 12:30&ndash;6:30 PM &middot; Fri 12:30&ndash;6 PM</p>
        </div>
      </div>
      <div class="sidebar-widget">
        <div class="sidebar-widget-head"><div class="sidebar-widget-title">Browse by Topic</div></div>
        <div class="sidebar-widget-body">
          <div class="sidebar-tags">
            <a href="../" class="sidebar-tag">All Posts</a>
          </div>
        </div>
      </div>
    </aside>
  </div>
  <footer class="evb-footer">
    <div class="evb-footer-bottom">
      <p class="evb-footer-copy">&copy; 2026 East Village Buyers. All rights reserved.</p>
      <p class="evb-footer-legal">Vintage USA Inc<span>&middot;</span>DBA East Village Buyers<span>&middot;</span>DCA Lic. #2070477</p>
    </div>
  </footer>
  <script src="../../site-ticker.js"><\/script>
</body>
</html>
`;
  }

  /* Weave uploaded non-hero images into the body after every other <h2> section. */
  function weaveImages(bodyHtml, imgNames, alt) {
    if (!imgNames.length) return bodyHtml;
    const parts = bodyHtml.split(/(?=<h2)/g);
    let imgIdx = 0;
    return parts.map((part, i) => {
      if (i > 0 && i % 2 === 0 && imgIdx < imgNames.length) {
        const tag = `<img src="../../${imgNames[imgIdx]}" alt="${esc(alt)}" class="blog-article-inline-img" loading="lazy" decoding="async">\n\n`;
        imgIdx++;
        return tag + part;
      }
      return part;
    }).join('');
  }

  /* ---------- Blog index + sitemap patching ---------- */
  function buildIndexCard(f) {
    return `        <a href="${f.slug}/" class="blog-card" data-cat="${esc(f.category.toLowerCase())}">
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
    const file = await ghGetFile('blog/index.html');
    if (!file) throw new Error('Could not read blog/index.html');
    const marker = '<div class="blog-grid" id="blogGrid">';
    const idx = file.content.indexOf(marker);
    if (idx === -1) throw new Error('Blog grid marker not found in blog/index.html');
    const insertAt = idx + marker.length;
    const newContent = file.content.slice(0, insertAt) + '\n\n' + buildIndexCard(f) + file.content.slice(insertAt);
    await ghPutFile('blog/index.html', newContent, `Add "${f.title}" to blog index`, { sha: file.sha });
  }

  async function updateSitemap(f) {
    const file = await ghGetFile('sitemap.xml');
    if (!file) return;
    const entry = `  <url>\n    <loc>https://eastvillagebuyers.com/blog/${f.slug}/</loc>\n    <lastmod>${f.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    const idx = file.content.lastIndexOf('</urlset>');
    if (idx === -1) return;
    await ghPutFile('sitemap.xml', file.content.slice(0, idx) + entry + file.content.slice(idx), `Add "${f.title}" to sitemap`, { sha: file.sha });
  }

  /* ---------- Steps UI ---------- */
  function stepsInit(labels) {
    const ul = $('#bmSteps');
    ul.classList.remove('hidden');
    ul.innerHTML = labels.map((l) => `<li>${l}</li>`).join('');
    return {
      set(i, state) { ul.children[i].className = state; },
    };
  }

  /* ---------- Generate ---------- */
  async function onGenerate() {
    const statusEl = $('#bmStatus');
    const prompt = $('#bmPrompt').value.trim();
    if (!prompt && !$('#bmTitle').value.trim()) {
      setStatus(statusEl, 'err', 'Tell it what the post should be about first.');
      return;
    }
    const btn = $('#bmGenerate');
    btn.disabled = true;
    const useGroq = !!localStorage.getItem(EVB.KEYS.groqKey);
    setStatus(statusEl, 'pending', useGroq ? 'Asking the AI to write your post…' : 'Writing with the built-in demo writer…');

    try {
      const category = $('#bmCategory').value;
      const ai = useGroq
        ? await generateWithGroq(prompt, $('#bmTitle').value.trim(), category)
        : generateDemo(prompt || $('#bmTitle').value.trim(), $('#bmTitle').value.trim(), category);

      const dateVal = $('#bmDate').value || new Date().toISOString().slice(0, 10);
      const dateLabel = new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const title = $('#bmTitle').value.trim() || ai.title;
      const slug = slugify(title);

      // Image names the files will get once uploaded to the repo root.
      const imgNames = images.map((img, i) => {
        const ext = (img.file.name.match(/\.(webp|jpe?g|png|gif|avif)$/i) || ['.webp', 'webp'])[1].toLowerCase();
        return `${slug}-${i + 1}.${ext}`;
      });
      const heroImage = imgNames[0] || 'evbstorefront.webp';
      const heroAlt = `${title} — East Village Buyers NYC`;

      const fields = {
        title, slug,
        category,
        description: $('#bmDesc').value.trim() || ai.description,
        keywords: ai.keywords,
        excerpt: ai.excerpt,
        heroImage, heroAlt,
        bodyHtml: weaveImages(ai.bodyHtml, imgNames.slice(1), heroAlt),
        date: dateVal, dateLabel,
        faqs: ai.faqs || [],
        imgNames,
      };

      generated = { fields, html: buildPostHtml(fields) };

      // Preview: swap relative asset paths for the live domain, and swap
      // not-yet-uploaded image names for local data URLs.
      let previewHtml = generated.html.replaceAll('../../', `${EVB.SITE}/`);
      images.forEach((img, i) => {
        previewHtml = previewHtml.replaceAll(`${EVB.SITE}/${imgNames[i]}`, img.dataUrl);
      });
      $('#bmPreviewEmpty').classList.add('hidden');
      const frame = $('#bmPreview');
      frame.classList.remove('hidden');
      frame.srcdoc = previewHtml;

      $('#bmTitle').value = title;
      $('#bmDesc').value = fields.description;
      $('#bmPublish').disabled = false;
      setStatus(statusEl, 'ok', `Generated "${title}" — review the preview, then hit Publish Live.`);
    } catch (e) {
      setStatus(statusEl, 'err', `Generation failed: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Publish ---------- */
  async function onPublish() {
    const statusEl = $('#bmStatus');
    if (!generated) { setStatus(statusEl, 'err', 'Generate the post first.'); return; }
    if (!ghToken()) {
      setStatus(statusEl, 'err', 'Add your GitHub token in Settings to publish live. (Demo mode stops here.)');
      return;
    }
    const f = generated.fields;
    const btn = $('#bmPublish');
    btn.disabled = true;

    const labels = [
      ...images.map((_, i) => `Upload image ${i + 1} of ${images.length}`),
      'Create blog post page',
      'Add card to blog index',
      'Add entry to sitemap.xml',
    ];
    const steps = stepsInit(labels);
    let si = 0;

    try {
      for (let i = 0; i < images.length; i++) {
        steps.set(si, 'doing');
        const b64 = images[i].dataUrl.split(',')[1];
        const existing = await gh(`contents/${f.imgNames[i]}?ref=${EVB.BRANCH}`).catch(() => null);
        await ghPutFile(f.imgNames[i], b64, `Add image for blog post: ${f.title}`, { isBase64: true, sha: existing ? existing.sha : undefined });
        steps.set(si++, 'done');
      }

      steps.set(si, 'doing');
      const existingPost = await ghGetFile(`blog/${f.slug}/index.html`);
      await ghPutFile(`blog/${f.slug}/index.html`, generated.html, `Add blog post: ${f.title}`, { sha: existingPost ? existingPost.sha : undefined });
      steps.set(si++, 'done');

      steps.set(si, 'doing');
      await updateBlogIndex(f);
      steps.set(si++, 'done');

      steps.set(si, 'doing');
      await updateSitemap(f);
      steps.set(si++, 'done');

      const n = parseInt(localStorage.getItem(EVB.KEYS.postsPublished) || '0', 10) + 1;
      localStorage.setItem(EVB.KEYS.postsPublished, String(n));
      logActivity(`Published blog post: "${f.title}"`);
      setStatus(statusEl, 'ok', `Live in a minute or two → eastvillagebuyers.com/blog/${f.slug}/`);
    } catch (e) {
      if (si < labels.length) steps.set(si, 'fail');
      setStatus(statusEl, 'err', `Publish failed at step ${si + 1}: ${e.message}`);
      btn.disabled = false;
    }
  }

  /* ---------- Wiring ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#bmDate').value = new Date().toISOString().slice(0, 10);

    const drop = $('#bmDrop');
    drop.addEventListener('click', () => $('#bmFiles').click());
    $('#bmFiles').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    $('#bmGenerate').addEventListener('click', onGenerate);
    $('#bmPublish').addEventListener('click', onPublish);
  });
})();
