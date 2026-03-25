const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// The function declaration for doors/split was removed, but the body was left behind causing top-level await errors!
// Let's delete from `if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });` to `// --- ERROR HANDLING ---`

const idx1 = code.indexOf(`if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });`);
const idx2 = code.indexOf(`// --- ERROR HANDLING ---`);

if (idx1 !== -1 && idx2 !== -1) {
    code = code.substring(0, idx1) + code.substring(idx2);
    fs.writeFileSync('server.js', code);
    console.log('Successfully removed the body of doors/split');
} else {
    console.log('Could not find indices');
}
