import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# MTLLoader sets up `materials.materials['Walnut'].map`, but let's check what it actually parsed!
old_file_loader = """                    // DEBUG MTL
                    console.error("==== MTL MATERIALS PRELOAD ====");
                    console.error("Keys: ", Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error(`MTL: ${m.name}, Has Map: ${!!m.map}, src: ${m.map ? m.map.image ? m.map.image.src : m.map.name : 'N/A'}`);
                    });"""

new_file_loader = """                    // DEBUG MTL
                    console.error("==== MTL MATERIALS PRELOAD ====");
                    console.error("Keys: ", Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error(`MTL: ${m.name}, Has Map: ${!!m.map}`);
                        if (m.map) {
                            console.error(`  - map object keys: ${Object.keys(m.map)}`);
                            console.error(`  - map source / image: ${m.map.source ? 'yes' : 'no'} / ${m.map.image ? 'yes' : 'no'}`);
                        }
                    });"""

content = content.replace(old_file_loader, new_file_loader)

with open(viewer_file, 'w') as f:
    f.write(content)
