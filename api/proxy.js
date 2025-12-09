// api/proxy.js
const https = require('https');
const { URL } = require('url');

// This URL must match your final, deployed GAS Web App URL
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';

const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

module.exports = (req, res) => {
    // Clean the request URL to remove Google-specific parameters
    const requestUrl = new URL(req.url, `https://${req.headers.host}`);
    const finalGasUrl = new URL(GAS_BASE);

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
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: {
            ...req.headers,
            'host': parsedUrl.hostname, // Correct Host header
            'connection': 'keep-alive',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 200;

        // Filter out conflicting headers (CSP, XSS protection, Encoding)
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            
            // Block headers that cause Gibberish/Security conflicts
            if (['transfer-encoding', 'content-encoding', 'content-length', 'content-security-policy', 'x-xss-protection', 'x-frame-options', 'strict-transport-security'].includes(lowerKey)) {
                return;
            }
            
            res.setHeader(key, proxyRes.headers[key]);
        });
        
        // Ensure Content-Type is set for HTML output
        if (!res.headersSent && !res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request failed:', err);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.end('Bad Gateway.');
        }
    });

    req.pipe(proxyReq);
};
