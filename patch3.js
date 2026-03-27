const fs = require('fs');
let js = fs.readFileSync('public/js/viewer.js', 'utf8');

// I need to investigate the click handlers inside qpCategoryGrid.
// In `loadQpCategories(mat)`, it creates category buttons and adds click event: `btn.addEventListener('click', () => loadQpCategoryTextures(cat, mat));`
// Wait, when I tap a category, the user said it "does nothing. there is no loading or indication anywhere and nothing in the browser console."
// If `loadQpCategoryTextures` is called, it should set `qpTitle.textContent = category; showQpTexturesView();` and append 'Loading...' to `qpTextureStrip`.
// Let's check `loadQpCategories`:

console.log(js.includes('btn.addEventListener(\'click\', () => loadQpCategoryTextures(cat, mat));'));

// Wait, looking at `viewer.html`, let's check `viewer.css` again for `.show-textures`
