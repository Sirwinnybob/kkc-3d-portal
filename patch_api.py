import re

with open('server.js', 'r') as f:
    content = f.read()

# 1. Update /api/textures/:category
pattern1 = r"""                    url: `/textures/\$\{encodeURIComponent\(category\)\}/\$\{encodeURIComponent\(f\)\}`,
                    urlMedium: `/textures/Hidden/LOD/\$\{encodeURIComponent\(category\)\}/\$\{encodeURIComponent\(nameOnly \+ '_medium' \+ ext\)\}`,
                    urlLow: `/textures/Hidden/LOD/\$\{encodeURIComponent\(category\)\}/\$\{encodeURIComponent\(nameOnly \+ '_low' \+ ext\)\}`
                \};"""

replacement1 = r"""                    url: `/textures/${encodeURIComponent(category)}/${encodeURIComponent(f)}`,
                    urlMedium: `/textures/Hidden/LOD/${encodeURIComponent(category)}/${encodeURIComponent(nameOnly + '_medium' + ext)}`,
                    urlLow: `/textures/Hidden/LOD/${encodeURIComponent(category)}/${encodeURIComponent(nameOnly + '_low' + ext)}`,
                    width: textureHashCache && textureHashCache[category] ? (textureHashCache[category].find(t => t.file === f)?.width || null) : null,
                    height: textureHashCache && textureHashCache[category] ? (textureHashCache[category].find(t => t.file === f)?.height || null) : null
                };"""

content = re.sub(pattern1, replacement1, content)

# 2. Update POST /api/textures/match bestMatch return
pattern2 = r"""                urlMedium: bestMatch\.urlMedium,
                urlLow: bestMatch\.urlLow,
                category: bestMatch\.category,
                hidden: bestMatch\.hidden
            \} : null,"""

replacement2 = r"""                urlMedium: bestMatch.urlMedium,
                urlLow: bestMatch.urlLow,
                category: bestMatch.category,
                width: bestMatch.width,
                height: bestMatch.height,
                hidden: bestMatch.hidden
            } : null,"""

content = re.sub(pattern2, replacement2, content)

# 3. Update POST /api/textures/match similarTextures return
pattern3 = r"""                urlLow: t\.urlLow,
                category: t\.category,
                distance: t\.distance
            \}\)\)"""

replacement3 = r"""                urlLow: t.urlLow,
                category: t.category,
                width: t.width,
                height: t.height,
                distance: t.distance
            }))"""

content = re.sub(pattern3, replacement3, content)

# 4. Update generateTextureManifest bestMatch
pattern4 = r"""                                urlMedium: bestMatch\.urlMedium,
                                urlLow: bestMatch\.urlLow,
                                category: bestMatch\.category
                            \} : null,"""

replacement4 = r"""                                urlMedium: bestMatch.urlMedium,
                                urlLow: bestMatch.urlLow,
                                category: bestMatch.category,
                                width: bestMatch.width,
                                height: bestMatch.height
                            } : null,"""

content = re.sub(pattern4, replacement4, content)

# 5. Update generateTextureManifest similarTextures
pattern5 = r"""                                urlLow: t\.urlLow,
                                category: t\.category,
                                distance: t\.distance
                            \}\)\)"""

replacement5 = r"""                                urlLow: t.urlLow,
                                category: t.category,
                                width: t.width,
                                height: t.height,
                                distance: t.distance
                            }))"""

content = re.sub(pattern5, replacement5, content)

with open('server.js', 'w') as f:
    f.write(content)
