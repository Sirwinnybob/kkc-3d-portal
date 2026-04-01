import re

auth_file = 'middleware/jobsAuth.js'

with open(auth_file, 'r') as f:
    content = f.read()

# Add only extensions
content = content.replace("['.glb', '.jpg', '.png', '.jpeg', '.obj', '.mtl']", "['.glb', '.jpg', '.png', '.jpeg', '.obj', '.mtl', '.bmp', '.tga', '.tif', '.tiff', '.webp']")

with open(auth_file, 'w') as f:
    f.write(content)
