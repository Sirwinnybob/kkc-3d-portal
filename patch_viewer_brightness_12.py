import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# I finally understand. "MTL loaded" never prints.
# Why? Because mtlLoader.load(mtlUrl, function(materials) {...}) does not execute if it fails!
# Does it fail? Wait, in the very beginning, I saw the console log: "Fetch finished loading: GET ...mtl"
# BUT the `MTLLoader` has a third argument for the `onError` callback.
old_mtl = """            mtlLoader.load(mtlUrl, function(materials) {"""
new_mtl = """            mtlLoader.load(mtlUrl, function(materials) {"""

# Ah, let's just trace network requests again...
# `curl -I -s http://localhost:5025/jobs/002/f744bca2-2784-4b18-9e27-5009e6b5c9e3.mtl` returned 200.
# So it's loading. Why is the callback not firing, or why isn't it printing in our script?
# Ah, I replaced `old_mtl` which was:
#             mtlLoader.load(mtlUrl, function(materials) {
#                 materials.preload();
#                 const objLoader = new OBJLoader(manager);
# It IS firing, because `objLoader.parse` is running (it's INSIDE the mtlLoader callback!)
# Wait. `objLoader.parse(text)` is running inside `fileLoader.load` which is inside `mtlLoader.load`.
# So why didn't `MTL loaded!` print?
# Is the playwright console filter broken? Let's fix the python script to print EVERYTHING without filtering.
