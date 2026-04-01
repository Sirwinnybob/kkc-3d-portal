import re

with open('public/js/viewer.js', 'r') as f:
    content = f.read()

# Fix the specific if (scene) line that's missing the closing brace
content = content.replace(
    'if (scene) { const isLightMode = localStorage.getItem("lightMode") === "true";\n        scene.background = new THREE.Color(isLightMode ? 0xf0f0f0 : 0x111111);',
    'if (scene) { const isLightMode = localStorage.getItem("lightMode") === "true";\n        scene.background = new THREE.Color(isLightMode ? 0xf0f0f0 : 0x111111); }'
)

with open('public/js/viewer.js', 'w') as f:
    f.write(content)
