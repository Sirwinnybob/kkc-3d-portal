const fs = require('fs');
let code = fs.readFileSync('public/js/viewer.js', 'utf8');

// The viewer.html already has an overlay toggle section for kitchen and island (Full vs Half).
// We need to pass the active overlay into our config building logic.

const oldSelectFirst = `function selectFirstAvailable(context, category, style) {
    const isIsland = context === 'island';
    const targetSet = isIsland ? activeIslandConfig : activeKitchenConfig;

    let options = [];
    try {
        let catData = categoriesData[context][style][category];
        if(!catData) return;`;

const newSelectFirst = `function selectFirstAvailable(context, category, style) {
    const isIsland = context === 'island';
    const targetSet = isIsland ? activeIslandConfig : activeKitchenConfig;
    const overlayToggle = document.getElementById(isIsland ? 'island-overlay-toggle' : 'overlay-toggle');
    const activeOverlayBtn = overlayToggle ? overlayToggle.querySelector('.active') : null;
    const overlayVal = activeOverlayBtn ? activeOverlayBtn.dataset.style + '_overlay' : null;

    try {
        let catData = categoriesData[context][style];
        if (!catData) return;

        // Try overlay first if applicable
        if (overlayVal && catData[overlayVal] && catData[overlayVal][category]) {
            catData = catData[overlayVal][category];
        } else if (catData[category]) {
            catData = catData[category];
        } else {
            return;
        }`;

code = code.replace(oldSelectFirst, newSelectFirst);

// Let's replace the whole buildPartPickers again to cleanly integrate Overlay
const oldBuild = `function buildPartPickers(context, style) {
    const wrapper = document.getElementById(context === 'island' ? 'island-parts' : 'kitchen-parts');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    if (!categoriesData[context] || !categoriesData[context][style]) return;

    const catsData = categoriesData[context][style];
    const activeConfig = context === 'island' ? activeIslandConfig : activeKitchenConfig;`;

const newBuild = `function buildPartPickers(context, style) {
    const isIsland = context === 'island';
    const wrapper = document.getElementById(isIsland ? 'island-parts' : 'kitchen-parts');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    if (!categoriesData[context] || !categoriesData[context][style]) return;

    let catsData = categoriesData[context][style];
    const activeConfig = isIsland ? activeIslandConfig : activeKitchenConfig;

    const overlayToggle = document.getElementById(isIsland ? 'island-overlay-toggle' : 'overlay-toggle');
    const activeOverlayBtn = overlayToggle ? overlayToggle.querySelector('.active') : null;
    const overlayVal = activeOverlayBtn ? activeOverlayBtn.dataset.style + '_overlay' : null;`;

code = code.replace(oldBuild, newBuild);

// Wait, catsData is used heavily. If we change it, what about categories that DO NOT use overlay (e.g. wall, floor)?
// Let's merge them dynamically so we have ONE object to iterate.
const oldCatsLoop = `    const cats = Object.keys(catsData).sort((a,b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if(ia > -1 && ib > -1) return ia - ib;
        if(ia > -1) return -1;
        if(ib > -1) return 1;
        return 0;
    });

    for (const cat of cats) {
        if (hiddenCats.includes(cat)) continue;

        const catData = catsData[cat];
        if (!catData) continue;`;

const newCatsLoop = `    // Combine base categories with overlay categories
    const combinedCatsData = {};
    for (const k of Object.keys(catsData)) {
        if (k.endsWith('_overlay')) {
            if (k === overlayVal) {
                // Merge active overlay's categories in
                for (const subK of Object.keys(catsData[k])) {
                    combinedCatsData[subK] = catsData[k][subK];
                }
            }
        } else {
            combinedCatsData[k] = catsData[k];
        }
    }

    const cats = Object.keys(combinedCatsData).sort((a,b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if(ia > -1 && ib > -1) return ia - ib;
        if(ia > -1) return -1;
        if(ib > -1) return 1;
        return 0;
    });

    for (const cat of cats) {
        if (hiddenCats.includes(cat)) continue;

        const catData = combinedCatsData[cat];
        if (!catData) continue;`;

code = code.replace(oldCatsLoop, newCatsLoop);

// loadShowroomPart
const oldLoadShowroomPart = `function loadShowroomPart(context, cat, style, configObj) {
    if (!configObj || !configObj.file) return;

    let pathParts = [context, style, cat];`;

const newLoadShowroomPart = `function loadShowroomPart(context, cat, style, configObj) {
    if (!configObj || !configObj.file) return;

    const isIsland = context === 'island';
    const overlayToggle = document.getElementById(isIsland ? 'island-overlay-toggle' : 'overlay-toggle');
    const activeOverlayBtn = overlayToggle ? overlayToggle.querySelector('.active') : null;
    const overlayVal = activeOverlayBtn ? activeOverlayBtn.dataset.style + '_overlay' : null;

    let pathParts = [context, style];

    // We only append overlay if the backend physically stores this category inside the overlay folder.
    // We can check categoriesData to see where it lives!
    if (overlayVal && categoriesData[context] && categoriesData[context][style] && categoriesData[context][style][overlayVal] && categoriesData[context][style][overlayVal][cat]) {
        pathParts.push(overlayVal);
    }

    pathParts.push(cat);`;

code = code.replace(oldLoadShowroomPart, newLoadShowroomPart);

// We need to re-bind the overlay toggle buttons to trigger a rebuild.
const oldKitchenSwitch = `    document.querySelectorAll('#kitchen-style-toggle .style-btn').forEach(btn => {
        btn.onclick = () => {`;

const newKitchenSwitch = `    document.querySelectorAll('#overlay-toggle .style-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#overlay-toggle .style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeKitchenConfig = {}; // clear config
            buildPartPickers('kitchen', activeKitchenStyle);

            // Reload defaults
            const hiddenCats = ['base', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor'];
            for (const cat of hiddenCats) selectFirstAvailable('kitchen', cat, activeKitchenStyle);
        };
    });

    document.querySelectorAll('#kitchen-style-toggle .style-btn').forEach(btn => {
        btn.onclick = () => {`;

code = code.replace(oldKitchenSwitch, newKitchenSwitch);

const oldIslandSwitch = `    document.querySelectorAll('#island-style-toggle .style-btn').forEach(btn => {
        btn.onclick = () => {`;

const newIslandSwitch = `    document.querySelectorAll('#island-overlay-toggle .style-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#island-overlay-toggle .style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeIslandConfig = {}; // clear config
            buildPartPickers('island', activeIslandStyle);

            // Reload defaults
            const hiddenCats = ['base', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor'];
            for (const cat of hiddenCats) selectFirstAvailable('island', cat, activeIslandStyle);
        };
    });

    document.querySelectorAll('#island-style-toggle .style-btn').forEach(btn => {
        btn.onclick = () => {`;

code = code.replace(oldIslandSwitch, newIslandSwitch);


fs.writeFileSync('public/js/viewer.js', code);
console.log('Viewer JS patched for overlay.');
