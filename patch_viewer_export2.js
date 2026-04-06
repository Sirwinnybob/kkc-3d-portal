const fs = require('fs');
let content = fs.readFileSync('public/js/viewer.js', 'utf8');

// In initMaterialManager, we set `materialManager = new MaterialManager(...)`
// But does it run?
