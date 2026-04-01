import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

old_manual = """                                    const texUrl = mtlDir + info.map_kd;
                                    newMat.map = new THREE.TextureLoader().load(texUrl, (loadedTex) => {
                                        loadedTex.colorSpace = THREE.SRGBColorSpace;
                                        loadedTex.wrapS = THREE.RepeatWrapping;
                                        loadedTex.wrapT = THREE.RepeatWrapping;
                                        newMat.map = loadedTex;
                                        // Counteract SketchUp's dark diffuse values for textured materials
                                        newMat.color.setHex(0xffffff);
                                        newMat.needsUpdate = true;
                                    });"""

new_manual = """                                    const texUrl = mtlDir + info.map_kd;
                                    newMat.map = new THREE.TextureLoader().load(texUrl, (loadedTex) => {
                                        loadedTex.colorSpace = THREE.SRGBColorSpace;
                                        loadedTex.wrapS = THREE.RepeatWrapping;
                                        loadedTex.wrapT = THREE.RepeatWrapping;
                                        newMat.map = loadedTex;
                                        // Counteract SketchUp's dark diffuse values for textured materials
                                        newMat.color.setHex(0xffffff);
                                        newMat.needsUpdate = true;
                                    });"""

# Actually, the conversion to MeshLambertMaterial I did earlier looks completely correct.
# Why is it rendering black?
# Maybe MeshLambertMaterial doesn't work well without `scene.add(new THREE.HemisphereLight())`?
# Wait, GLTF files use MeshLambertMaterial and they look perfectly fine.
# But GLTF creates Lambert materials via:
# new THREE.MeshLambertMaterial({ map: prevMat.map, color: prevMat.map ? 0xffffff : prevMat.color, ... })
# Let's check my conversion code for OBJ:
# const newMat = new THREE.MeshLambertMaterial({
#     map: prevMat.map,
#     color: prevMat.color,
#     ...

# If the `texUrl` is manually loaded, `prevMat.map` is null during initialization!
# If `prevMat.map` is null, `newMat.color` stays as `prevMat.color`.
# What is `prevMat.color`? Dark brown (almost black)!
# When the image finishes loading, I do `newMat.color.setHex(0xffffff); newMat.needsUpdate = true;`
# This SHOULD make it white.
# But wait! I also have:
# `// Temporarily set to white while loading to avoid black flash`
# `newMat.color.setHex(0xffffff);`
# This happens synchronously!

# Let's verify what `FrontColor` does. `FrontColor` is solid white. Does it render correctly?
# The user said: "there are solid color faces in the model on purpose. the faces that use walnut are the minority. but they are rendering complete black and the texture is not visible."
# Wait, "rendering complete black". Is it possible they are upside down (backface culling)?
# I set `side: THREE.DoubleSide`. They should be visible from both sides.

# Let's test the screenshot output.
