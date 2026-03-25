import re

with open("public/css/viewer.css", "r") as f:
    content = f.read()

# Make sure height and max-height are fully removed from #quick-picker
content = re.sub(r'max-height: 65vh;', '', content)
content = re.sub(r'height: 65vh;', '', content)
content = re.sub(r'#quick-picker\s*\{\s*height: 72vh; max-height: 72vh;\s*\}', '', content)

# Check for any remaining occurrences
print(re.findall(r'65vh|72vh', content))

with open("public/css/viewer.css", "w") as f:
    f.write(content)
