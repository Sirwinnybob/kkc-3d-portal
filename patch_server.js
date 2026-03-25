const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Update splitGlbByCategories to accept overlay from splitRequests and include it in path.
const oldSplit = `        const requestParams = splitRequests.find(r => r.category === cat);
        let folderPath = path.join(SHOWROOM_DIR, context, style, cat);

        if (requestParams.subCategory) {
            folderPath = path.join(folderPath, requestParams.subCategory);
        }
        if (requestParams.grainDirection) {
            folderPath = path.join(folderPath, requestParams.grainDirection);
        }`;

const newSplit = `        const requestParams = splitRequests.find(r => r.category === cat);

        let pathParts = [context, style];

        // Add overlay if present (e.g., face_frame -> half_overlay)
        if (requestParams.overlay) pathParts.push(requestParams.overlay);

        pathParts.push(cat);

        if (requestParams.subCategory) pathParts.push(requestParams.subCategory);
        if (requestParams.grainDirection) pathParts.push(requestParams.grainDirection);

        let folderPath = path.join(SHOWROOM_DIR, ...pathParts);`;

code = code.replace(oldSplit, newSplit);

// Also add overlay to tags metadata
const oldTags = `            const tags = {
                file: \`\${outputBaseName}.glb\`,
                category: cat,
                context: context,
                style: style,
                subCategory: requestParams.subCategory || null,
                grainDirection: requestParams.grainDirection || null,
                extracted: false,
                meshTags: {},
                taggedMeshes: []
            };`;

const newTags = `            const tags = {
                file: \`\${outputBaseName}.glb\`,
                category: cat,
                context: context,
                style: style,
                overlay: requestParams.overlay || null,
                subCategory: requestParams.subCategory || null,
                grainDirection: requestParams.grainDirection || null,
                extracted: false,
                meshTags: {},
                taggedMeshes: []
            };`;

code = code.replace(oldTags, newTags);

fs.writeFileSync('server.js', code);
console.log('Backend split patched for overlay support.');
