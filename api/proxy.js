// api/proxy.js
const https = require('https');
const url = require('url');

// IMPORTANT: This should be the full URL of your deployed GAS Web App.
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhgopz2VEiVNRQ9Pn7g/exec';

module.exports = (req, res) => {
    // 1. Capture the full path and query string from the client request
    const fullPathAndQuery = req.url || ''; 
    
    // 2. Construct the final URL for the GAS endpoint
    const targetUrl = GAS_BASE + fullPathAndQuery;

    const parsedUrl = url.parse(targetUrl);

    // 3. Configure the proxy request
    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path, // This includes /macros/s/.../exec/?id=VALUE
        method: req.method,
        headers: {
            // Forward standard headers
            ...req.headers,
            // Override the Host header to match the Google Scripts server, not Vercel
            'host': parsedUrl.hostname,
            'connection': 'keep-alive',
        },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        // 4. Forward status code
        res.statusCode = proxyRes.statusCode || 200;

        // 5. Forward headers, specifically excluding those that confuse compression or caching
        Object.keys(proxyRes.headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (!['transfer-encoding', 'content-encoding', 'content-length', 'cache-control'].includes(lowerKey)) {
                res.setHeader(key, proxyRes.headers[key]);
            }
        });

        // 6. Pipe the response from GAS back to the client
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request failed:', err);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.end('Bad Gateway: Failed to communicate with the Apps Script backend.');
        }
    });

    // 7. Ensure the request body (important for POST or certain GETs) is forwarded
    req.pipe(proxyReq);
};
