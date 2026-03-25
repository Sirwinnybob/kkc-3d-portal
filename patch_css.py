with open("public/css/viewer.css", "r") as f:
    content = f.read()

# Remove height: 65vh; max-height: 65vh;
content = content.replace("height: 65vh;", "")
content = content.replace("max-height: 65vh;", "")

# Remove height: 72vh; max-height: 72vh;
content = content.replace("height: 72vh; max-height: 72vh;", "")

# Add height to qp-views-container
import re
content = re.sub(
    r'#qp-views-container \{[^}]+\}',
    """#qp-views-container {
    height: 140px;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
}""",
    content
)

# Update qp-close style to target both buttons
content = content.replace("#qp-close {", "#qp-close, #qp-search-btn {")
content = content.replace("#qp-close:hover {", "#qp-close:hover, #qp-search-btn:hover {")

# To keep them horizontally aligned, quick-picker-header is a flex box, let's group the buttons
# Actually, wait, it's justify-content: space-between. If we just throw a new button in there, it will mess up flex layout.
# We should probably put them in a div. Let's fix viewer.html first or just style flex-basis.
# Or we can put back-btn, title, and then a div for action buttons.
