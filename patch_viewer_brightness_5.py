import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# MTLLoader sets the map! Why doesn't the Mesh have it?
# In the `isObj` flow, we are parsing the obj string using objLoader:
# const obj = objLoader.parse(text);

# Oh! I see what happened. SketchUp's `OBJLoader` requires `materials` (the creator) to have its materials created BEFORE parsing the OBJ.
# Wait, look at how the materials are loaded:

# mtlLoader.load(mtlUrl, function(materials) {
#   materials.preload();
#   const objLoader = new OBJLoader(manager);
#   objLoader.setMaterials(materials);
#   const fileLoader = new THREE.FileLoader(manager);
#   fileLoader.load(urlData.url, function(text) {
#     ...
#     const obj = objLoader.parse(text);

# Wait, `objLoader.parse(text)` works... but `MTLLoader` creates materials.
# Wait, why are all `m.map` undefined? Let's trace back to the logs.
# "==== MTL MATERIALS PRELOAD ====" did NOT print.
# This means the code inside `mtlLoader.load` or the debug block never ran or wasn't printed?
# Wait, let me check the logs again...
# Ah, it DID print before I shortened the output!
