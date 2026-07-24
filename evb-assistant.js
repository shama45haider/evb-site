/**
 * East Village Buyers — Free keyword-based site assistant
 * No API required. All answers hand-written from site content.
 * Covers: gold, silver, diamonds, jewelry, watches, designer, sneakers,
 *         streetwear, vintage, process, payment, hours, location, ID, appraisal.
 */
(function () {
  'use strict';

  // ── Contact constants ─────────────────────────────────────────────────────
  const PHONE     = '917-608-8939';
  const ADDRESS   = '39 Avenue A, New York, NY 10009';
  const HOURS     = 'Sun 12:30–6 · Mon–Thu 12:30–6:30 · Fri 12:30–6 · Sat Closed';
  const PHONE_URL = 'tel:9176088939';
  const SMS_URL   = 'sms:9176088939';

  const STOP = new Set('a an the and or but in on at to for of is are was were be been have has had do does did will would can could should may might i me my we you your our they them it its this that with from as by'.split(' '));

  function normalize(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── Suggestion chips ──────────────────────────────────────────────────────
  const SUGGESTIONS = [
    'Do you buy gold?',
    'How do I sell here?',
    'What do I need to bring?',
    'Is the appraisal free?',
    'What are your hours?',
    'Where are you located?',
  ];

  /** Guaranteed answers for suggestion chips + common phrasings */
  const CHIP_ANSWERS = (() => {
    const map = Object.create(null);
    const add = (phrases, html) => {
      phrases.forEach((p) => {
        map[normalize(p)] = html;
      });
    };
    add(
      ['Do you buy gold?', 'Do you buy gold', 'buy gold'],
      `<p>Yep, gold is actually one of our most popular items. We buy 10K, 14K, 18K, 22K, and 24K — rings, chains, bracelets, broken pieces, even scrap. We test and weigh everything right in front of you, and pay based on the live spot price so there's no guessing. Just walk in or text us a photo first at <a href="${SMS_URL}">${PHONE}</a> if you want a quick idea.</p>`
    );
    add(
      ['How do I sell here?', 'How do I sell', 'How does selling work', 'how to sell'],
      `<p>It's pretty simple, honestly. Just walk in with your item — no appointment needed. We'll take a look, test or authenticate it depending on what it is, and give you a cash offer right there on the spot. If you like the number, we do a quick ID check (that's just NYC law) and pay you the same day. If you don't like the offer, no hard feelings — you leave with your stuff, no charge. Most visits take around 15–30 minutes.</p>`
    );
    add(
      ['What do I need to bring?', 'What should I bring', 'What do I need'],
      `<p>The main thing is a valid government-issued photo ID — driver's license, passport, or state ID works. NYC law requires it for all buy/sell transactions, so that one's non-negotiable.</p>
<p>Anything else is optional but helpful: GIA certificates for diamonds, box and papers for watches, original receipt for designer bags, OG box for sneakers. Don't stress if you don't have those — we evaluate items without them all the time.</p>`
    );
    add(
      ['Is the appraisal free?', 'Is appraisal free', 'free appraisal'],
      `<p>Totally free, zero obligation. We'll test, weigh, and give you a real number on the spot. If you don't like the offer, you just take your item and walk out — no charge, no pressure at all. We only get paid when you decide to sell.</p>`
    );
    add(
      ['What are your hours?', 'Store hours', 'What are your hours', 'when are you open'],
      `<p>We're open Sunday 12:30–6 PM, Monday through Thursday 12:30–6:30 PM, and Friday 12:30–6 PM. We're closed on Saturdays.</p>
<p>No appointment needed — just walk in. If you're making a special trip, feel free to text us at <a href="${SMS_URL}">${PHONE}</a> first just to confirm we're good to go.</p>`
    );
    add(
      ['Where are you located?', 'Where are you', 'your address', 'store location'],
      `<p>We're at <strong>${ADDRESS}</strong>, right in the heart of the East Village.</p>
<p>If you're taking the subway, the L to 1st Ave is closest. The 6 to Astor Place also works — it's a short walk. Street parking can be tricky around there, so the train is usually the easier call.</p>`
    );
    return map;
  })();

  // ── Knowledge base: each entry has keywords[] and a reply ────────────────
  // Keywords are matched against the lowercased user message.
  // First entry whose keywords ALL match (or score highest) wins.
  // Format: { keywords: [], reply: 'HTML string', score bonus: used internally }

  const KB = [

    // ── GREETINGS ────────────────────────────────────────────────────────────
    {
      id: 'greeting',
      keywords: [['hi','hey','hello','howdy','what\'s up','whats up','yo','hiya']],
      matchAny: true,
      reply: `<p>Hey! What's up — I'm the East Village Buyers assistant. Ask me anything: what we buy, how the process works, hours, location — I got you.</p>`
    },
    {
      id: 'thanks',
      keywords: [['thank','thanks','appreciate','helpful']],
      matchAny: true,
      reply: `<p>Of course, happy to help! If anything else comes up, just ask. And if you're ready to bring something in, walk-ins are always welcome — or text us at <a href="${SMS_URL}">${PHONE}</a> first if you want to check something quickly.</p>`
    },

    // ── HOURS & LOCATION ─────────────────────────────────────────────────────
    {
      id: 'hours',
      keywords: [['what are your hours','store hours','hours','hour','open','close','closing','when','time','schedule','sunday','monday','tuesday','wednesday','thursday','friday','saturday','weekend']],
      matchAny: true,
      reply: `<p>We're open Sunday from 12:30 to 6 PM, Monday through Thursday from 12:30 to 6:30 PM, and Friday 12:30 to 6 PM. Saturdays we're closed.</p>
<p>No appointment needed — just walk in whenever works for you. If you're coming from far, feel free to text us at <a href="${SMS_URL}">${PHONE}</a> first just to make sure we're around.</p>`
    },
    {
      id: 'location',
      keywords: [['where','location','located','address','avenue a','east village','directions','subway','train','transit','get to','find','map','parking']],
      matchAny: true,
      reply: `<p>We're at <strong>39 Avenue A, New York, NY 10009</strong> — East Village, right between 2nd and 3rd Street.</p>
<p>Best way to get here is subway: L train to 1st Ave is the closest stop, or the 6 to Astor Place is a short walk. The M14 bus runs right on Avenue A too. Street parking in the area is kind of a nightmare, so the train is usually the move.</p>`
    },

    // ── APPOINTMENT / WALK-IN ────────────────────────────────────────────────
    {
      id: 'appointment',
      keywords: [['appointment','walk in','walk-in','drop in','drop by','just show up','need to call']],
      matchAny: true,
      reply: `<p>No appointment needed at all — just walk in whenever we're open and we'll take care of you.</p>
<p>The only time it's worth a heads-up is if you've got a large estate or a big collection. In that case, texting photos to <a href="${SMS_URL}">${PHONE}</a> ahead of time helps us make sure we have enough time set aside for you. But for a regular visit, just show up.</p>`
    },

    // ── APPRAISAL / COST / FEE ───────────────────────────────────────────────
    {
      id: 'appraisal',
      keywords: [['is the appraisal free','free appraisal','appraisal','appraise','evaluation','evaluate','cost','fee','charge','free','obligation','no pressure']],
      matchAny: true,
      reply: `<p>It's completely free — no strings attached, no obligation at all. We test and weigh everything and give you a real offer on the spot. If you're not happy with the number, you just take your item and leave — no charge, no awkwardness. We only make money when you decide to sell.</p>`
    },

    // ── HOW TO SELL / PROCESS ────────────────────────────────────────────────
    {
      id: 'how-to-sell',
      keywords: [['how do i sell','how to sell','sell here','how','sell','process','work','steps','what happens','procedure','selling','do i sell','start','begin','first time','visit']],
      matchAny: true,
      reply: `<p>Super easy. Just walk in with your item — no appointment, no scheduling anything. We'll examine it right there: test the metal, check authenticity, review condition — whatever applies. Then we give you a cash offer based on live market rates. If you say yes, we do a quick ID check (that's just an NYC law thing) and pay you the same day. If you say no, you walk out with your item and owe us nothing. Most visits are done in 15–30 minutes.</p>
<p>If you want to get a rough idea before coming in, you can also text photos to <a href="${SMS_URL}">${PHONE}</a> first.</p>`
    },

    // ── WHAT DO I NEED / ID ──────────────────────────────────────────────────
    {
      id: 'what-to-bring',
      keywords: [['what do i need','what to bring','need to bring','need','bring','id','identification','photo id','driver','passport','requirements','require','documents']],
      matchAny: true,
      reply: `<p>The one thing you absolutely need is a valid government-issued photo ID — driver's license, passport, or state ID. NYC law requires it for all transactions, no exceptions.</p>
<p>Beyond that, anything extra you have is a bonus but not required. GIA certificates for diamonds, box and papers for watches, the original receipt for designer bags, the OG box for sneakers — all of those can help the offer. But we evaluate items without them all the time, so don't let that stop you from coming in.</p>`
    },

    // ── PAYMENT ──────────────────────────────────────────────────────────────
    {
      id: 'payment',
      keywords: [['pay','paid','payment','cash','check','how much','get money','payout','same day','instant']],
      matchAny: true,
      reply: `<p>Same-day payment — most people walk out with cash in hand on the same visit. We pay cash for most transactions. For larger amounts, a check is also an option. Either way, you'll know the exact offer before you agree to anything, so there are no surprises.</p>`
    },

    // ── GOLD ─────────────────────────────────────────────────────────────────
    {
      id: 'gold',
      keywords: [['gold','do you buy gold','buy gold','10k','14k','18k','24k','karat','yellow gold','white gold','rose gold','gold chain','gold ring','gold bracelet','gold necklace']],
      matchAny: true,
      reply: `<p>Yes, gold is one of our biggest categories — we buy it every day. All karat weights: 10K, 14K, 18K, 22K, 24K — rings, chains, bracelets, earrings, necklaces. Broken or damaged stuff is totally fine too, scrap gold still has real value. We also buy gold coins and bullion.</p>
<p>We weigh and test everything right in front of you and base the offer on live spot prices, so it's completely transparent. Walk in anytime or text photos to <a href="${SMS_URL}">${PHONE}</a> first if you want a quick idea.</p>`
    },

    // ── SILVER ───────────────────────────────────────────────────────────────
    {
      id: 'silver',
      keywords: [['silver','sterling','925','silver flatware','silverware','silver coin','silver bar','silver jewelry']],
      matchAny: true,
      reply: `<p>Yes, we buy silver. Sterling silver (925), fine silver, and in some cases silver-plated items where the value is there. That includes flatware and serving sets, silver jewelry, coins, rounds, and bullion bars. Just bring it in — we test and weigh everything on the spot and the appraisal is free.</p>`
    },

    // ── PLATINUM ─────────────────────────────────────────────────────────────
    {
      id: 'platinum',
      keywords: [['platinum','plat','pt950','pt900']],
      matchAny: true,
      reply: `<p>Yes, we buy platinum — rings, settings, estate jewelry, all of it. We test purity right in front of you and make an offer based on current spot prices. Just walk in anytime during store hours.</p>`
    },

    // ── DIAMONDS ─────────────────────────────────────────────────────────────
    {
      id: 'diamonds',
      keywords: [['diamond','diamonds','gia','engagement ring','gemstone','stone','sapphire','ruby','emerald','moissanite']],
      matchAny: true,
      reply: `<p>Yes, we buy diamonds and colored gemstones. For diamonds, we look at cut, clarity, color, and carat weight. If you have a GIA certificate, that definitely helps — it speeds things up and can get you a better offer. But we can evaluate without one too.</p>
<p>We also buy sapphires, rubies, emeralds, and other fine stones — loose or mounted, both are fine. One thing to note: we don't buy moissanite or lab-grown stones as precious gems.</p>`
    },

    // ── JEWELRY (GENERAL) ────────────────────────────────────────────────────
    {
      id: 'jewelry',
      keywords: [['jewelry','jewellery','jewel','ring','necklace','bracelet','earring','pendant','chain','pearl','pearls','cameo','turquoise','estate jewelry','vintage jewelry','broken jewelry','scrap']],
      matchAny: true,
      reply: `<p>We buy all kinds of jewelry — fine, estate, vintage, even broken pieces. Gold, silver, platinum, diamonds, name-brand stuff like Cartier, Tiffany, and David Yurman. Broken chains, single earrings, scrap gold — all of that has value and we'll make you an offer on it.</p>
<p>Everything gets a free evaluation with zero pressure to sell. Walk in or text photos to <a href="${SMS_URL}">${PHONE}</a> first if you want to check before making the trip.</p>`
    },

    // ── WATCHES ──────────────────────────────────────────────────────────────
    {
      id: 'watches',
      keywords: [['watch','watches','rolex','omega','cartier','patek','audemars','tudor','breitling','tag heuer','panerai','iwc','seiko','g-shock','timepiece','wristwatch']],
      matchAny: true,
      reply: `<p>Watches are a big one for us — we buy luxury, vintage, and select sport watches every day. Rolex (Submariner, Daytona, Datejust, GMT, Explorer), Omega, Tudor, Breitling, TAG Heuer, Cartier, Panerai, IWC — all the major names. For Patek Philippe and Audemars Piguet, we prefer a heads-up first, but we buy those too.</p>
<p>Box and papers definitely help and can increase the offer, but they're not required. We verify serials and check the movement in-store. Honestly, the easiest first step is to text us a photo at <a href="${SMS_URL}">${PHONE}</a> — or just walk in.</p>`
    },

    // ── DESIGNER HANDBAGS ────────────────────────────────────────────────────
    {
      id: 'designer-bags',
      keywords: [['bag','handbag','purse','louis vuitton','lv','chanel','hermes','hermès','gucci','prada','dior','fendi','saint laurent','ysl','bottega','celine','loewe','designer']],
      matchAny: true,
      reply: `<p>Yes, designer bags and accessories are a regular thing for us. Louis Vuitton (Speedy, Neverfull, Keepall, Pochette), Chanel (Classic Flap, Boy, WOC), Gucci, Dior, Saint Laurent, Prada, Fendi, Bottega Veneta, Celine — all of those. For Hermès, Kelly and Birkin included, though those we prefer by appointment.</p>
<p>The dust bag, box, and receipt are nice to have and can bump up the offer, but they're not required. We authenticate everything in-store. If you want a rough idea before making the trip, just text photos to <a href="${SMS_URL}">${PHONE}</a>.</p>`
    },

    // ── SNEAKERS ─────────────────────────────────────────────────────────────
    {
      id: 'sneakers',
      keywords: [['sneaker','sneakers','shoes','jordan','nike','yeezy','dunk','air max','new balance','travis scott','off-white','fragment','deadstock','ds','footwear','kicks']],
      matchAny: true,
      reply: `<p>We buy sneakers every day — deadstock and gently worn pairs both welcome. Air Jordan retros and collabs, Nike Dunks, Adidas Yeezy (350, 500, 700, Foam Runner), New Balance collabs, Travis Scott, Off-White, Fragment — that's our bread and butter.</p>
<p>If you have the OG box, bring it — it helps the offer. We use live market pricing, not the lowball numbers you'd get from a kiosk. Most sneaker visits are done in about 10 minutes. Walk in or text photos to <a href="${SMS_URL}">${PHONE}</a>.</p>`
    },

    // ── STREETWEAR / VINTAGE ─────────────────────────────────────────────────
    {
      id: 'streetwear',
      keywords: [['streetwear','supreme','off-white','bape','palace','kith','fear of god','fog','chrome hearts','vintage','band tee','tour shirt','carhartt','workwear','90s','y2k','hype','hoodie','jacket']],
      matchAny: true,
      reply: `<p>We buy hype streetwear and curated vintage — Supreme, Off-White, BAPE, Palace, Kith collabs, Fear of God. For vintage, we love band and tour tees from the 80s through early 2000s, Carhartt and Schott jackets, Levi's, 90s and Y2K pieces, Harley and sports vintage.</p>
<p>Condition matters a lot here, and we don't buy fast fashion or bulk clothing. If you're not sure whether something qualifies, just text photos to <a href="${SMS_URL}">${PHONE}</a> and we'll give you a quick answer before you make the trip.</p>`
    },

    // ── ELECTRONICS ──────────────────────────────────────────────────────────
    {
      id: 'electronics',
      keywords: [['phone','iphone','ipad','tablet','macbook','laptop','camera','playstation','ps5','ps4','xbox','nintendo','console','electronics','airpods']],
      matchAny: true,
      reply: `<p>We buy select electronics — iPhones, MacBooks, iPads, cameras, gaming consoles like PS5, PS4, Xbox, and Nintendo Switch, plus accessories like AirPods.</p>
<p>Electronics pricing moves fast depending on the model and what we're actively buying, so the best first step is to <a href="${SMS_URL}">text us</a> the model name and a photo. We'll let you know right away if it's something we want and give you a rough number.</p>`
    },

    // ── COINS ────────────────────────────────────────────────────────────────
    {
      id: 'coins',
      keywords: [['coin','coins','bullion','gold coin','silver coin','american eagle','krugerrand','numismatic','rare coin']],
      matchAny: true,
      reply: `<p>Yes, we buy gold and silver coins — American Eagles, Krugerrands, Maple Leafs, silver rounds, and other bullion. Numismatic or rare collectible coins we evaluate case by case. Just bring whatever you have and we'll take a look — appraisal is always free.</p>`
    },

    // ── BROKEN / DAMAGED ─────────────────────────────────────────────────────
    {
      id: 'broken',
      keywords: [['broken','damaged','scrap','single earring','bent','cracked','missing stone','incomplete','tangled']],
      matchAny: true,
      reply: `<p>Broken stuff is totally fine — don't let that stop you from bringing it in. Broken chains, single earrings, bent rings, scrap gold, damaged watches — the metal and stone content still have real value regardless of condition. We evaluate based on what's actually there, not just how it looks. Bring it in and we'll tell you exactly what we'd offer.</p>`
    },

    // ── ESTATE / INHERITED ───────────────────────────────────────────────────
    {
      id: 'estate',
      keywords: [['estate','inherited','inheritance','grandmother','grandfather','family','passed away','deceased','collection','lot','multiple items','moving','liquidation']],
      matchAny: true,
      reply: `<p>We deal with estate and inherited items all the time — it's a pretty common situation. Families clearing out an apartment or liquidating a collection can bring in a mixed box of stuff — jewelry, watches, bags, coins, electronics — and we'll evaluate everything and give you one clear payment. We explain each offer so nothing feels rushed or confusing.</p>
<p>For large collections it really helps to text photos to <a href="${SMS_URL}">${PHONE}</a> ahead of time so we can make sure we have enough time set aside. But walk-ins are welcome too.</p>`
    },

    // ── HOW OFFERS ARE CALCULATED ────────────────────────────────────────────
    {
      id: 'how-valued',
      keywords: [['value','valued','worth','calculate','calculate','price','offer','much','rate','market','spot price','weigh','test','karat','purity']],
      matchAny: true,
      reply: `<p>It depends on the item, but here's the general idea: for gold and silver, we weigh it and test purity right in front of you, then price it against live spot rates. For diamonds and gems, we look at cut, clarity, color, and carat — a GIA cert helps. For watches, it's brand, model, serial number, condition, and whether you have box and papers. For designer bags, authentication and original packaging matter. For sneakers, we check style, size, condition, and use live resale market data.</p>
<p>We can't give exact quotes over the phone, but texting photos to <a href="${SMS_URL}">${PHONE}</a> will get you a rough ballpark before you come in.</p>`
    },

    // ── TEXT PHOTOS / QUOTE ──────────────────────────────────────────────────
    {
      id: 'text-photos',
      keywords: [['text','photo','picture','pic','send','quote online','remote','before i come','before coming','not sure']],
      matchAny: true,
      reply: `<p>Texting photos first is actually a really popular move. Send a photo of your item to <a href="${SMS_URL}">${PHONE}</a> and we'll give you a rough idea of whether it's worth the trip in. Try to get close-ups of any markings, stamps, or labels — that helps us a lot.</p>
<p>We can't give a firm number without seeing it in person and testing it, but the text-first approach definitely saves time and helps you plan before coming in.</p>`
    },

    // ── CONSIGNMENT ──────────────────────────────────────────────────────────
    {
      id: 'consignment',
      keywords: [['consign','consignment','trade','trade in']],
      matchAny: true,
      reply: `<p>Yes, we do both — outright purchase or consignment. Most people go with the instant cash offer since it's quick and simple. But consignment is an option if you'd rather wait and potentially get a higher number — we sell the item for you and pay you when it moves. When you come in, we can walk you through both so you can decide what makes more sense for your situation.</p>`
    },

    // ── AUTHENTICITY / FAKE ──────────────────────────────────────────────────
    {
      id: 'authentication',
      keywords: [['authentic','authentication','fake','real','legit','genuine','replica','verify','serial number']],
      matchAny: true,
      reply: `<p>We authenticate everything before making any offer. Our buyers check hallmarks, serial numbers, stitching, hardware — whatever's relevant for that particular item. It's all done in-store, so there's no sending things out or waiting days for a result.</p>
<p>If something doesn't pass authentication, we'll be straight with you about it. We won't make an offer on anything we can't verify.</p>`
    },

    // ── REVIEWS / TRUST ───────────────────────────────────────────────────────
    {
      id: 'reviews',
      keywords: [['review','reviews','google','rating','stars','trust','legit','scam','reputation','real']],
      matchAny: true,
      reply: `<p>We're at a 5.0 on Google with over 556 reviews — you can check them yourself before coming in. People pretty consistently mention the transparent pricing, no pressure experience, and getting paid the same day. We're a licensed NYC buyer (DCA #2070477) and have been in the East Village for years. Totally legitimate operation.</p>`
    },

    // ── LICENSE / LEGAL ───────────────────────────────────────────────────────
    {
      id: 'license',
      keywords: [['license','licensed','legal','dca','regulated','law','nyc law','compliant']],
      matchAny: true,
      reply: `<p>East Village Buyers is fully licensed under NYC DCA #2070477 (Vintage USA Inc, DBA East Village Buyers). We follow all New York City and State regulations for precious metal and secondhand purchases — ID verification, transaction documentation, all of it. Everything we do is completely above board.</p>`
    },

    // ── CONTACT ───────────────────────────────────────────────────────────────
    {
      id: 'contact',
      keywords: [['contact','call','phone','number','reach','get in touch','talk to someone']],
      matchAny: true,
      reply: `<p>Best way to reach us is by call or text at <a href="${PHONE_URL}">${PHONE}</a>. We're at ${ADDRESS}, open Sun 12:30–6, Mon–Thu 12:30–6:30, Fri 12:30–6, closed Saturdays.</p>
<p>Texting is honestly the quickest way to get a response — especially handy if you want to send photos of your item before making the trip.</p>`
    },

    // ── WHAT DO YOU BUY (GENERAL) ─────────────────────────────────────────────
    {
      id: 'what-we-buy',
      keywords: [['what do you buy','what you buy','you guys buy','do you buy','categories','types','accept','take in','looking for']],
      matchAny: true,
      reply: `<p>We buy a pretty wide range of things. Here's the rundown:</p>
<ul style="padding-left:1.2em;margin:.5em 0">
<li>💍 <strong>Jewelry</strong> — gold, silver, platinum, diamonds, estate pieces, even broken scrap</li>
<li>⌚ <strong>Watches</strong> — Rolex, Omega, Cartier, Patek, vintage mechanicals</li>
<li>👜 <strong>Designer bags</strong> — Louis Vuitton, Chanel, Gucci, Hermès, Prada, and more</li>
<li>👟 <strong>Sneakers</strong> — Jordan, Yeezy, Dunk, collabs — deadstock and worn both welcome</li>
<li>👕 <strong>Streetwear</strong> — Supreme, BAPE, Off-White, vintage band tees, workwear</li>
<li>🥇 <strong>Coins & Bullion</strong> — gold and silver coins, bars</li>
<li>📱 <strong>Electronics</strong> — iPhones, MacBooks, cameras, consoles (text us first on those)</li>
</ul>
<p>Not sure if your specific item qualifies? Just text a photo to <a href="${SMS_URL}">${PHONE}</a> and we'll tell you right away.</p>`
    },

    // ── YES / NO / CAN I SELL ─────────────────────────────────────────────────
    {
      id: 'can-i-sell',
      keywords: [['can i','will you','do you take','accept','allowed','able to sell','sell my','sell this','sell a','sell an','looking to sell','want to sell','trying to sell']],
      matchAny: true,
      reply: `<p>Most likely yes — we buy gold, jewelry, watches, designer bags, sneakers, streetwear, coins, and select electronics. Best thing to do is walk in for a free appraisal at ${ADDRESS}. If you're not sure whether we'd want it, just text a photo to <a href="${SMS_URL}">${PHONE}</a> first and we'll let you know quickly.</p>`
    },

    // ── QUOTE / PRICE (no exact number) ─────────────────────────────────────
    {
      id: 'quote',
      keywords: [['quote','price','pricing','how much','offer','estimate','ballpark','worth','value my']],
      matchAny: true,
      reply: `<p>The only way to get a real number is in person — we need to test and inspect the item to give you a firm offer. But if you want a quick sense before making the trip, text some photos to <a href="${SMS_URL}">${PHONE}</a> and we can give you a rough idea. Either way, the appraisal is always free.</p>`
    },

    // ── TODAY / TOMORROW ──────────────────────────────────────────────────────
    {
      id: 'when-today',
      keywords: [['today','tomorrow','right now','open now','still open','come in now','this afternoon','this evening']],
      matchAny: true,
      reply: `<p>Hours are Sun 12:30–6 PM, Mon–Thu 12:30–6:30 PM, Fri 12:30–6 PM, closed Saturdays. Walk-ins are always welcome, no appointment needed. If you're making a long trip, feel free to text <a href="${SMS_URL}">${PHONE}</a> first just to double-check we're open.</p>`
    },

    // ── CATCH-ALL (always available) ──────────────────────────────────────────
    {
      id: 'default',
      keywords: [['buy','sell','item','stuff','help','question','about','shop','store','you','your','anything','something','info','information']],
      matchAny: true,
      isDefault: true,
      reply: `<p>East Village Buyers is a licensed NYC resale shop at ${ADDRESS}. We buy gold, jewelry, watches, designer bags, sneakers, streetwear, coins, and more. Appraisals are always free, payment is same-day, and no appointment is needed. Call or text <a href="${SMS_URL}">${PHONE}</a> or just walk in.</p>`
    },

  ];

  // ── Unknown keyword error messages ────────────────────────────────────────
  const ERROR_MESSAGES = [
    `<p>Hmm, I'm not sure I caught that. Try asking about what we buy, our hours, how selling works, or anything else about the shop — I'll do my best to help.</p>`,
    `<p>That one's a little outside what I can answer. But I can help with stuff like selling gold, jewelry, sneakers, watches, designer items — just ask and I'll take a shot at it.</p>`,
    `<p>I didn't quite get that one. You can try rephrasing, or ask about hours, location, what we buy, or how the process works. You can also just walk in to ${ADDRESS} for a free appraisal — no commitment needed.</p>`
  ];

  function getRandomErrorMessage() {
    return ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)];
  }

  // ── Query expansion ───────────────────────────────────────────────────────
  const QUERY_ALIASES = [
    ['hrs', 'hours'], ['hr', 'hours'], ['loc', 'location'], ['addr', 'address'],
    ['appt', 'appointment'], ['appraisal', 'appraisal'], ['jewlery', 'jewelry'],
    ['rolexes', 'rolex'], ['jordans', 'jordan'], ['sneaker', 'sneakers'],
  ];

  function expandQuery(rawQuery) {
    let q = normalize(rawQuery);
    QUERY_ALIASES.forEach(([from, to]) => {
      if (q.includes(from)) q += ' ' + to;
    });
    return q;
  }

  function tokenize(text) {
    return expandQuery(text).split(' ').filter(w => w.length > 1 && !STOP.has(w));
  }

  function allKeywords(entry) {
    if (!entry.keywords) return [];
    return entry.keywords.flat();
  }

  // ── Scoring (KB + site chunks) ────────────────────────────────────────────
  function scoreEntry(entry, rawQuery) {
    const q = expandQuery(rawQuery);
    const tokens = tokenize(rawQuery);
    let score = 0;

    if (entry.isDefault) score += 1;

    allKeywords(entry).forEach(kw => {
      if (q.includes(kw)) {
        score += kw.length >= 6 ? 24 : 18;
      } else {
        tokens.forEach(t => {
          if (t.length >= 3 && (kw.includes(t) || t.includes(kw))) score += 10;
          if (t.length >= 4 && kw.startsWith(t.slice(0, 4))) score += 6;
        });
      }
    });

    if (entry.pairs) {
      entry.pairs.forEach(pair => {
        if (pair.every(kw => q.includes(kw))) score += 45;
      });
    }

    return score;
  }

  function scoreChunk(chunk, rawQuery) {
    const q = expandQuery(rawQuery);
    const tokens = tokenize(rawQuery);
    const hay = [chunk.question, chunk.section, chunk.text, chunk.pageLabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    let score = 0;

    if (chunk.question) {
      const cq = chunk.question.toLowerCase();
      if (cq.includes(q) || q.includes(cq.slice(0, Math.min(28, cq.length)))) score += 90;
      tokens.forEach(t => {
        if (t.length >= 3 && cq.includes(t)) score += 14;
      });
    }

    tokens.forEach(t => {
      if (t.length >= 3 && hay.includes(t)) score += 11;
    });

    if (chunk.type === 'faq') score += 4;
    return score;
  }

  function searchKnowledge(query) {
    const k = window.EVB_KNOWLEDGE;
    if (!k?.chunks?.length) return null;
    const ranked = k.chunks
      .map(chunk => ({ chunk, score: scoreChunk(chunk, query) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 10 ? ranked[0] : null;
  }

  // ── Advanced Matching System ──────────────────────────────────────────────
  // Product type synonyms for better detection
  const PRODUCT_KEYWORDS = {
    jewelry: ['jewelry', 'gold', 'silver', 'diamond', 'diamonds', 'gemstone', 'platinum', 'coins', 'estate', 'ring', 'necklace', 'bracelet', 'pendant'],
    sneakers: ['sneaker', 'kicks', 'shoe', 'shoes', 'jordan', 'yeezy', 'nike', 'dunk', 'adidas', 'footwear', 'trainers'],
    designer: ['designer', 'handbag', 'bag', 'louis vuitton', 'chanel', 'hermès', 'gucci', 'dior', 'prada', 'purse', 'luggage'],
    electronics: ['iphone', 'airpods', 'camera', 'ipad', 'ps5', 'electronics', 'gadget', 'phone', 'apple', 'ray-ban'],
    accessories: ['accessories', 'leather', 'watch', 'tiffany', 'belt', 'wallet', 'scarf', 'glasses'],
    streetwear: ['streetwear', 'vintage', 'hype', 'supreme', 'bape', 'apparel', 'clothing']
  };

  // Keyword synonyms for better matching
  const KEYWORD_SYNONYMS = {
    'appraisal': ['appraise', 'evaluate', 'evaluation', 'assessment', 'check', 'value', 'worth'],
    'free': ['cost', 'fee', 'charge', 'obligation', 'complimentary'],
    'condition': ['wear', 'damage', 'broken', 'scratched', 'beat up', 'mint', 'pristine', 'quality'],
    'authentic': ['real', 'genuine', 'original', 'verify', 'verification'],
    'payment': ['pay', 'cash', 'check', 'payout', 'paid', 'payment method'],
    'appointment': ['book', 'schedule', 'walk-in', 'reserve', 'time', 'hours', 'open'],
    'sell': ['selling', 'sale', 'selling', 'sold', 'vendor', 'how to'],
    'price': ['pricing', 'offer', 'value', 'worth', 'cost', 'amount']
  };

  // Detect product type from query
  function detectProductType(query) {
    const lower = query.toLowerCase();
    for (const [type, keywords] of Object.entries(PRODUCT_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return type;
      }
    }
    return null;
  }

  // Enhanced keyword scoring with synonyms (backward compatible)
  function scoreEntry(entry, query) {
    if (!entry) return 0;
    const queryTerms = normalize(query).split(/\s+/).filter(t => t.length > 2);
    let score = 0;

    // If entry has keywords property, use it for matching
    if (entry.keywords && Array.isArray(entry.keywords)) {
      // Flatten keyword array (can be array or array of arrays)
      let flatKeywords = [];
      entry.keywords.forEach(kw => {
        if (Array.isArray(kw)) {
          flatKeywords = flatKeywords.concat(kw);
        } else {
          flatKeywords.push(kw);
        }
      });

      // Check for exact phrase match (highest priority)
      if (normalize(flatKeywords.join(' ')).includes(normalize(query))) {
        score += 100;
      }

      // Check each query term against flattened keywords
      queryTerms.forEach(term => {
        // Direct match in keywords
        if (flatKeywords.some(kw => normalize(kw) === term)) {
          score += 40;
        }
        // Partial match
        else if (flatKeywords.some(kw => normalize(kw).includes(term))) {
          score += 20;
        }
        // Check synonyms
        else if (KEYWORD_SYNONYMS[term]) {
          KEYWORD_SYNONYMS[term].forEach(syn => {
            if (flatKeywords.some(kw => normalize(kw).includes(syn))) {
              score += 15;
            }
          });
        }
      });
      return score;
    }

    // Fallback: original scoring for entries without keywords
    const entryText = normalize((entry.reply || entry.text || '').toLowerCase());
    const entryKeywords = entryText.split(/\s+/);

    queryTerms.forEach(term => {
      if (entryKeywords.includes(term)) score += 30;
      else if (entryKeywords.some(kw => kw.includes(term))) score += 15;
    });

    return score;
  }

  function rankKb(query) {
    return KB.filter(e => !e.isDefault)
      .map(entry => ({ entry, score: scoreEntry(entry, query) }))
      .sort((a, b) => b.score - a.score);
  }

  // Check if top matches are ambiguous (too close in score)
  function isAmbiguousQuery(topMatches) {
    if (topMatches.length < 2) return false;
    const top = topMatches[0].score;
    const second = topMatches[1].score;
    return top > 0 && (top - second) < (top * 0.15); // Within 15% is ambiguous
  }

  // Generate follow-up question suggestions
  function generateFollowUp(topMatches, productType) {
    if (!topMatches || topMatches.length < 2) return null;

    // Only generate follow-ups if we have quality matches but ambiguity
    if (topMatches[0].score < 10) return null;

    // Simple heuristic: if query is very short and we have multiple matches, ask for clarification
    return `I found multiple relevant answers. Can you tell me more about what you're asking?`;
  }

  function lookupChipAnswer(query) {
    const key = normalize(query);
    if (CHIP_ANSWERS[key]) return CHIP_ANSWERS[key];
    for (const phrase of Object.keys(CHIP_ANSWERS)) {
      if (key.includes(phrase) || phrase.includes(key)) return CHIP_ANSWERS[phrase];
    }
    return null;
  }

  /** Keep chat replies readable — include lists when present */
  function toSimpleAnswer(html) {
    const parts = html.match(/<p>[\s\S]*?<\/p>/g);
    const list = html.match(/<ol[\s\S]*?<\/ol>|<ul[\s\S]*?<\/ul>/);
    if (!parts?.length) return html;
    let out = parts[0];
    if (list) out += list[0];
    else if (parts[1]) {
      const plain = parts[1].replace(/<[^>]+>/g, '');
      if (plain.length < 220) out += parts[1];
    }
    return out;
  }

  function formatKnowledgeHit({ chunk }) {
    let text = (chunk.text || '').replace(/\s+/g, ' ').trim();
    if (text.length > 340) {
      const cut = text.slice(0, 340);
      const dot = cut.lastIndexOf('.');
      text = dot > 60 ? cut.slice(0, dot + 1) : cut.trim() + '…';
    }
    let html = '';
    if (chunk.question) {
      html += '<p><strong>' + escapeHtml(chunk.question) + '</strong></p>';
    }
    html += '<p>' + escapeHtml(text) + '</p>';
    html += '<p class="evb-asst-footnote">Walk in or text <a href="' + SMS_URL + '">' + PHONE + '</a> · ' + escapeHtml(ADDRESS) + '</p>';
    return html;
  }

  function resolveAnswer(query) {
    const chip = lookupChipAnswer(query);
    if (chip) return chip;

    const kbRanked = rankKb(query);
    const kbBest = kbRanked[0];
    const siteHit = searchKnowledge(query);

    // KB answers beat random site FAQ snippets
    if (kbBest && kbBest.score >= 18) {
      return toSimpleAnswer(kbBest.entry.reply);
    }

    if (kbBest && kbBest.score >= 10) {
      return toSimpleAnswer(kbBest.entry.reply);
    }

    if (siteHit && siteHit.score >= 28) {
      return formatKnowledgeHit(siteHit);
    }

    if (kbBest && kbBest.score >= 6) {
      return toSimpleAnswer(kbBest.entry.reply);
    }

    if (siteHit && siteHit.score >= 14) {
      return formatKnowledgeHit(siteHit);
    }

    if (kbBest && kbBest.score > 0) {
      return toSimpleAnswer(kbBest.entry.reply);
    }

    if (siteHit && siteHit.score >= 10) {
      return formatKnowledgeHit(siteHit);
    }

    // No match found - show friendly error message
    return toSimpleAnswer(getRandomErrorMessage() + `<p style="margin-top:1em;font-size:0.9em;color:#666;">Or call/text <a href="${SMS_URL}">${PHONE}</a> — we're here to help!</p>`);
  }

  // ── Escape HTML ───────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Build SVG icon (no external dependency) ───────────────────────────────
  function buildIconSvg() {
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="evb-asst-icon-svg"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l6.18-.99C9.58 22.6 10.73 23 12 23c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.08 0-2.1-.2-3.08-.56l-.22-.1-2.29.37.38-2.29-.1-.22C4.2 14.1 4 13.08 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/></svg>';
  }

  // ── Build UI ──────────────────────────────────────────────────────────────
  const HIDE_KEY = 'evb_asst_minimized_v1';
  const POS_KEY  = 'evb_asst_pos_v1';

  function buildUI() {
    const root = document.createElement('div');
    root.className = 'evb-asst-root';
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Site assistant');

    const iconSvg = buildIconSvg();

    root.innerHTML =
      '<div class="evb-asst-toggle-wrap">' +
      '<button type="button" class="evb-asst-dismiss" aria-label="Minimize chat assistant">&times;</button>' +
      '<button type="button" class="evb-asst-toggle" aria-expanded="false" aria-controls="evb-asst-panel">' +
      '<span class="evb-asst-toggle-icon" aria-hidden="true">' +
      iconSvg +
      '</span>' +
      '<span class="evb-asst-toggle-label">Ask EVB<small>Site assistant</small></span>' +
      '</button>' +
      '</div>' +
      '<button type="button" class="evb-asst-restore" aria-label="Reopen chat assistant">' +
      '<span class="evb-asst-icon-svg-wrap" aria-hidden="true">' +
      iconSvg +
      '</span>' +
      '</button>' +
      '<div class="evb-asst-panel" id="evb-asst-panel" hidden>' +
      '<div class="evb-asst-head">' +
      '<div class="evb-asst-head-logo">' +
      '<span class="evb-asst-head-logo-icon" aria-hidden="true">' +
      iconSvg +
      '</span>' +
      '<div class="evb-asst-head-text"><h2>East Village Buyers</h2><p>Drag to move &middot; ask me anything</p></div>' +
      '</div>' +
      '<button type="button" class="evb-asst-close" aria-label="Close chat">&times;</button>' +
      '</div>' +
      '<div class="evb-asst-messages" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="evb-asst-chips"></div>' +
      '<form class="evb-asst-foot" role="search">' +
      '<textarea class="evb-asst-input" rows="1" placeholder="Ask about selling, hours, gold, watches…" aria-label="Your question"></textarea>' +
      '<button type="submit" class="evb-asst-send">Send</button>' +
      '</form>' +
      '</div>';

    document.body.appendChild(root);

    // ── Restore last dragged position (if any) for this session ─────────────
    try {
      const savedPos = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
      if (savedPos && typeof savedPos.right === 'number' && typeof savedPos.bottom === 'number') {
        root.style.setProperty('right', savedPos.right + 'px', 'important');
        root.style.setProperty('bottom', savedPos.bottom + 'px', 'important');
        root.style.setProperty('left', 'auto', 'important');
        root.style.setProperty('top', 'auto', 'important');
      }
    } catch (_) { /* ignore malformed storage */ }

    // ── Minimize / restore ───────────────────────────────────────────────────
    const restoreBtn = root.querySelector('.evb-asst-restore');

    function minimize() {
      root.classList.add('evb-asst-root--minimized');
      sessionStorage.setItem(HIDE_KEY, '1');
    }
    function unminimize() {
      root.classList.remove('evb-asst-root--minimized');
      sessionStorage.removeItem(HIDE_KEY);
    }
    if (sessionStorage.getItem(HIDE_KEY)) minimize();

    const dismissBtn = root.querySelector('.evb-asst-dismiss');
    dismissBtn.addEventListener('click', e => {
      e.stopPropagation();
      minimize();
    });

    // ── Keep the widget fully on-screen ──────────────────────────────────────
    function keepInViewport() {
      const rect = root.getBoundingClientRect();
      const margin = 8;
      let right = parseFloat(getComputedStyle(root).right) || 0;
      let bottom = parseFloat(getComputedStyle(root).bottom) || 0;
      if (rect.left < margin) right += (margin - rect.left);
      if (rect.top < margin) bottom += (margin - rect.top);
      if (rect.right > window.innerWidth - margin) right -= (rect.right - (window.innerWidth - margin));
      if (rect.bottom > window.innerHeight - margin) bottom -= (rect.bottom - (window.innerHeight - margin));
      right = Math.max(margin, right);
      bottom = Math.max(margin, bottom);
      root.style.setProperty('right', right + 'px', 'important');
      root.style.setProperty('bottom', bottom + 'px', 'important');
      root.style.setProperty('left', 'auto', 'important');
      root.style.setProperty('top', 'auto', 'important');
    }

    // ── Draggable (mouse + touch via Pointer Events) ─────────────────────────
    function makeDraggable(handleEl) {
      let dragging = false;
      let moved = false;
      let startX = 0, startY = 0, startRight = 0, startBottom = 0;
      let pointerId = null;

      function onPointerDown(e) {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        dragging = true;
        moved = false;
        pointerId = e.pointerId;
        const rect = root.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startRight = window.innerWidth - rect.right;
        startBottom = window.innerHeight - rect.bottom;
        root.classList.add('evb-asst-root--dragging');
        try { handleEl.setPointerCapture(pointerId); } catch (_) { /* noop */ }
      }

      function onPointerMove(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        e.preventDefault();
        const rect = root.getBoundingClientRect();
        const margin = 8;
        let newRight = startRight - dx;
        let newBottom = startBottom - dy;
        newRight = Math.min(Math.max(newRight, margin), window.innerWidth - rect.width - margin);
        newBottom = Math.min(Math.max(newBottom, margin), window.innerHeight - rect.height - margin);
        root.style.setProperty('right', newRight + 'px', 'important');
        root.style.setProperty('bottom', newBottom + 'px', 'important');
        root.style.setProperty('left', 'auto', 'important');
        root.style.setProperty('top', 'auto', 'important');
      }

      function onPointerUp(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        root.classList.remove('evb-asst-root--dragging');
        try { handleEl.releasePointerCapture(pointerId); } catch (_) { /* noop */ }
        if (moved) {
          keepInViewport();
          const right = parseFloat(getComputedStyle(root).right) || 0;
          const bottom = parseFloat(getComputedStyle(root).bottom) || 0;
          sessionStorage.setItem(POS_KEY, JSON.stringify({ right, bottom }));
          suppressNextClick = true;
          setTimeout(() => { suppressNextClick = false; }, 0);
        }
      }

      handleEl.addEventListener('pointerdown', onPointerDown);
      handleEl.addEventListener('pointermove', onPointerMove);
      handleEl.addEventListener('pointerup', onPointerUp);
      handleEl.addEventListener('pointercancel', onPointerUp);

      return {
        wasDragged: () => moved
      };
    }

    let suppressNextClick = false;
    const toggleDrag = makeDraggable(root.querySelector('.evb-asst-toggle'));
    makeDraggable(root.querySelector('.evb-asst-head'));
    const restoreDrag = makeDraggable(restoreBtn);

    restoreBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (suppressNextClick || restoreDrag.wasDragged()) return;
      unminimize();
    });

    window.addEventListener('resize', keepInViewport);

    const toggle   = root.querySelector('.evb-asst-toggle');
    const panel    = root.querySelector('.evb-asst-panel');
    const closeBtn = root.querySelector('.evb-asst-close');
    const messages = root.querySelector('.evb-asst-messages');
    const chipsEl  = root.querySelector('.evb-asst-chips');
    const form     = root.querySelector('.evb-asst-foot');
    const input    = root.querySelector('.evb-asst-input');
    const sendBtn  = root.querySelector('.evb-asst-send');

    let greeted = false;
    let conversationHistory = [];
    let detectedProductType = null;

    function openPanel() {
      root.classList.add('evb-asst-root--open');
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(keepInViewport);
      if (!greeted) {
        greeted = true;
        addBotMessage(
          '<p>Hey! I\'m the East Village Buyers assistant. Ask me anything — what we buy, how selling works, our hours, location, whatever you need.</p>'
        );
        renderChips();
      }
      input.focus();
    }

    function closePanel() {
      root.classList.remove('evb-asst-root--open');
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    function addMessage(html, role) {
      const el = document.createElement('div');
      el.className = 'evb-asst-msg evb-asst-msg--' + role;
      el.innerHTML = html;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function addBotMessage(html) { return addMessage(html, 'bot'); }
    function addUserMessage(text) { return addMessage('<p>' + escapeHtml(text) + '</p>', 'user'); }

    function showTyping() {
      const el = document.createElement('div');
      el.className = 'evb-asst-typing';
      el.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function renderChips() {
      renderContextAwareChips(null);
    }

    function askQuestion(q) {
      const text = (q || '').trim();
      if (!text) return;

      sendBtn.disabled = true;
      addUserMessage(text);

      // Detect product type from query
      const productType = detectProductType(text);
      if (productType && !detectedProductType) {
        detectedProductType = productType;
      }

      // Store in conversation history
      conversationHistory.push({ user: text, type: productType });

      const typing = showTyping();

      setTimeout(() => {
        typing.remove();

        // Get top matches for potential follow-up detection
        const topMatches = rankKb(text).slice(0, 3);

        // Check if query is ambiguous
        if (isAmbiguousQuery(topMatches)) {
          const followUp = generateFollowUp(topMatches, detectedProductType);
          if (followUp) {
            addBotMessage(followUp);
            // Show context-specific chips
            renderContextAwareChips(topMatches);
            sendBtn.disabled = false;
            input.focus();
            return;
          }
        }

        // Normal answer
        addBotMessage(resolveAnswer(text));

        // Render context-aware suggestions
        renderContextAwareChips(topMatches);

        sendBtn.disabled = false;
        input.focus();
      }, 400);
    }

    function renderContextAwareChips(topMatches) {
      chipsEl.innerHTML = '';

      // Show related suggestions based on detected product type
      const suggestions = [];

      // If we detected a product type, suggest product-specific questions
      if (detectedProductType) {
        const relevant = [
          'What\'s the condition needed?',
          'How are offers calculated?',
          'Do you buy damaged items?',
          'How long does appraisal take?',
          'Is it free?'
        ];
        suggestions.push(...relevant.slice(0, 3));
      } else {
        // Default suggestions
        suggestions.push(...SUGGESTIONS);
      }

      // Render up to 6 suggestions
      suggestions.slice(0, 6).forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'evb-asst-chip';
        b.textContent = s;
        b.addEventListener('click', () => askQuestion(s));
        chipsEl.appendChild(b);
      });
    }

    function submitQuery() {
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      askQuestion(q);
    }

    toggle.addEventListener('click', () => {
      if (suppressNextClick || toggleDrag.wasDragged()) return;
      openPanel();
    });
    closeBtn.addEventListener('click', closePanel);

    form.addEventListener('submit', e => { e.preventDefault(); submitQuery(); });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuery(); }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && root.classList.contains('evb-asst-root--open')) closePanel();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
