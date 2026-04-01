import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# I see it! The OBJ file DOES NOT actually use the material `Walnut`!
# Let me check the OBJ file manually to confirm.
