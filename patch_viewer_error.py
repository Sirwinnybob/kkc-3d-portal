import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Fix the "Cannot access 'detectedMaterials' before initialization" error
old_init = "let detectedMaterials = [];"
new_init = "window.detectedMaterials = [];\nlet detectedMaterials = window.detectedMaterials;"

content = content.replace(old_init, new_init)

with open(viewer_file, 'w') as f:
    f.write(content)
