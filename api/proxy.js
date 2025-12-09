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
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        // Set status code
        res.statusCode = proxyRes.statusCode || 200;

        // Copy all headers except problematic security ones
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (!['content-security-policy', 'x-frame-options', 'strict-transport-security'].includes(lowerKey)) {
                res.setHeader(key, proxyRes.headers[key]);
            }
        });

        // Simply pipe the response
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request failed:', err);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<h1>Bad Gateway</h1><p>Error: ' + err.message + '</p>');
        }
    });

    // Handle POST data if present
    if (req.method === 'POST') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
};
