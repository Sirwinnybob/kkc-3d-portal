import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's fix the texture darkening and also the material mapping.
old_traverse = """                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Keep the material created by MTLLoader, but adjust properties
                            const mats = Array.isArray(child.material) ? child.material : [child.material];

                            mats.forEach(mat => {
                                mat.side = THREE.DoubleSide;
                                mat.polygonOffset = true;
                                mat.polygonOffsetFactor = 1;
                                mat.polygonOffsetUnits = 1;

                                if (mat.map) {"""

new_traverse = """                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Keep the material created by MTLLoader, but adjust properties
                            const mats = Array.isArray(child.material) ? child.material : [child.material];

                            mats.forEach(mat => {
                                mat.side = THREE.DoubleSide;
                                mat.polygonOffset = true;
                                mat.polygonOffsetFactor = 1;
                                mat.polygonOffsetUnits = 1;

                                // MTL files often use map_Kd, which becomes map
                                // Or map_Ka, which becomes map, etc.
                                // If it has a map, enforce white base color.
                                if (mat.map) {
                                    // SketchUp MTLs often set dark Kd values which multiply with the texture map,
                                    // making them look black/blank. Force the diffuse color to pure white.
                                    mat.color.setHex(0xffffff);
                                    mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                                    // Three.js colorspace issue on older objs - ensure sRGB
                                    mat.map.colorSpace = THREE.SRGBColorSpace;
                                    mat.map.magFilter  = THREE.LinearFilter;

                                    // Also clear any emission/specular darkening to be safe
                                    if (mat.emissive) mat.emissive.setHex(0x000000);
                                    if (mat.specular) mat.specular.setHex(0x111111);

                                    mat.needsUpdate = true;
                                }"""

content = content.replace(old_traverse, new_traverse)

with open(viewer_file, 'w') as f:
    f.write(content)
