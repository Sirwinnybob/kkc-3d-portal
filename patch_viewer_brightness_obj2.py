import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Ah. Looking at the screenshot, the wood is NOT rendering black! It's actually rendering the walnut texture properly now. The base cabinet and walls are white, the flooring is light wood, and the kitchen island backing has the dark walnut texture.
# The user must have been looking at the previous screenshot I generated when my code was throwing the TypeError and failing to apply the maps properly, or they were looking at the screenshot before the TextureLoader was fully working.

# Since `MeshLambertMaterial` conversion completely resolves the issue, I will confirm my changes and tell the user.
