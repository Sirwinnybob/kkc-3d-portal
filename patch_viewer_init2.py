import re

with open('public/js/viewer.js', 'r') as f:
    content = f.read()

pattern = r"""                        if \(replaceAll\) \{
                            matGroup\.meshes\.forEach\(mesh => \{
                                const mats = Array\.isArray\(mesh\.material\) \? mesh\.material : \[mesh\.material\];
                                mats\.forEach\(m => \{
                                    m\.map = newTex;
                                    if \(m\.color\) m\.color\.setHex\(0xffffff\);
                                    m\.needsUpdate = true;
                                \}\);
                            \}\);
                            matGroup\.urlHigh = url;
                            matGroup\.urlMedium = urlMedium;
                            matGroup\.urlLow = urlLow;
                            matGroup\.currentLODUrl = url;
                            matGroup\.previewCache = null;
                        \} else if \(tappedMesh\) \{
                            const tappedMats = Array\.isArray\(tappedMesh\.material\) \? tappedMesh\.material : \[tappedMesh\.material\];
                            tappedMats\.forEach\(m => \{
                                m\.map = newTex;
                                if \(m\.color\) m\.color\.setHex\(0xffffff\);
                                m\.needsUpdate = true;
                            \}\);
                            matGroup\.hasPartialChange = true;
                        \}"""

replacement = r"""                        const targetMeshes = replaceAll ? matGroup.meshes : (tappedMesh ? [tappedMesh] : []);

                        targetMeshes.forEach(mesh => {
                            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                            mats.forEach(m => {
                                m.map = newTex;
                                if (m.color) m.color.setHex(0xffffff);
                                m.needsUpdate = true;

                                // Real-world scaling logic
                                if (realWidth !== undefined && realWidth !== null && realHeight !== undefined && realHeight !== null) {
                                    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                                    const box = mesh.geometry.boundingBox;

                                    const size = new THREE.Vector3();
                                    box.getSize(size);
                                    size.multiply(mesh.scale);

                                    // Use the two largest dimensions of the mesh's world size
                                    const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a,b) => b - a);
                                    const faceWidth = dims[1]; // Usually width
                                    const faceHeight = dims[0]; // Usually height

                                    // If scale is needed, repeat the texture based on face dimensions / texture dimensions
                                    // Make sure we don't divide by zero
                                    if (realWidth > 0 && realHeight > 0) {
                                        const repeatX = faceWidth / realWidth;
                                        const repeatY = faceHeight / realHeight;
                                        newTex.repeat.set(repeatX, repeatY);
                                    }
                                }
                            });
                        });

                        if (replaceAll) {
                            matGroup.urlHigh = url;
                            matGroup.urlMedium = urlMedium;
                            matGroup.urlLow = urlLow;
                            matGroup.width = realWidth;
                            matGroup.height = realHeight;
                            matGroup.currentLODUrl = url;
                            matGroup.previewCache = null;
                        } else if (tappedMesh) {
                            matGroup.hasPartialChange = true;
                        }"""

content = re.sub(pattern, replacement, content)

with open('public/js/viewer.js', 'w') as f:
    f.write(content)
