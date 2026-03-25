const fs = require('fs');
let code = fs.readFileSync('public/js/tagger.js', 'utf8');

const oldInit = `    const selContext = document.getElementById('sel-cat-context');
    const selStyle = document.getElementById('sel-style');
    const selCategory = document.getElementById('sel-category');
    const selSubcat = document.getElementById('sel-subcat');
    const selGrain = document.getElementById('sel-grain');
    const selFile = document.getElementById('sel-file');`;

const newInit = `    const selContext = document.getElementById('sel-cat-context');
    const selStyle = document.getElementById('sel-style');
    const selOverlay = document.getElementById('sel-overlay');
    const selCategory = document.getElementById('sel-category');
    const selSubcat = document.getElementById('sel-subcat');
    const selGrain = document.getElementById('sel-grain');
    const selFile = document.getElementById('sel-file');`;

code = code.replace(oldInit, newInit);


const oldDropdowns = `    function updateCategoryDropdowns() {
        const ctx = selContext.value;
        const style = selStyle.value;

        // Reset subcat and grain
        document.getElementById('sec-subcat').style.display = 'none';
        document.getElementById('sec-grain').style.display = 'none';
        selSubcat.innerHTML = '';
        selGrain.innerHTML = '';

        if (!categoriesData[ctx] || !categoriesData[ctx][style]) {
            selCategory.innerHTML = '<option value="">-- None --</option>';
            selFile.innerHTML = '<option value="">-- Select --</option>';
            return;
        }

        const cats = Object.keys(categoriesData[ctx][style]);

        // Only rebuild category options if we need to (preserves selection if possible)
        const currentCat = selCategory.value;
        selCategory.innerHTML = cats.map(c => \`<option value="\${escapeHtml(c)}">\${escapeHtml(c.replace(/_/g, ' '))}</option>\`).join('');
        if (cats.includes(currentCat)) selCategory.value = currentCat;

        updateSubcatDropdown();
    }`;

const newDropdowns = `    function updateOverlayDropdown() {
        const ctx = selContext.value;
        const style = selStyle.value;

        document.getElementById('sec-overlay').style.display = 'none';
        selOverlay.innerHTML = '';

        if (!categoriesData[ctx] || !categoriesData[ctx][style]) {
            selCategory.innerHTML = '<option value="">-- None --</option>';
            updateSubcatDropdown();
            return;
        }

        // If style is face_frame, check if there are overlay folders (e.g. half_overlay, full_overlay) or if it's mixed
        // Actually, overlay is only for certain categories. Wait, in our new file system, overlay is INSIDE style, so ALL categories under that style might be split by overlay, OR overlay is above category?
        // User said: "Showroom/kitchen/face_frame/half_overlay/doors/shaker/file.glb"
        // So overlay is the 3rd level!
        const level3 = Object.keys(categoriesData[ctx][style]);

        // Are these overlays or categories? Overlays usually have 'overlay' in the name.
        const overlays = level3.filter(k => k.includes('overlay'));
        const hasOverlays = overlays.length > 0;

        if (hasOverlays) {
            document.getElementById('sec-overlay').style.display = 'block';
            const currentOverlay = selOverlay.value;
            selOverlay.innerHTML = overlays.map(c => \`<option value="\${escapeHtml(c)}">\${escapeHtml(c.replace(/_/g, ' '))}</option>\`).join('');
            if (overlays.includes(currentOverlay)) selOverlay.value = currentOverlay;
        }

        updateCategoryDropdowns();
    }

    function updateCategoryDropdowns() {
        const ctx = selContext.value;
        const style = selStyle.value;
        const overlay = document.getElementById('sec-overlay').style.display === 'block' ? selOverlay.value : null;

        // Reset subcat and grain
        document.getElementById('sec-subcat').style.display = 'none';
        document.getElementById('sec-grain').style.display = 'none';
        selSubcat.innerHTML = '';
        selGrain.innerHTML = '';

        let targetData = categoriesData[ctx] && categoriesData[ctx][style];
        if (targetData && overlay && targetData[overlay]) {
            targetData = targetData[overlay];
        } else if (overlay) {
            targetData = null; // We selected an overlay but there is no data for it?
        }

        if (!targetData) {
            selCategory.innerHTML = '<option value="">-- None --</option>';
            selFile.innerHTML = '<option value="">-- Select --</option>';
            return;
        }

        // Get keys that aren't overlays (if we are at a mixed level or already inside an overlay)
        const cats = Object.keys(targetData).filter(k => !k.includes('overlay') && k !== '_files');

        // If there are no categories (maybe we just have files directly?)
        if (cats.length === 0) {
            selCategory.innerHTML = '<option value="">-- None --</option>';
            updateFileList();
            return;
        }

        const currentCat = selCategory.value;
        selCategory.innerHTML = cats.map(c => \`<option value="\${escapeHtml(c)}">\${escapeHtml(c.replace(/_/g, ' '))}</option>\`).join('');
        if (cats.includes(currentCat)) selCategory.value = currentCat;

        updateSubcatDropdown();
    }`;

code = code.replace(oldDropdowns, newDropdowns);

