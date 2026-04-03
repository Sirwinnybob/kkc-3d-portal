const fs = require('fs');
let content = fs.readFileSync('public/js/viewer.js', 'utf-8');

// 1. Update initMaterialManager definition
content = content.replace(/function initMaterialManager\(\) \{/, 'function initMaterialManager(jobCode, room) {');

// 2. Remove redundant URL param checks inside initMaterialManager and use the passed parameters instead
content = content.replace(
    /const urlParams = new URLSearchParams\(window\.location\.search\);\n\s+const jobCode = urlParams\.get\('job'\);\n\s+const room = urlParams\.get\('room'\);/,
    "// Use jobCode and room passed from main init() scope, ensuring fallback to dynamically resolved initialRoom"
);

// 3. Update the 4 calls to initMaterialManager to pass jobCode and initialRoom
content = content.replace(/window\.setupTexturePanel = initMaterialManager;/g, "window.setupTexturePanel = () => initMaterialManager(null, null);");
content = content.replace(/initMaterialManager\(\);/g, "initMaterialManager(jobCode, initialRoom);");

fs.writeFileSync('public/js/viewer.js', content, 'utf-8');
