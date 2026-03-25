const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');
code = code.replace(
    /    \{ pattern: \/DrawerFront\/, category: 'drawer_fronts' \},\n/,
    ""
);
fs.writeFileSync('server.js', code);
