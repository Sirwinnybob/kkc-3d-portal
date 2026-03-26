const fs = require('fs');

let code = fs.readFileSync('public/js/viewer.js', 'utf8');

// First replacement
const search1 = `            if (mat.similarTextures && mat.similarTextures.length > 0) {
                const uniqueSimilar = mat.similarTextures.filter(t => !currentCategoryTextures.some(ct => ct.url === t.url));
                currentCategoryTextures = [...uniqueSimilar, ...currentCategoryTextures];
                renderTextureGrid();
                insertBrowseButton();
            }`;
const replace1 = `            if (mat.similarTextures && mat.similarTextures.length > 0) {
                const existingUrls = new Set(currentCategoryTextures.map(ct => ct.url));
                const uniqueSimilar = mat.similarTextures.filter(t => !existingUrls.has(t.url));
                currentCategoryTextures = [...uniqueSimilar, ...currentCategoryTextures];
                renderTextureGrid();
                insertBrowseButton();
            }`;
code = code.replace(search1, replace1);

// Second replacement
const search2 = `                if (data.similarTextures && data.similarTextures.length > 0) {
                    // Prepend similar matches at top (preserve their real names)
                    const uniqueSimilar = data.similarTextures.filter(t => !currentCategoryTextures.some(ct => ct.url === t.url));
                    currentCategoryTextures = [...uniqueSimilar, ...currentCategoryTextures];
                }`;
const replace2 = `                if (data.similarTextures && data.similarTextures.length > 0) {
                    // Prepend similar matches at top (preserve their real names)
                    const existingUrls = new Set(currentCategoryTextures.map(ct => ct.url));
                    const uniqueSimilar = data.similarTextures.filter(t => !existingUrls.has(t.url));
                    currentCategoryTextures = [...uniqueSimilar, ...currentCategoryTextures];
                }`;
code = code.replace(search2, replace2);

fs.writeFileSync('public/js/viewer.js', code);
console.log('Replaced successfully.');
