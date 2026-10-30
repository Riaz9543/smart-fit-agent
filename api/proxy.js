export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.META_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'META_API_KEY not configured' });
  }

  const { endpoint, payload } = req.body || {};
  if (!endpoint || !payload) {
    return res.status(400).json({ error: 'Missing endpoint or payload' });
  }

  // Only allow known Meta API paths
  const allowed = ['chat/completions', 'images/edits', 'responses'];
  if (!allowed.includes(endpoint)) {
    return res.status(403).json({ error: 'Endpoint not allowed' });
  }

  try {
    const r = await fetch(`https://api.meta.ai/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}