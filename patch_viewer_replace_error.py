import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# The user is getting `Cannot read properties of undefined (reading 'set')` at `mesh.material.color.set(0xffffff)`.
# Why? Because in OBJ files, `mesh.material` is an Array of materials! `Array.isArray(child.material)`.
# So `mesh.material.color` is `undefined`.
# We need to iterate over the material array when applying new textures.

def replace_material_assignment(code):
    return re.sub(
        r'mesh\.material\.map = (.*?);\n\s*mesh\.material\.color\.set\(0xffffff\);\n\s*mesh\.material\.needsUpdate = true;',
        r'''const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach(m => {
                        m.map = \1;
                        if (m.color) m.color.setHex(0xffffff);
                        m.needsUpdate = true;
                    });''',
        code
    )

content = replace_material_assignment(content)

# We also need to fix `qpTappedMesh` logic:
content = re.sub(
        r'qpTappedMesh\.material\.map = (.*?);\n\s*qpTappedMesh\.material\.color\.set\(0xffffff\);\n\s*qpTappedMesh\.material\.needsUpdate = true;',
        r'''const tappedMats = Array.isArray(qpTappedMesh.material) ? qpTappedMesh.material : [qpTappedMesh.material];
                tappedMats.forEach(m => {
                    m.map = \1;
                    if (m.color) m.color.setHex(0xffffff);
                    m.needsUpdate = true;
                });''',
        content
    )

with open(viewer_file, 'w') as f:
    f.write(content)
