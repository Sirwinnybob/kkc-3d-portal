import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's inspect MTLLoader material assignments. Why is it assigning materials with no maps?
# The answer is likely in how MTLLoader handles textures. When it preloads, it parses the string.
# Let's add logging around `objLoader.parse(text)`.
old_parse = """                    const obj = objLoader.parse(text);"""
new_parse = """                    console.error("==== MTL DUMP ====");
                    console.error(Object.keys(materials.materials));
                    Object.values(materials.materials).forEach(m => {
                        console.error(`MTL: ${m.name}, map: ${!!m.map}`);
                    });

                    const obj = objLoader.parse(text);"""

content = content.replace(old_parse, new_parse)

with open(viewer_file, 'w') as f:
    f.write(content)
