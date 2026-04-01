import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's fix the texture darkening and also the material mapping.
# It turns out MTLLoader is likely creating `MeshPhongMaterial` by default,
# and then later when `viewer.js` does `child.material = new THREE.MeshLambertMaterial(...)`
# in the standard loading block, it's losing the map! Oh wait, `isObj` handles things differently.
# In `isObj`, we are doing:
#  mat.color.setHex(0xffffff);

# Wait, `objLoader.parse(text)` returns the object hierarchy.
# Then we iterate:
old_traverse = """                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Keep the material created by MTLLoader, but adjust properties
                            const mats = Array.isArray(child.material) ? child.material : [child.material];

                            mats.forEach(mat => {
                                mat.side = THREE.DoubleSide;
                                mat.polygonOffset = true;
                                mat.polygonOffsetFactor = 1;
                                mat.polygonOffsetUnits = 1;

                                if (mat.map) {"""

new_traverse = """                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Ensure UVs exist, otherwise textures won't render
                            if (!child.geometry.attributes.uv) {
                                console.warn("No UV map on " + child.name);
                            }

                            // Keep the material created by MTLLoader, but adjust properties
                            const mats = Array.isArray(child.material) ? child.material : [child.material];

                            mats.forEach(mat => {
                                mat.side = THREE.DoubleSide;
                                mat.polygonOffset = true;
                                mat.polygonOffsetFactor = 1;
                                mat.polygonOffsetUnits = 1;

                                // MTL files often use map_Kd, which becomes map
                                // Or map_Ka, which becomes map, etc.
                                // If it has a map, enforce white base color.
                                if (mat.map) {"""

content = content.replace(old_traverse, new_traverse)

with open(viewer_file, 'w') as f:
    f.write(content)
