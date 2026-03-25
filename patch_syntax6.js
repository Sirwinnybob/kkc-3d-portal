const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// I replaced `// POST /api/showroom/doors/split...` but left the entire body and argument validation!
// Let's delete from line 1610 to `// --- ERROR HANDLING ---`

const idx1 = code.indexOf(`    if (!file || !/^[a-zA-Z0-9\\-_ ]+\\.glb$/i.test(file))`);
const idx2 = code.indexOf(`// --- ERROR HANDLING ---`);

if (idx1 !== -1 && idx2 !== -1) {
    code = code.substring(0, idx1) + code.substring(idx2);
    fs.writeFileSync('server.js', code);
    console.log('Fixed orphan body of doors/split completely');
} else {
    console.log('Could not find indices');
}
