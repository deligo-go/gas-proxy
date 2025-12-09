// api/proxy.js
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

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
            'host': parsedUrl.hostname,
            'accept-encoding': 'gzip, deflate, br', // Accept compression
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 200;

        // Set headers but exclude problematic ones
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            
            // Block only CSP and security headers, but keep encoding info
            if (['content-security-policy', 'x-frame-options', 'strict-transport-security'].includes(lowerKey)) {
                return;
            }
            
            res.setHeader(key, proxyRes.headers[key]);
        });

        // Handle decompression based on content-encoding
        const encoding = proxyRes.headers['content-encoding'];
        let stream = proxyRes;

        if (encoding === 'gzip') {
            stream = proxyRes.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
            stream = proxyRes.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
            stream = proxyRes.pipe(zlib.createBrotliDecompress());
        }

        // Remove content-encoding header since we're decompressing
        if (encoding) {
            res.removeHeader('content-encoding');
            res.removeHeader('content-length');
        }

        stream.pipe(res);
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
