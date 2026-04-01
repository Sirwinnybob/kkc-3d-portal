import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Remove the faulty "window.detectedMaterials = detectedMaterials" lines we added during debug
content = content.replace("window.detectedMaterials = detectedMaterials;\n", "")
content = content.replace("window.detectedMaterials = [];\nlet detectedMaterials = window.detectedMaterials;", "let detectedMaterials = [];")

with open(viewer_file, 'w') as f:
    f.write(content)
