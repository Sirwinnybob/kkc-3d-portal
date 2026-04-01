const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

const target2 = `                } else if (dirent.name.toLowerCase().endsWith('.glb')) {
                    const isRoot = dir === jobPath;`;
const replacement2 = `                } else if (dirent.name.toLowerCase().endsWith('.glb')) {
                    const lowerName = dirent.name.toLowerCase();
                    if (lowerName.endsWith('_medium.glb') || lowerName.endsWith('_low.glb')) continue;
                    const isRoot = dir === jobPath;`;

content = content.replace(target2, replacement2);

fs.writeFileSync('server.js', content);
