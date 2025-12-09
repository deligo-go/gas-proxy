// api/proxy.js
const https = require('https');
const url = require('url');

const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';

module.exports = (req, res) => {
  const targetPath = req.url || '/';  // Preserve query params and path
  const targetUrl = GAS_BASE + targetPath;

  const parsedUrl = url.parse(targetUrl);

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    method: req.method,
    headers: {
      ...req.headers,
      host: parsedUrl.hostname,  // Set correct host
      connection: 'keep-alive',
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Forward status code
    res.statusCode = proxyRes.statusCode || 200;

    // Forward headers (skip problematic ones)
    Object.keys(proxyRes.headers).forEach((key) => {
      if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });

    // Pipe the response from GAS to the client
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end('Bad Gateway: Failed to reach the service.');
    }
  });

  // Forward request body (important for POST if ever used)
  req.pipe(proxyReq);
};
