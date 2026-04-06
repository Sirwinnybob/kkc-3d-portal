import re

with open('public/viewer.html', 'r') as f:
    content = f.read()

# Update script and css cache busts in viewer.html
pattern = r"""\?v=1\.2\.2"""
replacement = r"""?v=1.2.3"""

content = re.sub(pattern, replacement, content)

with open('public/viewer.html', 'w') as f:
    f.write(content)
