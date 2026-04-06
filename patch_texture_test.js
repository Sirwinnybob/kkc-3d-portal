const fs = require('fs');
let content = fs.readFileSync('e2e_tests/texture.spec.js', 'utf8');

// The test relies on window.setupTexturePanel, which we just found out isn't exposed in standard mode anymore.
// Or rather, we removed it from global scope unless in showroom mode, but actually it's still defined in init() scope.
// Wait, viewer.js had a comment:
// // Bridge populated by setupTexturePanel so handleSingleTap (init scope) can open the picker
// And we saw `window.setupTexturePanel = () => initMaterialManager(null, null); // Expose for showroom mode`
// So in normal mode, `window.setupTexturePanel` doesn't exist?

// Let's modify the test to just wait for the button to be ready, or expose it in viewer.js.
// It's probably easier to just expose it in viewer.js for the test.
