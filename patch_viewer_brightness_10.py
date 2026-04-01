import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Wait, `materials` has `materialsInfo` (which is the raw parsed strings) and `materials` (the instantiated objects).
# Does `materialsInfo` have `map_kd`?
old_debug = """                    console.error("==== MTL DUMP ====");
                    console.error(Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error(`MTL: ${m.name}, map: ${!!m.map}`);
                    });"""

new_debug = """                    console.error("==== MTL DUMP ====");
                    console.error("materialsInfo: ", JSON.stringify(materials.materialsInfo));"""

content = content.replace(old_debug, new_debug)

with open(viewer_file, 'w') as f:
    f.write(content)
