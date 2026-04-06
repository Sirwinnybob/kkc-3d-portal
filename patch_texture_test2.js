const fs = require('fs');
let content = fs.readFileSync('e2e_tests/texture.spec.js', 'utf8');

// The click test assumes the button click actually opens the panel.
// But the button listener in viewer.js might not be hooked up.
// Let's check where the button listener is hooked up.
