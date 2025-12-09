// api/proxy.js
const https = require('https');
const { URL } = require('url');

// This URL must match your final, deployed GAS Web App URL
const GAS_BASE = 'https://script.google.com/macros/s/AKfycbyYb0riESdojrldHLj4n1aYWjVSN5UiU7ml0qMY-gLToFkySdhukxGSw0QeZHG8xx64CQ/exec';
const IGNORED_PARAMS = ['pli', 'authuser', 'ifk'];

function extractUserHtml(gasResponse) {
    // Find the userHtml field - it's between "userHtml":" and the next "
    const startMarker = '"userHtml":"';
    const startIdx = gasResponse.indexOf(startMarker);
    
    if (startIdx === -1) return null;
    
    let idx = startIdx + startMarker.length;
    let html = '';
    let escape = false;
    
    // Parse character by character to handle escapes properly
    while (idx < gasResponse.length) {
        const char = gasResponse[idx];
        
        if (escape) {
            // Handle escaped characters
            if (char === 'n') html += '\n';
            else if (char === 'r') html += '\r';
            else if (char === 't') html += '\t';
            else if (char === '"') html += '"';
            else if (char === '\\') html += '\\';
            else if (char === 'x') {
                // Hex escape like \x3c
                const hex = gasResponse.substr(idx + 1, 2);
                html += String.fromCharCode(parseInt(hex, 16));
                idx += 2;
            } else {
                html += char;
            }
            escape = false;
        } else if (char === '\\') {
            escape = true;
        } else if (char === '"') {
            // End of userHtml string
            break;
        } else {
            html += char;
        }
        
        idx++;
    }
    
    return html.length > 100 ? html : null;
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
            // Check if this looks like the wrapper (has sandboxFrame) or clean HTML (has <!DOCTYPE)
            const isWrapper = data.includes('sandboxFrame') || data.includes('warning-bar-table');
            const isCleanHtml = data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html');
            
            console.log('Response analysis:', {
                isWrapper,
                isCleanHtml,
                length: data.length,
                starts: data.substring(0, 100)
            });
            
            if (isCleanHtml && !isWrapper) {
                // Already clean HTML, serve it directly
                console.log('✓ Serving clean HTML directly');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(data);
            } else if (isWrapper) {
                // Try to extract from wrapper
                console.log('⚠ Wrapper detected, attempting extraction');
                const userHtml = extractUserHtml(data);
                
                if (userHtml && userHtml.length > 500) {
                    console.log('✓ Extracted HTML, length:', userHtml.length);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(userHtml);
                } else {
                    console.log('✗ Extraction failed, serving wrapper');
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(data);
                }
            } else {
                // Unknown format, serve as-is
                console.log('? Unknown format, serving as-is');
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