const oldSubcat = `        if (!cat || !categoriesData[ctx][style][cat]) {
            updateFileList();
            return;
        }

        const data = categoriesData[ctx][style][cat];`;

const newSubcat = `        const overlay = document.getElementById('sec-overlay').style.display === 'block' ? selOverlay.value : null;

        let data = categoriesData[ctx] && categoriesData[ctx][style];
        if (data && overlay && data[overlay]) data = data[overlay];
        if (data && cat && data[cat]) data = data[cat];
        else data = null;

        if (!data) {
            updateFileList();
            return;
        }`;

code = code.replace(oldSubcat, newSubcat);


const oldGrain = `        if (!subcat || !categoriesData[ctx][style][cat][subcat]) {
            updateFileList();
            return;
        }

        const data = categoriesData[ctx][style][cat][subcat];`;

const newGrain = `        const overlay = document.getElementById('sec-overlay').style.display === 'block' ? selOverlay.value : null;

        let data = categoriesData[ctx] && categoriesData[ctx][style];
        if (data && overlay && data[overlay]) data = data[overlay];
        if (data && cat && data[cat]) data = data[cat];
        if (data && subcat && data[subcat]) data = data[subcat];
        else data = null;

        if (!data) {
            updateFileList();
            return;
        }`;

code = code.replace(oldGrain, newGrain);


const oldFiles = `        let files = [];
        try {
            let data = categoriesData[ctx][style][cat];
            if (subcat && data[subcat]) data = data[subcat];
            if (grain && data[grain]) data = data[grain];

            if (Array.isArray(data)) files = data;
            else if (data && data['_files']) files = data['_files'];
        } catch(e) {}`;

const newFiles = `        const overlay = document.getElementById('sec-overlay').style.display === 'block' ? selOverlay.value : null;

        let files = [];
        try {
            let data = categoriesData[ctx][style];
            if (overlay && data[overlay]) data = data[overlay];
            if (cat && data[cat]) data = data[cat];
            if (subcat && data[subcat]) data = data[subcat];
            if (grain && data[grain]) data = data[grain];

            if (Array.isArray(data)) files = data;
            else if (data && data['_files']) files = data['_files'];
        } catch(e) {}`;

code = code.replace(oldFiles, newFiles);


const oldEvents = `    selContext.onchange = updateCategoryDropdowns;
    selStyle.onchange = updateCategoryDropdowns;
    selCategory.onchange = updateSubcatDropdown;
    selSubcat.onchange = updateGrainDropdown;
    selGrain.onchange = updateFileList;

    // Initial call requires a slight delay to ensure categoriesData is loaded
    setTimeout(updateCategoryDropdowns, 200);`;

const newEvents = `    selContext.onchange = updateOverlayDropdown;
    selStyle.onchange = updateOverlayDropdown;
    selOverlay.onchange = updateCategoryDropdowns;
    selCategory.onchange = updateSubcatDropdown;
    selSubcat.onchange = updateGrainDropdown;
    selGrain.onchange = updateFileList;

    // Initial call requires a slight delay to ensure categoriesData is loaded
    setTimeout(updateOverlayDropdown, 200);`;

code = code.replace(oldEvents, newEvents);

const oldPath = `function getSelectedPath(file) {
    const ctx = document.getElementById('sel-cat-context').value;
    const style = document.getElementById('sel-style').value;
    const cat = document.getElementById('sel-category').value;
    const subcat = document.getElementById('sel-subcat').value;
    const grain = document.getElementById('sel-grain').value;

    let path = \`\${encodeURIComponent(ctx)}/\${encodeURIComponent(style)}/\${encodeURIComponent(cat)}\`;
    if (document.getElementById('sec-subcat').style.display === 'block' && subcat) path += \`/\${encodeURIComponent(subcat)}\`;
    if (document.getElementById('sec-grain').style.display === 'block' && grain) path += \`/\${encodeURIComponent(grain)}\`;
    if (file) path += \`/\${encodeURIComponent(file)}\`;

    return path;
}`;

const newPath = `function getSelectedPath(file) {
    const ctx = document.getElementById('sel-cat-context').value;
    const style = document.getElementById('sel-style').value;
    const overlay = document.getElementById('sel-overlay').value;
    const cat = document.getElementById('sel-category').value;
    const subcat = document.getElementById('sel-subcat').value;
    const grain = document.getElementById('sel-grain').value;

    let path = \`\${encodeURIComponent(ctx)}/\${encodeURIComponent(style)}\`;

    if (document.getElementById('sec-overlay').style.display === 'block' && overlay) path += \`/\${encodeURIComponent(overlay)}\`;

    if (cat) path += \`/\${encodeURIComponent(cat)}\`;

    if (document.getElementById('sec-subcat').style.display === 'block' && subcat) path += \`/\${encodeURIComponent(subcat)}\`;
    if (document.getElementById('sec-grain').style.display === 'block' && grain) path += \`/\${encodeURIComponent(grain)}\`;
    if (file) path += \`/\${encodeURIComponent(file)}\`;

    return path;
}`;

code = code.replace(oldPath, newPath);


fs.writeFileSync('public/js/tagger.js', code);
console.log('Tagger JS patched for Category mode overlay.');
