const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// The error is `Missing parameter name at index 31: /api/showroom/meshes/:subpath(*)`.
// Since Express uses `path-to-regexp` v0.1.7 by default in Express 4, BUT something updated in our tree uses v6 or it throws an error.
// The wildcard approach that NEVER fails in Express is simply `app.get('/api/showroom/meshes/*', ...)` if you want standard routing,
// BUT if `*` caused issues earlier, it might be due to a weird version mismatch.
// Let's just use a plain regex!
// `app.get(/^\/api\/showroom\/part\/(.*)$/, (req, res) => ...)`

code = code.replace(/\/api\/showroom\/part\/:subpath\(\*\)/g, '/^\\/api\\/showroom\\/part\\/(.*)$/');
code = code.replace(/\/api\/showroom\/tags\/:subpath\(\*\)/g, '/^\\/api\\/showroom\\/tags\\/(.*)$/');
code = code.replace(/\/api\/showroom\/meshes\/:subpath\(\*\)/g, '/^\\/api\\/showroom\\/meshes\\/(.*)$/');

// Change `req.params.subpath` to `req.params[0]`
code = code.replace(/const subpath = req\.params\.subpath;/g, 'const subpath = req.params[0];');

fs.writeFileSync('server.js', code);
console.log('Fixed wildcard routes to regex');
