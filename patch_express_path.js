const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// The error is `Missing parameter name at index 24: /api/showroom/meshes/(.*)`.
// Express 4 uses path-to-regexp v0.1.7 which handles `*` fine. Wait, maybe my express version uses path-to-regexp v6?
// The correct syntax for an unnamed parameter in modern Express/path-to-regexp is `(.*)`. Wait no, it expects a name `/:path(.*)` or similar. Let's try `/*path`.

code = code.replace(/\/api\/showroom\/part\/\(\.\*\)/g, '/api/showroom/part/*');
code = code.replace(/\/api\/showroom\/tags\/\(\.\*\)/g, '/api/showroom/tags/*');
code = code.replace(/\/api\/showroom\/meshes\/\(\.\*\)/g, '/api/showroom/meshes/*');

fs.writeFileSync('server.js', code);
console.log('Fixed wildcard routes syntax back to *');
