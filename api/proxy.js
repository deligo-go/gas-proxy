// api/proxy.js
const https = require('https');
const { URL } = require('url');

// This URL must match your final, deployed GAS Web App URL
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbwE1vWTiEbKRr09DPuw1ZwgnyRPVSWfe28UC-r5coYIkM4pw3hnY61vdOCS71AwW8D8/exec';
const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

function extractUserHtml(gasResponse) {
    // Try to find the userHtml field in the JSON initialization
    const match = gasResponse.match(/"userHtml":\s*"([^]*?)(?:","|"\})/);
    if (!match) return null;
    
    let html = match[1];
    
    try {
        // Parse as JSON string to handle all escapes
        html = JSON.parse('"' + html + '"');
    } catch (e) {
        // Fallback: manual unescape
        html = html.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                   .replace(/\\n/g, '\n')
                   .replace(/\\r/g, '\r')
                   .replace(/\\t/g, '\t')
                   .replace(/\\"/g, '"')
                   .replace(/\\'/g, "'")
                   .replace(/\\\\/g, '\\');
    }
    
    return html;
}

module.exports = (req, res) => {
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
            // Try to extract clean HTML
            const userHtml = extractUserHtml(data);
            
            if (userHtml && userHtml.length > 500) {
                // Successfully extracted clean HTML
                let finalHtml = userHtml;
                
                // Fix form action URLs
                finalHtml = finalHtml.replace(
                    /action=["']https:\/\/script\.google\.com\/macros\/s\/[^"']+["']/g,
                    `action="https://${req.headers.host}"`
                );
                
                console.log('Serving extracted HTML, length:', finalHtml.length);
                
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('X-Frame-Options', 'SAMEORIGIN');
                res.end(finalHtml);
            } else {
                // Fallback: serve wrapper with fixed URLs
                console.log('Extraction failed, serving wrapper');
                
                data = data.replace(/href=["']\/static\//g, 'href="https://script.google.com/static/');
                data = data.replace(/src=["']\/static\//g, 'src="https://script.google.com/static/');
                
                res.statusCode = proxyRes.statusCode || 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
