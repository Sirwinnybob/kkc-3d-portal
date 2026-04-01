import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Need to fix the solid colors too.
content = re.sub(
    r'mesh\.material\.map = null;\n\s*mesh\.material\.color\.copy\(color\);\n\s*mesh\.material\.needsUpdate = true;',
    r'''const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => {
            m.map = null;
            if (m.color) m.color.copy(color);
            m.needsUpdate = true;
        });''',
    content
)

content = re.sub(
    r'qpTappedMesh\.material\.map = null;\n\s*qpTappedMesh\.material\.color\.copy\(color\);\n\s*qpTappedMesh\.material\.needsUpdate = true;',
    r'''const tappedMats = Array.isArray(qpTappedMesh.material) ? qpTappedMesh.material : [qpTappedMesh.material];
        tappedMats.forEach(m => {
            m.map = null;
            if (m.color) m.color.copy(color);
            m.needsUpdate = true;
        });''',
    content
)

with open(viewer_file, 'w') as f:
    f.write(content)
