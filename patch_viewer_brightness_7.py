import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's inspect MTLLoader. It actually creates materials when it parses.
# Wait, let's look at MTLLoader.js documentation...
# SketchUp `map_Kd` lines are often weird.
# Look at our `.mtl` again:
# map_Kd f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg
# Wait! SketchUp output `map_Kd f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg`
# The `.mtl` URL is `http://localhost:5025/jobs/002/f744bca2-2784-4b18-9e27-5009e6b5c9e3.mtl`.
# If `resourcePath` is `http://localhost:5025/jobs/002/`, then the URL it constructs is:
# `http://localhost:5025/jobs/002/f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg`
# This matches our network request exactly, which returned 200!
# SO WHY IS `m.map` UNDEFINED in our debug log???
#
# "MTL materials created:" should be printing from our `mtlLoader.load` callback!
