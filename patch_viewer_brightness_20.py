import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# I see it clearly now!
# `Manual MTL Parse Check` DID NOT PRINT ANY TEXTURES.
# Why? `if (info.map_kd) {`
# The property in Three.js is `map_kd` (lowercase)?
# Let's check `materialsInfo`:
# `{"Walnut":{"name":"Walnut","ka":[0,0,0],"kd":[0.223529,0.156863,0.101961],"ks":[0.33,0.33,0.33],"map_kd":"f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg"}`
# Yes! `map_kd` is populated.
# But my patch was:
#                     if (info.map_kd) {
#                         const texUrl = mtlDir + info.map_kd;
#                         console.error(`Material ${matName} has map_kd: ${info.map_kd} -> loading manually from ${texUrl}`);
# It DID print! Look at the top of the verify.log from a few steps ago:
# `[error] Material Walnut has map_kd: f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg -> loading manually from /jobs/002/f744bca2-2784-4b18-9e27-5009e6b5c9e3/Walnut.jpg`
# Wait, if it DID print, and the texture DID load...
# Why did `Object.values(materials.materials).forEach(m => console.log("Has map:", !!m.map))` say `false` in the logs?
# Ah! `MTLLoader` is lazy. If I override `materials.materials[matName]`, it still gets overridden by `OBJLoader.setMaterials(materials)` because `OBJLoader` calls `materials.create(matName)` directly, which creates a NEW material and overwrites my map because the internal `MTLLoader.TextureLoader` doesn't load it!

# So the actual fix is: after `OBJLoader` creates the mesh, we iterate over the meshes, check `materials.materialsInfo`, and apply the map manually to the mesh's material!

old_manual = """                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;
                    loadedModel = model;"""

new_manual = """                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;
                    loadedModel = model;

                    // Force texture application because MTLLoader sometimes drops them or loses the URLModifier
                    model.traverse(child => {
                        if (child.isMesh && child.material) {
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach(m => {
                                const info = materials.materialsInfo[m.name];
                                if (info && info.map_kd && !m.map) {
                                    const texUrl = mtlDir + info.map_kd;
                                    const tex = new THREE.TextureLoader().load(texUrl, (loadedTex) => {
                                        m.map = loadedTex;
                                        m.map.colorSpace = THREE.SRGBColorSpace;
                                        m.map.wrapS = THREE.RepeatWrapping;
                                        m.map.wrapT = THREE.RepeatWrapping;
                                        m.color.setHex(0xffffff);
                                        if (m.emissive) m.emissive.setHex(0x000000);
                                        if (m.specular) m.specular.setHex(0x111111);
                                        m.needsUpdate = true;
                                    });
                                }
                            });
                        }
                    });"""

content = content.replace(old_manual, new_manual)

with open(viewer_file, 'w') as f:
    f.write(content)
