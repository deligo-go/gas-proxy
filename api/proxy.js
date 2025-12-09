// api/proxy.js
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyYb0riESdojrldHLj4n1aYWjVSN5UiU7ml0qMY-gLToFkySdhukxGSw0QeZHG8xx64CQ/exec';

module.exports = (req, res) => {
    // Build the full URL with query parameters
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const finalUrl = params.toString() ? `${GAS_URL}?${params.toString()}` : GAS_URL;
    
    // Return an iframe that loads the GAS app
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Employee Verification - Viruzverse Solutions</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        iframe { width: 100%; height: 100%; border: none; display: block; }
    </style>
</head>
<body>
    <iframe src="${finalUrl}" allow="*" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation allow-top-navigation-by-user-activation"></iframe>
</body>
</html>`;
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
};
