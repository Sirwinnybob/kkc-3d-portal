import re

with open('public/js/materialManager.js', 'r') as f:
    content = f.read()

pattern = r"""                        if \(entry && entry\.matched\) \{
                            mat\.matchedName = entry\.bestMatch \? entry\.bestMatch\.name : null;
                            mat\.bestCategory = entry\.bestCategory;
                            mat\.similarTextures = entry\.similarTextures;
                            mat\.isHidden = !!entry\.isHidden;
                            if \(entry\.bestMatch\) \{
                                mat\.urlHigh = entry\.bestMatch\.url;
                                mat\.urlMedium = entry\.bestMatch\.urlMedium;
                                mat\.urlLow = entry\.bestMatch\.urlLow;
                                mat\.currentLODUrl = mat\.urlHigh;
                            \}
                        \} else \{"""

replacement = r"""                        if (entry && entry.matched) {
                            mat.matchedName = entry.bestMatch ? entry.bestMatch.name : null;
                            mat.bestCategory = entry.bestCategory;
                            mat.similarTextures = entry.similarTextures;
                            mat.isHidden = !!entry.isHidden;
                            if (entry.bestMatch) {
                                mat.urlHigh = entry.bestMatch.url;
                                mat.urlMedium = entry.bestMatch.urlMedium;
                                mat.urlLow = entry.bestMatch.urlLow;
                                mat.width = entry.bestMatch.width;
                                mat.height = entry.bestMatch.height;
                                mat.currentLODUrl = mat.urlHigh;

                                // Auto-replace texture if it's an exact/very close match
                                if (entry.distance !== undefined && entry.distance <= 5) {
                                    const texUrl = mat.urlLow || mat.urlHigh; // Load lowest res first to be fast
                                    if (texUrl) {
                                        // We trigger the same logic as onApplyTexture but silently
                                        this.onApplyTexture(
                                            this.detectedMaterials.indexOf(mat),
                                            mat.urlHigh,
                                            mat.urlMedium,
                                            mat.urlLow,
                                            mat.matchedName,
                                            null,
                                            true,
                                            mat.width,
                                            mat.height
                                        );
                                    }
                                }
                            }
                        } else {"""

content = re.sub(pattern, replacement, content)

# Update matchTexture fallback
pattern2 = r"""            if \(data\.bestMatch\) \{
                mat\.urlHigh = data\.bestMatch\.url;
                mat\.urlMedium = data\.bestMatch\.urlMedium;
                mat\.urlLow = data\.bestMatch\.urlLow;
                mat\.currentLODUrl = mat\.urlHigh;
            \}
        \} else \{"""

replacement2 = r"""            if (data.bestMatch) {
                mat.urlHigh = data.bestMatch.url;
                mat.urlMedium = data.bestMatch.urlMedium;
                mat.urlLow = data.bestMatch.urlLow;
                mat.width = data.bestMatch.width;
                mat.height = data.bestMatch.height;
                mat.currentLODUrl = mat.urlHigh;

                // Auto-replace texture if it's an exact/very close match
                if (data.distance !== undefined && data.distance <= 5) {
                    const texUrl = mat.urlLow || mat.urlHigh;
                    if (texUrl) {
                        this.onApplyTexture(
                            this.detectedMaterials.indexOf(mat),
                            mat.urlHigh,
                            mat.urlMedium,
                            mat.urlLow,
                            mat.matchedName,
                            null,
                            true,
                            mat.width,
                            mat.height
                        );
                    }
                }
            }
        } else {"""

content = re.sub(pattern2, replacement2, content)

# Pass width/height to onApplyTexture in renderTextureGrid
pattern3 = r"""            btn\.onclick = \(\) => \{
                const indices = this\.selectedGroupIndices \|\| \[this\.selectedMaterialIndex\];
                indices\.forEach\(idx => this\.onApplyTexture\(idx, tex\.url, tex\.urlMedium, tex\.urlLow, tex\.name, null, true\)\);
            \};"""

replacement3 = r"""            btn.onclick = () => {
                const indices = this.selectedGroupIndices || [this.selectedMaterialIndex];
                indices.forEach(idx => this.onApplyTexture(idx, tex.url, tex.urlMedium, tex.urlLow, tex.name, null, true, tex.width, tex.height));
            };"""

content = re.sub(pattern3, replacement3, content)

# Pass width/height to onApplyTexture in renderQpStrip
pattern4 = r"""            btn\.addEventListener\('click', \(\) => \{
                this\.onApplyTexture\(this\.qpMatGroupIndex, tex\.url, tex\.urlMedium, tex\.urlLow, tex\.name, this\.qpTappedMesh, this\.qpReplaceAll\);"""

replacement4 = r"""            btn.addEventListener('click', () => {
                this.onApplyTexture(this.qpMatGroupIndex, tex.url, tex.urlMedium, tex.urlLow, tex.name, this.qpTappedMesh, this.qpReplaceAll, tex.width, tex.height);"""

content = re.sub(pattern4, replacement4, content)

# Pass width/height to onApplyTexture in handlePaintTap
pattern5 = r"""        if \(this\.qpLastColorHex\) \{
            this\.onApplyColor\(idx, this\.qpLastColorHex, mesh, false\);
        \} else \{
            this\.onApplyTexture\(idx, this\.qpLastTextureUrl, null, null, this\.qpLastTextureName, mesh, false\);
        \}"""

replacement5 = r"""        if (this.qpLastColorHex) {
            this.onApplyColor(idx, this.qpLastColorHex, mesh, false);
        } else {
            // Retrieve width/height from the current Qp textures
            const texData = this.qpCurrentTextures.find(t => t.url === this.qpLastTextureUrl);
            const tWidth = texData ? texData.width : null;
            const tHeight = texData ? texData.height : null;
            this.onApplyTexture(idx, this.qpLastTextureUrl, null, null, this.qpLastTextureName, mesh, false, tWidth, tHeight);
        }"""

content = re.sub(pattern5, replacement5, content)

with open('public/js/materialManager.js', 'w') as f:
    f.write(content)
