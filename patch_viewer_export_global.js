const fs = require('fs');
let content = fs.readFileSync('public/js/viewer.js', 'utf8');

// The e2e test uses window.setupTexturePanel, so we should make it available globally always
const str1 = 'function initMaterialManager(jobCode, room) {';
const str2 = 'window.setupTexturePanel = (job, room) => initMaterialManager(job, room);\nfunction initMaterialManager(jobCode, room) {';

content = content.replace(str1, str2);

fs.writeFileSync('public/js/viewer.js', content);
