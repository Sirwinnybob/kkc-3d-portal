import re

with open('public/admin/tagger.html', 'r') as f:
    html = f.read()

# Add overlay select
old_html = """            <div class="sidebar-section">
                <label>Style:</label>
                <select id="sel-style"></select>
            </div>
            <div class="sidebar-section" id="sec-subcat" style="display:none">
                <label>Sub-Cat:</label>
                <select id="sel-subcat"></select>
            </div>"""

new_html = """            <div class="sidebar-section">
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
            </div>"""

if old_html in html:
    html = html.replace(old_html, new_html)
else:
    print("Could not find old html block")

with open('public/admin/tagger.html', 'w') as f:
    f.write(html)

print("Tagger HTML patched for category mode overlay")
