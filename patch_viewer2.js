const fs = require('fs');
let content = fs.readFileSync('public/js/viewer.js', 'utf8');
content = content.replace("window.addEventListener('resize', onWindowResize);\n            animate();", "engine.start();");
fs.writeFileSync('public/js/viewer.js', content);
