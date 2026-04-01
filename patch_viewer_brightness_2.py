import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Ah! Look closely at the console output above.
# The OBJ loader assigns materials directly. Notice how they ALL have `Has Map: false`!
# Let's see what MTLLoader actually sets up.

old_file_loader = """                    const obj = objLoader.parse(text);
                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;
                    loadedModel = model;"""

new_file_loader = """                    const obj = objLoader.parse(text);
                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;
                    loadedModel = model;

                    // DEBUG MTL
                    console.error("==== MTL MATERIALS PRELOAD ====");
                    console.error("Keys: ", Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error(`MTL: ${m.name}, Has Map: ${!!m.map}, src: ${m.map ? m.map.image ? m.map.image.src : m.map.name : 'N/A'}`);
                    });"""

content = content.replace(old_file_loader, new_file_loader)

with open(viewer_file, 'w') as f:
    f.write(content)
