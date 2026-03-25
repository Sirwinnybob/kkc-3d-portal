const fs = require('fs');
let code = fs.readFileSync('public/js/tagger.js', 'utf8');

const oldRender = `function renderSubCategories(cat) {
    if (['doors', 'drawer_fronts'].includes(cat)) {
        return \`
            <div class="subcat-row">
                <label>Style:</label>
                <select class="sel-subcat" data-cat="\${cat}">
                    <option value="">-- None --</option>
                    <option value="shaker">Shaker</option>
                    <option value="slab">Slab</option>
                </select>
            </div>
            <div class="subcat-row grain-row" data-cat="\${cat}" style="display:none;">
                <label>Grain:</label>
                <select class="sel-grain" data-cat="\${cat}">
                    <option value="">-- None --</option>
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                </select>
            </div>
        \`;
    } else if (cat === 'finished_ends') {
        return \`
            <div class="subcat-row">
                <label>Type:</label>
                <select class="sel-subcat" data-cat="\${cat}">
                    <option value="flat">Flat</option>
                    <option value="paneled">Paneled</option>
                </select>
            </div>
        \`;
    }
    return '';
}`;

const newRender = `function renderSubCategories(cat) {
    let overlayHtml = '';
    if (['doors', 'drawer_fronts', 'finished_ends'].includes(cat)) {
        overlayHtml = \`
            <div class="subcat-row overlay-row" data-cat="\${cat}" style="display:none;">
                <label>Overlay:</label>
                <select class="sel-overlay" data-cat="\${cat}">
                    <option value="full_overlay">Full (11/16")</option>
                    <option value="half_overlay">Half (1/2")</option>
                </select>
            </div>
        \`;
    }

    if (['doors', 'drawer_fronts'].includes(cat)) {
        return overlayHtml + \`
            <div class="subcat-row">
                <label>Style:</label>
                <select class="sel-subcat" data-cat="\${cat}">
                    <option value="">-- None --</option>
                    <option value="shaker">Shaker</option>
                    <option value="slab">Slab</option>
                </select>
            </div>
            <div class="subcat-row grain-row" data-cat="\${cat}" style="display:none;">
                <label>Grain:</label>
                <select class="sel-grain" data-cat="\${cat}">
                    <option value="">-- None --</option>
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                </select>
            </div>
        \`;
    } else if (cat === 'finished_ends') {
        return overlayHtml + \`
            <div class="subcat-row">
                <label>Type:</label>
                <select class="sel-subcat" data-cat="\${cat}">
                    <option value="flat">Flat</option>
                    <option value="paneled">Paneled</option>
                </select>
            </div>
        \`;
    }
    return '';
}`;

code = code.replace(oldRender, newRender);


const oldEvents = `        // Attach event listeners for checkboxes and dropdowns
        document.querySelectorAll('.chk-split-cat').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const row = e.target.closest('.parse-count-row');
                const subcatOpts = row.querySelector('.subcat-options');
                if (subcatOpts && subcatOpts.innerHTML.trim() !== '') {
                    subcatOpts.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        });

        document.querySelectorAll('.sel-subcat').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const cat = e.target.dataset.cat;
                const grainRow = document.querySelector(\`.grain-row[data-cat="\${cat}"]\`);
                if (grainRow) {
                    grainRow.style.display = e.target.value === 'slab' ? 'flex' : 'none';
                }
            });
        });`;

const newEvents = `        // Listen to overall style to show/hide Overlay dropdowns
        const styleSel = document.getElementById('sel-staging-style');
        const updateOverlays = () => {
            const isFF = styleSel.value === 'face_frame';
            document.querySelectorAll('.overlay-row').forEach(row => {
                row.style.display = isFF ? 'flex' : 'none';
            });
        };
        styleSel.addEventListener('change', updateOverlays);

        // Attach event listeners for checkboxes and dropdowns
        document.querySelectorAll('.chk-split-cat').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const row = e.target.closest('.parse-count-row');
                const subcatOpts = row.querySelector('.subcat-options');
                if (subcatOpts && subcatOpts.innerHTML.trim() !== '') {
                    subcatOpts.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        });

        document.querySelectorAll('.sel-subcat').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const cat = e.target.dataset.cat;
                const grainRow = document.querySelector(\`.grain-row[data-cat="\${cat}"]\`);
                if (grainRow) {
                    grainRow.style.display = e.target.value === 'slab' ? 'flex' : 'none';
                }
            });
        });

        updateOverlays();`;

code = code.replace(oldEvents, newEvents);


const oldGather = `    const splitRequests = [];
    document.querySelectorAll('.chk-split-cat:checked').forEach(chk => {
        const cat = chk.value;
        const row = chk.closest('.parse-count-row');

        let subCategory = null;
        let grainDirection = null;

        const selSubcat = row.querySelector('.sel-subcat');
        if (selSubcat) subCategory = selSubcat.value;

        const selGrain = row.querySelector('.sel-grain');
        if (selGrain && selGrain.closest('.subcat-row').style.display !== 'none') {
            grainDirection = selGrain.value;
        }

        splitRequests.push({
            category: cat,
            subCategory: subCategory || null,
            grainDirection: grainDirection || null
        });
    });`;

const newGather = `    const splitRequests = [];
    document.querySelectorAll('.chk-split-cat:checked').forEach(chk => {
        const cat = chk.value;
        const row = chk.closest('.parse-count-row');

        let overlay = null;
        let subCategory = null;
        let grainDirection = null;

        const selOverlay = row.querySelector('.sel-overlay');
        if (selOverlay && selOverlay.closest('.overlay-row').style.display !== 'none') {
            overlay = selOverlay.value;
        }

        const selSubcat = row.querySelector('.sel-subcat');
        if (selSubcat) subCategory = selSubcat.value;

        const selGrain = row.querySelector('.sel-grain');
        if (selGrain && selGrain.closest('.subcat-row').style.display !== 'none') {
            grainDirection = selGrain.value;
        }

        splitRequests.push({
            category: cat,
            overlay: overlay || null,
            subCategory: subCategory || null,
            grainDirection: grainDirection || null
        });
    });`;

code = code.replace(oldGather, newGather);

fs.writeFileSync('public/js/tagger.js', code);
console.log('Tagger UI staging patched for overlay.');
