const ALLOWED_ORIGINS = new Set([
  'https://eastvillagebuyers.com',
  'https://www.eastvillagebuyers.com',
  'https://store.eastvillagebuyers.com',
]);

const SYSTEM_PROMPT = `You are the site assistant for East Village Buyers, a buy-and-sell shop at 39 Avenue A, New York, NY 10009 (phone/text: 917-608-8939). Hours: Sun 12:30-6 PM, Mon-Thu 12:30-6:30 PM, Fri 12:30-4 PM, closed Saturdays.

We buy and sell: gold (10K-24K, any condition including broken/scrap), silver, diamonds, fine jewelry, luxury watches (Rolex, Omega, Cartier, etc.), designer handbags and accessories, streetwear, sneakers, electronics (iPhones, AirPods, MacBooks, PS5, cameras), and collectibles.

How it works: walk in any time during hours, no appointment needed. We test/authenticate the item in front of the customer, make a cash offer on the spot, and pay same-day if accepted. A government-issued ID is required by NYC law for the transaction. Customers can also text a photo first for a rough read before coming in.

Answer naturally and conversationally, like a helpful person who works at the shop -- not like a corporate FAQ bot. Keep answers short (2-4 sentences unless more detail is genuinely needed). Never invent prices, specific dollar offers, or policies not stated here. If asked something you don't know, say so honestly and suggest texting a photo to 917-608-8939 for a real answer. Never mention that you are an AI model, and don't discuss anything unrelated to East Village Buyers, buying/selling, or the categories above.`;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const message = String(body.message || '').slice(0, 1000);
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

    if (!message.trim()) {
      return new Response(JSON.stringify({ error: 'Empty message' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!env.GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter((h) => h && typeof h.role === 'string' && typeof h.content === 'string')
        .map((h) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.content).slice(0, 1000),
        })),
      { role: 'user', content: message },
    ];

    let groqRes;
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.6,
          max_tokens: 350,
        }),
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Upstream request failed' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!groqRes.ok) {
      return new Response(JSON.stringify({ error: 'Upstream error' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return new Response(JSON.stringify({ error: 'Empty upstream response' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};
