const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');

const target1 = `            } else if (entry.name.toLowerCase().endsWith('.glb')) {`;
const replacement1 = `            } else if (entry.name.toLowerCase().endsWith('.glb')) {
                const lowerName = entry.name.toLowerCase();
                if (lowerName.endsWith('_medium.glb') || lowerName.endsWith('_low.glb')) return;`;

const newContent = content.replace(target1, replacement1);

fs.writeFileSync('server.js', newContent);
