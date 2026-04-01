import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# If `Has Map: true` and `Color: #ffffff` and `ColorSpace: srgb`, then WHY is it not rendering?
# Are the UV coordinates correctly parsed by OBJLoader?
# Oh wait... SketchUp sometimes creates extremely large or small UV mapping scales.
# Does Three.js need `mat.map.wrapS = THREE.RepeatWrapping; mat.map.wrapT = THREE.RepeatWrapping;`?
# In GLTFLoader, it usually defaults correctly, but OBJLoader might not!
# And earlier in `viewer.js` (for GLB logic) I saw:
# `tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;`
# Let's apply that to the `OBJLoader` materials.

old_wrap = """                                if (mat.map) {
                                    // SketchUp MTLs often set dark Kd values which multiply with the texture map,
                                    // making them look black/blank. Force the diffuse color to pure white.
                                    mat.color.setHex(0xffffff);
                                    mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                                    // Three.js colorspace issue on older objs - ensure sRGB
                                    mat.map.colorSpace = THREE.SRGBColorSpace;
                                    mat.map.magFilter  = THREE.LinearFilter;"""

new_wrap = """                                if (mat.map) {
                                    // SketchUp MTLs often set dark Kd values which multiply with the texture map,
                                    // making them look black/blank. Force the diffuse color to pure white.
                                    mat.color.setHex(0xffffff);
                                    mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                                    // Three.js colorspace issue on older objs - ensure sRGB
                                    mat.map.colorSpace = THREE.SRGBColorSpace;
                                    mat.map.magFilter  = THREE.LinearFilter;
                                    mat.map.wrapS = THREE.RepeatWrapping;
                                    mat.map.wrapT = THREE.RepeatWrapping;"""

content = content.replace(old_wrap, new_wrap)

with open(viewer_file, 'w') as f:
    f.write(content)
