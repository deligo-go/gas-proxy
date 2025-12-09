// api/proxy.js
const https = require('https');
const { URL } = require('url'); // Using the built-in URL class

// **IMPORTANT: Use YOUR full Web App URL here**
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';

// List of Google-specific query parameters to remove (always remove these)
const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

module.exports = (req, res) => {
    // 1. Clean the request URL
    const requestUrl = new URL(req.url, `https://${req.headers.host}`);
    const finalGasUrl = new URL(GAS_BASE);

    // Copy ONLY valid query parameters (like ?id=VALUE)
    const originalParams = new URLSearchParams(requestUrl.search);
    
    originalParams.forEach((value, key) => {
        if (!IGNORED_PARAMS.includes(key.toLowerCase())) {
            finalGasUrl.searchParams.set(key, value);
        }
    });

    const targetUrl = finalGasUrl.toString();
    const parsedUrl = new URL(targetUrl);

    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search, // Use cleaned path and query
        method: req.method,
        headers: {
            // Forward standard headers
            ...req.headers,
            // Override the Host header to match the Google Scripts server
            'host': parsedUrl.hostname,
            'connection': 'keep-alive',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 200;

        // 2. Filter out problematic headers and force encoding
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            
            // BLOCK headers that interfere with CSP/CORS/XSS protection or encoding
            if (['transfer-encoding', 'content-encoding', 'content-length', 'content-security-policy', 'x-xss-protection', 'x-frame-options'].includes(lowerKey)) {
                return; // Skip setting this header
            }
            
            res.setHeader(key, proxyRes.headers[key]);
        });
        
        // 3. Set Content-Type explicitly to fix the gibberish issue
        if (!res.headersSent && !res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }

        // 4. Pipe the response
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
