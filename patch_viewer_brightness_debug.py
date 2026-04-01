import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's add simple logging right when MTLLoader finishes loading
old_mtl = "            mtlLoader.load(mtlUrl, function(materials) {"
new_mtl = """            mtlLoader.load(mtlUrl, function(materials) {
                console.log("MTL loaded!");
                materials.preload();
                console.log("MTL materials created:", Object.keys(materials.materials));
                Object.values(materials.materials).forEach(m => {
                    console.log("MTL material name:", m.name, "Has map:", !!m.map);
                    if (m.map) {
                        console.log("Map src:", m.map.image ? m.map.image.src : m.map.name);
                    }
                });"""

content = content.replace(old_mtl, new_mtl)

with open(viewer_file, 'w') as f:
    f.write(content)
