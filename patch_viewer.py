import re

with open("public/viewer.html", "r") as f:
    content = f.read()

# Find the quick picker header and insert the search button
search_btn_html = """
            <button id="qp-search-btn" title="Search Textures" aria-label="Search">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </button>
            <button id="qp-close">&#xD7;</button>"""

content = re.sub(
    r'<button id="qp-close">&#xD7;</button>',
    search_btn_html.strip(),
    content
)

with open("public/viewer.html", "w") as f:
    f.write(content)
