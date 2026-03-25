import re

with open("public/css/viewer.css", "r") as f:
    content = f.read()

# Let's ensure qp-actions is properly formatted and applied
qp_actions = """
.qp-actions {
    display: flex;
    gap: 8px;
}
"""

if ".qp-actions" not in content:
    content += qp_actions

# Also make sure the combined block for #qp-close, #qp-search-btn exists
# and #qp-close is not left alone.
if "#qp-search-btn" not in content:
    print("Warning: #qp-search-btn not found in css")

# Check the header to make sure things look right
header_block = re.search(r'#quick-picker-header \{[^}]+\}', content)
if header_block:
    pass

with open("public/css/viewer.css", "w") as f:
    f.write(content)
