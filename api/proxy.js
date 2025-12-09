// api/proxy.js
const https = require('https');
const url = require('url');

// **IMPORTANT: Use YOUR full Web App URL here**
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';

module.exports = (req, res) => {
    // Capture the entire path including query parameters (e.g., /?id=EMP06)
    const fullPathAndQuery = req.url || ''; 
    
    // Construct the final URL for the Apps Script endpoint
    const targetUrl = GAS_BASE + fullPathAndQuery;

    const parsedUrl = url.parse(targetUrl);

    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path, // Includes the full query string
        method: req.method,
        headers: {
            ...req.headers,
            // Override the Host header to match the Google Scripts server
            'host': parsedUrl.hostname,
            'connection': 'keep-alive',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        // Forward status code
        res.statusCode = proxyRes.statusCode || 200;

        // Forward headers, excluding problematic ones that cause issues in proxy environments
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (!['transfer-encoding', 'content-encoding', 'content-length', 'content-security-policy', 'x-xss-protection'].includes(lowerKey)) {
                res.setHeader(key, proxyRes.headers[key]);
            }
        });

        // Pipe the response from GAS back to the client
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request failed:', err);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.end('Bad Gateway: Failed to reach the Google Apps Script service.');
        }
    });

    // Ensure the request body is forwarded (though usually empty for GET)
    req.pipe(proxyReq);
};
