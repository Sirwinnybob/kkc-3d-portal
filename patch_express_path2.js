const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// If Express throws PathError: Missing parameter name, then it is path-to-regexp v6+ (Express 5?).
// We need to use `/*` or `/:path(*)` or `*` or `/:subpath(.*)`. Let's use `*` which works in express 4, but if it's express 5, `/:subpath(*)` is safer.

code = code.replace(/\/api\/showroom\/part\/\*/g, '/api/showroom/part/:subpath(*)');
code = code.replace(/\/api\/showroom\/tags\/\*/g, '/api/showroom/tags/:subpath(*)');
code = code.replace(/\/api\/showroom\/meshes\/\*/g, '/api/showroom/meshes/:subpath(*)');

// And in the logic inside those functions:
// req.params[0] becomes req.params.subpath
code = code.replace(/const subpath = req\.params\[0\];/g, 'const subpath = req.params.subpath;');

fs.writeFileSync('server.js', code);
console.log('Fixed wildcard routes to /:subpath(*)');
