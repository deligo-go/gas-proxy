// api/proxy.js
const https = require('https');
const { URL } = require('url');

// This URL must match your final, deployed GAS Web App URL
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';
const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

// Function to determine MIME type from file extension
function getMimeType(url) {
    const ext = url.split('.').pop().split('?')[0].toLowerCase();
    const mimeTypes = {
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'woff': 'font/woff',
        'woff2': 'font/woff2',
        'ttf': 'font/ttf',
        'eot': 'application/vnd.ms-fontobject'
    };
    return mimeTypes[ext] || 'text/html';
}

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

    // Determine correct MIME type from the request URL
    const correctMimeType = getMimeType(req.url);

    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: {
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
            'Accept': '*/*',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        // Set status code
        res.statusCode = proxyRes.statusCode || 200;

        // Copy headers but override Content-Type
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (!['content-security-policy', 'x-frame-options', 'strict-transport-security', 'content-type'].includes(lowerKey)) {
                res.setHeader(key, proxyRes.headers[key]);
            }
        });

        // Set correct Content-Type based on file extension
        res.setHeader('Content-Type', correctMimeType);

        // Pipe the response
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
