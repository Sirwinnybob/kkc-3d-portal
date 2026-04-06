const fs = require('fs');

// Patch viewer.js: missing `initMaterialManager` exposure. We removed it during the core extraction cleanup. Let's make sure it's accessible or defined.
let viewerContent = fs.readFileSync('public/js/viewer.js', 'utf8');

// Looking at public/js/viewer.js:
// Is `initMaterialManager` still defined? Yes, it is in `viewer.js`. Let's ensure it's exposed correctly for showroom mode.
// Wait, `setupTexturePanel` is exposed inside `isShowroomMode`:
// window.setupTexturePanel = () => initMaterialManager(null, null);
