// api/proxy.js
const https = require('https');
const { URL } = require('url'); // Using the built-in URL class

// **IMPORTANT: Use YOUR full Web App URL here**
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';

// List of Google-specific query parameters to remove
const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

module.exports = (req, res) => {
    // 1. Get the current request path and query
    const requestUrl = new URL(req.url, `https://${req.headers.host}`);
    
    // 2. Determine the path AFTER the base /exec/
    let fullPathAndQuery = requestUrl.pathname + requestUrl.search;
    
    // 3. Clean the query string: Create a new URL object from the GAS_BASE for manipulation
    const finalGasUrl = new URL(GAS_BASE);

    // 4. Copy ONLY valid query parameters (like ?id=VALUE)
    const originalParams = new URLSearchParams(requestUrl.search);
    
    originalParams.forEach((value, key) => {
        if (!IGNORED_PARAMS.includes(key.toLowerCase())) {
            finalGasUrl.searchParams.set(key, value);
        }
    });

    // 5. Construct the final target URL for the proxy
    // We combine the GAS_BASE path with the cleaned query string
    const targetUrl = finalGasUrl.toString();
    const parsedUrl = new URL(targetUrl); // Re-parse for request options

    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search, // Use cleaned path and query
        method: req.method,
        headers: {
            ...req.headers,
            'host': parsedUrl.hostname,
            'connection': 'keep-alive',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 200;

        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (!['transfer-encoding', 'content-encoding', 'content-length', 'content-security-policy', 'x-xss-protection'].includes(lowerKey)) {
                res.setHeader(key, proxyRes.headers[key]);
            }
        });

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request failed:', err);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.end('Bad Gateway: Failed to reach the Google Apps Script service.');
        }
    });

    req.pipe(proxyReq);
};
