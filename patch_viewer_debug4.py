import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's add simple alert/log right when objLoader finishes
old_file_loader = """                    const obj = objLoader.parse(text);
                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;"""

new_file_loader = """                    const obj = objLoader.parse(text);
                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;

                    console.error("====== PARSED OBJ ======");
                    model.traverse(child => {
                        if (child.isMesh && child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => {
                                    if (m.map) console.error("Found map on " + child.name + " -> " + m.name + ": " + (m.map.image ? m.map.image.src : 'no image object'));
                                });
                            } else {
                                if (child.material.map) console.error("Found map on " + child.name + " -> " + child.material.name + ": " + (child.material.map.image ? child.material.map.image.src : 'no image object'));
                            }
                        }
                    });"""

content = content.replace(old_file_loader, new_file_loader)

with open(viewer_file, 'w') as f:
    f.write(content)
