import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# If `URLModifier input:` is NOT PRINTING AT ALL, it means the LoadingManager `URLModifier` is NOT being called.
# Why? Because MTLLoader doesn't use the manager's URLModifier for loading texture images if we don't pass the manager down to the internal TextureLoader, or because MTLLoader logic changed in newer three.js versions?
# Let's override `THREE.TextureLoader.prototype.load` directly or see if we can use `manager` correctly.
# Wait! In `three.module.js:43500`, we saw:
# `three.module.js:43500 Fetch finished loading: GET "https://.../.mtl"`
# And earlier we saw:
# `Fetch finished loading: GET "https://3dportal.kustomkraftcabinets.ddns.net/jobs/002/6ef73686-c678-4dca-a39a-478d97d6cbfb/Walnut.jpg"`
# WHICH MEANS THE IMAGE LOADED!

# So why did MTLLoader NOT create a map on the material?
# Let's look at MTLLoader.js code (we can download or inspect it from our own node_modules if we had it, but we load it via CDN).
# The MTL file says `map_Kd ...`
# The material HAS NO MAP. `!!m.map` is false!
# Does MTLLoader ignore `map_Kd`?
# Let's test standard THREE.js MTLLoader by overriding `materials.preload()` behavior.

old_mtl = """            mtlLoader.load(mtlUrl, function(materials) {"""
new_mtl = """            mtlLoader.load(mtlUrl, function(materials) {
                // Manually parse materials to ensure textures are mapped
                console.error("Manual MTL Parse Check");
                for (const matName in materials.materialsInfo) {
                    const info = materials.materialsInfo[matName];
                    if (info.map_kd) {
                        const texUrl = mtlDir + info.map_kd;
                        console.error(`Material ${matName} has map_kd: ${info.map_kd} -> loading manually from ${texUrl}`);
                        const tex = new THREE.TextureLoader().load(texUrl);
                        tex.colorSpace = THREE.SRGBColorSpace;

                        // We must create the material first if not exists
                        let m = materials.materials[matName];
                        if (!m) {
                            m = new THREE.MeshPhongMaterial({ name: matName });
                            materials.materials[matName] = m;
                        }
                        m.map = tex;
                        m.color.setHex(0xffffff);
                        if (m.emissive) m.emissive.setHex(0x000000);
                        if (m.specular) m.specular.setHex(0x111111);
                        m.needsUpdate = true;
                    }
                }
"""

content = content.replace(old_mtl, new_mtl)

with open(viewer_file, 'w') as f:
    f.write(content)
