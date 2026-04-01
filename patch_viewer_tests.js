const fs = require('fs');
let code = fs.readFileSync('e2e_tests/viewer.spec.js', 'utf8');
code = code.replace("window.localStorage.setItem('kkc_help_shown', 'true');", "window.localStorage.setItem('kkc_help_shown', 'true');\n            window.localStorage.setItem('kkc_tutorial_v1', 'true');");
fs.writeFileSync('e2e_tests/viewer.spec.js', code);
