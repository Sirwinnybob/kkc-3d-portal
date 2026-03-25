import re

with open("public/js/viewer.js", "r") as f:
    content = f.read()

# Find the quick picker variables to add qpSearchBtn
content = re.sub(
    r'const qpClose          = document.getElementById\(\'qp-close\'\);',
    "const qpClose          = document.getElementById('qp-close');\n    const qpSearchBtn      = document.getElementById('qp-search-btn');",
    content
)

# Bind the listener
listener_code = """    qpClose.addEventListener('click', closeQuickPicker);

    if (qpSearchBtn) {
        qpSearchBtn.addEventListener('click', () => {
            closeQuickPicker();
            const texBtn = document.getElementById('texture-btn');
            if (texBtn) texBtn.click();
        });
    }"""

content = re.sub(
    r"    qpClose\.addEventListener\('click', closeQuickPicker\);",
    listener_code,
    content
)

with open("public/js/viewer.js", "w") as f:
    f.write(content)
