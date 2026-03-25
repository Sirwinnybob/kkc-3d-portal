import re

with open("public/css/viewer.css", "r") as f:
    content = f.read()

# Fix quick picker flex and height
content = re.sub(
    r'#quick-picker \{([^}]+)\}',
    r'#quick-picker {\1}',
    content
)

# Replace `#qp-close` block with combined one, but let's just add it correctly
# First, find `#qp-close {`
qp_close_block = r'''#qp-close \{
    background: none;
    border: 1px solid rgba\(255,255,255,0\.18\);
    border-radius: 8px;
    color: rgba\(255,255,255,0\.7\);
    font-size: 1\.1em;
    width: 34px;
    height: 34px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0\.15s, color 0\.15s;
    font-family: inherit;
\}

#qp-close:hover \{
    background: rgba\(255,255,255,0\.1\);
    color: #fff;
\}'''

combined_block = r'''#qp-close, #qp-search-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 8px;
    color: rgba(255,255,255,0.7);
    font-size: 1.1em;
    width: 34px;
    height: 34px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
}

#qp-close:hover, #qp-search-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
}

.qp-actions {
    display: flex;
    gap: 8px;
}
'''

content = re.sub(qp_close_block, combined_block, content)

# Remove height: 65vh; max-height: 65vh; from #quick-picker
content = re.sub(r'height: 65vh;\s*', '', content)
content = re.sub(r'max-height: 65vh;\s*', '', content)
content = re.sub(r'max-height: 72vh;\s*', '', content)
content = re.sub(r'height: 72vh; max-height: 72vh;\s*', '', content)
content = re.sub(r'#quick-picker\s*\{\s*\}', '', content) # remove empty block if any

# Update qp-views-container to have a fixed height
content = re.sub(
    r'#qp-views-container \{[^}]+\}',
    """#qp-views-container {
    height: 120px;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
}""",
    content
)

# Update qp-category-grid to be horizontal row
content = re.sub(
    r'#qp-category-grid \{[^}]+\}',
    """#qp-category-grid {
    display: flex;
    flex-direction: row;
    gap: 10px;
    overflow-x: auto;
    padding: 0 4px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Hide scrollbar for compact view */
    height: 100%;
}
#qp-category-grid::-webkit-scrollbar {
    display: none;
}
""",
    content
)

# Adjust category button styles for horizontal layout
content = re.sub(
    r'\.qp-category-btn \{[^}]+\}',
    """.qp-category-btn {
    padding: 12px 18px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    color: rgba(255,255,255,0.85);
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: background 0.18s, border-color 0.18s;
    font-family: inherit;
    white-space: nowrap;
    height: fit-content;
    align-self: center;
    scroll-snap-align: center;
}""",
    content
)

# Simplify qp-categories-view padding since it's now horizontal
content = re.sub(
    r'#qp-categories-view \{[^}]+\}',
    """#qp-categories-view {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 10px;
    overscroll-behavior: contain;
    transform: translateX(0);
    opacity: 1;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
    will-change: transform;
}""",
    content
)

# Adjust qp-textures-view padding
content = re.sub(
    r'#qp-textures-view \{[^}]+\}',
    """#qp-textures-view {
    position: absolute;
    inset: 0;
    padding: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
    will-change: transform;
}""",
    content
)

with open("public/css/viewer.css", "w") as f:
    f.write(content)
