const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// In processQueue
code = code.replace(
    'const dir = path.dirname(filePath);\n    const roomName = path.basename(dir);',
    'const dir = path.dirname(filePath);\n    const roomName = path.basename(filePath, \'.dae\'); // Keep original dae name'
);

// In convertDesign
code = code.replace(
    'const roomDir = path.dirname(filePath);\n    const roomName = path.basename(roomDir);',
    'const roomDir = path.dirname(filePath);\n    const roomName = path.basename(filePath, \'.dae\'); // Keep original dae name'
);

// Wait, the user might be referring to STAGING_DIR watcher!
// Let's check if the user is using the old code or if they are just doing something weird.
fs.writeFileSync('server.js', code);
