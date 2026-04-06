const fs = require('fs');
let content = fs.readFileSync('public/js/viewer.js', 'utf8');

// Add global exposure of setupTexturePanel right after initMaterialManager is defined,
// so e2e tests can trigger it without needing a valid GLB to finish loading.
const target = `    window.setupTexturePanel = () => initMaterialManager(jobCode, initialRoom);`;
const after = `function initMaterialManager(jobCode, room) {`;

content = content.replace(after, after + '\n' + target);

fs.writeFileSync('public/js/viewer.js', content);
