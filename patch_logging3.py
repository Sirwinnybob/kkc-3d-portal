import re

with open('public/js/viewer.js', 'r') as f:
    content = f.read()

pattern = r"""                                if \(realWidth > 0 && realHeight > 0\) \{
                                    newTex\.wrapS = THREE\.RepeatWrapping;
                                    newTex\.wrapT = THREE\.RepeatWrapping;
                                    newTex\.repeat\.set\(repeatX, repeatY\);
                                \}"""

replacement = r"""                                if (realWidth > 0 && realHeight > 0) {
                                    console.log(`[Texture Scale] Name: '${name}', Mesh: '${mesh.name || 'Unknown'}'. Face size: ${faceWidth.toFixed(2)}x${faceHeight.toFixed(2)}". Real size: ${realWidth}x${realHeight}". Repeating: ${repeatX.toFixed(2)}x${repeatY.toFixed(2)}.`);
                                    newTex.wrapS = THREE.RepeatWrapping;
                                    newTex.wrapT = THREE.RepeatWrapping;
                                    newTex.repeat.set(repeatX, repeatY);
                                }"""

content = re.sub(pattern, replacement, content)

with open('public/js/viewer.js', 'w') as f:
    f.write(content)
