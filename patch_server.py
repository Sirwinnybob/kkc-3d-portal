import re

with open('server.js', 'r') as f:
    content = f.read()

# Pattern for processing main textures
pattern_main = r"""                    try \{
                        const filePath = path\.join\(categoryPath, file\);
                        const buffer = await fs\.promises\.readFile\(filePath\);
                        const hash = await computePhash\(buffer\);

                        let urlMedium = null;
                        let urlLow = null;"""

replacement_main = r"""                    try {
                        let width = null;
                        let height = null;

                        if (!isHidden) {
                            if (!dimensions[entry.name][file]) {
                                dimensions[entry.name][file] = { width: null, height: null };
                                dimsModified = true;
                            } else {
                                width = dimensions[entry.name][file].width;
                                height = dimensions[entry.name][file].height;
                            }
                        }

                        const filePath = path.join(categoryPath, file);
                        const buffer = await fs.promises.readFile(filePath);
                        const hash = await computePhash(buffer);

                        let urlMedium = null;
                        let urlLow = null;"""

content = re.sub(pattern_main, replacement_main, content)

# Pattern for pushing to categoryTextures
pattern_push = r"""                        categoryTextures\.push\(\{
                            name: path\.basename\(file, ext\),
                            file: file,
                            url: isHidden \? null : `/textures/\$\{encodeURIComponent\(entry\.name\)\}/\$\{encodeURIComponent\(file\)\}`,
                            urlMedium: urlMedium,
                            urlLow: urlLow,
                            hidden: isHidden,
                            hash: hash\.toString\(\),
                            hLow: Number\(hash & 0xFFFFFFFFn\),
                            hHigh: Number\(hash >> 32n\)
                        \}\);"""

replacement_push = r"""                        categoryTextures.push({
                            name: path.basename(file, ext),
                            file: file,
                            url: isHidden ? null : `/textures/${encodeURIComponent(entry.name)}/${encodeURIComponent(file)}`,
                            urlMedium: urlMedium,
                            urlLow: urlLow,
                            width: width,
                            height: height,
                            hidden: isHidden,
                            hash: hash.toString(),
                            hLow: Number(hash & 0xFFFFFFFFn),
                            hHigh: Number(hash >> 32n)
                        });"""

content = re.sub(pattern_push, replacement_push, content)

# Pattern for pushing to variants
pattern_variant = r"""                                index\[entry\.name\]\.push\(\{
                                    name: canonical\.name,
                                    file: canonical\.file,
                                    url: canonical\.url,
                                    hidden: canonical\.hidden,
                                    hash: hash\.toString\(\),
                                    hLow: Number\(hash & 0xFFFFFFFFn\),
                                    hHigh: Number\(hash >> 32n\),
                                    isVariant: true,
                                    variantFile: file
                                \}\);"""

replacement_variant = r"""                                index[entry.name].push({
                                    name: canonical.name,
                                    file: canonical.file,
                                    url: canonical.url,
                                    width: canonical.width,
                                    height: canonical.height,
                                    hidden: canonical.hidden,
                                    hash: hash.toString(),
                                    hLow: Number(hash & 0xFFFFFFFFn),
                                    hHigh: Number(hash >> 32n),
                                    isVariant: true,
                                    variantFile: file
                                });"""

content = re.sub(pattern_variant, replacement_variant, content)


# Add JSON save at the end of the Promise.all
pattern_end = r"""                \}
            \}\)\);
        \} catch \(e\) \{
            console\.error\(`\[Texture\] Index build error: \$\{e\.message\}`\);
        \}"""

replacement_end = r"""                }
            }));

            if (dimsModified) {
                try {
                    await fs.promises.writeFile(dimPath, JSON.stringify(dimensions, null, 2), 'utf8');
                    console.log('[Texture] Updated texture_dimensions.json');
                } catch (e) {
                    console.error(`[Texture] Failed to save dimensions: ${e.message}`);
                }
            }
        } catch (e) {
            console.error(`[Texture] Index build error: ${e.message}`);
        }"""

content = re.sub(pattern_end, replacement_end, content)

with open('server.js', 'w') as f:
    f.write(content)
