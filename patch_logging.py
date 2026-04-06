import re

with open('public/js/viewer.js', 'r') as f:
    content = f.read()

pattern = r"""                                    // Use the two largest dimensions of the mesh's world size
                                    const dims = \[Math\.abs\(size\.x\), Math\.abs\(size\.y\), Math\.abs\(size\.z\)\]\.sort\(\(a,b\) => b - a\);
                                    const faceWidth = dims\[1\]; // Usually width
                                    const faceHeight = dims\[0\]; // Usually height

                                    // If scale is needed, repeat the texture based on face dimensions / texture dimensions
                                    // Make sure we don't divide by zero
                                    if \(realWidth > 0 && realHeight > 0\) \{
                                        const repeatX = faceWidth / realWidth;
                                        const repeatY = faceHeight / realHeight;
                                        newTex\.repeat\.set\(repeatX, repeatY\);
                                    \}"""

replacement = r"""                                    // Use the two largest dimensions of the mesh's world size
                                    const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)].sort((a,b) => b - a);
                                    const faceWidth = dims[1]; // Usually width
                                    const faceHeight = dims[0]; // Usually height

                                    // If scale is needed, repeat the texture based on face dimensions / texture dimensions
                                    // Make sure we don't divide by zero
                                    if (realWidth > 0 && realHeight > 0) {
                                        const repeatX = faceWidth / realWidth;
                                        const repeatY = faceHeight / realHeight;
                                        console.log(`[Texture Scale] Applied '${name}' to mesh '${mesh.name || 'Unknown'}'. Face size: ${faceWidth.toFixed(2)}x${faceHeight.toFixed(2)}". Real texture size: ${realWidth}x${realHeight}". Repeating: ${repeatX.toFixed(2)}x${repeatY.toFixed(2)}.`);
                                        newTex.repeat.set(repeatX, repeatY);
                                    }"""

content = re.sub(pattern, replacement, content)

with open('public/js/viewer.js', 'w') as f:
    f.write(content)
