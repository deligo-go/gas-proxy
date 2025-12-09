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
        let data = '';

        proxyRes.setEncoding('utf8');
        
        proxyRes.on('data', (chunk) => {
            data += chunk;
        });

        proxyRes.on('end', () => {
            // Rewrite URLs in HTML to point back to Google's servers
            data = data.replace(/href="\/static\//g, 'href="https://script.google.com/static/');
            data = data.replace(/src="\/static\//g, 'src="https://script.google.com/static/');
            
            // Also fix any other relative URLs that might be problematic
            data = data.replace(/src='\/userCodeAppPanel'/g, `src='https://n-xwppdsern6pqfjrboxkwn4vpovkkmsirbynxg4y-0lu-script.googleusercontent.com/userCodeAppPanel'`);

            res.statusCode = proxyRes.statusCode || 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Length', Buffer.byteLength(data));
            
            // Remove problematic security headers
            Object.keys(proxyRes.headers).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!['content-security-policy', 'x-frame-options', 'strict-transport-security', 'content-type', 'content-length'].includes(lowerKey)) {
                    res.setHeader(key, proxyRes.headers[key]);
                }
            });

            res.end(data);
        });
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request failed:', err);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<h1>Bad Gateway</h1><p>Error: ' + err.message + '</p>');
        }
    });

    proxyReq.end();
};
