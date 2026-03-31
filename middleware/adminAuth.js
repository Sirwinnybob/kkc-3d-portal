const crypto = require('crypto');

module.exports = (req, res, next) => {
    // Basic Auth
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    // Security: Use environment variables for admin credentials
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;

    if (!adminUser || !adminPass) {
        console.error('[SECURITY] ADMIN_USER and ADMIN_PASS environment variables must be set.');
        return res.status(500).send('Server configuration error.');
    }

    // Use constant-time comparison to prevent timing attacks, handle length mismatch gracefully
    let loginMatch = false;
    let passMatch = false;

    const loginBuffer = Buffer.from(login || '');
    const userBuffer = Buffer.from(adminUser);
    if (loginBuffer.length === userBuffer.length) {
        loginMatch = crypto.timingSafeEqual(loginBuffer, userBuffer);
    }

    const passBuffer = Buffer.from(password || '');
    const adminPassBuffer = Buffer.from(adminPass);
    if (passBuffer.length === adminPassBuffer.length) {
        passMatch = crypto.timingSafeEqual(passBuffer, adminPassBuffer);
    }

    if (loginMatch && passMatch) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="KKC Admin Area"');
    res.status(401).send('Authentication required.');
};
