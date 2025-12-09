// api/proxy.js
const https = require('https');
const { URL } = require('url');

// This URL must match your final, deployed GAS Web App URL
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g/exec';
const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

// Function to extract and unescape the actual HTML from GAS response
function extractUserHtml(gasResponse) {
    const match = gasResponse.match(/"userHtml":"((?:[^"\\]|\\.)*)"/);
    if (!match) return null;
    
    let html = match[1];
    // Unescape the JSON string
    html = html.replace(/\\n/g, '\n')
               .replace(/\\"/g, '"')
               .replace(/\\'/g, "'")
               .replace(/\\\\/g, '\\')
               .replace(/\\x3c/g, '<')
               .replace(/\\x3e/g, '>')
               .replace(/\\x2f/g, '/')
               .replace(/\\x27/g, "'")
               .replace(/\\x26/g, '&');
    
    return html;
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
            // Extract the actual user HTML from Google's wrapper
            const userHtml = extractUserHtml(data);
            
            if (userHtml) {
                // We got the clean HTML, fix the form action to point to our proxy
                let finalHtml = userHtml.replace(
                    /action="https:\/\/script\.google\.com\/macros\/s\/[^"]+"/g,
                    `action="https://${req.headers.host}"`
                );
                
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Length', Buffer.byteLength(finalHtml));
                res.end(finalHtml);
            } else {
                // Fallback: serve the wrapper as-is with URL rewrites
                data = data.replace(/href="\/static\//g, 'href="https://script.google.com/static/');
                data = data.replace(/src="\/static\//g, 'src="https://script.google.com/static/');
                data = data.replace(/action="https:\/\/script\.google\.com\/macros\/s\/AKfycbxjR1NDJlHbktoEAmA1t-m1Lphe_gV7yqI4UR99ju5WRnkFkIIrhqopz2VEiVNRQ9Pn7g\/exec"/g, `action="https://${req.headers.host}"`);
                
                res.statusCode = proxyRes.statusCode || 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Length', Buffer.byteLength(data));
                res.end(data);
            }
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
