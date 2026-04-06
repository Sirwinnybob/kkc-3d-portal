import re

with open('server.js', 'r') as f:
    content = f.read()

pattern = r"""if \(require\.main === module\) \{
    app\.listen\(PORT, \(\) => \{
        console\.log\(`KKC PORTAL v\$\{APP_VERSION\} ACTIVE ON PORT \$\{PORT\}`\);"""

replacement = r"""if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`KKC PORTAL v${APP_VERSION} ACTIVE ON PORT ${PORT}`);

        // Build texture index on startup to initialize texture_dimensions.json
        buildTextureHashIndex().then(() => console.log('[Texture] Initial index build complete.'));"""

content = re.sub(pattern, replacement, content)

with open('server.js', 'w') as f:
    f.write(content)
