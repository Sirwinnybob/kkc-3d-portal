import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's fix the texture darkening by setting color to white if map exists.
old_mat_block = """                                if (mat.map) {
                                    mat.color.set(0xffffff);
                                    mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                                    mat.map.magFilter  = THREE.LinearFilter;
                                }"""

new_mat_block = """                                if (mat.map) {
                                    // SketchUp MTLs often set dark Kd values which multiply with the texture map,
                                    // making them look black/blank. Force the diffuse color to pure white.
                                    mat.color.setHex(0xffffff);
                                    mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                                    mat.map.magFilter  = THREE.LinearFilter;
                                    // Also clear any emission/specular darkening to be safe
                                    if (mat.emissive) mat.emissive.setHex(0x000000);
                                    if (mat.specular) mat.specular.setHex(0x111111);
                                }"""

content = content.replace(old_mat_block, new_mat_block)

with open(viewer_file, 'w') as f:
    f.write(content)
