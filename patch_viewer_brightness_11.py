import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Oh, looking at MTLLoader documentation again. `preload()` returns a `MaterialCreator` object, and `materials.materials` is just a generic object that contains basic material parameters, not the actual THREE.Material instances!
# The actual THREE.Material instances are created by `materials.create(materialName)` or via `objLoader.setMaterials(materials)` which calls `materials.create` internally.
# Wait, `objLoader.setMaterials` intercepts the materials.
# But WHY are they not getting mapped?
# Look at our previous patch:
# // Keep the material created by MTLLoader, but adjust properties
# const mats = Array.isArray(child.material) ? child.material : [child.material];
# mats.forEach(mat => {
#    if (mat.map) { // <--- Wait, in our log, child.material.map WAS false for all of them!

# If `child.material.map` is false, it means `OBJLoader` created a `MeshPhongMaterial` WITHOUT a map.
# Why would `MTLLoader` generate a material without a map if the .mtl has `map_Kd`?
# BECAUSE `MTLLoader` failed to load the image, maybe?
# Let's add logging inside the `URLModifier` we added earlier.
old_modifier = """            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
                // Ignore data URIs or already-resolved URLs
                if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;

                // Fix Windows backslashes sometimes exported by SketchUp
                let cleanUrl = url.replace(/\\\\/g, '/');

                // Encode hash characters (#) so they aren't parsed as URL fragments
                cleanUrl = cleanUrl.replace(/#/g, '%23');
                cleanUrl = cleanUrl.replace(/\\?/g, '%3F');

                return cleanUrl;
            });"""

new_modifier = """            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
                console.error("URLModifier input:", url);
                // Ignore data URIs or already-resolved URLs
                if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) {
                    console.error("URLModifier skipped:", url);
                    return url;
                }

                // Fix Windows backslashes sometimes exported by SketchUp
                let cleanUrl = url.replace(/\\\\/g, '/');

                // Encode hash characters (#) so they aren't parsed as URL fragments
                cleanUrl = cleanUrl.replace(/#/g, '%23');
                cleanUrl = cleanUrl.replace(/\\?/g, '%3F');

                console.error("URLModifier output:", cleanUrl);
                return cleanUrl;
            });

            manager.onError = function ( url ) {
                console.error( 'There was an error loading ' + url );
            };"""

content = content.replace(old_modifier, new_modifier)

with open(viewer_file, 'w') as f:
    f.write(content)
