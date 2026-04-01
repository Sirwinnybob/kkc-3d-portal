import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's completely override materials in MTLLoader to test if it's the MTL parser skipping maps.
# Wait, look at the MTL:
# newmtl Walnut
# Ka 0.000000 0.000000 0.000000
# Kd 0.223529 0.156863 0.101961
# Ks 0.330000 0.330000 0.330000
# map_Kd f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg

# The MTLLoader SHOULD see map_Kd!
# Why doesn't `materials.materials` have the map assigned?
# Ah! MTLLoader only creates the materials *lazily* by default in some versions of Three.js.
# Wait, `materials.preload()` does exactly that: it creates the materials.
# But it does so lazily if they aren't instantiated? No, preload instantiates them all.

# Wait, `materials` is a `MTLLoader.MaterialCreator` object.
# Let's manually inspect its internal AST representation!
old_debug = """                    // DEBUG MTL
                    console.error("==== MTL MATERIALS PRELOAD ====");
                    console.error("Keys: ", Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error("MTL material name:", m.name, "Has map:", !!m.map);
                        if (m.map) {
                            console.error("Map src:", m.map.image ? m.map.image.src : m.map.name);
                        }
                    });"""

new_debug = """                    // DEBUG MTL
                    console.error("==== MTL MATERIALS PRELOAD ====");
                    console.error("materialsInfo: ", JSON.stringify(materials.materialsInfo));
                    console.error("Keys: ", Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error("MTL material name:", m.name, "Has map:", !!m.map);
                        if (m.map) {
                            console.error("Map src:", m.map.image ? m.map.image.src : m.map.name);
                        }
                    });"""

content = content.replace(old_debug, new_debug)

with open(viewer_file, 'w') as f:
    f.write(content)
