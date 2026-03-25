const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Okay, passing strings like '/^\\/api\\/showroom\\/part\\/(.*)$/' evaluates to a literal string path-to-regexp parser.
// I need to use actual RegExp literals, or a wildcard format acceptable by path-to-regexp v6.
// In v6+, `(.*)` requires a named parameter. `(.*)` does not work as a pure wildcard unless named like `/:path(.*)`.
// But wait, it said `Missing parameter name at index 31: /api/showroom/meshes/:subpath(*)`. So `/:subpath(.*)` IS a valid parameter name?
// No, v6 syntax is simply `(.*)`. Wait, let's look at the error `Missing parameter name at index 24`.
// Let's use `/:subpath(*)` again? Wait, no, earlier I tried that and it said `Missing parameter name at index 31: /api/showroom/meshes/:subpath(*)`.
// In Express 5 (path-to-regexp >= 8.0) or v6, it might require a completely different syntax, or we can just bypass the string parser and use a real JS RegExp!
// Let's replace the string `'/^\\/api\\/showroom\\/part\\/(.*)$/'` with the actual RegExp object `/^\\/api\\/showroom\\/part\\/(.*)$/`.

code = code.replace(/'\/\^\\\\\/api\\\\\/showroom\\\\\/part\\\\\/\(\.\*\)\$\/'/g, '/^\\/api\\/showroom\\/part\\/(.*)$/');
code = code.replace(/'\/\^\\\\\/api\\\\\/showroom\\\\\/tags\\\\\/\(\.\*\)\$\/'/g, '/^\\/api\\/showroom\\/tags\\/(.*)$/');
code = code.replace(/'\/\^\\\\\/api\\\\\/showroom\\\\\/meshes\\\\\/\(\.\*\)\$\/'/g, '/^\\/api\\/showroom\\/meshes\\/(.*)$/');

// Let's just manually replace those three lines to be extremely safe
code = code.replace(/app\.get\('\/\^\\\/api\\\/showroom\\\/part\\\/\(\.\*\)\$\/'/g, "app.get(/^\\/api\\/showroom\\/part\\/(.*)$/");
code = code.replace(/app\.get\('\/\^\\\/api\\\/showroom\\\/tags\\\/\(\.\*\)\$\/'/g, "app.get(/^\\/api\\/showroom\\/tags\\/(.*)$/");
code = code.replace(/app\.post\('\/\^\\\/api\\\/showroom\\\/tags\\\/\(\.\*\)\$\/'/g, "app.post(/^\\/api\\/showroom\\/tags\\/(.*)$/");
code = code.replace(/app\.get\('\/\^\\\/api\\\/showroom\\\/meshes\\\/\(\.\*\)\$\/'/g, "app.get(/^\\/api\\/showroom\\/meshes\\/(.*)$/");


fs.writeFileSync('server.js', code);
console.log('Fixed to actual regex objects');
