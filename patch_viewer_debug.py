import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Add a line to expose scene and detectedMaterials to the window object so playwright can access them
old_decl = "let scene, camera, renderer, controls, composer, kkcShader, fxaaPass;"
new_decl = """let scene, camera, renderer, controls, composer, kkcShader, fxaaPass;
window.scene = scene;
window.detectedMaterials = detectedMaterials;
"""

content = content.replace(old_decl, new_decl)

# Actually assign them after they are created
old_scene_add = "scene = new THREE.Scene();"
new_scene_add = "scene = new THREE.Scene(); window.scene = scene; window.detectedMaterials = detectedMaterials;"

content = content.replace(old_scene_add, new_scene_add)

with open(viewer_file, 'w') as f:
    f.write(content)
