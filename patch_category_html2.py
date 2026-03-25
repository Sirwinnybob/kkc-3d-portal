import re

with open('public/admin/tagger.html', 'r') as f:
    html = f.read()

# Try again with a tighter match
old_html = """            <div class="sidebar-section">
                <label>Style:</label>
                <select id="sel-style"></select>
            </div>
            <div class="sidebar-section" id="sec-subcat" style="display:none">
                <label>Sub-Cat:</label>
                <select id="sel-subcat"></select>
            </div>"""

if "id=\"sel-style\"" in html:
    html = html.replace(old_html, """            <div class="sidebar-section">
                <label>Style:</label>
                <select id="sel-style"></select>
            </div>
            <div class="sidebar-section" id="sec-overlay" style="display:none">
                <label>Overlay:</label>
                <select id="sel-overlay"></select>
            </div>
            <div class="sidebar-section" id="sec-subcat" style="display:none">
                <label>Sub-Cat:</label>
                <select id="sel-subcat"></select>
            </div>""")
    with open('public/admin/tagger.html', 'w') as f:
        f.write(html)
    print("Patched.")
else:
    print("Could not find style select")
