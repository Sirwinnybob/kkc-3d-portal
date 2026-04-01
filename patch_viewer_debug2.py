import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's add them inside the init function
old_init = "async function init() {"
new_init = """async function init() {
    window.getScene = () => scene;
    window.getMaterials = () => detectedMaterials;
"""
content = content.replace(old_init, new_init)

with open(viewer_file, 'w') as f:
    f.write(content)
