import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's inspect how GLTF loads textures.
# `child.material = new THREE.MeshLambertMaterial({ ... })`
# It entirely replaces the material instance to ensure stability.
# Why don't we just do the same for OBJ?
old_obj_traverse = """                    // Force texture application because MTLLoader sometimes drops them or loses the URLModifier
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

new_obj_traverse = """                    // Force texture application and convert to MeshLambertMaterial for rendering stability
                    model.traverse(child => {
                        if (child.isMesh && child.material) {
                            const prevMats = Array.isArray(child.material) ? child.material : [child.material];
                            const newMats = prevMats.map(prevMat => {
                                const newMat = new THREE.MeshLambertMaterial({
                                    map: prevMat.map,
                                    color: prevMat.color,
                                    transparent: prevMat.transparent,
                                    opacity: prevMat.opacity,
                                    side: THREE.DoubleSide,
                                    polygonOffset: true,
                                    polygonOffsetFactor: 1,
                                    polygonOffsetUnits: 1,
                                    name: prevMat.name || 'Material'
                                });

                                const info = materials.materialsInfo[prevMat.name];
                                if (info && info.map_kd) {
                                    // It should have a texture, but might have been dropped or failed due to URL issues.
                                    // We will load it manually.
                                    const texUrl = mtlDir + info.map_kd;
                                    newMat.map = new THREE.TextureLoader().load(texUrl, (loadedTex) => {
                                        loadedTex.colorSpace = THREE.SRGBColorSpace;
                                        loadedTex.wrapS = THREE.RepeatWrapping;
                                        loadedTex.wrapT = THREE.RepeatWrapping;
                                        newMat.map = loadedTex;
                                        // Counteract SketchUp's dark diffuse values for textured materials
                                        newMat.color.setHex(0xffffff);
                                        newMat.needsUpdate = true;
                                    });
                                    // Temporarily set to white while loading to avoid black flash
                                    newMat.color.setHex(0xffffff);
                                } else if (newMat.map) {
                                    newMat.map.colorSpace = THREE.SRGBColorSpace;
                                    newMat.map.wrapS = THREE.RepeatWrapping;
                                    newMat.map.wrapT = THREE.RepeatWrapping;
                                    newMat.color.setHex(0xffffff);
                                }

                                return newMat;
                            });

                            child.material = Array.isArray(child.material) ? newMats : newMats[0];
                        }
                    });"""

content = content.replace(old_obj_traverse, new_obj_traverse)

with open(viewer_file, 'w') as f:
    f.write(content)
