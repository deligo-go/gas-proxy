// api/proxy.js
const fetch = require('node-fetch');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';

module.exports = async (req, res) => {
  try {
    const targetUrl = GAS_URL + req.url; // Preserves query params like ?id=EMP01

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: undefined, // Remove host header to avoid confusion
        'user-agent': req.headers['user-agent'] || 'Vercel-Proxy',
      },
      redirect: 'follow',
    });

    // Copy status and headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      // Avoid setting problematic headers
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Stream the response body
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error: Failed to fetch the content.');
  }
};
