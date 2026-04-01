import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Ah! It DOES use `Walnut`! 6 times.
# Why didn't it show up in our logs?
# "Mesh: Mesh40 Model", "Material: FrontColor" was all I saw at the bottom.
# Oh, the console log was truncated because `child.name` was repeated?
# Let's do a pure `grep Walnut` on the `verify_textures_logged` output.
