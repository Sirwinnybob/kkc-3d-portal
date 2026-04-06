import re

with open('public/js/viewer.js', 'r') as f:
    content = f.read()

# Update repeat logic to handle null properly and not error
pattern = r"""                                // Note: we have to clone the texture if we're setting unique repeats per-mesh,
                                // but for simplicity and performance we apply it directly if replacing all\.
                                // If repeating, use RepeatWrapping\.
                                newTex\.wrapS = THREE\.RepeatWrapping;
                                newTex\.wrapT = THREE\.RepeatWrapping;
                                newTex\.repeat\.set\(repeatX, repeatY\);
                                // A slight offset sometimes helps, but we'll stick to basic scale
                            \}
                        \}\);
                    \}\);

                    if \(replaceAll\) \{
                        matGroup\.urlHigh = url;
                        matGroup\.urlMedium = urlMedium;
                        matGroup\.urlLow = urlLow;
                        matGroup\.width = realWidth;
                        matGroup\.height = realHeight;
                        matGroup\.currentLODUrl = url;
                        matGroup\.previewCache = null;
                    \} else if \(tappedMesh\) \{
                        matGroup\.hasPartialChange = true;
                    \}"""

replacement = r"""                                if (realWidth > 0 && realHeight > 0) {
                                    newTex.wrapS = THREE.RepeatWrapping;
                                    newTex.wrapT = THREE.RepeatWrapping;
                                    newTex.repeat.set(repeatX, repeatY);
                                }
                            } else {
                                // Default fallback to original UV mapping (no repeat set manually)
                                newTex.wrapS = THREE.RepeatWrapping;
                                newTex.wrapT = THREE.RepeatWrapping;
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
