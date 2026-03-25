import re

with open("public/css/viewer.css", "r") as f:
    content = f.read()

# Let's remove any remaining 72vh from mobile query
content = re.sub(r'#quick-picker\s*\{\s*max-height:\s*72vh;\s*\}', '', content)
content = re.sub(r'#quick-picker\s*\{\s*height:\s*72vh;\s*max-height:\s*72vh;\s*\}', '', content)

# Check for any remaining occurrences
print(re.findall(r'65vh|72vh', content))

with open("public/css/viewer.css", "w") as f:
    f.write(content)
