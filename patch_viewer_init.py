import re

with open('public/js/viewer.js', 'r') as f:
    content = f.read()

# Update onApplyTexture arguments
pattern1 = r"""            onApplyTexture: \(matGroupIndex, url, urlMedium, urlLow, name, tappedMesh, replaceAll\) => \{"""
replacement1 = r"""            onApplyTexture: (matGroupIndex, url, urlMedium, urlLow, name, tappedMesh, replaceAll, realWidth, realHeight) => {"""

content = re.sub(pattern1, replacement1, content)

# Update bounding box repeat logic
pattern2 = r"""                    if \(replaceAll\) \{
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

replacement2 = r"""                    const targetMeshes = replaceAll ? matGroup.meshes : (tappedMesh ? [tappedMesh] : []);

                    targetMeshes.forEach(mesh => {
                        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        mats.forEach(m => {
                            m.map = newTex;
                            if (m.color) m.color.setHex(0xffffff);
                            m.needsUpdate = true;

                            // Real-world scaling logic
                            if (realWidth !== undefined && realWidth !== null && realHeight !== undefined && realHeight !== null) {
                                // Compute bounding box of this mesh to figure out face dimensions
                                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                                const box = mesh.geometry.boundingBox;

                                // To get world size, we should apply mesh scale
                                const size = new THREE.Vector3();
                                box.getSize(size);
                                size.multiply(mesh.scale);

                                // We assume the two largest dimensions form the main "face" of the part
                                const dims = [size.x, size.y, size.z].sort((a,b) => b - a);
                                const faceWidth = dims[1]; // Usually width
                                const faceHeight = dims[0]; // Usually height

                                // Since we don't strictly know UV orientation, we try to map the texture
                                // to the bounding box aspect naturally.
                                // The user inputs realWidth/realHeight in inches.
                                const repeatX = faceWidth / realWidth;
                                const repeatY = faceHeight / realHeight;

                                // Note: we have to clone the texture if we're setting unique repeats per-mesh,
                                // but for simplicity and performance we apply it directly if replacing all.
                                // If repeating, use RepeatWrapping.
                                newTex.wrapS = THREE.RepeatWrapping;
                                newTex.wrapT = THREE.RepeatWrapping;
                                newTex.repeat.set(repeatX, repeatY);
                                // A slight offset sometimes helps, but we'll stick to basic scale
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

content = re.sub(pattern2, replacement2, content)


with open('public/js/viewer.js', 'w') as f:
    f.write(content)
